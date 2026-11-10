from __future__ import annotations

from datetime import date
from app.main import app
from tests.conftest import AuthenticatedTestClient


def test_curated_indian_recipes_have_complete_ingredients_and_steps():
    client = AuthenticatedTestClient(app)
    res = client.get("/api/v1/recipes")
    assert res.status_code == 200
    recipes = res.json()
    slugs = {r["slug"]: r for r in recipes if r.get("slug")}

    expected_slugs = [
        "idli-steamed-rice-lentil",
        "masala-dosa-potato-palya",
        "ragi-mudde-palak-sambar",
        "ven-pongal-moong-rice",
        "vegetable-rava-upma",
        "vegetable-poha-avalakki",
        "moong-dal-vegetable-khichdi",
        "whole-wheat-chapati-phulka",
        "udupi-vegetable-sambar",
        "tomato-pepper-rasam",
        "homestyle-dal-tadka",
        "vegetable-basmati-pulao",
        "soya-paneer-gym-bowl",
        "sprouted-moong-protein-chaat",
        "idli-sambar-egg-plate",
    ]
    for slug in expected_slugs:
        assert slug in slugs, f"Expected curated recipe {slug} to be seeded"
        rec = slugs[slug]
        assert len(rec["ingredients"]) >= 1, f"Recipe {slug} should have ingredients"
        assert len(rec.get("steps") or []) >= 4, f"Recipe {slug} should have ordered cooking steps"
        assert rec.get("instructions_status") == "available"
        step_numbers = [s["step_number"] for s in rec["steps"]]
        assert step_numbers == sorted(step_numbers)


def test_recipe_detail_serving_scaling_and_null_nutrient_preservation():
    client = AuthenticatedTestClient(app)
    res_base = client.get("/api/v1/recipes/idli-steamed-rice-lentil")
    assert res_base.status_code == 200
    base = res_base.json()
    base_servings = base["servings"]
    base_first_grams = base["ingredients"][0]["grams_equivalent"]
    base_kcal_per_serving = next(
        n["per_serving_known_value"]
        for n in base["nutrients"]
        if n["nutrient_code"] == "energy_kcal"
    )
    base_kcal_total = next(
        n["total_known_value"]
        for n in base["nutrients"]
        if n["nutrient_code"] == "energy_kcal"
    )

    res_scaled = client.get(
        f"/api/v1/recipes/idli-steamed-rice-lentil?servings={base_servings * 2}"
    )
    assert res_scaled.status_code == 200
    scaled = res_scaled.json()
    assert scaled["servings"] == base_servings * 2
    assert abs(scaled["ingredients"][0]["grams_equivalent"] - base_first_grams * 2) < 0.5

    scaled_kcal_per_serving = next(
        n["per_serving_known_value"]
        for n in scaled["nutrients"]
        if n["nutrient_code"] == "energy_kcal"
    )
    scaled_kcal_total = next(
        n["total_known_value"]
        for n in scaled["nutrients"]
        if n["nutrient_code"] == "energy_kcal"
    )
    assert abs(scaled_kcal_per_serving - base_kcal_per_serving) < 0.5
    assert abs(scaled_kcal_total - base_kcal_total * 2) < 1.0


def test_recipe_enrichment_rating_and_confirmed_diary_logging():
    client = AuthenticatedTestClient(app)
    # Create a custom recipe without steps first
    create_res = client.post(
        "/api/v1/recipes/calculate",
        json={
            "title": "Quick Custom Moong & Palak Bowl",
            "servings": 2,
            "meal_type": "lunch",
            "ingredients": [
                {
                    "food_slug": "toor-dal-red-gram",
                    "quantity": 60,
                    "unit_name": "100g",
                    "preparation_note": "Boiled",
                },
                {
                    "food_slug": "spinach-palak",
                    "quantity": 50,
                    "unit_name": "100g",
                    "preparation_note": "Chopped",
                },
            ],
        },
    )
    assert create_res.status_code == 200
    custom = create_res.json()
    recipe_id = custom["id"]

    # Enrich missing cooking steps from verified ingredients
    enrich_res = client.post(f"/api/v1/recipes/{recipe_id}/enrich")
    assert enrich_res.status_code == 200
    enriched = enrich_res.json()
    assert enriched["instructions_status"] == "available"
    assert len(enriched["steps"]) >= 3

    # Rate and favourite the recipe
    rate_res = client.post(
        f"/api/v1/recipes/{recipe_id}/rate",
        json={"user_rating": 5, "is_favourite": True},
    )
    assert rate_res.status_code == 200
    rated = rate_res.json()
    assert rated["user_rating"] == 5
    assert rated["is_favourite"] is True

    # Log to food diary: must reject unconfirmed calls
    unconfirmed_res = client.post(
        f"/api/v1/recipes/{recipe_id}/log-diary",
        json={
            "servings_consumed": 1.0,
            "meal_category": "lunch",
            "user_confirmed": False,
        },
    )
    assert unconfirmed_res.status_code == 400

    # Confirmed food diary log succeeds and records proportional nutrition
    confirmed_res = client.post(
        f"/api/v1/recipes/{recipe_id}/log-diary",
        json={
            "servings_consumed": 1.0,
            "meal_category": "lunch",
            "logged_date": str(date.today()),
            "user_confirmed": True,
        },
    )
    assert confirmed_res.status_code == 200
    diary_payload = confirmed_res.json()
    assert diary_payload["logged"] is True
    assert diary_payload["entry"]["food_name"] == "Quick Custom Moong & Palak Bowl"


def test_persistent_achievements_idempotency_migration_and_preferences():
    client = AuthenticatedTestClient(app)
    hh_res = client.get("/api/v1/households/me")
    assert hh_res.status_code == 200
    members = hh_res.json().get("members") or []
    if not members:
        m_create = client.post(
            "/api/v1/households/me/members",
            json={
                "display_name": "Aarav",
                "age_group": "adult",
                "dietary_preference": "vegetarian",
                "primary_goal": "build_muscle",
                "selected_conditions": [],
                "allergies": [],
                "intolerances": [],
            },
        )
        assert m_create.status_code == 200
        created_json = m_create.json()
        member_id = created_json.get("id") or created_json["members"][0]["id"]
    else:
        member_id = members[0]["id"]

    # Log a food entry and water entry to trigger Getting Started achievements
    f_res = client.post(
        "/api/v1/tracker/food-logs",
        json={
            "member_id": member_id,
            "logged_date": str(date.today()),
            "meal_category": "breakfast",
            "food_slug": "idli-steamed-rice-lentil",
            "quantity": 1,
            "unit_name": "standard_serving",
        },
    )
    assert f_res.status_code == 200

    w_res = client.post(
        "/api/v1/hydration/logs",
        json={
            "member_id": member_id,
            "logged_date": str(date.today()),
            "amount_ml": 300,
            "container_type": "large_glass",
        },
    )
    assert w_res.status_code == 200

    ach1 = client.get(f"/api/v1/fitness/achievements?member_id={member_id}")
    assert ach1.status_code == 200
    data1 = ach1.json()
    earned_codes_1 = {a["code"] for a in data1["earned_achievements"]}
    assert "first_meal_logged" in earned_codes_1
    assert "first_water_logged" in earned_codes_1
    count_after_first = len(data1["earned_achievements"])

    # Calling a second time must NOT duplicate once-only achievements
    ach2 = client.get(f"/api/v1/fitness/achievements?member_id={member_id}")
    assert ach2.status_code == 200
    data2 = ach2.json()
    assert len(data2["earned_achievements"]) == count_after_first

    # Migrate browser localStorage badges safely and idempotently
    mig_res = client.post(
        "/api/v1/fitness/achievements/migrate-local",
        json={
            "member_id": member_id,
            "local_badge_codes": ["three_day_rhythm"],
        },
    )
    assert mig_res.status_code == 200
    mig_data = mig_res.json()
    assert "habit_days_3" in mig_data["migrated_codes"]

    # Repeating the exact same migration must not create duplicates
    mig_res_repeat = client.post(
        "/api/v1/fitness/achievements/migrate-local",
        json={
            "member_id": member_id,
            "local_badge_codes": ["three_day_rhythm"],
        },
    )
    assert mig_res_repeat.status_code == 200
    assert mig_res_repeat.json()["migrated_codes"] == []

    # Non-destructive reward celebration disable toggle
    pref_res = client.put(
        "/api/v1/fitness/achievements/preferences",
        json={"member_id": member_id, "rewards_enabled": False},
    )
    assert pref_res.status_code == 200
    assert pref_res.json()["rewards_enabled"] is False

    # Earned history remains intact when celebrations are disabled
    ach3 = client.get(f"/api/v1/fitness/achievements?member_id={member_id}")
    assert ach3.status_code == 200
    assert len(ach3.json()["earned_achievements"]) >= count_after_first + 1


def test_interactive_3d_body_nutrition_explorer_endpoints():
    client = AuthenticatedTestClient(app)
    list_res = client.get("/api/v1/explore/body-nutrition")
    assert list_res.status_code == 200
    payload = list_res.json()
    regions = payload["regions"]
    assert len(regions) >= 9
    codes = {r["code"] for r in regions}
    assert {
        "brain_nerves",
        "eyes_vision",
        "heart_cardiovascular",
        "bones_joints",
        "muscles_strength",
        "digestive_gut",
        "blood_circulation",
        "skin_epithelial",
        "immune_defence",
    }.issubset(codes)

    # Fetch detailed physiological, nutrient, and Indian food links for Eyes & Vision and Heart
    for region_code in ("eyes_vision", "heart_cardiovascular", "muscles_strength"):
        detail_res = client.get(f"/api/v1/explore/body-nutrition/{region_code}")
        assert detail_res.status_code == 200
        detail = detail_res.json()
        assert detail["code"] == region_code
        assert len(detail["nutrients"]) >= 3
        assert len(detail["foods"]) >= 3
        for food in detail["foods"]:
            assert food["slug"]
            assert food["relevance_explanation"]
            assert food["source_name"]
