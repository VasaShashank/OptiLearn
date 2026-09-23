import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database.connection import SessionLocal
from app.models.entities import Course, Concept, ClassSession

client = TestClient(app)

def test_auth_me_profile_details():
    # Login as demo faculty
    login_resp = client.post("/api/auth/login", json={
        "email": "faculty@optiteach.edu",
        "password": "admin123"
    })
    assert login_resp.status_code == 200
    token = login_resp.json()["access_token"]

    # Call /auth/me with Bearer token
    me_resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_resp.status_code == 200
    data = me_resp.json()
    assert data["email"] == "faculty@optiteach.edu"
    assert "department" in data
    assert "designation" in data
    assert "employee_id" in data

def test_session_conduct_logging():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None

        # Log session 15 conduct
        resp = client.post(
            f"/api/courses/{course.id}/sessions/15/conduct",
            json={
                "actual_minutes": 55,
                "student_engagement_rating": 5,
                "teacher_notes": "Covered 3NF and BCNF. Practice problems solved on blackboard.",
                "completion_rate": 1.0
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["actual_minutes"] == 55
        assert data["status_state"] == "completed"
    finally:
        db.close()

def test_rich_lesson_plan_content_mongodb():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None

        # GET rich content
        get_resp = client.get(f"/api/courses/{course.id}/lesson-plans/15/rich-content")
        assert get_resp.status_code == 200
        rich_data = get_resp.json()
        assert "slides" in rich_data
        assert len(rich_data["slides"]) >= 3
        assert "code_snippets" in rich_data
        assert len(rich_data["code_snippets"]) >= 1
        assert "latex_formulas" in rich_data
        assert len(rich_data["latex_formulas"]) >= 1

        # POST update rich content
        rich_data["slides"][0]["title"] = "Updated Framing: Advanced Normalization"
        post_resp = client.post(
            f"/api/courses/{course.id}/lesson-plans/15/rich-content",
            json=rich_data
        )
        assert post_resp.status_code == 200
        saved = post_resp.json()
        assert saved["version"] >= 1
    finally:
        db.close()

def test_update_concept_parameters():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").first()
        assert course is not None

        concept = db.query(Concept).join(Concept.topic).filter(Concept.topic.has(unit_id=course.units[0].id)).first()
        assert concept is not None

        # PATCH concept difficulty and importance
        resp = client.patch(
            f"/api/courses/{course.id}/concepts/{concept.id}",
            json={
                "difficulty": 4,
                "importance": 5
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["difficulty"] == 4
        assert data["importance"] == 5

        # Verify persisted in database
        db.refresh(concept)
        assert concept.difficulty == 4
        assert concept.importance == 5
    finally:
        db.close()
