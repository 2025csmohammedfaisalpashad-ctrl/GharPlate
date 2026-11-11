# GharPlate — Health Report Analysis & Lab-to-Plate Intelligence

## 1. Overview
The **Health Reports** module (`/health/reports`) under **My Health** allows GharPlate household members to upload laboratory reports (`.pdf`, `.jpg`, `.jpeg`, `.png`, `.webp`), review and edit extracted clinical markers before saving, and receive **Lab-to-Plate** Indian food recommendations grounded in **ICMR-NIN IFCT 2017** and **Dietary Guidelines for Indians (DGI) 2024**.

## 2. File Security, Validation & Extraction Pipeline
Implemented in `backend/app/services/health_report_symptom_service.py`:
- **Format & Magic-Byte Validation**: Accepts only `.pdf`, `.jpg`, `.jpeg`, `.png`, and `.webp`. Verifies binary file headers (`%PDF-`, JPEG `\xFF\xD8\xFF`, PNG `\x89PNG`, WebP `RIFF...WEBP`) and rejects executable or corrupted files (`HTTP 400`).
- **Size & Page Limits**: Enforces maximum file size of `10 MB` and maximum PDF length of `15 pages`.
- **Two-Stage Extraction**:
  1. **Digital PDF Text Stream Extraction**: Extracts embedded PDF text operators (`Tj`, `TJ`) and Flate-compressed streams directly.
  2. **OCR & Local Vision Fallback**: Falls back to local Tesseract OCR / local Ollama vision (`qwen2.5vl:7b`) for scanned PDFs and camera images.
- **7 Supported Laboratory Panels**:
  - Glucose & Diabetes (`fasting_blood_glucose`, `post_prandial_glucose`, `random_blood_glucose`, `hba1c`)
  - Complete Blood Count / Haemogram (`haemoglobin`, `rbc_count`, `wbc_count`, `platelet_count`, `pcv_haematocrit`, `mcv`, `mch`, `mCHC`)
  - Lipid Profile (`total_cholesterol`, `triglycerides`, `hdl_cholesterol`, `ldl_cholesterol`, `vldl_cholesterol`, `non_hdl_cholesterol`)
  - Kidney / Renal Function (`serum_creatinine`, `blood_urea`, `bun`, `uric_acid`, `egfr`, `serum_sodium`, `serum_potassium`)
  - Liver / Hepatic Function (`total_bilirubin`, `direct_bilirubin`, `sgpt_alt`, `sgot_ast`, `alkaline_phosphatase`, `total_protein`, `serum_albumin`)
  - Thyroid Profile (`tsh`, `free_t3`, `free_t4`)
  - Nutritional & Deficiency Markers (`vitamin_d_25_oh`, `vitamin_b12`, `serum_iron`, `serum_ferritin`, `serum_calcium`, `serum_folate`)

## 3. Mandatory Confirmation Screen & Kidney-Marker Safety Guardrail
- **Confirmation Gate (`POST /api/v1/health/reports/confirm`)**: Extracted values are never saved automatically. Users review, edit, add, or remove rows in the confirmation table before saving to `health_reports` and `health_report_measurements`.
- **Kidney-Marker Safety Guardrail**: When `serum_creatinine`, `egfr`, `serum_potassium`, or `blood_urea` is abnormal—or when `chronic_kidney_disease` is present on the member profile—GharPlate automatically activates a **Kidney & Electrolyte Safety Notice** (KDIGO 2024 / ICMR-NIN) and suppresses unrestricted high-potassium or high-protein food suggestions.
- **Unit-Consistent Trends (`GET /api/v1/health/reports/trends`)**: Chronological trend series are grouped strictly by `(canonical_code, unit)` so incompatible units are never plotted on the same axis.
