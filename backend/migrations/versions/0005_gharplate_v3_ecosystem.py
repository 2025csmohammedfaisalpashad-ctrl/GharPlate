"""GharPlate 3.0 ecosystem tables: fitness profiles, training schedules, daily food diary, hydration, goals, habits, measurements, pantry, shopping lists, protein prices, and mess menus

Revision ID: 0005_gharplate_v3_ecosystem
Revises: 0004_real_auth_and_assistant_persistence
Create Date: 2026-11-07 20:00:00
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0005_gharplate_v3_ecosystem"
down_revision: Union[str, None] = "0004_real_auth_and_assistant_persistence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # Add primary_goal to household_members if missing
    member_cols = {c["name"] for c in inspector.get_columns("household_members")}
    if "primary_goal" not in member_cols:
        op.add_column(
            "household_members",
            sa.Column(
                "primary_goal",
                sa.String(length=80),
                nullable=False,
                server_default="maintain_balanced_diet",
            ),
        )

    # Add GharPlate 3.0 metadata columns to recipes if missing
    recipe_cols = {c["name"] for c in inspector.get_columns("recipes")}
    new_recipe_cols = [
        ("image_url", sa.String(length=500), True, None),
        ("prep_time_minutes", sa.Integer(), True, None),
        ("cook_time_minutes", sa.Integer(), True, None),
        ("estimated_cost_inr", sa.Float(), True, None),
        ("source_type", sa.String(length=50), False, "gharplate_verified"),
        (
            "source_name",
            sa.String(length=200),
            False,
            "GharPlate IFCT 2017 / ICMR-NIN DGI 2024 Kitchen",
        ),
        ("source_url", sa.String(length=500), True, None),
        ("dietary_tags", sa.JSON(), False, "[]"),
        ("suitable_goals", sa.JSON(), False, "[]"),
    ]
    for col_name, col_type, nullable, default_val in new_recipe_cols:
        if col_name not in recipe_cols:
            op.add_column(
                "recipes",
                sa.Column(
                    col_name,
                    col_type,
                    nullable=nullable,
                    server_default=default_val,
                ),
            )

    # All new tables are also ensured by Base.metadata.create_all and init_db.py
    from app.models.entities import (
        BodyMeasurementLog,
        DailyFoodLogEntry,
        FitnessGoal,
        HabitCompletionLog,
        HabitDefinition,
        HydrationSetting,
        LocalFoodPrice,
        MemberFitnessProfile,
        MessMenuRecord,
        PantryItem,
        SavedMealTemplate,
        ShoppingList,
        ShoppingListItem,
        TrainingScheduleEntry,
        WaterIntakeLog,
    )

    for model_cls in (
        MemberFitnessProfile,
        TrainingScheduleEntry,
        FitnessGoal,
        HabitDefinition,
        HabitCompletionLog,
        BodyMeasurementLog,
        DailyFoodLogEntry,
        SavedMealTemplate,
        WaterIntakeLog,
        HydrationSetting,
        PantryItem,
        ShoppingList,
        ShoppingListItem,
        LocalFoodPrice,
        MessMenuRecord,
    ):
        if model_cls.__tablename__ not in existing_tables:
            model_cls.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    for table_name in (
        "mess_menu_records",
        "local_food_prices",
        "shopping_list_items",
        "shopping_lists",
        "pantry_items",
        "hydration_settings",
        "water_intake_logs",
        "saved_meal_templates",
        "daily_food_log_entries",
        "body_measurement_logs",
        "habit_completion_logs",
        "habit_definitions",
        "fitness_goals",
        "training_schedule_entries",
        "member_fitness_profiles",
    ):
        op.drop_table(table_name)
