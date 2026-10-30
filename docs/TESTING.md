# GharPlate Testing & Quality Assurance Report (`docs/TESTING.md`)

## 1. Executed Backend & End-to-End Pytest Results

All 15 backend unit, integration, and end-to-end user journey tests were executed against the real SQLite database (`Python 3.13.5`, `pytest 9.1.1`) and **PASSED (15/15 passed in 1.96s)**:

```bash
cd backend
PYTHONPATH=. python3 -m pytest -v tests/
```

| Test Case | Module Verified | Actual Result |
|---|---|---|
| `test_complete_12_step_gharplate_user_journey` | Full 12-step E2E household journey (Health -> Household -> Member -> Alias Search -> Food Detail -> Guidance -> Conflict Check -> Recipe Calc -> Product Compare -> OCR Scan -> Manual Correction & Confirm) | **PASSED** |
| `test_01_health_endpoint` | `/api/v1/health` status & seeded counts (75 foods, 24 conditions, 9 sources) | **PASSED** |
| `test_02_food_search_english_and_categories` | English search & all 9 Indian food categories | **PASSED** |
| `test_03_multilingual_alias_and_fuzzy_search` | Hindi (`Aloo`), Kannada (`Avalakki`, `Baale Hannu`, `Eerulli`, `Anna`, `Togari Bele`), and fuzzy misspelling (`Alugade`) search | **PASSED** |
| `test_04_food_detail_and_null_missing_nutrient_integrity` | Verifies missing nutrients in whole and packaged foods remain `NULL` (`None`), never `0` | **PASSED** |
| `test_05_condition_guidance_and_no_forbidden_labels` | Verifies deterministic rules and confirms absence of prohibited labels (`Safe`, `Unsafe`, `Allowed`, `Forbidden`, `Cures`) | **PASSED** |
| `test_06_multi_condition_conflict_detection` | Verifies `CONFLICT_DIABETES_CKD` detection when Diabetes + CKD are selected together | **PASSED** |
| `test_07_short_term_illness_and_pediatric_scoping` | Verifies fever short-term illness warnings and blocks adult diabetes thresholds on `child` profiles | **PASSED** |
| `test_08_household_and_member_profiles_allergies_vs_intolerances` | Verifies passwordless household CRUD and distinct immunological allergy vs. digestive intolerance alerts | **PASSED** |
| `test_09_recipe_calculator_and_missing_nutrient_preservation` | Verifies unit conversion, per-serving scaling, and `NULL` completeness reporting in recipes | **PASSED** |
| `test_10_ocr_parsing_and_validation_checks` | Verifies OCR typo detection (`52O kcal` -> `520.0`), impossible fat value detection (`140g/100g`), and per-serving basis warning | **PASSED** |
| `test_11_ocr_image_upload_privacy_and_restrictions` | Verifies in-memory PNG OCR upload, RAM purge confirmation, and rejection of invalid MIME types (`.exe`) | **PASSED** |
| `test_12_barcode_lookup_and_fallback` | Verifies local barcode hit (`8901719101014`) and non-inventing fallback on unknown barcode (`0000099999123`) | **PASSED** |
| `test_13_experimental_dish_recognition_in_memory` | Verifies RAM-only dish recognition returning multi-candidate suggestions with explicit uncertainty | **PASSED** |
| `test_14_product_comparison_and_meal_suggestions` | Verifies 3-product per-100g comparison and personalised Indian meal suggestions | **PASSED** |

## 2. Frontend Test Suite (`frontend/tests/App.test.tsx`)

Written with `Vitest` and `@testing-library/react`. To run when frontend node dependencies are installed:

```bash
cd frontend
npm install
npm run test
npm run build
```
