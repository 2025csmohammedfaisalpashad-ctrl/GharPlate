# GharPlate — Indian Household Food Intelligence & Personalised Nutrition Platform

GharPlate is a full-stack, evidence-based food composition, packaged-product intelligence, and condition-aware nutrition literacy platform built for Indian households. It helps families understand raw ingredients, regional Indian dishes, recipes, and packaged-food labels in the context of household members' dietary preferences, allergies, intolerances, and health considerations.

> **Medical & Nutritional Safety Disclaimer:** GharPlate is an educational food-information tool. It is **not** a medical diagnostic system, clinical treatment platform, or substitute for advice from a qualified doctor or registered dietitian. It never labels foods as universally "Safe", "Unsafe", "Allowed", or "Forbidden", never claims any food cures or reverses disease, and never replaces unknown (`NULL`) nutrient values with zero or synthetic estimates.

---

## 1. Key Features (Modules 1–12)

1. **Indian Food Intelligence Database & Multi-Source Product Layer (Module 1)**:
   - 75+ seeded foods across all 9 mandatory categories (*Cereals & Millets*, *Pulses & Legumes*, *Vegetables*, *Fruits*, *Dairy*, *Protein Sources*, *Nuts & Seeds*, *Indian Dishes*, and *Packaged Foods*).
   - Multi-source integration layer (`backend/app/integrations/`) combining **ICMR-NIN IFCT 2017**, **DGI 2024**, **Open Food Facts API v3 + v2**, **USDA FoodData Central** (`FDC_API_KEY` optional), and configurable **Brave Search / Tavily** web search adapters.
   - Field-level provenance tracking (`product_field_provenance`), conflict detection (`product_data_conflicts`), and TTL external response caching (`external_lookup_cache`).
2. **Advanced Multilingual Food Search (Module 2)**:
   - Search in **English**, **Hindi** (Devanagari & transliterated), and **Kannada** (script & transliterated) with fuzzy matching, category/nutrient filters, and sorting.
3. **Deterministic Condition-Aware Food Guidance Engine (Module 3)**:
   - Covers 24 conditions across 9 groups with explicit, evidence-reviewed `ConditionFoodMapping` records (`condition_food_mappings`) and 43 structured `FoodTag` definitions.
4. **Passwordless Household & Family Profiles (Module 4)**:
   - Uses a local browser convenience UUID token (`hh_<uuid>`) with no mandatory login and keeps immunological **allergies** strictly distinct from digestive **intolerances**.
5. **Recipe & Meal Nutrition Calculator (Module 5)**:
   - Supports Indian household units (`100g`, `100ml`, `standard_serving`, `katori`, `cup`, `bowl`, `roti`, `piece`, `tbsp`, `tsp`) and reports nutrient completeness without treating missing ingredient values as zero.
6. **Multi-Panel Packaged Label OCR Scanner & Structured Ingredient Parser (Module 6)**:
   - Supports Nutrition Table, Ingredients/Allergen Panel, and Front-of-Package photo uploads with image rotation and contrast preprocessing.
   - Separates ingredient statements, INS/E-number additives, percentage declarations, allergen statements, polyols/laxative warnings, net weight, and manufacturer metadata, and cross-checks declared allergens against stored `allergen_tags`.
   - Never fabricates nutrient values when OCR is unreadable or unavailable (`status: "ocr_failed"`).
7. **12-Step Intelligent Barcode Lookup & Live Camera Scanner (Module 7)**:
   - Live browser camera barcode scanner (`EAN-8`, `UPC-A`, `EAN-13`, `GTIN-14`) with camera switching, torch control, automatic stream cleanup, and manual fallback.
   - Evaluates local record completeness and automatically queries Open Food Facts when a local record is incomplete (such as **Pineapple Cake — Winkles**, barcode `8906005618726`), preserving user-confirmed fields and merging only missing (`NULL`) attributes.
8. **Experimental Indian Dish Image Recognition (Module 8)**, **2–4 Packaged Product Comparison (Module 9)**, and **Personalised Meal Suggestions (Module 10)**.
9. **Local Ollama-Powered GharPlate AI Assistant (Module 12)**:
   - Floating **Ask GharPlate** drawer available on every page, powered by local Ollama (`http://127.0.0.1:11434`) with dynamic model discovery (`/api/v1/assistant/models`), 11 allowlisted backend tools, 3 search modes (`My GharPlate Database`, `Automatic`, `Search Online`), automatic page context awareness, and deterministic tool-backed fallback when Ollama is offline.

---

## 2. Technology Stack

- **Backend**: Python 3.12/3.13, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, Pillow, httpx, Pytest
- **Database**: SQLite (`backend/gharplate.db`) with PostgreSQL-ready ORM and migration layer
- **Local AI**: Ollama (`http://127.0.0.1:11434` on host, `http://host.docker.internal:11434` in Docker)
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Vitest, React Testing Library
- **DevOps & CI/CD**: Docker, Docker Compose, Nginx, GitHub Actions (`.github/workflows/ci.yml` & `docker-publish.yml`)

---

## 3. Project Structure

```text
GharPlate/
├── backend/
│   ├── app/
│   │   ├── api/v1/router.py
│   │   ├── core/config.py
│   │   ├── db/ (session.py, init_db.py, seed_catalog.py, seed_foods_part1..4.py, seed_conditions.py, seed_rules.py, seed_condition_foods.py, seed_images.py)
│   │   ├── integrations/ (normalizer.py, cache.py, open_food_facts.py, food_data_central.py, web_search.py, provider_registry.py)
│   │   ├── models/entities.py
│   │   ├── rules/guidance_engine.py
│   │   ├── schemas/api_schemas.py
│   │   ├── services/ (food_service.py, condition_food_service.py, recipe_service.py, ocr_barcode_service.py, ollama_assistant_service.py, comparison_meals_service.py)
│   │   └── main.py
│   ├── migrations/versions/ (0001, 0002, 0003_product_provenance_and_cache.py)
│   ├── tests/ (test_gharplate_api.py, test_e2e_user_journey.py, test_condition_food_recommendations.py, test_barcode_and_enrichment.py, test_ocr_and_ingredients.py, test_ollama_assistant.py)
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/ (Layout.tsx, UIWidgets.tsx, AssistantDrawer.tsx)
│   │   ├── hooks/useHousehold.tsx
│   │   ├── pages/ (HomePages.tsx, ConditionPages.tsx, HouseholdPages.tsx, RecipePages.tsx, ScannerPages.tsx, ComparisonMealsPages.tsx, TrustPages.tsx)
│   │   ├── services/api.ts
│   │   ├── types/api.ts
│   │   ├── utils/visualAssets.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tests/ (setup.ts, App.test.tsx)
│   ├── package.json
│   └── Dockerfile
├── data/ (backups/, raw/, processed/, import_reports/latest_import_report.json)
├── scripts/seed_data.py
├── docs/ (ARCHITECTURE.md, API_CONTRACT.md, DATA_SOURCES.md, DATA_QUALITY.md, DATA_PROVENANCE.md, PRODUCT_DATA_INTEGRATION.md, BARCODE_LOOKUP.md, OCR_AND_INGREDIENT_EXTRACTION.md, OLLAMA_ASSISTANT.md, CONDITION_FOOD_RECOMMENDATIONS.md, VISUAL_REDESIGN.md, MEDICAL_SAFETY.md, PRIVACY.md, SECURITY.md, TESTING.md, DEPLOYMENT.md, FIGMA_INTEGRATION.md, PROJECT_STATUS.md)
├── .github/workflows/ (ci.yml, docker-publish.yml)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 4. Quickstart Instructions

### 1. Start Backend API (`http://localhost:8000`)
```bash
cd backend
PYTHONPATH=. python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- OpenAPI / Swagger UI: `http://localhost:8000/docs`

### 2. Optional: Start Local Ollama for AI Assistant (`http://127.0.0.1:11434`)
```bash
ollama serve
ollama pull qwen2.5:7b
```
*(If Ollama is not running, the assistant drawer automatically falls back to deterministic GharPlate database tools and displays clear setup instructions.)*

### 3. Run All 43 Backend & E2E Tests
```bash
PYTHONPATH=backend python3 -m pytest -v backend/tests/
```

### 4. Run Frontend Vitest Suite & Start Dev Server (`http://localhost:5173`)
```bash
cd frontend
npm test
npm run dev
```

### 5. Run with Docker Compose (`http://localhost:8080`)
```bash
cp .env.example .env
docker compose up --build
```
