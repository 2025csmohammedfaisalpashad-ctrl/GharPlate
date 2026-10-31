# GharPlate Testing & Quality Assurance Report (`docs/TESTING.md`)

## 1. Executed Backend & End-to-End Pytest Results (44 / 44 Passed)

All 44 backend unit, integration, condition-recommendation, barcode enrichment, OCR/ingredient extraction, Ollama assistant, and 12-step E2E user journey tests were executed against an isolated SQLite database (`Python 3.13.5`, `pytest 9.1.1`) and **PASSED (44/44 passed in 7.18s)**:

```bash
PYTHONPATH=backend python3 -m pytest -v backend/tests/
```

| Test Suite | Tests | Modules Verified | Actual Result |
|---|---|---|---|
| `backend/tests/test_barcode_and_enrichment.py` | 7 | Pineapple Cake (`8906005618726`) baseline & soy allergen consistency, external Open Food Facts enrichment, identity conflict rejection, invalid/timeout/rate-limit handling, duplicate barcode safety, and 84 local `.webp` food photographs + attribution manifest | **7 / 7 PASSED** |
| `backend/tests/test_condition_food_recommendations.py` | 13 | Isolated test DB verification, Fever (`fever_acute_recovery`) reviewed food mappings, exclusion of `Chicken Biryani` from Fever, dietary preference filtering (vegetarian, vegan, eggetarian, non-vegetarian), `NULL` nutrient preservation, allergen/intolerance alerts, and absence of prohibited medical labels | **13 / 13 PASSED** |
| `backend/tests/test_e2e_user_journey.py` | 1 | Complete 12-step household journey (Health -> Household -> Member -> Multilingual Search -> Food Detail -> Condition Guidance -> Multi-Condition Conflict -> Recipe Calculator -> Product Comparison -> OCR Label Scan -> Manual Correction & Confirm) | **1 / 1 PASSED** |
| `backend/tests/test_gharplate_api.py` | 15 | `/api/v1/health`, English/Hindi/Kannada alias & fuzzy search, `NULL` missing nutrient integrity, deterministic condition rules, `CONFLICT_DIABETES_CKD`, short-term illness & pediatric scoping, household CRUD, recipe calculator, OCR validation, in-memory image privacy, barcode fallback, dish recognition, product comparison, meal suggestions, and food image references | **15 / 15 PASSED** |
| `backend/tests/test_ocr_and_ingredients.py` | 3 | Zero synthetic fallback values on OCR failure, rotated image (`90°`/`180°`/`270°`) & multi-panel OCR extraction, and noisy package ingredient/additive/allergen separation | **3 / 3 PASSED** |
| `backend/tests/test_ollama_assistant.py` | 5 | Assistant status & model discovery, context-aware Pineapple Cake conversation, `database_only` vs `online_search` modes, live Ollama native tool-calling integration, and medical safety guardrails | **5 / 5 PASSED** |

---

## 2. Executed Frontend Lint, Vitest & Build Results (9 / 9 Passed)

All 9 frontend unit and component integration tests in `frontend/tests/App.test.tsx` (`Vitest 2.1.9`, `@testing-library/react`) as well as TypeScript static checking (`tsc --noEmit`) and production bundling (`tsc -b && vite build`) **PASSED**:

```bash
cd frontend
npm run lint
npm test
npm run build
```

| Check / Test Case | Verified Behaviour | Actual Result |
|---|---|---|
| `npm run lint` (`tsc --noEmit`) | Zero TypeScript type errors across all frontend components, hooks, pages, and tests | **PASSED** |
| `renders Redesigned Visual Home Page with local .webp food photographs and live stats` | Verifies Hero food collage (`Idli & Sambar` `.webp` photo) and live database counts (`77` foods, `24` conditions, `10` sources) | **PASSED** |
| `renders all 9 Home page Explore Food Categories cards as compact, text-only clickable cards without image preview areas` | Verifies all 9 category cards (`Cereals & Millets`, `Pulses & Dals`, `Vegetables & Greens`, `Fresh Fruits`, `Dairy & Fermented`, `Protein Sources`, `Nuts & Seeds`, `Indian Dishes`, `Packaged Foods`) render icon, title, description, and `/foods?category=...` link with zero `<img>` tags inside the category cards | **PASSED** |
| `renders Image-First Food Explorer with Grid and Compact List view toggle and local food photograph` | Verifies individual food cards in Food Explorer still render their `.webp` food photographs (`Ragi (Finger Millet)`) | **PASSED** |
| `supports visual step-by-step OCR review and correction workflow` | Verifies OCR warning badge and one-click proposed correction (`48O` -> `480`) | **PASSED** |
| `renders Fever Condition Detail page with reviewed supportive foods and excludes Chicken Biryani` | Verifies `Khichdi (Moong Dal & Rice)` is displayed and `Chicken Biryani` is excluded | **PASSED** |
| `renders Pineapple Cake packaged product page with visible barcode, visible ingredients, soy consistency alert, and honest missing-image card` | Verifies barcode `8906005618726`, parsed ingredients, soy consistency alert, and honest missing-image card | **PASSED** |
| `handles camera permission denied, no camera found, live video stream attachment, non-zero dimensions, ZXing Safari barcode detection, automatic lookup with product image, and stop/unmount cleanup` | Verifies always-mounted `<video ref={videoRef}>`, Safari ZXing `BrowserMultiFormatReader` barcode decoding, automatic product lookup, and track cleanup | **PASSED** |
| `opens the Ask GharPlate Assistant as a resizable floating window, persists width and dock side, preserves conversation on Escape/reopen, and renders rich Markdown without literal asterisks` | Verifies floating resizable window, left/right dock toggle, Escape/backdrop close, and structured GFM Markdown rendering | **PASSED** |
| `sanitizes unsafe links and raw HTML in AssistantMarkdown` | Verifies `javascript:` URLs are stripped while safe `https://` links open with `rel="noopener noreferrer"` | **PASSED** |
| `npm run build` (`tsc -b && vite build`) | Produces `frontend/dist/index.html` and hashed CSS/JS assets (`536 modules transformed`) | **PASSED** |
