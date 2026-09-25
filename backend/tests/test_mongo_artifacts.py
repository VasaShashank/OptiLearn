"""
Phase 5: MongoDB as a first-class store - versioned graph snapshots, lesson plan history,
aggregation pipelines, cross-store consistency, and server-side schema enforcement.
"""
import uuid
from datetime import datetime, timezone

import pytest
from pymongo import MongoClient
from pymongo.errors import DuplicateKeyError, ServerSelectionTimeoutError, WriteError

from app.database.connection import get_mongo_db
from app.database.mongo_schema import NLP_DRAFT_TTL_SECONDS, ensure_mongo_schema
from conftest import login_client


def _curriculum(extra_concept: bool):
    concepts = [
        {"name": "Ohm's Law", "concept_type": "conceptual", "difficulty": 2},
        {"name": "Kirchhoff's Laws", "concept_type": "problem_solving", "prerequisites": ["Ohm's Law"]},
    ]
    if extra_concept:
        concepts.append({"name": "Thevenin Equivalent", "concept_type": "analytical",
                         "prerequisites": ["Kirchhoff's Laws"]})
    return {"units": [{"unit_number": 1, "title": "DC Circuits",
                       "topics": [{"title": "Circuit Laws", "concepts": concepts}]}],
            "outcomes": [{"code": "CO1", "description": "Analyze DC circuits", "bloom_level": "Analyze"}]}


@pytest.fixture(scope="module")
def teacher_course():
    email = f"ee-{uuid.uuid4().hex[:8]}@optiteach.edu"
    from fastapi.testclient import TestClient
    from app.main import app
    TestClient(app).post("/api/auth/register", json={
        "email": email, "password": "long-enough-pw", "full_name": "EE Teacher",
        "department": "EEE", "employee_id": f"EE-{uuid.uuid4().hex[:6]}",
    })
    client = login_client(email, "long-enough-pw")
    course = client.post("/api/courses", json={"code": "EE101", "title": "Circuits", "semester": "S1", "total_classes": 12})
    return client, course.json()["id"]


# ------------------------------------------------------------------ curriculum graph snapshots

def test_each_confirmation_appends_a_graph_version_and_diff_explains_it(teacher_course):
    client, course_id = teacher_course
    first = client.post(f"/api/courses/{course_id}/curriculum/confirm", json=_curriculum(False))
    second = client.post(f"/api/courses/{course_id}/curriculum/confirm", json=_curriculum(True))
    assert first.status_code == 200 and second.status_code == 200, (first.text, second.text)
    assert second.json()["graph_version"] == first.json()["graph_version"] + 1

    versions = client.get(f"/api/courses/{course_id}/graph/versions").json()
    assert [v["version"] for v in versions][:2] == [2, 1]
    assert versions[0]["stats"] == {"units": 1, "topics": 1, "concepts": 3, "edges": 2}

    diff = client.get(f"/api/courses/{course_id}/graph/diff?from_version=1&to_version=2").json()
    assert diff["concepts_added"] == ["Thevenin Equivalent"]
    assert diff["prerequisites_added"] == [{"prerequisite": "Kirchhoff's Laws", "concept": "Thevenin Equivalent"}]
    assert diff["concepts_removed"] == []


def test_invalid_concept_type_is_rejected_by_the_api(teacher_course):
    client, course_id = teacher_course
    bad = _curriculum(False)
    bad["units"][0]["topics"][0]["concepts"][0]["concept_type"] = "magic"
    assert client.post(f"/api/courses/{course_id}/curriculum/confirm", json=bad).status_code == 422


# ------------------------------------------------------------------ lesson plan history

def test_lesson_plan_history_and_diff(api):
    cid = next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")
    plan = api.get(f"/api/courses/{cid}/lesson-plans?session_number=17").json()[0]
    phases = [dict(p) for p in plan["phases"]]
    phases[-1]["activity_description"] = "Exit ticket on BCNF"
    edited = api.patch(f"/api/courses/{cid}/lesson-plans/17",
                       json={"expected_version": plan["version"], "phases": phases,
                             "misconceptions": ["BCNF always preserves dependencies"], "change_note": "sharpen close"})
    assert edited.status_code == 200, edited.text

    history = api.get(f"/api/courses/{cid}/lesson-plans/17/history").json()
    assert history[0]["is_current"] and history[0]["edited_by"] == "faculty@optiteach.edu"
    assert history[0]["change_note"] == "sharpen close"
    assert history[-1]["edited_by"] == "optimizer"

    diff = api.get(f"/api/courses/{cid}/lesson-plans/17/diff"
                   f"?from_version={history[1]['version']}&to_version={history[0]['version']}").json()
    assert diff["phases"][0]["fields"]["activity_description"]["to"] == "Exit ticket on BCNF"
    assert diff["content"]["misconceptions"]["added"] == ["BCNF always preserves dependencies"]


# ------------------------------------------------------------------ aggregations

def test_every_aggregation_pipeline_runs(api):
    cid = next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")
    api.get(f"/api/courses/{cid}/lesson-plans?session_number=15")
    catalog = api.get("/api/dbms/nosql/aggregations").json()
    assert {a["id"] for a in catalog} >= {"method_minutes", "revision_by_topic", "edit_activity", "graph_growth"}
    for agg in catalog:
        resp = api.post(f"/api/dbms/nosql/aggregations/{agg['id']}/execute?course_id={cid}")
        assert resp.status_code == 200, (agg["id"], resp.text)
        assert resp.json()["pipeline"][0]["$match"]["course_id"] == cid

    minutes = api.post(f"/api/dbms/nosql/aggregations/method_minutes/execute?course_id={cid}").json()
    assert minutes["row_count"] >= 1 and all(r["total_minutes"] > 0 for r in minutes["rows"])


def test_aggregations_respect_course_access(teacher_course, api):
    client, _ = teacher_course
    cs302 = next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")
    assert client.post(f"/api/dbms/nosql/aggregations/method_minutes/execute?course_id={cs302}").status_code == 404


# ------------------------------------------------------------------ extraction drafts

def test_course_syllabus_upload_records_a_dated_extraction(teacher_course):
    client, course_id = teacher_course
    syllabus = "Course Code: EE101\nCourse Title: Circuits\nCO1: Analyze DC circuits.\nUNIT 1: DC Circuits\nOhm's Law, Kirchhoff's Laws.\n"
    resp = client.post(f"/api/courses/{course_id}/syllabus", files={"file": ("ee101.txt", syllabus.encode())})
    assert resp.status_code == 200, resp.text
    draft = get_mongo_db()["nlp_extractions"].find_one({"course_id": course_id})
    assert isinstance(draft["extracted_at"], datetime)  # a real date, so the TTL index applies


# ------------------------------------------------------------------ cross-store consistency

def test_consistency_report_finds_and_repairs_orphans(api):
    admin = login_client("admin@optiteach.edu", "admin123")
    orphan_id = f"orphan-{uuid.uuid4().hex[:8]}"
    get_mongo_db()["lesson_plan_documents"].insert_one({
        "_id": orphan_id, "course_id": "course-that-was-deleted", "lesson_plan_id": "gone",
        "session_number": 1, "version": 1, "phases": [{"phase_name": "x", "duration_minutes": 5}],
        "edited_at": datetime.now(timezone.utc).isoformat(),
    })

    report = admin.get("/api/dbms/consistency").json()
    assert {"document_id": orphan_id, "course_id": "course-that-was-deleted", "reason": "course deleted"} in report["orphan_documents"]
    assert api.get("/api/dbms/consistency").status_code == 403  # global check is admin-only

    assert admin.post("/api/dbms/consistency/repair").json()["orphan_documents_removed"] >= 1
    assert get_mongo_db()["lesson_plan_documents"].find_one({"_id": orphan_id}) is None
    assert api.post("/api/dbms/consistency/repair").status_code == 403


# ------------------------------------------------------------------ real MongoDB server

@pytest.fixture(scope="module")
def real_mongo():
    try:
        client = MongoClient("mongodb://localhost:27017", serverSelectionTimeoutMS=1500)
        client.admin.command("ping")
    except ServerSelectionTimeoutError:
        pytest.skip("MongoDB server not available")
    name = f"optiteach_test_{uuid.uuid4().hex[:6]}"
    db = client[name]
    ensure_mongo_schema(db)
    yield db
    client.drop_database(name)
    client.close()


def _valid_plan_doc(**overrides):
    return {"lesson_plan_id": "lp-1", "course_id": "c-1", "session_number": 3, "version": 1,
            "phases": [{"phase_name": "Recap", "duration_minutes": 10}],
            "edited_at": datetime.now(timezone.utc).isoformat(), **overrides}


def test_server_validator_rejects_malformed_documents(real_mongo):
    real_mongo["lesson_plan_documents"].insert_one(_valid_plan_doc())
    for bad in (_valid_plan_doc(version=2, phases=[]),
                _valid_plan_doc(version=3, phases=[{"phase_name": "x", "duration_minutes": 0}]),
                {k: v for k, v in _valid_plan_doc(version=4).items() if k != "lesson_plan_id"}):
        with pytest.raises(WriteError, match="Document failed validation"):
            real_mongo["lesson_plan_documents"].insert_one(bad)


def test_server_unique_version_index(real_mongo):
    real_mongo["lesson_plan_documents"].insert_one(_valid_plan_doc(lesson_plan_id="lp-2"))
    with pytest.raises(DuplicateKeyError):
        real_mongo["lesson_plan_documents"].insert_one(_valid_plan_doc(lesson_plan_id="lp-2"))


def test_server_ttl_index_on_extraction_drafts(real_mongo):
    info = real_mongo["nlp_extractions"].index_information()["ttl_extracted_at"]
    assert info["expireAfterSeconds"] == NLP_DRAFT_TTL_SECONDS
    with pytest.raises(WriteError):  # a string date would silently never expire, so it is refused
        real_mongo["nlp_extractions"].insert_one(
            {"extracted_at": "2026-01-01", "confidence_score": 0.9, "raw_payload": {}})
