"""
Semantic Prerequisite Discovery & Cross-Concept Graph Linker
"""
import re
from typing import List, Dict, Set, Tuple
from app.utils.graph_utils import detect_cycles, topological_sort

# Common prerequisite semantic mapping keywords
PREREQUISITE_INDICATORS = [
    (r"\b(relational\s+algebra|relational\s+calculus)\b", ["Basic Set Theory", "Cartesian Product"]),
    (r"\b(sql\s+(?:joins|group\s+by|having))\b", ["Relational Algebra", "Select-Project Operators"]),
    (r"\b(b\+?\s*trees?|indexing|hash\s+index)\b", ["File Organization", "Binary Search Trees"]),
    (r"\b(bcnf|3nf|functional\s+dependencies)\b", ["Candidate Keys", "Superkeys", "Schema Decomposition"]),
    (r"\b(concurrency|two-phase\s+locking|serializability)\b", ["ACID Properties", "Transactions", "Conflict Equivalence"]),
    (r"\b(query\s+optimization|heurisic\s+tree)\b", ["Relational Algebra Equivalence", "Cost Models"]),
]

class PrerequisiteGraphEngine:
    """
    Infers explicit and latent prerequisite relationships between concepts,
    verifying strict DAG properties.
    """

    def infer_prerequisites(self, concept_names: List[str]) -> List[Dict[str, str]]:
        """
        Analyze concept titles to infer logical prerequisite links.
        Returns list of {"source": prereq_concept, "target": dependent_concept}.
        """
        links = []
        name_lower_map = {c.lower(): c for c in concept_names}

        for concept in concept_names:
            c_lower = concept.lower()
            for pattern, implied_prereqs in PREREQUISITE_INDICATORS:
                if re.search(pattern, c_lower):
                    for prereq in implied_prereqs:
                        # If the prerequisite concept is present in the course
                        for existing_lower, orig_name in name_lower_map.items():
                            if prereq.lower() in existing_lower and orig_name != concept:
                                links.append({"source": orig_name, "target": concept})

        return links

    def validate_dag(self, edges: List[Dict[str, str]]) -> Tuple[bool, List[List[str]]]:
        """
        Validate that the proposed prerequisite edges do not introduce cycles.
        Returns (is_valid_dag, list_of_cycles).
        """
        adj = {}
        for edge in edges:
            src = edge["source"]
            tgt = edge["target"]
            if src not in adj:
                adj[src] = []
            adj[src].append(tgt)

        cycles = detect_cycles(adj)
        return (len(cycles) == 0, cycles)

prerequisite_graph_engine = PrerequisiteGraphEngine()
