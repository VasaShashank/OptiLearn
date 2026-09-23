"""
Student Performance Drift Detector & Concept Decay Analytics
"""
from typing import List, Dict, Any, Optional
from datetime import datetime

class PerformanceDriftDetector:
    """
    Analyzes historical assessment results over time to identify negative performance trends
    (drift) and concept retention degradation.
    """

    def analyze_concept_drift(self, performances: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Takes chronological performances for a concept:
        Each entry has {"score": float, "recorded_at": datetime, "sample_size": int}
        """
        if not performances:
            return {
                "drift_detected": False,
                "trend_slope": 0.0,
                "current_score": 0.0,
                "retention_status": "insufficient_data",
                "recommended_action": "gather_more_assessments"
            }

        sorted_perfs = sorted(performances, key=lambda x: x.get("recorded_at") or datetime.min)
        scores = [p["score"] for p in sorted_perfs]

        if len(scores) == 1:
            score = scores[0]
            status = "critical" if score < 60.0 else "satisfactory"
            return {
                "drift_detected": False,
                "trend_slope": 0.0,
                "current_score": score,
                "retention_status": status,
                "recommended_action": "monitor" if score >= 60.0 else "schedule_formative_quiz"
            }

        # Calculate linear trend slope: slope = sum((x - x_bar)(y - y_bar)) / sum((x - x_bar)^2)
        n = len(scores)
        x_vals = list(range(n))
        x_bar = sum(x_vals) / n
        y_bar = sum(scores) / n

        num = sum((x_vals[i] - x_bar) * (scores[i] - y_bar) for i in range(n))
        denom = sum((x_vals[i] - x_bar) ** 2 for i in range(n))
        slope = (num / denom) if denom != 0 else 0.0

        current_score = scores[-1]
        baseline_score = scores[0]
        drift_delta = current_score - baseline_score

        # Significant downward trend: slope < -2.0% per assessment or drop > 10%
        drift_detected = slope < -2.0 or drift_delta < -10.0

        if current_score < 50.0:
            retention_status = "critical_decay"
            action = "urgent_revision_injection"
        elif drift_detected:
            retention_status = "declining_drift"
            action = "inject_warmup_recap"
        elif current_score >= 80.0:
            retention_status = "mastered"
            action = "maintain_pacing"
        else:
            retention_status = "stable"
            action = "continue_normal_sequence"

        return {
            "drift_detected": drift_detected,
            "trend_slope": round(slope, 3),
            "baseline_score": round(baseline_score, 1),
            "current_score": round(current_score, 1),
            "drift_delta": round(drift_delta, 1),
            "retention_status": retention_status,
            "recommended_action": action,
            "assessments_tracked": n
        }

drift_detector = PerformanceDriftDetector()
