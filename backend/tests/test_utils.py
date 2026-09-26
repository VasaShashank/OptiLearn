from datetime import datetime, date
from app.utils.roman_numerals import roman_to_int, int_to_roman, extract_unit_number
from app.utils.graph_utils import detect_cycles, topological_sort, find_bottleneck_nodes
from app.utils.datetime_helpers import calculate_class_dates, parse_timetable_slots
from app.utils.math_formatting import snap_to_periods, compute_variance

def test_roman_numerals():
    assert roman_to_int("I") == 1
    assert roman_to_int("IV") == 4
    assert roman_to_int("IX") == 9
    assert roman_to_int("XLII") == 42
    assert int_to_roman(4) == "IV"
    assert int_to_roman(14) == "XIV"
    assert extract_unit_number("Unit IV: Relational Calculus") == 4
    assert extract_unit_number("Module 3 - Normalization") == 3

def test_graph_utils():
    # A DAG: A -> B -> C
    dag = {"A": ["B"], "B": ["C"], "C": []}
    assert detect_cycles(dag) == []
    sorted_order = topological_sort(dag)
    assert sorted_order.index("A") < sorted_order.index("B") < sorted_order.index("C")

    # A Cycle: A -> B -> A
    cyclic = {"A": ["B"], "B": ["A"]}
    cycles = detect_cycles(cyclic)
    assert len(cycles) > 0
    assert topological_sort(cyclic) is None

    # Bottleneck detection
    bn = find_bottleneck_nodes({"A": ["B", "C", "D"]}, threshold_descendants=2)
    assert len(bn) > 0
    assert bn[0]["node_id"] == "A"

def test_datetime_and_math():
    slots = parse_timetable_slots("MWF")
    assert slots == [0, 2, 4]

    dates = calculate_class_dates(
        start_date=datetime(2026, 9, 1),
        total_classes=5,
        meeting_days=[0, 2, 4],
        holidays={date(2026, 9, 2)} # Skip Wed
    )
    assert len(dates) == 5
    # Wednesday 2026-09-02 must be skipped
    assert all(d.date() != date(2026, 9, 2) for d in dates)

    assert snap_to_periods(50, period_duration=55) == 55
    assert snap_to_periods(112, period_duration=55) == 110
    assert compute_variance([10, 10, 10]) == 0.0
