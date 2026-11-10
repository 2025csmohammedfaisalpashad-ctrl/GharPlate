"""
GharPlate Health Measurement Tracking, Unified Daily Timeline, AI Habit Plan Builder,
and Natural-Language Daily Food Logging Service.

Implements:
- Part 2 & 3: Dedicated Blood Pressure Tracker (`BloodPressureLog`) with AHA/ICMR home measurement guidance,
  clinician-configured personal targets, conservative urgent-reading alerts, and honest non-interpolated chart series.
- Part 4: Dedicated Blood Glucose Tracker (`BloodGlucoseLog`) supporting mg/dL and mmol/L (preserving original entered
  value & unit), strict measurement contexts (fasting, pre-meal, post-meal, bedtime, random), and context-separated analytics.
- Part 5: Health Measurement Summary & Unified Chronological Daily Activity Timeline.
- Part 6: Natural-Language AI Habit Plan Builder (`propose_ai_habit_plan`, `confirm_ai_habit_plan`, `modify_ai_habit_plan`)
  reusing `HabitDefinition` and `HabitCompletionLog` with mandatory user approval before persistence.
- Part 7: Natural-Language Daily Food Logging (`parse_natural_language_food_log`) matching real GharPlate database items,
  calculating verified nutrient previews (preserving NULL for unmeasured nutrients), and requiring user confirmation.
"""

from datetime import datetime, timedelta, UTC
import re
from typing import Any
import uuid
from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    BloodGlucoseLog,
    BloodPressureLog,
    BodyMeasurementLog,
    DailyFoodLogEntry,
    FoodItem,
    HabitCompletionLog,
    HabitDefinition,
    HealthMeasurementTarget,
    Household,
    HouseholdMember,
    WaterIntakeLog,
)
from app.services.fitness_ecosystem_service import (
    create_daily_food_log_entry,
    get_or_create_fitness_profile,
    serialize_food_log_entry,
    today_iso_str,
)

MG_DL_PER_MMOL_L = 18.0182

BP_CLINICAL_SOURCES = [
    {
        "title": "American Heart Association — Home Blood Pressure Monitoring",
        "organization": "American Heart Association (AHA)",
        "url": "https://www.heart.org/en/health-topics/high-blood-pressure/understanding-blood-pressure-readings/monitoring-your-blood-pressure-at-home",
        "reviewed_year": 2025,
    },
    {
        "title": "ICMR Standard Treatment Workflow — Hypertension in Adults",
        "organization": "Indian Council of Medical Research (ICMR)",
        "url": "https://www.icmr.gov.in/icmrobject/uploads/STWs/1778941063_hypertensioninadults_final.pdf",
        "reviewed_year": 2024,
    },
    {
        "title": "RSSDI Guidelines for the Management of Hypertension",
        "organization": "Research Society for the Study of Diabetes in India (RSSDI)",
        "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC9750845/",
        "reviewed_year": 2022,
    },
]

GLUCOSE_CLINICAL_SOURCES = [
    {
        "title": "ADA Standards of Care in Diabetes — Glycemic Goals and Hypoglycemia",
        "organization": "American Diabetes Association (ADA)",
        "url": "https://diabetesjournals.org/care/article/48/Supplement_1/S128/157561/6-Glycemic-Goals-and-Hypoglycemia-Standards-of",
        "reviewed_year": 2025,
    },
    {
        "title": "ADA — Checking Your Blood Glucose & Target Ranges",
        "organization": "American Diabetes Association (ADA)",
        "url": "https://diabetes.org/living-with-diabetes/treatment-care/checking-your-blood-sugar",
        "reviewed_year": 2025,
    },
    {
        "title": "ICMR Guidelines for Management of Type 2 Diabetes",
        "organization": "Indian Council of Medical Research (ICMR)",
        "url": "https://www.icmr.gov.in/icmrobject/custom_data/pdf/resource-guidelines/ICMR_GuidelinesType2diabetes2018_0.pdf",
        "reviewed_year": 2018,
    },
]

HOME_BP_MEASUREMENT_GUIDE = [
    {
        "step": "1. Rest Quietly Before Measuring",
        "detail": "Avoid caffeine, exercise, and smoking for 30 minutes prior. Empty your bladder and sit quietly for at least 5 minutes without talking or using a phone.",
    },
    {
        "step": "2. Correct Sitting Posture",
        "detail": "Sit in a chair with firm back support, keep both feet flat on the floor, and keep your legs and ankles uncrossed.",
    },
    {
        "step": "3. Arm Support at Heart Level",
        "detail": "Rest your measurement arm on a flat table or desk so the middle of the upper-arm cuff is supported at heart level.",
    },
    {
        "step": "4. Bare-Skin Cuff Placement",
        "detail": "Wrap a properly sized, validated automated upper-arm cuff directly on bare skin just above the bend of the elbow—never over clothing or a tightly rolled sleeve.",
    },
    {
        "step": "5. Repeat Readings & Consistency",
        "detail": "Take 2 readings 1 minute apart in the morning (before medications/breakfast) and evening. Record both readings in GharPlate without overwriting the first reading.",
    },
]

GLUCOSE_CONTEXT_LABELS: dict[str, str] = {
    "fasting": "Fasting (8+ hrs no caloric intake)",
    "before_breakfast": "Before Breakfast (Pre-meal)",
    "after_breakfast": "After Breakfast (Post-meal)",
    "before_lunch": "Before Lunch (Pre-meal)",
    "after_lunch": "After Lunch (Post-meal)",
    "before_dinner": "Before Dinner (Pre-meal)",
    "after_dinner": "After Dinner (Post-meal)",
    "bedtime": "Bedtime",
    "random": "Random / Unscheduled",
    "other": "Other Context",
}


def _infer_time_of_day(logged_time: str) -> str:
    t_str = (logged_time or "").strip().upper()
    if "PM" in t_str:
        m = re.match(r"(\d{1,2})", t_str)
        hr = int(m.group(1)) if m else 18
        if hr != 12:
            hr += 12
    elif "AM" in t_str:
        m = re.match(r"(\d{1,2})", t_str)
        hr = int(m.group(1)) if m else 8
        if hr == 12:
            hr = 0
    else:
        m = re.match(r"(\d{1,2})", t_str)
        hr = int(m.group(1)) if m else 8

    if 4 <= hr < 12:
        return "morning"
    if 12 <= hr < 17:
        return "afternoon"
    if 17 <= hr < 21:
        return "evening"
    return "night"


def _evaluate_bp_interpretation(
    systolic: int,
    diastolic: int,
    clinician_target: dict[str, Any] | None,
    age_group: str = "adult",
) -> dict[str, Any]:
    """
    Provides conservative, non-diagnostic, source-backed educational interpretation for a BP reading.
    Never diagnoses hypertension from a single reading or recommends medication changes.
    """
    urgent_warning: str | None = None
    is_urgent = False

    if systolic >= 180 or diastolic >= 120:
        is_urgent = True
        urgent_warning = (
            "URGENT READING NOTICE (Systolic ≥ 180 mmHg or Diastolic ≥ 120 mmHg): "
            "Wait a few minutes quietly and recheck. If the reading remains ≥ 180/120 mmHg, or if accompanied by chest pain, "
            "shortness of breath, severe headache, back pain, numbness, weakness, vision changes, or difficulty speaking, "
            "seek immediate emergency medical care or contact your physician promptly (AHA / ICMR STW)."
        )
    elif systolic < 85 or diastolic < 55:
        urgent_warning = (
            "LOW READING NOTICE: If this low reading is accompanied by dizziness, lightheadedness, fainting, confusion, "
            "or blurred vision, sit or lie down safely and contact a healthcare professional promptly."
        )

    if age_group == "child":
        return {
            "category_label": "Pediatric Reading (Requires Age/Height Percentile Evaluation)",
            "status_tone": "urgent" if is_urgent else "neutral",
            "is_urgent": is_urgent,
            "urgent_warning": urgent_warning,
            "within_clinician_target": None,
            "explanation": (
                "Adult blood pressure thresholds do not apply to children. Pediatric blood pressure interpretation "
                "depends on age, sex, and height percentiles evaluated by a pediatrician."
            ),
            "non_diagnostic_notice": (
                "Single readings do not establish a medical diagnosis. Never adjust medications without consulting a physician."
            ),
            "sources": BP_CLINICAL_SOURCES,
        }

    within_target: bool | None = None
    target_note = (
        "No personal clinician target is configured yet. Interpretation depends on measurement posture, rest, and repeated readings over multiple days."
    )
    if clinician_target:
        s_min = clinician_target.get("systolic_min", 90)
        s_max = clinician_target.get("systolic_max", 130)
        d_min = clinician_target.get("diastolic_min", 60)
        d_max = clinician_target.get("diastolic_max", 80)
        within_target = (s_min <= systolic <= s_max) and (d_min <= diastolic <= d_max)
        target_note = (
            f"Compared against your clinician-provided target ({s_min}–{s_max} / {d_min}–{d_max} mmHg): "
            + ("Within your configured target range." if within_target else "Outside your configured target range.")
        )

    if is_urgent:
        label = "Markedly Elevated Reading — Recheck & Review Urgent Guidance"
        tone = "urgent"
    elif systolic >= 140 or diastolic >= 90:
        label = "Above Standard Adult Reference (≥ 140/90 mmHg)"
        tone = "caution"
    elif systolic >= 130 or diastolic >= 80:
        label = "Mildly Elevated Adult Reference (130–139 / 80–89 mmHg)"
        tone = "monitor"
    elif systolic < 90 or diastolic < 60:
        label = "Below Typical Adult Reference (< 90/60 mmHg)"
        tone = "monitor"
    else:
        label = "Within Standard Adult Reference (< 130/80 mmHg)"
        tone = "normal"

    return {
        "category_label": label,
        "status_tone": tone,
        "is_urgent": is_urgent,
        "urgent_warning": urgent_warning,
        "within_clinician_target": within_target,
        "explanation": (
            f"{target_note} According to ICMR and AHA guidelines, a clinical diagnosis of hypertension requires "
            "repeated measurements across multiple visits rather than a single home reading."
        ),
        "non_diagnostic_notice": (
            "Educational reference only — GharPlate does not diagnose hypertension or recommend medication adjustments."
        ),
        "sources": BP_CLINICAL_SOURCES,
    }


def serialize_bp_log(
    log: BloodPressureLog,
    clinician_target: dict[str, Any] | None = None,
    age_group: str = "adult",
) -> dict[str, Any]:
    interp = _evaluate_bp_interpretation(
        log.systolic_mmhg, log.diastolic_mmhg, clinician_target, age_group=age_group
    )
    return {
        "id": log.id,
        "household_id": log.household_id,
        "member_id": log.member_id,
        "systolic_mmhg": log.systolic_mmhg,
        "diastolic_mmhg": log.diastolic_mmhg,
        "pulse_bpm": log.pulse_bpm,
        "logged_date": log.logged_date,
        "logged_time": log.logged_time,
        "time_of_day": log.time_of_day,
        "measurement_arm": log.measurement_arm,
        "measurement_position": log.measurement_position,
        "reading_sequence": log.reading_sequence,
        "device_type": log.device_type,
        "measurement_source": log.measurement_source,
        "notes": log.notes,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "updated_at": log.updated_at.isoformat() if log.updated_at else None,
        "interpretation": interp,
    }


def create_blood_pressure_log(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> BloodPressureLog:
    try:
        systolic = int(payload.get("systolic_mmhg"))  # type: ignore[arg-type]
        diastolic = int(payload.get("diastolic_mmhg"))  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise ValueError("Systolic and diastolic values must be valid integers in mmHg.") from exc

    if not (50 <= systolic <= 260):
        raise ValueError("Systolic BP must be between 50 and 260 mmHg.")
    if not (30 <= diastolic <= 180):
        raise ValueError("Diastolic BP must be between 30 and 180 mmHg.")
    if systolic <= diastolic:
        raise ValueError("Systolic value must be greater than diastolic value.")

    pulse_raw = payload.get("pulse_bpm")
    pulse: int | None = None
    if pulse_raw not in (None, ""):
        pulse = int(pulse_raw)
        if not (25 <= pulse <= 240):
            raise ValueError("Pulse rate must be between 25 and 240 bpm.")

    logged_date = str(payload.get("logged_date") or today_iso_str()).strip()
    logged_time = str(
        payload.get("logged_time") or datetime.now(UTC).strftime("%H:%M")
    ).strip()
    time_of_day = str(
        payload.get("time_of_day") or _infer_time_of_day(logged_time)
    ).strip().lower()
    if time_of_day not in ("morning", "afternoon", "evening", "night"):
        time_of_day = _infer_time_of_day(logged_time)

    # Never overwrite previous readings when recording a repeat measurement
    reading_sequence = str(payload.get("reading_sequence") or "").strip().lower()
    if not reading_sequence:
        existing_same_slot = (
            db.query(BloodPressureLog)
            .filter(
                BloodPressureLog.member_id == member.id,
                BloodPressureLog.logged_date == logged_date,
                BloodPressureLog.time_of_day == time_of_day,
            )
            .count()
        )
        if existing_same_slot == 0:
            reading_sequence = "first"
        elif existing_same_slot == 1:
            reading_sequence = "repeat_2"
        else:
            reading_sequence = f"repeat_{existing_same_slot + 1}"

    log = BloodPressureLog(
        household_id=hh.id,
        member_id=member.id,
        systolic_mmhg=systolic,
        diastolic_mmhg=diastolic,
        pulse_bpm=pulse,
        logged_date=logged_date,
        logged_time=logged_time,
        time_of_day=time_of_day,
        measurement_arm=str(payload.get("measurement_arm") or "left").lower(),
        measurement_position=str(payload.get("measurement_position") or "seated").lower(),
        reading_sequence=reading_sequence,
        device_type=str(payload.get("device_type") or "automated_upper_arm_cuff"),
        measurement_source=str(payload.get("measurement_source") or "manual_home_entry"),
        notes=str(payload["notes"]).strip() if payload.get("notes") else None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_member_clinician_target(
    db: Session, member_id: int, measurement_type: str
) -> HealthMeasurementTarget | None:
    return (
        db.query(HealthMeasurementTarget)
        .filter(
            HealthMeasurementTarget.member_id == member_id,
            HealthMeasurementTarget.measurement_type == measurement_type,
        )
        .first()
    )


def get_blood_pressure_dashboard(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    days: int = 30,
    end_date_str: str | None = None,
) -> dict[str, Any]:
    end_dt_s = end_date_str or today_iso_str()
    end_dt = datetime.strptime(end_dt_s, "%Y-%m-%d")
    start_dt_s = (end_dt - timedelta(days=max(1, days - 1))).strftime("%Y-%m-%d")

    target_obj = get_member_clinician_target(db, member.id, "blood_pressure")
    target_details = target_obj.target_details_json if target_obj else None

    logs = (
        db.query(BloodPressureLog)
        .filter(
            BloodPressureLog.household_id == hh.id,
            BloodPressureLog.member_id == member.id,
            BloodPressureLog.logged_date >= start_dt_s,
            BloodPressureLog.logged_date <= end_dt_s,
        )
        .order_by(BloodPressureLog.logged_date.desc(), BloodPressureLog.id.desc())
        .all()
    )

    serialized_logs = [
    serialize_bp_log(log, target_details, age_group=member.age_group)
    for log in logs
    ]
    today_readings = [r for r in serialized_logs if r["logged_date"] == end_dt_s]
    morning_readings = [r for r in serialized_logs if r["time_of_day"] == "morning"]
    evening_readings = [
        r for r in serialized_logs if r["time_of_day"] in ("evening", "night")
    ]

    # Build daily chart series without inventing values for missing days
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in reversed(serialized_logs):
        by_date.setdefault(r["logged_date"], []).append(r)

    daily_series: list[dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d_s = (end_dt - timedelta(days=offset)).strftime("%Y-%m-%d")
        day_items = by_date.get(d_s, [])
        if not day_items:
            daily_series.append(
                {
                    "date": d_s,
                    "status": "no_reading_recorded",
                    "reading_count": 0,
                    "systolic_mmhg": None,
                    "diastolic_mmhg": None,
                    "pulse_bpm": None,
                    "readings": [],
                }
            )
        else:
            avg_sys = round(
                sum(x["systolic_mmhg"] for x in day_items) / len(day_items), 1
            )
            avg_dia = round(
                sum(x["diastolic_mmhg"] for x in day_items) / len(day_items), 1
            )
            pulses = [x["pulse_bpm"] for x in day_items if x["pulse_bpm"] is not None]
            avg_pulse = round(sum(pulses) / len(pulses), 1) if pulses else None
            daily_series.append(
                {
                    "date": d_s,
                    "status": "reading_recorded",
                    "reading_count": len(day_items),
                    "systolic_mmhg": avg_sys,
                    "diastolic_mmhg": avg_dia,
                    "pulse_bpm": avg_pulse,
                    "latest_time": day_items[-1]["logged_time"],
                    "latest_notes": day_items[-1]["notes"],
                    "readings": day_items,
                }
            )

    summary_stats: dict[str, Any] = {
        "total_readings": len(serialized_logs),
        "days_with_readings": len(by_date),
        "avg_systolic_mmhg": round(
            sum(r["systolic_mmhg"] for r in serialized_logs) / len(serialized_logs), 1
        )
        if serialized_logs
        else None,
        "avg_diastolic_mmhg": round(
            sum(r["diastolic_mmhg"] for r in serialized_logs) / len(serialized_logs), 1
        )
        if serialized_logs
        else None,
        "morning_avg_systolic_mmhg": round(
            sum(r["systolic_mmhg"] for r in morning_readings) / len(morning_readings), 1
        )
        if morning_readings
        else None,
        "evening_avg_systolic_mmhg": round(
            sum(r["systolic_mmhg"] for r in evening_readings) / len(evening_readings), 1
        )
        if evening_readings
        else None,
    }

    return {
        "member": {
            "id": member.id,
            "display_name": member.display_name,
            "age_group": member.age_group,
            "selected_conditions": member.selected_conditions or [],
        },
        "latest_reading": serialized_logs[0] if serialized_logs else None,
        "today_readings": today_readings,
        "morning_readings": morning_readings[:14],
        "evening_readings": evening_readings[:14],
        "readings": serialized_logs,
        "weekly_series": daily_series[-7:],
        "monthly_series": daily_series,
        "summary_stats": summary_stats,
        "clinician_target": {
            "configured": target_obj is not None,
            "target_details": target_details,
            "target_source": target_obj.target_source if target_obj else None,
            "clinician_confirmed": target_obj.clinician_confirmed if target_obj else False,
            "effective_date": target_obj.effective_date if target_obj else None,
            "notes": target_obj.notes if target_obj else None,
        },
        "measurement_guide": HOME_BP_MEASUREMENT_GUIDE,
        "clinical_sources": BP_CLINICAL_SOURCES,
        "medical_safety_notice": (
            "Manual home blood pressure log for educational tracking and clinician review. "
            "Not a real-time sensor or diagnostic device. Never change blood pressure medications based on app readings without consulting your doctor."
        ),
    }


# ==========================================
# PART 4 — BLOOD GLUCOSE TRACKER
# ==========================================
def convert_glucose_units(value: float, unit: str) -> tuple[float, float, str]:
    """
    Converts between mg/dL and mmol/L while preserving original unit.
    Returns (value_mg_dl, value_mmol_l, canonical_unit).
    """
    u_clean = (unit or "mg/dL").strip().lower()
    if u_clean in ("mmol/l", "mmol", "mmoll"):
        canonical_unit = "mmol/L"
        val_mmol = round(float(value), 2)
        val_mg = round(float(value) * MG_DL_PER_MMOL_L, 1)
    else:
        canonical_unit = "mg/dL"
        val_mg = round(float(value), 1)
        val_mmol = round(float(value) / MG_DL_PER_MMOL_L, 2)
    return val_mg, val_mmol, canonical_unit


def _evaluate_glucose_interpretation(
    value_mg_dl: float,
    value_mmol_l: float,
    context: str,
    clinician_target: dict[str, Any] | None,
    age_group: str = "adult",
) -> dict[str, Any]:
    """
    Context-aware, non-diagnostic educational interpretation for a blood glucose reading.
    Never treats fasting and post-meal/random readings as interchangeable.
    """
    urgent_warning: str | None = None
    is_urgent = False

    if value_mg_dl < 54:
        is_urgent = True
        urgent_warning = (
            "URGENT LOW GLUCOSE NOTICE (< 54 mg/dL / < 3.0 mmol/L — Level 2 Low): "
            "Follow your clinician's immediate fast-acting carbohydrate protocol and seek medical attention if symptoms persist or worsen (ADA Standards of Care)."
        )
    elif value_mg_dl < 70:
        is_urgent = True
        urgent_warning = (
            "LOW GLUCOSE ALERT (< 70 mg/dL / < 3.9 mmol/L): "
            "A reading below 70 mg/dL is the clinical alert threshold for low blood glucose in individuals on glucose-lowering therapy. "
            "Follow your clinician's guidance (such as the 15–15 rule if advised by your doctor) and recheck in 15 minutes."
        )
    elif value_mg_dl >= 250:
        is_urgent = True
        urgent_warning = (
            "MARKEDLY ELEVATED GLUCOSE NOTICE (≥ 250 mg/dL / ≥ 13.9 mmol/L): "
            "If accompanied by nausea, vomiting, abdominal pain, fruity breath, rapid breathing, or confusion, seek urgent medical care immediately (ADA / ICMR STW)."
        )

    is_fasting = context == "fasting"
    is_pre_meal = context in ("before_breakfast", "before_lunch", "before_dinner")
    is_post_meal = context in ("after_breakfast", "after_lunch", "after_dinner")

    within_target: bool | None = None
    if clinician_target:
        if is_fasting or is_pre_meal:
            f_min = clinician_target.get("fasting_min_mg_dl", 80)
            f_max = clinician_target.get("fasting_max_mg_dl", 130)
            within_target = f_min <= value_mg_dl <= f_max
        elif is_post_meal:
            p_max = clinician_target.get("post_meal_max_mg_dl", 180)
            within_target = 70 <= value_mg_dl <= p_max

    ctx_label = GLUCOSE_CONTEXT_LABELS.get(context, context.replace("_", " ").title())
    if is_fasting or is_pre_meal:
        ref_note = (
            f"Context: {ctx_label}. For non-pregnant adults managing diabetes, ADA general pre-meal/fasting reference is 80–130 mg/dL (4.4–7.2 mmol/L); "
            "normal fasting reference without diabetes is 70–99 mg/dL (3.9–5.5 mmol/L). Individual targets must be set by your clinician."
        )
    elif is_post_meal:
        ref_note = (
            f"Context: {ctx_label}. Post-meal readings (1–2 hours after starting a meal) reflect postprandial excursion and must not be compared directly to fasting targets. "
            "ADA general post-meal reference for adults managing diabetes is < 180 mg/dL (< 10.0 mmol/L)."
        )
    else:
        ref_note = (
            f"Context: {ctx_label}. Random or bedtime readings depend on the timing and composition of your last meal and physical activity."
        )

    if age_group == "child":
        ref_note = (
            "Pediatric glucose targets are individualized by a pediatric endocrinologist; adult reference ranges do not automatically apply to children."
        )

    return {
        "context_label": ctx_label,
        "is_urgent": is_urgent,
        "urgent_warning": urgent_warning,
        "within_clinician_target": within_target,
        "reference_explanation": ref_note,
        "non_diagnostic_notice": (
            "Educational tracking only — GharPlate never diagnoses diabetes, hypoglycaemia, or hyperglycaemia, and never recommends insulin or medication dose changes."
        ),
        "sources": GLUCOSE_CLINICAL_SOURCES,
    }


def serialize_glucose_log(
    log: BloodGlucoseLog,
    clinician_target: dict[str, Any] | None = None,
    age_group: str = "adult",
) -> dict[str, Any]:
    interp = _evaluate_glucose_interpretation(
        log.value_mg_dl,
        log.value_mmol_l,
        log.measurement_context,
        clinician_target,
        age_group=age_group,
    )
    return {
        "id": log.id,
        "household_id": log.household_id,
        "member_id": log.member_id,
        "entered_value": log.entered_value,
        "entered_unit": log.entered_unit,
        "value_mg_dl": log.value_mg_dl,
        "value_mmol_l": log.value_mmol_l,
        "logged_date": log.logged_date,
        "logged_time": log.logged_time,
        "measurement_context": log.measurement_context,
        "context_label": GLUCOSE_CONTEXT_LABELS.get(
            log.measurement_context, log.measurement_context
        ),
        "minutes_after_meal": log.minutes_after_meal,
        "meal_reference": log.meal_reference,
        "device_type": log.device_type,
        "measurement_source": log.measurement_source,
        "notes": log.notes,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "updated_at": log.updated_at.isoformat() if log.updated_at else None,
        "interpretation": interp,
    }


def create_blood_glucose_log(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> BloodGlucoseLog:
    raw_val = payload.get("glucose_value")
    if raw_val is None:
        raw_val = payload.get("entered_value")
    try:
        entered_val = float(raw_val)  # type: ignore[arg-type]
    except (TypeError, ValueError) as exc:
        raise ValueError("Glucose reading must be a valid number.") from exc

    unit = str(payload.get("measurement_unit") or payload.get("entered_unit") or "mg/dL")
    val_mg, val_mmol, canonical_unit = convert_glucose_units(entered_val, unit)

    if not (20.0 <= val_mg <= 800.0):
        raise ValueError(
            "Glucose value out of physiological recording range (20–800 mg/dL or 1.1–44.4 mmol/L)."
        )

    context = str(payload.get("measurement_context") or "fasting").strip().lower()
    if context not in GLUCOSE_CONTEXT_LABELS:
        context = "other"

    mins_raw = payload.get("minutes_after_meal")
    mins_after = int(mins_raw) if mins_raw not in (None, "") else None

    logged_date = str(payload.get("logged_date") or today_iso_str()).strip()
    logged_time = str(
        payload.get("logged_time") or datetime.now(UTC).strftime("%H:%M")
    ).strip()

    log = BloodGlucoseLog(
        household_id=hh.id,
        member_id=member.id,
        entered_value=round(entered_val, 2),
        entered_unit=canonical_unit,
        value_mg_dl=val_mg,
        value_mmol_l=val_mmol,
        logged_date=logged_date,
        logged_time=logged_time,
        measurement_context=context,
        minutes_after_meal=mins_after,
        meal_reference=str(payload["meal_reference"]).strip()
        if payload.get("meal_reference")
        else None,
        device_type=str(payload.get("device_type") or "home_glucometer"),
        measurement_source=str(payload.get("measurement_source") or "manual_home_entry"),
        notes=str(payload["notes"]).strip() if payload.get("notes") else None,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def get_blood_glucose_dashboard(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    days: int = 30,
    end_date_str: str | None = None,
    context_filter: str | None = None,
) -> dict[str, Any]:
    end_dt_s = end_date_str or today_iso_str()
    end_dt = datetime.strptime(end_dt_s, "%Y-%m-%d")
    start_dt_s = (end_dt - timedelta(days=max(1, days - 1))).strftime("%Y-%m-%d")

    target_obj = get_member_clinician_target(db, member.id, "blood_glucose")
    target_details = target_obj.target_details_json if target_obj else None

    q = db.query(BloodGlucoseLog).filter(
        BloodGlucoseLog.household_id == hh.id,
        BloodGlucoseLog.member_id == member.id,
        BloodGlucoseLog.logged_date >= start_dt_s,
        BloodGlucoseLog.logged_date <= end_dt_s,
    )
    if context_filter and context_filter != "all":
        if context_filter == "pre_meal":
            q = q.filter(
                BloodGlucoseLog.measurement_context.in_(
                    ["before_breakfast", "before_lunch", "before_dinner"]
                )
            )
        elif context_filter == "post_meal":
            q = q.filter(
                BloodGlucoseLog.measurement_context.in_(
                    ["after_breakfast", "after_lunch", "after_dinner"]
                )
            )
        else:
            q = q.filter(BloodGlucoseLog.measurement_context == context_filter)

    logs = q.order_by(BloodGlucoseLog.logged_date.desc(), BloodGlucoseLog.id.desc()).all()
    serialized = [
    serialize_glucose_log(log, target_details, age_group=member.age_group)
    for log in logs
    ]

    today_readings = [r for r in serialized if r["logged_date"] == end_dt_s]
    fasting_readings = [
        r for r in serialized if r["measurement_context"] == "fasting"
    ]
    pre_meal_readings = [
        r
        for r in serialized
        if r["measurement_context"]
        in ("before_breakfast", "before_lunch", "before_dinner")
    ]
    post_meal_readings = [
        r
        for r in serialized
        if r["measurement_context"]
        in ("after_breakfast", "after_lunch", "after_dinner")
    ]
    bedtime_readings = [
        r for r in serialized if r["measurement_context"] == "bedtime"
    ]
    random_readings = [
        r for r in serialized if r["measurement_context"] in ("random", "other")
    ]

    def _avg_group(items: list[dict[str, Any]]) -> dict[str, float | int | None]:
        if not items:
            return {"count": 0, "avg_mg_dl": None, "avg_mmol_l": None}
        avg_mg = round(sum(x["value_mg_dl"] for x in items) / len(items), 1)
        avg_mmol = round(sum(x["value_mmol_l"] for x in items) / len(items), 2)
        return {"count": len(items), "avg_mg_dl": avg_mg, "avg_mmol_l": avg_mmol}

    # Build daily chart series (preserving context tags on every point and never inventing values)
    by_date: dict[str, list[dict[str, Any]]] = {}
    for r in reversed(serialized):
        by_date.setdefault(r["logged_date"], []).append(r)

    daily_series: list[dict[str, Any]] = []
    for offset in range(days - 1, -1, -1):
        d_s = (end_dt - timedelta(days=offset)).strftime("%Y-%m-%d")
        day_items = by_date.get(d_s, [])
        if not day_items:
            daily_series.append(
                {
                    "date": d_s,
                    "status": "no_reading_recorded",
                    "reading_count": 0,
                    "value_mg_dl": None,
                    "value_mmol_l": None,
                    "fasting_mg_dl": None,
                    "post_meal_mg_dl": None,
                    "readings": [],
                }
            )
        else:
            f_day = [
                x["value_mg_dl"]
                for x in day_items
                if x["measurement_context"] == "fasting"
            ]
            pm_day = [
                x["value_mg_dl"]
                for x in day_items
                if x["measurement_context"]
                in ("after_breakfast", "after_lunch", "after_dinner")
            ]
            daily_series.append(
                {
                    "date": d_s,
                    "status": "reading_recorded",
                    "reading_count": len(day_items),
                    "value_mg_dl": day_items[-1]["value_mg_dl"],
                    "value_mmol_l": day_items[-1]["value_mmol_l"],
                    "latest_context": day_items[-1]["measurement_context"],
                    "latest_context_label": day_items[-1]["context_label"],
                    "fasting_mg_dl": round(sum(f_day) / len(f_day), 1)
                    if f_day
                    else None,
                    "post_meal_mg_dl": round(sum(pm_day) / len(pm_day), 1)
                    if pm_day
                    else None,
                    "readings": day_items,
                }
            )

    return {
        "member": {
            "id": member.id,
            "display_name": member.display_name,
            "age_group": member.age_group,
            "selected_conditions": member.selected_conditions or [],
        },
        "latest_reading": serialized[0] if serialized else None,
        "today_readings": today_readings,
        "fasting_readings": fasting_readings,
        "pre_meal_readings": pre_meal_readings,
        "post_meal_readings": post_meal_readings,
        "bedtime_readings": bedtime_readings,
        "random_readings": random_readings,
        "readings": serialized,
        "weekly_series": daily_series[-7:],
        "monthly_series": daily_series,
        "context_summaries": {
            "fasting": _avg_group(fasting_readings),
            "pre_meal": _avg_group(pre_meal_readings),
            "post_meal": _avg_group(post_meal_readings),
            "bedtime": _avg_group(bedtime_readings),
            "random": _avg_group(random_readings),
        },
        "clinician_target": {
            "configured": target_obj is not None,
            "target_details": target_details,
            "target_source": target_obj.target_source if target_obj else None,
            "clinician_confirmed": target_obj.clinician_confirmed if target_obj else False,
            "effective_date": target_obj.effective_date if target_obj else None,
            "notes": target_obj.notes if target_obj else None,
        },
        "available_contexts": [
            {"code": k, "label": v} for k, v in GLUCOSE_CONTEXT_LABELS.items()
        ],
        "clinical_sources": GLUCOSE_CLINICAL_SOURCES,
        "medical_safety_notice": (
            "Fasting, pre-meal, post-meal, and random glucose readings represent distinct physiological states and are never averaged together as interchangeable. "
            "Never adjust insulin or diabetes medication dosages based on this tracker without consulting your physician."
        ),
    }


def save_clinician_measurement_target(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> dict[str, Any]:
    m_type = str(payload.get("measurement_type") or "").strip().lower()
    if m_type not in ("blood_pressure", "blood_glucose"):
        raise ValueError("'measurement_type' must be 'blood_pressure' or 'blood_glucose'.")

    existing = get_member_clinician_target(db, member.id, m_type)
    details = payload.get("target_details") or {}
    if not isinstance(details, dict):
        details = {}

    if existing:
        existing.target_details_json = details
        existing.target_source = str(
            payload.get("target_source") or "Clinician-provided personal target"
        )[:160]
        existing.clinician_confirmed = bool(payload.get("clinician_confirmed", True))
        existing.effective_date = payload.get("effective_date") or today_iso_str()
        existing.notes = payload.get("notes")
    else:
        existing = HealthMeasurementTarget(
            household_id=hh.id,
            member_id=member.id,
            measurement_type=m_type,
            target_details_json=details,
            target_source=str(
                payload.get("target_source") or "Clinician-provided personal target"
            )[:160],
            clinician_confirmed=bool(payload.get("clinician_confirmed", True)),
            effective_date=payload.get("effective_date") or today_iso_str(),
            notes=payload.get("notes"),
        )
        db.add(existing)
    db.commit()
    db.refresh(existing)
    return {
        "id": existing.id,
        "member_id": existing.member_id,
        "measurement_type": existing.measurement_type,
        "target_details": existing.target_details_json,
        "target_source": existing.target_source,
        "clinician_confirmed": existing.clinician_confirmed,
        "effective_date": existing.effective_date,
        "notes": existing.notes,
    }


# ==========================================
# PART 5 — UNIFIED HEALTH SUMMARY & DAILY TIMELINE
# ==========================================
def get_health_measurements_summary(
    db: Session, hh: Household, member: HouseholdMember
) -> dict[str, Any]:
    bp_dash = get_blood_pressure_dashboard(db, hh, member, days=14)
    bg_dash = get_blood_glucose_dashboard(db, hh, member, days=14)
    body_logs = (
        db.query(BodyMeasurementLog)
        .filter(BodyMeasurementLog.member_id == member.id)
        .order_by(BodyMeasurementLog.logged_date.desc(), BodyMeasurementLog.id.desc())
        .limit(10)
        .all()
    )

    conds = set(member.selected_conditions or [])
    bp_enabled = bool(
        bp_dash["summary_stats"]["total_readings"] > 0
        or conds.intersection({"hypertension", "cardiovascular_risk", "chronic_kidney_disease"})
    )
    glucose_enabled = bool(
        len(bg_dash["readings"]) > 0
        or conds.intersection({"type_2_diabetes", "prediabetes_metabolic", "gestational_diabetes", "pcos_metabolic"})
    )

    return {
        "member": {
            "id": member.id,
            "display_name": member.display_name,
            "age_group": member.age_group,
            "selected_conditions": list(conds),
        },
        "tracker_visibility": {
            "bp_widget_enabled": bp_enabled,
            "glucose_widget_enabled": glucose_enabled,
            "optional_notice": (
                "Blood pressure and blood glucose trackers are completely optional. "
                "Members without relevant health conditions can use all food, recipe, fitness, and grocery features without entering BP or glucose readings."
            ),
        },
        "blood_pressure": {
            "latest": bp_dash["latest_reading"],
            "today_count": len(bp_dash["today_readings"]),
            "total_readings_14d": bp_dash["summary_stats"]["total_readings"],
            "clinician_target": bp_dash["clinician_target"],
        },
        "blood_glucose": {
            "latest": bg_dash["latest_reading"],
            "today_count": len(bg_dash["today_readings"]),
            "total_readings_14d": len(bg_dash["readings"]),
            "clinician_target": bg_dash["clinician_target"],
        },
        "body_measurements": {
            "latest": {
                "id": body_logs[0].id,
                "logged_date": body_logs[0].logged_date,
                "weight_kg": body_logs[0].weight_kg,
                "waist_cm": body_logs[0].waist_cm,
                "workout_completed": body_logs[0].workout_completed,
                "milestone_note": body_logs[0].milestone_note,
            }
            if body_logs
            else None,
            "recent_count": len(body_logs),
        },
    }


def get_unified_daily_activity_timeline(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    date_str: str | None = None,
    category_filter: str | None = None,
) -> dict[str, Any]:
    """
    Builds a chronological daily activity timeline strictly from real saved records
    (Food, Water, Blood Pressure, Blood Glucose, Fitness/Body Milestones, and Completed Habits).
    Never fabricates activity entries.
    """
    target_date = date_str or today_iso_str()
    events: list[dict[str, Any]] = []

    # 1. Blood Pressure readings
    bp_logs = (
        db.query(BloodPressureLog)
        .filter(
            BloodPressureLog.member_id == member.id,
            BloodPressureLog.logged_date == target_date,
        )
        .all()
    )
    for bp in bp_logs:
        events.append(
            {
                "id": f"bp-{bp.id}",
                "category": "blood_pressure",
                "time": bp.logged_time or "07:30",
                "title": f"BP reading recorded: {bp.systolic_mmhg}/{bp.diastolic_mmhg} mmHg",
                "subtitle": (
                    f"{bp.time_of_day.title()} ({bp.reading_sequence.replace('_', ' ')})"
                    + (f" • Pulse: {bp.pulse_bpm} bpm" if bp.pulse_bpm else "")
                ),
                "icon": "🩺",
            }
        )

    # 2. Blood Glucose readings
    bg_logs = (
        db.query(BloodGlucoseLog)
        .filter(
            BloodGlucoseLog.member_id == member.id,
            BloodGlucoseLog.logged_date == target_date,
        )
        .all()
    )
    for bg in bg_logs:
        ctx_lbl = GLUCOSE_CONTEXT_LABELS.get(bg.measurement_context, bg.measurement_context)
        events.append(
            {
                "id": f"bg-{bg.id}",
                "category": "blood_glucose",
                "time": bg.logged_time or "08:00",
                "title": f"Glucose reading recorded: {bg.entered_value} {bg.entered_unit}",
                "subtitle": f"{ctx_lbl} ({bg.value_mg_dl} mg/dL / {bg.value_mmol_l} mmol/L)",
                "icon": "🩸",
            }
        )

    # 3. Food Diary entries
    food_logs = (
        db.query(DailyFoodLogEntry)
        .filter(
            DailyFoodLogEntry.member_id == member.id,
            DailyFoodLogEntry.logged_date == target_date,
        )
        .all()
    )
    for fl in food_logs:
        events.append(
            {
                "id": f"food-{fl.id}",
                "category": "food",
                "time": fl.logged_time or "12:30",
                "title": f"{fl.meal_category.replace('_', ' ').title()} logged: {fl.food_name}",
                "subtitle": (
                    f"{fl.quantity} × {fl.unit_name} ({fl.grams_equivalent}g) • "
                    f"{fl.energy_kcal if fl.energy_kcal is not None else 'NULL'} kcal, "
                    f"{fl.protein_g if fl.protein_g is not None else 'NULL'}g protein"
                ),
                "icon": "🍲",
            }
        )

    # 4. Water entries
    water_logs = (
        db.query(WaterIntakeLog)
        .filter(
            WaterIntakeLog.member_id == member.id,
            WaterIntakeLog.logged_date == target_date,
        )
        .all()
    )
    for wl in water_logs:
        events.append(
            {
                "id": f"water-{wl.id}",
                "category": "water",
                "time": wl.logged_time or "10:00",
                "title": f"Water recorded: {wl.amount_ml} ml",
                "subtitle": wl.container_type.replace("_", " ").title(),
                "icon": "💧",
            }
        )

    # 5. Fitness / Body Measurement logs
    body_logs = (
        db.query(BodyMeasurementLog)
        .filter(
            BodyMeasurementLog.member_id == member.id,
            BodyMeasurementLog.logged_date == target_date,
        )
        .all()
    )
    for bl in body_logs:
        events.append(
            {
                "id": f"fitness-{bl.id}",
                "category": "fitness",
                "time": bl.created_at.strftime("%H:%M") if bl.created_at else "18:00",
                "title": "Workout / Body milestone recorded"
                if bl.workout_completed
                else "Body measurement recorded",
                "subtitle": " • ".join(
                    filter(
                        None,
                        [
                            f"Weight: {bl.weight_kg} kg" if bl.weight_kg else None,
                            bl.milestone_note,
                        ],
                    )
                )
                or "Logged in Fitness Tracker",
                "icon": "🏋️",
            }
        )

    # 6. Completed Habits on target_date
    habit_comps = (
        db.query(HabitCompletionLog)
        .options(joinedload(HabitCompletionLog.habit))
        .filter(
            HabitCompletionLog.member_id == member.id,
            HabitCompletionLog.logged_date == target_date,
            HabitCompletionLog.completed.is_(True),
        )
        .all()
    )
    for hc in habit_comps:
        if hc.habit:
            events.append(
                {
                    "id": f"habit-{hc.id}",
                    "category": "habits",
                    "time": hc.completed_at.strftime("%H:%M")
                    if hc.completed_at
                    else (hc.habit.reminder_time or "20:00"),
                    "title": f"Habit completed: {hc.habit.title}",
                    "subtitle": f"Category: {hc.habit.category.replace('_', ' ').title()}",
                    "icon": "✅",
                }
            )

    if category_filter and category_filter != "all":
        events = [e for e in events if e["category"] == category_filter]

    events.sort(key=lambda x: str(x.get("time") or "00:00"))

    return {
        "date": target_date,
        "member_id": member.id,
        "member_name": member.display_name,
        "total_events": len(events),
        "events": events,
    }


# ==========================================
# PART 6 — AI-POWERED HABIT PLAN BUILDER
# ==========================================
def propose_ai_habit_plan(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    user_prompt: str,
) -> dict[str, Any]:
    """
    Analyzes the user's natural-language situation and combines it with their existing
    HouseholdMember + MemberFitnessProfile to propose a realistic, high-impact habit plan (4–5 habits).
    Never saves anything to the database until the user explicitly confirms.
    """
    f_prof = get_or_create_fitness_profile(db, member)
    text_l = (user_prompt or "").strip().lower()

    # Extract goal, routine, and challenges from natural language + profile
    extracted_goal = member.primary_goal or "maintain_balanced_diet"
    if any(k in text_l for k in ("gain muscle", "build muscle", "hypertrophy", "bulk")):
        extracted_goal = "build_muscle"
    elif any(k in text_l for k in ("lose fat", "weight loss", "cut", "lean")):
        extracted_goal = "lose_body_fat"
    elif any(k in text_l for k in ("strength", "lift", "stronger")):
        extracted_goal = "improve_strength"
    elif any(k in text_l for k in ("sugar", "diabetes", "blood pressure", "bp", "hypertension")):
        extracted_goal = "manage_health_condition"

    gym_days_match = re.search(r"(\d+|three|four|five|six)\s+days?\s+a\s+week", text_l)
    word_to_num = {"three": 3, "four": 4, "five": 5, "six": 6}
    training_days = f_prof.get("training_frequency_days_per_week", 3)
    if gym_days_match:
        tok = gym_days_match.group(1)
        training_days = word_to_num.get(tok, int(tok) if tok.isdigit() else training_days)

    challenges: list[str] = []
    if "skip breakfast" in text_l or "breakfast" in text_l:
        challenges.append("Skipping or delaying morning breakfast")
    if "water" in text_l or "hydrate" in text_l or "forget to drink" in text_l:
        challenges.append("Inconsistent daytime water intake")
    if "protein" in text_l:
        challenges.append("Not tracking or hitting daily protein intake")
    if "late" in text_l or "dinner" in text_l:
        challenges.append("Irregular evening meal timing")
    if not challenges:
        challenges.append("Building a consistent daily food and hydration rhythm")

    proposed_habits: list[dict[str, Any]] = []
    today_s = today_iso_str()
    prot_target = f_prof["computed_targets"].get("protein_g") or 75.0
    water_target = 2500

    # 1. Breakfast / Morning Nutrition Habit
    proposed_habits.append(
        {
            "title": "Eat & log a protein-rich breakfast (e.g., Idli-Sambar, Poha + Sprouts, or Eggs/Paneer)",
            "description": "Prevents morning energy crashes and anchors daily protein intake.",
            "category": "nutrition",
            "frequency": "daily",
            "suggested_schedule": "Daily at 08:30 AM",
            "reminder_time": "08:30",
            "tracking_method": "food_diary",
            "tracking_source_label": "Food Diary",
            "completion_criteria": "Log at least 1 breakfast item in Daily Tracker",
            "start_date": today_s,
            "target_value": 20.0,
            "target_unit": "g protein at breakfast",
        }
    )

    # 2. Daily Protein Tracking Habit
    proposed_habits.append(
        {
            "title": f"Monitor daily protein intake toward {int(prot_target)}g target",
            "description": "Include dal, curd, paneer, soya chunks, sprouts, eggs, or fish across lunch and dinner.",
            "category": "nutrition",
            "frequency": "daily",
            "suggested_schedule": "Daily review at 08:00 PM",
            "reminder_time": "20:00",
            "tracking_method": "nutrition_tracker",
            "tracking_source_label": "Nutrition Tracker",
            "completion_criteria": f"Reach ≥80% of {int(prot_target)}g daily protein target",
            "start_date": today_s,
            "target_value": float(prot_target),
            "target_unit": "g protein / day",
        }
    )

    # 3. Hydration Habit
    proposed_habits.append(
        {
            "title": "Record water intake throughout the day",
            "description": "Keep a water bottle at your desk/college bag and log glasses across morning and afternoon.",
            "category": "hydration",
            "frequency": "daily",
            "suggested_schedule": "Throughout day (09:00 AM – 08:00 PM)",
            "reminder_time": "11:00",
            "tracking_method": "water_tracker",
            "tracking_source_label": "Water Tracker",
            "completion_criteria": f"Log daily water toward configured {water_target} ml goal",
            "start_date": today_s,
            "target_value": float(water_target),
            "target_unit": "ml / day",
        }
    )

    # 4. Workout / Movement Habit
    proposed_habits.append(
        {
            "title": f"Complete scheduled workout ({training_days} days/week) & post-workout meal",
            "description": "Follow your weekly training schedule and refuel within 90 minutes after training.",
            "category": "training",
            "frequency": "training_days",
            "suggested_schedule": f"{training_days} selected training days/week",
            "reminder_time": "17:30",
            "tracking_method": "fitness_tracker",
            "tracking_source_label": "Fitness Tracker",
            "completion_criteria": "Complete planned workout session on scheduled training days",
            "start_date": today_s,
            "target_value": float(training_days),
            "target_unit": "sessions / week",
        }
    )

    # 5. Weekly Progress Review (or Clinician-Guided Measurement Reminder if requested)
    if any(k in text_l for k in ("bp", "blood pressure", "glucose", "sugar")):
        proposed_habits.append(
            {
                "title": "Record home health measurements per your clinician's schedule",
                "description": "Log Blood Pressure or Blood Glucose readings at the frequency advised by your doctor.",
                "category": "health_routine",
                "frequency": "daily",
                "suggested_schedule": "As instructed by your clinician (e.g., morning before breakfast)",
                "reminder_time": "07:30",
                "tracking_method": "health_measurements",
                "tracking_source_label": "Health Measurements",
                "completion_criteria": "Record reading in BP or Glucose Tracker per clinician schedule",
                "start_date": today_s,
                "target_value": 1.0,
                "target_unit": "reading / scheduled slot",
            }
        )
    else:
        proposed_habits.append(
            {
                "title": "Review weekly nutrition & habit consistency",
                "description": "Check 7-day protein, hydration, and training trends every Sunday evening.",
                "category": "health_routine",
                "frequency": "weekly",
                "suggested_schedule": "Weekly on Sunday at 07:00 PM",
                "reminder_time": "19:00",
                "tracking_method": "analytics",
                "tracking_source_label": "Progress Analytics",
                "completion_criteria": "Review 7-day chart in Progress Analytics",
                "start_date": today_s,
                "target_value": 1.0,
                "target_unit": "weekly review",
            }
        )

    missing_questions: list[str] = []
    if not user_prompt.strip():
        missing_questions.append(
            "What is your main routine challenge right now (for example: skipping breakfast, low protein, or forgetting water)?"
        )

    plan_id = f"ai_plan_{uuid.uuid4().hex[:10]}"
    return {
        "ai_plan_id": plan_id,
        "requires_user_confirmation": True,
        "saved": False,
        "member": {
            "id": member.id,
            "display_name": member.display_name,
            "age_group": member.age_group,
            "dietary_preference": member.dietary_preference,
            "selected_conditions": member.selected_conditions or [],
        },
        "extracted_context": {
            "primary_goal": extracted_goal,
            "training_days_per_week": training_days,
            "identified_challenges": challenges,
            "dietary_preference": member.dietary_preference,
            "missing_questions": missing_questions,
        },
        "proposed_habits": proposed_habits,
        "plan_summary": (
            f"Proposed {len(proposed_habits)} manageable, high-impact habits tailored to {member.display_name} "
            f"({extracted_goal.replace('_', ' ')}, {training_days} training days/week). "
            "Review, edit, add, or remove any habit below and click Confirm & Save Habit Plan to activate."
        ),
        "medical_safety_note": (
            "If tracking Blood Pressure or Blood Glucose, always follow the measurement frequency prescribed by your clinician."
        ),
    }


def confirm_ai_habit_plan(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Saves a user-reviewed and explicitly approved AI habit plan into the existing `HabitDefinition` table.
    Rejects unconfirmed requests (`user_confirmed` must be True).
    """
    if not bool(payload.get("user_confirmed", False)):
        raise ValueError(
            "Explicit user confirmation ('user_confirmed': true) is required before saving an AI habit plan."
        )

    habits_input = payload.get("habits") or []
    if not isinstance(habits_input, list) or not habits_input:
        raise ValueError("At least one habit is required to save the plan.")

    ai_plan_id = str(payload.get("ai_plan_id") or f"ai_plan_{uuid.uuid4().hex[:10]}")
    now = datetime.now(UTC)
    existing_habits = (
        db.query(HabitDefinition)
        .filter(HabitDefinition.member_id == member.id)
        .order_by(HabitDefinition.id.asc())
        .all()
    )

    def _intent_bucket(title_str: str, category_str: str, method_str: str) -> str | None:
        t_l = title_str.lower()
        if method_str == "water_tracker" or category_str == "hydration" or "water" in t_l:
            return "hydration_water"
        if method_str == "food_diary" or "breakfast" in t_l:
            return "breakfast_logging"
        if method_str == "fitness_tracker" or category_str == "training" or "workout" in t_l:
            return "workout_movement"
        return None

    created_or_updated: list[HabitDefinition] = []
    used_existing_ids: set[int] = set()

    for h_data in habits_input[:10]:
        if not isinstance(h_data, dict):
            continue
        title = str(h_data.get("title") or "").strip()[:160]
        if not title:
            continue
        cat_str = str(h_data.get("category") or "nutrition")
        freq_str = str(h_data.get("frequency") or "daily")
        method_str = str(h_data.get("tracking_method") or "manual_check")
        sched_meta = {
            "suggested_schedule": h_data.get("suggested_schedule") or "Daily",
            "tracking_source_label": h_data.get("tracking_source_label") or "Habit Tracker",
            "start_date": h_data.get("start_date") or today_iso_str(),
            "target_value": h_data.get("target_value"),
            "target_unit": h_data.get("target_unit"),
        }

        bucket = _intent_bucket(title, cat_str, method_str)
        matched_existing: HabitDefinition | None = None
        for ex in existing_habits:
            if ex.id in used_existing_ids:
                continue
            if ex.title.strip().lower() == title.lower():
                matched_existing = ex
                break
            if bucket and _intent_bucket(ex.title, ex.category or "", ex.tracking_method or "") == bucket:
                matched_existing = ex
                break

        if matched_existing:
            used_existing_ids.add(matched_existing.id)
            matched_existing.title = title
            matched_existing.description = str(h_data.get("description") or "").strip() or matched_existing.description
            matched_existing.category = cat_str
            matched_existing.frequency = freq_str
            matched_existing.reminder_time = h_data.get("reminder_time") or matched_existing.reminder_time
            matched_existing.schedule_metadata_json = sched_meta
            matched_existing.tracking_method = method_str
            matched_existing.completion_criteria = (
                str(h_data.get("completion_criteria") or "")[:200] or matched_existing.completion_criteria
            )
            matched_existing.ai_plan_id = ai_plan_id
            matched_existing.user_approved_at = now
            matched_existing.is_active = True
            created_or_updated.append(matched_existing)
        else:
            habit = HabitDefinition(
                member_id=member.id,
                title=title,
                description=str(h_data.get("description") or "").strip() or None,
                category=cat_str,
                frequency=freq_str,
                reminder_time=h_data.get("reminder_time"),
                schedule_metadata_json=sched_meta,
                tracking_method=method_str,
                completion_criteria=str(h_data.get("completion_criteria") or "")[:200] or None,
                ai_plan_id=ai_plan_id,
                user_approved_at=now,
                is_active=True,
            )
            db.add(habit)
            created_or_updated.append(habit)

    db.commit()
    for h in created_or_updated:
        db.refresh(h)

    return {
        "saved": True,
        "ai_plan_id": ai_plan_id,
        "saved_count": len(created_or_updated),
        "user_approved_at": now.isoformat(),
        "habit_ids": [h.id for h in created_or_updated],
    }


def modify_ai_habit_plan_natural_language(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    instruction: str,
    user_confirmed: bool = False,
) -> dict[str, Any]:
    """
    Handles natural-language habit plan modification requests such as:
    - 'Make my plan easier'
    - 'Add a water habit'
    - 'Remove the evening reminder'
    - 'Add a weekly nutrition review'
    - 'Pause one habit'
    - 'Show my missed habits'
    Requires `user_confirmed=True` before mutating persistent records.
    """
    inst_l = (instruction or "").strip().lower()
    existing_habits = (
        db.query(HabitDefinition)
        .options(joinedload(HabitDefinition.completions))
        .filter(HabitDefinition.member_id == member.id)
        .order_by(HabitDefinition.id.asc())
        .all()
    )

    today_s = today_iso_str()
    missed_habits = [
        {
            "id": h.id,
            "title": h.title,
            "frequency": h.frequency,
            "reminder_time": h.reminder_time,
        }
        for h in existing_habits
        if h.is_active
        and not any(c.logged_date == today_s and c.completed for c in (h.completions or []))
    ]

    if "missed" in inst_l or "show" in inst_l:
        return {
            "action": "query_missed_habits",
            "requires_user_confirmation": False,
            "applied": True,
            "missed_habits_today": missed_habits,
            "summary": f"You have {len(missed_habits)} uncompleted active habit(s) for today ({today_s}).",
        }

    proposed_changes: list[dict[str, Any]] = []
    if "easier" in inst_l or "simplify" in inst_l:
        for h in existing_habits:
            if h.frequency == "daily" and h.category == "training":
                proposed_changes.append(
                    {
                        "type": "update",
                        "habit_id": h.id,
                        "title": h.title,
                        "field": "frequency",
                        "old_value": h.frequency,
                        "new_value": "training_days",
                    }
                )
        if not proposed_changes and existing_habits:
            target_h = existing_habits[-1]
            proposed_changes.append(
                {
                    "type": "update",
                    "habit_id": target_h.id,
                    "title": target_h.title,
                    "field": "frequency",
                    "old_value": target_h.frequency,
                    "new_value": "weekdays",
                }
            )
    elif "remove" in inst_l and "reminder" in inst_l:
        for h in existing_habits:
            if h.reminder_time:
                proposed_changes.append(
                    {
                        "type": "update",
                        "habit_id": h.id,
                        "title": h.title,
                        "field": "reminder_time",
                        "old_value": h.reminder_time,
                        "new_value": None,
                    }
                )
    elif "pause" in inst_l and existing_habits:
        active_list = [h for h in existing_habits if h.is_active]
        target_h = active_list[-1] if active_list else existing_habits[-1]
        proposed_changes.append(
            {
                "type": "update",
                "habit_id": target_h.id,
                "title": target_h.title,
                "field": "is_active",
                "old_value": target_h.is_active,
                "new_value": False,
            }
        )
    elif "water" in inst_l:
        proposed_changes.append(
            {
                "type": "create",
                "title": "Drink 1 glass (250 ml) of water with every meal",
                "category": "hydration",
                "frequency": "daily",
                "reminder_time": "10:00",
                "tracking_method": "water_tracker",
            }
        )
    elif "weekly" in inst_l or "review" in inst_l:
        proposed_changes.append(
            {
                "type": "create",
                "title": "Weekly Sunday nutrition & habit review",
                "category": "health_routine",
                "frequency": "weekly",
                "reminder_time": "19:00",
                "tracking_method": "analytics",
            }
        )
    else:
        proposed_changes.append(
            {
                "type": "create",
                "title": instruction.strip()[:140] or "Custom Daily Wellness Habit",
                "category": "nutrition",
                "frequency": "daily",
                "reminder_time": "09:00",
                "tracking_method": "manual_check",
            }
        )

    if not user_confirmed:
        return {
            "action": "propose_modification",
            "requires_user_confirmation": True,
            "applied": False,
            "proposed_changes": proposed_changes,
            "missed_habits_today": missed_habits,
            "summary": f"Proposed {len(proposed_changes)} update(s) to your habit plan. Please confirm to apply.",
        }

    # Apply confirmed changes
    for ch in proposed_changes:
        if ch["type"] == "update":
            h_obj = next((x for x in existing_habits if x.id == ch["habit_id"]), None)
            if h_obj:
                setattr(h_obj, ch["field"], ch["new_value"])
        elif ch["type"] == "create":
            db.add(
                HabitDefinition(
                    member_id=member.id,
                    title=ch["title"],
                    category=ch.get("category", "nutrition"),
                    frequency=ch.get("frequency", "daily"),
                    reminder_time=ch.get("reminder_time"),
                    tracking_method=ch.get("tracking_method", "manual_check"),
                    user_approved_at=datetime.now(UTC),
                    is_active=True,
                )
            )
    db.commit()
    return {
        "action": "modification_applied",
        "requires_user_confirmation": False,
        "applied": True,
        "applied_changes": proposed_changes,
        "summary": f"Applied {len(proposed_changes)} confirmed change(s) to your habits.",
    }


# ==========================================
# PART 7 — NATURAL-LANGUAGE DAILY FOOD LOGGING
# ==========================================
_NUMBER_WORDS: dict[str, float] = {
    "half": 0.5,
    "a": 1.0,
    "an": 1.0,
    "one": 1.0,
    "two": 2.0,
    "three": 3.0,
    "four": 4.0,
    "five": 5.0,
    "six": 6.0,
}

_UNIT_SYNONYMS: dict[str, str] = {
    "katori": "katori",
    "katoris": "katori",
    "bowl": "katori",
    "bowls": "katori",
    "cup": "standard_serving",
    "cups": "standard_serving",
    "glass": "standard_serving",
    "glasses": "standard_serving",
    "piece": "standard_serving",
    "pieces": "standard_serving",
    "idli": "standard_serving",
    "idlis": "standard_serving",
    "roti": "standard_serving",
    "rotis": "standard_serving",
    "chapati": "standard_serving",
    "chapatis": "standard_serving",
    "dosa": "standard_serving",
    "dosas": "standard_serving",
    "plate": "standard_serving",
    "serving": "standard_serving",
    "servings": "standard_serving",
    "tbsp": "tbsp",
    "tablespoon": "tbsp",
    "tsp": "tsp",
    "teaspoon": "tsp",
    "g": "100g",
    "gram": "100g",
    "grams": "100g",
}


def parse_natural_language_food_log(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    raw_text: str,
    default_date: str | None = None,
) -> dict[str, Any]:
    """
    Parses a natural-language meal sentence such as:
      "I had two idlis with one bowl of sambar and a glass of milk for breakfast at 8 AM"
    Matches against real GharPlate food items and aliases (English, Hindi, Kannada),
    extracts meal category, logged time, and serving quantities, computes genuine nutritional
    previews (preserving NULL for unmeasured nutrients), and returns a confirmation preview.
    Never saves entries without explicit user confirmation.
    """
    sentence = (raw_text or "").strip()
    if not sentence:
        raise ValueError("Please enter a sentence describing what you ate.")

    sent_l = sentence.lower()
    logged_date = default_date or today_iso_str()

    # 1. Detect meal category
    meal_category = "breakfast"
    meal_keywords = [
        ("early morning", "early_morning"),
        ("pre-workout", "pre_workout"),
        ("pre workout", "pre_workout"),
        ("post-workout", "post_workout"),
        ("post workout", "post_workout"),
        ("breakfast", "breakfast"),
        ("mid-morning", "mid_morning_snack"),
        ("lunch", "lunch"),
        ("evening snack", "evening_snack"),
        ("snack", "evening_snack"),
        ("dinner", "dinner"),
        ("supper", "dinner"),
    ]
    for kw, m_cat in meal_keywords:
        if kw in sent_l:
            meal_category = m_cat
            break

    # 2. Detect logged time (e.g. "at 8 AM", "at 8:30 am", "at 13:15")
    logged_time = datetime.now(UTC).strftime("%H:%M")
    time_match = re.search(
        r"\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b", sent_l, re.IGNORECASE
    )
    if time_match:
        hr = int(time_match.group(1))
        mn = int(time_match.group(2) or 0)
        mer = (time_match.group(3) or "").lower()
        if mer == "pm" and hr < 12:
            hr += 12
        elif mer == "am" and hr == 12:
            hr = 0
        logged_time = f"{hr:02d}:{mn:02d}"

    # 3. Load catalog of foods and aliases for accurate matching
    all_foods = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.aliases),
            joinedload(FoodItem.nutrient_values),
            joinedload(FoodItem.servings),
        )
        .all()
    )

    # Split sentence into candidate clauses around "with", "and", ",", "+"
    cleaned_sent = re.sub(
        r"\b(for\s+(?:breakfast|lunch|dinner|evening\s+snack|snack|pre-workout|post-workout)|at\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)?|i\s+had|i\s+ate|today|this\s+morning)\b",
        " ",
        sent_l,
        flags=re.IGNORECASE,
    )
    clauses = [
        c.strip()
        for c in re.split(r"\b(?:with|and|plus)\b|,|\+", cleaned_sent)
        if c.strip()
    ]

    parsed_items: list[dict[str, Any]] = []
    clarification_questions: list[str] = []

    for clause in clauses:
        # Extract quantity from clause
        qty: float | None = None
        unit_hint = "standard_serving"

        num_m = re.search(r"\b(\d+(?:\.\d+)?)\b", clause)
        if num_m:
            qty = float(num_m.group(1))
        else:
            for w, val in _NUMBER_WORDS.items():
                if re.search(rf"\b{w}\b", clause):
                    qty = val
                    break

        for u_word, u_norm in _UNIT_SYNONYMS.items():
            if re.search(rf"\b{u_word}\b", clause):
                unit_hint = u_norm
                break

        # Match food in clause
        best_food: FoodItem | None = None
        best_score = 0

        for f in all_foods:
            candidates = [f.name_en.lower(), f.slug.replace("-", " ").lower()]
            for al in f.aliases or []:
                candidates.append(al.alias_text.lower())
                candidates.append(al.normalized_text.lower())

            for cand in candidates:
                base_cand = re.sub(r"\s*\(.*?\)", "", cand).strip()
                if not base_cand or len(base_cand) < 3:
                    continue
                # Check singular/plural stem match (e.g. "idlis" -> "idli")
                for token_variant in {base_cand, f"{base_cand}s", base_cand.rstrip("s")}:
                    if len(token_variant) >= 3 and re.search(
                        rf"\b{re.escape(token_variant)}\b", clause
                    ):
                        score = len(token_variant) + (
                            15 if token_variant == base_cand else 10
                        )
                        if score > best_score:
                            best_score = score
                            best_food = f

        if best_food:
            quantity_assumed = False
            if qty is None:
                qty = 1.0
                quantity_assumed = True
                clarification_questions.append(
                    f"How much '{best_food.name_en}' did you have? (Defaulted to 1 {best_food.standard_serving_name} for preview — please adjust if needed.)"
                )

            # Adjust quantity when standard serving already represents multiple pieces (e.g., 2 idlis = 1 standard serving of 2 idlis, or keep explicit serving conversion)
            srv_match = next(
                (s for s in (best_food.servings or []) if s.unit_name == unit_hint),
                None,
            )
            grams_per_unit = (
                srv_match.grams_equivalent
                if srv_match
                else best_food.standard_serving_grams
            )
            if (
                "2 idlis" in best_food.standard_serving_name.lower()
                and unit_hint == "standard_serving"
                and "idli" in clause
                and qty >= 1
            ):
                # 1 idli is half of the "2 medium idlis (120g)" standard serving
                grams_equiv = round((best_food.standard_serving_grams / 2.0) * qty, 1)
            else:
                grams_equiv = round(grams_per_unit * qty, 1)

            factor = grams_equiv / 100.0
            nut_map = {nv.nutrient_code: nv.value for nv in best_food.nutrient_values}

            def _sc(code: str, _nm: dict[str, float | None] = nut_map, _f: float = factor) -> float | None:
                v = _nm.get(code)
                return round(float(v) * _f, 2) if v is not None else None

            missing_codes = [
                nv.nutrient_code
                for nv in best_food.nutrient_values
                if nv.value is None
            ]

            parsed_items.append(
                {
                    "matched": True,
                    "clause": clause,
                    "food_slug": best_food.slug,
                    "food_name": best_food.name_en,
                    "quantity": qty,
                    "unit_name": unit_hint,
                    "grams_equivalent": grams_equiv,
                    "quantity_needs_confirmation": quantity_assumed,
                    "meal_category": meal_category,
                    "logged_date": logged_date,
                    "logged_time": logged_time,
                    "energy_kcal": _sc("energy_kcal"),
                    "protein_g": _sc("protein_g"),
                    "carbs_g": _sc("carbs_g"),
                    "fat_total_g": _sc("fat_total_g"),
                    "fibre_g": _sc("fibre_g"),
                    "missing_nutrient_count": len(missing_codes),
                }
            )

    if not parsed_items:
        clarification_questions.append(
            "Could not match specific foods in that sentence to the GharPlate database. Try mentioning Indian dish or ingredient names such as Idli, Sambar, Milk, Ragi, Dal, Roti, Rice, Paneer, or Curd."
        )

    return {
        "raw_text": sentence,
        "logged_date": logged_date,
        "logged_time": logged_time,
        "meal_category": meal_category,
        "requires_user_confirmation": True,
        "saved": False,
        "parsed_items": parsed_items,
        "clarification_questions": clarification_questions,
    }


def confirm_natural_language_food_logs(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    payload: dict[str, Any],
) -> list[dict[str, Any]]:
    if not bool(payload.get("user_confirmed", False)):
        raise ValueError(
            "Explicit user confirmation ('user_confirmed': true) is required to save parsed food logs."
        )
    items = payload.get("items") or []
    saved_entries: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict) or not item.get("food_slug"):
            continue
        entry = create_daily_food_log_entry(
            db,
            hh,
            member,
            {
                "logged_date": item.get("logged_date") or payload.get("logged_date") or today_iso_str(),
                "logged_time": item.get("logged_time") or payload.get("logged_time"),
                "meal_category": item.get("meal_category") or payload.get("meal_category") or "breakfast",
                "food_slug": item["food_slug"],
                "quantity": float(item.get("quantity") or 1.0),
                "unit_name": str(item.get("unit_name") or "standard_serving"),
                "grams_equivalent": item.get("grams_equivalent"),
                "entry_source_type": "ai_natural_language",
                "notes": f"Confirmed from AI quick-log: '{payload.get('raw_text', '')[:100]}'",
            },
        )
        saved_entries.append(serialize_food_log_entry(entry))
    return saved_entries
