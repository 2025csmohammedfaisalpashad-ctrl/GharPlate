# Health Report & Shared Nutrient Search Integration (`docs/HEALTH_REPORT_NUTRIENT_INTEGRATION.md`)

## 1. Shared Backend Service Architecture
Both the **Nutrient Explorer** (`/nutrient-explorer`) and the **Health Reports Lab-to-Plate** engine (`/health/reports`) use the same shared backend service:

- **Service Module**: `backend/app/services/nutrient_food_search_service.py`
  - `resolve_nutrient_query(db, query)`: Resolves canonical codes, nutrient names, and clinical aliases (`Vit D`, `25-OH Vitamin D`, `B12`, `Cobalamin`, `Folate`, `Iron`, `Calcium`, `Fibre`, `Protein`, etc.).
  - `search_foods_by_nutrient(db, nutrient_query, dietary_preference, food_form, category_slug, sort_by, limit)`: Queries `FoodItem` + `FoodNutrientValue` (filtering `value IS NOT NULL AND value > 0`), applies household dietary preference and food-form filters, computes per-serving and per-100 kcal nutrient density, and returns ranked Indian foods with source provenance.

---

## 2. How Health Reports (`_retrieve_verified_foods_for_marker`) Uses the Shared Engine
In `backend/app/services/health_report_symptom_service.py`:
1. When a user confirms a laboratory report with an out-of-range marker (such as low **Haemoglobin**, low **Serum Ferritin**, low **Serum Iron**, low **Vitamin B12**, low **25-OH Vitamin D**, low **Serum Folate**, low **Serum Calcium**, elevated **Fasting Blood Glucose / HbA1c**, or elevated **LDL Cholesterol / Triglycerides**), `_retrieve_verified_foods_for_marker` inspects `meta["food_nutrient_focus"]["primary_nutrient_codes"]`.
2. It invokes `search_foods_by_nutrient(db, nutrient_query=primary_codes[0], dietary_preference=shared_diet, food_form="natural", sort_by="per_100g_desc")` from `app.services.nutrient_food_search_service` to pull top-ranked Indian whole foods and dishes directly from the expanded 127-food database alongside curated household staples.
3. **Clinical & Dietary Safety Guardrails Preserved**:
   - **Kidney & Electrolyte Safety Block**: If any renal or electrolyte marker (`serum_creatinine`, `egfr`, `blood_urea`, `serum_potassium`, `serum_sodium`, `uric_acid`) is abnormal, automatic high-potassium, high-phosphorus, or high-protein food cards are paused (`recommended_foods = []`) and a clinician review notice is displayed.
   - **Dietary Preference & Allergen Filtering**: Vegetarian and vegan member profiles automatically exclude non-vegetarian foods. For vegan members with low Vitamin B12, dairy options carry an explicit `dietary_mismatch_note` explaining that unfortified plant foods lack Vitamin B12 and advising clinician-guided supplementation.
   - **Vitamin D Honesty**: Only foods with non-null, positive `vit_d_mcg` values in the database (such as *UV-Exposed Button Mushroom*, *FSSAI-Fortified Cow Milk*, *Whole Paneer*, *Cow Ghee*, or *Boiled Egg / Fish* when compatible with diet) are labelled as containing Vitamin D, alongside calcium-rich Indian foods (*Ragi*, *Curd*, *Sesame Seeds*) that support bone health.
