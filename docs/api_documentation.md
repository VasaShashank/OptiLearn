# OptiTeach API reference

Generated from the application's OpenAPI schema (`app.openapi()`); the interactive version with
request/response schemas is served at `http://localhost:8000/docs`.

* **Base URL:** `http://localhost:8000`
* **Authentication:** `POST /api/auth/login` with JSON `{"email", "password"}` returns `access_token`;
  send it as `Authorization: Bearer <token>`. Every route below needs it except the four marked *public*.
* **Authorization:** routes under `/api/courses/{course_id}` return **404** for courses the caller does not own
  (admins see all). Nested IDs (assessment, topic, session) must belong to that course.
* **Errors:** `400` bad reference/input, `401` missing/invalid token, `403` role required, `404` not found or not
  yours, `409` concurrency conflict (stale lesson-plan version, class already recorded), `413`/`415` upload limits,
  `422` validation, `429` too many failed logins.

## Authentication

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login *(public)* |
| `GET` | `/api/auth/me` | Get Profile |
| `POST` | `/api/auth/register` | Register *(public)* |

## Courses & Optimization

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/courses` | List Courses |
| `POST` | `/api/courses` | Create Course |
| `GET` | `/api/courses/{course_id}` | Get Course |
| `GET` | `/api/courses/{course_id}/analytics` | Get Analytics |
| `GET` | `/api/courses/{course_id}/assessments` | List Assessments |
| `POST` | `/api/courses/{course_id}/assessments` | Create Assessment |
| `POST` | `/api/courses/{course_id}/assessments/{assessment_id}/results` | Record Assessment Results |
| `POST` | `/api/courses/{course_id}/curriculum/confirm` | Confirm Curriculum |
| `GET` | `/api/courses/{course_id}/graph` | Get Curriculum Graph |
| `GET` | `/api/courses/{course_id}/graph/diff` | Diff Graph Versions |
| `GET` | `/api/courses/{course_id}/graph/versions` | Curriculum graph snapshots stored in MongoDB, newest first. |
| `GET` | `/api/courses/{course_id}/lesson-plans` | List Course Lesson Plans |
| `POST` | `/api/courses/{course_id}/lesson-plans/generate` | Generate Lesson Plan |
| `PATCH` | `/api/courses/{course_id}/lesson-plans/{session_number}` | Accept / edit / reject a recommended plan. Stale expected_version -> 409. |
| `GET` | `/api/courses/{course_id}/lesson-plans/{session_number}/diff` | Lesson Plan Diff |
| `GET` | `/api/courses/{course_id}/lesson-plans/{session_number}/history` | Every saved version of the plan (MongoDB), newest first, with who changed it. |
| `GET` | `/api/courses/{course_id}/optimization` | Get Course Optimization |
| `POST` | `/api/courses/{course_id}/optimize` | Run Course Optimization |
| `POST` | `/api/courses/{course_id}/optimize-next-class` | Optimize Next Class |
| `GET` | `/api/courses/{course_id}/sessions` | List Sessions |
| `POST` | `/api/courses/{course_id}/sessions/{session_number}/log` | Record a taught class. A second record for the same session -> 409. |
| `POST` | `/api/courses/{course_id}/syllabus` | Upload Course Syllabus |

## Teaching Methods

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/teaching-methods` | Global method catalog (not course-specific), used when recording a taught class. |

## Syllabus Extraction

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/syllabus/upload` | Upload Syllabus |

## Exports & Compliance

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/exports/courses/{course_id}/calendar.ics` | Export course schedule as iCalendar (.ics) format |
| `GET` | `/api/exports/courses/{course_id}/outcomes-matrix` | Export NBA/ABET Course Outcome Attainment Matrix |
| `GET` | `/api/exports/lesson-plans/{session_id}/printable` | Export formatted printable HTML lesson plan (saveable as PDF) |

## DBMS Insights & Academic Showcase

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dbms/consistency` | Compare PostgreSQL pointers with MongoDB documents. Without course_id: all courses (admin). |
| `POST` | `/api/dbms/consistency/repair` | Repair Cross Store Consistency |
| `POST` | `/api/dbms/console` | Ad-hoc read-only SQL, executed as optiteach_readonly under row-level security. |
| `GET` | `/api/dbms/er-diagram` | Mermaid erDiagram generated from the live schema. |
| `GET` | `/api/dbms/nosql/aggregations` | List Nosql Aggregations |
| `POST` | `/api/dbms/nosql/aggregations/{aggregation_id}/execute` | Run Nosql Aggregation |
| `GET` | `/api/dbms/objects` | Views, routines, triggers, RLS policies, indexes and roles from the system catalogs. |
| `GET` | `/api/dbms/queries` | List Demo Queries |
| `POST` | `/api/dbms/queries/{query_id}/execute` | Execute Query |
| `POST` | `/api/dbms/queries/{query_id}/explain` | EXPLAIN (ANALYZE, BUFFERS) of a demo query: the executed plan, timings and index use. |
| `GET` | `/api/dbms/schema` | Get Relational Schema |
| `GET` | `/api/dbms/status` | Get Db Status |
| `GET` | `/api/dbms/transaction-lab` | List Transaction Scenarios |
| `POST` | `/api/dbms/transaction-lab/{scenario}` | Runs interleaved transactions on the txn_lab_accounts scratch table and returns the timeline. |

## Service

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Root *(public)* |
| `GET` | `/health` | Healthcheck *(public)* |
