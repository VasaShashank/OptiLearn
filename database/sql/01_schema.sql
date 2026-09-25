-- ===================================================================
-- OptiTeach: PostgreSQL 3NF Normalized Relational Schema (reference DDL)
--
-- GENERATED from the live database after `alembic upgrade head`:
--   pg_dump -U postgres --schema-only --no-owner --no-privileges -T alembic_version optiteach
-- Source of truth is database/migrations/ — regenerate this file, don't hand-edit it.
-- ===================================================================

--
-- PostgreSQL database dump
--


--
-- Name: assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    assessment_type character varying(50) NOT NULL,
    max_marks double precision NOT NULL,
    scheduled_date timestamp without time zone,
    status character varying(50),
    created_at timestamp without time zone,
    CONSTRAINT check_assessment_status CHECK (((status)::text = ANY ((ARRAY['upcoming'::character varying, 'completed'::character varying])::text[]))),
    CONSTRAINT check_assessment_type CHECK (((assessment_type)::text = ANY ((ARRAY['quiz'::character varying, 'assignment'::character varying, 'midterm'::character varying, 'final'::character varying])::text[]))),
    CONSTRAINT check_positive_max_marks CHECK ((max_marks > (0)::double precision))
);

--
-- Name: class_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.class_sessions (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    session_number integer NOT NULL,
    scheduled_date timestamp without time zone,
    duration_minutes integer NOT NULL,
    current_topic_id character varying(36),
    status character varying(50),
    CONSTRAINT check_positive_session_duration CHECK ((duration_minutes > 0)),
    CONSTRAINT check_positive_session_number CHECK ((session_number >= 1)),
    CONSTRAINT check_session_status CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);

--
-- Name: concept_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concept_outcomes (
    concept_id character varying(36) NOT NULL,
    outcome_id character varying(36) NOT NULL
);

--
-- Name: concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.concepts (
    id character varying(36) NOT NULL,
    topic_id character varying(36) NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    difficulty integer,
    importance integer,
    concept_type character varying(50),
    order_index integer,
    CONSTRAINT check_concept_type CHECK (((concept_type)::text = ANY ((ARRAY['conceptual'::character varying, 'procedural'::character varying, 'problem_solving'::character varying, 'practical'::character varying, 'analytical'::character varying, 'revision'::character varying])::text[]))),
    CONSTRAINT check_difficulty_range CHECK (((difficulty >= 1) AND (difficulty <= 5))),
    CONSTRAINT check_importance_range CHECK (((importance >= 1) AND (importance <= 5)))
);

--
-- Name: course_outcomes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.course_outcomes (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    code character varying(20) NOT NULL,
    description text NOT NULL,
    bloom_level character varying(50),
    CONSTRAINT check_bloom_level CHECK (((bloom_level)::text = ANY ((ARRAY['Remember'::character varying, 'Understand'::character varying, 'Apply'::character varying, 'Analyze'::character varying, 'Evaluate'::character varying, 'Create'::character varying])::text[])))
);

--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id character varying(36) NOT NULL,
    teacher_id character varying(36) NOT NULL,
    code character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    semester character varying(50) NOT NULL,
    academic_year character varying(20),
    total_classes integer NOT NULL,
    period_duration integer NOT NULL,
    total_available_minutes integer NOT NULL,
    start_date timestamp without time zone,
    end_date timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    CONSTRAINT check_non_negative_available_time CHECK ((total_available_minutes >= 0)),
    CONSTRAINT check_positive_period_duration CHECK ((period_duration > 0)),
    CONSTRAINT check_positive_total_classes CHECK ((total_classes > 0))
);

--
-- Name: lesson_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lesson_plans (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    topic_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    status character varying(50),
    mongo_doc_id character varying(100),
    ai_confidence double precision,
    teacher_overridden boolean,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    CONSTRAINT check_ai_confidence_range CHECK (((ai_confidence >= (0.0)::double precision) AND (ai_confidence <= (1.0)::double precision))),
    CONSTRAINT check_lesson_plan_status CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'approved'::character varying, 'rejected'::character varying, 'modified'::character varying, 'completed'::character varying])::text[])))
);

--
-- Name: method_effectiveness; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.method_effectiveness (
    id character varying(36) NOT NULL,
    method_id character varying(36) NOT NULL,
    concept_type character varying(50) NOT NULL,
    baseline_score double precision,
    post_score double precision,
    observed_gain double precision,
    sample_sessions_count integer,
    updated_at timestamp without time zone,
    CONSTRAINT check_non_negative_sample_sessions CHECK ((sample_sessions_count >= 0))
);

--
-- Name: performance; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.performance (
    id character varying(36) NOT NULL,
    concept_id character varying(36) NOT NULL,
    assessment_id character varying(36) NOT NULL,
    average_score double precision NOT NULL,
    sample_size integer,
    weakness_flag boolean,
    common_errors text,
    recorded_at timestamp without time zone,
    CONSTRAINT check_average_score_range CHECK (((average_score >= (0.0)::double precision) AND (average_score <= (100.0)::double precision))),
    CONSTRAINT check_positive_sample_size CHECK ((sample_size > 0))
);

--
-- Name: prerequisites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prerequisites (
    concept_id character varying(36) NOT NULL,
    prerequisite_id character varying(36) NOT NULL,
    CONSTRAINT check_no_self_prerequisite CHECK (((concept_id)::text <> (prerequisite_id)::text))
);

--
-- Name: question_concepts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_concepts (
    question_id character varying(36) NOT NULL,
    concept_id character varying(36) NOT NULL,
    weightage double precision,
    CONSTRAINT check_positive_weightage CHECK ((weightage > (0)::double precision))
);

--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id character varying(36) NOT NULL,
    assessment_id character varying(36) NOT NULL,
    question_number integer NOT NULL,
    max_marks double precision NOT NULL,
    text text NOT NULL,
    CONSTRAINT check_positive_question_marks CHECK ((max_marks > (0)::double precision)),
    CONSTRAINT check_positive_question_number CHECK ((question_number >= 1))
);

--
-- Name: sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sections (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    name character varying(50) NOT NULL,
    room_number character varying(50),
    student_count integer,
    CONSTRAINT check_positive_student_count CHECK ((student_count > 0))
);

--
-- Name: teacher_constraints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teacher_constraints (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    max_lecture_ratio double precision,
    min_practice_ratio double precision,
    revision_threshold_score double precision,
    default_revision_minutes integer,
    preferred_methods_json text,
    created_at timestamp without time zone,
    CONSTRAINT check_max_lecture_ratio_range CHECK (((max_lecture_ratio >= (0.0)::double precision) AND (max_lecture_ratio <= (1.0)::double precision))),
    CONSTRAINT check_min_practice_ratio_range CHECK (((min_practice_ratio >= (0.0)::double precision) AND (min_practice_ratio <= (1.0)::double precision))),
    CONSTRAINT check_non_negative_revision_minutes CHECK ((default_revision_minutes >= 0)),
    CONSTRAINT check_revision_threshold_range CHECK (((revision_threshold_score >= (0.0)::double precision) AND (revision_threshold_score <= (100.0)::double precision)))
);

--
-- Name: teachers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teachers (
    id character varying(36) NOT NULL,
    user_id character varying(36) NOT NULL,
    department character varying(100) NOT NULL,
    designation character varying(100),
    employee_id character varying(50) NOT NULL,
    office_location character varying(100)
);

--
-- Name: teaching_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teaching_methods (
    id character varying(36) NOT NULL,
    name character varying(100) NOT NULL,
    category character varying(50) NOT NULL,
    description text,
    typical_time_ratio double precision,
    CONSTRAINT check_typical_time_ratio_range CHECK (((typical_time_ratio > (0.0)::double precision) AND (typical_time_ratio <= (1.0)::double precision)))
);

--
-- Name: teaching_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.teaching_sessions (
    id character varying(36) NOT NULL,
    session_id character varying(36) NOT NULL,
    method_id character varying(36),
    actual_minutes integer NOT NULL,
    teacher_notes text,
    student_engagement_rating integer,
    completion_rate double precision,
    conducted_at timestamp without time zone,
    CONSTRAINT check_completion_rate_range CHECK (((completion_rate >= (0.0)::double precision) AND (completion_rate <= (1.0)::double precision))),
    CONSTRAINT check_engagement_rating_range CHECK (((student_engagement_rating >= 1) AND (student_engagement_rating <= 5))),
    CONSTRAINT check_positive_actual_minutes CHECK ((actual_minutes > 0))
);

--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id character varying(36) NOT NULL,
    unit_id character varying(36) NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    order_index integer NOT NULL,
    estimated_minutes integer,
    allocated_minutes integer,
    priority_score double precision,
    status character varying(50),
    CONSTRAINT check_non_negative_allocated_minutes CHECK ((allocated_minutes >= 0)),
    CONSTRAINT check_positive_estimated_minutes CHECK ((estimated_minutes > 0)),
    CONSTRAINT check_topic_status CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'in_progress'::character varying, 'completed'::character varying])::text[])))
);

--
-- Name: units; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.units (
    id character varying(36) NOT NULL,
    course_id character varying(36) NOT NULL,
    unit_number integer NOT NULL,
    title character varying(255) NOT NULL,
    description text,
    order_index integer NOT NULL,
    CONSTRAINT check_unit_number_positive CHECK ((unit_number >= 1))
);

--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id character varying(36) NOT NULL,
    email character varying(255) NOT NULL,
    hashed_password character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    is_active boolean,
    created_at timestamp without time zone,
    CONSTRAINT check_user_role CHECK (((role)::text = ANY ((ARRAY['teacher'::character varying, 'admin'::character varying])::text[])))
);

--
-- Name: assessments assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_pkey PRIMARY KEY (id);

--
-- Name: class_sessions class_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_pkey PRIMARY KEY (id);

--
-- Name: concept_outcomes concept_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_outcomes
    ADD CONSTRAINT concept_outcomes_pkey PRIMARY KEY (concept_id, outcome_id);

--
-- Name: concepts concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_pkey PRIMARY KEY (id);

--
-- Name: course_outcomes course_outcomes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_outcomes
    ADD CONSTRAINT course_outcomes_pkey PRIMARY KEY (id);

--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);

--
-- Name: lesson_plans lesson_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_pkey PRIMARY KEY (id);

--
-- Name: lesson_plans lesson_plans_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_session_id_key UNIQUE (session_id);

--
-- Name: method_effectiveness method_effectiveness_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.method_effectiveness
    ADD CONSTRAINT method_effectiveness_pkey PRIMARY KEY (id);

--
-- Name: performance performance_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_pkey PRIMARY KEY (id);

--
-- Name: prerequisites prerequisites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prerequisites
    ADD CONSTRAINT prerequisites_pkey PRIMARY KEY (concept_id, prerequisite_id);

--
-- Name: question_concepts question_concepts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_concepts
    ADD CONSTRAINT question_concepts_pkey PRIMARY KEY (question_id, concept_id);

--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);

--
-- Name: sections sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_pkey PRIMARY KEY (id);

--
-- Name: teacher_constraints teacher_constraints_course_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_constraints
    ADD CONSTRAINT teacher_constraints_course_id_key UNIQUE (course_id);

--
-- Name: teacher_constraints teacher_constraints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_constraints
    ADD CONSTRAINT teacher_constraints_pkey PRIMARY KEY (id);

--
-- Name: teachers teachers_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_employee_id_key UNIQUE (employee_id);

--
-- Name: teachers teachers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_pkey PRIMARY KEY (id);

--
-- Name: teachers teachers_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_key UNIQUE (user_id);

--
-- Name: teaching_methods teaching_methods_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teaching_methods
    ADD CONSTRAINT teaching_methods_name_key UNIQUE (name);

--
-- Name: teaching_methods teaching_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teaching_methods
    ADD CONSTRAINT teaching_methods_pkey PRIMARY KEY (id);

--
-- Name: teaching_sessions teaching_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teaching_sessions
    ADD CONSTRAINT teaching_sessions_pkey PRIMARY KEY (id);

--
-- Name: teaching_sessions teaching_sessions_session_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teaching_sessions
    ADD CONSTRAINT teaching_sessions_session_id_key UNIQUE (session_id);

--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);

--
-- Name: units units_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);

--
-- Name: questions uq_assessment_question_num; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT uq_assessment_question_num UNIQUE (assessment_id, question_number);

--
-- Name: performance uq_concept_assessment_performance; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT uq_concept_assessment_performance UNIQUE (concept_id, assessment_id);

--
-- Name: course_outcomes uq_course_outcome_code; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_outcomes
    ADD CONSTRAINT uq_course_outcome_code UNIQUE (course_id, code);

--
-- Name: sections uq_course_section_name; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT uq_course_section_name UNIQUE (course_id, name);

--
-- Name: class_sessions uq_course_session_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT uq_course_session_number UNIQUE (course_id, session_number);

--
-- Name: units uq_course_unit_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT uq_course_unit_number UNIQUE (course_id, unit_number);

--
-- Name: courses uq_teacher_course_semester; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT uq_teacher_course_semester UNIQUE (teacher_id, code, semester);

--
-- Name: topics uq_unit_topic_order; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT uq_unit_topic_order UNIQUE (unit_id, order_index);

--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

--
-- Name: ix_assessments_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_assessments_course_id ON public.assessments USING btree (course_id);

--
-- Name: ix_assessments_scheduled_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_assessments_scheduled_date ON public.assessments USING btree (scheduled_date);

--
-- Name: ix_class_sessions_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_class_sessions_course_id ON public.class_sessions USING btree (course_id);

--
-- Name: ix_concepts_topic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_concepts_topic_id ON public.concepts USING btree (topic_id);

--
-- Name: ix_course_outcomes_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_course_outcomes_course_id ON public.course_outcomes USING btree (course_id);

--
-- Name: ix_courses_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_courses_code ON public.courses USING btree (code);

--
-- Name: ix_courses_teacher_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_courses_teacher_id ON public.courses USING btree (teacher_id);

--
-- Name: ix_lesson_plans_topic_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_lesson_plans_topic_id ON public.lesson_plans USING btree (topic_id);

--
-- Name: ix_method_effectiveness_method_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_method_effectiveness_method_id ON public.method_effectiveness USING btree (method_id);

--
-- Name: ix_performance_assessment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_performance_assessment_id ON public.performance USING btree (assessment_id);

--
-- Name: ix_performance_concept_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_performance_concept_id ON public.performance USING btree (concept_id);

--
-- Name: ix_questions_assessment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_questions_assessment_id ON public.questions USING btree (assessment_id);

--
-- Name: ix_sections_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sections_course_id ON public.sections USING btree (course_id);

--
-- Name: ix_topics_unit_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_topics_unit_id ON public.topics USING btree (unit_id);

--
-- Name: ix_units_course_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_units_course_id ON public.units USING btree (course_id);

--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);

--
-- Name: assessments assessments_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments
    ADD CONSTRAINT assessments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- Name: class_sessions class_sessions_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- Name: class_sessions class_sessions_current_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.class_sessions
    ADD CONSTRAINT class_sessions_current_topic_id_fkey FOREIGN KEY (current_topic_id) REFERENCES public.topics(id) ON DELETE SET NULL;

--
-- Name: concept_outcomes concept_outcomes_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_outcomes
    ADD CONSTRAINT concept_outcomes_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;

--
-- Name: concept_outcomes concept_outcomes_outcome_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concept_outcomes
    ADD CONSTRAINT concept_outcomes_outcome_id_fkey FOREIGN KEY (outcome_id) REFERENCES public.course_outcomes(id) ON DELETE CASCADE;

--
-- Name: concepts concepts_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.concepts
    ADD CONSTRAINT concepts_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;

--
-- Name: course_outcomes course_outcomes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.course_outcomes
    ADD CONSTRAINT course_outcomes_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- Name: courses courses_teacher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_teacher_id_fkey FOREIGN KEY (teacher_id) REFERENCES public.teachers(id) ON DELETE CASCADE;

--
-- Name: lesson_plans lesson_plans_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;

--
-- Name: lesson_plans lesson_plans_topic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lesson_plans
    ADD CONSTRAINT lesson_plans_topic_id_fkey FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;

--
-- Name: method_effectiveness method_effectiveness_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.method_effectiveness
    ADD CONSTRAINT method_effectiveness_method_id_fkey FOREIGN KEY (method_id) REFERENCES public.teaching_methods(id) ON DELETE CASCADE;

--
-- Name: performance performance_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;

--
-- Name: performance performance_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.performance
    ADD CONSTRAINT performance_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;

--
-- Name: prerequisites prerequisites_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prerequisites
    ADD CONSTRAINT prerequisites_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;

--
-- Name: prerequisites prerequisites_prerequisite_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prerequisites
    ADD CONSTRAINT prerequisites_prerequisite_id_fkey FOREIGN KEY (prerequisite_id) REFERENCES public.concepts(id) ON DELETE CASCADE;

--
-- Name: question_concepts question_concepts_concept_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_concepts
    ADD CONSTRAINT question_concepts_concept_id_fkey FOREIGN KEY (concept_id) REFERENCES public.concepts(id) ON DELETE CASCADE;

--
-- Name: question_concepts question_concepts_question_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_concepts
    ADD CONSTRAINT question_concepts_question_id_fkey FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;

--
-- Name: questions questions_assessment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_assessment_id_fkey FOREIGN KEY (assessment_id) REFERENCES public.assessments(id) ON DELETE CASCADE;

--
-- Name: sections sections_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sections
    ADD CONSTRAINT sections_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- Name: teacher_constraints teacher_constraints_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teacher_constraints
    ADD CONSTRAINT teacher_constraints_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- Name: teachers teachers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teachers
    ADD CONSTRAINT teachers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

--
-- Name: teaching_sessions teaching_sessions_method_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teaching_sessions
    ADD CONSTRAINT teaching_sessions_method_id_fkey FOREIGN KEY (method_id) REFERENCES public.teaching_methods(id) ON DELETE SET NULL;

--
-- Name: teaching_sessions teaching_sessions_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.teaching_sessions
    ADD CONSTRAINT teaching_sessions_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.class_sessions(id) ON DELETE CASCADE;

--
-- Name: topics topics_unit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_unit_id_fkey FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE CASCADE;

--
-- Name: units units_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.units
    ADD CONSTRAINT units_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id) ON DELETE CASCADE;

--
-- PostgreSQL database dump complete
--


