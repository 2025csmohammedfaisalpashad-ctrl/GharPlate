# Intelligent Multi-Source Barcode Lookup & Camera Scanner (`docs/BARCODE_LOOKUP.md`)

## 1. Why the Original Barcode Lookup & Camera Scanner Needed Repair

1. **Incomplete Local Record Early Stop (`ocr_barcode_service.py`)**:
   - Previously, `lookup_barcode()` queried `FoodItem.barcode == clean_code` and immediately returned any local record without checking whether `image_url` or nutrient values were `NULL`.
   - For **Pineapple Cake — Winkles** (`8906005618726`, slug `pkg-pineapple-cake-6b35c3`), where `ingredients_text` was present but `image_url` was `NULL` and `0 of 20` nutrients were available, the old implementation stopped immediately and never checked external databases.
2. **Black Camera Preview Bug in Safari (`ScannerPages.tsx`)**:
   - Previously, `BarcodeLookupPage` conditionally mounted `<video ref={videoRef}>` inside `{cameraActive ? <video ... /> : <div>Camera idle</div>}` and called `setCameraActive(true)` followed immediately by `if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }`.
   - Because `setCameraActive(true)` schedules an asynchronous React render, `videoRef.current` was `null` when stream attachment ran, leaving the visible `<video>` element with no `srcObject` (a completely black preview).
3. **Missing Safari Barcode Decoding Fallback**:
   - Safari on macOS does not reliably expose `window.BarcodeDetector`. Without a cross-browser decoder, even an active camera preview could not decode barcodes in Safari.

---

## 2. Camera Lifecycle Fix & Safari-Compatible ZXing Decoding (`frontend/src/pages/ScannerPages.tsx`)

1. **Always-Mounted `<video>` Element & Verified Playback**:
   - `<video ref={videoRef} data-testid="live-barcode-video" playsInline muted autoPlay />` remains mounted in the DOM at all times inside the viewfinder container, with visibility toggled via CSS classes (`block opacity-100` vs `hidden opacity-0`).
   - When `startCameraScanner()` acquires a `MediaStream`, `videoRef.current` is guaranteed to exist.
   - The scanner assigns `videoEl.srcObject = stream`, sets `muted` and `playsInline`, waits for media readiness (`loadedmetadata` / `canplay`), calls `await videoEl.play()` (reporting genuine playback errors instead of swallowing them), and verifies non-zero `videoWidth` and `videoHeight` before activating the live state.
2. **Cross-Browser Decoding with `@zxing/browser` (`BrowserMultiFormatReader`)**:
   - Uses `BrowserMultiFormatReader` from `@zxing/browser` configured with `DecodeHintType.POSSIBLE_FORMATS` (`EAN_13`, `EAN_8`, `UPC_A`, `ITF`, `CODE_128`) and `DecodeHintType.TRY_HARDER = true` alongside native `window.BarcodeDetector` where available.
   - Runs a single unified decoding loop on the active `<video>` element without opening a second camera stream.
   - Prevents duplicate submissions via `hasDetectedRef` and `sessionIdRef`, stops all camera tracks immediately upon valid 8–14 digit barcode detection, and triggers `lookupBarcode(code)`.
3. **Granular Camera Error Diagnostics & Cleanup**:
   - Distinguishes insecure browser contexts (`!window.isSecureContext`), missing `navigator.mediaDevices.getUserMedia`, permission denial (`NotAllowedError`), missing camera hardware (`NotFoundError`), camera in use (`NotReadableError`), unsupported constraints (`OverconstrainedError`, with automatic fallback to `{ video: true }`), playback rejection, zero-dimension frames, and unexpected stream disconnects (`track.onended`).
   - Supports multi-camera selection (`enumerateDevices`), hardware torch toggling, and strict track release on **Stop Camera**, route navigation unmount, and React StrictMode re-renders.

---

## 3. 12-Step Multi-Source Barcode Lookup & Product Image Pipeline

Implemented in `backend/app/services/ocr_barcode_service.py` (`lookup_barcode`) and `backend/app/integrations/provider_registry.py`:

1. **Validate & Normalise Barcode (`validate_and_normalize_barcode`)**: Validates **EAN-8**, **UPC-A**, **EAN-13**, and **GTIN-14** with GS1 Modulo-10 check-digit verification.
2. **Query Local Database**: Searches `food_items` by exact `barcode`.
3. **Evaluate Local Record Completeness (`evaluate_local_product_completeness`)**: Checks `has_verified_image`, `has_ingredients`, and `has_minimum_nutrients`.
4. **Check Cache Freshness (`external_updated_at`)**.
5. **Query External Providers When Incomplete or Stale (`query_external_providers_for_barcode`)**: Queries **Open Food Facts API v3** and **USDA FoodData Central Branded Foods**.
6. **Verify Exact Product Identity (`verify_product_identity_match`)**: Rejects mismatched product titles/brands and records a `product_identity` conflict in `product_data_conflicts`.
7. **Merge Only Compatible Missing Fields & Verified Product Photos (`merge_external_product_into_local`)**:
   - Preserves user-confirmed local fields (`name_en`, `brand`, `ingredients_text`, and non-`NULL` nutrients).
   - Retrieves and stores the actual front-of-package product photograph (`front_image_url` / `image_url`) from the provider when available so both the barcode lookup result card and the product detail page display the genuine product photo immediately.
   - If no verified product photograph exists (as with `Pineapple Cake 8906005618726`), preserves `image_url = NULL` (`has_verified_image = False`) and displays `"No verified product image available"`.
8. **Record Conflicts (`product_data_conflicts`) & Field-Level Provenance (`product_field_provenance`)**.
