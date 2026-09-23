from typing import Dict, List, Tuple
from sqlalchemy.orm import Session
from app.models.entities import TeachingMethod, MethodEffectiveness

# Default rule-based fallback mappings
RULE_BASED_METHODS = {
    "conceptual": ["Lecture & Interactive Explanation", "Concept Mapping & Analogies"],
    "problem_solving": ["Worked Examples & Decomposition", "Guided Problem Practice"],
    "practical": ["Hands-on Live Demonstration", "Interactive Terminal/SQL Lab"],
    "analytical": ["Comparative Analysis", "Case Study Exploration"],
    "procedural": ["Step-by-Step Algorithm Walkthrough", "Independent Exercise"],
    "revision": ["Prerequisite Recap & Common Error Dissection", "Rapid Diagnostic Quiz"]
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
                ["Prerequisite Recap & Common Error Dissection", "Worked Examples & Decomposition", "Guided Problem Practice"],
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
        recommended = RULE_BASED_METHODS.get(concept_type, ["Interactive Explanation", "Guided Practice"])
        return recommended, 12.0

method_selector = MethodSelector()
