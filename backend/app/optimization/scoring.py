import networkx as nx
from typing import Dict, List, Tuple, Any
from sqlalchemy.orm import Session
from app.models.entities import Topic, Concept, Performance, CourseOutcome, Course

# Default weights for priority scoring model
DEFAULT_WEIGHTS = {
    "importance": 0.25,
    "difficulty": 0.20,
    "prerequisite_downstream": 0.25,
    "assessment_relevance": 0.15,
    "weakness_penalty": 0.15
}

class ScoringEngine:
    """
    Transparent, explainable mathematical scoring engine.
    Calculates priority scores for topics and concepts based on pedagogical metrics.
    """

    def __init__(self, weights: Dict[str, float] = None):
        self.weights = weights or DEFAULT_WEIGHTS

    def build_concept_dag(self, db: Session, course_id: str) -> nx.DiGraph:
        """Construct directed acyclic graph of concepts for downstream impact calculation"""
        dag = nx.DiGraph()
        
        concepts = (
            db.query(Concept)
            .join(Topic, Concept.topic_id == Topic.id)
            .join(Topic.unit)
            .filter(Topic.unit.has(course_id=course_id))
            .all()
        )
        
        for c in concepts:
            dag.add_node(c.id, name=c.name, topic_id=c.topic_id, difficulty=c.difficulty, importance=c.importance)
            for prereq in c.prerequisites:
                # Directed edge: prerequisite -> dependent concept
                dag.add_edge(prereq.id, c.id)

        return dag

    def calculate_topic_scores(self, db: Session, course_id: str) -> List[Dict[str, Any]]:
        dag = self.build_concept_dag(db, course_id)
        
        topics = (
            db.query(Topic)
            .join(Topic.unit)
            .filter(Topic.unit.has(course_id=course_id))
            .order_by(Topic.unit_id, Topic.order_index)
            .all()
        )

        results = []
        for topic in topics:
            concept_scores = []
            reason_codes = set()
            key_concept_names = []
            
            for c in topic.concepts:
                key_concept_names.append(c.name)
                # 1. Downstream dependent count (bottleneck factor)
                downstream_count = len(nx.descendants(dag, c.id)) if c.id in dag else 0
                if downstream_count >= 2:
                    reason_codes.add(f"PREREQUISITE_FOR_{downstream_count}_CONCEPTS")

                # 2. Historical performance & weakness
                performances = db.query(Performance).filter(Performance.concept_id == c.id).all()
                avg_score = 75.0 # default baseline
                weakness_factor = 0.0
                if performances:
                    scores = [p.average_score for p in performances]
                    avg_score = sum(scores) / len(scores)
                    if avg_score < 60.0:
                        weakness_factor = (60.0 - avg_score) / 60.0 # 0.0 to 1.0
                        reason_codes.add("WEAK_RECENT_PERFORMANCE")

                # 3. Assessment relevance
                assess_relevance = 0.5
                if c.questions:
                    assess_relevance = min(1.0, 0.4 + (len(c.questions) * 0.2))
                    reason_codes.add("HIGH_ASSESSMENT_RELEVANCE")

                if c.difficulty >= 4:
                    reason_codes.add("HIGH_CONCEPTUAL_DIFFICULTY")

                # Normalized component factors (0 to 1)
                norm_imp = c.importance / 5.0
                norm_diff = c.difficulty / 5.0
                norm_down = min(1.0, downstream_count / 4.0)
                norm_assess = assess_relevance
                norm_weak = weakness_factor

                score = (
                    self.weights["importance"] * norm_imp +
                    self.weights["difficulty"] * norm_diff +
                    self.weights["prerequisite_downstream"] * norm_down +
                    self.weights["assessment_relevance"] * norm_assess +
                    self.weights["weakness_penalty"] * norm_weak
                )
                concept_scores.append(score)

            topic_priority = sum(concept_scores) / len(concept_scores) if concept_scores else 0.5
            
            # Generate human-readable explanation
            reasons_list = list(reason_codes)
            explanation_parts = []
            if "WEAK_RECENT_PERFORMANCE" in reasons_list:
                explanation_parts.append("cohort demonstrated below-threshold mastery on prior assessments")
            if any("PREREQUISITE_FOR" in r for r in reasons_list):
                explanation_parts.append("serves as critical prerequisite for multiple downstream advanced topics")
            if "HIGH_ASSESSMENT_RELEVANCE" in reasons_list:
                explanation_parts.append("carries high weight in scheduled examinations")
            if "HIGH_CONCEPTUAL_DIFFICULTY" in reasons_list:
                explanation_parts.append("presents high cognitive difficulty requiring dedicated worked examples")

            if not explanation_parts:
                explanation_parts.append("foundational curriculum progression requirements")

            explanation_text = f"High priority allocated because {', and '.join(explanation_parts)}."

            results.append({
                "topic": topic,
                "priority_score": round(topic_priority, 3),
                "reason_codes": reasons_list,
                "explanation": explanation_text,
                "key_concepts": key_concept_names
            })

        return results

scoring_engine = ScoringEngine()
