# GharPlate — Interactive 3D Human Body & Nutrition Explorer

## Overview

The **Interactive 3D Human Body & Nutrition Explorer** (`/explore/body-nutrition`, accessible under `Explore -> Body & Nutrition` in the left sidebar) allows users to rotate, zoom, hover, and select anatomical regions on a 3D human model (or switch to a 2D accessible anatomical diagram) to learn how evidence-based nutrients and real Indian foods nourish each organ system.

## Anatomical Regions Covered

1. **Brain & Nervous System (`brain_nerves`)** — Vitamin B12, Folate, Iron, Omega-3 ALA, Complex Carbohydrates
2. **Eyes & Vision (`eyes_vision`)** — Vitamin A & Beta-Carotene, Lutein & Zeaxanthin, Vitamin C, Zinc
3. **Heart & Cardiovascular System (`heart_cardiovascular`)** — Soluble Fibre, Potassium, Magnesium, Unsaturated Fats
4. **Bones, Teeth & Joints (`bones_joints`)** — Calcium, Phosphorus, Magnesium, Protein
5. **Muscles & Physical Strength (`muscles_strength`)** — Dietary Protein, Potassium, Magnesium, Iron, Carbohydrates
6. **Digestive System & Gut Health (`digestive_gut`)** — Dietary Fibre, Fermented Foods, Hydration
7. **Blood & Oxygen Transport (`blood_circulation`)** — Iron, Folate (B9), Vitamin B12, Vitamin C (non-haem iron enhancer)
8. **Skin, Hair & Epithelial Tissue (`skin_epithelial`)** — Protein, Vitamin A, Vitamin C, Zinc, Healthy Fats
9. **Immune System & Defence (`immune_defence`)** — Protein, Vitamin A, Vitamin C, Zinc, Iron, Folate

## Scientific & Data Integrity Rules

- Every recommended food is linked directly to an existing `FoodItem` in the GharPlate database.
- Nutrient values are queried live from `FoodNutrientValue` (ICMR-NIN IFCT 2017); missing values remain `NULL` and are never fabricated or converted to `0`.
- All descriptions are strictly educational and grounded in ICMR-NIN IFCT 2017, ICMR-NIN Dietary Guidelines for Indians 2024, WHO, AHA, and MoHFW Anemia Mukt Bharat.
