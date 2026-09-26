"""
Curriculum Pacing Deviation Model (Planned vs Actual Velocity)
"""
from typing import Dict, Any

class CurriculumPacingModel:
    """
    Computes class teaching velocity and pacing deviation against optimal target schedule.
    """

    def calculate_pacing_velocity(
        self,
        total_classes: int,
        completed_sessions: int,
        total_topics: int,
        covered_topics: int,
        period_duration: int = 55,
        actual_minutes_spent: int = 0
    ) -> Dict[str, Any]:
        """
        Evaluate class velocity and syllabus progression against planned schedule.
        """
        if total_classes <= 0 or total_topics <= 0:
            return {
                "velocity_ratio": 1.0,
                "status": "on_track",
                "variance_sessions": 0.0,
                "recommendation": "Maintain regular schedule"
            }

        # Expected completion percentage based on sessions elapsed
        expected_progress_ratio = completed_sessions / total_classes
        actual_progress_ratio = covered_topics / total_topics

        # Planned topics per session
        planned_topics_per_session = total_topics / total_classes
        actual_topics_per_session = (covered_topics / completed_sessions) if completed_sessions > 0 else planned_topics_per_session

        # Velocity ratio: > 1.0 means ahead of schedule, < 1.0 means lagging
        velocity_ratio = (actual_topics_per_session / planned_topics_per_session) if planned_topics_per_session > 0 else 1.0

        # Topic gap
        expected_topics_covered = expected_progress_ratio * total_topics
        topic_deficit = expected_topics_covered - covered_topics

        # Session variance (positive means behind by X sessions, negative means ahead)
        variance_sessions = (topic_deficit / planned_topics_per_session) if planned_topics_per_session > 0 else 0.0

        # Remaining classes and topics
        remaining_classes = max(0, total_classes - completed_sessions)
        remaining_topics = max(0, total_topics - covered_topics)

        required_velocity = (remaining_topics / remaining_classes) if remaining_classes > 0 else 0.0

        if variance_sessions >= 2.0:
            status = "critically_behind"
            recommendation = (
                f"Behind by ~{round(variance_sessions, 1)} sessions ({round(topic_deficit, 1)} topics). "
                f"Trigger catch-up acceleration: convert 15 mins of future practice to condensed instruction or merge related topics."
            )
        elif variance_sessions >= 0.75:
            status = "moderately_behind"
            recommendation = (
                f"Slight lag of ~{round(variance_sessions, 1)} sessions. "
                f"Increase velocity to {round(required_velocity, 2)} topics/class to finish on time."
            )
        elif variance_sessions <= -1.0:
            status = "ahead_of_schedule"
            recommendation = (
                f"Ahead by ~{abs(round(variance_sessions, 1))} sessions. "
                f"Utilize available buffer for hands-on project sessions, guest lectures, or advanced problem solving."
            )
        else:
            status = "on_track"
            recommendation = "Pacing is strictly optimal and adheres to course milestone projections."

        return {
            "status": status,
            "velocity_ratio": round(velocity_ratio, 3),
            "expected_progress_pct": round(expected_progress_ratio * 100, 1),
            "actual_progress_pct": round(actual_progress_ratio * 100, 1),
            "variance_sessions": round(variance_sessions, 1),
            "topic_deficit": round(topic_deficit, 1),
            "planned_velocity": round(planned_topics_per_session, 2),
            "actual_velocity": round(actual_topics_per_session, 2),
            "required_velocity_to_finish": round(required_velocity, 2),
            "remaining_classes": remaining_classes,
            "remaining_topics": remaining_topics,
            "recommendation": recommendation
        }

pacing_model = CurriculumPacingModel()
