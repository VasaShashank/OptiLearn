# OptiTeach — Intelligent Course Teaching & Optimization Platform

> A DBMS-centric, AI-powered platform for intelligent syllabus extraction, curriculum optimization, and adaptive teaching plan generation.

---

## 🎯 Project Overview

**OptiTeach** is a full-stack web application designed for university faculty to streamline course planning and delivery. It combines **deterministic NLP-based syllabus extraction**, **mathematical time-allocation optimization**, and a **rich interactive dashboard** to transform raw syllabus documents into structured, optimized teaching schedules.

### Core Philosophy
> *"DBMS is the CORE. AI/Optimization is the INTELLIGENCE. Dashboard is the PRODUCT."*

---

## ✨ Key Features

### 📄 Syllabus Upload & Intelligent Extraction
- Upload PDF or paste raw syllabus text
- High-fidelity deterministic NLP extraction of:
  - Course code, title, and metadata
  - Units / Modules with roman numeral support
  - Granular topics and concepts with difficulty/importance scoring
  - Course Outcomes (COs) with Bloom's taxonomy alignment
  - Prerequisite Directed Acyclic Graphs (DAGs) across concepts
- **No synthetic fallbacks** — if extraction fails, clear error messages are displayed instead of fabricated data
- Smart textbook/reference section cutoff to prevent false positives

### 📊 Curriculum Knowledge Graph
- Interactive DAG visualization of concept dependencies
- Bottleneck detection for prerequisite chains
- Per-concept difficulty, importance, and Bloom level metadata

### ⚡ Time Allocation Optimization
- Mathematical optimizer distributing available teaching minutes across topics
- Priority scoring based on concept difficulty, importance, and prerequisites
- Budget allocation for revision and assessments
- Time pressure status indicators (healthy / balanced / high pressure)

### 📋 Class Session Optimizer
- Per-session phase planning (warm-up, instruction, practice, assessment, wrap-up)
- Strict invariant: phase durations sum exactly to period duration
- Automatic revision injection when weak prerequisites are detected

### 📝 Lesson Plans with Human-in-the-Loop Review
- Generated plans start as **drafts**; the teacher approves, rejects or edits them
- Every save is a new immutable version in MongoDB with who/when/why, plus a field-level diff
- Optimistic locking: a save based on a stale version is refused (409) and the UI offers the latest

### 👨‍🏫 Teacher Workflow
- **Next Class** card on the dashboard: topic, revision decision, methods, period timeline and the reason
- **Teaching Calendar**: every period by status; record what was actually taught
- **Assessment results** per concept feed weakness flags, priorities and alerts (re-optimization)

### 🗄️ DBMS Showcase (the graded core)
- **Schema** with live row counts, **ER diagram** generated from the database's own foreign keys
- **Normalization**: the 1NF and derived-attribute fixes (migration 0002), FDs and keys per table
- **19 SQL demos** incl. recursive CTEs, window functions, relational division, `EXCEPT`, with `EXPLAIN ANALYZE`
- **Server-side objects**: views, a materialized view, functions, a stored procedure, 16 triggers, RLS policies, indexes
- **SQL console** running as a read-only role under row-level security, with attack examples PostgreSQL refuses
- **Transaction Lab**: atomicity, isolation levels, lost updates and deadlocks on real concurrent connections
- **MongoDB**: collection contracts, aggregation pipelines, curriculum graph versions and diffs
- **Audit trail** written by triggers, and a **cross-store consistency** check with repair

See **[docs/DBMS_REPORT.md](docs/DBMS_REPORT.md)** for the full write-up mapped to the evaluation criteria.

---

## 🏗️ Architecture

```
OptiMaximus/
├── backend/app/
│   ├── api/            # auth, courses (+ sessions, plan review), syllabus, exports, dbms, teaching_methods
│   ├── auth/           # bcrypt, JWT, login throttling, course-level access control, audit actor
│   ├── database/       # engine setup, config, MongoDB validators/indexes (mongo_schema.py)
│   ├── models/         # SQLAlchemy entities (mirrors the migrations)
│   ├── services/       # curriculum, assessment, lesson plan, session, artifact (MongoDB),
│   │                   # SQL console, transaction lab, DB catalog, DBMS demo queries
│   ├── optimization/   # time allocator (MILP), class optimizer, scoring, revision, methods
│   └── nlp/            # deterministic syllabus extraction
├── backend/tests/      # 102 tests: SQLite suite + PostgreSQL + real MongoDB
├── database/
│   ├── migrations/     # Alembic 0001-0004 (source of truth for the schema)
│   ├── scripts/        # backup.py, restore.py, export_sql_reference.py
│   ├── sql/            # GENERATED: 01_schema.sql (pg_dump), 02_demo_queries.sql
│   ├── erd/            # GENERATED: schema_erd.mermaid
│   └── seed/           # sample CS302 course, teacher + admin accounts
├── frontend/           # Next.js 15: login, dashboard, courses, lesson plans, calendar, DBMS showcase
├── docs/               # DBMS_REPORT.md, api_documentation.md, architecture, formulation, manual
└── .github/workflows/  # CI: PostgreSQL 17 + MongoDB 8 services, migrations, tests, frontend build
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Lucide icons, Mermaid (ER diagram) |
| **Backend** | FastAPI, Uvicorn, Pydantic v2 |
| **Relational DB** | PostgreSQL 17 via SQLAlchemy 2 + Alembic (SQLite fallback for zero-config runs) |
| **Document DB** | MongoDB 8 via PyMongo (MongoMock fallback) |
| **Optimization** | SciPy MILP, NetworkX |
| **Security** | bcrypt, JWT (HS256), PostgreSQL roles, row-level security, column privileges |
| **Testing / CI** | Pytest, headless Chromium checks, GitHub Actions with database service containers |

---

## 🚀 Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL 15+ and MongoDB 6+ (recommended — views, triggers, stored procedures and
  row-level security only exist on PostgreSQL). Without them the API falls back to
  SQLite + in-memory MongoMock so it still starts with zero setup.

### Backend Setup

All commands run from the **repository root**.

```bash
# 1. Virtual environment + dependencies
python -m venv .venv
.venv\Scripts\activate            # Windows  (source .venv/bin/activate on macOS/Linux)
pip install -r backend/requirements.txt

# 2. Configuration (optional — defaults match a local PostgreSQL with user/password postgres)
copy backend\.env.example backend\.env

# 3. Create the database and apply the schema (PostgreSQL). Migrations run as the
#    owner (MIGRATION_DATABASE_URL) and create the least-privilege optiteach_app role
#    that the API itself connects as (DATABASE_URL).
createdb -U postgres optiteach
alembic -c database/migrations/alembic.ini upgrade head

# 4. Seed the sample CS302 course (runs as optiteach_app)
python -m database.seed.seed_data

# 5. Start the API server
cd backend
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` with interactive docs at `/docs`.
Demo logins: `faculty@optiteach.edu` / `admin123` (teacher, owns CS302) and
`admin@optiteach.edu` / `admin123` (administrator, sees every course).

### Security model

| Layer | Mechanism |
|-------|-----------|
| Passwords | bcrypt (per-password salt, cost 12); legacy SHA-256 hashes upgraded on next login |
| API authentication | JWT bearer tokens on every route except `/`, `/health`, login and register; login throttled per IP + email |
| Authorization | Roles `teacher` / `admin`; teachers reach only their own courses (others' IDs return 404); nested IDs (assessment, topic) must belong to the course in the URL |
| Database login | API connects as `optiteach_app`: DML only — no DDL, no `TRUNCATE`, cannot write `audit_log` |
| Audit trail | Row triggers record every change with the acting user (`app.user_id`); the trigger is `SECURITY DEFINER`, so the log is append-only for the app |
| SQL console | Read-only transaction, `SET LOCAL ROLE optiteach_readonly`, row-level security per teacher, column privileges hide `users.hashed_password`, statement timeout + row cap |
| Input | Pydantic validation, parameterized queries only, upload size/type limits, HTML-escaped printable exports, explicit CORS origins |

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

### Running Tests & Maintenance

```bash
# From the repository root. Tests use their own throwaway SQLite DB + MongoMock,
# so they never touch your development database.
python -m pytest backend/tests -v

# Regenerate the reference SQL / ER diagram after a migration
python database/scripts/export_sql_reference.py

# Backup both stores, restore into a scratch database
python database/scripts/backup.py
python database/scripts/restore.py backups/<timestamp> --target-db optiteach_copy
```

---

## 📡 API Endpoints

46 operations, listed in **[docs/api_documentation.md](docs/api_documentation.md)** (generated from the
OpenAPI schema) and browsable at `http://localhost:8000/docs`. All routes except `/`, `/health`,
login and register require a bearer token.

---

## 🔬 Syllabus Extraction Details

The NLP extraction engine uses **deterministic rule-based parsing** (no external AI APIs required):

- **Unit/Module Detection**: Regex patterns for `UNIT 1:`, `MODULE I:`, `CHAPTER III`, etc.
- **Roman Numeral Handling**: Accurate I-X conversion
- **Topic Parsing**: Colon-separated (`Topic: Concept1, Concept2`) and comma-delimited formats
- **Concept Classification**: Automatic type inference (conceptual, analytical, practical, procedural, problem_solving)
- **Bloom's Taxonomy**: Verb-based classification of course outcomes
- **Prerequisite DAG**: Sequential concept chaining within and across units
- **Section Cutoff**: Stops parsing before TEXT BOOKS / REFERENCES sections
- **No Fallbacks**: Raises explicit `ValueError` with guidance if extraction fails

---

## 🧪 Test Suite

102 tests (`python -m pytest backend/tests`):

| Area | What is checked |
|------|-----------------|
| Core (SQLite) | extraction, optimizer invariants, assessment feedback loop, demo queries, exports |
| Security | auth required everywhere, bcrypt + legacy upgrade, throttling, course isolation, nested-ID checks, XSS escaping, upload limits |
| PostgreSQL objects | generated column, preference table, every trigger, functions, procedure, views, materialized view |
| PostgreSQL security | app-role limits, append-only audit, RLS isolation, hidden password hashes, console attack attempts, timeouts |
| Concurrency | optimistic-lock conflicts with Mongo compensation, two-thread race on recording a class, Transaction Lab scenarios |
| MongoDB | graph versions/diffs, plan history/diffs, pipelines, consistency repair; validator, unique and TTL indexes on a real server |

PostgreSQL and MongoDB tests create throwaway databases and are skipped if no server is reachable.

---

## 👥 Authors

- **Vasa Shashank** — Full-stack development & system design

---

## 📄 License

This project is developed for educational purposes as part of an academic engineering lab exercise.
