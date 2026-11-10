# Anatomy-to-Nutrition Data Mapping & Provenance (`ANATOMY_NUTRITION_DATA.md`)

## 1. Scientific & Clinical Grounding Principles

Every anatomical structure in GharPlate's **3D Human Body & Nutrition Explorer** (`/api/v1/explore/body-nutrition` and `/api/v1/explore/body-nutrition/{region_code}`) is mapped to:
1. **Established Physiological Functions**: Grounded in [ICMR-NIN Dietary Guidelines for Indians (2024)](https://www.nin.res.in/dietaryguidelines/pdfjs/locale/DGI07052024P.pdf) and [WHO Healthy Diet Fact Sheet](https://www.who.int/news-room/fact-sheets/detail/healthy-diet).
2. **Verified Indian Food Sources**: Linked directly to `FoodItem` and `FoodNutrientValue` rows in GharPlate's database with real per-100g and per-serving nutrient values from the [ICMR-NIN Indian Food Composition Tables (IFCT 2017)](https://www.nin.res.in/ebooks/IFCT2017.pdf).
3. **Strict Non-Diagnostic Language**: All explanations describe how nutrients *support normal physiological function* and explicitly state what nutrition cannot replace (e.g., refractive correction, ophthalmic care, dialysis, or prescribed endocrine therapy).

---

## 2. Complete 12-Region Anatomy-to-Nutrient-to-Food Matrix

| Region Code | Anatomical Structure | Layer ID | FMA ID | Key Tracked Nutrients | Verified Indian Foods (IFCT 2017 Slugs) |
|---|---|---|---|---|---|
| `brain_nerves` | Brain & Nervous System | `brain_nervous` | `FMA:50801` | Folate (`folate_ug`), Vitamin B12 (`vitamin_b12_ug`), Iron (`iron_mg`), Magnesium (`magnesium_mg`) | `walnut-akhrot`, `spinach-palak`, `curd-dahi-cow-milk`, `egg-hen-whole-boiled`, `ragi-finger-millet`, `chana-bengal-gram-whole` |
| `eyes_vision` | Eyes & Vision | `sensory_immune` | `FMA:54448` | Vitamin A / Beta-Carotene (`vitamin_a_ug`), Vitamin C (`vitamin_c_mg`), Zinc (`zinc_mg`) | `spinach-palak`, `carrot-orange`, `amla-indian-gooseberry`, `egg-hen-whole-boiled`, `pumpkin-yellow` |
| `heart_cardiovascular` | Heart & Cardiovascular System | `cardiovascular` | `FMA:7088` | Dietary Fibre (`fibre_g`), Potassium (`potassium_mg`), Magnesium (`magnesium_mg`), Sodium Moderation (`sodium_mg`) | `oats-rolled`, `walnut-akhrot`, `banana-ripe`, `rajma-red-kidney-beans`, `spinach-palak`, `toor-dal-arhar` |
| `respiratory_lungs` | Lungs & Respiratory System | `respiratory` | `FMA:7195` | Vitamin C (`vitamin_c_mg`), Vitamin A (`vitamin_a_ug`), Magnesium (`magnesium_mg`), Iron (`iron_mg`) | `amla-indian-gooseberry`, `guava-white-fleshed`, `spinach-palak`, `carrot-orange`, `almonds-badam` |
| `bones_joints` | Bones, Skeleton & Joints | `skeletal` | `FMA:23881` | Calcium (`calcium_mg`), Phosphorus (`phosphorus_mg`), Magnesium (`magnesium_mg`), Protein (`protein_g`) | `ragi-finger-millet`, `paneer-cottage-cheese`, `curd-dahi-cow-milk`, `sesame-seeds-til-white`, `soybean-whole-dry` |
| `muscles_strength` | Skeletal Muscle & Strength | `muscular` | `FMA:30316` | Protein (`protein_g`), Potassium (`potassium_mg`), Magnesium (`magnesium_mg`), Energy (`energy_kcal`) | `soya-chunks-textured-veg-protein`, `paneer-cottage-cheese`, `moong-dal-green-gram-split`, `egg-hen-whole-boiled`, `chicken-breast-skinless`, `chana-bengal-gram-whole` |
| `digestive_gut` | Stomach, Gut & Microbiome | `digestive` | `FMA:7148` | Dietary Fibre (`fibre_g`), Vitamin B12 (`vitamin_b12_ug`), Folate (`folate_ug`) | `curd-dahi-cow-milk`, `idli-steamed-rice-lentil`, `khichdi-moong-dal-rice`, `guava-white-fleshed`, `oats-rolled`, `banana-ripe` |
| `urinary_kidneys` | Kidneys & Renal Balance | `urinary_renal` | `FMA:7203` | Sodium Moderation (`sodium_mg`), Potassium (`potassium_mg`), Magnesium (`magnesium_mg`) | `bottle-gourd-lauki`, `cucumber-fresh`, `apple-red-delicious`, `khichdi-moong-dal-rice`, `idli-steamed-rice-lentil` |
| `endocrine_metabolic` | Thyroid, Pancreas & Endocrine | `endocrine` | `FMA:9603` | Dietary Fibre (`fibre_g`), Zinc (`zinc_mg`), Magnesium (`magnesium_mg`), Protein (`protein_g`) | `ragi-finger-millet`, `methi-leaves-fenugreek`, `moong-dal-green-gram-split`, `curd-dahi-cow-milk`, `walnut-akhrot` |
| `blood_circulation` | Blood & Oxygen Transport | `cardiovascular` | `FMA:9670` | Iron (`iron_mg`), Folate (`folate_ug`), Vitamin B12 (`vitamin_b12_ug`), Vitamin C (`vitamin_c_mg`) | `spinach-palak`, `amaranth-leaves-chaulai`, `chana-bengal-gram-whole`, `amla-indian-gooseberry`, `jaggery-gur-cane`, `curd-dahi-cow-milk` |
| `skin_epithelial` | Skin, Hair & Epithelial Barrier | `external_skin` | `FMA:7163` | Vitamin C (`vitamin_c_mg`), Vitamin A (`vitamin_a_ug`), Zinc (`zinc_mg`), Protein (`protein_g`) | `amla-indian-gooseberry`, `guava-white-fleshed`, `carrot-orange`, `almonds-badam`, `curd-dahi-cow-milk` |
| `immune_defence` | Immune System & Recovery | `sensory_immune` | `FMA:9673` | Vitamin C (`vitamin_c_mg`), Zinc (`zinc_mg`), Vitamin A (`vitamin_a_ug`), Protein (`protein_g`) | `amla-indian-gooseberry`, `spinach-palak`, `moong-dal-green-gram-split`, `khichdi-moong-dal-rice`, `curd-dahi-cow-milk`, `pumpkin-seeds` |

---

## 3. Handling Unmeasured (`NULL`) Nutrient Values

If a linked food item has an unmeasured (`NULL`) value for a region's secondary nutrient in `FoodNutrientValue`, the API returns it in `missing_relevant_nutrients` and never fabricates or substitutes a zero.
