"""initial_schema

Revision ID: 0001_initial_schema
Revises: 
Create Date: 2026-09-23 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '0001_initial_schema'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # Entities and schema tables are managed by SQLAlchemy Base metadata
    from app.database.connection import db_engine, Base
    from app.models import entities  # noqa: F401
    Base.metadata.create_all(bind=op.get_bind())

def downgrade() -> None:
    from app.database.connection import db_engine, Base
    from app.models import entities  # noqa: F401
    Base.metadata.drop_all(bind=op.get_bind())
