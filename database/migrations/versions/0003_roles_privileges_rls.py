"""least-privilege roles, column privileges, row-level security

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-25 14:00:00.000000

Roles (cluster-wide, created if missing)
  * optiteach_app       LOGIN, BYPASSRLS. What the API connects as: DML on data tables
                        only - no DDL, no TRUNCATE, no writes to audit_log/alembic_version.
  * optiteach_readonly  NOLOGIN. The API switches to it (SET LOCAL ROLE) for the ad-hoc
                        SQL console. SELECT only, no password hashes, and row-level
                        security limits every table to the requesting teacher's courses.

Hardening
  * fn_audit_row_change() becomes SECURITY DEFINER: the trigger can append to audit_log
    although the app role cannot write it -> the audit trail cannot be forged or erased.
  * fn_refresh_course_dashboard(): SECURITY DEFINER wrapper, since only the owner may
    REFRESH a materialized view.
  * EXECUTE on functions is revoked from PUBLIC and granted explicitly. set_config() and
    query_to_xml*() are withheld from the console role: they would let SQL typed into
    the console change the app.teacher_id setting that the RLS policies read.
  * Views run with security_invoker so RLS applies through them.

The app role's password is taken from DATABASE_URL when it names optiteach_app.
Downgrade removes grants/policies but not the roles themselves: roles are shared by
every database in the cluster (e.g. the test database).
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy.engine import make_url

revision: str = '0003'
down_revision: Union[str, None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

APP_ROLE = "optiteach_app"
CONSOLE_ROLE = "optiteach_readonly"
DEV_APP_PASSWORD = "optiteach_app_dev"

IS_ADMIN = "current_setting('app.is_admin', true) = 'true'"
TEACHER = "current_setting('app.teacher_id', true)"

# table -> USING expression for the console role. Child tables defer to their parent's
# visibility: the sub-SELECT on the parent is itself filtered by the parent's policy.
RLS_POLICIES = {
    "courses": f"{IS_ADMIN} OR teacher_id = {TEACHER}",
    "teachers": f"{IS_ADMIN} OR id = {TEACHER}",
    "users": f"{IS_ADMIN} OR id IN (SELECT user_id FROM teachers)",
    "sections": "course_id IN (SELECT id FROM courses)",
    "teacher_constraints": "course_id IN (SELECT id FROM courses)",
    "teacher_preferred_methods": "constraint_id IN (SELECT id FROM teacher_constraints)",
    "course_outcomes": "course_id IN (SELECT id FROM courses)",
    "units": "course_id IN (SELECT id FROM courses)",
    "topics": "unit_id IN (SELECT id FROM units)",
    "concepts": "topic_id IN (SELECT id FROM topics)",
    "concept_outcomes": "concept_id IN (SELECT id FROM concepts)",
    "prerequisites": "concept_id IN (SELECT id FROM concepts)",
    "class_sessions": "course_id IN (SELECT id FROM courses)",
    "lesson_plans": "session_id IN (SELECT id FROM class_sessions)",
    "teaching_sessions": "session_id IN (SELECT id FROM class_sessions)",
    "assessments": "course_id IN (SELECT id FROM courses)",
    "questions": "assessment_id IN (SELECT id FROM assessments)",
    "question_concepts": "question_id IN (SELECT id FROM questions)",
    "performance": "assessment_id IN (SELECT id FROM assessments)",
    "audit_log": (
        f"{IS_ADMIN} OR COALESCE(new_data, old_data) ->> 'course_id' IN (SELECT id FROM courses) "
        f"OR row_id IN (SELECT id FROM courses)"
    ),
}
GLOBAL_CATALOG_TABLES = ["teaching_methods", "method_effectiveness"]  # not course-specific
USER_COLUMNS_VISIBLE = "id, email, full_name, role, is_active, created_at"  # never hashed_password
VIEWS = ["v_course_progress", "v_concept_mastery", "v_teaching_history"]
QUERY_STRING_FUNCTIONS = [
    "query_to_xml(text, boolean, boolean, text)",
    "query_to_xmlschema(text, boolean, boolean, text)",
    "query_to_xml_and_xmlschema(text, boolean, boolean, text)",
]


def _app_password() -> str:
    from app.database.config import settings
    url = make_url(settings.DATABASE_URL)
    password = url.password if url.username == APP_ROLE and url.password else DEV_APP_PASSWORD
    return password.replace("'", "''")


def upgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    op.execute(f"""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{APP_ROLE}') THEN
                CREATE ROLE {APP_ROLE} LOGIN PASSWORD '{_app_password()}';
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '{CONSOLE_ROLE}') THEN
                CREATE ROLE {CONSOLE_ROLE} NOLOGIN;
            END IF;
        END $$;
        ALTER ROLE {APP_ROLE} BYPASSRLS;
        GRANT {CONSOLE_ROLE} TO {APP_ROLE};
    """)
    op.execute(f"""
        DO $$ BEGIN
            EXECUTE format('GRANT CONNECT ON DATABASE %I TO {APP_ROLE}', current_database());
        END $$;
        GRANT USAGE ON SCHEMA public TO {APP_ROLE}, {CONSOLE_ROLE};
    """)

    # ---------------- app role: DML on data, nothing else ----------------
    op.execute(f"""
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {APP_ROLE};
        REVOKE INSERT, UPDATE, DELETE ON audit_log FROM {APP_ROLE};
        REVOKE ALL ON alembic_version FROM {APP_ROLE};
        GRANT SELECT ON mv_course_dashboard TO {APP_ROLE};
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {APP_ROLE};
    """)

    # ---------------- functions: explicit EXECUTE only ----------------
    op.execute(f"""
        ALTER FUNCTION fn_audit_row_change() SECURITY DEFINER;

        CREATE OR REPLACE FUNCTION fn_refresh_course_dashboard() RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
        BEGIN
            REFRESH MATERIALIZED VIEW CONCURRENTLY mv_course_dashboard;
        END $$;

        REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
        REVOKE EXECUTE ON ALL PROCEDURES IN SCHEMA public FROM PUBLIC;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

        GRANT EXECUTE ON FUNCTION fn_prerequisite_chain(varchar), fn_time_pressure(varchar),
                                  fn_refresh_course_dashboard() TO {APP_ROLE};
        GRANT EXECUTE ON PROCEDURE sp_record_concept_performance(varchar, varchar, double precision, integer, text)
            TO {APP_ROLE};
        GRANT EXECUTE ON FUNCTION fn_prerequisite_chain(varchar), fn_time_pressure(varchar) TO {CONSOLE_ROLE};

        -- The console role must not be able to rewrite the settings RLS depends on
        REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO {APP_ROLE};
    """)
    for fn in QUERY_STRING_FUNCTIONS:
        op.execute(f"REVOKE EXECUTE ON FUNCTION pg_catalog.{fn} FROM PUBLIC")

    # ---------------- console role: SELECT + column privileges + RLS ----------------
    grant_tables = [t for t in RLS_POLICIES if t != "users"] + GLOBAL_CATALOG_TABLES
    op.execute(f"GRANT SELECT ON {', '.join(grant_tables)} TO {CONSOLE_ROLE}")
    op.execute(f"GRANT SELECT ({USER_COLUMNS_VISIBLE}) ON users TO {CONSOLE_ROLE}")
    op.execute(f"GRANT SELECT ON {', '.join(VIEWS)} TO {CONSOLE_ROLE}")
    for view in VIEWS:
        op.execute(f"ALTER VIEW {view} SET (security_invoker = true)")

    for table, using in RLS_POLICIES.items():
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"CREATE POLICY console_read ON {table} FOR SELECT TO {CONSOLE_ROLE} USING ({using})")


def downgrade() -> None:
    if op.get_bind().dialect.name != "postgresql":
        return

    for table in RLS_POLICIES:
        op.execute(f"DROP POLICY IF EXISTS console_read ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    for view in VIEWS:
        op.execute(f"ALTER VIEW {view} RESET (security_invoker)")

    for fn in QUERY_STRING_FUNCTIONS:
        op.execute(f"GRANT EXECUTE ON FUNCTION pg_catalog.{fn} TO PUBLIC")
    op.execute(f"""
        GRANT EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) TO PUBLIC;
        REVOKE EXECUTE ON FUNCTION pg_catalog.set_config(text, text, boolean) FROM {APP_ROLE};
        ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
        GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
        GRANT EXECUTE ON ALL PROCEDURES IN SCHEMA public TO PUBLIC;
        DROP FUNCTION IF EXISTS fn_refresh_course_dashboard();
        ALTER FUNCTION fn_audit_row_change() SECURITY INVOKER;

        ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM {APP_ROLE};
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {APP_ROLE}, {CONSOLE_ROLE};
        REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM {APP_ROLE}, {CONSOLE_ROLE};
        REVOKE ALL ON ALL PROCEDURES IN SCHEMA public FROM {APP_ROLE};
        REVOKE USAGE ON SCHEMA public FROM {APP_ROLE}, {CONSOLE_ROLE};
    """)
    op.execute(f"""
        DO $$ BEGIN
            EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM {APP_ROLE}', current_database());
        END $$;
    """)
