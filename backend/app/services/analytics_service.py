from typing import Dict, Any, List
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.entities import Course, ClassSession, Topic, Concept, Performance, TeachingSession, MethodEffectiveness, TeachingMethod
from app.schemas.schemas import CourseAnalyticsResponse, AlertItem
from app.services.curriculum_service import curriculum_service

class AnalyticsService:
    """
    Course-level Analytics & Intelligent Alert Engine.
    Computes real-time curriculum progress, time utilization, concept health breakdown,
    and dynamically fires actionable pedagogical alerts.
    """

    def get_course_analytics(self, db: Session, course_id: str) -> CourseAnalyticsResponse:
        course = db.query(Course).filter(Course.id == course_id).first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        # 1. Session Completion & Time Utilization
        total_sessions = course.total_classes
        completed_sessions = (
            db.query(ClassSession)
            .filter(ClassSession.course_id == course_id, ClassSession.status == "completed")
            .count()
        )
        progress_pct = round((completed_sessions / total_sessions * 100.0), 1) if total_sessions > 0 else 0.0

        # Actual minutes taught from TeachingSession
        actual_taught_records = (
            db.query(func.sum(TeachingSession.actual_minutes))
            .join(ClassSession, TeachingSession.session_id == ClassSession.id)
            .filter(ClassSession.course_id == course_id)
            .scalar()
        )
        actual_minutes_taught = actual_taught_records or (completed_sessions * course.period_duration)
        planned_minutes = course.total_available_minutes
        remaining_minutes = max(0, planned_minutes - actual_minutes_taught)

        # 2. Concept Health Metrics
        graph = curriculum_service.get_graph(db, course_id)
        concept_health = {"strong": 0, "moderate": 0, "weak": 0, "bottleneck": 0}
        for node in graph.nodes:
            if node.status in concept_health:
                concept_health[node.status] += 1
            elif node.status == "mastered":
                concept_health["strong"] += 1
            else:
                concept_health["moderate"] += 1

        # 3. Teaching Method Effectiveness
        eff_records = (
            db.query(MethodEffectiveness, TeachingMethod)
            .join(TeachingMethod, MethodEffectiveness.method_id == TeachingMethod.id)
            .order_by(MethodEffectiveness.observed_gain.desc())
            .all()
        )
        methods_summary = []
        for me, tm in eff_records:
            methods_summary.append({
                "method_name": tm.name,
                "category": tm.category,
                "concept_type": me.concept_type,
                "baseline_score": me.baseline_score,
                "post_score": me.post_score,
                "observed_gain": me.observed_gain,
                "sessions_tracked": me.sample_sessions_count
            })

        # 4. Intelligent Alerts derived from course state
        alerts: List[AlertItem] = []

        # Check for Prerequisite Bottlenecks
        if graph.bottlenecks:
            bottleneck_nodes = [n for n in graph.nodes if n.id in graph.bottlenecks]
            for bn in bottleneck_nodes:
                alerts.append(AlertItem(
                    id=f"alert-bottleneck-{bn.id}",
                    severity="danger",
                    title=f"Prerequisite Bottleneck: {bn.name}",
                    message=f"Cohort performance is {bn.avg_score}% on '{bn.name}', which blocks {bn.downstream_count} downstream topics. Targeted revision required before proceeding.",
                    action_label="Review Next Class Plan",
                    action_route="/next-class"
                ))

        # Check for Time Pressure
        remaining_topics_count = (
            db.query(Topic)
            .join(Topic.unit)
            .filter(Topic.unit.has(course_id=course_id), Topic.status != "completed")
            .count()
        )
        remaining_sessions_count = total_sessions - completed_sessions
        if remaining_topics_count > remaining_sessions_count and remaining_sessions_count > 0:
            alerts.append(AlertItem(
                id="alert-time-pressure",
                severity="warning",
                title="Teaching Time Pressure Detected",
                message=f"{remaining_topics_count} topics remain to be covered with only {remaining_sessions_count} teaching periods remaining. The optimizer recommends compressing introductory examples.",
                action_label="View Optimized Allocations",
                action_route="/optimization"
            ))
        elif progress_pct > 60 and not graph.bottlenecks:
            alerts.append(AlertItem(
                id="alert-ahead-schedule",
                severity="success",
                title="Pacing on Target",
                message="Course progression is aligned with the academic calendar. Extra time can be allocated for practical case studies.",
                action_label="Explore Curriculum Graph",
                action_route="/curriculum"
            ))

        # Add general revision alert if any concept is weak
        weak_count = concept_health.get("weak", 0) + concept_health.get("bottleneck", 0)
        if weak_count > 0 and not any(a.id.startswith("alert-bottleneck") for a in alerts):
            alerts.append(AlertItem(
                id="alert-revision-rec",
                severity="warning",
                title="Revision Recommended",
                message=f"{weak_count} concepts identified with below-target mastery. Mini-revision periods have been automatically injected into period plans.",
                action_label="Inspect Class Optimizer",
                action_route="/next-class"
            ))

        return CourseAnalyticsResponse(
            course_id=course_id,
            progress_percentage=progress_pct,
            completed_sessions=completed_sessions,
            total_sessions=total_sessions,
            planned_minutes=planned_minutes,
            actual_minutes_taught=actual_minutes_taught,
            remaining_minutes=remaining_minutes,
            concept_health=concept_health,
            teaching_method_effectiveness=methods_summary,
            alerts=alerts
        )

analytics_service = AnalyticsService()
