/// <reference types="vite/client" />
import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantPageContext,
  AssistantStatusResponse,
  BarcodeLookupResponse,
  ConditionFoodRecommendationResponse,
  DataSource,
  DishRecognitionResponse,
  ExternalProductSearchResponse,
  FoodCategory,
  FoodDetail,
  FoodSearchResponse,
  GuidanceEvaluationResponse,
  HealthConditionDetail,
  HealthConditionSummary,
  Household,
  HouseholdMember,
  MealSuggestionResponse,
  OCRScanResponse,
  ProductComparisonResponse,
  ProductProvenanceResponse,
  RecipeDetail,
  RecipeIngredientInput,
} from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      errMsg = data.detail || errMsg;
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getHealth: () =>
    request<{
      status: string;
      service: string;
      version: string;
      counts: { foods: number; conditions: number; sources: number };
      medical_disclaimer: string;
    }>('/health'),

  getSources: () => request<DataSource[]>('/sources'),

  getCategories: () => request<FoodCategory[]>('/foods/categories'),

  searchFoods: (params: {
    q?: string;
    category?: string;
    is_packaged?: boolean;
    vegetarian_only?: boolean;
    nutrient_filter?: string;
    sort_by?: string;
    page?: number;
    page_size?: number;
  }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.category) sp.set('category', params.category);
    if (params.is_packaged !== undefined) sp.set('is_packaged', String(params.is_packaged));
    if (params.vegetarian_only) sp.set('vegetarian_only', 'true');
    if (params.nutrient_filter) sp.set('nutrient_filter', params.nutrient_filter);
    if (params.sort_by) sp.set('sort_by', params.sort_by);
    if (params.page) sp.set('page', String(params.page));
    if (params.page_size) sp.set('page_size', String(params.page_size));
    return request<FoodSearchResponse>(`/foods?${sp.toString()}`);
  },

  getFoodDetail: (slug: string) => request<FoodDetail>(`/foods/${encodeURIComponent(slug)}`),

  getConditions: () => request<HealthConditionSummary[]>('/conditions'),

  getConditionDetail: (code: string) =>
    request<HealthConditionDetail>(`/conditions/${encodeURIComponent(code)}`),

  getFoodsByCondition: (
    code: string,
    params?: {
      household_token?: string;
      member_id?: number | null;
      dietary_preference?: string | null;
    }
  ) => {
    const sp = new URLSearchParams();
    if (params?.household_token) sp.set('household_token', params.household_token);
    if (params?.member_id !== undefined && params?.member_id !== null) {
      sp.set('member_id', String(params.member_id));
    }
    if (params?.dietary_preference) {
      sp.set('dietary_preference', params.dietary_preference);
    }
    const qs = sp.toString();
    return request<ConditionFoodRecommendationResponse>(
      `/conditions/${encodeURIComponent(code)}/foods${qs ? `?${qs}` : ''}`
    );
  },

  evaluateGuidance: (payload: {
    food_slug: string;
    condition_codes: string[];
    serving_unit?: string;
    serving_quantity?: number;
    age_group?: string;
    allergies?: string[];
    intolerances?: string[];
    dietary_preference?: string;
  }) =>
    request<GuidanceEvaluationResponse>('/guidance/evaluate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  initOrGetHousehold: (household_token?: string, name = 'My Household') =>
    request<Household>('/households', {
      method: 'POST',
      body: JSON.stringify({ household_token, name }),
    }),

  getHousehold: (token: string) => request<Household>(`/households/${encodeURIComponent(token)}`),

  deleteHousehold: (token: string) =>
    request<{ deleted: boolean; message: string }>(`/households/${encodeURIComponent(token)}`, {
      method: 'DELETE',
    }),

  addMember: (
    token: string,
    member: Omit<HouseholdMember, 'id' | 'household_id' | 'created_at'>
  ) =>
    request<HouseholdMember>(`/households/${encodeURIComponent(token)}/members`, {
      method: 'POST',
      body: JSON.stringify(member),
    }),

  updateMember: (
    token: string,
    memberId: number,
    member: Omit<HouseholdMember, 'id' | 'household_id' | 'created_at'>
  ) =>
    request<HouseholdMember>(`/households/${encodeURIComponent(token)}/members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(member),
    }),

  setDefaultMember: (token: string, memberId: number) =>
    request<Household>(`/households/${encodeURIComponent(token)}/default-member/${memberId}`, {
      method: 'POST',
    }),

  deleteMember: (token: string, memberId: number) =>
    request<{ deleted: boolean }>(`/households/${encodeURIComponent(token)}/members/${memberId}`, {
      method: 'DELETE',
    }),

  calculateRecipe: (payload: {
    household_token?: string;
    title: string;
    description?: string;
    servings: number;
    meal_type: string;
    instructions_notes?: string;
    ingredients: RecipeIngredientInput[];
  }) =>
    request<RecipeDetail>('/recipes/calculate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateRecipe: (
    recipeId: number,
    payload: {
      household_token?: string;
      title: string;
      description?: string;
      servings: number;
      meal_type: string;
      instructions_notes?: string;
      ingredients: RecipeIngredientInput[];
    }
  ) =>
    request<RecipeDetail>(`/recipes/${recipeId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  listRecipes: (household_token?: string) =>
    request<RecipeDetail[]>(
      `/recipes${household_token ? `?household_token=${encodeURIComponent(household_token)}` : ''}`
    ),

  getRecipe: (id: number) => request<RecipeDetail>(`/recipes/${id}`),

  deleteRecipe: (id: number) =>
    request<{ deleted: boolean }>(`/recipes/${id}`, { method: 'DELETE' }),

  scanLabelText: (raw_label_text: string) =>
    request<OCRScanResponse>('/scan/ocr-text', {
      method: 'POST',
      body: JSON.stringify({ raw_label_text }),
    }),

  scanLabelImage: (file: File, hint_text?: string, ingredientsFile?: File | null) => {
    const fd = new FormData();
    fd.append('file', file);
    if (ingredientsFile) fd.append('ingredients_file', ingredientsFile);
    if (hint_text) fd.append('hint_text', hint_text);
    return request<OCRScanResponse>('/scan/ocr-image', {
      method: 'POST',
      body: fd,
    });
  },

  confirmScannedProduct: (payload: {
    slug?: string;
    name_en: string;
    brand: string;
    barcode?: string;
    net_quantity?: string;
    image_url?: string;
    retain_front_image_consent?: boolean;
    default_basis: string;
    standard_serving_name: string;
    standard_serving_grams: number;
    is_vegetarian: boolean;
    ingredients_text?: string;
    raw_ocr_text?: string;
    allergen_tags: string[];
    allergen_declaration_complete: boolean;
    nutrients_per_100: Record<string, number | null>;
    source_type: string;
    user_confirmed: boolean;
  }) =>
    request<FoodDetail>('/scan/confirm-product', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  lookupBarcode: (barcode: string, forceRefresh = false) =>
    request<BarcodeLookupResponse>(
      `/scan/barcode/${encodeURIComponent(barcode)}${forceRefresh ? '?force_refresh=true' : ''}`
    ),

  searchProductsMultiSource: (q: string, brand?: string, includeExternal = true) => {
    const sp = new URLSearchParams({ q, include_external: String(includeExternal) });
    if (brand) sp.set('brand', brand);
    return request<ExternalProductSearchResponse>(`/products/search?${sp.toString()}`);
  },

  enrichProduct: (payload: {
    food_slug?: string;
    barcode?: string;
    force_refresh?: boolean;
  }) =>
    request<BarcodeLookupResponse>('/products/enrich', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getProductProvenance: (slug: string) =>
    request<ProductProvenanceResponse>(`/products/${encodeURIComponent(slug)}/provenance`),

  recognizeDish: (file: File, user_hint?: string) => {
    const fd = new FormData();
    fd.append('file', file);
    if (user_hint) fd.append('user_hint', user_hint);
    return request<DishRecognitionResponse>('/scan/recognize-dish', {
      method: 'POST',
      body: fd,
    });
  },

  compareProducts: (payload: {
    product_slugs: string[];
    condition_codes: string[];
    allergies?: string[];
    intolerances?: string[];
  }) =>
    request<ProductComparisonResponse>('/products/compare', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMealSuggestions: (payload: {
    meal_type: string;
    dietary_preference: string;
    condition_codes: string[];
    allergies: string[];
    intolerances: string[];
    available_ingredient_keywords: string[];
    age_group: string;
  }) =>
    request<MealSuggestionResponse>('/meals/suggestions', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Local Ollama AI Assistant Endpoints
  getAssistantStatus: (model?: string) =>
    request<AssistantStatusResponse>(
      `/assistant/status${model ? `?model=${encodeURIComponent(model)}` : ''}`
    ),

  getAssistantModels: () =>
    request<{
      ollama_reachable: boolean;
      ollama_base_url: string;
      installed_models: string[];
      configured_model?: string | null;
      error_message?: string | null;
    }>('/assistant/models'),

  chatWithAssistant: (payload: {
    message: string;
    mode: string;
    model?: string;
    history: AssistantChatMessage[];
    context?: AssistantPageContext;
  }) =>
    request<AssistantChatResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};
