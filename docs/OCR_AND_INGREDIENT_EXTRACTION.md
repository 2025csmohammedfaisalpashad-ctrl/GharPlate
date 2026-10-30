# Nutrition-Label OCR & Ingredient Extraction (`docs/OCR_AND_INGREDIENT_EXTRACTION.md`)

## 1. Critical Regression Fix: Removal of Synthetic OCR Fallback Values

### What Was Wrong Previously
In the earlier implementation of `process_uploaded_label_image()` (`backend/app/services/ocr_barcode_service.py`), when `pytesseract` was unavailable or returned empty text from an unreadable image, a fallback block inserted hardcoded sample values (`465 kcal`, `7.4 g protein`, `68.2 g carbohydrates`, `19.5 g total sugars`, etc.).

### How It Was Repaired
- The hardcoded synthetic fallback block has been **completely removed**.
- When OCR cannot extract readable text from an uploaded photograph (and no user transcription hint is supplied), `process_uploaded_label_image()` returns:
  - `ocr_status`: `"failed_no_text"` or `"failed_engine_unavailable"`
  - `requires_manual_entry`: `true`
  - `ocr_error_reason`: Clear explanation of why text could not be extracted
  - `fields`: Every nutrient field has `extracted_value: null` and `validation_status: "missing"`.
- Covered by mandatory regression test `test_01_ocr_failure_never_inserts_synthetic_fallback_nutrition_values` in `backend/tests/test_ocr_and_ingredients.py`.

---

## 2. Image Preprocessing & Multi-Panel OCR Pipeline

1. **In-Memory Image Preprocessing (`preprocess_label_image_for_ocr`)**:
   - Processes uploaded JPEG/PNG/WebP images strictly in RAM (`io.BytesIO`).
   - Applies EXIF orientation normalization (`ImageOps.exif_transpose`), grayscale conversion, histogram autocontrast (`ImageOps.autocontrast`), and sharpening (`ImageFilter.SHARPEN`).
   - Automatically tests `0°`, `90°`, `270°`, and `180°` rotations when upright extraction yields minimal text.
   - Immediately purges image byte buffers (`del file_bytes; gc.collect()`).
2. **Multi-Panel Support**:
   - Users can upload separate photographs for:
     1. **Nutrition Information Panel** (`file`)
     2. **Ingredients & Allergen Panel** (`ingredients_file`)
     3. **Front-of-Package Display Image** (stored on the product catalog record **only** when `retain_front_image_consent=true` is explicitly checked).
3. **Validation Checks (`parse_nutrition_label_text`)**:
   - Detects `Per 100g` vs `Per 100ml` vs `Per Serving` column headers.
   - Flags OCR character ambiguities (`48O kcal` -> proposed correction `480.0 kcal`, `l`/`I` -> `1`, `S` -> `5`).
   - Flags unit mismatches (`kJ` vs `kcal`, `g` vs `mg` for sodium).
   - Flags impossible per-100g values (`> 100g` for macronutrients, `> 900 kcal` for energy) and Atwater energy inconsistencies (`4*P + 4*C + 9*F`).

---

## 3. Structured Ingredient Separation & Allergen Consistency (`normalizer.py`)

Auditing the existing **Pineapple Cake — Winkles** record (`pkg-pineapple-cake-6b35c3`, barcode `8906005618726`) revealed two important real-world challenges:
1. Its stored `ingredients_text` included noisy tail text from the package (`KEEP YOUR CITY CLEAN 110 NET WEIGHT: MRP:... SOUTHERN BAKERIES PVT. LTD...`) and OCR typos (`ONS 2113`, `SINTHETIC FOOD COLOUR`, `IMS 422`, `INS 500(H)`).
2. Its package text explicitly declared `CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.`, but its stored `allergen_tags` (`["eggs", "gluten", "milk"]`) omitted **`soy`**.

`parse_and_clean_package_ingredients()` and `check_allergen_consistency()` in `backend/app/integrations/normalizer.py` now automatically:
- Preserve the original `raw_ocr_text` verbatim for audit and review.
- Produce a clean `cleaned_ingredients_text` and top-level `ingredient_items` list without manufacturing/lot noise.
- Extract characterising `ingredient_percentages` (e.g., `FRUIT CUTS (5%)`, `PINEAPPLE CUTS (2%)`).
- Extract `additives` (`INS 330`, `INS 471`, `INS 322`, etc.) and record `ocr_uncertainty_notes` for OCR typos without discarding evidence.
- Extract `allergen_statement` (`CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.`), `label_warnings` (`POLYOLS MAY HAVE LAXATIVE EFFECTS.`), `net_weight` (`110 g`), and `manufacturer_info`.
- Compare `stored_allergen_tags` against both `declared_allergens` and `ingredient_inferred_allergens`, flagging any missing allergen (such as `soy` on Pineapple Cake) in `missing_from_stored_tags` and displaying a prominent **Allergen Consistency Alert** on the product detail page.
