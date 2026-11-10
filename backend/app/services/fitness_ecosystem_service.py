"""
GharPlate 3.0 Complete Fitness Intelligence, Daily Nutrition Tracker, Water & Hydration Tracker,
Personal Goal & Habit Tracker, Visual Analytics, Online Recipe Discovery, Smart Pantry & Grocery
Ecosystem, Protein Intelligence, Smart Mess Analyzer, Family Meal Personalisation, and Supplement Intelligence Service.
"""

from datetime import datetime, timedelta, UTC
import re
from typing import Any
from urllib.parse import quote_plus
import httpx
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.entities import (
    BodyMeasurementLog,
    ConditionConflictRule,
    DailyFoodLogEntry,
    FoodItem,
    HabitDefinition,
    Household,
    HouseholdMember,
    HydrationSetting,
    LocalFoodPrice,
    MemberFitnessProfile,
    MessMenuRecord,
    PantryItem,
    Recipe,
    RecipeIngredient,
    SavedMealTemplate,
    ShoppingList,
    ShoppingListItem,
    TrainingScheduleEntry,
    WaterIntakeLog,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import GuidanceEvaluationRequest, RecipeCreateRequest, RecipeIngredientInput
from app.services.food_service import search_foods
from app.services.recipe_service import create_or_update_recipe, serialize_recipe_detail

PRIMARY_GOALS_CATALOG = [
    {"code": "manage_health_condition", "label": "Manage a health condition", "category": "health"},
    {"code": "build_muscle", "label": "Build muscle", "category": "fitness"},
    {"code": "gain_weight", "label": "Gain weight", "category": "fitness"},
    {"code": "lose_body_fat", "label": "Lose body fat", "category": "fitness"},
    {"code": "improve_strength", "label": "Improve strength", "category": "fitness"},
    {"code": "improve_endurance", "label": "Improve endurance", "category": "fitness"},
    {"code": "improve_general_fitness", "label": "Improve general fitness", "category": "fitness"},
    {"code": "maintain_current_fitness", "label": "Maintain current fitness", "category": "fitness"},
    {"code": "improve_everyday_nutrition", "label": "Improve everyday nutrition", "category": "nutrition"},
    {"code": "improve_hydration_habits", "label": "Improve hydration habits", "category": "hydration"},
    {"code": "maintain_balanced_diet", "label": "Maintain a balanced diet", "category": "nutrition"},
]

MEAL_CATEGORIES = [
    {"code": "early_morning", "label": "Early Morning"},
    {"code": "breakfast", "label": "Breakfast"},
    {"code": "mid_morning_snack", "label": "Mid-Morning Snack"},
    {"code": "lunch", "label": "Lunch"},
    {"code": "evening_snack", "label": "Evening Snack"},
    {"code": "pre_workout", "label": "Pre-Workout"},
    {"code": "post_workout", "label": "Post-Workout"},
    {"code": "dinner", "label": "Dinner"},
    {"code": "other", "label": "Other"},
]

DAYS_OF_WEEK = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
]

# Fluid-sensitive medical conditions where universal hydration targets must defer to clinical advice
FLUID_SENSITIVE_CONDITIONS = {
    "chronic_kidney_disease",
    "heart_failure_fluid_balance",
    "liver_cirrhosis_ascites",
    "hypertension",
}

# Transparent reference local prices (INR per 100g) for common Indian protein foods when user has not yet entered a custom local price
REFERENCE_INDIAN_PROTEIN_PRICES_INR_PER_100G: dict[str, tuple[float, str]] = {
    "soya-chunks-textured-veg-protein": (16.0, "₹16 / 100g dry pack (Market Reference)"),
    "egg-poultry-whole-boiled": (14.0, "₹14 / 100g (~2 boiled eggs, Market Reference)"),
    "toor-dal-red-gram": (16.5, "₹16.5 / 100g (₹165/kg Market Reference)"),
    "green-gram-whole-moong": (15.0, "₹15 / 100g (₹150/kg Market Reference)"),
    "chickpea-kabuli-chana": (14.5, "₹14.5 / 100g (₹145/kg Market Reference)"),
    "lentil-masoor-dal": (13.0, "₹13 / 100g (₹130/kg Market Reference)"),
    "groundnut-peanut-raw": (18.0, "₹18 / 100g (₹180/kg Market Reference)"),
    "curd-dahi-cow-milk": (9.0, "₹9 / 100g (₹45 / 500g pack Market Reference)"),
    "milk-cow-whole": (6.0, "₹6 / 100ml (₹60 / litre Market Reference)"),
    "paneer-cottage-cheese-cow": (45.0, "₹45 / 100g (₹90 / 200g pack Market Reference)"),
    "chicken-breast-skinless-cooked": (38.0, "₹38 / 100g (Market Reference)"),
    "rohu-fish-river-cooked": (35.0, "₹35 / 100g (Market Reference)"),
    "almonds-badam": (85.0, "₹85 / 100g (Market Reference)"),
    "ragi-finger-millet": (6.5, "₹6.5 / 100g (₹65/kg Market Reference)"),
}


def today_iso_str() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def _compute_moderate_default_targets(
    member: HouseholdMember, profile: MemberFitnessProfile | None
) -> dict[str, Any]:
    """
    Computes gentle, non-extreme educational nutrition reference targets based on ICMR-NIN DGI 2024
    and the member's configured profile, while always allowing manual overrides and never overriding medical care.
    """
    goal = (
        (profile.fitness_goal if profile and profile.fitness_goal else None)
        or member.primary_goal
        or "maintain_balanced_diet"
    )
    weight_kg = profile.current_weight_kg if profile and profile.current_weight_kg else 65.0

    # Moderate, safe reference ranges (never extreme deficits or excessive protein)
    has_ckd = "chronic_kidney_disease" in (member.selected_conditions or [])
    if has_ckd:
        protein_per_kg = 0.8
    elif goal in ("build_muscle", "improve_strength", "gain_weight"):
        protein_per_kg = 1.4
    elif goal in ("improve_endurance", "improve_general_fitness", "lose_body_fat"):
        protein_per_kg = 1.2
    else:
        protein_per_kg = 1.0

    default_kcal = 2000.0
    if goal in ("build_muscle", "gain_weight"):
        default_kcal = 2250.0
    elif goal == "lose_body_fat":
        default_kcal = 1850.0

    cal = (
        profile.target_calories_kcal
        if profile and profile.target_calories_kcal is not None
        else default_kcal
    )
    prot = (
        profile.target_protein_g
        if profile and profile.target_protein_g is not None
        else round(weight_kg * protein_per_kg, 1)
    )
    carbs = (
        profile.target_carbs_g
        if profile and profile.target_carbs_g is not None
        else round((cal * 0.52) / 4.0, 1)
    )
    fat = (
        profile.target_fat_g
        if profile and profile.target_fat_g is not None
        else round((cal * 0.26) / 9.0, 1)
    )
    fiber = (
        profile.target_fiber_g
        if profile and profile.target_fiber_g is not None
        else 30.0
    )

    caution_notes: list[str] = []
    if has_ckd and goal in ("build_muscle", "improve_strength"):
        caution_notes.append(
            "Competing consideration detected: Chronic Kidney Disease (CKD) requires individualised protein & potassium limits from a nephrologist/renal dietitian. High-protein muscle-gain targets are not automatically applied."
        )
    if "type_2_diabetes" in (member.selected_conditions or []) and goal in (
        "gain_weight",
        "improve_endurance",
    ):
        caution_notes.append(
            "Condition-Fitness Note: Because Type 2 Diabetes is selected alongside an energy/endurance goal, prioritise complex, high-fibre carbohydrates (millets, pulses, intact grains) over refined sugars."
        )

    return {
        "calories_kcal": cal,
        "protein_g": prot,
        "carbs_g": carbs,
        "fat_g": fat,
        "fiber_g": fiber,
        "goal_code": goal,
        "assumptions_disclosure": (
            "Educational reference targets derived from ICMR-NIN 2024 moderate dietary reference values "
            f"(weight reference: {weight_kg} kg). All targets are user-editable and never replace clinical dietitian advice."
        ),
        "condition_fitness_cautions": caution_notes,
    }


def get_or_create_fitness_profile(
    db: Session, member: HouseholdMember
) -> dict[str, Any]:
    profile = (
        db.query(MemberFitnessProfile)
        .filter(MemberFitnessProfile.member_id == member.id)
        .first()
    )
    if not profile:
        profile = MemberFitnessProfile(
            member_id=member.id,
            fitness_goal=member.primary_goal or "maintain_balanced_diet",
            training_frequency_days_per_week=3,
            training_type="mixed_fitness",
            typical_workout_duration_min=45,
            preferred_training_time="morning",
            daily_activity_level="moderately_active",
            goal_start_date=today_iso_str(),
        )
        db.add(profile)
        db.flush()

    schedule = (
        db.query(TrainingScheduleEntry)
        .filter(TrainingScheduleEntry.member_id == member.id)
        .all()
    )
    if not schedule:
        default_days = {
            "monday": (True, "Strength & Mobility", "07:00", 45),
            "tuesday": (False, "Rest & Active Walk", None, 20),
            "wednesday": (True, "Upper Body / Core", "07:00", 45),
            "thursday": (False, "Rest & Recovery", None, None),
            "friday": (True, "Lower Body & Conditioning", "07:00", 45),
            "saturday": (True, "Yoga / Outdoor Sport", "08:00", 40),
            "sunday": (False, "Full Rest Day", None, None),
        }
        schedule = []
        for day_name in DAYS_OF_WEEK:
            is_tr, w_type, w_time, w_dur = default_days[day_name]
            entry = TrainingScheduleEntry(
                member_id=member.id,
                day_of_week=day_name,
                is_training_day=is_tr,
                workout_type=w_type,
                workout_time=w_time,
                duration_minutes=w_dur,
            )
            db.add(entry)
            schedule.append(entry)
        db.commit()
        db.refresh(profile)

    day_order = {d: i for i, d in enumerate(DAYS_OF_WEEK)}
    ordered_schedule = sorted(schedule, key=lambda s: day_order.get(s.day_of_week, 99))
    targets = _compute_moderate_default_targets(member, profile)

    return {
        "member_id": member.id,
        "member_name": member.display_name,
        "age_group": member.age_group,
        "dietary_preference": member.dietary_preference,
        "primary_goal": member.primary_goal or profile.fitness_goal,
        "selected_conditions": member.selected_conditions,
        "allergies": member.allergies,
        "intolerances": member.intolerances,
        "age_years": profile.age_years,
        "height_cm": profile.height_cm,
        "current_weight_kg": profile.current_weight_kg,
        "target_weight_kg": profile.target_weight_kg,
        "fitness_goal": profile.fitness_goal,
        "training_frequency_days_per_week": profile.training_frequency_days_per_week,
        "training_type": profile.training_type,
        "typical_workout_duration_min": profile.typical_workout_duration_min,
        "preferred_training_time": profile.preferred_training_time,
        "daily_activity_level": profile.daily_activity_level,
        "daily_food_budget_inr": profile.daily_food_budget_inr,
        "optional_measurements": profile.optional_measurements or {},
        "goal_start_date": profile.goal_start_date,
        "timezone_str": profile.timezone_str,
        "computed_targets": targets,
        "training_schedule": [
            {
                "id": s.id,
                "day_of_week": s.day_of_week,
                "is_training_day": s.is_training_day,
                "workout_type": s.workout_type,
                "workout_time": s.workout_time,
                "duration_minutes": s.duration_minutes,
                "notes": s.notes,
            }
            for s in ordered_schedule
        ],
        "available_primary_goals": PRIMARY_GOALS_CATALOG,
    }


def update_member_fitness_profile(
    db: Session, member: HouseholdMember, payload: dict[str, Any]
) -> dict[str, Any]:
    get_or_create_fitness_profile(db, member)
    profile = (
        db.query(MemberFitnessProfile)
        .filter(MemberFitnessProfile.member_id == member.id)
        .first()
    )
    assert profile is not None

    if "primary_goal" in payload and payload["primary_goal"]:
        member.primary_goal = str(payload["primary_goal"])
        profile.fitness_goal = str(payload["primary_goal"])
    if "fitness_goal" in payload and payload["fitness_goal"]:
        profile.fitness_goal = str(payload["fitness_goal"])
        member.primary_goal = str(payload["fitness_goal"])

    for attr in (
        "age_years",
        "height_cm",
        "current_weight_kg",
        "target_weight_kg",
        "training_frequency_days_per_week",
        "training_type",
        "typical_workout_duration_min",
        "preferred_training_time",
        "daily_activity_level",
        "daily_food_budget_inr",
        "optional_measurements",
        "target_calories_kcal",
        "target_protein_g",
        "target_carbs_g",
        "target_fat_g",
        "target_fiber_g",
        "goal_start_date",
        "timezone_str",
    ):
        if attr in payload:
            setattr(profile, attr, payload[attr])

    if "training_schedule" in payload and isinstance(payload["training_schedule"], list):
        for item in payload["training_schedule"]:
            day = str(item.get("day_of_week") or "").lower().strip()
            if day not in DAYS_OF_WEEK:
                continue
            existing = (
                db.query(TrainingScheduleEntry)
                .filter(
                    TrainingScheduleEntry.member_id == member.id,
                    TrainingScheduleEntry.day_of_week == day,
                )
                .first()
            )
            if existing:
                existing.is_training_day = bool(item.get("is_training_day", False))
                existing.workout_type = str(item.get("workout_type") or "Rest & Recovery")
                existing.workout_time = item.get("workout_time")
                existing.duration_minutes = item.get("duration_minutes")
                existing.notes = item.get("notes")

    db.commit()
    return get_or_create_fitness_profile(db, member)


def create_daily_food_log_entry(
    db: Session,
    household: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> DailyFoodLogEntry:
    """
    Logs a food item, recipe, or manual entry into the member's persistent Daily Food Diary.
    Captures an immutable nutrient snapshot at the time of recording and preserves NULL for missing nutrients.
    """
    logged_date = str(payload.get("logged_date") or today_iso_str())
    meal_category = str(payload.get("meal_category") or "breakfast")
    logged_time = payload.get("logged_time")
    quantity = float(payload.get("quantity") or 1.0)
    unit_name = str(payload.get("unit_name") or "standard_serving")
    entry_source_type = str(payload.get("entry_source_type") or "food_database")
    notes = payload.get("notes")

    food_slug = payload.get("food_slug")
    recipe_id = payload.get("recipe_id")

    if food_slug:
        food = (
            db.query(FoodItem)
            .options(
                joinedload(FoodItem.source),
                joinedload(FoodItem.servings),
                joinedload(FoodItem.nutrient_values),
            )
            .filter(FoodItem.slug == str(food_slug))
            .first()
        )
        if not food:
            raise ValueError(f"Food '{food_slug}' not found in database.")

        srv_obj = next(
            (s for s in food.servings if s.unit_name == unit_name),
            None,
        )
        if srv_obj:
            grams = srv_obj.grams_equivalent * quantity
        elif unit_name in ("100g", "100ml"):
            grams = 100.0 * quantity
        else:
            grams = food.standard_serving_grams * quantity

        scale = grams / 100.0
        nut_map: dict[str, float | None] = {}
        missing_codes: list[str] = []
        available_count = 0
        for nv in food.nutrient_values:
            if nv.value is None:
                nut_map[nv.nutrient_code] = None
                missing_codes.append(nv.nutrient_code)
            else:
                nut_map[nv.nutrient_code] = round(nv.value * scale, 2)
                available_count += 1

        total_nut_defs = len(food.nutrient_values) or 20
        comp_pct = round((available_count / total_nut_defs) * 100.0, 1)

        entry = DailyFoodLogEntry(
            household_id=household.id,
            member_id=member.id,
            logged_date=logged_date,
            meal_category=meal_category,
            logged_time=logged_time,
            food_id=food.id,
            food_slug=food.slug,
            food_name=food.name_en,
            entry_source_type=entry_source_type,
            quantity=quantity,
            unit_name=unit_name,
            grams_equivalent=round(grams, 1),
            energy_kcal=nut_map.get("energy_kcal"),
            protein_g=nut_map.get("protein_g"),
            carbs_g=nut_map.get("carbs_g"),
            sugars_total_g=nut_map.get("sugars_total_g"),
            sugars_added_g=nut_map.get("sugars_added_g"),
            fat_total_g=nut_map.get("fat_total_g"),
            fat_saturated_g=nut_map.get("fat_saturated_g"),
            fibre_g=nut_map.get("fibre_g"),
            sodium_mg=nut_map.get("sodium_mg"),
            calcium_mg=nut_map.get("calcium_mg"),
            iron_mg=nut_map.get("iron_mg"),
            potassium_mg=nut_map.get("potassium_mg"),
            nutrient_snapshot_json=nut_map,
            missing_nutrient_codes=missing_codes,
            completeness_pct=comp_pct,
            source_citation=f"{food.source.name} ({food.source.publication_year})",
            notes=notes,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    if recipe_id is not None:
        rec = (
            db.query(Recipe)
            .options(joinedload(Recipe.ingredients).joinedload(RecipeIngredient.food))
            .filter(Recipe.id == int(recipe_id))
            .first()
        )
        if not rec:
            raise ValueError(f"Recipe ID {recipe_id} not found.")
        rec_detail = serialize_recipe_detail(db, rec)
        nut_map = {
            n.nutrient_code: (
                round(n.per_serving_known_value * quantity, 2)
                if n.per_serving_known_value is not None
                else None
            )
            for n in rec_detail.nutrients
        }
        missing_codes = [
            n.nutrient_code
            for n in rec_detail.nutrients
            if n.per_serving_known_value is None or not n.is_complete
        ]
        grams = round(rec_detail.serving_weight_grams * quantity, 1)
        entry = DailyFoodLogEntry(
            household_id=household.id,
            member_id=member.id,
            logged_date=logged_date,
            meal_category=meal_category,
            logged_time=logged_time,
            recipe_id=rec.id,
            food_name=rec.title,
            entry_source_type="recipe_calculator",
            quantity=quantity,
            unit_name="serving",
            grams_equivalent=grams,
            energy_kcal=nut_map.get("energy_kcal"),
            protein_g=nut_map.get("protein_g"),
            carbs_g=nut_map.get("carbs_g"),
            sugars_total_g=nut_map.get("sugars_total_g"),
            sugars_added_g=nut_map.get("sugars_added_g"),
            fat_total_g=nut_map.get("fat_total_g"),
            fat_saturated_g=nut_map.get("fat_saturated_g"),
            fibre_g=nut_map.get("fibre_g"),
            sodium_mg=nut_map.get("sodium_mg"),
            calcium_mg=nut_map.get("calcium_mg"),
            iron_mg=nut_map.get("iron_mg"),
            potassium_mg=nut_map.get("potassium_mg"),
            nutrient_snapshot_json=nut_map,
            missing_nutrient_codes=missing_codes,
            completeness_pct=rec_detail.completeness_pct,
            source_citation=rec.source_name or "GharPlate Recipe Calculator",
            notes=notes,
        )
        db.add(entry)
        db.commit()
        db.refresh(entry)
        return entry

    # Manual food entry — never invents nutrients that the user did not explicitly supply
    food_name = str(payload.get("food_name") or "").strip()
    if not food_name:
        raise ValueError("Either 'food_slug', 'recipe_id', or 'food_name' is required.")
    grams = float(payload.get("grams_equivalent") or (100.0 * quantity))
    manual_nuts = payload.get("manual_nutrients") or {}

    def _opt_float(k: str) -> float | None:
        v = manual_nuts.get(k, payload.get(k))
        return round(float(v), 2) if v is not None and v != "" else None

    nut_keys = [
        "energy_kcal",
        "protein_g",
        "carbs_g",
        "sugars_total_g",
        "sugars_added_g",
        "fat_total_g",
        "fat_saturated_g",
        "fibre_g",
        "sodium_mg",
        "calcium_mg",
        "iron_mg",
        "potassium_mg",
    ]
    nut_map = {k: _opt_float(k) for k in nut_keys}
    missing_codes = [k for k, v in nut_map.items() if v is None]
    known_count = len([v for v in nut_map.values() if v is not None])
    comp_pct = round((known_count / len(nut_keys)) * 100.0, 1)

    entry = DailyFoodLogEntry(
        household_id=household.id,
        member_id=member.id,
        logged_date=logged_date,
        meal_category=meal_category,
        logged_time=logged_time,
        food_name=food_name,
        entry_source_type="manual_entry",
        quantity=quantity,
        unit_name=unit_name,
        grams_equivalent=round(grams, 1),
        energy_kcal=nut_map["energy_kcal"],
        protein_g=nut_map["protein_g"],
        carbs_g=nut_map["carbs_g"],
        sugars_total_g=nut_map["sugars_total_g"],
        sugars_added_g=nut_map["sugars_added_g"],
        fat_total_g=nut_map["fat_total_g"],
        fat_saturated_g=nut_map["fat_saturated_g"],
        fibre_g=nut_map["fibre_g"],
        sodium_mg=nut_map["sodium_mg"],
        calcium_mg=nut_map["calcium_mg"],
        iron_mg=nut_map["iron_mg"],
        potassium_mg=nut_map["potassium_mg"],
        nutrient_snapshot_json=nut_map,
        missing_nutrient_codes=missing_codes,
        completeness_pct=comp_pct,
        source_citation="User Manual Diary Entry",
        notes=notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def serialize_food_log_entry(e: DailyFoodLogEntry) -> dict[str, Any]:
    return {
        "id": e.id,
        "member_id": e.member_id,
        "logged_date": e.logged_date,
        "meal_category": e.meal_category,
        "logged_time": e.logged_time,
        "food_id": e.food_id,
        "recipe_id": e.recipe_id,
        "food_slug": e.food_slug,
        "food_name": e.food_name,
        "entry_source_type": e.entry_source_type,
        "quantity": e.quantity,
        "unit_name": e.unit_name,
        "grams_equivalent": e.grams_equivalent,
        "energy_kcal": e.energy_kcal,
        "protein_g": e.protein_g,
        "carbs_g": e.carbs_g,
        "sugars_total_g": e.sugars_total_g,
        "sugars_added_g": e.sugars_added_g,
        "fat_total_g": e.fat_total_g,
        "fat_saturated_g": e.fat_saturated_g,
        "fibre_g": e.fibre_g,
        "sodium_mg": e.sodium_mg,
        "calcium_mg": e.calcium_mg,
        "iron_mg": e.iron_mg,
        "potassium_mg": e.potassium_mg,
        "missing_nutrient_codes": e.missing_nutrient_codes or [],
        "completeness_pct": e.completeness_pct,
        "source_citation": e.source_citation,
        "notes": e.notes,
        "created_at": e.created_at.isoformat(),
    }


def _aggregate_entries_nutrients(entries: list[DailyFoodLogEntry]) -> dict[str, Any]:
    """
    Aggregates known nutrient values across food log entries while explicitly tracking how many
    entries have NULL / unmeasured values for each nutrient so NULL is never silently treated as 0.
    """
    tracked_fields = [
        "energy_kcal",
        "protein_g",
        "carbs_g",
        "sugars_total_g",
        "sugars_added_g",
        "fat_total_g",
        "fat_saturated_g",
        "fibre_g",
        "sodium_mg",
        "calcium_mg",
        "iron_mg",
        "potassium_mg",
    ]
    if not entries:
        return {
            "entry_count": 0,
            "totals": {k: 0.0 for k in tracked_fields},
            "missing_counts": {k: 0 for k in tracked_fields},
            "has_incomplete_entries": False,
            "incomplete_entry_names": [],
        }

    totals: dict[str, float | None] = {}
    missing_counts: dict[str, int] = {}
    for field in tracked_fields:
        vals = [getattr(e, field) for e in entries if getattr(e, field) is not None]
        null_cnt = sum(1 for e in entries if getattr(e, field) is None)
        missing_counts[field] = null_cnt
        totals[field] = round(sum(vals), 2) if vals else None

    incomplete_names = [
        e.food_name for e in entries if (e.energy_kcal is None or e.protein_g is None)
    ]
    return {
        "entry_count": len(entries),
        "totals": totals,
        "missing_counts": missing_counts,
        "has_incomplete_entries": len(incomplete_names) > 0,
        "incomplete_entry_names": incomplete_names,
    }


def get_daily_tracker_summary(
    db: Session, household: Household, member: HouseholdMember, date_str: str | None = None
) -> dict[str, Any]:
    target_date = date_str or today_iso_str()
    fitness_info = get_or_create_fitness_profile(db, member)
    targets = fitness_info["computed_targets"]

    entries = (
        db.query(DailyFoodLogEntry)
        .filter(
            DailyFoodLogEntry.member_id == member.id,
            DailyFoodLogEntry.logged_date == target_date,
        )
        .order_by(DailyFoodLogEntry.id.asc())
        .all()
    )

    meals_breakdown: list[dict[str, Any]] = []
    for cat in MEAL_CATEGORIES:
        cat_code = cat["code"]
        cat_entries = [e for e in entries if e.meal_category == cat_code]
        agg = _aggregate_entries_nutrients(cat_entries)
        meals_breakdown.append(
            {
                "meal_category": cat_code,
                "meal_label": cat["label"],
                "entries": [serialize_food_log_entry(e) for e in cat_entries],
                "summary": agg,
            }
        )

    daily_agg = _aggregate_entries_nutrients(entries)
    hydration = get_daily_hydration_summary(db, household, member, target_date)

    # Check if today's weekday is a training day
    try:
        dt_obj = datetime.strptime(target_date, "%Y-%m-%d")
        weekday_name = DAYS_OF_WEEK[dt_obj.weekday()]
    except Exception:
        weekday_name = "monday"

    today_schedule = next(
        (
            s
            for s in fitness_info["training_schedule"]
            if s["day_of_week"] == weekday_name
        ),
        None,
    )

    # Habits status for today
    habits = (
        db.query(HabitDefinition)
        .options(joinedload(HabitDefinition.completions))
        .filter(
            HabitDefinition.member_id == member.id,
            HabitDefinition.is_active.is_(True),
        )
        .all()
    )
    habits_today = []
    for h in habits:
        done_today = any(
            c.logged_date == target_date and c.completed for c in (h.completions or [])
        )
        habits_today.append(
            {
                "id": h.id,
                "title": h.title,
                "category": h.category,
                "frequency": h.frequency,
                "completed_today": done_today,
            }
        )

    templates = (
        db.query(SavedMealTemplate)
        .filter(SavedMealTemplate.household_id == household.id)
        .order_by(SavedMealTemplate.id.desc())
        .all()
    )

    def _remaining(target_val: float | None, consumed_val: float | None) -> float | None:
        if target_val is None:
            return None
        c = consumed_val or 0.0
        return round(max(0.0, target_val - c), 1)

    consumed_totals = daily_agg["totals"]
    return {
        "date": target_date,
        "weekday": weekday_name,
        "today_training": today_schedule,
        "member": {
            "id": member.id,
            "display_name": member.display_name,
            "dietary_preference": member.dietary_preference,
            "primary_goal": fitness_info["primary_goal"],
            "selected_conditions": member.selected_conditions,
        },
        "targets": targets,
        "daily_nutrition": daily_agg,
        "remaining_targets": {
            "calories_kcal": _remaining(
                targets["calories_kcal"], consumed_totals.get("energy_kcal")
            ),
            "protein_g": _remaining(
                targets["protein_g"], consumed_totals.get("protein_g")
            ),
            "carbs_g": _remaining(
                targets["carbs_g"], consumed_totals.get("carbs_g")
            ),
            "fat_g": _remaining(
                targets["fat_g"], consumed_totals.get("fat_total_g")
            ),
            "fiber_g": _remaining(
                targets["fiber_g"], consumed_totals.get("fibre_g")
            ),
        },
        "meals": meals_breakdown,
        "hydration": hydration,
        "habits_today": habits_today,
        "meal_templates": [
            {
                "id": t.id,
                "name": t.name,
                "meal_category": t.meal_category,
                "items_count": len(t.items_json or []),
                "items": t.items_json or [],
            }
            for t in templates
        ],
        "meal_categories_catalog": MEAL_CATEGORIES,
    }


def get_or_create_hydration_setting(
    db: Session, member: HouseholdMember
) -> HydrationSetting:
    setting = (
        db.query(HydrationSetting)
        .filter(HydrationSetting.member_id == member.id)
        .first()
    )
    if not setting:
        setting = HydrationSetting(
            member_id=member.id,
            daily_goal_ml=2250,
            preferred_container="large_glass",
            reminders_enabled=False,
            reminder_interval_minutes=90,
            reminder_start_time="08:00",
            reminder_end_time="21:00",
        )
        db.add(setting)
        db.commit()
        db.refresh(setting)
    return setting


def get_daily_hydration_summary(
    db: Session, household: Household, member: HouseholdMember, date_str: str | None = None
) -> dict[str, Any]:
    target_date = date_str or today_iso_str()
    setting = get_or_create_hydration_setting(db, member)
    logs = (
        db.query(WaterIntakeLog)
        .filter(
            WaterIntakeLog.member_id == member.id,
            WaterIntakeLog.logged_date == target_date,
        )
        .order_by(WaterIntakeLog.id.asc())
        .all()
    )
    total_ml = sum(item.amount_ml for item in logs)
    goal_ml = setting.daily_goal_ml
    remaining_ml = max(0, goal_ml - total_ml)
    pct = round(min(100.0, (total_ml / goal_ml) * 100.0), 1) if goal_ml > 0 else 0.0

    # Check if member has any fluid-sensitive medical conditions
    member_conds = set(member.selected_conditions or [])
    fluid_sensitive_matches = sorted(list(member_conds & FLUID_SENSITIVE_CONDITIONS))
    fluid_medical_notice = None
    if fluid_sensitive_matches:
        fluid_medical_notice = (
            "Individualised Fluid Guidance Notice: Because this profile includes a kidney or cardiovascular condition "
            f"({', '.join(fluid_sensitive_matches)}), general water-intake targets may not be appropriate. "
            "Always follow the specific daily fluid allowance advised by your physician or specialist."
        )

    # 7-day hydration trend
    base_dt = datetime.strptime(target_date, "%Y-%m-%d")
    start_7d = (base_dt - timedelta(days=6)).strftime("%Y-%m-%d")
    recent_logs = (
        db.query(WaterIntakeLog)
        .filter(
            WaterIntakeLog.member_id == member.id,
            WaterIntakeLog.logged_date >= start_7d,
            WaterIntakeLog.logged_date <= target_date,
        )
        .all()
    )
    by_day: dict[str, int] = {}
    for rl in recent_logs:
        by_day[rl.logged_date] = by_day.get(rl.logged_date, 0) + rl.amount_ml

    weekly_history = []
    for offset in range(6, -1, -1):
        d_s = (base_dt - timedelta(days=offset)).strftime("%Y-%m-%d")
        amt = by_day.get(d_s, 0)
        weekly_history.append(
            {
                "date": d_s,
                "total_ml": amt,
                "goal_ml": goal_ml,
                "goal_met": amt >= goal_ml and amt > 0,
                "has_entries": d_s in by_day,
            }
        )

    return {
        "date": target_date,
        "member_id": member.id,
        "member_name": member.display_name,
        "total_ml": total_ml,
        "goal_ml": goal_ml,
        "remaining_ml": remaining_ml,
        "progress_pct": pct,
        "fluid_medical_notice": fluid_medical_notice,
        "individual_hydration_disclaimer": (
            "Fluid needs vary with climate, physical activity, diet, and health status. "
            "Your hydration target is fully configurable."
        ),
        "settings": {
            "daily_goal_ml": setting.daily_goal_ml,
            "preferred_container": setting.preferred_container,
            "reminders_enabled": setting.reminders_enabled,
            "reminder_interval_minutes": setting.reminder_interval_minutes,
            "reminder_start_time": setting.reminder_start_time,
            "reminder_end_time": setting.reminder_end_time,
            "quiet_hours_start": setting.quiet_hours_start,
            "quiet_hours_end": setting.quiet_hours_end,
            "reminder_delivery_mode": "in_app_and_optional_browser_notification",
        },
        "entries": [
            {
                "id": item.id,
                "logged_date": item.logged_date,
                "logged_time": item.logged_time,
                "amount_ml": item.amount_ml,
                "container_type": item.container_type,
                "notes": item.notes,
            }
            for item in logs
        ],
        "weekly_history": weekly_history,
    }


def get_analytics_overview(
    db: Session,
    household: Household,
    member: HouseholdMember,
    end_date_str: str | None = None,
    days: int = 30,
) -> dict[str, Any]:
    """
    Computes Daily, Weekly (7-day), and Monthly (30-day) visual analytics series.
    Strictly distinguishes between:
    - 'recorded': actual food/water entries logged on that date
    - 'no_entry_recorded': no logs entered for that date (never fabricated or plotted as fake 0 intake)
    - 'incomplete_nutrient_data': entries logged, but one or more items had NULL nutrient values
    """
    target_end = end_date_str or today_iso_str()
    end_dt = datetime.strptime(target_end, "%Y-%m-%d")
    start_dt = end_dt - timedelta(days=max(6, days - 1))
    start_str = start_dt.strftime("%Y-%m-%d")

    fitness_info = get_or_create_fitness_profile(db, member)
    targets = fitness_info["computed_targets"]
    schedule_map = {
        s["day_of_week"]: s["is_training_day"]
        for s in fitness_info["training_schedule"]
    }
    hydration_setting = get_or_create_hydration_setting(db, member)

    food_logs = (
        db.query(DailyFoodLogEntry)
        .filter(
            DailyFoodLogEntry.member_id == member.id,
            DailyFoodLogEntry.logged_date >= start_str,
            DailyFoodLogEntry.logged_date <= target_end,
        )
        .order_by(DailyFoodLogEntry.logged_date.asc(), DailyFoodLogEntry.id.asc())
        .all()
    )
    water_logs = (
        db.query(WaterIntakeLog)
        .filter(
            WaterIntakeLog.member_id == member.id,
            WaterIntakeLog.logged_date >= start_str,
            WaterIntakeLog.logged_date <= target_end,
        )
        .order_by(WaterIntakeLog.logged_date.asc(), WaterIntakeLog.id.asc())
        .all()
    )
    measurements = (
        db.query(BodyMeasurementLog)
        .filter(
            BodyMeasurementLog.member_id == member.id,
            BodyMeasurementLog.logged_date >= start_str,
            BodyMeasurementLog.logged_date <= target_end,
        )
        .order_by(BodyMeasurementLog.logged_date.asc(), BodyMeasurementLog.id.asc())
        .all()
    )

    food_by_date: dict[str, list[DailyFoodLogEntry]] = {}
    for fl in food_logs:
        food_by_date.setdefault(fl.logged_date, []).append(fl)

    water_by_date: dict[str, list[WaterIntakeLog]] = {}
    for wl in water_logs:
        water_by_date.setdefault(wl.logged_date, []).append(wl)

    meas_by_date: dict[str, BodyMeasurementLog] = {}
    for ml in measurements:
        meas_by_date[ml.logged_date] = ml

    daily_series: list[dict[str, Any]] = []
    total_days = (end_dt - start_dt).days + 1
    for i in range(total_days):
        cur_dt = start_dt + timedelta(days=i)
        d_str = cur_dt.strftime("%Y-%m-%d")
        w_name = DAYS_OF_WEEK[cur_dt.weekday()]
        is_training = bool(schedule_map.get(w_name, False))

        f_entries = food_by_date.get(d_str, [])
        w_entries = water_by_date.get(d_str, [])
        m_entry = meas_by_date.get(d_str)

        if not f_entries:
            food_status = "no_entry_recorded"
            energy_val = None
            protein_val = None
            carbs_val = None
            fat_val = None
            fiber_val = None
        else:
            agg = _aggregate_entries_nutrients(f_entries)
            food_status = (
                "incomplete_nutrient_data"
                if agg["has_incomplete_entries"]
                else "recorded"
            )
            energy_val = agg["totals"]["energy_kcal"]
            protein_val = agg["totals"]["protein_g"]
            carbs_val = agg["totals"]["carbs_g"]
            fat_val = agg["totals"]["fat_total_g"]
            fiber_val = agg["totals"]["fibre_g"]

        water_status = "recorded" if w_entries else "no_entry_recorded"
        water_ml = sum(w.amount_ml for w in w_entries) if w_entries else None

        daily_series.append(
            {
                "date": d_str,
                "weekday": w_name,
                "is_training_day": is_training,
                "food_data_status": food_status,
                "water_data_status": water_status,
                "food_entries_count": len(f_entries),
                "energy_kcal": energy_val,
                "protein_g": protein_val,
                "carbs_g": carbs_val,
                "fat_g": fat_val,
                "fiber_g": fiber_val,
                "water_ml": water_ml,
                "weight_kg": m_entry.weight_kg if m_entry else None,
                "waist_cm": m_entry.waist_cm if m_entry else None,
                "workout_completed": m_entry.workout_completed if m_entry else False,
            }
        )

    weekly_series = daily_series[-7:]
    logged_food_days_7d = [d for d in weekly_series if d["food_data_status"] != "no_entry_recorded"]
    training_days_logged = [
        d for d in daily_series if d["is_training_day"] and d["energy_kcal"] is not None
    ]
    rest_days_logged = [
        d for d in daily_series if not d["is_training_day"] and d["energy_kcal"] is not None
    ]

    def _avg(items: list[dict[str, Any]], key: str) -> float | None:
        vals = [float(x[key]) for x in items if x.get(key) is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    # Today's meal-by-meal breakdown for Daily chart
    today_tracker = get_daily_tracker_summary(db, household, member, target_end)

    return {
        "member_id": member.id,
        "member_name": member.display_name,
        "start_date": start_str,
        "end_date": target_end,
        "targets": {
            "calories_kcal": targets["calories_kcal"],
            "protein_g": targets["protein_g"],
            "carbs_g": targets["carbs_g"],
            "fat_g": targets["fat_g"],
            "fiber_g": targets["fiber_g"],
            "water_ml": hydration_setting.daily_goal_ml,
        },
        "today_meal_pattern": [
            {
                "meal_category": m["meal_category"],
                "meal_label": m["meal_label"],
                "entry_count": m["summary"]["entry_count"],
                "energy_kcal": m["summary"]["totals"]["energy_kcal"],
                "protein_g": m["summary"]["totals"]["protein_g"],
                "carbs_g": m["summary"]["totals"]["carbs_g"],
                "fat_g": m["summary"]["totals"]["fat_total_g"],
                "fiber_g": m["summary"]["totals"]["fibre_g"],
            }
            for m in today_tracker["meals"]
        ],
        "today_water_timeline": today_tracker["hydration"]["entries"],
        "weekly_series": weekly_series,
        "monthly_series": daily_series,
        "summary_metrics": {
            "logged_days_last_7": len(logged_food_days_7d),
            "logged_days_last_30": len(
                [d for d in daily_series if d["food_data_status"] != "no_entry_recorded"]
            ),
            "weekly_avg_calories_kcal": _avg(weekly_series, "energy_kcal"),
            "weekly_avg_protein_g": _avg(weekly_series, "protein_g"),
            "weekly_avg_fiber_g": _avg(weekly_series, "fiber_g"),
            "weekly_avg_water_ml": _avg(weekly_series, "water_ml"),
            "monthly_avg_calories_kcal": _avg(daily_series, "energy_kcal"),
            "monthly_avg_protein_g": _avg(daily_series, "protein_g"),
            "training_day_avg_calories_kcal": _avg(training_days_logged, "energy_kcal"),
            "training_day_avg_protein_g": _avg(training_days_logged, "protein_g"),
            "rest_day_avg_calories_kcal": _avg(rest_days_logged, "energy_kcal"),
            "rest_day_avg_protein_g": _avg(rest_days_logged, "protein_g"),
        },
        "chart_integrity_notice": (
            "Days without recorded entries are marked as 'no_entry_recorded' and are never fabricated as zero consumption. "
            "Entries containing unmeasured (NULL) nutrients are flagged as 'incomplete_nutrient_data'."
        ),
    }


def build_indian_retailer_links(
    ingredient_name: str, pincode: str | None = None, location_consent: bool = False
) -> list[dict[str, Any]]:
    """
    Generates genuine, safely encoded official search destinations for Indian grocery & quick-commerce
    retailers (Blinkit, Zepto, Swiggy Instamart, BigBasket) + web search fallback.
    Follows Section 10.3 strictly: never claims direct cart insertion or guaranteed stock without authorised partner API.
    """
    cleaned = re.sub(r"\s*\(.*?\)", "", ingredient_name).strip()
    q = quote_plus(cleaned)
    now_iso = datetime.now(UTC).isoformat()
    pin_note = (
        f"Verify stock & live delivery price for PIN {pincode} on retailer site"
        if (pincode and location_consent)
        else "Official search destination — availability & price depend on your delivery PIN code"
    )
    return [
        {
            "retailer_code": "blinkit",
            "retailer_name": "Blinkit",
            "integration_type": "official_search_destination",
            "url": f"https://blinkit.com/s/?q={q}",
            "availability_note": pin_note,
            "retrieved_at": now_iso,
        },
        {
            "retailer_code": "zepto",
            "retailer_name": "Zepto",
            "integration_type": "official_search_destination",
            "url": f"https://www.zeptonow.com/search?query={q}",
            "availability_note": pin_note,
            "retrieved_at": now_iso,
        },
        {
            "retailer_code": "swiggy_instamart",
            "retailer_name": "Swiggy Instamart",
            "integration_type": "official_search_destination",
            "url": f"https://www.swiggy.com/instamart/search?custom_back=true&query={q}",
            "availability_note": pin_note,
            "retrieved_at": now_iso,
        },
        {
            "retailer_code": "bigbasket",
            "retailer_name": "BigBasket",
            "integration_type": "official_search_destination",
            "url": f"https://www.bigbasket.com/ps/?q={q}",
            "availability_note": pin_note,
            "retrieved_at": now_iso,
        },
        {
            "retailer_code": "web_search",
            "retailer_name": "Compare Online (Web Search)",
            "integration_type": "web_search_fallback",
            "url": f"https://www.google.com/search?q={q}+buy+online+grocery+india",
            "availability_note": "General web search fallback",
            "retrieved_at": now_iso,
        },
    ]


def search_external_recipe_providers(
    query: str, dietary_preference: str | None = None
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Queries legitimate external recipe APIs when enabled:
    1. Edamam Recipe Search API v2 (`https://api.edamam.com/api/recipes/v2?type=public`) when EDAMAM_APP_ID & EDAMAM_APP_KEY are configured.
       Respects Edamam copyright terms: displays source attribution and original source URL without fabricating copyrighted cooking instructions.
    2. TheMealDB Open Recipe API (`https://www.themealdb.com/api/json/v1/1/search.php`) for open-licensed recipes with full source attribution.
    """
    external_recipes: list[dict[str, Any]] = []
    provider_statuses: list[dict[str, Any]] = []
    if not settings.ENABLE_ONLINE_RECIPE_SEARCH:
        return external_recipes, [
            {
                "provider": "Online Recipe Search",
                "status": "disabled",
                "message": "ENABLE_ONLINE_RECIPE_SEARCH is false.",
            }
        ]

    # 1. Edamam Recipe Search API v2
    if settings.EDAMAM_APP_ID and settings.EDAMAM_APP_KEY:
        try:
            params: dict[str, Any] = {
                "type": "public",
                "q": query or "indian",
                "app_id": settings.EDAMAM_APP_ID,
                "app_key": settings.EDAMAM_APP_KEY,
            }
            if dietary_preference == "vegetarian":
                params["health"] = "vegetarian"
            elif dietary_preference == "vegan":
                params["health"] = "vegan"
            with httpx.Client(timeout=settings.RECIPE_PROVIDER_TIMEOUT_SECONDS) as client:
                resp = client.get(settings.EDAMAM_RECIPE_API_URL, params=params)
                if resp.status_code == 200:
                    hits = resp.json().get("hits") or []
                    for h in hits[:6]:
                        r = h.get("recipe") or {}
                        yield_servings = max(1.0, float(r.get("yield") or 2.0))
                        total_nut = r.get("totalNutrients") or {}
                        kcal_total = (total_nut.get("ENERC_KCAL") or {}).get("quantity")
                        prot_total = (total_nut.get("PROCNT") or {}).get("quantity")
                        carb_total = (total_nut.get("CHOCDF") or {}).get("quantity")
                        fat_total = (total_nut.get("FAT") or {}).get("quantity")
                        fib_total = (total_nut.get("FIBTG") or {}).get("quantity")
                        external_recipes.append(
                            {
                                "external_id": r.get("uri") or r.get("url"),
                                "title": r.get("label") or "Edamam Recipe",
                                "image_url": r.get("image"),
                                "source_type": "edamam_recipe_api_v2",
                                "source_name": f"{r.get('source', 'Web Publisher')} (via Edamam Recipe API v2)",
                                "source_url": r.get("url") or "https://developer.edamam.com/edamam-docs-recipe-api",
                                "servings": yield_servings,
                                "ingredient_lines": r.get("ingredientLines") or [],
                                "instructions_notes": None,
                                "instructions_license_notice": (
                                    "Cooking instructions are hosted on the original publisher's website per Edamam API terms. "
                                    "Click the source link to view step-by-step instructions."
                                ),
                                "per_serving_macros": {
                                    "energy_kcal": round(float(kcal_total) / yield_servings, 1)
                                    if kcal_total is not None
                                    else None,
                                    "protein_g": round(float(prot_total) / yield_servings, 1)
                                    if prot_total is not None
                                    else None,
                                    "carbs_g": round(float(carb_total) / yield_servings, 1)
                                    if carb_total is not None
                                    else None,
                                    "fat_total_g": round(float(fat_total) / yield_servings, 1)
                                    if fat_total is not None
                                    else None,
                                    "fibre_g": round(float(fib_total) / yield_servings, 1)
                                    if fib_total is not None
                                    else None,
                                },
                            }
                        )
                    provider_statuses.append(
                        {
                            "provider": "Edamam Recipe Search API v2",
                            "status": "found" if hits else "empty",
                            "message": f"Retrieved {len(hits[:6])} recipe(s) from Edamam Recipe API v2.",
                        }
                    )
                else:
                    provider_statuses.append(
                        {
                            "provider": "Edamam Recipe Search API v2",
                            "status": "http_error",
                            "message": f"Edamam returned HTTP {resp.status_code}.",
                        }
                    )
        except Exception as exc:
            provider_statuses.append(
                {
                    "provider": "Edamam Recipe Search API v2",
                    "status": "error",
                    "message": f"Edamam lookup error: {exc.__class__.__name__}",
                }
            )
    else:
        provider_statuses.append(
            {
                "provider": "Edamam Recipe Search API v2",
                "status": "unconfigured_optional_key",
                "message": "Optional EDAMAM_APP_ID / EDAMAM_APP_KEY not set in .env; using GharPlate IFCT/ICMR-NIN kitchen catalog and TheMealDB open provider.",
            }
        )

    # 2. TheMealDB Open Recipe API (only when query is provided)
    if query and len(query.strip()) >= 2:
        try:
            with httpx.Client(timeout=3.5) as client:
                resp = client.get(
                    f"{settings.THEMEALDB_API_URL.rstrip('/')}/search.php",
                    params={"s": query.strip()},
                )
                if resp.status_code == 200:
                    meals = resp.json().get("meals") or []
                    for m in meals[:4]:
                        cat_str = str(m.get("strCategory") or "").lower()
                        is_veg = cat_str in ("vegetarian", "vegan")
                        if dietary_preference in ("vegetarian", "vegan", "jain") and not is_veg:
                            continue
                        ing_lines = []
                        for idx in range(1, 21):
                            ing = (m.get(f"strIngredient{idx}") or "").strip()
                            meas = (m.get(f"strMeasure{idx}") or "").strip()
                            if ing:
                                ing_lines.append(f"{meas} {ing}".strip())
                        external_recipes.append(
                            {
                                "external_id": f"themealdb_{m.get('idMeal')}",
                                "title": m.get("strMeal") or "External Recipe",
                                "image_url": m.get("strMealThumb"),
                                "source_type": "themealdb_open_api",
                                "source_name": "TheMealDB Open Recipe Database",
                                "source_url": m.get("strSource")
                                or f"https://www.themealdb.com/meal/{m.get('idMeal')}",
                                "servings": 2.0,
                                "ingredient_lines": ing_lines,
                                "instructions_notes": m.get("strInstructions"),
                                "instructions_license_notice": "Open recipe record via TheMealDB; nutrient values are NULL unless mapped in Recipe Calculator.",
                                "per_serving_macros": {
                                    "energy_kcal": None,
                                    "protein_g": None,
                                    "carbs_g": None,
                                    "fat_total_g": None,
                                    "fibre_g": None,
                                },
                            }
                        )
                    provider_statuses.append(
                        {
                            "provider": "TheMealDB Open Recipe API",
                            "status": "found" if meals else "empty",
                            "message": f"Checked TheMealDB for '{query.strip()}'.",
                        }
                    )
        except Exception as exc:
            provider_statuses.append(
                {
                    "provider": "TheMealDB Open Recipe API",
                    "status": "offline_or_timeout",
                    "message": f"External network unavailable ({exc.__class__.__name__}); serving verified local recipes.",
                }
            )

    return external_recipes, provider_statuses


def discover_and_recommend_recipes(
    db: Session,
    household: Household,
    member: HouseholdMember | None = None,
    query: str | None = None,
    meal_type: str | None = None,
    dietary_preference: str | None = None,
    fitness_goal: str | None = None,
    max_cost_inr: float | None = None,
    include_online: bool = False,
) -> dict[str, Any]:
    """
    Profile-aware, pantry-aware, and condition-safe Recipe Discovery & Recommendation Engine (Modules F & N).
    """
    eff_diet = (
        dietary_preference
        or (member.dietary_preference if member else None)
        or "vegetarian"
    )
    eff_goal = (
        fitness_goal
        or (member.primary_goal if member else None)
        or "maintain_balanced_diet"
    )
    eff_conditions = member.selected_conditions if member else []
    eff_allergies = [a.lower() for a in (member.allergies if member else [])]

    pantry_items = (
        db.query(PantryItem)
        .filter(PantryItem.household_id == household.id, PantryItem.in_stock.is_(True))
        .all()
    )
    pantry_slugs = {p.food_slug for p in pantry_items if p.food_slug}

    recipes = (
        db.query(Recipe)
        .options(joinedload(Recipe.ingredients).joinedload(RecipeIngredient.food))
        .filter(
            (Recipe.household_id == household.id)
            | (Recipe.household_token == household.household_token)
            | (Recipe.is_system_template.is_(True))
        )
        .order_by(Recipe.is_system_template.desc(), Recipe.id.desc())
        .all()
    )

    # Check multi-condition conflicts on the member profile
    conflict_warnings: list[dict[str, Any]] = []
    if len(eff_conditions) >= 2:
        conflicts = (
            db.query(ConditionConflictRule)
            .filter(
                ConditionConflictRule.condition_a_code.in_(eff_conditions),
                ConditionConflictRule.condition_b_code.in_(eff_conditions),
            )
            .all()
        )
        for c in conflicts:
            conflict_warnings.append(
                {
                    "conflict_code": c.conflict_code,
                    "competing_domain": c.competing_domain,
                    "explanation": c.conflict_explanation,
                    "professional_guidance_notice": c.professional_guidance_notice,
                }
            )

    curated_out: list[dict[str, Any]] = []
    q_low = (query or "").strip().lower()

    for rec in recipes:
        if meal_type and rec.meal_type != meal_type:
            continue
        if max_cost_inr is not None and rec.estimated_cost_inr and rec.estimated_cost_inr > max_cost_inr:
            continue

        # Check dietary compatibility across all recipe ingredients
        ing_foods = [ri.food for ri in rec.ingredients if ri.food]
        is_veg = all(f.is_vegetarian for f in ing_foods)
        is_vegan = all(f.is_vegan for f in ing_foods)
        has_egg = any("eggs" in (f.allergen_tags or []) for f in ing_foods)

        if eff_diet == "vegetarian" and not is_veg:
            continue
        if eff_diet == "vegan" and not is_vegan:
            continue
        if eff_diet == "jain" and not is_veg:
            continue
        if eff_diet == "eggetarian" and (not is_veg and not has_egg):
            continue

        # Check query filter
        if q_low:
            title_match = q_low in rec.title.lower() or q_low in (rec.description or "").lower()
            ing_match = any(q_low in f.name_en.lower() or q_low in f.slug.lower() for f in ing_foods)
            tag_match = any(q_low in t.lower() for t in (rec.dietary_tags or []))
            if not (title_match or ing_match or tag_match):
                continue

        # Check member allergies
        matched_allergens = set()
        for f in ing_foods:
            for al in f.allergen_tags or []:
                if al.lower() in eff_allergies:
                    matched_allergens.add(al)

        detail = serialize_recipe_detail(db, rec)
        nut_by_code = {
            n.nutrient_code: n.per_serving_known_value for n in detail.nutrients
        }
        pantry_matched = [
            f.name_en for f in ing_foods if f.slug in pantry_slugs
        ]
        missing_from_pantry = [
            f.name_en for f in ing_foods if f.slug not in pantry_slugs
        ]

        # Build transparent explanation why this recipe is surfaced
        reasons: list[str] = []
        prot_val = nut_by_code.get("protein_g")
        fib_val = nut_by_code.get("fibre_g")
        if eff_goal in ("build_muscle", "improve_strength", "gain_weight") and prot_val and prot_val >= 12:
            reasons.append(
                f"Supports '{eff_goal.replace('_', ' ')}' with {prot_val}g verified protein per serving."
            )
        if fib_val and fib_val >= 5:
            reasons.append(f"Provides {fib_val}g dietary fibre per serving from whole Indian ingredients.")
        if pantry_matched:
            reasons.append(
                f"Uses {len(pantry_matched)} ingredient(s) already in your household pantry ({', '.join(pantry_matched[:3])})."
            )
        if not reasons:
            reasons.append(
                f"Compatible with {eff_diet.replace('_', ' ')} preference and computed from verified ICMR-NIN / IFCT records."
            )

        curated_out.append(
            {
                "id": rec.id,
                "slug": getattr(rec, "slug", None),
                "title": rec.title,
                "description": rec.description,
                "image_url": rec.image_url or detail.image_url,
                "meal_type": rec.meal_type,
                "servings": rec.servings,
                "prep_time_minutes": rec.prep_time_minutes or 15,
                "cook_time_minutes": rec.cook_time_minutes or 20,
                "total_time_minutes": detail.total_time_minutes,
                "difficulty": detail.difficulty,
                "estimated_cost_inr": rec.estimated_cost_inr,
                "source_type": rec.source_type or "gharplate_verified",
                "source_name": rec.source_name or "GharPlate IFCT 2017 / ICMR-NIN DGI 2024 Kitchen",
                "source_url": rec.source_url or "https://www.nin.res.in/",
                "verification_status": detail.verification_status,
                "verification_badge_label": detail.verification_badge_label,
                "instructions_status": detail.instructions_status,
                "step_count": len(detail.steps or []),
                "steps": [s.model_dump(mode="json") for s in (detail.steps or [])],
                "is_favourite": detail.is_favourite,
                "user_rating": detail.user_rating,
                "completeness_pct": detail.completeness_pct,
                "is_vegetarian": is_veg,
                "is_vegan": is_vegan,
                "dietary_tags": rec.dietary_tags or [],
                "suitable_goals": rec.suitable_goals or [],
                "why_recommended": " ".join(reasons),
                "allergen_warnings": [
                    f"Contains {al} (listed in member allergies)" for al in sorted(matched_allergens)
                ],
                "pantry_available_ingredients": pantry_matched,
                "missing_pantry_ingredients": missing_from_pantry,
                "per_serving_macros": {
                    "energy_kcal": nut_by_code.get("energy_kcal"),
                    "protein_g": nut_by_code.get("protein_g"),
                    "carbs_g": nut_by_code.get("carbs_g"),
                    "fat_total_g": nut_by_code.get("fat_total_g"),
                    "fibre_g": nut_by_code.get("fibre_g"),
                    "sodium_mg": nut_by_code.get("sodium_mg"),
                },
                "detail": detail.model_dump(mode="json"),
            }
        )

    external_recipes: list[dict[str, Any]] = []
    provider_statuses: list[dict[str, Any]] = []
    if include_online:
        external_recipes, provider_statuses = search_external_recipe_providers(
            query=query or "indian", dietary_preference=eff_diet
        )

    return {
        "active_filters": {
            "query": query,
            "meal_type": meal_type,
            "dietary_preference": eff_diet,
            "fitness_goal": eff_goal,
            "condition_codes": eff_conditions,
        },
        "conflict_warnings": conflict_warnings,
        "local_verified_recipes": curated_out,
        "external_online_recipes": external_recipes,
        "external_provider_statuses": provider_statuses,
    }


def generate_personal_recipe_from_db_ingredients(
    db: Session,
    household: Household,
    member: HouseholdMember | None,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Personal Recipe Generator (Section 8.5):
    Uses ONLY real GharPlate database food records to assemble a recipe matching the user's
    requested ingredients, dietary preference, and fitness goal — never inventing nutrient values.
    """
    prompt_text = str(payload.get("prompt") or "").strip()
    requested_slugs: list[str] = payload.get("ingredient_slugs") or []
    meal_type = str(payload.get("meal_type") or "lunch")
    servings = float(payload.get("servings") or 2.0)
    save_recipe = bool(payload.get("save_recipe", True))

    eff_diet = (
        payload.get("dietary_preference")
        or (member.dietary_preference if member else "vegetarian")
    )
    eff_goal = (
        payload.get("fitness_goal")
        or (member.primary_goal if member else "maintain_balanced_diet")
    )

    all_foods = db.query(FoodItem).all()
    matched_foods: list[FoodItem] = []
    seen_ids: set[int] = set()

    for slug in requested_slugs:
        f_obj = next((f for f in all_foods if f.slug == slug), None)
        if f_obj and f_obj.id not in seen_ids:
            seen_ids.add(f_obj.id)
            matched_foods.append(f_obj)

    if prompt_text:
        p_low = prompt_text.lower()
        for f_obj in all_foods:
            if f_obj.id in seen_ids:
                continue
            if eff_diet in ("vegetarian", "vegan", "jain") and not f_obj.is_vegetarian:
                continue
            if eff_diet == "vegan" and not f_obj.is_vegan:
                continue
            base_tokens = [
                w
                for w in re.findall(r"[a-z]+", f_obj.name_en.lower())
                if len(w) >= 4 and w not in ("cooked", "whole", "raw", "plain", "fresh")
            ]
            if any(tok in p_low for tok in base_tokens):
                seen_ids.add(f_obj.id)
                matched_foods.append(f_obj)

    # Ensure at least 3 balanced Indian ingredients if fewer were matched
    fallback_slugs = (
        ["paneer-cottage-cheese-cow", "rice-brown-raw", "tomato-ripe", "spinach-palak"]
        if eff_diet != "vegan"
        else ["toor-dal-red-gram", "rice-brown-raw", "tomato-ripe", "spinach-palak"]
    )
    for fb_slug in fallback_slugs:
        if len(matched_foods) >= 4:
            break
        f_obj = next((f for f in all_foods if f.slug == fb_slug), None)
        if f_obj and f_obj.id not in seen_ids:
            seen_ids.add(f_obj.id)
            matched_foods.append(f_obj)

    selected_foods = matched_foods[:6]
    ing_inputs: list[RecipeIngredientInput] = []
    for f_obj in selected_foods:
        qty = 2.0 if f_obj.slug in ("paneer-cottage-cheese-cow", "soya-chunks-textured-veg-protein") and eff_goal == "build_muscle" else 1.0
        ing_inputs.append(
            RecipeIngredientInput(
                food_slug=f_obj.slug,
                quantity=qty,
                unit_name="100g" if f_obj.default_basis == "100g" else "standard_serving",
            )
        )

    ing_names = ", ".join(f.name_en.split(" (")[0] for f in selected_foods[:3])
    gen_title = (
        payload.get("title")
        or f"Personalised {ing_names} Bowl ({eff_goal.replace('_', ' ').title()})"
    )
    instructions = (
        f"1. Prepare and wash {', '.join(f.name_en for f in selected_foods)}. "
        "2. Cook the primary protein/pulse and grain components until tender. "
        "3. Simmer with tempered spices, aromatics, and vegetables; serve warm across "
        f"{int(servings)} balanced portions."
    )

    from app.schemas.api_schemas import RecipeStepInput

    step_inputs = [
        RecipeStepInput(
            step_number=1,
            step_title="Wash, Measure & Prep Ingredients",
            instruction_text=f"Measure and wash {', '.join(f.name_en for f in selected_foods)}. Rinse grains and pulses until clear and dice fresh vegetables evenly.",
            duration_minutes=5,
            temperature="Room temperature",
            tip="Uniformly chopped vegetables cook evenly and retain their colour.",
            equipment="Mixing Bowls & Chopping Board",
        ),
        RecipeStepInput(
            step_number=2,
            step_title="Cook Primary Grain & Protein Base",
            instruction_text="Cook the primary grain, millet, or pulse component in measured water until tender, and prepare any paneer, soya, or egg protein component.",
            duration_minutes=12,
            temperature="Medium heat",
            tip="Soaking pulses or brown rice for 20 minutes reduces cooking time and improves digestibility.",
            equipment="Pressure Cooker or Saucepan",
        ),
        RecipeStepInput(
            step_number=3,
            step_title="Temper Spices & Simmer with Vegetables",
            instruction_text="Warm 1 tsp oil or ghee in a pan, temper cumin/mustard seeds, ginger, and curry leaves, sauté the vegetables and aromatics, and fold in the cooked base.",
            duration_minutes=6,
            temperature="Medium-Low heat",
            tip="Keep spices on moderate flame so they release aroma without scorching.",
            equipment="Kadai / Skillet",
        ),
        RecipeStepInput(
            step_number=4,
            step_title="Rest, Garnish & Serve Balanced Portions",
            instruction_text=f"Rest covered for 2 minutes off the heat, finish with fresh coriander and lemon juice, and divide into {int(servings)} balanced portions.",
            duration_minutes=2,
            temperature="Serve warm",
            tip="Fresh lemon juice added off the heat boosts iron absorption.",
            equipment="Serving Bowls",
        ),
    ]

    rec_req = RecipeCreateRequest(
        household_token=household.household_token if save_recipe else None,
        title=gen_title[:200],
        description=f"Generated from verified GharPlate ingredient records for goal '{eff_goal.replace('_', ' ')}' ({eff_diet}).",
        servings=servings,
        meal_type=meal_type,
        prep_time_minutes=10,
        cook_time_minutes=15,
        difficulty="Easy",
        instructions_notes=instructions,
        ingredients=ing_inputs,
        steps=step_inputs,
    )
    calculated = create_or_update_recipe(
        db,
        rec_req,
        household_id=household.id if save_recipe else None,
        household_token=household.household_token if save_recipe else None,
    )
    return {
        "generated_recipe": calculated.model_dump(mode="json"),
        "selected_goal": eff_goal,
        "dietary_preference": eff_diet,
        "nutrition_provenance_notice": (
            "100% of calorie, macronutrient, and micronutrient values are calculated deterministically "
            "from GharPlate's verified IFCT 2017 / ICMR-NIN database records — zero LLM-invented numbers."
        ),
    }


def add_recipe_ingredients_to_shopping_list(
    db: Session,
    household: Household,
    recipe_ids: list[int],
    serving_multiplier: float = 1.0,
    subtract_pantry: bool = True,
) -> dict[str, Any]:
    """
    Converts one or more recipes into a consolidated Smart Grocery Shopping List (Module H):
    1. Checks household pantry inventory and subtracts available in-stock quantities.
    2. Combines duplicate ingredients across multiple recipes into a single consolidated line item.
    3. Attaches genuine Indian grocery retailer search destinations (Blinkit, Zepto, Swiggy Instamart, BigBasket).
    """
    s_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.household_id == household.id)
        .order_by(ShoppingList.id.asc())
        .first()
    )
    if not s_list:
        s_list = ShoppingList(
            household_id=household.id,
            title=f"{household.name} Smart Grocery List",
        )
        db.add(s_list)
        db.flush()

    pantry_map: dict[str, float] = {}
    if subtract_pantry:
        pantry_rows = (
            db.query(PantryItem)
            .filter(PantryItem.household_id == household.id, PantryItem.in_stock.is_(True))
            .all()
        )
        for p in pantry_rows:
            if p.food_slug:
                pantry_map[p.food_slug] = pantry_map.get(p.food_slug, 0.0) + p.grams_available

    recipes = (
        db.query(Recipe)
        .options(
            joinedload(Recipe.ingredients)
            .joinedload(RecipeIngredient.food)
            .joinedload(FoodItem.category)
        )
        .filter(Recipe.id.in_(recipe_ids))
        .all()
    )

    added_or_merged: list[str] = []
    skipped_in_pantry: list[str] = []

    for rec in recipes:
        for ri in rec.ingredients:
            food = ri.food
            if not food:
                continue
            needed_grams = round(ri.grams_equivalent * serving_multiplier, 1)
            avail_in_pantry = pantry_map.get(food.slug, 0.0)
            if subtract_pantry and avail_in_pantry >= needed_grams:
                pantry_map[food.slug] = avail_in_pantry - needed_grams
                skipped_in_pantry.append(food.name_en)
                continue
            elif subtract_pantry and avail_in_pantry > 0:
                needed_grams = round(needed_grams - avail_in_pantry, 1)
                pantry_map[food.slug] = 0.0

            existing_item = (
                db.query(ShoppingListItem)
                .filter(
                    ShoppingListItem.shopping_list_id == s_list.id,
                    (ShoppingListItem.food_slug == food.slug)
                    | (ShoppingListItem.ingredient_name == food.name_en),
                    ShoppingListItem.is_purchased.is_(False),
                )
                .first()
            )
            ref_price_100g = REFERENCE_INDIAN_PROTEIN_PRICES_INR_PER_100G.get(
                food.slug, (8.0, "")
            )[0]
            est_cost = round((needed_grams / 100.0) * ref_price_100g, 1)

            if existing_item:
                existing_item.grams_needed = round(existing_item.grams_needed + needed_grams, 1)
                existing_item.quantity = existing_item.grams_needed
                existing_item.unit_name = "g"
                existing_item.estimated_price_inr = round(
                    (existing_item.estimated_price_inr or 0.0) + est_cost, 1
                )
                rel = list(existing_item.related_recipes or [])
                if rec.title not in rel:
                    rel.append(rec.title)
                existing_item.related_recipes = rel
            else:
                cat_name = food.category.name if food.category else "Groceries"
                db.add(
                    ShoppingListItem(
                        shopping_list_id=s_list.id,
                        food_id=food.id,
                        food_slug=food.slug,
                        ingredient_name=food.name_en,
                        food_category=cat_name,
                        quantity=needed_grams,
                        unit_name="g",
                        grams_needed=needed_grams,
                        estimated_price_inr=est_cost,
                        related_recipes=[rec.title],
                        is_purchased=False,
                    )
                )
                db.flush()
            added_or_merged.append(food.name_en)

    db.commit()
    return get_household_shopping_list(
        db,
        household,
        extra_meta={
            "added_or_merged_items": added_or_merged,
            "skipped_already_in_pantry": skipped_in_pantry,
        },
    )


def get_household_shopping_list(
    db: Session, household: Household, extra_meta: dict[str, Any] | None = None
) -> dict[str, Any]:
    s_list = (
        db.query(ShoppingList)
        .options(joinedload(ShoppingList.items))
        .filter(ShoppingList.household_id == household.id)
        .order_by(ShoppingList.id.asc())
        .first()
    )
    if not s_list:
        s_list = ShoppingList(
            household_id=household.id,
            title=f"{household.name} Smart Grocery List",
        )
        db.add(s_list)
        db.commit()
        db.refresh(s_list)

    items_out = []
    total_est_inr = 0.0
    for item in sorted(s_list.items or [], key=lambda x: (x.is_purchased, x.id)):
        if item.estimated_price_inr and not item.is_purchased:
            total_est_inr += item.estimated_price_inr
        items_out.append(
            {
                "id": item.id,
                "food_slug": item.food_slug,
                "ingredient_name": item.ingredient_name,
                "food_category": item.food_category,
                "quantity": item.quantity,
                "unit_name": item.unit_name,
                "grams_needed": item.grams_needed,
                "estimated_price_inr": item.estimated_price_inr,
                "related_recipes": item.related_recipes or [],
                "is_purchased": item.is_purchased,
                "retailer_destinations": build_indian_retailer_links(
                    item.ingredient_name,
                    pincode=s_list.delivery_pincode,
                    location_consent=s_list.location_consent_given,
                ),
            }
        )

    resp = {
        "id": s_list.id,
        "title": s_list.title,
        "delivery_pincode": s_list.delivery_pincode,
        "location_consent_given": s_list.location_consent_given,
        "total_items": len(items_out),
        "unpurchased_count": sum(1 for i in items_out if not i["is_purchased"]),
        "total_estimated_cost_inr": round(total_est_inr, 1),
        "retailer_transparency_notice": (
            "Retailer links open official search destinations on Blinkit, Zepto, Swiggy Instamart, and BigBasket. "
            "GharPlate never claims direct cart insertion or guaranteed local stock without an authorised retailer checkout session."
        ),
        "items": items_out,
    }
    if extra_meta:
        resp.update(extra_meta)
    return resp


def get_indian_protein_intelligence(
    db: Session,
    household: Household,
    dietary_filter: str | None = None,
    max_cost_per_10g_protein: float | None = None,
) -> dict[str, Any]:
    """
    Indian Protein & Budget Intelligence (Module I):
    Compares whole Indian protein sources (soya chunks, eggs, dals, chickpeas, peanuts, curd, milk, paneer, chicken, fish)
    on protein per 100g, protein per standard serving, cost per serving, and cost per 10g of protein.
    Uses user-entered local prices when saved, or transparently labelled market reference prices.
    """
    custom_prices = {
        p.food_slug: p
        for p in db.query(LocalFoodPrice)
        .filter(LocalFoodPrice.household_id == household.id)
        .all()
    }

    foods = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.nutrient_values),
        )
        .filter(FoodItem.is_packaged.is_(False))
        .all()
    )

    comparisons: list[dict[str, Any]] = []
    for f in foods:
        if dietary_filter == "vegetarian" and not f.is_vegetarian:
            continue
        if dietary_filter == "vegan" and not f.is_vegan:
            continue
        if dietary_filter == "non_vegetarian" and f.is_vegetarian:
            continue

        nut_map = {nv.nutrient_code: nv.value for nv in f.nutrient_values}
        prot_100 = nut_map.get("protein_g")
        kcal_100 = nut_map.get("energy_kcal")
        if prot_100 is None or prot_100 < 3.0:
            continue

        srv_grams = f.standard_serving_grams or 100.0
        prot_serving = round(prot_100 * (srv_grams / 100.0), 1)
        kcal_serving = (
            round(kcal_100 * (srv_grams / 100.0), 1) if kcal_100 is not None else None
        )

        user_price_obj = custom_prices.get(f.slug)
        ref_tuple = REFERENCE_INDIAN_PROTEIN_PRICES_INR_PER_100G.get(f.slug)

        if user_price_obj:
            price_100g = user_price_obj.price_inr_per_100g
            price_source = "user_entered_local_price"
            price_label = user_price_obj.package_label or f"User-entered ₹{price_100g}/100g"
        elif ref_tuple:
            price_100g = ref_tuple[0]
            price_source = "market_reference_editable"
            price_label = ref_tuple[1]
        else:
            price_100g = None
            price_source = "not_entered"
            price_label = "Enter your local price to calculate cost per 10g protein"

        cost_per_serving = (
            round(price_100g * (srv_grams / 100.0), 2)
            if price_100g is not None
            else None
        )
        cost_per_10g_prot = (
            round((price_100g / prot_100) * 10.0, 2)
            if (price_100g is not None and prot_100 > 0)
            else None
        )

        if (
            max_cost_per_10g_protein is not None
            and cost_per_10g_prot is not None
            and cost_per_10g_prot > max_cost_per_10g_protein
        ):
            continue

        avail_count = sum(1 for nv in f.nutrient_values if nv.value is not None)
        comp_pct = round((avail_count / max(1, len(f.nutrient_values))) * 100.0, 1)

        comparisons.append(
            {
                "food_slug": f.slug,
                "name_en": f.name_en,
                "image_url": f.image_url,
                "category_name": f.category.name if f.category else "",
                "is_vegetarian": f.is_vegetarian,
                "is_vegan": f.is_vegan,
                "standard_serving_name": f.standard_serving_name,
                "standard_serving_grams": srv_grams,
                "protein_per_100g": round(prot_100, 1),
                "protein_per_serving_g": prot_serving,
                "energy_per_100g_kcal": kcal_100,
                "energy_per_serving_kcal": kcal_serving,
                "price_inr_per_100g": price_100g,
                "price_source": price_source,
                "price_label": price_label,
                "cost_per_serving_inr": cost_per_serving,
                "cost_per_10g_protein_inr": cost_per_10g_prot,
                "completeness_pct": comp_pct,
                "source_name": f.source.name if f.source else "ICMR-NIN IFCT 2017",
            }
        )

    comparisons.sort(
        key=lambda x: (
            x["cost_per_10g_protein_inr"] is None,
            x["cost_per_10g_protein_inr"] or 9999.0,
            -x["protein_per_100g"],
        )
    )

    return {
        "items": comparisons,
        "whole_food_first_disclaimer": (
            "Whole Indian foods (dals, soya chunks, curd, milk, paneer, eggs, chickpeas, peanuts) can meet everyday and gym "
            "protein goals affordably without requiring packaged supplements. Enter your local market prices to personalise cost calculations."
        ),
    }


def analyze_mess_or_canteen_menu(
    db: Session,
    household: Household,
    raw_menu_text: str,
    save_title: str | None = None,
    institution_name: str | None = None,
) -> dict[str, Any]:
    """
    Smart Mess & Canteen Analyzer (Module J):
    Extracts dish tokens/lines from college mess or hostel menus and matches them against
    GharPlate's Indian food database. Distinguishes 'exact_match' vs 'possible_match_requires_confirmation'.
    """
    cleaned_chunks = [
        c.strip()
        for c in re.split(r"[\n,;•|+]+", raw_menu_text)
        if c and len(c.strip()) >= 2
    ]

    matched_dishes: list[dict[str, Any]] = []
    seen_slugs: set[str] = set()

    for chunk in cleaned_chunks[:15]:
        res = search_foods(db, q=chunk, page_size=3)
        if not res.items:
            matched_dishes.append(
                {
                    "menu_item_text": chunk,
                    "match_status": "unmatched",
                    "requires_user_confirmation": True,
                    "confidence_note": "No matching food record found in GharPlate database.",
                    "matched_food": None,
                    "alternatives": [],
                }
            )
            continue

        top = res.items[0]
        if top.slug in seen_slugs and len(res.items) > 1:
            top = res.items[1]
        seen_slugs.add(top.slug)

        is_exact = (
            chunk.lower() in top.name_en.lower()
            or any(chunk.lower() == a.alias_text.lower() for a in top.aliases)
        )
        srv_Factor = (top.standard_serving_grams or 100.0) / 100.0

        def _scale(v: float | None, factor: float = srv_Factor) -> float | None:
            return round(v * factor, 1) if v is not None else None

        matched_dishes.append(
            {
                "menu_item_text": chunk,
                "match_status": "exact_match"
                if is_exact
                else "possible_match_requires_confirmation",
                "requires_user_confirmation": not is_exact,
                "confidence_note": (
                    f"Matched to '{top.name_en}' ({top.source_name})."
                    if is_exact
                    else f"Possible match for '{chunk}' -> '{top.name_en}'. Please confirm before logging; canteen preparation oil/salt may vary."
                ),
                "matched_food": {
                    "slug": top.slug,
                    "name_en": top.name_en,
                    "image_url": top.image_url,
                    "standard_serving_name": top.standard_serving_name,
                    "standard_serving_grams": top.standard_serving_grams,
                    "is_vegetarian": top.is_vegetarian,
                    "estimated_serving_nutrients": {
                        "energy_kcal": _scale(top.key_nutrients.get("energy_kcal")),
                        "protein_g": _scale(top.key_nutrients.get("protein_g")),
                        "carbs_g": _scale(top.key_nutrients.get("carbs_g")),
                        "fat_total_g": _scale(top.key_nutrients.get("fat_total_g")),
                        "fibre_g": _scale(top.key_nutrients.get("fibre_g")),
                    },
                    "source_name": top.source_name,
                },
                "alternatives": [
                    {"slug": alt.slug, "name_en": alt.name_en}
                    for alt in res.items[1:3]
                ],
            }
        )

    saved_id = None
    if save_title and save_title.strip():
        rec = MessMenuRecord(
            household_id=household.id,
            title=save_title.strip()[:160],
            institution_or_canteen=institution_name,
            raw_menu_text=raw_menu_text,
            matched_dishes_json=matched_dishes,
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        saved_id = rec.id

    # Combined plate estimate for all matched dishes
    plate_kcal = sum(
        d["matched_food"]["estimated_serving_nutrients"]["energy_kcal"] or 0.0
        for d in matched_dishes
        if d["matched_food"]
    )
    plate_prot = sum(
        d["matched_food"]["estimated_serving_nutrients"]["protein_g"] or 0.0
        for d in matched_dishes
        if d["matched_food"]
    )
    plate_carbs = sum(
        d["matched_food"]["estimated_serving_nutrients"]["carbs_g"] or 0.0
        for d in matched_dishes
        if d["matched_food"]
    )
    plate_fat = sum(
        d["matched_food"]["estimated_serving_nutrients"]["fat_total_g"] or 0.0
        for d in matched_dishes
        if d["matched_food"]
    )
    plate_fib = sum(
        d["matched_food"]["estimated_serving_nutrients"]["fibre_g"] or 0.0
        for d in matched_dishes
        if d["matched_food"]
    )

    return {
        "saved_menu_id": saved_id,
        "raw_menu_text": raw_menu_text,
        "matched_dishes": matched_dishes,
        "combined_plate_estimate": {
            "energy_kcal": round(plate_kcal, 1),
            "protein_g": round(plate_prot, 1),
            "carbs_g": round(plate_carbs, 1),
            "fat_total_g": round(plate_fat, 1),
            "fibre_g": round(plate_fib, 1),
        },
        "estimation_disclaimer": (
            "Mess and canteen nutrition values are estimated from standard ICMR-NIN / IFCT home-cooked reference recipes. "
            "Actual hostel or restaurant cooking oil, ghee, and salt quantities may vary."
        ),
    }


def build_family_meal_personalisation_plan(
    db: Session,
    household: Household,
    recipe_id: int,
    member_servings: dict[str, float] | None = None,
) -> dict[str, Any]:
    """
    One Family Meal, Multiple Nutrition Goals (Module K):
    Takes one shared household recipe and calculates member-specific serving multipliers,
    macronutrient contributions, fitness goal alignment, and deterministic condition guidance
    for every family member in the household.
    """
    rec = (
        db.query(Recipe)
        .options(joinedload(Recipe.ingredients).joinedload(RecipeIngredient.food))
        .filter(Recipe.id == recipe_id)
        .first()
    )
    if not rec:
        raise ValueError(f"Recipe ID {recipe_id} not found.")

    rec_detail = serialize_recipe_detail(db, rec)
    nut_per_srv = {
        n.nutrient_code: n.per_serving_known_value for n in rec_detail.nutrients
    }
    ing_foods = [ri.food for ri in rec.ingredients if ri.food]
    primary_food_slug = ing_foods[0].slug if ing_foods else None

    member_plans: list[dict[str, Any]] = []
    for m in household.members:
        f_prof = get_or_create_fitness_profile(db, m)
        goal = f_prof["primary_goal"]

        # Suggest evidence-backed default portion multiplier based on member goal if not overridden
        if member_servings and str(m.id) in member_servings:
            mult = float(member_servings[str(m.id)])
        elif goal in ("build_muscle", "gain_weight", "improve_strength"):
            mult = 1.5
        elif goal == "lose_body_fat" or m.age_group == "child":
            mult = 0.75
        else:
            mult = 1.0

        def _m_val(code: str, m_mult: float = mult) -> float | None:
            v = nut_per_srv.get(code)
            return round(v * m_mult, 1) if v is not None else None

        adjustments: list[str] = []
        if goal in ("build_muscle", "improve_strength"):
            adjustments.append(
                "Fitness Portion Adjustment: 1.5× serving (+1 extra katori of dal/curd or protein side) to increase meal protein."
            )
        if "type_2_diabetes" in (m.selected_conditions or []):
            adjustments.append(
                "Diabetes Portion Awareness: Pair with extra non-starchy vegetable/salad katori and monitor total carbohydrate portion size."
            )
        if "hypertension" in (m.selected_conditions or []):
            adjustments.append(
                "Low-Sodium Household Tip: Serve this member's portion before adding extra table salt, papad, or pickle."
            )
        if not adjustments:
            adjustments.append(
                "Standard 1.0× balanced household portion."
            )

        # Evaluate condition observations on primary ingredient if member has conditions
        cond_notes: list[str] = []
        if primary_food_slug and m.selected_conditions:
            try:
                g_res = evaluate_food_guidance(
                    db,
                    GuidanceEvaluationRequest(
                        food_slug=primary_food_slug,
                        condition_codes=m.selected_conditions,
                        serving_quantity=mult,
                        age_group=m.age_group,
                        allergies=m.allergies,
                        intolerances=m.intolerances,
                        dietary_preference=m.dietary_preference,
                    ),
                )
                for obs in g_res.observations[:2]:
                    cond_notes.append(f"{obs.condition_name}: {obs.explanation}")
            except Exception:
                pass

        member_plans.append(
            {
                "member_id": m.id,
                "display_name": m.display_name,
                "age_group": m.age_group,
                "dietary_preference": m.dietary_preference,
                "primary_goal": goal,
                "selected_conditions": m.selected_conditions,
                "serving_multiplier": mult,
                "portion_grams": round(rec_detail.serving_weight_grams * mult, 1),
                "calculated_nutrition": {
                    "energy_kcal": _m_val("energy_kcal"),
                    "protein_g": _m_val("protein_g"),
                    "carbs_g": _m_val("carbs_g"),
                    "fat_total_g": _m_val("fat_total_g"),
                    "fibre_g": _m_val("fibre_g"),
                    "sodium_mg": _m_val("sodium_mg"),
                },
                "practical_adjustments": adjustments,
                "condition_guidance_notes": cond_notes,
            }
        )

    return {
        "recipe": rec_detail.model_dump(mode="json"),
        "member_plans": member_plans,
        "clinical_safety_notice": (
            "Household portion adjustments are educational nutrition suggestions based on each member's profile and "
            "do not replace individualised clinical meal plans."
        ),
    }
