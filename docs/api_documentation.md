# 📚 OptiTeach API Documentation

Comprehensive REST API reference for the OptiTeach course teaching and curriculum optimization platform.

---

## 🔐 Base URL & Authentication

- **Base URL:** `http://localhost:8000/api`
- **Auth Header:** `Authorization: Bearer <JWT_ACCESS_TOKEN>`

---

## 📌 Authentication Endpoints

### `POST /api/auth/register`
Register a new faculty account.
- **Request Body:**
  ```json
  {
    "email": "faculty@university.edu",
    "password": "SecurePassword123",
    "full_name": "Dr. Alan Turing",
    "department": "Computer Science & Engineering",
    "employee_id": "FAC-2026-001",
    "designation": "Associate Professor"
  }
  ```
- **Response:** `200 OK` with user profile and bearer token.

### `POST /api/auth/login`
Authenticate faculty user and retrieve JWT access token.
- **Request Form / Body:** `username` (email) and `password`.

---

## 📖 Course Management & Curriculum

### `GET /api/courses`
List all enrolled courses for the authenticated instructor.

### `POST /api/courses`
Create a new course with constraints and schedule limits.
- **Request Body:**
  ```json
  {
    "code": "CS302",
    "title": "Database Management Systems",
    "semester": "Fall 2026",
    "academic_year": "2026-2027",
    "total_classes": 40,
    "period_duration": 55,
    "section_name": "Section A",
    "student_count": 60,
    "constraints": {
      "max_lecture_ratio": 0.45,
      "min_practice_ratio": 0.35,
      "revision_threshold_score": 60.0,
      "default_revision_minutes": 10
    }
  }
  ```

### `POST /api/courses/{course_id}/syllabus/extract`
Upload a syllabus PDF or text to trigger high-fidelity deterministic NLP extraction.

### `POST /api/courses/{course_id}/curriculum/confirm`
Persist the reviewed curriculum DAG into the relational database.

### `GET /api/courses/{course_id}/graph`
Retrieve the Directed Acyclic Graph (DAG) of concepts, prerequisites, and bottleneck nodes.

---

## ⚡ Optimization & In-Class Planning

### `POST /api/courses/{course_id}/optimize`
Execute the operations research time allocator to compute discrete period allocations across all syllabus topics.

### `POST /api/courses/{course_id}/optimize-next-class`
Generate a structured 5-phase plan for an upcoming class session, with automatic prerequisite revision injection if scores fall below threshold.

---

## 📝 Lesson Plans

### `GET /api/courses/{course_id}/lesson-plans`
Fetch generated lesson plans with optional query filters (`session_number`, `unit_id`, `status`).

### `POST /api/courses/{course_id}/lesson-plans/generate`
Generate a comprehensive pedagogical lesson plan stored across relational (PostgreSQL) and rich document (MongoDB) backends.

---

## 📊 Analytics & DBMS Insights

### `GET /api/courses/{course_id}/analytics`
Retrieve real-time velocity metrics, student performance drift, concept health, and pedagogical alerts.

### `GET /api/dbms/insights`
Execute relational queries directly against the 3NF schema for schema inspection and query performance verification.
