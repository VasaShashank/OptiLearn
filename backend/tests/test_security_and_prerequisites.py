import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.models.entities import Course, Concept, Topic, Unit

client = TestClient(app)

def test_rate_limiter_allows_and_tracks():
    # Make multiple rapid requests to login
    for _ in range(5):
        resp = client.post("/api/auth/login", json={
            "email": "faculty@optiteach.edu",
            "password": "wrongpassword"
        })
        # Should be 401 unauthorized, not 429 yet
        assert resp.status_code == 401

def test_upload_file_size_limit():
    # Create an artificial oversized payload > 10MB
    oversized_data = b"A" * (11 * 1024 * 1024)
    resp = client.post(
        "/api/syllabus/upload",
        files={"file": ("huge_syllabus.pdf", oversized_data, "application/pdf")}
    )
    # Should be rejected with 413 Request Entity Too Large
    assert resp.status_code == 413
    assert "exceeds maximum permitted size" in resp.json()["detail"]

def test_upload_invalid_pdf_magic_bytes():
    # Send a non-PDF file disguised as .pdf
    fake_pdf = b"NOT_A_REAL_PDF_HEADER_SOME_GARBAGE_BYTES"
    resp = client.post(
        "/api/syllabus/upload",
        files={"file": ("fake.pdf", fake_pdf, "application/pdf")}
    )
    # Should be rejected with 400 Bad Request
    assert resp.status_code == 400
    assert "Missing '%PDF' magic header bytes" in resp.json()["detail"]

def test_add_and_delete_prerequisite_edge_with_cycle_detection():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None

        # Fetch two concepts
        concepts = (
            db.query(Concept)
            .join(Topic)
            .join(Unit)
            .filter(Unit.course_id == course.id)
            .limit(3)
            .all()
        )
        assert len(concepts) >= 2
        c1, c2 = concepts[0], concepts[1]

        # 1. Clean any existing prerequisite between c1 and c2
        if c1 in c2.prerequisites:
            c2.prerequisites.remove(c1)
            db.commit()
        if c2 in c1.prerequisites:
            c1.prerequisites.remove(c2)
            db.commit()

        # 2. Add prerequisite edge c1 -> c2 (c2 depends on c1)
        resp = client.post(
            f"/api/courses/{course.id}/prerequisites",
            json={"source_id": c1.id, "target_id": c2.id}
        )
        assert resp.status_code == 200
        assert resp.json()["status"] in ["success", "exists"]

        # 3. Test Cycle Detection: try adding reverse edge c2 -> c1 (c1 depends on c2)
        cycle_resp = client.post(
            f"/api/courses/{course.id}/prerequisites",
            json={"source_id": c2.id, "target_id": c1.id}
        )
        assert cycle_resp.status_code == 400
        assert "Circular dependency detected" in cycle_resp.json()["detail"]

        # 4. Delete prerequisite edge c1 -> c2
        del_resp = client.delete(f"/api/courses/{course.id}/prerequisites/{c1.id}/{c2.id}")
        assert del_resp.status_code == 200
        assert del_resp.json()["status"] == "success"

    finally:
        db.close()
