"""
Analytics Package
"""
from app.analytics.drift_detector import drift_detector, PerformanceDriftDetector
from app.analytics.pacing_model import pacing_model, CurriculumPacingModel

__all__ = [
    "drift_detector",
    "PerformanceDriftDetector",
    "pacing_model",
    "CurriculumPacingModel"
]
