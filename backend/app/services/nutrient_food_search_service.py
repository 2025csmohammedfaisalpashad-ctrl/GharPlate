"""
GharPlate Shared Nutrient-to-Food Search, Ranking & Controlled Import Service (`nutrient_food_search_service.py`).

Powers BOTH:
1. The **Nutrient Explorer** (`/nutrient-explorer`) — searching and discovering Indian foods by vitamins, minerals,
   proteins/amino acids, carbohydrates/fibre, fatty acids, and other nutritional components.
2. **Health Reports** (`health_report_symptom_service.py`) — Lab-to-Plate dietary recommendations for abnormal
   blood report markers (such as low haemoglobin, low ferritin, low vitamin B12, low vitamin D, or elevated glucose/lipids).

Core Scientific & Honesty Guarantees:
- Never invents nutrient values or replaces `NULL` (`None`) with `0`.
- Supports nutrient search by canonical code, display name, chemical name, or common alias
  (e.g., `Vit D`, `Vitamin D`, `Calciferol`, `D3`, `Cholecalciferol`, `B12`, `Cobalamin`, `Cyanocobalamin`,
  `Folate`, `Folic Acid`, `Vitamin B9`, `Ascorbic Acid`, `Thiamine`, `Riboflavin`, `Niacin`, `Pyridoxine`, `Biotin`, `Fe`, `Ca`, `Mg`, `Zn`).
- Supports ranking by:
  * `per_100g_desc` — Highest nutrient per 100 g / 100 ml
  * `per_serving_desc` — Highest nutrient per standard household serving
  * `density_per_100kcal_desc` — Highest nutrient density per 100 kcal
  * `name_asc` — Alphabetical by food name
- Supports filtering by:
  * Dietary preference (`all`, `vegetarian`, `vegan`, `eggetarian`, `non_vegetarian`)
  * Food form / state (`all`, `raw`, `cooked`, `prepared_dish`, `fortified`, `natural`, `packaged`)
  * Food category (`cereals-millets`, `pulses-legumes`, `vegetables`, `fruits`, `dairy`, `protein-sources`, `nuts-seeds`, `indian-dishes`, `packaged-foods`)
- Provides evidence-based bioavailability / absorption notes and ICMR-NIN RDA 2020 reference intake context.
"""

from __future__ import annotations

import difflib
import re
from datetime import datetime, UTC
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    DataSource,
    FoodCategory,
    FoodItem,
    FoodNutrientValue,
    NutrientDefinition,
)
from app.services.food_service import _resolve_display_image

# ============================================================================
# 1. EXPLORER CATEGORY GROUPS & NUTRIENT METADATA REGISTRY
# ============================================================================
EXPLORER_CATEGORY_GROUPS: list[dict[str, Any]] = [
    {
        "group_code": "vitamins",
        "title": "Vitamins",
        "subtitle": "Vitamin A, individual B-complex (B1–B12), Vitamin C, Vitamin D (D2/D3), Vitamin E & Vitamin K (K1/K2)",
        "icon": "💊",
    },
    {
        "group_code": "minerals",
        "title": "Minerals",
        "subtitle": "Iron, Calcium, Magnesium, Zinc, Potassium, Sodium, Phosphorus, Selenium, Iodine, Copper, Manganese, Chromium & Molybdenum",
        "icon": "🪨",
    },
    {
        "group_code": "protein_amino_acids",
        "title": "Protein and Amino Acids",
        "subtitle": "Total Protein, BCAAs (Leucine, Isoleucine, Valine), Lysine, Methionine, Tryptophan & essential amino acids",
        "icon": "💪",
    },
    {
        "group_code": "carbohydrates_fibre",
        "title": "Carbohydrates and Fibre",
        "subtitle": "Total & Available Carbohydrates, Starch, Total/Added Sugars, Total, Soluble & Insoluble Dietary Fibre",
        "icon": "🌾",
    },
    {
        "group_code": "fats_fatty_acids",
        "title": "Fats and Essential Fatty Acids",
        "subtitle": "Total Fat, Saturated Fat, MUFA, PUFA, Trans Fat, Omega-3 (ALA/EPA/DHA) & Omega-6 Fatty Acids",
        "icon": "🥑",
    },
    {
        "group_code": "other_components",
        "title": "Other Nutritional Components",
        "subtitle": "Energy (kcal), Total Choline, Dietary Cholesterol, Water/Moisture, Organic Acids & Lutein + Zeaxanthin",
        "icon": "🧬",
    },
]

# Maps each canonical nutrient_code to its Explorer group, aliases, ICMR-NIN RDA 2020 adult reference context,
# bioavailability/absorption note, and related child/sibling nutrient codes.
NUTRIENT_ENRICHED_METADATA: dict[str, dict[str, Any]] = {
    # --- VITAMINS ---
    "vit_a_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin A",
        "chemical_name": "Retinol Activity Equivalents (RAE)",
        "aliases": ["vitamin a", "vit a", "retinol", "rae", "provitamin a", "eye vitamin"],
        "related_codes": ["vit_a_mcg", "retinol_mcg", "beta_carotene_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 1000 mcg/day (Men), 840 mcg/day (Women).",
        "bioavailability_note": (
            "Plant foods (moringa, amaranth, fenugreek leaves, spinach, carrots, pumpkin, ripe mango) provide provitamin A carotenoids "
            "(beta-carotene), whereas dairy (ghee, paneer, milk) and egg yolk provide preformed retinol. Cooking leafy greens with a small amount "
            "of healthy fat (oil or ghee) significantly improves carotenoid absorption."
        ),
        "coverage_limitation_note": None,
    },
    "retinol_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Retinol (Preformed Vit A)",
        "chemical_name": "All-trans-Retinol",
        "aliases": ["retinol", "preformed vitamin a", "animal vitamin a"],
        "related_codes": ["retinol_mcg", "vit_a_mcg"],
        "icmr_rda_note": "Contributes directly (1:1) to total Vitamin A Retinol Activity Equivalents (RAE).",
        "bioavailability_note": "Preformed retinol is found naturally in dairy fat (ghee, paneer, whole milk, curd), egg yolk, and fish.",
        "coverage_limitation_note": "Unfortified plant foods contain 0 mcg preformed retinol (they provide provitamin A beta-carotene instead).",
    },
    "beta_carotene_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Beta-Carotene",
        "chemical_name": "Provitamin A Beta-Carotene",
        "aliases": ["beta carotene", "beta-carotene", "provitamin a", "carotenoid", "carotene"],
        "related_codes": ["beta_carotene_mcg", "vit_a_mcg"],
        "icmr_rda_note": "ICMR-NIN uses a ~6:1 to 8:1 dietary beta-carotene-to-retinol conversion factor for mixed Indian diets.",
        "bioavailability_note": (
            "Concentrated in dark green leafy vegetables (drumstick/moringa leaves, amaranth, methi, curry leaves, palak) and orange vegetables/fruits "
            "(carrots, sweet potato, pumpkin, ripe mango, papaya). Mild cooking and pairing with dietary fat increase absorption."
        ),
        "coverage_limitation_note": None,
    },
    "vit_b1_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B1 (Thiamine)",
        "chemical_name": "Thiamine",
        "aliases": ["vitamin b1", "vit b1", "b1", "thiamine", "thiamin", "aneurin"],
        "related_codes": ["vit_b1_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 1.4–1.8 mg/day (Men), 1.4–1.7 mg/day (Women).",
        "bioavailability_note": (
            "Abundant in unpolished whole grains, millets (foxtail millet, ragi, jowar), pulses (toor dal, rajma, moong), sunflower seeds, pistachios, and peanuts. "
            "Heavy polishing of rice removes most thiamine; avoid discarding excess cooking water."
        ),
        "coverage_limitation_note": None,
    },
    "vit_b2_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B2 (Riboflavin)",
        "chemical_name": "Riboflavin",
        "aliases": ["vitamin b2", "vit b2", "b2", "riboflavin"],
        "related_codes": ["vit_b2_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 2.0–2.5 mg/day (Men), 1.9–2.4 mg/day (Women).",
        "bioavailability_note": "Found in almonds, drumstick leaves (moringa), eggs, milk, curd, paneer, mushrooms, and whole pulses. Riboflavin is sensitive to prolonged direct sunlight exposure.",
        "coverage_limitation_note": None,
    },
    "vit_b3_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B3 (Niacin)",
        "chemical_name": "Niacin (Nicotinic Acid / Nicotinamide)",
        "aliases": ["vitamin b3", "vit b3", "b3", "niacin", "nicotinic acid", "nicotinamide", "vitamin pp"],
        "related_codes": ["vit_b3_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 14–18 mg/day (Men), 11–14 mg/day (Women).",
        "bioavailability_note": "Rich sources include peanuts (groundnuts), chia seeds, sunflower seeds, brown rice, proso/foxtail millets, mushrooms, chicken breast, and tuna/mackerel fish.",
        "coverage_limitation_note": None,
    },
    "vit_b5_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B5 (Pantothenic Acid)",
        "chemical_name": "Pantothenic Acid",
        "aliases": ["vitamin b5", "vit b5", "b5", "pantothenic acid", "pantothenate"],
        "related_codes": ["vit_b5_mg"],
        "icmr_rda_note": "Typical adult Adequate Intake (AI): 5.0 mg/day.",
        "bioavailability_note": "Provided by whole pulses (moong, chana, toor dal), peanuts, mushrooms, eggs, sunflower seeds, oats, and curd.",
        "coverage_limitation_note": None,
    },
    "vit_b6_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B6 (Pyridoxine)",
        "chemical_name": "Pyridoxine / Pyridoxal 5'-Phosphate (PLP)",
        "aliases": ["vitamin b6", "vit b6", "b6", "pyridoxine", "pyridoxal", "pyridoxamine"],
        "related_codes": ["vit_b6_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 1.9–2.4 mg/day (Men), 1.9 mg/day (Women).",
        "bioavailability_note": "Abundant in sunflower seeds, pistachios, drumstick leaves (moringa), sesame seeds, pulses, banana, walnuts, chicken, and fish.",
        "coverage_limitation_note": None,
    },
    "vit_b7_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B7 (Biotin)",
        "chemical_name": "D-Biotin",
        "aliases": ["vitamin b7", "vit b7", "b7", "biotin", "vitamin h"],
        "related_codes": ["vit_b7_mcg"],
        "icmr_rda_note": "Typical adult Adequate Intake (AI): 30 mcg/day.",
        "bioavailability_note": (
            "Concentrated in sunflower seeds, almonds, flaxseeds, oats, soybeans, walnuts, boiled eggs, and pulses. "
            "Cooking eggs thoroughly denatures avidin in raw egg white, making egg biotin fully bioavailable."
        ),
        "coverage_limitation_note": None,
    },
    "folate_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B9 (Folate / Folic Acid)",
        "chemical_name": "Dietary Folate Equivalents (DFE) / Pteroylglutamic Acid",
        "aliases": ["vitamin b9", "vit b9", "b9", "folate", "folic acid", "dietary folate", "folacin"],
        "related_codes": ["folate_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 300 mcg/day (Men), 220 mcg/day (Women), 570 mcg/day (Pregnancy).",
        "bioavailability_note": (
            "Indian pulses (rajma, soya, chana, toor dal, moong, horse gram) and dark leafy greens (palak, methi, chaulai, curry leaves) "
            "are rich natural folate sources. Avoid overboiling greens in open pans as folate is heat-labile."
        ),
        "coverage_limitation_note": None,
    },
    "vit_b12_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin B12 (Cobalamin)",
        "chemical_name": "Cobalamin / Cyanocobalamin / Methylcobalamin",
        "aliases": ["vitamin b12", "vit b12", "b12", "cobalamin", "cyanocobalamin", "methylcobalamin", "vitamin b-12"],
        "related_codes": ["vit_b12_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 2.2 mcg/day.",
        "bioavailability_note": (
            "Vitamin B12 is synthesized by microorganisms and is naturally present in animal-derived foods (fish such as sardines/mackerel/rohu, "
            "mutton, eggs) and dairy products (paneer, curd, milk, buttermilk). Unfortified plant foods (grains, dals, vegetables, fruits, nuts) "
            "contain 0 mcg Vitamin B12."
        ),
        "coverage_limitation_note": (
            "Unfortified plant foods do not naturally provide Vitamin B12. Vegetarians rely on dairy (milk, curd, paneer) or fortified foods, "
            "while vegans require B12-fortified foods or clinician-guided supplementation."
        ),
    },
    "vit_c_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin C (Ascorbic Acid)",
        "chemical_name": "L-Ascorbic Acid",
        "aliases": ["vitamin c", "vit c", "ascorbic acid", "ascorbate"],
        "related_codes": ["vit_c_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 80 mg/day (Men), 65 mg/day (Women).",
        "bioavailability_note": (
            "Amla (Indian gooseberry, 252 mg/100g) and guava (214 mg/100g) are the richest natural Indian sources, followed by moringa leaves, "
            "broccoli, amaranth leaves, methi, lemon, papaya, and orange. Consuming Vitamin C alongside plant meals markedly increases non-haem iron absorption."
        ),
        "coverage_limitation_note": None,
    },
    "vit_d_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin D (Total)",
        "chemical_name": "Calciferol (Ergocalciferol D2 + Cholecalciferol D3)",
        "aliases": ["vitamin d", "vit d", "calciferol", "25-oh vitamin d", "sunshine vitamin"],
        "related_codes": ["vit_d_mcg", "vit_d2_mcg", "vit_d3_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 15 mcg (600 IU)/day (assuming minimal sunlight exposure).",
        "bioavailability_note": (
            "Fat-soluble vitamin absorbed best when consumed with a meal containing healthy fats. Natural food sources are limited to fatty fish "
            "(sardines, mackerel, rohu, tuna), egg yolk, UV/sun-exposed mushrooms (D2), FSSAI +F fortified milk, and trace D2 in sun-dried ragi."
        ),
        "coverage_limitation_note": (
            "IMPORTANT COVERAGE NOTE: Most unfortified plant foods contain negligible or unmeasured (NULL) Vitamin D. "
            "Food alone often cannot correct a clinical Vitamin D deficiency without safe sunlight exposure or doctor-guided supplementation."
        ),
    },
    "vit_d2_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin D2 (Ergocalciferol)",
        "chemical_name": "Ergocalciferol",
        "aliases": ["vitamin d2", "vit d2", "d2", "ergocalciferol", "plant vitamin d"],
        "related_codes": ["vit_d2_mcg", "vit_d_mcg"],
        "icmr_rda_note": "Contributes to total daily Vitamin D intake (15 mcg / 600 IU adult RDA).",
        "bioavailability_note": "Found in UV/sun-exposed mushrooms (Agaricus bisporus), FSSAI +F ergocalciferol-fortified milk, and trace amounts in sun-dried finger millet (ragi).",
        "coverage_limitation_note": "Only foods with verified ergocalciferol (D2) measurements in IFCT 2017 or FSSAI fortification standards are listed.",
    },
    "vit_d3_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin D3 (Cholecalciferol)",
        "chemical_name": "Cholecalciferol",
        "aliases": ["vitamin d3", "vit d3", "d3", "cholecalciferol"],
        "related_codes": ["vit_d3_mcg", "vit_d_mcg"],
        "icmr_rda_note": "Contributes to total daily Vitamin D intake (15 mcg / 600 IU adult RDA).",
        "bioavailability_note": "Present naturally in Indian oil sardines, mackerel (bangda), rohu, tuna, whole egg yolk, cow ghee, paneer, and whole milk.",
        "coverage_limitation_note": "Unfortified plant foods do not naturally contain cholecalciferol (Vitamin D3).",
    },
    "vit_e_mg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin E",
        "chemical_name": "Alpha-Tocopherol Equivalents",
        "aliases": ["vitamin e", "vit e", "tocopherol", "alpha tocopherol"],
        "related_codes": ["vit_e_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 reference range: 7.5–10 mg alpha-tocopherol/day.",
        "bioavailability_note": "Fat-soluble antioxidant concentrated in sunflower seeds (35.2 mg/100g), almonds (25.6 mg/100g), peanuts, moringa leaves, curry leaves, cow ghee, and spinach.",
        "coverage_limitation_note": None,
    },
    "vit_k_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin K (Total)",
        "chemical_name": "Phylloquinone (K1) + Menaquinones (K2)",
        "aliases": ["vitamin k", "vit k", "phylloquinone", "menaquinone"],
        "related_codes": ["vit_k_mcg", "vit_k1_mcg", "vit_k2_mcg"],
        "icmr_rda_note": "ICMR-NIN reference intake: 55 mcg/day for adults.",
        "bioavailability_note": (
            "Dark green leafy vegetables (amaranth, drumstick leaves, methi, curry leaves, palak, coriander) provide high Vitamin K1, "
            "while fermented dairy (curd, paneer, cheese, ghee) and egg yolk provide Vitamin K2. Individuals on warfarin/coumarin anticoagulants should keep Vitamin K intake consistent."
        ),
        "coverage_limitation_note": None,
    },
    "vit_k1_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin K1 (Phylloquinone)",
        "chemical_name": "Phylloquinone",
        "aliases": ["vitamin k1", "vit k1", "k1", "phylloquinone", "phytomenadione"],
        "related_codes": ["vit_k1_mcg", "vit_k_mcg"],
        "icmr_rda_note": "Primary dietary form of Vitamin K (adult reference: 55 mcg/day).",
        "bioavailability_note": "Concentrated in green leafy vegetables (chaulai, moringa, methi, curry leaves, palak, coriander) and broccoli; fat in tempering improves absorption.",
        "coverage_limitation_note": None,
    },
    "vit_k2_mcg": {
        "explorer_group": "vitamins",
        "short_label": "Vitamin K2 (Menaquinone)",
        "chemical_name": "Menaquinone (MK-4 / MK-7)",
        "aliases": ["vitamin k2", "vit k2", "k2", "menaquinone", "mk-4", "mk-7"],
        "related_codes": ["vit_k2_mcg", "vit_k_mcg"],
        "icmr_rda_note": "Sub-fraction of total Vitamin K involved in vascular and bone osteocalcin activation.",
        "bioavailability_note": "Present in fermented dairy (cheese, paneer, hung curd, dahi), cow ghee, egg yolk, and animal meats.",
        "coverage_limitation_note": "Unfermented plant foods contain 0 mcg Vitamin K2.",
    },

    # --- MINERALS ---
    "iron_mg": {
        "explorer_group": "minerals",
        "short_label": "Iron",
        "chemical_name": "Dietary Iron (Fe — Haem & Non-Haem)",
        "aliases": ["iron", "fe", "dietary iron", "ferric", "ferrous", "haem iron", "non-haem iron"],
        "related_codes": ["iron_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 19 mg/day (Men), 29 mg/day (Women), 27 mg/day (Pregnancy).",
        "bioavailability_note": (
            "BIOAVAILABILITY NOTE: Plant foods (soya chunks, sesame seeds, pumpkin seeds, horse gram, curry leaves, काला चना, masoor dal, bajra, "
            "methi, amaranth, ragi, palak) provide non-haem iron (5–12% absorption). Pairing meals with Vitamin C foods (amla, guava, lemon) "
            "triples non-haem iron absorption, whereas drinking tea or coffee with meals inhibits it via tannins."
        ),
        "coverage_limitation_note": None,
    },
    "calcium_mg": {
        "explorer_group": "minerals",
        "short_label": "Calcium",
        "chemical_name": "Elemental Calcium (Ca)",
        "aliases": ["calcium", "ca", "bone calcium", "dietary calcium"],
        "related_codes": ["calcium_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 1000 mg/day (Men & Women), 1200 mg/day (Postmenopausal women).",
        "bioavailability_note": (
            "Dairy foods (paneer, cheese, curd, buffalo/cow milk) have high calcium bioavailability (~30–35%). Among plant foods, sesame seeds (til, 1283 mg/100g), "
            "curry leaves (659 mg), chia seeds (631 mg), ragi (364 mg), soya chunks (350 mg), amaranth leaves (330 mg), and moringa leaves (314 mg) are exceptionally rich; "
            "soaking/fermenting grains and cooking greens helps reduce phytate/oxalate binding."
        ),
        "coverage_limitation_note": None,
    },
    "magnesium_mg": {
        "explorer_group": "minerals",
        "short_label": "Magnesium",
        "chemical_name": "Elemental Magnesium (Mg)",
        "aliases": ["magnesium", "mg"],
        "related_codes": ["magnesium_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 440 mg/day (Men), 370 mg/day (Women).",
        "bioavailability_note": "Concentrated in pumpkin seeds (592 mg/100g), sesame seeds, flaxseeds, chia seeds, sunflower seeds, almonds, cashews, soya, whole millets, and dark leafy greens.",
        "coverage_limitation_note": None,
    },
    "zinc_mg": {
        "explorer_group": "minerals",
        "short_label": "Zinc",
        "chemical_name": "Elemental Zinc (Zn)",
        "aliases": ["zinc", "zn"],
        "related_codes": ["zinc_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 17 mg/day (Men), 13.2 mg/day (Women).",
        "bioavailability_note": (
            "Found in pumpkin seeds (7.81 mg/100g), sesame seeds (7.75 mg/100g), cashews, sunflower seeds, soya, mutton, oats, and pulses (masoor, chana, rajma). "
            "Soaking, sprouting, and fermenting pulses/grains breaks down phytates and significantly improves zinc absorption."
        ),
        "coverage_limitation_note": None,
    },
    "potassium_mg": {
        "explorer_group": "minerals",
        "short_label": "Potassium",
        "chemical_name": "Elemental Potassium (K)",
        "aliases": ["potassium", "k", "k+"],
        "related_codes": ["potassium_mg"],
        "icmr_rda_note": "ICMR-NIN / WHO reference intake: ~3500 mg/day for healthy adults (restricted in hyperkalaemia / advanced CKD).",
        "bioavailability_note": "Abundant in pulses (soya, rajma, toor dal, moong, horse gram), pistachios, pumpkin seeds, spinach, amaranth, potato, sweet potato, coconut water/fruits, and banana.",
        "coverage_limitation_note": "Individuals with chronic kidney disease or elevated serum potassium should consult their physician before increasing high-potassium foods.",
    },
    "sodium_mg": {
        "explorer_group": "minerals",
        "short_label": "Sodium",
        "chemical_name": "Elemental Sodium (Na)",
        "aliases": ["sodium", "na", "na+", "salt"],
        "related_codes": ["sodium_mg"],
        "icmr_rda_note": "ICMR-NIN / WHO upper limit: < 2000 mg sodium/day (< 5 g table salt/day).",
        "bioavailability_note": "Naturally low in raw grains, pulses, and fruits, but high in processed cheese, instant noodles, salted chips, ready-to-eat pouches, and salted restaurant dishes.",
        "coverage_limitation_note": None,
    },
    "phosphorus_mg": {
        "explorer_group": "minerals",
        "short_label": "Phosphorus",
        "chemical_name": "Elemental Phosphorus (P)",
        "aliases": ["phosphorus", "p", "phosphate"],
        "related_codes": ["phosphorus_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 reference intake: 1000 mg/day for adults.",
        "bioavailability_note": "Found in pumpkin seeds, chia seeds, sesame seeds, sunflower seeds, soya, cashews, almonds, paneer, cheese, fish, eggs, and pulses.",
        "coverage_limitation_note": None,
    },
    "selenium_mcg": {
        "explorer_group": "minerals",
        "short_label": "Selenium",
        "chemical_name": "Elemental Selenium (Se)",
        "aliases": ["selenium", "se"],
        "related_codes": ["selenium_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 recommended intake: 40 mcg/day for adults.",
        "bioavailability_note": "Rich in tuna, sardines, chia seeds, sunflower seeds, mackerel, whole wheat atta, little millet, barley, rohu fish, sesame seeds, and boiled eggs.",
        "coverage_limitation_note": None,
    },
    "iodine_mcg": {
        "explorer_group": "minerals",
        "short_label": "Iodine",
        "chemical_name": "Elemental Iodine (I)",
        "aliases": ["iodine", "iodide"],
        "related_codes": ["iodine_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 140 mcg/day (220 mcg/day in pregnancy).",
        "bioavailability_note": "Natural dietary sources include marine fish (sardines, mackerel, tuna), eggs, and dairy (cheese, paneer, curd, milk); in Indian households, iodised salt is the primary culinary source.",
        "coverage_limitation_note": None,
    },
    "copper_mg": {
        "explorer_group": "minerals",
        "short_label": "Copper",
        "chemical_name": "Elemental Copper (Cu)",
        "aliases": ["copper", "cu"],
        "related_codes": ["copper_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 reference intake: 1.7 mg/day for adults.",
        "bioavailability_note": "Concentrated in sesame seeds (4.08 mg/100g), cashews (2.20 mg/100g), sunflower seeds, soya chunks, pumpkin seeds, pistachios, horse gram, and toor dal.",
        "coverage_limitation_note": None,
    },
    "manganese_mg": {
        "explorer_group": "minerals",
        "short_label": "Manganese",
        "chemical_name": "Elemental Manganese (Mn)",
        "aliases": ["manganese", "mn"],
        "related_codes": ["manganese_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 reference intake: 4.0 mg/day for adults.",
        "bioavailability_note": "Abundant in pumpkin seeds, oats, walnuts, whole wheat atta, ragi, soya chunks, chia seeds, flaxseeds, sesame seeds, and chickpeas.",
        "coverage_limitation_note": None,
    },
    "chromium_mcg": {
        "explorer_group": "minerals",
        "short_label": "Chromium",
        "chemical_name": "Trivalent Chromium (Cr III)",
        "aliases": ["chromium", "cr"],
        "related_codes": ["chromium_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 reference intake: 50 mcg/day for adults.",
        "bioavailability_note": "Found in kodo millet, ragi, little millet, broccoli, soybeans, oats, bajra, chickpeas, and sesame seeds.",
        "coverage_limitation_note": None,
    },
    "molybdenum_mcg": {
        "explorer_group": "minerals",
        "short_label": "Molybdenum",
        "chemical_name": "Elemental Molybdenum (Mo)",
        "aliases": ["molybdenum", "mo"],
        "related_codes": ["molybdenum_mcg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA: 45 mcg/day for adults.",
        "bioavailability_note": "Exceptionally rich in Indian legumes and pulses (soybeans, rajma, horse gram, chickpeas, masoor dal, urad dal, moong dal, toor dal) and oats.",
        "coverage_limitation_note": None,
    },

    # --- PROTEIN & AMINO ACIDS ---
    "protein_g": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Total Protein",
        "chemical_name": "Total Dietary Protein (N × Conversion Factor)",
        "aliases": ["protein", "total protein", "proteins", "dietary protein"],
        "related_codes": ["protein_g", "leucine_mg", "lysine_mg"],
        "icmr_rda_note": "ICMR-NIN 2020 RDA (Adults): 0.83 g/kg body weight/day (~54 g/day for Men, ~46 g/day for Women; 1.2–1.6 g/kg for active strength training).",
        "bioavailability_note": (
            "Dairy (paneer, curd, milk), eggs, fish, and poultry provide complete proteins with high digestibility (PDCAAS/DIAAS ~1.0). "
            "Combining Indian cereals/millets (higher in methionine) with pulses/dals (higher in lysine) in a ~3:1 to 4:1 ratio (such as Dal-Chawal, Idli-Sambar, or Khichdi) "
            "creates a complementary complete amino acid profile."
        ),
        "coverage_limitation_note": None,
    },
    "leucine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Leucine (BCAA)",
        "chemical_name": "L-Leucine",
        "aliases": ["leucine", "bcaa", "branched chain amino acid"],
        "related_codes": ["leucine_mg", "isoleucine_mg", "valine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 39 mg/kg body weight/day (~2500 mg/day).",
        "bioavailability_note": "Primary amino acid trigger for muscle protein synthesis; rich in soya chunks, soybeans, pumpkin seeds, tuna,cheese, paneer, chicken breast, dals, peanuts, and eggs.",
        "coverage_limitation_note": None,
    },
    "isoleucine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Isoleucine (BCAA)",
        "chemical_name": "L-Isoleucine",
        "aliases": ["isoleucine"],
        "related_codes": ["isoleucine_mg", "leucine_mg", "valine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 20 mg/kg body weight/day.",
        "bioavailability_note": "Rich in soya chunks, soybeans, pumpkin seeds, chicken breast, sunflower seeds, cheese, tuna, paneer, masoor/moong/urad dal, and boiled eggs.",
        "coverage_limitation_note": None,
    },
    "valine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Valine (BCAA)",
        "chemical_name": "L-Valine",
        "aliases": ["valine"],
        "related_codes": ["valine_mg", "leucine_mg", "isoleucine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 26 mg/kg body weight/day.",
        "bioavailability_note": "Concentrated in soya chunks, soybeans, pumpkin seeds, cheese, pistachios, sunflower seeds, paneer, moong/urad/masoor dal, tuna, and chicken.",
        "coverage_limitation_note": None,
    },
    "lysine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Lysine",
        "chemical_name": "L-Lysine",
        "aliases": ["lysine", "l-lysine"],
        "related_codes": ["lysine_mg", "methionine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 30 mg/kg body weight/day (~1950 mg/day).",
        "bioavailability_note": (
            "Lysine is the limiting amino acid in cereal grains (rice, wheat, millets), but is abundant in Indian pulses (soya, masoor, moong, urad, toor, chana, rajma), "
            "dairy (paneer, curd), fish, chicken, and eggs."
        ),
        "coverage_limitation_note": None,
    },
    "methionine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Methionine",
        "chemical_name": "L-Methionine",
        "aliases": ["methionine", "l-methionine", "sulfur amino acid"],
        "related_codes": ["methionine_mg", "lysine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement (Methionine + Cysteine): 15 mg/kg body weight/day.",
        "bioavailability_note": "Higher in sesame seeds, soya chunks, tuna, mackerel, chicken breast, pumpkin seeds, chia seeds, cheese, paneer, sunflower seeds, and eggs.",
        "coverage_limitation_note": None,
    },
    "phenylalanine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Phenylalanine",
        "chemical_name": "L-Phenylalanine",
        "aliases": ["phenylalanine"],
        "related_codes": ["phenylalanine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement (Phenylalanine + Tyrosine): 25 mg/kg body weight/day.",
        "bioavailability_note": "Abundant in soya chunks, soybeans, toor dal, pumpkin seeds, moong dal, urad dal, peanuts, almonds, and paneer.",
        "coverage_limitation_note": None,
    },
    "threonine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Threonine",
        "chemical_name": "L-Threonine",
        "aliases": ["threonine"],
        "related_codes": ["threonine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 15 mg/kg body weight/day.",
        "bioavailability_note": "Present in soya chunks, soybeans, pumpkin seeds, chicken breast, rohu/sardines, masoor/rajma/moong dal, cheese, and paneer.",
        "coverage_limitation_note": None,
    },
    "tryptophan_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Tryptophan",
        "chemical_name": "L-Tryptophan",
        "aliases": ["tryptophan", "l-tryptophan", "serotonin precursor"],
        "related_codes": ["tryptophan_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 4 mg/kg body weight/day (~260 mg/day).",
        "bioavailability_note": "Concentrated in soya chunks, pumpkin seeds (576 mg/100g), soybeans, chia seeds, sesame seeds, sunflower seeds, cashews, cheese, paneer, chicken, moong dal, and eggs.",
        "coverage_limitation_note": None,
    },
    "histidine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Histidine",
        "chemical_name": "L-Histidine",
        "aliases": ["histidine"],
        "related_codes": ["histidine_mg"],
        "icmr_rda_note": "WHO/ICMR-NIN adult requirement: 10 mg/kg body weight/day.",
        "bioavailability_note": "Found in soya chunks, soybeans, pumpkin seeds, toor dal, chicken breast, moong/masoor/urad dal, peanuts, cheese, and paneer.",
        "coverage_limitation_note": None,
    },
    "glycine_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Glycine",
        "chemical_name": "Glycine",
        "aliases": ["glycine"],
        "related_codes": ["glycine_mg"],
        "icmr_rda_note": "Conditionally essential amino acid for collagen, glutathione, and creatine synthesis.",
        "bioavailability_note": "Rich in soya chunks, pumpkin seeds, soybeans, almonds, peanuts, sesame seeds, flaxseeds, mutton, chicken, and dals.",
        "coverage_limitation_note": None,
    },
    "glutamic_acid_mg": {
        "explorer_group": "protein_amino_acids",
        "short_label": "Glutamic Acid",
        "chemical_name": "L-Glutamic Acid / Glutamate",
        "aliases": ["glutamic acid", "glutamate"],
        "related_codes": ["glutamic_acid_mg"],
        "icmr_rda_note": "Non-essential amino acid supporting intestinal barrier fuel and protein synthesis.",
        "bioavailability_note": "Abundant in soya chunks, soybeans, pumpkin seeds, almonds, peanuts, cashews, sesame seeds, moong/toor dal, cheese, and paneer.",
        "coverage_limitation_note": None,
    },

    # --- CARBOHYDRATES & FIBRE ---
    "carbs_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Total Carbohydrates",
        "chemical_name": "Total Carbohydrate",
        "aliases": ["carbohydrate", "carbohydrates", "carbs", "total carbs", "total carbohydrate"],
        "related_codes": ["carbs_g", "available_carbs_g", "starch_g"],
        "icmr_rda_note": "ICMR-NIN 2020 minimum requirement: 130 g/day (45–65% of total daily energy from complex unrefined sources).",
        "bioavailability_note": "Favour intact whole grains, millets (ragi, jowar, bajra, foxtail/little/kodo millet), and pulses over refined flour (maida) and added sugars.",
        "coverage_limitation_note": None,
    },
    "available_carbs_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Available Carbohydrates",
        "chemical_name": "Glycaemic Carbohydrate (Starch + Sugars)",
        "aliases": ["available carbohydrate", "available carbs", "net carbs", "glycaemic carbs"],
        "related_codes": ["available_carbs_g", "carbs_g"],
        "icmr_rda_note": "Represents digestible carbohydrate excluding dietary fibre.",
        "bioavailability_note": "Pulses (chickpeas, rajma, moong, chana dal) have much lower available carbohydrate than milled white rice due to high dietary fibre and resistant starch.",
        "coverage_limitation_note": None,
    },
    "starch_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Starch",
        "chemical_name": "Polysaccharide Starch",
        "aliases": ["starch", "complex carbs"],
        "related_codes": ["starch_g", "carbs_g"],
        "icmr_rda_note": "Primary complex carbohydrate energy source in Indian cereals, millets, pulses, and tubers.",
        "bioavailability_note": "Cooling cooked rice, potatoes, or legumes after boiling increases resistant starch, moderating post-meal glycaemic response.",
        "coverage_limitation_note": None,
    },
    "sugars_total_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Total Sugars",
        "chemical_name": "Mono- and Disaccharides",
        "aliases": ["sugar", "sugars", "total sugars", "total sugar"],
        "related_codes": ["sugars_total_g", "sugars_added_g"],
        "icmr_rda_note": "Includes intrinsic sugars in whole fruits and milk (lactose) as well as added sugars.",
        "bioavailability_note": "Intrinsic sugars in intact whole fruits (guava, apple, orange, pomegranate) are accompanied by fibre and polyphenols, unlike liquid fruit drinks.",
        "coverage_limitation_note": None,
    },
    "sugars_added_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Added Sugars",
        "chemical_name": "Free / Added Sucrose, Glucose & Syrups",
        "aliases": ["added sugar", "added sugars", "free sugar", "free sugars"],
        "related_codes": ["sugars_added_g", "sugars_total_g"],
        "icmr_rda_note": "ICMR-NIN DGI 2024 & WHO limit: < 5% of total daily energy (< 20–25 g/day).",
        "bioavailability_note": "Whole unfortified grains, pulses, vegetables, fruits, and plain dairy contain 0 g added sugar.",
        "coverage_limitation_note": None,
    },
    "fibre_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Total Dietary Fibre",
        "chemical_name": "Total Dietary Fibre (Soluble + Insoluble)",
        "aliases": ["fibre", "fiber", "dietary fibre", "dietary fiber", "roughage", "total fibre"],
        "related_codes": ["fibre_g", "soluble_fibre_g", "insoluble_fibre_g"],
        "icmr_rda_note": "ICMR-NIN 2020 recommendation: 30 g/2000 kcal (~30–40 g/day for adults).",
        "bioavailability_note": (
            "Chia seeds (34.4 g/100g), flaxseeds (26.2 g), whole chickpeas/kala chana (25.2 g), soybeans (22.6 g), green gram whole (17.0 g), "
            "sesame seeds (17.0 g), curry leaves (16.8 g), rajma (16.6 g), barley (15.6 g), chana dal (15.2 g), and millets (ragi, bajra, jowar) are top Indian sources."
        ),
        "coverage_limitation_note": None,
    },
    "soluble_fibre_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Soluble Fibre",
        "chemical_name": "Soluble Viscous Dietary Fibre",
        "aliases": ["soluble fibre", "soluble fiber", "beta glucan", "pectin", "mucilage"],
        "related_codes": ["soluble_fibre_g", "fibre_g"],
        "icmr_rda_note": "Aim for 6–10 g/day of soluble fibre within total daily fibre intake for glycaemic and LDL lipid support.",
        "bioavailability_note": "Richest in flaxseeds (8.2 g/100g), chia seeds (6.9 g), whole chickpeas/kala chana (5.8 g), barley (5.7 g), soybeans (5.7 g), rajma (5.0 g), oats (4.2 g), and chana dal (3.9 g).",
        "coverage_limitation_note": None,
    },
    "insoluble_fibre_g": {
        "explorer_group": "carbohydrates_fibre",
        "short_label": "Insoluble Fibre",
        "chemical_name": "Insoluble Structural Dietary Fibre",
        "aliases": ["insoluble fibre", "insoluble fiber", "cellulose"],
        "related_codes": ["insoluble_fibre_g", "fibre_g"],
        "icmr_rda_note": "Supports gastrointestinal transit time and stool bulk.",
        "bioavailability_note": "Concentrated in chia seeds, whole chickpeas, flaxseeds, soybeans, green gram whole, sesame seeds, curry leaves, rajma, almonds, chana dal, maize, and millets.",
        "coverage_limitation_note": None,
    },

    # --- FATS & ESSENTIAL FATTY ACIDS ---
    "fat_total_g": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Total Fat",
        "chemical_name": "Total Lipids",
        "aliases": ["fat", "total fat", "fats", "lipids"],
        "related_codes": ["fat_total_g", "fat_mufa_g", "fat_pufa_g", "fat_saturated_g"],
        "icmr_rda_note": "ICMR-NIN DGI 2024: Visible + invisible fat should contribute 20–30% of total daily energy.",
        "bioavailability_note": "Prioritise whole nuts and oilseeds (almonds, walnuts, flax, chia, sesame, peanuts) and fatty fish over deep-fried snacks and excess saturated fats.",
        "coverage_limitation_note": None,
    },
    "fat_saturated_g": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Saturated Fat",
        "chemical_name": "Saturated Fatty Acids (SFA)",
        "aliases": ["saturated fat", "sfa", "saturated fatty acids"],
        "related_codes": ["fat_saturated_g", "fat_total_g"],
        "icmr_rda_note": "ICMR-NIN / WHO limit: < 10% of total daily energy (< 7% in dyslipidaemia).",
        "bioavailability_note": "Higher in cow ghee, fresh coconut, processed cheese, salted potato chips, and paneer.",
        "coverage_limitation_note": None,
    },
    "fat_mufa_g": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Monounsaturated Fat (MUFA)",
        "chemical_name": "Monounsaturated Fatty Acids (Oleic Acid)",
        "aliases": ["mufa", "monounsaturated fat", "monounsaturated fatty acids", "oleic acid"],
        "related_codes": ["fat_mufa_g", "fat_total_g"],
        "icmr_rda_note": "Supports favourable HDL/LDL lipid ratios when replacing saturated fats.",
        "bioavailability_note": "Abundant in almonds (36.8 g/100g), cashews (26.8 g), pistachios (23.3 g), peanuts (19.8 g), sunflower seeds (18.5 g), pumpkin seeds, and sesame seeds.",
        "coverage_limitation_note": None,
    },
    "fat_pufa_g": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Polyunsaturated Fat (PUFA)",
        "chemical_name": "Polyunsaturated Fatty Acids",
        "aliases": ["pufa", "polyunsaturated fat", "polyunsaturated fatty acids"],
        "related_codes": ["fat_pufa_g", "omega_3_mg", "omega_6_mg"],
        "icmr_rda_note": "Supplies essential linoleic (n-6) and alpha-linolenic (n-3) fatty acids.",
        "bioavailability_note": "Concentrated in walnuts (47.2 g/100g), flaxseeds (25.4 g), chia seeds (23.7 g), sunflower seeds (23.1 g), pumpkin seeds (21.0 g), and sesame seeds (18.9 g).",
        "coverage_limitation_note": None,
    },
    "fat_trans_g": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Trans Fat",
        "chemical_name": "Trans Unsaturated Fatty Acids",
        "aliases": ["trans fat", "trans fatty acids", "tfa"],
        "related_codes": ["fat_trans_g"],
        "icmr_rda_note": "WHO & FSSAI limit: < 1% of total daily energy (industrial trans fats should be avoided).",
        "bioavailability_note": "Small amounts of natural ruminant trans fat (vaccenic/CLA) occur in dairy fat and mutton; industrial partially hydrogenated vegetable oils (vanaspati) should be avoided.",
        "coverage_limitation_note": None,
    },
    "omega_3_mg": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Omega-3 Fatty Acids",
        "chemical_name": "n-3 Polyunsaturated Fatty Acids (ALA, EPA & DHA)",
        "aliases": ["omega 3", "omega-3", "n-3 fatty acids", "ala", "epa", "dha", "alpha linolenic acid"],
        "related_codes": ["omega_3_mg", "fat_pufa_g"],
        "icmr_rda_note": "ICMR-NIN 2020: 1.6 g/day ALA (Men), 1.1 g/day ALA (Women) + 250–500 mg/day EPA+DHA.",
        "bioavailability_note": (
            "Plant sources (flaxseeds 19,850 mg/100g, chia seeds 17,830 mg, walnuts 9,080 mg, soybeans 1,330 mg, moringa leaves 620 mg, rajma 410 mg) "
            "provide Alpha-Linolenic Acid (ALA), while Indian marine/freshwater fish (oil sardines 1,860 mg, mackerel 1,420 mg, tuna 410 mg, rohu 385 mg) "
            "provide direct long-chain EPA and DHA."
        ),
        "coverage_limitation_note": None,
    },
    "omega_6_mg": {
        "explorer_group": "fats_fatty_acids",
        "short_label": "Omega-6 Fatty Acids",
        "chemical_name": "n-6 Polyunsaturated Fatty Acids (Linoleic Acid)",
        "aliases": ["omega 6", "omega-6", "n-6 fatty acids", "linoleic acid"],
        "related_codes": ["omega_6_mg", "fat_pufa_g"],
        "icmr_rda_note": "ICMR-NIN recommends maintaining a balanced Omega-6 to Omega-3 ratio (ideally 5:1 to 10:1).",
        "bioavailability_note": "Present in walnuts, sunflower seeds, pumpkin seeds, sesame seeds, almonds, peanuts, soybeans, and whole grains.",
        "coverage_limitation_note": None,
    },

    # --- OTHER NUTRITIONAL COMPONENTS ---
    "energy_kcal": {
        "explorer_group": "other_components",
        "short_label": "Energy (Calories)",
        "chemical_name": "Metabolizable Food Energy",
        "aliases": ["energy", "calories", "kcal", "caloric content"],
        "related_codes": ["energy_kcal"],
        "icmr_rda_note": "ICMR-NIN 2020 EAR (Sedentary/Moderate Adults): ~2110–2710 kcal/day (Men), ~1660–2130 kcal/day (Women).",
        "bioavailability_note": "Nuts, oilseeds, and ghee are energy-dense (450–900 kcal/100g), whereas cooked dals, steamed rice, vegetables, and fruits have lower energy density due to water content.",
        "coverage_limitation_note": None,
    },
    "choline_mg": {
        "explorer_group": "other_components",
        "short_label": "Total Choline",
        "chemical_name": "Total Choline",
        "aliases": ["choline", "phosphatidylcholine"],
        "related_codes": ["choline_mg"],
        "icmr_rda_note": "Adult Adequate Intake (AI): 550 mg/day (Men), 425 mg/day (Women), 450 mg/day (Pregnancy).",
        "bioavailability_note": "Richest in whole/boiled eggs (293.8 mg/100g), soya chunks (135 mg), soybeans (115.9 mg), green gram whole (97.9 mg), chickpeas (95.2 mg), mutton, chicken, flaxseeds, chana dal, pistachios, and chia seeds.",
        "coverage_limitation_note": None,
    },
    "cholesterol_mg": {
        "explorer_group": "other_components",
        "short_label": "Dietary Cholesterol",
        "chemical_name": "Cholesterol",
        "aliases": ["cholesterol", "dietary cholesterol"],
        "related_codes": ["cholesterol_mg"],
        "icmr_rda_note": "Found exclusively in animal-derived foods; all plant foods (grains, dals, vegetables, fruits, nuts, seeds) contain 0 mg cholesterol.",
        "bioavailability_note": "Present in whole eggs, cow ghee, cheese, sardines, mackerel, mutton, chicken, paneer, and milk/curd.",
        "coverage_limitation_note": None,
    },
    "water_g": {
        "explorer_group": "other_components",
        "short_label": "Water / Moisture",
        "chemical_name": "Intrinsic Food Moisture",
        "aliases": ["water", "moisture", "water content", "hydration"],
        "related_codes": ["water_g"],
        "icmr_rda_note": "Intrinsic food moisture contributes ~20–25% of daily total water intake.",
        "bioavailability_note": "Highest in buttermilk (96.4 g/100g), watermelon (94.1 g), tomato (93.6 g), cucumber (93.0 g), rasam (92.8 g), papaya (91.7 g), pumpkin (91.6 g), mushroom (91.5 g), and spinach (90.3 g).",
        "coverage_limitation_note": None,
    },
    "organic_acids_g": {
        "explorer_group": "other_components",
        "short_label": "Organic Acids",
        "chemical_name": "Citric, Malic, Tartaric & Lactic Acids",
        "aliases": ["organic acids", "citric acid", "lactic acid", "malic acid"],
        "related_codes": ["organic_acids_g"],
        "icmr_rda_note": "Dietary organic acids enhance mineral solubility in the gastrointestinal tract.",
        "bioavailability_note": "Highest in lemon (4.8 g/100g), amla (2.15 g), strained/plain curd (lactic acid), orange, pomegranate, grapes, guava, and spinach.",
        "coverage_limitation_note": None,
    },
    "lutein_zeaxanthin_mcg": {
        "explorer_group": "other_components",
        "short_label": "Lutein + Zeaxanthin",
        "chemical_name": "Macular Xanthophyll Carotenoids",
        "aliases": ["lutein", "zeaxanthin", "carotenoids", "xanthophylls", "macular carotenoids"],
        "related_codes": ["lutein_zeaxanthin_mcg", "beta_carotene_mcg"],
        "icmr_rda_note": "Supports macular pigment density and retinal antioxidant protection.",
        "bioavailability_note": "Concentrated in curry leaves (9,120 mcg/100g), amaranth leaves (8,450 mcg), drumstick/moringa leaves (7,250 mcg), methi leaves (6,820 mcg), coriander (4,980 mcg), spinach (3,850 mcg), green peas (2,477 mcg), palak paneer, pumpkin, maize, pistachios, and egg yolk.",
        "coverage_limitation_note": None,
    },
}


def _normalize_search_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (text or "").lower()).strip()


def _classify_food_form(food: FoodItem) -> tuple[str, str]:
    """
    Classifies a food record's preparation/state form so users can distinguish raw ingredients
    (e.g. Raw Rice 356 kcal/100g, Raw Toor Dal 21.7g protein/100g) from cooked/boiled/prepared dishes
    (e.g. Steamed Rice 120 kcal/100g, Cooked Toor Dal 7.2g protein/100g) and fortified/packaged items.
    Returns (form_code, form_display_label).
    """
    tags = {t.lower() for t in (food.dietary_tags or [])}
    slug = food.slug.lower()
    name_low = food.name_en.lower()
    cat_slug = food.category.slug if food.category else ""

    if "fortified_food" in tags or "fortified" in slug or "fortified" in name_low:
        return "fortified", "Fortified Food"
    if food.is_packaged:
        return "packaged", "Packaged Label-Declared"
    if cat_slug == "indian-dishes":
        return "prepared_dish", "Prepared Indian Dish (Cooked)"
    if (
        "cooked_food" in tags
        or "cooked" in slug
        or "boiled" in slug
        or "(cooked" in name_low
        or "(boiled" in name_low
    ):
        return "cooked", "Cooked / Boiled Basis"
    if cat_slug in ("dairy", "fruits"):
        return "ready_to_eat", "Fresh / Ready-to-Eat"
    return "raw", "Raw / Uncooked Ingredient"


def resolve_nutrient_query(db: Session, query_str: str | None) -> NutrientDefinition | None:
    """
    Resolves a user search query or alias (e.g., 'Vitamin D', 'Vit D', 'Calciferol', 'D3',
    'Vitamin B12', 'B12', 'Cobalamin', 'Folate', 'Folic Acid', 'Vitamin B9', 'Iron', 'Fe',
    'Protein', 'Leucine', 'Omega-3', 'Soluble Fibre') to the matching `NutrientDefinition`.
    """
    all_defs = (
        db.query(NutrientDefinition).order_by(NutrientDefinition.display_order.asc()).all()
    )
    if not all_defs:
        return None
    if not query_str or not query_str.strip():
        return next((d for d in all_defs if d.code == "iron_mg"), all_defs[0])

    q_norm = _normalize_search_text(query_str)
    by_code = {d.code: d for d in all_defs}

    # 1. Exact code match
    if query_str.strip().lower() in by_code:
        return by_code[query_str.strip().lower()]

    # 2. Direct alias table lookup
    best_code: str | None = None
    best_score = -1.0

    for d in all_defs:
        meta = NUTRIENT_ENRICHED_METADATA.get(d.code, {})
        cand_strings = [
            d.code.replace("_", " "),
            d.name,
            meta.get("short_label", ""),
            meta.get("chemical_name", ""),
        ] + list(meta.get("aliases", []))

        for cand in cand_strings:
            c_norm = _normalize_search_text(cand)
            if not c_norm:
                continue
            if q_norm == c_norm:
                score = 100.0
            elif c_norm.startswith(q_norm) or q_norm.startswith(c_norm):
                score = 88.0 if len(q_norm) >= 2 else 70.0
            elif f" {q_norm} " in f" {c_norm} ":
                score = 85.0
            elif q_norm in c_norm:
                score = 76.0
            else:
                ratio = difflib.SequenceMatcher(None, q_norm, c_norm).ratio()
                score = ratio * 70.0 if ratio >= 0.72 else 0.0

            if score > best_score:
                best_score = score
                best_code = d.code

    if best_code and best_score >= 55.0:
        return by_code[best_code]
    return None


def list_nutrients_catalog(
    db: Session,
    search_query: str | None = None,
    group_code: str | None = None,
) -> dict[str, Any]:
    """
    Returns the complete GharPlate Nutrient Explorer catalog organized into the 6 clean
    category tabs, with measured food counts, units, aliases, and instant search filtering.
    """
    all_defs = (
        db.query(NutrientDefinition).order_by(NutrientDefinition.display_order.asc()).all()
    )

    # Count how many foods have a positive (> 0) or non-null measured value for each nutrient
    positive_counts: dict[str, int] = {}
    measured_counts: dict[str, int] = {}
    for nv in db.query(FoodNutrientValue).filter(FoodNutrientValue.value.isnot(None)).all():
        measured_counts[nv.nutrient_code] = measured_counts.get(nv.nutrient_code, 0) + 1
        if (nv.value or 0.0) > 0:
            positive_counts[nv.nutrient_code] = positive_counts.get(nv.nutrient_code, 0) + 1

    q_norm = _normalize_search_text(search_query) if search_query else ""

    nutrients_out: list[dict[str, Any]] = []
    for d in all_defs:
        meta = NUTRIENT_ENRICHED_METADATA.get(d.code, {})
        exp_group = meta.get("explorer_group") or (
            "vitamins"
            if d.category == "vitamin"
            else (
                "minerals"
                if d.category == "mineral"
                else (
                    "protein_amino_acids"
                    if d.category == "amino_acid" or d.code == "protein_g"
                    else (
                        "carbohydrates_fibre"
                        if d.category == "carbohydrate_fibre"
                        or d.code in ("carbs_g", "sugars_total_g", "sugars_added_g", "fibre_g")
                        else (
                            "fats_fatty_acids"
                            if d.category == "fatty_acid" or d.code.startswith("fat_")
                            else "other_components"
                        )
                    )
                )
            )
        )

        if group_code and group_code != "all" and exp_group != group_code:
            continue

        aliases = list(meta.get("aliases", []))
        short_label = meta.get("short_label") or d.name
        chem_name = meta.get("chemical_name") or d.name

        if q_norm:
            haystack = _normalize_search_text(
                " ".join([d.code, d.name, short_label, chem_name, d.description or ""] + aliases)
            )
            if q_norm not in haystack and not any(
                difflib.SequenceMatcher(None, q_norm, _normalize_search_text(a)).ratio() >= 0.75
                for a in ([short_label, d.name] + aliases)
            ):
                continue

        nutrients_out.append(
            {
                "code": d.code,
                "name": d.name,
                "short_label": short_label,
                "chemical_name": chem_name,
                "unit": d.unit,
                "category": d.category,
                "explorer_group": exp_group,
                "display_order": d.display_order,
                "description": d.description or "",
                "aliases": aliases,
                "foods_with_nutrient_count": positive_counts.get(d.code, 0),
                "measured_food_count": positive_counts.get(d.code, 0),
                "foods_measured_count": measured_counts.get(d.code, 0),
                "icmr_rda_note": meta.get("icmr_rda_note"),
                "rda_adult_note": meta.get("icmr_rda_note"),
                "bioavailability_note": meta.get("bioavailability_note"),
                "coverage_limitation_note": meta.get("coverage_limitation_note"),
            }
        )

    groups_out = []
    for grp in EXPLORER_CATEGORY_GROUPS:
        g_items = [n for n in nutrients_out if n["explorer_group"] == grp["group_code"]]
        groups_out.append(
            {
                **grp,
                "code": grp["group_code"],
                "label": grp["title"],
                "description": grp["subtitle"],
                "nutrient_count": len(g_items),
                "nutrients": g_items,
            }
        )

    resolved_top = resolve_nutrient_query(db, search_query) if search_query else None

    return {
        "total_nutrients": len(nutrients_out),
        "resolved_nutrient_code": resolved_top.code if resolved_top else None,
        "resolved_nutrient_name": resolved_top.name if resolved_top else None,
        "groups": groups_out,
        "nutrients": nutrients_out,
    }


def search_foods_by_nutrient(
    db: Session,
    nutrient_query: str,
    dietary_preference: str = "all",
    food_form: str = "all",
    category_slug: str | None = None,
    sort_by: str = "per_100g_desc",
    include_zero_values: bool = False,
    limit: int = 60,
) -> dict[str, Any]:
    """
    Searches and ranks Indian foods in GharPlate's database by a specific nutrient.
    Strictly preserves `NULL` (`None`) for unmeasured nutrients (never treats `NULL` as `0`)
    and excludes unmeasured foods from top rankings while reporting honest coverage metrics.
    """
    nd = resolve_nutrient_query(db, nutrient_query)
    if not nd:
        return {
            "found": False,
            "matched": False,
            "query": nutrient_query,
            "error_message": f"No nutrient matching '{nutrient_query}' was found in the GharPlate catalog.",
            "nutrient": None,
            "total_matching_foods": 0,
            "foods": [],
        }

    meta = NUTRIENT_ENRICHED_METADATA.get(nd.code, {})
    exp_group = meta.get("explorer_group", "vitamins")

    all_foods = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.nutrient_values).joinedload(FoodNutrientValue.source),
        )
        .all()
    )

    diet_norm = (dietary_preference or "all").strip().lower()
    form_norm = (food_form or "all").strip().lower()

    matching_foods: list[dict[str, Any]] = []
    unmeasured_count_for_filter = 0
    zero_count_for_filter = 0

    for food in all_foods:
        if category_slug and category_slug != "all":
            if not food.category or food.category.slug != category_slug:
                continue

        # Dietary preference filter
        f_tags = {t.lower() for t in (food.dietary_tags or [])}
        is_egg = "eggetarian" in f_tags or "egg" in {a.lower() for a in (food.allergen_tags or [])}
        if diet_norm in ("vegetarian", "pure_vegetarian", "veg", "jain"):
            if not food.is_vegetarian:
                continue
        elif diet_norm == "vegan":
            if not food.is_vegan:
                continue
        elif diet_norm == "eggetarian":
            if not (food.is_vegetarian or is_egg):
                continue
        elif diet_norm in ("non_vegetarian", "non-vegetarian", "non_veg"):
            if food.is_vegetarian:
                continue

        # Food form / state filter
        f_form_code, f_form_label = _classify_food_form(food)
        if form_norm not in ("all", ""):
            if form_norm == "raw" and f_form_code not in ("raw", "ready_to_eat"):
                continue
            elif form_norm in ("cooked", "cooked_prepared") and f_form_code not in ("cooked", "prepared_dish"):
                continue
            elif form_norm == "prepared_dish" and f_form_code != "prepared_dish":
                continue
            elif form_norm == "fortified" and f_form_code != "fortified":
                continue
            elif form_norm == "packaged" and not food.is_packaged:
                continue
            elif form_norm == "natural" and (food.is_packaged or f_form_code == "fortified"):
                continue

        nv_map: dict[str, FoodNutrientValue] = {
            nv.nutrient_code: nv for nv in (food.nutrient_values or [])
        }
        target_nv = nv_map.get(nd.code)

        # Fallback check for Vitamin D (if searching total `vit_d_mcg` and `vit_d2_mcg` or `vit_d3_mcg` is measured)
        val_100: float | None = target_nv.value if target_nv is not None else None
        if val_100 is None and nd.code == "vit_d_mcg":
            d2_nv = nv_map.get("vit_d2_mcg")
            d3_nv = nv_map.get("vit_d3_mcg")
            if (d2_nv and d2_nv.value is not None) or (d3_nv and d3_nv.value is not None):
                val_100 = round((d2_nv.value or 0.0) + (d3_nv.value or 0.0), 2)

        if val_100 is None:
            unmeasured_count_for_filter += 1
            continue

        if val_100 <= 0.0 and not include_zero_values:
            zero_count_for_filter += 1
            continue

        srv_grams = food.standard_serving_grams or 100.0
        val_serving = round(val_100 * (srv_grams / 100.0), 2)

        energy_nv = nv_map.get("energy_kcal")
        energy_100 = energy_nv.value if (energy_nv and energy_nv.value is not None) else None
        density_per_100kcal = (
            round((val_100 / energy_100) * 100.0, 2)
            if (energy_100 is not None and energy_100 > 0)
            else None
        )

        img_url, has_verified_img = _resolve_display_image(food)
        src_obj = (
            target_nv.source
            if (target_nv is not None and target_nv.source is not None)
            else food.source
        )

        basis_unit = "100 ml" if (food.default_basis or "100g") == "100ml" else "100 g"
        formatted_100g = f"{val_100:g} {nd.unit} per {basis_unit}"
        formatted_serving = f"{val_serving:g} {nd.unit} per serving ({srv_grams:g} g)"

        diet_badge = (
            "Vegan"
            if food.is_vegan
            else (
                "Vegetarian"
                if food.is_vegetarian
                else ("Eggetarian" if is_egg else "Non-Vegetarian")
            )
        )

        food_forms_list = [f_form_code]
        if f_form_code in ("cooked", "prepared_dish"):
            food_forms_list.extend(["cooked", "prepared_dish"])
        if not food.is_packaged and f_form_code != "fortified":
            food_forms_list.append("natural")

        matching_foods.append(
            {
                "slug": food.slug,
                "ifct_code": food.ifct_code,
                "name_en": food.name_en,
                "image_url": img_url,
                "has_verified_image": has_verified_img,
                "category_slug": food.category.slug if food.category else "indian-dishes",
                "category_name": food.category.name if food.category else "Indian Foods",
                "food_form": f_form_code,
                "food_forms": sorted(list(set(food_forms_list))),
                "food_form_label": f_form_label,
                "is_vegetarian": food.is_vegetarian,
                "is_vegan": food.is_vegan,
                "is_eggetarian": is_egg,
                "is_packaged": food.is_packaged,
                "dietary_badge": diet_badge,
                "nutrient_code": nd.code,
                "nutrient_name": meta.get("short_label") or nd.name,
                "nutrient_unit": nd.unit,
                "value_per_100g": round(val_100, 2),
                "amount_per_100g": round(val_100, 2),
                "value_per_serving": val_serving,
                "amount_per_serving": val_serving,
                "density_per_100kcal": density_per_100kcal,
                "default_basis": food.default_basis or "100g",
                "standard_serving_name": food.standard_serving_name,
                "standard_serving_grams": srv_grams,
                "formatted_amount": formatted_100g,
                "formatted_per_serving": formatted_serving,
                "formatted_serving_amount": formatted_serving,
                "energy_kcal_per_100g": energy_100,
                "confidence_status": target_nv.confidence_status if target_nv else "verified_ifct",
                "source_code": src_obj.code if src_obj else "ICMR_NIN_IFCT_2017",
                "source_name": src_obj.name if src_obj else "ICMR-NIN IFCT 2017",
                "source_url": src_obj.url if src_obj else "https://nin.res.in/downloads/",
                "publication_year": src_obj.publication_year if src_obj else 2017,
            }
        )

    # Sort results
    if sort_by == "per_serving_desc":
        matching_foods.sort(
            key=lambda x: (x["value_per_serving"] or 0.0, x["value_per_100g"] or 0.0),
            reverse=True,
        )
    elif sort_by == "density_per_100kcal_desc":
        matching_foods.sort(
            key=lambda x: (
                x["density_per_100kcal"] is not None,
                x["density_per_100kcal"] or 0.0,
                x["value_per_100g"] or 0.0,
            ),
            reverse=True,
        )
    elif sort_by == "name_asc":
        matching_foods.sort(key=lambda x: x["name_en"].lower())
    else:
        matching_foods.sort(
            key=lambda x: (x["value_per_100g"] or 0.0, x["value_per_serving"] or 0.0),
            reverse=True,
        )

    # Build honest dietary/coverage notes when results are sparse or zero (e.g., Vegan + Vitamin B12 or Vitamin D3)
    empty_or_sparse_explanation: str | None = None
    if len(matching_foods) == 0:
        if nd.code in ("vit_b12_mcg",) and diet_norm == "vegan":
            empty_or_sparse_explanation = (
                "No unfortified vegan foods in the database contain Vitamin B12 (unfortified plant foods naturally contain 0 mcg Vitamin B12). "
                "Switch the dietary filter to 'Vegetarian' to view dairy sources (paneer, curd, milk) or 'All' to view egg and fish sources, "
                "or discuss B12 supplementation with your clinician."
            )
        elif nd.code in ("vit_d3_mcg", "retinol_mcg", "vit_k2_mcg", "cholesterol_mg") and diet_norm == "vegan":
            empty_or_sparse_explanation = (
                f"{nd.name} occurs naturally in animal- or dairy-derived foods and is 0 {nd.unit} in unfortified vegan plant foods. "
                "Try switching the dietary filter to 'Vegetarian' or 'All', or explore plant-compatible forms (such as Vitamin D2, Beta-Carotene, or Vitamin K1)."
            )
        else:
            empty_or_sparse_explanation = (
                f"No foods matched the selected filters with a measured positive value for {nd.name}. "
                f"({unmeasured_count_for_filter} food(s) have NULL/unmeasured values and {zero_count_for_filter} food(s) have 0 {nd.unit} under these filters.)"
            )
    elif len(matching_foods) <= 4 and nd.code in ("vit_d_mcg", "vit_d2_mcg", "vit_d3_mcg"):
        empty_or_sparse_explanation = (
            "Very few foods naturally contain significant Vitamin D. Only foods with verified non-null Vitamin D composition in GharPlate's database are listed here."
        )

    return {
        "found": True,
        "matched": True,
        "query": nutrient_query,
        "nutrient": {
            "code": nd.code,
            "name": nd.name,
            "short_label": meta.get("short_label") or nd.name,
            "chemical_name": meta.get("chemical_name") or nd.name,
            "unit": nd.unit,
            "category": nd.category,
            "explorer_group": exp_group,
            "description": nd.description or "",
            "aliases": list(meta.get("aliases", [])),
            "icmr_rda_note": meta.get("icmr_rda_note"),
            "rda_adult_note": meta.get("icmr_rda_note"),
            "bioavailability_note": meta.get("bioavailability_note"),
            "coverage_limitation_note": meta.get("coverage_limitation_note"),
        },
        "filters_applied": {
            "dietary_preference": diet_norm,
            "food_form": form_norm,
            "category_slug": category_slug or "all",
            "sort_by": sort_by,
        },
        "total_matching_foods": len(matching_foods),
        "unmeasured_null_foods_excluded": unmeasured_count_for_filter,
        "zero_value_foods_excluded": zero_count_for_filter,
        "empty_or_sparse_explanation": empty_or_sparse_explanation,
        "foods": matching_foods[:limit],
    }


def get_database_import_and_coverage_summary(db: Session) -> dict[str, Any]:
    """
    Returns an honest, auditable summary of GharPlate's expanded Indian Food Composition Database:
    - Total foods, total nutrients, total nutrient values, NULL vs measured counts
    - Breakdown by food category and by data source
    - Nutrient coverage per explorer group
    """
    total_foods = db.query(FoodItem).count()
    total_nutrients = db.query(NutrientDefinition).count()
    total_known = db.query(FoodNutrientValue).filter(FoodNutrientValue.value.isnot(None)).count()
    total_null = db.query(FoodNutrientValue).filter(FoodNutrientValue.value.is_(None)).count()

    sources = db.query(DataSource).order_by(DataSource.id.asc()).all()
    sources_summary = []
    for s in sources:
        f_cnt = db.query(FoodItem).filter(FoodItem.source_id == s.id).count()
        sources_summary.append(
            {
                "code": s.code,
                "name": s.name,
                "organization": s.organization,
                "publication_year": s.publication_year,
                "version": s.version,
                "url": s.url,
                "source_type": s.source_type,
                "primary_food_records": f_cnt,
            }
        )

    categories = db.query(FoodCategory).order_by(FoodCategory.display_order.asc()).all()
    categories_summary = []
    for c in categories:
        c_cnt = db.query(FoodItem).filter(FoodItem.category_id == c.id).count()
        categories_summary.append(
            {
                "slug": c.slug,
                "name": c.name,
                "food_count": c_cnt,
            }
        )

    return {
        "generated_at": datetime.now(UTC).isoformat(),
        "total_foods": total_foods,
        "total_nutrient_definitions": total_nutrients,
        "total_known_nutrient_values": total_known,
        "total_null_unmeasured_values": total_null,
        "null_replaced_with_zero": False,
        "categories": categories_summary,
        "data_sources": sources_summary,
    }
