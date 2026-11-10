"""Dedicated BloodPressureLog, BloodGlucoseLog, HealthMeasurementTarget tables and AI habit-plan metadata extensions on HabitDefinition

Revision ID: 0006_health_measurements_and_ai_habits
Revises: 0005_gharplate_v3_ecosystem
Create Date: 2026-11-08 12:20:00
"""

from collections.abc import Sequence
from alembic import op
import sqlalchemy as sa


revision: str = "0006_health_measurements_and_ai_habits"
down_revision: str | None = "0005_gharplate_v3_ecosystem"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Extend habit_definitions with AI Habit Builder metadata columns if missing
    if "habit_definitions" in existing_tables:
        habit_cols = {c["name"] for c in inspector.get_columns("habit_definitions")}
        new_habit_cols = [
            ("description", sa.Text(), True, None),
            ("schedule_metadata_json", sa.JSON(), False, "{}"),
            ("tracking_method", sa.String(length=60), False, "manual_check"),
            ("completion_criteria", sa.String(length=200), True, None),
            ("ai_plan_id", sa.String(length=80), True, None),
            ("user_approved_at", sa.DateTime(), True, None),
        ]
        for col_name, col_type, nullable, default_val in new_habit_cols:
            if col_name not in habit_cols:
                op.add_column(
                    "habit_definitions",
                    sa.Column(
                        col_name,
                        col_type,
                        nullable=nullable,
                        server_default=default_val,
                    ),
                )

    from app.models.entities import (
        BloodGlucoseLog,
        BloodPressureLog,
        HealthMeasurementTarget,
    )

    for model_cls in (
        BloodPressureLog,
        BloodGlucoseLog,
        HealthMeasurementTarget,
    ):
        if model_cls.__tablename__ not in existing_tables:
            model_cls.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    for table_name in (
        "health_measurement_targets",
        "blood_glucose_logs",
        "blood_pressure_logs",
    ):
        op.drop_table(table_name)
