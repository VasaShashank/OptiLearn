import time
from typing import Dict, List, Any
from sqlalchemy import text, inspect
from sqlalchemy.orm import Session
from app.database.connection import db_engine, get_db_info
from app.schemas.schemas import TableSchemaInfo, TableColumnInfo, QueryDemoResult

# 10 Academic Demonstration SQL Queries
DEMO_QUERIES = [
    {
        "id": "q1_topics_remaining",
        "title": "1. Topics Remaining in Curriculum",
        "category": "Curriculum Status",
        "purpose": "Retrieves all uncompleted topics ordered by unit and curricular sequence.",
        "sql_features": ["INNER JOIN", "Filtering"],
        "sql": """
        SELECT u.unit_number, u.title AS unit_title, t.title AS topic_title, 
               t.estimated_minutes, t.allocated_minutes, t.priority_score, t.status
        FROM topics t
        JOIN units u ON t.unit_id = u.id
        WHERE u.course_id = :course_id AND t.status != 'completed'
        ORDER BY u.unit_number, t.order_index;
        """
    },
    {
        "id": "q2_time_remaining",
        "title": "2. Contact Time Utilization & Remaining Budget",
        "category": "Time Accounting",
        "purpose": "Calculates total planned teaching minutes versus recorded taught minutes.",
        "sql_features": ["LEFT JOIN", "COALESCE", "GROUP BY"],
        "sql": """
        SELECT c.code, c.title, c.total_available_minutes,
               COALESCE(SUM(ts.actual_minutes), 0) AS actual_taught_minutes,
               (c.total_available_minutes - COALESCE(SUM(ts.actual_minutes), 0)) AS remaining_teaching_minutes
        FROM courses c
        LEFT JOIN class_sessions cs ON cs.course_id = c.id
        LEFT JOIN teaching_sessions ts ON ts.session_id = cs.id
        WHERE c.id = :course_id
        GROUP BY c.id, c.code, c.title, c.total_available_minutes;
        """
    },
    {
        "id": "q3_low_performance_concepts",
        "title": "3. Below-Threshold Concepts (Weakness Detection)",
        "category": "Learning Feedback",
        "purpose": "Identifies concepts where student cohort score falls below the 60% threshold.",
        "sql_features": ["GROUP BY", "HAVING", "Aggregates"],
        "sql": """
        SELECT c.name AS concept_name, c.difficulty, c.importance, 
               ROUND(AVG(p.average_score)::numeric, 1) AS avg_score,
               COUNT(p.id) AS assessment_count,
               MAX(p.common_errors) AS primary_misconception
        FROM concepts c
        JOIN performance p ON p.concept_id = c.id
        JOIN topics t ON c.topic_id = t.id
        JOIN units u ON t.unit_id = u.id
        WHERE u.course_id = :course_id
        GROUP BY c.id, c.name, c.difficulty, c.importance
        HAVING AVG(p.average_score) < 60.0
        ORDER BY avg_score ASC;
        """
    },
    {
        "id": "q4_upcoming_assessments",
        "title": "4. Scheduled Assessment Pipeline",
        "category": "Assessment Tracking",
        "purpose": "Lists pending tests, mapped questions count, and total maximum marks.",
        "sql_features": ["LEFT JOIN", "GROUP BY"],
        "sql": """
        SELECT a.id, a.title, a.assessment_type, a.max_marks, a.scheduled_date, a.status,
               COUNT(q.id) AS question_count
        FROM assessments a
        LEFT JOIN questions q ON q.assessment_id = a.id
        WHERE a.course_id = :course_id AND a.status = 'upcoming'
        GROUP BY a.id, a.title, a.assessment_type, a.max_marks, a.scheduled_date, a.status
        ORDER BY a.scheduled_date ASC;
        """
    },
    {
        "id": "q5_teaching_history",
        "title": "5. Completed Teaching Session Logs",
        "category": "Audit Trail",
        "purpose": "Displays recorded classroom delivery, pedagogical methods utilized, and duration.",
        "sql_features": ["Multi-table JOIN", "LEFT JOIN"],
        "sql": """
        SELECT cs.session_number, t.title AS topic_taught, tm.name AS method_utilized,
               ts.actual_minutes, ts.student_engagement_rating, ts.teacher_notes, ts.conducted_at
        FROM class_sessions cs
        JOIN teaching_sessions ts ON ts.session_id = cs.id
        LEFT JOIN topics t ON cs.current_topic_id = t.id
        LEFT JOIN teaching_methods tm ON ts.method_id = tm.id
        WHERE cs.course_id = :course_id
        ORDER BY cs.session_number DESC;
        """
    },
    {
        "id": "q6_course_progress",
        "title": "6. Course Progress & Session Ratio",
        "category": "Pacing & Delivery",
        "purpose": "Computes exact percentage of completed periods against total budgeted sessions.",
        "sql_features": ["Conditional aggregation (CASE)"],
        "sql": """
        SELECT c.total_classes,
               COUNT(CASE WHEN cs.status = 'completed' THEN 1 END) AS completed_periods,
               COUNT(CASE WHEN cs.status = 'scheduled' THEN 1 END) AS pending_periods,
               ROUND((COUNT(CASE WHEN cs.status = 'completed' THEN 1 END)::numeric / c.total_classes * 100), 1) AS progress_pct
        FROM courses c
        JOIN class_sessions cs ON cs.course_id = c.id
        WHERE c.id = :course_id
        GROUP BY c.id, c.total_classes;
        """
    },
    {
        "id": "q7_prerequisite_bottlenecks",
        "title": "7. Prerequisite Bottleneck Concepts",
        "category": "Curriculum Graph Analytics",
        "purpose": "Concepts that are a direct prerequisite for two or more other concepts, lowest cohort score first.",
        "sql_features": ["Self-referencing M:N", "HAVING"],
        "sql": """
        SELECT p_concept.name AS bottleneck_concept,
               COUNT(DISTINCT prereq.concept_id) AS downstream_dependent_concepts,
               ROUND(AVG(p.average_score)::numeric, 1) AS cohort_score
        FROM prerequisites prereq
        JOIN concepts p_concept ON prereq.prerequisite_id = p_concept.id
        LEFT JOIN performance p ON p.concept_id = p_concept.id
        JOIN topics t ON p_concept.topic_id = t.id
        JOIN units u ON t.unit_id = u.id
        WHERE u.course_id = :course_id
        GROUP BY p_concept.id, p_concept.name
        HAVING COUNT(DISTINCT prereq.concept_id) >= 2
        ORDER BY downstream_dependent_concepts DESC, cohort_score ASC;
        """
    },
    {
        "id": "q8_method_effectiveness",
        "title": "8. Empirical Teaching Method Gain Analysis",
        "category": "Pedagogical Intelligence",
        "purpose": "Evaluates observed student learning gains across teaching methodology styles.",
        "sql_features": ["JOIN", "ORDER BY"],
        "sql": """
        SELECT tm.name AS teaching_method, me.concept_type,
               me.baseline_score, me.post_score, me.observed_gain,
               me.sample_sessions_count
        FROM method_effectiveness me
        JOIN teaching_methods tm ON me.method_id = tm.id
        ORDER BY me.observed_gain DESC;
        """
    },
    {
        "id": "q9_planned_vs_actual_time",
        "title": "9. Topic-Level Planned vs Allocated Time",
        "category": "Optimization Verification",
        "purpose": "Compares syllabus estimated base time against optimizer-allocated instructional minutes.",
        "sql_features": ["Derived columns"],
        "sql": """
        SELECT t.title AS topic_title, t.estimated_minutes AS syllabus_estimate,
               t.allocated_minutes AS optimizer_allocated,
               (t.allocated_minutes - t.estimated_minutes) AS allocation_variance,
               t.priority_score
        FROM topics t
        JOIN units u ON t.unit_id = u.id
        WHERE u.course_id = :course_id
        ORDER BY t.priority_score DESC;
        """
    },
    {
        "id": "q10_concepts_needing_revision",
        "title": "10. Immediate Revision Priority Queue",
        "category": "Adaptive Class Planning",
        "purpose": "Identifies concepts mapped to upcoming sessions whose prerequisite average is under threshold.",
        "sql_features": ["Six-way JOIN", "DISTINCT"],
        "sql": """
        SELECT DISTINCT c_prereq.name AS revision_target_concept,
               p.average_score AS recorded_score,
               p.common_errors,
               t_target.title AS blocking_for_topic
        FROM class_sessions cs
        JOIN topics t_target ON cs.current_topic_id = t_target.id
        JOIN concepts c_target ON c_target.topic_id = t_target.id
        JOIN prerequisites pr ON pr.concept_id = c_target.id
        JOIN concepts c_prereq ON pr.prerequisite_id = c_prereq.id
        JOIN performance p ON p.concept_id = c_prereq.id
        WHERE cs.course_id = :course_id AND cs.status = 'scheduled' AND p.average_score < 60.0
        ORDER BY p.average_score ASC;
        """
    },
    {
        "id": "q11_curriculum_depth_recursive",
        "title": "11. Curriculum Depth via Recursive CTE",
        "category": "Curriculum Graph Analytics",
        "purpose": "Walks the prerequisite DAG from root concepts with WITH RECURSIVE and keeps each concept's longest chain (ROW_NUMBER window) - the concept's depth in the curriculum.",
        "sql_features": ["WITH RECURSIVE", "Window function (ROW_NUMBER)", "NOT EXISTS"],
        "sql": """
        WITH RECURSIVE chain (concept_id, depth, path) AS (
            SELECT c.id, 0, CAST(c.name AS TEXT)
            FROM concepts c
            JOIN topics t ON t.id = c.topic_id
            JOIN units u ON u.id = t.unit_id
            WHERE u.course_id = :course_id
              AND NOT EXISTS (SELECT 1 FROM prerequisites p WHERE p.concept_id = c.id)
            UNION ALL
            SELECT p.concept_id, ch.depth + 1, ch.path || ' -> ' || c.name
            FROM chain ch
            JOIN prerequisites p ON p.prerequisite_id = ch.concept_id
            JOIN concepts c ON c.id = p.concept_id
        ),
        ranked AS (
            SELECT ch.concept_id, ch.depth, ch.path,
                   ROW_NUMBER() OVER (PARTITION BY ch.concept_id ORDER BY ch.depth DESC) AS rn
            FROM chain ch
        )
        SELECT c.name AS concept, r.depth AS curriculum_depth, r.path AS longest_prerequisite_path
        FROM ranked r
        JOIN concepts c ON c.id = r.concept_id
        WHERE r.rn = 1
        ORDER BY r.depth DESC, c.name;
        """
    },
    {
        "id": "q12_topic_rank_running_budget",
        "title": "12. Topic Priority Rank & Running Time Budget",
        "category": "Optimization Verification",
        "purpose": "RANK() within each unit plus a running SUM() of allocated minutes shows where in the syllabus the time budget is consumed.",
        "sql_features": ["Window function (RANK, PARTITION BY)", "Running total (SUM OVER ROWS)"],
        "sql": """
        SELECT u.unit_number, t.title AS topic_title, t.priority_score, t.allocated_minutes,
               RANK() OVER (PARTITION BY u.id ORDER BY t.priority_score DESC) AS rank_in_unit,
               SUM(t.allocated_minutes) OVER (
                   ORDER BY u.unit_number, t.order_index
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) AS cumulative_minutes,
               ROUND(100.0 * SUM(t.allocated_minutes) OVER (
                   ORDER BY u.unit_number, t.order_index
                   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
               ) / c.total_available_minutes, 1) AS pct_of_course_budget
        FROM topics t
        JOIN units u ON u.id = t.unit_id
        JOIN courses c ON c.id = u.course_id
        WHERE c.id = :course_id
        ORDER BY u.unit_number, t.order_index;
        """
    },
    {
        "id": "q13_score_trend_lag",
        "title": "13. Concept Score Trend Across Assessments",
        "category": "Learning Feedback",
        "purpose": "LAG() compares each concept's score with its previous assessment to show improvement or decline over time.",
        "sql_features": ["Window function (LAG)"],
        "sql": """
        SELECT c.name AS concept, a.title AS assessment, a.scheduled_date, p.average_score,
               LAG(p.average_score) OVER (PARTITION BY c.id ORDER BY a.scheduled_date) AS previous_score,
               p.average_score - LAG(p.average_score) OVER (PARTITION BY c.id ORDER BY a.scheduled_date) AS change
        FROM performance p
        JOIN assessments a ON a.id = p.assessment_id
        JOIN concepts c ON c.id = p.concept_id
        WHERE a.course_id = :course_id
        ORDER BY c.name, a.scheduled_date;
        """
    },
    {
        "id": "q14_fully_assessed_topics_division",
        "title": "14. Fully Assessed Topics (Relational Division)",
        "category": "Assessment Tracking",
        "purpose": "Relational division with double NOT EXISTS: topics for which there is no concept that lacks an assessment result.",
        "sql_features": ["Relational division", "Correlated NOT EXISTS"],
        "sql": """
        SELECT u.unit_number, t.title AS topic_title,
               (SELECT COUNT(*) FROM concepts c WHERE c.topic_id = t.id) AS concepts
        FROM topics t
        JOIN units u ON u.id = t.unit_id
        WHERE u.course_id = :course_id
          AND EXISTS (SELECT 1 FROM concepts c WHERE c.topic_id = t.id)
          AND NOT EXISTS (
              SELECT 1 FROM concepts c
              WHERE c.topic_id = t.id
                AND NOT EXISTS (SELECT 1 FROM performance p WHERE p.concept_id = c.id)
          )
        ORDER BY u.unit_number, t.order_index;
        """
    },
    {
        "id": "q15_unassessed_prerequisites_except",
        "title": "15. Prerequisites Never Assessed (EXCEPT)",
        "category": "Curriculum Graph Analytics",
        "purpose": "Set difference: concepts other topics depend on, minus concepts that have any assessment evidence - blind spots in the feedback loop.",
        "sql_features": ["Set operation (EXCEPT)"],
        "sql": """
        SELECT c.name AS prerequisite_concept
        FROM concepts c
        JOIN topics t ON t.id = c.topic_id
        JOIN units u ON u.id = t.unit_id
        WHERE u.course_id = :course_id
          AND c.id IN (SELECT prerequisite_id FROM prerequisites)
        EXCEPT
        SELECT c.name
        FROM concepts c
        JOIN performance p ON p.concept_id = c.id
        ORDER BY 1;
        """
    },
    {
        "id": "q16_concept_mastery_view",
        "title": "16. Concept Mastery (View)",
        "category": "Views",
        "purpose": "Reads the v_concept_mastery view: latest vs previous score, transitive downstream dependents (recursive CTE), and a mastery status derived with the course's own threshold.",
        "sql_features": ["View", "LATERAL join", "Recursive CTE (inside view)"],
        "requires": "postgresql",
        "sql": """
        SELECT unit_number, topic_title, concept_name, assessments_count, avg_score,
               latest_score, score_trend, downstream_count, mastery_status
        FROM v_concept_mastery
        WHERE course_id = :course_id
        ORDER BY CASE mastery_status
                     WHEN 'bottleneck' THEN 1 WHEN 'weak' THEN 2 WHEN 'moderate' THEN 3
                     WHEN 'strong' THEN 4 ELSE 5 END,
                 avg_score NULLS LAST;
        """
    },
    {
        "id": "q17_time_pressure_function",
        "title": "17. Time Pressure (Stored Function)",
        "category": "Stored Functions",
        "purpose": "Calls fn_time_pressure(): remaining curriculum demand vs remaining scheduled capacity.",
        "sql_features": ["Set-returning function"],
        "requires": "postgresql",
        "sql": """
        SELECT * FROM fn_time_pressure(:course_id);
        """
    },
    {
        "id": "q18_course_dashboard_matview",
        "title": "18. Course Dashboard (Materialized View)",
        "category": "Views",
        "purpose": "Reads the precomputed mv_course_dashboard snapshot; refreshed with REFRESH MATERIALIZED VIEW CONCURRENTLY.",
        "sql_features": ["Materialized view"],
        "requires": "postgresql",
        "sql": """
        SELECT code, total_topics, completed_topics, topic_completion_pct, session_completion_pct,
               taught_minutes, remaining_minutes, weak_concepts, bottleneck_concepts,
               pressure_ratio, pressure_status, refreshed_at
        FROM mv_course_dashboard
        WHERE course_id = :course_id;
        """
    },
    {
        "id": "q19_audit_trail",
        "title": "19. Audit Trail (Trigger-Populated)",
        "category": "Audit Trail",
        "purpose": "Recent changes captured by the fn_audit_row_change() trigger, with the changed fields computed by diffing the JSONB row images.",
        "sql_features": ["Trigger", "JSONB", "jsonb_each"],
        "requires": "postgresql",
        "sql": """
        SELECT a.changed_at, a.table_name, a.operation, a.row_id,
               COALESCE(u.email, 'system') AS changed_by,
               (SELECT string_agg(n.key, ', ' ORDER BY n.key)
                FROM jsonb_each(a.new_data) n
                WHERE a.old_data IS NOT NULL
                  AND n.value IS DISTINCT FROM a.old_data -> n.key) AS changed_fields
        FROM audit_log a
        LEFT JOIN users u ON u.id = a.changed_by
        WHERE COALESCE(a.new_data, a.old_data) ->> 'course_id' = :course_id
           OR a.row_id = :course_id
        ORDER BY a.id DESC
        LIMIT 25;
        """
    }
]

class DBMSInsightsService:
    """
    DBMS Architecture & Demonstration Service for Academic Evaluation.
    Provides table schemas, normalization documentation, relational metadata,
    and runs parameterized demonstration queries against the live database.
    """

    def get_database_status(self) -> Dict[str, Any]:
        info = get_db_info()
        info["total_demonstration_queries"] = len(DEMO_QUERIES)
        return info

    def get_schema_summary(self, db: Session) -> List[TableSchemaInfo]:
        """Reflect schema from database metadata"""
        inspector = inspect(db_engine)
        table_names = inspector.get_table_names()
        
        # Descriptions and 3NF justifications
        table_docs = {
            "users": ("System user credentials and role definitions", "3NF: All non-key attributes fully functionally dependent on PK id."),
            "teachers": ("Faculty professional profiles mapped to users", "3NF: Separates faculty career attributes from login credentials."),
            "courses": ("Course metadata, calendar parameters, and contact limits", "3NF: Atomic attributes; no partial or transitive dependencies."),
            "sections": ("Student cohorts assigned to specific rooms and courses", "3NF: Composite uniqueness on (course_id, name)."),
            "course_outcomes": ("Accreditation Course Outcomes aligned with Bloom's taxonomy", "3NF: Distinct entity preventing repeating groups in courses."),
            "units": ("Syllabus organizational modules/units", "3NF: Foreign key to course_id with unique unit_number constraint."),
            "topics": ("Pedagogical topics contained within units", "3NF: Encapsulates estimated & allocated teaching time."),
            "concepts": ("Atomic conceptual entities with difficulty and type", "3NF: Independent of delivery sessions; 1:N with topics."),
            "prerequisites": ("Self-referential directed graph on concepts", "3NF: Pure associative entity capturing M:N prerequisite edges."),
            "class_sessions": ("Physical scheduled classroom periods", "3NF: 1:N from course; captures date, status, and duration."),
            "teaching_methods": ("Catalog of pedagogical teaching styles", "3NF: Normalizes method taxonomy across all courses."),
            "lesson_plans": ("Relational pointer and status to MongoDB document", "Polyglot Bridge: Relational status with NoSQL document pointer."),
            "teaching_sessions": ("Audit trail of conducted classroom sessions", "3NF: 1:1 with class_sessions, recording actual time and notes."),
            "assessments": ("Examinations, quizzes, and midterms", "3NF: Separate entity from class sessions for flexible scheduling."),
            "questions": ("Individual assessment questions with marks", "3NF: Atomic question breakdown per assessment."),
            "question_concepts": ("M:N mapping of questions to assessed concepts", "3NF: Associative entity with weightage attribution."),
            "performance": ("Aggregate cohort concept performance results", "3NF: Links concept and assessment with average score."),
            "method_effectiveness": ("Empirical learning gains recorded by method", "3NF: Tracks longitudinal pedagogical effectiveness."),
            "teacher_preferred_methods": ("Ranked teaching-method preferences per course constraint set", "1NF fix: replaces the former preferred_methods_json list column; PK (constraint_id, method_id), UNIQUE (constraint_id, rank)."),
            "audit_log": ("Append-only row change history written by triggers", "Not normalized by design: an immutable log of JSONB row images (old/new) per change.")
        }

        result = []
        for tbl in table_names:
            if tbl.startswith("alembic"):
                continue
            cols = inspector.get_columns(tbl)
            pk = inspector.get_pk_constraint(tbl)
            fks = inspector.get_foreign_keys(tbl)
            
            fk_map = {}
            for f in fks:
                for constrained_col, referred_col in zip(f["constrained_columns"], f["referred_columns"], strict=True):
                    fk_map[constrained_col] = f"{f['referred_table']}.{referred_col}"

            col_infos = []
            for c in cols:
                c_name = c["name"]
                is_pk = c_name in pk.get("constrained_columns", [])
                fk_target = fk_map.get(c_name)
                col_infos.append(TableColumnInfo(
                    name=c_name,
                    type=str(c["type"]),
                    primary_key=is_pk,
                    foreign_key=fk_target,
                    nullable=c["nullable"]
                ))

            doc_tuple = table_docs.get(tbl, ("Database entity", "3NF Compliant"))
            # Table names come from the catalog, never from user input, so quoting is safe here
            row_count = db.execute(text(f'SELECT COUNT(*) FROM "{tbl}"')).scalar()
            result.append(TableSchemaInfo(
                table_name=tbl,
                description=doc_tuple[0],
                row_count=row_count,
                normal_form=doc_tuple[1],
                columns=col_infos
            ))

        return result

    def explain_demo_query(self, db: Session, query_id: str, course_id: str) -> Dict[str, Any]:
        from app.services.db_catalog_service import db_catalog_service
        query_def = next((q for q in DEMO_QUERIES if q["id"] == query_id), None)
        if not query_def:
            raise ValueError(f"Demonstration query {query_id} not found")
        plan = db_catalog_service.explain(db, query_def["sql"], {"course_id": course_id})
        return {"query_id": query_id, "plan": plan}

    def execute_demo_query(self, db: Session, query_id: str, course_id: str) -> QueryDemoResult:
        query_def = next((q for q in DEMO_QUERIES if q["id"] == query_id), None)
        if not query_def:
            raise ValueError(f"Demonstration query {query_id} not found")

        dialect = db.bind.dialect.name
        required = query_def.get("requires")
        if required and required != dialect:
            raise ValueError(
                f"Query {query_id} uses {required}-only objects (views/functions/triggers); "
                f"the API is currently connected to {dialect}"
            )

        sql_to_run = query_def["sql"]
        # Dialect adaptation: replace ::numeric with CAST or strip if SQLite
        is_sqlite = dialect == "sqlite"
        if is_sqlite:
            sql_to_run = sql_to_run.replace("::numeric", "")

        t0 = time.time()
        result_proxy = db.execute(text(sql_to_run), {"course_id": course_id})
        columns = list(result_proxy.keys())
        rows = [dict(zip(columns, row, strict=True)) for row in result_proxy.fetchall()]
        exec_ms = round((time.time() - t0) * 1000, 2)

        return QueryDemoResult(
            query_id=query_def["id"],
            title=query_def["title"],
            category=query_def["category"],
            sql=query_def["sql"].strip(),
            purpose=query_def["purpose"],
            sql_features=query_def.get("sql_features", []),
            requires=query_def.get("requires"),
            params={"course_id": course_id},
            row_count=len(rows),
            columns=columns,
            rows=rows,
            execution_time_ms=exec_ms
        )

    def list_demo_queries(self) -> List[Dict[str, Any]]:
        return [
            {
                "id": q["id"], "title": q["title"], "category": q["category"], "purpose": q["purpose"],
                "sql_features": q.get("sql_features", []), "requires": q.get("requires"),
            }
            for q in DEMO_QUERIES
        ]

dbms_insights_service = DBMSInsightsService()
