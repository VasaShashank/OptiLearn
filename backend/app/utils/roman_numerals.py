"""
Roman Numeral and Unit Number Utilities
"""
import re
from typing import Optional

ROMAN_VAL_MAP = {
    'I': 1, 'V': 5, 'X': 10, 'L': 50,
    'C': 100, 'D': 500, 'M': 1000
}

INT_ROMAN_MAP = [
    (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"),
    (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
    (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")
]

def roman_to_int(s: str) -> Optional[int]:
    """Convert a Roman numeral string to an integer. Returns None if invalid."""
    if not s or not isinstance(s, str):
        return None
    s = s.strip().upper()
    if not re.fullmatch(r"^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$", s):
        return None
    
    total = 0
    prev_val = 0
    for char in reversed(s):
        val = ROMAN_VAL_MAP.get(char, 0)
        if val >= prev_val:
            total += val
        else:
            total -= val
        prev_val = val
    return total if total > 0 else None

def int_to_roman(num: int) -> str:
    """Convert an integer (1 <= num <= 3999) to a Roman numeral."""
    if not isinstance(num, int) or num <= 0 or num > 3999:
        raise ValueError("Number must be between 1 and 3999")
    result = []
    for value, numeral in INT_ROMAN_MAP:
        while num >= value:
            result.append(numeral)
            num -= value
    return "".join(result)

def extract_unit_number(title: str, fallback_index: int = 1) -> int:
    """
    Extract a numeric unit number from a title string.
    Examples:
      - 'Unit IV: Relational Algebra' -> 4
      - 'Module 3 - Indexing' -> 3
      - 'CHAPTER IX' -> 9
    """
    if not title:
        return fallback_index

    # Check for Roman numeral pattern: Unit IV / Module III / Chapter I
    roman_match = re.search(r'\b(?:UNIT|MODULE|CHAPTER|PART)\s+([IVXLCDM]+)\b', title, re.IGNORECASE)
    if roman_match:
        val = roman_to_int(roman_match.group(1))
        if val is not None:
            return val

    # Check for Arabic number: Unit 4 / Module 3
    num_match = re.search(r'\b(?:UNIT|MODULE|CHAPTER|PART)\s*#?\s*(\d+)\b', title, re.IGNORECASE)
    if num_match:
        try:
            return int(num_match.group(1))
        except ValueError:
            pass

    return fallback_index
