from unittest.mock import MagicMock
from ai.recommendations.question_generator import question_generator
from ai.recommendations.pedagogy_advisor import pedagogy_advisor
from ai.curriculum.prerequisite_graph import prerequisite_graph_engine
from app.services.export_service import export_service
from app.models.entities import Course, ClassSession, CourseOutcome

def test_question_generator():
    qs = question_generator.generate_questions_for_concept(
        concept_name="Relational Algebra Projection",
        bloom_level="Apply",
        num_questions=2
    )
    assert len(qs) == 2
    assert any(q.bloom_level == "Apply" for q in qs)
    assert len(qs[0].grading_rubric) > 0

def test_pedagogy_advisor():
    rec = pedagogy_advisor.recommend_method_mix("procedural", difficulty=4, importance=5)
    assert "Worked Examples" in rec["primary_method"]
    assert rec["recommended_ratios"]["guided_practice"] >= 0.30

def test_prerequisite_graph_ai():
    concepts = ["Basic Set Theory", "Relational Algebra", "SQL Joins", "Indexing", "B+ Trees"]
    links = prerequisite_graph_engine.infer_prerequisites(concepts)
    assert len(links) > 0
    # Relational Algebra should depend on Basic Set Theory
    assert any(link["source"] == "Basic Set Theory" and link["target"] == "Relational Algebra" for link in links)

    is_dag, cycles = prerequisite_graph_engine.validate_dag(links)
    assert is_dag is True
    assert len(cycles) == 0

def test_exports():
    db = MagicMock()

    # Mock Course & Sessions for ICS Export
    course = MagicMock()
    course.id = "test-course-id"
    course.code = "CS302"
    course.title = "Database Systems"
    course.period_duration = 55
    db.query(Course).filter().first.return_value = course

    session1 = MagicMock()
    session1.session_number = 1
    session1.scheduled_date = None
    session1.current_topic.title = "Relational Model"
    session1.status = "scheduled"

    db.query(ClassSession).filter().order_by().all.return_value = [session1]

    ics = export_service.generate_ics_calendar(db, "test-course-id")
    assert "BEGIN:VCALENDAR" in ics
    assert "END:VCALENDAR" in ics
    assert "CS302" in ics

    # Mock Outcome Matrix
    outcome = MagicMock()
    outcome.code = "CO1"
    outcome.description = "Apply Normalization"
    outcome.bloom_level = "Apply"
    outcome.concepts = []
    db.query(CourseOutcome).filter().all.return_value = [outcome]

    matrix = export_service.generate_outcome_matrix(db, "test-course-id")
    assert matrix["outcomes_count"] == 1
    assert matrix["attainment_matrix"][0]["outcome_code"] == "CO1"
