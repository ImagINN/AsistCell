"""add agent rating tracking columns

Revision ID: d3f9a6b21e77
Revises: c8e2c43e1a4d
Create Date: 2026-07-23 09:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd3f9a6b21e77'
down_revision = 'c8e2c43e1a4d'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('agents', sa.Column('average_rating', sa.Float(), nullable=False, server_default='0.0'))
    op.add_column('agents', sa.Column('rating_count', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('agents', 'rating_count')
    op.drop_column('agents', 'average_rating')
