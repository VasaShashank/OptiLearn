"""
Pedagogy Recommendation Advisor
"""
from typing import Dict, Any

class PedagogyAdvisor:
    """
    Recommends active learning, problem-solving, and lecture ratios based on concept attributes.
    """

    def recommend_method_mix(self, concept_type: str, difficulty: int, importance: int) -> Dict[str, Any]:
        """
        Calculates recommended teaching method distribution for a given concept profile.
        """
        if concept_type in ["procedural", "problem_solving"] or difficulty >= 4:
            return {
                "primary_method": "Worked Examples & Live Problem Solving",
                "recommended_ratios": {
                    "warmup_recap": 0.10,
                    "concept_framing": 0.25,
                    "guided_practice": 0.35,
                    "independent_exit_ticket": 0.20,
                    "wrap_up": 0.10
                },
                "pedagogical_rationale": "High-difficulty or procedural concepts achieve peak retention through guided algorithmic problem walkthroughs."
            }
        elif concept_type == "practical":
            return {
                "primary_method": "Interactive Lab Execution / Live Demo",
                "recommended_ratios": {
                    "warmup_recap": 0.10,
                    "concept_framing": 0.20,
                    "live_demonstration": 0.30,
                    "hands_on_practice": 0.30,
                    "wrap_up": 0.10
                },
                "pedagogical_rationale": "Practical database queries require immediate keyboard reinforcement and syntax troubleshooting."
            }
        else: # Conceptual / Theoretical
            return {
                "primary_method": "Interactive Socratic Lecture with Think-Pair-Share",
                "recommended_ratios": {
                    "warmup_recap": 0.10,
                    "socratic_instruction": 0.40,
                    "think_pair_share": 0.25,
                    "concept_check_quiz": 0.15,
                    "wrap_up": 0.10
                },
                "pedagogical_rationale": "Foundational theory benefits from Socratic inquiry and peer concept verification."
            }

pedagogy_advisor = PedagogyAdvisor()
