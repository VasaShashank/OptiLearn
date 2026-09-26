"""
Exact Mixed-Integer Linear Programming (MILP) solver for curriculum time allocation,
formulated with scipy.optimize.milp.
"""
from typing import Any, Dict, List, Optional

import numpy as np
from scipy.optimize import Bounds, LinearConstraint, milp

# Value of a period that goes beyond a topic's estimated need, relative to its priority.
# Kept well below the value of a needed period so that extra time is only handed out
# once every topic's estimate is covered (diminishing returns).
EXTRA_PERIOD_WEIGHT = 0.5


class CurriculumILPSolver:
    """
    Discrete period allocation with diminishing returns.

    Each topic i needs e_i periods (its estimate). Its periods are split into
      y_i  needed periods,  1 <= y_i <= e_i,   worth (1 + p_i) each
      z_i  extra periods,   0 <= z_i <= e_i,   worth EXTRA_PERIOD_WEIGHT * p_i each
    and x_i = y_i + z_i. Maximize sum((1 + p_i) y_i + 0.5 p_i z_i)
    subject to sum(x_i) * P <= instructional_budget, y_i, z_i integer.

    Because a needed period is always worth more than an extra one, the optimum covers
    every topic's estimate before giving any topic extra time; when the budget is short,
    priority p_i decides which topics are cut. A purely linear objective (sum p_i x_i)
    instead pours all spare periods into the single highest-priority topic.
    """

    def solve_period_allocation(
        self,
        topic_items: List[Dict[str, Any]],
        instructional_budget: int,
        period_duration: int = 55,
    ) -> Optional[List[int]]:
        """Returns integer period counts [x_1, ..., x_n], or None if infeasible."""
        n = len(topic_items)
        max_periods = instructional_budget // period_duration
        if n == 0 or max_periods < n:
            return None

        priority = np.array([max(0.05, float(item["priority_score"])) for item in topic_items])
        need = np.array([max(1, round(item["topic"].estimated_minutes / period_duration)) for item in topic_items])

        # Variables: [y_1..y_n, z_1..z_n]; milp minimizes, so negate the value
        c = -np.concatenate([1.0 + priority, EXTRA_PERIOD_WEIGHT * priority])
        total = LinearConstraint(np.ones((1, 2 * n)), lb=n, ub=max_periods)
        bounds = Bounds(np.concatenate([np.ones(n), np.zeros(n)]), np.concatenate([need, need]).astype(float))

        try:
            res = milp(c=c, constraints=total, bounds=bounds, integrality=np.ones(2 * n))
        except Exception:
            return None
        if not res.success or res.x is None:
            return None

        values = np.rint(res.x).astype(int)
        periods = [int(values[i] + values[n + i]) for i in range(n)]
        if sum(periods) * period_duration <= instructional_budget and all(p >= 1 for p in periods):
            return periods
        return None


ilp_solver = CurriculumILPSolver()
