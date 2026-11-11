# GharPlate — AI Symptom Review & Emergency Safety Architecture

## 1. Positioning & Non-Diagnostic Scope
The **AI Symptom Review & Care Guidance** workspace (`/health/symptoms` and `/health/reports?tab=symptoms`) is an educational, non-diagnostic symptom intake and care-guidance tool. It never claims to diagnose a disease, never outputs fabricated numerical disease probabilities, and never prescribes or changes medication dosages.

## 2. Immediate Red-Flag Emergency Escalation
Implemented in `evaluate_Red_Flag_Symptoms()` inside `backend/app/services/health_report_symptom_service.py`:
- Evaluates natural-language and voice-transcribed symptom descriptions against high-priority emergency red-flag patterns first:
  - Severe chest pain, pressure, tightness, or radiation to left arm/jaw
  - Severe shortness of breath, difficulty breathing, or bluish lips
  - Sudden weakness/numbness on one side, facial droop, or slurred speech
  - Fainting, loss of consciousness, seizure, or acute confusion
  - Severe allergic reaction / anaphylaxis (throat/tongue swelling)
  - Uncontrolled bleeding, coughing/vomiting blood, or self-harm crisis
- When a red flag is detected (`red_flag_detected: true`):
  - Displays a prominent red emergency banner instructing immediate medical care (`Call 112 / 108`).
  - **Halts normal meal and food recommendations** (`supportive_indian_meals_and_hydration: []`) so emergency care is never delayed.

## 3. Progressive Intake & Separation of Symptoms vs. Confirmed Records
- Asks at most **1–2 concise clarifying questions** at a time.
- Clearly separates **Reported Symptoms** (subjective user input) from **Confirmed Health Records** (verified lab reports, blood pressure readings, blood glucose logs, hydration, and meal diary entries).
- Provides gentle, culturally relevant Indian hydration and comfort meal ideas (`Moong Dal Khichdi`, `Idli`, `Curd`, `Tender Coconut Water`, `Ragi`, `Palak`) filtered by the active member's dietary preference and allergies.
