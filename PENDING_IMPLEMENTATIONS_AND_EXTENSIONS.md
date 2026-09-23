# 📌 OptiTeach / OptiLearn — Pending Implementations & Feature Extensions Roadmap

> **Document Status:** Active Engineering Roadmap  
> **Target Version:** v1.1.0 – v2.0.0  
> **Philosophy:** *DBMS is the Core. AI/Optimization is the Intelligence. Dashboard is the Product.*

---

## 🧭 Executive Summary

**OptiTeach** has established its foundational architecture:
- ✅ Deterministic regex/NLP extraction engine for raw syllabi and PDFs
- ✅ Normalized 3NF Relational Database schema (PostgreSQL / SQLite fallback) with foreign keys and check constraints
- ✅ Mathematical time allocation optimizer adhering to strict invariants
- ✅ In-class session phase optimizer with automatic revision injection based on prerequisite performance
- ✅ Interactive Next.js 14 dashboard with DAG curriculum graph viewer and DBMS SQL insight runner

This document outlines **all pending architectural implementations, stubbed components, and high-impact functional extensions** categorized by technical domain and delivery priority.

---

## 📑 Table of Contents
1. [Phase 1: Immediate Gaps & Incomplete Modules](#1-phase-1-immediate-gaps--incomplete-modules)
2. [Phase 2: Core Optimization Engine Enhancements](#2-phase-2-core-optimization-engine-enhancements)
3. [Phase 3: AI & Hybrid Intelligence Extensions](#3-phase-3-ai--hybrid-intelligence-extensions)
4. [Phase 4: Database, Persistence & Migrations](#4-phase-4-database-persistence--migrations)
5. [Phase 5: Frontend UI/UX & Interactive Features](#5-phase-5-frontend-uiux--interactive-features)
6. [Phase 6: Integrations, LMS & Exports](#6-phase-6-integrations-lms--exports)
7. [Phase 7: Testing, DevOps & Production Readiness](#7-phase-7-testing-devops--production-readiness)
8. [Summary Prioritization Matrix](#8-summary-prioritization-matrix)

---

## 1. Phase 1: Immediate Gaps & Incomplete Modules

These items address empty directories, hardcoded logic, and partial stubs currently in the repository.

### 1.1 Complete Empty Directory Stubs
- [ ] **`ai/` Root Modules** (`ai/extractors/`, `ai/curriculum/`, `ai/recommendations/`):
  - Populate standalone AI interfaces and pluggable extractors.
  - Separate raw NLP extraction logic from web server services.
- [ ] **`backend/app/analytics/`**:
  - Implement time-series tracking of student performance drift.
  - Implement curriculum pacing deviation models (planned vs actual class velocity).
- [ ] **`backend/app/repositories/`**:
  - Create repository classes (`CourseRepository`, `CurriculumRepository`, `AssessmentRepository`) to decouple SQLAlchemy ORM queries from business logic in services and API routes.
- [ ] **`backend/app/utils/`**:
  - Move datetime helpers, Roman numeral converters, graph cycle detectors, and math formatting utilities here.
- [ ] **`docs/`**:
  - Add API documentation, architecture diagrams, mathematical formulation papers, and user manuals.

### 1.2 Un-hardcode Endpoints & Logic
- [ ] **Dynamic Lesson Plan Listing (`/api/courses/{id}/lesson-plans`)**:
  - Currently hardcoded to session `#15` for demo purposes.
  - **Pending:** Support fetching plans for all sessions `1..N`, filtering by unit, topic, or status (`draft`, `approved`, `conducted`).
- [ ] **Dynamic Teacher Identity**:
  - In `api/courses.py`, `create_course` falls back to `db.query(Teacher).first()`.
  - **Pending:** Enforce authenticated user from JWT token (`current_user.teacher_profile.id`).

---

## 2. Phase 2: Core Optimization Engine Enhancements

Upgrade the mathematical optimizer from heuristic distribution to rigorous operations research.

### 2.1 Multi-Constraint Integer Linear Programming (ILP) Solver
- [ ] **Constraint Formulation**:
  - Replace greedy percentage-based time allocation with an exact solver using `scipy.optimize.linprog` or Google OR-Tools.
  - **Hard Constraints:**
    - $\sum \text{allocated\_minutes} + \text{revision\_budget} + \text{assessment\_budget} \le \text{total\_available\_minutes}$
    - Every concept receives at least its minimum cognitive threshold duration ($T_{\min} = 20\text{ min}$).
    - Unit ordering and prerequisite dependencies must maintain topological sorting validity.
  - **Objective Function:**
    - Maximize expected curriculum mastery: $\max \sum (w_i \cdot \text{importance}_i \cdot \text{difficulty}_i \cdot \text{time}_i)$.

### 2.2 Academic Calendar & Real-World Disruption Engine
- [ ] **Calendar Constraints Integration**:
  - Support specific semester start/end dates, institution holiday calendars, exam blackout periods, and recurring timetable slots (e.g., Mon/Wed/Fri 10:00–10:55 AM).
- [ ] **Dynamic Rescheduling / "Catch-Up" Engine**:
  - When a class is cancelled (inclement weather, faculty leave) or runs over time, dynamically recalculate remaining syllabus distribution without violating prerequisite chains.

### 2.3 Real-Time In-Class Pacing Tracker
- [ ] **Live Lecture Mode**:
  - Active session view with phase countdown timer (e.g., 5 min Warm-up $\to$ 25 min Instruction $\to$ 15 min Practice $\to$ 5 min Assessment $\to$ 5 min Wrap-up).
  - Ability for faculty to click "Extend Phase by 5 mins" and auto-compress wrap-up or flag unfinished topics for rollover into next class.

---

## 3. Phase 3: AI & Hybrid Intelligence Extensions

Bridge the deterministic NLP pipeline with Large Language Models (LLMs) and semantic analysis.

### 3.1 LLM-Assisted Hybrid Syllabus Extraction
- [ ] **Fallback & Enhancement Pipeline**:
  - When deterministic regex confidence score is $< 0.85$, trigger an LLM-assisted parser (via Google Gemini, Anthropic Claude, or local Ollama).
  - Extract complex implicit prerequisites and unformatted tabular syllabi.
  - Optical Character Recognition (OCR) for scanned image-only PDF syllabi using `pytesseract` or Surya OCR.

### 3.2 Automated Question & Assessment Generator
- [ ] **Bloom's Taxonomy-Aligned Question Bank**:
  - Auto-generate formative quiz questions (MCQs, coding challenges, short-answer) mapped directly to specific concepts and Bloom levels (e.g., *Apply: SQL Group By*, *Analyze: BCNF Decomposition*).
  - Auto-generate grading rubrics for midterm exam questions.

### 3.3 Semantic Prerequisite & Concept Similarity
- [ ] **Cross-Disciplinary Prerequisite Graph**:
  - Use sentence-transformers / vector embeddings to detect semantic similarity between concepts from other foundational courses (e.g., linking DBMS B-Trees with Data Structures Trees).

---

## 4. Phase 4: Database, Persistence & Migrations

Refine the relational core and hybrid document database layer.

### 4.1 Database Migrations with Alembic
- [ ] Set up **Alembic** in `database/migrations/`:
  - Replace `Base.metadata.create_all()` with versioned migration scripts.
  - Support reversible migrations, index tuning, and production schema changes.

### 4.2 Full MongoDB Unstructured Document Store Integration
- [ ] Currently, MongoDB is abstracted/mocked in several places.
  - Implement full MongoDB storage for rich unstructured lesson materials:
    - Lecture slides, code snippets, LaTeX formulas, sample datasets, video links.
    - Version history of modified lesson plans.

### 4.3 Fine-Grained Student-Level Performance Tracking
- [ ] The schema currently records cohort aggregates (`Performance.average_score`).
  - **Extension:** Add `Student` and `StudentSubmission` tables to track per-student struggle areas.
  - Compute personalized revision plans and pinpoint at-risk students before midterms.

---

## 5. Phase 5: Frontend UI/UX & Interactive Features

Elevate the Next.js 14 frontend into a responsive, rich faculty workstation.

### 5.1 Interactive Drag-and-Drop Curriculum Builder
- [ ] Visual DAG graph editor:
  - Drag-and-drop to reorder topics and units.
  - Interactive edge creation for prerequisite links with instant cyclic-dependency detection in the browser.
  - Concept detail drawer: adjust difficulty, importance, and Bloom level with live recalculation preview.

### 5.2 Authentication & User State Management
- [ ] Complete frontend auth workflow:
  - Login / Registration UI connected to `/api/auth/login` and `/api/auth/register`.
  - JWT token storage in `HttpOnly` cookies or encrypted localStorage with automated refresh logic.
  - Protected route middleware (`/courses`, `/optimization`, `/upload`).

### 5.3 In-Class Live Execution Dashboard
- [ ] Specialized high-contrast projector/presenter view:
  - Displays current slide/discussion prompt, active phase timer, and quick-note scratchpad.
  - One-click "Log Concept as Understood" or "Flag for Revision".

### 5.4 Dark / Light Theme & Accessibility
- [ ] Modern UI polish:
  - Add theme toggle with Tailwind/CSS custom properties.
  - Keyboard navigation shortcuts (`J`/`K` navigation between topics, `Space` for timer).
  - High-contrast mode for classroom projectors.

---

## 6. Phase 6: Integrations, LMS & Exports

Connect OptiTeach with existing academic infrastructure.

### 6.1 Multi-Format Export Options
- [ ] **Syllabus & Lesson Plan Export**:
  - Export generated lesson plans to formatted PDF and Microsoft Word (`.docx`).
  - Export course schedule to iCalendar format (`.ics`) for Google Calendar, Outlook, and Apple Calendar.
  - Export accreditation compliance reports (NBA / ABET / NAAC Course Outcome attainment matrices).

### 6.2 LMS Interoperability (LTI 1.3 / REST)
- [ ] Connect with Canvas, Moodle, and Google Classroom:
  - One-click sync of course units as LMS modules.
  - Sync generated quizzes and question banks directly into LMS assessments.
  - Pull student gradebook results back into OptiTeach to automatically drive the continuous revision engine.

---

## 7. Phase 7: Testing, DevOps & Production Readiness

Ensure enterprise-grade reliability and seamless deployment.

### 7.1 Automated CI/CD Pipeline
- [ ] Create `.github/workflows/ci.yml`:
  - Run backend linting (`ruff`, `flake8`, `mypy`).
  - Execute Pytest suite with code coverage target $> 85\%$.
  - Run frontend linting (`eslint`) and `next build` validation.

### 7.2 Containerization & Production Orchestration
- [ ] **Dockerization**:
  - `backend/Dockerfile` (Multi-stage Python slim build).
  - `frontend/Dockerfile` (Standalone Next.js output build).
  - `docker-compose.yml` orchestrating:
    - `api` (FastAPI + Gunicorn/Uvicorn workers)
    - `web` (Next.js)
    - `postgres` (PostgreSQL 16)
    - `mongo` (MongoDB 7)
    - `caddy` / `nginx` (Reverse proxy with automatic HTTPS)

### 7.3 Edge Case & Security Hardening
- [ ] Rate limiting on authentication and upload endpoints (`slowapi`).
- [ ] File size limit enforcement and sanitization for PDF uploads.
- [ ] Graph cycle prevention validation at database constraint level.

---

## 8. Summary Prioritization Matrix

| Priority | Feature / Module | Impact | Complexity | Status |
|:---:|---|:---:|:---:|:---:|
| 🔴 **P0** | Database Migrations (Alembic Setup) | Critical | Low | Pending |
| 🔴 **P0** | Frontend Auth & Route Protection | Critical | Medium | Pending |
| 🔴 **P0** | Un-hardcode Lesson Plan & Session Selection | High | Low | Pending |
| 🟡 **P1** | Fill Stubs (`repositories/`, `utils/`, `ai/`) | High | Medium | Pending |
| 🟡 **P1** | Export Options (PDF, `.ics`, Word) | High | Medium | Pending |
| 🟡 **P1** | Drag-and-Drop Curriculum & DAG Editor | High | High | Pending |
| 🟡 **P1** | Calendar & Holiday Integration for Pacing | High | Medium | Pending |
| 🟢 **P2** | Hybrid LLM Extraction + OCR for scanned PDFs | Medium | High | Pending |
| 🟢 **P2** | Live Lecture Presenter Mode with Pacing Timer | High | Medium | Pending |
| 🟢 **P2** | Automated Bloom-Aligned Question Generator | Medium | High | Pending |
| ⚪ **P3** | LMS Integration (Canvas / Moodle LTI) | Medium | High | Future |
| ⚪ **P3** | Multi-faculty Co-teaching & Department Sync | Low | High | Future |

---

*Generated for VasaShashank / OptiLearn (OptiTeach) Repository.*  
*Keep this document updated as new phases are completed or requirements evolve.*
