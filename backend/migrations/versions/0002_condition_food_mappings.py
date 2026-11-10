"""Add structured food_tags, food_item_tags, and condition_food_mappings tables

Revision ID: 0002_condition_food_mappings
Revises: 0001_initial_schema
Create Date: 2026-10-30 21:55:00.000000
"""
from collections.abc import Sequence
from alembic import op
from app.db.session import Base
import app.models  # noqa: F401

revision: str = "0002_condition_food_mappings"
down_revision: str | None = "0001_initial_schema"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    op.drop_table("condition_food_mappings")
    op.drop_table("food_item_tags")
    op.drop_table("food_tags")
