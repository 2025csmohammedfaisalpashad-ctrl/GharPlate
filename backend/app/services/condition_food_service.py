from typing import Optional
from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    ConditionFoodMapping,
    FoodItem,
    FoodItemTag,
    HealthCondition,
    Household,
    HouseholdMember,
    NutrientDefinition,
)
from app.schemas.api_schemas import (
    ConditionBriefOut,
    ConditionFoodRecommendationItem,
    ConditionFoodRecommendationResponse,
    ConditionFoodSourceOut,
    ConditionMemberContextOut,
    DietaryCompatibilityOut,
)
from app.services.food_service import serialize_food_summary

RELEVANCE_TYPE_NORMALIZATION: dict[str, str] = {
    "relevant_to_explore": "relevant_food_to_explore",
    "relevant_food_to_explore": "relevant_food_to_explore",
    "portion_sensitive": "portion_sensitive",
    "nutrient_to_monitor": "nutrient_to_monitor",
    "individualised_advice_required": "individualised_advice_required",
    "insufficient_information": "insufficient_information",
}

RELEVANCE_LABELS: dict[str, str] = {
    "relevant_food_to_explore": "Relevant food to explore",
    "portion_sensitive": "Portion-sensitive",
    "nutrient_to_monitor": "Nutrient to monitor",
    "individualised_advice_required": "Individualised advice required",
    "insufficient_information": "Insufficient information",
}

RELEVANCE_PRIORITY_ORDER: dict[str, int] = {
    "relevant_food_to_explore": 1,
    "portion_sensitive": 2,
    "nutrient_to_monitor": 3,
    "individualised_advice_required": 4,
    "insufficient_information": 5,
}

EMPTY_RECOMMENDATIONS_MESSAGE = (
    "No sufficiently reviewed food recommendations are available for this condition yet."
)

CONDITION_FOOD_MEDICAL_DISCLAIMER = (
    "Educational nutrition information only. Condition-specific food relevance is based on "
    "documented dietary guidance and reference food composition, not a personalised medical "
    "prescription, clinical diagnosis, or allergen safety guarantee."
)


def _normalize_dietary_preference(pref: Optional[str]) -> Optional[str]:
    if not pref:
        return None
    cleaned = pref.strip().lower().replace("-", "_").replace(" ", "_")
    valid = {"vegetarian", "vegan", "eggetarian", "non_vegetarian", "jain"}
    return cleaned if cleaned in valid else None


def _is_food_compatible_with_preference(
    food: FoodItem, tag_codes: list[str], dietary_preference: Optional[str]
) -> bool:
    """
    Evaluate whether a food item is compatible with the requested dietary preference.
    If dietary_preference is None, no dietary assumption is made and all reviewed
    condition-mapped foods are returned with clear dietary compatibility badges.
    """
    if not dietary_preference:
        return True

    allergens = {a.lower() for a in (food.allergen_tags or [])}
    dietary_tags = {d.lower() for d in (food.dietary_tags or [])}
    all_tags = {t.lower() for t in tag_codes} | dietary_tags

    has_egg = "egg" in allergens or "contains_egg" in all_tags or "eggetarian" in all_tags
    has_meat_or_fish = (
        "fish" in allergens
        or "shellfish" in allergens
        or "non_vegetarian" in all_tags
    )
    has_dairy_or_lactose = (
        "milk" in allergens
        or "dairy" in allergens
        or "contains_dairy" in all_tags
        or "contains_lactose" in all_tags
        or "lactose" in {i.lower() for i in (food.intolerance_tags or [])}
    )

    if dietary_preference in {"vegetarian", "jain"}:
        if not food.is_vegetarian or has_egg or has_meat_or_fish:
            return False
        if dietary_preference == "jain":
            slug_l = food.slug.lower()
            if any(root in slug_l for root in ("potato", "onion", "garlic", "carrot")):
                return False
        return True

    if dietary_preference == "vegan":
        if (
            not food.is_vegan
            or not food.is_vegetarian
            or has_egg
            or has_meat_or_fish
            or has_dairy_or_lactose
        ):
            return False
        return True

    if dietary_preference == "eggetarian":
        # Eggetarian includes vegetarian foods + egg foods, but excludes meat/fish/poultry flesh
        if has_meat_or_fish:
            return False
        if (
            food.is_vegetarian
            or has_egg
            or "eggetarian_suitable" in all_tags
            or "eggetarian" in all_tags
        ):
            return True
        return False

    if dietary_preference == "non_vegetarian":
        # Non-vegetarian members can view vegetarian, eggetarian, and non-vegetarian foods
        return True

    return True


def get_condition_food_recommendations(
    db: Session,
    condition_code: str,
    household_token: Optional[str] = None,
    member_id: Optional[int] = None,
    dietary_preference: Optional[str] = None,
) -> ConditionFoodRecommendationResponse:
    """
    7-step condition-aware food recommendation pipeline:
    1. Verify that the health condition exists.
    2. Select only active, reviewed ConditionFoodMapping records for that condition.
    3. Verify that each mapped food has the required nutritional information or mark missing nutrients honestly.
    4. Determine whether a household member or dietary preference has been supplied.
    5. Apply dietary preference filtering if supplied (never assume a preference when none is supplied).
    6. Apply allergy and intolerance warnings/filters if supplied.
    7. Return structured explanations, tags, nutrient highlights, and source references.
    """
    # Step 1: Verify that the health condition exists
    cond = (
        db.query(HealthCondition)
        .options(joinedload(HealthCondition.source))
        .filter(HealthCondition.code == condition_code)
        .first()
    )
    if not cond:
        raise ValueError(f"Condition '{condition_code}' not found")

    # Step 2: Select only active, reviewed ConditionFoodMapping records for that condition
    mappings = (
        db.query(ConditionFoodMapping)
        .options(
            joinedload(ConditionFoodMapping.source),
            joinedload(ConditionFoodMapping.food).joinedload(FoodItem.category),
            joinedload(ConditionFoodMapping.food).joinedload(FoodItem.source),
            joinedload(ConditionFoodMapping.food).joinedload(FoodItem.aliases),
            joinedload(ConditionFoodMapping.food).joinedload(FoodItem.nutrient_values),
            joinedload(ConditionFoodMapping.food)
            .joinedload(FoodItem.structured_tags)
            .joinedload(FoodItemTag.tag),
        )
        .filter(
            ConditionFoodMapping.condition_id == cond.id,
            ConditionFoodMapping.is_active.is_(True),
            ConditionFoodMapping.review_status == "reviewed",
        )
        .order_by(ConditionFoodMapping.id.asc())
        .all()
    )

    # Step 4: Determine whether a household member or dietary preference has been supplied
    resolved_member: Optional[HouseholdMember] = None
    if member_id is not None:
        query = db.query(HouseholdMember).filter(HouseholdMember.id == member_id)
        if household_token:
            hh = db.query(Household).filter(Household.household_token == household_token).first()
            if hh:
                query = query.filter(HouseholdMember.household_id == hh.id)
        resolved_member = query.first()
    elif household_token:
        hh = (
            db.query(Household)
            .options(joinedload(Household.members))
            .filter(Household.household_token == household_token)
            .first()
        )
        if hh and hh.default_member_id:
            resolved_member = next(
                (m for m in hh.members if m.id == hh.default_member_id), None
            )

    effective_pref = _normalize_dietary_preference(
        dietary_preference
        if dietary_preference is not None
        else (resolved_member.dietary_preference if resolved_member else None)
    )
    member_allergies = [
        a.strip().lower() for a in (resolved_member.allergies if resolved_member else []) if a
    ]
    member_intolerances = [
        i.strip().lower() for i in (resolved_member.intolerances if resolved_member else []) if i
    ]
    is_personalised = bool(resolved_member is not None or effective_pref is not None)

    if resolved_member:
        personalisation_note = (
            f"Filtered for {resolved_member.display_name} "
            f"({effective_pref or 'unspecified dietary preference'})."
        )
    elif effective_pref:
        personalisation_note = f"Filtered for '{effective_pref}' dietary preference."
    else:
        personalisation_note = (
            "Showing all reviewed condition-mapped foods across dietary preferences. "
            "Select a household member or dietary filter to personalise."
        )

    member_context = ConditionMemberContextOut(
        member_id=resolved_member.id if resolved_member else None,
        member_name=resolved_member.display_name if resolved_member else None,
        dietary_preference=effective_pref,
        allergies=member_allergies,
        intolerances=member_intolerances,
        personalised=is_personalised,
        personalisation_note=personalisation_note,
    )

    total_defs = db.query(NutrientDefinition).count() or 20
    highlight_codes = list(
        dict.fromkeys(
            ["energy_kcal", "protein_g", "carbs_g", "fibre_g", "sodium_mg"]
            + (cond.relevant_nutrients or [])
        )
    )

    items_out: list[ConditionFoodRecommendationItem] = []

    for idx, mapping in enumerate(mappings, start=1):
        food = mapping.food
        if not food:
            continue

        structured_tag_codes = [
            tl.tag.code for tl in (food.structured_tags or []) if tl.tag and tl.tag.code
        ]
        mapping_tags = list(mapping.relevant_tags or [])
        combined_tags = list(
            dict.fromkeys(mapping_tags + structured_tag_codes + list(food.dietary_tags or []))
        )

        # Step 5: Apply dietary preference filtering if supplied
        if not _is_food_compatible_with_preference(food, combined_tags, effective_pref):
            continue

        # Step 3: Verify nutritional information or mark missing relevant nutrients honestly (never replace NULL with 0)
        nv_map: dict[str, Optional[float]] = {
            nv.nutrient_code: nv.value for nv in (food.nutrient_values or [])
        }
        nutrition_highlights: dict[str, Optional[float]] = {
            code: nv_map.get(code, None) for code in highlight_codes
        }
        missing_relevant = [
            code for code in (cond.relevant_nutrients or []) if nv_map.get(code, None) is None
        ]

        normalized_rel_type = RELEVANCE_TYPE_NORMALIZATION.get(
            mapping.relevance_category, "relevant_food_to_explore"
        )
        if (
            missing_relevant
            and normalized_rel_type == "relevant_food_to_explore"
            and len(missing_relevant) >= len(cond.relevant_nutrients or [1])
        ):
            normalized_rel_type = "insufficient_information"

        relevance_label = RELEVANCE_LABELS.get(
            normalized_rel_type, mapping.relevance_display_label or "Relevant food to explore"
        )
        priority_order = RELEVANCE_PRIORITY_ORDER.get(normalized_rel_type, 1) * 100 + idx

        # Step 6: Apply allergy and intolerance warnings & incomplete ingredient warnings
        food_allergens = [a.lower() for a in (food.allergen_tags or [])]
        food_intolerances = [i.lower() for i in (food.intolerance_tags or [])]

        allergen_warnings: list[str] = []
        for ma in member_allergies:
            if ma in food_allergens or any(ma in fa or fa in ma for fa in food_allergens):
                allergen_warnings.append(
                    f"Allergen alert for {resolved_member.display_name if resolved_member else 'member'}: "
                    f"contains declared or reference allergen '{ma}'."
                )

        intolerance_warnings: list[str] = []
        for mi in member_intolerances:
            if mi in food_intolerances or any(mi in fi or fi in mi for fi in food_intolerances):
                intolerance_warnings.append(
                    f"Intolerance note for {resolved_member.display_name if resolved_member else 'member'}: "
                    f"associated with '{mi}' intolerance."
                )

        incomplete_ingredient_warning: Optional[str] = None
        if not food.allergen_declaration_complete or (
            food.is_packaged and not food.ingredients_text
        ):
            incomplete_ingredient_warning = (
                "Ingredient or allergen declaration is incomplete in reference data; "
                "cannot verify absence of allergens. Inspect physical product packaging."
            )

        summary = serialize_food_summary(food, total_defs)
        has_egg = (
            "egg" in food_allergens
            or "contains_egg" in combined_tags
            or "eggetarian" in combined_tags
        )
        has_meat_fish = (
            "fish" in food_allergens
            or "shellfish" in food_allergens
            or "non_vegetarian" in combined_tags
        )
        is_eggetarian_compat = bool(
            (food.is_vegetarian or has_egg) and not has_meat_fish
        )

        # Step 7: Build structured item with explanation, tags, highlights, and source
        items_out.append(
            ConditionFoodRecommendationItem(
                id=summary.id,
                slug=summary.slug,
                ifct_code=summary.ifct_code,
                name_en=summary.name_en,
                image_url=summary.image_url,
                category=summary.category_name,
                category_slug=summary.category_slug,
                category_name=summary.category_name,
                is_packaged=summary.is_packaged,
                brand=summary.brand,
                barcode=summary.barcode,
                default_basis=summary.default_basis,
                standard_serving_name=summary.standard_serving_name,
                standard_serving_grams=summary.standard_serving_grams,
                is_vegetarian=summary.is_vegetarian,
                is_vegan=summary.is_vegan,
                aliases=summary.aliases,
                key_nutrients=summary.key_nutrients,
                unavailable_nutrients=summary.unavailable_nutrients,
                completeness_pct=summary.completeness_pct,
                confidence_level=summary.confidence_level,
                source_name=summary.source_name,
                source_organization=summary.source_organization,
                source_url=summary.source_url,
                publication_year=summary.publication_year,
                relevance_type=normalized_rel_type,
                relevance_label=relevance_label,
                reason=mapping.explanation,
                caution_notes=mapping.applicability_limitations,
                portion_guidance=mapping.serving_consideration,
                evidence_type=mapping.relevant_nutrient_or_characteristic,
                review_status=mapping.review_status,
                priority_order=priority_order,
                relevant_tags=combined_tags,
                nutrition_highlights=nutrition_highlights,
                missing_relevant_nutrients=missing_relevant,
                dietary_compatibility=DietaryCompatibilityOut(
                    is_vegetarian=food.is_vegetarian,
                    is_vegan=food.is_vegan,
                    is_eggetarian_compatible=is_eggetarian_compat,
                    dietary_tags=combined_tags,
                ),
                allergen_flags=food.allergen_tags or [],
                intolerance_flags=food.intolerance_tags or [],
                allergen_warnings=allergen_warnings,
                intolerance_warnings=intolerance_warnings,
                incomplete_ingredient_warning=incomplete_ingredient_warning,
                source=ConditionFoodSourceOut(
                    name=mapping.source.name,
                    organization=mapping.source.organization,
                    year=mapping.source.publication_year,
                    url=mapping.source.url,
                    section=mapping.source_section,
                ),
            )
        )

    items_out.sort(key=lambda x: x.priority_order)
    empty_msg = EMPTY_RECOMMENDATIONS_MESSAGE if len(items_out) == 0 else None

    return ConditionFoodRecommendationResponse(
        condition=ConditionBriefOut(
            code=cond.code,
            name=cond.name,
            condition_group_code=cond.condition_group_code,
            condition_group_name=cond.condition_group_name,
            is_short_term_illness=cond.is_short_term_illness,
        ),
        member_context=member_context,
        total_reviewed_foods=len(items_out),
        empty_state_message=empty_msg,
        medical_disclaimer=CONDITION_FOOD_MEDICAL_DISCLAIMER,
        foods=items_out,
    )
