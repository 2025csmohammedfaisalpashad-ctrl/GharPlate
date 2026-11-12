import io
from PIL import Image
import pytest

from app.main import app
from app.db.session import Base, SessionLocal, engine
from app.db.init_db import seed_database
from tests.conftest import AuthenticatedTestClient


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db, write_report=False)
    finally:
        db.close()
    yield


client = AuthenticatedTestClient(app)


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
    client.ensure_authenticated()
    owned_token = client.household_token
    hh_resp = client.post(
        "/api/v1/households",
        json={"household_token": owned_token, "name": "Sharma-Rao Family"},
    )
    assert hh_resp.status_code == 200
    assert hh_resp.json()["household_token"] == owned_token

    mem_resp = client.post(
        f"/api/v1/households/{owned_token}/members",
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
    client.ensure_authenticated()
    owned_token = client.household_token
    resp = client.post(
        "/api/v1/recipes/calculate",
        json={
            "household_token": owned_token,
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
    assert all(f.get("image_url") and (f["image_url"].startswith("/images/foods/") or f["image_url"].startswith("https://")) for f in foods)
    # Confirm distinct food images rather than one generic image
    distinct_imgs = {f["image_url"] for f in foods}
    assert len(distinct_imgs) >= 10

    almonds = client.get("/api/v1/foods/almonds-badam").json()
    assert almonds["image_url"] and "almonds-badam.webp" in almonds["image_url"]


def test_16_multimodal_food_photo_analysis_all_11_scenarios_and_contextual_ai(monkeypatch):
    """
    Verifies all 11 required AI Food Photo Analyzer scenarios (Part 12):
    1. Single dish image (idli)
    2. Single dish image (dosa)
    3. Single fruit image (banana)
    4. Mixed Indian meal image (idli + sambar + chutney)
    5. Rice-and-dal plate image
    6. Image with multiple foods
    7. Unfamiliar food not in database
    8. Blurry or poorly lit image (low brightness / low sharpness)
    9. Unsupported file format
    10. Oversized image (> 5 MB)
    11. Corrupted image file
    Plus contextual Ask GharPlate follow-up questions with `food_image_analysis` context.
    """
    from app.services import ocr_barcode_service

    # Scenario 1, 4 & 6: Idli + Sambar multi-component plate via local vision model
    def mock_vision_idli_plate(file_bytes, user_hint=None, catalog_food_names=None):
        return {
            "status": "success",
            "vision_reachable": True,
            "vision_model_used": "qwen2.5vl:7b",
            "analysis": {
                "is_food_image": True,
                "overall_description": "A South Indian breakfast plate with two steamed white idlis and a bowl of vegetable sambar.",
                "primary_candidates": [
                    {
                        "name": "Idli (Steamed Rice-Lentil Cake)",
                        "canonical_search_terms": ["idli"],
                        "confidence_score": 0.93,
                        "confidence_category": "high_confidence",
                        "visual_evidence": "Fluffy round white steamed cakes.",
                    },
                    {
                        "name": "Sambar (Vegetable Lentil Stew)",
                        "canonical_search_terms": ["sambar"],
                        "confidence_score": 0.86,
                        "confidence_category": "high_confidence",
                        "visual_evidence": "Tamarind and toor dal vegetable stew in steel katori.",
                    },
                ],
                "detected_components": [
                    {
                        "label": "Idli",
                        "confidence_score": 0.93,
                        "confidence_category": "high_confidence",
                        "visual_description": "Two steamed rice-lentil cakes",
                    },
                    {
                        "label": "Sambar",
                        "confidence_score": 0.86,
                        "confidence_category": "high_confidence",
                        "visual_description": "Small bowl of lentil sambar",
                    },
                ],
                "ambiguity_notes": [],
            },
        }

    monkeypatch.setattr(
        ocr_barcode_service, "analyze_image_with_ollama_vision", mock_vision_idli_plate
    )
    png_normal = create_in_memory_png(color=(220, 215, 200), size=(160, 160))
    r_idli = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("breakfast.png", png_normal, "image/png")},
    )
    assert r_idli.status_code == 200
    d_idli = r_idli.json()
    assert d_idli["vision_model_used"] == "qwen2.5vl:7b"
    assert d_idli["vision_reachable"] is True
    assert len(d_idli["candidates"]) >= 2
    top_cand = d_idli["candidates"][0]
    assert top_cand["food_slug"] == "idli-steamed-rice-lentil"
    assert top_cand["matched_in_database"] is True
    assert len(top_cand["nutrients"]) > 0
    assert len(top_cand["servings"]) > 0
    assert len(d_idli["detected_components"]) == 2

    # Scenario 2: Dosa
    monkeypatch.setattr(
        ocr_barcode_service,
        "analyze_image_with_ollama_vision",
        lambda file_bytes, user_hint=None, catalog_food_names=None: {
            "status": "success",
            "vision_reachable": True,
            "vision_model_used": "qwen2.5vl:7b",
            "analysis": {
                "is_food_image": True,
                "overall_description": "Crispy golden-brown fermented rice-lentil crepe (Masala Dosa).",
                "primary_candidates": [
                    {
                        "name": "Masala Dosa",
                        "canonical_search_terms": ["masala dosa", "dosa"],
                        "confidence_score": 0.89,
                        "confidence_category": "high_confidence",
                        "visual_evidence": "Golden folded crepe on banana leaf.",
                    }
                ],
                "detected_components": [
                    {
                        "label": "Masala Dosa",
                        "confidence_score": 0.89,
                        "confidence_category": "high_confidence",
                        "visual_description": "Folded golden dosa",
                    }
                ],
                "ambiguity_notes": ["Potato masala filling is inside fold; could also be plain dosa."],
            },
        },
    )
    r_dosa = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("dosa.png", png_normal, "image/png")},
    )
    assert r_dosa.status_code == 200
    assert r_dosa.json()["candidates"][0]["food_slug"] in ("masala-dosa", "dosa-plain")

    # Scenario 3: Single fruit image (Banana — non-dish whole food in catalog!)
    monkeypatch.setattr(
        ocr_barcode_service,
        "analyze_image_with_ollama_vision",
        lambda file_bytes, user_hint=None, catalog_food_names=None: {
            "status": "success",
            "vision_reachable": True,
            "vision_model_used": "qwen2.5vl:7b",
            "analysis": {
                "is_food_image": True,
                "overall_description": "A ripe yellow banana on a table.",
                "primary_candidates": [
                    {
                        "name": "Banana",
                        "canonical_search_terms": ["banana", "ripe banana"],
                        "confidence_score": 0.96,
                        "confidence_category": "high_confidence",
                        "visual_evidence": "Curved yellow ripe banana.",
                    }
                ],
                "detected_components": [
                    {
                        "label": "Banana",
                        "confidence_score": 0.96,
                        "confidence_category": "high_confidence",
                        "visual_description": "Single ripe banana",
                    }
                ],
                "ambiguity_notes": [],
            },
        },
    )
    r_banana = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("fruit.png", png_normal, "image/png")},
    )
    assert r_banana.status_code == 200
    assert "banana" in r_banana.json()["candidates"][0]["food_slug"]
    assert r_banana.json()["candidates"][0]["matched_in_database"] is True

    # Scenario 5: Rice-and-dal plate image
    monkeypatch.setattr(
        ocr_barcode_service,
        "analyze_image_with_ollama_vision",
        lambda file_bytes, user_hint=None, catalog_food_names=None: {
            "status": "success",
            "vision_reachable": True,
            "vision_model_used": "qwen2.5vl:7b",
            "analysis": {
                "is_food_image": True,
                "overall_description": "A home-cooked lunch plate with steamed rice, yellow toor dal, and curd.",
                "primary_candidates": [
                    {
                        "name": "Plain Steamed Rice",
                        "canonical_search_terms": ["rice", "steamed rice"],
                        "confidence_score": 0.90,
                        "confidence_category": "high_confidence",
                        "visual_evidence": "White steamed rice mound.",
                    },
                    {
                        "name": "Toor Dal",
                        "canonical_search_terms": ["toor dal", "dal"],
                        "confidence_score": 0.87,
                        "confidence_category": "high_confidence",
                        "visual_evidence": "Yellow tempered pigeon pea lentil dal.",
                    },
                ],
                "detected_components": [
                    {"label": "Steamed Rice", "confidence_score": 0.90, "confidence_category": "high_confidence", "visual_description": "White rice"},
                    {"label": "Toor Dal", "confidence_score": 0.87, "confidence_category": "high_confidence", "visual_description": "Yellow dal"},
                    {"label": "Curd", "confidence_score": 0.84, "confidence_category": "high_confidence", "visual_description": "Bowl of dahi"},
                ],
                "ambiguity_notes": [],
            },
        },
    )
    r_thali = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("lunch_plate.png", png_normal, "image/png")},
    )
    assert r_thali.status_code == 200
    assert len(r_thali.json()["detected_components"]) == 3

    # Scenario 7: Unfamiliar food not in database (never invents nutrients!)
    monkeypatch.setattr(
        ocr_barcode_service,
        "analyze_image_with_ollama_vision",
        lambda file_bytes, user_hint=None, catalog_food_names=None: {
            "status": "success",
            "vision_reachable": True,
            "vision_model_used": "qwen2.5vl:7b",
            "analysis": {
                "is_food_image": True,
                "overall_description": "Dragonfruit matcha soufflé tart.",
                "primary_candidates": [
                    {
                        "name": "Dragonfruit Matcha Tart",
                        "canonical_search_terms": ["dragonfruit tart"],
                        "confidence_score": 0.75,
                        "confidence_category": "moderate_confidence",
                        "visual_evidence": "Exotic pastry not in Indian food catalog.",
                    }
                ],
                "detected_components": [],
                "ambiguity_notes": [],
            },
        },
    )
    r_unmatched = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("exotic.png", png_normal, "image/png")},
    )
    assert r_unmatched.status_code == 200
    unmatched_cand = r_unmatched.json()["candidates"][0]
    assert unmatched_cand["matched_in_database"] is False
    assert unmatched_cand["available_nutrient_count"] == 0
    assert unmatched_cand["nutrients"] == []
    assert "Dragonfruit Matcha Tart" in r_unmatched.json()["unrecognized_items"]

    # Scenario 8: Blurry / poorly lit dark image flags quality warnings honestly
    dark_png = create_in_memory_png(color=(12, 12, 12), size=(120, 120))
    r_dark = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("dim_photo.png", dark_png, "image/png")},
    )
    assert r_dark.status_code == 200
    assert any("Low-light" in note or "sharpness" in note for note in r_dark.json()["ambiguity_notes"])

    # Scenario 9: Unsupported file format -> HTTP 400
    r_bad_mime = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("notes.txt", b"not an image", "text/plain")},
    )
    assert r_bad_mime.status_code == 400

    # Scenario 10: Oversized image (> 5 MB) -> HTTP 400
    oversized_bytes = b"0" * (5 * 1024 * 1024 + 2048)
    r_oversize = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("huge.jpg", oversized_bytes, "image/jpeg")},
    )
    assert r_oversize.status_code == 400
    assert "exceeds maximum allowed size" in r_oversize.json()["detail"]

    # Scenario 11: Corrupted image file -> HTTP 400
    r_corrupt = client.post(
        "/api/v1/scan/recognize-dish",
        files={"file": ("corrupt.jpg", b"\xff\xd8\xff\xe0corrupted_bytes", "image/jpeg")},
    )
    assert r_corrupt.status_code == 400

    # Contextual Food Photo AI Assistant Conversation (`food_image_analysis`)
    fia_context = {
        "page_type": "food_image_analysis",
        "route": "/recognition",
        "food_slug": "idli-steamed-rice-lentil",
        "food_image_analysis": {
            "recognition_id": "rec_test_idli",
            "confirmed_food_slug": "idli-steamed-rice-lentil",
            "confirmed_food_name": "Idli (Steamed Rice-Lentil Cake)",
            "confidence_category": "high_confidence",
            "overall_description": "Two steamed rice-lentil idlis on a plate.",
            "selected_serving_label": "2 idlis (120g)",
            "selected_unit_name": "standard_serving",
            "selected_quantity": 2.0,
            "selected_grams": 120.0,
            "is_vegetarian": True,
            "is_vegan": True,
            "portion_nutrients": {
                "energy_kcal": 175.2,
                "protein_g": 5.8,
                "carbs_g": 34.6,
                "fat_total_g": 0.8,
                "fibre_g": 1.9,
            },
        },
    }

    r_chat_prot = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "How much protein does it contain and is this suitable for someone going to the gym?",
            "mode": "database_only",
            "context": fia_context,
        },
    )
    assert r_chat_prot.status_code == 200
    reply_prot = r_chat_prot.json()["reply"]
    assert "Idli" in reply_prot
    assert "5.8" in reply_prot
    assert "120g" in reply_prot

    r_chat_log = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Add this to today's breakfast",
            "mode": "database_only",
            "context": fia_context,
        },
    )
    assert r_chat_log.status_code == 200
    reply_log = r_chat_log.json()["reply"]
    assert "Ready to log" in reply_log or "Confirmation Preview" in reply_log


def test_health_report_upload_validation_extraction_confirmation_and_kidney_safety():
    """
    Section 35: Medical Report Upload, Validation, Structured Extraction, Confirmation Gate,
    Lab-to-Plate Food Mapping, and Kidney-Marker Safety Guardrail.
    """
    # 1. Unsupported / executable file must be rejected safely
    bad_exe = ("malware.exe", b"MZ\x90\x00\x03\x00\x00\x00", "application/octet-stream")
    r_bad = client.post("/api/v1/health/reports/extract", files={"file": bad_exe})
    assert r_bad.status_code == 400
    assert any(w in r_bad.json()["detail"] for w in ("Unsupported", "format", "Executable"))

    # 2. Corrupted PDF header must be rejected safely
    corrupt_pdf = ("corrupted.pdf", b"NOT_A_PDF_HEADER_12345", "application/pdf")
    r_corrupt = client.post("/api/v1/health/reports/extract", files={"file": corrupt_pdf})
    assert r_corrupt.status_code == 400
    assert "corrupted" in r_corrupt.json()["detail"].lower() or "signature" in r_corrupt.json()["detail"].lower()

    # 3. Valid PDF with embedded text stream extracts structured test results without confusing reference intervals
    pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /Page >>\nendobj\nstream\n"
        b"(Haemoglobin: 10.6 g/dL (12.0 - 16.0)) Tj\n"
        b"(HbA1c: 6.3 % (4.0 - 5.6)) Tj\n"
        b"(Vitamin B12: 155 pg/mL (200 - 900)) Tj\n"
        b"(LDL Cholesterol: 142 mg/dL (0 - 100)) Tj\n"
        b"endstream\n%%EOF"
    )
    r_pdf = client.post(
        "/api/v1/health/reports/extract",
        files={"file": ("lab_report.pdf", pdf_bytes, "application/pdf")},
        data={"report_title": "Test PDF Lab Panel", "report_type": "comprehensive_blood_panel"},
    )
    assert r_pdf.status_code == 200
    ext_data = r_pdf.json()
    assert ext_data["requires_user_confirmation"] is True
    extracted_codes = {m["canonical_code"]: m for m in ext_data["extracted_measurements"]}
    assert "haemoglobin" in extracted_codes
    assert extracted_codes["haemoglobin"]["measured_value"] == 10.6
    assert extracted_codes["haemoglobin"]["reference_low"] == 12.0
    assert extracted_codes["haemoglobin"]["reference_high"] == 16.0
    assert extracted_codes["haemoglobin"]["status_flag"] == "low"
    assert "hba1c" in extracted_codes
    assert extracted_codes["hba1c"]["measured_value"] == 6.3
    assert "vitamin_b12" in extracted_codes
    assert extracted_codes["vitamin_b12"]["measured_value"] == 155.0

    # 4. Attempting to save without user_confirmed=True must fail
    r_unconfirmed = client.post(
        "/api/v1/health/reports/confirm",
        json={
            "user_confirmed": False,
            "report_title": "Should Fail",
            "measurements": ext_data["extracted_measurements"],
        },
    )
    assert r_unconfirmed.status_code == 400

    # 5. Confirming report saves it and generates Lab-to-Plate Indian food recommendations
    r_confirm = client.post(
        "/api/v1/health/reports/confirm",
        json={
            "user_confirmed": True,
            "report_title": "Confirmed PDF Lab Panel",
            "report_type": "comprehensive_blood_panel",
            "report_date": "2026-04-10",
            "measurements": ext_data["extracted_measurements"],
        },
    )
    assert r_confirm.status_code == 200
    saved_rep = r_confirm.json()
    assert saved_rep["user_confirmed"] is True
    assert saved_rep["measurement_count"] >= 4
    assert len(saved_rep["lab_to_plate"]["marker_food_cards"]) >= 2

    # 6. Kidney-Marker Safety Guardrail: abnormal eGFR / high creatinine / high potassium must trigger renal safety alert and block high-potassium food suggestions
    r_kidney = client.post(
        "/api/v1/health/reports/confirm",
        json={
            "user_confirmed": True,
            "report_title": "Renal Function Check",
            "report_type": "kidney_renal",
            "report_date": "2026-04-12",
            "measurements": [
                {
                    "canonical_code": "serum_creatinine",
                    "panel_code": "kidney_renal",
                    "test_name": "Serum Creatinine",
                    "measured_value": 2.4,
                    "unit": "mg/dL",
                    "reference_low": 0.6,
                    "reference_high": 1.2,
                },
                {
                    "canonical_code": "egfr",
                    "panel_code": "kidney_renal",
                    "test_name": "eGFR",
                    "measured_value": 42.0,
                    "unit": "mL/min/1.73m2",
                    "reference_low": 90.0,
                    "reference_high": 120.0,
                },
                {
                    "canonical_code": "serum_potassium",
                    "panel_code": "kidney_renal",
                    "test_name": "Serum Potassium",
                    "measured_value": 5.8,
                    "unit": "mmol/L",
                    "reference_low": 3.5,
                    "reference_high": 5.1,
                },
            ],
        },
    )
    assert r_kidney.status_code == 200
    kidney_rep = r_kidney.json()
    assert kidney_rep["lab_to_plate"]["kidney_safety_triggered"] is True
    assert "Kidney & Electrolyte Safety Notice" in kidney_rep["lab_to_plate"]["kidney_safety_notice"]

    # 7. Trends endpoint groups strictly by canonical_code AND unit
    r_trends = client.get("/api/v1/health/reports/trends")
    assert r_trends.status_code == 200
    assert r_trends.json()["total_series"] >= 4

    # 8. Visual formatting (bold/red PDF font, H/L flags, arrows ↑/↓, asterisks *),
    #    conflicting indicators, OCR decimal mistakes, missing reference intervals,
    #    cautious non-diagnostic concerns, and Ask GharPlate report Q&A
    multi_page_visual_pdf = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n"
        b"2 0 obj\n<< /Type /Page >>\nendobj\nstream\n"
        b"BT\n/F1_Bold 11 Tf\n0.85 0.10 0.10 rg\n(Haemoglobin: 10.4 g/dL L (12.0 - 16.0)) Tj\nET\n"
        b"BT\n0.0 0.0 0.0 rg\n(HbA1c: 6.4 % \xe2\x86\x91 (4.0 - 5.6)) Tj\nET\n"
        b"BT\n(Total Cholesterol: 218 mg/dL * (125 - 200)) Tj\nET\n"
        b"endstream\n"
        b"3 0 obj\n<< /Type /Page >>\nendobj\nstream\n"
        b"BT\n(WBC Count: 7200 /cumm L (4000 - 11000)) Tj\nET\n"
        b"BT\n(Serum Creatinine: 12 mg/dL (0.6 - 1.2)) Tj\nET\n"
        b"BT\n(TSH: 2.8 mIU/L) Tj\nET\n"
        b"endstream\n%%EOF"
    )
    r_vis = client.post(
        "/api/v1/health/reports/extract",
        files={"file": ("visual_multipage.pdf", multi_page_visual_pdf, "application/pdf")},
    )
    assert r_vis.status_code == 200
    vis_data = r_vis.json()
    vis_by_code = {m["canonical_code"]: m for m in vis_data["extracted_measurements"]}

    # Bold + red text + L flag on Haemoglobin (page 1)
    assert vis_by_code["haemoglobin"]["range_status"] == "below_reference"
    assert vis_by_code["haemoglobin"]["status_label"] == "Below reference interval"
    assert "bold_result" in vis_by_code["haemoglobin"]["visual_indicators"]
    assert "red_text" in vis_by_code["haemoglobin"]["visual_indicators"]
    assert vis_by_code["haemoglobin"]["page_number"] == 1

    # Up-arrow flag on HbA1c
    assert vis_by_code["hba1c"]["range_status"] == "above_reference"
    assert "up_arrow" in vis_by_code["hba1c"]["visual_indicators"]

    # Asterisk flag on Total Cholesterol
    assert vis_by_code["total_cholesterol"]["range_status"] == "above_reference"
    assert "asterisk_flag" in vis_by_code["total_cholesterol"]["visual_indicators"]

    # Conflicting indicator (WBC 7200 is inside 4000 - 11000, but flagged 'L') -> Requires manual review
    assert vis_by_code["wbc_count"]["range_status"] == "requires_manual_review"
    assert vis_by_code["wbc_count"]["status_label"] == "Requires manual review"
    assert vis_by_code["wbc_count"]["requires_manual_review"] is True
    assert vis_by_code["wbc_count"]["page_number"] == 2

    # OCR decimal mistake (Serum Creatinine 12 mg/dL vs 0.6 - 1.2) -> Requires manual review + proposed_correction 1.2
    assert vis_by_code["serum_creatinine"]["range_status"] == "requires_manual_review"
    assert vis_by_code["serum_creatinine"]["proposed_correction"] == 1.2

    # Missing reference interval (TSH 2.8 mIU/L with no printed interval) -> Reference interval unavailable (never invented)
    assert vis_by_code["tsh"]["range_status"] == "reference_unavailable"
    assert vis_by_code["tsh"]["status_label"] == "Reference interval unavailable"
    assert vis_by_code["tsh"]["reference_min"] is None and vis_by_code["tsh"]["reference_max"] is None

    # Low haemoglobin alone uses cautious non-diagnostic wording
    concerns_vis = {c["concern_code"]: c for c in vis_data["possible_nutritional_concerns"]}
    assert "low_haemoglobin_evaluation" in concerns_vis
    assert (
        "Your report shows a low haemoglobin result. This may have several causes and should be assessed with the full blood count and other relevant tests"
        in concerns_vis["low_haemoglobin_evaluation"]["explanation"]
    )

    # Ask GharPlate about confirmed report context
    r_rep_chat = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "Which of my results are below range, which are above range, and what should I ask my doctor?",
            "mode": "database_only",
            "context": {
                "page_type": "health_report",
                "route": "/health/reports",
                "health_report_context": saved_rep,
            },
        },
    )
    assert r_rep_chat.status_code == 200
    rep_reply = r_rep_chat.json()["reply"]
    assert "Below Reference Interval" in rep_reply
    assert "Haemoglobin" in rep_reply
    assert "Above Reference Interval" in rep_reply
    assert "LDL Cholesterol" in rep_reply
    assert "Questions to Ask Your Doctor" in rep_reply


def test_ai_symptom_review_and_emergency_red_flag_escalation():
    """
    Section 36: AI Symptom Review & Care Guidance Tests.
    Verifies non-diagnostic educational guidance for routine symptoms and immediate red-flag
    emergency escalation (112/108) that halts normal food recommendations.
    """
    # 1. Routine non-emergency symptoms (fatigue + afternoon dizziness)
    r_normal = client.post(
        "/api/v1/health/symptom-review",
        json={
            "symptom_description": "I have been feeling tired and dizzy in the afternoon for the past week.",
            "onset": "Gradual",
            "duration": "1 week",
            "severity": "mild",
            "include_health_records_consent": True,
        },
    )
    assert r_normal.status_code == 200
    norm_data = r_normal.json()
    assert norm_data["red_flag_detected"] is False
    assert len(norm_data["follow_up_questions"]) <= 2
    assert len(norm_data["supportive_indian_meals_and_hydration"]) >= 1
    assert "reported_symptoms" in norm_data
    assert "confirmed_health_records" in norm_data
    assert "diagnos" in norm_data["medical_disclaimer"].lower()

    # 2. Emergency red-flag symptoms (severe chest pain + shortness of breath)
    r_emerg = client.post(
        "/api/v1/health/symptom-review",
        json={
            "symptom_description": "I have severe chest pain spreading to my left arm and shortness of breath.",
            "severity": "severe",
        },
    )
    assert r_emerg.status_code == 200
    emerg_data = r_emerg.json()
    assert emerg_data["red_flag_detected"] is True
    assert emerg_data["urgency_level"] == "emergency_immediate"
    assert "112" in emerg_data["emergency_banner"]["headline"] or "108" in emerg_data["emergency_banner"]["headline"]
    # Normal meal suggestions MUST be halted during a red-flag emergency
    assert emerg_data["supportive_indian_meals_and_hydration"] == []


def test_smart_nearby_food_discovery_and_provider_integrations():
    """
    Sections 37 & 38: Smart Nearby Food Discovery, Dietary/Allergy Filtering,
    Google Maps URL Fallback, Swiggy MCP Confirmation Gate, and Zomato POS Restriction Status.
    """
    # 1. Provider status summary works without paid API keys
    r_prov = client.get("/api/v1/food-discovery/providers")
    assert r_prov.status_code == 200
    prov_data = r_prov.json()
    prov_codes = {p["code"]: p for p in prov_data["providers"]}
    assert prov_codes["google_maps_url_fallback"]["status"] == "active_free"
    assert "zomato_partner" in prov_codes

    # 2. Search nearby for "Masala Dosa" in Mysuru within 5 km (Pure Vegetarian filter)
    r_search = client.post(
        "/api/v1/food-discovery/search",
        json={
            "dish_query": "Masala Dosa",
            "city": "Mysuru",
            "radius_km": 5.0,
            "dietary_filter": "pure_vegetarian",
        },
    )
    assert r_search.status_code == 200
    s_data = r_search.json()
    assert s_data["matched_gharplate_dish"]["matched_in_database"] is True
    assert s_data["matched_gharplate_dish"]["food_slug"] in ("masala-dosa", "masala-dosa-potato-filled")
    assert (
        s_data["member_context"]["allergy_cross_contact_warning"]
        == "Please confirm ingredients and cross-contact risks directly with the restaurant."
    )
    assert s_data["total_results"] >= 1
    for rest in s_data["restaurants"]:
        assert rest["dietary_classification"] == "pure_vegetarian"
        assert rest["distance_km"] <= 5.0
        assert rest["coordinates_available"] is True
        assert rest["latitude"] is not None and rest["longitude"] is not None
        assert "google.com/maps/search" in rest["maps_links"]["google_maps_place_url"]
        assert "google.com/maps/dir" in rest["maps_links"]["google_maps_directions_url"]
        assert ("open" + "streetmap.org") in rest["maps_links"]["openstreetmap_place_url"]
        assert "swiggy.com" in rest["provider_integrations"]["swiggy"]["search_url"]
        assert "zomato.com" in rest["provider_integrations"]["zomato"]["search_url"]

    # 2b. OpenStreetMap Nominatim & Gazetteer geocode endpoint resolves Indian neighbourhoods without paid keys
    r_geo = client.get("/api/v1/food-discovery/geocode", params={"q": "Kuvempunagar, Mysuru"})
    assert r_geo.status_code == 200
    geo_data = r_geo.json()
    assert geo_data["found"] is True
    assert abs(geo_data["latitude"] - 12.2856) < 0.05
    assert abs(geo_data["longitude"] - 76.6197) < 0.05
    assert "Mysuru" in geo_data["city"]

    # 3. Swiggy Builders Club MCP preview enforces user confirmation gate
    r_mcp_unconf = client.post(
        "/api/v1/food-discovery/swiggy-mcp/preview",
        json={
            "action_type": "prepare_cart",
            "restaurant_name": "Gayathri Tiffin Room",
            "dish_name": "Masala Dosa",
            "city": "Mysuru",
            "quantity": 2,
            "estimated_price_inr": 75,
            "user_confirmed": False,
        },
    )
    assert r_mcp_unconf.status_code == 200
    mcp_u = r_mcp_unconf.json()
    assert mcp_u["requires_user_confirmation"] is True
    assert mcp_u["execution_status"] == "awaiting_user_confirmation"

    r_mcp_conf = client.post(
        "/api/v1/food-discovery/swiggy-mcp/preview",
        json={
            "action_type": "prepare_cart",
            "restaurant_name": "Gayathri Tiffin Room",
            "dish_name": "Masala Dosa",
            "city": "Mysuru",
            "quantity": 2,
            "estimated_price_inr": 75,
            "user_confirmed": True,
        },
    )
    assert r_mcp_conf.status_code == 200
    mcp_c = r_mcp_conf.json()
    assert mcp_c["requires_user_confirmation"] is False
    assert mcp_c["execution_status"] == "cart_preview_confirmed_handoff_ready"
    assert "swiggy.com" in mcp_c["external_handoff_url"]




def test_blood_report_image_and_scanned_pdf_20_marker_extraction():
    """
    Verifies all 13 mandatory requirements for blood report image/PDF OCR & table parsing:
    1. PNG upload of the 20-marker multi-section blood report extracts all 20 structured rows.
    2. JPG upload extracts all 20 structured rows.
    3. Text-based PDF extraction works.
    4. Scanned PDF OCR works.
    5. Multiple report sections (CBC, Iron, Vitamins, Thyroid, Lipid, Glucose) are recognised.
    6. Values remain associated with the correct test.
    7. Decimal points are preserved.
    8. Units are preserved.
    9. Reference intervals are preserved.
    10. Abnormal flags are detected correctly.
    11. Unreadable rows require manual review.
    12. Completely unreadable file produces a clear error rather than a fake successful 0-row result.
    13. Confirming the extracted report retrieves verified Indian food recommendations.
    """
    import os
    from PIL import ImageDraw, ImageFont

    font = None
    for candidate_font in (
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        if os.path.exists(candidate_font):
            try:
                font = ImageFont.truetype(candidate_font, 22)
                break
            except Exception:
                continue
    if font is None:
        font = ImageFont.load_default(size=22)

    sample_lines = [
        "APOLLO / METROPOLIS CLINICAL DIAGNOSTICS",
        "Report Date: 2026-04-12",
        "COMPLETE BLOOD COUNT (CBC)",
        "Haemoglobin              10.8      g/dL           12.0 - 16.0    Low",
        "WBC Count                6800      /cumm          4000 - 11000   Normal",
        "RBC Count                4.4       million/cumm   4.0 - 5.2      Normal",
        "Platelets                2.6       lakh/cumm      1.5 - 4.5      Normal",
        "MCV                      77.5      fL             80.0 - 100.0   Low",
        "MCH                      25.8      pg             27.0 - 32.0    Low",
        "IRON STUDIES",
        "Serum Ferritin           12.4      ng/mL          15.0 - 150.0   Low",
        "Serum Iron               48        ug/dL          60 - 170       Low",
        "VITAMINS & THYROID",
        "Vitamin B12              168       pg/mL          200 - 900      Low",
        "Vitamin D (25-OH)        16.5      ng/mL          30.0 - 100.0   Low",
        "Folate                   8.4       ng/mL          4.6 - 18.7     Normal",
        "TSH                      3.1       mIU/L          0.45 - 4.5     Normal",
        "T3                       3.0       pg/mL          2.3 - 4.2      Normal",
        "T4                       1.2       ng/dL          0.8 - 1.8      Normal",
        "LIPID PROFILE",
        "Total Cholesterol        212       mg/dL          125 - 200      High",
        "LDL Cholesterol          134       mg/dL          0 - 100        High",
        "HDL Cholesterol          44        mg/dL          40 - 60        Normal",
        "Triglycerides            178       mg/dL          40 - 150       High",
        "GLUCOSE & HBA1C",
        "Fasting Glucose          114       mg/dL          70 - 99        High",
        "HbA1c                    6.1       %              4.0 - 5.6      High",
    ]

    img = Image.new("RGB", (1300, 1180), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)
    y = 24
    for line in sample_lines:
        draw.text((36, y), line, fill=(15, 23, 42), font=font)
        y += 38

    expected_values = {
        "haemoglobin": (10.8, 12.0, 16.0, "low"),
        "wbc_count": (6800.0, 4000.0, 11000.0, "within_reference"),
        "rbc_count": (4.4, 4.0, 5.2, "within_reference"),
        "platelet_count": (2.6, 1.5, 4.5, "within_reference"),
        "mcv": (77.5, 80.0, 100.0, "low"),
        "mch": (25.8, 27.0, 32.0, "low"),
        "serum_ferritin": (12.4, 15.0, 150.0, "low"),
        "serum_iron": (48.0, 60.0, 170.0, "low"),
        "vitamin_b12": (168.0, 200.0, 900.0, "low"),
        "vitamin_d_25oh": (16.5, 30.0, 100.0, "low"),
        "serum_folate": (8.4, 4.6, 18.7, "within_reference"),
        "tsh": (3.1, 0.45, 4.5, "within_reference"),
        "t3": (3.0, 2.3, 4.2, "within_reference"),
        "t4": (1.2, 0.8, 1.8, "within_reference"),
        "total_cholesterol": (212.0, 125.0, 200.0, "high"),
        "ldl_cholesterol": (134.0, 0.0, 100.0, "high"),
        "hdl_cholesterol": (44.0, 40.0, 60.0, "within_reference"),
        "triglycerides": (178.0, 40.0, 150.0, "high"),
        "fasting_blood_glucose": (114.0, 70.0, 99.0, "high"),
        "hba1c": (6.1, 4.0, 5.6, "high"),
    }

    # 1. PNG Upload
    png_buf = io.BytesIO()
    img.save(png_buf, format="PNG")
    r_png = client.post(
        "/api/v1/health/reports/extract",
        files={"file": ("sample_blood_report.png", png_buf.getvalue(), "image/png")},
        data={"report_title": "PNG Multi-Section Blood Report"},
    )
    assert r_png.status_code == 200
    png_json = r_png.json()
    assert png_json["extracted_count"] == 20
    assert png_json["extraction_diagnostics"]["valid_structured_rows"] == 20
    assert png_json["extraction_diagnostics"]["final_api_status"] == "confirmation_required"
    png_rows = {m["canonical_code"]: m for m in png_json["extracted_measurements"]}
    for code, (exp_val, exp_low, exp_high, exp_flag) in expected_values.items():
        assert code in png_rows, f"Missing {code} in PNG extraction"
        row = png_rows[code]
        assert row["measured_value"] == exp_val
        assert row["reference_low"] == exp_low
        assert row["reference_high"] == exp_high
        assert row["status_flag"] == exp_flag
        assert row["unit"], f"Missing unit for {code}"

    # 2. JPG Upload
    jpg_buf = io.BytesIO()
    img.save(jpg_buf, format="JPEG", quality=95)
    r_jpg = client.post(
        "/api/v1/health/reports/extract",
        files={"file": ("sample_blood_report.jpg", jpg_buf.getvalue(), "image/jpeg")},
        data={"report_title": "JPG Multi-Section Blood Report"},
    )
    assert r_jpg.status_code == 200
    assert r_jpg.json()["extracted_count"] == 20

    # 4. Scanned PDF Upload (PDF containing embedded JPEG stream, no selectable text)
    scanned_pdf_bytes = (
        b"%PDF-1.4\n1 0 obj\n<< /Type /XObject /Subtype /Image /Filter /DCTDecode >>\nstream\n"
        + jpg_buf.getvalue()
        + b"\nendstream\nendobj\n%%EOF"
    )
    r_scanned_pdf = client.post(
        "/api/v1/health/reports/extract",
        files={"file": ("scanned_blood_report.pdf", scanned_pdf_bytes, "application/pdf")},
        data={"report_title": "Scanned PDF Blood Report"},
    )
    assert r_scanned_pdf.status_code == 200
    assert r_scanned_pdf.json()["extracted_count"] == 20

    # 11. Unreadable row value requires manual review without confusing reference interval with result
    r_unread_row = client.post(
        "/api/v1/health/reports/extract-text",
        json={
            "raw_report_text": "Haemoglobin: -- g/dL (12.0 - 16.0)\nHbA1c: 6.1 % (4.0 - 5.6)",
            "report_title": "Partial Unreadable Row Test",
        },
    )
    assert r_unread_row.status_code == 200
    ur_rows = {m["canonical_code"]: m for m in r_unread_row.json()["extracted_measurements"]}
    assert ur_rows["haemoglobin"]["measured_value"] is None
    assert ur_rows["haemoglobin"]["requires_manual_review"] is True
    assert ur_rows["haemoglobin"]["reference_low"] == 12.0
    assert ur_rows["haemoglobin"]["reference_high"] == 16.0

    # 12. Completely unreadable blank image returns extraction_failed and clear error message
    blank_png = create_in_memory_png(color=(255, 255, 255), size=(300, 200))
    r_blank = client.post(
        "/api/v1/health/reports/extract",
        files={"file": ("blank.png", blank_png, "image/png")},
    )
    assert r_blank.status_code == 200
    blank_json = r_blank.json()
    assert blank_json["extracted_count"] == 0
    assert blank_json["extraction_diagnostics"]["final_api_status"] == "extraction_failed"
    assert blank_json["extraction_error_message"] is not None

    # 13. Confirming extracted 20-marker report retrieves verified GharPlate food recommendations
    r_conf_20 = client.post(
        "/api/v1/health/reports/confirm",
        json={
            "user_confirmed": True,
            "report_title": "Confirmed 20-Marker PNG Report",
            "report_type": "comprehensive_blood_panel",
            "report_date": "2026-04-12",
            "measurements": png_json["extracted_measurements"],
        },
    )
    assert r_conf_20.status_code == 200
    conf_20_data = r_conf_20.json()
    assert conf_20_data["measurement_count"] == 20
    assert conf_20_data["results_requiring_attention"] == 12
    assert len(conf_20_data["lab_to_plate"]["marker_food_cards"]) >= 4
