"""
Course Repository for Course and Section Entities
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.entities import Course, TeacherConstraint, ClassSession
from app.repositories.base_repository import BaseRepository

class CourseRepository(BaseRepository[Course]):
    def __init__(self):
        super().__init__(Course)

    def get_by_code(self, db: Session, code: str) -> Optional[Course]:
        return db.query(Course).filter(Course.code == code).first()

    def get_by_teacher(self, db: Session, teacher_id: str) -> List[Course]:
        return db.query(Course).filter(Course.teacher_id == teacher_id).all()

    def get_with_relations(self, db: Session, course_id: str) -> Optional[Course]:
        return (
            db.query(Course)
            .filter(Course.id == course_id)
            .first()
        )

    def get_sessions(self, db: Session, course_id: str) -> List[ClassSession]:
        return (
            db.query(ClassSession)
            .filter(ClassSession.course_id == course_id)
            .order_by(ClassSession.session_number)
            .all()
        )

    def get_session_by_number(self, db: Session, course_id: str, session_number: int) -> Optional[ClassSession]:
        return (
            db.query(ClassSession)
            .filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number)
            .first()
        )

    def get_constraints(self, db: Session, course_id: str) -> Optional[TeacherConstraint]:
        return db.query(TeacherConstraint).filter(TeacherConstraint.course_id == course_id).first()

course_repository = CourseRepository()
