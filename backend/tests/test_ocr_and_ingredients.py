"""
Automated Test Suite for Nutrition-Label OCR, Image Preprocessing, Multi-Line Ingredient Extraction,
and Regression Verification that OCR Failure NEVER Inserts Synthetic Nutrition Values.
"""

import io
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _make_test_image(width: int = 160, height: int = 120, color=(240, 240, 240)) -> bytes:
    buf = io.BytesIO()
    img = Image.new("RGB", (width, height), color=color)
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_01_ocr_failure_never_inserts_synthetic_fallback_nutrition_values():
    """
    MANDATORY REGRESSION TEST:
    When OCR fails or detects no text from an uploaded image (and no hint_text is provided),
    the endpoint MUST return an explicit failure state (ocr_status != 'success', requires_manual_entry=True)
    and EVERY nutrient field MUST be None (NULL) — NEVER the old synthetic 465 kcal / 7.4g protein values!
    """
    blank_png = _make_test_image()
    resp = client.post(
        "/api/v1/scan/ocr-image",
        files={"file": ("blank_unreadable_label.png", blank_png, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert data["ocr_status"] in ("failed_no_text", "failed_engine_unavailable")
    assert data["requires_manual_entry"] is True
    assert data["raw_text"] == ""

    for nut_key in (
        "energy_kcal",
        "protein_g",
        "carbs_g",
        "sugars_total_g",
        "sugars_added_g",
        "fat_total_g",
        "fat_saturated_g",
        "fibre_g",
        "sodium_mg",
    ):
        assert data["fields"][nut_key]["extracted_value"] is None, (
            f"Expected {nut_key} to be None on OCR failure, got {data['fields'][nut_key]['extracted_value']}"
        )
        assert data["fields"][nut_key]["validation_status"] == "missing"


def test_02_rotated_image_and_multi_panel_ocr_extraction():
    """
    Verifies that when OCR extracts text from a nutrition panel image + an ingredients panel image,
    both panels are combined and parsed accurately.
    """
    nut_img = _make_test_image(120, 200)
    ing_img = _make_test_image(200, 120)

    side_effects = [
        (
            "Product Name: Mysuru Ragi Malt\nBrand: Heritage Millets\nServing Size: 25 g\n"
            "Per 100g:\nEnergy: 365 kcal\nProtein: 9.8 g\nTotal Carbohydrates: 72.0 g\n"
            "Total Sugars: 4.5 g\nAdded Sugars: 0.0 g\nTotal Fat: 3.2 g\nSaturated Fat: 0.8 g\n"
            "Dietary Fibre: 10.4 g\nSodium: 45 mg",
            "tesseract_ocr",
            None,
        ),
        (
            "Ingredients: Sprouted Ragi Flour (85%), Cardamom Powder (2%), Almond Powder (13%).\n"
            "Allergen Advice: Contains Tree Nuts (Almond).\nNet Weight: 250 g",
            "tesseract_ocr",
            None,
        ),
    ]

    with patch(
        "app.services.ocr_barcode_service.extract_text_from_image_bytes_in_memory",
        side_effect=side_effects,
    ):
        resp = client.post(
            "/api/v1/scan/ocr",
            files={
                "file": ("nutrition_panel.png", nut_img, "image/png"),
                "ingredients_file": ("ingredients_panel.png", ing_img, "image/png"),
            },
        )
        assert resp.status_code == 200
        data = resp.json()

        assert data["ocr_status"] == "success"
        assert data["requires_manual_entry"] is False
        assert data["fields"]["energy_kcal"]["extracted_value"] == 365.0
        assert data["fields"]["protein_g"]["extracted_value"] == 9.8
        assert data["fields"]["fibre_g"]["extracted_value"] == 10.4
        assert data["fields"]["net_quantity"]["extracted_value"] == "250 g"
        assert "Sprouted Ragi Flour (85%)" in data["fields"]["ingredients_text"]["extracted_value"]
        assert "Sprouted Ragi Flour (85%)" in data["parsed_ingredients"]["ingredient_percentages"]
        assert "tree_nut" in data["allergen_consistency"]["declared_allergens"]


def test_03_noisy_package_ingredient_separation_and_allergen_parsing():
    """
    Verifies that noisy OCR package text containing ingredients, INS numbers, allergen declarations,
    polyol warnings, net weight, and manufacturer address is cleanly separated without losing raw_text.
    """
    noisy_text = (
        "Product Name: Winkles Pineapple Slice Cake\n"
        "Brand: Winkles\n"
        "Per 100g:\n"
        "Energy: 380 kcal\n"
        "Protein: 5.5 g\n"
        "Total Carbohydrates: 58.0 g\n"
        "Total Fat: 14.0 g\n"
        "Ingredients: REFINED WHEAT FLOUR (MAIDA), EGGS, SUGAR, PINEAPPLE CUTS (2%), "
        "HUMECTANTS (IMS 422, INS 420), EMULSIFIERS (INS 471, INS 322). "
        "CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS. POLYOLS MAY HAVE LAXATIVE EFFECTS. "
        "110 NET WEIGHT: MRP: LOT NO.: SOUTHERN BAKERIES PVT. LTD, BANGALORE."
    )
    resp = client.post("/api/v1/scan/ocr-text", json={"raw_label_text": noisy_text})
    assert resp.status_code == 200
    data = resp.json()

    parsed = data["parsed_ingredients"]
    assert parsed is not None
    assert "REFINED WHEAT FLOUR (MAIDA)" in parsed["cleaned_ingredients"]
    assert "SOUTHERN BAKERIES" not in parsed["cleaned_ingredients"]
    assert parsed["net_weight"] == "110 g"
    assert "PINEAPPLE CUTS (2%)" in parsed["ingredient_percentages"]
    assert any("INS 322" in a for a in parsed["additives"])
    assert "CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS." == parsed["allergen_declaration"]
    assert any("POLYOLS MAY HAVE LAXATIVE EFFECTS" in w for w in parsed["label_warnings"])
    assert set(data["allergen_consistency"]["declared_allergens"]) == {
        "egg",
        "gluten",
        "milk",
        "soy",
    }
