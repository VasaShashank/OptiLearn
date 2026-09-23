"""
Curriculum Repository for Units, Topics, Concepts, and Prerequisites
"""
from typing import List, Optional, Dict
from sqlalchemy.orm import Session
from app.models.entities import Unit, Topic, Concept, CourseOutcome, prerequisites
from app.repositories.base_repository import BaseRepository

class CurriculumRepository:
    def get_units_by_course(self, db: Session, course_id: str) -> List[Unit]:
        return (
            db.query(Unit)
            .filter(Unit.course_id == course_id)
            .order_by(Unit.unit_number)
            .all()
        )

    def get_topics_by_course(self, db: Session, course_id: str) -> List[Topic]:
        return (
            db.query(Topic)
            .join(Unit)
            .filter(Unit.course_id == course_id)
            .order_by(Unit.order_index, Topic.order_index)
            .all()
        )

    def get_topic_by_id(self, db: Session, topic_id: str) -> Optional[Topic]:
        return db.query(Topic).filter(Topic.id == topic_id).first()

    def get_concepts_by_course(self, db: Session, course_id: str) -> List[Concept]:
        return (
            db.query(Concept)
            .join(Topic)
            .join(Unit)
            .filter(Unit.course_id == course_id)
            .order_by(Unit.order_index, Topic.order_index, Concept.order_index)
            .all()
        )

    def get_concept_by_id(self, db: Session, concept_id: str) -> Optional[Concept]:
        return db.query(Concept).filter(Concept.id == concept_id).first()

    def get_outcomes_by_course(self, db: Session, course_id: str) -> List[CourseOutcome]:
        return (
            db.query(CourseOutcome)
            .filter(CourseOutcome.course_id == course_id)
            .order_by(CourseOutcome.code)
            .all()
        )

    def get_prerequisite_pairs(self, db: Session, course_id: str) -> List[Dict[str, str]]:
        """Return pairs of concept IDs representing prerequisite relationships within the course"""
        concepts = self.get_concepts_by_course(db, course_id)
        concept_ids = {c.id for c in concepts}
        pairs = []
        for c in concepts:
            for p in c.prerequisites:
                if p.id in concept_ids:
                    pairs.append({"source": p.id, "target": c.id})
        return pairs

    def add_prerequisite(self, db: Session, concept_id: str, prerequisite_id: str) -> bool:
        if concept_id == prerequisite_id:
            return False
        concept = self.get_concept_by_id(db, concept_id)
        prereq = self.get_concept_by_id(db, prerequisite_id)
        if concept and prereq and prereq not in concept.prerequisites:
            concept.prerequisites.append(prereq)
            db.commit()
            return True
        return False

curriculum_repository = CurriculumRepository()
