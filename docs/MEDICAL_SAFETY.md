# GharPlate Medical Safety & Clinical Governance (`docs/MEDICAL_SAFETY.md`)

## 1. Core Medical Safety Principles

1. **Non-Diagnostic Educational Platform**: GharPlate is an educational food-literacy tool for Indian households. It does not diagnose medical conditions, prescribe treatments, or substitute for a qualified physician or registered dietitian.
2. **Prohibition of Simplistic Allowed/Forbidden Lists**: No food in GharPlate is ever labelled as `Safe`, `Unsafe`, `Allowed`, `Forbidden`, `Cures`, `Disease-preventing`, or `Disease-reversing`. Instead, the rules engine uses 7 transparent educational categories:
   - `Nutritionally relevant`
   - `Portion-sensitive`
   - `Nutrient to monitor`
   - `May require individualised advice`
   - `Limited evidence available`
   - `Insufficient nutritional information`
   - `Potential allergen concern`
3. **Kidney Health Individualisation**: In accordance with KDIGO 2024 guidelines, Chronic Kidney Disease (CKD) rules never issue universal restrictions on potassium, phosphorus, protein, sodium, or fluid intake. Every CKD rule explains that targets depend on CKD stage (G1–G5), dialysis status, and current serum chemistry.
4. **Short-Term Illness vs. Chronic Disease**: Short-term conditions (`fever_acute_recovery`, `acute_diarrhoea_dehydration`) are explicitly badged as short-term supportive contexts and carry prominent red-flag warnings instructing users to seek urgent medical care for persistent fever, inability to retain fluids, dehydration, breathing difficulty, or altered consciousness.
5. **Special Life-Stage & Pediatric Protection**: When a household member profile has `age_group` set to `child` or `adolescent`, adult chronic-disease nutrient rules are blocked from applying and replaced with a pediatric safety notice.
6. **Allergy vs. Intolerance Separation**: Immunological food allergies (e.g., peanut, tree nut, cow's milk protein, wheat/gluten, egg, fish, soy, sesame) are stored and evaluated separately from digestive intolerances (e.g., lactose malabsorption, FODMAP sensitivity). Allergen data is always presented with a disclaimer that ingredient lists cannot guarantee absence of mill or factory cross-contamination.
