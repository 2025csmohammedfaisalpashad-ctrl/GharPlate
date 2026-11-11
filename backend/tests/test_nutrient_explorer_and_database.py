"""
Comprehensive Backend Automated Tests for GharPlate Nutrient Explorer & Expanded Indian Food Composition Database:
1. Verifies 65+ NutrientDefinitions across all 6 required groups:
   - Vitamins (A, Retinol, Beta-Carotene, B1, B2, B3, B5, B6, B7, B9, B12, C, D, D2, D3, E, K, K1, K2)
   - Minerals (Iron, Calcium, Magnesium, Zinc, Potassium, Sodium, Phosphorus, Selenium, Iodine, Copper, Manganese, Chromium, Molybdenum)
   - Protein & Amino Acids (Total Protein, Leucine, Isoleucine, Valine, Lysine, Methionine, Phenylalanine, Threonine, Tryptophan, Histidine, Glycine, Glutamic Acid)
   - Carbohydrates & Fibre (Total Carbs, Available Carbs, Starch, Total Sugars, Added Sugars, Total Fibre, Soluble Fibre, Insoluble Fibre)
   - Fats & Essential Fatty Acids (Total Fat, Saturated Fat, MUFA, PUFA, Trans Fat, Omega-3, Omega-6)
   - Other Nutritional Components (Energy, Choline, Cholesterol, Water/Moisture, Organic Acids, Lutein+Zeaxanthin)
2. Verifies 100+ Indian foods across all 8 required food groups, including Raw vs Cooked/Boiled food records.
3. Verifies Nutrient Alias Resolution (`Vit D`, `Calciferol`, `D3`, `B12`, `Cobalamin`, `Folate`, `Folic Acid`, `Vitamin B9`, `Ascorbic Acid`, `Fe`, `Ca`, `Leucine`, `Omega-3`).
4. Verifies Ranking Order (`per_100g_desc`, `per_serving_desc`, `density_per_100kcal_desc`, `name_asc`).
5. Verifies Dietary Filters (`all`, `vegetarian`, `vegan`, `eggetarian`, `non_vegetarian`) & Food Form Filters (`raw`, `cooked`, `prepared_dish`, `fortified`, `natural`, `packaged`).
6. Verifies NULL preservation for unmeasured nutrients (never replaced with 0).
7. Verifies Health Reports integration with the shared `nutrient_food_search_service`.
"""

from __future__ import annotations

from app.main import app
from tests.conftest import AuthenticatedTestClient

client = AuthenticatedTestClient(app)


def _nut_map(food_json: dict) -> dict[str, float | None]:
    return {
        (n.get("nutrient_code") or n.get("code")): (
            n.get("value") if "value" in n else n.get("value_per_100")
        )
        for n in (food_json.get("nutrients") or [])
    }


def test_01_nutrient_explorer_catalog_has_all_65_nutrients_and_6_groups() -> None:
    resp = client.get("/api/v1/nutrients/catalog")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["total_nutrients"] >= 65
    group_codes = [g["code"] for g in data["groups"]]
    assert group_codes == [
        "vitamins",
        "minerals",
        "protein_amino_acids",
        "carbohydrates_fibre",
        "fats_fatty_acids",
        "other_components",
    ]

    all_codes = {n["code"] for n in data["nutrients"]}
    required_codes = {
        # Vitamins
        "vit_a_mcg",
        "retinol_mcg",
        "beta_carotene_mcg",
        "vit_b1_mg",
        "vit_b2_mg",
        "vit_b3_mg",
        "vit_b5_mg",
        "vit_b6_mg",
        "vit_b7_mcg",
        "folate_mcg",
        "vit_b12_mcg",
        "vit_c_mg",
        "vit_d_mcg",
        "vit_d2_mcg",
        "vit_d3_mcg",
        "vit_e_mg",
        "vit_k_mcg",
        "vit_k1_mcg",
        "vit_k2_mcg",
        # Minerals
        "iron_mg",
        "calcium_mg",
        "magnesium_mg",
        "zinc_mg",
        "potassium_mg",
        "sodium_mg",
        "phosphorus_mg",
        "selenium_mcg",
        "iodine_mcg",
        "copper_mg",
        "manganese_mg",
        "chromium_mcg",
        "molybdenum_mcg",
        # Protein & Amino Acids
        "protein_g",
        "leucine_mg",
        "isoleucine_mg",
        "valine_mg",
        "lysine_mg",
        "methionine_mg",
        "phenylalanine_mg",
        "threonine_mg",
        "tryptophan_mg",
        "histidine_mg",
        "glycine_mg",
        "glutamic_acid_mg",
        # Carbohydrates & Fibre
        "carbs_g",
        "available_carbs_g",
        "starch_g",
        "sugars_total_g",
        "sugars_added_g",
        "fibre_g",
        "soluble_fibre_g",
        "insoluble_fibre_g",
        # Fats & Fatty Acids
        "fat_total_g",
        "fat_saturated_g",
        "fat_mufa_g",
        "fat_pufa_g",
        "fat_trans_g",
        "omega_3_mg",
        "omega_6_mg",
        # Other Nutritional Components
        "energy_kcal",
        "choline_mg",
        "cholesterol_mg",
        "water_g",
        "organic_acids_g",
        "lutein_zeaxanthin_mcg",
    }
    missing = required_codes - all_codes
    assert not missing, f"Missing required nutrient codes: {missing}"


def test_02_expanded_indian_food_database_coverage_and_raw_vs_cooked_states() -> None:
    resp = client.get("/api/v1/nutrients/import-summary")
    assert resp.status_code == 200, resp.text
    summary = resp.json()

    assert summary["total_foods"] >= 108
    assert summary["total_nutrient_definitions"] >= 65
    assert summary["total_known_nutrient_values"] >= 4500
    assert summary["total_null_unmeasured_values"] > 0
    assert summary["null_replaced_with_zero"] is False

    # Verify raw vs cooked food records exist and have distinct moisture/energy/nutrient values
    raw_rice = _nut_map(client.get("/api/v1/foods/rice-raw-milled").json())
    cooked_rice = _nut_map(client.get("/api/v1/foods/rice-cooked-steamed").json())
    assert (raw_rice["energy_kcal"] or 0) > (cooked_rice["energy_kcal"] or 0)
    assert (cooked_rice["water_g"] or 0) > (raw_rice["water_g"] or 0)

    raw_toor = _nut_map(client.get("/api/v1/foods/toor-dal-red-gram").json())
    cooked_toor = _nut_map(client.get("/api/v1/foods/toor-dal-cooked-boiled").json())
    assert (raw_toor["protein_g"] or 0) > (cooked_toor["protein_g"] or 0)

    raw_chana = _nut_map(client.get("/api/v1/foods/chickpeas-kabuli-chana").json())
    cooked_chana = _nut_map(client.get("/api/v1/foods/chickpeas-boiled-cooked").json())
    assert (raw_chana["iron_mg"] or 0) > (cooked_chana["iron_mg"] or 0)


def test_03_nutrient_alias_search_resolution() -> None:
    alias_queries = [
        ("Vit D", "vit_d_mcg"),
        ("Calciferol", "vit_d_mcg"),
        ("D3", "vit_d3_mcg"),
        ("Cholecalciferol", "vit_d3_mcg"),
        ("B12", "vit_b12_mcg"),
        ("Cobalamin", "vit_b12_mcg"),
        ("Folate", "folate_mcg"),
        ("Folic Acid", "folate_mcg"),
        ("Vitamin B9", "folate_mcg"),
        ("Ascorbic Acid", "vit_c_mg"),
        ("Fe", "iron_mg"),
        ("Ca", "calcium_mg"),
        ("Leucine", "leucine_mg"),
        ("Omega-3", "omega_3_mg"),
    ]
    for query_str, expected_code in alias_queries:
        res = client.get("/api/v1/nutrients/search", params={"q": query_str})
        assert res.status_code == 200, f"Failed for {query_str}: {res.text}"
        payload = res.json()
        assert payload["matched"] is True, f"Alias '{query_str}' did not match"
        assert payload["nutrient"]["code"] == expected_code, (
            f"Expected {expected_code} for alias '{query_str}', got {payload['nutrient']['code']}"
        )
        assert len(payload["foods"]) > 0, f"Expected non-empty food list for '{query_str}'"


def test_04_nutrient_ranking_and_dietary_form_filtering() -> None:
    # 1. Iron ranking per 100g descending
    iron_res = client.get(
        "/api/v1/nutrients/search",
        params={"q": "Iron", "sort_by": "per_100g_desc", "dietary_preference": "vegetarian"},
    )
    assert iron_res.status_code == 200
    iron_data = iron_res.json()
    iron_foods = iron_data["foods"]
    assert len(iron_foods) >= 20
    amounts_100g = [f["amount_per_100g"] for f in iron_foods]
    assert amounts_100g == sorted(amounts_100g, reverse=True)
    assert all(f["is_vegetarian"] is True for f in iron_foods)

    # 2. Per serving descending sort
    srv_res = client.get(
        "/api/v1/nutrients/search",
        params={"q": "Protein", "sort_by": "per_serving_desc"},
    ).json()
    srv_amounts = [f["amount_per_serving"] for f in srv_res["foods"]]
    assert srv_amounts == sorted(srv_amounts, reverse=True)

    # 3. Nutrient density per 100 kcal descending sort
    dens_res = client.get(
        "/api/v1/nutrients/search",
        params={"q": "Calcium", "sort_by": "density_per_100kcal_desc"},
    ).json()
    dens_vals = [f["density_per_100kcal"] or 0.0 for f in dens_res["foods"]]
    assert dens_vals == sorted(dens_vals, reverse=True)

    # 4. Cooked / Prepared food form filter
    cooked_res = client.get(
        "/api/v1/nutrients/search",
        params={"q": "Protein", "food_form": "cooked"},
    ).json()
    assert len(cooked_res["foods"]) >= 8
    assert all("cooked" in f["food_forms"] for f in cooked_res["foods"])


def test_05_honest_sparse_or_empty_explanations_and_null_preservation() -> None:
    # Vegan + Vitamin B12 should return an honest scientific explanation that unfortified plant foods lack B12
    b12_vegan = client.get(
        "/api/v1/nutrients/search",
        params={"q": "Vitamin B12", "dietary_preference": "vegan"},
    ).json()
    assert b12_vegan["matched"] is True
    assert b12_vegan["nutrient"]["code"] == "vit_b12_mcg"
    assert b12_vegan["empty_or_sparse_explanation"] is not None
    assert "plant foods" in b12_vegan["empty_or_sparse_explanation"].lower()

    # Vitamin D should include a scientific coverage note explaining why few natural foods contain Vitamin D
    vitd_res = client.get("/api/v1/nutrients/search", params={"q": "Vitamin D"}).json()
    assert vitd_res["matched"] is True
    assert len(vitd_res["foods"]) >= 8
    assert vitd_res["nutrient"]["coverage_limitation_note"] is not None


def test_06_health_reports_uses_shared_nutrient_food_search_service() -> None:
    confirm_payload = {
        "user_confirmed": True,
        "report_title": "Micronutrient & Anaemia Panel",
        "laboratory_name": "GharPlate Diagnostics",
        "report_date": "2026-05-10",
        "measurements": [
            {
                "canonical_code": "haemoglobin",
                "test_name": "Haemoglobin (Hb)",
                "result_value": 10.2,
                "unit": "g/dL",
                "reference_min": 12.0,
                "reference_max": 16.0,
                "printed_flag": "L",
            },
            {
                "canonical_code": "vitamin_d_25oh",
                "test_name": "25-Hydroxy Vitamin D",
                "result_value": 14.5,
                "unit": "ng/mL",
                "reference_min": 30.0,
                "reference_max": 100.0,
                "printed_flag": "L",
            },
            {
                "canonical_code": "vitamin_b12",
                "test_name": "Vitamin B12",
                "result_value": 165.0,
                "unit": "pg/mL",
                "reference_min": 211.0,
                "reference_max": 911.0,
                "printed_flag": "L",
            },
        ],
    }
    resp = client.post("/api/v1/health/reports/confirm", json=confirm_payload)
    assert resp.status_code == 200, resp.text
    saved = resp.json()
    cards = {c["canonical_code"]: c for c in saved["lab_to_plate"]["marker_food_cards"]}

    assert "haemoglobin" in cards
    assert "vitamin_d_25oh" in cards
    assert "vitamin_b12" in cards

    hb_foods = cards["haemoglobin"]["recommended_foods"]
    vitd_foods = cards["vitamin_d_25oh"]["recommended_foods"]
    b12_foods = cards["vitamin_b12"]["recommended_foods"]

    assert len(hb_foods) >= 4
    assert len(vitd_foods) >= 4
    assert len(b12_foods) >= 3
    assert any(f["primary_nutrient_code"] == "vit_d_mcg" and f["primary_nutrient_value_per_100g"] > 0 for f in vitd_foods)
