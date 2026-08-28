"""add profile handoff_nonce

Revision ID: a3f7c2d1e905
Revises: bc1f9e04e748
Create Date: 2026-08-28 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a3f7c2d1e905'
down_revision: Union[str, None] = 'bc1f9e04e748'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('profiles', sa.Column('handoff_nonce', sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column('profiles', 'handoff_nonce')
