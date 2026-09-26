"""
Assessment Repository for Assessments, Questions, and Student Performance Tracking
"""
from typing import List
from sqlalchemy.orm import Session
from app.models.entities import Assessment, Performance, MethodEffectiveness
from app.repositories.base_repository import BaseRepository

class AssessmentRepository(BaseRepository[Assessment]):
    def __init__(self):
        super().__init__(Assessment)

    def get_by_course(self, db: Session, course_id: str) -> List[Assessment]:
        return (
            db.query(Assessment)
            .filter(Assessment.course_id == course_id)
            .order_by(Assessment.created_at.desc())
            .all()
        )

    def get_performances_by_course(self, db: Session, course_id: str) -> List[Performance]:
        return (
            db.query(Performance)
            .join(Assessment)
            .filter(Assessment.course_id == course_id)
            .order_by(Performance.recorded_at.desc())
            .all()
        )

    def get_concept_performance(self, db: Session, concept_id: str) -> List[Performance]:
        return (
            db.query(Performance)
            .filter(Performance.concept_id == concept_id)
            .order_by(Performance.recorded_at.desc())
            .all()
        )

    def get_method_effectiveness(self, db: Session) -> List[MethodEffectiveness]:
        return db.query(MethodEffectiveness).all()

assessment_repository = AssessmentRepository()
