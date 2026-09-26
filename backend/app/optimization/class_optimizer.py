from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.entities import Course, ClassSession, Topic
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
        
        method_a = recommended_methods[0] if recommended_methods else "Lecture with diagrams"
        method_b = recommended_methods[1] if len(recommended_methods) > 1 else "Worked examples"
        first_concept = target_topic.concepts[0].name if target_topic.concepts else target_topic.title

        if period_duration == 60:
            if needs_revision:
                phases = [
                    PeriodPhase(phase_name="Revision", duration_minutes=10, method_name="Recap and revision",
                                activity_description=f"Quick check on {rev_concept}, then clear up the usual mistakes before moving on.",
                                concept_ref=rev_concept),
                    PeriodPhase(phase_name="Explain", duration_minutes=20, method_name="Lecture with diagrams",
                                activity_description=f"Introduce the key ideas and definitions of {target_topic.title}.",
                                concept_ref=first_concept),
                    PeriodPhase(phase_name="Worked examples", duration_minutes=20, method_name="Worked examples",
                                activity_description="Solve two problems step by step on the board, including one edge case.",
                                concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Class activity", duration_minutes=10, method_name="Guided practice",
                                activity_description="Students solve a problem in pairs; finish with a quick show of hands.",
                                concept_ref=target_topic.title),
                ]
            else:
                phases = [
                    PeriodPhase(phase_name="Recap", duration_minutes=5, method_name="Recap and revision",
                                activity_description="Link today's topic to what the class covered last time.",
                                concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Explain", duration_minutes=25, method_name=method_a,
                                activity_description=f"Work through the ideas behind {target_topic.title}.",
                                concept_ref=first_concept),
                    PeriodPhase(phase_name="Practice", duration_minutes=20, method_name=method_b,
                                activity_description="Model a problem, then let students try the next one.",
                                concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Quick check", duration_minutes=10, method_name="Short quiz",
                                activity_description="Three quick questions to see what stuck.",
                                concept_ref=target_topic.title),
                ]
        elif period_duration == 55:
            if needs_revision:
                phases = [
                    PeriodPhase(phase_name="Revision", duration_minutes=10, method_name="Recap and revision",
                                activity_description=f"Quick check on {rev_concept}, then clear up the usual mistakes before moving on.",
                                concept_ref=rev_concept),
                    PeriodPhase(phase_name="Explain", duration_minutes=15, method_name="Lecture with diagrams",
                                activity_description=f"Introduce the key ideas and definitions of {target_topic.title}.",
                                concept_ref=first_concept),
                    PeriodPhase(phase_name="Worked examples", duration_minutes=20, method_name="Worked examples",
                                activity_description="Solve two problems step by step on the board, including one edge case.",
                                concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Class activity", duration_minutes=10, method_name="Guided practice",
                                activity_description="Students solve a problem in pairs; finish with a quick show of hands.",
                                concept_ref=target_topic.title),
                ]
            else:
                phases = [
                    PeriodPhase(phase_name="Recap", duration_minutes=5, method_name="Recap and revision",
                                activity_description="Link today's topic to what the class covered last time.",
                                concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Explain", duration_minutes=20, method_name=method_a,
                                activity_description=f"Work through the ideas behind {target_topic.title}.",
                                concept_ref=first_concept),
                    PeriodPhase(phase_name="Practice", duration_minutes=20, method_name=method_b,
                                activity_description="Model a problem, then let students try the next one.",
                                concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Quick check", duration_minutes=10, method_name="Short quiz",
                                activity_description="Three quick questions to see what stuck.",
                                concept_ref=target_topic.title),
                ]
        else:
            # Proportional split for other period lengths (e.g. 50, 60 or 90 minutes)
            if needs_revision:
                r_m = min(15, max(10, int(period_duration * 0.18)))
                rem = period_duration - r_m
                c_m = int(rem * 0.35)
                w_m = int(rem * 0.40)
                e_m = rem - c_m - w_m
                phases = [
                    PeriodPhase(phase_name="Revision", duration_minutes=r_m, method_name="Recap and revision", activity_description=f"Quick check on {rev_concept}", concept_ref=rev_concept),
                    PeriodPhase(phase_name="Explain", duration_minutes=c_m, method_name="Lecture with diagrams", activity_description="Key ideas and definitions", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Worked examples", duration_minutes=w_m, method_name="Worked examples", activity_description="Problems solved step by step", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Class activity", duration_minutes=e_m, method_name="Guided practice", activity_description="Students practise in pairs", concept_ref=target_topic.title),
                ]
            else:
                f_m = max(5, int(period_duration * 0.10))
                rem = period_duration - f_m
                c_m = int(rem * 0.45)
                w_m = int(rem * 0.30)
                e_m = rem - c_m - w_m
                phases = [
                    PeriodPhase(phase_name="Recap", duration_minutes=f_m, method_name="Recap and revision", activity_description="Link to the last class", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Explain", duration_minutes=c_m, method_name=method_a, activity_description="Key ideas and definitions", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Practice", duration_minutes=w_m, method_name=method_b, activity_description="Model a problem, then students try one", concept_ref=target_topic.title),
                    PeriodPhase(phase_name="Quick check", duration_minutes=e_m, method_name="Short quiz", activity_description="A few questions to see what stuck", concept_ref=target_topic.title),
                ]

        total_phase_minutes = sum(p.duration_minutes for p in phases)
        # Verify strict invariant
        assert total_phase_minutes == period_duration, f"Phase sum {total_phase_minutes} must equal period duration {period_duration}"

        methods_text = " and ".join(m.lower() for m in recommended_methods[:2])
        why_text = (
            f"{rev_reason} "
            f"{methods_text[:1].upper() + methods_text[1:]} gave the biggest improvement on similar topics "
            f"in past classes (about +{predicted_gain:g}% on the next quiz)."
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
