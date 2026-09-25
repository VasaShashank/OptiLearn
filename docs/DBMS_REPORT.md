# OptiTeach — DBMS Report

This report follows the evaluation list in the master plan (§32). Every claim points at the
artifact that demonstrates it; most can also be shown live on the **DBMS Insights** page.

| Evaluation item | Where to show it |
|---|---|
| ER diagram | DBMS page → *ER Diagram*; `database/erd/schema_erd.mermaid` |
| Relational schema | DBMS page → *Schema*; `database/sql/01_schema.sql`; `database/migrations/versions/` |
| Normalization to 3NF/BCNF | DBMS page → *Normalization*; migration `0002` |
| SQL powering the dashboard | DBMS page → *SQL Queries* (19 queries, `EXPLAIN ANALYZE`); `database/sql/02_demo_queries.sql` |
| Transactions & concurrency | DBMS page → *Transactions*; §5 below |
| Security | DBMS page → *SQL Console*, *Database Objects → Roles/RLS*; §6 below |
| Why some data is in NoSQL | DBMS page → *MongoDB*; §7 below |
| Integrated SQL + NoSQL | *Audit & Consistency* → cross-store check; §7.3 |

---

## 1. Architecture

```
Next.js dashboard ──JWT──▶ FastAPI ──▶ PostgreSQL 17  (source of truth: academic state)
                                   │     roles, RLS, triggers, views, procedures
                                   └──▶ MongoDB 8     (versioned documents, drafts)
```

* The API connects to PostgreSQL as **`optiteach_app`** (least privilege). Schema changes run
  only through Alembic as the owner (`MIGRATION_DATABASE_URL`).
* Migrations: `0001` tables & constraints → `0002` normalization fixes + server-side objects →
  `0003` roles, privileges, RLS → `0004` optimistic locking + transaction lab table.
  Every migration has a working `downgrade()`; CI runs upgrade → downgrade → upgrade → `alembic check`.
* A zero-config SQLite + MongoMock fallback exists for quick starts and the portable part of
  the test suite; everything in §3–§6 requires PostgreSQL.

## 2. Conceptual and relational model

22 application relations (plus the `txn_lab_accounts` scratch table used by the Transaction Lab). Core hierarchy: `users 1–1 teachers 1–N courses 1–N units 1–N topics 1–N concepts`.
Course-level entities: `sections`, `teacher_constraints` (1–1), `course_outcomes`,
`class_sessions`, `assessments → questions`. Associative entities for M:N relationships:

| Relationship | Associative table | Extra attribute |
|---|---|---|
| concept ↔ concept (prerequisite, self-referencing) | `prerequisites` | — |
| concept ↔ course outcome | `concept_outcomes` | — |
| question ↔ concept | `question_concepts` | `weightage` |
| constraint set ↔ teaching method | `teacher_preferred_methods` | `rank` |
| concept ↔ assessment (results) | `performance` | score, sample size, errors |

**Constraints (declared, not just validated in Python; counted from `pg_constraint`):** 23 primary keys (one per table), 27 foreign keys with
explicit `ON DELETE` (`CASCADE` for owned children, `SET NULL` for `class_sessions.current_topic_id`
and `teaching_sessions.method_id`), 15 `UNIQUE` constraints (e.g. `(course_id, session_number)`,
`(teacher_id, code, semester)`), and 40 `CHECK` constraints (value ranges, enumerations such as
`status IN (...)`, `end_date >= start_date`, `concept_id <> prerequisite_id`).

## 3. Normalization

**Violations found in the original schema and fixed in migration `0002`:**

1. **1NF** — `teacher_constraints.preferred_methods_json` stored a JSON list of method names.
   Replaced by `teacher_preferred_methods(constraint_id, method_id, rank)` with
   `PK(constraint_id, method_id)` and `UNIQUE(constraint_id, rank)`. The migration moves existing
   data with `jsonb_array_elements_text(...) WITH ORDINALITY`, preserving list order as `rank`.
2. **Derived attribute** — `courses.total_available_minutes` is determined by
   `{total_classes, period_duration}`, a dependency on a non-key set of attributes that allowed an
   update anomaly. It is now `GENERATED ALWAYS AS (total_classes * period_duration) STORED`;
   PostgreSQL rejects direct writes (`test_total_available_minutes_is_generated`).

**Result:** every table's non-trivial FDs have a candidate key as determinant (BCNF), e.g.
`courses`: `id` and `(teacher_id, code, semester)`; `topics`: `id` and `(unit_id, order_index)`;
`class_sessions`: `id` and `(course_id, session_number)`.

**Controlled redundancy, documented:** `performance.weakness_flag` is derivable from the score and
the course threshold. It is kept so a **partial index** (`WHERE weakness_flag`) can serve revision
queries, and triggers keep it correct (see §4). `audit_log` (JSONB row images), MongoDB lesson-plan
content and `mv_course_dashboard` are intentionally non-normalized; the reasons are on the
*Normalization* tab.

## 4. SQL and server-side objects

**Queries** (19, all parameterized; tags shown on the page): joins of up to six tables,
`GROUP BY/HAVING`, conditional aggregation, **recursive CTE** (curriculum depth over the
prerequisite DAG), **window functions** (`RANK`, running `SUM ... ROWS BETWEEN`, `LAG`),
**relational division** (double `NOT EXISTS`), **set difference** (`EXCEPT`), and queries over the
views, function, materialized view and audit log below. Any query can be run with
`EXPLAIN (ANALYZE, BUFFERS)` from the page.

| Kind | Objects |
|---|---|
| Views | `v_course_progress`, `v_concept_mastery` (LATERAL + recursive CTE for transitive dependents), `v_teaching_history` — all `security_invoker` |
| Materialized view | `mv_course_dashboard` + unique index → `REFRESH ... CONCURRENTLY` via `fn_refresh_course_dashboard()` after writes |
| Functions | `fn_prerequisite_chain(concept)` (recursive, shortest path per ancestor), `fn_time_pressure(course)` |
| Procedure | `sp_record_concept_performance(...)` — row lock + `INSERT ... ON CONFLICT DO UPDATE`; the API calls it when recording results |
| Triggers | `updated_at` maintenance; **audit** on 10 tables; **weakness flag** from the course threshold; **threshold cascade**; **prerequisite guard** (same course + cycle detection with a recursive CTE, serialised per course with `pg_advisory_xact_lock`) |
| Indexes | FK indexes PostgreSQL does not create automatically; partial indexes `ix_class_sessions_upcoming (WHERE status='scheduled')`, `ix_performance_weak (WHERE weakness_flag)` |

All functions pin `search_path` (prevents search-path hijacking; also required because PostgreSQL 17
refreshes materialized views under a restricted search path).

## 5. Transactions and concurrency

| Mechanism | Where |
|---|---|
| **Atomic multi-step updates** | Recording assessment results: row lock on the assessment, one `SAVEPOINT` per concept (a bad item is reported, not fatal), re-scoring, single commit. Post-class record: session → completed, teaching record, topic progress, plan status in one transaction. |
| **Pessimistic locking** | `SELECT ... FOR UPDATE` on the course row during re-optimization and curriculum confirmation; on the class session when recording it. Test: two threads record the same class → exactly one succeeds. |
| **Optimistic locking** | `lesson_plans.version` (`version_id_col`): `UPDATE ... WHERE id = ? AND version = ?`. Stale saves return **409** with the current version; the UI offers "Load latest". |
| **Constraint as backstop** | `UNIQUE(teaching_sessions.session_id)` rejects a duplicate record if a race ever passes the lock. |
| **Read-only GET** | `GET /optimization` computes without writing (it previously wrote on every read). |
| **Transaction Lab** (live) | Atomicity (CHECK violation mid-transfer → full rollback), non-repeatable read under READ COMMITTED vs REPEATABLE READ, lost update (reproduced, then prevented by REPEATABLE READ + retry and by atomic `UPDATE`), deadlock detection (victim aborted). |

## 6. Security

| Layer | Implementation |
|---|---|
| Passwords | bcrypt, cost 12, per-password salt; legacy SHA-256 hashes upgraded on next login |
| Authentication | JWT bearer tokens on all routes except health/login/register; login throttled per IP + email; same error for unknown email and wrong password |
| Authorization | Roles `teacher` / `admin`; course-level access (teachers: own courses; other IDs return 404); nested IDs validated against the URL's course |
| Least privilege | `optiteach_app`: DML only — no DDL, no `TRUNCATE`, no access to `alembic_version`, no writes to `audit_log` |
| Tamper-evident audit | `fn_audit_row_change()` is `SECURITY DEFINER`, so it can append to `audit_log` while the app cannot modify it; each row records the acting user from `app.user_id` (set transaction-locally per request) |
| SQL console | `READ ONLY` transaction + `SET LOCAL ROLE optiteach_readonly` + **row-level security** (20 policies; child tables defer to parent visibility) + column privileges hiding `users.hashed_password` + statement timeout + row cap. `set_config()` and `query_to_xml()` are revoked from the console role so it cannot rewrite the settings RLS reads. |
| SQL injection | Parameterized queries throughout (ORM or bound `text()` parameters) |
| Input hardening | Pydantic validation mirroring the CHECK constraints; upload size/type/magic-byte checks; HTML-escaped printable exports (stored-XSS fix); explicit CORS origins |

`backend/tests/test_postgres_security.py` attempts each attack against the real roles and asserts
that PostgreSQL refuses it.

## 7. NoSQL (MongoDB)

### 7.1 What lives where

| Data | Store | Reason |
|---|---|---|
| Courses, curriculum, sessions, assessments, performance, users | PostgreSQL | Relational integrity, joins, constraints, transactions |
| Lesson-plan content, every version | MongoDB `lesson_plan_documents` | Nested (phases, lists), read/written whole, append-only versions; PostgreSQL keeps pointer + status + version |
| Curriculum graph snapshots | MongoDB `curriculum_graphs` | Whole-graph snapshot per confirmation for history and diffs; the live graph stays relational |
| Raw NLP extraction output | MongoDB `nlp_extractions` | Shape follows the extractor; unconfirmed drafts expire |

### 7.2 The document store still enforces a contract

* `$jsonSchema` validators (validation level *moderate*) on all three collections.
* Unique **partial** indexes `(lesson_plan_id, version)` and `(course_id, version)`.
* **TTL index** on `nlp_extractions.extracted_at` (90 days; values must be BSON dates).
* Five aggregation pipelines (`$unwind`, `$group` with `$first/$addToSet/$cond`, `$replaceRoot`,
  `$regex`, `$size`) are the NoSQL counterpart of the SQL demos.

### 7.3 Keeping two stores consistent

There is no shared transaction, so writes are ordered and compensated: the new Mongo document is
written first, then the SQL pointer is committed; if the commit fails (including a lost
optimistic-lock race), the document is deleted again. A **consistency report** compares both sides
(dangling pointers, orphaned documents, stale snapshots) and an admin **repair** removes orphans.
On the development database the first run found real drift — documents left behind by course
deletions — which is why the seed now deletes a course's Mongo artifacts before the course.

## 8. Operations

* **Backup / restore**: `database/scripts/backup.py` (pg_dump custom format in one snapshot + Mongo
  Extended JSON + manifest) and `restore.py` (pg_restore `--single-transaction`, validators and
  indexes re-applied, counts checked against the manifest).
* **Reference artifacts** are generated, never hand-edited: `database/scripts/export_sql_reference.py`
  writes `01_schema.sql` (pg_dump incl. policies/grants), `02_demo_queries.sql` and the ER diagram.
* **CI** (`.github/workflows/ci.yml`): PostgreSQL 17 + MongoDB 8 service containers; migrations
  up/down/up + drift check; seed as `optiteach_app`; full test suite; frontend typecheck + build.

## 9. Tests

102 tests (`python -m pytest backend/tests`): the portable suite on a throwaway SQLite database,
plus PostgreSQL tests on a freshly migrated `optiteach_test` database (triggers, functions,
procedure, views, generated column, roles, RLS and attack attempts, concurrency races, the
Transaction Lab) and MongoDB tests on a throwaway database (validators, unique and TTL indexes).
