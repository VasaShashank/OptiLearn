-- ===================================================================
-- OptiTeach: PostgreSQL 3NF Normalized Relational Schema
-- Source of Truth for Academic Data Management
-- ===================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table (Authentication & Access Control)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'teacher' CHECK (role IN ('teacher', 'admin')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 2. Teachers Table (Faculty Profile)
CREATE TABLE IF NOT EXISTS teachers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL,
    designation VARCHAR(100) DEFAULT 'Assistant Professor',
    employee_id VARCHAR(50) UNIQUE NOT NULL,
    office_location VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_teachers_user ON teachers(user_id);

-- 3. Courses Table (Course Metadata & Calendar Bounds)
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    semester VARCHAR(50) NOT NULL,
    academic_year VARCHAR(20) DEFAULT '2026-2027',
    total_classes INTEGER NOT NULL CHECK (total_classes > 0),
    period_duration INTEGER NOT NULL DEFAULT 55 CHECK (period_duration > 0),
    total_available_minutes INTEGER NOT NULL CHECK (total_available_minutes >= 0),
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_teacher_course_semester UNIQUE(teacher_id, code, semester)
);

CREATE INDEX IF NOT EXISTS idx_courses_teacher ON courses(teacher_id);
CREATE INDEX IF NOT EXISTS idx_courses_code ON courses(code);

-- 4. Sections Table
CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL,
    room_number VARCHAR(50),
    student_count INTEGER DEFAULT 60 CHECK (student_count > 0),
    CONSTRAINT uq_course_section_name UNIQUE(course_id, name)
);

CREATE INDEX IF NOT EXISTS idx_sections_course ON sections(course_id);

-- 5. Teacher Constraints Table
CREATE TABLE IF NOT EXISTS teacher_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID UNIQUE NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    max_lecture_ratio FLOAT DEFAULT 0.45 CHECK (max_lecture_ratio >= 0.0 AND max_lecture_ratio <= 1.0),
    min_practice_ratio FLOAT DEFAULT 0.35 CHECK (min_practice_ratio >= 0.0 AND min_practice_ratio <= 1.0),
    revision_threshold_score FLOAT DEFAULT 60.0 CHECK (revision_threshold_score >= 0.0 AND revision_threshold_score <= 100.0),
    default_revision_minutes INTEGER DEFAULT 10 CHECK (default_revision_minutes >= 0),
    preferred_methods_json TEXT DEFAULT '[]',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Course Outcomes (Bloom's Taxonomy Alignment)
CREATE TABLE IF NOT EXISTS course_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    code VARCHAR(20) NOT NULL,
    description TEXT NOT NULL,
    bloom_level VARCHAR(50) DEFAULT 'Understand' CHECK (bloom_level IN ('Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create')),
    CONSTRAINT uq_course_outcome_code UNIQUE(course_id, code)
);

CREATE INDEX IF NOT EXISTS idx_outcomes_course ON course_outcomes(course_id);

-- 7. Units Table (Curriculum Modules)
CREATE TABLE IF NOT EXISTS units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    unit_number INTEGER NOT NULL CHECK (unit_number >= 1),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    CONSTRAINT uq_course_unit_number UNIQUE(course_id, unit_number)
);

CREATE INDEX IF NOT EXISTS idx_units_course ON units(course_id);

-- 8. Topics Table
CREATE TABLE IF NOT EXISTS topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,
    estimated_minutes INTEGER NOT NULL DEFAULT 110 CHECK (estimated_minutes > 0),
    allocated_minutes INTEGER NOT NULL DEFAULT 0 CHECK (allocated_minutes >= 0),
    priority_score FLOAT DEFAULT 0.0,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
    CONSTRAINT uq_unit_topic_order UNIQUE(unit_id, order_index)
);

CREATE INDEX IF NOT EXISTS idx_topics_unit ON topics(unit_id);

-- 9. Concepts Table (Atomic Knowledge Units)
CREATE TABLE IF NOT EXISTS concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    difficulty INTEGER DEFAULT 3 CHECK (difficulty >= 1 AND difficulty <= 5),
    importance INTEGER DEFAULT 3 CHECK (importance >= 1 AND importance <= 5),
    concept_type VARCHAR(50) DEFAULT 'conceptual' CHECK (concept_type IN ('conceptual', 'procedural', 'problem_solving', 'practical', 'analytical', 'revision')),
    order_index INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_concepts_topic ON concepts(topic_id);

-- 10. Concept Outcomes Association Table (M:N)
CREATE TABLE IF NOT EXISTS concept_outcomes (
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    outcome_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    PRIMARY KEY (concept_id, outcome_id)
);

-- 11. Prerequisites Table (Directed Concept Graph Edges)
CREATE TABLE IF NOT EXISTS prerequisites (
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    prerequisite_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    PRIMARY KEY (concept_id, prerequisite_id),
    CONSTRAINT check_no_self_prerequisite CHECK (concept_id != prerequisite_id)
);

CREATE INDEX IF NOT EXISTS idx_prereq_source ON prerequisites(concept_id);
CREATE INDEX IF NOT EXISTS idx_prereq_target ON prerequisites(prerequisite_id);

-- 12. Class Sessions Table (Discrete Timetable Periods)
CREATE TABLE IF NOT EXISTS class_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    session_number INTEGER NOT NULL CHECK (session_number >= 1),
    scheduled_date TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER NOT NULL DEFAULT 55 CHECK (duration_minutes > 0),
    current_topic_id UUID REFERENCES topics(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT uq_course_session_number UNIQUE(course_id, session_number)
);

CREATE INDEX IF NOT EXISTS idx_sessions_course ON class_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_sessions_topic ON class_sessions(current_topic_id);

-- 13. Teaching Methods Table (Pedagogical Strategy Catalog)
CREATE TABLE IF NOT EXISTS teaching_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    typical_time_ratio FLOAT DEFAULT 0.25
);

-- 14. Lesson Plans Table (Relational Pointer to MongoDB Document)
CREATE TABLE IF NOT EXISTS lesson_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'modified', 'completed')),
    mongo_doc_id VARCHAR(100),
    ai_confidence FLOAT DEFAULT 0.90,
    teacher_overridden BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lesson_plans_session ON lesson_plans(session_id);

-- 15. Teaching Sessions Table (Audit of Conducted Classroom Periods)
CREATE TABLE IF NOT EXISTS teaching_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID UNIQUE NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    method_id UUID REFERENCES teaching_methods(id) ON DELETE SET NULL,
    actual_minutes INTEGER NOT NULL DEFAULT 55 CHECK (actual_minutes > 0),
    teacher_notes TEXT,
    student_engagement_rating INTEGER DEFAULT 4 CHECK (student_engagement_rating >= 1 AND student_engagement_rating <= 5),
    completion_rate FLOAT DEFAULT 1.0 CHECK (completion_rate >= 0.0 AND completion_rate <= 1.0),
    conducted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_teaching_sessions_session ON teaching_sessions(session_id);

-- 16. Assessments Table
CREATE TABLE IF NOT EXISTS assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    assessment_type VARCHAR(50) NOT NULL CHECK (assessment_type IN ('quiz', 'assignment', 'midterm', 'final')),
    max_marks FLOAT NOT NULL DEFAULT 25.0 CHECK (max_marks > 0),
    scheduled_date TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assessments_course ON assessments(course_id);

-- 17. Questions Table
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    question_number INTEGER NOT NULL CHECK (question_number >= 1),
    max_marks FLOAT NOT NULL CHECK (max_marks > 0),
    text TEXT NOT NULL,
    CONSTRAINT uq_assessment_question_num UNIQUE(assessment_id, question_number)
);

CREATE INDEX IF NOT EXISTS idx_questions_assessment ON questions(assessment_id);

-- 18. Question Concepts Association Table (M:N)
CREATE TABLE IF NOT EXISTS question_concepts (
    question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    weightage FLOAT DEFAULT 1.0 CHECK (weightage > 0),
    PRIMARY KEY (question_id, concept_id)
);

-- 19. Performance Table (Aggregate Concept-Level Mastery)
CREATE TABLE IF NOT EXISTS performance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    concept_id UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    average_score FLOAT NOT NULL CHECK (average_score >= 0.0 AND average_score <= 100.0),
    sample_size INTEGER DEFAULT 60 CHECK (sample_size > 0),
    weakness_flag BOOLEAN DEFAULT FALSE,
    common_errors TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_concept_assessment_performance UNIQUE(concept_id, assessment_id)
);

CREATE INDEX IF NOT EXISTS idx_performance_concept ON performance(concept_id);
CREATE INDEX IF NOT EXISTS idx_performance_assessment ON performance(assessment_id);

-- 20. Method Effectiveness Table (Empirical Pedagogical Learning Gains)
CREATE TABLE IF NOT EXISTS method_effectiveness (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    method_id UUID NOT NULL REFERENCES teaching_methods(id) ON DELETE CASCADE,
    concept_type VARCHAR(50) NOT NULL,
    baseline_score FLOAT DEFAULT 50.0,
    post_score FLOAT DEFAULT 65.0,
    observed_gain FLOAT DEFAULT 15.0,
    sample_sessions_count INTEGER DEFAULT 5,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_method_eff_method ON method_effectiveness(method_id);
