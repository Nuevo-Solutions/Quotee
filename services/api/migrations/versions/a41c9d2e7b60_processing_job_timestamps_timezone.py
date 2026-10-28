"""make processing job timestamps timezone-aware

Revision ID: a41c9d2e7b60
Revises: 2ba754cda176
Create Date: 2026-10-27 20:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a41c9d2e7b60"
down_revision: str | None = "2ba754cda176"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for column in ("started_at", "finished_at"):
        op.alter_column(
            "processing_jobs",
            column,
            existing_type=sa.DateTime(timezone=False),
            type_=sa.DateTime(timezone=True),
            existing_nullable=True,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )


def downgrade() -> None:
    for column in ("started_at", "finished_at"):
        op.alter_column(
            "processing_jobs",
            column,
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(timezone=False),
            existing_nullable=True,
            postgresql_using=f"{column} AT TIME ZONE 'UTC'",
        )