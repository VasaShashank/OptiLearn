# 📌 OptiTeach / OptiLearn — Pending Implementations & Feature Extensions Roadmap

> **Document Status:** Active Engineering Roadmap (Updated)  
> **Philosophy:** *DBMS is the Core. AI/Optimization is the Intelligence. Dashboard is the Product.*

---

## 🧭 Executive Summary of Completed Architecture

The following core modules are **fully implemented, tested, and verified**:
- ✅ **Deterministic & Hybrid Extraction Engine**: Regex/NLP parser with confidence scoring and fallback synthesis (`ai/extractors/`).
- ✅ **Normalized 3NF Relational Core + Alembic Migrations**: PostgreSQL / SQLite schema with foreign keys, check constraints, versioned Alembic migrations (`database/migrations/`), and per-student tracking (`Student`, `StudentSubmission`).
- ✅ **Decoupled Architecture**: Repository layer (`CourseRepository`, `CurriculumRepository`, `AssessmentRepository`, `LessonPlanRepository`) and standalone utilities (`roman_numerals`, `graph_utils`, `datetime_helpers`, `math_formatting`).
- ✅ **Operations Research Optimization Engine**: Exact Mixed-Integer Linear Programming solver (`scipy.optimize.milp`) adhering to discrete period integrality and cognitive threshold constraints.
- ✅ **Academic Calendar & Disruption Catch-Up Engine**: Timetable slot resolution (MWF/TTh), holiday exclusion mapping, and dynamic rescheduling acceleration when classes are lost.
- ✅ **AI & Curriculum Intelligence**: Bloom's Taxonomy question generator (`question_generator.py`), pedagogy method advisor (`pedagogy_advisor.py`), and semantic prerequisite DAG validator (`prerequisite_graph.py`).
- ✅ **Analytics & Drift Detection**: Real-time student performance drift tracking and curriculum pacing velocity deviation models.
- ✅ **Multi-Format Exports**: RFC 5545 iCalendar (`.ics`), printable HTML lesson plans, and NBA / ABET outcome attainment matrix endpoints.
- ✅ **Next.js 15 Web Dashboard**: Multi-period lesson plan selector (Periods 1..40), DAG curriculum graph, and DBMS query runner.

---

## 📑 Remaining Pending Features & Extensions

### 1. In-Class Execution & Live Pacing
- [ ] **Live Lecture Presenter Mode**:
  - Active session view with phase countdown timer (e.g., 5 min Warm-up $\to$ 25 min Instruction $\to$ 15 min Practice $\to$ 5 min Assessment $\to$ 5 min Wrap-up).
  - Ability for faculty to click "Extend Phase by 5 mins" and auto-compress wrap-up or flag unfinished topics for rollover into next class.
  - High-contrast projector mode and presenter scratchpad.

### 2. Database & Rich Unstructured Content
- [ ] **Full MongoDB Unstructured Document Store Integration**:
  - Expand MongoDB storage for rich pedagogical assets:
    - Lecture slide decks, code snippets, LaTeX formula blocks, sample datasets, video links.
    - Version history tracking of teacher-modified lesson plans with diff inspection.

### 3. Frontend UI/UX Workstation Features
- [ ] **Interactive Drag-and-Drop Curriculum Builder**:
  - Visual DAG graph editor: drag-and-drop to reorder topics and units.
  - Interactive edge creation for prerequisite links with instant cyclic-dependency detection in the browser.
  - Concept detail drawer: adjust difficulty, importance, and Bloom level with live recalculation preview.
- [ ] **Frontend Auth Workflow & Protected Routes**:
  - Dedicated Login and Registration modal/page connected to `/api/auth/login` and `/api/auth/register`.
  - Next.js route middleware protecting `/courses`, `/optimization`, and `/upload`.
- [ ] **Theme Toggle & Accessibility**:
  - Theme toggle (Dark / Light / High-Contrast Projector mode).
  - Keyboard shortcuts (`J`/`K` for topic navigation, `Space` to start/pause timer).

### 4. LMS Integrations & Interoperability
- [ ] **LMS Interoperability (LTI 1.3 / REST)**:
  - Connect with Canvas, Moodle, and Google Classroom:
    - One-click sync of course units as LMS modules.
    - Direct sync of generated Bloom quiz questions into LMS question banks.
    - Pull gradebook results back into OptiTeach to automatically drive the continuous revision engine.
- [ ] **Multi-Faculty Co-Teaching**:
  - Support multiple instructors co-teaching shared sections with synced pacing.

### 5. Testing, DevOps & Production Readiness
- [ ] **Automated CI/CD Pipeline**:
  - Create `.github/workflows/ci.yml`:
    - Run backend linting (`ruff`, `flake8`, `mypy`).
    - Execute Pytest suite across all test modules.
    - Run Next.js linting and production build validation.
- [ ] **Production Dockerization**:
  - `backend/Dockerfile` (Multi-stage Python slim build).
  - `frontend/Dockerfile` (Standalone Next.js output build).
  - `docker-compose.yml` orchestrating API, Web, PostgreSQL, MongoDB, and Caddy/Nginx reverse proxy.
- [ ] **Edge Case & Security Hardening**:
  - Rate limiting on authentication and upload endpoints (`slowapi`).
  - File size limit enforcement and sanitization for PDF uploads.

---

## 📊 Remaining Feature Prioritization Matrix

| Priority | Feature / Module | Impact | Complexity | Status |
|:---:|---|:---:|:---:|:---:|
| 🔴 **P0** | Frontend Auth UI & Route Protection | Critical | Medium | Pending |
| 🟡 **P1** | Drag-and-Drop Curriculum & DAG Editor | High | High | Pending |
| 🟡 **P1** | Live Lecture Presenter Mode with Pacing Timer | High | Medium | Pending |
| 🟡 **P1** | Full MongoDB Unstructured Content Integration | High | Medium | Pending |
| 🟢 **P2** | Production Dockerization & docker-compose | High | Medium | Pending |
| 🟢 **P2** | Automated CI/CD GitHub Actions Pipeline | Medium | Low | Pending |
| 🟢 **P2** | Security & Rate Limiting Hardening | Medium | Low | Pending |
| ⚪ **P3** | LMS Integration (Canvas / Moodle LTI 1.3) | Medium | High | Future |
| ⚪ **P3** | Multi-Faculty Co-teaching & Department Sync | Low | High | Future |

---

*Updated for VasaShashank / OptiLearn (OptiTeach) Repository.*
