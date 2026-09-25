"""
Read-only SQL console for the DBMS Insights page.

The database, not this module, is what keeps the console safe. Each statement runs in
its own transaction that is:
  * READ ONLY                        -> no writes, even through a CTE
  * SET LOCAL ROLE optiteach_readonly -> SELECT-only grants, no users.hashed_password
  * scoped by row-level security     -> app.teacher_id / app.is_admin set *before* the
                                        role switch; the console role cannot call
                                        set_config() to change them (migration 0003)
  * bounded by statement_timeout and a row cap, then always rolled back.
The statement allow-list below only improves error messages and blocks DO blocks and
multi-statement batches, which could otherwise run several commands in one request.
"""
import re
import time
from typing import Any, Dict, Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.entities import Teacher, User

CONSOLE_ROLE = "optiteach_readonly"
MAX_SQL_LENGTH = 5000
MAX_ROWS = 500
DEFAULT_TIMEOUT_MS = 3000
_ALLOWED_START = re.compile(r"^\s*(SELECT|WITH|EXPLAIN|TABLE|VALUES)\b", re.IGNORECASE)
_LEADING_COMMENTS = re.compile(r"^\s*(--[^\n]*\n|/\*.*?\*/)*", re.DOTALL)


class ConsoleError(ValueError):
    """Rejected statement or database error, reported to the user as a 400."""


def _normalize(sql: str) -> str:
    statement = (sql or "").strip()
    if not statement:
        raise ConsoleError("Enter a SQL statement")
    if len(statement) > MAX_SQL_LENGTH:
        raise ConsoleError(f"Statement is longer than {MAX_SQL_LENGTH} characters")
    statement = statement.rstrip().rstrip(";").rstrip()
    if ";" in _strip_literals(statement):
        raise ConsoleError("Only a single statement can be run at a time")
    if not _ALLOWED_START.match(_LEADING_COMMENTS.sub("", statement)):
        raise ConsoleError("Only SELECT, WITH, EXPLAIN, TABLE and VALUES statements are allowed")
    return statement


def _strip_literals(sql: str) -> str:
    """Remove quoted strings/identifiers and comments so ';' inside them isn't counted."""
    sql = re.sub(r"'(?:[^']|'')*'", "''", sql)
    sql = re.sub(r'"(?:[^"]|"")*"', '""', sql)
    sql = re.sub(r"--[^\n]*", "", sql)
    return re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)


def run_console_query(db: Session, sql: str, user: User, timeout_ms: int = DEFAULT_TIMEOUT_MS) -> Dict[str, Any]:
    if db.bind.dialect.name != "postgresql":
        raise ConsoleError("The SQL console requires PostgreSQL (roles and row-level security)")
    statement = _normalize(sql)

    is_admin = user.role == "admin"
    teacher: Optional[Teacher] = db.query(Teacher).filter(Teacher.user_id == user.id).first()
    teacher_id = teacher.id if teacher else ""

    # A separate pooled connection: the request's own session stays untouched
    with db.bind.connect() as conn:
        trans = conn.begin()
        try:
            conn.execute(text("SET TRANSACTION READ ONLY"))
            conn.execute(text("SELECT set_config('app.teacher_id', :t, true), set_config('app.is_admin', :a, true)"),
                         {"t": teacher_id, "a": "true" if is_admin else "false"})
            conn.execute(text(f"SET LOCAL statement_timeout = {int(timeout_ms)}"))
            conn.execute(text(f"SET LOCAL ROLE {CONSOLE_ROLE}"))

            cursor = conn.connection.cursor()
            started = time.perf_counter()
            try:
                cursor.execute(statement)  # raw DB-API call, no parameters: '%' and ':' stay literal
                columns = [c[0] for c in cursor.description] if cursor.description else []
                fetched = cursor.fetchmany(MAX_ROWS + 1) if cursor.description else []
            except Exception as exc:
                raise ConsoleError(_pg_message(exc)) from exc
            finally:
                elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
                cursor.close()
        finally:
            trans.rollback()

    return {
        "columns": columns,
        "rows": [dict(zip(columns, row)) for row in fetched[:MAX_ROWS]],
        "row_count": min(len(fetched), MAX_ROWS),
        "truncated": len(fetched) > MAX_ROWS,
        "execution_time_ms": elapsed_ms,
        "executed_as": CONSOLE_ROLE,
        "scope": "all courses (admin)" if is_admin else "your courses (row-level security)",
    }


def _pg_message(exc: Exception) -> str:
    message = str(getattr(exc, "pgerror", None) or exc).strip()
    return message.splitlines()[0] if message else exc.__class__.__name__
