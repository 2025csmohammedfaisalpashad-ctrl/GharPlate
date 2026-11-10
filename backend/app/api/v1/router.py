from datetime import datetime, UTC
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.api.v1.auth_router import AUTHENTICATED_PRIVACY_NOTICE, auth_router
from app.api.v1.ecosystem_router import ecosystem_router
from app.core.config import settings
from app.core.security import (
    ensure_user_owned_household,
    get_current_user,
    verify_household_ownership,
)
from app.db.session import get_db
from app.integrations.normalizer import check_allergen_consistency
from app.integrations.provider_registry import (
    ensure_baseline_local_provenance,
    evaluate_local_product_completeness,
    search_multi_source_external_products,
)
from app.models.entities import (
    AssistantConversation,
    AssistantMessage,
    ConditionConflictRule,
    DataSource,
    FoodCategory,
    FoodItem,
    FoodNutrientValue,
    HealthCondition,
    HouseholdMember,
    NutritionRule,
    Recipe,
    UserAccount,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import (
    AllergenConsistencyOut,
    AssistantChatMessage,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantConversationCreateRequest,
    AssistantConversationDetailOut,
    AssistantConversationSummaryOut,
    AssistantConversationUpdateRequest,
    AssistantMessageOut,
    AssistantPageContext,
    AssistantSourceReference,
    AssistantStatusResponse,
    AssistantToolExecutionTrace,
    AssistantVoiceStatusResponse,
    AssistantVoiceTranscribeRequest,
    AssistantVoiceTranscribeResponse,
    BarcodeLookupResponse,
    ConditionConflictOut,
    ConditionFoodRecommendationResponse,
    DataSourceOut,
    DishRecognitionResponse,
    ExternalProductCandidateOut,
    ExternalProductSearchResponse,
    FoodCategoryOut,
    FoodDetailOut,
    FoodSearchResponse,
    GuidanceEvaluationRequest,
    GuidanceEvaluationResponse,
    HealthConditionDetailOut,
    HealthConditionSummaryOut,
    HouseholdCreateRequest,
    HouseholdMemberCreate,
    HouseholdMemberOut,
    HouseholdOut,
    ManualProductCreateRequest,
    MealSuggestionRequest,
    MealSuggestionResponse,
    NutritionRuleOut,
    OCRScanResponse,
    OCRTextParseRequest,
    ProductComparisonRequest,
    ProductComparisonResponse,
    ProductDataConflictOut,
    ProductEnrichRequest,
    ProductFieldProvenanceOut,
    ProductProvenanceResponse,
    ProviderAttemptOut,
    RecipeCreateRequest,
    RecipeDetailOut,
)
from app.services.comparison_meals_service import (
    compare_packaged_products,
    generate_meal_suggestions,
)
from app.services.condition_food_service import get_condition_food_recommendations
from app.services.food_service import (
    search_foods,
    serialize_food_detail,
)
from app.services.ocr_barcode_service import (
    create_user_confirmed_product,
    lookup_barcode,
    parse_nutrition_label_text,
    process_uploaded_label_image,
    recognize_indian_dish_from_image,
)
from app.services.ollama_assistant_service import (
    chat_with_gharplate_assistant,
    discover_ollama_models,
    evaluate_local_ollama_models,
    get_ollama_assistant_status,
    get_voice_assistant_status,
    transcribe_voice_input,
)
from app.services.recipe_service import create_or_update_recipe, serialize_recipe_detail

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(ecosystem_router)

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[UserAccount, Depends(get_current_user)]


# ==========================================
# 1. HEALTH & SYSTEM STATS
# ==========================================
@api_router.get("/health", tags=["System"])
def health_check(db: DbSession):
    food_count = db.query(FoodItem).count()
    condition_count = db.query(HealthCondition).count()
    source_count = db.query(DataSource).count()
    return {
        "status": "healthy",
        "service": "GharPlate API",
        "version": "2.0.0",
        "database_connected": True,
        "counts": {
            "foods": food_count,
            "conditions": condition_count,
            "sources": source_count,
        },
        "medical_disclaimer": "Educational nutrition platform only; not a diagnostic or medical treatment service.",
    }


@api_router.get("/sources", response_model=list[DataSourceOut], tags=["Sources"])
def list_data_sources(db: DbSession, _current_user: CurrentUser):
    sources = db.query(DataSource).order_by(DataSource.publication_year.desc(), DataSource.id.asc()).all()
    return [DataSourceOut.model_validate(s) for s in sources]


# ==========================================
# 2. FOOD INTELLIGENCE & ADVANCED SEARCH
# ==========================================
@api_router.get("/foods/categories", response_model=list[FoodCategoryOut], tags=["Foods"])
def list_food_categories(db: DbSession, _current_user: CurrentUser):
    cats = db.query(FoodCategory).order_by(FoodCategory.display_order.asc()).all()
    return [FoodCategoryOut.model_validate(c) for c in cats]


@api_router.get("/foods", response_model=FoodSearchResponse, tags=["Foods"])
def search_food_items(
    db: DbSession,
    _current_user: CurrentUser,
    q: Annotated[str | None, Query(description="Search by English, Hindi, or Kannada name/alias")] = None,
    category: Annotated[str | None, Query(description="Filter by category slug")] = None,
    is_packaged: Annotated[bool | None, Query(description="Filter packaged vs whole/cooked foods")] = None,
    vegetarian_only: Annotated[bool, Query(description="Filter vegetarian foods only")] = False,
    nutrient_filter: Annotated[
        str | None,
        Query(description="Optional filter: high_protein, high_fibre, high_calcium, high_iron, low_sodium"),
    ] = None,
    sort_by: Annotated[
        str,
        Query(description="Sort order: relevance, name_asc, protein_desc, fibre_desc, energy_asc"),
    ] = "relevance",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
):
    return search_foods(
        db=db,
        q=q,
        category_slug=category,
        is_packaged=is_packaged,
        vegetarian_only=vegetarian_only,
        nutrient_filter=nutrient_filter,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
    )


@api_router.get("/foods/{slug}", response_model=FoodDetailOut, tags=["Foods"])
def get_food_detail(slug: str, db: DbSession, _current_user: CurrentUser):
    food = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.aliases),
            joinedload(FoodItem.nutrient_values).joinedload(FoodNutrientValue.source),
            joinedload(FoodItem.servings),
            joinedload(FoodItem.field_provenance),
            joinedload(FoodItem.data_conflicts),
        )
        .filter(FoodItem.slug == slug)
        .first()
    )
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Food '{slug}' not found")
    if food.is_packaged:
        ensure_baseline_local_provenance(db, food)
    return serialize_food_detail(db, food)


# ==========================================
# 3. CONDITIONS & DETERMINISTIC GUIDANCE
# ==========================================
@api_router.get("/conditions", response_model=list[HealthConditionSummaryOut], tags=["Conditions & Guidance"])
def list_health_conditions(db: DbSession, _current_user: CurrentUser):
    conds = (
        db.query(HealthCondition)
        .options(joinedload(HealthCondition.source))
        .order_by(HealthCondition.condition_group_code.asc(), HealthCondition.id.asc())
        .all()
    )
    return [
        HealthConditionSummaryOut(
            id=c.id,
            code=c.code,
            name=c.name,
            condition_group_code=c.condition_group_code,
            condition_group_name=c.condition_group_name,
            is_short_term_illness=c.is_short_term_illness,
            is_special_life_stage=c.is_special_life_stage,
            applicable_age_groups=c.applicable_age_groups,
            nutritional_meaning=c.nutritional_meaning,
            relevant_nutrients=c.relevant_nutrients,
            source_name=c.source.name,
            source_url=c.source.url,
            publication_year=c.publication_year,
        )
        for c in conds
    ]


@api_router.get("/conditions/conflicts", response_model=list[ConditionConflictOut], tags=["Conditions & Guidance"])
def list_condition_conflicts(db: DbSession, _current_user: CurrentUser):
    conflicts = (
        db.query(ConditionConflictRule)
        .options(joinedload(ConditionConflictRule.source))
        .all()
    )
    return [
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
        for cr in conflicts
    ]


@api_router.get("/conditions/{code}", response_model=HealthConditionDetailOut, tags=["Conditions & Guidance"])
def get_health_condition_detail(code: str, db: DbSession, _current_user: CurrentUser):
    cond = (
        db.query(HealthCondition)
        .options(
            joinedload(HealthCondition.source),
            joinedload(HealthCondition.rules).joinedload(NutritionRule.source),
        )
        .filter(HealthCondition.code == code)
        .first()
    )
    if not cond:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Condition '{code}' not found")

    rules_out = [
        NutritionRuleOut(
            rule_code=r.rule_code,
            nutrient_code=r.nutrient_code,
            food_category_slug=r.food_category_slug,
            comparison_operator=r.comparison_operator,
            threshold_low=r.threshold_low,
            threshold_high=r.threshold_high,
            evaluation_basis=r.evaluation_basis,
            educational_category=r.educational_category,
            relevance_level=r.relevance_level,
            explanation=r.explanation,
            applicability_limitations=r.applicability_limitations,
            evidence_status=r.evidence_status,
            source_section=r.source_section,
            publication_year=r.publication_year,
            review_status=r.review_status,
            source_name=r.source.name,
            source_url=r.source.url,
        )
        for r in cond.rules
    ]

    return HealthConditionDetailOut(
        id=cond.id,
        code=cond.code,
        name=cond.name,
        condition_group_code=cond.condition_group_code,
        condition_group_name=cond.condition_group_name,
        is_short_term_illness=cond.is_short_term_illness,
        is_special_life_stage=cond.is_special_life_stage,
        applicable_age_groups=cond.applicable_age_groups,
        nutritional_meaning=cond.nutritional_meaning,
        relevant_nutrients=cond.relevant_nutrients,
        relevant_food_groups=cond.relevant_food_groups,
        evidence_dietary_patterns=cond.evidence_dietary_patterns,
        portion_considerations=cond.portion_considerations,
        individual_differences=cond.individual_differences,
        professional_advice_circumstances=cond.professional_advice_circumstances,
        red_flag_warning=cond.red_flag_warning,
        what_evidence_does_not_establish=cond.what_evidence_does_not_establish,
        review_status=cond.review_status,
        source_name=cond.source.name,
        source_url=cond.source.url,
        publication_year=cond.publication_year,
        source=DataSourceOut.model_validate(cond.source),
        rules=rules_out,
    )


@api_router.get(
    "/conditions/{code}/foods",
    response_model=ConditionFoodRecommendationResponse,
    tags=["Conditions & Guidance"],
)
def explore_foods_by_condition(
    code: str,
    db: DbSession,
    current_user: CurrentUser,
    household_token: Annotated[
        str | None,
        Query(description="Optional household token (must belong to the authenticated user)"),
    ] = None,
    member_id: Annotated[
        int | None,
        Query(description="Optional household member ID to filter by dietary preference and flag allergens"),
    ] = None,
    dietary_preference: Annotated[
        str | None,
        Query(description="Optional explicit dietary preference override (vegetarian, vegan, eggetarian, non_vegetarian, jain)"),
    ] = None,
):
    owned_hh = verify_household_ownership(db, current_user, requested_token=household_token)
    if member_id is not None:
        member_belongs = any(m.id == member_id for m in (owned_hh.members or []))
        if not member_belongs:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Requested family member does not belong to your household.",
            )

    try:
        return get_condition_food_recommendations(
            db=db,
            condition_code=code,
            household_token=owned_hh.household_token if (household_token or member_id is not None) else None,
            member_id=member_id,
            dietary_preference=dietary_preference,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@api_router.post("/guidance/evaluate", response_model=GuidanceEvaluationResponse, tags=["Conditions & Guidance"])
def evaluate_guidance_endpoint(
    req: GuidanceEvaluationRequest, db: DbSession, _current_user: CurrentUser
):
    try:
        return evaluate_food_guidance(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


# ==========================================
# 4. AUTHENTICATED HOUSEHOLD & FAMILY PROFILES
# ==========================================
@api_router.post("/households", response_model=HouseholdOut, tags=["Households"])
def create_or_get_household(
    req: HouseholdCreateRequest, db: DbSession, current_user: CurrentUser
):
    """
    Returns or updates the authenticated user's owned household.
    Never allows claiming or accessing another user's household token.
    """
    hh = verify_household_ownership(db, current_user, requested_token=req.household_token)
    if req.name and req.name.strip() and req.name.strip() != "My Household":
        hh.name = req.name.strip()[:120]
        db.commit()
        db.refresh(hh)
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=AUTHENTICATED_PRIVACY_NOTICE,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in hh.members],
    )


@api_router.get("/households/{token}", response_model=HouseholdOut, tags=["Households"])
def get_household(token: str, db: DbSession, current_user: CurrentUser):
    hh = verify_household_ownership(db, current_user, requested_token=token)
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=AUTHENTICATED_PRIVACY_NOTICE,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in hh.members],
    )


@api_router.delete("/households/{token}", tags=["Households"])
def delete_household(token: str, db: DbSession, current_user: CurrentUser):
    hh = verify_household_ownership(db, current_user, requested_token=token)
    # Clear members and custom recipes inside the user's household and recreate a clean household
    db.delete(hh)
    db.commit()
    fresh_hh = ensure_user_owned_household(db, current_user)
    return {
        "deleted": True,
        "household_token": fresh_hh.household_token,
        "message": "Your household member profiles and saved recipes have been reset.",
    }


@api_router.post(
    "/households/{token}/members",
    response_model=HouseholdMemberOut,
    tags=["Households"],
)
def add_household_member(
    token: str, req: HouseholdMemberCreate, db: DbSession, current_user: CurrentUser
):
    hh = verify_household_ownership(db, current_user, requested_token=token)

    member = HouseholdMember(
        household_id=hh.id,
        display_name=req.display_name,
        age_group=req.age_group,
        dietary_preference=req.dietary_preference,
        primary_goal=req.primary_goal or "maintain_balanced_diet",
        selected_conditions=req.selected_conditions,
        allergies=req.allergies,
        intolerances=req.intolerances,
        dietary_restrictions=req.dietary_restrictions,
        food_preferences=req.food_preferences,
    )
    db.add(member)
    db.flush()
    if hh.default_member_id is None:
        hh.default_member_id = member.id
    db.commit()
    db.refresh(member)
    return HouseholdMemberOut.model_validate(member)


@api_router.put(
    "/households/{token}/members/{member_id}",
    response_model=HouseholdMemberOut,
    tags=["Households"],
)
def update_household_member(
    token: str,
    member_id: int,
    req: HouseholdMemberCreate,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = verify_household_ownership(db, current_user, requested_token=token)
    member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == hh.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in your household")

    member.display_name = req.display_name
    member.age_group = req.age_group
    member.dietary_preference = req.dietary_preference
    member.primary_goal = req.primary_goal or member.primary_goal or "maintain_balanced_diet"
    member.selected_conditions = req.selected_conditions
    member.allergies = req.allergies
    member.intolerances = req.intolerances
    member.dietary_restrictions = req.dietary_restrictions
    member.food_preferences = req.food_preferences
    db.commit()
    db.refresh(member)
    return HouseholdMemberOut.model_validate(member)


@api_router.post("/households/{token}/default-member/{member_id}", response_model=HouseholdOut, tags=["Households"])
def set_default_household_member(
    token: str, member_id: int, db: DbSession, current_user: CurrentUser
):
    hh = verify_household_ownership(db, current_user, requested_token=token)
    if not any(m.id == member_id for m in hh.members):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not in your household")
    hh.default_member_id = member_id
    db.commit()
    db.refresh(hh)
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=AUTHENTICATED_PRIVACY_NOTICE,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in hh.members],
    )


@api_router.delete("/households/{token}/members/{member_id}", tags=["Households"])
def delete_household_member(
    token: str, member_id: int, db: DbSession, current_user: CurrentUser
):
    hh = verify_household_ownership(db, current_user, requested_token=token)
    member = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.id == member_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in your household")
    db.delete(member)
    if hh.default_member_id == member_id:
        remaining = [m for m in hh.members if m.id != member_id]
        hh.default_member_id = remaining[0].id if remaining else None
    db.commit()
    return {"deleted": True, "member_id": member_id}


# ==========================================
# 5. RECIPE & MEAL NUTRITION CALCULATOR (SCOPED TO USER HOUSEHOLD)
# ==========================================
@api_router.post("/recipes/calculate", response_model=RecipeDetailOut, tags=["Recipes"])
def create_and_calculate_recipe(
    req: RecipeCreateRequest, db: DbSession, current_user: CurrentUser
):
    hh = verify_household_ownership(db, current_user, requested_token=req.household_token)
    try:
        return create_or_update_recipe(
            db,
            req,
            household_id=hh.id,
            household_token=hh.household_token,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.put("/recipes/{recipe_id}", response_model=RecipeDetailOut, tags=["Recipes"])
def update_existing_recipe(
    recipe_id: int, req: RecipeCreateRequest, db: DbSession, current_user: CurrentUser
):
    hh = verify_household_ownership(db, current_user, requested_token=req.household_token)
    try:
        return create_or_update_recipe(
            db,
            req,
            recipe_id=recipe_id,
            household_id=hh.id,
            household_token=hh.household_token,
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@api_router.get("/recipes", response_model=list[RecipeDetailOut], tags=["Recipes"])
def list_recipes(
    db: DbSession,
    current_user: CurrentUser,
    household_token: Annotated[str | None, Query()] = None,
):
    hh = verify_household_ownership(db, current_user, requested_token=household_token)
    query = (
        db.query(Recipe)
        .options(joinedload(Recipe.ingredients), joinedload(Recipe.steps))
        .filter((Recipe.household_id == hh.id) | (Recipe.is_system_template.is_(True)))
    )
    recipes = query.order_by(Recipe.id.desc()).all()
    return [serialize_recipe_detail(db, r) for r in recipes]


@api_router.get("/recipes/{recipe_id_or_slug}", response_model=RecipeDetailOut, tags=["Recipes"])
def get_recipe_by_id(
    recipe_id_or_slug: str,
    db: DbSession,
    current_user: CurrentUser,
    servings: Annotated[
        float | None,
        Query(gt=0, description="Optional target servings to dynamically scale ingredient quantities and nutrition"),
    ] = None,
):
    from app.services.recipe_intelligence_service import get_recipe_by_id_or_slug

    hh = ensure_user_owned_household(db, current_user)
    raw = str(recipe_id_or_slug).strip()
    if raw.isdigit():
        recipe = (
            db.query(Recipe)
            .options(joinedload(Recipe.ingredients), joinedload(Recipe.steps))
            .filter(Recipe.id == int(raw))
            .first()
        )
        if not recipe:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
        if not recipe.is_system_template and recipe.household_id != hh.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not have permission to view another household's recipe.",
            )
    else:
        recipe = get_recipe_by_id_or_slug(db, raw, household_id=hh.id)
        if not recipe:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return serialize_recipe_detail(db, recipe, target_servings=servings)


@api_router.post("/recipes/{recipe_id_or_slug}/enrich", response_model=RecipeDetailOut, tags=["Recipes"])
def enrich_recipe_steps_endpoint(
    recipe_id_or_slug: str,
    db: DbSession,
    current_user: CurrentUser,
    payload: dict | None = None,
):
    from app.services.recipe_intelligence_service import (
        enrich_recipe_steps,
        get_recipe_by_id_or_slug,
    )

    hh = ensure_user_owned_household(db, current_user)
    recipe = get_recipe_by_id_or_slug(db, recipe_id_or_slug, household_id=hh.id)
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return enrich_recipe_steps(db, recipe, payload or {})


@api_router.post("/recipes/{recipe_id_or_slug}/rate", response_model=RecipeDetailOut, tags=["Recipes"])
def rate_or_favourite_recipe_endpoint(
    recipe_id_or_slug: str,
    payload: dict,
    db: DbSession,
    current_user: CurrentUser,
):
    from app.services.recipe_intelligence_service import (
        get_recipe_by_id_or_slug,
        rate_or_favourite_recipe,
    )

    hh = ensure_user_owned_household(db, current_user)
    recipe = get_recipe_by_id_or_slug(db, recipe_id_or_slug, household_id=hh.id)
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    try:
        return rate_or_favourite_recipe(db, recipe, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.post("/recipes/{recipe_id_or_slug}/log-diary", tags=["Recipes"])
def log_recipe_to_diary_endpoint(
    recipe_id_or_slug: str,
    payload: dict,
    db: DbSession,
    current_user: CurrentUser,
):
    from app.api.v1.ecosystem_router import _resolve_owned_member
    from app.services.recipe_intelligence_service import (
        get_recipe_by_id_or_slug,
        log_recipe_to_diary_confirmed,
    )

    m_id = payload.get("member_id")
    hh, member = _resolve_owned_member(
        db, current_user, member_id=int(m_id) if m_id is not None else None
    )
    recipe = get_recipe_by_id_or_slug(db, recipe_id_or_slug, household_id=hh.id)
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    try:
        return log_recipe_to_diary_confirmed(db, hh, member, recipe, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.delete("/recipes/{recipe_id}", tags=["Recipes"])
def delete_recipe(recipe_id: int, db: DbSession, current_user: CurrentUser):
    hh = ensure_user_owned_household(db, current_user)
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    if recipe.is_system_template or recipe.household_id != hh.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You can only delete recipes belonging to your household.",
        )
    db.delete(recipe)
    db.commit()
    return {"deleted": True, "recipe_id": recipe_id}


# ==========================================
# 6. OCR SCANNER, BARCODE & MULTI-SOURCE PRODUCT INTELLIGENCE
# ==========================================
@api_router.post("/scan/ocr-text", response_model=OCRScanResponse, tags=["Scanner & OCR"])
def parse_ocr_label_text_endpoint(req: OCRTextParseRequest, _current_user: CurrentUser):
    return parse_nutrition_label_text(req.raw_label_text)


@api_router.post("/scan/ocr", response_model=OCRScanResponse, tags=["Scanner & OCR"])
@api_router.post("/scan/ocr-image", response_model=OCRScanResponse, tags=["Scanner & OCR"])
async def scan_nutrition_label_image(
    file: Annotated[UploadFile, File(...)],
    _current_user: CurrentUser,
    ingredients_file: Annotated[UploadFile | None, File()] = None,
    hint_text: Annotated[str | None, Form()] = None,
):
    raw_bytes = await file.read()
    ing_bytes = await ingredients_file.read() if ingredients_file is not None else None
    try:
        return process_uploaded_label_image(
            file_bytes=raw_bytes,
            content_type=file.content_type,
            hint_text=hint_text,
            ingredients_image_bytes=ing_bytes,
            ingredients_content_type=ingredients_file.content_type if ingredients_file else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        await file.close()
        if ingredients_file is not None:
            await ingredients_file.close()


@api_router.post("/scan/confirm-product", response_model=FoodDetailOut, tags=["Scanner & OCR"])
def confirm_and_save_product(
    req: ManualProductCreateRequest, db: DbSession, _current_user: CurrentUser
):
    try:
        return create_user_confirmed_product(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.get("/scan/barcode/{barcode}", response_model=BarcodeLookupResponse, tags=["Barcode Lookup"])
def get_product_by_barcode(
    barcode: str,
    db: DbSession,
    _current_user: CurrentUser,
    force_refresh: Annotated[bool, Query(description="Force fresh external provider lookup")] = False,
):
    return lookup_barcode(db, barcode, force_refresh=force_refresh)


@api_router.get("/products/search", response_model=ExternalProductSearchResponse, tags=["Product Intelligence"])
def search_products_multi_source(
    q: Annotated[str, Query(min_length=1, description="Product name or barcode query")],
    db: DbSession,
    _current_user: CurrentUser,
    brand: Annotated[str | None, Query(description="Optional brand filter")] = None,
    include_external: Annotated[bool, Query(description="Query Open Food Facts & USDA FDC")] = True,
):
    local_res = search_foods(db=db, q=q, page_size=8)
    cands_out: list[ExternalProductCandidateOut] = []
    attempts_out: list[ProviderAttemptOut] = []

    if include_external:
        ext_cands, ext_attempts = search_multi_source_external_products(
            db, query=q, brand=brand, page_size=5
        )
        cands_out = [
            ExternalProductCandidateOut(
                provider_code=c.provider_code,
                provider_name=c.provider_name,
                source_url=c.source_url,
                source_record_id=c.source_record_id,
                barcode=c.barcode,
                product_name=c.product_name,
                brand=c.brand,
                quantity=c.quantity,
                serving_size_label=c.serving_size_label,
                image_url=c.image_url,
                ingredients_text=c.ingredients_text,
                allergen_tags=c.allergen_tags,
                nutrients_per_100=c.nutrients_per_100,
                available_fields=c.available_fields,
                missing_fields=c.missing_fields,
                is_branded_packaged=c.is_branded_packaged,
                retrieved_at=c.retrieved_at,
                license_attribution=c.license_attribution,
            )
            for c in ext_cands
        ]
        attempts_out = [
            ProviderAttemptOut(
                provider_code=a.provider_code,
                provider_name=a.provider_name,
                status=a.status,
                http_status=a.http_status,
                message=a.message,
                from_cache=a.from_cache,
                retrieved_at=a.retrieved_at,
            )
            for a in ext_attempts
        ]

    return ExternalProductSearchResponse(
        query=q,
        brand=brand,
        local_matches=local_res.items,
        external_candidates=cands_out,
        provider_attempts=attempts_out,
    )


@api_router.post("/products/enrich", response_model=BarcodeLookupResponse, tags=["Product Intelligence"])
def enrich_product_endpoint(
    req: ProductEnrichRequest, db: DbSession, _current_user: CurrentUser
):
    target_barcode = req.barcode
    if not target_barcode and req.food_slug:
        food = db.query(FoodItem).filter(FoodItem.slug == req.food_slug).first()
        if not food:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product '{req.food_slug}' not found",
            )
        target_barcode = food.barcode
        if not target_barcode:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product '{req.food_slug}' does not have a barcode to query external databases.",
            )
    if not target_barcode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provide either 'barcode' or 'food_slug' to enrich a packaged product.",
        )
    return lookup_barcode(db, target_barcode, force_refresh=req.force_refresh)


@api_router.get(
    "/products/{slug}/provenance",
    response_model=ProductProvenanceResponse,
    tags=["Product Intelligence"],
)
def get_product_provenance_endpoint(slug: str, db: DbSession, _current_user: CurrentUser):
    food = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.source),
            joinedload(FoodItem.nutrient_values),
            joinedload(FoodItem.field_provenance),
            joinedload(FoodItem.data_conflicts),
        )
        .filter(FoodItem.slug == slug)
        .first()
    )
    if not food:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Product '{slug}' not found"
        )
    ensure_baseline_local_provenance(db, food)
    comp = evaluate_local_product_completeness(food)
    consistency = check_allergen_consistency(
        food.ingredients_text,
        food.allergen_tags,
        food.allergen_declaration_complete,
    )
    return ProductProvenanceResponse(
        food_slug=food.slug,
        food_name=food.name_en,
        barcode=food.barcode,
        completeness=comp,
        allergen_consistency=AllergenConsistencyOut(
            stored_allergen_tags=consistency.stored_allergen_tags,
            declared_allergens=consistency.declared_allergens,
            ingredient_inferred_allergens=consistency.ingredient_inferred_allergens,
            missing_from_stored_tags=consistency.missing_from_stored_tags,
            consistency_status=consistency.consistency_status,
            consistency_warnings=consistency.consistency_warnings,
            requires_manual_review=consistency.requires_manual_review,
        ),
        field_provenance=[
            ProductFieldProvenanceOut.model_validate(p)
            for p in (food.field_provenance or [])
        ],
        data_conflicts=[
            ProductDataConflictOut.model_validate(c)
            for c in (food.data_conflicts or [])
        ],
    )


@api_router.post("/scan/recognize-dish", response_model=DishRecognitionResponse, tags=["Dish Recognition"])
async def recognize_dish_endpoint(
    file: Annotated[UploadFile, File(...)],
    db: DbSession,
    _current_user: CurrentUser,
    user_hint: Annotated[str | None, Form()] = None,
):
    raw_bytes = await file.read()
    try:
        return recognize_indian_dish_from_image(
            db=db,
            file_bytes=raw_bytes,
            filename=file.filename,
            content_type=file.content_type,
            user_hint=user_hint,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        await file.close()


# ==========================================
# 7. PRODUCT COMPARISON & MEAL SUGGESTIONS
# ==========================================
@api_router.post("/products/compare", response_model=ProductComparisonResponse, tags=["Product Comparison"])
def compare_products_endpoint(
    req: ProductComparisonRequest, db: DbSession, _current_user: CurrentUser
):
    try:
        return compare_packaged_products(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.post("/meals/suggestions", response_model=MealSuggestionResponse, tags=["Meal Suggestions"])
def suggest_meals_endpoint(
    req: MealSuggestionRequest, db: DbSession, _current_user: CurrentUser
):
    return generate_meal_suggestions(db, req)


# ==========================================
# 8. LOCAL OLLAMA-POWERED GHARPLATE AI ASSISTANT & PERSISTENT CONVERSATIONS
# ==========================================
@api_router.get("/assistant/status", response_model=AssistantStatusResponse, tags=["AI Assistant"])
def assistant_status_endpoint(
    _current_user: CurrentUser,
    model: Annotated[str | None, Query()] = None,
):
    return get_ollama_assistant_status(requested_model=model)


@api_router.get("/assistant/models", tags=["AI Assistant"])
def assistant_models_endpoint(_current_user: CurrentUser):
    reachable, installed, err_msg = discover_ollama_models()
    return {
        "ollama_reachable": reachable,
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "installed_models": installed,
        "configured_model": settings.OLLAMA_MODEL or None,
        "error_message": err_msg,
    }


@api_router.get("/assistant/models/evaluate", tags=["AI Assistant"])
def evaluate_assistant_models_endpoint(db: DbSession, _current_user: CurrentUser):
    return evaluate_local_ollama_models(db)


@api_router.get(
    "/assistant/voice/status",
    response_model=AssistantVoiceStatusResponse,
    tags=["AI Assistant"],
)
def assistant_voice_status_endpoint(_current_user: CurrentUser):
    return get_voice_assistant_status()


@api_router.post(
    "/assistant/voice/transcribe",
    response_model=AssistantVoiceTranscribeResponse,
    tags=["AI Assistant"],
)
def assistant_voice_transcribe_endpoint(
    req: AssistantVoiceTranscribeRequest,
    _current_user: CurrentUser,
):
    return transcribe_voice_input(req)


def _build_message_preview(messages: list[AssistantMessage]) -> str | None:
    if not messages:
        return None
    ordered = sorted(messages, key=lambda m: (m.created_at, m.id))
    latest = ordered[-1]
    cleaned = " ".join((latest.content or "").replace("#", "").replace("*", "").split())
    if not cleaned:
        return None
    prefix = "You: " if latest.role == "user" else ""
    text = f"{prefix}{cleaned}"
    return text[:110] + ("…" if len(text) > 110 else "")


@api_router.get(
    "/assistant/conversations",
    response_model=list[AssistantConversationSummaryOut],
    tags=["AI Assistant"],
)
def list_assistant_conversations(
    db: DbSession,
    current_user: CurrentUser,
    q: Annotated[str | None, Query(description="Optional search filter for conversations")] = None,
):
    convs = (
        db.query(AssistantConversation)
        .options(joinedload(AssistantConversation.messages))
        .filter(AssistantConversation.user_id == current_user.id)
        .order_by(AssistantConversation.updated_at.desc(), AssistantConversation.id.desc())
        .all()
    )
    search_term = (q or "").strip().lower()
    summaries: list[AssistantConversationSummaryOut] = []
    for c in convs:
        msgs = c.messages or []
        preview = _build_message_preview(msgs)
        if search_term:
            title_match = search_term in (c.title or "").lower()
            msg_match = any(search_term in (m.content or "").lower() for m in msgs)
            if not (title_match or msg_match):
                continue
        summaries.append(
            AssistantConversationSummaryOut(
                id=c.id,
                title=c.title,
                created_at=c.created_at,
                updated_at=c.updated_at,
                message_count=len(msgs),
                last_message_preview=preview,
            )
        )
    return summaries


@api_router.post(
    "/assistant/conversations",
    response_model=AssistantConversationDetailOut,
    status_code=status.HTTP_201_CREATED,
    tags=["AI Assistant"],
)
def create_assistant_conversation(
    req: AssistantConversationCreateRequest,
    db: DbSession,
    current_user: CurrentUser,
):
    hh = ensure_user_owned_household(db, current_user)
    now = datetime.now(UTC)
    conv = AssistantConversation(
        user_id=current_user.id,
        household_id=hh.id,
        title=(req.title or "New Nutrition Conversation").strip()[:200],
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return AssistantConversationDetailOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=[],
    )


@api_router.patch(
    "/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationSummaryOut,
    tags=["AI Assistant"],
)
@api_router.put(
    "/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationSummaryOut,
    tags=["AI Assistant"],
)
def rename_assistant_conversation(
    conversation_id: int,
    req: AssistantConversationUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
):
    conv = (
        db.query(AssistantConversation)
        .options(joinedload(AssistantConversation.messages))
        .filter(AssistantConversation.id == conversation_id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot rename another account's conversation.",
        )
    cleaned_title = req.title.strip()[:200]
    if not cleaned_title:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conversation title cannot be empty.",
        )
    conv.title = cleaned_title
    conv.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(conv)
    msgs = conv.messages or []
    return AssistantConversationSummaryOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(msgs),
        last_message_preview=_build_message_preview(msgs),
    )


@api_router.get(
    "/assistant/conversations/{conversation_id}",
    response_model=AssistantConversationDetailOut,
    tags=["AI Assistant"],
)
def get_assistant_conversation(
    conversation_id: int, db: DbSession, current_user: CurrentUser
):
    conv = (
        db.query(AssistantConversation)
        .options(joinedload(AssistantConversation.messages))
        .filter(AssistantConversation.id == conversation_id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not have permission to view another account's conversation.",
        )

    ordered_messages = sorted(
        conv.messages or [], key=lambda m: (m.created_at, m.id)
    )
    messages_out = [
        AssistantMessageOut(
            id=m.id,
            conversation_id=m.conversation_id,
            role=m.role,
            content=m.content,
            mode_used=m.mode_used,
            model_used=m.model_used,
            ollama_connected=m.ollama_connected,
            tool_traces=[
                AssistantToolExecutionTrace(**t) for t in (m.tool_traces or [])
            ],
            sources=[AssistantSourceReference(**s) for s in (m.sources or [])],
            created_at=m.created_at,
        )
        for m in ordered_messages
    ]
    return AssistantConversationDetailOut(
        id=conv.id,
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        messages=messages_out,
    )


@api_router.delete("/assistant/conversations/{conversation_id}", tags=["AI Assistant"])
def delete_assistant_conversation(
    conversation_id: int, db: DbSession, current_user: CurrentUser
):
    conv = (
        db.query(AssistantConversation)
        .filter(AssistantConversation.id == conversation_id)
        .first()
    )
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found."
        )
    if conv.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You cannot delete another account's conversation.",
        )
    db.delete(conv)
    db.commit()
    return {"deleted": True, "conversation_id": conversation_id}


@api_router.post("/assistant/chat", response_model=AssistantChatResponse, tags=["AI Assistant"])
def assistant_chat_endpoint(
    req: AssistantChatRequest, db: DbSession, current_user: CurrentUser
):
    owned_hh = ensure_user_owned_household(db, current_user)

    # Verify any context household_token or member_id belongs to current_user
    if req.context:
        if (
            req.context.household_token
            and req.context.household_token != owned_hh.household_token
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Context household token does not belong to your account.",
            )
        if req.context.member_id is not None:
            if not any(m.id == req.context.member_id for m in (owned_hh.members or [])):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Access denied: Context member does not belong to your household.",
                )
        req.context.household_token = owned_hh.household_token
    else:
        req.context = AssistantPageContext(
            household_token=owned_hh.household_token,
            member_id=owned_hh.default_member_id,
        )

    derived_title = req.message.strip().splitlines()[0][:80] or "Nutrition Conversation"

    # Resolve or create the user's persistent conversation
    conv: AssistantConversation | None = None
    if req.conversation_id is not None:
        conv = (
            db.query(AssistantConversation)
            .options(joinedload(AssistantConversation.messages))
            .filter(AssistantConversation.id == req.conversation_id)
            .first()
        )
        if not conv:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Conversation not found.",
            )
        if conv.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You cannot access or append to another account's conversation.",
            )
        if not (conv.messages or []) and conv.title in (
            "New Nutrition Conversation",
            "New Chat",
            "Nutrition Conversation",
        ):
            conv.title = derived_title
    else:
        conv = AssistantConversation(
            user_id=current_user.id,
            household_id=owned_hh.id,
            title=derived_title,
        )
        db.add(conv)
        db.flush()

    # Populate history strictly from this conversation's own stored messages
    ordered_existing = sorted(
        conv.messages or [], key=lambda m: (m.created_at, m.id)
    )
    req.history = [
        AssistantChatMessage(role=m.role, content=m.content)
        for m in ordered_existing[-8:]
    ]

    # Execute the GharPlate AI Assistant tool & LLM pipeline
    chat_resp = chat_with_gharplate_assistant(db, req)

    now = datetime.now(UTC)
    user_msg = AssistantMessage(
        conversation_id=conv.id,
        user_id=current_user.id,
        role="user",
        content=req.message,
        created_at=now,
    )
    ai_msg = AssistantMessage(
        conversation_id=conv.id,
        user_id=current_user.id,
        role="assistant",
        content=chat_resp.reply,
        mode_used=chat_resp.mode_used,
        model_used=chat_resp.model_used,
        ollama_connected=chat_resp.ollama_connected,
        tool_traces=[t.model_dump() for t in chat_resp.tool_traces],
        sources=[s.model_dump() for s in chat_resp.sources],
        created_at=now,
    )
    conv.updated_at = now
    db.add(user_msg)
    db.add(ai_msg)
    db.commit()

    chat_resp.conversation_id = conv.id
    chat_resp.conversation_title = conv.title
    return chat_resp
