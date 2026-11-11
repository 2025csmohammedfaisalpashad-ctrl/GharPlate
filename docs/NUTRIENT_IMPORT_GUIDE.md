# Nutrient Database Ingestion & Validation Guide (`docs/NUTRIENT_IMPORT_GUIDE.md`)

## 1. Controlled Ingestion Architecture
GharPlate provides a repeatable, transactional CLI utility (`backend/app/db/nutrient_import_cli.py`) and idempotent seed pipeline (`backend/app/db/init_db.py` + `backend/app/db/seed_expanded_nutrients_and_foods.py`) to validate and import nutrient definitions, data sources, new Indian food records, and micronutrient enrichments.

### Key Safety Guarantees
1. **Pre-Ingestion Validation (`validate_seed_catalog_integrity`)**:
   - Verifies that every nutrient code in every food item's `nutrients_per_100` dictionary is a registered canonical code in `NutrientDefinition` (65 nutrients).
   - Verifies that every `source_code` and `category_slug` maps to a valid `DataSource` and `FoodCategory`.
   - Rejects negative numbers or non-numeric strings while explicitly preserving `None` (`NULL`) for unmeasured nutrients.
   - Detects and skips any duplicate food slugs without corrupting existing records.
2. **Idempotent Upsert Execution**:
   - Re-running the import script never duplicates `DataSource`, `NutrientDefinition`, `FoodItem`, `FoodAlias`, or `FoodNutrientValue` rows.
   - Existing food items (`64` base foods) are enriched in-place with newly tracked vitamins, trace minerals, amino acids, fibre fractions, and fatty acids without overwriting user-created recipes or food logs.

---

## 2. Running the Ingestion CLI

### A. Validate Only (`--validate-only`)
Runs precheck validation against the seed catalog without writing to the database:
```bash
cd backend
./.venv/bin/python -m app.db.nutrient_import_cli --validate-only
```

### B. Full Transactional Import & Coverage Report
Creates/updates all tables, runs `seed_database(db)`, and outputs a JSON report with `precheck`, `seed_report`, and `coverage_summary` (or writes to a file via `--output-json`):
```bash
cd backend
./.venv/bin/python -m app.db.nutrient_import_cli
```

---

## 3. Adding New Foods or Nutrients
1. **Adding a New Nutrient**:
   - Add the tuple `(code, name, unit, category, is_core_11, display_order, description)` to `EXPANDED_NUTRIENT_DEFINITIONS_SEED` in `backend/app/db/seed_expanded_nutrients_and_foods.py`.
   - Add its explorer group, aliases, ICMR-NIN RDA 2020 note, and bioavailability note to `NUTRIENT_ENRICHED_METADATA` in `backend/app/services/nutrient_food_search_service.py`.
2. **Adding a New Indian Food**:
   - Add a food dictionary to `EXPANDED_FOOD_ITEMS_SEED` in `backend/app/db/seed_expanded_nutrients_and_foods.py` with `slug`, `name_en`, `name_vernacular`, `category_slug`, `source_code`, `standard_serving_name`, `standard_serving_grams`, `is_vegetarian`, `is_vegan`, `is_packaged`, `aliases`, `tags`, and `nutrients_per_100`.
   - Leave any unmeasured nutrient omitted or set to `None` so it is stored as `NULL` in SQLite/PostgreSQL.
   - Re-run `./.venv/bin/python -m app.db.nutrient_import_cli` to validate and ingest.
