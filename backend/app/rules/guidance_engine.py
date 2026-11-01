"""
Deterministic, Evidence-Based Condition-Aware Food Guidance Engine.
Separates clinical rules from business logic, evaluates single and multiple conditions,
identifies competing nutritional considerations, and never labels foods as Safe/Unsafe/Allowed/Forbidden.
"""

from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    ConditionConflictRule,
    FoodItem,
    HealthCondition,
    NutrientDefinition,
    NutritionRule,
)
from app.schemas.api_schemas import (
    ConditionConflictOut,
    GuidanceEvaluationRequest,
    GuidanceEvaluationResponse,
    GuidanceObservation,
)

ALLOWED_EDUCATIONAL_CATEGORIES = {
    "Nutritionally relevant",
    "Portion-sensitive",
    "Nutrient to monitor",
    "May require individualised advice",
    "Limited evidence available",
    "Insufficient nutritional information",
    "Potential allergen concern",
}

MEDICAL_DISCLAIMER_TEXT = (
    "Educational Nutrition Context Only: GharPlate provides evidence-backed food composition and "
    "guideline context. It does not diagnose medical conditions, prescribe daily nutrient limits, "
    "or replace individualised care from a qualified physician or registered dietitian."
)


def resolve_serving_grams(food: FoodItem, serving_unit: str, quantity: float) -> tuple[str, float]:
    for srv in food.servings:
        if srv.unit_name.lower() == serving_unit.lower():
            grams = round(srv.grams_equivalent * quantity, 2)
            label = f"{quantity:g} x {srv.unit_label} ({grams:g} g)"
            return label, grams
    # Fallback to standard serving
    grams = round(food.standard_serving_grams * quantity, 2)
    label = f"{quantity:g} x {food.standard_serving_name} ({grams:g} g)"
    return label, grams


def evaluate_food_guidance(
    db: Session, req: GuidanceEvaluationRequest
) -> GuidanceEvaluationResponse:
    food = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.nutrient_values),
            joinedload(FoodItem.servings),
        )
        .filter(FoodItem.slug == req.food_slug)
        .first()
    )
    if not food:
        raise ValueError(f"Food '{req.food_slug}' not found")

    serving_label, total_grams = resolve_serving_grams(
        food, req.serving_unit, req.serving_quantity
    )
    serving_factor = total_grams / 100.0

    nut_defs: dict[str, NutrientDefinition] = {
        nd.code: nd for nd in db.query(NutrientDefinition).all()
    }
    nv_per_100: dict[str, float | None] = {
        nv.nutrient_code: nv.value for nv in food.nutrient_values
    }

    # 1. Allergies & Intolerances (kept strictly distinct!)
    allergen_alerts: list[str] = []
    food_allergens = {a.lower() for a in (food.allergen_tags or [])}
    for user_allergy in req.allergies:
        ua_norm = user_allergy.strip().lower()
        if not ua_norm:
            continue
        if any(ua_norm in fa or fa in ua_norm for fa in food_allergens):
            allergen_alerts.append(
                f"Potential allergen concern: '{food.name_en}' lists '{user_allergy}' in its allergen profile. "
                "This is a data-based indication, not a clinical safety guarantee."
            )
        elif not food.allergen_declaration_complete or (
            food.is_packaged and not food.ingredients_text
        ):
            allergen_alerts.append(
                f"Incomplete allergen data for '{user_allergy}': Ingredient declarations are incomplete for '{food.name_en}'. "
                "GharPlate cannot establish whether this product contains the allergen."
            )

    intolerance_alerts: list[str] = []
    food_intolerances = {i.lower() for i in (food.intolerance_tags or [])}
    for user_intol in req.intolerances:
        ui_norm = user_intol.strip().lower()
        if not ui_norm:
            continue
        if any(ui_norm in fi or fi in ui_norm for fi in food_intolerances):
            intolerance_alerts.append(
                f"Digestive intolerance note ('{user_intol}'): '{food.name_en}' contains components ({', '.join(food.intolerance_tags)}) "
                "that may be portion-sensitive for digestive comfort (distinct from an immune allergy)."
            )

    dietary_pref_alerts: list[str] = []
    if req.dietary_preference:
        dp = req.dietary_preference.lower()
        if dp in ("vegetarian", "jain", "vegan") and not food.is_vegetarian:
            dietary_pref_alerts.append(
                f"Dietary preference mismatch: '{food.name_en}' is non-vegetarian, whereas the selected profile preference is '{req.dietary_preference}'."
            )
        elif dp == "vegan" and not food.is_vegan:
            dietary_pref_alerts.append(
                f"Dietary preference mismatch: '{food.name_en}' contains animal/dairy derivatives, whereas the selected profile preference is 'vegan'."
            )

    # 2. Fetch selected health conditions
    conditions = (
        db.query(HealthCondition)
        .options(
            joinedload(HealthCondition.source),
            joinedload(HealthCondition.rules).joinedload(NutritionRule.source),
        )
        .filter(HealthCondition.code.in_(req.condition_codes))
        .all()
        if req.condition_codes
        else []
    )
    cond_by_code = {c.code: c for c in conditions}

    # 3. Check Multi-Condition Conflicts
    conflicts_out: list[ConditionConflictOut] = []
    if len(cond_by_code) >= 2:
        selected_set = set(cond_by_code.keys())
        all_conflict_rules = (
            db.query(ConditionConflictRule)
            .options(joinedload(ConditionConflictRule.source))
            .all()
        )
        for cr in all_conflict_rules:
            if cr.condition_a_code in selected_set and cr.condition_b_code in selected_set:
                conflicts_out.append(
                    ConditionConflictOut(
                        conflict_code=cr.conflict_code,
                        condition_a_code=cr.condition_a_code,
                        condition_b_code=cr.condition_b_code,
                        competing_domain=cr.competing_domain,
                        conflict_explanation=cr.conflict_explanation,
                        why_conflict_exists=cr.why_conflict_exists,
                        professional_guidance_notice=cr.professional_guidance_notice,
                        source_citation=f"{cr.source.name} ({cr.source.publication_year})",
                        source_url=cr.source.url,
                    )
                )

    # 4. Evaluate Deterministic Rules per Condition
    observations: list[GuidanceObservation] = []
    missing_relevant_nutrients_set = set()
    requires_prof_guidance = bool(conflicts_out) or bool(allergen_alerts)

    for cond in conditions:
        # Check age-group scoping for special life stages / children
        if req.age_group in ("child", "adolescent") and cond.code not in (
            "children_adolescents_growth",
            "type_1_diabetes",
            "iron_deficiency_anaemia",
            "coeliac_disease",
            "lactose_intolerance",
            "fever_acute_recovery",
            "acute_diarrhoea_dehydration",
            "constipation",
        ):
            requires_prof_guidance = True
            observations.append(
                GuidanceObservation(
                    rule_code=f"AGE_SCOPE_{cond.code.upper()}",
                    condition_code=cond.code,
                    condition_name=cond.name,
                    educational_category="May require individualised advice",
                    relevance_level="individualised_review",
                    nutrient_code=None,
                    nutrient_name=None,
                    evaluated_value=None,
                    unit=None,
                    evaluation_basis="age_scope",
                    explanation=(
                        f"Life-stage safeguard: Adult clinical thresholds for '{cond.name}' must not be applied directly "
                        f"to a {req.age_group} profile. Pediatric/adolescent growth requirements require specialist supervision."
                    ),
                    applicability_limitations="Pediatric nutrition requires paediatrician and registered dietitian oversight.",
                    evidence_status="Mandatory Pediatric Safety Scope (ICMR-NIN DGI 2024)",
                    source_citation=f"{cond.source.name} ({cond.publication_year})",
                    source_url=cond.source.url,
                    publication_year=cond.publication_year,
                )
            )
            continue

        # Track missing relevant nutrients for this condition
        for rel_nut in cond.relevant_nutrients:
            if nv_per_100.get(rel_nut) is None:
                missing_relevant_nutrients_set.add(rel_nut)
                nd_obj = nut_defs.get(rel_nut)
                nut_label = nd_obj.name if nd_obj else rel_nut
                observations.append(
                    GuidanceObservation(
                        rule_code=f"MISSING_{cond.code.upper()}_{rel_nut.upper()}",
                        condition_code=cond.code,
                        condition_name=cond.name,
                        educational_category="Insufficient nutritional information",
                        relevance_level="contextual_note",
                        nutrient_code=rel_nut,
                        nutrient_name=nut_label,
                        evaluated_value=None,
                        unit=nd_obj.unit if nd_obj else None,
                        evaluation_basis=food.default_basis,
                        explanation=(
                            f"{nut_label} is relevant to '{cond.name}', but its value is NULL (unmeasured or undeclared on the label) "
                            f"for '{food.name_en}'. GharPlate never assumes missing nutrients are zero."
                        ),
                        applicability_limitations="Verify original package declaration or laboratory composition tables.",
                        evidence_status="Data Completeness Safeguard",
                        source_citation=f"{food.source.name} ({food.source.publication_year})",
                        source_url=food.source.url,
                        publication_year=food.source.publication_year,
                    )
                )

        # Short-term illness red-flag educational note
        if cond.is_short_term_illness and cond.red_flag_warning:
            observations.append(
                GuidanceObservation(
                    rule_code=f"SHORT_TERM_SAFETY_{cond.code.upper()}",
                    condition_code=cond.code,
                    condition_name=cond.name,
                    educational_category="May require individualised advice",
                    relevance_level="individualised_review",
                    nutrient_code=None,
                    nutrient_name=None,
                    evaluated_value=None,
                    unit=None,
                    evaluation_basis="clinical_context",
                    explanation=f"Short-Term Illness Context: {cond.red_flag_warning}",
                    applicability_limitations=cond.what_evidence_does_not_establish,
                    evidence_status="Clinical Safety Guideline",
                    source_citation=f"{cond.source.name} ({cond.publication_year})",
                    source_url=cond.source.url,
                    publication_year=cond.publication_year,
                )
            )

        # Evaluate each structured rule
        for rule in cond.rules:
            matched = False
            eval_val: float | None = None
            nut_name: str | None = None
            unit_str: str | None = None

            if rule.nutrient_code:
                nd_obj = nut_defs.get(rule.nutrient_code)
                nut_name = nd_obj.name if nd_obj else rule.nutrient_code
                unit_str = nd_obj.unit if nd_obj else ""
                raw_100 = nv_per_100.get(rule.nutrient_code)
                if raw_100 is None:
                    continue
                eval_val = (
                    round(raw_100 * serving_factor, 2)
                    if rule.evaluation_basis == "serving"
                    else round(raw_100, 2)
                )

                if rule.comparison_operator == "gt" and rule.threshold_low is not None:
                    matched = eval_val > rule.threshold_low
                elif rule.comparison_operator == "gte" and rule.threshold_low is not None:
                    matched = eval_val >= rule.threshold_low
                elif rule.comparison_operator == "lt" and rule.threshold_low is not None:
                    matched = eval_val < rule.threshold_low
                elif rule.comparison_operator == "lte" and rule.threshold_low is not None:
                    matched = eval_val <= rule.threshold_low
                elif (
                    rule.comparison_operator == "between"
                    and rule.threshold_low is not None
                    and rule.threshold_high is not None
                ):
                    matched = rule.threshold_low <= eval_val <= rule.threshold_high
            else:
                if rule.comparison_operator == "tag_present" and rule.dietary_tag_match:
                    matched = rule.dietary_tag_match in (food.dietary_tags or [])
                elif rule.comparison_operator == "intolerance_substring" and rule.dietary_tag_match:
                    matched = any(
                        rule.dietary_tag_match.lower() in tag.lower()
                        for tag in (food.intolerance_tags or [])
                    )
                elif rule.comparison_operator == "category_match" and rule.food_category_slug:
                    matched = food.category.slug == rule.food_category_slug
                elif rule.comparison_operator == "allergen_match" and rule.dietary_tag_match:
                    matched = any(
                        rule.dietary_tag_match.lower() in tag.lower()
                        for tag in (food.allergen_tags or [])
                    )
                    if matched:
                        allergen_alerts.append(
                            f"Coeliac / Gluten Alert: '{food.name_en}' contains gluten/wheat allergens."
                        )

            if matched:
                cat = (
                    rule.educational_category
                    if rule.educational_category in ALLOWED_EDUCATIONAL_CATEGORIES
                    else "Nutritionally relevant"
                )
                if cat == "May require individualised advice":
                    requires_prof_guidance = True

                basis_display = (
                    f"per evaluated serving ({total_grams:g} g)"
                    if rule.evaluation_basis == "serving"
                    else f"per {food.default_basis}"
                )
                val_prefix = (
                    f"Measured {nut_name}: {eval_val:g} {unit_str} ({basis_display}). "
                    if eval_val is not None and nut_name
                    else ""
                )
                observations.append(
                    GuidanceObservation(
                        rule_code=rule.rule_code,
                        condition_code=cond.code,
                        condition_name=cond.name,
                        educational_category=cat,
                        relevance_level=rule.relevance_level,
                        nutrient_code=rule.nutrient_code,
                        nutrient_name=nut_name,
                        evaluated_value=eval_val,
                        unit=unit_str,
                        evaluation_basis=basis_display,
                        explanation=f"{val_prefix}{rule.explanation}",
                        applicability_limitations=rule.applicability_limitations,
                        evidence_status=rule.evidence_status,
                        source_citation=f"{rule.source.name} — {rule.source_section} ({rule.publication_year})",
                        source_url=rule.source.url,
                        publication_year=rule.publication_year,
                    )
                )

        # If no specific threshold triggered for this condition, provide transparent baseline nutritional context
        has_obs_for_cond = any(o.condition_code == cond.code for o in observations)
        if not has_obs_for_cond:
            observations.append(
                GuidanceObservation(
                    rule_code=f"BASELINE_CONTEXT_{cond.code.upper()}",
                    condition_code=cond.code,
                    condition_name=cond.name,
                    educational_category="Nutritionally relevant",
                    relevance_level="contextual_note",
                    nutrient_code=None,
                    nutrient_name=None,
                    evaluated_value=None,
                    unit=None,
                    evaluation_basis=f"per evaluated serving ({total_grams:g} g)",
                    explanation=(
                        f"For '{cond.name}', key nutrients to review in '{food.name_en}' are "
                        f"{', '.join(cond.relevant_nutrients)}. {cond.portion_considerations}"
                    ),
                    applicability_limitations=cond.individual_differences,
                    evidence_status="Reference Guideline Context",
                    source_citation=f"{cond.source.name} ({cond.publication_year})",
                    source_url=cond.source.url,
                    publication_year=cond.publication_year,
                )
            )

    return GuidanceEvaluationResponse(
        food_slug=food.slug,
        food_name=food.name_en,
        evaluated_serving_label=serving_label,
        evaluated_grams=total_grams,
        selected_conditions=req.condition_codes,
        age_group=req.age_group,
        medical_disclaimer=MEDICAL_DISCLAIMER_TEXT,
        requires_professional_guidance=requires_prof_guidance,
        allergen_alerts=allergen_alerts,
        intolerance_alerts=intolerance_alerts,
        dietary_preference_alerts=dietary_pref_alerts,
        multi_condition_conflicts=conflicts_out,
        observations=observations,
        missing_relevant_nutrients=sorted(missing_relevant_nutrients_set),
        data_confidence=food.confidence_level,
    )
