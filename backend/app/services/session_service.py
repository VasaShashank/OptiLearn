from typing import Any, Dict, List

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from app.database.connection import refresh_dashboard_snapshot
from app.models.entities import ClassSession, LessonPlan, TeachingMethod, TeachingSession, Topic
from app.schemas.schemas import SessionLogIn
from app.services.errors import ConflictError


class SessionService:
    """Class sessions: the timetable view and the post-class record (Teach -> Record)."""

    def list_sessions(self, db: Session, course_id: str) -> List[Dict[str, Any]]:
        sessions = (
            db.query(ClassSession)
            .options(
                joinedload(ClassSession.current_topic).joinedload(Topic.unit),
                joinedload(ClassSession.lesson_plan),
                joinedload(ClassSession.teaching_session).joinedload(TeachingSession.method),
            )
            .filter(ClassSession.course_id == course_id)
            .order_by(ClassSession.session_number)
            .all()
        )
        return [
            {
                "id": s.id,
                "session_number": s.session_number,
                "scheduled_date": s.scheduled_date,
                "duration_minutes": s.duration_minutes,
                "status": s.status,
                "topic_id": s.current_topic_id,
                "topic_title": s.current_topic.title if s.current_topic else None,
                "unit_number": s.current_topic.unit.unit_number if s.current_topic and s.current_topic.unit else None,
                "lesson_plan_status": s.lesson_plan.status if s.lesson_plan else None,
                "lesson_plan_version": s.lesson_plan.version if s.lesson_plan else None,
                "logged": {
                    "method_name": s.teaching_session.method.name if s.teaching_session.method else None,
                    "actual_minutes": s.teaching_session.actual_minutes,
                    "student_engagement_rating": s.teaching_session.student_engagement_rating,
                    "completion_rate": s.teaching_session.completion_rate,
                    "teacher_notes": s.teaching_session.teacher_notes,
                    "conducted_at": s.teaching_session.conducted_at,
                } if s.teaching_session else None,
            }
            for s in sessions
        ]

    def log_session(self, db: Session, course_id: str, session_number: int, payload: SessionLogIn) -> Dict[str, Any]:
        """
        One transaction: lock the session row, refuse a second record, insert the teaching
        record, and advance session / topic / lesson-plan state together. The row lock
        serialises concurrent submissions; UNIQUE(teaching_sessions.session_id) is the
        backstop if one ever slips through.
        """
        try:
            session = (
                db.query(ClassSession)
                .filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number)
                .with_for_update()
                .first()
            )
            if not session:
                raise ValueError(f"Session {session_number} not found")
            if session.status == "cancelled":
                raise ValueError(f"Session {session_number} was cancelled and cannot be recorded")
            if session.status == "completed" or session.teaching_session is not None:
                raise ConflictError(f"Session {session_number} has already been recorded")

            if payload.method_id and not db.get(TeachingMethod, payload.method_id):
                raise ValueError("Teaching method not found")

            record = TeachingSession(
                session_id=session.id,
                method_id=payload.method_id,
                actual_minutes=payload.actual_minutes,
                teacher_notes=payload.teacher_notes,
                student_engagement_rating=payload.student_engagement_rating,
                completion_rate=payload.completion_rate,
            )
            db.add(record)
            session.status = "completed"

            topic = session.current_topic
            if topic:
                if payload.topic_completed:
                    topic.status = "completed"
                elif topic.status == "pending":
                    topic.status = "in_progress"

            plan = db.query(LessonPlan).filter(LessonPlan.session_id == session.id).first()
            if plan and plan.status != "rejected":
                plan.status = "completed"

            db.commit()
        except IntegrityError:
            db.rollback()
            raise ConflictError(f"Session {session_number} has already been recorded")
        except Exception:
            db.rollback()
            raise

        refresh_dashboard_snapshot(db)
        return {
            "session_number": session_number,
            "status": session.status,
            "teaching_session_id": record.id,
            "topic_title": topic.title if topic else None,
            "topic_status": topic.status if topic else None,
            "lesson_plan_status": plan.status if plan else None,
        }


session_service = SessionService()
