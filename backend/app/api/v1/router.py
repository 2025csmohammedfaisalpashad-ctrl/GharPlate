import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.db.session import get_db
from app.integrations.normalizer import check_allergen_consistency
from app.integrations.provider_registry import (
    ensure_baseline_local_provenance,
    evaluate_local_product_completeness,
    search_multi_source_external_products,
)
from app.models.entities import (
    ConditionConflictRule,
    DataSource,
    FoodCategory,
    FoodItem,
    FoodNutrientValue,
    HealthCondition,
    Household,
    HouseholdMember,
    NutritionRule,
    Recipe,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import (
    AllergenConsistencyOut,
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantStatusResponse,
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
    get_ollama_assistant_status,
)
from app.services.recipe_service import create_or_update_recipe, serialize_recipe_detail

api_router = APIRouter()

PRIVACY_NOTICE_TEXT = (
    "Convenience Browser Identifier Only: Your household token is a randomly generated UUID stored locally in your browser. "
    "It is NOT strong authentication or identity verification. Uploaded food or label images are processed strictly in memory and never stored without explicit consent."
)


# ==========================================
# 1. HEALTH & SYSTEM STATS
# ==========================================
@api_router.get("/health", tags=["System"])
def health_check(db: Session = Depends(get_db)):
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


@api_router.get("/sources", response_model=List[DataSourceOut], tags=["Sources"])
def list_data_sources(db: Session = Depends(get_db)):
    sources = db.query(DataSource).order_by(DataSource.publication_year.desc(), DataSource.id.asc()).all()
    return [DataSourceOut.model_validate(s) for s in sources]


# ==========================================
# 2. FOOD INTELLIGENCE & ADVANCED SEARCH
# ==========================================
@api_router.get("/foods/categories", response_model=List[FoodCategoryOut], tags=["Foods"])
def list_food_categories(db: Session = Depends(get_db)):
    cats = db.query(FoodCategory).order_by(FoodCategory.display_order.asc()).all()
    return [FoodCategoryOut.model_validate(c) for c in cats]


@api_router.get("/foods", response_model=FoodSearchResponse, tags=["Foods"])
def search_food_items(
    q: Optional[str] = Query(default=None, description="Search by English, Hindi, or Kannada name/alias"),
    category: Optional[str] = Query(default=None, description="Filter by category slug"),
    is_packaged: Optional[bool] = Query(default=None, description="Filter packaged vs whole/cooked foods"),
    vegetarian_only: bool = Query(default=False, description="Filter vegetarian foods only"),
    nutrient_filter: Optional[str] = Query(
        default=None,
        description="Optional filter: high_protein, high_fibre, high_calcium, high_iron, low_sodium",
    ),
    sort_by: str = Query(
        default="relevance",
        description="Sort order: relevance, name_asc, protein_desc, fibre_desc, energy_asc",
    ),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
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
def get_food_detail(slug: str, db: Session = Depends(get_db)):
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
@api_router.get("/conditions", response_model=List[HealthConditionSummaryOut], tags=["Conditions & Guidance"])
def list_health_conditions(db: Session = Depends(get_db)):
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


@api_router.get("/conditions/conflicts", response_model=List[ConditionConflictOut], tags=["Conditions & Guidance"])
def list_condition_conflicts(db: Session = Depends(get_db)):
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
def get_health_condition_detail(code: str, db: Session = Depends(get_db)):
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
    household_token: Optional[str] = Query(
        default=None,
        description="Optional household convenience token for member context resolution",
    ),
    member_id: Optional[int] = Query(
        default=None,
        description="Optional household member ID to filter by dietary preference and flag allergens",
    ),
    dietary_preference: Optional[str] = Query(
        default=None,
        description="Optional explicit dietary preference override (vegetarian, vegan, eggetarian, non_vegetarian, jain)",
    ),
    db: Session = Depends(get_db),
):
    try:
        return get_condition_food_recommendations(
            db=db,
            condition_code=code,
            household_token=household_token,
            member_id=member_id,
            dietary_preference=dietary_preference,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@api_router.post("/guidance/evaluate", response_model=GuidanceEvaluationResponse, tags=["Conditions & Guidance"])
def evaluate_guidance_endpoint(
    req: GuidanceEvaluationRequest, db: Session = Depends(get_db)
):
    try:
        return evaluate_food_guidance(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


# ==========================================
# 4. HOUSEHOLD & FAMILY PROFILES (NO LOGIN)
# ==========================================
@api_router.post("/households", response_model=HouseholdOut, tags=["Households"])
def create_or_get_household(
    req: HouseholdCreateRequest, db: Session = Depends(get_db)
):
    token = req.household_token or f"hh_{uuid.uuid4().hex}"
    hh = (
        db.query(Household)
        .options(joinedload(Household.members))
        .filter(Household.household_token == token)
        .first()
    )
    if not hh:
        hh = Household(household_token=token, name=req.name)
        db.add(hh)
        db.commit()
        db.refresh(hh)
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=PRIVACY_NOTICE_TEXT,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in hh.members],
    )


@api_router.get("/households/{token}", response_model=HouseholdOut, tags=["Households"])
def get_household(token: str, db: Session = Depends(get_db)):
    hh = (
        db.query(Household)
        .options(joinedload(Household.members))
        .filter(Household.household_token == token)
        .first()
    )
    if not hh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=PRIVACY_NOTICE_TEXT,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in hh.members],
    )


@api_router.delete("/households/{token}", tags=["Households"])
def delete_household(token: str, db: Session = Depends(get_db)):
    hh = db.query(Household).filter(Household.household_token == token).first()
    if hh:
        db.delete(hh)
        db.commit()
    return {
        "deleted": True,
        "household_token": token,
        "message": "All household profile and recipe records associated with this convenience token have been permanently removed.",
    }


@api_router.post(
    "/households/{token}/members",
    response_model=HouseholdMemberOut,
    tags=["Households"],
)
def add_household_member(
    token: str, req: HouseholdMemberCreate, db: Session = Depends(get_db)
):
    hh = db.query(Household).filter(Household.household_token == token).first()
    if not hh:
        hh = Household(household_token=token, name="My Household")
        db.add(hh)
        db.flush()

    member = HouseholdMember(
        household_id=hh.id,
        display_name=req.display_name,
        age_group=req.age_group,
        dietary_preference=req.dietary_preference,
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
    db: Session = Depends(get_db),
):
    hh = db.query(Household).filter(Household.household_token == token).first()
    if not hh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    member = (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.id == member_id,
            HouseholdMember.household_id == hh.id,
        )
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    member.display_name = req.display_name
    member.age_group = req.age_group
    member.dietary_preference = req.dietary_preference
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
    token: str, member_id: int, db: Session = Depends(get_db)
):
    hh = (
        db.query(Household)
        .options(joinedload(Household.members))
        .filter(Household.household_token == token)
        .first()
    )
    if not hh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    if not any(m.id == member_id for m in hh.members):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not in household")
    hh.default_member_id = member_id
    db.commit()
    db.refresh(hh)
    return HouseholdOut(
        id=hh.id,
        household_token=hh.household_token,
        name=hh.name,
        default_member_id=hh.default_member_id,
        privacy_notice=PRIVACY_NOTICE_TEXT,
        created_at=hh.created_at,
        members=[HouseholdMemberOut.model_validate(m) for m in hh.members],
    )


@api_router.delete("/households/{token}/members/{member_id}", tags=["Households"])
def delete_household_member(token: str, member_id: int, db: Session = Depends(get_db)):
    hh = db.query(Household).filter(Household.household_token == token).first()
    if not hh:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Household not found")
    member = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.id == member_id, HouseholdMember.household_id == hh.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    db.delete(member)
    if hh.default_member_id == member_id:
        hh.default_member_id = None
    db.commit()
    return {"deleted": True, "member_id": member_id}


# ==========================================
# 5. RECIPE & MEAL NUTRITION CALCULATOR
# ==========================================
@api_router.post("/recipes/calculate", response_model=RecipeDetailOut, tags=["Recipes"])
def create_and_calculate_recipe(
    req: RecipeCreateRequest, db: Session = Depends(get_db)
):
    try:
        return create_or_update_recipe(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.put("/recipes/{recipe_id}", response_model=RecipeDetailOut, tags=["Recipes"])
def update_existing_recipe(
    recipe_id: int, req: RecipeCreateRequest, db: Session = Depends(get_db)
):
    try:
        return create_or_update_recipe(db, req, recipe_id=recipe_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@api_router.get("/recipes", response_model=List[RecipeDetailOut], tags=["Recipes"])
def list_recipes(
    household_token: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    query = db.query(Recipe).options(joinedload(Recipe.ingredients))
    if household_token:
        query = query.filter(
            (Recipe.household_token == household_token) | (Recipe.is_system_template.is_(True))
        )
    else:
        query = query.filter(Recipe.is_system_template.is_(True))
    recipes = query.order_by(Recipe.id.desc()).all()
    return [serialize_recipe_detail(db, r) for r in recipes]


@api_router.get("/recipes/{recipe_id}", response_model=RecipeDetailOut, tags=["Recipes"])
def get_recipe_by_id(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return serialize_recipe_detail(db, recipe)


@api_router.delete("/recipes/{recipe_id}", tags=["Recipes"])
def delete_recipe(recipe_id: int, db: Session = Depends(get_db)):
    recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    db.delete(recipe)
    db.commit()
    return {"deleted": True, "recipe_id": recipe_id}


# ==========================================
# 6. OCR SCANNER, BARCODE & MULTI-SOURCE PRODUCT INTELLIGENCE
# ==========================================
@api_router.post("/scan/ocr-text", response_model=OCRScanResponse, tags=["Scanner & OCR"])
def parse_ocr_label_text_endpoint(req: OCRTextParseRequest):
    return parse_nutrition_label_text(req.raw_label_text)


@api_router.post("/scan/ocr", response_model=OCRScanResponse, tags=["Scanner & OCR"])
@api_router.post("/scan/ocr-image", response_model=OCRScanResponse, tags=["Scanner & OCR"])
async def scan_nutrition_label_image(
    file: UploadFile = File(...),
    ingredients_file: Optional[UploadFile] = File(default=None),
    hint_text: Optional[str] = Form(default=None),
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
    req: ManualProductCreateRequest, db: Session = Depends(get_db)
):
    try:
        return create_user_confirmed_product(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.get("/scan/barcode/{barcode}", response_model=BarcodeLookupResponse, tags=["Barcode Lookup"])
def get_product_by_barcode(
    barcode: str,
    force_refresh: bool = Query(default=False, description="Force fresh external provider lookup"),
    db: Session = Depends(get_db),
):
    return lookup_barcode(db, barcode, force_refresh=force_refresh)


@api_router.get("/products/search", response_model=ExternalProductSearchResponse, tags=["Product Intelligence"])
def search_products_multi_source(
    q: str = Query(..., min_length=1, description="Product name or barcode query"),
    brand: Optional[str] = Query(default=None, description="Optional brand filter"),
    include_external: bool = Query(default=True, description="Query Open Food Facts & USDA FDC"),
    db: Session = Depends(get_db),
):
    local_res = search_foods(db=db, q=q, page_size=8)
    cands_out: List[ExternalProductCandidateOut] = []
    attempts_out: List[ProviderAttemptOut] = []

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
    req: ProductEnrichRequest, db: Session = Depends(get_db)
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
def get_product_provenance_endpoint(slug: str, db: Session = Depends(get_db)):
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
    file: UploadFile = File(...),
    user_hint: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
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
    req: ProductComparisonRequest, db: Session = Depends(get_db)
):
    try:
        return compare_packaged_products(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.post("/meals/suggestions", response_model=MealSuggestionResponse, tags=["Meal Suggestions"])
def suggest_meals_endpoint(
    req: MealSuggestionRequest, db: Session = Depends(get_db)
):
    return generate_meal_suggestions(db, req)


# ==========================================
# 8. LOCAL OLLAMA-POWERED GHARPLATE AI ASSISTANT
# ==========================================
@api_router.get("/assistant/status", response_model=AssistantStatusResponse, tags=["AI Assistant"])
def assistant_status_endpoint(model: Optional[str] = Query(default=None)):
    return get_ollama_assistant_status(requested_model=model)


@api_router.get("/assistant/models", tags=["AI Assistant"])
def assistant_models_endpoint():
    reachable, installed, err_msg = discover_ollama_models()
    return {
        "ollama_reachable": reachable,
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "installed_models": installed,
        "configured_model": settings.OLLAMA_MODEL or None,
        "error_message": err_msg,
    }


@api_router.post("/assistant/chat", response_model=AssistantChatResponse, tags=["AI Assistant"])
def assistant_chat_endpoint(
    req: AssistantChatRequest, db: Session = Depends(get_db)
):
    return chat_with_gharplate_assistant(db, req)
