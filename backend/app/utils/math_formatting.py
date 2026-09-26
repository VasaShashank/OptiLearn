"""
Math & Formatting Utilities for Optimization and Analytics
"""
import math
from typing import List, Union

def snap_to_periods(raw_minutes: float, period_duration: int = 60, min_periods: int = 1) -> int:
    """
    Snap raw minutes to discrete multiples of class period duration.
    """
    if period_duration <= 0:
        return int(raw_minutes)
    periods = max(min_periods, round(raw_minutes / period_duration))
    return int(periods * period_duration)

def compute_variance(values: List[Union[int, float]]) -> float:
    """
    Compute population variance of a list of numeric values.
    """
    if not values or len(values) < 2:
        return 0.0
    mean = sum(values) / len(values)
    return sum((x - mean) ** 2 for x in values) / len(values)

def compute_standard_deviation(values: List[Union[int, float]]) -> float:
    """
    Compute population standard deviation.
    """
    return math.sqrt(compute_variance(values))

def format_duration_readable(minutes: int) -> str:
    """
    Format minutes into 'X hrs Y mins' or 'Y mins'.
    """
    hrs = minutes // 60
    mins = minutes % 60
    if hrs > 0:
        return f"{hrs}h {mins}m" if mins > 0 else f"{hrs}h"
    return f"{mins}m"
