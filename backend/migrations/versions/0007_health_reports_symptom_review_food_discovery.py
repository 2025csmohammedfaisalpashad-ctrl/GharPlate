"""Add HealthReport, HealthReportMeasurement, SymptomReviewSession, FoodDiscoveryPreference, and RestaurantSearchSession tables

Revision ID: 0007_health_reports_symptom_review_food_discovery
Revises: 0006_health_measurements_and_ai_habits
Create Date: 2026-11-11 10:00:00
"""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa


revision: str = "0007_health_reports_symptom_review_food_discovery"
down_revision: str | None = "0006_health_measurements_and_ai_habits"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    from app.models.entities import (
        FoodDiscoveryPreference,
        HealthReport,
        HealthReportMeasurement,
        RestaurantSearchSession,
        SymptomReviewSession,
    )

    for model_cls in (
        HealthReport,
        HealthReportMeasurement,
        SymptomReviewSession,
        FoodDiscoveryPreference,
        RestaurantSearchSession,
    ):
        if model_cls.__tablename__ not in existing_tables:
            model_cls.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    for table_name in (
        "restaurant_search_sessions",
        "food_discovery_preferences",
        "symptom_review_sessions",
        "health_report_measurements",
        "health_reports",
    ):
        op.drop_table(table_name)
