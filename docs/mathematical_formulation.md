# 📐 Mathematical Formulation of Curriculum Optimization

OptiTeach formulates curriculum time distribution as a **Mixed-Integer Linear Programming (MILP)** optimization problem satisfying strict academic invariants.

---

## 1. Parameters & Decision Variables

### Sets and Indices
- $i \in \{1, 2, \dots, N\}$: Set of syllabus topics.
- $P$: Duration of a single class period in minutes (e.g., $P = 55$).
- $T_{\text{avail}}$: Total available semester instructional time in minutes ($T_{\text{avail}} = \text{total\_classes} \times P$).

### Constants & Weights
- $d_i \in [1, 5]$: Difficulty rating of topic $i$.
- $w_i \in [1, 5]$: Importance / Exam weightage of topic $i$.
- $b_i \in \mathbb{N}$: Number of downstream prerequisite dependencies.
- $T_{\min}$: Minimum required threshold duration ($T_{\min} = P$, i.e., at least 1 discrete period per topic).
- $B_{\text{rev}}$: Reserved revision buffer budget ($10\%$ of $T_{\text{avail}}$, rounded to nearest period).
- $B_{\text{asmt}}$: Reserved assessment checkpoint budget ($8\%$ of $T_{\text{avail}}$, rounded to nearest period).

### Decision Variables
- $x_i \in \mathbb{Z}^+$: Number of discrete class periods allocated to topic $i$.
- $t_i = x_i \cdot P$: Allocated minutes for topic $i$.

---

## 2. Mathematical Objective Function

Maximize expected cumulative curriculum mastery across the semester:

$$\max \sum_{i=1}^{N} \left( \alpha \cdot w_i + \beta \cdot d_i + \gamma \cdot \frac{b_i}{\max(1, \max_j b_j)} \right) \cdot x_i$$

Where weights are normalized: $\alpha = 0.45$, $\beta = 0.35$, $\gamma = 0.20$.

---

## 3. Strict Invariant Constraints

### Invariant 1: Finite Semester Budget Invariant
$$\sum_{i=1}^{N} x_i \cdot P + B_{\text{rev}} + B_{\text{asmt}} \le T_{\text{avail}}$$

### Invariant 2: Discrete Period Integrality & Minimum Cognitive Threshold
$$x_i \ge 1, \quad x_i \in \mathbb{Z}^+ \quad \forall i \in \{1, \dots, N\}$$

### Invariant 3: In-Class Session Phase Sum Invariant
For every class session $s$, with phases $\Phi = \{\text{Warmup}, \text{Instruction}, \text{Practice}, \text{Assessment}, \text{Wrapup}\}$:
$$\sum_{\phi \in \Phi} \text{Duration}(\phi) = P$$

---

## 4. Prerequisite Topological Ordering Constraint

If topic $u$ is a prerequisite of topic $v$ ($u \prec v$):
$$\text{ScheduledStartSession}(u) < \text{ScheduledStartSession}(v)$$
Ensuring no student is taught dependent concepts without prerequisite scaffolding.
