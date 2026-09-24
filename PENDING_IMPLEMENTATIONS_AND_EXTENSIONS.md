# 📌 OptiTeach / OptiLearn — Engineering Roadmap & Implementation Tracker

> **Document Version:** 1.2 (Updated for `version1` Branch)  
> **Philosophy:** *DBMS is the Core. Operations Research is the Engine. AI is the Intelligence. Dashboard is the Product.*

---

## 🧭 Executive Summary of Completed Architecture

### 1. Foundational Core (Pre-`version1`)
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

### 2. Completed in `version1` Branch (Sprint Deliverables)

#### 🔐 Authentication, Route Protection & User Profile
- ✅ **Dedicated Authentication Workflow**:
  - `/login` page with quick **"Fill Demo Faculty Credentials"** (`faculty@optiteach.edu` / `admin123`).
  - `/register` page collecting academic metadata (Department, Designation, Employee ID).
- ✅ **Server-Side Route Protection**:
  - Next.js Edge Middleware (`frontend/middleware.ts`) inspecting `optilearn_token` cookies.
  - Automatically protects `/courses`, `/optimization`, `/upload`, `/presenter`, `/lesson-plans`, `/analytics`, `/export`.
  - Automatically redirects unauthenticated traffic to `/login?callbackUrl=...` and authenticated users away from auth pages to `/courses`.
- ✅ **Auth Context & Dynamic App Shell**:
  - `auth-context.tsx` synchronizes tokens across `localStorage` and browser cookies (`SameSite=Lax`).
  - `app-shell.tsx` dynamically hides navigation sidebars on auth pages for a focused UI.
  - Backend authenticated profile endpoint `GET /api/auth/me` returning User + Teacher profile details.

#### 🎙️ Live Lecture Presenter Mode Cockpit (`/presenter`)
- ✅ **Classroom Delivery Cockpit**:
  - 5-Phase structured pacing countdown timer (Warm-up $\to$ Instruction $\to$ Practice $\to$ Assessment $\to$ Wrap-up).
  - Pacing controls: Play / Pause / Reset / Next Phase / Previous Phase.
  - "+5 Min" Phase Duration Extension with automatic wrap-up compression and topic rollover flagging.
  - High-contrast Projector Mode toggle for classroom visibility.
  - Live presenter scratchpad for in-lecture notes and blackboard reminders.
- ✅ **Global Presenter Keyboard Shortcuts**:
  - `Space` — Toggle Play / Pause timer (smart-bypassed when typing in scratchpad)
  - `→` / `K` — Advance to next phase
  - `←` / `J` — Return to previous phase
  - `E` — Extend active phase by +5 minutes
  - `F` — Toggle high-contrast Projector mode
  - `R` — Reset phase countdown timer
  - Status helper badge bar rendered in the cockpit.
- ✅ **Session Conduct Logging**:
  - `POST /api/courses/{course_id}/sessions/{session_number}/conduct` records actual minutes, 5-star student engagement rating, and notes.

#### 📦 Database & Rich Unstructured Content (MongoDB + Relational)
- ✅ **Resilient MongoDB Document Store**:
  - Dual-store architecture: PostgreSQL for normalized relational entities, MongoDB for rich pedagogical assets and graph snapshots.
  - Graceful fallback synthesis when MongoDB is offline.
- ✅ **Rich Pedagogical Assets**:
  - `GET /api/courses/{course_id}/lesson-plans/{session_number}/rich-content`: serves slide decks with takeaways, runnable SQL & Python code snippets, and formal LaTeX formula blocks (Attribute Closure $X^+$, Heath's Theorem).
  - `POST /api/courses/{course_id}/lesson-plans/{session_number}/rich-content`: saves teacher-edited assets with version increments and automatic revision history logging in `lesson_plan_revisions`.
  - Multi-tab UI in `/lesson-plans` switching between structured lesson plans and rich media cards with one-click code copy.

#### 🕸️ Visual Curriculum DAG Editor & Cycle Prevention
- ✅ **Client-Side & Server-Side Cycle Detection**:
  - Frontend BFS traversal (`checkCycle` in `curriculum-graph-view.tsx`) intercepts cycles before sending requests.
  - Backend NetworkX verification (`POST /api/courses/{course_id}/prerequisites`) prevents circular prerequisite loops with HTTP 400.
- ✅ **Interactive Edge Graph Linker**:
  - Toolbar button **"🔗 Link Prerequisite"** allows clicking prerequisite (source) then dependent (target) directly on the canvas.
  - Active source node highlights with a pulsating dashed cyan ring.
- ✅ **Interactive Edge Deletion**:
  - Clicking any prerequisite edge line prompts for deletion via `DELETE /api/courses/{course_id}/prerequisites/{source_id}/{target_id}`.
- ✅ **Concept Detail Drawer**:
  - Difficulty (1–5) and Importance (1–5) sliders with immediate database persistence (`PATCH /api/courses/{course_id}/concepts/{concept_id}`) and dynamic time re-optimization.
  - Direct prerequisites and downstream dependents lists with **`Unlink`** buttons.
  - Inline dropdown **`+ Link Prerequisite`** with cycle detection.
- ✅ **Curriculum Reordering**:
  - `POST /api/courses/{course_id}/curriculum/reorder` endpoint for batch topic and concept re-indexing.

#### 🔒 Security, Rate Limiting & Upload Sanitization
- ✅ **In-Memory Sliding-Window Rate Limiter**:
  - Thread-safe, dependency-free sliding window limiter in `backend/app/core/rate_limiter.py`.
  - Applied to `/api/auth/login` (20 req/min), `/api/auth/register` (10 req/min), and `/api/syllabus/upload` (10 req/min).
  - Returns standard RFC 6585 `HTTP 429 Too Many Requests` with `Retry-After` headers.
- ✅ **Upload Sanitization & File Limits**:
  - Strict 10MB maximum file size enforcement (`HTTP 413 Content Too Large`).
  - Magic byte verification: validates `%PDF` header bytes for PDF uploads.
  - Sanitization of null bytes (`\x00`) and 500,000 character length cap on raw text syllabus uploads.

#### 🐳 Production Dockerization & DevOps CI/CD
- ✅ **Multi-Stage Docker Containers**:
  - `backend/Dockerfile`: Multi-stage Python 3.11 slim image with Uvicorn.
  - `frontend/Dockerfile`: Multi-stage Next.js standalone output image.
  - `docker-compose.yml`: Multi-container orchestration (PostgreSQL 15, MongoDB 6, FastAPI, Next.js) with health checks and volume persistence.
- ✅ **Automated CI/CD Pipeline**:
  - GitHub Actions `.github/workflows/ci.yml`: Automated Pytest suite across all test modules and Next.js production build validation.
- ✅ **Automated Test Coverage**:
  - 28 unit and integration tests passing (`pytest backend/tests -v`).
  - Next.js production build verified (`npm run build`).

---

## 📑 Next Phase Implementations (Version 2 Scope)

The following modules remain for future release cycles:

### 1. LMS Interoperability (LTI 1.3 / REST)
- [ ] **Canvas LMS / Moodle LTI 1.3 Tool Integration**:
  - One-click syllabus sync: publish course units and sessions directly into Canvas modules or Moodle topics.
  - Question Bank synchronization: export generated Bloom quiz questions into QTI or Canvas Quiz API formats.
  - Gradebook Webhook / Callback: ingest student quiz scores back into OptiTeach to automatically trigger prerequisite drift detection and revision scheduling.

### 2. Multi-Faculty Co-Teaching & Cross-Section Sync
- [ ] **Section Synchronization Engine**:
  - Support multiple instructors co-teaching shared sections (e.g., Section A vs Section B) of the same course.
  - Real-time pacing alignment: alert instructors when one section is deviating from common syllabus milestones.

### 3. Institutional Portals & Outcome Attainment
- [ ] **NBA / ABET Accreditation Portal**:
  - Dean and Head of Department (HOD) overview dashboard aggregating Course Outcome (CO) attainment across all departmental offerings.
  - Continuous Improvement Action (CIA) report generation.

---

## 📊 Feature Prioritization & Delivery Status Matrix

| Priority | Feature / Module | Impact | Complexity | Status |
|:---:|---|:---:|:---:|:---:|
| 🔴 **P0** | Frontend Auth UI & Route Protection Middleware | Critical | Medium | ✅ **Delivered (v1)** |
| 🟡 **P1** | Interactive Prerequisite DAG Linker & Cycle Detection | High | High | ✅ **Delivered (v1)** |
| 🟡 **P1** | Live Lecture Presenter Mode with Hotkeys & Pacing Timer | High | Medium | ✅ **Delivered (v1)** |
| 🟡 **P1** | Full MongoDB Unstructured Content Integration | High | Medium | ✅ **Delivered (v1)** |
| 🟢 **P2** | Production Dockerization & docker-compose | High | Medium | ✅ **Delivered (v1)** |
| 🟢 **P2** | Automated CI/CD GitHub Actions Pipeline | Medium | Low | ✅ **Delivered (v1)** |
| 🟢 **P2** | Security, Upload Sanitization & Rate Limiting Hardening | Medium | Low | ✅ **Delivered (v1)** |
| ⚪ **P3** | LMS Interoperability (Canvas / Moodle LTI 1.3 & REST) | Medium | High | ⏳ **Version 2** |
| ⚪ **P3** | Multi-Faculty Co-Teaching & Section Pacing Sync | Low | High | ⏳ **Version 2** |
| ⚪ **P3** | Institutional HOD / NBA Accreditation Portal | Medium | Medium | ⏳ **Version 2** |

---

*Last Updated for VasaShashank / OptiLearn (OptiTeach) Repository.*
