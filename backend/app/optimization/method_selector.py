from typing import List, Tuple
from sqlalchemy.orm import Session
from app.models.entities import TeachingMethod, MethodEffectiveness

# Default rule-based fallback mappings
RULE_BASED_METHODS = {
    "conceptual": ["Lecture with diagrams", "Discussion"],
    "problem_solving": ["Worked examples", "Guided practice"],
    "practical": ["Live demonstration", "Hands-on lab"],
    "analytical": ["Case study", "Compare and contrast"],
    "procedural": ["Step-by-step walkthrough", "Independent exercise"],
    "revision": ["Recap and revision", "Short quiz"]
}

class MethodSelector:
    """
    Pedagogical method recommendation engine.
    Uses empirical historical effectiveness from the database when available,
    falling back to cognitive science rule-based mappings.
    """

    def select_methods(self, db: Session, concept_type: str, has_weak_prereq: bool = False) -> Tuple[List[str], float]:
        if has_weak_prereq:
            return (
                ["Recap and revision", "Worked examples", "Guided practice"],
                14.5 # Predicted historical gain %
            )

        # Query empirical effectiveness table in PostgreSQL
        records = (
            db.query(MethodEffectiveness, TeachingMethod)
            .join(TeachingMethod, MethodEffectiveness.method_id == TeachingMethod.id)
            .filter(MethodEffectiveness.concept_type == concept_type)
            .order_by(MethodEffectiveness.observed_gain.desc())
            .all()
        )

        if records:
            top_methods = [r[1].name for r in records[:2]]
            predicted_gain = records[0][0].observed_gain
            return top_methods, predicted_gain

        # Fallback to rules
        recommended = RULE_BASED_METHODS.get(concept_type, ["Lecture with diagrams", "Guided practice"])
        return recommended, 12.0

method_selector = MethodSelector()
