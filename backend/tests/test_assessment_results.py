"""
Recording assessment results is one transaction with per-item savepoints.
Runs on the default test database (SQLite, ORM upsert path).
"""
from fastapi.testclient import TestClient

from app.main import app
from app.database.connection import SessionLocal
from app.models.entities import Assessment, Concept, Course, Performance, Topic, Unit

client = TestClient(app)


# A leaf concept (nothing depends on it), so recording a weak score here cannot change
# the revision decisions other test modules assert on.
LEAF_CONCEPT = "B+ Tree Indexing Operations"


def _cs302_assessment_and_leaf_concept():
    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.code == "CS302").one()
        assessment = (
            db.query(Assessment).filter(Assessment.course_id == course.id)
            .order_by(Assessment.title).first()
        )
        concept = db.query(Concept).filter(Concept.name == LEAF_CONCEPT).one()
        return course.id, assessment.id, concept.id
    finally:
        db.close()


def test_results_are_recorded_and_foreign_concepts_reported():
    course_id, assessment_id, concept_id = _cs302_assessment_and_leaf_concept()

    resp = client.post(
        f"/api/courses/{course_id}/assessments/{assessment_id}/results",
        json={"performances": [
            {"concept_id": concept_id, "average_score": 35.0, "sample_size": 60},
            {"concept_id": "not-a-concept-in-this-course", "average_score": 80.0},
        ]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "partial"
    assert len(body["updated_concepts"]) == 1
    assert body["skipped"] == [{"concept_id": "not-a-concept-in-this-course",
                                "reason": "Concept does not belong to this course"}]

    db = SessionLocal()
    try:
        perf = db.query(Performance).filter_by(assessment_id=assessment_id, concept_id=concept_id).one()
        assert perf.weakness_flag is True  # 35 < course threshold (60)
        assert db.get(Assessment, assessment_id).status == "completed"
    finally:
        db.close()


def test_out_of_range_scores_rejected_before_the_database():
    course_id, assessment_id, concept_id = _cs302_assessment_and_leaf_concept()
    resp = client.post(
        f"/api/courses/{course_id}/assessments/{assessment_id}/results",
        json={"performances": [{"concept_id": concept_id, "average_score": 150.0}]},
    )
    assert resp.status_code == 422


def test_unknown_assessment_is_404():
    course_id, _, concept_id = _cs302_assessment_and_leaf_concept()
    resp = client.post(
        f"/api/courses/{course_id}/assessments/missing/results",
        json={"performances": [{"concept_id": concept_id, "average_score": 50.0}]},
    )
    assert resp.status_code == 404
