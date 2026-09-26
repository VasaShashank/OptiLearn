"""
Authentication, authorization and input-hardening checks (default SQLite test DB).
"""
import hashlib
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.auth.security import login_rate_limiter, _LEGACY_SALT
from app.database.connection import SessionLocal
from app.models.entities import Assessment, ClassSession, LessonPlan, Topic, User
from conftest import login_client

anon = TestClient(app)


@pytest.fixture(scope="module")
def cs302_id(api):
    return next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")


@pytest.fixture(scope="module")
def other_teacher():
    """A second teacher with their own (empty) course."""
    email = f"other-{uuid.uuid4().hex[:8]}@optiteach.edu"
    resp = anon.post("/api/auth/register", json={
        "email": email, "password": "correct-horse", "full_name": "Other Teacher",
        "department": "CSE", "employee_id": f"EMP-{uuid.uuid4().hex[:8]}",
    })
    assert resp.status_code == 200, resp.text
    client = login_client(email, "correct-horse")
    course = client.post("/api/courses", json={"code": "OT101", "title": "Other", "semester": "S1"})
    assert course.status_code == 200, course.text
    return client, course.json()["id"]


# ------------------------------------------------------------------ authentication

@pytest.mark.parametrize("method,path", [
    ("get", "/api/courses"),
    ("post", "/api/courses"),
    ("get", "/api/dbms/queries"),
    ("get", "/api/dbms/schema"),
    ("post", "/api/syllabus/upload"),
    ("get", "/api/exports/courses/x/calendar.ics"),
    ("get", "/api/auth/me"),
])
def test_protected_endpoints_require_a_token(method, path):
    assert getattr(anon, method)(path).status_code == 401


def test_health_stays_public():
    assert anon.get("/health").status_code == 200


def test_passwords_are_bcrypt_hashed():
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == "faculty@optiteach.edu").one()
        assert user.hashed_password.startswith("$2")
    finally:
        db.close()


def test_legacy_sha256_hash_is_upgraded_on_login():
    email = f"legacy-{uuid.uuid4().hex[:8]}@optiteach.edu"
    db = SessionLocal()
    try:
        db.add(User(email=email, full_name="Legacy", role="teacher",
                    hashed_password=hashlib.sha256((_LEGACY_SALT + "old-password").encode()).hexdigest()))
        db.commit()
    finally:
        db.close()

    assert anon.post("/api/auth/login", json={"email": email, "password": "old-password"}).status_code == 200
    db = SessionLocal()
    try:
        assert db.query(User).filter(User.email == email).one().hashed_password.startswith("$2")
    finally:
        db.close()


def test_login_is_throttled_after_repeated_failures():
    email = f"brute-{uuid.uuid4().hex[:8]}@optiteach.edu"
    codes = [anon.post("/api/auth/login", json={"email": email, "password": "wrong"}).status_code for _ in range(6)]
    assert codes[:5] == [401] * 5
    assert codes[5] == 429
    login_rate_limiter.reset(f"testclient:{email}")


def test_registration_validates_input_and_never_grants_admin():
    weak = anon.post("/api/auth/register", json={
        "email": "weak@optiteach.edu", "password": "short", "full_name": "W", "department": "D", "employee_id": "E1",
    })
    assert weak.status_code == 422

    email = f"sneaky-{uuid.uuid4().hex[:8]}@optiteach.edu"
    resp = anon.post("/api/auth/register", json={
        "email": email, "password": "long-enough-pw", "full_name": "S", "department": "D",
        "employee_id": f"E-{uuid.uuid4().hex[:6]}", "role": "admin",
    })
    assert resp.status_code == 200 and resp.json()["role"] == "teacher"

    dup = anon.post("/api/auth/register", json={
        "email": email, "password": "long-enough-pw", "full_name": "S", "department": "D", "employee_id": "E-dup",
    })
    assert dup.status_code == 400


# ------------------------------------------------------------------ course-level authorization

def test_teachers_only_see_their_own_courses(api, other_teacher, cs302_id):
    other, other_course_id = other_teacher
    assert [c["id"] for c in other.get("/api/courses").json()] == [other_course_id]
    assert other_course_id not in [c["id"] for c in api.get("/api/courses").json()]

    # Another teacher's course looks exactly like a missing one
    for path in ["", "/graph", "/analytics", "/assessments", "/optimization"]:
        assert other.get(f"/api/courses/{cs302_id}{path}").status_code == 404, path
    assert other.post(f"/api/dbms/queries/q1_topics_remaining/execute?course_id={cs302_id}").status_code == 404
    assert other.get(f"/api/exports/courses/{cs302_id}/calendar.ics").status_code == 404


def test_admin_sees_every_course(other_teacher, cs302_id):
    _, other_course_id = other_teacher
    admin = login_client("admin@optiteach.edu", "admin123")
    ids = {c["id"] for c in admin.get("/api/courses").json()}
    assert {cs302_id, other_course_id} <= ids
    assert admin.get(f"/api/courses/{other_course_id}").status_code == 200


def test_nested_ids_must_belong_to_the_course_in_the_url(api, other_teacher, cs302_id):
    other, other_course_id = other_teacher
    db = SessionLocal()
    try:
        cs302_assessment = db.query(Assessment).filter(Assessment.course_id == cs302_id).first().id
        cs302_topic = db.query(Topic).join(Topic.unit).filter(Topic.unit.has(course_id=cs302_id)).first().id
    finally:
        db.close()

    # Other teacher tries to write into CS302's assessment through their own course's URL
    resp = other.post(
        f"/api/courses/{other_course_id}/assessments/{cs302_assessment}/results",
        json={"performances": [{"concept_id": "x", "average_score": 10}]},
    )
    assert resp.status_code == 404

    resp = other.post(f"/api/courses/{other_course_id}/lesson-plans/generate",
                      json={"topic_id": cs302_topic, "session_number": 1, "phases": []})
    assert resp.status_code == 404


def test_printable_lesson_plan_checks_course_access(api, other_teacher, cs302_id):
    other, _ = other_teacher
    api.get(f"/api/courses/{cs302_id}/lesson-plans?session_number=15")  # ensures a plan exists
    db = SessionLocal()
    try:
        session_id = (
            db.query(ClassSession.id).join(LessonPlan, LessonPlan.session_id == ClassSession.id)
            .filter(ClassSession.course_id == cs302_id).first()[0]
        )
    finally:
        db.close()
    assert api.get(f"/api/exports/lesson-plans/{session_id}/printable").status_code == 200
    assert other.get(f"/api/exports/lesson-plans/{session_id}/printable").status_code == 404


# ------------------------------------------------------------------ input hardening

def test_printable_lesson_plan_escapes_html(api, cs302_id):
    api.get(f"/api/courses/{cs302_id}/lesson-plans?session_number=15")
    db = SessionLocal()
    try:
        plan = (
            db.query(LessonPlan).join(ClassSession, LessonPlan.session_id == ClassSession.id)
            .filter(ClassSession.course_id == cs302_id).first()
        )
        original = plan.title
        plan.title = "<script>alert('x')</script>"
        db.commit()
        session_id = plan.session_id
    finally:
        db.close()
    try:
        body = api.get(f"/api/exports/lesson-plans/{session_id}/printable").text
        assert "<script>alert" not in body
        assert "&lt;script&gt;" in body
    finally:
        db = SessionLocal()
        try:
            db.query(LessonPlan).filter(LessonPlan.session_id == session_id).update({"title": original})
            db.commit()
        finally:
            db.close()


@pytest.mark.parametrize("filename,content,expected", [
    ("syllabus.exe", b"MZ...", 415),
    ("fake.pdf", b"not really a pdf", 415),
    ("huge.txt", b"a" * (5 * 1024 * 1024 + 1), 413),
], ids=["wrong-extension", "fake-pdf", "too-large"])
def test_syllabus_upload_limits(api, filename, content, expected):
    resp = api.post("/api/syllabus/upload", files={"file": (filename, content)})
    assert resp.status_code == expected


def test_syllabus_uploads_are_rate_limited(other_teacher):
    from app.auth.security import upload_rate_limiter
    client, _ = other_teacher
    codes = [client.post("/api/syllabus/upload", files={"file": ("s.exe", b"x")}).status_code for _ in range(11)]
    assert codes[:10] == [415] * 10  # each attempt counts, even rejected ones
    assert codes[10] == 429
    upload_rate_limiter._failures.clear()
