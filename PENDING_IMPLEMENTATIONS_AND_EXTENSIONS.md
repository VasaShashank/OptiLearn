# 📌 OptiTeach / OptiLearn — Pending Implementations & Feature Extensions Roadmap

> **Document Status:** Active Engineering Roadmap (Updated)  
> **Philosophy:** *DBMS is the Core. AI/Optimization is the Intelligence. Dashboard is the Product.*

---

## 🧭 Executive Summary of Completed Architecture

The following core modules are **fully implemented, tested, and verified**:
- ✅ **Deterministic & Hybrid Extraction Engine**: Regex/NLP parser with confidence scoring and fallback synthesis (`ai/extractors/`).
- ✅ **Normalized 3NF Relational Core + Alembic Migrations**: PostgreSQL / SQLite schema with foreign keys, check constraints, versioned Alembic migrations (`database/migrations/`).
- ✅ **Decoupled Architecture**: Repository layer (`CourseRepository`, `CurriculumRepository`, `AssessmentRepository`, `LessonPlanRepository`) and standalone utilities (`roman_numerals`, `graph_utils`, `datetime_helpers`, `math_formatting`).
- ✅ **Operations Research Optimization Engine**: Exact Mixed-Integer Linear Programming solver (`scipy.optimize.milp`) adhering to discrete period integrality and cognitive threshold constraints.
- ✅ **Academic Calendar & Disruption Catch-Up Engine**: Timetable slot resolution (MWF/TTh), holiday exclusion mapping, and dynamic rescheduling acceleration when classes are lost.
- ✅ **AI & Curriculum Intelligence**: Bloom's Taxonomy question generator (`question_generator.py`), pedagogy method advisor (`pedagogy_advisor.py`), and semantic prerequisite DAG validator (`prerequisite_graph.py`).
- ✅ **Analytics & Drift Detection**: Real-time student performance drift tracking and curriculum pacing velocity deviation models.
- ✅ **Multi-Format Exports**: RFC 5545 iCalendar (`.ics`), printable HTML lesson plans, and NBA / ABET outcome attainment matrix endpoints.
- ✅ **Next.js 15 Web Dashboard**: Multi-period lesson plan selector (Periods 1..40), DAG curriculum graph, and DBMS query runner.

---

## Remaining work

### LMS integration (not started)
- [ ] **LTI 1.3 / REST sync with Canvas, Moodle or Google Classroom**: push units as LMS modules,
  push generated quiz questions into question banks, and pull gradebook results back so they feed
  the revision engine the way manually entered test results do today. Needs a test LMS instance
  and developer credentials, so it was left out of this round.

### Smaller follow-ups
- [ ] Static type checking (`mypy`) for the backend; Ruff and ESLint already run in CI.
- [ ] The lesson-plan generator's wording is templated; a richer generator (or an LLM behind the
  same `LessonPlanUpdate` contract and teacher review) would make plans read less mechanically.

---

## Completed on the feature/dbms-phases branch

### Database core
- **PostgreSQL-owned schema**: Alembic migrations 0001–0005 with working downgrades; normalization fixes
  (1NF preference table, generated `total_available_minutes`); 3 views, a materialized view, 10
  functions, a stored procedure, 18 triggers, JSONB audit log, partial and FK indexes.
- **Security**: bcrypt, JWT on every route, login throttling, upload rate limit, course-level
  authorization, least-privilege `optiteach_app` role, append-only audit via `SECURITY DEFINER`,
  21 row-level security policies for a read-only SQL console, upload limits, stored-XSS fix, explicit CORS.
- **Transactions**: row locks, savepoints, optimistic locking with 409 handling, two-phase reorder
  around a UNIQUE constraint, topic carry-over, Transaction Lab.
- **MongoDB**: validators, unique/TTL indexes, lesson-plan version history + diffs, typed class
  material (slides, video, link, dataset, code, formula), curriculum graph snapshots + diffs,
  aggregation pipelines, cross-store consistency check/repair.

### Features from the original roadmap
- **Live presenter mode**: full-screen class view with a per-step timer, extend-by-5-minutes,
  keyboard controls and a projector theme; unfinished topics carry over to the next period.
- **Curriculum builder**: drag-and-drop topic order, concept editing, prerequisite links with cycle
  detection in the API and a database trigger as the backstop.
- **Frontend auth and themes**: sign-in / create-account page, protected routes, light / dark /
  projector themes.
- **Co-teaching**: `course_members` with co-teacher and viewer roles, enforced in the API and in RLS.
- **Time plan**: MILP allocation reworked so every topic's estimate is covered before extra periods
  are handed out by priority.
- **Plain-language UI**: every teacher-facing screen reworded and redesigned around the teacher's
  tasks (Today, Calendar, Lesson plans, Courses, Curriculum, Time plan, Import syllabus).

### Operations
- Backup/restore scripts, generated reference SQL + ER diagram.
- GitHub Actions CI: Ruff, migrations up/down/up + drift check, 121 tests on PostgreSQL 17 and
  MongoDB 8 service containers, ESLint + typecheck + build, and a `docker compose` smoke test.
- Docker: multi-stage API and web images, Next.js standalone output, Caddy reverse proxy;
  migrations and first-run seeding happen on API start.

## Status

| Feature | Status |
|---|:---:|
| Frontend auth UI and route protection | Done |
| MongoDB content (versions, material, graphs, pipelines) | Done |
| CI pipeline with linting | Done |
| Security and rate limiting | Done |
| Drag-and-drop curriculum builder with cycle checks | Done |
| Live presenter mode with pacing timer | Done |
| Docker and docker-compose | Done |
| Multi-faculty co-teaching | Done |
| LMS integration (LTI 1.3) | Not started |

---

*Updated for the VasaShashank / OptiTeach repository.*
