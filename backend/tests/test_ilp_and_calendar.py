from datetime import datetime
from unittest.mock import MagicMock
from app.optimization.ilp_solver import ilp_solver
from app.optimization.calendar_engine import calendar_engine
from app.analytics.drift_detector import drift_detector
from app.analytics.pacing_model import pacing_model

def test_ilp_solver():
    # Mock topics
    t1 = MagicMock()
    t1.estimated_minutes = 110
    t2 = MagicMock()
    t2.estimated_minutes = 55
    t3 = MagicMock()
    t3.estimated_minutes = 165

    topic_items = [
        {"topic": t1, "priority_score": 0.8},
        {"topic": t2, "priority_score": 0.3},
        {"topic": t3, "priority_score": 0.9}
    ]

    instructional_budget = 55 * 8 # 8 periods available for 3 topics
    periods = ilp_solver.solve_period_allocation(topic_items, instructional_budget, period_duration=55)

    assert periods is not None
    assert len(periods) == 3
    assert all(p >= 1 for p in periods)
    assert sum(periods) * 55 <= instructional_budget
    # Higher priority topic t3 should get >= periods of t2
    assert periods[2] >= periods[1]

def test_calendar_engine():
    schedule = calendar_engine.generate_course_schedule(
        start_date=datetime(2026, 9, 1),
        total_classes=10,
        slot_str="MWF"
    )
    assert len(schedule) == 10
    assert schedule[0]["session_number"] == 1

    rescheduled = calendar_engine.reschedule_after_disruption(
        current_schedule=schedule,
        cancelled_session_number=3,
        reason="Severe Weather Cancellation"
    )
    assert rescheduled["cancelled_session"] == 3
    assert rescheduled["compression_factor"] <= 1.0

def test_drift_and_pacing():
    # Drift test
    perfs = [
        {"score": 85.0, "recorded_at": datetime(2026, 9, 1)},
        {"score": 75.0, "recorded_at": datetime(2026, 9, 10)},
        {"score": 50.0, "recorded_at": datetime(2026, 9, 20)}
    ]
    drift_res = drift_detector.analyze_concept_drift(perfs)
    assert drift_res["drift_detected"] is True
    assert drift_res["retention_status"] in ["critical_decay", "declining_drift"]

    # Pacing velocity test
    pacing_res = pacing_model.calculate_pacing_velocity(
        total_classes=40,
        completed_sessions=20,
        total_topics=30,
        covered_topics=10 # Behind schedule (expected 15)
    )
    assert pacing_res["status"] in ["critically_behind", "moderately_behind"]
    assert pacing_res["variance_sessions"] > 0
