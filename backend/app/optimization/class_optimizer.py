from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.entities import Course, ClassSession, Topic, Concept, TeacherConstraint
from app.optimization.revision_engine import revision_engine
from app.optimization.method_selector import method_selector
from app.schemas.schemas import NextClassOptimizationResponse, PeriodPhase

class ClassOptimizer:
    """
    Class-level optimization engine.
    Answers: 'What exactly should happen during THIS period?'
    Guarantees that the sum of phase durations strictly equals the configured period duration.
    """

    def optimize_next_class(
        self, 
        db: Session, 
        course_id: str, 
        session_number: Optional[int] = None
    ) -> NextClassOptimizationResponse:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        period_duration = course.period_duration # e.g. 55 minutes

        # Determine target session
        if session_number is None:
            # Pick first non-completed session or session 1
            session = (
                db.query(ClassSession)
                .filter(ClassSession.course_id == course_id, ClassSession.status != "completed")
                .order_by(ClassSession.session_number)
                .first()
            )
            if not session:
                session = db.query(ClassSession).filter(ClassSession.course_id == course_id).order_by(ClassSession.session_number).first()
        else:
            session = db.query(ClassSession).filter(ClassSession.course_id == course_id, ClassSession.session_number == session_number).first()

        current_session_num = session.session_number if session else 1

        # Determine target topic:
        # If session has a current_topic_id, use it; otherwise pick from topic sequence
        target_topic = None
        if session and session.current_topic_id:
            target_topic = db.query(Topic).filter(Topic.id == session.current_topic_id).first()

        if not target_topic:
            # Find in-progress topic or first pending topic
            target_topic = (
                db.query(Topic)
                .join(Topic.unit)
                .filter(Topic.unit.has(course_id=course_id))
                .order_by(Topic.unit_id, Topic.order_index)
                .first()
            )

        if not target_topic:
            raise ValueError("No topics available in this course curriculum")

        # Evaluate revision requirement
        rev_info = revision_engine.evaluate_revision_need(db, target_topic)
        needs_revision = rev_info["revision_needed"]
        rev_minutes = rev_info["revision_minutes"]
        rev_concept = rev_info["revision_concept"]
        rev_reason = rev_info["reason"]

        # Determine primary concept type of target topic
        concept_types = [c.concept_type for c in target_topic.concepts]
        primary_type = concept_types[0] if concept_types else "conceptual"
        has_weak = needs_revision

        # Method recommendations
        recommended_methods, predicted_gain = method_selector.select_methods(db, primary_type, has_weak_prereq=has_weak)

        # Build exact phase breakdown totaling period_duration (e.g. 55 min)
        phases: List[PeriodPhase] = []
        
        if period_duration == 55:
            if needs_revision:
                phases = [
                    PeriodPhase(
                        phase_name="Prerequisite Revision & Diagnostic Check",
                        duration_minutes=10,
                        method_name="Recap & Prerequisite Revision",
                        activity_description=f"Rapid 10-minute diagnostic review of '{rev_concept}' addressing common misconceptions.",
                        concept_ref=rev_concept
                    ),
                    PeriodPhase(
                        phase_name="Core Concept Introduction & Mechanics",
                        duration_minutes=15,
                        method_name="Interactive Lecture & Structural Modeling",
                        activity_description=f"Introduce key principles and definitions of '{target_topic.title}'.",
                        concept_ref=target_topic.concepts[0].name if target_topic.concepts else target_topic.title
                    ),
                    PeriodPhase(
                        phase_name="Worked Examples & Guided Problem Solving",
                        duration_minutes=20,
                        method_name="Worked Examples & Decomposition",
                        activity_description="Demonstrate 2 comprehensive step-by-step problems with edge cases on the blackboard.",
                        concept_ref=target_topic.title
                    ),
                    PeriodPhase(
                        phase_name="Active Student Exercise & Synthesis",
                        duration_minutes=10,
                        method_name="Guided Practice & Formative Exit Check",
                        activity_description="Students solve a paired problem; quick poll to verify retention.",
                        concept_ref=target_topic.title
                    )
                ]
            else:
                phases = [
                    PeriodPhase(
                        phase_name="Session Framing & Prior Class Recap",
                        duration_minutes=5,
                        method_name="Interactive Recap",
                        activity_description="Contextualize today's goals within the broader course roadmap.",
                        concept_ref=target_topic.title
                    ),
                    PeriodPhase(
                        phase_name="In-depth Concept Exploration",
                        duration_minutes=20,
                        method_name=recommended_methods[0] if recommended_methods else "Interactive Lecture",
                        activity_description=f"Deep architectural exploration of '{target_topic.title}'.",
                        concept_ref=target_topic.concepts[0].name if target_topic.concepts else target_topic.title
                    ),
                    PeriodPhase(
                        phase_name="Practical Application / Demonstration",
                        duration_minutes=20,
                        method_name=recommended_methods[1] if len(recommended_methods) > 1 else "Worked Examples",
                        activity_description="Live modeling and step-by-step problem execution.",
                        concept_ref=target_topic.title
                    ),
                    PeriodPhase(
                        phase_name="Formative Assessment & Exit Check",
                        duration_minutes=10,
                        method_name="Interactive Formative Assessment",
                        activity_description="Short 3-question conceptual check to benchmark cohort grasp.",
                        concept_ref=target_topic.title
                    )
                ]
        else:
            # Dynamic proportional allocation for arbitrary durations (e.g. 50m, 60m, 90m)
            if needs_revision:
                r_m = min(15, max(10, int(period_duration * 0.18)))
                rem = period_duration - r_m
                c_m = int(rem * 0.35)
                w_m = int(rem * 0.40)
                e_m = rem - c_m - w_m
                phases = [
                    PeriodPhase(phase_name="Prerequisite Revision", duration_minutes=r_m, method_name="Recap & Prerequisite Revision", activity_description=f"Review of {rev_concept}", concept_ref=rev_concept),
                    PeriodPhase(phase_name="Concept Explanation", duration_minutes=c_m, method_name="Lecture & Modeling", activity_description="Core theory", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Worked Examples", duration_minutes=w_m, method_name="Worked Examples", activity_description="Practical demonstration", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Student Activity & Wrap-up", duration_minutes=e_m, method_name="Active Learning", activity_description="Formative practice", concept_ref=target_topic.title),
                ]
            else:
                f_m = max(5, int(period_duration * 0.10))
                rem = period_duration - f_m
                c_m = int(rem * 0.45)
                w_m = int(rem * 0.30)
                e_m = rem - c_m - w_m
                phases = [
                    PeriodPhase(phase_name="Framing & Recap", duration_minutes=f_m, method_name="Recap", activity_description="Session framing", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Concept Exploration", duration_minutes=c_m, method_name="Interactive Lecture", activity_description="Core theory", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Demonstration & Practice", duration_minutes=w_m, method_name="Worked Examples", activity_description="Practice", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Wrap-up & Evaluation", duration_minutes=e_m, method_name="Formative Quiz", activity_description="Exit check", concept_ref=target_topic.title),
                ]

        total_phase_minutes = sum(p.duration_minutes for p in phases)
        # Verify strict invariant
        assert total_phase_minutes == period_duration, f"Phase sum {total_phase_minutes} must equal period duration {period_duration}"

        why_text = (
            f"Recommended plan for Session {current_session_num} on '{target_topic.title}'. "
            f"{'Revision was triggered because ' + rev_reason if needs_revision else 'Proceeding directly as prerequisite competencies are sound.'} "
            f"Pedagogical strategy blends {', '.join(recommended_methods)} yielding an estimated +{predicted_gain}% learning improvement based on cohort tracking."
        )

        return NextClassOptimizationResponse(
            session_number=current_session_num,
            topic_id=target_topic.id,
            topic_title=target_topic.title,
            unit_number=target_topic.unit.unit_number if target_topic.unit else 1,
            period_duration=period_duration,
            target_concepts=[c.name for c in target_topic.concepts],
            revision_needed=needs_revision,
            revision_minutes=rev_minutes,
            revision_concept=rev_concept,
            revision_reason=rev_reason,
            recommended_methods=recommended_methods,
            phases=phases,
            total_phase_minutes=total_phase_minutes,
            why_explanation=why_text,
            learning_gain_prediction=predicted_gain
        )

class_optimizer = ClassOptimizer()
