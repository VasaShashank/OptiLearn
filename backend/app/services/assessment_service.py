from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models.entities import Assessment, Question, Performance, Concept, Topic, Course, question_concepts
from app.schemas.schemas import AssessmentCreate, AssessmentOut, RecordAssessmentResultsRequest
from app.optimization.scoring import scoring_engine

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
        assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
        if not assessment:
            raise ValueError(f"Assessment {assessment_id} not found")

        assessment.status = "completed"

        updated_concepts = []
        for item in payload.performances:
            concept = db.query(Concept).filter(Concept.id == item.concept_id).first()
            if not concept:
                continue

            weakness = item.average_score < 60.0
            existing_perf = (
                db.query(Performance)
                .filter(Performance.assessment_id == assessment_id, Performance.concept_id == item.concept_id)
                .first()
            )

            if existing_perf:
                existing_perf.average_score = item.average_score
                existing_perf.sample_size = item.sample_size
                existing_perf.weakness_flag = weakness
                existing_perf.common_errors = item.common_errors
            else:
                new_perf = Performance(
                    assessment_id=assessment_id,
                    concept_id=item.concept_id,
                    average_score=item.average_score,
                    sample_size=item.sample_size,
                    weakness_flag=weakness,
                    common_errors=item.common_errors
                )
                db.add(new_perf)

            updated_concepts.append(concept.name)

        db.commit()

        # Continuous improvement loop: recompute priority scores for course
        new_scores = scoring_engine.calculate_topic_scores(db, assessment.course_id)
        for s in new_scores:
            s["topic"].priority_score = s["priority_score"]
        db.commit()

        return {
            "status": "success",
            "message": f"Recorded performance for {len(updated_concepts)} concepts. Course optimization scores updated.",
            "updated_concepts": updated_concepts,
            "reoptimized": True
        }

assessment_service = AssessmentService()
