export interface DataSource {
  id: number;
  code: string;
  name: string;
  organization: string;
  document_title: string;
  publication_year: number;
  version: string;
  url: string;
  license_notes: string;
  source_type: string;
}

export interface FoodCategory {
  id: number;
  slug: string;
  name: string;
  description: string;
  image_url?: string | null;
  display_order: number;
}

export interface FoodAlias {
  language: string;
  alias_text: string;
  script_text?: string | null;
}

export interface ServingConversion {
  unit_name: string;
  unit_label: string;
  grams_equivalent: number;
  is_default: boolean;
  conversion_source: string;
}

export interface NutrientValue {
  nutrient_code: string;
  nutrient_name: string;
  unit: string;
  category: string;
  value_per_100: number | null;
  value_for_serving: number | null;
  basis: string;
  is_available: boolean;
  confidence_status: string;
  source_name: string;
  source_url: string;
  publication_year: number;
  measurement_notes?: string | null;
}

export interface AllergenConsistency {
  stored_allergen_tags: string[];
  declared_allergens: string[];
  ingredient_inferred_allergens: string[];
  missing_from_stored_tags: string[];
  consistency_status: string;
  consistency_warnings: string[];
  requires_manual_review: boolean;
}

export interface ProductFieldProvenance {
  id: number;
  field_name: string;
  field_type: string;
  field_value?: string | null;
  source_code: string;
  source_name: string;
  source_url?: string | null;
  source_record_id?: string | null;
  confidence_status: string;
  review_status: string;
  retrieved_at: string;
  notes?: string | null;
}

export interface ProductDataConflict {
  id: number;
  field_name: string;
  local_value?: string | null;
  local_source: string;
  external_value?: string | null;
  external_source: string;
  external_source_url?: string | null;
  resolution_status: string;
  detected_at: string;
}

export interface FoodSummary {
  id: number;
  slug: string;
  ifct_code?: string | null;
  name_en: string;
  image_url?: string | null;
  has_verified_image?: boolean;
  category_slug: string;
  category_name: string;
  is_packaged: boolean;
  brand?: string | null;
  barcode?: string | null;
  net_quantity?: string | null;
  default_basis: string;
  standard_serving_name: string;
  standard_serving_grams: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  aliases: FoodAlias[];
  key_nutrients: Record<string, number | null>;
  unavailable_nutrients: string[];
  completeness_pct: number;
  confidence_level: string;
  source_name: string;
  source_organization: string;
  source_url: string;
  publication_year: number;
}

export interface FoodDetail {
  id: number;
  slug: string;
  ifct_code?: string | null;
  name_en: string;
  image_url?: string | null;
  has_verified_image?: boolean;
  scientific_name?: string | null;
  description: string;
  region_state?: string | null;
  category: FoodCategory;
  is_packaged: boolean;
  brand?: string | null;
  barcode?: string | null;
  net_quantity?: string | null;
  default_basis: string;
  standard_serving_name: string;
  standard_serving_grams: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  allergen_tags: string[];
  intolerance_tags: string[];
  dietary_tags: string[];
  ingredients_text?: string | null;
  cleaned_ingredients_text?: string | null;
  ingredient_items?: string[];
  ingredient_percentages?: string[];
  additives?: string[];
  allergen_statement?: string | null;
  label_warnings?: string[];
  manufacturer_info?: string | null;
  lot_and_date_info?: string | null;
  ocr_uncertainty_notes?: string[];
  raw_ocr_text?: string | null;
  allergen_declaration_complete: boolean;
  allergen_safety_disclaimer: string;
  allergen_consistency?: AllergenConsistency | null;
  aliases: FoodAlias[];
  servings: ServingConversion[];
  nutrients: NutrientValue[];
  available_nutrient_count: number;
  missing_nutrient_codes: string[];
  completeness_pct: number;
  confidence_level: string;
  conversion_methodology?: string | null;
  date_imported: string;
  external_updated_at?: string | null;
  source: DataSource;
  field_provenance?: ProductFieldProvenance[];
  data_conflicts?: ProductDataConflict[];
}

export interface FoodSearchResponse {
  query?: string | null;
  category?: string | null;
  total: number;
  page: number;
  page_size: number;
  suggestions: string[];
  items: FoodSummary[];
}

export interface NutritionRule {
  rule_code: string;
  nutrient_code?: string | null;
  food_category_slug?: string | null;
  comparison_operator: string;
  threshold_low?: number | null;
  threshold_high?: number | null;
  evaluation_basis: string;
  educational_category: string;
  relevance_level: string;
  explanation: string;
  applicability_limitations: string;
  evidence_status: string;
  source_section: string;
  publication_year: number;
  review_status: string;
  source_name: string;
  source_url: string;
}

export interface HealthConditionSummary {
  id: number;
  code: string;
  name: string;
  condition_group_code: string;
  condition_group_name: string;
  is_short_term_illness: boolean;
  is_special_life_stage: boolean;
  applicable_age_groups: string[];
  nutritional_meaning: string;
  relevant_nutrients: string[];
  source_name: str;
  source_url: string;
  publication_year: number;
}

type str = string;

export interface HealthConditionDetail extends Omit<HealthConditionSummary, 'condition_group_name'> {
  condition_group_name: string;
  relevant_food_groups: string[];
  evidence_dietary_patterns: string;
  portion_considerations: string;
  individual_differences: string;
  professional_advice_circumstances: string;
  red_flag_warning?: string | null;
  what_evidence_does_not_establish: string;
  review_status: string;
  source: DataSource;
  rules: NutritionRule[];
}

export interface ConditionBrief {
  code: string;
  name: string;
  condition_group_code: string;
  condition_group_name: string;
  is_short_term_illness: boolean;
}

export interface ConditionMemberContext {
  member_id: number | null;
  member_name?: string | null;
  dietary_preference: string | null;
  allergies: string[];
  intolerances: string[];
  personalised: boolean;
  personalisation_note: string;
}

export interface ConditionFoodSource {
  name: string;
  organization: string;
  year: number;
  url: string;
  section: string;
}

export interface DietaryCompatibility {
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_eggetarian_compatible: boolean;
  dietary_tags: string[];
}

export interface ConditionFoodRecommendationItem extends FoodSummary {
  category: string;
  relevance_type:
    | 'relevant_food_to_explore'
    | 'portion_sensitive'
    | 'nutrient_to_monitor'
    | 'individualised_advice_required'
    | 'insufficient_information'
    | string;
  relevance_label: string;
  reason: string;
  caution_notes?: string | null;
  portion_guidance?: string | null;
  evidence_type: string;
  review_status: string;
  priority_order: number;
  relevant_tags: string[];
  nutrition_highlights: Record<string, number | null>;
  missing_relevant_nutrients: string[];
  dietary_compatibility: DietaryCompatibility;
  allergen_flags: string[];
  intolerance_flags: string[];
  allergen_warnings: string[];
  intolerance_warnings: string[];
  incomplete_ingredient_warning?: string | null;
  source: ConditionFoodSource;
}

export interface ConditionFoodRecommendationResponse {
  condition: ConditionBrief;
  member_context: ConditionMemberContext;
  total_reviewed_foods: number;
  empty_state_message?: string | null;
  medical_disclaimer: string;
  foods: ConditionFoodRecommendationItem[];
}

export interface GuidanceObservation {
  rule_code: string;
  condition_code: string;
  condition_name: string;
  educational_category: string;
  relevance_level: string;
  nutrient_code?: string | null;
  nutrient_name?: string | null;
  evaluated_value?: number | null;
  unit?: string | null;
  evaluation_basis: string;
  explanation: string;
  applicability_limitations: string;
  evidence_status: string;
  source_citation: string;
  source_url: string;
  publication_year: number;
}

export interface ConditionConflict {
  conflict_code: string;
  condition_a_code: string;
  condition_b_code: string;
  competing_domain: string;
  conflict_explanation: string;
  why_conflict_exists: string;
  professional_guidance_notice: string;
  source_citation: string;
  source_url: string;
}

export interface GuidanceEvaluationResponse {
  food_slug: string;
  food_name: string;
  evaluated_serving_label: string;
  evaluated_grams: number;
  selected_conditions: string[];
  age_group: string;
  medical_disclaimer: string;
  requires_professional_guidance: boolean;
  allergen_alerts: string[];
  intolerance_alerts: string[];
  dietary_preference_alerts: string[];
  multi_condition_conflicts: ConditionConflict[];
  observations: GuidanceObservation[];
  missing_relevant_nutrients: string[];
  data_confidence: string;
}

export interface HouseholdMember {
  id: number;
  household_id: number;
  display_name: string;
  age_group: string;
  dietary_preference: string;
  primary_goal?: string;
  selected_conditions: string[];
  allergies: string[];
  intolerances: string[];
  dietary_restrictions: string[];
  food_preferences: string[];
  created_at: string;
}

export interface Household {
  id: number;
  household_token: string;
  name: string;
  default_member_id?: number | null;
  privacy_notice: string;
  created_at: string;
  members: HouseholdMember[];
}

export interface RecipeIngredientInput {
  food_slug: string;
  quantity: number;
  unit_name: string;
}

export interface RecipeNutrientBreakdown {
  nutrient_code: string;
  nutrient_name: string;
  unit: string;
  total_known_value: number | null;
  per_serving_known_value: number | null;
  ingredients_with_data: number;
  ingredients_missing_data: number;
  missing_ingredient_names: string[];
  is_complete: boolean;
}

export interface RecipeIngredientContribution {
  food_slug: string;
  food_name: string;
  image_url?: string | null;
  quantity: number;
  unit_name: string;
  grams_equivalent: number;
  energy_kcal_contribution: number | null;
  protein_g_contribution: number | null;
  carbs_g_contribution: number | null;
  fat_total_g_contribution: number | null;
  missing_nutrients: string[];
}

export interface RecipeDetail {
  id: number;
  household_token?: string | null;
  title: string;
  description?: string | null;
  image_url?: string | null;
  servings: number;
  meal_type: string;
  total_weight_grams: number;
  serving_weight_grams: number;
  completeness_pct: number;
  completeness_notice: string;
  instructions_notes?: string | null;
  ingredients: RecipeIngredientContribution[];
  nutrients: RecipeNutrientBreakdown[];
  created_at: string;
}

export interface OCRFieldPrediction {
  field_name: string;
  extracted_value: string | number | null;
  unit?: string | null;
  confidence: number;
  validation_status: string;
  validation_message?: string | null;
  proposed_correction?: string | number | null;
}

export interface OCRScanResponse {
  scan_id: string;
  ocr_status?: string;
  ocr_engine?: string;
  ocr_error_reason?: string | null;
  requires_manual_entry?: boolean;
  privacy_confirmation: string;
  raw_text: string;
  detected_basis: string;
  parsed_ingredients?: {
    cleaned_ingredients?: string | null;
    ingredient_items?: string[];
    ingredient_percentages?: string[];
    additives?: string[];
    allergen_declaration?: string | null;
    label_warnings?: string[];
    net_weight?: string | null;
    manufacturer_info?: string | null;
  } | null;
  allergen_consistency?: AllergenConsistency | null;
  fields: Record<string, OCRFieldPrediction>;
  validation_warnings: string[];
  requires_user_confirmation: boolean;
}

export interface ProviderAttempt {
  provider_code: string;
  provider_name: string;
  status: string;
  http_status?: number | null;
  message: string;
  from_cache: boolean;
  retrieved_at: string;
}

export interface BarcodeLookupResponse {
  barcode: string;
  barcode_format?: string;
  is_valid_barcode?: boolean;
  found: boolean;
  source_origin: string;
  retrieval_timestamp: string;
  message: string;
  fallback_actions: string[];
  completeness?: {
    has_verified_image: boolean;
    has_ingredients: boolean;
    has_minimum_nutrients: boolean;
    available_key_nutrients: string[];
    missing_key_nutrients: string[];
    total_available_nutrients: number;
    missing_domains: string[];
    is_stale: boolean;
    needs_enrichment: boolean;
  } | null;
  provider_attempts?: ProviderAttempt[];
  merged_fields?: string[];
  conflicts_requiring_review?: ProductDataConflict[];
  product?: FoodDetail | null;
}

export interface ExternalProductCandidate {
  provider_code: string;
  provider_name: string;
  source_url: string;
  source_record_id: string;
  barcode?: string | null;
  product_name?: string | null;
  brand?: string | null;
  quantity?: string | null;
  serving_size_label?: string | null;
  image_url?: string | null;
  ingredients_text?: string | null;
  allergen_tags: string[];
  nutrients_per_100: Record<string, number | null>;
  available_fields: string[];
  missing_fields: string[];
  is_branded_packaged: boolean;
  retrieved_at: string;
  license_attribution: string;
}

export interface ExternalProductSearchResponse {
  query: string;
  brand?: string | null;
  local_matches: FoodSummary[];
  external_candidates: ExternalProductCandidate[];
  provider_attempts: ProviderAttempt[];
}

export interface ProductProvenanceResponse {
  food_slug: string;
  food_name: string;
  barcode?: string | null;
  completeness: Record<string, unknown>;
  allergen_consistency: AllergenConsistency;
  field_provenance: ProductFieldProvenance[];
  data_conflicts: ProductDataConflict[];
}

export interface DishCandidate {
  food_slug: string;
  food_name: string;
  image_url?: string | null;
  regional_aliases: string[];
  visual_similarity_score: number;
  uncertainty_label: string;
  visual_cue_explanation: string;
  category_name: string;
}

export interface DishRecognitionResponse {
  recognition_id: string;
  experimental_disclaimer: string;
  privacy_confirmation: string;
  requires_user_confirmation: boolean;
  image_quality_notes: string;
  candidates: DishCandidate[];
}

export interface ProductComparisonItem {
  slug: string;
  name_en: string;
  image_url?: string | null;
  brand?: string | null;
  barcode?: string | null;
  normalized_basis: string;
  original_serving_name: string;
  original_serving_grams: number;
  source_origin: string;
  source_name: string;
  source_url: string;
  nutrients_per_100: Record<string, number | null>;
  nutrients_per_serving: Record<string, number | null>;
  unavailable_nutrients: string[];
  ingredients_text?: string | null;
  allergen_tags: string[];
  allergen_declaration_complete: boolean;
  condition_notes: GuidanceObservation[];
}

export interface ProductComparisonResponse {
  normalized_basis_note: string;
  neutrality_disclaimer: string;
  multi_condition_conflicts: ConditionConflict[];
  products: ProductComparisonItem[];
}

export interface MealSuggestionCard {
  suggestion_id: string;
  title: string;
  meal_type: string;
  image_url?: string | null;
  primary_food_slugs: string[];
  components: string[];
  why_suggested: string;
  condition_relevance_notes: string[];
  nutritional_summary: Record<string, number | null>;
  completeness_pct: number;
  missing_nutrients: string[];
  source_citations: string[];
  caution_notes: string[];
}

export interface MealSuggestionResponse {
  meal_type: string;
  dietary_preference: string;
  selected_conditions: string[];
  medical_disclaimer: string;
  has_conflicting_conditions: boolean;
  conflict_warnings: ConditionConflict[];
  suggestions: MealSuggestionCard[];
}

// ==========================================
// LOCAL OLLAMA AI ASSISTANT TYPES
// ==========================================
export interface AssistantPageContext {
  current_path?: string | null;
  food_slug?: string | null;
  barcode?: string | null;
  condition_code?: string | null;
  household_token?: string | null;
  member_id?: number | null;
}

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantToolExecutionTrace {
  tool_name: string;
  arguments: Record<string, unknown>;
  status: string;
  summary: string;
  source_type: string;
}

export interface AssistantSourceReference {
  title: string;
  source_type: string;
  url?: string | null;
  retrieved_at?: string | null;
  verification_status: string;
}

export interface AssistantChatResponse {
  conversation_id?: number | null;
  conversation_title?: string | null;
  reply: string;
  mode_used: string;
  model_used: string;
  ollama_connected: boolean;
  used_fallback_synthesis: boolean;
  tool_traces: AssistantToolExecutionTrace[];
  sources: AssistantSourceReference[];
  suggested_followups: string[];
  medical_disclaimer: string;
}

export interface AssistantStatusResponse {
  enabled: boolean;
  ollama_base_url: string;
  ollama_reachable: boolean;
  configured_model?: string | null;
  active_model?: string | null;
  installed_models: string[];
  status_message: string;
  remediation_command?: string | null;
  available_modes: { id: string; label: string; description: string }[];
  allowlisted_tools: string[];
}

export interface AssistantMessageRecord {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant';
  content: string;
  mode_used?: string | null;
  model_used?: string | null;
  ollama_connected: boolean;
  tool_traces: AssistantToolExecutionTrace[];
  sources: AssistantSourceReference[];
  created_at: string;
}

export interface AssistantConversationSummary {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message_preview?: string | null;
}

export interface AssistantConversationDetail {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  messages: AssistantMessageRecord[];
}

// ==========================================
// REAL DATABASE-BACKED AUTHENTICATION TYPES
// ==========================================
export interface AuthUser {
  id: number;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
}

export interface AuthSessionResponse {
  authenticated: boolean;
  user: AuthUser;
  household: Household;
  csrf_token: string;
  session_expires_at: string;
  message: string;
}

