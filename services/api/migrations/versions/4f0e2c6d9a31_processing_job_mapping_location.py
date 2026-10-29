"""add processing job mapping location

Revision ID: 4f0e2c6d9a31
Revises: 9c2e6df07b13
Create Date: 2026-10-28 15:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "4f0e2c6d9a31"
down_revision: str | None = "9c2e6df07b13"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("processing_jobs", sa.Column("mapping_sheet_name", sa.String(length=255)))
    op.add_column("processing_jobs", sa.Column("mapping_header_row", sa.Integer()))


def downgrade() -> None:
    op.drop_column("processing_jobs", "mapping_header_row")
    op.drop_column("processing_jobs", "mapping_sheet_name")