"""add category correction columns

Revision ID: c8e2c43e1a4d
Revises: b7d1b32d0f3c
Create Date: 2026-07-23 01:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c8e2c43e1a4d'
down_revision = 'b7d1b32d0f3c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('analysis_logs', sa.Column('corrected_category', sa.String(), nullable=True))
    op.add_column('analysis_logs', sa.Column('corrected_by_role', sa.String(), nullable=True))
    op.add_column('analysis_logs', sa.Column('corrected_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('analysis_logs', 'corrected_at')
    op.drop_column('analysis_logs', 'corrected_by_role')
    op.drop_column('analysis_logs', 'corrected_category')
