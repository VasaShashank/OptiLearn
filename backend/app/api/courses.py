from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.database.connection import get_db
from app.models.entities import Course, Teacher, Unit, Topic, Concept, CourseOutcome, Section, TeacherConstraint, Assessment
from app.schemas.schemas import (
    CourseCreate, CourseOut, ConfirmCurriculumRequest, CurriculumGraphResponse,
    CourseOptimizationResponse, NextClassOptimizationResponse,
    LessonPlanCreate, LessonPlanOut, AssessmentCreate, AssessmentOut,
    RecordAssessmentResultsRequest, CourseAnalyticsResponse
)
from app.nlp.deterministic import nlp_provider
from app.services.curriculum_service import curriculum_service
from app.services.analytics_service import analytics_service
from app.services.lesson_plan_service import lesson_plan_service
from app.services.assessment_service import assessment_service
from app.optimization.time_allocator import time_allocator
from app.optimization.class_optimizer import class_optimizer

from app.auth.security import get_optional_current_teacher

router = APIRouter(prefix="/courses", tags=["Courses & Optimization"])

@router.get("", response_model=List[CourseOut])
def list_courses(db: Session = Depends(get_db)):
    courses = db.query(Course).all()
    results = []
    for c in courses:
        u_count = len(c.units)
        t_count = sum(len(u.topics) for u in c.units)
        c_count = sum(sum(len(t.concepts) for t in u.topics) for u in c.units)
        results.append(CourseOut(
            id=c.id,
            code=c.code,
            title=c.title,
            semester=c.semester,
            academic_year=c.academic_year,
            total_classes=c.total_classes,
            period_duration=c.period_duration,
            total_available_minutes=c.total_available_minutes,
            teacher_name=c.teacher.user.full_name if (c.teacher and c.teacher.user) else "Faculty",
            section_name=c.sections[0].name if c.sections else "Default Section",
            units_count=u_count,
            topics_count=t_count,
            concepts_count=c_count,
            created_at=c.created_at
        ))
    return results

@router.post("", response_model=CourseOut)
def create_course(
    payload: CourseCreate,
    current_teacher: Optional[Teacher] = Depends(get_optional_current_teacher),
    db: Session = Depends(get_db)
):
    teacher = current_teacher or db.query(Teacher).first()
    if not teacher:
        raise HTTPException(status_code=400, detail="No teacher profile exists. Run seed or register first.")

    total_avail = payload.total_classes * payload.period_duration

    course = Course(
        teacher_id=teacher.id,
        code=payload.code,
        title=payload.title,
        semester=payload.semester,
        academic_year=payload.academic_year,
        total_classes=payload.total_classes,
        period_duration=payload.period_duration,
        total_available_minutes=total_avail,
        start_date=payload.start_date,
        end_date=payload.end_date
    )
    db.add(course)
    db.flush()

    section = Section(
        course_id=course.id,
        name=payload.section_name,
        student_count=payload.student_count
    )
    db.add(section)

    c_vals = payload.constraints
    constraint = TeacherConstraint(
        course_id=course.id,
        max_lecture_ratio=c_vals.max_lecture_ratio if c_vals else 0.40,
        min_practice_ratio=c_vals.min_practice_ratio if c_vals else 0.35,
        revision_threshold_score=c_vals.revision_threshold_score if c_vals else 60.0,
        default_revision_minutes=c_vals.default_revision_minutes if c_vals else 10
    )
    db.add(constraint)
    db.commit()
    db.refresh(course)

    return CourseOut(
        id=course.id,
        code=course.code,
        title=course.title,
        semester=course.semester,
        academic_year=course.academic_year,
        total_classes=course.total_classes,
        period_duration=course.period_duration,
        total_available_minutes=course.total_available_minutes,
        teacher_name=teacher.user.full_name if teacher.user else "Faculty",
        section_name=section.name,
        units_count=0,
        topics_count=0,
        concepts_count=0,
        created_at=course.created_at
    )

@router.get("/{course_id}", response_model=CourseOut)
def get_course(course_id: str, db: Session = Depends(get_db)):
    c = db.query(Course).filter(Course.id == course_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Course not found")

    u_count = len(c.units)
    t_count = sum(len(u.topics) for u in c.units)
    c_count = sum(sum(len(t.concepts) for t in u.topics) for u in c.units)

    return CourseOut(
        id=c.id,
        code=c.code,
        title=c.title,
        semester=c.semester,
        academic_year=c.academic_year,
        total_classes=c.total_classes,
        period_duration=c.period_duration,
        total_available_minutes=c.total_available_minutes,
        teacher_name=c.teacher.user.full_name if (c.teacher and c.teacher.user) else "Faculty",
        section_name=c.sections[0].name if c.sections else None,
        units_count=u_count,
        topics_count=t_count,
        concepts_count=c_count,
        created_at=c.created_at
    )

# -------------------------------------------------------------
# Curriculum & Knowledge Graph
# -------------------------------------------------------------
@router.post("/{course_id}/syllabus")
async def upload_course_syllabus(
    course_id: str,
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    curriculum = None
    try:
        if file:
            content_bytes = await file.read()
            filename = file.filename.lower()
            if filename.endswith(".pdf"):
                curriculum = nlp_provider.extract_from_pdf(content_bytes)
            else:
                text = content_bytes.decode("utf-8", errors="ignore")
                curriculum = nlp_provider.extract_from_text(text)
        elif raw_text and raw_text.strip():
            curriculum = nlp_provider.extract_from_text(raw_text.strip())
        else:
            raise HTTPException(status_code=400, detail="No syllabus content provided. Please upload a PDF or paste text.")
    except ValueError as ve:
        raise HTTPException(status_code=422, detail=str(ve))
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Syllabus extraction failed: {str(e)}")

    # Automatically confirm and persist directly to this course
    confirm_payload = ConfirmCurriculumRequest(
        course_name=course.title,
        course_code=course.code,
        units=curriculum.units,
        outcomes=curriculum.outcomes
    )
    result = curriculum_service.confirm_and_persist(db, course_id, confirm_payload)
    time_allocator.optimize_course_time(db, course_id)

    return {
        "status": "success",
        "message": f"Successfully extracted and linked {len(curriculum.units)} units and {len(curriculum.outcomes)} outcomes to {course.code}",
        "curriculum": curriculum,
        "course_id": course_id
    }

@router.post("/{course_id}/curriculum/confirm")
def confirm_curriculum(course_id: str, payload: ConfirmCurriculumRequest, db: Session = Depends(get_db)):
    result = curriculum_service.confirm_and_persist(db, course_id, payload)
    # Automatically run optimizer to update allocations
    time_allocator.optimize_course_time(db, course_id)
    return result

@router.get("/{course_id}/graph", response_model=CurriculumGraphResponse)
def get_curriculum_graph(course_id: str, db: Session = Depends(get_db)):
    return curriculum_service.get_graph(db, course_id)

# -------------------------------------------------------------
# Optimization Endpoints
# -------------------------------------------------------------
@router.post("/{course_id}/optimize", response_model=CourseOptimizationResponse)
def run_course_optimization(course_id: str, db: Session = Depends(get_db)):
    return time_allocator.optimize_course_time(db, course_id)

@router.get("/{course_id}/optimization", response_model=CourseOptimizationResponse)
def get_course_optimization(course_id: str, db: Session = Depends(get_db)):
    return time_allocator.optimize_course_time(db, course_id)

@router.post("/{course_id}/optimize-next-class", response_model=NextClassOptimizationResponse)
def optimize_next_class(course_id: str, session_number: Optional[int] = None, db: Session = Depends(get_db)):
    return class_optimizer.optimize_next_class(db, course_id, session_number=session_number)

# -------------------------------------------------------------
# Lesson Plans
# -------------------------------------------------------------
@router.post("/{course_id}/lesson-plans/generate", response_model=LessonPlanOut)
def generate_lesson_plan(course_id: str, payload: Dict[str, Any], db: Session = Depends(get_db)):
    session_num = payload.get("session_number", 15)
    return lesson_plan_service.generate_plan(db, course_id, session_num, payload)

@router.get("/{course_id}/lesson-plans", response_model=List[LessonPlanOut])
def list_course_lesson_plans(
    course_id: str,
    session_number: Optional[int] = None,
    unit_id: Optional[str] = None,
    topic_id: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    return lesson_plan_service.list_plans(
        db, course_id, session_number=session_number, unit_id=unit_id, topic_id=topic_id, status=status
    )

# -------------------------------------------------------------
# Assessments & Continuous Feedback
# -------------------------------------------------------------
@router.get("/{course_id}/assessments")
def list_assessments(course_id: str, db: Session = Depends(get_db)):
    assessments = db.query(Assessment).filter(Assessment.course_id == course_id).all()
    results = []
    for a in assessments:
        results.append({
            "id": a.id,
            "title": a.title,
            "assessment_type": a.assessment_type,
            "max_marks": a.max_marks,
            "scheduled_date": a.scheduled_date,
            "status": a.status,
            "questions_count": len(a.questions),
            "performances": [
                {
                    "concept_id": p.concept_id,
                    "concept_name": p.concept.name if p.concept else "",
                    "average_score": p.average_score,
                    "weakness_flag": p.weakness_flag,
                    "common_errors": p.common_errors
                } for p in a.performances
            ]
        })
    return results

@router.post("/{course_id}/assessments", response_model=AssessmentOut)
def create_assessment(course_id: str, payload: AssessmentCreate, db: Session = Depends(get_db)):
    return assessment_service.create_assessment(db, course_id, payload)

@router.post("/{course_id}/assessments/{assessment_id}/results")
def record_assessment_results(course_id: str, assessment_id: str, payload: RecordAssessmentResultsRequest, db: Session = Depends(get_db)):
    return assessment_service.record_results(db, assessment_id, payload)

# -------------------------------------------------------------
# Analytics & Alerts
# -------------------------------------------------------------
@router.get("/{course_id}/analytics", response_model=CourseAnalyticsResponse)
def get_analytics(course_id: str, db: Session = Depends(get_db)):
    return analytics_service.get_course_analytics(db, course_id)
