from typing import List, Dict, Any
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session
from app.models.entities import Assessment, Question, Performance, Concept, Topic, Unit, Course, question_concepts
from app.schemas.schemas import AssessmentCreate, AssessmentOut, RecordAssessmentResultsRequest
from app.optimization.scoring import scoring_engine
from app.database.connection import refresh_dashboard_snapshot

class AssessmentService:
    """
    Continuous Improvement Assessment Service.
    Maps questions to concepts, records aggregate performance, flags learning deficits,
    and feeds performance data back into the course optimizer.
    """

    def create_assessment(self, db: Session, course_id: str, payload: AssessmentCreate) -> AssessmentOut:
        assessment = Assessment(
            course_id=course_id,
            title=payload.title,
            assessment_type=payload.assessment_type,
            max_marks=payload.max_marks,
            scheduled_date=payload.scheduled_date,
            status="upcoming"
        )
        db.add(assessment)
        db.flush()

        for q_in in payload.questions:
            question = Question(
                assessment_id=assessment.id,
                question_number=q_in.question_number,
                max_marks=q_in.max_marks,
                text=q_in.text
            )
            db.add(question)
            db.flush()

            for c_id in q_in.concept_ids:
                concept = db.query(Concept).filter(Concept.id == c_id).first()
                if concept:
                    question.concepts.append(concept)

        db.commit()
        db.refresh(assessment)

        return AssessmentOut(
            id=assessment.id,
            title=assessment.title,
            assessment_type=assessment.assessment_type,
            max_marks=assessment.max_marks,
            scheduled_date=assessment.scheduled_date,
            status=assessment.status,
            questions_count=len(assessment.questions),
            concept_averages={}
        )

    def record_results(self, db: Session, assessment_id: str, payload: RecordAssessmentResultsRequest) -> Dict[str, Any]:
        """
        One transaction: lock the assessment row, write each concept result inside its own
        SAVEPOINT (a bad item is reported, not fatal), re-score topics, then commit once —
        so results and the priorities derived from them can never be out of step.
        """
        try:
            assessment = (
                db.query(Assessment)
                .filter(Assessment.id == assessment_id)
                .with_for_update()
                .first()
            )
            if not assessment:
                raise ValueError(f"Assessment {assessment_id} not found")

            course_concept_ids = {
                cid for (cid,) in (
                    db.query(Concept.id).join(Topic).join(Unit)
                    .filter(Unit.course_id == assessment.course_id)
                )
            }
            use_procedure = db.bind.dialect.name == "postgresql"

            # Same rule the PostgreSQL trigger trg_performance_weakness enforces
            constraints = assessment.course.constraints if assessment.course else None
            threshold = constraints.revision_threshold_score if constraints else 60.0

            recorded, skipped = [], []
            for item in payload.performances:
                if item.concept_id not in course_concept_ids:
                    skipped.append({"concept_id": item.concept_id, "reason": "Concept does not belong to this course"})
                    continue
                try:
                    with db.begin_nested():
                        if use_procedure:
                            db.execute(
                                text("CALL sp_record_concept_performance(:a, :c, :s, :n, :e)"),
                                {"a": assessment_id, "c": item.concept_id, "s": item.average_score,
                                 "n": item.sample_size, "e": item.common_errors},
                            )
                        else:
                            self._upsert_performance(db, assessment_id, item, threshold)
                    recorded.append(item.concept_id)
                except DBAPIError as exc:
                    skipped.append({"concept_id": item.concept_id, "reason": str(exc.orig).splitlines()[0]})

            assessment.status = "completed"
            # Rows written by the procedure bypassed the ORM; reload before scoring
            db.flush()
            db.expire_all()

            # Continuous improvement loop: recompute priority scores for course
            course_id = assessment.course_id
            for s in scoring_engine.calculate_topic_scores(db, course_id):
                s["topic"].priority_score = s["priority_score"]

            db.commit()
        except Exception:
            db.rollback()
            raise
        refresh_dashboard_snapshot(db)

        names = dict(db.query(Concept.id, Concept.name).filter(Concept.id.in_(recorded)).all()) if recorded else {}
        return {
            "status": "success" if not skipped else "partial",
            "message": f"Recorded performance for {len(recorded)} concepts. Course optimization scores updated.",
            "updated_concepts": [names.get(cid, cid) for cid in recorded],
            "skipped": skipped,
            "reoptimized": True
        }

    @staticmethod
    def _upsert_performance(db: Session, assessment_id: str, item, threshold: float) -> None:
        existing = (
            db.query(Performance)
            .filter(Performance.assessment_id == assessment_id, Performance.concept_id == item.concept_id)
            .first()
        )
        if not existing:
            existing = Performance(assessment_id=assessment_id, concept_id=item.concept_id)
            db.add(existing)
        existing.average_score = item.average_score
        existing.sample_size = item.sample_size
        existing.weakness_flag = item.average_score < threshold
        existing.common_errors = item.common_errors
        db.flush()

assessment_service = AssessmentService()
