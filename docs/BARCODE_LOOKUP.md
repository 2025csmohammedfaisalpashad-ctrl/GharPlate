# Intelligent Multi-Source Barcode Lookup & Camera Scanner (`docs/BARCODE_LOOKUP.md`)

## 1. Why the Original Barcode Lookup Needed Replacement

Previously, `lookup_barcode()` in `backend/app/services/ocr_barcode_service.py` queried `FoodItem.barcode == clean_code` and immediately returned any local record without checking whether `image_url` or nutrient values were `NULL`, while suppressing all network exceptions with a bare `except Exception: pass`.

For an incomplete local record such as **Pineapple Cake — Winkles** (`8906005618726`, slug `pkg-pineapple-cake-6b35c3`), where `ingredients_text` was present but `image_url` was `NULL` and `0 of 20` nutrients were available, the old implementation stopped immediately and never checked external databases.

---

## 2. 12-Step Multi-Source Barcode Lookup Pipeline

Implemented in `backend/app/services/ocr_barcode_service.py` (`lookup_barcode`) and `backend/app/integrations/provider_registry.py`:

1. **Validate & Normalise Barcode (`validate_and_normalize_barcode`)**:
   - Validates **EAN-8** (8 digits), **UPC-A** (12 digits), **EAN-13** (13 digits), and **GTIN-14** (14 digits) and verifies the GS1 Modulo-10 check digit.
   - Rejects malformed or non-numeric strings with `source_origin="invalid_barcode"`.
2. **Query Local Database**: Searches `food_items` by exact `barcode`.
3. **Evaluate Local Record Completeness (`evaluate_local_product_completeness`)**:
   - Checks `has_verified_image` (`image_url` present), `has_ingredients` (`ingredients_text` present), and `has_minimum_nutrients` (at least 4 key macronutrients/sodium non-`NULL`).
4. **Check Cache Freshness (`external_updated_at`)**: Checks when external providers were last queried.
5. **Query External Providers When Incomplete or Stale (`query_external_providers_for_barcode`)**:
   - Queries **Open Food Facts API v3** (`/api/v3/product/{barcode}.json`).
   - Queries **USDA FoodData Central Branded Foods** (`/fdc/v1/foods/search`) if configured and nutrients are still missing.
6. **Verify Exact Product Identity (`verify_product_identity_match`)**:
   - Confirms that the external record shares the exact barcode and a compatible product/brand identity before merging.
   - If an external barcode record has a conflicting product title/brand, GharPlate **rejects** automatic merging and logs a `product_identity` row in `product_data_conflicts`.
7. **Merge Only Compatible Missing Fields (`merge_external_product_into_local`)**:
   - Preserves all user-confirmed local fields (`name_en`, `brand`, `ingredients_text`, and any non-`NULL` user-confirmed nutrients).
   - Fills only `NULL` fields (`image_url`, `net_quantity`, and `NULL` nutrient rows).
8. **Record Conflicts (`product_data_conflicts`)**:
   - If external ingredients or nutrient values conflict with existing local values, records a `ProductDataConflict` row for user review instead of overwriting.
9. **Record Field-Level Provenance (`product_field_provenance`)**:
   - Every merged or user-confirmed field records its `source_code`, `source_name`, `source_url`, `source_record_id`, `confidence_status`, `review_status`, and `retrieved_at` timestamp.
10. **Structured Network & Rate-Limit Diagnostics**:
    - Reports explicit provider statuses (`found`, `not_found`, `cached_found`, `cached_not_found`, `timeout`, `rate_limited`, `http_error`, `network_error`, `unconfigured_api_key`).
    - A network failure or HTTP 429 is never presented as a successful lookup.

---

## 3. Real Camera Barcode Scanner (`frontend/src/pages/ScannerPages.tsx`)

On `/barcode` (`BarcodeLookupPage`):
- Requests camera permission via `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`.
- Displays the live `<video>` stream with an active scan line.
- Uses the browser `BarcodeDetector` API (`ean_13`, `ean_8`, `upc_a`, `itf`, `code_128`) to detect barcodes in real time, validate the 8–14 digit code, stop the camera stream, and trigger `lookupBarcode(code)`.
- Supports hardware torch/flashlight toggling where `track.getCapabilities().torch` is available.
- Automatically stops all camera tracks (`stream.getTracks().forEach(t => t.stop())`) when leaving the page or clicking **Stop Camera**.
- Displays clear error messages when camera permission is denied (`NotAllowedError`) and provides instant manual barcode entry.
