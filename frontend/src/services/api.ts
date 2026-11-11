/// <reference types="vite/client" />
import type {
  AssistantChatMessage,
  AssistantChatResponse,
  AssistantConversationDetail,
  AssistantConversationSummary,
  AssistantPageContext,
  AssistantStatusResponse,
  AssistantVoiceStatusResponse,
  AssistantVoiceTranscribeResponse,
  AuthSessionResponse,
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

let csrfTokenMemory: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfTokenMemory = token;
}

export function getCsrfToken(): string | null {
  if (csrfTokenMemory) return csrfTokenMemory;
  if (typeof document !== 'undefined' && document.cookie) {
    const match = document.cookie.match(/(?:^|;\s*)gharplate_csrf=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || 'GET').toUpperCase();
  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const csrf = getCsrfToken();

  const headers: Record<string, string> = {
    ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(isStateChanging && csrf ? { 'X-CSRF-Token': csrf } : {}),
    ...((options?.headers as Record<string, string>) || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data?.detail === 'string') {
        errMsg = data.detail;
      } else if (Array.isArray(data?.detail) && data.detail[0]?.msg) {
        errMsg = data.detail[0].msg;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(errMsg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  // ==========================================
  // 1. REAL DATABASE-BACKED AUTHENTICATION APIs
  // ==========================================
  registerAccount: async (payload: {
    name: string;
    email: string;
    password: string;
    password_confirmation: string;
    remember_me?: boolean;
  }): Promise<AuthSessionResponse> => {
    const res = await request<AuthSessionResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.csrf_token) setCsrfToken(res.csrf_token);
    return res;
  },

  loginAccount: async (payload: {
    email: string;
    password: string;
    remember_me?: boolean;
  }): Promise<AuthSessionResponse> => {
    const res = await request<AuthSessionResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (res.csrf_token) setCsrfToken(res.csrf_token);
    return res;
  },

  getAuthMe: async (): Promise<AuthSessionResponse> => {
    const res = await request<AuthSessionResponse>('/auth/me');
    if (res.csrf_token) setCsrfToken(res.csrf_token);
    return res;
  },

  logoutAccount: async (): Promise<{
    authenticated: boolean;
    logged_out: boolean;
    message: string;
  }> => {
    const res = await request<{
      authenticated: boolean;
      logged_out: boolean;
      message: string;
    }>('/auth/logout', {
      method: 'POST',
    });
    setCsrfToken(null);
    return res;
  },

  // ==========================================
  // 2. HEALTH, SOURCES & FOOD INTELLIGENCE
  // ==========================================
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

  // ==========================================
  // 3. AUTHENTICATED HOUSEHOLD & FAMILY PROFILES
  // ==========================================
  initOrGetHousehold: (household_token?: string, name = 'My Household') =>
    request<Household>('/households', {
      method: 'POST',
      body: JSON.stringify({ household_token, name }),
    }),

  getHousehold: (token = 'me') =>
    request<Household>(`/households/${encodeURIComponent(token)}`),

  deleteHousehold: (token = 'me') =>
    request<{ deleted: boolean; household_token: string; message: string }>(
      `/households/${encodeURIComponent(token)}`,
      {
        method: 'DELETE',
      }
    ),

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

  // ==========================================
  // 4. RECIPES, OCR, BARCODE, COMPARISON & MEALS
  // ==========================================
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

  getRecipe: (idOrSlug: number | string, servings?: number) => {
    const sp = new URLSearchParams();
    if (servings !== undefined && servings > 0) sp.set('servings', String(servings));
    const qs = sp.toString();
    return request<RecipeDetail>(
      `/recipes/${encodeURIComponent(String(idOrSlug))}${qs ? `?${qs}` : ''}`
    );
  },

  enrichRecipeSteps: (
    idOrSlug: number | string,
    payload?: { steps?: Record<string, any>[] }
  ) =>
    request<RecipeDetail>(`/recipes/${encodeURIComponent(String(idOrSlug))}/enrich`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    }),

  rateOrFavouriteRecipe: (
    idOrSlug: number | string,
    payload: {
      is_favourite?: boolean;
      user_rating?: number;
      rating_notes?: string;
    }
  ) =>
    request<RecipeDetail>(`/recipes/${encodeURIComponent(String(idOrSlug))}/rate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logRecipeToDiary: (
    idOrSlug: number | string,
    payload: {
      member_id?: number | null;
      user_confirmed: boolean;
      servings_consumed: number;
      meal_category?: string;
      logged_date?: string;
      notes?: string;
    }
  ) =>
    request<Record<string, any>>(
      `/recipes/${encodeURIComponent(String(idOrSlug))}/log-diary`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

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

  // ==========================================
  // 5. LOCAL OLLAMA AI ASSISTANT & PERSISTENT CONVERSATIONS
  // ==========================================
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

  evaluateAssistantModels: () =>
    request<Record<string, any>>('/assistant/models/evaluate'),

  getAssistantVoiceStatus: () =>
    request<AssistantVoiceStatusResponse>('/assistant/voice/status'),

  transcribeAssistantVoice: (payload: {
    transcript_hint?: string | null;
    language_code?: string;
    audio_base64?: string | null;
  }) =>
    request<AssistantVoiceTranscribeResponse>('/assistant/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  listAssistantConversations: (q?: string) =>
    request<AssistantConversationSummary[]>(
      `/assistant/conversations${q ? `?q=${encodeURIComponent(q)}` : ''}`
    ),

  createAssistantConversation: (title = 'New Chat') =>
    request<AssistantConversationDetail>('/assistant/conversations', {
      method: 'POST',
      body: JSON.stringify({ title }),
    }),

  renameAssistantConversation: (conversationId: number, title: string) =>
    request<AssistantConversationSummary>(
      `/assistant/conversations/${conversationId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }
    ),

  getAssistantConversation: (conversationId: number) =>
    request<AssistantConversationDetail>(`/assistant/conversations/${conversationId}`),

  deleteAssistantConversation: (conversationId: number) =>
    request<{ deleted: boolean; conversation_id: number }>(
      `/assistant/conversations/${conversationId}`,
      { method: 'DELETE' }
    ),

  chatWithAssistant: (payload: {
    message: string;
    conversation_id?: number | null;
    mode: string;
    model?: string;
    history: AssistantChatMessage[];
    context?: AssistantPageContext;
  }) =>
    request<AssistantChatResponse>('/assistant/chat', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // GHARPLATE 3.0 ECOSYSTEM APIs (MODULES A–N)
  // ==========================================
  getFitnessProfile: (memberId?: number | null) =>
    request<Record<string, any>>(
      `/fitness/profile${memberId ? `?member_id=${memberId}` : ''}`
    ),

  updateFitnessProfile: (payload: Record<string, any>, memberId?: number | null) =>
    request<Record<string, any>>(
      `/fitness/profile${memberId ? `?member_id=${memberId}` : ''}`,
      {
        method: 'PUT',
        body: JSON.stringify(payload),
      }
    ),

  getDailyTracker: (memberId?: number | null, date?: string) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    if (date) q.set('date', date);
    const qs = q.toString();
    return request<Record<string, any>>(`/tracker/daily${qs ? `?${qs}` : ''}`);
  },

  addDailyFoodLog: (payload: Record<string, any>) =>
    request<Record<string, any>>('/tracker/food-logs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateDailyFoodLog: (entryId: number, payload: Record<string, any>) =>
    request<Record<string, any>>(`/tracker/food-logs/${entryId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteDailyFoodLog: (entryId: number) =>
    request<Record<string, any>>(`/tracker/food-logs/${entryId}`, {
      method: 'DELETE',
    }),

  copyDayMeals: (payload: {
    member_id?: number | null;
    source_date: string;
    target_date: string;
    meal_category?: string;
  }) =>
    request<Record<string, any>>('/tracker/copy-day', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  createMealTemplate: (payload: Record<string, any>) =>
    request<Record<string, any>>('/tracker/meal-templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  applyMealTemplate: (templateId: number, payload: Record<string, any>) =>
    request<Record<string, any>>(`/tracker/meal-templates/${templateId}/apply`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getDailyHydration: (memberId?: number | null, date?: string) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    if (date) q.set('date', date);
    const qs = q.toString();
    return request<Record<string, any>>(`/hydration/daily${qs ? `?${qs}` : ''}`);
  },

  addWaterLog: (payload: Record<string, any>) =>
    request<Record<string, any>>('/hydration/logs', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateWaterLog: (logId: number, payload: Record<string, any>) =>
    request<Record<string, any>>(`/hydration/logs/${logId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteWaterLog: (logId: number) =>
    request<Record<string, any>>(`/hydration/logs/${logId}`, {
      method: 'DELETE',
    }),

  updateHydrationSettings: (payload: Record<string, any>) =>
    request<Record<string, any>>('/hydration/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getFitnessGoals: (memberId?: number | null) =>
    request<Record<string, any>[]>(
      `/fitness/goals${memberId ? `?member_id=${memberId}` : ''}`
    ),

  createFitnessGoal: (payload: Record<string, any>) =>
    request<Record<string, any>[]>('/fitness/goals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateFitnessGoal: (goalId: number, payload: Record<string, any>) =>
    request<Record<string, any>[]>(`/fitness/goals/${goalId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteFitnessGoal: (goalId: number) =>
    request<Record<string, any>[]>(`/fitness/goals/${goalId}`, {
      method: 'DELETE',
    }),

  getHabits: (memberId?: number | null, date?: string) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    if (date) q.set('date', date);
    const qs = q.toString();
    return request<Record<string, any>[]>(`/fitness/habits${qs ? `?${qs}` : ''}`);
  },

  createHabit: (payload: Record<string, any>) =>
    request<Record<string, any>[]>('/fitness/habits', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateHabit: (habitId: number, payload: Record<string, any>) =>
    request<Record<string, any>[]>(`/fitness/habits/${habitId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  toggleHabitCompletion: (habitId: number, date?: string) =>
    request<Record<string, any>[]>(`/fitness/habits/${habitId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ date }),
    }),

  deleteHabit: (habitId: number) =>
    request<Record<string, any>[]>(`/fitness/habits/${habitId}`, {
      method: 'DELETE',
    }),

  getMeasurements: (memberId?: number | null) =>
    request<Record<string, any>[]>(
      `/fitness/measurements${memberId ? `?member_id=${memberId}` : ''}`
    ),

  addMeasurement: (payload: Record<string, any>) =>
    request<Record<string, any>[]>('/fitness/measurements', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getAnalyticsOverview: (memberId?: number | null, days = 30, endDate?: string) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    q.set('days', String(days));
    if (endDate) q.set('end_date', endDate);
    return request<Record<string, any>>(`/analytics/overview?${q.toString()}`);
  },

  discoverRecipes: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
    });
    const qs = q.toString();
    return request<Record<string, any>>(`/recipes/discover${qs ? `?${qs}` : ''}`);
  },

  generatePersonalRecipe: (payload: Record<string, any>) =>
    request<Record<string, any>>('/recipes/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPantryItems: () => request<Record<string, any>[]>('/pantry'),

  addPantryItem: (payload: Record<string, any>) =>
    request<Record<string, any>[]>('/pantry', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deletePantryItem: (itemId: number) =>
    request<Record<string, any>[]>(`/pantry/${itemId}`, {
      method: 'DELETE',
    }),

  getShoppingList: () => request<Record<string, any>>('/shopping-lists'),

  updateShoppingListSettings: (payload: Record<string, any>) =>
    request<Record<string, any>>('/shopping-lists/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  addRecipeToShoppingList: (payload: {
    recipe_id?: number;
    recipe_ids?: number[];
    serving_multiplier?: number;
    subtract_pantry?: boolean;
  }) =>
    request<Record<string, any>>('/shopping-lists/from-recipe', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  addShoppingListItem: (payload: Record<string, any>) =>
    request<Record<string, any>>('/shopping-lists/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateShoppingListItem: (itemId: number, payload: Record<string, any>) =>
    request<Record<string, any>>(`/shopping-lists/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteShoppingListItem: (itemId: number) =>
    request<Record<string, any>>(`/shopping-lists/items/${itemId}`, {
      method: 'DELETE',
    }),

  getProteinIntelligence: (dietaryFilter?: string, maxCost?: number) => {
    const q = new URLSearchParams();
    if (dietaryFilter) q.set('dietary_filter', dietaryFilter);
    if (maxCost) q.set('max_cost_per_10g_protein', String(maxCost));
    const qs = q.toString();
    return request<Record<string, any>>(`/protein-intelligence${qs ? `?${qs}` : ''}`);
  },

  saveLocalFoodPrice: (payload: {
    food_slug: string;
    price_inr_per_100g: number;
    package_label?: string;
  }) =>
    request<Record<string, any>>('/protein-intelligence/prices', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeMessMenu: (payload: {
    raw_menu_text: string;
    save_title?: string;
    institution_or_canteen?: string;
  }) =>
    request<Record<string, any>>('/mess-analyzer/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSavedMessMenus: () => request<Record<string, any>[]>('/mess-analyzer/menus'),

  logMessPlateToTracker: (payload: {
    member_id?: number | null;
    food_slugs: string[];
    meal_category?: string;
    logged_date?: string;
  }) =>
    request<Record<string, any>>('/mess-analyzer/log-plate', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  buildFamilyMealPlan: (payload: {
    recipe_id: number;
    member_servings?: Record<string, number>;
  }) =>
    request<Record<string, any>>('/family-meals/plan', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logFamilyMealForMember: (payload: {
    member_id: number;
    recipe_id: number;
    servings: number;
    meal_category?: string;
    logged_date?: string;
  }) =>
    request<Record<string, any>>('/family-meals/log', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSupplementIntelligence: () =>
    request<Record<string, any>>('/supplements/intelligence'),

  // ==========================================
  // HEALTH MEASUREMENT & AI HABIT INTELLIGENCE APIs
  // ==========================================
  getBloodPressure: (params?: {
    member_id?: number | null;
    days?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.member_id) q.set('member_id', String(params.member_id));
    if (params?.days) q.set('days', String(params.days));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<Record<string, any>>(`/health/blood-pressure${qs ? `?${qs}` : ''}`);
  },

  addBloodPressure: (payload: Record<string, any>) =>
    request<Record<string, any>>('/health/blood-pressure', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBloodPressure: (readingId: number, payload: Record<string, any>) =>
    request<Record<string, any>>(`/health/blood-pressure/${readingId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteBloodPressure: (readingId: number) =>
    request<Record<string, any>>(`/health/blood-pressure/${readingId}`, {
      method: 'DELETE',
    }),

  getBloodGlucose: (params?: {
    member_id?: number | null;
    days?: number;
    limit?: number;
    measurement_context?: string;
    context_filter?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.member_id) q.set('member_id', String(params.member_id));
    if (params?.days) q.set('days', String(params.days));
    if (params?.limit) q.set('limit', String(params.limit));
    const ctx = params?.context_filter || params?.measurement_context;
    if (ctx) {
      q.set('context_filter', ctx);
      q.set('measurement_context', ctx);
    }
    const qs = q.toString();
    return request<Record<string, any>>(`/health/blood-glucose${qs ? `?${qs}` : ''}`);
  },

  addBloodGlucose: (payload: Record<string, any>) =>
    request<Record<string, any>>('/health/blood-glucose', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateBloodGlucose: (readingId: number, payload: Record<string, any>) =>
    request<Record<string, any>>(`/health/blood-glucose/${readingId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteBloodGlucose: (readingId: number) =>
    request<Record<string, any>>(`/health/blood-glucose/${readingId}`, {
      method: 'DELETE',
    }),

  saveHealthMeasurementTarget: (payload: Record<string, any>) =>
    request<Record<string, any>>('/health/measurements/targets', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  getHealthMeasurementsSummary: (memberId?: number | null, days = 30) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    q.set('days', String(days));
    return request<Record<string, any>>(`/health/measurements/summary?${q.toString()}`);
  },

  getHealthMeasurementsHistory: (params?: {
    member_id?: number | null;
    category?: string;
    days?: number;
    limit?: number;
  }) => {
    const q = new URLSearchParams();
    if (params?.member_id) q.set('member_id', String(params.member_id));
    if (params?.category) q.set('category', params.category);
    if (params?.days) q.set('days', String(params.days));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<Record<string, any>>(`/health/measurements/history${qs ? `?${qs}` : ''}`);
  },

  getDailyActivityTimeline: (memberId?: number | null, date?: string, category?: string) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    if (date) q.set('date', date);
    if (category && category !== 'all') q.set('category', category);
    const qs = q.toString();
    return request<Record<string, any>>(`/health/timeline${qs ? `?${qs}` : ''}`);
  },

  proposeAiHabitPlan: (payload: {
    member_id?: number | null;
    user_goal_prompt?: string;
    prompt?: string;
    goal_description?: string;
    target_count?: number;
  }) =>
    request<Record<string, any>>('/fitness/habits/ai-plan', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        prompt: payload.prompt || payload.user_goal_prompt || payload.goal_description || '',
        goal_description:
          payload.goal_description || payload.user_goal_prompt || payload.prompt || '',
      }),
    }),

  confirmAiHabitPlan: (payload: {
    plan_id?: string;
    ai_plan_id?: string;
    member_id?: number | null;
    user_confirmed: boolean;
    habits: Record<string, any>[];
  }) =>
    request<Record<string, any>>('/fitness/habits/ai-plan/confirm', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        ai_plan_id: payload.ai_plan_id || payload.plan_id,
      }),
    }),

  modifyAiHabitPlan: (payload: {
    plan_id?: string;
    ai_plan_id?: string;
    member_id?: number | null;
    modification_prompt?: string;
    instruction?: string;
    user_confirmed?: boolean;
    current_habits?: Record<string, any>[];
  }) =>
    request<Record<string, any>>('/fitness/habits/ai-plan/modify', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        instruction: payload.instruction || payload.modification_prompt || '',
      }),
    }),

  parseNaturalLanguageFoodLog: (payload: {
    member_id?: number | null;
    message?: string;
    text?: string;
    raw_text?: string;
    logged_date?: string;
    default_meal_category?: string;
  }) =>
    request<Record<string, any>>('/tracker/food-logs/parse', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        text: payload.text || payload.raw_text || payload.message || '',
        raw_text: payload.raw_text || payload.text || payload.message || '',
      }),
    }),

  confirmNaturalLanguageFoodLog: (payload: {
    member_id?: number | null;
    user_confirmed: boolean;
    logged_date?: string;
    logged_time?: string;
    meal_category?: string;
    raw_text?: string;
    items: Record<string, any>[];
  }) =>
    request<Record<string, any>>('/tracker/food-logs/confirm-parsed', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // PERSISTENT ACHIEVEMENT & REWARD SYSTEM APIs
  // ==========================================
  getMemberAchievements: (memberId?: number | null) =>
    request<Record<string, any>>(
      `/fitness/achievements${memberId ? `?member_id=${memberId}` : ''}`
    ),

  migrateLocalAchievements: (payload: {
    member_id?: number | null;
    badge_codes: string[];
  }) =>
    request<Record<string, any>>('/fitness/achievements/migrate-local', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  markAchievementsSeen: (payload: {
    member_id?: number | null;
    achievement_codes?: string[];
  }) =>
    request<Record<string, any>>('/fitness/achievements/seen', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateAchievementPreferences: (payload: {
    member_id?: number | null;
    rewards_enabled: boolean;
  }) =>
    request<Record<string, any>>('/fitness/achievements/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // INTERACTIVE 3D HUMAN BODY & NUTRITION EXPLORER APIs
  // ==========================================
  getBodyNutritionRegions: () =>
    request<Record<string, any>>('/explore/body-nutrition'),

  getBodyNutritionRegionDetail: (
    regionCode: string,
    params?: { member_id?: number | null; dietary_preference?: string | null }
  ) => {
    const q = new URLSearchParams();
    if (params?.member_id) q.set('member_id', String(params.member_id));
    if (params?.dietary_preference) q.set('dietary_preference', params.dietary_preference);
    const qs = q.toString();
    return request<Record<string, any>>(
      `/explore/body-nutrition/${encodeURIComponent(regionCode)}${qs ? `?${qs}` : ''}`
    );
  },

  // ==========================================
  // HEALTH REPORT INTELLIGENCE & AI SYMPTOM REVIEW APIs (PARTS A & B)
  // ==========================================
  extractHealthReportFile: (
    file: File,
    params?: { member_id?: number | null; report_title?: string; report_type?: string }
  ) => {
    const fd = new FormData();
    fd.append('file', file);
    if (params?.member_id) fd.append('member_id', String(params.member_id));
    if (params?.report_title) fd.append('report_title', params.report_title);
    if (params?.report_type) fd.append('report_type', params.report_type);
    return request<Record<string, any>>('/health/reports/extract', {
      method: 'POST',
      body: fd,
    });
  },

  extractHealthReportText: (payload: {
    member_id?: number | null;
    raw_report_text: string;
    report_title?: string;
    report_type?: string;
    laboratory_name?: string;
    report_date?: string;
  }) =>
    request<Record<string, any>>('/health/reports/extract-text', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  confirmHealthReport: (payload: Record<string, any>) =>
    request<Record<string, any>>('/health/reports/confirm', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getHealthReports: (memberId?: number | null) =>
    request<Record<string, any>[]>(
      `/health/reports${memberId ? `?member_id=${memberId}` : ''}`
    ),

  getHealthReportTrends: (memberId?: number | null, canonicalCode?: string) => {
    const q = new URLSearchParams();
    if (memberId) q.set('member_id', String(memberId));
    if (canonicalCode) q.set('canonical_code', canonicalCode);
    const qs = q.toString();
    return request<Record<string, any>>(
      `/health/reports/trends${qs ? `?${qs}` : ''}`
    );
  },

  deleteHealthReport: (reportId: number, memberId?: number | null) =>
    request<{ deleted: boolean; report_id: number }>(
      `/health/reports/${reportId}${memberId ? `?member_id=${memberId}` : ''}`,
      { method: 'DELETE' }
    ),

  evaluateSymptomReview: (payload: Record<string, any>) =>
    request<Record<string, any>>('/health/symptom-review', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getSymptomReviewHistory: (memberId?: number | null) =>
    request<Record<string, any>[]>(
      `/health/symptom-review/history${memberId ? `?member_id=${memberId}` : ''}`
    ),

  // ==========================================
  // SMART NEARBY FOOD DISCOVERY, MAPS & ORDERING APIs (PARTS C, D, E, F)
  // ==========================================
  getFoodDiscoveryProviders: () =>
    request<Record<string, any>>('/food-discovery/providers'),

  geocodeFoodDiscoveryLocation: (q: string) =>
    request<Record<string, any>>(`/food-discovery/geocode?q=${encodeURIComponent(q)}`),

  getFoodDiscoveryPreferences: (memberId?: number | null) =>
    request<Record<string, any>>(
      `/food-discovery/preferences${memberId ? `?member_id=${memberId}` : ''}`
    ),

  updateFoodDiscoveryPreferences: (payload: Record<string, any>) =>
    request<Record<string, any>>('/food-discovery/preferences', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  searchFoodNearby: (payload: Record<string, any>) =>
    request<Record<string, any>>('/food-discovery/search', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  prepareSwiggyMcpPreview: (payload: Record<string, any>) =>
    request<Record<string, any>>('/food-discovery/swiggy-mcp/preview', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  logRestaurantMealToDiary: (payload: Record<string, any>) =>
    request<Record<string, any>>('/food-discovery/log-meal', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // ==========================================
  // NUTRIENT EXPLORER & EXPANDED INDIAN FOOD COMPOSITION APIs
  // ==========================================
  getNutrientCatalog: (params?: { q?: string; group?: string }) => {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.group) sp.set('group', params.group);
    const qs = sp.toString();
    return request<Record<string, any>>(`/nutrients/catalog${qs ? `?${qs}` : ''}`);
  },

  searchFoodsByNutrient: (params: {
    q: string;
    dietary_preference?: string;
    food_form?: string;
    category_slug?: string;
    sort_by?: string;
    limit?: number;
  }) => {
    const sp = new URLSearchParams();
    sp.set('q', params.q);
    if (params.dietary_preference) sp.set('dietary_preference', params.dietary_preference);
    if (params.food_form) sp.set('food_form', params.food_form);
    if (params.category_slug) sp.set('category_slug', params.category_slug);
    if (params.sort_by) sp.set('sort_by', params.sort_by);
    if (params.limit) sp.set('limit', String(params.limit));
    return request<Record<string, any>>(`/nutrients/search?${sp.toString()}`);
  },

  getNutrientImportSummary: () =>
    request<Record<string, any>>('/nutrients/import-summary'),
};

