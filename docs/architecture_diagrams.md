# 🏛️ OptiTeach Architecture & System Diagrams

Visual specification of OptiTeach's database-centric, polyglot architecture.

---

## 1. System Context Diagram

```mermaid
graph TD
    User([University Faculty / Instructor])
    Web[Next.js 14 Web Application]
    API[FastAPI Backend Server]
    NLP[Deterministic Regex & NLP Parser]
    OptEngine[SciPy ILP Optimization Engine]
    PG[(PostgreSQL Relational Core 3NF)]
    Mongo[(MongoDB Pedagogical Document Store)]

    User -->|Interacts with Dashboard| Web
    Web -->|REST API Calls / JWT| API
    API -->|Raw Syllabus Text/PDF| NLP
    NLP -->|Structured Draft Units| API
    API -->|Curriculum & Invariants| OptEngine
    OptEngine -->|Optimal Period Allocations| API
    API -->|Authoritative Relational Entities| PG
    API -->|Unstructured Slides, Rubrics & Plans| Mongo
```

---

## 2. Relational Schema ERD (3NF)

```mermaid
erDiagram
    TEACHERS ||--o{ COURSES : instructs
    COURSES ||--o{ UNITS : partitions_into
    UNITS ||--o{ TOPICS : contains
    TOPICS ||--o{ CONCEPTS : decomposes_into
    CONCEPTS ||--o{ PREREQUISITES : depends_on
    COURSES ||--o{ CLASS_SESSIONS : schedules
    CLASS_SESSIONS ||--o| LESSON_PLANS : implements
    COURSES ||--o{ ASSESSMENTS : conducts
    ASSESSMENTS ||--o{ PERFORMANCE : records
    CONCEPTS ||--o{ PERFORMANCE : measures
```

---

## 3. Class Pacing & Revision Pipeline

```mermaid
sequenceDiagram
    autonumber
    actor Faculty
    participant API as FastAPI Backend
    participant Opt as Class Optimizer
    participant Rev as Revision Engine
    participant DB as Relational DB

    Faculty->>API: Request Next Class Optimization (Period N)
    API->>DB: Fetch Topic for Period N & Prerequisite Concepts
    DB-->>API: Prerequisite Concept IDs & Assessment Performances
    API->>Rev: Check Prerequisite Performance vs Threshold (60%)
    alt Prerequisite Score < 60%
        Rev-->>Opt: Inject 10-15 Min Targeted Revision Phase
    else Prerequisite Score >= 60%
        Rev-->>Opt: Standard 5-Min Warm-up Phase
    end
    Opt->>Opt: Balance Instruction (55%), Practice (30%), Exit Ticket (15%)
    Opt-->>API: 5-Phase Period Plan (Total Duration = 55 mins)
    API-->>Faculty: Render Interactive Presenter View & Lesson Plan
```
