# GharPlate Nutrient Explorer (`docs/NUTRIENT_EXPLORER.md`)

## 1. Overview & User Journey
The **Nutrient Explorer** (`/nutrient-explorer`) enables household members, clinicians, and nutrition researchers to search directly for any vitamin, mineral, essential amino acid, dietary fibre fraction, fatty acid, or bioactive component and immediately discover the Indian foods that contain it.

- **Navigation Location**: Left Sidebar → **Explore** → **🧬 Nutrient Explorer** (`/nutrient-explorer`)
- **Primary Page Heading**: **"What Nutrient Are You Looking For?"**
- **Subtitle**: *"Explore Indian foods by their vitamin, mineral and nutritional composition."*
- **Search Input**: Supports canonical nutrient names, chemical names, and common clinical aliases (e.g., `Vit D`, `Calciferol`, `D3`, `Cholecalciferol`, `B12`, `Cobalamin`, `Folate`, `Folic Acid`, `Vitamin B9`, `Ascorbic Acid`, `Fe`, `Ca`, `Leucine`, `Omega-3`).

---

## 2. Six Structured Nutrient Category Tabs
Users can browse 65 tracked nutrients across six structured tabs:

| Category Tab | Group Code | Tracked Nutrients (65 Total) |
|---|---|---|
| **Vitamins** | `vitamins` | Vitamin A (RAE), Retinol, Beta-Carotene, Vitamin B1 (Thiamine), Vitamin B2 (Riboflavin), Vitamin B3 (Niacin), Vitamin B5 (Pantothenic Acid), Vitamin B6 (Pyridoxine), Vitamin B7 (Biotin), Vitamin B9 (Dietary Folate), Vitamin B12 (Cobalamin), Vitamin C (Ascorbic Acid), Vitamin D (Total), Vitamin D2 (Ergocalciferol), Vitamin D3 (Cholecalciferol), Vitamin E (Alpha-Tocopherol), Vitamin K (Total), Vitamin K1 (Phylloquinone), Vitamin K2 (Menaquinone) |
| **Minerals** | `minerals` | Iron (Fe), Calcium (Ca), Magnesium (Mg), Zinc (Zn), Potassium (K), Sodium (Na), Phosphorus (P), Selenium (Se), Iodine (I), Copper (Cu), Manganese (Mn), Chromium (Cr), Molybdenum (Mo) |
| **Protein and Amino Acids** | `protein_amino` | Total Protein, Leucine (BCAA), Isoleucine (BCAA), Valine (BCAA), Lysine, Methionine, Phenylalanine, Threonine, Tryptophan, Histidine, Glycine, Glutamic Acid |
| **Carbohydrates and Fibre** | `carbs_fibre` | Total Carbohydrate, Available Carbohydrate, Starch, Total Sugars, Added Sugars, Total Dietary Fibre, Soluble Dietary Fibre, Insoluble Dietary Fibre |
| **Fats and Essential Fatty Acids** | `fats_fatty_acids` | Total Fat, Saturated Fat, Monounsaturated Fat (MUFA), Polyunsaturated Fat (PUFA), Trans Fat, Omega-3 Fatty Acids (ALA + EPA + DHA), Omega-6 Fatty Acids (Linoleic Acid) |
| **Other Nutritional Components** | `other_components` | Energy (kcal), Total Choline, Dietary Cholesterol, Water / Moisture Content, Total Organic Acids, Lutein + Zeaxanthin |

---

## 3. Clean, Uncluttered Food Result Cards
To prevent visual overload, every food card in the Nutrient Explorer grid displays **only four essential elements**:
1. **Food image** (verified local WebP asset with automatic category fallback)
2. **Food name** (e.g., *UV-Exposed Button Mushroom (Khumb)*, *Amaranth Leaves (Chaulai)*, *Ragi (Finger Millet, Whole)*)
3. **Selected nutrient amount** (e.g., `Vitamin D (Total): 18.5 mcg per 100 g` or per standard household serving when ranked by serving)
4. **`View Details →`** link navigating directly to `/foods/:slug` for full 65-nutrient breakdown, portion calculator, health condition suitability, and source provenance.

---

## 4. Ranking, Dietary Filtering & Food Form Controls
- **Dietary Filters**: `All Diets`, `Vegetarian`, `Vegan`, `Eggetarian`, `Non-Vegetarian` (plus a 1-click button to apply the active household member's saved dietary preference).
- **Food Form Filters**: `All Forms`, `Natural Whole Foods & Dishes`, `Raw / Uncooked Ingredients`, `Cooked / Boiled / Steamed`, `Prepared Indian Dishes`, `Fortified Foods`, `Packaged Products`.
- **Ranking Modes**:
  - `per_100g_desc`: Highest nutrient amount per 100 g / 100 ml edible portion (default)
  - `per_serving_desc`: Highest nutrient amount per standard Indian household serving (*katori*, *roti*, *glass*, *piece*)
  - `density_per_100kcal_desc`: Highest nutrient density per 100 kcal
  - `name_asc`: Alphabetical order (A → Z)

---

## 5. Contextual Ask GharPlate AI Integration
The Nutrient Explorer publishes its active nutrient context (`selected_entity.type = 'nutrient'`, ICMR-NIN RDA 2020 note, bioavailability note, and top ranked Indian foods) to the **Ask GharPlate AI** workspace via `usePublishAssistantContext`. Users can click **Ask GharPlate AI about [Nutrient]** to ask follow-up questions about meal combinations, cooking retention, and absorption enhancers.
