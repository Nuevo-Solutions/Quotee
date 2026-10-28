"""add llm job mapping state

Revision ID: 9c2e6df07b13
Revises: a41c9d2e7b60
Create Date: 2026-10-27 21:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "9c2e6df07b13"
down_revision: str | None = "a41c9d2e7b60"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("processing_jobs", sa.Column("mapping_headers", sa.JSON(), nullable=True))
    op.add_column("processing_jobs", sa.Column("mapping_suggestion", sa.JSON(), nullable=True))
    op.add_column("processing_jobs", sa.Column("column_mapping", sa.JSON(), nullable=True))
    op.add_column(
        "processing_jobs",
        sa.Column("llm_input_tokens", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "processing_jobs",
        sa.Column("llm_output_tokens", sa.Integer(), server_default="0", nullable=False),
    )
    op.alter_column("processing_jobs", "llm_input_tokens", server_default=None)
    op.alter_column("processing_jobs", "llm_output_tokens", server_default=None)


def downgrade() -> None:
    op.drop_column("processing_jobs", "llm_output_tokens")
    op.drop_column("processing_jobs", "llm_input_tokens")
    op.drop_column("processing_jobs", "column_mapping")
    op.drop_column("processing_jobs", "mapping_suggestion")
    op.drop_column("processing_jobs", "mapping_headers")