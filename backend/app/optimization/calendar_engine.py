"""
Academic Calendar & Real-World Disruption Rescheduling Engine
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, date, timedelta
from app.utils.datetime_helpers import calculate_class_dates, parse_timetable_slots

class AcademicCalendarEngine:
    """
    Manages semester schedules, institutional holiday blackouts, exam periods,
    and handles dynamic class rescheduling after disruptions (cancellations, snow days, overruns).
    """

    def generate_course_schedule(
        self,
        start_date: datetime,
        total_classes: int,
        slot_str: str = "MWF",
        holidays: Optional[List[date]] = None,
        blackout_periods: Optional[List[Dict[str, date]]] = None
    ) -> List[Dict[str, Any]]:
        """
        Builds concrete class calendar dates mapped to class sessions.
        """
        meeting_days = parse_timetable_slots(slot_str)
        holiday_set = set(holidays or [])

        # Add dates from blackout periods (e.g. Midterm Week)
        if blackout_periods:
            for b in blackout_periods:
                curr = b["start"]
                while curr <= b["end"]:
                    holiday_set.add(curr)
                    curr += timedelta(days=1)

        dates = calculate_class_dates(
            start_date=start_date,
            total_classes=total_classes,
            meeting_days=meeting_days,
            holidays=holiday_set
        )

        schedule = []
        for i, dt in enumerate(dates):
            schedule.append({
                "session_number": i + 1,
                "scheduled_date": dt,
                "day_of_week": dt.strftime("%A"),
                "status": "scheduled"
            })
        return schedule

    def reschedule_after_disruption(
        self,
        current_schedule: List[Dict[str, Any]],
        cancelled_session_number: int,
        reason: str = "Class cancelled due to university holiday"
    ) -> Dict[str, Any]:
        """
        Dynamically shifts the remaining curriculum forward when a class is lost or interrupted.
        Calculates compressed catch-up parameters without violating prerequisite ordering.
        """
        rescheduled = []
        for session in current_schedule:
            s_num = session["session_number"]
            if s_num < cancelled_session_number:
                rescheduled.append({**session, "status": "completed"})
            elif s_num == cancelled_session_number:
                rescheduled.append({
                    **session,
                    "status": "cancelled",
                    "disruption_reason": reason
                })
            else:
                # Shift topic from session N-1 to session N
                rescheduled.append({
                    **session,
                    "status": "rescheduled",
                    "effective_session": s_num - 1
                })

        remaining_count = max(0, len(current_schedule) - cancelled_session_number)
        compression_ratio = ((remaining_count - 1) / remaining_count) if remaining_count > 1 else 1.0

        return {
            "cancelled_session": cancelled_session_number,
            "reason": reason,
            "remaining_sessions": remaining_count,
            "compression_factor": round(compression_ratio, 3),
            "recommendation": (
                f"Curriculum shifted by 1 class period. Compress introductory practice by ~{round((1 - compression_ratio)*100, 1)}% "
                f"across the next {min(3, remaining_count)} periods to regain schedule alignment."
            ),
            "updated_schedule": rescheduled
        }

calendar_engine = AcademicCalendarEngine()
