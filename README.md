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

### 📝 Lesson Plan Generation
- Auto-generated structured lesson plans with pedagogical method recommendations
- Teaching method effectiveness tracking across concept types

### 📈 Analytics & Continuous Feedback
- Course progress tracking
- Assessment performance analysis per concept
- Intelligent alerts for curriculum bottlenecks and weak areas
- Teaching method effectiveness comparison

### 🗄️ DBMS Insights Dashboard
- Live schema visualization of the relational database
- Pre-built analytical SQL queries demonstrating DBMS concepts
- Real-time query execution against course data

---

## 🏗️ Architecture

```
OptiTeach/
├── backend/                    # FastAPI Python Backend
│   ├── app/
│   │   ├── api/                # REST API endpoints
│   │   │   ├── auth.py         # JWT authentication
│   │   │   ├── courses.py      # Course CRUD, optimization, syllabus upload
│   │   │   ├── syllabus.py     # Standalone syllabus extraction
│   │   │   └── dbms_insights.py# Schema & query demos
│   │   ├── auth/               # Security & JWT
│   │   ├── database/           # SQLAlchemy + MongoDB connections
│   │   ├── models/             # SQLAlchemy ORM entities
│   │   ├── nlp/                # Deterministic NLP extraction engine
│   │   ├── optimization/       # Time allocator, class optimizer, scoring
│   │   ├── schemas/            # Pydantic request/response models
│   │   ├── services/           # Business logic services
│   │   └── main.py             # FastAPI app entry point
│   ├── sample_syllabi/         # Sample syllabus files for testing
│   └── tests/                  # Pytest test suite
├── frontend/                   # Next.js React Frontend
│   ├── app/                    # Next.js App Router pages
│   │   ├── courses/            # Course listing & detail pages
│   │   ├── upload/             # Syllabus upload & extraction UI
│   │   ├── optimization/       # Optimization dashboard
│   │   ├── lesson-plans/       # Lesson plan viewer
│   │   └── dbms/               # DBMS insights dashboard
│   ├── components/             # Reusable React components
│   └── lib/                    # API client & type definitions
├── database/                   # SQL scripts & seed data
│   ├── sql/                    # Demo queries
│   └── seed/                   # Database seeding script
└── ai/                         # AI module placeholders
    ├── extractors/
    ├── curriculum/
    └── recommendations/
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Lucide Icons |
| **Backend** | FastAPI (Python 3.11+), Uvicorn |
| **Relational DB** | PostgreSQL (primary) / SQLite (fallback) via SQLAlchemy ORM |
| **Document DB** | MongoDB / MongoMock (for NLP extraction artifacts) |
| **NLP Engine** | Deterministic rule-based extraction (pypdf, regex) |
| **Optimization** | Custom mathematical time-allocation algorithms |
| **Authentication** | JWT (HS256) with bcrypt password hashing |
| **Testing** | Pytest with FastAPI TestClient |

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

# 3. Create the database and apply the schema (PostgreSQL)
createdb -U postgres optiteach
alembic -c database/migrations/alembic.ini upgrade head

# 4. Seed the sample CS302 course
python -m database.seed.seed_data

# 5. Start the API server
cd backend
uvicorn app.main:app --reload --port 8000
```

The API will be available at `http://localhost:8000` with interactive docs at `/docs`.
Demo login: `faculty@optiteach.edu` / `admin123`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will be available at `http://localhost:3000`.

### Running Tests

```bash
# From the repository root. Tests use their own throwaway SQLite DB + MongoMock,
# so they never touch your development database.
python -m pytest backend/tests -v
```

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|---------|-------------|
| `POST` | `/api/auth/login` | JWT authentication |
| `POST` | `/api/auth/register` | User registration |
| `GET` | `/api/courses` | List all courses |
| `POST` | `/api/courses` | Create a new course |
| `GET` | `/api/courses/{id}` | Get course details |
| `POST` | `/api/courses/{id}/syllabus` | Upload syllabus to existing course |
| `POST` | `/api/courses/{id}/curriculum/confirm` | Confirm extracted curriculum |
| `GET` | `/api/courses/{id}/graph` | Get curriculum knowledge graph |
| `POST` | `/api/courses/{id}/optimize` | Run time allocation optimization |
| `POST` | `/api/courses/{id}/optimize-next-class` | Optimize next class session |
| `GET` | `/api/courses/{id}/analytics` | Get course analytics |
| `POST` | `/api/syllabus/upload` | Standalone syllabus extraction |
| `GET` | `/api/dbms/schema` | Database schema information |
| `POST` | `/api/dbms/queries/{id}/execute` | Execute demo SQL query |

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

The project includes 6 automated tests covering:

1. **API Health Check** — Verifies server and database connectivity
2. **Authentication** — JWT login flow validation
3. **NLP Extraction** — Syllabus text parsing accuracy
4. **Optimization Invariant** — `Allocated + Revision + Assessment ≤ Total Available`
5. **Class Optimizer** — Phase durations sum exactly to period duration (55m)
6. **Assessment Feedback Loop** — Re-optimization after assessment results

---

## 👥 Authors

- **Vasa Shashank** — Full-stack development & system design

---

## 📄 License

This project is developed for educational purposes as part of an academic engineering lab exercise.
