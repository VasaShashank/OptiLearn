import uuid
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.entities import LessonPlan, ClassSession, Topic, Concept
from app.database.connection import get_mongo_db
from app.schemas.schemas import LessonPlanCreate, LessonPlanOut, PeriodPhase

class LessonPlanService:
    """
    Polyglot Lesson Plan Service.
    Saves authoritative relational references in PostgreSQL (lesson_plans table)
    and flexible rich pedagogical artifacts in MongoDB (lesson_plan_documents collection).
    """

    def generate_plan(self, db: Session, course_id: str, session_number: int, class_plan_data: Dict[str, Any]) -> LessonPlanOut:
        mongo_db = get_mongo_db()
        session = (
            db.query(ClassSession)
            .filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number)
            .first()
        )
        if not session:
            raise ValueError(f"Session {session_number} not found for course {course_id}")

        topic = db.query(Topic).filter(Topic.id == class_plan_data["topic_id"]).first()
        if not topic:
            raise ValueError(f"Topic {class_plan_data['topic_id']} not found")

        # Synthesize domain-specific pedagogical content
        objectives = [
            f"Understand core principles, formal definitions, and mechanics of {topic.title}.",
            f"Formulate and solve standard analytical problems related to {topic.title}.",
            f"Recognize practical trade-offs and edge cases encountered in real-world database systems."
        ]

        worked_examples = [
            f"Worked Example 1: Basic execution and verification algorithm for {topic.title}.",
            f"Worked Example 2: Edge-case problem involving decomposed schemas and constraint preservation."
        ]

        active_exercises = [
            f"Think-Pair-Share: Analyze sample relation R(A,B,C,D) and identify violations for {topic.title}.",
            "Individual Exit Ticket: Solve 5-minute decomposition problem before session end."
        ]

        misconceptions = [
            "Confusing candidate keys with superkeys during minimal cover derivation.",
            "Assuming every 3NF decomposition is automatically dependency preserving without checking."
        ]

        assessment_questions = [
            f"State the primary definition and condition required for {topic.title}.",
            "Given relation R(A, B, C, D, E) with FDs: A->B, BC->D, D->E, determine the highest normal form."
        ]

        # 1. Store Rich Document in MongoDB
        mongo_doc_id = str(uuid.uuid4())
        doc_payload = {
            "_id": mongo_doc_id,
            "course_id": course_id,
            "session_number": session_number,
            "topic_id": topic.id,
            "topic_title": topic.title,
            "phases": [p if isinstance(p, dict) else p.dict() for p in class_plan_data["phases"]],
            "learning_objectives": objectives,
            "worked_examples": worked_examples,
            "active_exercises": active_exercises,
            "misconceptions": misconceptions,
            "assessment_questions": assessment_questions,
            "why_explanation": class_plan_data.get("why_explanation", ""),
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
        mongo_db["lesson_plan_documents"].insert_one(doc_payload)

        # 2. Store Relational Entity in PostgreSQL
        existing = db.query(LessonPlan).filter(LessonPlan.session_id == session.id).first()
        if existing:
            existing.topic_id = topic.id
            existing.title = f"Lesson Plan: {topic.title} (Period {session_number})"
            existing.mongo_doc_id = mongo_doc_id
            existing.status = "approved"
            existing.teacher_overridden = False
            lp_entity = existing
        else:
            lp_entity = LessonPlan(
                session_id=session.id,
                topic_id=topic.id,
                title=f"Lesson Plan: {topic.title} (Period {session_number})",
                mongo_doc_id=mongo_doc_id,
                status="approved",
                teacher_overridden=False
            )
            db.add(lp_entity)

        db.commit()
        db.refresh(lp_entity)

        phases_models = [PeriodPhase(**p) if isinstance(p, dict) else p for p in class_plan_data["phases"]]

        return LessonPlanOut(
            id=lp_entity.id,
            session_id=session.id,
            session_number=session_number,
            topic_id=topic.id,
            topic_title=topic.title,
            title=lp_entity.title,
            status=lp_entity.status,
            teacher_overridden=lp_entity.teacher_overridden,
            phases=phases_models,
            learning_objectives=objectives,
            worked_examples=worked_examples,
            active_exercises=active_exercises,
            misconceptions=misconceptions,
            assessment_questions=assessment_questions,
            created_at=lp_entity.created_at
        )

    def get_plan(self, db: Session, session_id: str) -> Optional[LessonPlanOut]:
        lp = db.query(LessonPlan).filter(LessonPlan.session_id == session_id).first()
        if not lp:
            return None

        mongo_db = get_mongo_db()
        doc = mongo_db["lesson_plan_documents"].find_one({"_id": lp.mongo_doc_id})
        phases = [PeriodPhase(**p) for p in doc.get("phases", [])] if doc else []

        return LessonPlanOut(
            id=lp.id,
            session_id=lp.session_id,
            session_number=lp.session.session_number if lp.session else 1,
            topic_id=lp.topic_id,
            topic_title=lp.topic.title if lp.topic else "",
            title=lp.title,
            status=lp.status,
            teacher_overridden=lp.teacher_overridden,
            phases=phases,
            learning_objectives=doc.get("learning_objectives", []) if doc else [],
            worked_examples=doc.get("worked_examples", []) if doc else [],
            active_exercises=doc.get("active_exercises", []) if doc else [],
            misconceptions=doc.get("misconceptions", []) if doc else [],
            assessment_questions=doc.get("assessment_questions", []) if doc else [],
            created_at=lp.created_at
        )

    def list_plans(
        self,
        db: Session,
        course_id: str,
        session_number: Optional[int] = None,
        unit_id: Optional[str] = None,
        topic_id: Optional[str] = None,
        status: Optional[str] = None
    ) -> list[LessonPlanOut]:
        query = (
            db.query(LessonPlan)
            .join(ClassSession)
            .filter(ClassSession.course_id == course_id)
        )
        if session_number is not None:
            query = query.filter(ClassSession.session_number == session_number)
        if topic_id:
            query = query.filter(LessonPlan.topic_id == topic_id)
        if status:
            query = query.filter(LessonPlan.status == status)
        if unit_id:
            query = query.join(Topic).filter(Topic.unit_id == unit_id)

        existing_plans = query.order_by(ClassSession.session_number).all()

        # If specific session requested or no plans exist at all, generate dynamically
        if not existing_plans:
            from app.optimization.class_optimizer import class_optimizer
            target_session = session_number if session_number is not None else 1
            try:
                opt = class_optimizer.optimize_next_class(db, course_id, session_number=target_session)
                generated = self.generate_plan(db, course_id, target_session, opt.dict())
                return [generated]
            except Exception:
                return []

        results = []
        for lp in existing_plans:
            plan_out = self.get_plan(db, lp.session_id)
            if plan_out:
                results.append(plan_out)
        return results

lesson_plan_service = LessonPlanService()
