# Multi-Source Food & Packaged-Product Data Integration (`docs/PRODUCT_DATA_INTEGRATION.md`)

## 1. Architecture Overview

GharPlate combines four distinct, legally usable nutrition and product intelligence sources inside `backend/app/integrations/` so Indian whole foods, cooked household dishes, and retail packaged products are handled with source transparency and strict scientific boundaries:

| Source Tier | Module | Purpose & Scope | Licence & Attribution |
| :--- | :--- | :--- | :--- |
| **Source A — Open Food Facts** | `backend/app/integrations/open_food_facts.py` | Primary external source for barcode-based packaged-food discovery (`API v3` product lookup at `/api/v3/product/{barcode}.json` + `v2` search adapter). Retrieves front-of-package images, ingredients, allergen tags, serving size, quantity, and declared nutrients. | Open Database License (`ODbL 1.0`); product images `CC BY-SA 3.0`. |
| **Source B — USDA FoodData Central** | `backend/app/integrations/food_data_central.py` | Supplemental generic food-composition and branded GTIN lookup (`https://api.nal.usda.gov/fdc/v1`). Configured via optional `FDC_API_KEY`. | `CC0 1.0` Public Domain (USDA Agricultural Research Service). |
| **Source C — Indian Official Food Composition** | `backend/app/db/seed_foods_*.py` | Core Indian whole foods, regional aliases (English, Hindi, Kannada), and standardized household recipes from ICMR-NIN IFCT 2017 & Dietary Guidelines for Indians 2024. | Public Government Scientific Reference (attributed per item). |
| **Source D — External Web Search Adapter** | `backend/app/integrations/web_search.py` | Configurable web search adapter (`Brave Search` or `Tavily`) for retrieving external web links when local and structured product databases do not contain an item. | Original URLs, titles, retrieval dates, and provider names preserved. |

---

## 2. Strict Data Integrity Rules

1. **Never Fill Packaged Product Nutrients from Generic Foods**:
   A branded packaged food (such as *Pineapple Cake — Winkles*, barcode `8906005618726`) is never populated using generic food composition values (such as raw pineapple or generic sponge cake). Packaged products may only be enriched from:
   - An exact barcode (`GTIN`/`EAN`/`UPC`) match verified to be the same product and brand, or
   - A user-confirmed physical package nutrition label (via OCR or manual entry).
2. **Missing Values Remain `NULL`**:
   Unmeasured or undeclared nutrients are stored as `NULL` (`None` in Python, `null` in JSON) — never `0`.
3. **Persistent SQLite Caching & Polite Rate Limiting (`backend/app/integrations/cache.py`)**:
   - External lookups are cached in the `external_lookup_cache` table (`PRODUCT_CACHE_HOURS=168` by default) so GharPlate never hammers remote APIs with duplicate requests for the same barcode or query.
   - Outbound provider calls enforce a minimum interval (`EXTERNAL_PROVIDER_MIN_INTERVAL_SECONDS=0.5`) and send a transparent `User-Agent` header (`GharPlate/2.0`).

---

## 3. Integration Status & Configuration

- **Works Out of the Box (Zero API Keys Required)**:
  - Local ICMR-NIN IFCT 2017 & DGI 2024 catalog (78 foods & packaged records, 24 conditions, 103 reviewed condition-food mappings).
  - Open Food Facts API v3 barcode lookup and product search (`ENABLE_EXTERNAL_BARCODE_LOOKUP=true`).
- **Requires Optional Free API Key**:
  - **USDA FoodData Central**: Set `FDC_API_KEY=<your_key>` in `.env` (free signup at `https://fdc.nal.usda.gov/api-key-signup.html`). When unconfigured, GharPlate reports `status: "unconfigured_api_key"` in `provider_attempts` and continues normally.
  - **External Web Search**: Set `ENABLE_EXTERNAL_WEB_SEARCH=true`, `WEB_SEARCH_PROVIDER=brave` (with `BRAVE_SEARCH_API_KEY`) or `WEB_SEARCH_PROVIDER=tavily` (with `TAVILY_API_KEY`) in `.env`.
