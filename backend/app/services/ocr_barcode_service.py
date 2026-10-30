"""
Packaged Food Label OCR Scanner, Intelligent Multi-Source Barcode Lookup,
and Experimental Dish Recognition Service (Modules 6, 7 & 8).

PRIVACY & INTEGRITY GUARANTEES:
1. All uploaded OCR label images are processed strictly in RAM (`io.BytesIO`) and immediately purged.
2. NEVER inserts synthetic or hardcoded sample nutrition values when OCR fails or returns unreadable text.
3. Barcode lookup evaluates local record completeness and queries external providers (Open Food Facts API v3,
   USDA FoodData Central Branded Foods) when a local record is incomplete (such as Pineapple Cake 8906005618726).
"""

import gc
import io
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from PIL import Image, ImageFilter, ImageOps, ImageStat
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.integrations.normalizer import (
    NormalizedExternalProduct,
    check_allergen_consistency,
    parse_and_clean_package_ingredients,
    validate_and_normalize_barcode,
)
from app.integrations.provider_registry import (
    ensure_baseline_local_provenance,
    ensure_external_data_source,
    evaluate_local_product_completeness,
    merge_external_product_into_local,
    query_external_providers_for_barcode,
    record_field_provenance,
)
from app.models.entities import (
    DataSource,
    FoodAlias,
    FoodCategory,
    FoodItem,
    FoodNutrientValue,
    NutrientDefinition,
    ServingConversion,
)
from app.schemas.api_schemas import (
    AllergenConsistencyOut,
    BarcodeLookupResponse,
    DishCandidateOut,
    DishRecognitionResponse,
    ManualProductCreateRequest,
    OCRFieldPrediction,
    OCRScanResponse,
    ProductDataConflictOut,
    ProviderAttemptOut,
)
from app.services.food_service import normalize_query, serialize_food_detail


def validate_and_inspect_image_in_memory(
    file_bytes: bytes, content_type: Optional[str]
) -> Tuple[int, int, Tuple[float, float, float]]:
    if not file_bytes:
        raise ValueError("Uploaded image file is empty.")
    if len(file_bytes) > settings.MAX_UPLOAD_SIZE_BYTES:
        raise ValueError(
            f"File exceeds maximum allowed size of {settings.MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)} MB."
        )
    if content_type and content_type.lower() not in settings.allowed_image_mimes_list:
        raise ValueError(
            f"Unsupported file type '{content_type}'. Allowed types: {settings.ALLOWED_IMAGE_MIMES}."
        )

    buf = io.BytesIO(file_bytes)
    try:
        with Image.open(buf) as img:
            img.verify()
        buf.seek(0)
        with Image.open(buf) as img2:
            rgb = img2.convert("RGB")
            width, height = rgb.size
            stat = ImageStat.Stat(rgb)
            mean_rgb = (stat.mean[0], stat.mean[1], stat.mean[2])
            return width, height, mean_rgb
    except Exception as exc:
        raise ValueError(f"Invalid or corrupted image file: {exc}") from exc
    finally:
        buf.close()


def preprocess_label_image_for_ocr(img: Image.Image) -> Image.Image:
    """
    Applies EXIF transpose, grayscale conversion, contrast enhancement, and sharpening
    in memory to improve OCR legibility on nutrition tables and ingredient panels.
    """
    transposed = ImageOps.exif_transpose(img)
    gray = ImageOps.grayscale(transposed)
    contrasted = ImageOps.autocontrast(gray, cutoff=1)
    sharpened = contrasted.filter(ImageFilter.SHARPEN)
    return sharpened


def extract_text_from_image_bytes_in_memory(
    file_bytes: bytes,
) -> Tuple[str, str, Optional[str]]:
    """
    Attempts OCR extraction across upright and rotated orientations using pytesseract if installed.
    Returns (extracted_text, engine_status, error_reason).
    NEVER fabricates or substitutes sample text if OCR fails.
    """
    try:
        import pytesseract  # type: ignore
    except ImportError:
        return (
            "",
            "engine_unavailable",
            "Local Tesseract OCR engine (pytesseract / tesseract binary) is not installed in the runtime environment.",
        )

    buf = io.BytesIO(file_bytes)
    try:
        with Image.open(buf) as raw_img:
            processed = preprocess_label_image_for_ocr(raw_img)
            best_text = ""
            # Try upright first, then 90 / 270 / 180 rotations if upright yields minimal text
            for angle in (0, 90, 270, 180):
                candidate_img = (
                    processed if angle == 0 else processed.rotate(angle, expand=True)
                )
                txt = (pytesseract.image_to_string(candidate_img) or "").strip()
                if len(txt) > len(best_text):
                    best_text = txt
                if len(best_text) >= 40 and any(
                    kw in best_text.lower()
                    for kw in ("energy", "protein", "carbohydrate", "ingredient", "kcal", "fat")
                ):
                    break
            if not best_text.strip():
                return (
                    "",
                    "no_text_detected",
                    "No readable nutrition or ingredient text could be extracted from the image. Please upload a clearer, well-lit photograph or enter values manually.",
                )
            return best_text, "tesseract_ocr", None
    except Exception as exc:
        return (
            "",
            "engine_unavailable",
            f"OCR engine could not process image ({exc.__class__.__name__}). Please upload a clearer photograph or enter values manually.",
        )
    finally:
        buf.close()


def clean_ocr_numeric_token(raw_token: str) -> Tuple[Optional[float], bool, Optional[float]]:
    """
    Detects OCR character errors such as 'O' for '0' or 'l'/'I' for '1'.
    Does NOT silently overwrite uncertain values — returns (parsed_val, had_ocr_typo, proposed_correction).
    """
    token = raw_token.strip()
    try:
        return float(token), False, None
    except ValueError:
        pass

    corrected = (
        token.replace("O", "0")
        .replace("o", "0")
        .replace("l", "1")
        .replace("I", "1")
        .replace("S", "5")
        .replace(",", ".")
    )
    corrected = re.sub(r"[^0-9.]", "", corrected)
    try:
        proposed = float(corrected)
        return None, True, proposed
    except ValueError:
        return None, True, None


def _build_empty_failed_ocr_fields() -> Dict[str, OCRFieldPrediction]:
    """
    Builds an honest empty field map (with extracted_value=None for every nutrient)
    when OCR fails or detects no text. NEVER inserts synthetic nutrient numbers.
    """
    specs = [
        ("product_name", "Product Name", None),
        ("brand", "Brand", None),
        ("serving_size", "Serving Size", "g/ml"),
        ("net_quantity", "Net Quantity / Weight", "g/ml"),
        ("energy_kcal", "Energy", "kcal"),
        ("protein_g", "Protein", "g"),
        ("carbs_g", "Total Carbohydrates", "g"),
        ("sugars_total_g", "Total Sugars", "g"),
        ("sugars_added_g", "Added Sugars", "g"),
        ("fat_total_g", "Total Fat", "g"),
        ("fat_saturated_g", "Saturated Fat", "g"),
        ("fat_trans_g", "Trans Fat", "g"),
        ("fibre_g", "Dietary Fibre", "g"),
        ("sodium_mg", "Sodium", "mg"),
        ("ingredients_text", "Ingredients List", None),
        ("allergen_declarations", "Allergen Declaration", None),
    ]
    return {
        code: OCRFieldPrediction(
            field_name=label,
            extracted_value=None,
            unit=unit,
            confidence=0.0,
            validation_status="missing",
            validation_message="Not extracted — enter manually from the physical package.",
            proposed_correction=None,
        )
        for code, label, unit in specs
    }


def parse_nutrition_label_text(
    raw_text: str,
    ocr_status: str = "success",
    ocr_engine: str = "text_parser",
    ocr_error_reason: Optional[str] = None,
) -> OCRScanResponse:
    """
    Parses FSSAI / Indian packaged food nutrition label text, validates units,
    checks per-serving vs per-100g confusion, impossible values (>100g per 100g),
    Atwater energy consistency (4*P + 4*C + 9*F), and structured ingredient/allergen separation.
    """
    scan_id = f"ocr_{uuid.uuid4().hex[:10]}"
    if not raw_text or not raw_text.strip():
        return OCRScanResponse(
            scan_id=scan_id,
            ocr_status=ocr_status if ocr_status != "success" else "failed_no_text",
            ocr_engine=ocr_engine,
            ocr_error_reason=ocr_error_reason
            or "No readable label text was detected. GharPlate never inserts synthetic fallback values.",
            requires_manual_entry=True,
            privacy_confirmation="Processed strictly in memory (RAM). Image bytes were purged immediately and never written to disk or database.",
            raw_text="",
            detected_basis="100g",
            parsed_ingredients=None,
            allergen_consistency=None,
            fields=_build_empty_failed_ocr_fields(),
            validation_warnings=[
                ocr_error_reason
                or "OCR could not extract text from the uploaded image. Please take a clearer photo or enter values manually below."
            ],
            requires_user_confirmation=True,
        )

    text_lower = raw_text.lower()

    # Detect basis
    has_100g = bool(re.search(r"per\s*100\s*g", text_lower))
    has_100ml = bool(re.search(r"per\s*100\s*ml", text_lower))
    has_per_serve = bool(re.search(r"per\s*serv(ing|e)", text_lower))

    detected_basis = "100g"
    warnings: List[str] = []
    if has_100ml:
        detected_basis = "100ml"
    elif has_per_serve and not (has_100g or has_100ml):
        detected_basis = "per_serving_only"
        warnings.append(
            "Per-serving vs. per-100g warning: Label appears to declare values per serving without a clear 'per 100g/100ml' header. Please verify the basis before saving."
        )
    elif has_per_serve and (has_100g or has_100ml):
        warnings.append(
            "Multi-column label detected (both Per 100g and Per Serving present). Verify that extracted values correspond to the Per 100g/100ml column."
        )

    fields: Dict[str, OCRFieldPrediction] = {}

    # Extract Product Name, Brand, Serving Size, Net Quantity
    prod_match = re.search(r"product(?:\s*name)?\s*[:\-]\s*(.+)", raw_text, re.IGNORECASE)
    brand_match = re.search(r"brand\s*[:\-]\s*(.+)", raw_text, re.IGNORECASE)
    serv_match = re.search(r"serving\s*size\s*[:\-]?\s*([0-9]+\s*(?:g|ml))", raw_text, re.IGNORECASE)
    parsed_ing = parse_and_clean_package_ingredients(raw_text)

    fields["product_name"] = OCRFieldPrediction(
        field_name="Product Name",
        extracted_value=prod_match.group(1).strip() if prod_match else None,
        unit=None,
        confidence=0.90 if prod_match else 0.0,
        validation_status="valid" if prod_match else "missing",
        validation_message=None if prod_match else "Product name not clearly identified; please enter manually.",
    )
    fields["brand"] = OCRFieldPrediction(
        field_name="Brand",
        extracted_value=brand_match.group(1).strip() if brand_match else None,
        unit=None,
        confidence=0.88 if brand_match else 0.0,
        validation_status="valid" if brand_match else "missing",
    )
    fields["serving_size"] = OCRFieldPrediction(
        field_name="Serving Size",
        extracted_value=serv_match.group(1).strip() if serv_match else None,
        unit="g/ml",
        confidence=0.85 if serv_match else 0.0,
        validation_status="valid" if serv_match else "warning",
        validation_message=None if serv_match else "Serving size not explicitly found on label; please verify.",
    )
    fields["net_quantity"] = OCRFieldPrediction(
        field_name="Net Quantity / Weight",
        extracted_value=parsed_ing.net_weight,
        unit="g/ml",
        confidence=0.85 if parsed_ing.net_weight else 0.0,
        validation_status="valid" if parsed_ing.net_weight else "missing",
    )

    nutrient_patterns = [
        ("energy_kcal", "Energy", r"energy\s*[:\-]?\s*([0-9OolIS.,]+)\s*(kcal|kj|cal)?", "kcal", 900.0),
        ("protein_g", "Protein", r"protein\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("carbs_g", "Total Carbohydrates", r"(?:total\s*)?carbohydrate[s]?\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("sugars_total_g", "Total Sugars", r"(?:total\s*)?sugar[s]?\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("sugars_added_g", "Added Sugars", r"added\s*sugar[s]?\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("fat_total_g", "Total Fat", r"(?:total\s*)?fat\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("fat_saturated_g", "Saturated Fat", r"saturated\s*fat(?:ty\s*acids)?\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("fat_trans_g", "Trans Fat", r"trans\s*fat(?:ty\s*acids)?\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("fibre_g", "Dietary Fibre", r"(?:dietary\s*)?fib(?:re|er)\s*[:\-]?\s*([0-9OolIS.,]+)\s*(g|mg)?", "g", 100.0),
        ("sodium_mg", "Sodium", r"sodium\s*[:\-]?\s*([0-9OolIS.,]+)\s*(mg|g)?", "mg", 50000.0),
    ]

    extracted_nums: Dict[str, float] = {}

    for code, label, pattern, expected_unit, max_possible in nutrient_patterns:
        m = re.search(pattern, raw_text, re.IGNORECASE)
        if not m:
            fields[code] = OCRFieldPrediction(
                field_name=label,
                extracted_value=None,
                unit=expected_unit,
                confidence=0.0,
                validation_status="missing",
                validation_message="Not detected on label (stored as NULL unless entered).",
            )
            continue

        raw_val_str = m.group(1)
        found_unit = (m.group(2) or expected_unit).lower()
        parsed_val, had_typo, proposed_corr = clean_ocr_numeric_token(raw_val_str)

        if had_typo:
            warnings.append(
                f"OCR character ambiguity in {label}: read '{raw_val_str}'. Proposed numeric interpretation: {proposed_corr}. Please confirm."
            )
            fields[code] = OCRFieldPrediction(
                field_name=label,
                extracted_value=raw_val_str,
                unit=found_unit,
                confidence=0.45,
                validation_status="warning",
                validation_message=f"OCR character ambiguity ('{raw_val_str}'). Proposed correction: {proposed_corr} {expected_unit}.",
                proposed_correction=proposed_corr,
            )
            continue

        assert parsed_val is not None
        if code == "energy_kcal" and found_unit == "kj":
            kcal_conv = round(parsed_val / 4.184, 1)
            warnings.append(
                f"Unit check: Energy declared in kJ ({parsed_val} kJ). Proposed conversion: {kcal_conv} kcal."
            )
            fields[code] = OCRFieldPrediction(
                field_name=label,
                extracted_value=parsed_val,
                unit="kJ",
                confidence=0.75,
                validation_status="warning",
                validation_message=f"Declared in kJ ({parsed_val} kJ). Proposed kcal value: {kcal_conv} kcal.",
                proposed_correction=kcal_conv,
            )
            extracted_nums[code] = kcal_conv
            continue

        if code == "sodium_mg" and found_unit == "g" and parsed_val < 50.0:
            mg_conv = round(parsed_val * 1000.0, 1)
            warnings.append(
                f"Unit check: Sodium appears to be declared in grams ({parsed_val} g). Proposed conversion: {mg_conv} mg."
            )
            fields[code] = OCRFieldPrediction(
                field_name=label,
                extracted_value=parsed_val,
                unit="g",
                confidence=0.70,
                validation_status="warning",
                validation_message=f"Unit appears to be grams ({parsed_val} g). Proposed mg value: {mg_conv} mg.",
                proposed_correction=mg_conv,
            )
            extracted_nums[code] = mg_conv
            continue

        if parsed_val < 0 or parsed_val > max_possible:
            warnings.append(
                f"Impossible numeric value for {label}: {parsed_val} {expected_unit} exceeds physical 100g bounds ({max_possible} {expected_unit})."
            )
            fields[code] = OCRFieldPrediction(
                field_name=label,
                extracted_value=parsed_val,
                unit=expected_unit,
                confidence=0.30,
                validation_status="error",
                validation_message=f"Impossible value ({parsed_val} {expected_unit} per 100g). Please correct manually.",
                proposed_correction=round(parsed_val / 10.0, 1) if parsed_val <= max_possible * 10 else None,
            )
            continue

        extracted_nums[code] = parsed_val
        fields[code] = OCRFieldPrediction(
            field_name=label,
            extracted_value=parsed_val,
            unit=expected_unit,
            confidence=0.92,
            validation_status="valid",
            validation_message=None,
        )

    # Cross-field validation checks
    p_val = extracted_nums.get("protein_g", 0.0)
    c_val = extracted_nums.get("carbs_g", 0.0)
    f_val = extracted_nums.get("fat_total_g", 0.0)
    macro_sum = p_val + c_val + f_val
    if macro_sum > 102.0:
        warnings.append(
            f"Inconsistent macronutrient total: Protein ({p_val}g) + Carbohydrates ({c_val}g) + Total Fat ({f_val}g) = {macro_sum:.1f}g, which exceeds 100g."
        )

    if (
        "sugars_added_g" in extracted_nums
        and "sugars_total_g" in extracted_nums
        and extracted_nums["sugars_added_g"] > extracted_nums["sugars_total_g"]
    ):
        warnings.append(
            f"Inconsistent sugar declaration: Added Sugars ({extracted_nums['sugars_added_g']}g) exceeds Total Sugars ({extracted_nums['sugars_total_g']}g)."
        )

    if (
        "fat_saturated_g" in extracted_nums
        and "fat_total_g" in extracted_nums
        and extracted_nums["fat_saturated_g"] > extracted_nums["fat_total_g"]
    ):
        warnings.append(
            f"Inconsistent fat declaration: Saturated Fat ({extracted_nums['fat_saturated_g']}g) exceeds Total Fat ({extracted_nums['fat_total_g']}g)."
        )

    if "energy_kcal" in extracted_nums and (p_val > 0 or c_val > 0 or f_val > 0):
        estimated_kcal = 4.0 * p_val + 4.0 * c_val + 9.0 * f_val
        declared_kcal = extracted_nums["energy_kcal"]
        if abs(declared_kcal - estimated_kcal) > max(65.0, 0.25 * estimated_kcal):
            warnings.append(
                f"Calorie-macronutrient mismatch: Declared Energy ({declared_kcal:.0f} kcal) differs significantly from Atwater estimate (~{estimated_kcal:.0f} kcal from protein, carbs, and fat)."
            )

    # Extract ingredients and allergens using improved multi-line and noisy-package parser
    ing_match = re.search(
        r"ingredients?\s*[:\-]\s*(.+?)(?=\n\s*(?:allergen|nutritional|per\s*100|storage|manufactured|marketed|$))",
        raw_text,
        re.IGNORECASE | re.DOTALL,
    )
    raw_ing_str = ing_match.group(1).strip() if ing_match else None
    ing_analysis = parse_and_clean_package_ingredients(raw_ing_str or raw_text)
    extracted_ing = (
        ing_analysis.cleaned_ingredients
        if (ing_match or "ins " in raw_text.lower() or "contains " in raw_text.lower())
        else None
    )

    all_match = re.search(
        r"allergen(?:s|\s*information|\s*advice)?\s*[:\-]\s*([^\n]+)",
        raw_text,
        re.IGNORECASE,
    )
    extracted_allergen_stmt = (
        all_match.group(1).strip()
        if all_match
        else ing_analysis.allergen_declaration
    )

    warnings.extend(ing_analysis.ocr_uncertainty_notes)

    consistency = check_allergen_consistency(
        raw_text,
        [],
        allergen_declaration_complete=bool(extracted_ing or extracted_allergen_stmt),
    )

    fields["ingredients_text"] = OCRFieldPrediction(
        field_name="Ingredients List",
        extracted_value=extracted_ing,
        unit=None,
        confidence=0.88 if extracted_ing else 0.0,
        validation_status="valid" if extracted_ing else "missing",
    )
    fields["allergen_declarations"] = OCRFieldPrediction(
        field_name="Allergen Declaration",
        extracted_value=extracted_allergen_stmt,
        unit=None,
        confidence=0.88 if extracted_allergen_stmt else 0.0,
        validation_status="valid" if extracted_allergen_stmt else "warning",
        validation_message=None
        if extracted_allergen_stmt
        else "No explicit allergen line found; cannot guarantee allergen absence.",
    )

    has_any_extracted = bool(
        extracted_nums or extracted_ing or extracted_allergen_stmt or prod_match
    )
    effective_status = ocr_status if has_any_extracted else "failed_no_text"

    return OCRScanResponse(
        scan_id=scan_id,
        ocr_status=effective_status,
        ocr_engine=ocr_engine,
        ocr_error_reason=ocr_error_reason if not has_any_extracted else None,
        requires_manual_entry=not has_any_extracted,
        privacy_confirmation="Processed strictly in memory (RAM). Image bytes were purged immediately and never written to disk or database.",
        raw_text=raw_text,
        detected_basis=detected_basis,
        parsed_ingredients={
            "cleaned_ingredients": extracted_ing,
            "ingredient_items": ing_analysis.ingredient_items,
            "ingredient_percentages": ing_analysis.ingredient_percentages,
            "additives": ing_analysis.additives,
            "allergen_declaration": extracted_allergen_stmt,
            "label_warnings": ing_analysis.label_warnings,
            "net_weight": ing_analysis.net_weight,
            "manufacturer_info": ing_analysis.manufacturer_info,
        },
        allergen_consistency=AllergenConsistencyOut(
            stored_allergen_tags=consistency.stored_allergen_tags,
            declared_allergens=consistency.declared_allergens,
            ingredient_inferred_allergens=consistency.ingredient_inferred_allergens,
            missing_from_stored_tags=consistency.missing_from_stored_tags,
            consistency_status=consistency.consistency_status,
            consistency_warnings=consistency.consistency_warnings,
            requires_manual_review=consistency.requires_manual_review,
        ),
        fields=fields,
        validation_warnings=warnings,
        requires_user_confirmation=True,
    )


def process_uploaded_label_image(
    file_bytes: bytes,
    content_type: Optional[str],
    hint_text: Optional[str] = None,
    ingredients_image_bytes: Optional[bytes] = None,
    ingredients_content_type: Optional[str] = None,
) -> OCRScanResponse:
    """
    Processes one or more uploaded package label photographs (Nutrition panel + optional Ingredients panel)
    strictly in RAM.
    CRITICAL REGRESSION FIX:
    Removed the hardcoded synthetic nutrition fallback (465 kcal, 7.4g protein, etc.) completely.
    When OCR cannot read text and no user text is provided, returns an explicit failure state
    with NULL/None fields and requests a clearer photograph or manual entry.
    """
    validate_and_inspect_image_in_memory(file_bytes, content_type)
    extracted_segments: List[str] = []

    nut_text, engine_status, err_reason = extract_text_from_image_bytes_in_memory(file_bytes)
    if nut_text.strip():
        extracted_segments.append(nut_text.strip())

    if ingredients_image_bytes:
        validate_and_inspect_image_in_memory(
            ingredients_image_bytes, ingredients_content_type
        )
        ing_text, _, _ = extract_text_from_image_bytes_in_memory(ingredients_image_bytes)
        if ing_text.strip():
            extracted_segments.append(ing_text.strip())
        del ingredients_image_bytes

    # Explicitly purge image buffer references from memory
    del file_bytes
    gc.collect()

    if hint_text and hint_text.strip():
        extracted_segments.append(hint_text.strip())
        if engine_status in ("engine_unavailable", "no_text_detected"):
            engine_status = "user_assisted_text"
            err_reason = None

    combined_text = "\n".join(extracted_segments).strip()

    if not combined_text:
        fail_status = (
            "failed_engine_unavailable"
            if engine_status == "engine_unavailable"
            else "failed_no_text"
        )
        return parse_nutrition_label_text(
            raw_text="",
            ocr_status=fail_status,
            ocr_engine=engine_status,
            ocr_error_reason=err_reason
            or "No readable nutrition or ingredient text was detected in the uploaded image. Please upload a clearer photo or enter values manually.",
        )

    return parse_nutrition_label_text(
        raw_text=combined_text,
        ocr_status="success",
        ocr_engine=engine_status,
        ocr_error_reason=err_reason,
    )


def _create_local_product_from_external(
    db: Session, ext: NormalizedExternalProduct
) -> FoodItem:
    """
    Saves a newly discovered verified exact-barcode external product into the local catalog
    with full field-level provenance. Missing nutrients remain NULL.
    """
    clean_code = ext.barcode or "unknown"
    name = ext.product_name or f"Packaged Product ({clean_code})"
    brand = ext.brand or "External Verified Brand"
    slug_base = re.sub(r"[^a-z0-9]+", "-", f"{brand}-{name}".lower()).strip("-")[:80]
    slug = f"pkg-{slug_base}-{clean_code[-4:]}"
    if db.query(FoodItem).filter(FoodItem.slug == slug).first():
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    cat = db.query(FoodCategory).filter(FoodCategory.slug == "packaged-foods").first()
    if not cat:
        raise ValueError("Packaged foods category missing")

    ext_src = ensure_external_data_source(
        db,
        provider_code=ext.provider_code,
        provider_name=ext.provider_name,
        url=ext.source_url,
        license_notes=ext.license_attribution or "Open Product Database",
    )

    parsed_ing = parse_and_clean_package_ingredients(ext.ingredients_text)
    allergens = sorted(
        list(
            set(ext.allergen_tags)
            | set(
                check_allergen_consistency(
                    ext.ingredients_text, ext.allergen_tags, bool(ext.ingredients_text)
                ).declared_allergens
            )
        )
    )
    has_non_veg = any(a in ("egg", "fish", "shellfish") for a in allergens)

    food = FoodItem(
        slug=slug,
        name_en=name,
        category_id=cat.id,
        description=f"Packaged product ({brand}) retrieved via verified barcode lookup from {ext.provider_name}.",
        image_url=ext.front_image_url or ext.image_url,
        is_packaged=True,
        brand=brand,
        barcode=clean_code,
        net_quantity=ext.quantity or parsed_ing.net_weight,
        default_basis="100g",
        standard_serving_name=ext.serving_size_label or "1 serving (30g)",
        standard_serving_grams=ext.serving_size_grams or 30.0,
        is_vegetarian=not has_non_veg,
        is_vegan=(not has_non_veg) and ("milk" not in allergens),
        allergen_tags=allergens,
        intolerance_tags=[],
        dietary_tags=["packaged_food"],
        ingredients_text=ext.ingredients_text,
        cleaned_ingredients_text=parsed_ing.cleaned_ingredients,
        allergen_statement=parsed_ing.allergen_declaration,
        manufacturer_info=parsed_ing.manufacturer_info,
        allergen_declaration_complete=bool(ext.ingredients_text),
        source_id=ext_src.id,
        confidence_level="label_declared",
        external_updated_at=datetime.now(timezone.utc),
    )
    db.add(food)
    db.flush()

    db.add(
        FoodAlias(
            food_id=food.id,
            language="en",
            alias_text=food.name_en,
            normalized_text=normalize_query(food.name_en),
            script_text=food.name_en,
        )
    )
    db.add(
        ServingConversion(
            food_id=food.id,
            unit_name="100g",
            unit_label="100 g",
            grams_equivalent=100.0,
            is_default=False,
        )
    )
    db.add(
        ServingConversion(
            food_id=food.id,
            unit_name="standard_serving",
            unit_label=food.standard_serving_name,
            grams_equivalent=food.standard_serving_grams,
            is_default=True,
        )
    )

    all_nut_defs = db.query(NutrientDefinition).all()
    for nd in all_nut_defs:
        val = ext.nutrients_per_100.get(nd.code, None)
        db.add(
            FoodNutrientValue(
                food_id=food.id,
                nutrient_code=nd.code,
                value=float(val) if val is not None else None,
                basis="100g",
                source_id=ext_src.id,
                confidence_status=(
                    "openfoodfacts"
                    if val is not None and ext.provider_code == "OPEN_FOOD_FACTS"
                    else ("fdc_supplemental" if val is not None else "not_measured")
                ),
            )
        )
        if val is not None:
            record_field_provenance(
                db,
                food_id=food.id,
                field_name=nd.code,
                field_type="nutrient",
                field_value=str(val),
                source_code=ext.provider_code,
                source_name=ext.provider_name,
                source_url=ext.source_url,
                source_record_id=ext.source_record_id,
                confidence_status="external_verified_barcode",
                review_status="confirmed",
            )

    if food.image_url:
        record_field_provenance(
            db,
            food_id=food.id,
            field_name="image_url",
            field_type="image",
            field_value=food.image_url,
            source_code=ext.provider_code,
            source_name=ext.provider_name,
            source_url=ext.source_url,
            source_record_id=ext.source_record_id,
            confidence_status="external_verified_barcode",
            review_status="confirmed",
        )
    if food.ingredients_text:
        record_field_provenance(
            db,
            food_id=food.id,
            field_name="ingredients_text",
            field_type="ingredient",
            field_value=food.cleaned_ingredients_text or food.ingredients_text,
            source_code=ext.provider_code,
            source_name=ext.provider_name,
            source_url=ext.source_url,
            source_record_id=ext.source_record_id,
            confidence_status="external_verified_barcode",
            review_status="confirmed",
        )

    db.commit()
    db.refresh(food)
    return food


def lookup_barcode(
    db: Session, barcode: str, force_refresh: bool = False
) -> BarcodeLookupResponse:
    """
    12-Step Intelligent Multi-Source Barcode Lookup:
    1. Validate and normalize barcode (EAN-8, UPC-A, EAN-13, GTIN-14).
    2. Search local database using exact barcode.
    3. Determine completeness of local record (`evaluate_local_product_completeness`).
    4. Check when local external data was last refreshed.
    5. If important fields are missing (e.g., Pineapple Cake 8906005618726 missing image_url and nutrients)
       or cache is stale or force_refresh=True, query external providers (Open Food Facts API v3, USDA FDC).
    6. Retrieve matching product information.
    7. Compare local and external records (`verify_product_identity_match`).
    8. Merge only compatible, verified missing fields (`merge_external_product_into_local`).
    9. Identify and record conflicting values (`ProductDataConflict`).
    10. Preserve field-level source attribution (`ProductFieldProvenance`).
    11. Update local cache safely.
    12. Return consolidated `BarcodeLookupResponse`.
    """
    now = datetime.now(timezone.utc)
    clean_code, is_valid, b_format, val_msg = validate_and_normalize_barcode(barcode)

    if not is_valid:
        return BarcodeLookupResponse(
            barcode=clean_code or barcode.strip(),
            barcode_format=b_format,
            is_valid_barcode=False,
            found=False,
            source_origin="invalid_barcode",
            retrieval_timestamp=now,
            message=val_msg or f"Invalid barcode format '{barcode}'.",
            fallback_actions=[
                "Verify the 8, 12, 13, or 14-digit barcode printed below the package bars",
                "Use the Nutrition Label OCR Scanner to scan the package nutrition table directly",
            ],
            product=None,
        )

    local_food = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.aliases),
            joinedload(FoodItem.nutrient_values).joinedload(FoodNutrientValue.source),
            joinedload(FoodItem.servings),
            joinedload(FoodItem.field_provenance),
            joinedload(FoodItem.data_conflicts),
        )
        .filter(FoodItem.barcode == clean_code)
        .first()
    )

    provider_attempts_out: List[ProviderAttemptOut] = []
    merged_fields: List[str] = []

    if local_food:
        ensure_baseline_local_provenance(db, local_food)
        completeness = evaluate_local_product_completeness(local_food)

        # Do NOT stop at the first local match when the record is incomplete or force_refresh is requested!
        if completeness["needs_enrichment"] or (completeness["is_stale"] and force_refresh) or force_refresh:
            ext_prod, attempts = query_external_providers_for_barcode(
                db, clean_code, force_refresh=force_refresh
            )
            provider_attempts_out = [
                ProviderAttemptOut(
                    provider_code=a.provider_code,
                    provider_name=a.provider_name,
                    status=a.status,
                    http_status=a.http_status,
                    message=a.message,
                    from_cache=a.from_cache,
                    retrieved_at=a.retrieved_at,
                )
                for a in attempts
            ]
            if ext_prod is not None:
                merge_res = merge_external_product_into_local(db, local_food, ext_prod)
                merged_fields = merge_res.get("merged_fields", [])
                db.refresh(local_food)
                completeness = evaluate_local_product_completeness(local_food)

        detail_out = serialize_food_detail(db, local_food)
        fallback_actions: List[str] = []
        if not completeness["has_verified_image"]:
            fallback_actions.append(
                "Upload a front-of-package photograph with consent to display the actual product image"
            )
        if not completeness["has_minimum_nutrients"]:
            fallback_actions.append(
                "Scan the back-of-pack Nutrition Information panel with OCR to capture missing nutrient values"
            )
            fallback_actions.append(
                "Enter declared per-100g nutrition values manually from the physical package"
            )

        origin = (
            "local_enriched_external"
            if merged_fields
            else "local_verified_db"
        )
        msg = f"Found packaged product '{local_food.name_en}' ({local_food.brand or 'Unknown Brand'})."
        if merged_fields:
            msg += f" Enriched {len(merged_fields)} missing field(s) ({', '.join(merged_fields[:5])}) from verified external barcode match."
        elif completeness["needs_enrichment"]:
            missing_str = ", ".join(completeness["missing_domains"])
            msg += f" Local record is incomplete (missing: {missing_str}) and external databases did not have additional verified data for barcode {clean_code}."

        return BarcodeLookupResponse(
            barcode=clean_code,
            barcode_format=b_format,
            is_valid_barcode=True,
            found=True,
            source_origin=origin,
            retrieval_timestamp=now,
            message=msg,
            fallback_actions=fallback_actions,
            completeness=completeness,
            provider_attempts=provider_attempts_out,
            merged_fields=merged_fields,
            conflicts_requiring_review=[
                ProductDataConflictOut.model_validate(c)
                for c in (local_food.data_conflicts or [])
            ],
            product=detail_out,
        )

    # Not in local DB — query external providers
    ext_prod, attempts = query_external_providers_for_barcode(
        db, clean_code, force_refresh=force_refresh
    )
    provider_attempts_out = [
        ProviderAttemptOut(
            provider_code=a.provider_code,
            provider_name=a.provider_name,
            status=a.status,
            http_status=a.http_status,
            message=a.message,
            from_cache=a.from_cache,
            retrieved_at=a.retrieved_at,
        )
        for a in attempts
    ]

    if ext_prod is not None:
        new_food = _create_local_product_from_external(db, ext_prod)
        completeness = evaluate_local_product_completeness(new_food)
        detail_out = serialize_food_detail(db, new_food)
        origin = (
            "open_food_facts_live"
            if ext_prod.provider_code == "OPEN_FOOD_FACTS"
            else "usda_fdc_live"
        )
        return BarcodeLookupResponse(
            barcode=clean_code,
            barcode_format=b_format,
            is_valid_barcode=True,
            found=True,
            source_origin=origin,
            retrieval_timestamp=now,
            message=f"Retrieved '{new_food.name_en}' from {ext_prod.provider_name} by exact barcode match.",
            fallback_actions=[
                "Review extracted fields against your physical package",
                "Scan nutrition panel if any nutrients are still unmeasured (NULL)",
            ],
            completeness=completeness,
            provider_attempts=provider_attempts_out,
            merged_fields=list(ext_prod.available_fields),
            conflicts_requiring_review=[],
            product=detail_out,
        )

    # Check if external lookup failed due to network/timeout/rate-limit vs genuine not_found
    had_network_issue = any(
        a.status in ("timeout", "network_error", "rate_limited", "http_error")
        for a in provider_attempts_out
    )
    status_note = (
        "External product database lookup encountered a network/rate-limit error; could not verify online catalog."
        if had_network_issue
        else f"No packaged product record found for barcode '{clean_code}' in GharPlate or external databases."
    )

    return BarcodeLookupResponse(
        barcode=clean_code,
        barcode_format=b_format,
        is_valid_barcode=True,
        found=False,
        source_origin="provider_error" if had_network_issue else "not_found",
        retrieval_timestamp=now,
        message=f"{status_note} GharPlate never invents product data.",
        fallback_actions=[
            "Use Nutrition Label OCR Scanner to extract values from the package back panel",
            "Enter product nutrition values manually after reviewing the physical label",
        ],
        completeness=None,
        provider_attempts=provider_attempts_out,
        merged_fields=[],
        conflicts_requiring_review=[],
        product=None,
    )


def create_user_confirmed_product(
    db: Session, req: ManualProductCreateRequest
) -> Any:
    """
    Creates or updates a user-confirmed packaged product record.
    If a product with the same `slug` or `barcode` already exists (such as Pineapple Cake 8906005618726),
    updates its missing or user-confirmed fields safely while preserving provenance!
    """
    if not req.user_confirmed:
        raise ValueError("User confirmation is required before saving OCR or manual product data.")

    cat = db.query(FoodCategory).filter(FoodCategory.slug == "packaged-foods").first()
    if not cat:
        raise ValueError("Packaged foods category missing")

    src_code = "USER_VERIFIED_LABEL"
    src = db.query(DataSource).filter(DataSource.code == src_code).first()
    if not src:
        src = DataSource(
            code=src_code,
            name="User-Confirmed Packaged Food Label Declaration",
            organization="GharPlate Household Label Verification",
            document_title="FSSAI Package Label Reviewed & Confirmed by User",
            publication_year=datetime.now(timezone.utc).year,
            version="User-Confirmed",
            url="https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling.pdf",
            license_notes="User-entered/confirmed packaged label record.",
            source_type=req.source_type,
        )
        db.add(src)
        db.flush()

    clean_barcode: Optional[str] = None
    if req.barcode and req.barcode.strip():
        norm_bc, _, _, _ = validate_and_normalize_barcode(req.barcode)
        clean_barcode = norm_bc or req.barcode.strip()

    # Check if updating an existing product by slug or barcode (prevents duplicate barcode IntegrityError!)
    existing_food: Optional[FoodItem] = None
    if req.slug:
        existing_food = db.query(FoodItem).filter(FoodItem.slug == req.slug).first()
    if not existing_food and clean_barcode:
        existing_food = db.query(FoodItem).filter(FoodItem.barcode == clean_barcode).first()

    parsed_ing = parse_and_clean_package_ingredients(req.ingredients_text)
    consented_image_url = (
        req.image_url.strip()
        if (req.image_url and req.image_url.strip() and req.retain_front_image_consent)
        else None
    )

    if existing_food:
        food = existing_food
        if req.name_en and req.name_en.strip():
            food.name_en = req.name_en.strip()
        if req.brand and req.brand.strip():
            food.brand = req.brand.strip()
        if clean_barcode:
            food.barcode = clean_barcode
        if req.net_quantity or parsed_ing.net_weight:
            food.net_quantity = req.net_quantity or parsed_ing.net_weight
        if consented_image_url:
            food.image_url = consented_image_url
            record_field_provenance(
                db,
                food_id=food.id,
                field_name="image_url",
                field_type="image",
                field_value=consented_image_url[:120],
                source_code=src.code,
                source_name=src.name,
                source_url=src.url,
                source_record_id=food.barcode or food.slug,
                confidence_status="user_confirmed",
                review_status="confirmed",
                notes="User-consented front-of-package display image.",
            )
        if req.ingredients_text:
            food.ingredients_text = req.ingredients_text
            food.cleaned_ingredients_text = parsed_ing.cleaned_ingredients
            food.allergen_statement = parsed_ing.allergen_declaration
            food.manufacturer_info = parsed_ing.manufacturer_info
        if req.raw_ocr_text:
            food.raw_ocr_text = req.raw_ocr_text
        if req.allergen_tags:
            food.allergen_tags = req.allergen_tags
        food.allergen_declaration_complete = req.allergen_declaration_complete
        food.standard_serving_name = req.standard_serving_name
        food.standard_serving_grams = req.standard_serving_grams
        food.is_vegetarian = req.is_vegetarian
        food.is_vegan = req.is_vegetarian and (
            "milk" not in [a.lower() for a in (food.allergen_tags or [])]
        )

        nv_by_code = {nv.nutrient_code: nv for nv in food.nutrient_values}
        all_nut_defs = db.query(NutrientDefinition).all()
        for nd in all_nut_defs:
            if nd.code in req.nutrients_per_100 and req.nutrients_per_100[nd.code] is not None:
                val = float(req.nutrients_per_100[nd.code])  # type: ignore[arg-type]
                if nd.code in nv_by_code:
                    nv_by_code[nd.code].value = val
                    nv_by_code[nd.code].source_id = src.id
                    nv_by_code[nd.code].confidence_status = "label_declared"
                else:
                    db.add(
                        FoodNutrientValue(
                            food_id=food.id,
                            nutrient_code=nd.code,
                            value=val,
                            basis=food.default_basis,
                            source_id=src.id,
                            confidence_status="label_declared",
                        )
                    )
                record_field_provenance(
                    db,
                    food_id=food.id,
                    field_name=nd.code,
                    field_type="nutrient",
                    field_value=str(val),
                    source_code=src.code,
                    source_name=src.name,
                    source_url=src.url,
                    source_record_id=food.barcode or food.slug,
                    confidence_status="user_confirmed",
                    review_status="confirmed",
                )
        ensure_baseline_local_provenance(db, food)
        db.commit()
        db.refresh(food)
        return serialize_food_detail(db, food)

    slug_base = re.sub(r"[^a-z0-9]+", "-", req.name_en.lower()).strip("-")
    slug = f"pkg-{slug_base}-{uuid.uuid4().hex[:6]}"

    food = FoodItem(
        slug=slug,
        name_en=req.name_en,
        category_id=cat.id,
        description=f"User-confirmed packaged product ({req.brand}).",
        image_url=consented_image_url,
        is_packaged=True,
        brand=req.brand,
        barcode=clean_barcode,
        net_quantity=req.net_quantity or parsed_ing.net_weight,
        default_basis=req.default_basis,
        standard_serving_name=req.standard_serving_name,
        standard_serving_grams=req.standard_serving_grams,
        is_vegetarian=req.is_vegetarian,
        is_vegan=req.is_vegetarian and ("milk" not in [a.lower() for a in req.allergen_tags]),
        allergen_tags=req.allergen_tags,
        intolerance_tags=[],
        dietary_tags=["packaged_food"],
        ingredients_text=req.ingredients_text,
        cleaned_ingredients_text=parsed_ing.cleaned_ingredients,
        allergen_statement=parsed_ing.allergen_declaration,
        raw_ocr_text=req.raw_ocr_text or req.ingredients_text,
        manufacturer_info=parsed_ing.manufacturer_info,
        allergen_declaration_complete=req.allergen_declaration_complete,
        source_id=src.id,
        confidence_level="label_declared",
    )
    db.add(food)
    db.flush()

    db.add(
        FoodAlias(
            food_id=food.id,
            language="en",
            alias_text=food.name_en,
            normalized_text=normalize_query(food.name_en),
            script_text=food.name_en,
        )
    )
    db.add(
        ServingConversion(
            food_id=food.id,
            unit_name=req.default_basis,
            unit_label=f"100 {req.default_basis.replace('100', '')}",
            grams_equivalent=100.0,
            is_default=False,
        )
    )
    db.add(
        ServingConversion(
            food_id=food.id,
            unit_name="standard_serving",
            unit_label=req.standard_serving_name,
            grams_equivalent=req.standard_serving_grams,
            is_default=True,
        )
    )

    all_nut_defs = db.query(NutrientDefinition).all()
    for nd in all_nut_defs:
        val = req.nutrients_per_100.get(nd.code, None)
        db.add(
            FoodNutrientValue(
                food_id=food.id,
                nutrient_code=nd.code,
                value=float(val) if val is not None else None,
                basis=req.default_basis,
                source_id=src.id,
                confidence_status="label_declared" if val is not None else "not_measured",
            )
        )
        if val is not None:
            record_field_provenance(
                db,
                food_id=food.id,
                field_name=nd.code,
                field_type="nutrient",
                field_value=str(val),
                source_code=src.code,
                source_name=src.name,
                source_url=src.url,
                source_record_id=food.barcode or food.slug,
                confidence_status="user_confirmed",
                review_status="confirmed",
            )

    if consented_image_url:
        record_field_provenance(
            db,
            food_id=food.id,
            field_name="image_url",
            field_type="image",
            field_value=consented_image_url[:120],
            source_code=src.code,
            source_name=src.name,
            source_url=src.url,
            source_record_id=food.barcode or food.slug,
            confidence_status="user_confirmed",
            review_status="confirmed",
            notes="User-consented front-of-package display image.",
        )

    ensure_baseline_local_provenance(db, food)
    db.commit()
    db.refresh(food)
    return serialize_food_detail(db, food)


def recognize_indian_dish_from_image(
    db: Session,
    file_bytes: bytes,
    filename: Optional[str] = None,
    content_type: Optional[str] = None,
    user_hint: Optional[str] = None,
) -> DishRecognitionResponse:
    """
    Experimental Indian Dish Image Recognition (Module 8).
    Processes image strictly in memory, computes colour/brightness cues + filename/hint context,
    and returns candidate dishes with explicit uncertainty.
    """
    width, height, (r_mean, g_mean, b_mean) = validate_and_inspect_image_in_memory(
        file_bytes, content_type
    )
    del file_bytes
    gc.collect()

    dishes = (
        db.query(FoodItem)
        .options(joinedload(FoodItem.category), joinedload(FoodItem.aliases))
        .join(FoodCategory)
        .filter(FoodCategory.slug == "indian-dishes")
        .all()
    )

    hint_blob = f"{filename or ''} {user_hint or ''}".lower()
    candidates: List[DishCandidateOut] = []

    for dish in dishes:
        score = 0.28
        cue_reason = "Matched based on general Indian meal visual profile."
        dish_text = " ".join(
            [dish.name_en.lower(), dish.slug.replace("-", " ")]
            + [a.alias_text.lower() for a in dish.aliases]
        )

        for tok in re.findall(r"[a-z]{3,}", hint_blob):
            if tok in dish_text and tok not in ("img", "jpg", "png", "jpeg", "photo", "food", "meal"):
                score += 0.42
                cue_reason = f"Visual profile + strong keyword match on '{tok}'."
                break

        brightness = (r_mean + g_mean + b_mean) / 3.0
        if brightness > 185 and dish.slug in ("idli-steamed-rice-lentil", "curd-rice-mosaranna", "rice-raw-milled"):
            score += 0.26
            cue_reason = "High luminance / light-ivory colour histogram typical of steamed idli or curd rice."
        elif r_mean > g_mean + 20 and dish.slug in ("sambar-vegetable-lentil-stew", "rasam-tomato-pepper", "bisi-bele-bath", "chicken-biryani"):
            score += 0.25
            cue_reason = "Warm red-amber chrominance typical of tamarind/tomato/spice-rich dishes (Sambar, Bisi Bele Bath, Biryani)."
        elif g_mean > r_mean and dish.slug in ("palak-paneer-curry",):
            score += 0.30
            cue_reason = "Green-dominant colour profile consistent with leafy spinach gravy (Palak Paneer)."
        elif r_mean > 130 and g_mean > 115 and b_mean < 100 and dish.slug in (
            "poha-avalakki-cooked",
            "masala-dosa",
            "dosa-plain",
            "khichdi-moong-dal-rice",
            "pongal-khara-ven-pongal",
        ):
            score += 0.24
            cue_reason = "Golden-yellow/brown colour distribution consistent with turmeric-tempered or griddled dishes (Dosa, Poha, Khichdi, Pongal)."
        elif brightness < 120 and dish.slug in ("ragi-mudde-finger-millet-ball", "chapati-roti-whole-wheat"):
            score += 0.22
            cue_reason = "Earthy low-saturation tone consistent with whole-grain millet (Ragi Mudde) or roasted flatbread."

        score = min(round(score, 2), 0.78)
        uncertainty = (
            "Moderate visual similarity (requires user confirmation)"
            if score >= 0.50
            else "Low-to-moderate visual possibility (ambiguous appearance)"
        )
        aliases_list = list({a.alias_text for a in dish.aliases if a.alias_text != dish.name_en})[:4]
        candidates.append(
            DishCandidateOut(
                food_slug=dish.slug,
                food_name=dish.name_en,
                image_url=dish.image_url,
                regional_aliases=aliases_list,
                visual_similarity_score=score,
                uncertainty_label=uncertainty,
                visual_cue_explanation=cue_reason,
                category_name=dish.category.name,
            )
        )

    candidates.sort(key=lambda c: (-c.visual_similarity_score, c.food_name))

    return DishRecognitionResponse(
        recognition_id=f"rec_{uuid.uuid4().hex[:10]}",
        experimental_disclaimer=(
            "EXPERIMENTAL FEATURE: Visual dish recognition provides candidate suggestions only and is NEVER a confirmed identification. "
            "GharPlate does not estimate exact gram weights or calories from photographs, and visual similarity never implies nutritional-data confidence. "
            "Please select or manually search the actual dish below."
        ),
        privacy_confirmation=(
            f"Image ({width}x{height}px) was analysed strictly in RAM and purged immediately. No photograph was saved to disk or database."
        ),
        requires_user_confirmation=True,
        image_quality_notes=f"Analysed {width}x{height}px RGB frame (mean RGB: {r_mean:.0f}, {g_mean:.0f}, {b_mean:.0f}).",
        candidates=candidates[:5],
    )
