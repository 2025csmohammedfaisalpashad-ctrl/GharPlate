import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FoodImage } from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';

// ==========================================
// 1. RECIPE DISCOVERY, RECOMMENDATIONS & PERSONAL RECIPE GENERATOR (MODULES F & N)
// ==========================================
export const RecipeDiscoveryPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [mealType, setMealType] = useState('');
  const [dietFilter, setDietFilter] = useState(
    activeMember?.dietary_preference || ''
  );
  const [goalFilter, setGoalFilter] = useState(
    activeMember?.primary_goal || ''
  );
  const [includeOnline, setIncludeOnline] = useState(false);
  const [discovery, setDiscovery] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [groceryFeedback, setGroceryFeedback] = useState<string | null>(null);

  // Personal Recipe Generator state (Section 8.5)
  const [genPrompt, setGenPrompt] = useState(
    'Give me a vegetarian meal using paneer, rice and tomatoes that supports my fitness goal.'
  );
  const [genResult, setGenResult] = useState<Record<string, any> | null>(null);
  const [generating, setGenerating] = useState(false);

  const loadDiscovery = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.discoverRecipes({
        member_id: activeMember?.id,
        q: query || undefined,
        meal_type: mealType || undefined,
        dietary_preference: dietFilter || undefined,
        fitness_goal: goalFilter || undefined,
        include_online: includeOnline,
      });
      setDiscovery(res);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [activeMember?.id, query, mealType, dietFilter, goalFilter, includeOnline]);

  useEffect(() => {
    void loadDiscovery();
  }, [loadDiscovery]);

  const handleGetIngredients = async (recipeId: number, title: string) => {
    const res = await api.addRecipeToShoppingList({
      recipe_id: recipeId,
      subtract_pantry: true,
    });
    setGroceryFeedback(
      `Added missing ingredients for “${title}” to Smart Grocery List (${res.unpurchased_count} unpurchased items).`
    );
  };

  const handleGenerateRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await api.generatePersonalRecipe({
        member_id: activeMember?.id,
        prompt: genPrompt,
        dietary_preference: dietFilter || activeMember?.dietary_preference || 'vegetarian',
        fitness_goal: goalFilter || activeMember?.primary_goal || 'build_muscle',
        meal_type: mealType || 'lunch',
        servings: 2,
        save_recipe: true,
      });
      setGenResult(res);
      await loadDiscovery();
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div data-testid="recipe-discovery-page" className="space-y-8">
      {/* Header & Search Filters */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-950">
              🍲 Profile-Aware Recipe Discovery &amp; Online Adapters
            </span>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-stone-900">
              Recipe Discovery &amp; Personal Recommendations
            </h1>
            <p className="text-xs text-stone-500">
              Tailored to your dietary preference, fitness goal, pantry inventory, and health considerations.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/kitchen/grocery"
              className="rounded-2xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-stone-950 shadow-xs hover:bg-amber-300"
            >
              🛒 Smart Shopping List &amp; Pantry →
            </Link>
            <Link
              to="/recipes/calculator"
              className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-xs font-bold text-stone-800"
            >
              + Custom Calculator
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-12 text-xs">
          <input
            type="text"
            data-testid="recipe-discovery-search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search recipes or ingredients (Ragi, Paneer, Soya, Khichdi, Idli)..."
            className="sm:col-span-4 rounded-xl border border-stone-300 px-3.5 py-2.5"
          />
          <select
            value={dietFilter}
            onChange={(e) => setDietFilter(e.target.value)}
            className="sm:col-span-2 rounded-xl border border-stone-300 bg-white px-2.5 py-2.5 font-bold"
          >
            <option value="">All Diets</option>
            <option value="vegetarian">Vegetarian</option>
            <option value="vegan">Vegan</option>
            <option value="eggetarian">Eggetarian</option>
            <option value="non_vegetarian">Non-Vegetarian</option>
          </select>
          <select
            value={mealType}
            onChange={(e) => setMealType(e.target.value)}
            className="sm:col-span-2 rounded-xl border border-stone-300 bg-white px-2.5 py-2.5 font-bold"
          >
            <option value="">All Meal Types</option>
            <option value="breakfast">Breakfast</option>
            <option value="lunch">Lunch</option>
            <option value="dinner">Dinner</option>
            <option value="pre_workout">Pre-Workout</option>
            <option value="post_workout">Post-Workout</option>
          </select>
          <select
            value={goalFilter}
            onChange={(e) => setGoalFilter(e.target.value)}
            className="sm:col-span-2 rounded-xl border border-stone-300 bg-white px-2.5 py-2.5 font-bold"
          >
            <option value="">Any Goal</option>
            <option value="build_muscle">Build Muscle</option>
            <option value="manage_health_condition">Manage Condition</option>
            <option value="lose_body_fat">Lose Body Fat</option>
            <option value="maintain_balanced_diet">Balanced Diet</option>
          </select>
          <label className="sm:col-span-2 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 font-bold cursor-pointer">
            <input
              type="checkbox"
              checked={includeOnline}
              onChange={(e) => setIncludeOnline(e.target.checked)}
              className="rounded border-stone-300 text-emerald-700"
            />
            Include Online APIs
          </label>
        </div>

        {groceryFeedback && (
          <div
            data-testid="recipe-grocery-added-banner"
            className="flex items-center justify-between rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-950"
          >
            <span>✓ {groceryFeedback}</span>
            <button
              type="button"
              onClick={() => navigate('/kitchen/grocery')}
              className="rounded-xl bg-emerald-800 px-3 py-1 text-white"
            >
              View Shopping List →
            </button>
          </div>
        )}
      </section>

      {/* Personal Recipe Generator from Verified DB Ingredients (Section 8.5) */}
      <section className="rounded-3xl border border-emerald-200 bg-emerald-50/50 p-6 shadow-xs space-y-4">
        <div>
          <h2 className="text-base font-black text-emerald-950">
            ✨ Personal Recipe Generator (100% Database-Verified Nutrition)
          </h2>
          <p className="text-xs text-stone-600">
            Describe the ingredients you have and your goal — GharPlate matches verified IFCT/ICMR-NIN records and computes exact macros without LLM hallucination.
          </p>
        </div>

        <form onSubmit={(e) => void handleGenerateRecipe(e)} className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            data-testid="personal-recipe-prompt-input"
            value={genPrompt}
            onChange={(e) => setGenPrompt(e.target.value)}
            className="flex-1 rounded-2xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-semibold text-stone-900"
          />
          <button
            type="submit"
            disabled={generating}
            data-testid="generate-personal-recipe-btn"
            className="rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {generating ? 'Calculating from DB...' : 'Generate & Calculate Recipe'}
          </button>
        </form>

        {genResult?.generated_recipe && (
          <div
            data-testid="generated-recipe-result-card"
            className="rounded-2xl border border-emerald-300 bg-white p-4 text-xs space-y-2"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm font-black text-stone-900">
                {genResult.generated_recipe.title}
              </strong>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-900">
                {genResult.generated_recipe.completeness_pct}% Nutrient Data Complete
              </span>
            </div>
            <p className="text-stone-600">{genResult.nutrition_provenance_notice}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() =>
                  void handleGetIngredients(
                    genResult.generated_recipe.id,
                    genResult.generated_recipe.title
                  )
                }
                className="rounded-xl bg-amber-400 px-3.5 py-1.5 font-extrabold text-stone-950"
              >
                🛒 Get Ingredients
              </button>
              <Link
                to={`/recipes/calculator?edit=${genResult.generated_recipe.id}`}
                className="rounded-xl border border-stone-300 px-3.5 py-1.5 font-bold text-stone-800"
              >
                Edit in Calculator →
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Verified Local Recipes Grid */}
      <section className="space-y-4">
        <h2 className="text-lg font-black text-stone-900">
          Recommended Recipes ({discovery?.local_verified_recipes?.length || 0})
        </h2>

        {loading && !discovery ? (
          <div className="h-52 animate-pulse rounded-3xl bg-stone-200/70" />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {(discovery?.local_verified_recipes || []).map((rec: any) => (
              <div
                key={rec.id}
                data-testid={`discovered-recipe-card-${rec.id}`}
                className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm flex flex-col justify-between"
              >
                <div>
                  <FoodImage
                    src={rec.image_url}
                    foodName={rec.title}
                    categorySlug="indian-dishes"
                    aspectClass="aspect-[16/10]"
                  />
                  <div className="p-5 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="uppercase text-emerald-800">
                        {rec.meal_type.replace('_', ' ')} • {rec.servings} servings
                      </span>
                      {rec.estimated_cost_inr && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-950">
                          ~₹{rec.estimated_cost_inr}
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-extrabold text-stone-900">
                      {rec.title}
                    </h3>
                    <p className="text-xs text-stone-600 line-clamp-2">
                      {rec.why_recommended}
                    </p>

                    <div className="flex flex-wrap gap-1.5 text-xs pt-1">
                      <span className="rounded-xl bg-stone-100 px-2.5 py-1 font-bold">
                        {rec.per_serving_macros?.energy_kcal ?? 'NULL'} kcal
                      </span>
                      <span className="rounded-xl bg-emerald-50 px-2.5 py-1 font-extrabold text-emerald-900">
                        {rec.per_serving_macros?.protein_g ?? 'NULL'}g Protein
                      </span>
                      <span className="rounded-xl bg-teal-50 px-2.5 py-1 font-bold text-teal-900">
                        {rec.per_serving_macros?.fibre_g ?? 'NULL'}g Fibre
                      </span>
                    </div>

                    <div className="text-[10px] text-stone-400">
                      Source: {rec.source_name} ({rec.completeness_pct}% complete)
                    </div>
                  </div>
                </div>

                <div className="border-t border-stone-100 px-5 py-3.5 flex items-center justify-between gap-2 text-xs">
                  <button
                    type="button"
                    data-testid={`get-ingredients-btn-${rec.id}`}
                    onClick={() => void handleGetIngredients(rec.id, rec.title)}
                    className="rounded-xl bg-amber-400 px-3.5 py-1.5 font-extrabold text-stone-950 hover:bg-amber-300 transition"
                  >
                    🛒 Get Ingredients
                  </button>
                  <Link
                    to={`/recipes/calculator?edit=${rec.id}`}
                    className="font-extrabold text-emerald-800 hover:underline"
                  >
                    Adjust Servings →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

// ==========================================
// 2. SMART PANTRY & CONSOLIDATED GROCERY SHOPPING LIST (MODULES G & H)
// ==========================================
export const SmartGroceryPantryPage: React.FC = () => {
  const [pantry, setPantry] = useState<Record<string, any>[]>([]);
  const [shoppingList, setShoppingList] = useState<Record<string, any> | null>(null);
  const [newPantryName, setNewPantryName] = useState('');
  const [newPantrySlug, setNewPantrySlug] = useState('');
  const [newPantryGrams, setNewPantryGrams] = useState('500');

  const [newShopItemName, setNewShopItemName] = useState('');
  const [newShopItemQty, setNewShopItemQty] = useState('250');

  const [pincode, setPincode] = useState('');
  const [locationConsent, setLocationConsent] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        api.getPantryItems(),
        api.getShoppingList(),
      ]);
      setPantry(pRes);
      setShoppingList(sRes);
      setPincode(sRes.delivery_pincode || '');
      setLocationConsent(Boolean(sRes.location_consent_given));
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleAddPantry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPantryName.trim() && !newPantrySlug.trim()) return;
    const updated = await api.addPantryItem({
      food_slug: newPantrySlug.trim() || undefined,
      ingredient_name: newPantryName.trim() || newPantrySlug.trim(),
      available_quantity: Number(newPantryGrams) || 500,
      grams_available: Number(newPantryGrams) || 500,
      unit_name: 'g',
      in_stock: true,
    });
    setPantry(updated);
    setNewPantryName('');
    setNewPantrySlug('');
  };

  const handleDeletePantry = async (id: number) => {
    const updated = await api.deletePantryItem(id);
    setPantry(updated);
  };

  const handleAddShopItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShopItemName.trim()) return;
    const updated = await api.addShoppingListItem({
      ingredient_name: newShopItemName.trim(),
      quantity: Number(newShopItemQty) || 250,
      grams_needed: Number(newShopItemQty) || 250,
      unit_name: 'g',
    });
    setShoppingList(updated);
    setNewShopItemName('');
  };

  const handleTogglePurchased = async (item: any) => {
    const updated = await api.updateShoppingListItem(item.id, {
      is_purchased: !item.is_purchased,
    });
    setShoppingList(updated);
  };

  const handleDeleteShopItem = async (itemId: number) => {
    const updated = await api.deleteShoppingListItem(itemId);
    setShoppingList(updated);
  };

  const handleSaveLocationSettings = async () => {
    const updated = await api.updateShoppingListSettings({
      delivery_pincode: pincode,
      location_consent_given: locationConsent,
    });
    setShoppingList(updated);
  };

  return (
    <div data-testid="smart-grocery-pantry-page" className="space-y-8">
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-3">
        <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-extrabold text-amber-950">
          🛒 Consolidated Smart Grocery List &amp; Pantry Inventory
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
          Smart Grocery List &amp; Instant Retailer Search
        </h1>
        <p className="text-xs text-stone-500">
          {shoppingList?.retailer_transparency_notice}
        </p>

        {/* Optional Delivery PIN Code with Explicit Consent */}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5 text-xs">
          <input
            type="text"
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            placeholder="Delivery PIN Code (optional, e.g. 570001)"
            className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 font-mono font-bold w-56"
          />
          <label className="inline-flex items-center gap-2 font-semibold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={locationConsent}
              onChange={(e) => setLocationConsent(e.target.checked)}
              className="rounded border-stone-300 text-emerald-800"
            />
            I consent to using my PIN code to annotate retailer search links.
          </label>
          <button
            type="button"
            onClick={() => void handleSaveLocationSettings()}
            className="rounded-xl bg-stone-900 px-3.5 py-1.5 font-bold text-white"
          >
            Update PIN Preference
          </button>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Consolidated Shopping List & Buy Now Retailer Destinations */}
        <div className="lg:col-span-7 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-black text-stone-900">
                Consolidated Shopping List ({shoppingList?.items?.length || 0} items)
              </h2>
              <p className="text-xs text-stone-500">
                Duplicate ingredients across multiple recipes are automatically combined.
              </p>
            </div>
            {(shoppingList?.total_estimated_cost_inr || 0) > 0 && (
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-950">
                Est. Total: ~₹{shoppingList?.total_estimated_cost_inr}
              </span>
            )}
          </div>

          <form onSubmit={(e) => void handleAddShopItem(e)} className="flex gap-2 text-xs">
            <input
              type="text"
              data-testid="new-shopping-item-input"
              value={newShopItemName}
              onChange={(e) => setNewShopItemName(e.target.value)}
              placeholder="Add ingredient (e.g. Curd, Tomato, Paneer)..."
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2"
            />
            <input
              type="number"
              value={newShopItemQty}
              onChange={(e) => setNewShopItemQty(e.target.value)}
              className="w-24 rounded-xl border border-stone-300 px-2.5 py-2 font-bold"
              title="Grams needed"
            />
            <button
              type="submit"
              data-testid="add-shopping-item-btn"
              className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white"
            >
              + Add Item
            </button>
          </form>

          {(shoppingList?.items || []).length === 0 ? (
            <div className="rounded-2xl bg-stone-50 p-6 text-center text-xs text-stone-500">
              Your shopping list is empty. Click <strong>“Get Ingredients”</strong> on any recipe or add an item above.
            </div>
          ) : (
            <div className="space-y-3">
              {(shoppingList?.items || []).map((item: any) => (
                <div
                  key={item.id}
                  data-testid={`shopping-list-item-${item.id}`}
                  className={`rounded-2xl border p-4 space-y-2.5 text-xs ${
                    item.is_purchased
                      ? 'border-stone-200 bg-stone-50 opacity-65'
                      : 'border-stone-200/90 bg-white shadow-2xs'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={item.is_purchased}
                        onChange={() => void handleTogglePurchased(item)}
                        className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                      />
                      <div>
                        <span
                          className={`text-sm font-extrabold ${
                            item.is_purchased
                              ? 'line-through text-stone-400'
                              : 'text-stone-900'
                          }`}
                        >
                          {item.ingredient_name}
                        </span>
                        <span className="ml-2 font-mono font-bold text-emerald-800">
                          {item.grams_needed} g
                        </span>
                        {item.related_recipes?.length > 0 && (
                          <div className="text-[11px] text-stone-500">
                            Used in: {item.related_recipes.join(' + ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDeleteShopItem(item.id)}
                      className="text-stone-400 hover:text-rose-700 font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Verified Indian Grocery Retailer Search Destinations */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-bold uppercase text-stone-400 mr-1">
                      Buy / Search Online:
                    </span>
                    {(item.retailer_destinations || []).map((ret: any) => (
                      <a
                        key={ret.retailer_code}
                        href={ret.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`retailer-link-${ret.retailer_code}-${item.id}`}
                        title={ret.availability_note}
                        className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-extrabold text-emerald-950 hover:bg-emerald-100 transition"
                      >
                        {ret.retailer_name} ↗
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Household Pantry Inventory */}
        <div className="lg:col-span-5 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <div>
            <h2 className="text-base font-black text-stone-900">
              Household Pantry Inventory ({pantry.length})
            </h2>
            <p className="text-xs text-stone-500">
              Items marked in-stock here are automatically subtracted when generating recipe shopping lists.
            </p>
          </div>

          <form onSubmit={(e) => void handleAddPantry(e)} className="space-y-2 text-xs">
            <div className="flex gap-2">
              <input
                type="text"
                data-testid="pantry-name-input"
                value={newPantryName}
                onChange={(e) => setNewPantryName(e.target.value)}
                placeholder="Ingredient name (e.g. Ragi, Spinach)..."
                className="flex-1 rounded-xl border border-stone-300 px-3 py-2"
              />
              <input
                type="number"
                value={newPantryGrams}
                onChange={(e) => setNewPantryGrams(e.target.value)}
                className="w-24 rounded-xl border border-stone-300 px-2.5 py-2 font-bold"
                placeholder="Grams"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newPantrySlug}
                onChange={(e) => setNewPantrySlug(e.target.value)}
                placeholder="Optional catalog slug (e.g. tomato-ripe)"
                className="flex-1 rounded-xl border border-stone-300 px-3 py-1.5 font-mono text-[11px]"
              />
              <button
                type="submit"
                data-testid="add-pantry-btn"
                className="rounded-xl bg-stone-900 px-4 py-1.5 font-extrabold text-white"
              >
                + Mark Available
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {pantry.map((p) => (
              <div
                key={p.id}
                data-testid={`pantry-item-${p.id}`}
                className="flex items-center justify-between rounded-2xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-xs"
              >
                <div>
                  <strong className="text-stone-900">{p.ingredient_name}</strong> •{' '}
                  <span className="font-mono text-emerald-800 font-bold">
                    {p.grams_available} g available
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleDeletePantry(p.id)}
                  className="text-stone-400 hover:text-rose-700 font-bold"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. INDIAN PROTEIN & BUDGET INTELLIGENCE (MODULE I)
// ==========================================
export const ProteinIntelligencePage: React.FC = () => {
  const [dietFilter, setDietFilter] = useState('');
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState('');

  const loadData = useCallback(async () => {
    try {
      const res = await api.getProteinIntelligence(dietFilter || undefined);
      setData(res);
    } catch {
      // ignore
    }
  }, [dietFilter]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveCustomPrice = async (slug: string) => {
    const num = Number(priceDraft);
    if (!Number.isFinite(num) || num <= 0) return;
    const res = await api.saveLocalFoodPrice({
      food_slug: slug,
      price_inr_per_100g: num,
    });
    setData(res);
    setEditingSlug(null);
    setPriceDraft('');
  };

  return (
    <div data-testid="protein-intelligence-page" className="space-y-8">
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="max-w-2xl">
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-950">
            💪 Student &amp; Gym-Goer Affordability Engine
          </span>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-stone-900">
            Indian Protein &amp; Budget Intelligence
          </h1>
          <p className="text-xs text-stone-500">
            {data?.whole_food_first_disclaimer}
          </p>
        </div>

        <select
          aria-label="Filter Protein Sources by Diet"
          data-testid="protein-diet-filter"
          value={dietFilter}
          onChange={(e) => setDietFilter(e.target.value)}
          className="rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-extrabold text-stone-800"
        >
          <option value="">All Dietary Styles</option>
          <option value="vegetarian">Vegetarian Only</option>
          <option value="vegan">Vegan Only</option>
          <option value="non_vegetarian">Non-Vegetarian / Eggs / Fish</option>
        </select>
      </section>

      <section className="overflow-x-auto rounded-3xl border border-stone-200/90 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-stone-200 bg-stone-50 text-stone-600 uppercase text-[11px]">
            <tr>
              <th className="p-4">Indian Protein Source</th>
              <th className="p-4">Protein / 100g</th>
              <th className="p-4">Protein / Serving</th>
              <th className="p-4">Energy / 100g</th>
              <th className="p-4">Local Price / 100g (Editable)</th>
              <th className="p-4">Cost per 10g Protein</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {(data?.items || []).map((item: any) => (
              <tr
                key={item.food_slug}
                data-testid={`protein-row-${item.food_slug}`}
                className="hover:bg-stone-50/80"
              >
                <td className="p-4">
                  <Link
                    to={`/foods/${item.food_slug}`}
                    className="font-extrabold text-stone-900 hover:text-emerald-800"
                  >
                    {item.name_en}
                  </Link>
                  <div className="text-[11px] text-stone-500">
                    {item.standard_serving_name} ({item.standard_serving_grams}g) •{' '}
                    {item.is_vegetarian ? 'Veg' : 'Non-Veg'}
                  </div>
                </td>
                <td className="p-4 font-mono font-black text-emerald-900">
                  {item.protein_per_100g} g
                </td>
                <td className="p-4 font-mono font-bold text-stone-800">
                  {item.protein_per_serving_g} g
                </td>
                <td className="p-4 font-mono text-stone-600">
                  {item.energy_per_100g_kcal ?? 'NULL'} kcal
                </td>
                <td className="p-4">
                  {editingSlug === item.food_slug ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.5"
                        data-testid={`price-input-${item.food_slug}`}
                        value={priceDraft}
                        onChange={(e) => setPriceDraft(e.target.value)}
                        className="w-20 rounded-lg border border-emerald-600 px-2 py-1 font-mono font-bold"
                      />
                      <button
                        type="button"
                        data-testid={`save-price-btn-${item.food_slug}`}
                        onClick={() => void handleSaveCustomPrice(item.food_slug)}
                        className="rounded-lg bg-emerald-800 px-2.5 py-1 text-[11px] font-bold text-white"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-stone-900">
                        {item.price_inr_per_100g !== null
                          ? `₹${item.price_inr_per_100g}`
                          : 'Not set'}
                      </span>
                      <button
                        type="button"
                        data-testid={`edit-price-btn-${item.food_slug}`}
                        onClick={() => {
                          setEditingSlug(item.food_slug);
                          setPriceDraft(String(item.price_inr_per_100g || 15));
                        }}
                        className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 hover:bg-stone-100"
                      >
                        Edit ₹
                      </button>
                    </div>
                  )}
                </td>
                <td className="p-4">
                  {item.cost_per_10g_protein_inr !== null ? (
                    <span className="rounded-full bg-amber-100 px-3 py-1 font-mono font-black text-amber-950">
                      ₹{item.cost_per_10g_protein_inr} / 10g P
                    </span>
                  ) : (
                    <span className="text-stone-400">Enter price</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
};

// ==========================================
// 4. SMART MESS ANALYZER, FAMILY MEAL PLANNER & SUPPLEMENT INTELLIGENCE (MODULES J, K, L)
// ==========================================
export const MessAndFamilyEcosystemPage: React.FC = () => {
  const { household, activeMember } = useHousehold();
  const [menuText, setMenuText] = useState('Idli, Sambar, Rice, Toor Dal, Curd, Paneer');
  const [menuTitle, setMenuTitle] = useState('Hostel Mess Lunch Plate');
  const [messResult, setMessResult] = useState<Record<string, any> | null>(null);
  const [logBanner, setLogBanner] = useState<string | null>(null);

  // Family Meal Planner state (Module K)
  const [recipes, setRecipes] = useState<Record<string, any>[]>([]);
  const [selectedRecipeId, setSelectedRecipeId] = useState<number | null>(null);
  const [familyPlan, setFamilyPlan] = useState<Record<string, any> | null>(null);

  // Supplement Intelligence state (Module L)
  const [suppIntel, setSuppIntel] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    void api
      .listRecipes(household?.household_token)
      .then((res) => {
        setRecipes(res);
        if (res.length > 0) setSelectedRecipeId(res[0].id);
      })
      .catch(() => null);
    void api.getSupplementIntelligence().then(setSuppIntel).catch(() => null);
  }, [household?.household_token]);

  const handleAnalyzeMess = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.analyzeMessMenu({
      raw_menu_text: menuText,
      save_title: menuTitle,
    });
    setMessResult(res);
  };

  const handleLogMessPlate = async () => {
    if (!messResult) return;
    const slugs = (messResult.matched_dishes || [])
      .map((d: any) => d.matched_food?.slug)
      .filter(Boolean);
    if (slugs.length === 0) return;
    const res = await api.logMessPlateToTracker({
      member_id: activeMember?.id,
      food_slugs: slugs,
      meal_category: 'lunch',
    });
    setLogBanner(`Logged ${res.logged_count} confirmed mess dish(es) to My Daily Tracker.`);
  };

  const handleBuildFamilyPlan = async () => {
    if (!selectedRecipeId) return;
    const res = await api.buildFamilyMealPlan({ recipe_id: selectedRecipeId });
    setFamilyPlan(res);
  };

  return (
    <div data-testid="mess-and-family-page" className="space-y-10">
      {/* MODULE J: SMART MESS & CANTEEN ANALYZER */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-5">
        <div>
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-950">
            🍱 Smart Mess, Hostel &amp; Canteen Food Analyzer
          </span>
          <h1 className="mt-1.5 text-2xl sm:text-3xl font-black text-stone-900">
            Analyse Mess Menus &amp; Plan Multi-Goal Family Meals
          </h1>
          <p className="text-xs text-stone-500">
            Paste a college/hostel mess menu to match Indian dishes against IFCT 2017 records, review estimated plate macros, and log directly to your Daily Tracker.
          </p>
        </div>

        <form onSubmit={(e) => void handleAnalyzeMess(e)} className="grid gap-3 sm:grid-cols-12 text-xs">
          <input
            type="text"
            value={menuTitle}
            onChange={(e) => setMenuTitle(e.target.value)}
            placeholder="Menu label (e.g. Wednesday Hostel Lunch)"
            className="sm:col-span-3 rounded-xl border border-stone-300 px-3.5 py-2.5 font-bold"
          />
          <input
            type="text"
            data-testid="mess-menu-text-input"
            value={menuText}
            onChange={(e) => setMenuText(e.target.value)}
            placeholder="Enter dishes separated by commas (e.g. Idli, Sambar, Rice, Curd)..."
            className="sm:col-span-6 rounded-xl border border-stone-300 px-3.5 py-2.5"
          />
          <button
            type="submit"
            data-testid="analyze-mess-menu-btn"
            className="sm:col-span-3 rounded-xl bg-emerald-800 px-4 py-2.5 font-extrabold text-white hover:bg-emerald-700"
          >
            🔍 Analyse Mess Menu
          </button>
        </form>

        {logBanner && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-950">
            ✓ {logBanner}
          </div>
        )}

        {messResult && (
          <div
            data-testid="mess-analysis-results"
            className="rounded-2xl border border-stone-200 bg-stone-50 p-5 space-y-4 text-xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-black text-sm text-stone-900">
                  Combined Plate Estimate:{' '}
                  <span className="text-emerald-800">
                    {messResult.combined_plate_estimate.energy_kcal} kcal •{' '}
                    {messResult.combined_plate_estimate.protein_g}g Protein •{' '}
                    {messResult.combined_plate_estimate.fibre_g}g Fibre
                  </span>
                </div>
                <p className="text-[11px] text-stone-500">
                  {messResult.estimation_disclaimer}
                </p>
              </div>
              <button
                type="button"
                data-testid="log-mess-plate-btn"
                onClick={() => void handleLogMessPlate()}
                className="rounded-xl bg-amber-400 px-4 py-2 font-extrabold text-stone-950 shadow-2xs"
              >
                + Log Confirmed Plate to Daily Tracker
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {(messResult.matched_dishes || []).map((d: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-2xl border border-stone-200 bg-white p-3.5 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-stone-500">
                      “{d.menu_item_text}”
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        d.match_status === 'exact_match'
                          ? 'bg-emerald-100 text-emerald-900'
                          : 'bg-amber-100 text-amber-950'
                      }`}
                    >
                      {d.match_status === 'exact_match'
                        ? 'Exact Match'
                        : 'Confirm Possible Match'}
                    </span>
                  </div>
                  {d.matched_food ? (
                    <>
                      <div className="font-extrabold text-stone-900">
                        → {d.matched_food.name_en}
                      </div>
                      <div className="font-mono text-[11px] text-emerald-800">
                        {d.matched_food.estimated_serving_nutrients.energy_kcal ?? 'NULL'} kcal •{' '}
                        {d.matched_food.estimated_serving_nutrients.protein_g ?? 'NULL'}g P
                      </div>
                    </>
                  ) : (
                    <div className="text-rose-800">Unmatched item</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* MODULE K: ONE FAMILY MEAL, MULTIPLE NUTRITION GOALS */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-extrabold text-amber-950">
              👨‍👩‍👧‍👦 One Family Meal, Multiple Nutrition Goals
            </span>
            <h2 className="mt-1.5 text-xl font-black text-stone-900">
              Household Portion &amp; Multi-Goal Meal Personalisation
            </h2>
            <p className="text-xs text-stone-500">
              Select one shared household recipe to calculate tailored serving multipliers and guidance for each family member (e.g., Muscle Gain vs. Diabetes vs. General Health).
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <select
              aria-label="Select Shared Family Recipe"
              value={selectedRecipeId ?? ''}
              onChange={(e) => setSelectedRecipeId(Number(e.target.value))}
              className="rounded-xl border border-stone-300 bg-white px-3 py-2 font-bold"
            >
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              data-testid="calculate-family-portions-btn"
              onClick={() => void handleBuildFamilyPlan()}
              className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white"
            >
              Calculate Member Portions
            </button>
          </div>
        </div>

        {familyPlan && (
          <div
            data-testid="family-meal-plan-results"
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 pt-2"
          >
            {(familyPlan.member_plans || []).map((mp: any) => (
              <div
                key={mp.member_id}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <strong className="text-sm font-black text-stone-900">
                    {mp.display_name}
                  </strong>
                  <span className="rounded-full bg-emerald-800 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                    {mp.serving_multiplier}× Portion ({mp.portion_grams}g)
                  </span>
                </div>
                <div className="text-[11px] font-bold text-stone-600 capitalize">
                  Goal: {(mp.primary_goal || '').replace(/_/g, ' ')} •{' '}
                  {mp.selected_conditions.length} condition(s)
                </div>
                <div className="rounded-xl bg-white p-2.5 font-mono font-bold text-emerald-900">
                  {mp.calculated_nutrition.energy_kcal ?? 'NULL'} kcal •{' '}
                  {mp.calculated_nutrition.protein_g ?? 'NULL'}g P •{' '}
                  {mp.calculated_nutrition.carbs_g ?? 'NULL'}g C
                </div>
                {mp.practical_adjustments.map((adj: string, i: number) => (
                  <p key={i} className="text-[11px] text-stone-600">
                    • {adj}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MODULE L: SUPPLEMENT & PACKAGED PRODUCT INTELLIGENCE */}
      {suppIntel && (
        <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-4">
          <div>
            <span className="rounded-full bg-purple-100 px-3 py-0.5 text-xs font-extrabold text-purple-950">
              🏷️ Supplement &amp; Packaged Product Label Intelligence
            </span>
            <h2 className="mt-1.5 text-xl font-black text-stone-900">
              Understanding Supplement &amp; Packaged Claims vs. Whole Foods
            </h2>
            <p className="text-xs text-stone-500">{suppIntel.neutrality_disclaimer}</p>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            {(suppIntel.label_terminology_guide || []).map((g: any) => (
              <div
                key={g.term}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs space-y-1"
              >
                <div className="font-extrabold text-stone-900">{g.term}</div>
                <p className="text-stone-600 leading-relaxed">{g.explanation}</p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
