"""
Database-enforced security from migration 0003, exercised with the real roles:
  * optiteach_app      - what the API connects as (least privilege)
  * optiteach_readonly - what the SQL console runs as (SELECT + row-level security)
Each test tries something that must be refused *by PostgreSQL*.
"""
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError, DBAPIError
from sqlalchemy.orm import Session

from app.models.entities import User
from app.services.sql_console_service import ConsoleError, run_console_query


# ------------------------------------------------------------------ helpers / fixtures

@pytest.fixture
def app_conn(pg_app):
    with pg_app.connect() as connection:
        trans = connection.begin()
        yield connection
        trans.rollback()


def refused(conn, sql, match="permission denied"):
    with pytest.raises(DBAPIError, match=match):
        with conn.begin_nested():
            conn.execute(text(sql))


@pytest.fixture(scope="module")
def second_teacher(pg):
    """A committed second teacher + course, so console isolation can be observed."""
    suffix = uuid.uuid4().hex[:8]
    ids = {"user": f"u-{suffix}", "teacher": f"t-{suffix}", "course": f"c-{suffix}"}
    with pg.begin() as conn:
        conn.execute(text("""
            INSERT INTO users (id, email, hashed_password, full_name, role, is_active)
                VALUES (:user, :email, 'x', 'Second Teacher', 'teacher', true);
            INSERT INTO teachers (id, user_id, department, employee_id) VALUES (:teacher, :user, 'EEE', :emp);
            INSERT INTO courses (id, teacher_id, code, title, semester, total_classes, period_duration)
                VALUES (:course, :teacher, 'EE201', 'Circuits', 'Fall 2026', 30, 50);
        """), {**ids, "email": f"second-{suffix}@optiteach.edu", "emp": f"EMP-{suffix}"})
    yield ids
    with pg.begin() as conn:
        conn.execute(text("DELETE FROM users WHERE id = :u"), {"u": ids["user"]})


def console(pg_app, sql, email, **kw):
    with Session(bind=pg_app) as session:
        user = session.query(User).filter(User.email == email).one()
        return run_console_query(session, sql, user, **kw)


# ------------------------------------------------------------------ least privilege (app role)

def test_app_role_cannot_change_schema(app_conn):
    refused(app_conn, "DROP TABLE courses", match="must be owner")
    refused(app_conn, "ALTER TABLE courses ADD COLUMN x int", match="must be owner")
    refused(app_conn, "TRUNCATE performance")
    refused(app_conn, "CREATE TABLE sneaky (id int)")
    refused(app_conn, "SELECT * FROM alembic_version")


def test_audit_log_is_append_only_for_the_app(app_conn):
    refused(app_conn, "INSERT INTO audit_log (table_name, operation) VALUES ('courses', 'DELETE')")
    refused(app_conn, "UPDATE audit_log SET changed_by = 'someone-else'")
    refused(app_conn, "DELETE FROM audit_log")

    # ...yet the SECURITY DEFINER trigger still records the app's own writes
    topic_id = app_conn.execute(text("SELECT id FROM topics LIMIT 1")).scalar()
    before = app_conn.execute(text("SELECT count(*) FROM audit_log")).scalar()
    app_conn.execute(text("UPDATE topics SET priority_score = priority_score + 1 WHERE id = :t"), {"t": topic_id})
    assert app_conn.execute(text("SELECT count(*) FROM audit_log")).scalar() == before + 1


def test_materialized_view_refresh_only_through_definer_function(app_conn):
    refused(app_conn, "REFRESH MATERIALIZED VIEW mv_course_dashboard", match="permission denied|must be owner")
    app_conn.execute(text("SELECT fn_refresh_course_dashboard()"))


def test_app_role_can_use_granted_routines(app_conn):
    course_id = app_conn.execute(text("SELECT id FROM courses WHERE code = 'CS302'")).scalar()
    assert app_conn.execute(text("SELECT pressure_status FROM fn_time_pressure(:c)"), {"c": course_id}).scalar()


# ------------------------------------------------------------------ console: row-level security

def test_console_teacher_sees_only_own_courses(pg_app, second_teacher):
    codes = {r["code"] for r in console(pg_app, "SELECT code FROM courses", "faculty@optiteach.edu")["rows"]}
    assert codes == {"CS302"}

    # Child tables inherit the parent's visibility through their policies
    units = console(pg_app, "SELECT count(*) AS n FROM units u JOIN courses c ON c.id = u.course_id", "faculty@optiteach.edu")
    all_units = console(pg_app, "SELECT count(*) AS n FROM units", "faculty@optiteach.edu")
    assert units["rows"] == all_units["rows"]


def test_console_admin_sees_every_course(pg_app, second_teacher):
    result = console(pg_app, "SELECT code FROM courses", "admin@optiteach.edu")
    assert {"CS302", "EE201"} <= {r["code"] for r in result["rows"]}
    assert result["scope"].startswith("all courses")


def test_console_rls_applies_through_views(pg_app, second_teacher):
    rows = console(pg_app, "SELECT DISTINCT code FROM v_course_progress", "faculty@optiteach.edu")["rows"]
    assert rows == [{"code": "CS302"}]


def test_console_users_table_hides_password_hashes_and_other_users(pg_app, second_teacher):
    with pytest.raises(ConsoleError, match="permission denied"):
        console(pg_app, "SELECT hashed_password FROM users", "faculty@optiteach.edu")
    emails = [r["email"] for r in console(pg_app, "SELECT email FROM users", "faculty@optiteach.edu")["rows"]]
    assert emails == ["faculty@optiteach.edu"]


# ------------------------------------------------------------------ console: attack attempts

@pytest.mark.parametrize("sql,match", [
    # Rewriting the settings the RLS policies read
    ("SELECT set_config('app.is_admin', 'true', true), code FROM courses", "permission denied"),
    ("SELECT query_to_xml('select * from courses', true, false, '')", "permission denied"),
    # Writes, even disguised inside a CTE
    ("WITH gone AS (DELETE FROM courses RETURNING id) SELECT * FROM gone", "read-only transaction"),
    # Statements the allow-list refuses outright
    ("SET app.is_admin = 'true'", "Only SELECT"),
    ("RESET ROLE", "Only SELECT"),
    ("DO $$ BEGIN END $$", "Only SELECT"),
    ("SELECT 1; DELETE FROM courses", "single statement"),
    ("UPDATE courses SET title = 'x'", "Only SELECT"),
])
def test_console_attacks_are_refused(pg_app, sql, match):
    with pytest.raises(ConsoleError, match=match):
        console(pg_app, sql, "faculty@optiteach.edu")


def test_console_statement_timeout(pg_app):
    with pytest.raises(ConsoleError, match="statement timeout"):
        console(pg_app, "SELECT pg_sleep(2)", "faculty@optiteach.edu", timeout_ms=200)


def test_console_semicolon_inside_literal_is_fine_and_explain_works(pg_app):
    assert console(pg_app, "SELECT 'a;b' AS s;", "faculty@optiteach.edu")["rows"] == [{"s": "a;b"}]
    plan = console(pg_app, "EXPLAIN SELECT * FROM class_sessions WHERE status = 'scheduled'", "faculty@optiteach.edu")
    assert plan["columns"] == ["QUERY PLAN"]


def test_console_leaves_no_state_behind(pg_app):
    console(pg_app, "SELECT 1", "faculty@optiteach.edu")
    with pg_app.connect() as conn:  # same pool: role and settings must be reset
        assert conn.execute(text("SELECT current_user")).scalar() == "optiteach_app"
        assert conn.execute(text("SELECT current_setting('app.teacher_id', true)")).scalar() in (None, "")
