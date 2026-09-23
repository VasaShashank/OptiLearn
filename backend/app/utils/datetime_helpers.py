"""
Datetime & Academic Calendar Utilities
"""
from datetime import datetime, date, timedelta, time
from typing import List, Dict, Optional, Set

DAY_NAME_TO_INT = {
    "MON": 0, "MONDAY": 0,
    "TUE": 1, "TUESDAY": 1,
    "WED": 2, "WEDNESDAY": 2,
    "THU": 3, "THURSDAY": 3,
    "FRI": 4, "FRIDAY": 4,
    "SAT": 5, "SATURDAY": 5,
    "SUN": 6, "SUNDAY": 6
}

def parse_timetable_slots(slot_str: str) -> List[int]:
    """
    Parse strings like 'MWF', 'Mon/Wed/Fri', 'Tue/Thu', 'TTh' into day-of-week integers (0=Monday..6=Sunday).
    """
    slot_clean = slot_str.upper().strip()
    if slot_clean in ["MWF", "M/W/F", "MON/WED/FRI"]:
        return [0, 2, 4]
    if slot_clean in ["TTH", "T/TH", "TUE/THU", "TUESDAY/THURSDAY"]:
        return [1, 3]
    if slot_clean in ["MTWHF", "DAILY"]:
        return [0, 1, 2, 3, 4]
    
    days = []
    tokens = [t.strip() for t in slot_clean.replace(",", "/").replace("-", "/").split("/") if t.strip()]
    for token in tokens:
        if token in DAY_NAME_TO_INT:
            days.append(DAY_NAME_TO_INT[token])
    return sorted(list(set(days))) if days else [0, 2, 4]

def calculate_class_dates(
    start_date: datetime,
    total_classes: int,
    meeting_days: List[int] = None,
    holidays: Optional[Set[date]] = None,
    slot_time: time = time(10, 0)
) -> List[datetime]:
    """
    Generate sequential scheduled class datetimes adhering to meeting days and holiday exclusions.
    """
    if meeting_days is None:
        meeting_days = [0, 2, 4] # Default Mon/Wed/Fri
    if holidays is None:
        holidays = set()

    scheduled_dates = []
    curr_date = start_date.date() if isinstance(start_date, datetime) else start_date

    while len(scheduled_dates) < total_classes:
        if curr_date.weekday() in meeting_days and curr_date not in holidays:
            dt = datetime.combine(curr_date, slot_time)
            scheduled_dates.append(dt)
        curr_date += timedelta(days=1)

    return scheduled_dates
