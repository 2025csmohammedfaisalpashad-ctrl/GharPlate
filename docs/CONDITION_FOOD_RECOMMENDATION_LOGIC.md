# Condition-Aware Food Recommendation Logic (`ConditionFoodMapping` Architecture)

## 1. Root Cause of the Original Bug

### Symptom Observed
Opening the **Fever, Reduced Appetite & Short-Term Illness Recovery** (`fever_acute_recovery`) condition page displayed foods such as:
- `Apple`
- `Banana`
- `Biryani (Chicken Dum Biryani)` (`chicken-biryani`)

### Architectural Root Cause
Previously, `GET /api/v1/conditions/{code}/foods` in `backend/app/api/v1/router.py` selected foods solely by matching the food's broad `FoodCategory.slug` against `HealthCondition.relevant_food_groups`:

```python
# DEPRECATED / REMOVED FLAWED LOGIC:
foods = (
    db.query(FoodItem)
    .join(FoodCategory)
    .filter(FoodCategory.slug.in_(cond.relevant_food_groups))
    .order_by(FoodItem.name_en.asc())
    .all()
)
```

Why this failed:
1. `fever_acute_recovery` listed `indian-dishes` in `relevant_food_groups` because supportive convalescent preparations such as **Khichdi (Moong Dal & Rice)**, **Idli**, **Khara Pongal**, **Rasam**, and **Curd Rice** belong to the `indian-dishes` category.
2. However, **Chicken Biryani**, **Chole Bhature**, **Masala Dosa**, and **Paneer Butter Masala** also belong to `indian-dishes`.
3. Selecting every food in `indian-dishes` treated **broad food category membership** as equivalent to **condition-specific nutritional relevance**.
4. Furthermore, the endpoint ignored the active household member's `dietary_preference` (`vegetarian`, `vegan`, `eggetarian`, `non_vegetarian`, `jain`), `allergies`, and `intolerances`.

---

## 2. Database & Domain Architecture Replacement

To permanently eliminate category-dumping across all 24 health conditions, GharPlate now separates three distinct concepts in the relational schema (`backend/app/models/entities.py` and Alembic migration `backend/migrations/versions/0002_condition_food_mappings.py`):

### 2.1 Food Category (`food_categories`)
What broad culinary or botanical group a food belongs to (`cereals-millets`, `pulses-legumes`, `indian-dishes`, `fruits`, `dairy-alternatives`, etc.). Used for browsing the general Food Explorer — **never** as a standalone condition recommendation filter.

### 2.2 Structured Food Tags (`food_tags` & `food_item_tags`)
43 audited, domain-classified tags stored in `food_tags` and linked to individual foods via `food_item_tags`:
- `dietary_classification`: `vegetarian`, `vegan`, `eggetarian`, `non_vegetarian`, `gluten_free`, `contains_gluten`, `whole_grain`, `millet`, `packaged_food`
- `digestive_characteristic`: `gentle_digestive`, `fermented_probiotic`, `steamed_low_fat`, `hydrating`, `recovery_supportive`, `high_fodmap`, `acidic_food`
- `nutritional_characteristic`: `high_protein`, `high_fibre`, `calcium_rich`, `iron_rich`, `heme_iron_rich`, `vitamin_c_rich`, `b12_source`, `folate_rich`, `low_potassium`, `high_potassium`, `high_sodium`, `high_saturated_fat`, `contains_added_sugar`, `portion_sensitive_carb`, `high_oxalate`, `purine_rich`, etc.

### 2.3 Explicit Condition-Food Mappings (`condition_food_mappings`)
A food may appear in `GET /api/v1/conditions/{code}/foods` **only** if an explicit, active, reviewed row exists in `condition_food_mappings`:

| Column | Type | Purpose |
| :--- | :--- | :--- |
| `id` | `Integer` PK | Primary key |
| `condition_id` | `ForeignKey(health_conditions.id)` | Target health condition |
| `food_id` | `ForeignKey(food_items.id)` | Explicitly mapped food item |
| `relevance_category` | `String(60)` | `relevant_to_explore` (normalized in API as `relevant_food_to_explore`), `portion_sensitive`, `nutrient_to_monitor`, `individualised_advice_required`, or `insufficient_information` |
| `relevance_display_label` | `String(100)` | Human-readable educational badge (never `Safe`, `Unsafe`, `Allowed`, `Forbidden`, or `Cures`) |
| `explanation` | `Text` | Specific, evidence-based explanation of why this food appears for this condition |
| `relevant_nutrient_or_characteristic` | `String(255)` | Specific nutrients or digestive traits driving the mapping |
| `relevant_tags` | `JSON` (`list[str]`) | Condition-relevant tags highlighted on the card |
| `source_id` | `ForeignKey(data_sources.id)` | Linked authoritative source (`ICMR_NIN_DGI_2024`, `ICMR_NIN_IFCT_2017`, `ICMR_T2DM_2018`, `WHO_SUGARS_SODIUM`, `FSSAI_LABELLING_2020`, `KDIGO_CKD_NUTRITION`, etc.) |
| `source_section` | `String(200)` | Specific guideline section or IFCT code |
| `review_status` | `String(50)` | `reviewed`, `requires_research`, or `unreviewed` (only `reviewed` + `is_active=True` rows are returned by the API) |
| `applicability_limitations` | `Text` | Scope limits, red-flag reminders, and non-diagnostic disclaimers |
| `serving_consideration` | `String(255)` | Practical household portion guidance |
| `is_active` | `Boolean` | Enables/disables mapping without deleting audit history |

---

## 3. Seven-Step Recommendation & Personalisation Pipeline

Implemented in `backend/app/services/condition_food_service.py` (`get_condition_food_recommendations`):

1. **Verify Condition Exists**: Queries `HealthCondition` by `code` (returns HTTP `404` if unknown).
2. **Select Only Reviewed Mappings**: Queries `ConditionFoodMapping` where `condition_id == cond.id`, `is_active == True`, and `review_status == "reviewed"`. Unmapped foods (such as `chicken-biryani` under `fever_acute_recovery`) and unreviewed candidate rows (`review_status == "unreviewed"`) are never returned.
3. **Verify Nutritional Completeness & Preserve `NULL`**: Builds `nutrition_highlights` from `FoodNutrientValue`. Missing nutrients remain `None` (`null` in JSON, never replaced with `0`). If all relevant nutrients for a condition are missing, the item's `relevance_type` is automatically set to `insufficient_information`.
4. **Resolve Household Member Context**: Resolves optional `member_id` (or the household's `default_member_id` if `household_token` is provided) and optional `dietary_preference` override. If neither is provided, `member_context.personalised` is `false` and `member_context.dietary_preference` is `null` — the service never silently assumes a dietary preference.
5. **Apply Dietary Preference Filtering**:
   - `vegetarian`: Includes only foods where `is_vegetarian == True` and no egg, meat, poultry, or fish tags/allergens exist.
   - `vegan`: Includes only plant-based foods where `is_vegan == True`, `is_vegetarian == True`, and no dairy, milk, lactose, egg, meat, or fish tags/allergens exist.
   - `eggetarian`: Includes vegetarian foods plus egg items (`egg-poultry-whole`), while excluding meat, poultry flesh, and fish (`rohu-fish-freshwater`, `chicken-biryani`).
   - `non_vegetarian`: Includes all reviewed condition-mapped foods across vegetarian, eggetarian, and non-vegetarian categories (still strictly restricted to reviewed mappings for that condition).
   - `jain`: Includes vegetarian foods while excluding root vegetables (`potato`, `onion`, `garlic`, `carrot`).
6. **Attach Allergy, Intolerance & Incomplete-Ingredient Warnings**:
   - Matches member `allergies` against `food.allergen_tags` to populate `allergen_warnings`.
   - Matches member `intolerances` against `food.intolerance_tags` to populate `intolerance_warnings`.
   - Populates `incomplete_ingredient_warning` whenever `allergen_declaration_complete == False` or packaged `ingredients_text` is missing, stating clearly that GharPlate cannot verify absence of allergens.
7. **Return Structured Response (`ConditionFoodRecommendationResponse`)**: Returns `condition`, `member_context`, `total_reviewed_foods`, `empty_state_message`, `medical_disclaimer`, and `foods` ordered by relevance priority.

---

## 4. Handling Fever (`fever_acute_recovery`) & Other Conditions

### Fever (`fever_acute_recovery`)
- **Reviewed supportive foods returned**:
  - `khichdi-moong-dal-rice` (*Khichdi — Moong Dal & Rice*)
  - `idli-steamed-rice-lentil` (*Idli — Steamed Rice & Urad Lentil*)
  - `pongal-khara-ven-pongal` (*Khara Pongal — Moong Dal & Rice*)
  - `rasam-tomato-pepper` (*Tomato Pepper Rasam*)
  - `buttermilk-chaas` (*Buttermilk — Chaas / Majjige*)
  - `curd-rice-mosaranna` (*Curd Rice — Mosaranna*)
  - `banana-ripe` (*Banana, Ripe — Poovan / Robusta*)
  - `moong-dal-green-gram` (*Moong Dal — Green Gram Split*)
  - `egg-poultry-whole` (*Hen Egg, Whole* — included for `eggetarian`, `non_vegetarian`, or unfiltered requests; automatically excluded for `vegetarian`, `vegan`, and `jain` profiles)
- **Why Chicken Biryani is excluded from Fever**: `chicken-biryani` is a spiced, higher-fat layered feast preparation (8.6g fat/100g, 380mg sodium/100g) and has no reviewed `ConditionFoodMapping` for `fever_acute_recovery`. At the same time, `chicken-biryani` remains available in the general Food Explorer (`/api/v1/foods?q=Biryani`) and is never falsely labelled medically "unsafe" or "forbidden".

### How to Add and Review New Condition-Food Mappings Safely
1. Verify the candidate food's nutrient values in `food_nutrient_values` and tags in `food_item_tags`.
2. Add an entry in `backend/app/db/seed_condition_food_mappings.py` using `_m(...)` with:
   - An allowed `relevance_category` (`relevant_to_explore`, `portion_sensitive`, `nutrient_to_monitor`, `individualised_advice_required`, or `insufficient_information`).
   - A specific, non-diagnostic `explanation`, `applicability_limitations`, and `serving_consideration`.
   - A verified `source_code` and `source_section`.
   - Set `review_status="requires_research"` or `"unreviewed"` while under audit; promote to `review_status="reviewed"` only after source verification.
3. Run `python3 scripts/seed_data.py` and execute `PYTHONPATH=backend pytest -v backend/tests/test_condition_food_recommendations.py`.
