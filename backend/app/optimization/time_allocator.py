from sqlalchemy.orm import Session
from app.models.entities import Course, Topic
from app.database.connection import refresh_dashboard_snapshot
from app.optimization.scoring import scoring_engine
from app.schemas.schemas import CourseOptimizationResponse, TopicAllocationOut

class TimeAllocator:
    """
    Constrained optimization engine for finite teaching time.
    Strictly satisfies:
    Total Instructional Time + Revision Budget + Assessment Budget <= Available Teaching Time
    """

    def optimize_course_time(self, db: Session, course_id: str, persist: bool = True) -> CourseOptimizationResponse:
        """
        persist=True writes the new allocation. The course row is locked FOR UPDATE first,
        so two concurrent re-optimizations of one course run one after the other instead
        of interleaving their topic updates. persist=False (GET) computes without writing.
        """
        query = db.query(Course).filter(Course.id == course_id)
        if persist:
            query = query.with_for_update()
        course = query.first()
        if not course:
            raise ValueError(f"Course {course_id} not found")

        total_avail_min = course.total_available_minutes
        period_duration = course.period_duration

        # Dedicated reservation for revision and assessment checkpoints
        # e.g., ~10% for revision buffer, ~7.5% for midterms/quizzes
        revision_budget = int(total_avail_min * 0.10)
        assessment_budget = int(total_avail_min * 0.08)
        
        # Round revision and assessment budgets to discrete periods
        revision_budget = (revision_budget // period_duration) * period_duration
        assessment_budget = (assessment_budget // period_duration) * period_duration
        
        instructional_budget = total_avail_min - revision_budget - assessment_budget

        # Calculate topic priority scores
        topic_scores = scoring_engine.calculate_topic_scores(db, course_id)
        if not topic_scores:
            return CourseOptimizationResponse(
                course_id=course_id,
                total_available_minutes=total_avail_min,
                total_allocated_minutes=0,
                revision_budget_minutes=revision_budget,
                assessment_budget_minutes=assessment_budget,
                unallocated_buffer_minutes=total_avail_min,
                time_pressure_status="healthy",
                topic_allocations=[],
                formula_explanation={}
            )

        from app.optimization.ilp_solver import ilp_solver

        allocated_allocations = []
        allocated_sum = 0
        solver_used = "greedy period-by-period sharing (used when the exact solver is unavailable)"

        # 1. Attempt exact MILP formulation with SciPy
        milp_periods = ilp_solver.solve_period_allocation(topic_scores, instructional_budget, period_duration)

        if milp_periods is not None and len(milp_periods) == len(topic_scores):
            solver_used = "exact integer optimisation (SciPy MILP)"
            for idx, item in enumerate(topic_scores):
                topic: Topic = item["topic"]
                periods_count = milp_periods[idx]
                snapped_minutes = periods_count * period_duration
                allocated_allocations.append({
                    "topic": topic,
                    "allocated_minutes": snapped_minutes,
                    "periods_count": periods_count,
                    "priority_score": item["priority_score"],
                    "reason_codes": item["reason_codes"],
                    "explanation": item["explanation"],
                    "key_concepts": item["key_concepts"]
                })
                allocated_sum += snapped_minutes
        else:
            # 2. Discrete weighted demand fallback
            total_demand = sum(
                t["topic"].estimated_minutes * (0.6 + 0.8 * t["priority_score"]) 
                for t in topic_scores
            )
            for item in topic_scores:
                topic: Topic = item["topic"]
                demand = topic.estimated_minutes * (0.6 + 0.8 * item["priority_score"])
                ratio = demand / total_demand if total_demand > 0 else (1.0 / len(topic_scores))
                raw_allocated = instructional_budget * ratio
                periods_count = max(1, round(raw_allocated / period_duration))
                snapped_minutes = periods_count * period_duration
                allocated_allocations.append({
                    "topic": topic,
                    "allocated_minutes": snapped_minutes,
                    "periods_count": periods_count,
                    "priority_score": item["priority_score"],
                    "reason_codes": item["reason_codes"],
                    "explanation": item["explanation"],
                    "key_concepts": item["key_concepts"]
                })
                allocated_sum += snapped_minutes

            while allocated_sum > instructional_budget and any(a["periods_count"] > 1 for a in allocated_allocations):
                reducible = [a for a in allocated_allocations if a["periods_count"] > 1]
                reducible.sort(key=lambda x: x["priority_score"])
                target = reducible[0]
                target["periods_count"] -= 1
                target["allocated_minutes"] -= period_duration
                allocated_sum -= period_duration

        # Save allocated minutes and priority scores back to PostgreSQL in transaction
        if persist:
            for item in allocated_allocations:
                t = item["topic"]
                t.allocated_minutes = item["allocated_minutes"]
                t.priority_score = item["priority_score"]
            db.commit()
            refresh_dashboard_snapshot(db)
        else:
            db.rollback()  # release the read snapshot; nothing was written

        unallocated_buffer = total_avail_min - (allocated_sum + revision_budget + assessment_budget)

        # Time pressure status
        total_used = allocated_sum + revision_budget + assessment_budget
        if total_used > total_avail_min:
            pressure = "high_pressure"
        elif total_used >= 0.95 * total_avail_min:
            pressure = "balanced"
        else:
            pressure = "healthy"

        # Format output
        output_topics = []
        for a in allocated_allocations:
            t = a["topic"]
            output_topics.append(TopicAllocationOut(
                topic_id=t.id,
                unit_number=t.unit.unit_number if t.unit else 1,
                topic_title=t.title,
                estimated_minutes=t.estimated_minutes,
                allocated_minutes=a["allocated_minutes"],
                priority_score=a["priority_score"],
                recommended_periods=float(a["periods_count"]),
                reason_codes=a["reason_codes"],
                explanation=a["explanation"],
                key_concepts=a["key_concepts"]
            ))

        return CourseOptimizationResponse(
            course_id=course_id,
            total_available_minutes=total_avail_min,
            total_allocated_minutes=allocated_sum,
            revision_budget_minutes=revision_budget,
            assessment_budget_minutes=assessment_budget,
            unallocated_buffer_minutes=max(0, unallocated_buffer),
            time_pressure_status=pressure,
            topic_allocations=output_topics,
            formula_explanation={
                "model": solver_used,
                "weights": scoring_engine.weights,
                "invariant": f"Allocated ({allocated_sum}m) + Revision ({revision_budget}m) + Assessment ({assessment_budget}m) <= Total ({total_avail_min}m)",
                "period_duration_minutes": period_duration
            }
        )

time_allocator = TimeAllocator()
