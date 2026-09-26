"""
Phase 4: optimistic locking, compensation across SQL/NoSQL, read-only GETs and the
atomic post-class record. Default (SQLite + MongoMock) test database.
"""
import pytest
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal, get_mongo_db
from app.models.entities import ClassSession, Course, LessonPlan, Topic, Unit
from app.schemas.schemas import LessonPlanUpdate
from app.services.errors import ConflictError
from app.services.lesson_plan_service import lesson_plan_service


@pytest.fixture(scope="module")
def cs302_id(api):
    return next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")


@pytest.fixture
def plan(api, cs302_id):
    plans = api.get(f"/api/courses/{cs302_id}/lesson-plans?session_number=15").json()
    assert plans, "a plan should be generated on demand"
    return plans[0]


def _docs_for(lesson_plan_id):
    return get_mongo_db()["lesson_plan_documents"].count_documents({"lesson_plan_id": lesson_plan_id})


# ------------------------------------------------------------------ optimistic locking

def test_generated_plans_start_as_drafts(api, cs302_id):
    recommendation = api.post(f"/api/courses/{cs302_id}/optimize-next-class?session_number=16").json()
    generated = api.post(f"/api/courses/{cs302_id}/lesson-plans/generate",
                         json={**recommendation, "session_number": 16})
    assert generated.status_code == 200, generated.text
    assert generated.json()["status"] == "draft"  # AI proposes; the teacher approves


def test_review_bumps_version_and_stale_saves_are_rejected(api, cs302_id, plan):
    url = f"/api/courses/{cs302_id}/lesson-plans/15"
    v = plan["version"]

    approved = api.patch(url, json={"expected_version": v, "status": "approved"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["version"] == v + 1
    assert approved.json()["status"] == "approved"

    docs_before = _docs_for(plan["id"])
    stale = api.patch(url, json={"expected_version": v, "status": "rejected"})
    assert stale.status_code == 409
    assert stale.json()["current_version"] == v + 1
    assert _docs_for(plan["id"]) == docs_before  # nothing written for a rejected save


def test_editing_content_marks_plan_modified_and_keeps_history(api, cs302_id, plan):
    url = f"/api/courses/{cs302_id}/lesson-plans/15"
    phases = [dict(p) for p in plan["phases"]]
    phases[0]["activity_description"] = "Teacher-edited warm-up"
    docs_before = _docs_for(plan["id"])

    resp = api.patch(url, json={"expected_version": plan["version"], "phases": phases, "change_note": "tweak"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "modified" and body["teacher_overridden"] is True
    assert body["phases"][0]["activity_description"] == "Teacher-edited warm-up"
    assert _docs_for(plan["id"]) == docs_before + 1  # new version document, old one kept


def test_phase_edits_must_fill_the_period_exactly(api, cs302_id, plan):
    phases = [dict(p) for p in plan["phases"]]
    phases[0]["duration_minutes"] += 5
    resp = api.patch(f"/api/courses/{cs302_id}/lesson-plans/15",
                     json={"expected_version": plan["version"], "phases": phases})
    assert resp.status_code == 400
    assert "add up to" in resp.json()["detail"]


def test_concurrent_save_loses_race_and_compensates_mongo(cs302_id, plan):
    """Both sessions pass the version pre-check; the versioned UPDATE catches the loser."""
    s1, s2 = SessionLocal(), SessionLocal()
    try:
        v = s1.query(LessonPlan).filter(LessonPlan.id == plan["id"]).one().version
        s2.query(LessonPlan).filter(LessonPlan.id == plan["id"]).one()

        lesson_plan_service.update_plan(s2, cs302_id, 15, LessonPlanUpdate(expected_version=v, status="approved"), "u2")
        docs_after_winner = _docs_for(plan["id"])

        with pytest.raises(ConflictError):
            lesson_plan_service.update_plan(s1, cs302_id, 15, LessonPlanUpdate(expected_version=v, status="rejected"), "u1")
        assert _docs_for(plan["id"]) == docs_after_winner  # loser's Mongo document was removed
    finally:
        s1.close(); s2.close()


# ------------------------------------------------------------------ read-only GET

def test_get_optimization_does_not_write(api, cs302_id):
    db = SessionLocal()
    try:
        topic = db.query(Topic).join(Unit).filter(Unit.course_id == cs302_id).order_by(Topic.id).first()
        topic.allocated_minutes = 1
        db.commit()
        topic_id = topic.id
    finally:
        db.close()

    assert api.get(f"/api/courses/{cs302_id}/optimization").status_code == 200
    db = SessionLocal()
    try:
        assert db.get(Topic, topic_id).allocated_minutes == 1
    finally:
        db.close()

    assert api.post(f"/api/courses/{cs302_id}/optimize").status_code == 200
    db = SessionLocal()
    try:
        assert db.get(Topic, topic_id).allocated_minutes != 1
    finally:
        db.close()


# ------------------------------------------------------------------ post-class record

def test_logging_a_session_is_atomic_and_single_shot(api, cs302_id):
    sessions = api.get(f"/api/courses/{cs302_id}/sessions").json()
    target = next(s for s in reversed(sessions) if s["status"] == "scheduled" and s["topic_id"])
    methods = api.get("/api/teaching-methods").json()
    url = f"/api/courses/{cs302_id}/sessions/{target['session_number']}/log"

    resp = api.post(url, json={"method_id": methods[0]["id"], "actual_minutes": 52,
                               "student_engagement_rating": 5, "completion_rate": 0.9,
                               "teacher_notes": "Went well", "topic_completed": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "completed" and resp.json()["topic_status"] == "completed"

    listed = next(s for s in api.get(f"/api/courses/{cs302_id}/sessions").json()
                  if s["session_number"] == target["session_number"])
    assert listed["logged"]["actual_minutes"] == 52

    again = api.post(url, json={"actual_minutes": 50})
    assert again.status_code == 409


def test_session_log_validation(api, cs302_id):
    url = f"/api/courses/{cs302_id}/sessions/1/log"
    assert api.post(url, json={"actual_minutes": 0}).status_code == 422
    assert api.post(url, json={"actual_minutes": 50, "student_engagement_rating": 9}).status_code == 422
    assert api.post(f"/api/courses/{cs302_id}/sessions/999/log", json={"actual_minutes": 50}).status_code == 404


# ------------------------------------------------------------------ carry an unfinished topic over

def test_unfinished_topic_carries_into_next_period(api):
    import uuid
    from conftest import login_client
    from fastapi.testclient import TestClient
    from app.main import app

    email = f"co-{uuid.uuid4().hex[:8]}@optiteach.edu"
    TestClient(app).post("/api/auth/register", json={"email": email, "password": "long-enough-pw", "full_name": "Carry",
                                                     "department": "CSE", "employee_id": f"CO-{uuid.uuid4().hex[:6]}"})
    client = login_client(email, "long-enough-pw")
    cid = client.post("/api/courses", json={"code": "CO101", "title": "Carry", "semester": "S1", "total_classes": 6}).json()["id"]
    client.post(f"/api/courses/{cid}/curriculum/confirm", json={"units": [{"unit_number": 1, "title": "U", "topics": [
        {"title": "A", "concepts": [{"name": "a"}]}, {"title": "B", "concepts": [{"name": "b"}]}, {"title": "C", "concepts": [{"name": "c"}]},
    ]}]})
    topics = lambda: [s["topic_title"] for s in client.get(f"/api/courses/{cid}/sessions").json()]
    assert topics() == ["A", "A", "B", "B", "C", "C"]

    plan3 = client.get(f"/api/courses/{cid}/lesson-plans?session_number=3").json()[0]
    assert _docs_for(plan3["id"]) >= 1

    resp = client.post(f"/api/courses/{cid}/sessions/1/log", json={"actual_minutes": 50, "carry_over": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["carried_over"] == {"to_session": 2, "dropped_topic": None, "plans_removed": 1}
    assert topics() == ["A", "A", "A", "B", "B", "C"]

    # Period 3's plan was for topic B; it is gone from PostgreSQL and MongoDB
    assert client.get(f"/api/courses/{cid}/lesson-plans/3/history").status_code == 404
    assert _docs_for(plan3["id"]) == 0
    assert client.get(f"/api/dbms/consistency?course_id={cid}").json()["consistent"] is True

    # Topic finished next time: nothing shifts
    resp = client.post(f"/api/courses/{cid}/sessions/2/log", json={"actual_minutes": 50, "topic_completed": True, "carry_over": True})
    assert resp.json()["carried_over"] is None and topics() == ["A", "A", "A", "B", "B", "C"]
