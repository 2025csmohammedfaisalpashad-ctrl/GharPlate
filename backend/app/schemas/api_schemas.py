from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class DataSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    organization: str
    document_title: str
    publication_year: int
    version: str
    url: str
    license_notes: str
    source_type: str


class FoodCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slug: str
    name: str
    description: str
    image_url: Optional[str] = None
    display_order: int


class FoodAliasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    language: str
    alias_text: str
    script_text: Optional[str] = None


class ServingConversionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    unit_name: str
    unit_label: str
    grams_equivalent: float
    is_default: bool
    conversion_source: str


class NutrientValueOut(BaseModel):
    nutrient_code: str
    nutrient_name: str
    unit: str
    category: str
    value_per_100: Optional[float] = None
    value_for_serving: Optional[float] = None
    basis: str
    is_available: bool
    confidence_status: str
    source_name: str
    source_url: str
    publication_year: int
    measurement_notes: Optional[str] = None


class FoodSummaryOut(BaseModel):
    id: int
    slug: str
    ifct_code: Optional[str] = None
    name_en: str
    image_url: Optional[str] = None
    category_slug: str
    category_name: str
    is_packaged: bool
    brand: Optional[str] = None
    barcode: Optional[str] = None
    default_basis: str
    standard_serving_name: str
    standard_serving_grams: float
    is_vegetarian: bool
    is_vegan: bool
    aliases: List[FoodAliasOut]
    key_nutrients: Dict[str, Optional[float]]
    unavailable_nutrients: List[str]
    completeness_pct: float
    confidence_level: str
    source_name: str
    source_organization: str
    source_url: str
    publication_year: int


class FoodDetailOut(BaseModel):
    id: int
    slug: str
    ifct_code: Optional[str] = None
    name_en: str
    image_url: Optional[str] = None
    scientific_name: Optional[str] = None
    description: str
    region_state: Optional[str] = None
    category: FoodCategoryOut
    is_packaged: bool
    brand: Optional[str] = None
    barcode: Optional[str] = None
    default_basis: str
    standard_serving_name: str
    standard_serving_grams: float
    is_vegetarian: bool
    is_vegan: bool
    allergen_tags: List[str]
    intolerance_tags: List[str]
    dietary_tags: List[str]
    ingredients_text: Optional[str] = None
    allergen_declaration_complete: bool
    allergen_safety_disclaimer: str
    aliases: List[FoodAliasOut]
    servings: List[ServingConversionOut]
    nutrients: List[NutrientValueOut]
    available_nutrient_count: int
    missing_nutrient_codes: List[str]
    completeness_pct: float
    confidence_level: str
    conversion_methodology: Optional[str] = None
    date_imported: datetime
    source: DataSourceOut


class FoodSearchResponse(BaseModel):
    query: Optional[str] = None
    category: Optional[str] = None
    total: int
    page: int
    page_size: int
    suggestions: List[str]
    items: List[FoodSummaryOut]


class NutritionRuleOut(BaseModel):
    rule_code: str
    nutrient_code: Optional[str] = None
    food_category_slug: Optional[str] = None
    comparison_operator: str
    threshold_low: Optional[float] = None
    threshold_high: Optional[float] = None
    evaluation_basis: str
    educational_category: str
    relevance_level: str
    explanation: str
    applicability_limitations: str
    evidence_status: str
    source_section: str
    publication_year: int
    review_status: str
    source_name: str
    source_url: str


class HealthConditionSummaryOut(BaseModel):
    id: int
    code: str
    name: str
    condition_group_code: str
    condition_group_name: str
    is_short_term_illness: bool
    is_special_life_stage: bool
    applicable_age_groups: List[str]
    nutritional_meaning: str
    relevant_nutrients: List[str]
    source_name: str
    source_url: str
    publication_year: int


class HealthConditionDetailOut(HealthConditionSummaryOut):
    relevant_food_groups: List[str]
    evidence_dietary_patterns: str
    portion_considerations: str
    individual_differences: str
    professional_advice_circumstances: str
    red_flag_warning: Optional[str] = None
    what_evidence_does_not_establish: str
    review_status: str
    source: DataSourceOut
    rules: List[NutritionRuleOut]


class GuidanceObservation(BaseModel):
    rule_code: str
    condition_code: str
    condition_name: str
    educational_category: str
    relevance_level: str
    nutrient_code: Optional[str] = None
    nutrient_name: Optional[str] = None
    evaluated_value: Optional[float] = None
    unit: Optional[str] = None
    evaluation_basis: str
    explanation: str
    applicability_limitations: str
    evidence_status: str
    source_citation: str
    source_url: str
    publication_year: int


class ConditionConflictOut(BaseModel):
    conflict_code: str
    condition_a_code: str
    condition_b_code: str
    competing_domain: str
    conflict_explanation: str
    why_conflict_exists: str
    professional_guidance_notice: str
    source_citation: str
    source_url: str


class GuidanceEvaluationRequest(BaseModel):
    food_slug: str
    condition_codes: List[str] = Field(default_factory=list)
    serving_unit: str = "standard_serving"
    serving_quantity: float = Field(default=1.0, gt=0)
    age_group: str = "adult"
    allergies: List[str] = Field(default_factory=list)
    intolerances: List[str] = Field(default_factory=list)
    dietary_preference: Optional[str] = None


class GuidanceEvaluationResponse(BaseModel):
    food_slug: str
    food_name: str
    evaluated_serving_label: str
    evaluated_grams: float
    selected_conditions: List[str]
    age_group: str
    medical_disclaimer: str
    requires_professional_guidance: bool
    allergen_alerts: List[str]
    intolerance_alerts: List[str]
    dietary_preference_alerts: List[str]
    multi_condition_conflicts: List[ConditionConflictOut]
    observations: List[GuidanceObservation]
    missing_relevant_nutrients: List[str]
    data_confidence: str


class HouseholdMemberCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    age_group: str = Field(default="adult")  # child, adolescent, adult, older_adult
    dietary_preference: str = Field(default="vegetarian")
    selected_conditions: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    intolerances: List[str] = Field(default_factory=list)
    dietary_restrictions: List[str] = Field(default_factory=list)
    food_preferences: List[str] = Field(default_factory=list)


class HouseholdMemberOut(HouseholdMemberCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    household_id: int
    created_at: datetime


class HouseholdCreateRequest(BaseModel):
    household_token: Optional[str] = None
    name: str = Field(default="My Household", min_length=1, max_length=120)


class HouseholdOut(BaseModel):
    id: int
    household_token: str
    name: str
    default_member_id: Optional[int] = None
    privacy_notice: str
    created_at: datetime
    members: List[HouseholdMemberOut]


class RecipeIngredientInput(BaseModel):
    food_slug: str
    quantity: float = Field(..., gt=0)
    unit_name: str = "100g"


class RecipeCreateRequest(BaseModel):
    household_token: Optional[str] = None
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None
    servings: float = Field(default=2.0, gt=0)
    meal_type: str = "lunch"
    instructions_notes: Optional[str] = None
    ingredients: List[RecipeIngredientInput] = Field(..., min_length=1)


class RecipeNutrientBreakdown(BaseModel):
    nutrient_code: str
    nutrient_name: str
    unit: str
    total_known_value: Optional[float] = None
    per_serving_known_value: Optional[float] = None
    ingredients_with_data: int
    ingredients_missing_data: int
    missing_ingredient_names: List[str]
    is_complete: bool


class RecipeIngredientContributionOut(BaseModel):
    food_slug: str
    food_name: str
    image_url: Optional[str] = None
    quantity: float
    unit_name: str
    grams_equivalent: float
    energy_kcal_contribution: Optional[float] = None
    protein_g_contribution: Optional[float] = None
    carbs_g_contribution: Optional[float] = None
    fat_total_g_contribution: Optional[float] = None
    missing_nutrients: List[str]


class RecipeDetailOut(BaseModel):
    id: int
    household_token: Optional[str] = None
    title: str
    description: Optional[str] = None
    image_url: Optional[str] = None
    servings: float
    meal_type: str
    total_weight_grams: float
    serving_weight_grams: float
    completeness_pct: float
    completeness_notice: str
    instructions_notes: Optional[str] = None
    ingredients: List[RecipeIngredientContributionOut]
    nutrients: List[RecipeNutrientBreakdown]
    created_at: datetime


class OCRFieldPrediction(BaseModel):
    field_name: str
    extracted_value: Optional[Any] = None
    unit: Optional[str] = None
    confidence: float
    validation_status: str  # valid, warning, error, missing
    validation_message: Optional[str] = None
    proposed_correction: Optional[Any] = None


class OCRScanResponse(BaseModel):
    scan_id: str
    privacy_confirmation: str
    raw_text: str
    detected_basis: str
    fields: Dict[str, OCRFieldPrediction]
    validation_warnings: List[str]
    requires_user_confirmation: bool


class OCRTextParseRequest(BaseModel):
    raw_label_text: str = Field(..., min_length=5)


class ManualProductCreateRequest(BaseModel):
    name_en: str = Field(..., min_length=2, max_length=200)
    brand: str = Field(default="Generic / Household Verified", max_length=150)
    barcode: Optional[str] = None
    default_basis: str = "100g"
    standard_serving_name: str = "1 serving (30g)"
    standard_serving_grams: float = Field(default=30.0, gt=0)
    is_vegetarian: bool = True
    ingredients_text: Optional[str] = None
    allergen_tags: List[str] = Field(default_factory=list)
    allergen_declaration_complete: bool = False
    nutrients_per_100: Dict[str, Optional[float]] = Field(default_factory=dict)
    source_type: str = "ocr_extracted"  # ocr_extracted or user_entered
    user_confirmed: bool = True


class BarcodeLookupResponse(BaseModel):
    barcode: str
    found: bool
    source_origin: str  # local_verified_db, open_food_facts_live, not_found
    retrieval_timestamp: datetime
    message: str
    fallback_actions: List[str]
    product: Optional[FoodDetailOut] = None


class DishCandidateOut(BaseModel):
    food_slug: str
    food_name: str
    image_url: Optional[str] = None
    regional_aliases: List[str]
    visual_similarity_score: float
    uncertainty_label: str
    visual_cue_explanation: str
    category_name: str


class DishRecognitionResponse(BaseModel):
    recognition_id: str
    experimental_disclaimer: str
    privacy_confirmation: str
    requires_user_confirmation: bool
    image_quality_notes: str
    candidates: List[DishCandidateOut]


class ProductComparisonRequest(BaseModel):
    product_slugs: List[str] = Field(..., min_length=2, max_length=4)
    condition_codes: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    intolerances: List[str] = Field(default_factory=list)


class ProductComparisonItem(BaseModel):
    slug: str
    name_en: str
    image_url: Optional[str] = None
    brand: Optional[str] = None
    barcode: Optional[str] = None
    normalized_basis: str
    original_serving_name: str
    original_serving_grams: float
    source_origin: str
    source_name: str
    source_url: str
    nutrients_per_100: Dict[str, Optional[float]]
    nutrients_per_serving: Dict[str, Optional[float]]
    unavailable_nutrients: List[str]
    ingredients_text: Optional[str] = None
    allergen_tags: List[str]
    allergen_declaration_complete: bool
    condition_notes: List[GuidanceObservation]


class ProductComparisonResponse(BaseModel):
    normalized_basis_note: str
    neutrality_disclaimer: str
    multi_condition_conflicts: List[ConditionConflictOut]
    products: List[ProductComparisonItem]


class MealSuggestionRequest(BaseModel):
    meal_type: str = "breakfast"  # breakfast, lunch, dinner, snack
    dietary_preference: str = "vegetarian"
    condition_codes: List[str] = Field(default_factory=list)
    allergies: List[str] = Field(default_factory=list)
    intolerances: List[str] = Field(default_factory=list)
    available_ingredient_keywords: List[str] = Field(default_factory=list)
    age_group: str = "adult"


class MealSuggestionCard(BaseModel):
    suggestion_id: str
    title: str
    meal_type: str
    image_url: Optional[str] = None
    primary_food_slugs: List[str]
    components: List[str]
    why_suggested: str
    condition_relevance_notes: List[str]
    nutritional_summary: Dict[str, Optional[float]]
    completeness_pct: float
    missing_nutrients: List[str]
    source_citations: List[str]
    caution_notes: List[str]


class MealSuggestionResponse(BaseModel):
    meal_type: str
    dietary_preference: str
    selected_conditions: List[str]
    medical_disclaimer: str
    has_conflicting_conditions: bool
    conflict_warnings: List[ConditionConflictOut]
    suggestions: List[MealSuggestionCard]
