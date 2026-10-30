# GharPlate Data Sources Register (`docs/DATA_SOURCES.md`)

Every nutrient record, household serving conversion, and condition rule in GharPlate preserves full source provenance in the `data_sources` table.

## 1. Authoritative Food Composition & Guideline Sources

| Source Code | Organisation | Document / Dataset Title | Year / Version | Official URL | Licensing & Usage Notes |
|---|---|---|---|---|---|
| `ICMR_NIN_IFCT_2017` | ICMR - National Institute of Nutrition, Hyderabad | *Indian Food Composition Tables (IFCT 2017)*, Longvah T., Ananthan R., Bhaskarachary K., Venkaiah K. | 2017 (First Edition) | https://www.nin.res.in/ebooks/IFCT2017.pdf | Official Government of India / ICMR-NIN open reference publication; individual food items cite IFCT food codes (`A015`, `A010`, `B013`, etc.). |
| `ICMR_NIN_DGI_2024` | ICMR - National Institute of Nutrition, Hyderabad | *Dietary Guidelines for Indians (2024 Edition)* | May 2024 | https://nin.res.in/dietaryguidelines/pdfjs/locale/DGI_2024.pdf | Official ICMR-NIN public dietary guidelines and standardized Indian household recipe/measure reference. |
| `ICMR_T2DM_2018` | Indian Council of Medical Research (ICMR) | *ICMR Guidelines for Management of Type 2 Diabetes 2018* (Chapter 6: Medical Nutrition Therapy) | 2018 | https://www.icmr.gov.in/icmrobject/custom_data/pdf/resource-guidelines/ICMR_GuidelinesType2diabetes2018_0.pdf | National clinical guideline cited for educational carbohydrate and glycaemic guidance. |
| `WHO_SUGARS_SODIUM` | World Health Organization (WHO) | *Guideline: Sugars Intake for Adults and Children (2015)* & *Guideline: Sodium Intake for Adults and Children (2012)* | 2015 / 2012 | https://www.who.int/publications/i/item/9789241549028 | WHO global public health guidelines for free sugars (<10% energy) and sodium (<2000 mg/day). |
| `FSSAI_LABELLING_2020` | Food Safety and Standards Authority of India (FSSAI) | *Food Safety and Standards (Labelling and Display) Regulations, 2020* | 2020 (Compendium) | https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling.pdf | Statutory Indian food labelling rules used for OCR field extraction and validation. |
| `KDIGO_CKD_2024` | Kidney Disease: Improving Global Outcomes (KDIGO) | *KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease* | March 2024 | https://kdigo.org/guidelines/ckd-evaluation-and-management/ | International nephrology guideline cited for stage-dependent potassium, phosphorus, sodium, and protein awareness. |
| `WGO_GI_GUIDELINES` | World Gastroenterology Organisation (WGO) | *WGO Global Guidelines: Irritable Bowel Syndrome (IBS) & Celiac Disease* | 2016 | https://www.worldgastroenterology.org/guidelines | Global gastroenterology educational guidelines for gluten enteropathy, FODMAP sensitivity, and GERD. |
| `MOHFW_AMB_GUIDELINE` | Ministry of Health and Family Welfare, Government of India | *Anemia Mukt Bharat Operational & Dietary Strategy* | 2024 | https://ambabhiyaan.mohfw.gov.in/ | Government of India public health programme guidance on iron-folic acid and Vitamin C enhancers. |
| `OPEN_FOOD_FACTS_INDIA` | Open Food Facts Contributors | *Open Food Facts Database (India Packaged Products)* | 2024 (ODbL v1.0) | https://in.openfoodfacts.org/ | Open Database License (ODbL v1.0); undeclared micronutrients on packaged labels are preserved as `NULL`. |

## 2. Distinction of Data Provenance Tiers

GharPlate explicitly labels every record with its provenance tier (`source_type` and `confidence_status`):
1. `official` / `verified_ifct`: Official laboratory food composition data (ICMR-NIN IFCT 2017 & DGI 2024).
2. `clinical_guideline`: Peer-reviewed clinical practice guidelines (ICMR, WHO, KDIGO, WGO).
3. `third_party_open` / `label_declared`: Packaged food back-of-pack label declarations or Open Food Facts records.
4. `ocr_extracted` / `user_entered`: Household-scanned or manually entered packaged products confirmed by the user.
