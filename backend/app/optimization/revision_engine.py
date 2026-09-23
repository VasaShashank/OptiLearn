from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session
from app.models.entities import Concept, Performance, Topic, Course

class RevisionEngine:
    """
    Intelligent revision decision engine.
    Inspects prerequisite dependencies in the curriculum DAG and evaluates
    historical assessment performance to detect learning bottlenecks.
    """

    def evaluate_revision_need(
        self, 
        db: Session, 
        topic: Topic, 
        threshold_score: float = 60.0
    ) -> Dict[str, Any]:
        """
        Determines whether the upcoming topic requires prerequisite revision
        based on prior assessment scores of its foundational concepts.
        """
        concepts = topic.concepts
        all_prereqs: List[Concept] = []
        for c in concepts:
            for p in c.prerequisites:
                if p not in all_prereqs:
                    all_prereqs.append(p)

        if not all_prereqs:
            return {
                "revision_needed": False,
                "revision_minutes": 0,
                "revision_concept": None,
                "reason": "No strict prerequisite dependencies required for this introductory topic."
            }

        # Check performance for prerequisites
        weak_prereqs = []
        for p in all_prereqs:
            performances = db.query(Performance).filter(Performance.concept_id == p.id).all()
            if performances:
                avg_score = sum(perf.average_score for perf in performances) / len(performances)
                if avg_score < threshold_score:
                    weak_prereqs.append({
                        "name": p.name,
                        "avg_score": round(avg_score, 1),
                        "common_errors": performances[0].common_errors or "Conceptual ambiguity"
                    })

        if weak_prereqs:
            # Sort by lowest score
            weak_prereqs.sort(key=lambda x: x["avg_score"])
            primary_weak = weak_prereqs[0]
            return {
                "revision_needed": True,
                "revision_minutes": 10,
                "revision_concept": primary_weak["name"],
                "reason": (
                    f"Prerequisite mastery bottleneck detected: '{primary_weak['name']}' "
                    f"recorded an average cohort score of {primary_weak['avg_score']}% "
                    f"(below the {threshold_score}% target threshold). "
                    f"Identified issue: {primary_weak['common_errors']}."
                )
            }

        return {
            "revision_needed": False,
            "revision_minutes": 0,
            "revision_concept": None,
            "reason": "Prerequisite concept performance is robust (cohort average >= threshold)."
        }

revision_engine = RevisionEngine()
