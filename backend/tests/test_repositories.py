from unittest.mock import MagicMock
from app.repositories.course_repository import course_repository
from app.repositories.curriculum_repository import curriculum_repository
from app.repositories.assessment_repository import assessment_repository
from app.repositories.lesson_plan_repository import lesson_plan_repository
from app.models.entities import Course, Unit, Assessment, LessonPlan

def test_course_repository():
    db = MagicMock()
    course = MagicMock()
    course.id = "c1"
    course.code = "CS101"
    db.query(Course).filter().first.return_value = course

    fetched = course_repository.get_by_code(db, "CS101")
    assert fetched.code == "CS101"

def test_curriculum_repository():
    db = MagicMock()
    unit = MagicMock()
    unit.id = "u1"
    unit.unit_number = 1
    db.query(Unit).filter().order_by().all.return_value = [unit]

    units = curriculum_repository.get_units_by_course(db, "c1")
    assert len(units) == 1
    assert units[0].unit_number == 1

def test_assessment_repository():
    db = MagicMock()
    asmt = MagicMock()
    asmt.id = "a1"
    asmt.title = "Quiz 1"
    db.query(Assessment).filter().order_by().all.return_value = [asmt]

    asmts = assessment_repository.get_by_course(db, "c1")
    assert len(asmts) == 1
    assert asmts[0].title == "Quiz 1"

def test_lesson_plan_repository():
    db = MagicMock()
    lp = MagicMock()
    lp.id = "lp1"
    lp.title = "Lesson Plan 1"
    db.query(LessonPlan).join().filter().order_by().all.return_value = [lp]

    plans = lesson_plan_repository.get_by_course(db, "c1")
    assert len(plans) == 1
    assert plans[0].title == "Lesson Plan 1"
