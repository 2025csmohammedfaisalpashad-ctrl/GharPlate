"""Add product field provenance, data conflicts, external lookup cache, and packaged metadata columns

Revision ID: 0003_product_provenance_and_cache
Revises: 0002_condition_food_mappings
Create Date: 2026-10-30 23:50:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_product_provenance_and_cache"
down_revision = "0002_condition_food_mappings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("food_items") as batch_op:
        batch_op.add_column(sa.Column("net_quantity", sa.String(length=80), nullable=True))
        batch_op.add_column(sa.Column("cleaned_ingredients_text", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("allergen_statement", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("raw_ocr_text", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("manufacturer_info", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("external_updated_at", sa.DateTime(), nullable=True))

    op.create_table(
        "product_field_provenance",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("food_id", sa.Integer(), sa.ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_name", sa.String(length=100), nullable=False),
        sa.Column("field_type", sa.String(length=50), nullable=False),
        sa.Column("field_value", sa.Text(), nullable=True),
        sa.Column("source_code", sa.String(length=80), nullable=False),
        sa.Column("source_name", sa.String(length=200), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("source_record_id", sa.String(length=120), nullable=True),
        sa.Column("confidence_status", sa.String(length=50), nullable=False),
        sa.Column("review_status", sa.String(length=50), nullable=False),
        sa.Column("retrieved_at", sa.DateTime(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("food_id", "field_name", "source_code", name="uq_product_field_provenance"),
    )

    op.create_table(
        "product_data_conflicts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("food_id", sa.Integer(), sa.ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("field_name", sa.String(length=100), nullable=False),
        sa.Column("local_value", sa.Text(), nullable=True),
        sa.Column("local_source", sa.String(length=150), nullable=False),
        sa.Column("external_value", sa.Text(), nullable=True),
        sa.Column("external_source", sa.String(length=150), nullable=False),
        sa.Column("external_source_url", sa.String(length=500), nullable=True),
        sa.Column("resolution_status", sa.String(length=50), nullable=False),
        sa.Column("detected_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "external_lookup_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cache_key", sa.String(length=255), nullable=False),
        sa.Column("provider_name", sa.String(length=80), nullable=False),
        sa.Column("lookup_type", sa.String(length=60), nullable=False),
        sa.Column("query_value", sa.String(length=255), nullable=False),
        sa.Column("http_status", sa.Integer(), nullable=False),
        sa.Column("response_status", sa.String(length=60), nullable=False),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("retrieved_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("cache_key", name="uq_external_lookup_cache_key"),
    )


def downgrade() -> None:
    op.drop_table("external_lookup_cache")
    op.drop_table("product_data_conflicts")
    op.drop_table("product_field_provenance")
    with op.batch_alter_table("food_items") as batch_op:
        batch_op.drop_column("external_updated_at")
        batch_op.drop_column("manufacturer_info")
        batch_op.drop_column("raw_ocr_text")
        batch_op.drop_column("allergen_statement")
        batch_op.drop_column("cleaned_ingredients_text")
        batch_op.drop_column("net_quantity")
