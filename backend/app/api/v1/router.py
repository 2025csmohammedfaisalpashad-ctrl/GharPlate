import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.db.session import get_db
from app.models.entities import (
    ConditionConflictRule,
    DataSource,
    FoodCategory,
    FoodItem,
    HealthCondition,
    Household,
    HouseholdMember,
    NutritionRule,
    Recipe,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import (
    BarcodeLookupResponse,
    ConditionConflictOut,
    DataSourceOut,
    DishRecognitionResponse,
    FoodCategoryOut,
    FoodDetailOut,
    FoodSearchResponse,
    FoodSummaryOut,
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
    RecipeCreateRequest,
    RecipeDetailOut,
)
from app.services.comparison_meals_service import (
    compare_packaged_products,
    generate_meal_suggestions,
)
from app.services.food_service import (
    search_foods,
    serialize_food_detail,
    serialize_food_summary,
)
from app.services.ocr_barcode_service import (
    create_user_confirmed_product,
    lookup_barcode,
    parse_nutrition_label_text,
    process_uploaded_label_image,
    recognize_indian_dish_from_image,
)
from app.services.recipe_service import create_or_update_recipe, serialize_recipe_detail

api_router = APIRouter()

PRIVACY_NOTICE_TEXT = (
    "Convenience Browser Identifier Only: Your household token is a randomly generated UUID stored locally in your browser. "
    "It is NOT strong authentication or identity verification. Uploaded food or label images are processed strictly in memory and never stored."
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
        "version": "1.0.0",
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
            joinedload(FoodItem.nutrient_values),
            joinedload(FoodItem.servings),
        )
        .filter(FoodItem.slug == slug)
        .first()
    )
    if not food:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Food '{slug}' not found")
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


@api_router.get("/conditions/{code}/foods", response_model=List[FoodSummaryOut], tags=["Conditions & Guidance"])
def explore_foods_by_condition(code: str, db: Session = Depends(get_db)):
    cond = db.query(HealthCondition).filter(HealthCondition.code == code).first()
    if not cond:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Condition '{code}' not found")

    foods = (
        db.query(FoodItem)
        .options(
            joinedload(FoodItem.category),
            joinedload(FoodItem.source),
            joinedload(FoodItem.aliases),
            joinedload(FoodItem.nutrient_values),
        )
        .join(FoodCategory)
        .filter(FoodCategory.slug.in_(cond.relevant_food_groups))
        .order_by(FoodItem.name_en.asc())
        .all()
    )
    return [serialize_food_summary(f) for f in foods]


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
# 6. OCR SCANNER, BARCODE & DISH RECOGNITION
# ==========================================
@api_router.post("/scan/ocr-text", response_model=OCRScanResponse, tags=["Scanner & OCR"])
def parse_ocr_label_text_endpoint(req: OCRTextParseRequest):
    return parse_nutrition_label_text(req.raw_label_text)


@api_router.post("/scan/ocr-image", response_model=OCRScanResponse, tags=["Scanner & OCR"])
async def scan_nutrition_label_image(
    file: UploadFile = File(...),
    hint_text: Optional[str] = Form(default=None),
):
    raw_bytes = await file.read()
    try:
        return process_uploaded_label_image(raw_bytes, file.content_type, hint_text=hint_text)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    finally:
        await file.close()


@api_router.post("/scan/confirm-product", response_model=FoodDetailOut, tags=["Scanner & OCR"])
def confirm_and_save_product(
    req: ManualProductCreateRequest, db: Session = Depends(get_db)
):
    try:
        return create_user_confirmed_product(db, req)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@api_router.get("/scan/barcode/{barcode}", response_model=BarcodeLookupResponse, tags=["Barcode Lookup"])
def get_product_by_barcode(barcode: str, db: Session = Depends(get_db)):
    return lookup_barcode(db, barcode)


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
