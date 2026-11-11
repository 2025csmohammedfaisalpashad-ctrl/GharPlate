"""
FastAPI Router for GharPlate 3.0 Ecosystem (Modules A through N):
- Fitness Profiles & Weekly Training Schedules
- Daily Nutrition Tracker, Food Diary History, Copy Day & Meal Templates
- Water & Hydration Tracker + Condition-Aware Fluid Notices
- Fitness & Nutrition Goal Tracker, Gentle Habit Tracker & Optional Body Measurements
- Daily, Weekly & Monthly Visual Analytics
- Recipe Discovery (Local + Edamam v2 / TheMealDB) & Personal Recipe Generator
- Smart Pantry Inventory, Consolidated Grocery Shopping List & Genuine Indian Retailer Links
- Indian Protein & Budget Intelligence
- Smart Mess & Canteen Analyzer
- Family Meal Personalisation (One Family Meal, Multiple Nutrition Goals)
- Supplement & Packaged Product Intelligence
"""

from datetime import datetime, timedelta, UTC
from typing import Annotated, Any
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.core.security import (
    ensure_user_owned_household,
    get_current_user,
    verify_household_ownership,
)
from app.db.session import get_db
from app.models.entities import (
    BloodGlucoseLog,
    BloodPressureLog,
    BodyMeasurementLog,
    DailyFoodLogEntry,
    FitnessGoal,
    FoodItem,
    HabitCompletionLog,
    HabitDefinition,
    Household,
    HouseholdMember,
    LocalFoodPrice,
    MemberFitnessProfile,
    MessMenuRecord,
    PantryItem,
    SavedMealTemplate,
    ShoppingList,
    ShoppingListItem,
    UserAccount,
    WaterIntakeLog,
)
from app.services.fitness_ecosystem_service import (
    add_recipe_ingredients_to_shopping_list,
    analyze_mess_or_canteen_menu,
    build_family_meal_personalisation_plan,
    create_daily_food_log_entry,
    discover_and_recommend_recipes,
    generate_personal_recipe_from_db_ingredients,
    get_analytics_overview,
    get_daily_hydration_summary,
    get_daily_tracker_summary,
    get_household_shopping_list,
    get_indian_protein_intelligence,
    get_or_create_fitness_profile,
    get_or_create_hydration_setting,
    serialize_food_log_entry,
    today_iso_str,
    update_member_fitness_profile,
)
from app.services.health_measurement_service import (
    confirm_ai_habit_plan,
    confirm_natural_language_food_logs,
    convert_glucose_units,
    create_blood_glucose_log,
    create_blood_pressure_log,
    get_blood_glucose_dashboard,
    get_blood_pressure_dashboard,
    get_health_measurements_summary,
    get_member_clinician_target,
    get_unified_daily_activity_timeline,
    modify_ai_habit_plan_natural_language,
    parse_natural_language_food_log,
    propose_ai_habit_plan,
    save_clinician_measurement_target,
    serialize_bp_log,
    serialize_glucose_log,
)

ecosystem_router = APIRouter()
DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[UserAccount, Depends(get_current_user)]


def _resolve_owned_member(
    db: Session,
    current_user: CurrentUser,
    member_id: int | None = None,
    household_token: str | None = None,
) -> tuple[Household, HouseholdMember]:
    hh = verify_household_ownership(db, current_user, requested_token=household_token)
    if member_id is not None:
        m = (
            db.query(HouseholdMember)
            .filter(
                HouseholdMember.id == member_id,
                HouseholdMember.household_id == hh.id,
            )
            .first()
        )
        if not m:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Member does not belong to your household.",
            )
        return hh, m

    if hh.default_member_id:
        m = (
            db.query(HouseholdMember)
            .filter(
                HouseholdMember.id == hh.default_member_id,
                HouseholdMember.household_id == hh.id,
            )
            .first()
        )
        if m:
            return hh, m

    if hh.members:
        return hh, hh.members[0]

    # Automatically create a default member for the authenticated user if none exists yet
    default_mem = HouseholdMember(
        household_id=hh.id,
        display_name=current_user.full_name.split(" ")[0] or "Me",
        age_group="adult",
        dietary_preference="vegetarian",
        primary_goal="maintain_balanced_diet",
    )
    db.add(default_mem)
    db.flush()
    hh.default_member_id = default_mem.id
    db.commit()
    db.refresh(default_mem)
    return hh, default_mem


# ==========================================
# MODULE A — FITNESS PROFILES & TRAINING SCHEDULE
# ==========================================
@ecosystem_router.get("/fitness/profile", tags=["Fitness & Goals"])
def get_fitness_profile_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    _hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_or_create_fitness_profile(db, member)


@ecosystem_router.put("/fitness/profile", tags=["Fitness & Goals"])
def update_fitness_profile_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    target_m_id = member_id or payload.get("member_id")
    _hh, member = _resolve_owned_member(
        db,
        current_user,
        member_id=int(target_m_id) if target_m_id is not None else None,
    )
    return update_member_fitness_profile(db, member, payload)


# ==========================================
# MODULE B — DAILY NUTRITION TRACKER & FOOD DIARY
# ==========================================
@ecosystem_router.get("/tracker/daily", tags=["Daily Tracker"])
def get_daily_tracker_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    date: Annotated[str | None, Query(description="YYYY-MM-DD")] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_daily_tracker_summary(db, hh, member, date_str=date)


@ecosystem_router.post("/tracker/food-logs", tags=["Daily Tracker"])
def add_food_log_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        entry = create_daily_food_log_entry(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {
        "entry": serialize_food_log_entry(entry),
        "daily_summary": get_daily_tracker_summary(db, hh, member, entry.logged_date),
    }


@ecosystem_router.put("/tracker/food-logs/{entry_id}", tags=["Daily Tracker"])
def update_food_log_endpoint(
    entry_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    entry = (
        db.query(DailyFoodLogEntry)
        .filter(
            DailyFoodLogEntry.id == entry_id,
            DailyFoodLogEntry.household_id == hh.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Food log entry not found."
        )

    old_qty = entry.quantity or 1.0
    new_qty = float(payload.get("quantity", old_qty))
    if new_qty <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Quantity must be greater than zero.",
        )

    ratio = new_qty / old_qty if old_qty > 0 else 1.0
    entry.quantity = new_qty
    entry.grams_equivalent = round(entry.grams_equivalent * ratio, 1)
    if "meal_category" in payload and payload["meal_category"]:
        entry.meal_category = str(payload["meal_category"])
    if "logged_time" in payload:
        entry.logged_time = payload["logged_time"]
    if "notes" in payload:
        entry.notes = payload["notes"]

    for nut_attr in (
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
    ):
        cur_val = getattr(entry, nut_attr)
        if cur_val is not None:
            setattr(entry, nut_attr, round(cur_val * ratio, 2))

    db.commit()
    db.refresh(entry)
    _, member = _resolve_owned_member(db, current_user, member_id=entry.member_id)
    return {
        "entry": serialize_food_log_entry(entry),
        "daily_summary": get_daily_tracker_summary(db, hh, member, entry.logged_date),
    }


@ecosystem_router.delete("/tracker/food-logs/{entry_id}", tags=["Daily Tracker"])
def delete_food_log_endpoint(
    entry_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    entry = (
        db.query(DailyFoodLogEntry)
        .filter(
            DailyFoodLogEntry.id == entry_id,
            DailyFoodLogEntry.household_id == hh.id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Food log entry not found."
        )
    m_id = entry.member_id
    l_date = entry.logged_date
    db.delete(entry)
    db.commit()
    _, member = _resolve_owned_member(db, current_user, member_id=m_id)
    return {
        "deleted": True,
        "entry_id": entry_id,
        "daily_summary": get_daily_tracker_summary(db, hh, member, l_date),
    }


@ecosystem_router.post("/tracker/copy-day", tags=["Daily Tracker"])
def copy_day_meals_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    source_date = str(payload.get("source_date") or "")
    target_date = str(payload.get("target_date") or today_iso_str())
    meal_category = payload.get("meal_category")
    if not source_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'source_date' is required.",
        )

    q = db.query(DailyFoodLogEntry).filter(
        DailyFoodLogEntry.member_id == member.id,
        DailyFoodLogEntry.logged_date == source_date,
    )
    if meal_category:
        q = q.filter(DailyFoodLogEntry.meal_category == str(meal_category))
    source_entries = q.order_by(DailyFoodLogEntry.id.asc()).all()

    copied_count = 0
    for src in source_entries:
        clone = DailyFoodLogEntry(
            household_id=hh.id,
            member_id=member.id,
            logged_date=target_date,
            meal_category=src.meal_category,
            logged_time=src.logged_time,
            food_id=src.food_id,
            recipe_id=src.recipe_id,
            food_slug=src.food_slug,
            food_name=src.food_name,
            entry_source_type=src.entry_source_type,
            quantity=src.quantity,
            unit_name=src.unit_name,
            grams_equivalent=src.grams_equivalent,
            energy_kcal=src.energy_kcal,
            protein_g=src.protein_g,
            carbs_g=src.carbs_g,
            sugars_total_g=src.sugars_total_g,
            sugars_added_g=src.sugars_added_g,
            fat_total_g=src.fat_total_g,
            fat_saturated_g=src.fat_saturated_g,
            fibre_g=src.fibre_g,
            sodium_mg=src.sodium_mg,
            calcium_mg=src.calcium_mg,
            iron_mg=src.iron_mg,
            potassium_mg=src.potassium_mg,
            nutrient_snapshot_json=src.nutrient_snapshot_json,
            missing_nutrient_codes=src.missing_nutrient_codes,
            completeness_pct=src.completeness_pct,
            source_citation=src.source_citation,
            notes=f"Copied from {source_date}",
        )
        db.add(clone)
        copied_count += 1
    db.commit()
    return {
        "copied_count": copied_count,
        "daily_summary": get_daily_tracker_summary(db, hh, member, target_date),
    }


@ecosystem_router.post("/tracker/meal-templates", tags=["Daily Tracker"])
def create_meal_template_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    name = str(payload.get("name") or "Saved Meal Template").strip()[:160]
    meal_category = str(payload.get("meal_category") or "breakfast")
    source_date = payload.get("source_date") or today_iso_str()
    items = payload.get("items")

    if not items:
        entries = (
            db.query(DailyFoodLogEntry)
            .filter(
                DailyFoodLogEntry.member_id == member.id,
                DailyFoodLogEntry.logged_date == source_date,
                DailyFoodLogEntry.meal_category == meal_category,
            )
            .all()
        )
        items = [
            {
                "food_slug": e.food_slug,
                "recipe_id": e.recipe_id,
                "food_name": e.food_name,
                "quantity": e.quantity,
                "unit_name": e.unit_name,
                "meal_category": e.meal_category,
            }
            for e in entries
        ]

    tmpl = SavedMealTemplate(
        household_id=hh.id,
        member_id=member.id,
        name=name,
        meal_category=meal_category,
        items_json=items or [],
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return {
        "id": tmpl.id,
        "name": tmpl.name,
        "meal_category": tmpl.meal_category,
        "items": tmpl.items_json,
    }


@ecosystem_router.post("/tracker/meal-templates/{template_id}/apply", tags=["Daily Tracker"])
def apply_meal_template_endpoint(
    template_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    tmpl = (
        db.query(SavedMealTemplate)
        .filter(
            SavedMealTemplate.id == template_id,
            SavedMealTemplate.household_id == hh.id,
        )
        .first()
    )
    if not tmpl:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Meal template not found."
        )

    target_date = str(payload.get("target_date") or today_iso_str())
    for item in tmpl.items_json or []:
        create_daily_food_log_entry(
            db,
            hh,
            member,
            {
                "logged_date": target_date,
                "meal_category": payload.get("meal_category") or tmpl.meal_category,
                "food_slug": item.get("food_slug"),
                "recipe_id": item.get("recipe_id"),
                "food_name": item.get("food_name"),
                "quantity": item.get("quantity", 1.0),
                "unit_name": item.get("unit_name", "standard_serving"),
            },
        )
    return get_daily_tracker_summary(db, hh, member, target_date)


# ==========================================
# MODULE C — WATER & HYDRATION TRACKER
# ==========================================
@ecosystem_router.get("/hydration/daily", tags=["Hydration Tracker"])
def get_hydration_daily_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    date: Annotated[str | None, Query()] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_daily_hydration_summary(db, hh, member, date_str=date)


@ecosystem_router.post("/hydration/logs", tags=["Hydration Tracker"])
def add_water_log_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    amount_ml = int(payload.get("amount_ml") or 250)
    if amount_ml <= 0 or amount_ml > 5000:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Water amount must be between 1 ml and 5000 ml.",
        )
    logged_date = str(payload.get("logged_date") or today_iso_str())
    logged_time = str(
        payload.get("logged_time") or datetime.now(UTC).strftime("%H:%M")
    )
    container = str(payload.get("container_type") or "large_glass")

    log = WaterIntakeLog(
        household_id=hh.id,
        member_id=member.id,
        logged_date=logged_date,
        logged_time=logged_time,
        amount_ml=amount_ml,
        container_type=container,
        notes=payload.get("notes"),
    )
    db.add(log)
    db.commit()
    return get_daily_hydration_summary(db, hh, member, date_str=logged_date)


@ecosystem_router.put("/hydration/logs/{log_id}", tags=["Hydration Tracker"])
def update_water_log_endpoint(
    log_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    log = (
        db.query(WaterIntakeLog)
        .filter(
            WaterIntakeLog.id == log_id,
            WaterIntakeLog.household_id == hh.id,
        )
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Water entry not found."
        )
    if "amount_ml" in payload:
        log.amount_ml = max(1, int(payload["amount_ml"]))
    if "container_type" in payload:
        log.container_type = str(payload["container_type"])
    if "logged_time" in payload and payload["logged_time"]:
        log.logged_time = str(payload["logged_time"])
    db.commit()
    _, member = _resolve_owned_member(db, current_user, member_id=log.member_id)
    return get_daily_hydration_summary(db, hh, member, date_str=log.logged_date)


@ecosystem_router.delete("/hydration/logs/{log_id}", tags=["Hydration Tracker"])
def delete_water_log_endpoint(
    log_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    log = (
        db.query(WaterIntakeLog)
        .filter(
            WaterIntakeLog.id == log_id,
            WaterIntakeLog.household_id == hh.id,
        )
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Water entry not found."
        )
    m_id = log.member_id
    l_date = log.logged_date
    db.delete(log)
    db.commit()
    _, member = _resolve_owned_member(db, current_user, member_id=m_id)
    return get_daily_hydration_summary(db, hh, member, date_str=l_date)


@ecosystem_router.put("/hydration/settings", tags=["Hydration Tracker"])
def update_hydration_settings_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    setting = get_or_create_hydration_setting(db, member)
    if "daily_goal_ml" in payload and payload["daily_goal_ml"] is not None:
        setting.daily_goal_ml = max(250, min(8000, int(payload["daily_goal_ml"])))
    for field in (
        "preferred_container",
        "reminders_enabled",
        "reminder_interval_minutes",
        "reminder_start_time",
        "reminder_end_time",
        "quiet_hours_start",
        "quiet_hours_end",
    ):
        if field in payload:
            setattr(setting, field, payload[field])
    db.commit()
    return get_daily_hydration_summary(db, hh, member)


# ==========================================
# MODULE D — GOALS, HABITS & PROGRESS TRACKER
# ==========================================
@ecosystem_router.get("/fitness/goals", tags=["Fitness & Goals"])
def list_fitness_goals_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    goals = (
        db.query(FitnessGoal)
        .filter(FitnessGoal.member_id == member.id)
        .order_by(FitnessGoal.id.desc())
        .all()
    )
    if not goals:
        # Seed 2 gentle starter goals so the user can edit or track immediately
        f_prof = get_or_create_fitness_profile(db, member)
        prot_target = f_prof["computed_targets"]["protein_g"] or 65.0
        starter_1 = FitnessGoal(
            member_id=member.id,
            goal_name="Reach Daily Protein Target",
            goal_type="protein_intake",
            start_date=today_iso_str(),
            target_value=float(prot_target),
            current_value=0.0,
            unit="g / day",
            tracking_frequency="daily",
            status="active",
        )
        starter_2 = FitnessGoal(
            member_id=member.id,
            goal_name="Consistent Daily Hydration",
            goal_type="water_habit",
            start_date=today_iso_str(),
            target_value=2250.0,
            current_value=0.0,
            unit="ml / day",
            tracking_frequency="daily",
            status="active",
        )
        db.add_all([starter_1, starter_2])
        db.commit()
        goals = [starter_1, starter_2]

    # Sync live progress for today's protein/water/energy goals if available
    today_summary = get_daily_tracker_summary(db, hh, member, today_iso_str())
    today_tots = today_summary["daily_nutrition"]["totals"]
    today_water = today_summary["hydration"]["total_ml"]

    goals_out = []
    for g in goals:
        cur_val = g.current_value
        if g.goal_type == "protein_intake" and today_tots.get("protein_g") is not None:
            cur_val = float(today_tots["protein_g"] or 0.0)
        elif g.goal_type == "energy_intake" and today_tots.get("energy_kcal") is not None:
            cur_val = float(today_tots["energy_kcal"] or 0.0)
        elif g.goal_type == "fiber_intake" and today_tots.get("fibre_g") is not None:
            cur_val = float(today_tots["fibre_g"] or 0.0)
        elif g.goal_type == "water_habit" and today_water > 0:
            cur_val = float(today_water)

        pct = (
            round(min(100.0, (cur_val / g.target_value) * 100.0), 1)
            if g.target_value > 0
            else 0.0
        )
        goals_out.append(
            {
                "id": g.id,
                "member_id": g.member_id,
                "goal_name": g.goal_name,
                "goal_type": g.goal_type,
                "start_date": g.start_date,
                "target_date": g.target_date,
                "target_value": g.target_value,
                "current_value": cur_val,
                "progress_pct": pct,
                "unit": g.unit,
                "tracking_frequency": g.tracking_frequency,
                "status": g.status,
                "notes": g.notes,
            }
        )
    return goals_out


@ecosystem_router.post("/fitness/goals", tags=["Fitness & Goals"])
def create_fitness_goal_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    _hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    goal = FitnessGoal(
        member_id=member.id,
        goal_name=str(payload.get("goal_name") or "Personal Nutrition Goal")[:160],
        goal_type=str(payload.get("goal_type") or "custom"),
        start_date=str(payload.get("start_date") or today_iso_str()),
        target_date=payload.get("target_date"),
        target_value=float(payload.get("target_value") or 100.0),
        current_value=float(payload.get("current_value") or 0.0),
        unit=str(payload.get("unit") or "units"),
        tracking_frequency=str(payload.get("tracking_frequency") or "daily"),
        status=str(payload.get("status") or "active"),
        notes=payload.get("notes"),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return list_fitness_goals_endpoint(db, current_user, member_id=member.id)


@ecosystem_router.put("/fitness/goals/{goal_id}", tags=["Fitness & Goals"])
def update_fitness_goal_endpoint(
    goal_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    goal = (
        db.query(FitnessGoal)
        .join(HouseholdMember, FitnessGoal.member_id == HouseholdMember.id)
        .filter(FitnessGoal.id == goal_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found."
        )
    for field in (
        "goal_name",
        "goal_type",
        "target_date",
        "target_value",
        "current_value",
        "unit",
        "tracking_frequency",
        "status",
        "notes",
    ):
        if field in payload and payload[field] is not None:
            setattr(goal, field, payload[field])
    db.commit()
    return list_fitness_goals_endpoint(db, current_user, member_id=goal.member_id)


@ecosystem_router.delete("/fitness/goals/{goal_id}", tags=["Fitness & Goals"])
def delete_fitness_goal_endpoint(
    goal_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    goal = (
        db.query(FitnessGoal)
        .join(HouseholdMember, FitnessGoal.member_id == HouseholdMember.id)
        .filter(FitnessGoal.id == goal_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not goal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Goal not found."
        )
    m_id = goal.member_id
    db.delete(goal)
    db.commit()
    return list_fitness_goals_endpoint(db, current_user, member_id=m_id)


@ecosystem_router.get("/fitness/habits", tags=["Fitness & Goals"])
def list_habits_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    date: Annotated[str | None, Query()] = None,
):
    _hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    target_date = date or today_iso_str()
    habits = (
        db.query(HabitDefinition)
        .options(joinedload(HabitDefinition.completions))
        .filter(HabitDefinition.member_id == member.id)
        .order_by(HabitDefinition.id.asc())
        .all()
    )
    if not habits:
        default_habits = [
            ("Drink water regularly throughout the day", "hydration", "daily", "09:00"),
            ("Log home-cooked breakfast & lunch", "nutrition", "daily", "13:00"),
            ("Include a protein-rich pulse, curd, or paneer portion", "nutrition", "daily", "19:30"),
            ("Complete planned movement or workout session", "training", "training_days", "07:00"),
        ]
        habits = []
        for title, cat, freq, rem in default_habits:
            h = HabitDefinition(
                member_id=member.id,
                title=title,
                category=cat,
                frequency=freq,
                reminder_time=rem,
                is_active=True,
            )
            db.add(h)
            habits.append(h)
        db.commit()
        for h in habits:
            db.refresh(h)

    base_dt = datetime.strptime(target_date, "%Y-%m-%d")
    last_7_dates = [
        (base_dt - timedelta(days=offset)).strftime("%Y-%m-%d")
        for offset in range(6, -1, -1)
    ]

    def _habit_dedup_key(h_obj: HabitDefinition) -> str:
        t_norm = (h_obj.title or "").strip().lower()
        m_norm = (h_obj.tracking_method or "").strip().lower()
        c_norm = (h_obj.category or "").strip().lower()
        if m_norm == "water_tracker" or c_norm == "hydration" or "drink water" in t_norm or "record water" in t_norm:
            return "core_intent::hydration_water"
        if m_norm == "food_diary" or "breakfast" in t_norm:
            return "core_intent::breakfast_logging"
        return f"title::{t_norm}"

    grouped_habits: dict[str, list[HabitDefinition]] = {}
    for h in habits:
        key = _habit_dedup_key(h) if h.is_active else f"inactive::{h.id}"
        grouped_habits.setdefault(key, []).append(h)

    out = []
    for _key, h_group in grouped_habits.items():
        primary_h = sorted(
            h_group,
            key=lambda x: (1 if x.ai_plan_id else 0, len(x.completions or []), x.id),
            reverse=True,
        )[0]
        comp_dates: set[str] = set()
        for member_h in h_group:
            for c in member_h.completions or []:
                if c.completed:
                    comp_dates.add(c.logged_date)

        weekly_days = [
            {"date": d_s, "completed": d_s in comp_dates} for d_s in last_7_dates
        ]
        completed_7d = sum(1 for d in weekly_days if d["completed"])
        out.append(
            {
                "id": primary_h.id,
                "member_id": primary_h.member_id,
                "title": primary_h.title,
                "description": primary_h.description,
                "category": primary_h.category,
                "frequency": primary_h.frequency,
                "reminder_time": primary_h.reminder_time,
                "schedule_metadata": primary_h.schedule_metadata_json or {},
                "tracking_method": primary_h.tracking_method or "manual_check",
                "completion_criteria": primary_h.completion_criteria,
                "ai_plan_id": primary_h.ai_plan_id,
                "user_approved_at": primary_h.user_approved_at.isoformat()
                if primary_h.user_approved_at
                else None,
                "is_active": primary_h.is_active,
                "completed_on_date": target_date in comp_dates,
                "completed_days_last_7": completed_7d,
                "weekly_consistency_pct": round((completed_7d / 7.0) * 100.0, 1),
                "weekly_days": weekly_days,
                "completed_dates": sorted(list(comp_dates)),
            }
        )
    out.sort(key=lambda item: item["id"])
    return out


@ecosystem_router.post("/fitness/habits", tags=["Fitness & Goals"])
def create_habit_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    _hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    h = HabitDefinition(
        member_id=member.id,
        title=str(payload.get("title") or "Healthy Daily Habit")[:160],
        description=payload.get("description"),
        category=str(payload.get("category") or "nutrition"),
        frequency=str(payload.get("frequency") or "daily"),
        reminder_time=payload.get("reminder_time"),
        schedule_metadata_json=payload.get("schedule_metadata") or {},
        tracking_method=str(payload.get("tracking_method") or "manual_check"),
        completion_criteria=payload.get("completion_criteria"),
        is_active=True,
    )
    db.add(h)
    db.commit()
    return list_habits_endpoint(db, current_user, member_id=member.id)


@ecosystem_router.post("/fitness/habits/{habit_id}/toggle", tags=["Fitness & Goals"])
def toggle_habit_completion_endpoint(
    habit_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    habit = (
        db.query(HabitDefinition)
        .join(HouseholdMember, HabitDefinition.member_id == HouseholdMember.id)
        .filter(HabitDefinition.id == habit_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not habit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found."
        )
    target_date = str(payload.get("date") or today_iso_str())
    existing = (
        db.query(HabitCompletionLog)
        .filter(
            HabitCompletionLog.habit_id == habit.id,
            HabitCompletionLog.logged_date == target_date,
        )
        .first()
    )
    if existing:
        if "completed" in payload:
            existing.completed = bool(payload["completed"])
        else:
            existing.completed = not existing.completed
        if not existing.completed:
            db.delete(existing)
    else:
        db.add(
            HabitCompletionLog(
                habit_id=habit.id,
                member_id=habit.member_id,
                logged_date=target_date,
                completed=True,
            )
        )
    db.commit()
    return list_habits_endpoint(
        db, current_user, member_id=habit.member_id, date=target_date
    )


@ecosystem_router.put("/fitness/habits/{habit_id}", tags=["Fitness & Goals"])
def update_habit_endpoint(
    habit_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    habit = (
        db.query(HabitDefinition)
        .join(HouseholdMember, HabitDefinition.member_id == HouseholdMember.id)
        .filter(HabitDefinition.id == habit_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not habit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found."
        )
    for field in ("title", "description", "category", "frequency", "reminder_time", "is_active"):
        if field in payload:
            setattr(habit, field, payload[field])
    db.commit()
    return list_habits_endpoint(db, current_user, member_id=habit.member_id)


@ecosystem_router.delete("/fitness/habits/{habit_id}", tags=["Fitness & Goals"])
def delete_habit_endpoint(
    habit_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    habit = (
        db.query(HabitDefinition)
        .join(HouseholdMember, HabitDefinition.member_id == HouseholdMember.id)
        .filter(HabitDefinition.id == habit_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not habit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Habit not found."
        )
    m_id = habit.member_id
    db.delete(habit)
    db.commit()
    return list_habits_endpoint(db, current_user, member_id=m_id)


@ecosystem_router.get("/fitness/measurements", tags=["Fitness & Goals"])
def list_measurements_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    _hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    logs = (
        db.query(BodyMeasurementLog)
        .filter(BodyMeasurementLog.member_id == member.id)
        .order_by(BodyMeasurementLog.logged_date.desc(), BodyMeasurementLog.id.desc())
        .all()
    )
    return [
        {
            "id": m.id,
            "member_id": m.member_id,
            "logged_date": m.logged_date,
            "weight_kg": m.weight_kg,
            "waist_cm": m.waist_cm,
            "chest_cm": m.chest_cm,
            "arm_cm": m.arm_cm,
            "hip_cm": m.hip_cm,
            "workout_completed": m.workout_completed,
            "milestone_note": m.milestone_note,
        }
        for m in logs
    ]


@ecosystem_router.post("/fitness/measurements", tags=["Fitness & Goals"])
def add_measurement_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    _hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    log = BodyMeasurementLog(
        member_id=member.id,
        logged_date=str(payload.get("logged_date") or today_iso_str()),
        weight_kg=float(payload["weight_kg"])
        if payload.get("weight_kg") not in (None, "")
        else None,
        waist_cm=float(payload["waist_cm"])
        if payload.get("waist_cm") not in (None, "")
        else None,
        chest_cm=float(payload["chest_cm"])
        if payload.get("chest_cm") not in (None, "")
        else None,
        arm_cm=float(payload["arm_cm"])
        if payload.get("arm_cm") not in (None, "")
        else None,
        hip_cm=float(payload["hip_cm"])
        if payload.get("hip_cm") not in (None, "")
        else None,
        workout_completed=bool(payload.get("workout_completed", False)),
        milestone_note=payload.get("milestone_note"),
    )
    db.add(log)
    if log.weight_kg is not None:
        get_or_create_fitness_profile(db, member)
        prof = (
            db.query(MemberFitnessProfile)
            .filter(MemberFitnessProfile.member_id == member.id)
            .first()
        )
        if prof:
            prof.current_weight_kg = log.weight_kg
    db.commit()
    return list_measurements_endpoint(db, current_user, member_id=member.id)


# ==========================================
# MODULE E — DAILY, WEEKLY & MONTHLY ANALYTICS
# ==========================================
@ecosystem_router.get("/analytics/overview", tags=["Visual Analytics"])
def get_analytics_overview_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    end_date: Annotated[str | None, Query()] = None,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_analytics_overview(db, hh, member, end_date_str=end_date, days=days)


# ==========================================
# MODULES F & N — RECIPE DISCOVERY, GENERATOR & RECOMMENDATIONS
# ==========================================
@ecosystem_router.get("/recipes/discover", tags=["Recipes & Discovery"])
def discover_recipes_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    q: Annotated[str | None, Query()] = None,
    meal_type: Annotated[str | None, Query()] = None,
    dietary_preference: Annotated[str | None, Query()] = None,
    fitness_goal: Annotated[str | None, Query()] = None,
    max_cost_inr: Annotated[float | None, Query()] = None,
    include_online: Annotated[bool, Query()] = False,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return discover_and_recommend_recipes(
        db,
        hh,
        member=member,
        query=q,
        meal_type=meal_type,
        dietary_preference=dietary_preference,
        fitness_goal=fitness_goal,
        max_cost_inr=max_cost_inr,
        include_online=include_online,
    )


@ecosystem_router.post("/recipes/generate", tags=["Recipes & Discovery"])
def generate_personal_recipe_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    return generate_personal_recipe_from_db_ingredients(db, hh, member, payload)


# ==========================================
# MODULES G & H — SMART PANTRY, GROCERY LIST & RETAILER LINKS
# ==========================================
@ecosystem_router.get("/pantry", tags=["Pantry & Smart Grocery"])
def list_pantry_items_endpoint(
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    items = (
        db.query(PantryItem)
        .filter(PantryItem.household_id == hh.id)
        .order_by(PantryItem.in_stock.desc(), PantryItem.id.desc())
        .all()
    )
    return [
        {
            "id": p.id,
            "food_slug": p.food_slug,
            "ingredient_name": p.ingredient_name,
            "category_name": p.category_name,
            "available_quantity": p.available_quantity,
            "unit_name": p.unit_name,
            "grams_available": p.grams_available,
            "in_stock": p.in_stock,
            "expiry_date": p.expiry_date,
        }
        for p in items
    ]


@ecosystem_router.post("/pantry", tags=["Pantry & Smart Grocery"])
def add_pantry_item_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    food_slug = payload.get("food_slug")
    food = (
        db.query(FoodItem)
        .options(joinedload(FoodItem.category))
        .filter(FoodItem.slug == str(food_slug))
        .first()
        if food_slug
        else None
    )
    ing_name = (
        food.name_en
        if food
        else str(payload.get("ingredient_name") or "Pantry Ingredient").strip()
    )
    cat_name = (
        food.category.name
        if (food and food.category)
        else str(payload.get("category_name") or "Pantry Staple")
    )
    qty = float(payload.get("available_quantity") or 500.0)
    unit = str(payload.get("unit_name") or "g")
    grams = float(
        payload.get("grams_available")
        or (qty * 1000.0 if unit == "kg" else qty)
    )

    existing = (
        db.query(PantryItem)
        .filter(
            PantryItem.household_id == hh.id,
            (PantryItem.food_slug == food_slug)
            if food_slug
            else (PantryItem.ingredient_name == ing_name),
        )
        .first()
    )
    if existing:
        existing.available_quantity = qty
        existing.unit_name = unit
        existing.grams_available = grams
        existing.in_stock = bool(payload.get("in_stock", True))
        existing.expiry_date = payload.get("expiry_date")
    else:
        db.add(
            PantryItem(
                household_id=hh.id,
                food_id=food.id if food else None,
                food_slug=food.slug if food else None,
                ingredient_name=ing_name,
                category_name=cat_name,
                available_quantity=qty,
                unit_name=unit,
                grams_available=grams,
                in_stock=bool(payload.get("in_stock", True)),
                expiry_date=payload.get("expiry_date"),
            )
        )
    db.commit()
    return list_pantry_items_endpoint(db, current_user)


@ecosystem_router.delete("/pantry/{item_id}", tags=["Pantry & Smart Grocery"])
def delete_pantry_item_endpoint(
    item_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    item = (
        db.query(PantryItem)
        .filter(PantryItem.id == item_id, PantryItem.household_id == hh.id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Pantry item not found."
        )
    db.delete(item)
    db.commit()
    return list_pantry_items_endpoint(db, current_user)


@ecosystem_router.get("/shopping-lists", tags=["Pantry & Smart Grocery"])
def get_shopping_list_endpoint(
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    return get_household_shopping_list(db, hh)


@ecosystem_router.put("/shopping-lists/settings", tags=["Pantry & Smart Grocery"])
def update_shopping_list_settings_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    s_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.household_id == hh.id)
        .order_by(ShoppingList.id.asc())
        .first()
    )
    if not s_list:
        s_list = ShoppingList(household_id=hh.id)
        db.add(s_list)
        db.flush()
    if "delivery_pincode" in payload:
        s_list.delivery_pincode = str(payload["delivery_pincode"] or "").strip()[:12] or None
    if "location_consent_given" in payload:
        s_list.location_consent_given = bool(payload["location_consent_given"])
    db.commit()
    return get_household_shopping_list(db, hh)


@ecosystem_router.post("/shopping-lists/from-recipe", tags=["Pantry & Smart Grocery"])
def create_shopping_list_from_recipe_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    recipe_ids = payload.get("recipe_ids") or (
        [payload["recipe_id"]] if payload.get("recipe_id") is not None else []
    )
    if not recipe_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide 'recipe_id' or 'recipe_ids'.",
        )
    mult = float(payload.get("serving_multiplier") or 1.0)
    subtract_pantry = bool(payload.get("subtract_pantry", True))
    return add_recipe_ingredients_to_shopping_list(
        db,
        hh,
        recipe_ids=[int(r) for r in recipe_ids],
        serving_multiplier=mult,
        subtract_pantry=subtract_pantry,
    )


@ecosystem_router.post("/shopping-lists/items", tags=["Pantry & Smart Grocery"])
def add_manual_shopping_item_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    s_list = (
        db.query(ShoppingList)
        .filter(ShoppingList.household_id == hh.id)
        .order_by(ShoppingList.id.asc())
        .first()
    )
    if not s_list:
        s_list = ShoppingList(household_id=hh.id)
        db.add(s_list)
        db.flush()

    ing_name = str(payload.get("ingredient_name") or "").strip()
    if not ing_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'ingredient_name' is required.",
        )
    qty = float(payload.get("quantity") or 250.0)
    unit = str(payload.get("unit_name") or "g")
    grams = float(payload.get("grams_needed") or qty)
    recipe_tag = payload.get("related_recipe")

    existing = (
        db.query(ShoppingListItem)
        .filter(
            ShoppingListItem.shopping_list_id == s_list.id,
            ShoppingListItem.ingredient_name.ilike(ing_name),
            ShoppingListItem.is_purchased.is_(False),
        )
        .first()
    )
    if existing:
        existing.quantity = round(existing.quantity + qty, 1)
        existing.grams_needed = round(existing.grams_needed + grams, 1)
        if recipe_tag:
            rel = list(existing.related_recipes or [])
            if recipe_tag not in rel:
                rel.append(str(recipe_tag))
            existing.related_recipes = rel
    else:
        db.add(
            ShoppingListItem(
                shopping_list_id=s_list.id,
                food_slug=payload.get("food_slug"),
                ingredient_name=ing_name,
                food_category=str(payload.get("food_category") or "Groceries"),
                quantity=qty,
                unit_name=unit,
                grams_needed=grams,
                estimated_price_inr=payload.get("estimated_price_inr"),
                related_recipes=[str(recipe_tag)] if recipe_tag else [],
                is_purchased=False,
            )
        )
    db.commit()
    return get_household_shopping_list(db, hh)


@ecosystem_router.put("/shopping-lists/items/{item_id}", tags=["Pantry & Smart Grocery"])
def update_shopping_item_endpoint(
    item_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    item = (
        db.query(ShoppingListItem)
        .join(ShoppingList, ShoppingListItem.shopping_list_id == ShoppingList.id)
        .filter(ShoppingListItem.id == item_id, ShoppingList.household_id == hh.id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping list item not found.",
        )
    if "quantity" in payload and payload["quantity"] is not None:
        item.quantity = float(payload["quantity"])
        item.grams_needed = float(payload.get("grams_needed") or payload["quantity"])
    if "unit_name" in payload and payload["unit_name"]:
        item.unit_name = str(payload["unit_name"])
    if "is_purchased" in payload:
        item.is_purchased = bool(payload["is_purchased"])
    db.commit()
    return get_household_shopping_list(db, hh)


@ecosystem_router.delete("/shopping-lists/items/{item_id}", tags=["Pantry & Smart Grocery"])
def delete_shopping_item_endpoint(
    item_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    item = (
        db.query(ShoppingListItem)
        .join(ShoppingList, ShoppingListItem.shopping_list_id == ShoppingList.id)
        .filter(ShoppingListItem.id == item_id, ShoppingList.household_id == hh.id)
        .first()
    )
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shopping list item not found.",
        )
    db.delete(item)
    db.commit()
    return get_household_shopping_list(db, hh)


# ==========================================
# MODULE I — INDIAN PROTEIN & BUDGET INTELLIGENCE
# ==========================================
@ecosystem_router.get("/protein-intelligence", tags=["Signature Intelligence"])
def get_protein_intelligence_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    dietary_filter: Annotated[str | None, Query()] = None,
    max_cost_per_10g_protein: Annotated[float | None, Query()] = None,
):
    hh = ensure_user_owned_household(db, current_user)
    return get_indian_protein_intelligence(
        db,
        hh,
        dietary_filter=dietary_filter,
        max_cost_per_10g_protein=max_cost_per_10g_protein,
    )


@ecosystem_router.post("/protein-intelligence/prices", tags=["Signature Intelligence"])
def save_local_food_price_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    food_slug = str(payload.get("food_slug") or "").strip()
    price_100g = float(payload.get("price_inr_per_100g") or 0.0)
    if not food_slug or price_100g <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Valid 'food_slug' and positive 'price_inr_per_100g' are required.",
        )

    existing = (
        db.query(LocalFoodPrice)
        .filter(
            LocalFoodPrice.household_id == hh.id,
            LocalFoodPrice.food_slug == food_slug,
        )
        .first()
    )
    if existing:
        existing.price_inr_per_100g = price_100g
        existing.package_label = payload.get("package_label")
    else:
        db.add(
            LocalFoodPrice(
                household_id=hh.id,
                food_slug=food_slug,
                price_inr_per_100g=price_100g,
                package_label=payload.get("package_label"),
            )
        )
    db.commit()
    return get_indian_protein_intelligence(db, hh)


# ==========================================
# MODULE J — SMART MESS & CANTEEN ANALYZER
# ==========================================
@ecosystem_router.post("/mess-analyzer/analyze", tags=["Signature Intelligence"])
def analyze_mess_menu_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    raw_text = str(payload.get("raw_menu_text") or "").strip()
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide 'raw_menu_text' (e.g., 'Idli, Sambar, Rice, Dal, Curd, Paneer').",
        )
    return analyze_mess_or_canteen_menu(
        db,
        hh,
        raw_menu_text=raw_text,
        save_title=payload.get("save_title"),
        institution_name=payload.get("institution_or_canteen"),
    )


@ecosystem_router.get("/mess-analyzer/menus", tags=["Signature Intelligence"])
def list_saved_mess_menus_endpoint(
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    menus = (
        db.query(MessMenuRecord)
        .filter(MessMenuRecord.household_id == hh.id)
        .order_by(MessMenuRecord.id.desc())
        .all()
    )
    return [
        {
            "id": m.id,
            "title": m.title,
            "institution_or_canteen": m.institution_or_canteen,
            "raw_menu_text": m.raw_menu_text,
            "matched_dishes": m.matched_dishes_json or [],
            "created_at": m.created_at.isoformat(),
        }
        for m in menus
    ]


@ecosystem_router.post("/mess-analyzer/log-plate", tags=["Signature Intelligence"])
def log_mess_plate_to_daily_tracker_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    food_slugs: list[str] = payload.get("food_slugs") or []
    meal_category = str(payload.get("meal_category") or "lunch")
    logged_date = str(payload.get("logged_date") or today_iso_str())

    logged_entries = []
    for slug in food_slugs:
        entry = create_daily_food_log_entry(
            db,
            hh,
            member,
            {
                "logged_date": logged_date,
                "meal_category": meal_category,
                "food_slug": slug,
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "entry_source_type": "mess_analyzer",
                "notes": "Logged via Smart Mess & Canteen Analyzer",
            },
        )
        logged_entries.append(serialize_food_log_entry(entry))

    return {
        "logged_count": len(logged_entries),
        "entries": logged_entries,
        "daily_summary": get_daily_tracker_summary(db, hh, member, logged_date),
    }


# ==========================================
# MODULE K — ONE FAMILY MEAL, MULTIPLE NUTRITION GOALS
# ==========================================
@ecosystem_router.post("/family-meals/plan", tags=["Signature Intelligence"])
def build_family_meal_plan_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    recipe_id = payload.get("recipe_id")
    if recipe_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'recipe_id' is required.",
        )
    try:
        return build_family_meal_personalisation_plan(
            db,
            hh,
            recipe_id=int(recipe_id),
            member_servings=payload.get("member_servings"),
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@ecosystem_router.post("/family-meals/log", tags=["Signature Intelligence"])
def log_family_meal_for_member_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    recipe_id = payload.get("recipe_id")
    if recipe_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'recipe_id' is required.",
        )
    servings = float(payload.get("servings") or 1.0)
    meal_category = str(payload.get("meal_category") or "lunch")
    logged_date = str(payload.get("logged_date") or today_iso_str())

    entry = create_daily_food_log_entry(
        db,
        hh,
        member,
        {
            "logged_date": logged_date,
            "meal_category": meal_category,
            "recipe_id": int(recipe_id),
            "quantity": servings,
            "unit_name": "serving",
            "entry_source_type": "family_meal",
            "notes": f"Shared Family Meal ({servings}× portion)",
        },
    )
    return {
        "entry": serialize_food_log_entry(entry),
        "daily_summary": get_daily_tracker_summary(db, hh, member, logged_date),
    }


# ==========================================
# MODULE L — SUPPLEMENT & PACKAGED PRODUCT INTELLIGENCE
# ==========================================
@ecosystem_router.get("/supplements/intelligence", tags=["Signature Intelligence"])
def get_supplement_and_packaged_intelligence_endpoint(
    db: DbSession,
    current_user: CurrentUser,
):
    """
    Returns packaged foods and supplements alongside whole-food Indian protein alternatives
    and neutral educational explanations of common supplement/label terminology.
    """
    hh = ensure_user_owned_household(db, current_user)
    packaged = (
        db.query(FoodItem)
        .options(joinedload(FoodItem.source), joinedload(FoodItem.nutrient_values))
        .filter(FoodItem.is_packaged.is_(True))
        .all()
    )
    packaged_out = []
    for p in packaged:
        nut_map = {nv.nutrient_code: nv.value for nv in p.nutrient_values}
        missing = [nv.nutrient_code for nv in p.nutrient_values if nv.value is None]
        packaged_out.append(
            {
                "slug": p.slug,
                "name_en": p.name_en,
                "brand": p.brand,
                "barcode": p.barcode,
                "image_url": p.image_url,
                "standard_serving_name": p.standard_serving_name,
                "standard_serving_grams": p.standard_serving_grams,
                "ingredients_text": p.cleaned_ingredients_text or p.ingredients_text,
                "allergen_tags": p.allergen_tags or [],
                "nutrients_per_100": {
                    "energy_kcal": nut_map.get("energy_kcal"),
                    "protein_g": nut_map.get("protein_g"),
                    "carbs_g": nut_map.get("carbs_g"),
                    "sugars_total_g": nut_map.get("sugars_total_g"),
                    "sugars_added_g": nut_map.get("sugars_added_g"),
                    "fat_total_g": nut_map.get("fat_total_g"),
                    "sodium_mg": nut_map.get("sodium_mg"),
                },
                "missing_nutrient_count": len(missing),
                "source_name": p.source.name if p.source else "Label Declared",
            }
        )

    whole_food_intel = get_indian_protein_intelligence(db, hh)
    return {
        "packaged_items": packaged_out,
        "whole_food_protein_alternatives": whole_food_intel["items"][:8],
        "label_terminology_guide": [
            {
                "term": "Whey Protein Concentrate vs. Isolate",
                "explanation": "Concentrate retains small amounts of milk lactose and fat (~70–80% protein by weight), whereas Isolate undergoes additional filtration to reduce lactose (~85–90% protein). Neither is mandatory if daily protein needs are met through dal, curd, paneer, soya, eggs, or fish.",
            },
            {
                "term": "No Added Sugar vs. Zero Sugar",
                "explanation": "'No Added Sugar' means no sucrose/glucose syrup was added during processing, but the product may still contain natural sugars (e.g., lactose or fruit sugars) or polyols/sweeteners (INS 955, INS 960).",
            },
            {
                "term": "Electrolyte / ORS Beverages vs. High-Sugar Sports Drinks",
                "explanation": "WHO-formula Oral Rehydration Salts (ORS) have a specific osmolarity of sodium, potassium, and glucose for dehydration recovery, whereas commercial fruit/energy drinks often contain high added sugar and are not equivalent to clinical ORS.",
            },
            {
                "term": "Proprietary Blends & Amino Spiking",
                "explanation": "Check the back-of-pack ingredient list and per-serving protein declaration rather than front-of-pack marketing badges. Free-form amino acids (glycine, taurine) added to inflate nitrogen tests do not equal complete dietary protein.",
            },
        ],
        "neutrality_disclaimer": (
            "GharPlate does not endorse any supplement brand or claim that packaged supplements are necessary. "
            "Individuals with kidney, liver, or metabolic conditions should consult a physician before using concentrated protein or electrolyte supplements."
        ),
    }


# ==========================================
# PART 2, 3, 4 & 5 — BLOOD PRESSURE, BLOOD GLUCOSE & HEALTH MEASUREMENTS
# ==========================================
@ecosystem_router.get("/health/blood-pressure", tags=["Health Measurements"])
def get_blood_pressure_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
    end_date: Annotated[str | None, Query()] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_blood_pressure_dashboard(db, hh, member, days=days, end_date_str=end_date)


@ecosystem_router.post("/health/blood-pressure", tags=["Health Measurements"])
def add_blood_pressure_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        log = create_blood_pressure_log(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    target_obj = get_member_clinician_target(db, member.id, "blood_pressure")
    return {
        "entry": serialize_bp_log(
            log,
            target_obj.target_details_json if target_obj else None,
            age_group=member.age_group,
        ),
        "dashboard": get_blood_pressure_dashboard(db, hh, member),
    }


@ecosystem_router.put("/health/blood-pressure/{reading_id}", tags=["Health Measurements"])
def update_blood_pressure_endpoint(
    reading_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    log = (
        db.query(BloodPressureLog)
        .filter(
            BloodPressureLog.id == reading_id,
            BloodPressureLog.household_id == hh.id,
        )
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood pressure reading not found.",
        )

    if "systolic_mmhg" in payload and payload["systolic_mmhg"] is not None:
        log.systolic_mmhg = int(payload["systolic_mmhg"])
    if "diastolic_mmhg" in payload and payload["diastolic_mmhg"] is not None:
        log.diastolic_mmhg = int(payload["diastolic_mmhg"])
    if not (50 <= log.systolic_mmhg <= 260) or not (30 <= log.diastolic_mmhg <= 180) or log.systolic_mmhg <= log.diastolic_mmhg:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid systolic/diastolic values.",
        )
    if "pulse_bpm" in payload:
        log.pulse_bpm = int(payload["pulse_bpm"]) if payload["pulse_bpm"] not in (None, "") else None
    for field in (
        "logged_date",
        "logged_time",
        "time_of_day",
        "measurement_arm",
        "measurement_position",
        "reading_sequence",
        "device_type",
        "notes",
    ):
        if field in payload:
            setattr(log, field, payload[field])
    db.commit()
    db.refresh(log)
    _, member = _resolve_owned_member(db, current_user, member_id=log.member_id)
    target_obj = get_member_clinician_target(db, member.id, "blood_pressure")
    return {
        "entry": serialize_bp_log(
            log,
            target_obj.target_details_json if target_obj else None,
            age_group=member.age_group,
        ),
        "dashboard": get_blood_pressure_dashboard(db, hh, member),
    }


@ecosystem_router.delete("/health/blood-pressure/{reading_id}", tags=["Health Measurements"])
def delete_blood_pressure_endpoint(
    reading_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    log = (
        db.query(BloodPressureLog)
        .filter(
            BloodPressureLog.id == reading_id,
            BloodPressureLog.household_id == hh.id,
        )
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood pressure reading not found.",
        )
    m_id = log.member_id
    db.delete(log)
    db.commit()
    _, member = _resolve_owned_member(db, current_user, member_id=m_id)
    return {
        "deleted": True,
        "reading_id": reading_id,
        "dashboard": get_blood_pressure_dashboard(db, hh, member),
    }


@ecosystem_router.get("/health/blood-glucose", tags=["Health Measurements"])
def get_blood_glucose_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
    end_date: Annotated[str | None, Query()] = None,
    context_filter: Annotated[str | None, Query()] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_blood_glucose_dashboard(
        db,
        hh,
        member,
        days=days,
        end_date_str=end_date,
        context_filter=context_filter,
    )


@ecosystem_router.post("/health/blood-glucose", tags=["Health Measurements"])
def add_blood_glucose_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        log = create_blood_glucose_log(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    target_obj = get_member_clinician_target(db, member.id, "blood_glucose")
    return {
        "entry": serialize_glucose_log(
            log,
            target_obj.target_details_json if target_obj else None,
            age_group=member.age_group,
        ),
        "dashboard": get_blood_glucose_dashboard(db, hh, member),
    }


@ecosystem_router.put("/health/blood-glucose/{reading_id}", tags=["Health Measurements"])
def update_blood_glucose_endpoint(
    reading_id: int,
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    log = (
        db.query(BloodGlucoseLog)
        .filter(
            BloodGlucoseLog.id == reading_id,
            BloodGlucoseLog.household_id == hh.id,
        )
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood glucose reading not found.",
        )

    raw_val = payload.get("glucose_value")
    if raw_val is None:
        raw_val = payload.get("entered_value")
    if raw_val is not None:
        unit = str(
            payload.get("measurement_unit")
            or payload.get("entered_unit")
            or log.entered_unit
        )
        val_mg, val_mmol, can_unit = convert_glucose_units(float(raw_val), unit)
        if not (20.0 <= val_mg <= 800.0):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Glucose value out of physiological recording range.",
            )
        log.entered_value = round(float(raw_val), 2)
        log.entered_unit = can_unit
        log.value_mg_dl = val_mg
        log.value_mmol_l = val_mmol

    for field in (
        "logged_date",
        "logged_time",
        "measurement_context",
        "minutes_after_meal",
        "meal_reference",
        "device_type",
        "notes",
    ):
        if field in payload:
            setattr(log, field, payload[field])
    db.commit()
    db.refresh(log)
    _, member = _resolve_owned_member(db, current_user, member_id=log.member_id)
    target_obj = get_member_clinician_target(db, member.id, "blood_glucose")
    return {
        "entry": serialize_glucose_log(
            log,
            target_obj.target_details_json if target_obj else None,
            age_group=member.age_group,
        ),
        "dashboard": get_blood_glucose_dashboard(db, hh, member),
    }


@ecosystem_router.delete("/health/blood-glucose/{reading_id}", tags=["Health Measurements"])
def delete_blood_glucose_endpoint(
    reading_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    log = (
        db.query(BloodGlucoseLog)
        .filter(
            BloodGlucoseLog.id == reading_id,
            BloodGlucoseLog.household_id == hh.id,
        )
        .first()
    )
    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Blood glucose reading not found.",
        )
    m_id = log.member_id
    db.delete(log)
    db.commit()
    _, member = _resolve_owned_member(db, current_user, member_id=m_id)
    return {
        "deleted": True,
        "reading_id": reading_id,
        "dashboard": get_blood_glucose_dashboard(db, hh, member),
    }


@ecosystem_router.put("/health/measurements/targets", tags=["Health Measurements"])
def save_clinician_target_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        return save_clinician_measurement_target(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@ecosystem_router.get("/health/measurements/summary", tags=["Health Measurements"])
def get_health_measurements_summary_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_health_measurements_summary(db, hh, member)


@ecosystem_router.get("/health/measurements/history", tags=["Health Measurements"])
def get_health_measurements_history_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    days: Annotated[int, Query(ge=7, le=90)] = 30,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    bp = get_blood_pressure_dashboard(db, hh, member, days=days)
    bg = get_blood_glucose_dashboard(db, hh, member, days=days)
    body = list_measurements_endpoint(db, current_user, member_id=member.id)
    return {
        "member_id": member.id,
        "member_name": member.display_name,
        "blood_pressure": bp,
        "blood_glucose": bg,
        "body_measurements": body,
    }


@ecosystem_router.get("/health/timeline", tags=["Health Measurements"])
def get_daily_activity_timeline_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    date: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query()] = None,
):
    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_unified_daily_activity_timeline(
        db, hh, member, date_str=date, category_filter=category
    )


# ==========================================
# PART 6 — AI-POWERED HABIT PLAN BUILDER
# ==========================================
@ecosystem_router.post("/fitness/habits/ai-plan", tags=["Fitness & Goals"])
def propose_ai_habit_plan_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    prompt = str(payload.get("prompt") or payload.get("goal_description") or "").strip()
    return propose_ai_habit_plan(db, hh, member, prompt)


@ecosystem_router.post("/fitness/habits/ai-plan/confirm", tags=["Fitness & Goals"])
def confirm_ai_habit_plan_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        res = confirm_ai_habit_plan(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return {
        **res,
        "habits": list_habits_endpoint(db, current_user, member_id=member.id),
    }


@ecosystem_router.post("/fitness/habits/ai-plan/modify", tags=["Fitness & Goals"])
def modify_ai_habit_plan_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    instruction = str(payload.get("instruction") or "").strip()
    if not instruction:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="'instruction' is required.",
        )
    confirmed = bool(payload.get("user_confirmed", False))
    res = modify_ai_habit_plan_natural_language(
        db, hh, member, instruction, user_confirmed=confirmed
    )
    return {
        **res,
        "habits": list_habits_endpoint(db, current_user, member_id=member.id),
    }


# ==========================================
# PART 7 — NATURAL-LANGUAGE DAILY FOOD LOGGING
# ==========================================
@ecosystem_router.post("/tracker/food-logs/parse", tags=["Daily Tracker"])
def parse_nl_food_log_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    raw_text = str(payload.get("text") or payload.get("raw_text") or "").strip()
    try:
        return parse_natural_language_food_log(
            db, hh, member, raw_text, default_date=payload.get("logged_date")
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@ecosystem_router.post("/tracker/food-logs/confirm-parsed", tags=["Daily Tracker"])
def confirm_nl_food_log_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        entries = confirm_natural_language_food_logs(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    target_date = str(payload.get("logged_date") or today_iso_str())
    return {
        "saved_count": len(entries),
        "entries": entries,
        "daily_summary": get_daily_tracker_summary(db, hh, member, target_date),
    }


# ==========================================
# PART B — DATABASE-PERSISTENT ACHIEVEMENT & REWARD SYSTEM
# ==========================================
@ecosystem_router.get("/fitness/achievements", tags=["Fitness & Goals"])
def get_member_achievements_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    from app.services.recipe_intelligence_service import (
        evaluate_and_get_member_achievements,
    )

    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return evaluate_and_get_member_achievements(db, hh, member)


@ecosystem_router.post("/fitness/achievements/migrate-local", tags=["Fitness & Goals"])
def migrate_local_achievements_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.recipe_intelligence_service import migrate_local_achievements

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    local_codes = (
        payload.get("badge_codes")
        or payload.get("local_badge_codes")
        or payload.get("local_badges")
        or []
    )
    return migrate_local_achievements(db, hh, member, local_codes)


@ecosystem_router.post("/fitness/achievements/seen", tags=["Fitness & Goals"])
def mark_achievements_seen_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.recipe_intelligence_service import mark_member_achievements_seen

    m_id = payload.get("member_id")
    _hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    codes = payload.get("achievement_codes")
    return mark_member_achievements_seen(db, member, codes)


@ecosystem_router.put("/fitness/achievements/preferences", tags=["Fitness & Goals"])
def update_achievement_preferences_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.recipe_intelligence_service import (
        update_member_achievement_preferences,
    )

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    rewards_enabled = bool(payload.get("rewards_enabled", True))
    return update_member_achievement_preferences(db, hh, member, rewards_enabled)


# ==========================================
# PART C — INTERACTIVE 3D HUMAN BODY & NUTRITION EXPLORER
# ==========================================
@ecosystem_router.get("/explore/body-nutrition", tags=["3D Body & Nutrition Explorer"])
def list_body_nutrition_regions_endpoint(
    db: DbSession,
    _current_user: CurrentUser,
):
    from app.services.recipe_intelligence_service import list_body_nutrition_regions

    return list_body_nutrition_regions(db)


@ecosystem_router.get(
    "/explore/body-nutrition/{region_code}",
    tags=["3D Body & Nutrition Explorer"],
)
def get_body_nutrition_region_detail_endpoint(
    region_code: str,
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    dietary_preference: Annotated[str | None, Query()] = None,
):
    from app.services.recipe_intelligence_service import (
        get_body_nutrition_region_detail,
    )

    eff_diet = dietary_preference
    if eff_diet is None and member_id is not None:
        _hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
        eff_diet = member.dietary_preference

    detail = get_body_nutrition_region_detail(
        db, region_code=region_code, dietary_preference=eff_diet
    )
    if not detail:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Body region '{region_code}' not found.",
        )
    return detail


# ==========================================
# PART A — HEALTH REPORT INTELLIGENCE & LAB-TO-PLATE ENDPOINTS
# ==========================================
@ecosystem_router.post("/health/reports/extract", tags=["Health Report Intelligence"])
async def extract_health_report_upload_endpoint(
    file: Annotated[UploadFile, File(...)],
    current_user: CurrentUser,
    db: DbSession,
    member_id: Annotated[int | None, Form()] = None,
    hint_text: Annotated[str | None, Form()] = None,
    report_title: Annotated[str | None, Form()] = None,
    report_type: Annotated[str | None, Form()] = None,
):
    from app.services.health_report_symptom_service import (
        extract_health_report_from_upload,
    )

    _hh, _member = _resolve_owned_member(db, current_user, member_id=member_id)
    raw_bytes = await file.read()
    try:
        res = extract_health_report_from_upload(
            file_bytes=raw_bytes,
            filename=file.filename,
            content_type=file.content_type,
            hint_text=hint_text,
            report_title=report_title,
        )
        if report_type:
            res["report_type"] = report_type
        return res
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    finally:
        await file.close()


@ecosystem_router.post("/health/reports/extract-text", tags=["Health Report Intelligence"])
def extract_health_report_text_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.health_report_symptom_service import (
        MEDICAL_REPORT_DISCLAIMER,
        PRIVACY_EPHEMERAL_UPLOAD_NOTICE,
        parse_laboratory_report_text,
    )

    m_id = payload.get("member_id")
    _hh, _member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    raw_text = str(
        payload.get("raw_report_text")
        or payload.get("raw_text")
        or payload.get("text")
        or ""
    ).strip()
    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide 'raw_report_text' or 'raw_text' from your laboratory report.",
        )
    parsed = parse_laboratory_report_text(raw_text)
    warnings = list(parsed.get("uncertainty_notes") or [])
    p_diag = parsed.get("parser_diagnostics") or {}
    measurements = parsed["measurements"]
    has_rows = len(measurements) > 0
    return {
        "extraction_id": "hr-text-preview",
        "extraction_status": "success" if has_rows else "no_structured_tests_found",
        "extraction_error_message": None
        if has_rows
        else "No recognisable laboratory test rows could be matched from the provided text. Please check the format or add rows manually.",
        "extraction_engine": "structured_text_parser",
        "extraction_method": "structured_text_parser",
        "extraction_diagnostics": {
            "file_type": "text",
            "mime_type": "text/plain",
            "file_size_bytes": len(raw_text.encode("utf-8")),
            "ocr_engine_used": "structured_text_parser",
            "ocr_success": True,
            "pages_or_images_processed": 1,
            "text_extracted": True,
            "candidate_rows_detected": int(p_diag.get("candidate_rows_detected", 0)),
            "valid_structured_rows": int(p_diag.get("valid_structured_rows", 0)),
            "rejected_rows_count": int(p_diag.get("rejected_rows_count", 0)),
            "rejection_reasons": list(p_diag.get("rejection_reasons") or [])[:15],
            "final_api_status": "success" if has_rows else "extraction_failed",
        },
        "report_title": payload.get("report_title") or parsed["report_title"],
        "laboratory_name": payload.get("laboratory_name") or parsed["laboratory_name"],
        "report_date": payload.get("report_date") or parsed["report_date"],
        "specimen_type": parsed["specimen_type"],
        "extracted_count": len(measurements),
        "measurements": measurements,
        "extracted_measurements": measurements,
        "report_summary": parsed["report_summary"],
        "possible_nutritional_concerns": parsed["report_summary"]["possible_nutritional_concerns"],
        "raw_extracted_text": raw_text[:4000],
        "validation_warnings": warnings,
        "uncertainty_notes": warnings,
        "requires_user_confirmation": True,
        "saved_to_database": False,
        "privacy_notice": PRIVACY_EPHEMERAL_UPLOAD_NOTICE,
        "medical_disclaimer": MEDICAL_REPORT_DISCLAIMER,
    }


@ecosystem_router.post("/health/reports/confirm", tags=["Health Report Intelligence"])
def confirm_health_report_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.health_report_symptom_service import (
        confirm_and_save_health_report,
    )

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        return confirm_and_save_health_report(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@ecosystem_router.get("/health/reports", tags=["Health Report Intelligence"])
def list_health_reports_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    from app.services.health_report_symptom_service import list_health_reports

    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return list_health_reports(db, hh, member)


@ecosystem_router.get("/health/reports/trends", tags=["Health Report Intelligence"])
def get_health_report_trends_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    canonical_code: Annotated[str | None, Query()] = None,
):
    from app.services.health_report_symptom_service import get_health_report_trends

    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_health_report_trends(db, hh, member, canonical_code=canonical_code)


@ecosystem_router.get("/health/reports/{report_id}", tags=["Health Report Intelligence"])
def get_health_report_detail_endpoint(
    report_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    from app.models.entities import HealthReport
    from app.services.health_report_symptom_service import serialize_health_report

    hh = ensure_user_owned_household(db, current_user)
    report = (
        db.query(HealthReport)
        .options(joinedload(HealthReport.measurements))
        .filter(
            HealthReport.id == report_id,
            HealthReport.household_id == hh.id,
        )
        .first()
    )
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Health report not found."
        )
    return serialize_health_report(report)


@ecosystem_router.delete("/health/reports/{report_id}", tags=["Health Report Intelligence"])
def delete_health_report_endpoint(
    report_id: int,
    db: DbSession,
    current_user: CurrentUser,
):
    from app.models.entities import HealthReport

    hh = ensure_user_owned_household(db, current_user)
    report = (
        db.query(HealthReport)
        .filter(
            HealthReport.id == report_id,
            HealthReport.household_id == hh.id,
        )
        .first()
    )
    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Health report not found."
        )
    db.delete(report)
    db.commit()
    return {"deleted": True, "report_id": report_id}


# ==========================================
# PART B — AI SYMPTOM REVIEW & CARE GUIDANCE ENDPOINTS
# ==========================================
@ecosystem_router.post("/health/symptom-review", tags=["AI Symptom Review"])
def evaluate_symptom_review_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.health_report_symptom_service import evaluate_symptom_review

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        return evaluate_symptom_review(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@ecosystem_router.get("/health/symptom-review/history", tags=["AI Symptom Review"])
def get_symptom_review_history_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 15,
):
    from app.services.health_report_symptom_service import (
        list_symptom_review_history,
    )

    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return list_symptom_review_history(db, hh, member, limit=limit)


# ==========================================
# PARTS C, D, E, F — SMART NEARBY FOOD DISCOVERY, MAPS & PROVIDER ADAPTERS
# ==========================================
@ecosystem_router.get("/food-discovery/providers", tags=["Smart Food Discovery"])
def get_food_discovery_providers_endpoint(_current_user: CurrentUser):
    from app.services.food_discovery_service import get_provider_status_summary

    return get_provider_status_summary()


@ecosystem_router.get("/food-discovery/geocode", tags=["Smart Food Discovery"])
def geocode_food_discovery_location_endpoint(
    _current_user: CurrentUser,
    q: Annotated[str, Query(description="City, locality, or neighbourhood e.g. Vijayanagar, Mysuru")] = "Mysuru",
):
    from app.services.food_discovery_service import geocode_location_nominatim

    return geocode_location_nominatim(q, allow_live_network=True)



@ecosystem_router.get("/food-discovery/preferences", tags=["Smart Food Discovery"])
def get_food_discovery_preferences_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    member_id: Annotated[int | None, Query()] = None,
):
    from app.services.food_discovery_service import (
        get_or_update_food_discovery_preferences,
    )

    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return get_or_update_food_discovery_preferences(db, hh, member)


@ecosystem_router.put("/food-discovery/preferences", tags=["Smart Food Discovery"])
def update_food_discovery_preferences_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.food_discovery_service import (
        get_or_update_food_discovery_preferences,
    )

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    return get_or_update_food_discovery_preferences(db, hh, member, payload=payload)


@ecosystem_router.post("/food-discovery/search", tags=["Smart Food Discovery"])
def search_nearby_food_post_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.food_discovery_service import (
        search_nearby_food_and_restaurants,
    )

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    return search_nearby_food_and_restaurants(db, hh, member, payload)


@ecosystem_router.get("/food-discovery/search", tags=["Smart Food Discovery"])
def search_nearby_food_get_endpoint(
    db: DbSession,
    current_user: CurrentUser,
    dish_query: Annotated[str, Query()] = "Masala Dosa",
    city: Annotated[str | None, Query()] = None,
    area: Annotated[str | None, Query()] = None,
    pincode: Annotated[str | None, Query()] = None,
    latitude: Annotated[float | None, Query()] = None,
    longitude: Annotated[float | None, Query()] = None,
    radius_km: Annotated[float, Query(ge=1.0, le=50.0)] = 5.0,
    dietary_filter: Annotated[str | None, Query()] = None,
    sort_by: Annotated[str, Query()] = "relevance",
    member_id: Annotated[int | None, Query()] = None,
):
    from app.services.food_discovery_service import (
        search_nearby_food_and_restaurants,
    )

    hh, member = _resolve_owned_member(db, current_user, member_id=member_id)
    return search_nearby_food_and_restaurants(
        db,
        hh,
        member,
        {
            "dish_query": dish_query,
            "city": city,
            "area": area,
            "pincode": pincode,
            "latitude": latitude,
            "longitude": longitude,
            "radius_km": radius_km,
            "dietary_filter": dietary_filter,
            "sort_by": sort_by,
        },
    )


@ecosystem_router.post("/food-discovery/swiggy-mcp/preview", tags=["Smart Food Discovery"])
def prepare_swiggy_mcp_preview_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.food_discovery_service import (
        prepare_swiggy_mcp_action_preview,
    )

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    return prepare_swiggy_mcp_action_preview(db, hh, member, payload)


@ecosystem_router.post("/food-discovery/log-meal", tags=["Smart Food Discovery"])
def log_restaurant_meal_endpoint(
    payload: dict[str, Any],
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.food_discovery_service import log_restaurant_meal_to_diary

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    try:
        return log_restaurant_meal_to_diary(db, hh, member, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


# ==========================================
# NUTRIENT EXPLORER & EXPANDED INDIAN FOOD COMPOSITION ENGINE
# ==========================================
@ecosystem_router.get("/nutrients/catalog", tags=["Nutrient Explorer"])
def get_nutrients_explorer_catalog_endpoint(
    db: DbSession,
    q: Annotated[
        str | None,
        Query(description="Search nutrient by name, code, or alias (e.g., Vitamin D, B12, Iron, Folate)"),
    ] = None,
    group: Annotated[
        str | None,
        Query(description="Filter by nutrient group (vitamins, minerals, protein_amino, carbs_fibre, fats_fatty_acids, other_components)"),
    ] = None,
):
    from app.services.nutrient_food_search_service import list_nutrients_catalog

    return list_nutrients_catalog(db, search_query=q, group_code=group)


@ecosystem_router.get("/nutrients/search", tags=["Nutrient Explorer"])
def search_foods_by_nutrient_endpoint(
    db: DbSession,
    q: Annotated[
        str,
        Query(description="Nutrient name, code, or alias (e.g., Vitamin D, Iron, Vitamin B12, Protein, Calcium, Folate)"),
    ] = "iron_mg",
    dietary_preference: Annotated[
        str | None,
        Query(description="all | vegetarian | vegan | eggetarian | non_vegetarian"),
    ] = "all",
    food_form: Annotated[
        str | None,
        Query(description="all | raw | cooked | prepared_dish | fortified | natural | packaged"),
    ] = "all",
    category_slug: Annotated[
        str | None,
        Query(description="Optional food category slug filter"),
    ] = None,
    sort_by: Annotated[
        str,
        Query(description="per_100g_desc | per_serving_desc | density_per_100kcal_desc | name_asc"),
    ] = "per_100g_desc",
    limit: Annotated[int, Query(ge=1, le=200)] = 80,
):
    from app.services.nutrient_food_search_service import search_foods_by_nutrient

    return search_foods_by_nutrient(
        db,
        nutrient_query=q,
        dietary_preference=dietary_preference,
        food_form=food_form,
        category_slug=category_slug,
        sort_by=sort_by,
        limit=limit,
    )


@ecosystem_router.get("/nutrients/import-summary", tags=["Nutrient Explorer"])
def get_nutrient_database_import_summary_endpoint(
    db: DbSession,
):
    from app.services.nutrient_food_search_service import (
        get_database_import_and_coverage_summary,
    )

    return get_database_import_and_coverage_summary(db)


@ecosystem_router.get("/nutrients/{nutrient_code}/foods", tags=["Nutrient Explorer"])
def get_foods_for_nutrient_code_endpoint(
    nutrient_code: str,
    db: DbSession,
    dietary_preference: Annotated[str | None, Query()] = "all",
    food_form: Annotated[str | None, Query()] = "all",
    category_slug: Annotated[str | None, Query()] = None,
    sort_by: Annotated[str, Query()] = "per_100g_desc",
    limit: Annotated[int, Query(ge=1, le=200)] = 80,
):
    from app.services.nutrient_food_search_service import search_foods_by_nutrient

    res = search_foods_by_nutrient(
        db,
        nutrient_query=nutrient_code,
        dietary_preference=dietary_preference,
        food_form=food_form,
        category_slug=category_slug,
        sort_by=sort_by,
        limit=limit,
    )
    if not res.get("matched"):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=res.get("message") or f"Nutrient '{nutrient_code}' not found.",
        )
    return res



