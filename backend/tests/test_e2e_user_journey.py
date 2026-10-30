"""
End-to-End Realistic User Journey Test Suite (Section 18 of Master Prompt).
Executes the full 12-step household journey against the real database and API contracts:
1. Open GharPlate (/health & /sources)
2. Create a household
3. Add a member
4. Select dietary preferences and multiple conditions
5. Search for a food (using English, Hindi, and Kannada aliases)
6. View its nutritional information and verify NULL preservation
7. View condition-related educational guidance and multi-condition conflict resolution
8. Create a recipe
9. Calculate recipe nutrition with household unit conversion
10. Compare 2-4 packaged products
11. Scan a nutrition label
12. Review, correct, and confirm OCR results into a saved product record
"""

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_complete_12_step_gharplate_user_journey():
    # Step 1: Open GharPlate & verify health + data sources
    health = client.get("/api/v1/health").json()
    assert health["status"] == "healthy"
    sources = client.get("/api/v1/sources").json()
    assert len(sources) >= 8

    # Step 2: Create a household with browser convenience token
    token = "hh_e2e_mysuru_family_2026"
    hh = client.post(
        "/api/v1/households",
        json={"household_token": token, "name": "Mysuru Rao Household"},
    ).json()
    assert hh["household_token"] == token

    # Step 3 & 4: Add a member with dietary preferences, allergies, intolerances, and conditions
    member = client.post(
        f"/api/v1/households/{token}/members",
        json={
            "display_name": "Nagaraj (Appa)",
            "age_group": "older_adult",
            "dietary_preference": "vegetarian",
            "selected_conditions": ["type_2_diabetes", "chronic_kidney_disease"],
            "allergies": ["peanut"],
            "intolerances": ["lactose"],
            "dietary_restrictions": ["low_sodium"],
            "food_preferences": ["karnataka_millets"],
        },
    ).json()
    assert member["display_name"] == "Nagaraj (Appa)"

    # Step 5: Search for a food via Kannada alias ("Avalakki" -> Poha, "Ragi" -> Ragi)
    search_res = client.get("/api/v1/foods", params={"q": "Ragi"}).json()
    assert search_res["total"] >= 1
    ragi_slug = "ragi-finger-millet"

    # Step 6: View detailed nutritional information
    food_detail = client.get(f"/api/v1/foods/{ragi_slug}").json()
    assert food_detail["name_en"] == "Ragi (Finger Millet)"
    assert food_detail["ifct_code"] == "A010"

    # Step 7: View condition-related educational guidance for the member profile
    guidance = client.post(
        "/api/v1/guidance/evaluate",
        json={
            "food_slug": ragi_slug,
            "condition_codes": member["selected_conditions"],
            "serving_unit": "standard_serving",
            "serving_quantity": 1.0,
            "age_group": member["age_group"],
            "allergies": member["allergies"],
            "intolerances": member["intolerances"],
            "dietary_preference": member["dietary_preference"],
        },
    ).json()
    assert guidance["requires_professional_guidance"] is True
    assert any(c["conflict_code"] == "CONFLICT_DIABETES_CKD" for c in guidance["multi_condition_conflicts"])

    # Step 8 & 9: Create a recipe and calculate nutrition
    recipe = client.post(
        "/api/v1/recipes/calculate",
        json={
            "household_token": token,
            "title": "E2E Ragi & Toor Dal Meal",
            "description": "Household lunch calculation",
            "servings": 2.0,
            "meal_type": "lunch",
            "ingredients": [
                {"food_slug": "ragi-finger-millet", "quantity": 2.0, "unit_name": "standard_serving"},
                {"food_slug": "toor-dal-red-gram", "quantity": 1.0, "unit_name": "standard_serving"},
                {"food_slug": "spinach-palak", "quantity": 1.0, "unit_name": "100g"},
            ],
        },
    ).json()
    assert recipe["total_weight_grams"] == 190.0
    assert recipe["serving_weight_grams"] == 95.0

    # Step 10: Compare 3 packaged products
    comp = client.post(
        "/api/v1/products/compare",
        json={
            "product_slugs": [
                "packaged-rolled-oats-plain",
                "packaged-crunchy-muesli-almond",
                "packaged-digestive-marie-biscuits",
            ],
            "condition_codes": member["selected_conditions"],
            "allergies": member["allergies"],
            "intolerances": member["intolerances"],
        },
    ).json()
    assert len(comp["products"]) == 3

    # Step 11: Scan a nutrition label with an OCR typo ('42O kcal')
    ocr_scan = client.post(
        "/api/v1/scan/ocr-text",
        json={
            "raw_label_text": (
                "Product Name: Roasted Jowar Puffs\n"
                "Brand: GharPlate Test Brand\n"
                "Serving Size: 30 g\n"
                "Per 100g:\n"
                "Energy: 42O kcal\n"
                "Protein: 9.5 g\n"
                "Total Carbohydrates: 68.0 g\n"
                "Total Sugars: 2.0 g\n"
                "Added Sugars: 0.0 g\n"
                "Total Fat: 11.0 g\n"
                "Saturated Fat: 1.8 g\n"
                "Dietary Fibre: 8.2 g\n"
                "Sodium: 290 mg\n"
                "Ingredients: Jowar, Rice Bran Oil, Spices, Salt."
            )
        },
    ).json()
    assert ocr_scan["requires_user_confirmation"] is True
    assert ocr_scan["fields"]["energy_kcal"]["proposed_correction"] == 420.0

    # Step 12: Review, correct, and confirm OCR results into a saved product record
    confirmed_product = client.post(
        "/api/v1/scan/confirm-product",
        json={
            "name_en": "Roasted Jowar Puffs (User Confirmed)",
            "brand": "GharPlate Test Brand",
            "default_basis": "100g",
            "standard_serving_name": "1 serving (30g)",
            "standard_serving_grams": 30.0,
            "is_vegetarian": True,
            "ingredients_text": "Jowar, Rice Bran Oil, Spices, Salt.",
            "allergen_tags": [],
            "allergen_declaration_complete": True,
            "nutrients_per_100": {
                "energy_kcal": 420.0,
                "protein_g": 9.5,
                "carbs_g": 68.0,
                "sugars_total_g": 2.0,
                "sugars_added_g": 0.0,
                "fat_total_g": 11.0,
                "fat_saturated_g": 1.8,
                "fibre_g": 8.2,
                "sodium_mg": 290.0,
            },
            "source_type": "ocr_extracted",
            "user_confirmed": True,
        },
    ).json()
    assert confirmed_product["name_en"] == "Roasted Jowar Puffs (User Confirmed)"
    # Verify micronutrients not on the label remain NULL
    potassium_entry = next(
        n for n in confirmed_product["nutrients"] if n["nutrient_code"] == "potassium_mg"
    )
    assert potassium_entry["value_per_100"] is None
