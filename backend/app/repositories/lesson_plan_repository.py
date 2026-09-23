"""
Lesson Plan Repository for Relational Entity Mapping
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.entities import LessonPlan, ClassSession, TeachingSession
from app.repositories.base_repository import BaseRepository

class LessonPlanRepository(BaseRepository[LessonPlan]):
    def __init__(self):
        super().__init__(LessonPlan)

    def get_by_session_id(self, db: Session, session_id: str) -> Optional[LessonPlan]:
        return db.query(LessonPlan).filter(LessonPlan.session_id == session_id).first()

    def get_by_course(
        self,
        db: Session,
        course_id: str,
        status: Optional[str] = None,
        unit_id: Optional[str] = None
    ) -> List[LessonPlan]:
        query = (
            db.query(LessonPlan)
            .join(ClassSession)
            .filter(ClassSession.course_id == course_id)
        )
        if status:
            query = query.filter(LessonPlan.status == status)
        if unit_id:
            from app.models.entities import Topic
            query = query.join(Topic).filter(Topic.unit_id == unit_id)
            
        return query.order_by(ClassSession.session_number).all()

lesson_plan_repository = LessonPlanRepository()
