"""
GharPlate Health Report Intelligence & AI Symptom Review Service (Parts A & B):
- Multi-format Medical Report Validation (PDF, JPG/JPEG, PNG, WebP; magic bytes, size, page count, dimensions, corruption rejection)
- Text + Visual Formatting PDF & Image Extraction in Memory:
  * Inspects PDF character/font weight (Bold/Heavy/2 Tr), RGB/CMYK non-black colour operators, table/row layout, page numbers, and embedded scanned-PDF images
  * Inspects scanned/image reports with orientation correction, smart resizing, contrast enhancement, denoising, colour/stroke visual cue extraction, and 3-tier OCR (Tesseract -> Local Ollama Vision -> Built-in Pillow+NumPy Multi-Font Laboratory Table OCR)
- Multi-Signal Abnormality Detection across 8 Clinical Panels:
  * Complete Blood Count / CBC (Haemoglobin, RBC, WBC, Platelets, Hematocrit/PCV, MCV, MCH, MCHC)
  * Glucose & Diabetes Markers (Fasting Glucose, Post-Meal Glucose, Random Glucose, HbA1c)
  * Iron Studies (Serum Iron, Serum Ferritin, Transferrin Saturation, TIBC)
  * Vitamins & Minerals (Vitamin B12, 25-OH Vitamin D, Folate, Serum Calcium)
  * Lipid Profile (Total Cholesterol, LDL, HDL, Triglycerides)
  * Kidney Function Markers (Serum Creatinine, Blood Urea/BUN, eGFR, Serum Potassium, Serum Sodium, Uric Acid)
  * Liver Function Markers (ALT/SGPT, AST/SGOT, Total Bilirubin, Alkaline Phosphatase)
  * Thyroid Panel (TSH, T3, T4)
- Multi-check classification: Below reference interval, Within reference interval, Above reference interval,
  Laboratory-flagged abnormal, Requires manual review (flag/range disagreement, unreadable value, or OCR decimal suspect), Reference interval unavailable
- Structured Extraction Diagnostics (`extraction_diagnostics`) for every analysis request
- Cautious, evidence-based Possible Nutritional Concerns & Database-Grounded Indian Food Recommendations
  with strict Kidney-Marker Safety guardrails and NULL nutrient preservation
"""

from __future__ import annotations

import base64
import io
import os
import re
import shutil
import subprocess
import uuid
import zlib
from datetime import datetime, UTC
from typing import Any

import httpx
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps, UnidentifiedImageError
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.entities import (
    BloodGlucoseLog,
    BloodPressureLog,
    FoodItem,
    FoodNutrientValue,
    HealthReport,
    HealthReportMeasurement,
    Household,
    HouseholdMember,
    SymptomReviewSession,
)

MEDICAL_REPORT_DISCLAIMER = (
    "Educational interpretation only. GharPlate does not diagnose diseases, prescribe supplements or medicines, "
    "or replace a doctor's clinical interpretation. Laboratory reference intervals vary by laboratory, assay method, age, and sex. "
    "Always discuss your report with a qualified medical professional."
)

SYMPTOM_REVIEW_DISCLAIMER = (
    "Educational symptom review and care-navigation support only — not a medical diagnosis or treatment plan. "
    "If you experience severe, sudden, or worsening symptoms, seek immediate in-person medical care."
)

PRIVACY_EPHEMERAL_UPLOAD_NOTICE = (
    "Uploaded report files are processed temporarily in memory by default and are not permanently stored without explicit consent. "
    "Only the structured test measurements that you review and confirm are saved to this household member's health history."
)


# ============================================================================
# 1. CANONICAL LABORATORY TEST CATALOG & EDUCATIONAL METADATA
# ============================================================================
LAB_TEST_CATALOG: dict[str, dict[str, Any]] = {
    # Glucose & Diabetes
    "fasting_blood_glucose": {
        "canonical_code": "fasting_blood_glucose",
        "panel_category": "glucose_hba1c",
        "display_name": "Fasting Blood Glucose (FBG / FBS)",
        "aliases": [
            "fasting blood glucose",
            "fasting plasma glucose",
            "fasting blood sugar",
            "blood sugar fasting",
            "blood glucose fasting",
            "fasting glucose",
            "glucose fasting",
            "glucose, fasting",
            "glucose (fasting)",
            "glucose - fasting",
            "fasting sugar",
            "fbs",
            "fbg",
            "fpg",
        ],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (30.0, 600.0), "mmol/l": (1.5, 35.0)},
        "what_it_measures": "Measures blood glucose concentration after an overnight fast (typically 8–12 hours without food).",
        "clinical_context": "Interpreted alongside HbA1c and post-meal glucose to assess fasting blood sugar regulation.",
        "doctor_questions": [
            "How does this fasting glucose result compare with my HbA1c and home readings?",
            "What meal timing and carbohydrate distribution do you recommend for my profile?",
        ],
        "related_condition_codes": ["type_2_diabetes", "diabetes_type2_prediabetes"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "sugars_total_g", "carbs_g"],
            "preferred_slugs": [
                "ragi-finger-millet",
                "green-gram-whole-moong",
                "chickpea-kabuli-chana",
                "toor-dal-red-gram",
                "fenugreek-leaves-methi",
                "spinach-palak",
                "bitter-gourd-karela",
                "oats-rolled-plain",
                "packaged-rolled-oats-plain",
            ],
            "portion_sensitive_slugs": ["rice-raw-milled-white", "rice-raw-milled", "potato-raw"],
            "educational_food_note": (
                "Focus on carbohydrate quality, portion balance, and soluble/insoluble dietary fibre from intact millets (ragi, jowar), "
                "pulses (moong, chana, toor dal), and non-starchy leafy vegetables. No single food cures or reverses diabetes."
            ),
        },
        "kidney_caution": False,
    },
    "post_prandial_glucose": {
        "canonical_code": "post_prandial_glucose",
        "panel_category": "glucose_hba1c",
        "display_name": "Post-Meal / Post-Prandial Blood Glucose (PPBG / PPBS)",
        "aliases": [
            "post prandial blood glucose",
            "postprandial blood glucose",
            "post prandial blood sugar",
            "post-meal blood glucose",
            "post-meal glucose",
            "post meal glucose",
            "post prandial glucose",
            "blood sugar post prandial",
            "blood sugar pp",
            "glucose post prandial",
            "glucose pp",
            "ppbs",
            "ppbg",
            "2 hr post meal glucose",
        ],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (40.0, 700.0), "mmol/l": (2.0, 40.0)},
        "what_it_measures": "Measures blood glucose levels approximately 2 hours after starting a meal.",
        "clinical_context": "Reflects how the body handles carbohydrate intake after eating.",
        "doctor_questions": [
            "What post-meal glucose range is appropriate for my age and health profile?",
            "How can pairing grains with pulses, vegetables, and protein help moderate post-meal spikes?",
        ],
        "related_condition_codes": ["type_2_diabetes", "diabetes_type2_prediabetes"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre and protein",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "carbs_g"],
            "preferred_slugs": [
                "toor-dal-red-gram",
                "green-gram-whole-moong",
                "chickpea-kabuli-chana",
                "spinach-palak",
                "curd-dahi-cow-milk",
                "ragi-finger-millet",
            ],
            "portion_sensitive_slugs": ["rice-raw-milled-white", "rice-raw-milled"],
            "educational_food_note": (
                "Pairing staple grain portions with fibre-rich pulses, greens, and protein helps slow carbohydrate digestion."
            ),
        },
        "kidney_caution": False,
    },
    "random_blood_glucose": {
        "canonical_code": "random_blood_glucose",
        "panel_category": "glucose_hba1c",
        "display_name": "Random Blood Glucose (RBS / RBG)",
        "aliases": [
            "random blood glucose",
            "random blood sugar",
            "random glucose",
            "glucose random",
            "rbs",
            "rbg",
        ],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (35.0, 700.0), "mmol/l": (2.0, 40.0)},
        "what_it_measures": "Measures blood glucose at a non-fasting time of day.",
        "clinical_context": "Interpreted in light of how recently you ate and alongside fasting glucose and HbA1c.",
        "doctor_questions": [
            "Should I follow up this random glucose test with a fasting glucose and HbA1c check?",
        ],
        "related_condition_codes": ["type_2_diabetes", "diabetes_type2_prediabetes"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g"],
            "preferred_slugs": ["green-gram-whole-moong", "chickpea-kabuli-chana", "spinach-palak", "ragi-finger-millet"],
            "portion_sensitive_slugs": ["rice-raw-milled-white", "rice-raw-milled"],
            "educational_food_note": "Focus on balanced plates combining pulses, vegetables, and moderate whole-grain portions.",
        },
        "kidney_caution": False,
    },
    "hba1c": {
        "canonical_code": "hba1c",
        "panel_category": "glucose_hba1c",
        "display_name": "Glycated Haemoglobin (HbA1c)",
        "aliases": [
            "glycated haemoglobin (hba1c)",
            "glycated hemoglobin (hba1c)",
            "hba1c",
            "glycated haemoglobin",
            "glycated hemoglobin",
            "glycosylated haemoglobin",
            "glycosylated hemoglobin",
            "hemoglobin a1c",
            "haemoglobin a1c",
            "hb a1c",
            "a1c",
        ],
        "typical_units": ["%", "mmol/mol"],
        "plausible_bounds": {"%": (3.0, 22.0), "mmol/mol": (15.0, 220.0)},
        "what_it_measures": "Reflects average blood glucose attachment to red blood cell haemoglobin over the preceding 8–12 weeks.",
        "clinical_context": "Provides a longer-term picture of glycaemic patterns; red blood cell turnover or anaemia can also influence HbA1c readings.",
        "doctor_questions": [
            "What personal HbA1c range is appropriate for me?",
            "Could my haemoglobin or iron status affect how my HbA1c is interpreted?",
        ],
        "related_condition_codes": ["type_2_diabetes", "diabetes_type2_prediabetes"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "sugars_total_g", "carbs_g"],
            "preferred_slugs": [
                "ragi-finger-millet",
                "green-gram-whole-moong",
                "chickpea-kabuli-chana",
                "toor-dal-red-gram",
                "spinach-palak",
                "fenugreek-leaves-methi",
                "paneer-cottage-cheese-cow",
            ],
            "portion_sensitive_slugs": ["rice-raw-milled-white", "rice-raw-milled", "potato-raw"],
            "educational_food_note": (
                "Consistent daily meal patterns built around high-fibre pulses, leafy greens, millets/whole wheat, "
                "and unsweetened protein sources support long-term glycaemic balance. No food cures or reverses diabetes."
            ),
        },
        "kidney_caution": False,
    },
    # Complete Blood Count (CBC)
    "haemoglobin": {
        "canonical_code": "haemoglobin",
        "panel_category": "cbc",
        "display_name": "Haemoglobin (Hb)",
        "aliases": [
            "haemoglobin (hb)",
            "hemoglobin (hb)",
            "haemoglobin",
            "hemoglobin",
            "hgb",
            "hb",
        ],
        "typical_units": ["g/dL", "g/L"],
        "plausible_bounds": {"g/dl": (3.0, 24.0), "g/l": (30.0, 240.0)},
        "what_it_measures": "Measures the oxygen-carrying protein inside red blood cells.",
        "clinical_context": (
            "Your report shows a haemoglobin measurement. A low haemoglobin result may have several causes "
            "(including iron, vitamin B12, or folate status, chronic inflammation, or inherited red-cell traits) "
            "and should be assessed with the full blood count (MCV, MCH, RBC) and iron/vitamin tests."
        ),
        "doctor_questions": [
            "What do my haemoglobin, MCV, MCH, and ferritin results together suggest about the cause of this finding?",
            "Should we check serum ferritin, iron studies, vitamin B12, or folate before considering any supplement?",
        ],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "folate_mcg", "folate_ug", "vit_c_mg", "vitamin_c_mg"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "vit_c_mg", "vitamin_c_mg", "folate_mcg", "folate_ug", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": [
                "amaranth-leaves-chaulai",
                "spinach-palak",
                "chickpea-kabuli-chana",
                "horse-gram-kulthi",
                "lentil-masoor-dal",
                "toor-dal-red-gram",
                "ragi-finger-millet",
                "guava-pink-flesh",
                "amla-indian-gooseberry",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "Non-haem iron in plant foods (legumes, pulses, leafy greens, and millets) has lower absorption than haem iron; "
                "pairing iron-containing meals with vitamin C sources (such as amla, guava, or lemon) helps support non-haem iron absorption, "
                "while avoiding tea or coffee with meals."
            ),
        },
        "kidney_caution": False,
    },
    "rbc_count": {
        "canonical_code": "rbc_count",
        "panel_category": "cbc",
        "display_name": "Red Blood Cell Count (RBC)",
        "aliases": ["rbc count", "red blood cell count", "red blood cells", "erythrocyte count", "total rbc", "rbc"],
        "typical_units": ["million/µL", "10^6/µL", "million/cumm", "x10^12/L"],
        "plausible_bounds": {"million/µl": (1.0, 9.0), "10^6/µl": (1.0, 9.0), "million/cumm": (1.0, 9.0), "x10^12/l": (1.0, 9.0)},
        "what_it_measures": "Counts the number of red blood cells per unit volume of blood.",
        "clinical_context": "Interpreted together with haemoglobin, haematocrit, MCV, and MCH.",
        "doctor_questions": ["How does my RBC count relate to my haemoglobin and red cell indices (MCV, MCH)?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "folate_mcg", "folate_ug", "protein_g"],
            "short_reason_label": "Provides iron and protein",
            "prefer_high": ["iron_mg", "folate_mcg", "folate_ug", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": ["spinach-palak", "lentil-masoor-dal", "chickpea-kabuli-chana", "toor-dal-red-gram", "egg-poultry-whole-boiled"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Adequate dietary iron, folate, vitamin B12, and protein support normal red blood cell production.",
        },
        "kidney_caution": False,
    },
    "wbc_count": {
        "canonical_code": "wbc_count",
        "panel_category": "cbc",
        "display_name": "White Blood Cell Count (WBC / TLC)",
        "aliases": [
            "wbc count",
            "white blood cell count",
            "white blood cells",
            "total wbc",
            "total leucocyte count",
            "total leukocyte count",
            "leukocytes",
            "leucocytes",
            "tlc",
            "wbc",
        ],
        "typical_units": ["cells/µL", "/cumm", "10^3/µL", "x10^9/L"],
        "plausible_bounds": {"cells/µl": (500.0, 100000.0), "/cumm": (500.0, 100000.0), "10^3/µl": (0.5, 100.0), "x10^9/l": (0.5, 100.0)},
        "what_it_measures": "Measures total infection-fighting white blood cells circulating in blood.",
        "clinical_context": "Can shift with recent infections, inflammation, physical stress, or medications.",
        "doctor_questions": ["Does my total WBC count reflect a recent infection or require follow-up?"],
        "related_condition_codes": [],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["protein_g", "vit_c_mg", "vitamin_c_mg"],
            "short_reason_label": "Provides protein and vitamin C",
            "prefer_high": ["protein_g", "vit_c_mg", "vitamin_c_mg"],
            "monitor_high": [],
            "preferred_slugs": ["khichdi-moong-dal-rice", "curd-dahi-cow-milk", "amla-indian-gooseberry", "spinach-palak"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Balanced protein, hydration, and micronutrient-dense whole foods support normal immune function.",
        },
        "kidney_caution": False,
    },
    "platelet_count": {
        "canonical_code": "platelet_count",
        "panel_category": "cbc",
        "display_name": "Platelet Count",
        "aliases": ["platelet count", "platelets", "platelet", "thrombocyte count", "plt"],
        "typical_units": ["lakh/cumm", "10^3/µL", "/µL", "x10^9/L"],
        "plausible_bounds": {"lakh/cumm": (0.1, 15.0), "10^3/µl": (10.0, 1500.0), "x10^9/l": (10.0, 1500.0)},
        "what_it_measures": "Measures blood cell fragments essential for normal clotting.",
        "clinical_context": "May decrease during viral fevers or nutritional deficiencies, or increase with reactive inflammation.",
        "doctor_questions": ["Does my platelet count require a repeat check or clinical follow-up?"],
        "related_condition_codes": [],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["folate_mcg", "folate_ug", "vit_c_mg", "vitamin_c_mg"],
            "short_reason_label": "Provides folate and vitamin C",
            "prefer_high": ["folate_mcg", "folate_ug", "vit_c_mg", "vitamin_c_mg", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": ["khichdi-moong-dal-rice", "pomegranate-anar", "papaya-ripe", "spinach-palak"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Focus on hydration and balanced home-cooked meals; no food replaces medical monitoring for abnormal platelet counts.",
        },
        "kidney_caution": False,
    },
    "hematocrit_pcv": {
        "canonical_code": "hematocrit_pcv",
        "panel_category": "cbc",
        "display_name": "Haematocrit / Packed Cell Volume (PCV / HCT)",
        "aliases": ["packed cell volume (pcv / haematocrit)", "packed cell volume", "haematocrit", "hematocrit", "pcv", "hct"],
        "typical_units": ["%"],
        "plausible_bounds": {"%": (10.0, 70.0)},
        "what_it_measures": "Measures the percentage of blood volume occupied by red blood cells.",
        "clinical_context": "Interpreted together with haemoglobin, red cell count, and hydration status.",
        "doctor_questions": ["How does my haematocrit/PCV align with my haemoglobin and iron studies?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "protein_g"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": ["spinach-palak", "amaranth-leaves-chaulai", "lentil-masoor-dal", "chickpea-kabuli-chana"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Maintain steady hydration and adequate dietary iron, folate, and protein intake.",
        },
        "kidney_caution": False,
    },
    "mcv": {
        "canonical_code": "mcv",
        "panel_category": "cbc",
        "display_name": "Mean Corpuscular Volume (MCV)",
        "aliases": ["mean corpuscular volume (mcv)", "mean corpuscular volume", "mcv"],
        "typical_units": ["fL"],
        "plausible_bounds": {"fl": (40.0, 150.0)},
        "what_it_measures": "Measures the average size (volume) of red blood cells.",
        "clinical_context": "Low MCV (microcytosis) often prompts evaluation of iron status or thalassaemia trait; high MCV (macrocytosis) often prompts evaluation of vitamin B12 or folate status.",
        "doctor_questions": ["What does my MCV indicate alongside my haemoglobin, ferritin, vitamin B12, and folate?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "folate_mcg", "folate_ug", "vit_b12_mcg", "vitamin_b12_ug"],
            "short_reason_label": "Provides iron and folate",
            "prefer_high": ["iron_mg", "folate_mcg", "folate_ug", "vit_b12_mcg", "vitamin_b12_ug"],
            "monitor_high": [],
            "preferred_slugs": ["spinach-palak", "amaranth-leaves-chaulai", "lentil-masoor-dal", "curd-dahi-cow-milk", "paneer-cottage-cheese-cow"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Nutritional focus depends on whether MCV is low (iron-containing foods + vitamin C) or high (vitamin B12 and folate sources).",
        },
        "kidney_caution": False,
    },
    "mch": {
        "canonical_code": "mch",
        "panel_category": "cbc",
        "display_name": "Mean Corpuscular Haemoglobin (MCH)",
        "aliases": ["mean corpuscular haemoglobin (mch)", "mean corpuscular hemoglobin (mch)", "mean corpuscular haemoglobin", "mean corpuscular hemoglobin", "mch"],
        "typical_units": ["pg"],
        "plausible_bounds": {"pg": (12.0, 50.0)},
        "what_it_measures": "Measures the average amount of haemoglobin per red blood cell.",
        "clinical_context": "Interpreted alongside haemoglobin, MCV, and MCHC.",
        "doctor_questions": ["How does my MCH fit with my overall CBC and iron/vitamin profile?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "protein_g"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": ["amaranth-leaves-chaulai", "spinach-palak", "chickpea-kabuli-chana", "lentil-masoor-dal"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Supports evaluation of haemoglobin synthesis alongside iron, folate, and vitamin B12.",
        },
        "kidney_caution": False,
    },
    "mchc": {
        "canonical_code": "mchc",
        "panel_category": "cbc",
        "display_name": "Mean Corpuscular Haemoglobin Concentration (MCHC)",
        "aliases": [
            "mean corpuscular haemoglobin concentration (mchc)",
            "mean corpuscular hemoglobin concentration (mchc)",
            "mean corpuscular haemoglobin concentration",
            "mean corpuscular hemoglobin concentration",
            "mchc",
        ],
        "typical_units": ["g/dL", "%"],
        "plausible_bounds": {"g/dl": (20.0, 45.0), "%": (20.0, 45.0)},
        "what_it_measures": "Measures the average concentration of haemoglobin inside a given volume of red blood cells.",
        "clinical_context": "Interpreted with haemoglobin, MCV, and MCH to assess red blood cell haemoglobin density.",
        "doctor_questions": ["What do my MCHC, MCV, and haemoglobin together indicate?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "protein_g"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": ["amaranth-leaves-chaulai", "spinach-palak", "chickpea-kabuli-chana", "lentil-masoor-dal"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Assess alongside iron, folate, and vitamin B12 status.",
        },
        "kidney_caution": False,
    },
    # Iron Studies
    "serum_ferritin": {
        "canonical_code": "serum_ferritin",
        "panel_category": "nutritional_markers",
        "display_name": "Serum Ferritin",
        "aliases": ["serum ferritin", "ferritin - serum", "ferritin, serum", "ferritin"],
        "typical_units": ["ng/mL", "µg/L"],
        "plausible_bounds": {"ng/ml": (1.0, 2000.0), "µg/l": (1.0, 2000.0)},
        "what_it_measures": "Measures the body's primary iron storage protein.",
        "clinical_context": "A low ferritin result supports depleted iron stores; ferritin can also rise during inflammation or infection.",
        "doctor_questions": [
            "What does my ferritin level indicate about my iron stores alongside my haemoglobin?",
            "Should I take a clinician-prescribed iron supplement in addition to iron-rich foods?",
        ],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "vit_c_mg", "vitamin_c_mg"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "vit_c_mg", "vitamin_c_mg"],
            "monitor_high": [],
            "preferred_slugs": [
                "amaranth-leaves-chaulai",
                "spinach-palak",
                "horse-gram-kulthi",
                "chickpea-kabuli-chana",
                "lentil-masoor-dal",
                "toor-dal-red-gram",
                "ragi-finger-millet",
                "amla-indian-gooseberry",
                "guava-pink-flesh",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "Plant foods provide non-haem iron whose absorption is enhanced by vitamin C (amla, guava, lemon) "
                "and reduced by phytates or tannins when tea/coffee is consumed with meals."
            ),
        },
        "kidney_caution": False,
    },
    "serum_iron": {
        "canonical_code": "serum_iron",
        "panel_category": "nutritional_markers",
        "display_name": "Serum Iron",
        "aliases": ["serum iron", "iron, serum", "iron - serum", "iron (fe)", "total iron", "iron"],
        "typical_units": ["µg/dL", "ug/dL", "µmol/L"],
        "plausible_bounds": {"µg/dl": (5.0, 400.0), "ug/dl": (5.0, 400.0), "µmol/l": (1.0, 80.0)},
        "what_it_measures": "Measures circulating iron bound to transferrin in the blood.",
        "clinical_context": "Interpreted together with serum ferritin, TIBC, and transferrin saturation.",
        "doctor_questions": ["How does my serum iron compare with my ferritin and transferrin saturation?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "vit_c_mg", "vitamin_c_mg"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "vit_c_mg", "vitamin_c_mg"],
            "monitor_high": [],
            "preferred_slugs": [
                "amaranth-leaves-chaulai",
                "spinach-palak",
                "chickpea-kabuli-chana",
                "lentil-masoor-dal",
                "horse-gram-kulthi",
                "amla-indian-gooseberry",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Include iron-containing pulses and leafy greens paired with vitamin C foods.",
        },
        "kidney_caution": False,
    },
    "transferrin_saturation": {
        "canonical_code": "transferrin_saturation",
        "panel_category": "nutritional_markers",
        "display_name": "Transferrin Saturation (TSAT)",
        "aliases": [
            "transferrin saturation (tsat)",
            "transferrin saturation",
            "% transferrin saturation",
            "iron saturation",
            "tsat",
        ],
        "typical_units": ["%"],
        "plausible_bounds": {"%": (1.0, 100.0)},
        "what_it_measures": "Measures the percentage of iron-binding sites on transferrin that are occupied by iron.",
        "clinical_context": "Evaluated with serum iron, TIBC, and ferritin to assess iron availability for red blood cell production.",
        "doctor_questions": ["What do my transferrin saturation and ferritin together indicate about my iron status?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "vit_c_mg", "vitamin_c_mg"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg", "vit_c_mg", "vitamin_c_mg"],
            "monitor_high": [],
            "preferred_slugs": ["amaranth-leaves-chaulai", "spinach-palak", "chickpea-kabuli-chana", "lentil-masoor-dal", "amla-indian-gooseberry"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Pair iron-containing legumes and greens with vitamin C foods to support non-haem iron absorption.",
        },
        "kidney_caution": False,
    },
    "tibc": {
        "canonical_code": "tibc",
        "panel_category": "nutritional_markers",
        "display_name": "Total Iron Binding Capacity (TIBC)",
        "aliases": ["total iron binding capacity (tibc)", "total iron binding capacity", "iron binding capacity", "tibc"],
        "typical_units": ["µg/dL", "ug/dL"],
        "plausible_bounds": {"µg/dl": (80.0, 750.0), "ug/dl": (80.0, 750.0)},
        "what_it_measures": "Measures the blood's capacity to bind iron with transferrin.",
        "clinical_context": "TIBC often rises when iron stores are low; always interpreted alongside serum iron and ferritin.",
        "doctor_questions": ["How does my TIBC relate to my serum iron and ferritin results?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["iron_mg", "protein_g"],
            "short_reason_label": "Provides iron",
            "prefer_high": ["iron_mg"],
            "monitor_high": [],
            "preferred_slugs": ["amaranth-leaves-chaulai", "spinach-palak", "chickpea-kabuli-chana", "lentil-masoor-dal"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Interpret TIBC together with serum iron and ferritin.",
        },
        "kidney_caution": False,
    },
    # Vitamins & Minerals
    "vitamin_b12": {
        "canonical_code": "vitamin_b12",
        "panel_category": "nutritional_markers",
        "display_name": "Vitamin B12 (Cobalamin)",
        "aliases": [
            "vitamin b12 (cobalamin)",
            "vitamin b12 (cyanocobalamin)",
            "serum vitamin b12",
            "vitamin b12",
            "vitamin b-12",
            "vit b12",
            "vit. b12",
            "cobalamin",
            "cyanocobalamin",
            "b12",
        ],
        "typical_units": ["pg/mL", "pmol/L"],
        "plausible_bounds": {"pg/ml": (20.0, 3000.0), "pmol/l": (15.0, 2200.0)},
        "what_it_measures": "Measures circulating vitamin B12, required for red blood cell maturation and nerve function.",
        "clinical_context": "Low vitamin B12 is common in vegetarian or vegan diets or when gastric absorption is reduced (such as with long-term metformin use).",
        "doctor_questions": [
            "Given my vitamin B12 level and dietary preference, do you recommend a B12 supplement?",
            "Could any of my regular medications affect vitamin B12 absorption?",
        ],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["vit_b12_mcg", "vitamin_b12_ug", "protein_g"],
            "short_reason_label": "Contains vitamin B12",
            "prefer_high": ["vit_b12_mcg", "vitamin_b12_ug", "protein_g"],
            "monitor_high": [],
            "preferred_slugs": [
                "curd-dahi-cow-milk",
                "paneer-cottage-cheese-cow",
                "milk-cow-whole",
                "egg-poultry-whole-boiled",
                "rohu-fish-fresh",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "Unfortified plant foods do not provide vitamin B12. For vegetarian members, dairy foods (milk, curd, paneer) provide modest dietary vitamin B12; "
                "animal-derived foods (such as eggs or fish) are only shown when compatible with your dietary preference or clearly flagged. Discuss supplementation with your doctor when B12 is low."
            ),
        },
        "kidney_caution": False,
    },
    "vitamin_d_25oh": {
        "canonical_code": "vitamin_d_25oh",
        "panel_category": "nutritional_markers",
        "display_name": "25-Hydroxy Vitamin D (Vitamin D)",
        "aliases": [
            "25-hydroxy vitamin d (vitamin d)",
            "25-hydroxy vitamin d",
            "25-oh vitamin d",
            "25 hydroxy vitamin d",
            "vitamin d (25-oh)",
            "vitamin d (25-hydroxy)",
            "vitamin d, 25-hydroxy",
            "vitamin d total",
            "25-oh vit d",
            "vitamin d3",
            "vitamin d",
            "vit d",
            "25(oh)d",
        ],
        "typical_units": ["ng/mL", "nmol/L"],
        "plausible_bounds": {"ng/ml": (2.0, 200.0), "nmol/l": (5.0, 500.0)},
        "what_it_measures": "Measures the main circulating storage form of vitamin D, essential for calcium absorption and bone health.",
        "clinical_context": "Food alone will not correct every low vitamin D result because very few foods naturally contain significant vitamin D; safe sunlight exposure and clinician-guided supplementation are often needed.",
        "doctor_questions": [
            "Does my 25-OH Vitamin D result require a clinician-prescribed vitamin D supplement?",
            "How should I combine dietary calcium and vitamin D sources with safe sunlight exposure?",
        ],
        "related_condition_codes": ["osteoporosis_bone_health"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["vit_d_mcg", "vitamin_d_ug", "calcium_mg"],
            "short_reason_label": "Contains vitamin D / supports calcium intake",
            "prefer_high": ["vit_d_mcg", "vitamin_d_ug", "calcium_mg"],
            "monitor_high": [],
            "preferred_slugs": [
                "milk-cow-whole",
                "curd-dahi-cow-milk",
                "paneer-cottage-cheese-cow",
                "ragi-finger-millet",
                "sesame-seeds-til-white",
                "egg-poultry-whole-boiled",
                "rohu-fish-fresh",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "Only foods with documented vitamin D composition in the GharPlate database are listed for direct vitamin D content, "
                "alongside calcium-rich Indian foods (such as ragi, curd, milk, and paneer) that work together with vitamin D for bone health. "
                "Food alone may not correct a low vitamin D level."
            ),
        },
        "kidney_caution": False,
    },
    "serum_folate": {
        "canonical_code": "serum_folate",
        "panel_category": "nutritional_markers",
        "display_name": "Serum Folate (Folic Acid / Vitamin B9)",
        "aliases": ["serum folate (folic acid / vitamin b9)", "serum folate", "folic acid (folate)", "folate (vitamin b9)", "folic acid", "folate", "vitamin b9"],
        "typical_units": ["ng/mL", "nmol/L"],
        "plausible_bounds": {"ng/ml": (0.5, 60.0), "nmol/l": (1.0, 140.0)},
        "what_it_measures": "Measures folate (vitamin B9), required for DNA synthesis and red blood cell maturation.",
        "clinical_context": "Interpreted together with vitamin B12, haemoglobin, and MCV.",
        "doctor_questions": ["How do my folate and vitamin B12 results relate to my full blood count?"],
        "related_condition_codes": ["iron_deficiency_anaemia"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["folate_mcg", "folate_ug", "iron_mg"],
            "short_reason_label": "Provides dietary folate",
            "prefer_high": ["folate_mcg", "folate_ug", "iron_mg"],
            "monitor_high": [],
            "preferred_slugs": [
                "spinach-palak",
                "amaranth-leaves-chaulai",
                "chickpea-kabuli-chana",
                "green-gram-whole-moong",
                "lentil-masoor-dal",
                "toor-dal-red-gram",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Leafy greens (palak, chaulai, methi) and pulses (moong, chana, masoor, toor dal) are rich natural sources of folate.",
        },
        "kidney_caution": False,
    },
    "serum_calcium": {
        "canonical_code": "serum_calcium",
        "panel_category": "nutritional_markers",
        "display_name": "Serum Calcium",
        "aliases": ["serum calcium", "calcium, serum", "calcium total", "calcium (total)", "calcium"],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (5.0, 16.0), "mmol/l": (1.2, 4.0)},
        "what_it_measures": "Measures calcium circulating in blood, regulated by vitamin D, parathyroid hormone, and kidneys.",
        "clinical_context": "Interpreted alongside serum albumin, 25-OH vitamin D, and kidney function.",
        "doctor_questions": ["How does my serum calcium look when interpreted alongside albumin and vitamin D?"],
        "related_condition_codes": ["osteoporosis_bone_health"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["calcium_mg"],
            "short_reason_label": "Provides calcium",
            "prefer_high": ["calcium_mg"],
            "monitor_high": [],
            "preferred_slugs": ["ragi-finger-millet", "curd-dahi-cow-milk", "paneer-cottage-cheese-cow", "milk-cow-whole", "sesame-seeds-til-white"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Ragi (finger millet), curd, milk, paneer, and sesame seeds provide dietary calcium.",
        },
        "kidney_caution": False,
    },
    # Lipid Profile
    "total_cholesterol": {
        "canonical_code": "total_cholesterol",
        "panel_category": "lipid_profile",
        "display_name": "Total Cholesterol",
        "aliases": ["total cholesterol", "cholesterol total", "cholesterol, total", "serum cholesterol"],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (60.0, 600.0), "mmol/l": (1.5, 16.0)},
        "what_it_measures": "Measures combined cholesterol across LDL, HDL, and VLDL particles in blood.",
        "clinical_context": "Evaluated together with LDL, HDL, triglycerides, blood pressure, and metabolic profile.",
        "doctor_questions": [
            "How should I interpret my total cholesterol alongside my LDL, HDL, and triglycerides?",
        ],
        "related_condition_codes": ["dyslipidaemia_cardiovascular"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["fat_saturated_g", "fat_total_g"],
            "preferred_slugs": [
                "oats-rolled-plain",
                "packaged-rolled-oats-plain",
                "green-gram-whole-moong",
                "chickpea-kabuli-chana",
                "ragi-finger-millet",
                "spinach-palak",
                "walnut-akhrot",
            ],
            "portion_sensitive_slugs": ["ghee-cow-clarified-butter"],
            "educational_food_note": (
                "Soluble dietary fibre from oats, pulses, and vegetables, alongside moderating saturated fats and deep-fried foods, "
                "supports healthy lipid patterns. No single food treats high cholesterol on its own."
            ),
        },
        "kidney_caution": False,
    },
    "ldl_cholesterol": {
        "canonical_code": "ldl_cholesterol",
        "panel_category": "lipid_profile",
        "display_name": "LDL Cholesterol (Low-Density Lipoprotein)",
        "aliases": [
            "ldl cholesterol (low-density lipoprotein)",
            "ldl cholesterol",
            "ldl-cholesterol",
            "ldl-c",
            "low density lipoprotein",
            "cholesterol ldl",
            "direct ldl",
            "calculated ldl",
            "ldl",
        ],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (20.0, 400.0), "mmol/l": (0.5, 11.0)},
        "what_it_measures": "Measures cholesterol carried in low-density lipoprotein particles.",
        "clinical_context": "Clinicians interpret LDL targets alongside overall cardiovascular risk, blood pressure, and blood glucose.",
        "doctor_questions": [
            "What is my target LDL range given my overall cardiovascular profile?",
        ],
        "related_condition_codes": ["dyslipidaemia_cardiovascular"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g"],
            "monitor_high": ["fat_saturated_g"],
            "preferred_slugs": [
                "oats-rolled-plain",
                "packaged-rolled-oats-plain",
                "chickpea-kabuli-chana",
                "green-gram-whole-moong",
                "toor-dal-red-gram",
                "fenugreek-leaves-methi",
                "spinach-palak",
                "almonds-badam",
                "almond-badam",
                "walnut-akhrot",
            ],
            "portion_sensitive_slugs": ["ghee-cow-clarified-butter"],
            "educational_food_note": (
                "Foods rich in soluble fibre (oats, legumes, methi, vegetables) and replacing excess saturated fats with unsaturated fats "
                "support healthy LDL balance. No single food replaces medical care for high cholesterol."
            ),
        },
        "kidney_caution": False,
    },
    "hdl_cholesterol": {
        "canonical_code": "hdl_cholesterol",
        "panel_category": "lipid_profile",
        "display_name": "HDL Cholesterol (High-Density Lipoprotein)",
        "aliases": ["hdl cholesterol (high-density lipoprotein)", "hdl cholesterol", "hdl-cholesterol", "hdl-c", "high density lipoprotein", "cholesterol hdl", "hdl"],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (10.0, 150.0), "mmol/l": (0.2, 4.0)},
        "what_it_measures": "Measures cholesterol carried in high-density lipoprotein particles involved in reverse cholesterol transport.",
        "clinical_context": "Lower HDL values are often evaluated alongside triglycerides, physical activity, and glycaemic status.",
        "doctor_questions": ["What combination of regular physical activity and dietary fats can help support my HDL profile?"],
        "related_condition_codes": ["dyslipidaemia_cardiovascular"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides healthy fats and fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "fat_saturated_g"],
            "preferred_slugs": ["walnut-akhrot", "almonds-badam", "almond-badam", "groundnut-peanut-raw", "oats-rolled-plain", "rohu-fish-fresh"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Regular aerobic movement, reducing refined sugars, and including unsaturated fats from nuts, seeds, or fish support HDL balance.",
        },
        "kidney_caution": False,
    },
    "triglycerides": {
        "canonical_code": "triglycerides",
        "panel_category": "lipid_profile",
        "display_name": "Triglycerides (TG)",
        "aliases": ["triglycerides (tg)", "serum triglycerides", "triglycerides", "triglyceride", "tgl", "tg"],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (25.0, 1500.0), "mmol/l": (0.3, 18.0)},
        "what_it_measures": "Measures circulating blood fats influenced by recent meals, refined carbohydrates, added sugars, and dietary fats.",
        "clinical_context": "Evaluated with fasting status, blood glucose/HbA1c, and HDL cholesterol.",
        "doctor_questions": [
            "How do my triglycerides relate to my fasting status and blood sugar profile?",
        ],
        "related_condition_codes": ["dyslipidaemia_cardiovascular", "type_2_diabetes"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "sugars_total_g", "carbs_g", "fat_total_g"],
            "preferred_slugs": [
                "ragi-finger-millet",
                "green-gram-whole-moong",
                "toor-dal-red-gram",
                "chickpea-kabuli-chana",
                "spinach-palak",
                "walnut-akhrot",
            ],
            "portion_sensitive_slugs": ["rice-raw-milled-white", "rice-raw-milled"],
            "educational_food_note": (
                "Moderating sugary beverages, sweets, and refined flour while choosing fibre-rich pulses, vegetables, and whole grains helps manage triglycerides."
            ),
        },
        "kidney_caution": False,
    },
    # Kidney Function Markers (STRICT SAFETY GUARDRAILS)
    "serum_creatinine": {
        "canonical_code": "serum_creatinine",
        "panel_category": "kidney_function",
        "display_name": "Serum Creatinine",
        "aliases": ["serum creatinine", "creatinine, serum", "creatinine - serum", "creatinine"],
        "typical_units": ["mg/dL", "µmol/L"],
        "plausible_bounds": {"mg/dl": (0.2, 8.5), "µmol/l": (20.0, 900.0)},
        "what_it_measures": "Measures a waste product from normal muscle breakdown filtered by the kidneys.",
        "clinical_context": "Interpreted together with eGFR, blood urea, urine albumin, hydration, and blood pressure.",
        "doctor_questions": [
            "What do my serum creatinine and eGFR indicate about my kidney function?",
            "Do I need individualised guidance on protein, potassium, sodium, phosphorus, or fluid intake?",
        ],
        "related_condition_codes": ["chronic_kidney_disease", "chronic_kidney_disease_stage_aware"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": [],
            "short_reason_label": "Requires clinician-guided renal nutrition",
            "prefer_high": [],
            "monitor_high": ["sodium_mg", "potassium_mg", "protein_g"],
            "preferred_slugs": [],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "KIDNEY SAFETY NOTICE: Kidney-related dietary needs (protein, potassium, phosphorus, sodium, and fluids) "
                "are highly individualised. GharPlate does not automatically recommend high-protein, high-potassium, or high-phosphorus foods "
                "when kidney markers are abnormal. Please review these results with your doctor or renal dietitian."
            ),
        },
        "kidney_caution": True,
    },
    "egfr": {
        "canonical_code": "egfr",
        "panel_category": "kidney_function",
        "display_name": "Estimated Glomerular Filtration Rate (eGFR)",
        "aliases": ["estimated glomerular filtration rate (egfr)", "estimated glomerular filtration rate", "glomerular filtration rate", "egfr"],
        "typical_units": ["mL/min/1.73m²", "mL/min/1.73m2", "mL/min"],
        "plausible_bounds": {"ml/min/1.73m²": (5.0, 180.0), "ml/min/1.73m2": (5.0, 180.0), "ml/min": (5.0, 180.0)},
        "what_it_measures": "Estimates how efficiently the kidneys filter waste from blood per minute.",
        "clinical_context": "Evaluated over time alongside serum creatinine, electrolytes, urine albumin, blood pressure, and blood glucose.",
        "doctor_questions": [
            "What does my eGFR indicate, and should I follow any specific sodium, potassium, phosphorus, or protein guidelines?",
        ],
        "related_condition_codes": ["chronic_kidney_disease", "chronic_kidney_disease_stage_aware"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": [],
            "short_reason_label": "Requires clinician-guided renal nutrition",
            "prefer_high": [],
            "monitor_high": ["sodium_mg", "potassium_mg", "protein_g"],
            "preferred_slugs": [],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "KIDNEY SAFETY NOTICE: Kidney nutrition must be tailored to your eGFR stage and serum electrolyte levels by your physician."
            ),
        },
        "kidney_caution": True,
    },
    "blood_urea": {
        "canonical_code": "blood_urea",
        "panel_category": "kidney_function",
        "display_name": "Blood Urea / BUN",
        "aliases": ["blood urea / bun", "blood urea nitrogen", "blood urea", "serum urea", "urea - blood", "bun", "urea"],
        "typical_units": ["mg/dL", "mmol/L"],
        "plausible_bounds": {"mg/dl": (3.0, 250.0), "mmol/l": (1.0, 90.0)},
        "what_it_measures": "Measures urea nitrogen in blood, a byproduct of protein metabolism cleared by the kidneys.",
        "clinical_context": "Influenced by kidney filtration, hydration status, and protein intake.",
        "doctor_questions": ["How does my blood urea/BUN relate to my creatinine, eGFR, and hydration?"],
        "related_condition_codes": ["chronic_kidney_disease", "chronic_kidney_disease_stage_aware"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": [],
            "short_reason_label": "Requires clinician-guided renal nutrition",
            "prefer_high": [],
            "monitor_high": ["sodium_mg", "protein_g"],
            "preferred_slugs": [],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "KIDNEY SAFETY NOTICE: Discuss appropriate daily protein and fluid intake with your physician before altering your diet."
            ),
        },
        "kidney_caution": True,
    },
    "serum_potassium": {
        "canonical_code": "serum_potassium",
        "panel_category": "kidney_function",
        "display_name": "Serum Potassium (K+)",
        "aliases": ["serum potassium (k+)", "serum potassium", "potassium, serum", "potassium - serum", "potassium (k+)", "potassium"],
        "typical_units": ["mmol/L", "mEq/L"],
        "plausible_bounds": {"mmol/l": (2.0, 8.5), "meq/l": (2.0, 8.5)},
        "what_it_measures": "Measures blood potassium concentration, critical for heart rhythm, nerve signalling, and muscle function.",
        "clinical_context": "Abnormal potassium requires prompt medical review alongside kidney function and medications.",
        "doctor_questions": [
            "Does my serum potassium level require urgent medical review or specific dietary potassium adjustments?",
        ],
        "related_condition_codes": ["chronic_kidney_disease", "chronic_kidney_disease_stage_aware"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": [],
            "short_reason_label": "Requires clinician-guided electrolyte review",
            "prefer_high": [],
            "monitor_high": ["potassium_mg", "sodium_mg"],
            "preferred_slugs": [],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "KIDNEY & ELECTROLYTE SAFETY NOTICE: Because serum potassium is outside the reference interval, "
                "high-potassium foods and salt substitutes must not be added without direct medical guidance."
            ),
        },
        "kidney_caution": True,
    },
    "serum_sodium": {
        "canonical_code": "serum_sodium",
        "panel_category": "kidney_function",
        "display_name": "Serum Sodium (Na+)",
        "aliases": ["serum sodium (na+)", "serum sodium", "sodium, serum", "sodium - serum", "sodium (na+)", "sodium"],
        "typical_units": ["mmol/L", "mEq/L"],
        "plausible_bounds": {"mmol/l": (110.0, 175.0), "meq/l": (110.0, 175.0)},
        "what_it_measures": "Measures blood sodium concentration, reflecting fluid and electrolyte balance.",
        "clinical_context": "Interpreted alongside hydration status, kidney function, and medications (such as diuretics).",
        "doctor_questions": ["What does my serum sodium indicate about my fluid and salt intake?"],
        "related_condition_codes": ["chronic_kidney_disease"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": [],
            "short_reason_label": "Requires clinician-guided fluid/sodium review",
            "prefer_high": [],
            "monitor_high": ["sodium_mg"],
            "preferred_slugs": [],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Discuss fluid and sodium intake with your doctor when serum sodium is outside the reference range.",
        },
        "kidney_caution": True,
    },
    "uric_acid": {
        "canonical_code": "uric_acid",
        "panel_category": "kidney_function",
        "display_name": "Serum Uric Acid",
        "aliases": ["serum uric acid", "uric acid, serum", "uric acid"],
        "typical_units": ["mg/dL", "µmol/L"],
        "plausible_bounds": {"mg/dl": (1.0, 18.0), "µmol/l": (60.0, 1100.0)},
        "what_it_measures": "Measures uric acid produced from purine breakdown and excreted via the kidneys.",
        "clinical_context": "Interpreted alongside joint symptoms, kidney markers, and hydration.",
        "doctor_questions": ["What hydration and dietary adjustments are appropriate for my uric acid level?"],
        "related_condition_codes": ["hyperuricaemia_gout", "chronic_kidney_disease"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": [],
            "short_reason_label": "Requires clinician-guided review",
            "prefer_high": [],
            "monitor_high": ["sugars_added_g"],
            "preferred_slugs": [],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Discuss hydration, limiting fructose-sweetened beverages, and kidney function with your physician.",
        },
        "kidney_caution": True,
    },
    # Liver Function Markers
    "alt_sgpt": {
        "canonical_code": "alt_sgpt",
        "panel_category": "liver_function",
        "display_name": "ALT / SGPT (Alanine Aminotransferase)",
        "aliases": [
            "alt / sgpt (alanine aminotransferase)",
            "alanine aminotransferase",
            "alanine transaminase",
            "alt (sgpt)",
            "sgpt (alt)",
            "alt/sgpt",
            "sgpt",
            "alt",
        ],
        "typical_units": ["U/L", "IU/L"],
        "plausible_bounds": {"u/l": (1.0, 2000.0), "iu/l": (1.0, 2000.0)},
        "what_it_measures": "Measures an enzyme found mainly in liver cells that rises in blood when liver cells are stressed.",
        "clinical_context": "Interpreted alongside AST, alkaline phosphatase, bilirubin, metabolic factors, and medications.",
        "doctor_questions": [
            "What might be contributing to my ALT/SGPT result, and should I avoid any over-the-counter or herbal supplements?",
        ],
        "related_condition_codes": [],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "fat_saturated_g"],
            "preferred_slugs": [
                "green-gram-whole-moong",
                "toor-dal-red-gram",
                "spinach-palak",
                "oats-rolled-plain",
                "papaya-ripe",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "Balanced home-cooked meals with pulses, whole grains, and vegetables, while avoiding alcohol, excess added sugars, and unprescribed supplements, support liver health."
            ),
        },
        "kidney_caution": False,
    },
    "ast_sgot": {
        "canonical_code": "ast_sgot",
        "panel_category": "liver_function",
        "display_name": "AST / SGOT (Aspartate Aminotransferase)",
        "aliases": [
            "ast / sgot (aspartate aminotransferase)",
            "aspartate aminotransferase",
            "aspartate transaminase",
            "ast (sgot)",
            "sgot (ast)",
            "ast/sgot",
            "sgot",
            "ast",
        ],
        "typical_units": ["U/L", "IU/L"],
        "plausible_bounds": {"u/l": (1.0, 2000.0), "iu/l": (1.0, 2000.0)},
        "what_it_measures": "Measures an enzyme present in the liver, heart, and skeletal muscle.",
        "clinical_context": "Interpreted alongside ALT, alkaline phosphatase, bilirubin, and recent strenuous exercise.",
        "doctor_questions": ["How does my AST/SGOT result compare with my ALT and bilirubin?"],
        "related_condition_codes": [],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["fibre_g", "protein_g"],
            "short_reason_label": "Provides dietary fibre and protein",
            "prefer_high": ["fibre_g", "protein_g"],
            "monitor_high": ["sugars_added_g", "fat_saturated_g"],
            "preferred_slugs": ["khichdi-moong-dal-rice", "green-gram-whole-moong", "toor-dal-red-gram", "spinach-palak"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Prioritise freshly cooked, low-oil home meals, pulses, and vegetables.",
        },
        "kidney_caution": False,
    },
    "total_bilirubin": {
        "canonical_code": "total_bilirubin",
        "panel_category": "liver_function",
        "display_name": "Total Bilirubin",
        "aliases": ["bilirubin total", "bilirubin, total", "total bilirubin", "serum bilirubin", "bilirubin"],
        "typical_units": ["mg/dL", "µmol/L"],
        "plausible_bounds": {"mg/dl": (0.05, 30.0), "µmol/l": (1.0, 500.0)},
        "what_it_measures": "Measures bilirubin formed during normal red blood cell breakdown and cleared by the liver.",
        "clinical_context": "Evaluated with direct/indirect bilirubin fractions, ALT, AST, and ALP.",
        "doctor_questions": ["How do my direct and indirect bilirubin fractions compare with my liver enzymes?"],
        "related_condition_codes": [],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["carbs_g", "protein_g"],
            "short_reason_label": "Gentle, low-fat home-cooked option",
            "prefer_high": [],
            "monitor_high": ["fat_saturated_g"],
            "preferred_slugs": ["khichdi-moong-dal-rice", "idli-steamed-rice-lentil", "curd-dahi-cow-milk", "papaya-ripe"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Hygienically prepared, low-fat home-cooked meals and adequate hydration are supportive while consulting your physician.",
        },
        "kidney_caution": False,
    },
    "alkaline_phosphatase": {
        "canonical_code": "alkaline_phosphatase",
        "panel_category": "liver_function",
        "display_name": "Alkaline Phosphatase (ALP)",
        "aliases": ["alkaline phosphatase (alp)", "alkaline phosphatase", "serum alkaline phosphatase", "alp"],
        "typical_units": ["U/L", "IU/L"],
        "plausible_bounds": {"u/l": (10.0, 1500.0), "iu/l": (10.0, 1500.0)},
        "what_it_measures": "Measures an enzyme present in the liver, bile ducts, and bone.",
        "clinical_context": "Interpreted alongside liver enzymes (ALT, AST, bilirubin) as well as bone/vitamin D markers.",
        "doctor_questions": ["Is my ALP reading related to liver/biliary markers or bone turnover/vitamin D status?"],
        "related_condition_codes": [],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["protein_g", "calcium_mg"],
            "short_reason_label": "Provides protein and calcium",
            "prefer_high": ["protein_g", "calcium_mg"],
            "monitor_high": ["fat_saturated_g"],
            "preferred_slugs": ["green-gram-whole-moong", "curd-dahi-cow-milk", "ragi-finger-millet"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Review ALP alongside liver function and vitamin D/calcium markers with your physician.",
        },
        "kidney_caution": False,
    },
    # Thyroid Panel
    "tsh": {
        "canonical_code": "tsh",
        "panel_category": "thyroid_panel",
        "display_name": "Thyroid Stimulating Hormone (TSH)",
        "aliases": [
            "thyroid stimulating hormone (tsh)",
            "thyroid stimulating hormone",
            "tsh (ultrasensitive)",
            "ultrasensitive tsh",
            "serum tsh",
            "tsh",
        ],
        "typical_units": ["µIU/mL", "mIU/L", "uIU/mL"],
        "plausible_bounds": {"µiu/ml": (0.01, 150.0), "miu/l": (0.01, 150.0), "uiu/ml": (0.01, 150.0)},
        "what_it_measures": "Measures the pituitary hormone that regulates thyroid hormone (T3 and T4) production.",
        "clinical_context": "Interpreted alongside Free T4 and Free T3. Do not adjust thyroid medication dosage without your doctor's instruction.",
        "doctor_questions": [
            "How does my TSH result relate to my Free T4 and Free T3 levels?",
            "How should I space any prescribed thyroid tablet from morning tea, coffee, calcium, or iron-rich foods?",
        ],
        "related_condition_codes": ["hypothyroidism", "hypothyroidism_management"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["protein_g", "fibre_g", "calcium_mg"],
            "short_reason_label": "Provides protein and dietary fibre",
            "prefer_high": ["protein_g", "fibre_g", "calcium_mg"],
            "monitor_high": [],
            "preferred_slugs": [
                "green-gram-whole-moong",
                "toor-dal-red-gram",
                "curd-dahi-cow-milk",
                "paneer-cottage-cheese-cow",
                "ragi-finger-millet",
                "egg-poultry-whole-boiled",
            ],
            "portion_sensitive_slugs": [],
            "educational_food_note": (
                "Balanced protein, fibre, and using iodised salt in normal culinary amounts support general nutrition; "
                "if prescribed thyroid hormone medication, keep a consistent time gap between your tablet and coffee, soya, calcium, or iron supplements."
            ),
        },
        "kidney_caution": False,
    },
    "t3": {
        "canonical_code": "t3",
        "panel_category": "thyroid_panel",
        "display_name": "Triiodothyronine (Free T3 / Total T3)",
        "aliases": [
            "triiodothyronine (free t3 / total t3)",
            "triiodothyronine (t3)",
            "free t3 (ft3)",
            "free t3",
            "total t3",
            "triiodothyronine",
            "ft3",
            "t3",
        ],
        "typical_units": ["pg/mL", "ng/dL", "pmol/L", "nmol/L"],
        "plausible_bounds": {"pg/ml": (0.5, 30.0), "ng/dl": (20.0, 600.0), "pmol/l": (1.0, 50.0), "nmol/l": (0.3, 10.0)},
        "what_it_measures": "Measures the active thyroid hormone triiodothyronine.",
        "clinical_context": "Interpreted together with TSH and T4 using the laboratory's specific Free T3 or Total T3 reference interval.",
        "doctor_questions": ["How does my T3 result fit with my TSH and T4?"],
        "related_condition_codes": ["hypothyroidism", "hypothyroidism_management"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["protein_g"],
            "short_reason_label": "Provides protein",
            "prefer_high": ["protein_g"],
            "monitor_high": [],
            "preferred_slugs": ["curd-dahi-cow-milk", "green-gram-whole-moong", "paneer-cottage-cheese-cow"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Maintain balanced protein and micronutrient intake and review thyroid results with your doctor.",
        },
        "kidney_caution": False,
    },
    "t4": {
        "canonical_code": "t4",
        "panel_category": "thyroid_panel",
        "display_name": "Thyroxine (Free T4 / Total T4)",
        "aliases": [
            "thyroxine (free t4 / total t4)",
            "thyroxine (t4)",
            "free t4 (ft4)",
            "free t4",
            "total t4",
            "thyroxine",
            "ft4",
            "t4",
        ],
        "typical_units": ["ng/dL", "µg/dL", "ug/dL", "pmol/L", "nmol/L"],
        "plausible_bounds": {"ng/dl": (0.1, 25.0), "µg/dl": (1.0, 25.0), "ug/dl": (1.0, 25.0), "pmol/l": (2.0, 100.0), "nmol/l": (20.0, 300.0)},
        "what_it_measures": "Measures thyroxine, the primary hormone secreted by the thyroid gland.",
        "clinical_context": "Interpreted alongside TSH using the laboratory's Free T4 or Total T4 reference range.",
        "doctor_questions": ["What do my T4 and TSH results together indicate?"],
        "related_condition_codes": ["hypothyroidism", "hypothyroidism_management"],
        "food_nutrient_focus": {
            "primary_nutrient_codes": ["protein_g", "fibre_g"],
            "short_reason_label": "Provides protein and dietary fibre",
            "prefer_high": ["protein_g", "fibre_g"],
            "monitor_high": [],
            "preferred_slugs": ["green-gram-whole-moong", "curd-dahi-cow-milk", "ragi-finger-millet"],
            "portion_sensitive_slugs": [],
            "educational_food_note": "Follow consistent meal timing around any prescribed thyroid medication.",
        },
        "kidney_caution": False,
    },
}

_NUTRIENT_DISPLAY_META: dict[str, tuple[str, str]] = {
    "iron_mg": ("Iron", "mg"),
    "vit_b12_mcg": ("Vitamin B12", "µg"),
    "vitamin_b12_ug": ("Vitamin B12", "µg"),
    "vit_d_mcg": ("Vitamin D", "µg"),
    "vitamin_d_ug": ("Vitamin D", "µg"),
    "calcium_mg": ("Calcium", "mg"),
    "fibre_g": ("Dietary Fibre", "g"),
    "protein_g": ("Protein", "g"),
    "folate_mcg": ("Folate", "µg"),
    "folate_ug": ("Folate", "µg"),
    "vit_c_mg": ("Vitamin C", "mg"),
    "vitamin_c_mg": ("Vitamin C", "mg"),
    "energy_kcal": ("Energy", "kcal"),
    "carbs_g": ("Carbohydrates", "g"),
    "fat_total_g": ("Total Fat", "g"),
    "fat_saturated_g": ("Saturated Fat", "g"),
    "sodium_mg": ("Sodium", "mg"),
    "potassium_mg": ("Potassium", "mg"),
}


# ============================================================================
# 2. FILE VALIDATION & VISUAL-AWARE PDF / IMAGE EXTRACTION PIPELINE
# ============================================================================
def validate_health_report_upload(
    file_bytes: bytes,
    filename: str | None = None,
    content_type: str | None = None,
) -> dict[str, Any]:
    if not file_bytes or len(file_bytes) == 0:
        raise ValueError("Uploaded file is empty. Please select a valid PDF or image health report.")

    max_bytes = getattr(settings, "MAX_REPORT_UPLOAD_SIZE_BYTES", 10 * 1024 * 1024)
    if len(file_bytes) > max_bytes:
        raise ValueError(
            f"File exceeds the maximum allowed size of {max_bytes // (1024 * 1024)} MB."
        )

    head = file_bytes[:64]
    if (
        head.startswith(b"MZ")
        or head.startswith(b"\x7fELF")
        or head.startswith(b"#!")
        or b"<script" in head.lower()
    ):
        raise ValueError("Executable or script files are strictly rejected for security reasons.")

    fname_lower = (filename or "").lower()
    ctype_lower = (content_type or "").lower()

    if head.startswith(b"%PDF-"):
        if b"%%EOF" not in file_bytes[-2048:] and b"endobj" not in file_bytes:
            raise ValueError("Uploaded PDF appears truncated or corrupted.")
        page_matches = re.findall(rb"/Type\s*/Page\b", file_bytes)
        page_count = max(1, len(page_matches))
        max_pages = getattr(settings, "MAX_PDF_REPORT_PAGES", 15)
        if page_count > max_pages:
            raise ValueError(
                f"PDF report has {page_count} pages, which exceeds the {max_pages}-page safety limit."
            )
        return {
            "detected_format": "pdf",
            "mime_type": "application/pdf",
            "file_size_bytes": len(file_bytes),
            "page_count": page_count,
            "width": None,
            "height": None,
        }

    if ctype_lower == "application/pdf" or fname_lower.endswith(".pdf"):
        raise ValueError("Invalid or corrupted PDF file: missing '%PDF-' header.")

    is_jpeg = head.startswith(b"\xff\xd8\xff")
    is_png = head.startswith(b"\x89PNG\r\n\x1a\n")
    is_webp = head.startswith(b"RIFF") and head[8:12] == b"WEBP"

    if not (is_jpeg or is_png or is_webp):
        raise ValueError(
            "Unsupported or corrupted file format. Please upload a valid PDF, JPG/JPEG, PNG, or WebP laboratory report."
        )

    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            img.verify()
        with Image.open(io.BytesIO(file_bytes)) as img2:
            transposed = ImageOps.exif_transpose(img2)
            width, height = transposed.size
            fmt = (img2.format or "JPEG").lower()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise ValueError("Uploaded image file is corrupted or unreadable.") from exc

    if width < 50 or height < 50:
        raise ValueError(
            f"Image dimensions ({width}x{height}px) are too small for legible medical report extraction."
        )
    if width > 12000 or height > 12000:
        raise ValueError("Image dimensions exceed maximum safe processing limits.")

    return {
        "detected_format": fmt,
        "mime_type": f"image/{'jpeg' if fmt == 'jpg' else fmt}",
        "file_size_bytes": len(file_bytes),
        "page_count": 1,
        "width": width,
        "height": height,
    }


def _decode_pdf_literal_string(raw: str) -> str:
    out = []
    i = 0
    n = len(raw)
    while i < n:
        ch = raw[i]
        if ch == "\\" and i + 1 < n:
            nxt = raw[i + 1]
            if nxt in ("n", "r", "t", "b", "f"):
                out.append({"n": "\n", "r": "\r", "t": "\t", "b": "", "f": "\n"}[nxt])
                i += 2
            elif nxt in ("(", ")", "\\"):
                out.append(nxt)
                i += 2
            elif nxt.isdigit():
                oct_digits = nxt
                j = i + 2
                while j < n and j < i + 4 and raw[j].isdigit():
                    oct_digits += raw[j]
                    j += 1
                try:
                    out.append(chr(int(oct_digits, 8)))
                except ValueError:
                    pass
                i = j
            else:
                out.append(nxt)
                i += 2
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def _detect_pdf_bold_fonts(pdf_latin1: str) -> set[str]:
    """
    Finds PDF font resource names (e.g. 'F2', 'F_Bold', 'FT1') that map to Bold, Heavy, Black,
    Demi, or Semibold font descriptors so we know when a specific result cell is bolded.
    """
    bold_fonts: set[str] = set()
    for m in re.finditer(
        r"/([A-Za-z0-9_.-]+)\s*<<[^>]*?/BaseFont\s*/([A-Za-z0-9_+-]+)",
        pdf_latin1,
        re.DOTALL,
    ):
        res_name, base_font = m.group(1), m.group(2).lower()
        if any(w in base_font for w in ("bold", "heavy", "black", "demi", "semibold", "bd")):
            bold_fonts.add(res_name)
    for m in re.finditer(r"/([A-Za-z0-9_.-]*?(?:Bold|bd|Heavy)[A-Za-z0-9_.-]*)\s+\d+(?:\.\d+)?\s+Tf", pdf_latin1, re.I):
        bold_fonts.add(m.group(1))
    return bold_fonts


def _extract_images_from_scanned_pdf(file_bytes: bytes) -> list[bytes]:
    """
    Extracts embedded raster page images from a scanned PDF in memory:
    - Embedded JPEG streams (`\xff\xd8\xff ... \xff\xd9` / `/DCTDecode`)
    - Embedded PNG streams (`\x89PNG ... IEND`)
    - Embedded `/Subtype /Image` Flate-compressed RGB/Grayscale pixel buffers
    """
    extracted_images: list[bytes] = []

    for obj_match in re.finditer(rb"(\d+\s+\d+\s+obj\b.*?)stream\r?\n(.*?)\r?\nendstream", file_bytes, re.DOTALL):
        obj_header = obj_match.group(1)
        raw_stream = obj_match.group(2)

        # Case 1: Direct JPEG stream
        if raw_stream.startswith(b"\xff\xd8\xff"):
            extracted_images.append(raw_stream)
            continue

        # Case 2: Direct PNG stream
        if raw_stream.startswith(b"\x89PNG\r\n\x1a\n"):
            extracted_images.append(raw_stream)
            continue

        # Case 3: Flate-compressed image XObject (`/Subtype /Image`) or compressed JPEG/PNG
        decompressed: bytes | None = None
        for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
            try:
                decompressed = zlib.decompress(raw_stream, wbits)
                break
            except Exception:
                continue
        if not decompressed:
            continue

        if decompressed.startswith(b"\xff\xd8\xff") or decompressed.startswith(b"\x89PNG\r\n\x1a\n"):
            extracted_images.append(decompressed)
            continue

        if re.search(rb"/Subtype\s*/Image\b", obj_header):
            w_m = re.search(rb"/Width\s+(\d+)", obj_header)
            h_m = re.search(rb"/Height\s+(\d+)", obj_header)
            if w_m and h_m:
                w = int(w_m.group(1))
                h = int(h_m.group(1))
                is_gray = bool(re.search(rb"/DeviceGray\b", obj_header))
                expected_rgb = w * h * 3
                expected_gray = w * h
                try:
                    if not is_gray and len(decompressed) >= expected_rgb:
                        pil_img = Image.frombytes("RGB", (w, h), decompressed[:expected_rgb])
                        out_buf = io.BytesIO()
                        pil_img.save(out_buf, format="PNG")
                        extracted_images.append(out_buf.getvalue())
                    elif len(decompressed) >= expected_gray:
                        pil_img = Image.frombytes("L", (w, h), decompressed[:expected_gray]).convert("RGB")
                        out_buf = io.BytesIO()
                        pil_img.save(out_buf, format="PNG")
                        extracted_images.append(out_buf.getvalue())
                except Exception:
                    continue

    return extracted_images


def extract_text_from_pdf_bytes(file_bytes: bytes) -> tuple[str, str]:
    """
    Extracts selectable text AND visual formatting indicators (bold font weight,
    render mode 2 Tr, RGB/CMYK abnormal colour highlights, and page numbers) from a PDF in memory.
    If the PDF is a scanned image PDF with no selectable text rows, automatically extracts
    embedded page images and runs the multi-engine Image OCR pipeline.
    Returns (annotated_text, engine_name).
    """
    pdf_latin1 = file_bytes.decode("latin-1", errors="ignore")
    bold_font_names = _detect_pdf_bold_fonts(pdf_latin1)

    decoded_streams: list[tuple[int, str]] = []
    stream_idx = 0
    for match in re.finditer(rb"stream\r?\n(.*?)\r?\nendstream", file_bytes, re.DOTALL):
        stream_idx += 1
        raw_stream = match.group(1)
        # Skip raw binary image streams when collecting text streams
        if raw_stream.startswith(b"\xff\xd8\xff") or raw_stream.startswith(b"\x89PNG"):
            continue
        decompressed: bytes | None = None
        for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
            try:
                decompressed = zlib.decompress(raw_stream, wbits)
                break
            except Exception:
                continue
        if decompressed is None:
            decompressed = raw_stream
        try:
            try:
                stream_decoded = decompressed.decode("utf-8")
            except UnicodeDecodeError:
                stream_decoded = (
                    decompressed.decode("latin-1", errors="ignore")
                    .replace("\xe2\x86\x91", "↑")
                    .replace("\xe2\x86\x93", "↓")
                )
            decoded_streams.append((stream_idx, stream_decoded))
        except Exception:
            continue

    if not decoded_streams:
        decoded_streams.append((1, pdf_latin1))

    extracted_lines: list[str] = []
    for page_num, stream_text in decoded_streams:
        extracted_lines.append(f"[PAGE:{page_num}]")

        active_font_bold = False
        active_render_bold = False
        active_color_tag: str | None = None

        bt_blocks = re.findall(r"BT\b(.*?)ET\b", stream_text, re.DOTALL)
        target_blocks = bt_blocks if bt_blocks else [stream_text]

        for block in target_blocks:
            current_line_parts: list[str] = []
            result_cell_visuals: set[str] = set()
            seen_first_text_token = False

            token_pattern = re.compile(
                r"(/([A-Za-z0-9_.-]+)\s+\d+(?:\.\d+)?\s+Tf)"
                r"|((\d+)\s+Tr\b)"
                r"|((0?\.\d+|\d+(?:\.\d+)?)\s+(0?\.\d+|\d+(?:\.\d+)?)\s+(0?\.\d+|\d+(?:\.\d+)?)\s+(?:rg|RG)\b)"
                r"|(\((?:\\.|[^\\()\r\n]|\((?:\\.|[^\\()\r\n])*\))*\)\s*(?:Tj|'|\"|\b))"
                r"|(\[(?:[^\]]*?)\]\s*TJ)"
                r"|(<([0-9A-Fa-f]{4,})>\s*Tj)"
                r"|(\b(?:T\*|Td|TD|Tm)\b)"
                r"|(\r?\n)"
            )

            for tok in token_pattern.finditer(block):
                (
                    tf_full,
                    tf_font,
                    tr_full,
                    tr_mode,
                    rgb_full,
                    r_s,
                    g_s,
                    b_s,
                    tj_lit,
                    tj_arr,
                    _hex_full,
                    hex_str,
                    pos_op,
                    newline_op,
                ) = tok.groups()

                if tf_full and tf_font:
                    f_low = tf_font.lower()
                    active_font_bold = (
                        tf_font in bold_font_names
                        or any(w in f_low for w in ("bold", "heavy", "black", "demi", "semibold", "bd"))
                    )
                elif tr_full and tr_mode is not None:
                    active_render_bold = tr_mode in ("1", "2")
                elif rgb_full and r_s is not None and g_s is not None and b_s is not None:
                    try:
                        rv, gv, bv = float(r_s), float(g_s), float(b_s)
                        if rv > 0.55 and gv < 0.35 and bv < 0.35:
                            active_color_tag = "red_text"
                        elif rv > 0.65 and gv > 0.35 and bv < 0.25:
                            active_color_tag = "amber_text"
                        elif rv < 0.15 and gv < 0.15 and bv < 0.15:
                            active_color_tag = None
                        elif abs(rv - gv) > 0.25 or abs(rv - bv) > 0.25:
                            active_color_tag = "colored_text"
                        else:
                            active_color_tag = None
                    except ValueError:
                        pass
                elif tj_lit or tj_arr or hex_str:
                    piece = ""
                    if tj_lit:
                        inner = re.sub(r"\)\s*(?:Tj|'|\")?$", "", tj_lit, count=1)
                        if inner.startswith("("):
                            inner = inner[1:]
                        piece = _decode_pdf_literal_string(inner)
                    elif tj_arr:
                        sub_lits = re.findall(
                            r"\((?:\\.|[^\\()\r\n]|\((?:\\.|[^\\()\r\n])*\))*\)", tj_arr
                        )
                        piece = "".join(_decode_pdf_literal_string(s[1:-1]) for s in sub_lits)
                    elif hex_str:
                        try:
                            raw_hex = bytes.fromhex(hex_str)
                            piece = (
                                raw_hex.decode("utf-16-be", errors="ignore")
                                if len(raw_hex) % 2 == 0
                                else raw_hex.decode("latin-1", errors="ignore")
                            )
                        except Exception:
                            piece = ""

                    piece_clean = piece.strip()
                    if piece_clean:
                        has_digit = bool(re.search(r"\d", piece_clean))
                        has_alpha_name = bool(re.search(r"[A-Za-z]{3,}", piece_clean))
                        if has_digit:
                            if active_font_bold or active_render_bold:
                                if seen_first_text_token or not has_alpha_name or active_font_bold:
                                    result_cell_visuals.add("bold_result")
                            if active_color_tag:
                                result_cell_visuals.add(active_color_tag)
                        if has_alpha_name:
                            seen_first_text_token = True
                        current_line_parts.append(piece_clean)
                elif pos_op or (newline_op and not bt_blocks):
                    if current_line_parts:
                        line_str = " ".join(p for p in current_line_parts if p)
                        if line_str:
                            if result_cell_visuals:
                                v_str = ",".join(sorted(result_cell_visuals))
                                line_str = f"{line_str} [VISUAL:{v_str}]"
                            extracted_lines.append(line_str)
                        current_line_parts = []
                        result_cell_visuals = set()
                        seen_first_text_token = False

            if current_line_parts:
                line_str = " ".join(p for p in current_line_parts if p)
                if line_str:
                    if result_cell_visuals:
                        v_str = ",".join(sorted(result_cell_visuals))
                        line_str = f"{line_str} [VISUAL:{v_str}]"
                    extracted_lines.append(line_str)

    native_text = "\n".join(extracted_lines).strip()
    non_page_text = re.sub(r"\[PAGE:\d+\]", "", native_text).strip()

    # Try pypdf if installed and native stream had minimal text
    if len(non_page_text) < 15:
        try:
            import pypdf  # type: ignore

            reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            pypdf_pages: list[str] = []
            for idx, page in enumerate(reader.pages, start=1):
                pt = (page.extract_text() or "").strip()
                if pt:
                    pypdf_pages.append(f"[PAGE:{idx}]\n{pt}")
            pypdf_joined = "\n".join(pypdf_pages).strip()
            if pypdf_joined:
                return pypdf_joined, "pypdf_selectable_text"
        except Exception:
            pass

    # If selectable text yielded no canonical test matches, check for embedded scanned page images
    if len(non_page_text) < 15 or not parse_laboratory_report_text(native_text)["measurements"]:
        scanned_imgs = _extract_images_from_scanned_pdf(file_bytes)
        if scanned_imgs:
            ocr_pages: list[str] = []
            used_engine = "pdf_scanned_ocr"
            for idx, img_bytes in enumerate(scanned_imgs, start=1):
                page_txt, eng_name, _cues = _extract_text_from_image_or_vision(
                    file_bytes=img_bytes,
                    mime_type="image/png",
                    hint_text=None,
                )
                if page_txt.strip():
                    ocr_pages.append(f"[PAGE:{idx}]\n{page_txt.strip()}")
                    used_engine = f"pdf_scanned_ocr:{eng_name}"
            if ocr_pages:
                return "\n".join(ocr_pages), used_engine

    return native_text, "pdf_visual_and_stream_extractor"


def _inspect_image_visual_cues(file_bytes: bytes) -> list[str]:
    """
    Inspects a report image without destructive binarisation to preserve colour and contrast cues
    (such as red/crimson abnormal result highlights, shaded cells, or high-contrast bold text).
    """
    cues: list[str] = []
    try:
        with Image.open(io.BytesIO(file_bytes)) as img:
            rgb = ImageOps.exif_transpose(img).convert("RGB")
            w, h = rgb.size
            sample = rgb.resize((min(w, 240), min(h, 240)))
            arr_s = np.array(sample, dtype=np.int16)
            total_px = max(1, arr_s.shape[0] * arr_s.shape[1])
            r_ch, g_ch, b_ch = arr_s[:, :, 0], arr_s[:, :, 1], arr_s[:, :, 2]
            red_px = int(((r_ch > 155) & (g_ch < 85) & (b_ch < 85)).sum())
            amber_px = int(((r_ch > 175) & (g_ch >= 85) & (g_ch <= 150) & (b_ch < 70)).sum())
            dark_px = int(((r_ch < 45) & (g_ch < 45) & (b_ch < 45)).sum())
            if red_px / total_px >= 0.002:
                cues.append("red_highlighted_text_detected")
            if amber_px / total_px >= 0.003:
                cues.append("highlighted_cell_detected")
            if dark_px / total_px >= 0.01:
                cues.append("dark_bold_strokes_detected")
    except Exception:
        pass
    return cues


def preprocess_report_image_for_ocr(file_bytes: bytes) -> tuple[Image.Image, bytes]:
    """
    Non-destructive medical report image preprocessing in RAM:
    1. Decodes image and applies EXIF orientation correction (`ImageOps.exif_transpose`).
    2. Resizes appropriately (upscales images < 1600px width with LANCZOS so small laboratory numbers
       and decimal points remain crisp; caps oversized images at 2600px).
    3. Enhances contrast (`ImageOps.autocontrast`) and applies gentle sharpening (`UnsharpMask`)
       without destructive whole-page binary thresholding.
    Returns (oriented_rgb_image, enhanced_png_bytes_for_tesseract).
    """
    with Image.open(io.BytesIO(file_bytes)) as raw_img:
        rgb = ImageOps.exif_transpose(raw_img).convert("RGB")

    w, h = rgb.size
    if w < 1400:
        scale = min(2.2, 1600.0 / max(1, w))
        rgb_scaled = rgb.resize(
            (int(round(w * scale)), int(round(h * scale))),
            Image.Resampling.LANCZOS,
        )
    elif w > 2800:
        scale = 2400.0 / w
        rgb_scaled = rgb.resize(
            (int(round(w * scale)), int(round(h * scale))),
            Image.Resampling.LANCZOS,
        )
    else:
        rgb_scaled = rgb

    gray = ImageOps.grayscale(rgb_scaled)
    contrasted = ImageOps.autocontrast(gray, cutoff=1)
    sharpened = contrasted.filter(ImageFilter.UnsharpMask(radius=1.2, percent=135, threshold=3))

    out_buf = io.BytesIO()
    sharpened.save(out_buf, format="PNG")
    return rgb, out_buf.getvalue()


# ============================================================================
# BUILT-IN MULTI-FONT PILLOW + NUMPY LABORATORY TABLE OCR ENGINE
# ============================================================================
_GLYPH_BANK_CACHE: tuple[np.ndarray, np.ndarray, list[str]] | None = None


def _get_glyph_template_bank() -> tuple[np.ndarray, np.ndarray, list[str]]:
    """
    Builds and caches a multi-font character & digit template bank in memory using Pillow and NumPy.
    Supports macOS system fonts, Linux DejaVu/Liberation fonts, and Pillow's built-in scalable FreeType font.
    """
    global _GLYPH_BANK_CACHE
    if _GLYPH_BANK_CACHE is not None:
        return _GLYPH_BANK_CACHE

    chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-/:()%*<>"
    font_paths = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/System/Library/Fonts/Courier.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]

    font_objects: list[Any] = []
    for fp in font_paths:
        if os.path.exists(fp):
            for sz in (36, 44, 52):
                try:
                    font_objects.append(ImageFont.truetype(fp, sz))
                except Exception:
                    continue

    if not font_objects:
        for sz in (36, 44, 52):
            try:
                font_objects.append(ImageFont.load_default(size=sz))
            except Exception:
                continue

    templates_bmp: list[np.ndarray] = []
    templates_meta: list[tuple[float, float, float, float]] = []
    templates_char: list[str] = []

    for fnt in font_objects:
        try:
            ref_img = Image.new("L", (400, 120), 0)
            ref_draw = ImageDraw.Draw(ref_img)
            ref_draw.text((20, 20), "Hg01()", fill=255, font=fnt)
            ref_arr = np.array(ref_img)
            ys = np.where(ref_arr.max(axis=1) > 95)[0]
            if len(ys) == 0:
                continue
            line_y0, line_y1 = int(ys[0]), int(ys[-1])
            line_h = max(1.0, float(line_y1 - line_y0 + 1))

            for stroke_w in (0, 1):
                for ch in chars:
                    canvas = Image.new("L", (160, 120), 0)
                    d = ImageDraw.Draw(canvas)
                    d.text((20, 20), ch, fill=255, font=fnt, stroke_width=stroke_w)
                    arr = np.array(canvas)
                    cy, cx = np.where(arr > 95)
                    if len(cy) == 0:
                        continue
                    y0, y1 = int(cy.min()), int(cy.max())
                    x0, x1 = int(cx.min()), int(cx.max())
                    crop = Image.fromarray(arr[y0 : y1 + 1, x0 : x1 + 1]).resize(
                        (16, 24), Image.Resampling.BILINEAR
                    )
                    vec = np.array(crop, dtype=np.float32).flatten()
                    norm = float(np.linalg.norm(vec))
                    if norm > 0:
                        vec = vec / norm
                    w_c = float(x1 - x0 + 1)
                    h_c = float(y1 - y0 + 1)
                    aspect = w_c / max(1.0, h_c)
                    top_rel = (y0 - line_y0) / line_h
                    bot_rel = (y1 - line_y0) / line_h
                    h_rel = h_c / line_h
                    templates_bmp.append(vec)
                    templates_meta.append((aspect, top_rel, bot_rel, h_rel))
                    templates_char.append(ch)
        except Exception:
            continue

    t_bmp = np.array(templates_bmp, dtype=np.float32)
    t_meta = np.array(templates_meta, dtype=np.float32)
    _GLYPH_BANK_CACHE = (t_bmp, t_meta, templates_char)
    return _GLYPH_BANK_CACHE


def _ocr_single_column_strip_numpy(rgb_strip: Image.Image) -> str:
    """
    Runs layout-preserving line/word/character segmentation and glyph template correlation
    on a single-column or full-width RGB image strip.
    Preserves decimal points, reference intervals, units, H/L flags, and red/bold visual cues.
    """
    t_bmp, t_meta, templates_char = _get_glyph_template_bank()
    if len(templates_char) == 0:
        return ""

    scale = 2 if rgb_strip.width < 1800 else 1
    work_rgb = (
        rgb_strip.resize(
            (rgb_strip.width * scale, rgb_strip.height * scale),
            Image.Resampling.BICUBIC,
        )
        if scale > 1
        else rgb_strip
    )

    arr_rgb = np.array(work_rgb, dtype=np.float32)
    gray = 0.299 * arr_rgb[:, :, 0] + 0.587 * arr_rgb[:, :, 1] + 0.114 * arr_rgb[:, :, 2]
    min_ch = arr_rgb.min(axis=2)
    bg_val = float(np.percentile(gray, 90))
    if bg_val < 95.0:
        return ""

    ink = np.maximum(bg_val - gray, bg_val - min_ch)
    ink = np.clip(ink, 0, 255).astype(np.uint8)
    h_img, w_img = ink.shape

    thresh = 92
    bin_mask = ink > thresh
    row_counts = bin_mask.sum(axis=1)
    for r_i in np.where(row_counts > w_img * 0.78)[0]:
        ink[r_i, :] = 0
    col_counts = (ink > thresh).sum(axis=0)
    for c_i in np.where(col_counts > h_img * 0.85)[0]:
        ink[:, c_i] = 0

    bin_mask = ink > thresh
    row_proj = bin_mask.sum(axis=1)

    raw_bands: list[tuple[int, int]] = []
    in_line = False
    y_start = 0
    for y in range(h_img):
        if row_proj[y] >= 3 and not in_line:
            in_line = True
            y_start = y
        elif row_proj[y] < 3 and in_line:
            in_line = False
            if y - y_start >= 10:
                raw_bands.append((y_start, y - 1))
    if in_line and h_img - y_start >= 10:
        raw_bands.append((y_start, h_img - 1))

    if not raw_bands:
        return ""

    heights = [b[1] - b[0] + 1 for b in raw_bands]
    med_h = float(np.median(heights)) if heights else 28.0
    lines_y: list[tuple[int, int]] = []
    for by0, by1 in raw_bands:
        bh = by1 - by0 + 1
        if bh > med_h * 1.85 and bh >= 40:
            sub_r = row_proj[by0 : by1 + 1]
            s0 = int(bh * 0.25)
            s1 = int(bh * 0.75)
            if s1 > s0:
                valley = s0 + int(np.argmin(sub_r[s0:s1]))
                if sub_r[valley] <= 4:
                    lines_y.append((by0, by0 + valley - 1))
                    lines_y.append((by0 + valley + 1, by1))
                    continue
        lines_y.append((by0, by1))

    out_lines: list[str] = []
    for ly0, ly1 in lines_y:
        band = ink[ly0 : ly1 + 1, :].copy()
        band_rgb = arr_rgb[ly0 : ly1 + 1, :, :]
        line_h = max(1.0, float(ly1 - ly0 + 1))
        if line_h > 140 or line_h < 10:
            continue

        col_proj = (band > thresh).sum(axis=0)
        x_spans: list[tuple[int, int]] = []
        in_char = False
        x_s = 0
        for x in range(w_img):
            if col_proj[x] >= 1 and not in_char:
                in_char = True
                x_s = x
            elif col_proj[x] == 0 and in_char:
                in_char = False
                x_spans.append((x_s, x - 1))
        if in_char:
            x_spans.append((x_s, w_img - 1))

        def _split_wide_span(
            xs: int,
            xe: int,
            _lh: float = line_h,
            _cp: np.ndarray = col_proj,
        ) -> list[tuple[int, int]]:
            cw = xe - xs + 1
            if cw >= _lh * 0.68 and cw >= 18:
                sub_p = _cp[xs : xe + 1]
                s0 = max(4, int(cw * 0.28))
                s1 = min(cw - 4, int(cw * 0.72))
                if s1 > s0:
                    rel = s0 + int(np.argmin(sub_p[s0:s1]))
                    max_allowed = 2 if cw >= _lh * 0.95 else 1
                    if sub_p[rel] <= max_allowed and sub_p[rel] <= int(sub_p.max() * 0.22):
                        return _split_wide_span(xs, xs + rel - 1) + _split_wide_span(
                            xs + rel + 1, xe
                        )
            return [(xs, xe)]

        refined_spans: list[tuple[int, int]] = []
        for xs, xe in x_spans:
            refined_spans.extend(_split_wide_span(xs, xe))

        chars_out: list[str] = []
        prev_xe: int | None = None
        has_red_in_row = False

        for xs, xe in refined_spans:
            if xe < xs:
                continue
            if prev_xe is not None:
                gap = xs - prev_xe - 1
                if gap >= line_h * 0.85:
                    chars_out.append("   ")
                elif gap >= line_h * 0.23:
                    chars_out.append(" ")
            prev_xe = xe

            sub = band[:, xs : xe + 1]
            cy, cx = np.where(sub > thresh)
            if len(cy) == 0:
                continue
            cy0, cy1 = int(cy.min()), int(cy.max())
            cx0, cx1 = int(cx.min()), int(cx.max())
            glyph = sub[cy0 : cy1 + 1, cx0 : cx1 + 1]
            gw = float(cx1 - cx0 + 1)
            gh = float(cy1 - cy0 + 1)
            aspect = gw / max(1.0, gh)
            top_rel = cy0 / line_h
            bot_rel = cy1 / line_h
            h_rel = gh / line_h

            # Check hyphen '-' BEFORE period '.' so horizontal range bars are never read as '.'
            if h_rel < 0.32 and aspect > 1.35 and 0.20 < top_rel < 0.76:
                chars_out.append("-")
                continue
            if h_rel < 0.35 and aspect <= 1.35 and gw < line_h * 0.35 and top_rel > 0.52:
                chars_out.append(".")
                continue

            # Disambiguate lowercase 'i' (narrow glyph with horizontal gap between dot and stem)
            has_top_dot_gap = False
            if aspect < 0.40 and h_rel > 0.55:
                g_row_proj = (glyph > thresh).sum(axis=1)
                upper_half = g_row_proj[int(gh * 0.12) : int(gh * 0.45)]
                if len(upper_half) > 0 and upper_half.min() == 0:
                    has_top_dot_gap = True
                    if bot_rel <= 0.88:
                        chars_out.append("i")
                        continue

            crop = Image.fromarray(glyph).resize((16, 24), Image.Resampling.BILINEAR)
            vec = np.array(crop, dtype=np.float32).flatten()
            norm = float(np.linalg.norm(vec))
            if norm > 0:
                vec = vec / norm

            bmp_sim = np.dot(t_bmp, vec)
            meta_diff = (
                0.30 * np.abs(t_meta[:, 0] - aspect)
                + 0.38 * np.abs(t_meta[:, 1] - top_rel)
                + 0.38 * np.abs(t_meta[:, 2] - bot_rel)
                + 0.42 * np.abs(t_meta[:, 3] - h_rel)
            )
            score = bmp_sim - meta_diff
            best_idx = int(np.argmax(score))
            if float(score[best_idx]) < 0.18:
                continue
            ch_pred = templates_char[best_idx]
            # Prevent '1' or 'l' without top-dot gap from matching 'j'
            if ch_pred == "j" and not has_top_dot_gap:
                ch_pred = "1"
            chars_out.append(ch_pred)

            sub_rgb = band_rgb[cy0 : cy1 + 1, xs + cx0 : xs + cx1 + 1, :]
            if ch_pred.isdigit():
                red_mask = (
                    (sub_rgb[:, :, 0] > 140)
                    & (sub_rgb[:, :, 1] < 85)
                    & (sub_rgb[:, :, 2] < 85)
                )
                if red_mask.sum() >= 6:
                    has_red_in_row = True

        line_str = "".join(chars_out).strip()
        if line_str:
            # Collapse narrow kerning spaces around digit '1', decimal points, and trailing O/Q zeros first
            line_str = re.sub(r"(?<=[0-9OQ])\s*\.\s*(?=[0-9OQ])", ".", line_str)
            line_str = re.sub(r"(?<=1)\s+(?=[0-9OQ.])", "", line_str)
            line_str = re.sub(r"(?<=\d)\s+(?=[OQ]+\b)", "", line_str)
            # Normalize O/Q -> 0 when adjacent to digits, decimal points, or range dashes
            for _ in range(3):
                line_str = re.sub(
                    r"(?<=[0-9.])[OQ]+",
                    lambda m: "0" * len(m.group(0)),
                    line_str,
                )
                line_str = re.sub(
                    r"(?:^|(?<=[\s\-(]))[OQ]+(?=[0-9.])",
                    lambda m: "0" * len(m.group(0)),
                    line_str,
                )
            line_str = re.sub(r"\b[OQ](?=\s*-\s*\d)", "0", line_str)
            line_str = re.sub(r"(?<=\d)\s*\.\s*(?=\d)", ".", line_str)
            line_str = re.sub(r"(?<=\d)\s*-(?=\d)", " - ", line_str)
            # Disambiguate touching double-4 ("44") read as standalone "M" before a unit
            line_str = re.sub(r"(?<=\s)M(?=\s+(?:mg/dL|g/dL|gML|mgML|mmol/L|%|fL|pg)\b)", "44", line_str)
            # Restore common unit ligatures in proportional sans-serif fonts
            line_str = re.sub(r"\b([muµnpg])gML\b", r"\1g/dL", line_str)
            line_str = re.sub(r"\bgML\b", "g/dL", line_str)
            line_str = re.sub(r"\bkumm\b", "/cumm", line_str)
            line_str = re.sub(r"\b1akhkumm\b", "lakh/cumm", line_str)
            line_str = re.sub(r"\bm[j1l]+onkumm\b", "million/cumm", line_str)
            line_str = re.sub(r"\bm\s*[Il1]\s*U\s*/\s*L\b", "mIU/L", line_str, flags=re.I)
            line_str = re.sub(r"\bu\s*[Il1]\s*U\s*/\s*m\s*L\b", "uIU/mL", line_str, flags=re.I)
            if has_red_in_row:
                line_str += " [VISUAL:red_text]"
            out_lines.append(line_str)

    return "\n".join(out_lines)


def _pil_numpy_laboratory_ocr(rgb_img: Image.Image) -> str:
    """
    Runs pure-Python Pillow + NumPy OCR across both 1-column full-width layout and
    2-column side-by-side card layout (if the image is wide enough to have two side-by-side tables),
    returning the combined transcript that maximizes extracted canonical laboratory rows.
    """
    full_text = _ocr_single_column_strip_numpy(rgb_img)
    w, h = rgb_img.size
    if w < 520:
        return full_text

    mid_x = w // 2
    left_strip = rgb_img.crop((0, 0, mid_x, h))
    right_strip = rgb_img.crop((mid_x, 0, w, h))
    two_col_text = (
        _ocr_single_column_strip_numpy(left_strip)
        + "\n"
        + _ocr_single_column_strip_numpy(right_strip)
    ).strip()

    full_matches = len(parse_laboratory_report_text(full_text)["measurements"])
    two_col_matches = len(parse_laboratory_report_text(two_col_text)["measurements"])

    if two_col_matches > full_matches:
        return two_col_text
    if full_matches > 0 and two_col_matches > 0:
        return f"{full_text}\n{two_col_text}"
    return full_text if len(full_text) >= len(two_col_text) else two_col_text


def _find_tesseract_binary() -> str | None:
    for candidate in (
        shutil.which("tesseract"),
        "/opt/homebrew/bin/tesseract",
        "/usr/local/bin/tesseract",
        "/usr/bin/tesseract",
    ):
        if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            return candidate
    return None


def _extract_text_from_image_or_vision(
    file_bytes: bytes,
    mime_type: str,
    hint_text: str | None = None,
) -> tuple[str, str, list[str]]:
    """
    Extracts text and visual formatting indicators from a medical report image using a 3-tier pipeline:
    Tier 1: Preprocessed image + Local Tesseract OCR (`--psm 6` / `--psm 4`)
    Tier 2: Local Ollama Multimodal Vision Model (`discover_ollama_vision_model`)
    Tier 3: Built-in Pure-Python Pillow + NumPy Multi-Font Laboratory Table OCR (`pil_numpy_table_ocr`)
    Returns (extracted_text, engine_name, image_visual_cues).
    """
    visual_cues = _inspect_image_visual_cues(file_bytes)
    try:
        rgb_oriented, enhanced_png_bytes = preprocess_report_image_for_ocr(file_bytes)
    except Exception:
        return "", "image_decode_failed", visual_cues

    # Tier 1: Local Tesseract OCR binary
    tesseract_bin = _find_tesseract_binary()
    if tesseract_bin:
        best_tess_text = ""
        best_tess_count = 0
        for psm in ("6", "4"):
            try:
                proc = subprocess.run(
                    [tesseract_bin, "stdin", "stdout", "--psm", psm],
                    input=enhanced_png_bytes,
                    capture_output=True,
                    timeout=15,
                    check=False,
                )
                ocr_out = proc.stdout.decode("utf-8", errors="ignore").strip()
                if ocr_out:
                    m_cnt = len(parse_laboratory_report_text(ocr_out)["measurements"])
                    if m_cnt > best_tess_count or (m_cnt == best_tess_count and len(ocr_out) > len(best_tess_text)):
                        best_tess_text = ocr_out
                        best_tess_count = m_cnt
                    if best_tess_count >= 5:
                        break
            except Exception:
                continue
        if best_tess_count > 0:
            return best_tess_text, "tesseract_local_ocr_layout_preserved", visual_cues

    # Tier 2: Local Ollama Vision Model (with proper timeout and resized image)
    if getattr(settings, "ENABLE_LOCAL_AI_ASSISTANT", True):
        try:
            from app.services.ocr_barcode_service import discover_ollama_vision_model

            reachable, v_model, base_url, _err = discover_ollama_vision_model()
            if reachable and v_model:
                vis_buf = io.BytesIO()
                vis_copy = rgb_oriented.copy()
                vis_copy.thumbnail((1500, 1500), Image.Resampling.LANCZOS)
                vis_copy.save(vis_buf, format="PNG")
                b64_img = base64.b64encode(vis_buf.getvalue()).decode("ascii")
                prompt = (
                    "Transcribe all laboratory test rows verbatim from this blood test report image.\n"
                    "Format each test on its own line as:\n"
                    "Test Name   Result   Unit   Reference Interval   Flag\n"
                    "Include exact decimal points, units, reference ranges (e.g. 12.0 - 16.0), and any H/L or ↑/↓ or * flag. "
                    "Append [VISUAL:bold_result] or [VISUAL:red_text] if the result value is bolded, coloured, or highlighted."
                )
                timeout_s = float(min(max(getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 45.0), 30.0), 75.0))
                with httpx.Client(timeout=timeout_s) as client:
                    gen_resp = client.post(
                        f"{base_url}/api/generate",
                        json={
                            "model": v_model,
                            "prompt": prompt,
                            "images": [b64_img],
                            "stream": False,
                            "options": {"temperature": 0.0},
                        },
                    )
                    if gen_resp.status_code == 200:
                        resp_txt = (gen_resp.json().get("response") or "").strip()
                        if len(resp_txt) >= 10 and len(parse_laboratory_report_text(resp_txt)["measurements"]) > 0:
                            return resp_txt, f"ollama_vision:{v_model}", visual_cues
        except Exception:
            pass

    # Tier 3: Built-in Pure-Python Pillow + NumPy Laboratory Table OCR
    try:
        numpy_ocr_text = _pil_numpy_laboratory_ocr(rgb_oriented)
        if numpy_ocr_text.strip() and len(parse_laboratory_report_text(numpy_ocr_text)["measurements"]) > 0:
            return numpy_ocr_text, "pil_numpy_table_ocr", visual_cues
    except Exception:
        pass

    if hint_text and hint_text.strip():
        return hint_text.strip(), "user_assisted_ocr_text", visual_cues

    return "", "ocr_text_unavailable", visual_cues


# ============================================================================
# 3. MULTI-SIGNAL CLINICAL LABORATORY PARSER & ABNORMALITY CLASSIFIER
# ============================================================================
_KNOWN_UNITS = (
    r"mL/min/1\.73m²|mL/min/1\.73m2|mL/min|million/cumm|million/µL|million/uL|"
    r"lakh/cumm|10\^6/µL|10\^6/uL|10\^3/µL|10\^3/uL|x10\^12/L|x10\^9/L|cells/µL|cells/uL|/cumm|/µL|/uL|"
    r"mg/dL|mmol/L|mmol/mol|mEq/L|g/dL|g/L|µIU/mL|uIU/mL|mIU/L|ng/mL|pg/mL|ng/dL|"
    r"µg/dL|ug/dL|µg/L|ug/L|pmol/L|nmol/L|µmol/L|umol/L|U/L|IU/L|fL|pg|%"
)

_SECTION_HEADING_PATTERNS = re.compile(
    r"^(?:"
    r"complete\s+blood\s+count|cbc\s+panel|haemogram|hemogram|"
    r"iron\s+studies|iron\s+panel|iron\s+profile|"
    r"vitamins?(?:\s*&\s*minerals?|\s+panel|\s+profile)?|"
    r"thyroid\s+(?:function|panel|profile)(?:\s+test)?|"
    r"lipid\s+(?:profile|panel)|"
    r"glucose(?:\s*&\s*diabetes|\s*&\s*hba1c|\s+panel|\s+profile)?|diabetes\s+panel|"
    r"kidney\s+(?:function|panel|profile)|renal\s+(?:function|panel|profile)|"
    r"liver\s+(?:function|panel|profile)|hepatic\s+(?:function|panel|profile)|"
    r"test\s+name\s+result\s+unit|parameter\s+observed\s+value|investigation\s+result"
    r")\s*$",
    re.I,
)


def _normalize_ocr_alpha(text: str) -> str:
    """
    Normalizes common single-character OCR confusions in alphabetic test names
    (e.g. 'Haemoglobln' -> 'haemoglobin', 'Vltamln' -> 'vitamin', 'Fastlng' -> 'fasting', 'Ferrltln' -> 'ferritin').
    """
    s = text.lower()
    replacements = {
        "haemoglobln": "haemoglobin",
        "hemoglobln": "hemoglobin",
        "haemog1obin": "haemoglobin",
        "hemog1obin": "hemoglobin",
        "vltamln": "vitamin",
        "vltamin": "vitamin",
        "vitamln": "vitamin",
        "fastlng": "fasting",
        "ferrltln": "ferritin",
        "ferrltin": "ferritin",
        "ferritln": "ferritin",
        "trlglycerldes": "triglycerides",
        "triglycerldes": "triglycerides",
        "trlglycerides": "triglycerides",
        "ch0lesterol": "cholesterol",
        "cho1esterol": "cholesterol",
        "creatlnlne": "creatinine",
        "creatlnine": "creatinine",
        "blllrubln": "bilirubin",
        "p1atelets": "platelets",
        "plate1ets": "platelets",
        "p1me1ets": "platelets",
        "plmelets": "platelets",
        "folme": "folate",
        "fo1ate": "folate",
        "fo1me": "folate",
        "ldlcholesterol": "ldl cholesterol",
        "hdlcholesterol": "hdl cholesterol",
        "totalcholesterol": "total cholesterol",
    }
    for bad, good in replacements.items():
        if bad in s:
            s = s.replace(bad, good)
    return s


def _is_section_or_table_heading(line: str) -> bool:
    """
    Returns True if the line is a report section heading (e.g. 'COMPLETE BLOOD COUNT',
    'IRON STUDIES', 'VITAMINS', 'GLUCOSE & HBA1C') or a table header row rather than a test result row.
    """
    cleaned = re.sub(r"\[VISUAL:[^\]]+\]", "", line).strip()
    cleaned_no_punct = re.sub(r"[|:\-_•*]+", " ", cleaned).strip()
    if _SECTION_HEADING_PATTERNS.match(cleaned_no_punct):
        return True
    lower = cleaned_no_punct.lower()
    if any(
        hdr in lower
        for hdr in (
            "complete blood count",
            "iron studies",
            "thyroid function",
            "lipid profile",
            "kidney function",
            "liver function",
            "test name",
            "reference interval",
            "reference range",
            "biological reference",
        )
    ):
        # Verify there is no standalone decimal/numeric measurement with a unit on this line
        if not re.search(rf"\b\d+(?:\.\d+)?\s*(?:{_KNOWN_UNITS})\b", cleaned, re.I):
            return True
    return False


def _match_canonical_test(line_lower: str) -> tuple[str, dict[str, Any], int] | None:
    norm_line = _normalize_ocr_alpha(line_lower)
    best_match: tuple[str, dict[str, Any], int, int, int] | None = None
    for code, meta in LAB_TEST_CATALOG.items():
        for alias in meta["aliases"]:
            alias_clean = alias.strip().lower()
            idx = norm_line.find(alias_clean)
            if idx != -1:
                before_ok = idx == 0 or not norm_line[idx - 1].isalnum()
                end_idx = idx + len(alias_clean)
                after_ok = end_idx >= len(norm_line) or not norm_line[end_idx].isalnum()
                if before_ok and after_ok:
                    score = len(alias_clean)
                    # Prefer longer alias match; break ties by earlier start index on the line
                    if (
                        best_match is None
                        or score > best_match[3]
                        or (score == best_match[3] and idx < best_match[4])
                    ):
                        best_match = (code, meta, end_idx, score, idx)
    if best_match:
        return best_match[0], best_match[1], best_match[2]
    return None


def _split_side_by_side_test_columns(line: str) -> list[str]:
    """
    If a single horizontal line contains two distinct test rows side-by-side (e.g. from a 2-column layout),
    splits the line at the start of the second test name when the first test name is already followed by digits.
    """
    norm = _normalize_ocr_alpha(line.lower())
    first = _match_canonical_test(norm)
    if not first:
        return [line]
    first_code, _first_meta, first_end = first

    # Look for a second canonical test starting after at least one numeric value in the remainder
    rem_norm = norm[first_end:]
    num_m = re.search(r"\b\d+(?:\.\d+)?\b", rem_norm)
    if not num_m:
        return [line]

    search_offset = first_end + num_m.end()
    sub_norm = norm[search_offset:]
    second_candidates: list[tuple[int, str]] = []
    for code, meta in LAB_TEST_CATALOG.items():
        if code == first_code:
            continue
        for alias in meta["aliases"]:
            alias_clean = alias.strip().lower()
            if len(alias_clean) < 3 and alias_clean not in ("t3", "t4"):
                continue
            idx = sub_norm.find(alias_clean)
            if idx != -1:
                before_ok = idx == 0 or not sub_norm[idx - 1].isalnum()
                end_idx = idx + len(alias_clean)
                after_ok = end_idx >= len(sub_norm) or not sub_norm[end_idx].isalnum()
                # Ensure the second test also has digits after it
                if before_ok and after_ok and re.search(r"\d", sub_norm[end_idx:]):
                    second_candidates.append((search_offset + idx, code))

    if not second_candidates:
        return [line]

    second_candidates.sort(key=lambda x: x[0])
    split_pos = second_candidates[0][0]
    left_part = line[:split_pos].strip()
    right_part = line[split_pos:].strip()
    return [left_part] + _split_side_by_side_test_columns(right_part)


def _check_ocr_decimal_plausibility(
    code: str,
    result_value: float | None,
    unit: str,
    ref_min: float | None,
    ref_max: float | None,
) -> tuple[bool, float | None, str | None]:
    """
    Checks whether a numeric result value is likely a decimal-point OCR error
    (e.g., `1.2` read as `12` or `10.8` read as `108`).
    Returns (is_suspect, proposed_correction, reason).
    """
    if result_value is None or result_value <= 0:
        return False, None, None

    meta = LAB_TEST_CATALOG.get(code) or {}
    bounds_map: dict[str, tuple[float, float]] = meta.get("plausible_bounds") or {}
    u_key = (unit or "").strip().lower()
    low_plausible, high_plausible = bounds_map.get(u_key, (None, None))  # type: ignore

    if high_plausible is not None and result_value > high_plausible:
        cand_div10 = round(result_value / 10.0, 2)
        if low_plausible is not None and low_plausible <= cand_div10 <= high_plausible:
            return (
                True,
                cand_div10,
                f"Extracted value ({result_value} {unit}) exceeds physiological bounds for {meta.get('display_name', code)}; "
                f"possible missing decimal point (did the report print {cand_div10} {unit}?). Please verify before saving.",
            )
    if (
        ref_max is not None
        and ref_max < 20.0
        and result_value >= 10.0
        and float(result_value).is_integer()
        and result_value > ref_max * 4.5
    ):
        cand_div10 = round(result_value / 10.0, 2)
        return (
            True,
            cand_div10,
            f"Extracted value ({result_value:g} {unit}) is >4.5× the upper reference limit ({ref_max} {unit}) and may be an OCR decimal error for {cand_div10} {unit}. Please confirm against your original report.",
        )

    return False, None, None


def _compute_multi_signal_status(
    result_value: float | None,
    ref_min: float | None,
    ref_max: float | None,
    printed_flag: str | None = None,
    visual_indicators: list[str] | None = None,
    is_ocr_suspect: bool = False,
    ocr_suspect_reason: str | None = None,
) -> dict[str, Any]:
    """
    Evaluates a measurement using 4 independent signals:
    1. Explicit laboratory flag (H/L, High/Low, ↑/↓, *)
    2. Printed reference interval comparison
    3. Numerical & unit plausibility (OCR decimal check or missing/unreadable result value)
    4. Visual emphasis in the result cell (bold/dark font, red/coloured text, highlighted cell)
    """
    vis = list(visual_indicators or [])
    fl_raw = (printed_flag or "").strip()
    fl_upper = fl_raw.upper()

    flag_direction: str | None = None
    if fl_upper in ("L", "LOW", "BELOW") or fl_raw in ("↓", "▼", "⬇"):
        flag_direction = "below"
    elif fl_upper in ("H", "HIGH", "ABOVE") or fl_raw in ("↑", "▲", "⬆"):
        flag_direction = "above"
    elif fl_upper in ("*", "**", "ABNORMAL", "CRITICAL", "OUT OF RANGE", "BORDERLINE"):
        flag_direction = "abnormal_unspecified"
    elif fl_upper in ("N", "NORMAL"):
        flag_direction = "normal"

    # Check 0: Missing/unreadable measured result value -> Requires manual review
    if result_value is None:
        return {
            "range_status": "requires_manual_review",
            "status_flag": "requires_manual_review",
            "status_label": "Requires manual review",
            "normalized_flag": fl_raw or "Review",
            "requires_manual_review": True,
            "review_reason": ocr_suspect_reason
            or "Measured result value could not be reliably read for this row. Please enter the value from your original report.",
            "is_abnormal": False,
        }

    num_direction: str | None = None
    if ref_min is not None or ref_max is not None:
        if ref_min is not None and result_value < ref_min:
            num_direction = "below"
        elif ref_max is not None and result_value > ref_max:
            num_direction = "above"
        else:
            num_direction = "within"

    # Check 1: OCR decimal / reliability issue -> Requires manual review
    if is_ocr_suspect:
        return {
            "range_status": "requires_manual_review",
            "status_flag": "requires_manual_review",
            "status_label": "Requires manual review",
            "normalized_flag": fl_raw or "Review",
            "requires_manual_review": True,
            "review_reason": ocr_suspect_reason,
            "is_abnormal": False,
        }

    # Check 2: Disagreement between explicit lab flag and numerical comparison -> Requires manual review
    if num_direction and flag_direction in ("below", "above", "normal"):
        if (
            (flag_direction == "below" and num_direction in ("within", "above"))
            or (flag_direction == "above" and num_direction in ("within", "below"))
            or (flag_direction == "normal" and num_direction in ("below", "above"))
        ):
            return {
                "range_status": "requires_manual_review",
                "status_flag": "requires_manual_review",
                "status_label": "Requires manual review",
                "normalized_flag": fl_raw,
                "requires_manual_review": True,
                "review_reason": (
                    f"Laboratory flag '{fl_raw}' disagrees with numerical comparison against the printed reference interval. "
                    "Marked for manual review."
                ),
                "is_abnormal": True,
            }

    # Check 3: Numerical comparison available
    if num_direction == "below":
        return {
            "range_status": "below_reference",
            "status_flag": "low",
            "status_label": "Below reference interval",
            "normalized_flag": fl_raw or "L",
            "requires_manual_review": False,
            "review_reason": None,
            "is_abnormal": True,
        }
    if num_direction == "above":
        return {
            "range_status": "above_reference",
            "status_flag": "high",
            "status_label": "Above reference interval",
            "normalized_flag": fl_raw or "H",
            "requires_manual_review": False,
            "review_reason": None,
            "is_abnormal": True,
        }
    if num_direction == "within":
        # Do NOT classify a result as abnormal merely because its text is dark or bold!
        # Only flag for manual review if an explicit abnormal symbol (*) or explicit red abnormal colour is on that specific result.
        if flag_direction == "abnormal_unspecified" or "red_text" in vis:
            return {
                "range_status": "requires_manual_review",
                "status_flag": "requires_manual_review",
                "status_label": "Requires manual review",
                "normalized_flag": fl_raw or "*",
                "requires_manual_review": True,
                "review_reason": (
                    "Result value is numerically within the printed reference interval but carries an abnormal symbol or colour highlight. Please verify."
                ),
                "is_abnormal": True,
            }
        return {
            "range_status": "within_reference",
            "status_flag": "within_reference",
            "status_label": "Within reference interval",
            "normalized_flag": fl_raw or "Normal",
            "requires_manual_review": False,
            "review_reason": None,
            "is_abnormal": False,
        }

    # Check 4: Reference interval is missing — never invent one!
    if flag_direction == "below":
        return {
            "range_status": "below_reference",
            "status_flag": "low",
            "status_label": "Below reference interval",
            "normalized_flag": fl_raw or "L",
            "requires_manual_review": False,
            "review_reason": None,
            "is_abnormal": True,
        }
    if flag_direction == "above":
        return {
            "range_status": "above_reference",
            "status_flag": "high",
            "status_label": "Above reference interval",
            "normalized_flag": fl_raw or "H",
            "requires_manual_review": False,
            "review_reason": None,
            "is_abnormal": True,
        }
    if flag_direction == "abnormal_unspecified" or any(
        v in vis for v in ("bold_result", "red_text", "amber_text", "colored_text", "highlighted_cell")
    ):
        return {
            "range_status": "lab_flagged_abnormal",
            "status_flag": "lab_flagged_abnormal",
            "status_label": "Laboratory-flagged abnormal",
            "normalized_flag": fl_raw or "*",
            "requires_manual_review": True,
            "review_reason": "Flagged abnormal by laboratory indicator/formatting, but reference interval was not printed.",
            "is_abnormal": True,
        }

    return {
        "range_status": "reference_unavailable",
        "status_flag": "reference_unavailable",
        "status_label": "Reference interval unavailable",
        "normalized_flag": fl_raw or "",
        "requires_manual_review": False,
        "review_reason": None,
        "is_abnormal": False,
    }


def _compute_range_status(
    result_value: float | None,
    ref_min: float | None,
    ref_max: float | None,
    printed_flag: str | None = None,
) -> tuple[str, str]:
    res = _compute_multi_signal_status(result_value, ref_min, ref_max, printed_flag)
    return res["range_status"], res["normalized_flag"]


def _strip_leading_test_qualifiers(rem: str) -> str:
    """
    Strips parenthetical test-name abbreviations or chemical qualifiers immediately following
    the matched test alias (e.g., `(HbA1c)`, `(T3)`, `(FT3)`, `(T4)`, `(FT4)`, `(25-OH)`,
    `(25-Hydroxy)`, `(B12)`, `(D3)`, `(Cobalamin)`, `(Hb)`) so embedded numbers in test names
    are never mistaken for the measured result value.
    """
    cleaned = rem.strip()
    while True:
        m = re.match(
            r"^(?:\(\s*(?:HbA1c|A1c|Hb|HGB|CBC|WBC|TLC|RBC|PLT|PCV|HCT|MCV|MCH|MCHC|"
            r"TSAT|TIBC|Fe|25-?OH|25\s*Hydroxy|25\(OH\)D|D3|D2|B12|B-12|B9|Cobalamin|"
            r"Cyanocobalamin|Folate|Folic\s*Acid|T3|FT3|Free\s*T3|Total\s*T3|T4|FT4|"
            r"Free\s*T4|Total\s*T4|TSH|LDL|LDL-C|HDL|HDL-C|TG|TGL|FBS|FBG|FPG|PPBS|"
            r"PPBG|RBS|RBG|ALT|SGPT|AST|SGOT|ALP|BUN|eGFR|K\+|Na\+|Serum|Blood|Total|Direct)\s*\)"
            r"|(?:25-?OH(?:\s+Vitamin\s+D)?|25\(OH\)D|B-?12|D3|HbA1c|FT3|FT4)(?=\s|[:\-|]))\s*",
            cleaned,
            re.I,
        )
        if not m:
            break
        cleaned = cleaned[m.end() :].strip()
    return cleaned


def _preprocess_multiline_table_text(raw_text: str) -> list[tuple[int, str]]:
    """
    Normalizes raw report lines, tracks `[PAGE:n]` markers, splits side-by-side 2-column lines,
    ignores section headings, and safely merges multi-line table rows where a test name appears
    on one line and its numeric result/unit/reference interval appear on the immediately following line.
    Returns list of (page_number, merged_line).
    """
    raw_lines = [ln.strip() for ln in (raw_text or "").splitlines() if ln.strip()]
    page_num = 1
    expanded_lines: list[tuple[int, str]] = []

    for ln in raw_lines:
        page_m = re.match(r"^\[PAGE:(\d+)\]$", ln)
        if page_m:
            page_num = int(page_m.group(1))
            continue
        if _is_section_or_table_heading(ln):
            continue
        for sub_ln in _split_side_by_side_test_columns(ln):
            if sub_ln.strip() and not _is_section_or_table_heading(sub_ln):
                expanded_lines.append((page_num, sub_ln.strip()))

    structured_lines: list[tuple[int, str]] = []
    i = 0
    n = len(expanded_lines)
    while i < n:
        p_num, ln = expanded_lines[i]
        matched = _match_canonical_test(ln.lower())
        if matched:
            _code, _meta, alias_end = matched
            rem = _strip_leading_test_qualifiers(ln[alias_end:])
            # Only merge with the next line if the current line has NO digits after the test name
            # AND the next line does NOT start a new canonical test or section heading
            if not re.search(r"\d", rem) and i + 1 < n:
                merged_parts = [ln]
                j = i + 1
                while j < n and j <= i + 2:
                    nxt_p, nxt_ln = expanded_lines[j]
                    if nxt_p != p_num or _is_section_or_table_heading(nxt_ln):
                        break
                    if _match_canonical_test(nxt_ln.lower()):
                        break
                    merged_parts.append(nxt_ln)
                    j += 1
                structured_lines.append((p_num, "  ".join(merged_parts)))
                i = j
                continue

        structured_lines.append((p_num, ln))
        i += 1

    return structured_lines


def parse_laboratory_report_text(
    raw_text: str,
    image_visual_cues: list[str] | None = None,
) -> dict[str, Any]:
    """
    Parses extracted laboratory report text into metadata, structured test rows, and safe diagnostics.
    Extracts test name, measured value, unit, reference interval, explicit lab flag (H/L, ↑/↓, *),
    page number, report date, and visual formatting indicators (bold/dark result text, colour highlights).
    Strictly separates the patient's Result Value from the Laboratory Reference Interval.
    """
    lines = [ln.strip() for ln in (raw_text or "").splitlines() if ln.strip()]

    report_date = datetime.now(UTC).strftime("%Y-%m-%d")
    date_match = re.search(
        r"\b(20\d{2}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]20\d{2})\b", raw_text or ""
    )
    if date_match:
        raw_dt = date_match.group(1).replace("/", "-")
        parts = raw_dt.split("-")
        if len(parts[0]) == 4:
            report_date = raw_dt
        else:
            report_date = f"{parts[2]}-{parts[1]}-{parts[0]}"

    lab_name: str | None = None
    for ln in lines[:12]:
        if re.match(r"^\[PAGE:\d+\]$", ln):
            continue
        if any(
            kw in ln.lower()
            for kw in (
                "diagnostics",
                "laboratory",
                "labs",
                "pathology",
                "hospital",
                "healthcare",
                "clinic",
                "metropolis",
                "thyrocare",
                "dr. lal",
                "srl",
                "apollo",
            )
        ):
            lab_name = re.sub(r"^(?:lab(?:oratory)?\s*name\s*[:\-]\s*)", "", ln, flags=re.I).strip()[:180]
            break

    specimen_type: str | None = None
    spec_match = re.search(
        r"\b(Whole Blood\s*\(EDTA\)|Serum|Plasma\s*\(Fluoride\)|EDTA Whole Blood|Fasting Serum|Venous Blood)\b",
        raw_text or "",
        re.I,
    )
    if spec_match:
        specimen_type = spec_match.group(1)

    structured_lines = _preprocess_multiline_table_text(raw_text)
    extracted_items: list[dict[str, Any]] = []
    seen_codes: set[str] = set()
    uncertainty_notes: list[str] = []
    candidate_rows_detected = 0
    rejected_rows_count = 0
    rejection_reasons: list[str] = []

    for page_num, line in structured_lines:
        matched = _match_canonical_test(line.lower())
        if not matched:
            continue
        code, meta, alias_end = matched
        if code in seen_codes:
            continue

        remainder = _strip_leading_test_qualifiers(line[alias_end:])
        if not remainder:
            continue

        candidate_rows_detected += 1

        # Normalize thousands-separator commas inside numbers (e.g. 6,800 -> 6800; 4,000 - 11,000 -> 4000 - 11000)
        remainder = re.sub(r"(?<=\d),(?=\d{3}\b)", "", remainder)
        # Normalize pipe '|' column separators to spaces
        remainder = remainder.replace("|", "   ")

        # 0. Inspect visual formatting markers on this row (PDF `[VISUAL:...]` tags, markdown `**val**`, HTML `<b>val</b>`, colour tags)
        visual_indicators: list[str] = []
        vis_tag_match = re.search(r"\[VISUAL:([^\]]+)\]", remainder, re.I)
        if vis_tag_match:
            for vt in vis_tag_match.group(1).split(","):
                vt_clean = vt.strip().lower()
                if vt_clean:
                    visual_indicators.append(vt_clean)
            remainder = (remainder[: vis_tag_match.start()] + " " + remainder[vis_tag_match.end() :]).strip()

        if re.search(r"(\*\*\s*\d+(?:\.\d+)?\s*\*\*|<b>\s*\d+(?:\.\d+)?\s*</b>|\[bold\]|\(bold\))", remainder, re.I):
            if "bold_result" not in visual_indicators:
                visual_indicators.append("bold_result")
            remainder = re.sub(r"\*\*|</?b>|\[bold\]|\(bold\)", " ", remainder, flags=re.I)

        if re.search(r"(\[red\]|\(red\)|\[dark\]|\[highlight(?:ed)?\]|<span[^>]*red[^>]*>)", remainder, re.I):
            if "red_text" not in visual_indicators:
                visual_indicators.append("red_text")
            remainder = re.sub(r"\[red\]|\(red\)|\[dark\]|\[highlight(?:ed)?\]|</?span[^>]*>", " ", remainder, flags=re.I)

        for img_cue in image_visual_cues or []:
            if img_cue not in visual_indicators:
                visual_indicators.append(img_cue)

        # 1. Extract printed Unit FIRST and mask out units containing numbers (like mL/min/1.73m2 or 10^3/µL)
        unit_match = re.search(rf"(?<![A-Za-z])({_KNOWN_UNITS})(?![A-Za-z])", remainder)
        unit = unit_match.group(1) if unit_match else (meta["typical_units"][0] if meta["typical_units"] else "")

        work_rem = re.sub(
            r"mL/min/1\.73m²|mL/min/1\.73m2|10\^6/µL|10\^6/uL|10\^3/µL|10\^3/uL|x10\^12/L|x10\^9/L",
            " ",
            remainder,
            flags=re.I,
        )

        # 2. Extract and strip Reference Interval FIRST so reference bounds are NEVER confused with result_value
        ref_min: float | None = None
        ref_max: float | None = None
        ref_text: str | None = None

        interval_match = re.search(
            r"(?:ref(?:erence)?(?:\s*range|\s*interval)?\s*[:\-]?\s*)?"
            r"[\(\[]?\s*(\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d+(?:\.\d+)?)\s*[\)\]]?",
            work_rem,
            re.I,
        )
        if interval_match:
            ref_min = float(interval_match.group(1))
            ref_max = float(interval_match.group(2))
            ref_text = f"{interval_match.group(1)} - {interval_match.group(2)}"
            work_rem = (
                work_rem[: interval_match.start()]
                + " "
                + work_rem[interval_match.end() :]
            )
        else:
            ineq_match = re.search(
                r"(?:ref(?:erence)?(?:\s*range|\s*interval)?\s*[:\-]?\s*)?"
                r"(?:([<>≤≥]=?)|(?:up\s*to|less\s*than|below|above|greater\s*than))\s*(\d+(?:\.\d+)?)",
                work_rem,
                re.I,
            )
            if ineq_match:
                # Only treat as reference interval if there is another standalone number before it, or if explicitly prefixed by Ref/Desirable/Normal
                before_ineq = work_rem[: ineq_match.start()]
                has_num_before = bool(re.search(r"(?<![A-Za-z0-9.^])\d+(?:\.\d+)?(?![A-Za-z0-9.^])", before_ineq))
                has_ref_kw = bool(re.search(r"ref|range|interval|desirable|normal", ineq_match.group(0), re.I))
                if has_num_before or has_ref_kw:
                    op_str = (ineq_match.group(1) or ineq_match.group(0)).lower()
                    bound_val = float(ineq_match.group(2))
                    if "<" in op_str or "≤" in op_str or "up to" in op_str or "less" in op_str or "below" in op_str:
                        ref_max = bound_val
                        ref_text = f"< {ineq_match.group(2)}"
                    elif ">" in op_str or "≥" in op_str or "above" in op_str or "greater" in op_str:
                        ref_min = bound_val
                        ref_text = f"> {ineq_match.group(2)}"
                    work_rem = (
                        work_rem[: ineq_match.start()]
                        + " "
                        + work_rem[ineq_match.end() :]
                    )

        # 3. Extract the standalone numeric Result Value from the remaining text (never matching digits embedded in words like B12 or T3)
        val_match = re.search(
            r"[-:]?\s*(\*{1,2}|[↑↓▲▼⬆⬇])?\s*(?<![A-Za-z0-9.^])(\d+(?:\.\d+)?)(?![A-Za-z0-9.^])\s*(\*{1,2}|[↑↓▲▼⬆⬇])?",
            work_rem,
        )

        result_val: float | None = None
        result_text: str = ""
        prefix_sym: str | None = None
        suffix_sym: str | None = None
        unreadable_row_reason: str | None = None

        if val_match:
            prefix_sym, num_str, suffix_sym = (
                val_match.group(1),
                val_match.group(2),
                val_match.group(3),
            )
            result_val = float(num_str)
            result_text = num_str
            after_val = work_rem[val_match.end() :]
        else:
            # Check if this row had a reference interval or unreadable marker token (e.g. '--', '??', 'unreadable', 'blurred')
            if ref_text is not None or re.search(r"(--|\?\?|unreadable|blur|smudge|pending)", work_rem, re.I):
                unreadable_row_reason = (
                    f"{meta['display_name']}: Measured value is missing or unreadable on this row "
                    f"(reference interval {ref_text or 'not detected'}). Flagged for manual review."
                )
                rejected_rows_count += 1
                rejection_reasons.append(unreadable_row_reason)
                after_val = work_rem
            else:
                rejected_rows_count += 1
                rejection_reasons.append(
                    f"Candidate line for {meta['display_name']} had no associated numeric measurement."
                )
                continue

        # 4. Extract explicit laboratory flag (H, L, High, Low, ↑, ↓, ▲, ▼, *, Abnormal, Borderline)
        printed_flag: str | None = None
        if prefix_sym or suffix_sym:
            printed_flag = (prefix_sym or suffix_sym).strip()

        after_val_no_unit = re.sub(rf"(?<![A-Za-z])({_KNOWN_UNITS})(?![A-Za-z])", " ", after_val)
        flag_match = re.search(
            r"(?:(?<![A-Za-z/])(?:\b|\()(?P<word>HIGH|LOW|ABNORMAL|CRITICAL|BORDERLINE|NORMAL|H|L)(?:\b|\))(?![A-Za-z/]))|(?P<sym>[↑↓▲▼⬆⬇]|\*{1,2})",
            after_val_no_unit,
            re.I,
        )
        if flag_match:
            cand_flag = (flag_match.group("word") or flag_match.group("sym") or "").strip()
            if cand_flag:
                printed_flag = cand_flag

        if printed_flag in ("↑", "▲", "⬆") and "up_arrow" not in visual_indicators:
            visual_indicators.append("up_arrow")
        elif printed_flag in ("↓", "▼", "⬇") and "down_arrow" not in visual_indicators:
            visual_indicators.append("down_arrow")
        elif printed_flag in ("*", "**") and "asterisk_flag" not in visual_indicators:
            visual_indicators.append("asterisk_flag")
        elif printed_flag and printed_flag.upper() in ("H", "L", "HIGH", "LOW") and f"{printed_flag.upper()}_flag" not in visual_indicators:
            visual_indicators.append(f"{printed_flag.upper()}_flag")

        # 5. Validate OCR decimal / physiological plausibility
        is_ocr_suspect, proposed_corr, suspect_reason = _check_ocr_decimal_plausibility(
            code, result_val, unit, ref_min, ref_max
        )
        if is_ocr_suspect and suspect_reason:
            uncertainty_notes.append(suspect_reason)

        # 6. Multi-signal status evaluation
        status_eval = _compute_multi_signal_status(
            result_value=result_val,
            ref_min=ref_min,
            ref_max=ref_max,
            printed_flag=printed_flag,
            visual_indicators=visual_indicators,
            is_ocr_suspect=is_ocr_suspect,
            ocr_suspect_reason=suspect_reason or unreadable_row_reason,
        )
        if status_eval["review_reason"] and status_eval["review_reason"] not in uncertainty_notes:
            uncertainty_notes.append(f"{meta['display_name']}: {status_eval['review_reason']}")

        seen_codes.add(code)
        extracted_items.append(
            {
                "canonical_code": code,
                "panel_category": meta["panel_category"],
                "panel_code": meta["panel_category"],
                "test_name": meta["display_name"],
                "result_value": result_val,
                "measured_value": result_val,
                "result_text": result_text,
                "unit": unit,
                "reference_min": ref_min,
                "reference_low": ref_min,
                "reference_max": ref_max,
                "reference_high": ref_max,
                "reference_text": ref_text,
                "reference_range_text": ref_text,
                "printed_flag": status_eval["normalized_flag"] or None,
                "visual_indicators": visual_indicators,
                "page_number": page_num,
                "range_status": status_eval["range_status"],
                "status_flag": status_eval["status_flag"],
                "status_label": status_eval["status_label"],
                "requires_manual_review": status_eval["requires_manual_review"],
                "review_reason": status_eval["review_reason"],
                "proposed_correction": proposed_corr,
                "confidence_score": 0.45
                if result_val is None
                else (0.55 if is_ocr_suspect else (0.75 if status_eval["requires_manual_review"] else 0.96)),
                "test_date": report_date,
                "specimen_info": specimen_type,
                "notes": status_eval["review_reason"],
            }
        )

    summary_preview = build_cautious_nutritional_concerns(extracted_items)
    valid_structured_count = sum(1 for item in extracted_items if item.get("result_value") is not None)

    return {
        "report_title": f"Lab Report ({lab_name})" if lab_name else "Laboratory Health Report",
        "laboratory_name": lab_name,
        "report_date": report_date,
        "specimen_type": specimen_type,
        "measurements": extracted_items,
        "uncertainty_notes": uncertainty_notes,
        "report_summary": summary_preview,
        "parser_diagnostics": {
            "candidate_rows_detected": candidate_rows_detected,
            "valid_structured_rows": valid_structured_count,
            "total_extracted_rows": len(extracted_items),
            "rejected_rows_count": rejected_rows_count,
            "rejection_reasons": rejection_reasons,
        },
    }


def build_cautious_nutritional_concerns(
    measurements: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Synthesizes a concise, non-diagnostic report summary:
    - `measurements_reviewed`
    - `results_requiring_attention`
    - `attention_results` (below/above reference, lab-flagged abnormal, or requires manual review)
    - `normal_results` (within reference interval, kept compact)
    - `possible_nutritional_concerns` (cautious, evidence-based wording; never claims a confirmed deficiency from a single marker that cannot establish it alone, and never uses unverified OCR values)
    """
    by_code: dict[str, dict[str, Any]] = {}
    attention_results: list[dict[str, Any]] = []
    normal_results: list[dict[str, Any]] = []

    for m in measurements:
        r_status = str(m.get("range_status") or "")
        s_flag = str(m.get("status_flag") or "")
        is_attention = r_status in (
            "below_reference",
            "above_reference",
            "lab_flagged_abnormal",
            "requires_manual_review",
        ) or s_flag in ("low", "high", "lab_flagged_abnormal", "requires_manual_review", "critical_attention")

        if is_attention:
            attention_results.append(m)
        else:
            normal_results.append(m)

        if not m.get("requires_manual_review") and r_status in ("below_reference", "above_reference", "lab_flagged_abnormal"):
            by_code[str(m.get("canonical_code") or "")] = m

    concerns: list[dict[str, Any]] = []

    # 1. Haemoglobin & Iron Studies (Cautious differentiation!)
    hb_m = by_code.get("haemoglobin")
    ferr_m = by_code.get("serum_ferritin")
    iron_m = by_code.get("serum_iron")
    tsat_m = by_code.get("transferrin_saturation")
    mcv_m = by_code.get("mcv")
    mch_m = by_code.get("mch")

    iron_markers_low = [
        x
        for x in (ferr_m, iron_m, tsat_m)
        if x and x.get("range_status") == "below_reference"
    ]
    if iron_markers_low:
        names = ", ".join(f"{x['test_name']} ({x.get('result_value') or x.get('measured_value')} {x.get('unit') or ''})" for x in iron_markers_low)
        concerns.append(
            {
                "concern_code": "possible_low_iron_status",
                "title": "Possible low iron status",
                "explanation": (
                    f"Your report shows {names} below the laboratory reference interval"
                    + (
                        f" alongside low haemoglobin ({hb_m.get('result_value') or hb_m.get('measured_value')} {hb_m.get('unit') or ''}). "
                        if hb_m and hb_m.get("range_status") == "below_reference"
                        else ". "
                    )
                    + "Dietary iron from Indian legumes, pulses, and green leafy vegetables is non-haem iron; pairing these foods with vitamin C sources (such as amla, guava, or lemon) supports iron absorption."
                ),
                "supporting_markers": [x["canonical_code"] for x in iron_markers_low]
                + (["haemoglobin"] if hb_m and hb_m.get("range_status") == "below_reference" else []),
            }
        )
    elif hb_m and hb_m.get("range_status") == "below_reference":
        microcytic_hint = (
            (mcv_m and mcv_m.get("range_status") == "below_reference")
            or (mch_m and mch_m.get("range_status") == "below_reference")
        )
        concerns.append(
            {
                "concern_code": "low_haemoglobin_evaluation",
                "title": (
                    "Low haemoglobin with low red-cell indices (iron & blood count assessment needed)"
                    if microcytic_hint
                    else "Low haemoglobin finding (requires full blood count & nutritional assessment)"
                ),
                "explanation": (
                    "Your report shows a low haemoglobin result. This may have several causes and should be assessed with the full blood count and other relevant tests (such as serum ferritin, iron studies, vitamin B12, and folate)."
                ),
                "supporting_markers": ["haemoglobin"],
            }
        )

    # 2. Vitamin B12
    b12_m = by_code.get("vitamin_b12")
    if b12_m and b12_m.get("range_status") == "below_reference":
        concerns.append(
            {
                "concern_code": "possible_low_vitamin_b12",
                "title": "Possible low vitamin B12 status",
                "explanation": (
                    f"Your Vitamin B12 result ({b12_m.get('result_value') or b12_m.get('measured_value')} {b12_m.get('unit') or ''}) is below the printed reference interval. "
                    "Unfortified plant foods do not supply vitamin B12; dairy foods (milk, curd, paneer) provide dietary B12 for vegetarians, and you should discuss with your doctor whether supplementation is needed."
                ),
                "supporting_markers": ["vitamin_b12"],
            }
        )

    # 3. Vitamin D
    vitd_m = by_code.get("vitamin_d_25oh")
    if vitd_m and vitd_m.get("range_status") == "below_reference":
        concerns.append(
            {
                "concern_code": "possible_low_vitamin_d",
                "title": "Possible low vitamin D status",
                "explanation": (
                    f"Your 25-OH Vitamin D result ({vitd_m.get('result_value') or vitd_m.get('measured_value')} {vitd_m.get('unit') or ''}) is below the printed reference interval. "
                    "Very few foods naturally contain substantial vitamin D, so food alone will not correct every low vitamin D result; discuss clinician-guided vitamin D care and safe sunlight exposure alongside dietary vitamin D and calcium sources."
                ),
                "supporting_markers": ["vitamin_d_25oh"],
            }
        )

    # 4. Folate
    fol_m = by_code.get("serum_folate")
    if fol_m and fol_m.get("range_status") == "below_reference":
        concerns.append(
            {
                "concern_code": "possible_low_folate",
                "title": "Possible low folate (vitamin B9) status",
                "explanation": (
                    f"Your serum folate result ({fol_m.get('result_value') or fol_m.get('measured_value')} {fol_m.get('unit') or ''}) is below the reference interval. "
                    "Green leafy vegetables and pulses provide natural dietary folate."
                ),
                "supporting_markers": ["serum_folate"],
            }
        )

    # 5. Glucose & HbA1c
    gluc_markers = [
        by_code[k]
        for k in ("fasting_blood_glucose", "post_prandial_glucose", "random_blood_glucose", "hba1c")
        if k in by_code and by_code[k].get("range_status") in ("above_reference", "below_reference")
    ]
    if gluc_markers:
        g_names = ", ".join(f"{x['test_name']} ({x.get('result_value') or x.get('measured_value')} {x.get('unit') or ''})" for x in gluc_markers)
        concerns.append(
            {
                "concern_code": "glycaemic_regulation_attention",
                "title": "Blood glucose / HbA1c finding requiring attention",
                "explanation": (
                    f"Your report includes {g_names} outside the printed reference interval. "
                    "Educational nutrition focuses on carbohydrate quality, portion moderation, and pairing whole grains/millets with fibre-rich pulses and vegetables."
                ),
                "supporting_markers": [x["canonical_code"] for x in gluc_markers],
            }
        )

    # 6. Lipid Profile
    lipid_markers = [
        by_code[k]
        for k in ("total_cholesterol", "ldl_cholesterol", "triglycerides", "hdl_cholesterol")
        if k in by_code
        and (
            (k == "hdl_cholesterol" and by_code[k].get("range_status") == "below_reference")
            or (k != "hdl_cholesterol" and by_code[k].get("range_status") == "above_reference")
        )
    ]
    if lipid_markers:
        l_names = ", ".join(f"{x['test_name']} ({x.get('result_value') or x.get('measured_value')} {x.get('unit') or ''})" for x in lipid_markers)
        concerns.append(
            {
                "concern_code": "lipid_profile_attention",
                "title": "Lipid profile finding (dietary fibre & fat quality focus)",
                "explanation": (
                    f"Your report shows {l_names} outside the reference interval. "
                    "Increasing soluble dietary fibre (from oats, pulses, and vegetables) and moderating saturated fats and refined sugars can support lipid management alongside medical guidance."
                ),
                "supporting_markers": [x["canonical_code"] for x in lipid_markers],
            }
        )

    # 7. Kidney Function & Electrolytes
    kidney_markers = [
        by_code[k]
        for k in ("serum_creatinine", "egfr", "blood_urea", "serum_potassium", "serum_sodium", "uric_acid")
        if k in by_code and by_code[k].get("range_status") in ("above_reference", "below_reference")
    ]
    if kidney_markers:
        k_names = ", ".join(f"{x['test_name']} ({x.get('result_value') or x.get('measured_value')} {x.get('unit') or ''})" for x in kidney_markers)
        concerns.append(
            {
                "concern_code": "kidney_function_medical_review",
                "title": "Kidney or electrolyte marker outside reference — medical review required",
                "explanation": (
                    f"Your report shows {k_names} outside the printed reference interval. "
                    "Dietary protein, potassium, phosphorus, sodium, and fluid requirements in kidney conditions are highly individualised; "
                    "GharPlate avoids automatic high-protein or high-potassium recommendations so you can review these results with your doctor."
                ),
                "supporting_markers": [x["canonical_code"] for x in kidney_markers],
            }
        )

    # 8. Liver & Thyroid
    liver_thyroid = [
        by_code[k]
        for k in ("alt_sgpt", "ast_sgot", "total_bilirubin", "alkaline_phosphatase", "tsh", "t3", "t4")
        if k in by_code and by_code[k].get("range_status") in ("above_reference", "below_reference")
    ]
    if liver_thyroid:
        lt_names = ", ".join(f"{x['test_name']} ({x.get('result_value') or x.get('measured_value')} {x.get('unit') or ''})" for x in liver_thyroid)
        concerns.append(
            {
                "concern_code": "liver_or_thyroid_attention",
                "title": "Liver or thyroid marker outside reference interval",
                "explanation": (
                    f"Your report includes {lt_names} outside the printed reference interval. "
                    "Please review these results with your physician alongside your clinical history and any current medications."
                ),
                "supporting_markers": [x["canonical_code"] for x in liver_thyroid],
            }
        )

    return {
        "measurements_reviewed": len(measurements),
        "results_requiring_attention": len(attention_results),
        "normal_results_count": len(normal_results),
        "attention_results": attention_results,
        "normal_results": normal_results,
        "possible_nutritional_concerns": concerns,
    }


def extract_health_report_from_upload(
    file_bytes: bytes,
    filename: str | None = None,
    content_type: str | None = None,
    hint_text: str | None = None,
    report_title: str | None = None,
) -> dict[str, Any]:
    validation = validate_health_report_upload(
        file_bytes=file_bytes,
        filename=filename,
        content_type=content_type,
    )

    image_visual_cues: list[str] = []
    if validation["detected_format"] == "pdf":
        raw_text, engine = extract_text_from_pdf_bytes(file_bytes)
        non_page_raw = re.sub(r"\[PAGE:\d+\]", "", raw_text or "").strip()
        if not non_page_raw and hint_text:
            raw_text = hint_text.strip()
            engine = "pdf_scanned_with_text_hint"
    else:
        raw_text, engine, image_visual_cues = _extract_text_from_image_or_vision(
            file_bytes=file_bytes,
            mime_type=validation["mime_type"],
            hint_text=hint_text,
        )

    non_page_text = re.sub(r"\[PAGE:\d+\]", "", raw_text or "").strip()
    text_extracted = bool(non_page_text)
    parsed = parse_laboratory_report_text(raw_text, image_visual_cues=image_visual_cues)
    measurements = parsed["measurements"]
    p_diag = parsed.get("parser_diagnostics") or {}

    if len(measurements) > 0:
        extraction_status = "extracted_requires_confirmation"
        final_api_status = (
            "partial_requires_review"
            if any(m.get("requires_manual_review") for m in measurements)
            else "confirmation_required"
        )
        extraction_error_message = None
    elif text_extracted:
        extraction_status = "no_structured_tests_found"
        final_api_status = "extraction_failed"
        extraction_error_message = (
            "Text was read from the uploaded file, but no recognisable laboratory test rows with values could be matched. "
            "Please upload a clearer laboratory report image/PDF, paste the report text, or enter values manually."
        )
    else:
        extraction_status = "ocr_text_unavailable"
        final_api_status = "extraction_failed"
        extraction_error_message = (
            "Could not extract readable text or laboratory values from the uploaded file. "
            "Please check that the image or PDF is clear and upright, retry analysis, or enter values manually."
        )

    warnings: list[str] = list(parsed.get("uncertainty_notes") or [])
    if not measurements:
        warnings.append(
            extraction_error_message
            or "No structured laboratory rows were automatically matched. You can retry with a clearer file or enter test rows manually."
        )
    for m in measurements:
        if m["range_status"] == "reference_unavailable":
            warnings.append(
                f"No printed reference interval was detected for '{m['test_name']}'. Please enter the reference range printed on your report if available."
            )

    rejection_reasons = list(p_diag.get("rejection_reasons") or [])
    if not text_extracted:
        rejection_reasons.append(f"OCR engine ({engine}) detected no legible laboratory text lines.")

    extraction_diagnostics = {
        "file_type": validation["detected_format"],
        "mime_type": validation["mime_type"],
        "file_size_bytes": validation["file_size_bytes"],
        "ocr_engine_used": engine,
        "ocr_success": text_extracted,
        "pages_or_images_processed": validation["page_count"],
        "text_extracted": text_extracted,
        "candidate_rows_detected": int(p_diag.get("candidate_rows_detected", 0)),
        "valid_structured_rows": int(p_diag.get("valid_structured_rows", 0)),
        "rejected_rows_count": int(p_diag.get("rejected_rows_count", 0)),
        "rejection_reasons": rejection_reasons[:15],
        "final_api_status": final_api_status,
    }

    return {
        "extraction_id": f"hr-ext-{uuid.uuid4().hex[:10]}",
        "extraction_status": extraction_status,
        "extraction_error_message": extraction_error_message,
        "extraction_engine": engine,
        "extraction_method": engine,
        "extraction_diagnostics": extraction_diagnostics,
        "file_name": filename,
        "mime_type": validation["mime_type"],
        "file_size_bytes": validation["file_size_bytes"],
        "page_count": validation["page_count"],
        "file_validation": validation,
        "report_title": report_title or parsed["report_title"],
        "laboratory_name": parsed["laboratory_name"],
        "report_date": parsed["report_date"],
        "specimen_type": parsed["specimen_type"],
        "extracted_count": len(measurements),
        "measurements": measurements,
        "extracted_measurements": measurements,
        "report_summary": parsed["report_summary"],
        "possible_nutritional_concerns": parsed["report_summary"]["possible_nutritional_concerns"],
        "raw_extracted_text": raw_text[:4000] if raw_text else "",
        "validation_warnings": warnings,
        "uncertainty_notes": warnings,
        "requires_user_confirmation": True,
        "saved_to_database": False,
        "privacy_notice": PRIVACY_EPHEMERAL_UPLOAD_NOTICE,
        "medical_disclaimer": MEDICAL_REPORT_DISCLAIMER,
    }


# ============================================================================
# 4. LAB-TO-PLATE INTELLIGENCE & ACTUAL DATABASE FOOD RETRIEVAL
# ============================================================================
def _retrieve_verified_foods_for_marker(
    db: Session,
    member: HouseholdMember,
    code: str,
    meta: dict[str, Any],
    range_status: str,
    kidney_block_active: bool = False,
) -> list[dict[str, Any]]:
    """
    Retrieves actual Indian foods from GharPlate's database (`FoodItem` + `FoodNutrientValue`)
    for a confirmed abnormal marker.
    - Never invents nutrient values or sources.
    - Preserves `None` (`NULL`) for missing nutrients (never treats NULL as 0).
    - Respects household member's dietary preference (vegetarian, vegan, non-vegetarian) and allergies.
    - For Vitamin D, only labels a food as containing Vitamin D when `vit_d_mcg`/`vitamin_d_ug` is non-null in the database.
    """
    if kidney_block_active or bool(meta.get("kidney_caution")):
        return []
    if range_status not in ("below_reference", "above_reference", "lab_flagged_abnormal"):
        return []

    focus = meta.get("food_nutrient_focus") or {}
    preferred_slugs: list[str] = list(focus.get("preferred_slugs") or [])
    primary_codes: list[str] = list(focus.get("primary_nutrient_codes") or [])
    short_reason_base = str(focus.get("short_reason_label") or "Provides relevant nutrients")

    member_diet = (member.dietary_preference or "vegetarian").strip().lower()
    member_allergies = {a.strip().lower() for a in (member.allergies or []) if a and a.strip()}

    candidate_foods: list[FoodItem] = []
    seen_ids: set[int] = set()

    if preferred_slugs:
        pref_rows = (
            db.query(FoodItem)
            .options(joinedload(FoodItem.source), joinedload(FoodItem.nutrient_values))
            .filter(FoodItem.slug.in_(preferred_slugs))
            .all()
        )
        by_slug = {f.slug: f for f in pref_rows}
        for s in preferred_slugs:
            if s in by_slug and by_slug[s].id not in seen_ids:
                candidate_foods.append(by_slug[s])
                seen_ids.add(by_slug[s].id)

    if primary_codes:
        # Query shared Nutrient Food Search Service so Health Reports and Nutrient Explorer share one engine
        try:
            from app.services.nutrient_food_search_service import search_foods_by_nutrient

            shared_diet = (
                member_diet
                if member_diet in ("vegetarian", "vegan", "eggetarian", "non_vegetarian")
                else "all"
            )
            if member_diet == "jain":
                shared_diet = "vegetarian"
            shared_res = search_foods_by_nutrient(
                db,
                nutrient_query=primary_codes[0],
                dietary_preference=shared_diet,
                food_form="natural",
                sort_by="per_100g_desc",
                limit=14,
            )
            shared_slugs = [
                item["slug"]
                for item in (shared_res.get("foods") or [])
                if item.get("slug")
            ]
            if shared_slugs:
                shared_rows = (
                    db.query(FoodItem)
                    .options(joinedload(FoodItem.source), joinedload(FoodItem.nutrient_values))
                    .filter(FoodItem.slug.in_(shared_slugs))
                    .all()
                )
                shared_by_slug = {f.slug: f for f in shared_rows}
                for s_slug in shared_slugs:
                    if s_slug in shared_by_slug and shared_by_slug[s_slug].id not in seen_ids:
                        candidate_foods.append(shared_by_slug[s_slug])
                        seen_ids.add(shared_by_slug[s_slug].id)
        except Exception:
            pass

        db_nutrient_rows = (
            db.query(FoodItem)
            .join(FoodNutrientValue, FoodNutrientValue.food_id == FoodItem.id)
            .options(joinedload(FoodItem.source), joinedload(FoodItem.nutrient_values))
            .filter(
                FoodNutrientValue.nutrient_code.in_(primary_codes),
                FoodNutrientValue.value.isnot(None),
                FoodNutrientValue.value > 0,
                FoodItem.is_packaged.is_(False),
            )
            .limit(18)
            .all()
        )
        for f_row in db_nutrient_rows:
            if f_row.id not in seen_ids:
                candidate_foods.append(f_row)
                seen_ids.add(f_row.id)

    recommended_out: list[dict[str, Any]] = []
    for f in candidate_foods:
        dietary_mismatch_note: str | None = None
        if member_diet in ("vegetarian", "jain") and not f.is_vegetarian:
            continue
        if member_diet == "vegan" and not f.is_vegan:
            if not f.is_vegetarian:
                continue
            if code == "vitamin_b12":
                dietary_mismatch_note = (
                    "Dietary Mismatch Note: This dairy food is vegetarian but not vegan. Unfortified plant foods do not contain vitamin B12; discuss vegan B12 supplementation with your doctor."
                )
            else:
                continue

        nut_map: dict[str, float | None] = {}
        missing_codes: list[str] = []
        available_count = 0
        for nv in f.nutrient_values or []:
            nut_map[nv.nutrient_code] = nv.value
            if nv.value is None:
                missing_codes.append(nv.nutrient_code)
            else:
                available_count += 1

        total_tracked = max(1, len(f.nutrient_values or []))
        completeness_pct = round((available_count / total_tracked) * 100.0, 1)

        matched_nut_code: str | None = None
        matched_nut_val: float | None = None
        for p_code in primary_codes:
            val = nut_map.get(p_code)
            if val is not None and val > 0:
                matched_nut_code = p_code
                matched_nut_val = val
                break

        if code == "vitamin_b12" and matched_nut_code not in ("vit_b12_mcg", "vitamin_b12_ug"):
            if nut_map.get("vit_b12_mcg") is None and nut_map.get("vitamin_b12_ug") is None:
                matched_nut_code = "vit_b12_mcg"
                matched_nut_val = None
        if code == "vitamin_d_25oh":
            vd_val = nut_map.get("vit_d_mcg") if nut_map.get("vit_d_mcg") is not None else nut_map.get("vitamin_d_ug")
            ca_val = nut_map.get("calcium_mg")
            if vd_val is not None and vd_val > 0:
                matched_nut_code = "vit_d_mcg"
                matched_nut_val = vd_val
            elif ca_val is not None and ca_val > 0:
                matched_nut_code = "calcium_mg"
                matched_nut_val = ca_val
            else:
                continue

        nut_label, nut_unit = _NUTRIENT_DISPLAY_META.get(
            matched_nut_code or (primary_codes[0] if primary_codes else "iron_mg"),
            ("Nutrient", ""),
        )
        srv_g = f.standard_serving_grams or 100.0
        val_per_serving = (
            round(matched_nut_val * (srv_g / 100.0), 2)
            if matched_nut_val is not None
            else None
        )

        if code == "vitamin_d_25oh" and matched_nut_code == "calcium_mg" and matched_nut_val is not None:
            short_reason = f"Provides calcium ({matched_nut_val} mg per 100 g; Vitamin D value unavailable in DB)."
        elif matched_nut_val is not None:
            if matched_nut_code in ("vit_b12_mcg", "vitamin_b12_ug"):
                short_reason = f"Contains vitamin B12 ({matched_nut_val} {nut_unit} per 100 g)."
            elif matched_nut_code in ("vit_d_mcg", "vitamin_d_ug"):
                short_reason = f"Contains vitamin D ({matched_nut_val} {nut_unit} per 100 g)."
            elif matched_nut_code == "iron_mg":
                short_reason = f"Provides iron ({matched_nut_val} mg per 100 g)."
            elif matched_nut_code == "fibre_g":
                short_reason = f"Provides dietary fibre ({matched_nut_val} g per 100 g)."
            elif matched_nut_code in ("folate_mcg", "folate_ug"):
                short_reason = f"Provides dietary folate ({matched_nut_val} {nut_unit} per 100 g)."
            elif matched_nut_code == "calcium_mg":
                short_reason = f"Provides calcium ({matched_nut_val} mg per 100 g)."
            else:
                short_reason = f"{short_reason_base} ({matched_nut_val} {nut_unit} {nut_label.lower()} per 100 g)."
        else:
            short_reason = f"{short_reason_base} ({nut_label}: Unavailable / NULL in current database record)."

        f_allergens = {a.lower() for a in (f.allergen_tags or []) if a}
        allergen_conflict = sorted(list(member_allergies.intersection(f_allergens)))
        allergen_warnings = [
            f"Allergy Alert: Contains {al} (matches member allergy profile — verify ingredients and cross-contact risks)."
            for al in allergen_conflict
        ]
        if member_allergies and not allergen_warnings and (f.allergen_tags or []):
            allergen_warnings.append(
                f"Declared allergen tags: {', '.join(f.allergen_tags)}. Verify ingredients and cross-contact risks."
            )

        recommended_out.append(
            {
                "slug": f.slug,
                "name_en": f.name_en,
                "image_url": f.image_url,
                "short_reason": short_reason,
                "primary_nutrient_code": matched_nut_code,
                "primary_nutrient_name": nut_label,
                "primary_nutrient_value_per_100g": matched_nut_val,
                "primary_nutrient_value_per_serving": val_per_serving,
                "primary_nutrient_unit": nut_unit,
                "standard_serving_name": f.standard_serving_name,
                "standard_serving_grams": srv_g,
                "default_basis": f.default_basis or "100g",
                "is_vegetarian": f.is_vegetarian,
                "is_vegan": f.is_vegan,
                "dietary_mismatch_note": dietary_mismatch_note,
                "completeness_pct": completeness_pct,
                "available_nutrient_count": available_count,
                "missing_nutrient_codes": missing_codes,
                "energy_kcal": nut_map.get("energy_kcal"),
                "protein_g": nut_map.get("protein_g"),
                "carbs_g": nut_map.get("carbs_g"),
                "fat_total_g": nut_map.get("fat_total_g"),
                "fibre_g": nut_map.get("fibre_g"),
                "iron_mg": nut_map.get("iron_mg"),
                "calcium_mg": nut_map.get("calcium_mg"),
                "folate_ug": nut_map.get("folate_mcg") if nut_map.get("folate_mcg") is not None else nut_map.get("folate_ug"),
                "vitamin_c_mg": nut_map.get("vit_c_mg") if nut_map.get("vit_c_mg") is not None else nut_map.get("vitamin_c_mg"),
                "vitamin_b12_mcg": nut_map.get("vit_b12_mcg") if nut_map.get("vit_b12_mcg") is not None else nut_map.get("vitamin_b12_ug"),
                "vitamin_d_mcg": nut_map.get("vit_d_mcg") if nut_map.get("vit_d_mcg") is not None else nut_map.get("vitamin_d_ug"),
                "key_nutrients_per_100": {
                    "energy_kcal": nut_map.get("energy_kcal"),
                    "protein_g": nut_map.get("protein_g"),
                    "fibre_g": nut_map.get("fibre_g"),
                    "iron_mg": nut_map.get("iron_mg"),
                    "calcium_mg": nut_map.get("calcium_mg"),
                    "folate_ug": nut_map.get("folate_mcg") if nut_map.get("folate_mcg") is not None else nut_map.get("folate_ug"),
                    "vitamin_c_mg": nut_map.get("vit_c_mg") if nut_map.get("vit_c_mg") is not None else nut_map.get("vitamin_c_mg"),
                    "vitamin_b12_mcg": nut_map.get("vit_b12_mcg") if nut_map.get("vit_b12_mcg") is not None else nut_map.get("vitamin_b12_ug"),
                    "vitamin_d_mcg": nut_map.get("vit_d_mcg") if nut_map.get("vit_d_mcg") is not None else nut_map.get("vitamin_d_ug"),
                },
                "allergen_warnings": allergen_warnings,
                "source_name": f.source.name if f.source else "ICMR-NIN IFCT 2017",
                "source_url": f.source.url if f.source else "https://www.nin.res.in/",
            }
        )

    primary_priority_set = set(primary_codes[:2]) if code == "vitamin_d_25oh" else set(primary_codes[:1])
    recommended_out.sort(
        key=lambda x: (
            x["primary_nutrient_code"] in primary_priority_set,
            x["primary_nutrient_value_per_100g"] is not None,
            x["primary_nutrient_value_per_100g"] or 0.0,
        ),
        reverse=True,
    )
    return recommended_out[:8]


def _build_measurement_interpretation(
    db: Session,
    member: HouseholdMember,
    item: dict[str, Any],
    kidney_block_active: bool = False,
) -> dict[str, Any]:
    code = str(item.get("canonical_code") or "").strip().lower()
    meta = LAB_TEST_CATALOG.get(code)
    result_val = item.get("result_value")
    unit = item.get("unit") or ""
    ref_min = item.get("reference_min")
    ref_max = item.get("reference_max")
    ref_text = item.get("reference_text")
    if not ref_text and (ref_min is not None or ref_max is not None):
        if ref_min is not None and ref_max is not None:
            ref_text = f"{ref_min} - {ref_max}"
        elif ref_max is not None:
            ref_text = f"< {ref_max}"
        elif ref_min is not None:
            ref_text = f"> {ref_min}"

    status_eval = _compute_multi_signal_status(
        float(result_val) if result_val is not None else None,
        float(ref_min) if ref_min is not None else None,
        float(ref_max) if ref_max is not None else None,
        item.get("printed_flag"),
        item.get("visual_indicators"),
    )
    range_status = status_eval["range_status"]

    if range_status == "below_reference":
        comparison_summary = (
            f"Printed result ({result_val} {unit}) is below the laboratory reference interval ({ref_text or 'printed range'} {unit})."
        )
    elif range_status == "above_reference":
        comparison_summary = (
            f"Printed result ({result_val} {unit}) is above the laboratory reference interval ({ref_text or 'printed range'} {unit})."
        )
    elif range_status == "within_reference":
        comparison_summary = (
            f"Printed result ({result_val} {unit}) is within the laboratory reference interval ({ref_text or 'normal'} {unit})."
        )
    elif range_status == "requires_manual_review":
        comparison_summary = status_eval["review_reason"] or (
            f"Printed result ({result_val} {unit}) requires manual verification against your original laboratory report."
        )
    elif range_status == "lab_flagged_abnormal":
        comparison_summary = (
            f"Printed result ({result_val} {unit}) was flagged abnormal by the laboratory, though a numerical reference interval was not printed."
        )
    else:
        comparison_summary = (
            f"Printed result is {result_val} {unit}. Reference interval unavailable on the report; "
            "GharPlate does not invent unverified reference intervals."
        )

    if not meta:
        return {
            "what_it_measures": f"Laboratory measurement for {item.get('test_name', 'this marker')}.",
            "comparison_summary": comparison_summary,
            "clinical_context": "Single laboratory results must be interpreted by your physician alongside clinical history.",
            "doctor_questions": [
                f"What does this {item.get('test_name', 'test')} result mean for my overall health?"
            ],
            "kidney_safety_caution": None,
            "educational_food_note": "Discuss personalised nutrition adjustments with your clinician.",
            "recommended_foods": [],
            "portion_awareness_foods": [],
            "status_label": status_eval["status_label"],
            "visual_indicators": item.get("visual_indicators") or [],
            "page_number": item.get("page_number") or 1,
        }

    is_kidney = bool(meta.get("kidney_caution"))
    kidney_caution_msg = (
        "KIDNEY FUNCTION SAFETY NOTICE: Kidney-related markers (Creatinine, eGFR, Urea, Uric Acid, Potassium, Sodium) "
        "require clinician-specific guidance on potassium, sodium, phosphorus, protein, and fluid intake. "
        "GharPlate does not auto-recommend high-potassium, high-phosphorus, or high-protein foods when kidney markers are abnormal."
        if is_kidney
        else None
    )

    focus = meta.get("food_nutrient_focus", {})
    portion_slugs: list[str] = focus.get("portion_sensitive_slugs", [])

    recommended_foods = _retrieve_verified_foods_for_marker(
        db=db,
        member=member,
        code=code,
        meta=meta,
        range_status=range_status,
        kidney_block_active=kidney_block_active,
    )

    portion_foods: list[dict[str, Any]] = []
    if portion_slugs and not kidney_block_active:
        p_objs = db.query(FoodItem).filter(FoodItem.slug.in_(portion_slugs)).all()
        for pf in p_objs:
            portion_foods.append(
                {
                    "slug": pf.slug,
                    "name_en": pf.name_en,
                    "standard_serving_name": pf.standard_serving_name,
                    "note": "Consider portion moderation and pairing with fibre-rich pulses and vegetables.",
                }
            )

    return {
        "what_it_measures": meta["what_it_measures"],
        "comparison_summary": comparison_summary,
        "clinical_context": meta["clinical_context"],
        "doctor_questions": meta["doctor_questions"],
        "related_condition_codes": meta.get("related_condition_codes", []),
        "kidney_safety_caution": kidney_caution_msg,
        "educational_food_note": focus.get("educational_food_note", ""),
        "focus_nutrient_label": focus.get("short_reason_label", meta["display_name"]),
        "recommended_foods": recommended_foods,
        "portion_awareness_foods": portion_foods,
        "status_label": status_eval["status_label"],
        "visual_indicators": item.get("visual_indicators") or [],
        "page_number": item.get("page_number") or 1,
    }


def serialize_health_report(report: HealthReport) -> dict[str, Any]:
    measurements_out = []
    marker_food_cards = []
    flagged_count = 0
    kidney_safety_triggered = False
    kidney_safety_notice: str | None = None

    status_flag_map = {
        "below_reference": "low",
        "above_reference": "high",
        "within_reference": "within_reference",
        "lab_flagged_abnormal": "lab_flagged_abnormal",
        "requires_manual_review": "requires_manual_review",
        "reference_unavailable": "reference_unavailable",
    }
    status_label_map = {
        "below_reference": "Below reference interval",
        "above_reference": "Above reference interval",
        "within_reference": "Within reference interval",
        "lab_flagged_abnormal": "Laboratory-flagged abnormal",
        "requires_manual_review": "Requires manual review",
        "reference_unavailable": "Reference interval unavailable",
    }

    for m in report.measurements or []:
        interp = m.interpretation_json or {}
        if interp.get("kidney_safety_caution") and m.range_status in (
            "below_reference",
            "above_reference",
            "lab_flagged_abnormal",
        ):
            kidney_safety_triggered = True
            kidney_safety_notice = (
                "Kidney & Electrolyte Safety Notice: One or more renal or electrolyte markers "
                "(e.g., Serum Creatinine, eGFR, Potassium, or Urea) are outside the reference interval. "
                "Automatic high-potassium, high-phosphorus, or high-protein food recommendations are paused until reviewed by your physician."
            )

    for m in report.measurements or []:
        interp = m.interpretation_json or {}
        s_flag = status_flag_map.get(m.range_status, m.range_status)
        s_label = interp.get("status_label") or status_label_map.get(m.range_status, m.range_status)
        if m.range_status in ("below_reference", "above_reference", "lab_flagged_abnormal", "requires_manual_review"):
            flagged_count += 1

        rec_foods = [] if kidney_safety_triggered else (interp.get("recommended_foods") or [])
        if m.range_status in ("below_reference", "above_reference", "lab_flagged_abnormal") and (
            rec_foods or interp.get("educational_food_note")
        ):
            marker_food_cards.append(
                {
                    "canonical_code": m.canonical_code,
                    "test_name": m.test_name,
                    "measured_value": m.result_value,
                    "unit": m.unit,
                    "reference_range_text": m.reference_text,
                    "status_flag": s_flag,
                    "status_label": s_label,
                    "focus_nutrient_label": interp.get("focus_nutrient_label") or interp.get("what_it_measures") or m.test_name,
                    "what_it_measures": interp.get("what_it_measures") or "",
                    "clinical_context": interp.get("clinical_context") or "",
                    "educational_explanation": interp.get("educational_food_note") or interp.get("comparison_summary") or "",
                    "recommended_foods": rec_foods,
                    "foods_to_moderate": [
                        f"{pf['name_en']} ({pf.get('note', 'moderate portion')})"
                        for pf in (interp.get("portion_awareness_foods") or [])
                    ],
                    "linked_condition_code": (interp.get("related_condition_codes") or [None])[0],
                }
            )
        measurements_out.append(
            {
                "id": m.id,
                "report_id": m.report_id,
                "canonical_code": m.canonical_code,
                "panel_category": m.panel_category,
                "test_name": m.test_name,
                "result_value": m.result_value,
                "measured_value": m.result_value,
                "result_text": m.result_text,
                "unit": m.unit,
                "reference_min": m.reference_min,
                "reference_low": m.reference_min,
                "reference_max": m.reference_max,
                "reference_high": m.reference_max,
                "reference_text": m.reference_text,
                "reference_range_text": m.reference_text,
                "printed_flag": m.printed_flag,
                "visual_indicators": interp.get("visual_indicators") or [],
                "page_number": interp.get("page_number") or 1,
                "range_status": m.range_status,
                "status_flag": s_flag,
                "status_label": s_label,
                "what_it_measures": interp.get("what_it_measures"),
                "clinical_context": interp.get("clinical_context"),
                "educational_note": interp.get("comparison_summary") or interp.get("what_it_measures"),
                "test_date": m.test_date,
                "specimen_info": m.specimen_info,
                "notes": m.notes,
                "interpretation": interp,
            }
        )

    summary_dict = dict(report.summary_json or {})
    if summary_dict.get("kidney_safety_alert"):
        kidney_safety_triggered = True
        if not kidney_safety_notice:
            kidney_safety_notice = (
                "Kidney & Electrolyte Safety Notice: Renal or electrolyte markers require individualized clinician guidance."
            )

    structured_summary = build_cautious_nutritional_concerns(measurements_out)

    return {
        "id": report.id,
        "household_id": report.household_id,
        "member_id": report.member_id,
        "report_title": report.report_title,
        "laboratory_name": report.laboratory_name,
        "report_date": report.report_date,
        "specimen_type": report.specimen_type,
        "source_file_type": report.source_file_type,
        "extraction_engine": report.extraction_engine,
        "retain_raw_document_consent": report.retain_raw_document_consent,
        "user_confirmed": report.user_confirmed,
        "confirmed_at": report.confirmed_at.isoformat() if report.confirmed_at else None,
        "report_notes": report.report_notes,
        "measurement_count": len(measurements_out),
        "measurements_reviewed": len(measurements_out),
        "flagged_count": flagged_count,
        "results_requiring_attention": structured_summary["results_requiring_attention"],
        "attention_results": structured_summary["attention_results"],
        "normal_results": structured_summary["normal_results"],
        "possible_nutritional_concerns": structured_summary["possible_nutritional_concerns"],
        "overall_summary": summary_dict.get("educational_overview") or f"Reviewed {len(measurements_out)} laboratory test value(s).",
        "summary": {
            **summary_dict,
            "possible_nutritional_concerns": structured_summary["possible_nutritional_concerns"],
        },
        "lab_to_plate": {
            "kidney_safety_triggered": kidney_safety_triggered,
            "kidney_safety_notice": kidney_safety_notice,
            "member_dietary_preference": summary_dict.get("member_dietary_preference") or "vegetarian",
            "member_allergies": summary_dict.get("member_allergies") or [],
            "allergy_cross_contact_warning": (
                "Please verify ingredients and cross-contact risks if you have food allergies."
                if summary_dict.get("member_allergies")
                else None
            ),
            "marker_food_cards": marker_food_cards,
        },
        "measurements": measurements_out,
        "medical_disclaimer": MEDICAL_REPORT_DISCLAIMER,
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }


def confirm_and_save_health_report(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> dict[str, Any]:
    if not payload.get("user_confirmed"):
        raise ValueError(
            "Explicit user confirmation ('user_confirmed': true) is required before saving health report measurements."
        )

    raw_measurements = payload.get("measurements") or []
    if not isinstance(raw_measurements, list) or len(raw_measurements) == 0:
        raise ValueError("Please provide at least one reviewed laboratory measurement to confirm.")

    report_date = str(
        payload.get("report_date") or datetime.now(UTC).strftime("%Y-%m-%d")
    ).strip()[:20]
    report_title = str(
        payload.get("report_title") or "Laboratory Health Report"
    ).strip()[:200]
    lab_name = (
        str(payload["laboratory_name"]).strip()[:200]
        if payload.get("laboratory_name")
        else None
    )
    specimen_type = (
        str(payload["specimen_type"]).strip()[:120]
        if payload.get("specimen_type")
        else None
    )

    now = datetime.now(UTC)
    report = HealthReport(
        household_id=hh.id,
        member_id=member.id,
        report_title=report_title,
        laboratory_name=lab_name,
        report_date=report_date,
        specimen_type=specimen_type,
        source_file_type=str(payload.get("source_file_type") or "pdf")[:40],
        extraction_engine=str(payload.get("extraction_engine") or payload.get("extraction_method") or "user_confirmed")[:80],
        retain_raw_document_consent=bool(payload.get("retain_raw_document_consent", False)),
        user_confirmed=True,
        confirmed_at=now,
        report_notes=payload.get("report_notes"),
        summary_json={},
    )
    db.add(report)
    db.flush()

    outside_range_names: list[str] = []
    kidney_flag_present = False
    all_questions: list[str] = []

    for pre_item in raw_measurements:
        t_name = str(pre_item.get("test_name") or "").strip()
        c_code = str(pre_item.get("canonical_code") or "").strip().lower()
        if not c_code or c_code not in LAB_TEST_CATALOG:
            m_hit = _match_canonical_test(t_name.lower())
            if m_hit:
                c_code = m_hit[0]
        meta_pre = LAB_TEST_CATALOG.get(c_code) or {}
        if meta_pre.get("kidney_caution"):
            rv_raw = pre_item.get("result_value") if pre_item.get("result_value") not in (None, "") else pre_item.get("measured_value")
            rv = float(rv_raw) if rv_raw not in (None, "") else None
            rmin_raw = pre_item.get("reference_min") if pre_item.get("reference_min") not in (None, "") else pre_item.get("reference_low")
            rmin = float(rmin_raw) if rmin_raw not in (None, "") else None
            rmax_raw = pre_item.get("reference_max") if pre_item.get("reference_max") not in (None, "") else pre_item.get("reference_high")
            rmax = float(rmax_raw) if rmax_raw not in (None, "") else None
            st_pre, _ = _compute_range_status(rv, rmin, rmax, pre_item.get("printed_flag"))
            if st_pre in ("below_reference", "above_reference", "lab_flagged_abnormal"):
                kidney_flag_present = True

    for item in raw_measurements:
        test_name = str(item.get("test_name") or "").strip()
        if not test_name:
            continue

        canonical_code = str(item.get("canonical_code") or "").strip().lower()
        panel_cat = str(item.get("panel_category") or item.get("panel_code") or "other").strip().lower()
        if not canonical_code or canonical_code not in LAB_TEST_CATALOG:
            matched = _match_canonical_test(test_name.lower())
            if matched:
                canonical_code = matched[0]
                panel_cat = matched[1]["panel_category"]
            elif not canonical_code:
                canonical_code = re.sub(r"[^a-z0-9]+", "_", test_name.lower()).strip("_")[:60]

        res_val_raw = item.get("result_value") if item.get("result_value") not in (None, "") else item.get("measured_value")
        res_val = float(res_val_raw) if res_val_raw not in (None, "") else None
        res_text = str(
            item.get("result_text")
            if item.get("result_text") not in (None, "")
            else (res_val if res_val is not None else "")
        ).strip()
        if not res_text:
            continue

        unit = str(item.get("unit") or "").strip()[:60]
        ref_min_raw = item.get("reference_min") if item.get("reference_min") not in (None, "") else item.get("reference_low")
        ref_min = float(ref_min_raw) if ref_min_raw not in (None, "") else None
        ref_max_raw = item.get("reference_max") if item.get("reference_max") not in (None, "") else item.get("reference_high")
        ref_max = float(ref_max_raw) if ref_max_raw not in (None, "") else None
        ref_text_raw = item.get("reference_text") if item.get("reference_text") not in (None, "") else item.get("reference_range_text")
        ref_text = str(ref_text_raw).strip()[:160] if ref_text_raw not in (None, "") else None
        if not ref_text and (ref_min is not None or ref_max is not None):
            if ref_min is not None and ref_max is not None:
                ref_text = f"{ref_min} - {ref_max}"
            elif ref_max is not None:
                ref_text = f"< {ref_max}"
            elif ref_min is not None:
                ref_text = f"> {ref_min}"

        status_eval = _compute_multi_signal_status(
            res_val,
            ref_min,
            ref_max,
            item.get("printed_flag"),
            item.get("visual_indicators"),
        )
        range_status = status_eval["range_status"]
        norm_flag = status_eval["normalized_flag"]

        enriched_item = {
            "canonical_code": canonical_code,
            "panel_category": panel_cat,
            "test_name": test_name,
            "result_value": res_val,
            "result_text": res_text,
            "unit": unit,
            "reference_min": ref_min,
            "reference_max": ref_max,
            "reference_text": ref_text,
            "printed_flag": norm_flag or None,
            "visual_indicators": item.get("visual_indicators") or [],
            "page_number": item.get("page_number") or 1,
        }
        interp = _build_measurement_interpretation(
            db, member, enriched_item, kidney_block_active=kidney_flag_present
        )

        if range_status in ("below_reference", "above_reference", "lab_flagged_abnormal"):
            outside_range_names.append(f"{test_name} ({res_text} {unit})")
            if interp.get("kidney_safety_caution"):
                kidney_flag_present = True
            for q in interp.get("doctor_questions", []):
                if q not in all_questions:
                    all_questions.append(q)

        m_row = HealthReportMeasurement(
            report_id=report.id,
            household_id=hh.id,
            member_id=member.id,
            canonical_code=canonical_code,
            panel_category=panel_cat,
            test_name=test_name,
            result_value=res_val,
            result_text=res_text,
            unit=unit,
            reference_min=ref_min,
            reference_max=ref_max,
            reference_text=ref_text,
            printed_flag=norm_flag or None,
            range_status=range_status,
            test_date=str(item.get("test_date") or report_date)[:20],
            specimen_info=item.get("specimen_info") or specimen_type,
            notes=item.get("notes"),
            interpretation_json=interp,
        )
        db.add(m_row)

    report.summary_json = {
        "member_name": member.display_name,
        "member_dietary_preference": member.dietary_preference or "vegetarian",
        "member_allergies": member.allergies or [],
        "outside_reference_markers": outside_range_names,
        "kidney_safety_alert": kidney_flag_present,
        "priority_doctor_questions": all_questions[:6],
        "educational_overview": (
            f"Confirmed {len(raw_measurements)} laboratory measurements for {member.display_name} dated {report_date}. "
            + (
                f"{len(outside_range_names)} measurement(s) require attention."
                if outside_range_names
                else "All confirmed measurements with printed reference intervals were within range."
            )
        ),
    }

    db.commit()
    db.refresh(report)
    return serialize_health_report(report)


def list_health_reports(
    db: Session,
    hh: Household,
    member: HouseholdMember,
) -> list[dict[str, Any]]:
    reports = (
        db.query(HealthReport)
        .options(joinedload(HealthReport.measurements))
        .filter(
            HealthReport.household_id == hh.id,
            HealthReport.member_id == member.id,
        )
        .order_by(HealthReport.report_date.desc(), HealthReport.id.desc())
        .all()
    )
    return [serialize_health_report(r) for r in reports]


def get_health_report_trends(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    canonical_code: str | None = None,
) -> dict[str, Any]:
    q = (
        db.query(HealthReportMeasurement)
        .filter(
            HealthReportMeasurement.household_id == hh.id,
            HealthReportMeasurement.member_id == member.id,
            HealthReportMeasurement.result_value.isnot(None),
        )
        .order_by(
            HealthReportMeasurement.test_date.asc(),
            HealthReportMeasurement.id.asc(),
        )
    )
    if canonical_code:
        q = q.filter(HealthReportMeasurement.canonical_code == canonical_code.strip().lower())

    rows = q.all()
    series_map: dict[tuple[str, str], dict[str, Any]] = {}
    status_flag_map = {
        "below_reference": "low",
        "above_reference": "high",
        "within_reference": "within_reference",
        "lab_flagged_abnormal": "lab_flagged_abnormal",
        "requires_manual_review": "requires_manual_review",
        "reference_unavailable": "reference_unavailable",
    }

    for r in rows:
        unit_clean = (r.unit or "").strip()
        key = (r.canonical_code, unit_clean)
        if key not in series_map:
            series_map[key] = {
                "series_key": f"{r.canonical_code}::{unit_clean or 'unitless'}",
                "canonical_code": r.canonical_code,
                "test_name": r.test_name,
                "panel_category": r.panel_category,
                "unit": unit_clean,
                "reference_min": r.reference_min,
                "reference_low": r.reference_min,
                "reference_max": r.reference_max,
                "reference_high": r.reference_max,
                "reference_text": r.reference_text,
                "data_points": [],
                "points": [],
            }
        pt_obj = {
            "measurement_id": r.id,
            "report_id": r.report_id,
            "test_date": r.test_date,
            "report_date": r.test_date,
            "result_value": r.result_value,
            "measured_value": r.result_value,
            "unit": unit_clean,
            "range_status": r.range_status,
            "status_flag": status_flag_map.get(r.range_status, r.range_status),
            "printed_flag": r.printed_flag,
            "reference_text": r.reference_text,
            "report_title": f"Report #{r.report_id}",
        }
        series_map[key]["data_points"].append(pt_obj)
        series_map[key]["points"].append(pt_obj)

    series_list = list(series_map.values())
    for s in series_list:
        pts = s["data_points"]
        if len(pts) >= 2:
            delta = round(pts[-1]["result_value"] - pts[0]["result_value"], 2)
            s["latest_value"] = pts[-1]["result_value"]
            s["earliest_value"] = pts[0]["result_value"]
            s["net_change"] = delta
        elif len(pts) == 1:
            s["latest_value"] = pts[0]["result_value"]
            s["earliest_value"] = pts[0]["result_value"]
            s["net_change"] = 0.0

    return {
        "member_id": member.id,
        "member_name": member.display_name,
        "total_series": len(series_list),
        "unit_safety_note": (
            "Each trend graph plots a single laboratory marker in a single consistent unit over time. "
            "Measurements with different units are separated into distinct series."
        ),
        "unit_consistency_note": (
            "Each trend graph plots a single laboratory marker in a single consistent unit over time."
        ),
        "series": series_list,
    }


# ============================================================================
# 5. PART B — AI SYMPTOM REVIEW & CARE GUIDANCE (RED-FLAG EMERGENCY SAFE)
# ============================================================================
_RED_FLAG_PATTERNS: list[tuple[str, str, re.Pattern[str]]] = [
    (
        "severe_breathing_difficulty",
        "Severe difficulty breathing, gasping for air, or shortness of breath at rest",
        re.compile(
            r"\b(can'?t\s+breathe|cannot\s+breathe|difficulty\s+breathing|shortness\s+of\s+breath|gasping|struggling\s+to\s+breathe|severe\s+breathlessness|blue\s+lips)\b",
            re.I,
        ),
    ),
    (
        "severe_chest_pain",
        "Chest pain, pressure, tightness, or pain radiating to the arm, shoulder, neck, or jaw",
        re.compile(
            r"\b(chest\s+pain|chest\s+pressure|chest\s+tightness|crushing\s+chest|pain\s+in\s+(?:my\s+)?chest|heart\s+attack|pain\s+radiating\s+to\s+(?:left\s+)?arm)\b",
            re.I,
        ),
    ),
    (
        "stroke_or_focal_neurological_deficit",
        "Sudden weakness or numbness on one side of the body, facial drooping, or slurred speech",
        re.compile(
            r"\b(facial\s+droop(?:ing)?|face\s+drooping|slurred\s+speech|sudden\s+weakness|one\s+side\s+weakness|paralysis|can'?t\s+move\s+(?:my\s+)?arm|stroke)\b",
            re.I,
        ),
    ),
    (
        "confusion_or_altered_consciousness",
        "Sudden confusion, disorientation, fainting, seizure, or loss of consciousness",
        re.compile(
            r"\b(loss\s+of\s+consciousness|unconscious|fainted|fainting|passed\s+out|sudden\s+confusion|disoriented|seizure|convulsion)\b",
            re.I,
        ),
    ),
    (
        "anaphylaxis_severe_allergy",
        "Severe allergic reaction with swelling of the lips, tongue, face, or throat",
        re.compile(
            r"\b(anaphylaxis|throat\s+closing|swelling\s+of\s+(?:lips|tongue|throat)|swollen\s+tongue|severe\s+allergic\s+reaction)\b",
            re.I,
        ),
    ),
    (
        "severe_uncontrolled_bleeding",
        "Serious uncontrolled bleeding, vomiting blood, or black tarry stools",
        re.compile(
            r"\b(uncontrolled\s+bleeding|vomiting\s+blood|coughing\s+(?:up\s+)?blood|black\s+tarry\s+stool|heavy\s+bleeding)\b",
            re.I,
        ),
    ),
]


_SYMPTOM_EDUCATIONAL_PROFILES: list[dict[str, Any]] = [
    {
        "keywords": ["fatigue", "tired", "weakness", "exhausted", "low energy", "lethargy", "dizziness", "pale"],
        "domain": "Energy, Iron/Vitamin Status & Metabolic Balance",
        "possible_explanations": [
            "Nutritional deficiencies such as low iron/ferritin, vitamin B12, folate, or vitamin D — especially common in predominantly vegetarian Indian households.",
            "Glycaemic fluctuations (elevated or low blood glucose) or underactive thyroid function (elevated TSH).",
            "Inadequate daily hydration, insufficient protein/caloric intake, or sleep debt.",
        ],
        "warning_signs": [
            "Fainting, chest discomfort, or shortness of breath on minimal exertion.",
            "Unexplained weight loss, persistent fever, or dark stools.",
        ],
        "cautious_food_slugs": [
            "khichdi-moong-dal-rice",
            "spinach-palak",
            "chickpea-kabuli-chana",
            "curd-dahi-cow-milk",
            "ragi-finger-millet",
            "amla-indian-gooseberry",
        ],
        "hydration_and_meal_guidance": (
            "Sip plain water, lemon water, or buttermilk (chaas) steadily through the day, and choose balanced, easily digestible meals "
            "combining pulses (moong/masoor dal), leafy greens, and curd while reviewing CBC, ferritin, B12, vitamin D, glucose, and TSH with your doctor."
        ),
    },
    {
        "keywords": ["acidity", "bloating", "indigestion", "nausea", "stomach", "loose motion", "diarrhoea", "diarrhea", "constipation", "gas", "reflux"],
        "domain": "Digestive Comfort, Hydration & Gut Tolerance",
        "possible_explanations": [
            "Acute gastrointestinal irritation, meal timing irregularity, or reaction to spicy/deep-fried or unhygienically prepared food.",
            "Food intolerance (such as lactose sensitivity) or low soluble-fibre and fluid intake.",
            "Medication side effects (for example, certain pain relievers, antibiotics, or iron tablets).",
        ],
        "warning_signs": [
            "Severe localised abdominal pain, persistent vomiting preventing oral fluid intake, high fever, or blood in vomit/stool.",
            "Signs of dehydration such as very dark urine, dry mouth, or dizziness when standing.",
        ],
        "cautious_food_slugs": [
            "khichdi-moong-dal-rice",
            "idli-steamed-rice-lentil",
            "curd-dahi-cow-milk",
            "banana-ripe-robusta",
            "oats-rolled-plain",
        ],
        "hydration_and_meal_guidance": (
            "Prioritise oral hydration (sipping clean water, WHO-formula ORS if experiencing loose stools, or diluted buttermilk) "
            "and gentle, low-spice steamed or pressure-cooked Indian comfort foods such as soft moong dal khichdi, steamed idli, and plain curd."
        ),
    },
    {
        "keywords": ["fever", "cold", "cough", "sore throat", "body ache", "chills", "flu", "viral"],
        "domain": "Acute Febrile Illness & Recovery Hydration",
        "possible_explanations": [
            "Seasonal viral respiratory or systemic infection requiring rest, fluids, and temperature monitoring.",
            "Upper airway irritation or bacterial infection that may need a doctor's clinical examination.",
        ],
        "warning_signs": [
            "Fever lasting more than 3 days, temperature above 103°F (39.4°C), difficulty breathing, severe headache with neck stiffness, or falling platelet counts.",
            "Inability to keep fluids down or marked drowsiness.",
        ],
        "cautious_food_slugs": [
            "khichdi-moong-dal-rice",
            "idli-steamed-rice-lentil",
            "toor-dal-red-gram",
            "amla-indian-gooseberry",
            "papaya-ripe",
        ],
        "hydration_and_meal_guidance": (
            "Focus on warm fluids, warm dal soup, soft moong dal khichdi, and steamed idlis to maintain energy and electrolytes without taxing digestion."
        ),
    },
    {
        "keywords": ["headache", "thirst", "frequent urination", "blurry vision", "high sugar", "bp", "palpitation"],
        "domain": "Blood Pressure, Glycaemic Regulation & Hydration",
        "possible_explanations": [
            "Elevated blood pressure or blood glucose fluctuations (hyperglycaemia or hypoglycaemia).",
            "Dehydration, caffeine withdrawal, eye strain, or inadequate sleep.",
        ],
        "warning_signs": [
            "Sudden 'thunderclap' headache, vision loss, slurred speech, limb weakness, or blood pressure >= 180/120 mmHg.",
        ],
        "cautious_food_slugs": [
            "green-gram-whole-moong",
            "ragi-finger-millet",
            "spinach-palak",
            "curd-dahi-cow-milk",
        ],
        "hydration_and_meal_guidance": (
            "Check your home blood pressure or blood glucose monitor if available, drink plain water, and favour low-sodium, high-fibre home-cooked meals."
        ),
    },
]


def evaluate_symptom_review(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> dict[str, Any]:
    symptom_text = str(payload.get("symptom_description") or "").strip()
    if not symptom_text:
        raise ValueError("Please describe the symptoms you are experiencing.")

    onset = payload.get("onset")
    duration = payload.get("duration")
    severity = payload.get("severity")
    pattern_or_trend = payload.get("pattern_or_trend")
    associated_symptoms = payload.get("associated_symptoms") or []
    if isinstance(associated_symptoms, str):
        associated_symptoms = [s.strip() for s in associated_symptoms.split(",") if s.strip()]
    clinician_consulted = payload.get("clinician_consulted")
    include_records = bool(payload.get("include_health_records_consent", True))

    combined_text = " ".join(
        [symptom_text, str(onset or ""), str(duration or ""), " ".join(associated_symptoms)]
    )

    red_flag_triggers: list[str] = []
    for _code, desc, pattern in _RED_FLAG_PATTERNS:
        if pattern.search(combined_text):
            red_flag_triggers.append(desc)

    if str(severity or "").lower() == "emergency":
        red_flag_triggers.append("User marked symptom severity as an emergency")

    red_flag_detected = len(red_flag_triggers) > 0

    confirmed_context: dict[str, Any] = {
        "consent_granted": include_records,
        "selected_conditions": member.selected_conditions or [],
        "allergies": member.allergies or [],
        "recent_confirmed_labs": [],
        "latest_blood_pressure": None,
        "latest_blood_glucose": None,
    }
    if include_records:
        recent_labs = (
            db.query(HealthReportMeasurement)
            .filter(
                HealthReportMeasurement.household_id == hh.id,
                HealthReportMeasurement.member_id == member.id,
            )
            .order_by(HealthReportMeasurement.test_date.desc(), HealthReportMeasurement.id.desc())
            .limit(8)
            .all()
        )
        confirmed_context["recent_confirmed_labs"] = [
            {
                "test_name": r.test_name,
                "result_value": r.result_value,
                "unit": r.unit,
                "reference_text": r.reference_text,
                "range_status": r.range_status,
                "test_date": r.test_date,
            }
            for r in recent_labs
        ]
        latest_bp = (
            db.query(BloodPressureLog)
            .filter(
                BloodPressureLog.household_id == hh.id,
                BloodPressureLog.member_id == member.id,
            )
            .order_by(BloodPressureLog.logged_date.desc(), BloodPressureLog.id.desc())
            .first()
        )
        if latest_bp:
            confirmed_context["latest_blood_pressure"] = {
                "systolic_mmhg": latest_bp.systolic_mmhg,
                "diastolic_mmhg": latest_bp.diastolic_mmhg,
                "pulse_bpm": latest_bp.pulse_bpm,
                "logged_date": latest_bp.logged_date,
            }
        latest_bg = (
            db.query(BloodGlucoseLog)
            .filter(
                BloodGlucoseLog.household_id == hh.id,
                BloodGlucoseLog.member_id == member.id,
            )
            .order_by(BloodGlucoseLog.logged_date.desc(), BloodGlucoseLog.id.desc())
            .first()
        )
        if latest_bg:
            confirmed_context["latest_blood_glucose"] = {
                "value_mg_dl": latest_bg.value_mg_dl,
                "entered_value": latest_bg.entered_value,
                "entered_unit": latest_bg.entered_unit,
                "measurement_context": latest_bg.measurement_context,
                "logged_date": latest_bg.logged_date,
            }

    if red_flag_detected:
        emergency_payload = {
            "red_flag_detected": True,
            "red_flag_triggers": red_flag_triggers,
            "urgency_level": "emergency_immediate",
            "urgency_label": "EMERGENCY — Seek Immediate Medical Care (Call 112 / 108)",
            "red_flag_reasons": [{"code": "red_flag", "reason": r} for r in red_flag_triggers],
            "emergency_banner": {
                "title": "URGENT MEDICAL WARNING — SEEK EMERGENCY CARE IMMEDIATELY",
                "headline": "SEEK IMMEDIATE EMERGENCY MEDICAL CARE (CALL 112 / 108)",
                "message": (
                    "Your description includes one or more emergency warning signs. "
                    "Do not rely on dietary changes or self-care for these symptoms. "
                    "Please call emergency services (112 / 108 in India) or go to the nearest hospital emergency department immediately."
                ),
                "action_instruction": (
                    "Please call emergency services (112 / 108 in India) or go to the nearest hospital emergency department immediately."
                ),
                "do_not_delay_note": (
                    "Normal food and meal recommendations are paused during a potential medical emergency."
                ),
                "emergency_numbers": ["112 (National Emergency)", "108 (Ambulance)"],
            },
            "reported_symptom_summary": {
                "member_name": member.display_name,
                "reported_symptoms": symptom_text,
                "onset": onset or "Not specified",
                "duration": duration or "Not specified",
                "severity": severity or "Urgent / Red-Flag",
                "pattern_or_trend": pattern_or_trend or "Not specified",
                "associated_symptoms": associated_symptoms,
            },
            "reported_symptoms": {
                "description": symptom_text,
                "onset": onset or "Not specified",
                "duration": duration or "Not specified",
                "severity": severity or "severe",
            },
            "confirmed_health_records_context": confirmed_context,
            "confirmed_health_records": {
                **confirmed_context,
                "relevant_connections": confirmed_context.get("confirmed_lab_highlights") or [],
            },
            "possible_explanations_to_consider": [
                "Potentially serious cardiopulmonary, neurological, allergic, or acute medical condition requiring immediate in-person clinical evaluation."
            ],
            "clarifying_questions": [],
            "follow_up_questions": [],
            "warning_signs": red_flag_triggers,
            "warning_signs_for_earlier_care": red_flag_triggers,
            "recommended_next_action": (
                "Stop physical exertion, have someone stay with you, and seek emergency medical evaluation right away."
            ),
            "cautious_food_and_hydration_ideas": [],
            "supportive_indian_meals_and_hydration": [],
            "hydration_and_meal_guidance": (
                "Normal food and meal recommendations are halted during a potential medical emergency. "
                "Do not force food or fluids if experiencing severe breathlessness, chest pain, or difficulty swallowing."
            ),
            "medical_disclaimer": SYMPTOM_REVIEW_DISCLAIMER,
        }
        session_row = SymptomReviewSession(
            household_id=hh.id,
            member_id=member.id,
            symptom_description=symptom_text,
            onset=onset,
            duration=duration,
            severity=severity or "severe",
            pattern_or_trend=pattern_or_trend,
            associated_symptoms=associated_symptoms,
            clinician_consulted=clinician_consulted,
            include_health_records_consent=include_records,
            red_flag_detected=True,
            red_flag_triggers=red_flag_triggers,
            urgency_level="emergency_care_now",
            clarifying_questions=[],
            response_payload_json=emergency_payload,
        )
        db.add(session_row)
        db.commit()
        db.refresh(session_row)
        emergency_payload["session_id"] = session_row.id
        emergency_payload["created_at"] = session_row.created_at.isoformat()
        return emergency_payload

    clarifying_questions: list[str] = []
    if not onset and not duration:
        clarifying_questions.append(
            "When did these symptoms start, and how long have they been lasting?"
        )
    if not severity:
        clarifying_questions.append(
            "Would you describe the symptoms as mild, moderate, or severe, and are they improving or worsening?"
        )
    if len(clarifying_questions) < 2 and not associated_symptoms:
        clarifying_questions.append(
            "Are you noticing any other symptoms alongside this (such as fever, nausea, dizziness, or changes in appetite)?"
        )
    if len(clarifying_questions) < 2 and clinician_consulted is None:
        clarifying_questions.append(
            "Have you already spoken with a doctor or started any medication for these symptoms?"
        )
    clarifying_questions = clarifying_questions[:2]

    lower_desc = combined_text.lower()
    matched_profile = _SYMPTOM_EDUCATIONAL_PROFILES[0]
    for prof in _SYMPTOM_EDUCATIONAL_PROFILES:
        if any(kw in lower_desc for kw in prof["keywords"]):
            matched_profile = prof
            break

    possibilities = list(matched_profile["possible_explanations"])
    flagged_labs = [
        lab
        for lab in confirmed_context["recent_confirmed_labs"]
        if lab["range_status"] in ("below_reference", "above_reference")
    ]
    if flagged_labs:
        lab_str = ", ".join(
            f"{lab['test_name']} ({lab['result_value']} {lab['unit']}, {lab['range_status'].replace('_', ' ')})"
            for lab in flagged_labs[:3]
        )
        possibilities.append(
            f"From your confirmed health records ({lab_str}), discussing how these laboratory findings relate to your current symptoms with your doctor may be helpful."
        )
    if confirmed_context["latest_blood_pressure"]:
        bp = confirmed_context["latest_blood_pressure"]
        if bp["systolic_mmhg"] >= 140 or bp["diastolic_mmhg"] >= 90:
            possibilities.append(
                f"Your latest logged blood pressure ({bp['systolic_mmhg']}/{bp['diastolic_mmhg']} mmHg on {bp['logged_date']}) was elevated; consider re-checking your BP at rest and sharing it with your physician."
            )
    if confirmed_context["latest_blood_glucose"]:
        bg = confirmed_context["latest_blood_glucose"]
        if bg["value_mg_dl"] >= 180 or bg["value_mg_dl"] < 70:
            possibilities.append(
                f"Your latest logged blood glucose ({bg['entered_value']} {bg['entered_unit']} [{bg['measurement_context']}] on {bg['logged_date']}) was outside typical target ranges."
            )

    member_diet = (member.dietary_preference or "vegetarian").lower()
    member_allergies = {a.strip().lower() for a in (member.allergies or []) if a}
    cautious_foods_out: list[dict[str, Any]] = []
    slugs = matched_profile["cautious_food_slugs"]
    foods = db.query(FoodItem).filter(FoodItem.slug.in_(slugs)).all()
    f_map = {f.slug: f for f in foods}
    for s_slug in slugs:
        f_obj = f_map.get(s_slug)
        if not f_obj:
            continue
        if member_diet in ("vegetarian", "jain", "vegan") and not f_obj.is_vegetarian:
            continue
        if member_diet == "vegan" and not f_obj.is_vegan:
            continue
        if member_allergies.intersection({a.lower() for a in (f_obj.allergen_tags or [])}):
            continue
        cautious_foods_out.append(
            {
                "slug": f_obj.slug,
                "name_en": f_obj.name_en,
                "image_url": f_obj.image_url,
                "standard_serving_name": f_obj.standard_serving_name,
                "why_suitable": "Gentle, home-cooked option from GharPlate's verified catalogue.",
            }
        )

    urgency = (
        "prompt_medical_evaluation"
        if str(severity or "").lower() == "severe" or str(pattern_or_trend or "").lower() == "worsening"
        else "routine_clinician_review"
    )

    result_payload = {
        "red_flag_detected": False,
        "red_flag_triggers": [],
        "urgency_level": urgency,
        "urgency_label": (
            "Prompt Clinician Evaluation Recommended"
            if urgency == "prompt_medical_evaluation"
            else "Routine Clinician Consultation & Educational Self-Monitoring"
        ),
        "emergency_banner": None,
        "domain": matched_profile["domain"],
        "educational_overview": matched_profile["hydration_and_meal_guidance"],
        "reported_symptom_summary": {
            "member_name": member.display_name,
            "reported_symptoms": symptom_text,
            "onset": onset or "Not yet specified",
            "duration": duration or "Not yet specified",
            "severity": severity or "Not yet specified",
            "pattern_or_trend": pattern_or_trend or "Not yet specified",
            "associated_symptoms": associated_symptoms,
            "clinician_consulted": clinician_consulted,
        },
        "reported_symptoms": {
            "description": symptom_text,
            "onset": onset or "Not yet specified",
            "duration": duration or "Not yet specified",
            "severity": severity or "mild",
        },
        "confirmed_health_records_context": confirmed_context,
        "confirmed_health_records": {
            **confirmed_context,
            "relevant_connections": [
                f"{lab['test_name']}: {lab['result_value']} {lab['unit']} ({lab['range_status'].replace('_', ' ')})"
                for lab in flagged_labs
            ],
        },
        "possible_explanations_to_consider": possibilities,
        "educational_possibilities": possibilities,
        "clarifying_questions": clarifying_questions,
        "follow_up_questions": clarifying_questions,
        "questions_for_doctor": [
            "Could these symptoms be connected to my recent laboratory markers, hydration, or blood pressure/glucose patterns?",
            "Are any targeted blood tests (such as CBC, ferritin, vitamin B12, vitamin D, thyroid, or electrolytes) recommended?",
        ],
        "warning_signs": matched_profile["warning_signs"],
        "warning_signs_for_earlier_care": matched_profile["warning_signs"],
        "recommended_next_action": (
            "Schedule a prompt consultation with a qualified doctor to evaluate these symptoms in person."
            if urgency == "prompt_medical_evaluation"
            else "Share this symptom summary and your confirmed lab/vital logs with your physician, and monitor for any warning signs."
        ),
        "cautious_food_and_hydration_ideas": cautious_foods_out,
        "supportive_indian_meals_and_hydration": [
            {
                **cf,
                "why_supportive": matched_profile["hydration_and_meal_guidance"],
            }
            for cf in cautious_foods_out
        ],
        "hydration_and_meal_guidance": matched_profile["hydration_and_meal_guidance"],
        "medical_disclaimer": SYMPTOM_REVIEW_DISCLAIMER,
    }

    session_row = SymptomReviewSession(
        household_id=hh.id,
        member_id=member.id,
        symptom_description=symptom_text,
        onset=onset,
        duration=duration,
        severity=severity,
        pattern_or_trend=pattern_or_trend,
        associated_symptoms=associated_symptoms,
        clinician_consulted=clinician_consulted,
        include_health_records_consent=include_records,
        red_flag_detected=False,
        red_flag_triggers=[],
        urgency_level=urgency,
        clarifying_questions=clarifying_questions,
        response_payload_json=result_payload,
    )
    db.add(session_row)
    db.commit()
    db.refresh(session_row)
    result_payload["session_id"] = session_row.id
    result_payload["created_at"] = session_row.created_at.isoformat()
    return result_payload


def list_symptom_review_history(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    limit: int = 15,
) -> list[dict[str, Any]]:
    rows = (
        db.query(SymptomReviewSession)
        .filter(
            SymptomReviewSession.household_id == hh.id,
            SymptomReviewSession.member_id == member.id,
        )
        .order_by(SymptomReviewSession.id.desc())
        .limit(limit)
        .all()
    )
    out = []
    for r in rows:
        payload = dict(r.response_payload_json or {})
        payload["session_id"] = r.id
        payload["created_at"] = r.created_at.isoformat() if r.created_at else None
        out.append(payload)
    return out
