# Field-Level Data Provenance & Conflict Resolution (`docs/DATA_PROVENANCE.md`)

## 1. Database Schema for Provenance & Conflicts

Added in `backend/app/models/entities.py` and Alembic migration `backend/migrations/versions/0003_product_provenance_and_cache.py`:

### 1.1 `product_field_provenance` (`ProductFieldProvenance`)
Tracks the exact origin of individual product fields (`image_url`, `net_quantity`, `ingredients_text`, `allergen_tags`, and each nutrient code such as `energy_kcal`, `protein_g`, `sodium_mg`):
- `food_id`: Foreign key to `food_items.id`
- `field_name`: Field or nutrient identifier
- `field_type`: `metadata`, `ingredient`, `allergen`, `nutrient`, or `image`
- `field_value`: Recorded value
- `source_code` & `source_name`: e.g., `USER_VERIFIED_LABEL`, `OPEN_FOOD_FACTS`, `USDA_FDC`, `ICMR_NIN_IFCT_2017`
- `source_url` & `source_record_id`: Direct URL and external record/GTIN identifier
- `confidence_status`: `user_confirmed`, `external_verified_barcode`, `ocr_extracted`, `verified_ifct`, `fdc_supplemental`
- `review_status`: `confirmed`, `auto_merged_missing`, or `pending_user_review`
- `retrieved_at`: UTC timestamp

### 1.2 `product_data_conflicts` (`ProductDataConflict`)
Whenever an external lookup returns a value that conflicts with an existing local value (or a mismatched product title for the same barcode), GharPlate **never silently overwrites** the local value. Instead, it logs a row in `product_data_conflicts`:
- `food_id`: Foreign key to `food_items.id`
- `field_name`: Conflicting field (`product_identity`, `ingredients_text`, or nutrient code)
- `local_value` & `local_source`
- `external_value`, `external_source`, & `external_source_url`
- `resolution_status`: `requires_user_review`, `kept_local`, or `accepted_external`
- `detected_at`: UTC timestamp

---

## 2. Precedence & Merge Policy

1. **User-Confirmed Physical Package Data Takes Highest Precedence**:
   - Existing user-confirmed fields (such as the ingredient declaration on `Pineapple Cake — Winkles`, `8906005618726`) are preserved and never overwritten by external providers.
2. **Verified Exact-Barcode External Records Fill Only Missing (`NULL`) Fields**:
   - After `verify_product_identity_match()` confirms that the external record has the same barcode and compatible brand/product identity, missing `image_url`, `net_quantity`, and `NULL` nutrient rows are populated with `review_status="auto_merged_missing"`.
3. **Never Average Across Sources**:
   - GharPlate never averages nutrient values from two different databases. Each nutrient value points to a single explicit `DataSource` and `ProductFieldProvenance` record.
4. **Inspecting Provenance via API & UI**:
   - Endpoint: `GET /api/v1/products/{slug}/provenance`
   - UI: Displayed in the **Field-Level Data Provenance & Multi-Source Audit Trail** section on `/foods/{slug}`.
