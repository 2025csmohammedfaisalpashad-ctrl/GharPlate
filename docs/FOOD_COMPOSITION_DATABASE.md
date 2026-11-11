# GharPlate Expanded Indian Food Composition Database (`docs/FOOD_COMPOSITION_DATABASE.md`)

## 1. Database Architecture & Core Tables
GharPlate's food composition layer is stored in relational SQLAlchemy models (`backend/app/models/entities.py`):

- **`DataSource`** (`data_sources`): Stores official citation metadata (`code`, `name`, `organization`, `publication_year`, `version`, `url`, `license_notes`, `source_type`).
- **`FoodCategory`** (`food_categories`): Classifies foods into 9 Indian food groups (`cereals-millets`, `pulses-legumes`, `vegetables`, `fruits`, `dairy`, `protein-sources`, `nuts-seeds`, `indian-dishes`, `packaged-foods`).
- **`NutrientDefinition`** (`nutrient_definitions`): Defines 65 canonical nutrients with `code`, `name`, `unit`, `category`, `is_core_11`, `display_order`, and `description`.
- **`FoodItem`** (`food_items`): Stores 127 Indian foods with `slug`, `name_en`, `name_vernacular`, `standard_serving_name`, `standard_serving_grams`, `is_vegetarian`, `is_vegan`, `is_packaged`, `allergen_tags`, and `primary_source_id`.
- **`FoodNutrientValue`** (`food_nutrient_values`): Stores per-100g/100ml nutrient values (`food_id`, `nutrient_code`, `value`, `basis`, `source_id`, `confidence`, `notes`).

---

## 2. Strict Scientific Integrity & `NULL` Preservation
1. **Unmeasured vs. Zero (`NULL` Integrity)**:
   - When a nutrient has not been analytically measured for a given food item (for example, specific trace minerals or amino acids on a packaged food label), `FoodNutrientValue.value` is stored as SQL `NULL` (`None` in Python).
   - **Zero (`0.0`) is stored only when the nutrient is biologically or analytically zero** (e.g., `vit_b12_mcg = 0.0` and `cholesterol_mg = 0.0` in unfortified plant foods).
   - Across the 127 seeded foods and 65 nutrients, the database tracks **5,839 known measured values** and **2,371 explicit `NULL` unmeasured values**, with `zero_replacement_for_missing = False`.
2. **Consistent Units**:
   - Every nutrient code uses one canonical unit across the entire database (`g`, `mg`, `mcg`, or `kcal`).
   - Vitamin A is standardized as Retinol Activity Equivalents (`vit_a_mcg`), Folate as Dietary Folate Equivalents (`folate_mcg`), and Vitamin D as `vit_d_mcg` (where `1 mcg = 40 IU`).

---

## 3. Raw vs. Cooked / Boiled / Prepared Indian Food States
Because cooking changes moisture content (`water_g`) and nutrient concentration per 100 g, GharPlate explicitly distinguishes raw dry ingredients from cooked/boiled states and prepared Indian dishes:

| Food Group | Raw / Uncooked Records | Cooked / Boiled / Prepared Records |
|---|---|---|
| **Cereals & Millets** | Raw Milled White Rice, Raw Brown Rice, Whole Wheat Flour (*Atta*), Ragi, Jowar, Bajra, Foxtail Millet, Little Millet (*Kutki*), Kodo Millet (*Kodon*), Barnyard Millet (*Sanwa*), Proso Millet (*Chena*), Barley (*Jau*), Dry Maize, Rolled Oats | Steamed White Rice (`rice-cooked-steamed`), Cooked Brown Rice (`brown-rice-cooked`), Karnataka Ragi Roti (`ragi-roti-karnataka`), Whole Wheat Phulka Roti, Plain Rava Upma, Vegetable Poha |
| **Pulses & Legumes** | Raw Toor Dal, Raw Moong Dal, Whole Green Gram (*Sabut Moong*), Kabuli Chana, Kala Chana (`black-chickpeas-kala-chana`), Rajma, Masoor Dal, Urad Dal, Horse Gram (*Kulthi*), Soya Chunks (`soya-chunks-textured-veg-protein`), Fresh Green Peas | Boiled Toor Dal (`toor-dal-cooked-boiled`), Boiled Moong Dal (`moong-dal-cooked-boiled`), Boiled Chickpeas (`chickpeas-boiled-cooked`), Boiled Rajma (`rajma-cooked-boiled`), Dal Tadka, Chole Chickpea Masala (`chole-chickpea-masala`), Rajma Masala (`rajma-masala-curry`), Sambar, Moong Dal Khichdi |
| **Leafy Greens & Vegetables** | Spinach (*Palak*), Amaranth Leaves (*Chaulai*), Fenugreek Leaves (*Methi*), Curry Leaves (*Kadi Patta*), Coriander Leaves (*Dhania*), Moringa Leaves (*Murungai Keerai*), Broccoli, Beetroot, Sweet Potato, Yellow Pumpkin, Bitter Gourd (*Karela*), UV-Exposed Button Mushroom, Okra, Carrot, Tomato, Potato, Onion, Cauliflower, Brinjal, Bottle Gourd | Palak Paneer, Aloo Gobi, Baingan Bharta |
| **Dairy, Eggs, Fish & Meat** | Whole Cow Milk, Fortified Cow Milk (`milk-cow-fortified-vit-d`), Whole Buffalo Milk (`milk-buffalo-whole`), Cow Curd (*Dahi*), Strained Greek Curd (`yogurt-greek-strained`), Paneer, Chaas, Cow Ghee, Raw Chicken Breast, Fresh Rohu Fish, Indian Oil Sardines (*Mathi*), Indian Mackerel (*Bangda*), Skipjack Tuna | Boiled Whole Poultry Egg (`egg-poultry-whole-boiled`), Egg Bhurji, Grilled Chicken Tikka |
