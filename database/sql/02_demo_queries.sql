-- ===================================================================
-- OptiTeach: 10 Core SQL Demonstration Queries for Academic Evaluation
-- Demonstrates Relational Join Power, Group By, Havings, Aggregations,
-- and Optimization Feedback Lookups
-- ===================================================================

-- 1. Topics Remaining in Curriculum
-- Identifies uncompleted topics ordered by unit and curricular sequence.
SELECT u.unit_number, u.title AS unit_title, t.title AS topic_title, 
       t.estimated_minutes, t.allocated_minutes, t.priority_score, t.status
FROM topics t
JOIN units u ON t.unit_id = u.id
WHERE u.course_id = 'YOUR_COURSE_ID' AND t.status != 'completed'
ORDER BY u.unit_number, t.order_index;

-- 2. Contact Time Utilization & Remaining Budget
-- Computes total planned teaching minutes versus recorded taught minutes.
SELECT c.code, c.title, c.total_available_minutes,
       COALESCE(SUM(ts.actual_minutes), 0) AS actual_taught_minutes,
       (c.total_available_minutes - COALESCE(SUM(ts.actual_minutes), 0)) AS remaining_teaching_minutes
FROM courses c
LEFT JOIN class_sessions cs ON cs.course_id = c.id
LEFT JOIN teaching_sessions ts ON ts.session_id = cs.id
WHERE c.id = 'YOUR_COURSE_ID'
GROUP BY c.id, c.code, c.title, c.total_available_minutes;

-- 3. Below-Threshold Concepts (Weakness Detection)
-- Flags concepts where student cohort score falls below the 60% threshold.
SELECT c.name AS concept_name, c.difficulty, c.importance, 
       ROUND(AVG(p.average_score)::numeric, 1) AS avg_score,
       COUNT(p.id) AS assessment_count,
       MAX(p.common_errors) AS primary_misconception
FROM concepts c
JOIN performance p ON p.concept_id = c.id
JOIN topics t ON c.topic_id = t.id
JOIN units u ON t.unit_id = u.id
WHERE u.course_id = 'YOUR_COURSE_ID'
GROUP BY c.id, c.name, c.difficulty, c.importance
HAVING AVG(p.average_score) < 60.0
ORDER BY avg_score ASC;

-- 4. Scheduled Assessment Pipeline
-- Lists pending tests, mapped questions count, and total maximum marks.
SELECT a.id, a.title, a.assessment_type, a.max_marks, a.scheduled_date, a.status,
       COUNT(q.id) AS question_count
FROM assessments a
LEFT JOIN questions q ON q.assessment_id = a.id
WHERE a.course_id = 'YOUR_COURSE_ID' AND a.status = 'upcoming'
GROUP BY a.id, a.title, a.assessment_type, a.max_marks, a.scheduled_date, a.status
ORDER BY a.scheduled_date ASC;

-- 5. Completed Teaching Session Logs
-- Displays classroom delivery history, pedagogical methods utilized, and notes.
SELECT cs.session_number, t.title AS topic_taught, tm.name AS method_utilized,
       ts.actual_minutes, ts.student_engagement_rating, ts.teacher_notes, ts.conducted_at
FROM class_sessions cs
JOIN teaching_sessions ts ON ts.session_id = cs.id
LEFT JOIN topics t ON cs.current_topic_id = t.id
LEFT JOIN teaching_methods tm ON ts.method_id = tm.id
WHERE cs.course_id = 'YOUR_COURSE_ID'
ORDER BY cs.session_number DESC;

-- 6. Course Progress & Session Ratio
-- Computes percentage of completed periods against total budgeted sessions.
SELECT c.total_classes,
       COUNT(CASE WHEN cs.status = 'completed' THEN 1 END) AS completed_periods,
       COUNT(CASE WHEN cs.status = 'scheduled' THEN 1 END) AS pending_periods,
       ROUND((COUNT(CASE WHEN cs.status = 'completed' THEN 1 END)::numeric / c.total_classes * 100), 1) AS progress_pct
FROM courses c
JOIN class_sessions cs ON cs.course_id = c.id
WHERE c.id = 'YOUR_COURSE_ID'
GROUP BY c.id, c.total_classes;

-- 7. Prerequisite Bottleneck Concepts
-- Finds concepts that serve as prerequisites for multiple subsequent topics while suffering low mastery.
SELECT p_concept.name AS bottleneck_concept,
       COUNT(DISTINCT prereq.concept_id) AS downstream_dependent_concepts,
       ROUND(AVG(p.average_score)::numeric, 1) AS cohort_score
FROM prerequisites prereq
JOIN concepts p_concept ON prereq.prerequisite_id = p_concept.id
LEFT JOIN performance p ON p.concept_id = p_concept.id
JOIN topics t ON p_concept.topic_id = t.id
JOIN units u ON t.unit_id = u.id
WHERE u.course_id = 'YOUR_COURSE_ID'
GROUP BY p_concept.id, p_concept.name
HAVING COUNT(DISTINCT prereq.concept_id) >= 2
ORDER BY downstream_dependent_concepts DESC, cohort_score ASC;

-- 8. Empirical Teaching Method Gain Analysis
-- Evaluates observed student learning gains across teaching methodology styles.
SELECT tm.name AS teaching_method, me.concept_type,
       me.baseline_score, me.post_score, me.observed_gain,
       me.sample_sessions_count
FROM method_effectiveness me
JOIN teaching_methods tm ON me.method_id = tm.id
ORDER BY me.observed_gain DESC;

-- 9. Topic-Level Planned vs Allocated Time
-- Compares syllabus estimated base time against optimizer-allocated instructional minutes.
SELECT t.title AS topic_title, t.estimated_minutes AS syllabus_estimate,
       t.allocated_minutes AS optimizer_allocated,
       (t.allocated_minutes - t.estimated_minutes) AS allocation_variance,
       t.priority_score
FROM topics t
JOIN units u ON t.unit_id = u.id
WHERE u.course_id = 'YOUR_COURSE_ID'
ORDER BY t.priority_score DESC;

-- 10. Immediate Revision Priority Queue
-- Identifies concepts mapped to upcoming sessions whose prerequisite average is under threshold.
SELECT DISTINCT c_prereq.name AS revision_target_concept,
       p.average_score AS recorded_score,
       p.common_errors,
       t_target.title AS blocking_for_topic
FROM class_sessions cs
JOIN topics t_target ON cs.current_topic_id = t_target.id
JOIN concepts c_target ON c_target.topic_id = t_target.id
JOIN prerequisites pr ON pr.concept_id = c_target.id
JOIN concepts c_prereq ON pr.prerequisite_id = c_prereq.id
JOIN performance p ON p.concept_id = c_prereq.id
WHERE cs.course_id = 'YOUR_COURSE_ID' AND cs.status = 'scheduled' AND p.average_score < 60.0
ORDER BY p.average_score ASC;
