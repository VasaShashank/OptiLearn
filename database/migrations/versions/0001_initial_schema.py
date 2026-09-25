"""initial schema

Revision ID: 0001
Revises: 
Create Date: 2026-09-23 22:57:57.117096

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Explicit DDL for the 3NF core schema (generated from app/models/entities.py, then reviewed)
    op.create_table('teaching_methods',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=100), nullable=False),
    sa.Column('category', sa.String(length=50), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('typical_time_ratio', sa.Float(), nullable=True),
    sa.CheckConstraint('typical_time_ratio > 0.0 AND typical_time_ratio <= 1.0', name='check_typical_time_ratio_range'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('name')
    )
    op.create_table('users',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('hashed_password', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=255), nullable=False),
    sa.Column('role', sa.String(length=50), nullable=False),
    sa.Column('is_active', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint("role IN ('teacher', 'admin')", name='check_user_role'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_table('method_effectiveness',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('method_id', sa.String(length=36), nullable=False),
    sa.Column('concept_type', sa.String(length=50), nullable=False),
    sa.Column('baseline_score', sa.Float(), nullable=True),
    sa.Column('post_score', sa.Float(), nullable=True),
    sa.Column('observed_gain', sa.Float(), nullable=True),
    sa.Column('sample_sessions_count', sa.Integer(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint('sample_sessions_count >= 0', name='check_non_negative_sample_sessions'),
    sa.ForeignKeyConstraint(['method_id'], ['teaching_methods.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_method_effectiveness_method_id'), 'method_effectiveness', ['method_id'], unique=False)
    op.create_table('teachers',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('department', sa.String(length=100), nullable=False),
    sa.Column('designation', sa.String(length=100), nullable=True),
    sa.Column('employee_id', sa.String(length=50), nullable=False),
    sa.Column('office_location', sa.String(length=100), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('employee_id'),
    sa.UniqueConstraint('user_id')
    )
    op.create_table('courses',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('teacher_id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=50), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('semester', sa.String(length=50), nullable=False),
    sa.Column('academic_year', sa.String(length=20), nullable=True),
    sa.Column('total_classes', sa.Integer(), nullable=False),
    sa.Column('period_duration', sa.Integer(), nullable=False),
    sa.Column('total_available_minutes', sa.Integer(), nullable=False),
    sa.Column('start_date', sa.DateTime(), nullable=True),
    sa.Column('end_date', sa.DateTime(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint('period_duration > 0', name='check_positive_period_duration'),
    sa.CheckConstraint('total_available_minutes >= 0', name='check_non_negative_available_time'),
    sa.CheckConstraint('total_classes > 0', name='check_positive_total_classes'),
    sa.ForeignKeyConstraint(['teacher_id'], ['teachers.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('teacher_id', 'code', 'semester', name='uq_teacher_course_semester')
    )
    op.create_index(op.f('ix_courses_code'), 'courses', ['code'], unique=False)
    op.create_index(op.f('ix_courses_teacher_id'), 'courses', ['teacher_id'], unique=False)
    op.create_table('assessments',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('assessment_type', sa.String(length=50), nullable=False),
    sa.Column('max_marks', sa.Float(), nullable=False),
    sa.Column('scheduled_date', sa.DateTime(), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint("assessment_type IN ('quiz', 'assignment', 'midterm', 'final')", name='check_assessment_type'),
    sa.CheckConstraint("status IN ('upcoming', 'completed')", name='check_assessment_status'),
    sa.CheckConstraint('max_marks > 0', name='check_positive_max_marks'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_assessments_course_id'), 'assessments', ['course_id'], unique=False)
    op.create_index(op.f('ix_assessments_scheduled_date'), 'assessments', ['scheduled_date'], unique=False)
    op.create_table('course_outcomes',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('bloom_level', sa.String(length=50), nullable=True),
    sa.CheckConstraint("bloom_level IN ('Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create')", name='check_bloom_level'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id', 'code', name='uq_course_outcome_code')
    )
    op.create_index(op.f('ix_course_outcomes_course_id'), 'course_outcomes', ['course_id'], unique=False)
    op.create_table('sections',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=50), nullable=False),
    sa.Column('room_number', sa.String(length=50), nullable=True),
    sa.Column('student_count', sa.Integer(), nullable=True),
    sa.CheckConstraint('student_count > 0', name='check_positive_student_count'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id', 'name', name='uq_course_section_name')
    )
    op.create_index(op.f('ix_sections_course_id'), 'sections', ['course_id'], unique=False)
    op.create_table('teacher_constraints',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('max_lecture_ratio', sa.Float(), nullable=True),
    sa.Column('min_practice_ratio', sa.Float(), nullable=True),
    sa.Column('revision_threshold_score', sa.Float(), nullable=True),
    sa.Column('default_revision_minutes', sa.Integer(), nullable=True),
    sa.Column('preferred_methods_json', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint('default_revision_minutes >= 0', name='check_non_negative_revision_minutes'),
    sa.CheckConstraint('max_lecture_ratio >= 0.0 AND max_lecture_ratio <= 1.0', name='check_max_lecture_ratio_range'),
    sa.CheckConstraint('min_practice_ratio >= 0.0 AND min_practice_ratio <= 1.0', name='check_min_practice_ratio_range'),
    sa.CheckConstraint('revision_threshold_score >= 0.0 AND revision_threshold_score <= 100.0', name='check_revision_threshold_range'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id')
    )
    op.create_table('units',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('unit_number', sa.Integer(), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.CheckConstraint('unit_number >= 1', name='check_unit_number_positive'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id', 'unit_number', name='uq_course_unit_number')
    )
    op.create_index(op.f('ix_units_course_id'), 'units', ['course_id'], unique=False)
    op.create_table('questions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('assessment_id', sa.String(length=36), nullable=False),
    sa.Column('question_number', sa.Integer(), nullable=False),
    sa.Column('max_marks', sa.Float(), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.CheckConstraint('max_marks > 0', name='check_positive_question_marks'),
    sa.CheckConstraint('question_number >= 1', name='check_positive_question_number'),
    sa.ForeignKeyConstraint(['assessment_id'], ['assessments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('assessment_id', 'question_number', name='uq_assessment_question_num')
    )
    op.create_index(op.f('ix_questions_assessment_id'), 'questions', ['assessment_id'], unique=False)
    op.create_table('topics',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('unit_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('order_index', sa.Integer(), nullable=False),
    sa.Column('estimated_minutes', sa.Integer(), nullable=True),
    sa.Column('allocated_minutes', sa.Integer(), nullable=True),
    sa.Column('priority_score', sa.Float(), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=True),
    sa.CheckConstraint("status IN ('pending', 'in_progress', 'completed')", name='check_topic_status'),
    sa.CheckConstraint('allocated_minutes >= 0', name='check_non_negative_allocated_minutes'),
    sa.CheckConstraint('estimated_minutes > 0', name='check_positive_estimated_minutes'),
    sa.ForeignKeyConstraint(['unit_id'], ['units.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('unit_id', 'order_index', name='uq_unit_topic_order')
    )
    op.create_index(op.f('ix_topics_unit_id'), 'topics', ['unit_id'], unique=False)
    op.create_table('class_sessions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('course_id', sa.String(length=36), nullable=False),
    sa.Column('session_number', sa.Integer(), nullable=False),
    sa.Column('scheduled_date', sa.DateTime(), nullable=True),
    sa.Column('duration_minutes', sa.Integer(), nullable=False),
    sa.Column('current_topic_id', sa.String(length=36), nullable=True),
    sa.Column('status', sa.String(length=50), nullable=True),
    sa.CheckConstraint("status IN ('scheduled', 'in_progress', 'completed', 'cancelled')", name='check_session_status'),
    sa.CheckConstraint('duration_minutes > 0', name='check_positive_session_duration'),
    sa.CheckConstraint('session_number >= 1', name='check_positive_session_number'),
    sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['current_topic_id'], ['topics.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('course_id', 'session_number', name='uq_course_session_number')
    )
    op.create_index(op.f('ix_class_sessions_course_id'), 'class_sessions', ['course_id'], unique=False)
    op.create_table('concepts',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('topic_id', sa.String(length=36), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('difficulty', sa.Integer(), nullable=True),
    sa.Column('importance', sa.Integer(), nullable=True),
    sa.Column('concept_type', sa.String(length=50), nullable=True),
    sa.Column('order_index', sa.Integer(), nullable=True),
    sa.CheckConstraint("concept_type IN ('conceptual', 'procedural', 'problem_solving', 'practical', 'analytical', 'revision')", name='check_concept_type'),
    sa.CheckConstraint('difficulty >= 1 AND difficulty <= 5', name='check_difficulty_range'),
    sa.CheckConstraint('importance >= 1 AND importance <= 5', name='check_importance_range'),
    sa.ForeignKeyConstraint(['topic_id'], ['topics.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_concepts_topic_id'), 'concepts', ['topic_id'], unique=False)
    op.create_table('concept_outcomes',
    sa.Column('concept_id', sa.String(length=36), nullable=False),
    sa.Column('outcome_id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['outcome_id'], ['course_outcomes.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('concept_id', 'outcome_id')
    )
    op.create_table('lesson_plans',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('topic_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('status', sa.String(length=50), nullable=True),
    sa.Column('mongo_doc_id', sa.String(length=100), nullable=True),
    sa.Column('ai_confidence', sa.Float(), nullable=True),
    sa.Column('teacher_overridden', sa.Boolean(), nullable=True),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('updated_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint("status IN ('draft', 'approved', 'rejected', 'modified', 'completed')", name='check_lesson_plan_status'),
    sa.CheckConstraint('ai_confidence >= 0.0 AND ai_confidence <= 1.0', name='check_ai_confidence_range'),
    sa.ForeignKeyConstraint(['session_id'], ['class_sessions.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['topic_id'], ['topics.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id')
    )
    op.create_index(op.f('ix_lesson_plans_topic_id'), 'lesson_plans', ['topic_id'], unique=False)
    op.create_table('performance',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('concept_id', sa.String(length=36), nullable=False),
    sa.Column('assessment_id', sa.String(length=36), nullable=False),
    sa.Column('average_score', sa.Float(), nullable=False),
    sa.Column('sample_size', sa.Integer(), nullable=True),
    sa.Column('weakness_flag', sa.Boolean(), nullable=True),
    sa.Column('common_errors', sa.Text(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint('average_score >= 0.0 AND average_score <= 100.0', name='check_average_score_range'),
    sa.CheckConstraint('sample_size > 0', name='check_positive_sample_size'),
    sa.ForeignKeyConstraint(['assessment_id'], ['assessments.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('concept_id', 'assessment_id', name='uq_concept_assessment_performance')
    )
    op.create_index(op.f('ix_performance_assessment_id'), 'performance', ['assessment_id'], unique=False)
    op.create_index(op.f('ix_performance_concept_id'), 'performance', ['concept_id'], unique=False)
    op.create_table('prerequisites',
    sa.Column('concept_id', sa.String(length=36), nullable=False),
    sa.Column('prerequisite_id', sa.String(length=36), nullable=False),
    sa.CheckConstraint('concept_id != prerequisite_id', name='check_no_self_prerequisite'),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['prerequisite_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('concept_id', 'prerequisite_id')
    )
    op.create_table('question_concepts',
    sa.Column('question_id', sa.String(length=36), nullable=False),
    sa.Column('concept_id', sa.String(length=36), nullable=False),
    sa.Column('weightage', sa.Float(), nullable=True),
    sa.CheckConstraint('weightage > 0', name='check_positive_weightage'),
    sa.ForeignKeyConstraint(['concept_id'], ['concepts.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['question_id'], ['questions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('question_id', 'concept_id')
    )
    op.create_table('teaching_sessions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('session_id', sa.String(length=36), nullable=False),
    sa.Column('method_id', sa.String(length=36), nullable=True),
    sa.Column('actual_minutes', sa.Integer(), nullable=False),
    sa.Column('teacher_notes', sa.Text(), nullable=True),
    sa.Column('student_engagement_rating', sa.Integer(), nullable=True),
    sa.Column('completion_rate', sa.Float(), nullable=True),
    sa.Column('conducted_at', sa.DateTime(), nullable=True),
    sa.CheckConstraint('actual_minutes > 0', name='check_positive_actual_minutes'),
    sa.CheckConstraint('completion_rate >= 0.0 AND completion_rate <= 1.0', name='check_completion_rate_range'),
    sa.CheckConstraint('student_engagement_rating >= 1 AND student_engagement_rating <= 5', name='check_engagement_rating_range'),
    sa.ForeignKeyConstraint(['method_id'], ['teaching_methods.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['session_id'], ['class_sessions.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('session_id')
    )


def downgrade() -> None:
    # Explicit DDL for the 3NF core schema (generated from app/models/entities.py, then reviewed)
    op.drop_table('teaching_sessions')
    op.drop_table('question_concepts')
    op.drop_table('prerequisites')
    op.drop_index(op.f('ix_performance_concept_id'), table_name='performance')
    op.drop_index(op.f('ix_performance_assessment_id'), table_name='performance')
    op.drop_table('performance')
    op.drop_index(op.f('ix_lesson_plans_topic_id'), table_name='lesson_plans')
    op.drop_table('lesson_plans')
    op.drop_table('concept_outcomes')
    op.drop_index(op.f('ix_concepts_topic_id'), table_name='concepts')
    op.drop_table('concepts')
    op.drop_index(op.f('ix_class_sessions_course_id'), table_name='class_sessions')
    op.drop_table('class_sessions')
    op.drop_index(op.f('ix_topics_unit_id'), table_name='topics')
    op.drop_table('topics')
    op.drop_index(op.f('ix_questions_assessment_id'), table_name='questions')
    op.drop_table('questions')
    op.drop_index(op.f('ix_units_course_id'), table_name='units')
    op.drop_table('units')
    op.drop_table('teacher_constraints')
    op.drop_index(op.f('ix_sections_course_id'), table_name='sections')
    op.drop_table('sections')
    op.drop_index(op.f('ix_course_outcomes_course_id'), table_name='course_outcomes')
    op.drop_table('course_outcomes')
    op.drop_index(op.f('ix_assessments_scheduled_date'), table_name='assessments')
    op.drop_index(op.f('ix_assessments_course_id'), table_name='assessments')
    op.drop_table('assessments')
    op.drop_index(op.f('ix_courses_teacher_id'), table_name='courses')
    op.drop_index(op.f('ix_courses_code'), table_name='courses')
    op.drop_table('courses')
    op.drop_table('teachers')
    op.drop_index(op.f('ix_method_effectiveness_method_id'), table_name='method_effectiveness')
    op.drop_table('method_effectiveness')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('teaching_methods')
