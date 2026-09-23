# 📖 OptiTeach Faculty User Manual

Step-by-step operational handbook for university educators using OptiTeach.

---

## 1. Getting Started

1. **Access the Web Dashboard:** Open your browser to `http://localhost:3000`.
2. **Login / Authentication:** Enter your university email and faculty password, or click **Quick Demo Login** for evaluation.

---

## 2. Course Creation & Syllabus Upload

1. Navigate to **Upload Syllabus** (`/upload`).
2. Select your course from the dropdown or click **New Course**.
3. Choose your input format:
   - **Upload PDF:** Select your official syllabus PDF document.
   - **Paste Text:** Paste raw syllabus content directly into the text editor.
4. Click **Extract Curriculum Structure**. The deterministic NLP engine parses:
   - Course title, code, and credit load
   - Units / Modules with roman numeral resolution
   - Topics, granular concepts, and prerequisite dependencies
   - Course Outcomes (COs) mapped to Bloom's taxonomy
5. Review the extracted draft in the interactive editor and click **Confirm & Persist Curriculum**.

---

## 3. Curriculum Graph & Optimization

1. Navigate to **Curriculum Graph** (`/courses/[id]`) to explore the Directed Acyclic Graph (DAG).
2. Red nodes indicate **Prerequisite Bottlenecks** where student cohorts have historically struggled.
3. Click **Optimization Engine** (`/optimization`) to view the MILP period allocations:
   - Topic priority scores
   - Dedicated revision buffers (10%) and midterm checkpoint buffers (8%)
   - Time pressure indicators (Healthy / Balanced / High Pressure)

---

## 4. Lesson Planning & In-Class Execution

1. Navigate to **Lesson Plans** (`/lesson-plans`).
2. Select your course and target class period (e.g. Period 1 to 40).
3. Click **Generate Plan**:
   - Automatic 5-phase breakdown strictly summing to your class duration (e.g., 55 minutes).
   - Pedagogical learning objectives, worked examples, common misconceptions, and exit tickets.
4. Export plans as formatted PDF or `.ics` timetable sync.
