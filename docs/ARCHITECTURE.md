# GharPlate Architecture, Database Schema & Rules Engine

## 1. System Overview

GharPlate is built as a modular monolith with strict separation between data provenance, deterministic clinical rule evaluation, REST API contracts, and the React + TypeScript frontend:

```text
[React 18 + TypeScript + Tailwind SPA]
               │
               ▼  REST / JSON (/api/v1/*)
[FastAPI Application Layer (app/api/v1/router.py)]
               │
   ┌───────────┼────────────────────────────┬───────────────────────────┐
   ▼           ▼                            ▼                           ▼
[Food &     [Deterministic Condition     [Recipe & Unit             [In-Memory OCR,
 Alias       Guidance & Conflict          Conversion                 Barcode & Dish
 Service]    Rules Engine]                Calculator]                Recognition]
   │           │                            │                           │
   └───────────┴────────────────────────────┴───────────────────────────┘
               │
               ▼  SQLAlchemy 2.0 ORM + Alembic Migrations
[SQLite Local Database (PostgreSQL-ready via DATABASE_URL)]
```

---

## 2. Relational Database Schema

All models are defined in `backend/app/models/entities.py` and managed via Alembic (`backend/migrations/`):

| Table | Primary Purpose | Key Columns & Constraints |
|---|---|---|
| `data_sources` | Provenance registry for every food record and clinical rule | `id`, `code` (UNIQUE), `name`, `organization`, `document_title`, `publication_year`, `version`, `url`, `license_notes`, `source_type` |
| `food_categories` | 9 mandatory Indian food categories | `id`, `slug` (UNIQUE), `name`, `description`, `display_order` |
| `food_items` | Core food & packaged product records | `id`, `slug` (UNIQUE), `ifct_code`, `name_en`, `category_id` (FK), `is_packaged`, `brand`, `barcode` (UNIQUE), `default_basis`, `standard_serving_name`, `standard_serving_grams`, `is_vegetarian`, `is_vegan`, `allergen_tags` (JSON), `intolerance_tags` (JSON), `dietary_tags` (JSON), `ingredients_text`, `allergen_declaration_complete`, `source_id` (FK), `confidence_level` |
| `food_aliases` | Searchable English, Hindi & Kannada aliases | `id`, `food_id` (FK), `language` (`en`, `hi`, `kn`), `alias_text`, `normalized_text` (indexed), `script_text` |
| `nutrient_definitions` | 20 macro- and micro-nutrient definitions | `id`, `code` (UNIQUE), `name`, `unit`, `category`, `display_order` |
| `food_nutrient_values` | Per-100g/100ml nutrient values (`NULL` when unknown) | `id`, `food_id` (FK), `nutrient_code` (FK), `value` (` FLOAT NULLABLE` — **never 0 for missing**), `basis`, `source_id` (FK), `confidence_status` |
| `serving_conversions` | Household unit conversions (`100g`, `katori`, `cup`, `roti`, `piece`, `tbsp`, `tsp`) | `id`, `food_id` (FK), `unit_name`, `unit_label`, `grams_equivalent`, `is_default`, `conversion_source` |
| `health_conditions` | 24 supported conditions across Groups A–I | `id`, `code` (UNIQUE), `name`, `condition_group_code`, `is_short_term_illness`, `is_special_life_stage`, `applicable_age_groups` (JSON), `nutritional_meaning`, `relevant_nutrients` (JSON), `evidence_dietary_patterns`, `portion_considerations`, `individual_differences`, `professional_advice_circumstances`, `red_flag_warning`, `what_evidence_does_not_establish`, `source_id` (FK) |
| `nutrition_rules` | Deterministic evaluation rules separated from business logic | `id`, `rule_code` (UNIQUE), `condition_id` (FK), `nutrient_code`, `comparison_operator`, `threshold_low`, `threshold_high`, `evaluation_basis`, `educational_category`, `relevance_level`, `explanation`, `applicability_limitations`, `evidence_status`, `source_section`, `publication_year`, `source_id` (FK) |
| `condition_conflict_rules` | Competing multi-condition interaction matrix | `id`, `conflict_code` (UNIQUE), `condition_a_code`, `condition_b_code`, `competing_domain`, `conflict_explanation`, `why_conflict_exists`, `professional_guidance_notice`, `source_id` (FK) |
| `households` | Passwordless household record keyed by browser UUID token | `id`, `household_token` (UNIQUE), `name`, `default_member_id`, `privacy_notice_accepted` |
| `household_members` | Family member profiles | `id`, `household_id` (FK), `display_name`, `age_group`, `dietary_preference`, `selected_conditions` (JSON), `allergies` (JSON), `intolerances` (JSON) |
| `recipes` & `recipe_ingredients` | Saved recipes and ingredient quantities | `id`, `household_token`, `title`, `servings`, `meal_type`, `food_id` (FK), `quantity`, `unit_name`, `grams_equivalent` |

---

## 3. Deterministic Rules Engine Architecture (`app/rules/guidance_engine.py`)

1. **Strict Separation of Rules & Code**: Clinical thresholds and educational explanations live in `nutrition_rules` and `condition_conflict_rules` linked to `data_sources`, never hardcoded in UI components.
2. **Prohibited vs. Allowed Categories**: The engine enforces an allowlist of 7 educational categories (`Nutritionally relevant`, `Portion-sensitive`, `Nutrient to monitor`, `May require individualised advice`, `Limited evidence available`, `Insufficient nutritional information`, `Potential allergen concern`) and forbids simplistic labels (`Safe`, `Unsafe`, `Allowed`, `Forbidden`, `Cures`).
3. **Multi-Condition Conflict Resolution**: When a profile selects 2+ conditions (e.g., `type_2_diabetes` + `chronic_kidney_disease`, or `hypertension` + `chronic_kidney_disease`), the engine queries `condition_conflict_rules`, surfaces the competing physiological mechanism, and marks `requires_professional_guidance = True`.
4. **Life-Stage & Pediatric Guardrails**: Adult metabolic thresholds are blocked from applying to `child` or `adolescent` profiles, triggering a mandatory pediatric safety observation.
