"""optimistic locking on lesson plans, transaction lab table

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-25 18:00:00.000000

  * lesson_plans.version: row version for optimistic concurrency control. SQLAlchemy
    issues UPDATE ... WHERE id = ? AND version = ?, so a stale write matches no row.
  * txn_lab_accounts: scratch data for the Transaction Lab demos. The optiteach_app role
    receives DML on it through the default privileges set in migration 0003.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0004'
down_revision: Union[str, None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('lesson_plans') as batch:
        batch.add_column(sa.Column('version', sa.Integer(), server_default=sa.text('1'), nullable=False))
        batch.create_check_constraint('check_lesson_plan_version_positive', 'version >= 1')

    op.create_table(
        'txn_lab_accounts',
        sa.Column('id', sa.String(length=20), nullable=False),
        sa.Column('label', sa.String(length=50), nullable=False),
        sa.Column('balance', sa.Integer(), nullable=False),
        sa.CheckConstraint('balance >= 0', name='check_non_negative_balance'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('txn_lab_accounts')
    with op.batch_alter_table('lesson_plans') as batch:
        batch.drop_constraint('check_lesson_plan_version_positive', type_='check')
        batch.drop_column('version')
