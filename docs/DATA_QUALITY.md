# GharPlate Data Quality & Completeness Report (`docs/DATA_QUALITY.md`)

## 1. Ingestion Summary (`data/import_reports/latest_import_report.json`)

| Metric | Verified Count |
|---|---|
| Authoritative Data Sources | 9 |
| Food Categories | 9 |
| Total Seeded Food Items | 75 |
| Searchable Multilingual Aliases (English, Hindi, Kannada) | 528 |
| Supported Health Conditions (Groups A–I) | 24 |
| Deterministic Nutrition Rules | 33 |
| Multi-Condition Conflict Rules | 5 |
| Known Measured Nutrient Values | 1,373 |
| Explicit `NULL` (Unmeasured / Undeclared) Nutrient Values | 127 |
| Missing Values Replaced with Zero | **0 (`False`)** |

## 2. Strict `NULL` vs. Zero Integrity Policy

- **Raw Whole Foods**: In ICMR-NIN IFCT 2017, Vitamin D2/D3 is unmeasured or below detection in many unfortified plant foods unless specifically assayed (such as ergonomics in certain millets/mushrooms). Unmeasured values are stored as SQL `NULL` (`None` in Python, `null` in JSON) and displayed as `NULL (Unknown)` in the UI.
- **Packaged Foods**: Under FSSAI Labelling and Display Regulations 2020, mandatory back-of-pack declarations cover Energy, Protein, Total Carbohydrates, Total Sugars, Added Sugars, Total Fat, Saturated Fat, Trans Fat, Cholesterol, and Sodium. Micronutrients such as Potassium, Magnesium, Phosphorus, Folate, Vitamin A, Vitamin C, Vitamin D, and Vitamin B12 are frequently not declared on commercial biscuit, chip, noodle, or beverage labels. GharPlate stores all undeclared packaged nutrients as `NULL` and reports exact completeness percentages (e.g., `45% complete` for glucose biscuits).
- **Recipe Calculations**: When a recipe combines whole foods with packaged foods that have `NULL` micronutrients, `recipe_service.py` sums known ingredient contributions while flagging `is_complete = False` and listing the exact ingredients missing that nutrient.
