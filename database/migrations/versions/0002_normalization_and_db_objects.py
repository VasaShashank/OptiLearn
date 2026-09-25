"""normalization fixes, audit log, triggers, functions, views

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-25 10:00:00.000000

Normalization
  * teacher_constraints.preferred_methods_json (a list in one column, violates 1NF)
    -> teacher_preferred_methods(constraint_id, method_id, rank)
  * courses.total_available_minutes (derived: total_classes * period_duration)
    -> STORED generated column, so it can never drift from its inputs

PostgreSQL server-side objects
  * Triggers   : updated_at maintenance, row-level audit log, weakness flag from the
                 course's own threshold, threshold-change cascade, prerequisite guard
                 (same course + no cycles, via recursive CTE)
  * Functions  : fn_prerequisite_chain (recursive CTE), fn_time_pressure
  * Procedure  : sp_record_concept_performance (locked UPSERT)
  * Views      : v_course_progress, v_concept_mastery, v_teaching_history
  * Mat. view  : mv_course_dashboard (+ unique index for REFRESH ... CONCURRENTLY)

Every function pins search_path: it blocks search-path hijacking, and PostgreSQL 17+
refreshes materialized views under a restricted search_path, so unpinned functions
called from mv_course_dashboard would fail to resolve their tables.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = '0002'
down_revision: Union[str, None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

AUDITED_TABLES = [
    "courses", "teacher_constraints", "units", "topics", "concepts", "class_sessions",
    "lesson_plans", "teaching_sessions", "assessments", "performance",
]
UPDATED_AT_TABLES = ["courses", "lesson_plans", "method_effectiveness"]

PG_FUNCTIONS_AND_TRIGGERS = """
-- ---------------------------------------------------------------
-- updated_at maintenance (timestamps are stored as naive UTC)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at := timezone('utc', now());
    RETURN NEW;
END $$;

-- ---------------------------------------------------------------
-- Row-level audit log. changed_by comes from the transaction-local
-- setting app.user_id, which the API sets for authenticated requests.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_audit_row_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_old jsonb;
    v_new jsonb;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN v_old := to_jsonb(OLD); END IF;
    IF TG_OP IN ('INSERT', 'UPDATE') THEN v_new := to_jsonb(NEW); END IF;
    IF TG_OP = 'UPDATE' AND v_old = v_new THEN
        RETURN NULL;  -- ignore no-op updates
    END IF;

    INSERT INTO audit_log (table_name, operation, row_id, old_data, new_data, changed_by, changed_at)
    VALUES (TG_TABLE_NAME, TG_OP, COALESCE(v_new ->> 'id', v_old ->> 'id'), v_old, v_new,
            NULLIF(current_setting('app.user_id', true), ''), timezone('utc', now()));
    RETURN NULL;
END $$;

-- ---------------------------------------------------------------
-- performance.weakness_flag is derived from the owning course's
-- revision threshold; the DB, not the client, decides it.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_performance_weakness() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_threshold double precision;
BEGIN
    SELECT tc.revision_threshold_score INTO v_threshold
    FROM assessments a
    JOIN teacher_constraints tc ON tc.course_id = a.course_id
    WHERE a.id = NEW.assessment_id;

    NEW.weakness_flag := NEW.average_score < COALESCE(v_threshold, 60.0);
    RETURN NEW;
END $$;

-- When a teacher changes the threshold, re-derive every flag in that course.
CREATE OR REPLACE FUNCTION fn_threshold_recompute_weakness() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE performance p
    SET weakness_flag = p.average_score < NEW.revision_threshold_score
    FROM assessments a
    WHERE a.id = p.assessment_id
      AND a.course_id = NEW.course_id
      AND p.weakness_flag IS DISTINCT FROM (p.average_score < NEW.revision_threshold_score);
    RETURN NULL;
END $$;

-- ---------------------------------------------------------------
-- Prerequisite guard: both concepts in the same course, and the new
-- edge must keep the graph acyclic. An advisory lock per course
-- serialises concurrent edge inserts so two transactions cannot each
-- add half of a cycle (write skew).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prerequisite_guard() RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_course_concept varchar;
    v_course_prereq  varchar;
BEGIN
    SELECT u.course_id INTO v_course_concept
    FROM concepts c JOIN topics t ON t.id = c.topic_id JOIN units u ON u.id = t.unit_id
    WHERE c.id = NEW.concept_id;

    SELECT u.course_id INTO v_course_prereq
    FROM concepts c JOIN topics t ON t.id = c.topic_id JOIN units u ON u.id = t.unit_id
    WHERE c.id = NEW.prerequisite_id;

    IF v_course_concept IS DISTINCT FROM v_course_prereq THEN
        RAISE EXCEPTION 'Prerequisite % and concept % belong to different courses',
            NEW.prerequisite_id, NEW.concept_id
            USING ERRCODE = 'check_violation';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtext('prerequisites:' || v_course_concept));

    -- Edge (concept_id, prerequisite_id) means prerequisite -> concept.
    -- It closes a cycle iff concept_id is already upstream of prerequisite_id.
    IF EXISTS (
        WITH RECURSIVE upstream(cid) AS (
            SELECT p.prerequisite_id FROM prerequisites p WHERE p.concept_id = NEW.prerequisite_id
            UNION
            SELECT p.prerequisite_id FROM prerequisites p JOIN upstream u ON p.concept_id = u.cid
        )
        SELECT 1 FROM upstream WHERE cid = NEW.concept_id
    ) THEN
        RAISE EXCEPTION 'Prerequisite edge % -> % would create a cycle',
            NEW.prerequisite_id, NEW.concept_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END $$;

CREATE TRIGGER trg_performance_weakness
    BEFORE INSERT OR UPDATE OF average_score, assessment_id ON performance
    FOR EACH ROW EXECUTE FUNCTION fn_performance_weakness();

CREATE TRIGGER trg_threshold_recompute_weakness
    AFTER UPDATE OF revision_threshold_score ON teacher_constraints
    FOR EACH ROW EXECUTE FUNCTION fn_threshold_recompute_weakness();

CREATE TRIGGER trg_prerequisite_guard
    BEFORE INSERT OR UPDATE ON prerequisites
    FOR EACH ROW EXECUTE FUNCTION fn_prerequisite_guard();

-- ---------------------------------------------------------------
-- fn_prerequisite_chain: every transitive prerequisite of a concept,
-- at its shortest depth, with the path that reaches it.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prerequisite_chain(p_concept_id varchar)
RETURNS TABLE (prerequisite_id varchar, prerequisite_name varchar, depth integer, path text)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    WITH RECURSIVE chain(cid, lvl, trail, names) AS (
        SELECT p.prerequisite_id, 1,
               ARRAY[p.concept_id::text, p.prerequisite_id::text],
               ARRAY[t.name::text, pc.name::text]
        FROM prerequisites p
        JOIN concepts t  ON t.id = p.concept_id
        JOIN concepts pc ON pc.id = p.prerequisite_id
        WHERE p.concept_id = p_concept_id
        UNION ALL
        SELECT p.prerequisite_id, ch.lvl + 1,
               ch.trail || p.prerequisite_id::text,
               ch.names || pc.name::text
        FROM chain ch
        JOIN prerequisites p ON p.concept_id = ch.cid
        JOIN concepts pc ON pc.id = p.prerequisite_id
        WHERE p.prerequisite_id::text <> ALL (ch.trail)
    )
    SELECT s.cid, s.cname, s.lvl, s.path
    FROM (
        SELECT DISTINCT ON (ch.cid)
               ch.cid::varchar AS cid, c.name::varchar AS cname, ch.lvl,
               array_to_string(ch.names, ' <- ') AS path
        FROM chain ch
        JOIN concepts c ON c.id = ch.cid
        ORDER BY ch.cid, ch.lvl
    ) s
    ORDER BY s.lvl, s.cname;
$$;

-- ---------------------------------------------------------------
-- fn_time_pressure: remaining curriculum demand vs remaining capacity.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_time_pressure(p_course_id varchar)
RETURNS TABLE (
    remaining_topics integer,
    remaining_periods integer,
    remaining_required_minutes integer,
    remaining_available_minutes integer,
    pressure_ratio numeric,
    pressure_status text
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
    WITH demand AS (
        SELECT COUNT(*)::int AS n_topics,
               COALESCE(SUM(CASE WHEN t.allocated_minutes > 0 THEN t.allocated_minutes
                                 ELSE t.estimated_minutes END), 0)::int AS minutes
        FROM topics t JOIN units u ON u.id = t.unit_id
        WHERE u.course_id = p_course_id AND t.status <> 'completed'
    ), capacity AS (
        SELECT COUNT(*)::int AS n_periods, COALESCE(SUM(cs.duration_minutes), 0)::int AS minutes
        FROM class_sessions cs
        WHERE cs.course_id = p_course_id AND cs.status = 'scheduled'
    )
    SELECT d.n_topics, c.n_periods, d.minutes, c.minutes,
           ROUND(d.minutes::numeric / NULLIF(c.minutes, 0), 2),
           CASE
               WHEN c.minutes = 0 AND d.minutes > 0              THEN 'over_capacity'
               WHEN c.minutes = 0                               THEN 'complete'
               WHEN d.minutes::numeric / c.minutes > 1.0         THEN 'over_capacity'
               WHEN d.minutes::numeric / c.minutes > 0.9         THEN 'high_pressure'
               WHEN d.minutes::numeric / c.minutes > 0.7         THEN 'balanced'
               ELSE 'healthy'
           END
    FROM demand d CROSS JOIN capacity c;
$$;

-- ---------------------------------------------------------------
-- sp_record_concept_performance: row-locks the assessment, UPSERTs
-- the concept result (weakness_flag set by trigger), and marks the
-- assessment completed — all inside the caller's transaction.
-- ---------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_record_concept_performance(
    p_assessment_id varchar,
    p_concept_id    varchar,
    p_average_score double precision,
    p_sample_size   integer,
    p_common_errors text
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    PERFORM 1 FROM assessments WHERE id = p_assessment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Assessment % not found', p_assessment_id USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO performance (id, concept_id, assessment_id, average_score, sample_size, common_errors, recorded_at)
    VALUES (gen_random_uuid()::text, p_concept_id, p_assessment_id, p_average_score,
            p_sample_size, p_common_errors, timezone('utc', now()))
    ON CONFLICT ON CONSTRAINT uq_concept_assessment_performance DO UPDATE
        SET average_score = EXCLUDED.average_score,
            sample_size   = EXCLUDED.sample_size,
            common_errors = EXCLUDED.common_errors,
            recorded_at   = EXCLUDED.recorded_at;

    UPDATE assessments SET status = 'completed'
    WHERE id = p_assessment_id AND status <> 'completed';
END $$;
"""

PG_VIEWS = """
CREATE VIEW v_course_progress AS
SELECT c.id AS course_id, c.code, c.title, c.total_classes, c.total_available_minutes,
       tp.total_topics, tp.completed_topics, tp.in_progress_topics,
       ROUND(100.0 * tp.completed_topics / NULLIF(tp.total_topics, 0), 1) AS topic_completion_pct,
       sp.completed_sessions, sp.scheduled_sessions, sp.cancelled_sessions,
       ROUND(100.0 * sp.completed_sessions / c.total_classes, 1) AS session_completion_pct,
       COALESCE(tm.taught_minutes, 0) AS taught_minutes,
       c.total_available_minutes - COALESCE(tm.taught_minutes, 0) AS remaining_minutes
FROM courses c
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS total_topics,
           COUNT(*) FILTER (WHERE t.status = 'completed')   AS completed_topics,
           COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress_topics
    FROM topics t JOIN units u ON u.id = t.unit_id
    WHERE u.course_id = c.id
) tp ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE cs.status = 'completed') AS completed_sessions,
           COUNT(*) FILTER (WHERE cs.status = 'scheduled') AS scheduled_sessions,
           COUNT(*) FILTER (WHERE cs.status = 'cancelled') AS cancelled_sessions
    FROM class_sessions cs
    WHERE cs.course_id = c.id
) sp ON true
LEFT JOIN LATERAL (
    SELECT SUM(ts.actual_minutes) AS taught_minutes
    FROM teaching_sessions ts JOIN class_sessions cs ON cs.id = ts.session_id
    WHERE cs.course_id = c.id
) tm ON true;

CREATE VIEW v_concept_mastery AS
SELECT u.course_id, u.unit_number, t.id AS topic_id, t.title AS topic_title,
       c.id AS concept_id, c.name AS concept_name, c.difficulty, c.importance, c.concept_type,
       COALESCE(ps.assessments_count, 0) AS assessments_count,
       ps.avg_score, ps.latest_score, ps.previous_score,
       ps.latest_score - ps.previous_score AS score_trend,
       ds.downstream_count,
       CASE
           WHEN ps.avg_score IS NULL THEN 'not_assessed'
           WHEN ps.avg_score < COALESCE(tc.revision_threshold_score, 60.0)
                AND ds.downstream_count >= 2 THEN 'bottleneck'
           WHEN ps.avg_score < COALESCE(tc.revision_threshold_score, 60.0) THEN 'weak'
           WHEN ps.avg_score < 70.0 THEN 'moderate'
           ELSE 'strong'
       END AS mastery_status
FROM concepts c
JOIN topics t ON t.id = c.topic_id
JOIN units  u ON u.id = t.unit_id
LEFT JOIN teacher_constraints tc ON tc.course_id = u.course_id
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS assessments_count,
           ROUND(AVG(p.average_score)::numeric, 1) AS avg_score,
           (array_agg(p.average_score ORDER BY p.recorded_at DESC))[1] AS latest_score,
           (array_agg(p.average_score ORDER BY p.recorded_at DESC))[2] AS previous_score
    FROM performance p
    WHERE p.concept_id = c.id
    HAVING COUNT(*) > 0
) ps ON true
-- Transitive dependents: every concept that (indirectly) builds on this one
LEFT JOIN LATERAL (
    WITH RECURSIVE downstream(cid) AS (
        SELECT p.concept_id FROM prerequisites p WHERE p.prerequisite_id = c.id
        UNION
        SELECT p.concept_id FROM prerequisites p JOIN downstream d ON p.prerequisite_id = d.cid
    )
    SELECT COUNT(*) AS downstream_count FROM downstream
) ds ON true;

CREATE VIEW v_teaching_history AS
SELECT cs.course_id, cs.session_number, cs.scheduled_date,
       t.title AS topic_title, tm.name AS method_name, tm.category AS method_category,
       ts.actual_minutes, ts.student_engagement_rating, ts.completion_rate,
       ts.teacher_notes, ts.conducted_at
FROM teaching_sessions ts
JOIN class_sessions cs ON cs.id = ts.session_id
LEFT JOIN topics t ON t.id = cs.current_topic_id
LEFT JOIN teaching_methods tm ON tm.id = ts.method_id;

CREATE MATERIALIZED VIEW mv_course_dashboard AS
SELECT vp.*,
       cm.strong_concepts, cm.moderate_concepts, cm.weak_concepts,
       cm.bottleneck_concepts, cm.not_assessed_concepts,
       tp.remaining_topics, tp.remaining_periods, tp.pressure_ratio, tp.pressure_status,
       timezone('utc', now()) AS refreshed_at
FROM v_course_progress vp
LEFT JOIN LATERAL (
    SELECT COUNT(*) FILTER (WHERE m.mastery_status = 'strong')       AS strong_concepts,
           COUNT(*) FILTER (WHERE m.mastery_status = 'moderate')     AS moderate_concepts,
           COUNT(*) FILTER (WHERE m.mastery_status = 'weak')         AS weak_concepts,
           COUNT(*) FILTER (WHERE m.mastery_status = 'bottleneck')   AS bottleneck_concepts,
           COUNT(*) FILTER (WHERE m.mastery_status = 'not_assessed') AS not_assessed_concepts
    FROM v_concept_mastery m
    WHERE m.course_id = vp.course_id
) cm ON true
LEFT JOIN LATERAL fn_time_pressure(vp.course_id) tp ON true
WITH DATA;

-- Unique index is required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX ux_mv_course_dashboard_course ON mv_course_dashboard (course_id);
"""


def upgrade() -> None:
    is_pg = op.get_bind().dialect.name == "postgresql"

    # --- 1NF: preferred methods list -> association table -------------------------
    op.create_table(
        'teacher_preferred_methods',
        sa.Column('constraint_id', sa.String(length=36), nullable=False),
        sa.Column('method_id', sa.String(length=36), nullable=False),
        sa.Column('rank', sa.Integer(), nullable=False),
        sa.CheckConstraint('rank >= 1', name='check_positive_preference_rank'),
        sa.ForeignKeyConstraint(['constraint_id'], ['teacher_constraints.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['method_id'], ['teaching_methods.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('constraint_id', 'method_id'),
        sa.UniqueConstraint('constraint_id', 'rank', name='uq_preferred_method_rank'),
    )
    op.create_index('ix_teacher_preferred_methods_method', 'teacher_preferred_methods', ['method_id'])

    if is_pg:
        # Carry existing JSON lists over, keeping list order as the rank
        op.execute("""
            INSERT INTO teacher_preferred_methods (constraint_id, method_id, rank)
            SELECT tc.id, tm.id, e.ord::int
            FROM teacher_constraints tc
            CROSS JOIN LATERAL jsonb_array_elements_text(
                COALESCE(NULLIF(tc.preferred_methods_json, ''), '[]')::jsonb
            ) WITH ORDINALITY AS e(method_name, ord)
            JOIN teaching_methods tm ON tm.name = e.method_name
            ON CONFLICT DO NOTHING
        """)
    with op.batch_alter_table('teacher_constraints') as batch:
        batch.drop_column('preferred_methods_json')

    # --- Derived attribute -> generated column ------------------------------------
    with op.batch_alter_table('courses') as batch:
        batch.drop_constraint('check_non_negative_available_time', type_='check')
        batch.drop_column('total_available_minutes')
    op.add_column('courses', sa.Column(
        'total_available_minutes', sa.Integer(),
        sa.Computed('total_classes * period_duration', persisted=True)
    ))
    with op.batch_alter_table('courses') as batch:
        batch.create_check_constraint(
            'check_course_date_order', 'end_date IS NULL OR start_date IS NULL OR end_date >= start_date'
        )

    # --- Audit log ----------------------------------------------------------------
    op.create_table(
        'audit_log',
        sa.Column('id', sa.BigInteger().with_variant(sa.Integer(), 'sqlite'), autoincrement=True, nullable=False),
        sa.Column('table_name', sa.String(length=63), nullable=False),
        sa.Column('operation', sa.String(length=6), nullable=False),
        sa.Column('row_id', sa.String(length=36), nullable=True),
        sa.Column('old_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
        sa.Column('new_data', sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql'), nullable=True),
        sa.Column('changed_by', sa.String(length=36), nullable=True),
        sa.Column('changed_at', sa.DateTime(), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.CheckConstraint("operation IN ('INSERT', 'UPDATE', 'DELETE')", name='check_audit_operation'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_audit_log_table_row', 'audit_log', ['table_name', 'row_id', 'changed_at'])

    # --- Indexes: FK columns not covered by a PK prefix, plus partial indexes ------
    op.create_index('ix_concept_outcomes_outcome', 'concept_outcomes', ['outcome_id'])
    op.create_index('ix_prerequisites_prerequisite', 'prerequisites', ['prerequisite_id'])
    op.create_index('ix_question_concepts_concept', 'question_concepts', ['concept_id'])
    op.create_index('ix_class_sessions_current_topic', 'class_sessions', ['current_topic_id'])
    op.create_index(
        'ix_class_sessions_upcoming', 'class_sessions', ['course_id', 'session_number'],
        postgresql_where=sa.text("status = 'scheduled'"), sqlite_where=sa.text("status = 'scheduled'")
    )
    op.create_index(
        'ix_performance_weak', 'performance', ['concept_id'],
        postgresql_where=sa.text('weakness_flag'), sqlite_where=sa.text('weakness_flag')
    )

    if not is_pg:
        return

    # --- PostgreSQL server-side objects ------------------------------------------
    op.execute(PG_FUNCTIONS_AND_TRIGGERS)
    for table in UPDATED_AT_TABLES:
        op.execute(
            f"CREATE TRIGGER trg_{table}_updated_at BEFORE UPDATE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()"
        )
    for table in AUDITED_TABLES:
        op.execute(
            f"CREATE TRIGGER trg_{table}_audit AFTER INSERT OR UPDATE OR DELETE ON {table} "
            f"FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change()"
        )
    op.execute(PG_VIEWS)


def downgrade() -> None:
    is_pg = op.get_bind().dialect.name == "postgresql"

    if is_pg:
        op.execute("DROP MATERIALIZED VIEW IF EXISTS mv_course_dashboard")
        op.execute("DROP VIEW IF EXISTS v_teaching_history, v_concept_mastery, v_course_progress")
        for table in AUDITED_TABLES:
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_audit ON {table}")
        for table in UPDATED_AT_TABLES:
            op.execute(f"DROP TRIGGER IF EXISTS trg_{table}_updated_at ON {table}")
        op.execute("DROP TRIGGER IF EXISTS trg_prerequisite_guard ON prerequisites")
        op.execute("DROP TRIGGER IF EXISTS trg_threshold_recompute_weakness ON teacher_constraints")
        op.execute("DROP TRIGGER IF EXISTS trg_performance_weakness ON performance")
        op.execute("DROP PROCEDURE IF EXISTS sp_record_concept_performance(varchar, varchar, double precision, integer, text)")
        op.execute("DROP FUNCTION IF EXISTS fn_time_pressure(varchar)")
        op.execute("DROP FUNCTION IF EXISTS fn_prerequisite_chain(varchar)")
        for fn in ("fn_prerequisite_guard", "fn_threshold_recompute_weakness",
                   "fn_performance_weakness", "fn_audit_row_change", "fn_set_updated_at"):
            op.execute(f"DROP FUNCTION IF EXISTS {fn}()")

    op.drop_index('ix_performance_weak', table_name='performance')
    op.drop_index('ix_class_sessions_upcoming', table_name='class_sessions')
    op.drop_index('ix_class_sessions_current_topic', table_name='class_sessions')
    op.drop_index('ix_question_concepts_concept', table_name='question_concepts')
    op.drop_index('ix_prerequisites_prerequisite', table_name='prerequisites')
    op.drop_index('ix_concept_outcomes_outcome', table_name='concept_outcomes')

    op.drop_index('ix_audit_log_table_row', table_name='audit_log')
    op.drop_table('audit_log')

    with op.batch_alter_table('courses') as batch:
        batch.drop_constraint('check_course_date_order', type_='check')
        batch.drop_column('total_available_minutes')
    op.add_column('courses', sa.Column('total_available_minutes', sa.Integer(), nullable=True))
    op.execute("UPDATE courses SET total_available_minutes = total_classes * period_duration")
    with op.batch_alter_table('courses') as batch:
        batch.alter_column('total_available_minutes', nullable=False)
        batch.create_check_constraint('check_non_negative_available_time', 'total_available_minutes >= 0')

    op.add_column('teacher_constraints', sa.Column('preferred_methods_json', sa.Text(), nullable=True))
    if is_pg:
        op.execute("""
            UPDATE teacher_constraints tc
            SET preferred_methods_json = COALESCE((
                SELECT json_agg(tm.name ORDER BY tpm.rank)::text
                FROM teacher_preferred_methods tpm
                JOIN teaching_methods tm ON tm.id = tpm.method_id
                WHERE tpm.constraint_id = tc.id
            ), '[]')
        """)
    op.drop_index('ix_teacher_preferred_methods_method', table_name='teacher_preferred_methods')
    op.drop_table('teacher_preferred_methods')
