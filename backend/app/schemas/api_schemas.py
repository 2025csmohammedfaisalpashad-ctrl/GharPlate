from datetime import datetime
from typing import Any
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
    image_url: str | None = None
    display_order: int


class FoodAliasOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    language: str
    alias_text: str
    script_text: str | None = None


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
    value_per_100: float | None = None
    value_for_serving: float | None = None
    basis: str
    is_available: bool
    confidence_status: str
    source_name: str
    source_url: str
    publication_year: int
    measurement_notes: str | None = None


class AllergenConsistencyOut(BaseModel):
    stored_allergen_tags: list[str] = Field(default_factory=list)
    declared_allergens: list[str] = Field(default_factory=list)
    ingredient_inferred_allergens: list[str] = Field(default_factory=list)
    missing_from_stored_tags: list[str] = Field(default_factory=list)
    consistency_status: str = "consistent"
    consistency_warnings: list[str] = Field(default_factory=list)
    requires_manual_review: bool = False


class ProductFieldProvenanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    field_type: str
    field_value: str | None = None
    source_code: str
    source_name: str
    source_url: str | None = None
    source_record_id: str | None = None
    confidence_status: str
    review_status: str
    retrieved_at: datetime
    notes: str | None = None


class ProductDataConflictOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    field_name: str
    local_value: str | None = None
    local_source: str
    external_value: str | None = None
    external_source: str
    external_source_url: str | None = None
    resolution_status: str
    detected_at: datetime


class FoodSummaryOut(BaseModel):
    id: int
    slug: str
    ifct_code: str | None = None
    name_en: str
    image_url: str | None = None
    has_verified_image: bool = True
    category_slug: str
    category_name: str
    is_packaged: bool
    brand: str | None = None
    barcode: str | None = None
    net_quantity: str | None = None
    default_basis: str
    standard_serving_name: str
    standard_serving_grams: float
    is_vegetarian: bool
    is_vegan: bool
    aliases: list[FoodAliasOut]
    key_nutrients: dict[str, float | None]
    unavailable_nutrients: list[str]
    completeness_pct: float
    confidence_level: str
    source_name: str
    source_organization: str
    source_url: str
    publication_year: int


class FoodDetailOut(BaseModel):
    id: int
    slug: str
    ifct_code: str | None = None
    name_en: str
    image_url: str | None = None
    has_verified_image: bool = True
    scientific_name: str | None = None
    description: str
    region_state: str | None = None
    category: FoodCategoryOut
    is_packaged: bool
    brand: str | None = None
    barcode: str | None = None
    net_quantity: str | None = None
    default_basis: str
    standard_serving_name: str
    standard_serving_grams: float
    is_vegetarian: bool
    is_vegan: bool
    allergen_tags: list[str]
    intolerance_tags: list[str]
    dietary_tags: list[str]
    ingredients_text: str | None = None
    cleaned_ingredients_text: str | None = None
    ingredient_items: list[str] = Field(default_factory=list)
    ingredient_percentages: list[str] = Field(default_factory=list)
    additives: list[str] = Field(default_factory=list)
    allergen_statement: str | None = None
    label_warnings: list[str] = Field(default_factory=list)
    manufacturer_info: str | None = None
    lot_and_date_info: str | None = None
    ocr_uncertainty_notes: list[str] = Field(default_factory=list)
    raw_ocr_text: str | None = None
    allergen_declaration_complete: bool
    allergen_safety_disclaimer: str
    allergen_consistency: AllergenConsistencyOut | None = None
    aliases: list[FoodAliasOut]
    servings: list[ServingConversionOut]
    nutrients: list[NutrientValueOut]
    available_nutrient_count: int
    missing_nutrient_codes: list[str]
    completeness_pct: float
    confidence_level: str
    conversion_methodology: str | None = None
    date_imported: datetime
    external_updated_at: datetime | None = None
    source: DataSourceOut
    field_provenance: list[ProductFieldProvenanceOut] = Field(default_factory=list)
    data_conflicts: list[ProductDataConflictOut] = Field(default_factory=list)


class FoodSearchResponse(BaseModel):
    query: str | None = None
    category: str | None = None
    total: int
    page: int
    page_size: int
    suggestions: list[str]
    items: list[FoodSummaryOut]


class NutritionRuleOut(BaseModel):
    rule_code: str
    nutrient_code: str | None = None
    food_category_slug: str | None = None
    comparison_operator: str
    threshold_low: float | None = None
    threshold_high: float | None = None
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
    applicable_age_groups: list[str]
    nutritional_meaning: str
    relevant_nutrients: list[str]
    source_name: str
    source_url: str
    publication_year: int


class HealthConditionDetailOut(HealthConditionSummaryOut):
    relevant_food_groups: list[str]
    evidence_dietary_patterns: str
    portion_considerations: str
    individual_differences: str
    professional_advice_circumstances: str
    red_flag_warning: str | None = None
    what_evidence_does_not_establish: str
    review_status: str
    source: DataSourceOut
    rules: list[NutritionRuleOut]


class ConditionBriefOut(BaseModel):
    code: str
    name: str
    condition_group_code: str
    condition_group_name: str
    is_short_term_illness: bool


class ConditionMemberContextOut(BaseModel):
    member_id: int | None = None
    member_name: str | None = None
    dietary_preference: str | None = None
    allergies: list[str] = Field(default_factory=list)
    intolerances: list[str] = Field(default_factory=list)
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
    dietary_tags: list[str] = Field(default_factory=list)


class ConditionFoodRecommendationItem(BaseModel):
    id: int
    slug: str
    ifct_code: str | None = None
    name_en: str
    image_url: str | None = None
    category: str
    category_slug: str
    category_name: str
    is_packaged: bool
    brand: str | None = None
    barcode: str | None = None
    default_basis: str
    standard_serving_name: str
    standard_serving_grams: float
    is_vegetarian: bool
    is_vegan: bool
    aliases: list[FoodAliasOut] = Field(default_factory=list)
    key_nutrients: dict[str, float | None] = Field(default_factory=dict)
    unavailable_nutrients: list[str] = Field(default_factory=list)
    completeness_pct: float
    confidence_level: str
    source_name: str
    source_organization: str
    source_url: str
    publication_year: int
    relevance_type: str
    relevance_label: str
    reason: str
    caution_notes: str | None = None
    portion_guidance: str | None = None
    evidence_type: str
    review_status: str
    priority_order: int
    relevant_tags: list[str] = Field(default_factory=list)
    nutrition_highlights: dict[str, float | None] = Field(default_factory=dict)
    missing_relevant_nutrients: list[str] = Field(default_factory=list)
    dietary_compatibility: DietaryCompatibilityOut
    allergen_flags: list[str] = Field(default_factory=list)
    intolerance_flags: list[str] = Field(default_factory=list)
    allergen_warnings: list[str] = Field(default_factory=list)
    intolerance_warnings: list[str] = Field(default_factory=list)
    incomplete_ingredient_warning: str | None = None
    source: ConditionFoodSourceOut


class ConditionFoodRecommendationResponse(BaseModel):
    condition: ConditionBriefOut
    member_context: ConditionMemberContextOut
    total_reviewed_foods: int
    empty_state_message: str | None = None
    medical_disclaimer: str
    foods: list[ConditionFoodRecommendationItem]


class GuidanceObservation(BaseModel):
    rule_code: str
    condition_code: str
    condition_name: str
    educational_category: str
    relevance_level: str
    nutrient_code: str | None = None
    nutrient_name: str | None = None
    evaluated_value: float | None = None
    unit: str | None = None
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
    condition_codes: list[str] = Field(default_factory=list)
    serving_unit: str = "standard_serving"
    serving_quantity: float = Field(default=1.0, gt=0)
    age_group: str = "adult"
    allergies: list[str] = Field(default_factory=list)
    intolerances: list[str] = Field(default_factory=list)
    dietary_preference: str | None = None


class GuidanceEvaluationResponse(BaseModel):
    food_slug: str
    food_name: str
    evaluated_serving_label: str
    evaluated_grams: float
    selected_conditions: list[str]
    age_group: str
    medical_disclaimer: str
    requires_professional_guidance: bool
    allergen_alerts: list[str]
    intolerance_alerts: list[str]
    dietary_preference_alerts: list[str]
    multi_condition_conflicts: list[ConditionConflictOut]
    observations: list[GuidanceObservation]
    missing_relevant_nutrients: list[str]
    data_confidence: str


class HouseholdMemberCreate(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=100)
    age_group: str = Field(default="adult")  # child, adolescent, adult, older_adult
    dietary_preference: str = Field(default="vegetarian")
    selected_conditions: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    intolerances: list[str] = Field(default_factory=list)
    dietary_restrictions: list[str] = Field(default_factory=list)
    food_preferences: list[str] = Field(default_factory=list)


class HouseholdMemberOut(HouseholdMemberCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    household_id: int
    created_at: datetime


class HouseholdCreateRequest(BaseModel):
    household_token: str | None = None
    name: str = Field(default="My Household", min_length=1, max_length=120)


class HouseholdOut(BaseModel):
    id: int
    household_token: str
    name: str
    default_member_id: int | None = None
    privacy_notice: str
    created_at: datetime
    members: list[HouseholdMemberOut]


class RecipeIngredientInput(BaseModel):
    food_slug: str
    quantity: float = Field(..., gt=0)
    unit_name: str = "100g"


class RecipeCreateRequest(BaseModel):
    household_token: str | None = None
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    servings: float = Field(default=2.0, gt=0)
    meal_type: str = "lunch"
    instructions_notes: str | None = None
    ingredients: list[RecipeIngredientInput] = Field(..., min_length=1)


class RecipeNutrientBreakdown(BaseModel):
    nutrient_code: str
    nutrient_name: str
    unit: str
    total_known_value: float | None = None
    per_serving_known_value: float | None = None
    ingredients_with_data: int
    ingredients_missing_data: int
    missing_ingredient_names: list[str]
    is_complete: bool


class RecipeIngredientContributionOut(BaseModel):
    food_slug: str
    food_name: str
    image_url: str | None = None
    quantity: float
    unit_name: str
    grams_equivalent: float
    energy_kcal_contribution: float | None = None
    protein_g_contribution: float | None = None
    carbs_g_contribution: float | None = None
    fat_total_g_contribution: float | None = None
    missing_nutrients: list[str]


class RecipeDetailOut(BaseModel):
    id: int
    household_token: str | None = None
    title: str
    description: str | None = None
    image_url: str | None = None
    servings: float
    meal_type: str
    total_weight_grams: float
    serving_weight_grams: float
    completeness_pct: float
    completeness_notice: str
    instructions_notes: str | None = None
    ingredients: list[RecipeIngredientContributionOut]
    nutrients: list[RecipeNutrientBreakdown]
    created_at: datetime


class OCRFieldPrediction(BaseModel):
    field_name: str
    extracted_value: Any | None = None
    unit: str | None = None
    confidence: float
    validation_status: str  # valid, warning, error, missing
    validation_message: str | None = None
    proposed_correction: Any | None = None


class OCRScanResponse(BaseModel):
    scan_id: str
    ocr_status: str = "success"  # success, partial, failed_no_text, failed_engine_unavailable
    ocr_engine: str = "tesseract_or_text_parser"
    ocr_error_reason: str | None = None
    requires_manual_entry: bool = False
    privacy_confirmation: str
    raw_text: str
    detected_basis: str
    parsed_ingredients: dict[str, Any] | None = None
    allergen_consistency: AllergenConsistencyOut | None = None
    fields: dict[str, OCRFieldPrediction]
    validation_warnings: list[str]
    requires_user_confirmation: bool


class OCRTextParseRequest(BaseModel):
    raw_label_text: str = Field(..., min_length=5)


class ManualProductCreateRequest(BaseModel):
    slug: str | None = None
    name_en: str = Field(..., min_length=2, max_length=200)
    brand: str = Field(default="Generic / Household Verified", max_length=150)
    barcode: str | None = None
    net_quantity: str | None = None
    image_url: str | None = None
    retain_front_image_consent: bool = False
    default_basis: str = "100g"
    standard_serving_name: str = "1 serving (30g)"
    standard_serving_grams: float = Field(default=30.0, gt=0)
    is_vegetarian: bool = True
    ingredients_text: str | None = None
    raw_ocr_text: str | None = None
    allergen_tags: list[str] = Field(default_factory=list)
    allergen_declaration_complete: bool = False
    nutrients_per_100: dict[str, float | None] = Field(default_factory=dict)
    source_type: str = "ocr_extracted"  # ocr_extracted or user_entered
    user_confirmed: bool = True


class ProviderAttemptOut(BaseModel):
    provider_code: str
    provider_name: str
    status: str
    http_status: int | None = None
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
    fallback_actions: list[str]
    completeness: dict[str, Any] | None = None
    provider_attempts: list[ProviderAttemptOut] = Field(default_factory=list)
    merged_fields: list[str] = Field(default_factory=list)
    conflicts_requiring_review: list[ProductDataConflictOut] = Field(default_factory=list)
    product: FoodDetailOut | None = None


class ExternalProductCandidateOut(BaseModel):
    provider_code: str
    provider_name: str
    source_url: str
    source_record_id: str
    barcode: str | None = None
    product_name: str | None = None
    brand: str | None = None
    quantity: str | None = None
    serving_size_label: str | None = None
    image_url: str | None = None
    ingredients_text: str | None = None
    allergen_tags: list[str] = Field(default_factory=list)
    nutrients_per_100: dict[str, float | None] = Field(default_factory=dict)
    available_fields: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    is_branded_packaged: bool = True
    retrieved_at: datetime
    license_attribution: str


class ExternalProductSearchResponse(BaseModel):
    query: str
    brand: str | None = None
    local_matches: list[FoodSummaryOut] = Field(default_factory=list)
    external_candidates: list[ExternalProductCandidateOut] = Field(default_factory=list)
    provider_attempts: list[ProviderAttemptOut] = Field(default_factory=list)


class ProductEnrichRequest(BaseModel):
    food_slug: str | None = None
    barcode: str | None = None
    force_refresh: bool = False


class ProductProvenanceResponse(BaseModel):
    food_slug: str
    food_name: str
    barcode: str | None = None
    completeness: dict[str, Any]
    allergen_consistency: AllergenConsistencyOut
    field_provenance: list[ProductFieldProvenanceOut]
    data_conflicts: list[ProductDataConflictOut]


class DishCandidateOut(BaseModel):
    food_slug: str
    food_name: str
    image_url: str | None = None
    regional_aliases: list[str]
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
    candidates: list[DishCandidateOut]


class ProductComparisonRequest(BaseModel):
    product_slugs: list[str] = Field(..., min_length=2, max_length=4)
    condition_codes: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    intolerances: list[str] = Field(default_factory=list)


class ProductComparisonItem(BaseModel):
    slug: str
    name_en: str
    image_url: str | None = None
    brand: str | None = None
    barcode: str | None = None
    normalized_basis: str
    original_serving_name: str
    original_serving_grams: float
    source_origin: str
    source_name: str
    source_url: str
    nutrients_per_100: dict[str, float | None]
    nutrients_per_serving: dict[str, float | None]
    unavailable_nutrients: list[str]
    ingredients_text: str | None = None
    allergen_tags: list[str]
    allergen_declaration_complete: bool
    condition_notes: list[GuidanceObservation]


class ProductComparisonResponse(BaseModel):
    normalized_basis_note: str
    neutrality_disclaimer: str
    multi_condition_conflicts: list[ConditionConflictOut]
    products: list[ProductComparisonItem]


class MealSuggestionRequest(BaseModel):
    meal_type: str = "breakfast"  # breakfast, lunch, dinner, snack
    dietary_preference: str = "vegetarian"
    condition_codes: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    intolerances: list[str] = Field(default_factory=list)
    available_ingredient_keywords: list[str] = Field(default_factory=list)
    age_group: str = "adult"


class MealSuggestionCard(BaseModel):
    suggestion_id: str
    title: str
    meal_type: str
    image_url: str | None = None
    primary_food_slugs: list[str]
    components: list[str]
    why_suggested: str
    condition_relevance_notes: list[str]
    nutritional_summary: dict[str, float | None]
    completeness_pct: float
    missing_nutrients: list[str]
    source_citations: list[str]
    caution_notes: list[str]


class MealSuggestionResponse(BaseModel):
    meal_type: str
    dietary_preference: str
    selected_conditions: list[str]
    medical_disclaimer: str
    has_conflicting_conditions: bool
    conflict_warnings: list[ConditionConflictOut]
    suggestions: list[MealSuggestionCard]


# ==========================================
# LOCAL OLLAMA AI ASSISTANT SCHEMAS
# ==========================================
class AssistantPageContext(BaseModel):
    current_path: str | None = None
    food_slug: str | None = None
    barcode: str | None = None
    condition_code: str | None = None
    household_token: str | None = None
    member_id: int | None = None


class AssistantChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str


class AssistantChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    mode: str = Field(
        default="automatic",
        description="Search mode: 'database_only' (My GharPlate Database), 'automatic' (Automatic), or 'online_search' (Search Online)",
    )
    model: str | None = None
    history: list[AssistantChatMessage] = Field(default_factory=list)
    context: AssistantPageContext | None = None


class AssistantToolExecutionTrace(BaseModel):
    tool_name: str
    arguments: dict[str, Any]
    status: str  # success, error, blocked
    summary: str
    source_type: str  # local_database, external_provider, web_search, guidance_engine


class AssistantSourceReference(BaseModel):
    title: str
    source_type: str  # local_database, open_food_facts, usda_fdc, web_search, clinical_guideline
    url: str | None = None
    retrieved_at: str | None = None
    verification_status: str


class AssistantChatResponse(BaseModel):
    reply: str
    mode_used: str
    model_used: str
    ollama_connected: bool
    used_fallback_synthesis: bool = False
    tool_traces: list[AssistantToolExecutionTrace] = Field(default_factory=list)
    sources: list[AssistantSourceReference] = Field(default_factory=list)
    suggested_followups: list[str] = Field(default_factory=list)
    medical_disclaimer: str


class AssistantStatusResponse(BaseModel):
    enabled: bool
    ollama_base_url: str
    ollama_reachable: bool
    configured_model: str | None = None
    active_model: str | None = None
    installed_models: list[str] = Field(default_factory=list)
    status_message: str
    remediation_command: str | None = None
    available_modes: list[dict[str, str]] = Field(default_factory=list)
    allowlisted_tools: list[str] = Field(default_factory=list)
