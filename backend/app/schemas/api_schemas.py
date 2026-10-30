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


class AllergenConsistencyOut(BaseModel):
    stored_allergen_tags: List[str] = Field(default_factory=list)
    declared_allergens: List[str] = Field(default_factory=list)
    ingredient_inferred_allergens: List[str] = Field(default_factory=list)
    missing_from_stored_tags: List[str] = Field(default_factory=list)
    consistency_status: str = "consistent"
    consistency_warnings: List[str] = Field(default_factory=list)
    requires_manual_review: bool = False


class ProductFieldProvenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    field_type: str
    field_value: Optional[str] = None
    source_code: str
    source_name: str
    source_url: Optional[str] = None
    source_record_id: Optional[str] = None
    confidence_status: str
    review_status: str
    retrieved_at: datetime
    notes: Optional[str] = None


class ProductDataConflictOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    local_value: Optional[str] = None
    local_source: str
    external_value: Optional[str] = None
    external_source: str
    external_source_url: Optional[str] = None
    resolution_status: str
    detected_at: datetime


class FoodSummaryOut(BaseModel):
    id: int
    slug: str
    ifct_code: Optional[str] = None
    name_en: str
    image_url: Optional[str] = None
    has_verified_image: bool = True
    category_slug: str
    category_name: str
    is_packaged: bool
    brand: Optional[str] = None
    barcode: Optional[str] = None
    net_quantity: Optional[str] = None
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
    has_verified_image: bool = True
    scientific_name: Optional[str] = None
    description: str
    region_state: Optional[str] = None
    category: FoodCategoryOut
    is_packaged: bool
    brand: Optional[str] = None
    barcode: Optional[str] = None
    net_quantity: Optional[str] = None
    default_basis: str
    standard_serving_name: str
    standard_serving_grams: float
    is_vegetarian: bool
    is_vegan: bool
    allergen_tags: List[str]
    intolerance_tags: List[str]
    dietary_tags: List[str]
    ingredients_text: Optional[str] = None
    cleaned_ingredients_text: Optional[str] = None
    ingredient_items: List[str] = Field(default_factory=list)
    ingredient_percentages: List[str] = Field(default_factory=list)
    additives: List[str] = Field(default_factory=list)
    allergen_statement: Optional[str] = None
    label_warnings: List[str] = Field(default_factory=list)
    manufacturer_info: Optional[str] = None
    lot_and_date_info: Optional[str] = None
    ocr_uncertainty_notes: List[str] = Field(default_factory=list)
    raw_ocr_text: Optional[str] = None
    allergen_declaration_complete: bool
    allergen_safety_disclaimer: str
    allergen_consistency: Optional[AllergenConsistencyOut] = None
    aliases: List[FoodAliasOut]
    servings: List[ServingConversionOut]
    nutrients: List[NutrientValueOut]
    available_nutrient_count: int
    missing_nutrient_codes: List[str]
    completeness_pct: float
    confidence_level: str
    conversion_methodology: Optional[str] = None
    date_imported: datetime
    external_updated_at: Optional[datetime] = None
    source: DataSourceOut
    field_provenance: List[ProductFieldProvenanceOut] = Field(default_factory=list)
    data_conflicts: List[ProductDataConflictOut] = Field(default_factory=list)


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


class ConditionBriefOut(BaseModel):
    code: str
    name: str
    condition_group_code: str
    condition_group_name: str
    is_short_term_illness: bool


class ConditionMemberContextOut(BaseModel):
    member_id: Optional[int] = None
    member_name: Optional[str] = None
    dietary_preference: Optional[str] = None
    allergies: List[str] = Field(default_factory=list)
    intolerances: List[str] = Field(default_factory=list)
    personalised: bool = False
    personalisation_note: str


class ConditionFoodSourceOut(BaseModel):
    name: str
    organization: str
    year: int
    url: str
    section: str


class DietaryCompatibilityOut(BaseModel):
    is_vegetarian: bool
    is_vegan: bool
    is_eggetarian_compatible: bool
    dietary_tags: List[str] = Field(default_factory=list)


class ConditionFoodRecommendationItem(BaseModel):
    id: int
    slug: str
    ifct_code: Optional[str] = None
    name_en: str
    image_url: Optional[str] = None
    category: str
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
    aliases: List[FoodAliasOut] = Field(default_factory=list)
    key_nutrients: Dict[str, Optional[float]] = Field(default_factory=dict)
    unavailable_nutrients: List[str] = Field(default_factory=list)
    completeness_pct: float
    confidence_level: str
    source_name: str
    source_organization: str
    source_url: str
    publication_year: int
    relevance_type: str
    relevance_label: str
    reason: str
    caution_notes: Optional[str] = None
    portion_guidance: Optional[str] = None
    evidence_type: str
    review_status: str
    priority_order: int
    relevant_tags: List[str] = Field(default_factory=list)
    nutrition_highlights: Dict[str, Optional[float]] = Field(default_factory=dict)
    missing_relevant_nutrients: List[str] = Field(default_factory=list)
    dietary_compatibility: DietaryCompatibilityOut
    allergen_flags: List[str] = Field(default_factory=list)
    intolerance_flags: List[str] = Field(default_factory=list)
    allergen_warnings: List[str] = Field(default_factory=list)
    intolerance_warnings: List[str] = Field(default_factory=list)
    incomplete_ingredient_warning: Optional[str] = None
    source: ConditionFoodSourceOut


class ConditionFoodRecommendationResponse(BaseModel):
    condition: ConditionBriefOut
    member_context: ConditionMemberContextOut
    total_reviewed_foods: int
    empty_state_message: Optional[str] = None
    medical_disclaimer: str
    foods: List[ConditionFoodRecommendationItem]


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
    ocr_status: str = "success"  # success, partial, failed_no_text, failed_engine_unavailable
    ocr_engine: str = "tesseract_or_text_parser"
    ocr_error_reason: Optional[str] = None
    requires_manual_entry: bool = False
    privacy_confirmation: str
    raw_text: str
    detected_basis: str
    parsed_ingredients: Optional[Dict[str, Any]] = None
    allergen_consistency: Optional[AllergenConsistencyOut] = None
    fields: Dict[str, OCRFieldPrediction]
    validation_warnings: List[str]
    requires_user_confirmation: bool


class OCRTextParseRequest(BaseModel):
    raw_label_text: str = Field(..., min_length=5)


class ManualProductCreateRequest(BaseModel):
    slug: Optional[str] = None
    name_en: str = Field(..., min_length=2, max_length=200)
    brand: str = Field(default="Generic / Household Verified", max_length=150)
    barcode: Optional[str] = None
    net_quantity: Optional[str] = None
    image_url: Optional[str] = None
    retain_front_image_consent: bool = False
    default_basis: str = "100g"
    standard_serving_name: str = "1 serving (30g)"
    standard_serving_grams: float = Field(default=30.0, gt=0)
    is_vegetarian: bool = True
    ingredients_text: Optional[str] = None
    raw_ocr_text: Optional[str] = None
    allergen_tags: List[str] = Field(default_factory=list)
    allergen_declaration_complete: bool = False
    nutrients_per_100: Dict[str, Optional[float]] = Field(default_factory=dict)
    source_type: str = "ocr_extracted"  # ocr_extracted or user_entered
    user_confirmed: bool = True


class ProviderAttemptOut(BaseModel):
    provider_code: str
    provider_name: str
    status: str
    http_status: Optional[int] = None
    message: str
    from_cache: bool = False
    retrieved_at: datetime


class BarcodeLookupResponse(BaseModel):
    barcode: str
    barcode_format: str = "EAN-13"
    is_valid_barcode: bool = True
    found: bool
    source_origin: str  # local_verified_db, local_enriched_external, open_food_facts_live, usda_fdc_live, not_found, invalid_barcode
    retrieval_timestamp: datetime
    message: str
    fallback_actions: List[str]
    completeness: Optional[Dict[str, Any]] = None
    provider_attempts: List[ProviderAttemptOut] = Field(default_factory=list)
    merged_fields: List[str] = Field(default_factory=list)
    conflicts_requiring_review: List[ProductDataConflictOut] = Field(default_factory=list)
    product: Optional[FoodDetailOut] = None


class ExternalProductCandidateOut(BaseModel):
    provider_code: str
    provider_name: str
    source_url: str
    source_record_id: str
    barcode: Optional[str] = None
    product_name: Optional[str] = None
    brand: Optional[str] = None
    quantity: Optional[str] = None
    serving_size_label: Optional[str] = None
    image_url: Optional[str] = None
    ingredients_text: Optional[str] = None
    allergen_tags: List[str] = Field(default_factory=list)
    nutrients_per_100: Dict[str, Optional[float]] = Field(default_factory=dict)
    available_fields: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    is_branded_packaged: bool = True
    retrieved_at: datetime
    license_attribution: str


class ExternalProductSearchResponse(BaseModel):
    query: str
    brand: Optional[str] = None
    local_matches: List[FoodSummaryOut] = Field(default_factory=list)
    external_candidates: List[ExternalProductCandidateOut] = Field(default_factory=list)
    provider_attempts: List[ProviderAttemptOut] = Field(default_factory=list)


class ProductEnrichRequest(BaseModel):
    food_slug: Optional[str] = None
    barcode: Optional[str] = None
    force_refresh: bool = False


class ProductProvenanceResponse(BaseModel):
    food_slug: str
    food_name: str
    barcode: Optional[str] = None
    completeness: Dict[str, Any]
    allergen_consistency: AllergenConsistencyOut
    field_provenance: List[ProductFieldProvenanceOut]
    data_conflicts: List[ProductDataConflictOut]


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


# ==========================================
# LOCAL OLLAMA AI ASSISTANT SCHEMAS
# ==========================================
class AssistantPageContext(BaseModel):
    current_path: Optional[str] = None
    food_slug: Optional[str] = None
    barcode: Optional[str] = None
    condition_code: Optional[str] = None
    household_token: Optional[str] = None
    member_id: Optional[int] = None


class AssistantChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(
        default="automatic",
        description="Search mode: 'database_only' (My GharPlate Database), 'automatic' (Automatic), or 'online_search' (Search Online)",
    )
    model: Optional[str] = None
    history: List[AssistantChatMessage] = Field(default_factory=list)
    context: Optional[AssistantPageContext] = None


class AssistantToolExecutionTrace(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]
    status: str  # success, error, blocked
    summary: str
    source_type: str  # local_database, external_provider, web_search, guidance_engine


class AssistantSourceReference(BaseModel):
    title: str
    source_type: str  # local_database, open_food_facts, usda_fdc, web_search, clinical_guideline
    url: Optional[str] = None
    retrieved_at: Optional[str] = None
    verification_status: str


class AssistantChatResponse(BaseModel):
    reply: str
    mode_used: str
    model_used: str
    ollama_connected: bool
    used_fallback_synthesis: bool = False
    tool_traces: List[AssistantToolExecutionTrace] = Field(default_factory=list)
    sources: List[AssistantSourceReference] = Field(default_factory=list)
    suggested_followups: List[str] = Field(default_factory=list)
    medical_disclaimer: str


class AssistantStatusResponse(BaseModel):
    enabled: bool
    ollama_base_url: str
    ollama_reachable: bool
    configured_model: Optional[str] = None
    active_model: Optional[str] = None
    installed_models: List[str] = Field(default_factory=list)
    status_message: str
    remediation_command: Optional[str] = None
    available_modes: List[Dict[str, str]] = Field(default_factory=list)
    allowlisted_tools: List[str] = Field(default_factory=list)
