from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
from app.database.connection import get_db, get_mongo_db
from app.models.entities import (
    Course, Teacher, Unit, Topic, Concept, CourseOutcome, Section,
    TeacherConstraint, Assessment, ClassSession, TeachingSession, prerequisites
)
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

# -------------------------------------------------------------
# Live Session Conduct & Logging
# -------------------------------------------------------------
@router.post("/{course_id}/sessions/{session_number}/conduct")
def conduct_session(course_id: str, session_number: int, payload: Dict[str, Any] = {}, db: Session = Depends(get_db)):
    session = (
        db.query(ClassSession)
        .filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number)
        .first()
    )
    if not session:
        session = ClassSession(
            course_id=course_id,
            session_number=session_number,
            duration_minutes=payload.get("actual_minutes", 55),
            status="completed"
        )
        db.add(session)
        db.flush()
    else:
        session.status = "completed"

    ts = session.teaching_session
    if not ts:
        ts = TeachingSession(session_id=session.id)
        db.add(ts)

    ts.actual_minutes = payload.get("actual_minutes", session.duration_minutes)
    ts.student_engagement_rating = payload.get("student_engagement_rating", 4)
    ts.teacher_notes = payload.get("teacher_notes", "")
    ts.completion_rate = payload.get("completion_rate", 1.0)
    db.commit()

    return {
        "status": "success",
        "message": f"Class session {session_number} successfully recorded and logged.",
        "session_id": session.id,
        "session_number": session.session_number,
        "actual_minutes": ts.actual_minutes,
        "status_state": session.status
    }

# -------------------------------------------------------------
# MongoDB Rich Unstructured Content (Slides, Code, LaTeX)
# -------------------------------------------------------------
@router.get("/{course_id}/lesson-plans/{session_number}/rich-content")
def get_rich_lesson_plan(course_id: str, session_number: int, db: Session = Depends(get_db)):
    mongo_db = get_mongo_db()
    
    # Query MongoDB for cached rich assets
    if mongo_db is not None:
        try:
            cached = mongo_db["lesson_plan_assets"].find_one({"course_id": course_id, "session_number": session_number})
            if cached:
                cached.pop("_id", None)
                return cached
        except Exception:
            pass

    # Find context from relational database
    session = db.query(ClassSession).filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number).first()
    topic = session.current_topic if session and session.current_topic else None
    if not topic:
        topics = db.query(Topic).join(Topic.unit).filter(Topic.unit.has(course_id=course_id)).order_by(Topic.unit_id, Topic.order_index).all()
        topic = topics[(session_number - 1) % len(topics)] if topics else None

    topic_title = topic.title if topic else f"Foundations & Principles (Session {session_number})"
    
    import datetime
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    # Synthesize rich structured pedagogical assets
    rich_doc = {
        "course_id": course_id,
        "session_number": session_number,
        "topic_title": topic_title,
        "version": 1,
        "updated_at": now_iso,
        "slides": [
            {
                "slide_number": 1,
                "title": f"Introduction & Framing: {topic_title}",
                "bullet_points": [
                    f"Operational context and fundamental motivation behind {topic_title}.",
                    "Review of prerequisite invariants required for comprehension.",
                    "Key industry applications and real-world database architectural impact."
                ],
                "key_takeaway": f"Understand why {topic_title} is essential for relational consistency."
            },
            {
                "slide_number": 2,
                "title": "Mathematical & Structural Modeling",
                "bullet_points": [
                    "Formal algorithmic definitions and dependency constraints.",
                    "Decomposition analysis and preservation theorems.",
                    "Complexity characteristics and edge-case behaviors."
                ],
                "key_takeaway": "Formal algebraic rules ensure lossless transformations."
            },
            {
                "slide_number": 3,
                "title": "Worked Example & Step-by-Step Walkthrough",
                "bullet_points": [
                    "Sample relation schema evaluation.",
                    "Tracing execution steps and verifying boundary criteria.",
                    "Identifying common student traps and antipatterns."
                ],
                "key_takeaway": "Practice systematic algorithmic evaluation over intuitive guessing."
            },
            {
                "slide_number": 4,
                "title": "Exit Synthesis & Active Checkpoint",
                "bullet_points": [
                    "Formative 5-minute exit ticket concept verification.",
                    "Summary of core invariants established today.",
                    "Preview of downstream concepts dependent on this topic."
                ],
                "key_takeaway": "Consolidate mastery before advancing to subsequent unit modules."
            }
        ],
        "code_snippets": [
            {
                "title": f"SQL Implementation Demo for {topic_title}",
                "language": "sql",
                "code": "-- Relational Integrity Query Demonstration\nSELECT \n    u.unit_number,\n    t.title AS topic_name,\n    COUNT(c.id) AS concept_count\nFROM topics t\nJOIN units u ON t.unit_id = u.id\nLEFT JOIN concepts c ON c.topic_id = t.id\nWHERE t.title LIKE '%" + topic_title[:15] + "%'\nGROUP BY u.unit_number, t.title\nHAVING COUNT(c.id) >= 1\nORDER BY u.unit_number ASC;",
                "explanation": "Demonstrates relational aggregation, join mechanics, and group-level predicates."
            },
            {
                "title": "Algorithmic Verification Script",
                "language": "python",
                "code": "def verify_dependency_invariants(attributes, functional_deps):\n    \"\"\"Compute attribute closure X+ under F\"\"\"\n    closure = set(attributes)\n    changed = True\n    while changed:\n        changed = False\n        for lhs, rhs in functional_deps:\n            if set(lhs).issubset(closure) and not set(rhs).issubset(closure):\n                closure.update(rhs)\n                changed = True\n    return closure",
                "explanation": "Deterministic polynomial-time algorithm for computing minimal attribute closure."
            }
        ],
        "latex_formulas": [
            {
                "name": "Relational Transformation Invariant",
                "latex": r"X^+ = \{ A \mid F \models X \to A \}",
                "description": "Attribute closure theorem: the maximal attribute set functionally determined by X under dependency set F."
            },
            {
                "name": "Lossless Decomposition Criterion",
                "latex": r"R_1 \cap R_2 \to R_1 \quad \text{or} \quad R_1 \cap R_2 \to R_2",
                "description": "Heath's Theorem: Decomposition of R into (R1, R2) is lossless iff the common attributes form a superkey of R1 or R2."
            }
        ],
        "discussion_prompts": [
            f"Why does a naive schema without {topic_title} degrade performance under high concurrent writes?",
            "What happens to transaction serializability if relational integrity constraints are violated?"
        ],
        "recommended_readings": [
            "Silberschatz, Korth, Sudarshan — Database System Concepts (7th Ed), Chapter 8.",
            "Codd, E.F. — 'A Relational Model of Data for Large Shared Data Banks' (CACM 1970)."
        ]
    }

    # Cache into MongoDB
    if mongo_db is not None:
        try:
            mongo_db["lesson_plan_assets"].insert_one(dict(rich_doc))
        except Exception:
            pass

    return rich_doc

@router.post("/{course_id}/lesson-plans/{session_number}/rich-content")
def save_rich_lesson_plan(course_id: str, session_number: int, payload: Dict[str, Any] = {}):
    mongo_db = get_mongo_db()
    if mongo_db is None:
        return payload

    import datetime
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

    try:
        existing = mongo_db["lesson_plan_assets"].find_one({"course_id": course_id, "session_number": session_number})
        curr_version = existing.get("version", 1) if existing else 1
        new_version = curr_version + 1

        if existing:
            revision_doc = {**existing, "archived_at": now_iso, "revision_number": curr_version}
            revision_doc.pop("_id", None)
            mongo_db["lesson_plan_revisions"].insert_one(revision_doc)

        payload["course_id"] = course_id
        payload["session_number"] = session_number
        payload["version"] = new_version
        payload["updated_at"] = now_iso

        mongo_db["lesson_plan_assets"].update_one(
            {"course_id": course_id, "session_number": session_number},
            {"$set": payload},
            upsert=True
        )
    except Exception:
        pass

    payload.pop("_id", None)
    return payload

# -------------------------------------------------------------
# Concept Drawer: Live Parameter Adjustments & Re-Optimization
# -------------------------------------------------------------
@router.patch("/{course_id}/concepts/{concept_id}")
def update_concept_parameters(course_id: str, concept_id: str, payload: Dict[str, Any] = {}, db: Session = Depends(get_db)):
    concept = db.query(Concept).filter(Concept.id == concept_id).first()
    if not concept:
        raise HTTPException(status_code=404, detail="Concept not found")

    if "difficulty" in payload:
        d = int(payload["difficulty"])
        concept.difficulty = max(1, min(5, d))
    if "importance" in payload:
        imp = int(payload["importance"])
        concept.importance = max(1, min(5, imp))
    if "name" in payload and payload["name"]:
        concept.name = payload["name"].strip()

    db.commit()
    db.refresh(concept)

    # Re-run time optimizer to reflect changed priority scores
    time_allocator.optimize_course_time(db, course_id)

    return {
        "status": "success",
        "concept_id": concept.id,
        "name": concept.name,
        "difficulty": concept.difficulty,
        "importance": concept.importance
    }
