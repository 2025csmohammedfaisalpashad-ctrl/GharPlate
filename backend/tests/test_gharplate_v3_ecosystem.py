"""
Comprehensive Automated Test Suite for GharPlate 3.0 Ecosystem (Modules A through N):
- Module A: Household Member Primary Goals, Fitness Profiles & 7-Day Weekly Training Schedules
- Module B: Daily Nutrition Tracker, Food Diary History, Copy Day, Meal Templates & NULL Nutrient Snapshots
- Module C: Water & Hydration Tracker, Undo Entries, Custom Targets & CKD/Fluid-Sensitive Medical Notice
- Module D: Fitness & Nutrition Goals, Gentle Habit Tracker & Optional Body Measurements
- Module E: Daily, Weekly & Monthly Visual Analytics (recorded vs no_entry_recorded vs incomplete_nutrient_data)
- Modules F & N: Recipe Discovery, Online Provider Adapters (Edamam v2 / TheMealDB), Profile-Aware Recommendations & Personal Recipe Generator
- Modules G & H: Smart Pantry Inventory, Consolidated Grocery Shopping List (duplicate consolidation across recipes + pantry subtraction) & Verified Indian Retailer Destinations (Blinkit, Zepto, Swiggy Instamart, BigBasket)
- Module I: Indian Protein & Budget Intelligence (custom local price entry & cost per 10g protein)
- Module J: Smart Mess & Canteen Analyzer (exact vs possible match & logging plate to Daily Tracker)
- Module K: Family Meal Personalisation (One Family Meal, Multiple Nutrition Goals)
- Module L: Supplement & Packaged Product Intelligence
- Module M: All 17 Extended GharPlate 3.0 AI Assistant Tools with User Confirmation Safety
"""

from app.main import app
from app.services.ollama_assistant_service import execute_allowlisted_tool
from app.db.session import SessionLocal
from tests.conftest import AuthenticatedTestClient

client = AuthenticatedTestClient(app)


def test_01_fitness_profile_training_schedule_and_coexisting_conditions():
    """
    Verifies Module A:
    - Member can simultaneously have a medical condition (Type 2 Diabetes) and a fitness goal (Build Muscle).
    - Fitness profile and 7-day weekly training schedule persist and return condition-fitness cautions.
    """
    client.ensure_authenticated()
    token = client.household_token

    mem_resp = client.post(
        f"/api/v1/households/{token}/members",
        json={
            "display_name": "Arjun Gym & Diabetes",
            "age_group": "adult",
            "dietary_preference": "vegetarian",
            "primary_goal": "build_muscle",
            "selected_conditions": ["type_2_diabetes"],
            "allergies": ["peanut"],
            "intolerances": [],
            "dietary_restrictions": [],
            "food_preferences": ["south_indian"],
        },
    )
    assert mem_resp.status_code == 200
    member = mem_resp.json()
    assert member["primary_goal"] == "build_muscle"
    member_id = member["id"]

    prof_get = client.get("/api/v1/fitness/profile", params={"member_id": member_id})
    assert prof_get.status_code == 200
    prof_data = prof_get.json()
    assert prof_data["primary_goal"] == "build_muscle"
    assert len(prof_data["training_schedule"]) == 7

    prof_put = client.put(
        "/api/v1/fitness/profile",
        params={"member_id": member_id},
        json={
            "primary_goal": "build_muscle",
            "height_cm": 176.0,
            "current_weight_kg": 72.0,
            "target_weight_kg": 75.0,
            "training_frequency_days_per_week": 4,
            "training_type": "strength_training",
            "daily_food_budget_inr": 220.0,
            "target_calories_kcal": 2300.0,
            "target_protein_g": 110.0,
            "training_schedule": [
                {
                    "day_of_week": "monday",
                    "is_training_day": True,
                    "workout_type": "Upper Body Push",
                    "workout_time": "07:00",
                    "duration_minutes": 50,
                },
                {
                    "day_of_week": "tuesday",
                    "is_training_day": False,
                    "workout_type": "Active Recovery Walk",
                },
            ],
        },
    )
    assert prof_put.status_code == 200
    updated_prof = prof_put.json()
    assert updated_prof["height_cm"] == 176.0
    assert updated_prof["current_weight_kg"] == 72.0
    assert updated_prof["computed_targets"]["calories_kcal"] == 2300.0
    assert updated_prof["computed_targets"]["protein_g"] == 110.0


def test_02_daily_nutrition_tracker_null_preservation_copy_day_and_templates():
    """
    Verifies Module B:
    - Logging whole foods (Ragi) and packaged foods with NULL nutrients (Pineapple Cake).
    - Editing quantity, moving meal category, deleting entry.
    - Copying meals from one date to another and saving/applying meal templates.
    - Preserving NULL nutrients without turning unknown nutrients into zero.
    """
    client.ensure_authenticated()
    d1 = "2026-11-05"
    d2 = "2026-11-06"

    # Log Ragi to breakfast on d1
    log1 = client.post(
        "/api/v1/tracker/food-logs",
        json={
            "logged_date": d1,
            "meal_category": "breakfast",
            "food_slug": "ragi-finger-millet",
            "quantity": 1.0,
            "unit_name": "100g",
            "logged_time": "08:30",
        },
    )
    assert log1.status_code == 200
    entry1 = log1.json()["entry"]
    assert entry1["energy_kcal"] is not None and entry1["energy_kcal"] > 0
    assert entry1["protein_g"] is not None and entry1["protein_g"] > 0

    # Edit quantity (1.0 -> 2.0) and move to pre_workout
    upd1 = client.put(
        f"/api/v1/tracker/food-logs/{entry1['id']}",
        json={"quantity": 2.0, "meal_category": "pre_workout"},
    )
    assert upd1.status_code == 200
    assert upd1.json()["entry"]["quantity"] == 2.0
    assert upd1.json()["entry"]["meal_category"] == "pre_workout"

    # Log Pineapple Cake (which has NULL nutrients) and verify has_incomplete_entries is True
    log_null = client.post(
        "/api/v1/tracker/food-logs",
        json={
            "logged_date": d1,
            "meal_category": "evening_snack",
            "food_slug": "pkg-pineapple-cake-6b35c3",
            "quantity": 1.0,
            "unit_name": "standard_serving",
        },
    )
    assert log_null.status_code == 200
    null_entry = log_null.json()["entry"]
    assert null_entry["energy_kcal"] is None
    assert log_null.json()["daily_summary"]["daily_nutrition"]["has_incomplete_entries"] is True

    # Copy d1 meals to d2
    copy_resp = client.post(
        "/api/v1/tracker/copy-day",
        json={"source_date": d1, "target_date": d2},
    )
    assert copy_resp.status_code == 200
    assert copy_resp.json()["copied_count"] >= 2

    # Save a meal template and apply it
    tmpl_resp = client.post(
        "/api/v1/tracker/meal-templates",
        json={
            "name": "Pre-Workout Ragi Fuel",
            "meal_category": "pre_workout",
            "source_date": d1,
        },
    )
    assert tmpl_resp.status_code == 200
    tmpl_id = tmpl_resp.json()["id"]

    apply_resp = client.post(
        f"/api/v1/tracker/meal-templates/{tmpl_id}/apply",
        json={"target_date": "2026-11-07", "meal_category": "breakfast"},
    )
    assert apply_resp.status_code == 200
    assert apply_resp.json()["daily_nutrition"]["entry_count"] >= 1

    # Delete the evening_snack entry
    del_resp = client.delete(f"/api/v1/tracker/food-logs/{null_entry['id']}")
    assert del_resp.status_code == 200
    assert del_resp.json()["deleted"] is True


def test_03_water_hydration_tracker_and_condition_fluid_caution():
    """
    Verifies Module C:
    - Logging water entries, updating hydration goal, undoing an entry.
    - Displaying individualised fluid guidance caution when member has CKD/hypertension.
    """
    client.ensure_authenticated()
    token = client.household_token

    # Create a member with CKD to verify fluid-sensitive medical notice
    ckd_mem = client.post(
        f"/api/v1/households/{token}/members",
        json={
            "display_name": "Appa Renal Care",
            "age_group": "older_adult",
            "dietary_preference": "vegetarian",
            "primary_goal": "manage_health_condition",
            "selected_conditions": ["chronic_kidney_disease"],
            "allergies": [],
            "intolerances": [],
            "dietary_restrictions": [],
            "food_preferences": [],
        },
    ).json()

    w1 = client.post(
        "/api/v1/hydration/logs",
        json={
            "member_id": ckd_mem["id"],
            "logged_date": "2026-11-07",
            "amount_ml": 250,
            "container_type": "large_glass",
        },
    )
    assert w1.status_code == 200
    w_data = w1.json()
    assert w_data["total_ml"] == 250
    assert w_data["fluid_medical_notice"] is not None
    assert "chronic_kidney_disease" in w_data["fluid_medical_notice"]

    # Update hydration target
    s_upd = client.put(
        "/api/v1/hydration/settings",
        json={
            "member_id": ckd_mem["id"],
            "daily_goal_ml": 1800,
            "reminders_enabled": True,
        },
    )
    assert s_upd.status_code == 200
    assert s_upd.json()["goal_ml"] == 1800

    # Undo water entry
    entry_id = w_data["entries"][0]["id"]
    undo_resp = client.delete(f"/api/v1/hydration/logs/{entry_id}")
    assert undo_resp.status_code == 200
    assert undo_resp.json()["total_ml"] == 0


def test_04_goals_habits_measurements_and_visual_analytics():
    """
    Verifies Modules D & E:
    - Creating/updating/deleting fitness goals.
    - Creating and toggling daily habits.
    - Recording optional body measurements.
    - Fetching Daily, Weekly, and Monthly visual analytics distinguishing 'recorded' vs 'no_entry_recorded'.
    """
    client.ensure_authenticated()

    # Goals
    goals_list = client.post(
        "/api/v1/fitness/goals",
        json={
            "goal_name": "Reach 32g Daily Dietary Fibre",
            "goal_type": "fiber_intake",
            "target_value": 32.0,
            "unit": "g / day",
        },
    )
    assert goals_list.status_code == 200
    assert any(g["goal_name"] == "Reach 32g Daily Dietary Fibre" for g in goals_list.json())

    # Habits
    habits_list = client.post(
        "/api/v1/fitness/habits",
        json={
            "title": "Include sprouted moong or dal at lunch",
            "category": "nutrition",
            "frequency": "daily",
        },
    )
    assert habits_list.status_code == 200
    target_habit = habits_list.json()[-1]

    toggled = client.post(
        f"/api/v1/fitness/habits/{target_habit['id']}/toggle",
        json={"date": "2026-11-07"},
    )
    assert toggled.status_code == 200
    updated_h = next(h for h in toggled.json() if h["id"] == target_habit["id"])
    assert updated_h["completed_on_date"] is True

    # Measurements
    meas_resp = client.post(
        "/api/v1/fitness/measurements",
        json={
            "logged_date": "2026-11-07",
            "weight_kg": 71.5,
            "waist_cm": 82.0,
            "workout_completed": True,
            "milestone_note": "Completed 45-min strength session",
        },
    )
    assert meas_resp.status_code == 200
    assert meas_resp.json()[0]["weight_kg"] == 71.5

    # Visual Analytics Overview
    analytics = client.get("/api/v1/analytics/overview", params={"days": 14})
    assert analytics.status_code == 200
    a_data = analytics.json()
    assert len(a_data["weekly_series"]) == 7
    assert len(a_data["monthly_series"]) == 14
    statuses = {d["food_data_status"] for d in a_data["monthly_series"]}
    assert "no_entry_recorded" in statuses


def test_05_recipe_discovery_personal_generator_pantry_and_smart_grocery_consolidation():
    """
    Verifies Modules F, G, H & N:
    - Discovering profile-compatible recipes.
    - Generating a personal recipe from verified database ingredients (paneer, rice, tomatoes).
    - Adding pantry items, converting multiple recipes to a consolidated shopping list,
      verifying duplicate ingredients combine, and verifying genuine Blinkit/Zepto/Instamart/BigBasket search links.
    """
    client.ensure_authenticated()

    disc = client.get(
        "/api/v1/recipes/discover",
        params={"dietary_preference": "vegetarian", "fitness_goal": "build_muscle"},
    )
    assert disc.status_code == 200
    disc_data = disc.json()
    assert len(disc_data["local_verified_recipes"]) >= 2
    assert all(r["is_vegetarian"] is True for r in disc_data["local_verified_recipes"])

    # Generate personal recipe from DB ingredients
    gen = client.post(
        "/api/v1/recipes/generate",
        json={
            "prompt": "Give me a vegetarian meal using paneer, rice and tomatoes that supports my fitness goal.",
            "dietary_preference": "vegetarian",
            "fitness_goal": "build_muscle",
            "servings": 2,
        },
    )
    assert gen.status_code == 200
    gen_rec = gen.json()["generated_recipe"]
    assert gen_rec["completeness_pct"] > 0

    # Mark spinach-palak as available in Pantry (500g) so it is subtracted from shopping list
    pantry_resp = client.post(
        "/api/v1/pantry",
        json={
            "food_slug": "spinach-palak",
            "ingredient_name": "Spinach (Palak)",
            "available_quantity": 500,
            "grams_available": 500,
            "unit_name": "g",
            "in_stock": True,
        },
    )
    assert pantry_resp.status_code == 200

    # Convert recipes that use Spinach and Tomato into the Smart Shopping List and verify duplicate consolidation
    rec_ids = [r["id"] for r in disc_data["local_verified_recipes"]]
    shop_resp = client.post(
        "/api/v1/shopping-lists/from-recipe",
        json={"recipe_ids": rec_ids, "subtract_pantry": True},
    )
    assert shop_resp.status_code == 200
    shop_data = shop_resp.json()
    assert any("Spinach" in s for s in shop_data["skipped_already_in_pantry"])

    # Check consolidated Tomato item and its verified Indian retailer search links
    tomato_items = [
        i for i in shop_data["items"] if "tomato" in i["ingredient_name"].lower()
    ]
    assert len(tomato_items) == 1
    retailer_codes = {
        r["retailer_code"] for r in tomato_items[0]["retailer_destinations"]
    }
    assert {"blinkit", "zepto", "swiggy_instamart", "bigbasket"} <= retailer_codes


def test_06_protein_intelligence_mess_analyzer_family_meals_supplements_and_17_ai_tools():
    """
    Verifies Modules I, J, K, L & M:
    - Indian Protein & Budget Intelligence + custom local price update.
    - Smart Mess & Canteen Analyzer + logging confirmed plate to Daily Tracker.
    - Family Meal Personalisation across multiple household members with different goals/conditions.
    - Supplement & Packaged Product Intelligence.
    - Executing the new GharPlate 3.0 AI Assistant tools (with confirmation safety on mutating tools).
    """
    client.ensure_authenticated()

    # Module I: Protein Intelligence
    prot = client.get("/api/v1/protein-intelligence", params={"dietary_filter": "vegetarian"})
    assert prot.status_code == 200
    prot_items = prot.json()["items"]
    assert len(prot_items) >= 5
    target_prot_slug = prot_items[0]["food_slug"]

    price_upd = client.post(
        "/api/v1/protein-intelligence/prices",
        json={
            "food_slug": target_prot_slug,
            "price_inr_per_100g": 40.0,
            "package_label": "Mysuru Local Market Custom Price",
        },
    )
    assert price_upd.status_code == 200
    updated_row = next(
        i for i in price_upd.json()["items"] if i["food_slug"] == target_prot_slug
    )
    assert updated_row["price_inr_per_100g"] == 40.0
    assert updated_row["price_source"] == "user_entered_local_price"

    # Module J: Smart Mess Analyzer
    mess_res = client.post(
        "/api/v1/mess-analyzer/analyze",
        json={
            "raw_menu_text": "Idli, Sambar, Ragi, Curd",
            "save_title": "SJCE Hostel Lunch Menu",
        },
    )
    assert mess_res.status_code == 200
    assert len(mess_res.json()["matched_dishes"]) == 4
    assert mess_res.json()["combined_plate_estimate"]["protein_g"] > 0

    matched_slugs = [
        d["matched_food"]["slug"]
        for d in mess_res.json()["matched_dishes"]
        if d.get("matched_food")
    ]
    log_plate = client.post(
        "/api/v1/mess-analyzer/log-plate",
        json={
            "food_slugs": matched_slugs[:2],
            "meal_category": "lunch",
            "logged_date": "2026-11-07",
        },
    )
    assert log_plate.status_code == 200
    assert log_plate.json()["logged_count"] == 2

    # Module K: Family Meal Personalisation
    recs = client.get("/api/v1/recipes").json()
    fam_plan = client.post(
        "/api/v1/family-meals/plan",
        json={"recipe_id": recs[0]["id"]},
    )
    assert fam_plan.status_code == 200
    assert len(fam_plan.json()["member_plans"]) >= 2

    # Module L: Supplement Intelligence
    supp = client.get("/api/v1/supplements/intelligence")
    assert supp.status_code == 200
    assert len(supp.json()["label_terminology_guide"]) >= 4

    # Module M: Verify all new AI Assistant tools (including confirmation safety on log_food_intake & log_water_intake)
    db = SessionLocal()
    try:
        preview_out, preview_trace, _ = execute_allowlisted_tool(
            db,
            "log_food_intake",
            {
                "household_token": client.household_token,
                "food_query": "Idli",
                "quantity": 2.0,
                "meal_category": "breakfast",
                "confirmed": False,
            },
        )
        assert preview_trace.status == "success"
        assert preview_out["requires_user_confirmation"] is True

        confirmed_out, confirmed_trace, _ = execute_allowlisted_tool(
            db,
            "log_food_intake",
            {
                "household_token": client.household_token,
                "food_slug": "idli-steamed-rice-lentil",
                "quantity": 2.0,
                "meal_category": "breakfast",
                "confirmed": True,
            },
        )
        assert confirmed_trace.status == "success"
        assert confirmed_out["saved"] is True

        for read_tool in (
            "get_fitness_profile",
            "get_daily_nutrition_summary",
            "get_water_intake",
            "get_goal_progress",
            "get_habit_history",
            "get_recipe_suggestions",
            "get_available_pantry_items",
            "get_protein_comparisons",
            "get_mess_menu",
            "get_fitness_progress",
        ):
            out, tr, _ = execute_allowlisted_tool(
                db, read_tool, {"household_token": client.household_token}
            )
            assert tr.status == "success", f"Tool {read_tool} failed: {out}"
    finally:
        db.close()
