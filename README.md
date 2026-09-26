# OptiTeach

Course planning for university teachers, built on PostgreSQL and MongoDB. A teacher imports a
syllabus, checks what was read, and gets a time plan for the semester and a lesson plan for every
period; after each class they record what was actually taught and how students did, and the next
plans adapt.

> *DBMS is the core. Optimization is the intelligence. The dashboard is the product.*

---

## What a teacher can do

| Screen | What it is for |
|---|---|
| **Today** | The next class: topic, any revision the class needs first, the period split into steps, and buttons to start, open or record it |
| **Calendar** | Every period of the course with its topic and status; record what was taught (unfinished topics can carry over to the next period) |
| **Lesson plans** | One plan per period; approve, reject or edit the timings. Every save is a new version with history and a diff. Attach slides, videos, links, datasets, code or formulas as class material |
| **Presenter** (`/present`) | Full-screen class mode: a timer per step, keyboard controls, and a high-contrast projector theme |
| **Courses** | Your courses and ones shared with you; the course page has an overview, a topic map, test results, progress and people (co-teachers and view-only colleagues) |
| **Curriculum** | Edit units, topics, concepts and prerequisites: reorder by dragging, add or remove prerequisite links (cycles are refused), adjust difficulty and importance |
| **Time plan** | How the semester's minutes are shared between topics, revision and tests, with the reason each topic gets its time |
| **Import syllabus** | PDF, text or Markdown in; units, topics, concepts and course outcomes out, checked by the teacher before anything is saved |
| **DBMS showcase** | The database work behind it all, shown live (below) |

Light, dark and projector themes; the layout works down to phone width.

### Under the hood
- **Syllabus extraction** is deterministic (no external AI API): unit and module headings, roman
  numerals, `Topic: concept, concept` lines, course outcomes with Bloom levels, and a prerequisite
  chain. If a syllabus can't be read the teacher gets a clear error, never invented data.
- **Time plan**: a mixed-integer program (SciPy MILP) with a two-tier objective that covers every
  topic's estimated periods before handing out extra ones by priority; revision (10%) and test (8%)
  time is set aside first. See [docs/mathematical_formulation.md](docs/mathematical_formulation.md).
- **Next class**: phases always add up to the period length; revision is added when a prerequisite
  scored below the course threshold; teaching methods are chosen from what worked in past classes.

### DBMS showcase (the graded core)
- **Schema** with live row counts, and an **ER diagram** generated from the database's own foreign keys
- **Normalization**: the 1NF and derived-attribute fixes (migration 0002), FDs and keys per table
- **19 SQL demos** incl. recursive CTEs, window functions, relational division, `EXCEPT`, with `EXPLAIN ANALYZE`
- **Server-side objects**: 3 views, a materialized view, 10 functions, a stored procedure, 18 triggers, 21 RLS policies
- **SQL console** running as a read-only role under row-level security, with attack examples PostgreSQL refuses
- **Transaction Lab**: atomicity, isolation levels, lost updates and deadlocks on real concurrent connections
- **MongoDB**: collection contracts, aggregation pipelines, curriculum graph versions and diffs
- **Audit trail** written by triggers, and a **cross-store consistency** check with repair

See **[docs/DBMS_REPORT.md](docs/DBMS_REPORT.md)** for the full write-up mapped to the evaluation criteria.

---

## Architecture

```
OptiMaximus/
├── backend/app/
│   ├── api/            # auth, courses (+ sessions, plan review), curriculum builder, members,
│   │                   # syllabus, exports, dbms, teaching_methods
│   ├── auth/           # bcrypt, JWT, login throttling, course-level access control, audit actor
│   ├── database/       # engine setup, config, MongoDB validators/indexes (mongo_schema.py)
│   ├── models/         # SQLAlchemy entities (mirrors the migrations)
│   ├── services/       # curriculum, assessment, lesson plan, session, artifact (MongoDB),
│   │                   # SQL console, transaction lab, DB catalog, DBMS demo queries
│   ├── optimization/   # time allocator (MILP), class optimizer, scoring, revision, methods
│   └── nlp/            # deterministic syllabus extraction
├── backend/tests/      # 120 tests: SQLite suite + PostgreSQL + real MongoDB
├── database/
│   ├── migrations/     # Alembic 0001-0005 (source of truth for the schema)
│   ├── scripts/        # backup.py, restore.py, export_sql_reference.py
│   ├── sql/            # GENERATED: 01_schema.sql (pg_dump), 02_demo_queries.sql
│   ├── erd/            # GENERATED: schema_erd.mermaid
│   └── seed/           # sample CS302 course, teacher + admin accounts
├── frontend/           # Next.js 15: Today, calendar, lesson plans, presenter, courses, curriculum,
│                       # time plan, syllabus import, DBMS showcase
├── docs/               # DBMS_REPORT.md, api_documentation.md, architecture, formulation, manual
├── deploy/             # Caddyfile for the single-origin reverse proxy
├── docker-compose.yml  # PostgreSQL, MongoDB, API, web, Caddy
└── .github/workflows/  # CI: lint, migrations, tests, frontend build, docker compose smoke test
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 15 (App Router), React 19, TypeScript, Lucide icons, Mermaid (ER diagram) |
| **Backend** | FastAPI, Uvicorn, Pydantic v2 |
| **Relational DB** | PostgreSQL 17 via SQLAlchemy 2 + Alembic (SQLite fallback for zero-config runs) |
| **Document DB** | MongoDB 8 via PyMongo (MongoMock fallback) |
| **Optimization** | SciPy MILP, NetworkX |
| **Security** | bcrypt, JWT (HS256), PostgreSQL roles, row-level security, column privileges |
| **Testing / CI** | Pytest, Ruff, ESLint, headless Chromium checks, GitHub Actions with database service containers |
| **Deployment** | Docker multi-stage images, Next.js standalone output, Caddy reverse proxy |

---

## Getting started

### Quick start with Docker

```bash
docker compose up -d --build
# open http://localhost:8080  (faculty@optiteach.edu / admin123)
```

This starts PostgreSQL 17, MongoDB 8, the API (migrations run automatically, the sample
course is loaded only into an empty database), the web app, and Caddy as a single-origin
reverse proxy. Put `POSTGRES_PASSWORD`, `APP_DB_PASSWORD` and `SECRET_KEY` in a `.env`
file next to `docker-compose.yml` before sharing the server.

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
| Authorization | Roles `teacher` / `admin`; teachers reach their own courses and ones shared with them (others' IDs return 404); co-teachers can edit, viewers only read; nested IDs (assessment, topic) must belong to the course in the URL |
| Database login | API connects as `optiteach_app`: DML only — no DDL, no `TRUNCATE`, cannot write `audit_log` |
| Audit trail | Row triggers record every change with the acting user (`app.user_id`); the trigger is `SECURITY DEFINER`, so the log is append-only for the app |
| SQL console | Read-only transaction, `SET LOCAL ROLE optiteach_readonly`, row-level security per teacher, column privileges hide `users.hashed_password`, statement timeout + row cap |
| Input | Pydantic validation, parameterized queries only, upload size/type limits and rate limit, HTML-escaped printable exports, explicit CORS origins |

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

# Lint
ruff check backend database ai
cd frontend && npm run lint && npx tsc --noEmit

# Regenerate the reference SQL / ER diagram after a migration
python database/scripts/export_sql_reference.py

# Backup both stores, restore into a scratch database
python database/scripts/backup.py
python database/scripts/restore.py backups/<timestamp> --target-db optiteach_copy
```

---

## API

Listed in **[docs/api_documentation.md](docs/api_documentation.md)** (generated from the
OpenAPI schema) and browsable at `http://localhost:8000/docs`. All routes except `/`, `/health`,
login and register require a bearer token.

---

## Syllabus extraction details

The NLP extraction engine uses **deterministic rule-based parsing** (no external AI APIs required):

- **Unit/Module Detection**: Regex patterns for `UNIT 1:`, `MODULE I:`, `CHAPTER III`, etc.
- **Roman Numeral Handling**: Accurate I-X conversion
- **Topic Parsing**: Colon-separated (`Topic: Concept1, Concept2`) and comma-delimited formats
- **Concept Classification**: Automatic type inference (conceptual, analytical, practical, procedural, problem_solving)
- **Bloom's Taxonomy**: Verb-based classification of course outcomes
- **Prerequisites**: each concept in a topic builds on the one before it (edit them on the Curriculum page)
- **Section Cutoff**: Stops parsing before TEXT BOOKS / REFERENCES sections
- **No Fallbacks**: Raises explicit `ValueError` with guidance if extraction fails

---

## Tests

120 tests (`python -m pytest backend/tests`):

| Area | What is checked |
|------|-----------------|
| Core (SQLite) | extraction, optimizer invariants, assessment feedback loop, demo queries, exports |
| Security | auth required everywhere, bcrypt + legacy upgrade, throttling, course isolation, nested-ID checks, XSS escaping, upload limits |
| PostgreSQL objects | generated column, preference table, every trigger, functions, procedure, views, materialized view |
| PostgreSQL security | app-role limits, append-only audit, RLS isolation, hidden password hashes, console attack attempts, timeouts |
| Concurrency | optimistic-lock conflicts with Mongo compensation, two-thread race on recording a class, carry-over of unfinished topics, Transaction Lab scenarios |
| Curriculum builder | reordering around the `UNIQUE (unit_id, order_index)` constraint, prerequisite cycles refused, edits audited |
| Co-teaching | co-teachers can edit, viewers are read-only (403), the owner can't be added as a member, RLS scope in the SQL console |
| Lesson material | resource validation per kind, versions and diffs in MongoDB |
| Optimizer | MILP invariants and the cover-every-topic-first allocation |
| MongoDB | graph versions/diffs, plan history/diffs, pipelines, consistency repair; validator, unique and TTL indexes on a real server |

PostgreSQL and MongoDB tests create throwaway databases and are skipped if no server is reachable.

---

## Authors

- **Vasa Shashank** — Full-stack development & system design

---

## License

This project is developed for educational purposes as part of an academic engineering lab exercise.
