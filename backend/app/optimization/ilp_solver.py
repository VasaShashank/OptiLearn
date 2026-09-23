"""
Exact Mixed-Integer Linear Programming (MILP) Solver for Curriculum Time Allocation
Formulated using scipy.optimize.milp adhering to strict pedagogical invariants.
"""
from typing import List, Dict, Any, Optional
import numpy as np
from scipy.optimize import milp, LinearConstraint, Bounds

class CurriculumILPSolver:
    """
    Solves discrete period allocation:
    Maximize Mastery: max sum(priority_i * x_i)
    Subject to:
      sum(x_i * period_duration) <= instructional_budget
      x_i >= 1 (each topic receives at least 1 discrete period)
      x_i integer
    """

    def solve_period_allocation(
        self,
        topic_items: List[Dict[str, Any]],
        instructional_budget: int,
        period_duration: int = 55
    ) -> Optional[List[int]]:
        """
        Returns list of integer period counts [x_1, x_2, ..., x_n] for each topic.
        """
        n = len(topic_items)
        if n == 0 or instructional_budget < n * period_duration:
            return None

        max_periods = instructional_budget // period_duration
        if max_periods < n:
            return None

        # Objective coefficients: minimize negative utility
        # utility_i = priority_score_i * (base_estimated_minutes / period_duration)
        c = []
        for item in topic_items:
            priority = max(0.1, item["priority_score"])
            est_periods = max(1.0, item["topic"].estimated_minutes / period_duration)
            utility = priority * est_periods
            c.append(-float(utility))

        c = np.array(c)

        # Constraint 1: sum(x_i) <= max_periods
        # 1 * x_1 + 1 * x_2 + ... + 1 * x_n <= max_periods
        A_sum = np.ones((1, n))
        b_u_sum = np.array([max_periods])
        b_l_sum = np.array([n]) # At least n periods total (1 per topic)

        constraints = LinearConstraint(A_sum, b_l_sum, b_u_sum)

        # Bounds: 1 <= x_i <= max(1, round(item.estimated_minutes / period_duration * 3))
        lb = np.ones(n)
        ub = []
        for item in topic_items:
            est_p = max(1, round(item["topic"].estimated_minutes / period_duration))
            # Bound upper limit so one topic doesn't swallow everything
            ub.append(max(2, est_p * 3))
        ub = np.array(ub)

        bounds = Bounds(lb, ub)

        # Integrality: 1 indicates integer variable
        integrality = np.ones(n)

        try:
            res = milp(c=c, constraints=constraints, bounds=bounds, integrality=integrality)
            if res.success and res.x is not None:
                periods = [int(round(val)) for val in res.x]
                # Invariant check: sum(periods) * period_duration <= instructional_budget
                if sum(periods) * period_duration <= instructional_budget and all(p >= 1 for p in periods):
                    return periods
        except Exception:
            pass

        return None

ilp_solver = CurriculumILPSolver()
