# GharPlate — Indian Household Food Intelligence & Personalised Nutrition Platform

GharPlate is a full-stack, evidence-based food composition and condition-aware nutrition literacy platform built for Indian households. It helps families understand raw ingredients, regional Indian dishes, recipes, and packaged-food labels in the context of household members' dietary preferences, allergies, intolerances, and health considerations.

> **Medical & Nutritional Safety Disclaimer:** GharPlate is an educational food-information tool. It is **not** a medical diagnostic system, clinical treatment platform, or substitute for advice from a qualified doctor or registered dietitian. It never labels foods as universally "Safe", "Unsafe", "Allowed", or "Forbidden", never claims any food cures or reverses disease, and never replaces unknown (`NULL`) nutrient values with zero.

---

## 1. Key Features (Modules 1–11)

1. **Indian Food Intelligence Database (Module 1)**:
   - 75+ seeded foods across all 9 mandatory categories: *Cereals & Millets*, *Pulses & Legumes*, *Vegetables*, *Fruits*, *Dairy*, *Protein Sources*, *Nuts & Seeds*, *Indian Dishes* (18 regional dishes including Idli, Dosa, Masala Dosa, Ragi Mudde, Chapati, Paratha, Poha, Upma, Bisi Bele Bath, Pongal, Khichdi, Sambar, Rasam, Dal Rice, Curd Rice, Pulao, Biryani, Palak Paneer), and *Packaged Foods*.
   - Full provenance linked to **ICMR-NIN Indian Food Composition Tables (IFCT 2017)**, **Dietary Guidelines for Indians (2024 Edition)**, **WHO**, **FSSAI**, **KDIGO**, **WGO**, and **MoHFW Anemia Mukt Bharat**.
   - Strict `NULL` preservation for unmeasured or undeclared nutrients (`zero_replacement_for_missing = False`).
2. **Advanced Multilingual Food Search (Module 2)**:
   - Search in **English**, **Hindi** (Devanagari & transliterated, e.g., `Aloo`, `Chawal`, `Arhar Dal`, `Palak`), and **Kannada** (script & transliterated, e.g., `Anna`, `Baale Hannu`, `Eerulli`, `Avalakki`, `Togari Bele`, `Ragi Mudde`), with fuzzy matching for misspellings (`Alugade`), category/nutrient filters, and sorting.
3. **Deterministic Condition-Aware Food Guidance Engine (Module 3)**:
   - Covers 24 conditions across 9 groups: *A. Blood Glucose & Metabolic*, *B. Blood Pressure & Cardiovascular*, *C. Kidney Health*, *D. Digestive Health*, *E. Liver & Gout*, *F. Nutritional Deficiencies*, *G. Bone Health*, *H. Short-Term Illness & Recovery*, and *I. Special Life Stages*.
   - Evaluates multiple conditions together and surfaces competing nutritional considerations (e.g., *Diabetes + Chronic Kidney Disease*, *Hypertension + CKD*, *Anaemia + IBS*).
4. **Passwordless Household & Family Profiles (Module 4)**:
   - Uses a local browser convenience UUID token (`hh_<uuid>`) with no mandatory login.
   - Keeps immunological **allergies** strictly distinct from digestive **intolerances** and general preferences.
5. **Recipe & Meal Nutrition Calculator (Module 5)**:
   - Supports Indian household units (`100g`, `100ml`, `standard_serving`, `katori`, `cup`, `bowl`, `roti`, `piece`, `tbsp`, `tsp`) and reports nutrient completeness without treating missing ingredient values as zero.
6. **In-Memory Packaged Label OCR Scanner (Module 6)**:
   - Extracts FSSAI nutrition declarations, flags OCR typos (`52O` -> `520.0`), impossible values (`>100g/100g`), and per-serving vs. per-100g basis, and requires user confirmation. Uploaded images are processed strictly in RAM and purged immediately.
7. **Barcode Lookup & Open Food Facts Integration (Module 7)**:
   - Checks verified local catalog and Open Food Facts API with a clean manual/OCR fallback when a barcode is unlisted.
8. **Experimental Indian Dish Image Recognition (Module 8)**:
   - Processes meal photos in RAM only and returns multi-candidate suggestions with similarity scores, uncertainty labels, and mandatory user confirmation.
9. **2–4 Packaged Product Comparison (Module 9)** & **Personalised Meal Suggestions (Module 10)**.
10. **Complete 18-Page Responsive Frontend (Module 11)**.

---

## 2. Technology Stack

- **Backend**: Python 3.12/3.13, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, Pillow, httpx, Pytest
- **Database**: SQLite (default local) with PostgreSQL-ready ORM and migration layer
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
│   │   ├── db/ (session.py, init_db.py, seed_catalog.py, seed_foods_part1..4.py, seed_conditions.py, seed_rules.py)
│   │   ├── models/entities.py
│   │   ├── rules/guidance_engine.py
│   │   ├── schemas/api_schemas.py
│   │   ├── services/ (food_service.py, recipe_service.py, ocr_barcode_service.py, comparison_meals_service.py)
│   │   └── main.py
│   ├── migrations/
│   ├── tests/ (test_gharplate_api.py, test_e2e_user_journey.py)
│   ├── alembic.ini
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/ (Layout.tsx, UIWidgets.tsx)
│   │   ├── hooks/useHousehold.tsx
│   │   ├── pages/ (HomePages.tsx, ConditionPages.tsx, HouseholdPages.tsx, RecipePages.tsx, ScannerPages.tsx, ComparisonMealsPages.tsx, TrustPages.tsx)
│   │   ├── services/api.ts
│   │   ├── types/api.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── tests/ (setup.ts, App.test.tsx)
│   ├── package.json
│   └── Dockerfile
├── data/ (raw/, processed/, import_reports/latest_import_report.json)
├── scripts/seed_data.py
├── docs/ (ARCHITECTURE.md, API_CONTRACT.md, DATA_SOURCES.md, DATA_QUALITY.md, MEDICAL_SAFETY.md, PRIVACY.md, SECURITY.md, TESTING.md, DEPLOYMENT.md, FIGMA_INTEGRATION.md, PROJECT_STATUS.md)
├── .github/workflows/ (ci.yml, docker-publish.yml)
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## 4. Quickstart Instructions

### 1. Initialize & Seed Database
```bash
python3 scripts/seed_data.py
```

### 2. Start Backend API (`http://localhost:8000`)
```bash
cd backend
PYTHONPATH=. python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```
- OpenAPI / Swagger UI: `http://localhost:8000/docs`

### 3. Run Backend & E2E Tests
```bash
cd backend
PYTHONPATH=. python3 -m pytest -v tests/
```

### 4. Start Frontend Dev Server (`http://localhost:5173`)
```bash
cd frontend
npm install
npm run dev
```

### 5. Run with Docker Compose (`http://localhost:8080`)
```bash
cp .env.example .env
docker compose up --build
```
