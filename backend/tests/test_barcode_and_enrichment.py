"""
Automated Test Suite for Multi-Source Barcode Lookup, Pineapple Cake (8906005618726) Enrichment,
Field-Level Provenance, Conflict Detection, Network Error Handling, Duplicate Barcode Safety,
and Local Food Photography Catalogue Verification.
"""

import json
from pathlib import Path
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient

from app.main import app
from app.db.seed_images import CATEGORY_IMAGE_URLS, FOOD_IMAGE_URLS
from app.db.session import SessionLocal
from app.integrations.normalizer import NormalizedExternalProduct
from app.integrations.open_food_facts import ProviderLookupAttempt
from app.models.entities import FoodItem, ProductDataConflict

client = TestClient(app)


def test_01_pineapple_cake_baseline_record_and_allergen_consistency():
    """
    Verifies the Pineapple Cake record (barcode 8906005618726, slug pkg-pineapple-cake-6b35c3):
    - Barcode, product identity, and existing user-confirmed ingredients_text are preserved.
    - image_url is None and has_verified_image is False (never displays a generic Muesli photo).
    - All 20 nutrients are NULL (0 of 20 available) before external enrichment.
    - Cleaned ingredients, net_quantity ('110 g'), allergen_statement ('CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.'),
      label_warnings ('POLYOLS MAY HAVE LAXATIVE EFFECTS.'), and additives are parsed cleanly.
    - Soy declaration in label text vs stored allergen_tags (['eggs', 'gluten', 'milk']) is flagged in allergen_consistency.
    """
    resp = client.get("/api/v1/foods/pkg-pineapple-cake-6b35c3")
    assert resp.status_code == 200
    data = resp.json()

    assert data["slug"] == "pkg-pineapple-cake-6b35c3"
    assert data["name_en"] == "Pineapple Cake"
    assert data["brand"].lower() == "winkles"
    assert data["barcode"] == "8906005618726"
    assert data["is_packaged"] is True

    # Honest image handling: no fake category photo substituted
    assert data["image_url"] is None
    assert data["has_verified_image"] is False

    # Existing ingredients preserved and cleaned
    assert "REFINED WHEAT FLOUR (MAIDA)" in data["ingredients_text"]
    assert data["cleaned_ingredients_text"] is not None
    assert "REFINED WHEAT FLOUR (MAIDA)" in data["cleaned_ingredients_text"]
    assert "SOUTHERN BAKERIES" not in data["cleaned_ingredients_text"]
    assert data["net_quantity"] == "110 g"
    assert "CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS" in (data["allergen_statement"] or "")
    assert any("POLYOLS MAY HAVE LAXATIVE EFFECTS" in w for w in data["label_warnings"])
    assert len(data["additives"]) >= 8
    assert len(data["ocr_uncertainty_notes"]) >= 1

    # Allergen consistency check: 'soy' is in declared_allergens and missing_from_stored_tags
    consistency = data["allergen_consistency"]
    assert consistency is not None
    assert "soy" in consistency["declared_allergens"]
    assert "soy" in consistency["missing_from_stored_tags"]
    assert consistency["requires_manual_review"] is True

    # Nutrients: 0 of 20 available, every value is None (NULL)
    assert data["available_nutrient_count"] == 0
    assert data["completeness_pct"] == 0.0
    assert all(n["value_per_100"] is None for n in data["nutrients"])


def test_02_incomplete_local_record_triggers_external_enrichment_attempt():
    """
    Verifies that looking up barcode 8906005618726 does NOT stop at the incomplete local record:
    it evaluates completeness, sees missing image_url and missing nutrients, and queries external providers.
    When external providers return not_found, missing nutrients remain NULL and fallback actions are provided.
    """
    mock_attempts = [
        ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="not_found",
            http_status=404,
            message="Barcode '8906005618726' was not found in Open Food Facts (API v3).",
        ),
        ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="unconfigured_api_key",
            http_status=None,
            message="FDC_API_KEY not configured.",
        ),
    ]
    with patch(
        "app.services.ocr_barcode_service.query_external_providers_for_barcode",
        return_value=(None, mock_attempts),
    ) as mock_query:
        resp = client.get("/api/v1/scan/barcode/8906005618726")
        assert resp.status_code == 200
        assert mock_query.called

        body = resp.json()
        assert body["found"] is True
        assert body["barcode"] == "8906005618726"
        assert body["completeness"]["needs_enrichment"] is True
        assert len(body["provider_attempts"]) == 2
        assert body["product"]["available_nutrient_count"] == 0
        assert len(body["fallback_actions"]) >= 2


def test_03_external_enrichment_merges_missing_fields_and_preserves_provenance():
    """
    Verifies that when Open Food Facts returns a verified exact-barcode match for Pineapple Cake (8906005618726),
    missing image_url and missing (NULL) nutrients are filled, field-level provenance is recorded,
    and the existing user-confirmed ingredients_text is preserved without being overwritten.
    """
    ext_cake = NormalizedExternalProduct(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        source_url="https://world.openfoodfacts.org/product/8906005618726",
        source_record_id="8906005618726",
        barcode="8906005618726",
        product_name="Pineapple Cake",
        brand="Winkles",
        quantity="110 g",
        front_image_url="https://images.openfoodfacts.org/images/products/890/600/561/8726/front_en.jpg",
        image_url="https://images.openfoodfacts.org/images/products/890/600/561/8726/front_en.jpg",
        ingredients_text="Refined wheat flour, sugar, egg, pineapple fruit cuts.",
        allergen_tags=["egg", "gluten", "milk", "soy"],
        nutrients_per_100={
            "energy_kcal": 372.0,
            "protein_g": 5.4,
            "carbs_g": 56.0,
            "sugars_total_g": 28.5,
            "fat_total_g": 14.2,
            "fat_saturated_g": 6.8,
            "sodium_mg": 215.0,
        },
        available_fields=["image_url", "energy_kcal", "protein_g", "carbs_g", "fat_total_g"],
    )
    mock_attempt = ProviderLookupAttempt(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        status="found",
        http_status=200,
        message="Found in Open Food Facts API v3.",
        product=ext_cake,
    )

    with patch(
        "app.services.ocr_barcode_service.query_external_providers_for_barcode",
        return_value=(ext_cake, [mock_attempt]),
    ):
        resp = client.get("/api/v1/scan/barcode/8906005618726?force_refresh=true")
        assert resp.status_code == 200
        data = resp.json()

        assert data["source_origin"] == "local_enriched_external"
        assert "image_url" in data["merged_fields"]
        assert "energy_kcal" in data["merged_fields"]
        assert data["product"]["image_url"] == ext_cake.front_image_url
        assert data["product"]["has_verified_image"] is True
        assert data["product"]["available_nutrient_count"] == 7

        # User-confirmed original ingredients_text MUST be preserved, and differing external ingredients logged as conflict
        assert "REFINED WHEAT FLOUR (MAIDA)" in data["product"]["ingredients_text"]
        assert any(c["field_name"] == "ingredients_text" for c in data["conflicts_requiring_review"])

        # Check provenance endpoint
        prov_resp = client.get("/api/v1/products/pkg-pineapple-cake-6b35c3/provenance")
        assert prov_resp.status_code == 200
        prov_data = prov_resp.json()
        prov_fields = {p["field_name"]: p for p in prov_data["field_provenance"]}
        assert "image_url" in prov_fields
        assert prov_fields["image_url"]["source_code"] == "OPEN_FOOD_FACTS"
        assert "energy_kcal" in prov_fields
        assert prov_fields["energy_kcal"]["source_code"] == "OPEN_FOOD_FACTS"

    # Restore Pineapple Cake in test DB back to its initial un-enriched state for subsequent tests
    db = SessionLocal()
    try:
        cake = db.query(FoodItem).filter(FoodItem.slug == "pkg-pineapple-cake-6b35c3").first()
        if cake:
            cake.image_url = None
            cake.external_updated_at = None
            for nv in cake.nutrient_values:
                nv.value = None
                nv.confidence_status = "not_measured"
            db.query(ProductDataConflict).filter(ProductDataConflict.food_id == cake.id).delete()
            db.commit()
    finally:
        db.close()


def test_04_conflicting_external_product_identity_is_rejected_and_flagged():
    """
    Verifies that if an external database returns a completely different product for the same barcode
    (e.g., 'Spicy Potato Wafer' instead of 'Pineapple Cake'), GharPlate rejects merging its nutrients
    and records a product_identity conflict for manual review.
    """
    mismatched_ext = NormalizedExternalProduct(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        source_url="https://world.openfoodfacts.org/product/8906005618726",
        source_record_id="8906005618726",
        barcode="8906005618726",
        product_name="Spicy Masala Potato Chips",
        brand="OtherBrand",
        nutrients_per_100={"energy_kcal": 540.0, "protein_g": 6.5},
    )
    mock_attempt = ProviderLookupAttempt(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        status="found",
        http_status=200,
        message="Found mismatched product.",
        product=mismatched_ext,
    )

    with patch(
        "app.services.ocr_barcode_service.query_external_providers_for_barcode",
        return_value=(mismatched_ext, [mock_attempt]),
    ):
        resp = client.get("/api/v1/scan/barcode/8906005618726?force_refresh=true")
        assert resp.status_code == 200
        body = resp.json()
        assert body["merged_fields"] == []
        assert body["product"]["available_nutrient_count"] == 0
        assert any(
            c["field_name"] == "product_identity"
            for c in body["conflicts_requiring_review"]
        )


def test_05_invalid_unknown_timeout_and_rate_limit_barcode_handling():
    """
    Tests invalid barcode format, unknown barcode, network timeout, and HTTP 429 rate-limit handling.
    """
    # 1. Invalid barcode (<8 digits or non-numeric)
    r_inv = client.get("/api/v1/scan/barcode/12345")
    assert r_inv.status_code == 200
    assert r_inv.json()["found"] is False
    assert r_inv.json()["is_valid_barcode"] is False
    assert r_inv.json()["source_origin"] == "invalid_barcode"

    # 2. Network timeout must report provider_error, never a fake product
    timeout_attempt = ProviderLookupAttempt(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        status="timeout",
        message="Open Food Facts request timed out.",
    )
    with patch(
        "app.services.ocr_barcode_service.query_external_providers_for_barcode",
        return_value=(None, [timeout_attempt]),
    ):
        r_to = client.get("/api/v1/scan/barcode/8909999111118")
        assert r_to.status_code == 200
        assert r_to.json()["found"] is False
        assert r_to.json()["source_origin"] == "provider_error"
        assert r_to.json()["provider_attempts"][0]["status"] == "timeout"

    # 3. Rate-limit (HTTP 429) handling
    rl_attempt = ProviderLookupAttempt(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        status="rate_limited",
        http_status=429,
        message="HTTP 429 rate limit reached.",
    )
    with patch(
        "app.services.ocr_barcode_service.query_external_providers_for_barcode",
        return_value=(None, [rl_attempt]),
    ):
        r_rl = client.get("/api/v1/scan/barcode/8909999222229")
        assert r_rl.status_code == 200
        assert r_rl.json()["found"] is False
        assert r_rl.json()["source_origin"] == "provider_error"
        assert r_rl.json()["provider_attempts"][0]["http_status"] == 429


def test_06_duplicate_barcode_updates_existing_product_safely():
    """
    Verifies that submitting confirm-product with an existing barcode (8906005618726)
    updates the existing product record rather than throwing a SQLite UNIQUE constraint crash.
    """
    resp = client.post(
        "/api/v1/scan/confirm-product",
        json={
            "slug": "pkg-pineapple-cake-6b35c3",
            "name_en": "Pineapple Cake",
            "brand": "winkles",
            "barcode": "8906005618726",
            "default_basis": "100g",
            "standard_serving_name": "1 slice (30g)",
            "standard_serving_grams": 30.0,
            "is_vegetarian": False,
            "allergen_tags": ["eggs", "gluten", "milk"],
            "allergen_declaration_complete": True,
            "nutrients_per_100": {},
            "source_type": "user_entered",
            "user_confirmed": True,
        },
    )
    assert resp.status_code == 200
    assert resp.json()["slug"] == "pkg-pineapple-cake-6b35c3"
    assert resp.json()["barcode"] == "8906005618726"


def test_07_local_food_photographs_and_attribution_manifest():
    """
    Verifies that all 75 food items in FOOD_IMAGE_URLS and all 9 categories in CATEGORY_IMAGE_URLS
    point to valid, readable local .webp photographs under frontend/public/images/,
    with zero duplicate paths and complete attribution documentation.
    """
    project_root = Path(__file__).resolve().parents[2]
    public_dir = project_root / "frontend" / "public"

    assert len(FOOD_IMAGE_URLS) == 75
    assert len(set(FOOD_IMAGE_URLS.values())) == 75, "Each food must have its own unique local photograph"

    representative_slugs = [
        "idli-steamed-rice-lentil",
        "dosa-plain",
        "masala-dosa",
        "ragi-mudde-finger-millet-ball",
        "bisi-bele-bath",
        "khichdi-moong-dal-rice",
        "sambar-vegetable-lentil-stew",
        "banana-ripe",
        "apple-red",
        "mango-ripe",
        "almonds-badam",
        "paneer-cottage-cheese",
        "chicken-biryani",
    ]
    for rep_slug in representative_slugs:
        assert rep_slug in FOOD_IMAGE_URLS
        r = client.get(f"/api/v1/foods/{rep_slug}")
        assert r.status_code == 200
        food_json = r.json()
        assert food_json["image_url"] == FOOD_IMAGE_URLS[rep_slug]
        assert food_json["has_verified_image"] is True

    for slug, web_path in FOOD_IMAGE_URLS.items():
        assert web_path.startswith("/images/foods/") and web_path.endswith(".webp")
        file_path = public_dir / web_path.lstrip("/")
        assert file_path.exists(), f"Missing local image file for {slug}: {file_path}"
        with Image.open(file_path) as img:
            w, h = img.size
            assert w >= 200 and h >= 200, f"Invalid dimensions for {slug}: {w}x{h}"

    for cat_slug, web_path in CATEGORY_IMAGE_URLS.items():
        assert web_path.startswith("/images/categories/") and web_path.endswith(".webp")
        file_path = public_dir / web_path.lstrip("/")
        assert file_path.exists(), f"Missing local category image file for {cat_slug}: {file_path}"
        with Image.open(file_path) as img:
            w, h = img.size
            assert w >= 200 and h >= 200

    attr_json = public_dir / "images" / "foods" / "attribution.json"
    attr_md = project_root / "docs" / "IMAGE_ATTRIBUTION.md"
    assert attr_json.exists()
    assert attr_md.exists()
    records = json.loads(attr_json.read_text(encoding="utf-8"))
    assert len(records) == 84
