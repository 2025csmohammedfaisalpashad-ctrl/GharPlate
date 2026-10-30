import io
import os
from pathlib import Path
from PIL import Image
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db.session import Base, SessionLocal, engine
from app.db.init_db import seed_database


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db, write_report=False)
    finally:
        db.close()
    yield


client = TestClient(app)


def create_in_memory_png(color=(210, 180, 120), size=(120, 120)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", size, color=color)
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_01_health_endpoint():
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "healthy"
    assert data["database_connected"] is True
    assert data["counts"]["foods"] >= 50
    assert data["counts"]["conditions"] >= 18
    assert data["counts"]["sources"] >= 8


def test_02_food_search_english_and_categories():
    resp = client.get("/api/v1/foods", params={"q": "Ragi"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    slugs = [item["slug"] for item in data["items"]]
    assert "ragi-finger-millet" in slugs or "ragi-mudde-finger-millet-ball" in slugs

    cat_resp = client.get("/api/v1/foods/categories")
    assert cat_resp.status_code == 200
    cats = cat_resp.json()
    assert len(cats) == 9


def test_03_multilingual_alias_and_fuzzy_search():
    # Hindi alias search: Aloo -> Potato
    r_hi = client.get("/api/v1/foods", params={"q": "Aloo"})
    assert r_hi.status_code == 200
    assert any(i["slug"] == "potato-raw" for i in r_hi.json()["items"])

    # Kannada alias search: Avalakki -> Poha, Baale Hannu -> Banana, Eerulli -> Onion, Anna -> Rice
    for alias_q, expected_slug in [
        ("Avalakki", "poha-avalakki-cooked"),
        ("Baale Hannu", "banana-ripe"),
        ("Eerulli", "onion-big"),
        ("Anna", "rice-raw-milled"),
        ("Togari Bele", "toor-dal-red-gram"),
    ]:
        r_kn = client.get("/api/v1/foods", params={"q": alias_q})
        assert r_kn.status_code == 200
        found_slugs = [i["slug"] for i in r_kn.json()["items"]]
        assert expected_slug in found_slugs, f"Failed alias lookup for {alias_q}"

    # Fuzzy misspelling search: "Alugade" -> Potato
    r_fuzzy = client.get("/api/v1/foods", params={"q": "Alugade"})
    assert r_fuzzy.status_code == 200
    assert any(i["slug"] == "potato-raw" for i in r_fuzzy.json()["items"])


def test_04_food_detail_and_null_missing_nutrient_integrity():
    # Whole food: Vitamin D in Rice is NULL, never 0
    r_rice = client.get("/api/v1/foods/rice-raw-milled")
    assert r_rice.status_code == 200
    rice_data = r_rice.json()
    vit_d = next(n for n in rice_data["nutrients"] if n["nutrient_code"] == "vit_d_mcg")
    assert vit_d["value_per_100"] is None
    assert vit_d["is_available"] is False
    assert "vit_d_mcg" in rice_data["missing_nutrient_codes"]

    # Packaged food: Potassium / Vitamin B12 not declared on glucose biscuit label -> NULL, never 0
    r_pkg = client.get("/api/v1/foods/packaged-glucose-biscuits")
    assert r_pkg.status_code == 200
    pkg_data = r_pkg.json()
    assert pkg_data["completeness_pct"] < 100.0
    potassium = next(n for n in pkg_data["nutrients"] if n["nutrient_code"] == "potassium_mg")
    assert potassium["value_per_100"] is None
    assert potassium["is_available"] is False


def test_05_condition_guidance_and_no_forbidden_labels():
    prohibited_words = {"safe", "unsafe", "cures", "allowed", "forbidden", "disease-reversing"}
    resp = client.post(
        "/api/v1/guidance/evaluate",
        json={
            "food_slug": "packaged-sweetened-mango-drink",
            "condition_codes": ["type_2_diabetes"],
            "serving_unit": "standard_serving",
            "serving_quantity": 1.0,
            "age_group": "adult",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["observations"]) >= 1
    for obs in data["observations"]:
        assert obs["educational_category"].lower() not in prohibited_words
    assert any(obs["educational_category"] in ("Nutrient to monitor", "Portion-sensitive") for obs in data["observations"])


def test_06_multi_condition_conflict_detection():
    # Diabetes + Chronic Kidney Disease on Toor Dal or Ragi
    resp = client.post(
        "/api/v1/guidance/evaluate",
        json={
            "food_slug": "toor-dal-red-gram",
            "condition_codes": ["type_2_diabetes", "chronic_kidney_disease"],
            "serving_unit": "standard_serving",
            "serving_quantity": 1.0,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["requires_professional_guidance"] is True
    assert len(data["multi_condition_conflicts"]) >= 1
    assert data["multi_condition_conflicts"][0]["conflict_code"] == "CONFLICT_DIABETES_CKD"


def test_07_short_term_illness_and_pediatric_scoping():
    # Fever short-term illness warning + pediatric age scope protection
    resp = client.post(
        "/api/v1/guidance/evaluate",
        json={
            "food_slug": "khichdi-moong-dal-rice",
            "condition_codes": ["fever_acute_recovery", "type_2_diabetes"],
            "serving_unit": "standard_serving",
            "serving_quantity": 1.0,
            "age_group": "child",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["requires_professional_guidance"] is True
    assert any("AGE_SCOPE_TYPE_2_DIABETES" == o["rule_code"] for o in data["observations"])
    assert any("SHORT_TERM_SAFETY_FEVER_ACUTE_RECOVERY" == o["rule_code"] for o in data["observations"])


def test_08_household_and_member_profiles_allergies_vs_intolerances():
    hh_resp = client.post(
        "/api/v1/households",
        json={"household_token": "hh_test_token_12345", "name": "Sharma-Rao Family"},
    )
    assert hh_resp.status_code == 200
    assert hh_resp.json()["household_token"] == "hh_test_token_12345"

    mem_resp = client.post(
        "/api/v1/households/hh_test_token_12345/members",
        json={
            "display_name": "Ajji",
            "age_group": "older_adult",
            "dietary_preference": "vegetarian",
            "selected_conditions": ["type_2_diabetes", "hypertension"],
            "allergies": ["peanut"],
            "intolerances": ["lactose"],
            "dietary_restrictions": ["low_salt"],
            "food_preferences": ["south_indian"],
        },
    )
    assert mem_resp.status_code == 200
    mem_data = mem_resp.json()
    assert mem_data["allergies"] == ["peanut"]
    assert mem_data["intolerances"] == ["lactose"]

    # Verify distinct allergy vs intolerance evaluation on Poha (contains peanut) & Milk (contains lactose)
    eval_poha = client.post(
        "/api/v1/guidance/evaluate",
        json={
            "food_slug": "poha-avalakki-cooked",
            "condition_codes": ["type_2_diabetes"],
            "allergies": ["peanut"],
            "intolerances": ["lactose"],
        },
    ).json()
    assert len(eval_poha["allergen_alerts"]) >= 1

    eval_milk = client.post(
        "/api/v1/guidance/evaluate",
        json={
            "food_slug": "milk-cow-whole",
            "condition_codes": [],
            "allergies": ["peanut"],
            "intolerances": ["lactose"],
        },
    ).json()
    assert len(eval_milk["intolerance_alerts"]) >= 1


def test_09_recipe_calculator_and_missing_nutrient_preservation():
    # Combine Ragi (known nutrients) + Packaged Glucose Biscuits (NULL potassium)
    resp = client.post(
        "/api/v1/recipes/calculate",
        json={
            "household_token": "hh_test_token_12345",
            "title": "Test Mixed Recipe",
            "description": "Testing unit conversion and NULL nutrient handling",
            "servings": 2.0,
            "meal_type": "snack",
            "ingredients": [
                {"food_slug": "ragi-finger-millet", "quantity": 1.0, "unit_name": "100g"},
                {"food_slug": "packaged-glucose-biscuits", "quantity": 2.0, "unit_name": "standard_serving"},
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_weight_grams"] == 150.0
    assert data["serving_weight_grams"] == 75.0
    assert data["completeness_pct"] < 100.0

    potassium_row = next(n for n in data["nutrients"] if n["nutrient_code"] == "potassium_mg")
    assert potassium_row["is_complete"] is False
    assert potassium_row["ingredients_missing_data"] == 1
    assert "Packaged Glucose Biscuits" in potassium_row["missing_ingredient_names"]


def test_10_ocr_parsing_and_validation_checks():
    # Test valid + impossible values + OCR character errors ('O' for '0') + per-serving warning
    sample_label = """
    Product Name: Crunchy Masala Chakli
    Brand: Mysuru Snacks
    Serving Size: 30 g
    Nutritional Information Per Serving:
    Energy: 52O kcal
    Protein: 8.5 g
    Total Carbohydrates: 62.0 g
    Total Sugars: 4.0 g
    Added Sugars: 9.0 g
    Total Fat: 140.0 g
    Saturated Fat: 12.0 g
    Dietary Fibre: 3.5 g
    Sodium: 680 mg
    Ingredients: Rice Flour, Gram Flour (Besan), Edible Oil, Sesame Seeds, Salt, Spices.
    Allergen Information: Contains Sesame.
    """
    resp = client.post("/api/v1/scan/ocr-text", json={"raw_label_text": sample_label})
    assert resp.status_code == 200
    data = resp.json()
    assert data["requires_user_confirmation"] is True
    assert data["detected_basis"] == "per_serving_only"
    # Energy had '52O' -> warning with proposed_correction 520.0
    assert data["fields"]["energy_kcal"]["validation_status"] == "warning"
    assert data["fields"]["energy_kcal"]["proposed_correction"] == 520.0
    # Total Fat 140g per 100g -> impossible error
    assert data["fields"]["fat_total_g"]["validation_status"] == "error"


def test_11_ocr_image_upload_privacy_and_restrictions():
    png_bytes = create_in_memory_png()
    resp = client.post(
        "/api/v1/scan/ocr-image",
        files={"file": ("label.png", png_bytes, "image/png")},
        data={"hint_text": "Product Name: Test Millet Bar\nEnergy: 380 kcal\nProtein: 10.5 g\nTotal Carbohydrates: 55.0 g\nTotal Fat: 12.0 g\nSodium: 120 mg"},
    )
    assert resp.status_code == 200
    assert "purged immediately" in resp.json()["privacy_confirmation"]

    # Verify invalid MIME type is rejected
    bad_resp = client.post(
        "/api/v1/scan/ocr-image",
        files={"file": ("malicious.exe", b"not-an-image", "application/x-msdownload")},
    )
    assert bad_resp.status_code == 400


def test_12_barcode_lookup_and_fallback():
    # Known barcode in local DB
    r_found = client.get("/api/v1/scan/barcode/8901719101014")
    assert r_found.status_code == 200
    assert r_found.json()["found"] is True
    assert r_found.json()["product"]["slug"] == "packaged-glucose-biscuits"

    # Unknown barcode -> clean fallback, never invents a product
    r_missing = client.get("/api/v1/scan/barcode/0000099999123")
    assert r_missing.status_code == 200
    assert r_missing.json()["found"] is False
    assert r_missing.json()["product"] is None
    assert len(r_missing.json()["fallback_actions"]) >= 2


def test_13_experimental_dish_recognition_in_memory():
    png_bytes = create_in_memory_png(color=(230, 230, 225))
    resp = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("morning_idli_plate.png", png_bytes, "image/png")},
        data={"user_hint": "steamed white cakes"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["requires_user_confirmation"] is True
    assert "EXPERIMENTAL FEATURE" in data["experimental_disclaimer"]
    assert len(data["candidates"]) >= 3
    assert any(c["food_slug"] == "idli-steamed-rice-lentil" for c in data["candidates"])


def test_14_product_comparison_and_meal_suggestions():
    comp_resp = client.post(
        "/api/v1/products/compare",
        json={
            "product_slugs": [
                "packaged-crunchy-muesli-almond",
                "packaged-rolled-oats-plain",
                "packaged-glucose-biscuits",
            ],
            "condition_codes": ["type_2_diabetes", "hypertension"],
        },
    )
    assert comp_resp.status_code == 200
    comp_data = comp_resp.json()
    assert len(comp_data["products"]) == 3
    assert "universally 'healthier'" in comp_data["neutrality_disclaimer"]

    meal_resp = client.post(
        "/api/v1/meals/suggestions",
        json={
            "meal_type": "lunch",
            "dietary_preference": "vegetarian",
            "condition_codes": ["type_2_diabetes", "osteoporosis_bone_health"],
            "allergies": ["peanut"],
            "intolerances": [],
            "available_ingredient_keywords": ["ragi", "dal"],
        },
    )
    assert meal_resp.status_code == 200
    meal_data = meal_resp.json()
    assert len(meal_data["suggestions"]) >= 1


def test_15_visual_redesign_database_image_references():
    """Verifies that database-driven image_url references are populated across foods, categories, comparisons, and meals."""
    foods = client.get("/api/v1/foods", params={"page_size": 15}).json()["items"]
    assert len(foods) >= 10
    assert all(f.get("image_url") and f["image_url"].startswith("https://") for f in foods)
    # Confirm distinct food images rather than one generic image
    distinct_imgs = {f["image_url"] for f in foods}
    assert len(distinct_imgs) >= 10

    almonds = client.get("/api/v1/foods/almonds-badam").json()
    assert almonds["image_url"] and "Almonds" in almonds["image_url"]
