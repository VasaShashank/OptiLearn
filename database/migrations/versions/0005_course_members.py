"""co-teaching: course_members (M:N teachers <-> courses with a role)

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-26 12:00:00.000000

  * course_members(course_id, teacher_id, role in {co_teacher, viewer})
  * trg_course_member_not_owner: the owner cannot also be listed as a member
    (a rule across two tables, so a CHECK constraint cannot express it)
  * audited like the other core tables
  * SQL console RLS: a teacher now also sees courses shared with them. Both the
    courses and course_members policies call fn_console_course_ids(), a SECURITY
    DEFINER function; policies that read each other's tables directly would make
    PostgreSQL fail with "infinite recursion detected in policy".
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0005'
down_revision: Union[str, None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

IS_ADMIN = "current_setting('app.is_admin', true) = 'true'"
TEACHER = "current_setting('app.teacher_id', true)"


def upgrade() -> None:
    op.create_table(
        'course_members',
        sa.Column('course_id', sa.String(length=36), nullable=False),
        sa.Column('teacher_id', sa.String(length=36), nullable=False),
        sa.Column('role', sa.String(length=20), nullable=False),
        sa.Column('added_at', sa.DateTime(), nullable=False),
        sa.CheckConstraint("role IN ('co_teacher', 'viewer')", name='check_course_member_role'),
        sa.ForeignKeyConstraint(['course_id'], ['courses.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['teacher_id'], ['teachers.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('course_id', 'teacher_id'),
    )
    op.create_index('ix_course_members_teacher', 'course_members', ['teacher_id'])

    if op.get_bind().dialect.name != "postgresql":
        return

    op.execute("""
        CREATE OR REPLACE FUNCTION fn_course_member_not_owner() RETURNS trigger
        LANGUAGE plpgsql
        SET search_path = public, pg_temp
        AS $$
        BEGIN
            IF EXISTS (SELECT 1 FROM courses WHERE id = NEW.course_id AND teacher_id = NEW.teacher_id) THEN
                RAISE EXCEPTION 'The course owner cannot also be added as a member'
                    USING ERRCODE = 'check_violation';
            END IF;
            RETURN NEW;
        END $$;

        CREATE TRIGGER trg_course_member_not_owner
            BEFORE INSERT OR UPDATE ON course_members
            FOR EACH ROW EXECUTE FUNCTION fn_course_member_not_owner();

        CREATE TRIGGER trg_course_members_audit
            AFTER INSERT OR UPDATE OR DELETE ON course_members
            FOR EACH ROW EXECUTE FUNCTION fn_audit_row_change();

        -- Course IDs the console user may see: owned or shared. SECURITY DEFINER runs as the
        -- owner, so it reads both tables without re-entering their RLS policies.
        CREATE OR REPLACE FUNCTION fn_console_course_ids() RETURNS SETOF varchar
        LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$
            SELECT id FROM courses WHERE teacher_id = current_setting('app.teacher_id', true)
            UNION
            SELECT course_id FROM course_members WHERE teacher_id = current_setting('app.teacher_id', true)
        $$;
        REVOKE EXECUTE ON FUNCTION fn_console_course_ids() FROM PUBLIC;
        GRANT EXECUTE ON FUNCTION fn_console_course_ids() TO optiteach_readonly;
        GRANT SELECT ON course_members TO optiteach_readonly;
    """)
    op.execute("DROP POLICY IF EXISTS console_read ON courses")
    op.execute(f"CREATE POLICY console_read ON courses FOR SELECT TO optiteach_readonly "
               f"USING ({IS_ADMIN} OR id IN (SELECT fn_console_course_ids()))")
    op.execute("ALTER TABLE course_members ENABLE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY console_read ON course_members FOR SELECT TO optiteach_readonly "
               f"USING ({IS_ADMIN} OR course_id IN (SELECT fn_console_course_ids()))")


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP POLICY IF EXISTS console_read ON courses")
        op.execute(f"CREATE POLICY console_read ON courses FOR SELECT TO optiteach_readonly "
                   f"USING ({IS_ADMIN} OR teacher_id = {TEACHER})")
        op.execute("""
            DROP POLICY IF EXISTS console_read ON course_members;
            DROP TRIGGER IF EXISTS trg_course_members_audit ON course_members;
            DROP TRIGGER IF EXISTS trg_course_member_not_owner ON course_members;
            DROP FUNCTION IF EXISTS fn_course_member_not_owner();
            DROP FUNCTION IF EXISTS fn_console_course_ids();
        """)
    op.drop_index('ix_course_members_teacher', table_name='course_members')
    op.drop_table('course_members')
