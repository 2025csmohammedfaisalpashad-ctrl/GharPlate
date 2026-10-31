"""
Multi-Source Provider Registry, Completeness Evaluator, Field-Level Merge Engine,
and Provenance Recorder for GharPlate Packaged Products.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.food_data_central import (
    lookup_fdc_by_barcode,
    search_fdc_foods,
)
from app.integrations.normalizer import (
    NormalizedExternalProduct,
    check_allergen_consistency,
    parse_and_clean_package_ingredients,
    verify_product_identity_match,
)
from app.integrations.open_food_facts import (
    ProviderLookupAttempt,
    fetch_open_food_facts_by_barcode,
    search_open_food_facts_products,
)
from app.models.entities import (
    DataSource,
    FoodItem,
    FoodNutrientValue,
    NutrientDefinition,
    ProductDataConflict,
    ProductFieldProvenance,
)

KEY_PACKAGED_NUTRIENT_CODES = [
    "energy_kcal",
    "protein_g",
    "carbs_g",
    "sugars_total_g",
    "sugars_added_g",
    "fat_total_g",
    "fat_saturated_g",
    "fibre_g",
    "sodium_mg",
]


def evaluate_local_product_completeness(food: FoodItem) -> Dict[str, Any]:
    """
    Evaluates whether a local packaged food record is complete or missing critical fields
    (verified product image, ingredients text, or key nutrients).
    CRITICAL: If image_url is NULL or key nutrients are NULL (e.g. Pineapple Cake 8906005618726),
    needs_enrichment is True so barcode lookup queries external providers instead of stopping early!
    """
    nv_map = {nv.nutrient_code: nv.value for nv in (food.nutrient_values or [])}
    available_key_nutrients = [
        c for c in KEY_PACKAGED_NUTRIENT_CODES if nv_map.get(c) is not None
    ]
    missing_key_nutrients = [
        c for c in KEY_PACKAGED_NUTRIENT_CODES if nv_map.get(c) is None
    ]
    total_available_nutrients = sum(
        1 for nv in (food.nutrient_values or []) if nv.value is not None
    )

    has_image = bool(food.image_url and food.image_url.strip())
    has_ingredients = bool(food.ingredients_text and food.ingredients_text.strip())
    has_nutrients = len(available_key_nutrients) >= 4

    now = datetime.now(timezone.utc)
    is_stale = True
    if food.external_updated_at:
        ext_ts = food.external_updated_at
        if ext_ts.tzinfo is None:
            ext_ts = ext_ts.replace(tzinfo=timezone.utc)
        if now - ext_ts < timedelta(hours=settings.PRODUCT_CACHE_HOURS):
            is_stale = False

    missing_summary: List[str] = []
    if not has_image:
        missing_summary.append("image_url")
    if not has_ingredients:
        missing_summary.append("ingredients_text")
    if not has_nutrients:
        missing_summary.append("nutrition_values")

    needs_enrichment = bool(not has_image or not has_ingredients or not has_nutrients)

    return {
        "has_verified_image": has_image,
        "has_ingredients": has_ingredients,
        "has_minimum_nutrients": has_nutrients,
        "available_key_nutrients": available_key_nutrients,
        "missing_key_nutrients": missing_key_nutrients,
        "total_available_nutrients": total_available_nutrients,
        "missing_domains": missing_summary,
        "is_stale": is_stale,
        "needs_enrichment": needs_enrichment,
    }


def ensure_external_data_source(
    db: Session, provider_code: str, provider_name: str, url: str, license_notes: str
) -> DataSource:
    src = db.query(DataSource).filter(DataSource.code == provider_code).first()
    if src:
        return src
    src = DataSource(
        code=provider_code,
        name=provider_name,
        organization=provider_name,
        document_title=f"{provider_name} Live Product & Nutrition API",
        publication_year=datetime.now(timezone.utc).year,
        version="v3" if provider_code == "OPEN_FOOD_FACTS" else "v1",
        url=url,
        license_notes=license_notes,
        source_type="third_party_open",
    )
    db.add(src)
    db.flush()
    return src


def record_field_provenance(
    db: Session,
    food_id: int,
    field_name: str,
    field_type: str,
    field_value: Optional[str],
    source_code: str,
    source_name: str,
    source_url: Optional[str] = None,
    source_record_id: Optional[str] = None,
    confidence_status: str = "user_confirmed",
    review_status: str = "confirmed",
    notes: Optional[str] = None,
) -> ProductFieldProvenance:
    existing = (
        db.query(ProductFieldProvenance)
        .filter(
            ProductFieldProvenance.food_id == food_id,
            ProductFieldProvenance.field_name == field_name,
            ProductFieldProvenance.source_code == source_code,
        )
        .first()
    )
    now = datetime.now(timezone.utc)
    if existing:
        existing.field_value = field_value
        existing.source_name = source_name
        existing.source_url = source_url
        existing.source_record_id = source_record_id
        existing.confidence_status = confidence_status
        existing.review_status = review_status
        existing.retrieved_at = now
        existing.notes = notes
        return existing

    prov = ProductFieldProvenance(
        food_id=food_id,
        field_name=field_name,
        field_type=field_type,
        field_value=field_value,
        source_code=source_code,
        source_name=source_name,
        source_url=source_url,
        source_record_id=source_record_id,
        confidence_status=confidence_status,
        review_status=review_status,
        retrieved_at=now,
        notes=notes,
    )
    db.add(prov)
    return prov


def record_data_conflict(
    db: Session,
    food_id: int,
    field_name: str,
    local_value: Optional[str],
    local_source: str,
    external_value: Optional[str],
    external_source: str,
    external_source_url: Optional[str] = None,
) -> ProductDataConflict:
    existing = (
        db.query(ProductDataConflict)
        .filter(
            ProductDataConflict.food_id == food_id,
            ProductDataConflict.field_name == field_name,
            ProductDataConflict.external_source == external_source,
        )
        .first()
    )
    now = datetime.now(timezone.utc)
    if existing:
        existing.local_value = local_value
        existing.external_value = external_value
        existing.external_source_url = external_source_url
        existing.detected_at = now
        return existing

    conflict = ProductDataConflict(
        food_id=food_id,
        field_name=field_name,
        local_value=local_value,
        local_source=local_source,
        external_value=external_value,
        external_source=external_source,
        external_source_url=external_source_url,
        resolution_status="requires_user_review",
        detected_at=now,
    )
    db.add(conflict)
    return conflict


def ensure_baseline_local_provenance(db: Session, food: FoodItem) -> None:
    """
    Ensures that existing local fields (such as Pineapple Cake's user-confirmed ingredients_text,
    brand, and barcode) have explicit field-level provenance records in `product_field_provenance`
    and cleaned ingredient / net_quantity / allergen_statement metadata populated non-destructively.
    """
    changed = False
    if food.ingredients_text and not food.cleaned_ingredients_text:
        parsed = parse_and_clean_package_ingredients(food.ingredients_text)
        food.cleaned_ingredients_text = parsed.cleaned_ingredients
        if parsed.allergen_declaration and not food.allergen_statement:
            food.allergen_statement = parsed.allergen_declaration
        if parsed.net_weight and not food.net_quantity:
            food.net_quantity = parsed.net_weight
        if parsed.manufacturer_info and not food.manufacturer_info:
            food.manufacturer_info = parsed.manufacturer_info
        if not food.raw_ocr_text:
            food.raw_ocr_text = food.ingredients_text
        changed = True

    src_code = food.source.code if food.source else "USER_VERIFIED_LABEL"
    src_name = food.source.name if food.source else "User-Confirmed Packaged Food Label Declaration"
    src_url = food.source.url if food.source else None

    if food.ingredients_text:
        record_field_provenance(
            db,
            food_id=food.id,
            field_name="ingredients_text",
            field_type="ingredient",
            field_value=food.cleaned_ingredients_text or food.ingredients_text,
            source_code=src_code,
            source_name=src_name,
            source_url=src_url,
            source_record_id=food.barcode or food.slug,
            confidence_status=food.confidence_level,
            review_status="confirmed",
            notes="Original user-confirmed / stored package ingredient statement preserved.",
        )
        changed = True

    if food.allergen_tags:
        consistency = check_allergen_consistency(
            food.ingredients_text,
            food.allergen_tags,
            food.allergen_declaration_complete,
        )
        record_field_provenance(
            db,
            food_id=food.id,
            field_name="allergen_tags",
            field_type="allergen",
            field_value=", ".join(food.allergen_tags),
            source_code=src_code,
            source_name=src_name,
            source_url=src_url,
            source_record_id=food.barcode or food.slug,
            confidence_status=food.confidence_level,
            review_status=(
                "pending_user_review"
                if consistency.requires_manual_review
                else "confirmed"
            ),
            notes=(
                "; ".join(consistency.consistency_warnings)
                if consistency.consistency_warnings
                else "Declared allergen tags."
            ),
        )
        changed = True

    if changed:
        db.commit()


def merge_external_product_into_local(
    db: Session,
    local_food: FoodItem,
    ext: NormalizedExternalProduct,
) -> Dict[str, Any]:
    """
    Merges compatible, verified missing fields from `ext` into `local_food` according to GharPlate's strict merge policy:
    1. Verify product identity first (`verify_product_identity_match`). If the external record has a conflicting
       product title/brand, DO NOT overwrite or merge nutrients; record a `ProductDataConflict` for user review.
    2. Preserve user-confirmed local fields (`name_en`, `brand`, `ingredients_text`, and any non-NULL user-confirmed nutrients).
    3. Fill missing (`NULL`) fields (`image_url`, `net_quantity`, `ingredients_text`, and `NULL` nutrient values)
       from the verified exact-barcode external record and record `ProductFieldProvenance` for every merged field.
    4. Record any conflicting field values in `ProductDataConflict` without silently overwriting local values.
    """
    ensure_baseline_local_provenance(db, local_food)

    is_same_product, match_reason, similarity = verify_product_identity_match(
        local_barcode=local_food.barcode,
        local_name=local_food.name_en,
        local_brand=local_food.brand,
        ext=ext,
    )

    merged_fields: List[str] = []
    conflicts_recorded: List[str] = []

    if not is_same_product:
        record_data_conflict(
            db,
            food_id=local_food.id,
            field_name="product_identity",
            local_value=f"{local_food.name_en} ({local_food.brand or 'Unknown Brand'})",
            local_source=local_food.source.name if local_food.source else "Local Catalog",
            external_value=f"{ext.product_name or 'Unknown'} ({ext.brand or 'Unknown Brand'})",
            external_source=ext.provider_name,
            external_source_url=ext.source_url,
        )
        local_food.external_updated_at = datetime.now(timezone.utc)
        db.commit()
        return {
            "identity_verified": False,
            "identity_reason": match_reason,
            "similarity_score": similarity,
            "merged_fields": [],
            "conflicts_recorded": ["product_identity"],
        }

    ext_src = ensure_external_data_source(
        db,
        provider_code=ext.provider_code,
        provider_name=ext.provider_name,
        url=ext.source_url,
        license_notes=ext.license_attribution or "External Open Product Database",
    )

    # 1. Image enrichment: fill missing image_url if external record has a genuine product photo
    ext_img = ext.front_image_url or ext.image_url
    if ext_img:
        if not local_food.image_url or local_food.image_url.startswith("/images/foods/packaged-foods/"):
            local_food.image_url = ext_img
            merged_fields.append("image_url")
            record_field_provenance(
                db,
                food_id=local_food.id,
                field_name="image_url",
                field_type="image",
                field_value=ext_img,
                source_code=ext.provider_code,
                source_name=ext.provider_name,
                source_url=ext.source_url,
                source_record_id=ext.source_record_id,
                confidence_status="external_verified_barcode",
                review_status="auto_merged_missing",
                notes="Front-of-package product image retrieved via exact barcode match.",
            )
        elif local_food.image_url != ext_img:
            record_field_provenance(
                db,
                food_id=local_food.id,
                field_name="image_url_alternative",
                field_type="image",
                field_value=ext_img,
                source_code=ext.provider_code,
                source_name=ext.provider_name,
                source_url=ext.source_url,
                source_record_id=ext.source_record_id,
                confidence_status="external_verified_barcode",
                review_status="pending_user_review",
                notes="Alternative external package image.",
            )

    # 2. Quantity enrichment
    if ext.quantity and not local_food.net_quantity:
        local_food.net_quantity = ext.quantity
        merged_fields.append("net_quantity")
        record_field_provenance(
            db,
            food_id=local_food.id,
            field_name="net_quantity",
            field_type="metadata",
            field_value=ext.quantity,
            source_code=ext.provider_code,
            source_name=ext.provider_name,
            source_url=ext.source_url,
            source_record_id=ext.source_record_id,
            confidence_status="external_verified_barcode",
            review_status="auto_merged_missing",
        )

    # 3. Ingredients enrichment: preserve existing user-confirmed ingredients; only fill if missing
    if ext.ingredients_text:
        if not local_food.ingredients_text:
            local_food.ingredients_text = ext.ingredients_text
            parsed = parse_and_clean_package_ingredients(ext.ingredients_text)
            local_food.cleaned_ingredients_text = parsed.cleaned_ingredients
            merged_fields.append("ingredients_text")
            record_field_provenance(
                db,
                food_id=local_food.id,
                field_name="ingredients_text",
                field_type="ingredient",
                field_value=ext.ingredients_text,
                source_code=ext.provider_code,
                source_name=ext.provider_name,
                source_url=ext.source_url,
                source_record_id=ext.source_record_id,
                confidence_status="external_verified_barcode",
                review_status="auto_merged_missing",
            )
        else:
            # Check if external ingredients differ materially from local user-confirmed ingredients
            local_clean = (local_food.cleaned_ingredients_text or local_food.ingredients_text).lower()
            ext_clean = ext.ingredients_text.lower()
            if local_clean[:60] != ext_clean[:60]:
                record_data_conflict(
                    db,
                    food_id=local_food.id,
                    field_name="ingredients_text",
                    local_value=local_food.cleaned_ingredients_text or local_food.ingredients_text,
                    local_source=local_food.source.name if local_food.source else "User-Confirmed Label",
                    external_value=ext.ingredients_text,
                    external_source=ext.provider_name,
                    external_source_url=ext.source_url,
                )
                conflicts_recorded.append("ingredients_text")

    # 4. Nutrient enrichment: fill ONLY NULL nutrient values; record conflict if external differs from non-NULL local value
    nv_by_code: Dict[str, FoodNutrientValue] = {
        nv.nutrient_code: nv for nv in (local_food.nutrient_values or [])
    }
    all_defs = {nd.code: nd for nd in db.query(NutrientDefinition).all()}

    for nut_code, ext_val in ext.nutrients_per_100.items():
        if ext_val is None or nut_code not in all_defs:
            continue
        existing_nv = nv_by_code.get(nut_code)
        if existing_nv is None:
            new_nv = FoodNutrientValue(
                food_id=local_food.id,
                nutrient_code=nut_code,
                value=float(ext_val),
                basis=local_food.default_basis,
                source_id=ext_src.id,
                confidence_status="openfoodfacts"
                if ext.provider_code == "OPEN_FOOD_FACTS"
                else "fdc_supplemental",
                measurement_notes=f"Enriched from {ext.provider_name} exact barcode match ({ext.source_record_id})",
            )
            db.add(new_nv)
            merged_fields.append(nut_code)
            record_field_provenance(
                db,
                food_id=local_food.id,
                field_name=nut_code,
                field_type="nutrient",
                field_value=str(ext_val),
                source_code=ext.provider_code,
                source_name=ext.provider_name,
                source_url=ext.source_url,
                source_record_id=ext.source_record_id,
                confidence_status="external_verified_barcode",
                review_status="auto_merged_missing",
                notes=f"Per {local_food.default_basis}",
            )
        elif existing_nv.value is None:
            existing_nv.value = float(ext_val)
            existing_nv.source_id = ext_src.id
            existing_nv.confidence_status = (
                "openfoodfacts"
                if ext.provider_code == "OPEN_FOOD_FACTS"
                else "fdc_supplemental"
            )
            existing_nv.measurement_notes = (
                f"Enriched from {ext.provider_name} exact barcode match ({ext.source_record_id})"
            )
            merged_fields.append(nut_code)
            record_field_provenance(
                db,
                food_id=local_food.id,
                field_name=nut_code,
                field_type="nutrient",
                field_value=str(ext_val),
                source_code=ext.provider_code,
                source_name=ext.provider_name,
                source_url=ext.source_url,
                source_record_id=ext.source_record_id,
                confidence_status="external_verified_barcode",
                review_status="auto_merged_missing",
                notes=f"Filled missing NULL nutrient per {local_food.default_basis}",
            )
        else:
            # Local value already exists — never overwrite; check for conflict (>10% or >2g difference)
            diff = abs(existing_nv.value - float(ext_val))
            if diff > max(2.0, 0.12 * max(existing_nv.value, 1.0)):
                record_data_conflict(
                    db,
                    food_id=local_food.id,
                    field_name=nut_code,
                    local_value=str(existing_nv.value),
                    local_source=existing_nv.source.name if existing_nv.source else "Local Verified",
                    external_value=str(ext_val),
                    external_source=ext.provider_name,
                    external_source_url=ext.source_url,
                )
                conflicts_recorded.append(nut_code)

    local_food.external_updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(local_food)

    return {
        "identity_verified": True,
        "identity_reason": match_reason,
        "similarity_score": similarity,
        "merged_fields": merged_fields,
        "conflicts_recorded": conflicts_recorded,
    }


def query_external_providers_for_barcode(
    db: Session, barcode: str, force_refresh: bool = False
) -> Tuple[Optional[NormalizedExternalProduct], List[ProviderLookupAttempt]]:
    """
    Queries configured external barcode providers in priority order:
    1. Open Food Facts (API v3)
    2. USDA FoodData Central Branded Foods (exact GTIN match)
    Returns (best_matched_external_product, list_of_provider_attempts).
    """
    attempts: List[ProviderLookupAttempt] = []

    off_attempt = fetch_open_food_facts_by_barcode(
        db, barcode, force_refresh=force_refresh
    )
    attempts.append(off_attempt)

    best_product: Optional[NormalizedExternalProduct] = off_attempt.product

    # Check USDA FoodData Central if Open Food Facts did not find the product or if key nutrients are still missing
    off_has_nutrients = bool(
        best_product
        and sum(1 for v in best_product.nutrients_per_100.values() if v is not None) >= 4
    )
    if not off_has_nutrients:
        fdc_attempt = lookup_fdc_by_barcode(db, barcode, force_refresh=force_refresh)
        attempts.append(fdc_attempt)
        if best_product is None and fdc_attempt.product is not None:
            best_product = fdc_attempt.product

    return best_product, attempts


def search_multi_source_external_products(
    db: Session, query: str, brand: Optional[str] = None, page_size: int = 5
) -> Tuple[List[NormalizedExternalProduct], List[ProviderLookupAttempt]]:
    """
    Searches Open Food Facts and USDA FoodData Central for candidate products matching `query` / `brand`.
    Candidates are returned for user selection and are never automatically merged without exact barcode verification.
    """
    candidates: List[NormalizedExternalProduct] = []
    attempts: List[ProviderLookupAttempt] = []

    off_items, off_attempt = search_open_food_facts_products(
        db, query=query, brand=brand, page_size=page_size
    )
    candidates.extend(off_items)
    attempts.append(off_attempt)

    fdc_items, fdc_attempt = search_fdc_foods(
        db, query=f"{brand or ''} {query}".strip(), page_size=page_size
    )
    candidates.extend(fdc_items)
    attempts.append(fdc_attempt)

    return candidates, attempts
