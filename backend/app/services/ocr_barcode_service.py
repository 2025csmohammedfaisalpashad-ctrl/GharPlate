"""
Packaged Food Label OCR Scanner, Intelligent Multi-Source Barcode Lookup,
and Experimental Dish Recognition Service (Modules 6, 7 & 8).

PRIVACY & INTEGRITY GUARANTEES:
1. All uploaded OCR label images are processed strictly in RAM (`io.BytesIO`) and immediately purged.
2. NEVER inserts synthetic or hardcoded sample nutrition values when OCR fails or returns unreadable text.
3. Barcode lookup evaluates local record completeness and queries external providers (Open Food Facts API v3,
   USDA FoodData Central Branded Foods) when a local record is incomplete (such as Pineapple Cake 8906005618726).
"""

import base64
import gc
import io
import json
import re
import uuid
from datetime import datetime, UTC
from typing import Any
import httpx
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
    DishDetectedComponentOut,
    DishRecognitionResponse,
    ManualProductCreateRequest,
    OCRFieldPrediction,
    OCRScanResponse,
    ProductDataConflictOut,
    ProviderAttemptOut,
)
from app.services.food_service import normalize_query, serialize_food_detail


def validate_and_inspect_image_in_memory(
    file_bytes: bytes, content_type: str | None
) -> tuple[int, int, tuple[float, float, float]]:
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
            rgb = ImageOps.exif_transpose(img2).convert("RGB")
            width, height = rgb.size
            if width < 16 or height < 16:
                raise ValueError(
                    f"Image dimensions ({width}x{height}px) are too small for food analysis. Minimum supported size is 16x16px."
                )
            stat = ImageStat.Stat(rgb)
            mean_rgb = (stat.mean[0], stat.mean[1], stat.mean[2])
            return width, height, mean_rgb
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Invalid or corrupted image file: {exc}") from exc
    finally:
        buf.close()


def evaluate_image_quality_in_memory(file_bytes: bytes) -> dict[str, Any]:
    """
    Evaluates image brightness and edge sharpness strictly in RAM without saving to disk.
    Flags poorly lit or blurry photographs honestly so the user knows when visual certainty is reduced.
    """
    buf = io.BytesIO(file_bytes)
    try:
        with Image.open(buf) as raw_img:
            rgb = ImageOps.exif_transpose(raw_img).convert("RGB")
            width, height = rgb.size
            gray = rgb.convert("L")
            gray_stat = ImageStat.Stat(gray)
            brightness = float(gray_stat.mean[0])
            contrast_std = float(gray_stat.stddev[0])
            edges = gray.filter(ImageFilter.FIND_EDGES)
            edge_stat = ImageStat.Stat(edges)
            sharpness = float(edge_stat.stddev[0])

            is_poorly_lit = brightness < 42.0
            is_overexposed = brightness > 246.0 and contrast_std < 12.0
            is_blurry = sharpness < 6.5 and contrast_std < 15.0

            notes: list[str] = [f"Analysed {width}x{height}px RGB photograph in memory."]
            warnings: list[str] = []
            if is_poorly_lit:
                msg = "Low-light photograph detected — dim lighting may reduce visual food identification accuracy."
                notes.append(msg)
                warnings.append(msg)
            if is_overexposed:
                msg = "Very high brightness / low contrast detected — fine food textures may be washed out."
                notes.append(msg)
                warnings.append(msg)
            if is_blurry:
                msg = "Low edge sharpness / possible blur detected — please confirm the identified food carefully."
                notes.append(msg)
                warnings.append(msg)

            return {
                "width": width,
                "height": height,
                "brightness": round(brightness, 1),
                "sharpness": round(sharpness, 1),
                "is_poorly_lit": is_poorly_lit,
                "is_blurry": is_blurry,
                "quality_summary": " ".join(notes),
                "quality_warnings": warnings,
            }
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
) -> tuple[str, str, str | None]:
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


def clean_ocr_numeric_token(raw_token: str) -> tuple[float | None, bool, float | None]:
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


def _build_empty_failed_ocr_fields() -> dict[str, OCRFieldPrediction]:
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
    ocr_error_reason: str | None = None,
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
    warnings: list[str] = []
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

    fields: dict[str, OCRFieldPrediction] = {}

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

    extracted_nums: dict[str, float] = {}

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
    content_type: str | None,
    hint_text: str | None = None,
    ingredients_image_bytes: bytes | None = None,
    ingredients_content_type: str | None = None,
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
    extracted_segments: list[str] = []

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
        external_updated_at=datetime.now(UTC),
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
    now = datetime.now(UTC)
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

    provider_attempts_out: list[ProviderAttemptOut] = []
    merged_fields: list[str] = []

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
        fallback_actions: list[str] = []
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
            publication_year=datetime.now(UTC).year,
            version="User-Confirmed",
            url="https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling.pdf",
            license_notes="User-entered/confirmed packaged label record.",
            source_type=req.source_type,
        )
        db.add(src)
        db.flush()

    clean_barcode: str | None = None
    if req.barcode and req.barcode.strip():
        norm_bc, _, _, _ = validate_and_normalize_barcode(req.barcode)
        clean_barcode = norm_bc or req.barcode.strip()

    # Check if updating an existing product by slug or barcode (prevents duplicate barcode IntegrityError!)
    existing_food: FoodItem | None = None
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


def _prepare_image_base64_for_vision(file_bytes: bytes) -> str:
    """
    Normalizes orientation, resizes large images to max 1024px in RAM for fast local multimodal
    inference, and returns base64-encoded JPEG bytes without writing anything to disk.
    """
    buf = io.BytesIO(file_bytes)
    out_buf = io.BytesIO()
    try:
        with Image.open(buf) as raw_img:
            rgb = ImageOps.exif_transpose(raw_img).convert("RGB")
            rgb.thumbnail((1024, 1024), Image.Resampling.LANCZOS)
            rgb.save(out_buf, format="JPEG", quality=86)
        return base64.b64encode(out_buf.getvalue()).decode("ascii")
    finally:
        buf.close()
        out_buf.close()


def discover_ollama_vision_model() -> tuple[bool, str | None, str, str | None]:
    """
    Discovers a locally running multimodal vision model in Ollama across configured
    OLLAMA_VISION_BASE_URL, OLLAMA_BASE_URL, and Docker host fallback (`http://host.docker.internal:11434`).
    Returns (reachable, vision_model_name, base_url_used, remediation_or_error).
    """
    candidate_urls: list[str] = []
    for u in (
        settings.OLLAMA_VISION_BASE_URL,
        settings.OLLAMA_BASE_URL,
        "http://127.0.0.1:11434",
        "http://host.docker.internal:11434",
    ):
        clean_u = (u or "").strip().rstrip("/")
        if clean_u and clean_u not in candidate_urls:
            candidate_urls.append(clean_u)

    preferred = (settings.OLLAMA_VISION_MODEL or "qwen2.5vl:7b").strip()
    last_err: str | None = None

    for base_url in candidate_urls:
        try:
            with httpx.Client(timeout=3.5) as client:
                resp = client.get(f"{base_url}/api/tags")
                if resp.status_code != 200:
                    last_err = f"Ollama returned HTTP {resp.status_code} at {base_url}."
                    continue
                data = resp.json()
                models_raw = data.get("models") or []
                installed = [
                    str(m.get("name") or m.get("model"))
                    for m in models_raw
                    if isinstance(m, dict) and (m.get("name") or m.get("model"))
                ]
                if not installed:
                    return (
                        True,
                        None,
                        base_url,
                        f"Ollama is running at {base_url}, but no vision model is installed. Run `ollama pull {preferred}` to enable local AI photo recognition.",
                    )

                # 1. Exact or prefix match on configured OLLAMA_VISION_MODEL
                for m in installed:
                    if m == preferred or m.startswith(f"{preferred}:"):
                        return True, m, base_url, None

                # 2. Any installed multimodal vision model (vl, vision, llava, minicpm-v, bakllava, gemma3, pixtral)
                vision_keywords = ("vl", "vision", "llava", "minicpm", "bakllava", "pixtral", "moondream")
                for m in installed:
                    m_low = m.lower()
                    if any(vk in m_low for vk in vision_keywords):
                        return True, m, base_url, None

                # 3. Inspect /api/show capabilities for multimodal support
                for m in installed[:5]:
                    try:
                        show_resp = client.post(f"{base_url}/api/show", json={"model": m})
                        if show_resp.status_code == 200:
                            show_data = show_resp.json()
                            caps = [str(c).lower() for c in (show_data.get("capabilities") or [])]
                            families = [
                                str(f).lower()
                                for f in ((show_data.get("details") or {}).get("families") or [])
                            ]
                            if "vision" in caps or "clip" in families or "mllama" in families or any("vl" in f for f in families):
                                return True, m, base_url, None
                    except Exception:
                        continue

                return (
                    True,
                    None,
                    base_url,
                    f"Ollama is running at {base_url} (models: {', '.join(installed)}), but none of the installed models support multimodal image vision. Run `ollama pull {preferred}` to install a local vision model.",
                )
        except Exception as exc:
            last_err = f"Could not connect to local Ollama server at {base_url} ({exc.__class__.__name__})."

    return (
        False,
        None,
        candidate_urls[0] if candidate_urls else "http://127.0.0.1:11434",
        f"{last_err or 'Local Ollama server is not reachable.'} Start Ollama with `ollama serve` and ensure `{preferred}` is installed (`ollama pull {preferred}`).",
    )


def _extract_json_object_from_text(raw_text: str) -> dict[str, Any] | None:
    """
    Safely parses JSON output from the local vision model, stripping markdown code fences if present.
    """
    cleaned = (raw_text or "").strip()
    if not cleaned:
        return None
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", cleaned)
    if m:
        try:
            parsed = json.loads(m.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return None


def analyze_image_with_ollama_vision(
    file_bytes: bytes,
    user_hint: str | None = None,
    catalog_food_names: list[str] | None = None,
) -> dict[str, Any]:
    """
    Executes genuine multimodal food image analysis using the local Ollama vision model
    (`POST /api/generate` with `images: [base64_str]` and `format: 'json'`).
    Never uses filename tokens as a fake recognition shortcut and never fabricates results.
    """
    reachable, vision_model, base_url, err_msg = discover_ollama_vision_model()
    if not reachable or not vision_model:
        return {
            "status": "vision_unavailable",
            "vision_reachable": reachable,
            "vision_model_used": vision_model,
            "error_message": err_msg,
        }

    b64_image = _prepare_image_base64_for_vision(file_bytes)
    catalog_sample = ", ".join((catalog_food_names or [])[:75])
    hint_clause = (
        f"Optional user-supplied note: '{user_hint.strip()}'. Use this only as supplementary context; rely primarily on what is visually present in the photograph.\n"
        if (user_hint and user_hint.strip())
        else ""
    )

    prompt = (
        "You are an expert Indian food and nutrition visual analyst for GharPlate.\n"
        "Inspect the uploaded photograph carefully and identify all visible food items, dishes, fruits, vegetables, staples, curries, accompaniments, or packaged foods.\n"
        f"{hint_clause}"
        f"Known GharPlate database foods include: {catalog_sample}.\n\n"
        "Return ONLY a valid JSON object with this exact structure:\n"
        "{\n"
        '  "is_food_image": true,\n'
        '  "overall_description": "Concise 1-2 sentence description of what is visible in the photograph",\n'
        '  "primary_candidates": [\n'
        "    {\n"
        '      "name": "Specific food or dish name (e.g. Idli (Steamed Rice-Lentil Cake), Masala Dosa, Banana (Ripe), Plain Steamed Rice, Dal Tadka, Palak Paneer)",\n'
        '      "canonical_search_terms": ["idli", "steamed rice cake"],\n'
        '      "confidence_score": 0.92,\n'
        '      "confidence_category": "high_confidence | moderate_confidence | low_confidence",\n'
        '      "visual_evidence": "Specific visual features observed (shape, texture, colour, accompaniments, plate arrangement)"\n'
        "    }\n"
        "  ],\n"
        '  "detected_components": [\n'
        "    {\n"
        '      "label": "Component name on the plate (e.g. Idli, Sambar, Coconut Chutney, Rice, Dal, Roti)",\n'
        '      "confidence_score": 0.88,\n'
        '      "confidence_category": "high_confidence | moderate_confidence | low_confidence",\n'
        '      "visual_description": "Brief visual note for this component"\n'
        "    }\n"
        "  ],\n"
        '  "ambiguity_notes": ["Note any visual ambiguity, e.g. plain dosa vs masala dosa filling not visible, or lighting/blur limitations"]\n'
        "}\n"
        "Rules:\n"
        "1. If the photograph shows a single food (e.g. a banana, apple, idli, or roti), list it as the top primary_candidate and in detected_components.\n"
        "2. If the photograph shows a multi-item Indian meal or thali (e.g. rice + dal + vegetable curry + curd, or idli + sambar + chutney), list each distinct visible item in detected_components and in primary_candidates.\n"
        "3. If the photograph does NOT show food or is completely unrecognizable, set is_food_image to false or confidence_category to low_confidence and explain honestly."
    )

    try:
        with httpx.Client(timeout=float(max(settings.OLLAMA_TIMEOUT_SECONDS, 45))) as client:
            resp = client.post(
                f"{base_url}/api/generate",
                json={
                    "model": vision_model,
                    "prompt": prompt,
                    "images": [b64_image],
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.1},
                },
            )
            if resp.status_code != 200:
                return {
                    "status": "vision_error",
                    "vision_reachable": True,
                    "vision_model_used": vision_model,
                    "error_message": f"Ollama vision model '{vision_model}' returned HTTP {resp.status_code}.",
                }
            payload = resp.json()
            raw_response = str(payload.get("response") or "").strip()
            parsed = _extract_json_object_from_text(raw_response)
            if not parsed:
                return {
                    "status": "vision_error",
                    "vision_reachable": True,
                    "vision_model_used": vision_model,
                    "error_message": "Local vision model returned an unreadable response format. Please retry or search the food manually.",
                }
            return {
                "status": "success",
                "vision_reachable": True,
                "vision_model_used": vision_model,
                "analysis": parsed,
            }
    except Exception as exc:
        return {
            "status": "vision_error",
            "vision_reachable": False,
            "vision_model_used": vision_model,
            "error_message": f"Local vision inference failed ({exc.__class__.__name__}: {exc}). Ensure Ollama is running (`ollama serve`).",
        }


_FOOD_SYNONYM_MAP: dict[str, list[str]] = {
    "idli": ["idli-steamed-rice-lentil", "idli"],
    "idly": ["idli-steamed-rice-lentil", "idli"],
    "steamed white cakes": ["idli-steamed-rice-lentil"],
    "steamed rice cake": ["idli-steamed-rice-lentil"],
    "masala dosa": ["masala-dosa", "dosa-plain"],
    "plain dosa": ["dosa-plain", "masala-dosa"],
    "dosa": ["dosa-plain", "masala-dosa"],
    "sambar": ["sambar-vegetable-lentil-stew"],
    "rasam": ["rasam-tomato-pepper"],
    "poha": ["poha-avalakki-cooked"],
    "avalakki": ["poha-avalakki-cooked"],
    "upma": ["upma-rava-semolina"],
    "khichdi": ["khichdi-moong-dal-rice"],
    "pongal": ["pongal-khara-ven-pongal"],
    "bisi bele bath": ["bisi-bele-bath"],
    "curd rice": ["curd-rice-mosaranna"],
    "mosaranna": ["curd-rice-mosaranna"],
    "palak paneer": ["palak-paneer-curry"],
    "paneer": ["paneer-cottage-cheese", "palak-paneer-curry"],
    "chicken biryani": ["chicken-biryani"],
    "biryani": ["chicken-biryani"],
    "ragi mudde": ["ragi-mudde-finger-millet-ball", "ragi-finger-millet"],
    "chapati": ["chapati-roti-whole-wheat"],
    "roti": ["chapati-roti-whole-wheat"],
    "phulka": ["chapati-roti-whole-wheat"],
    "paratha": ["chapati-roti-whole-wheat"],
    "rice": ["rice-raw-milled", "rice-parboiled-home", "curd-rice-mosaranna"],
    "steamed rice": ["rice-raw-milled", "rice-parboiled-home"],
    "white rice": ["rice-raw-milled"],
    "brown rice": ["rice-brown-whole"],
    "dal": ["toor-dal-arhar", "moong-dal-split-yellow", "masoor-dal-red-lentil", "chana-dal-split-bengal-gram"],
    "toor dal": ["toor-dal-arhar", "sambar-vegetable-lentil-stew"],
    "moong dal": ["moong-dal-split-yellow", "khichdi-moong-dal-rice"],
    "rajma": ["rajma-red-kidney-bean"],
    "chole": ["chickpea-kabuli-chana"],
    "chana": ["chickpea-kabuli-chana", "bengal-gram-whole-kala-chana"],
    "banana": ["banana-ripe-robusta"],
    "apple": ["apple-fresh"],
    "guava": ["guava-pink-white"],
    "papaya": ["papaya-ripe"],
    "mango": ["mango-ripe-banganapalli"],
    "orange": ["orange-mandarin"],
    "pomegranate": ["pomegranate-fresh"],
    "carrot": ["carrot-orange"],
    "spinach": ["spinach-palak-leaf"],
    "tomato": ["tomato-ripe-red"],
    "potato": ["potato-brown-skin"],
    "onion": ["onion-big-red"],
    "okra": ["okra-bhindi"],
    "bhindi": ["okra-bhindi"],
    "curd": ["curd-dahi-whole-milk"],
    "dahi": ["curd-dahi-whole-milk"],
    "yogurt": ["curd-dahi-whole-milk"],
    "milk": ["milk-cow-whole", "milk-buffalo-whole"],
    "egg": ["egg-hen-whole-raw"],
    "boiled egg": ["egg-hen-whole-raw"],
    "omelette": ["egg-hen-whole-raw"],
    "chicken": ["chicken-breast-skinless", "chicken-biryani"],
    "fish": ["rohu-fish-fresh", "mackerel-bangda"],
    "almonds": ["almond-badam-dry"],
    "peanuts": ["groundnut-peanut-raw"],
}


def _match_food_query_to_catalog(
    db: Session,
    query_terms: list[str],
    all_foods: list[FoodItem] | None = None,
) -> FoodItem | None:
    """
    Matches a vision model's proposed food name or search terms against the ENTIRE GharPlate
    food database (cooked Indian dishes, fruits, vegetables, staples, pulses, dairy, eggs, nuts,
    and packaged products), including English, Kannada, and Hindi aliases.
    """
    if all_foods is None:
        all_foods = (
            db.query(FoodItem)
            .options(
                joinedload(FoodItem.category),
                joinedload(FoodItem.source),
                joinedload(FoodItem.aliases),
                joinedload(FoodItem.nutrient_values).joinedload(FoodNutrientValue.source),
                joinedload(FoodItem.servings),
            )
            .all()
        )

    by_slug = {f.slug: f for f in all_foods}
    cleaned_terms = [normalize_query(t) for t in query_terms if t and normalize_query(t)]
    if not cleaned_terms:
        return None

    # 1. Check direct synonym table first
    for term in cleaned_terms:
        if term in _FOOD_SYNONYM_MAP:
            for cand_slug in _FOOD_SYNONYM_MAP[term]:
                if cand_slug in by_slug:
                    return by_slug[cand_slug]
        for syn_key, cand_slugs in _FOOD_SYNONYM_MAP.items():
            if re.search(rf"\b{re.escape(syn_key)}\b", term):
                for cand_slug in cand_slugs:
                    if cand_slug in by_slug:
                        return by_slug[cand_slug]

    # 2. Score all database items across name_en, slug, and multilingual aliases
    best_food: FoodItem | None = None
    best_score = 0.0

    for food in all_foods:
        name_norm = normalize_query(food.name_en)
        base_name_norm = normalize_query(re.sub(r"\s*\(.*?\)", "", food.name_en))
        slug_norm = food.slug.replace("-", " ").lower()
        alias_norms = [normalize_query(a.alias_text) for a in (food.aliases or [])]

        score = 0.0
        for term in cleaned_terms:
            if not term:
                continue
            if term == name_norm or term == base_name_norm or term == slug_norm or term in alias_norms:
                score = max(score, 100.0)
                break
            if len(term) >= 3 and (term in base_name_norm or base_name_norm in term):
                score = max(score, 82.0)
            elif len(term) >= 3 and any(term in an or an in term for an in alias_norms if len(an) >= 3):
                score = max(score, 78.0)
            else:
                term_tokens = [tok for tok in term.split() if len(tok) >= 3 and tok not in ("indian", "cooked", "fresh", "raw", "dish", "curry", "plate", "bowl")]
                if term_tokens:
                    searchable_blob = " ".join([name_norm, slug_norm] + alias_norms)
                    matched_toks = sum(1 for tok in term_tokens if re.search(rf"\b{re.escape(tok)}", searchable_blob))
                    if matched_toks > 0:
                        score = max(score, 45.0 * (matched_toks / len(term_tokens)) + (10.0 if food.category.slug == "indian-dishes" else 0.0))

        if score > best_score:
            best_score = score
            best_food = food

    return best_food if best_score >= 42.0 else None


def _confidence_category_from_score(score: float, explicit_cat: str | None = None) -> tuple[str, str]:
    cat = (explicit_cat or "").strip().lower()
    if cat not in ("high_confidence", "moderate_confidence", "low_confidence"):
        if score >= 0.78:
            cat = "high_confidence"
        elif score >= 0.48:
            cat = "moderate_confidence"
        else:
            cat = "low_confidence"

    label_map = {
        "high_confidence": "High visual confidence (confirm portion below)",
        "moderate_confidence": "Moderate visual confidence — please confirm or select an alternative",
        "low_confidence": "Low visual confidence — uncertain appearance, please verify manually",
    }
    return cat, label_map[cat]


def _build_dish_candidate_from_food(
    db: Session,
    food: FoodItem,
    score: float,
    visual_explanation: str,
    explicit_confidence_cat: str | None = None,
    detected_component_label: str | None = None,
) -> DishCandidateOut:
    detail = serialize_food_detail(db, food)
    clamped_score = max(0.05, min(round(float(score), 2), 0.99))
    conf_cat, uncertainty_label = _confidence_category_from_score(clamped_score, explicit_confidence_cat)
    aliases_list = list({a.alias_text for a in (food.aliases or []) if a.alias_text != food.name_en})[:5]
    return DishCandidateOut(
        food_id=food.id,
        food_slug=food.slug,
        food_name=food.name_en,
        matched_in_database=True,
        image_url=food.image_url,
        regional_aliases=aliases_list,
        visual_similarity_score=clamped_score,
        confidence_category=conf_cat,
        uncertainty_label=uncertainty_label,
        visual_cue_explanation=visual_explanation or f"Identified by local vision model and matched to verified GharPlate record '{food.name_en}'.",
        category_name=food.category.name if food.category else "Indian Foods",
        detected_component_label=detected_component_label,
        default_basis=detail.default_basis,
        standard_serving_name=detail.standard_serving_name,
        standard_serving_grams=detail.standard_serving_grams,
        is_vegetarian=detail.is_vegetarian,
        is_vegan=detail.is_vegan,
        completeness_pct=detail.completeness_pct,
        available_nutrient_count=detail.available_nutrient_count,
        missing_nutrient_codes=detail.missing_nutrient_codes,
        source_name=detail.source.name,
        source_url=detail.source.url,
        publication_year=detail.source.publication_year,
        servings=detail.servings,
        nutrients=detail.nutrients,
    )


def _build_unmatched_dish_candidate(
    proposed_name: str,
    score: float,
    visual_explanation: str,
    explicit_confidence_cat: str | None = None,
) -> DishCandidateOut:
    clamped_score = max(0.05, min(round(float(score), 2), 0.95))
    conf_cat, _ = _confidence_category_from_score(clamped_score, explicit_confidence_cat)
    slug_placeholder = "unmatched-" + re.sub(r"[^a-z0-9]+", "-", proposed_name.lower()).strip("-")[:48]
    return DishCandidateOut(
        food_id=None,
        food_slug=slug_placeholder,
        food_name=proposed_name,
        matched_in_database=False,
        image_url=None,
        regional_aliases=[],
        visual_similarity_score=clamped_score,
        confidence_category=conf_cat,
        uncertainty_label="Identified visually, but no verified nutrition record exists in the GharPlate database",
        visual_cue_explanation=(
            f"{visual_explanation} — Note: '{proposed_name}' does not yet have a verified composition record in GharPlate. "
            "GharPlate never invents nutrient numbers; search for the closest verified ingredient below."
        ),
        category_name="Unmatched Visual Detection",
        detected_component_label=proposed_name,
        default_basis="100g",
        standard_serving_name="100 g",
        standard_serving_grams=100.0,
        is_vegetarian=True,
        is_vegan=False,
        completeness_pct=0.0,
        available_nutrient_count=0,
        missing_nutrient_codes=[],
        source_name=None,
        source_url=None,
        publication_year=None,
        servings=[],
        nutrients=[],
    )


def recognize_indian_dish_from_image(
    db: Session,
    file_bytes: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    user_hint: str | None = None,
) -> DishRecognitionResponse:
    """
    Real Multimodal AI Food Photo Analyzer (Module 8 Upgrade).
    1. Validates image format, size (<= 5 MB), and dimensions (>= 16x16) strictly in RAM.
    2. Evaluates lighting and sharpness (`evaluate_image_quality_in_memory`) without saving to disk.
    3. Queries the local Ollama multimodal vision model (`qwen2.5vl:7b` or installed vision model)
       using the official `/api/generate` multimodal `images` payload.
    4. Matches identified single foods or multi-item plate components against the entire GharPlate
       database (`FoodItem` + `FoodAlias` across English, Kannada, and Hindi) and attaches real
       verified nutrient profiles, household serving conversions, and provenance.
    5. Never reports filename/RGB heuristics as AI vision recognition.
    """
    width, height, _mean_rgb = validate_and_inspect_image_in_memory(
        file_bytes, content_type
    )
    quality_info = evaluate_image_quality_in_memory(file_bytes)

    all_foods = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.aliases),
            joinedload(FoodItem.nutrient_values).joinedload(FoodNutrientValue.source),
            joinedload(FoodItem.servings),
        )
        .all()
    )
    catalog_names = [f.name_en for f in all_foods]

    vision_res = analyze_image_with_ollama_vision(
        file_bytes=file_bytes,
        user_hint=user_hint,
        catalog_food_names=catalog_names,
    )

    # Explicitly purge raw image bytes from RAM immediately after vision inference
    del file_bytes
    gc.collect()

    rec_id = f"rec_{uuid.uuid4().hex[:10]}"
    privacy_msg = (
        f"Image ({width}x{height}px) was analysed strictly in RAM and purged immediately. "
        "No photograph was saved to disk or database."
    )
    disclaimer_msg = (
        "EXPERIMENTAL FEATURE — AI FOOD PHOTO ANALYSIS: Visual identification is generated by your local multimodal vision model "
        "and matched against GharPlate's verified food composition database (IFCT 2017 / ICMR-NIN 2024). "
        "Please confirm the identified food and select your consumed portion size below."
    )

    # If local vision model is unavailable or errored, report honestly (never fake heuristic recognition)
    if vision_res.get("status") != "success":
        err_detail = str(
            vision_res.get("error_message")
            or "Local Ollama vision model is unavailable."
        )
        fallback_candidates: list[DishCandidateOut] = []
        if user_hint and user_hint.strip():
            hint_match = _match_food_query_to_catalog(db, [user_hint.strip()], all_foods=all_foods)
            if hint_match:
                fallback_candidates.append(
                    _build_dish_candidate_from_food(
                        db,
                        hint_match,
                        score=0.65,
                        visual_explanation=f"Matched from your text description '{user_hint.strip()}' while local vision model was unavailable.",
                        explicit_confidence_cat="moderate_confidence",
                    )
                )
        for dish_item in all_foods:
            if len(fallback_candidates) >= 3:
                break
            if dish_item.category and dish_item.category.slug == "indian-dishes":
                if all(c.food_slug != dish_item.slug for c in fallback_candidates):
                    fallback_candidates.append(
                        _build_dish_candidate_from_food(
                            db,
                            dish_item,
                            score=0.35,
                            visual_explanation="Manual catalog candidate while local Ollama vision server is offline.",
                            explicit_confidence_cat="low_confidence",
                        )
                    )
        return DishRecognitionResponse(
            recognition_id=rec_id,
            analysis_status=str(vision_res.get("status") or "vision_unavailable"),
            vision_provider=settings.VISION_PROVIDER,
            vision_model_used=vision_res.get("vision_model_used"),
            vision_reachable=bool(vision_res.get("vision_reachable", False)),
            overall_description=err_detail,
            experimental_disclaimer=disclaimer_msg,
            privacy_confirmation=privacy_msg,
            requires_user_confirmation=True,
            image_quality_notes=str(quality_info.get("quality_summary") or ""),
            ambiguity_notes=list(quality_info.get("quality_warnings") or []),
            remediation_instructions=[
                "Ensure Ollama is running on your Mac (`ollama serve`)",
                f"Ensure a multimodal vision model is installed (`ollama pull {settings.OLLAMA_VISION_MODEL}`)",
                "You can still search and select any Indian food manually using the search box below",
            ],
            detected_components=[],
            unrecognized_items=[],
            candidates=fallback_candidates,
        )

    analysis = vision_res.get("analysis") or {}
    vision_model_used = str(vision_res.get("vision_model_used") or settings.OLLAMA_VISION_MODEL)
    is_food_image = bool(analysis.get("is_food_image", True))
    overall_desc = str(
        analysis.get("overall_description")
        or "Analysed food photograph using local multimodal vision model."
    ).strip()
    raw_primary = analysis.get("primary_candidates") or []
    raw_components = analysis.get("detected_components") or []
    ambiguity_notes: list[str] = [
        str(n).strip() for n in (analysis.get("ambiguity_notes") or []) if str(n).strip()
    ]
    for qw in quality_info.get("quality_warnings") or []:
        if qw not in ambiguity_notes:
            ambiguity_notes.append(qw)

    candidates: list[DishCandidateOut] = []
    seen_food_slugs: set[str] = set()
    unrecognized_items: list[str] = []

    for item in raw_primary:
        if not isinstance(item, dict):
            continue
        raw_name = str(item.get("name") or "").strip()
        if not raw_name:
            continue
        search_terms = [raw_name] + [
            str(t).strip() for t in (item.get("canonical_search_terms") or []) if str(t).strip()
        ]
        try:
            raw_score = float(item.get("confidence_score", 0.78))
        except (TypeError, ValueError):
            raw_score = 0.78
        if quality_info.get("is_blurry") or quality_info.get("is_poorly_lit"):
            raw_score = min(raw_score, 0.74)
        conf_cat_raw = str(item.get("confidence_category") or "").strip() or None
        if (quality_info.get("is_blurry") or quality_info.get("is_poorly_lit")) and conf_cat_raw == "high_confidence":
            conf_cat_raw = "moderate_confidence"
        vis_ev = str(
            item.get("visual_evidence")
            or item.get("visual_description")
            or f"Visually identified as {raw_name} by {vision_model_used}."
        ).strip()

        matched_food = _match_food_query_to_catalog(db, search_terms, all_foods=all_foods)
        if matched_food:
            if matched_food.slug not in seen_food_slugs:
                seen_food_slugs.add(matched_food.slug)
                candidates.append(
                    _build_dish_candidate_from_food(
                        db,
                        matched_food,
                        score=raw_score,
                        visual_explanation=vis_ev,
                        explicit_confidence_cat=conf_cat_raw,
                        detected_component_label=raw_name,
                    )
                )
        else:
            unrecognized_items.append(raw_name)
            candidates.append(
                _build_unmatched_dish_candidate(
                    proposed_name=raw_name,
                    score=min(raw_score, 0.65),
                    visual_explanation=vis_ev,
                    explicit_confidence_cat="low_confidence"
                    if raw_score < 0.5
                    else "moderate_confidence",
                )
            )

    detected_components_out: list[DishDetectedComponentOut] = []
    for comp in raw_components:
        if not isinstance(comp, dict):
            continue
        comp_label = str(comp.get("label") or comp.get("name") or "").strip()
        if not comp_label:
            continue
        try:
            comp_score = float(comp.get("confidence_score", 0.80))
        except (TypeError, ValueError):
            comp_score = 0.80
        comp_cat, _ = _confidence_category_from_score(
            comp_score, str(comp.get("confidence_category") or "").strip() or None
        )
        comp_desc = str(comp.get("visual_description") or f"Detected {comp_label} on plate.").strip()
        matched_comp_food = _match_food_query_to_catalog(db, [comp_label], all_foods=all_foods)

        if matched_comp_food:
            comp_detail = serialize_food_detail(db, matched_comp_food)
            detected_components_out.append(
                DishDetectedComponentOut(
                    component_label=comp_label,
                    confidence_score=round(comp_score, 2),
                    confidence_category=comp_cat,
                    visual_description=comp_desc,
                    matched_in_database=True,
                    matched_food_id=matched_comp_food.id,
                    matched_food_slug=matched_comp_food.slug,
                    matched_food_name=matched_comp_food.name_en,
                    category_name=matched_comp_food.category.name if matched_comp_food.category else None,
                    standard_serving_name=comp_detail.standard_serving_name,
                    standard_serving_grams=comp_detail.standard_serving_grams,
                    key_nutrients_per_100={
                        n.nutrient_code: n.value_per_100
                        for n in comp_detail.nutrients
                        if n.nutrient_code in ("energy_kcal", "protein_g", "carbs_g", "fat_total_g", "fibre_g")
                    },
                )
            )
            if matched_comp_food.slug not in seen_food_slugs:
                seen_food_slugs.add(matched_comp_food.slug)
                candidates.append(
                    _build_dish_candidate_from_food(
                        db,
                        matched_comp_food,
                        score=comp_score,
                        visual_explanation=comp_desc,
                        explicit_confidence_cat=comp_cat,
                        detected_component_label=comp_label,
                    )
                )
        else:
            if comp_label not in unrecognized_items:
                unrecognized_items.append(comp_label)
            detected_components_out.append(
                DishDetectedComponentOut(
                    component_label=comp_label,
                    confidence_score=round(comp_score, 2),
                    confidence_category=comp_cat,
                    visual_description=comp_desc,
                    matched_in_database=False,
                )
            )

    # If user provided an explicit text hint that wasn't already included, check if it matches a catalog item
    if user_hint and user_hint.strip():
        hint_food = _match_food_query_to_catalog(db, [user_hint.strip()], all_foods=all_foods)
        if hint_food and hint_food.slug not in seen_food_slugs:
            seen_food_slugs.add(hint_food.slug)
            candidates.append(
                _build_dish_candidate_from_food(
                    db,
                    hint_food,
                    score=0.72,
                    visual_explanation=f"Matched from your optional description ('{user_hint.strip()}').",
                    explicit_confidence_cat="moderate_confidence",
                    detected_component_label=user_hint.strip(),
                )
            )
        for dish_item in all_foods:
            if len(candidates) >= 3:
                break
            if dish_item.category and dish_item.category.slug == "indian-dishes":
                if dish_item.slug not in seen_food_slugs:
                    seen_food_slugs.add(dish_item.slug)
                    candidates.append(
                        _build_dish_candidate_from_food(
                            db,
                            dish_item,
                            score=0.35,
                            visual_explanation="Additional Indian dish candidate for manual verification.",
                            explicit_confidence_cat="low_confidence",
                        )
                    )

    # Sort matched database candidates ahead of unmatched items, then by confidence score descending
    candidates.sort(
        key=lambda c: (1 if c.matched_in_database else 0, c.visual_similarity_score),
        reverse=True,
    )

    if not is_food_image or not candidates:
        status_code = "low_confidence"
        if not ambiguity_notes:
            ambiguity_notes.append(
                "No clear food item could be confidently matched. Please try a clearer photograph or search the GharPlate database manually below."
            )
    elif any(c.matched_in_database and c.confidence_category == "high_confidence" for c in candidates):
        status_code = "success"
    else:
        status_code = "low_confidence" if all(c.confidence_category == "low_confidence" for c in candidates) else "success"

    return DishRecognitionResponse(
        recognition_id=rec_id,
        analysis_status=status_code,
        vision_provider=settings.VISION_PROVIDER,
        vision_model_used=vision_model_used,
        vision_reachable=True,
        overall_description=overall_desc,
        experimental_disclaimer=disclaimer_msg,
        privacy_confirmation=privacy_msg,
        requires_user_confirmation=True,
        image_quality_notes=str(quality_info.get("quality_summary") or ""),
        detected_components=detected_components_out,
        unrecognized_items=unrecognized_items,
        ambiguity_notes=ambiguity_notes,
        remediation_instructions=[],
        candidates=candidates[:8],
    )
