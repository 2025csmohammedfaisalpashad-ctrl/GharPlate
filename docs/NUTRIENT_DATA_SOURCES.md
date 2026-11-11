# Authoritative Nutrient Data Sources (`docs/NUTRIENT_DATA_SOURCES.md`)

GharPlate's Indian food composition database and reference intake notes are grounded in the following authoritative nutrition science and clinical datasets:

## 1. Primary Indian Food Composition & Reference Intake Sources

1. **[ICMR-NIN Indian Food Composition Tables (IFCT 2017)](https://www.nin.res.in/ebooks/IFCT2017.pdf)**
   - **Source Code**: `ICMR_NIN_IFCT_2017`
   - **Organization**: Indian Council of Medical Research — National Institute of Nutrition (ICMR-NIN), Hyderabad (`https://nin.res.in/downloads/`)
   - **Authors**: T. Longvah, R. Ananthan, K. Bhaskarachary, K. Venkaiah (2017)
   - **Scope in GharPlate**: Primary reference for raw Indian cereals, millets (ragi, jowar, bajra, foxtail, little, kodo, barnyard, proso), pulses/legumes, green leafy vegetables (amaranth, methi, palak, curry leaves, moringa, coriander), roots/tubers, fruits (amla, guava, papaya, mango, pomegranate, sitaphal, jackfruit), nuts/oilseeds, milk/dairy, poultry egg, and Indian marine/freshwater fish (sardines, mackerel, rohu, tuna).

2. **[ICMR-NIN Nutrient Requirements for Indians (RDA & EAR 2020)](https://nin.res.in/downloads/)**
   - **Source Code**: `ICMR_NIN_RDA_2020`
   - **Organization**: ICMR-NIN Expert Group (2020)
   - **Scope in GharPlate**: Reference Daily Allowance (RDA) and Estimated Average Requirement (EAR) educational context notes for Indian adults across vitamins, minerals, protein, essential amino acids, and dietary fibre.

3. **[ICMR-NIN Dietary Guidelines for Indians (DGI 2024)](https://nin.res.in/dietaryguidelines/pdfjs/locale/DGI_2024.pdf)**
   - **Source Code**: `ICMR_NIN_DGI_2024`
   - **Organization**: ICMR - National Institute of Nutrition, Hyderabad (May 2024)
   - **Scope in GharPlate**: Standard Indian household serving weights (*katori*, *roti*, *glass*), balanced plate ratios, cooking oil/fat moderation, and bioavailability guidance (such as pairing non-haem plant iron with Vitamin C and avoiding tea/coffee with iron-rich meals).

4. **[Indian Nutrient Databank (INDB)](https://www.anuvaad.org.in/indian-nutrient-databank/)**
   - **Source Code**: `ANU_INDB_2024`
   - **Organization**: Anuvaad Solutions / ICMR-NIN Derived Open Indian Food & Recipe Database
   - **Scope in GharPlate**: Standardized nutrient profiles for cooked Indian staples and composite home-cooked dishes (`rice-cooked-steamed`, `ragi-roti-karnataka`, `chole-chickpea-masala`, `rajma-masala-curry`).

---

## 2. Complementary International & Packaged Food Sources

5. **[USDA FoodData Central (Foundation Foods & SR Legacy)](https://fdc.nal.usda.gov/)**
   - **Source Code**: `USDA_FDC_2024`
   - **Organization**: U.S. Department of Agriculture, Agricultural Research Service
   - **Scope in GharPlate**: Boiled/cooked legume moisture-retention profiles (`toor-dal-cooked-boiled`, `moong-dal-cooked-boiled`, `chickpeas-boiled-cooked`, `rajma-cooked-boiled`), strained yogurt (`yogurt-greek-strained`), and UV-exposed button mushroom ergocalciferol (`mushroom-button-uv-exposed`).

6. **[FAO/INFOODS International Food Composition Databases](https://www.fao.org/infoods)**
   - **Source Code**: `FAO_INFOODS_2024`
   - **Organization**: Food and Agriculture Organization of the United Nations (FAO)
   - **Scope in GharPlate**: International food composition tag harmonization, unit standardization, and amino acid / fatty acid cross-validation.

7. **[Open Food Facts India](https://in.openfoodfacts.org/) & [Open Food Facts Documentation](https://openfoodfacts.github.io/documentation/)**
   - **Source Code**: `OPEN_FOOD_FACTS_INDIA`
   - **Organization**: Open Food Facts Contributors & FSSAI Back-of-Pack Label Declarations ([FSSAI Labelling Regulations 2020](https://fssai.gov.in/upload/uploadfiles/files/Comp_Labelling.pdf))
   - **Scope in GharPlate**: Packaged Indian foods and fortified staples (`milk-cow-fortified-vit-d`, packaged oats, biscuits, instant noodles, namkeen, health drinks). Unlisted micronutrients on commercial labels remain `NULL`.
