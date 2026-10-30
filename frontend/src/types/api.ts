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

export interface FoodSummary {
  id: number;
  slug: string;
  ifct_code?: string | null;
  name_en: string;
  image_url?: string | null;
  category_slug: string;
  category_name: string;
  is_packaged: boolean;
  brand?: string | null;
  barcode?: string | null;
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
  scientific_name?: string | null;
  description: string;
  region_state?: string | null;
  category: FoodCategory;
  is_packaged: boolean;
  brand?: string | null;
  barcode?: string | null;
  default_basis: string;
  standard_serving_name: string;
  standard_serving_grams: number;
  is_vegetarian: boolean;
  is_vegan: boolean;
  allergen_tags: string[];
  intolerance_tags: string[];
  dietary_tags: string[];
  ingredients_text?: string | null;
  allergen_declaration_complete: boolean;
  allergen_safety_disclaimer: string;
  aliases: FoodAlias[];
  servings: ServingConversion[];
  nutrients: NutrientValue[];
  available_nutrient_count: number;
  missing_nutrient_codes: string[];
  completeness_pct: number;
  confidence_level: string;
  conversion_methodology?: string | null;
  date_imported: string;
  source: DataSource;
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
  source_name: string;
  source_url: string;
  publication_year: number;
}

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
  privacy_confirmation: string;
  raw_text: string;
  detected_basis: string;
  fields: Record<string, OCRFieldPrediction>;
  validation_warnings: string[];
  requires_user_confirmation: boolean;
}

export interface BarcodeLookupResponse {
  barcode: string;
  found: boolean;
  source_origin: string;
  retrieval_timestamp: string;
  message: string;
  fallback_actions: string[];
  product?: FoodDetail | null;
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
