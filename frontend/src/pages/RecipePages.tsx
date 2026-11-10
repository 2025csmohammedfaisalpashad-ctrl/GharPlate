import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ExpandableSection,
  FoodImage,
  MacroDistributionBarChart,
} from '../components/UIWidgets';
import {
  clearAssistantEntityContext,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  FoodSummary,
  RecipeDetail,
  RecipeIngredientInput,
  RecipeStep,
} from '../types/api';

// ==========================================
// PAGE 8: VISUAL RECIPE & MEAL NUTRITION CALCULATOR
// ==========================================
export const RecipeCalculatorPage: React.FC = () => {
  const { household } = useHousehold();
  const [searchParams] = useSearchParams();
  const editRecipeId = searchParams.get('edit') ? Number(searchParams.get('edit')) : null;

  const [allFoods, setAllFoods] = useState<FoodSummary[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState('');
  const [title, setTitle] = useState('Karnataka Ragi Mudde & Palak Toor Dal Bowl');
  const [description, setDescription] = useState(
    'Home-cooked finger millet mudde paired with pigeon pea sambar, fresh spinach, and ripe tomatoes.'
  );
  const [servings, setServings] = useState(2);
  const [mealType, setMealType] = useState('lunch');
  const [displayMode, setDisplayMode] = useState<'per_serving' | 'total'>('per_serving');

  const [ingredients, setIngredients] = useState<RecipeIngredientInput[]>([
    { food_slug: 'ragi-finger-millet', quantity: 2, unit_name: 'standard_serving' },
    { food_slug: 'toor-dal-red-gram', quantity: 1, unit_name: 'standard_serving' },
    { food_slug: 'spinach-palak', quantity: 1, unit_name: '100g' },
    { food_slug: 'tomato-ripe', quantity: 1, unit_name: 'standard_serving' },
  ]);

  const [selectedFoodSlug, setSelectedFoodSlug] = useState('carrot-orange');
  const [selectedQty, setSelectedQty] = useState(1);
  const [selectedUnit, setSelectedUnit] = useState('standard_serving');

  const [calculatedRecipe, setCalculatedRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .searchFoods({ page_size: 100, sort_by: 'name_asc' })
      .then((res) => setAllFoods(res.items))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (editRecipeId) {
      void api
        .getRecipe(editRecipeId)
        .then((rec) => {
          setTitle(rec.title);
          setDescription(rec.description || '');
          setServings(rec.servings);
          setMealType(rec.meal_type);
          setIngredients(
            rec.ingredients.map((i) => ({
              food_slug: i.food_slug,
              quantity: i.quantity,
              unit_name: i.unit_name,
            }))
          );
          setCalculatedRecipe(rec);
        })
        .catch(() => null);
    }
  }, [editRecipeId]);

  const handleAddIngredient = (slugToAdd = selectedFoodSlug) => {
    if (!slugToAdd) return;
    setIngredients((prev) => [
      ...prev,
      { food_slug: slugToAdd, quantity: selectedQty, unit_name: selectedUnit },
    ]);
  };

  const handleUpdateQty = (index: number, delta: number) => {
    setIngredients((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? { ...item, quantity: Math.max(0.25, Number((item.quantity + delta).toFixed(2))) }
          : item
      )
    );
  };

  const handleRemoveIngredient = (index: number) => {
    setIngredients((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleCalculateAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (ingredients.length === 0) {
      setError('Please add at least one ingredient to calculate recipe nutrition.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload = {
        household_token: household?.household_token,
        title,
        description,
        servings,
        meal_type: mealType,
        ingredients,
      };
      const res = editRecipeId
        ? await api.updateRecipe(editRecipeId, payload)
        : await api.calculateRecipe(payload);
      setCalculatedRecipe(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recipe calculation failed');
    } finally {
      setLoading(false);
    }
  };

  const getVal = (code: string) => {
    if (!calculatedRecipe) return null;
    const row = calculatedRecipe.nutrients.find((n) => n.nutrient_code === code);
    if (!row) return null;
    return displayMode === 'per_serving'
      ? row.per_serving_known_value
      : row.total_known_value;
  };

  const filteredPickerFoods = ingredientSearch.trim()
    ? allFoods.filter(
        (f) =>
          f.name_en.toLowerCase().includes(ingredientSearch.toLowerCase()) ||
          f.aliases.some((a) =>
            a.alias_text.toLowerCase().includes(ingredientSearch.toLowerCase())
          )
      )
    : allFoods.slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm">
        <div>
          <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-extrabold text-amber-950">
            🍲 Interactive Cooking Assistant
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-stone-900">
            Recipe &amp; Meal Nutrition Calculator
          </h1>
          <p className="text-xs text-stone-500">
            Pick ingredients visually, adjust katoris, cups, or rotis, and compare Per-Serving vs. Total Recipe nutrition.
          </p>
        </div>
        <Link
          to="/recipes/saved"
          className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-2.5 text-xs font-extrabold text-stone-800 hover:bg-stone-100"
        >
          📖 Saved Recipes →
        </Link>
      </div>

      <div className="grid gap-8 lg:grid-cols-12">
        {/* Left: Visual Ingredient Builder */}
        <form
          onSubmit={(e) => void handleCalculateAndSave(e)}
          className="lg:col-span-6 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-5"
        >
          {error && (
            <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-bold text-rose-900">
              {error}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-12">
            <div className="sm:col-span-7">
              <label className="block text-xs font-bold text-stone-700">Recipe Name *</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-stone-300 px-3.5 py-2 text-sm font-bold"
              />
            </div>
            <div className="sm:col-span-3">
              <label className="block text-xs font-bold text-stone-700">Servings</label>
              <div className="mt-1 flex items-center rounded-2xl border border-stone-300 bg-stone-50">
                <button
                  type="button"
                  onClick={() => setServings((s) => Math.max(1, s - 1))}
                  className="px-3 py-2 font-black text-stone-700"
                >
                  −
                </button>
                <span className="flex-1 text-center text-sm font-extrabold">{servings}</span>
                <button
                  type="button"
                  onClick={() => setServings((s) => s + 1)}
                  className="px-3 py-2 font-black text-stone-700"
                >
                  +
                </button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-stone-700">Meal</label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                className="mt-1 w-full rounded-2xl border border-stone-300 bg-white px-2 py-2 text-xs font-bold"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>
          </div>

          {/* Visual Ingredient Search & Quick Photo Picker */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-stone-800">
                Add Ingredient from Catalog
              </span>
              <input
                type="text"
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
                placeholder="Quick filter (e.g. Paneer, Aloo, Dal)..."
                className="rounded-xl border border-stone-300 bg-white px-3 py-1 text-xs"
              />
            </div>

            <div className="grid grid-cols-4 gap-2">
              {filteredPickerFoods.slice(0, 4).map((f) => (
                <button
                  key={f.slug}
                  type="button"
                  onClick={() => handleAddIngredient(f.slug)}
                  className="group overflow-hidden rounded-xl border border-stone-200 bg-white p-1.5 text-left hover:border-emerald-600 transition"
                >
                  <FoodImage
                    src={f.image_url}
                    foodName={f.name_en}
                    categorySlug={f.category_slug}
                    aspectClass="aspect-[4/3] rounded-lg"
                  />
                  <div className="mt-1 truncate text-[11px] font-bold text-stone-800">
                    + {f.name_en.split(' (')[0]}
                  </div>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-12 gap-2 pt-1">
              <div className="col-span-6">
                <select
                  aria-label="Select Recipe Ingredient"
                  value={selectedFoodSlug}
                  onChange={(e) => setSelectedFoodSlug(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-2.5 py-2 text-xs font-semibold"
                >
                  {allFoods.map((f) => (
                    <option key={f.slug} value={f.slug}>
                      {f.name_en} ({f.category_name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={selectedQty}
                  onChange={(e) => setSelectedQty(Math.max(0.25, Number(e.target.value) || 1))}
                  className="w-full rounded-xl border border-stone-300 px-2 py-2 text-xs font-bold"
                />
              </div>
              <div className="col-span-4">
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 bg-white px-2 py-2 text-xs font-semibold"
                >
                  <option value="standard_serving">Standard Serving</option>
                  <option value="100g">100 g / 100 ml</option>
                  <option value="katori">Katori (150g)</option>
                  <option value="cup">Cup (150g)</option>
                  <option value="bowl">Bowl (180g)</option>
                  <option value="roti">Roti (40g)</option>
                  <option value="piece">Piece</option>
                  <option value="tbsp">Tablespoon (15g)</option>
                  <option value="tsp">Teaspoon (5g)</option>
                </select>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleAddIngredient(selectedFoodSlug)}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800"
            >
              + Add Selected Ingredient
            </button>
          </div>

          <div className="space-y-2.5">
            <div className="text-xs font-extrabold uppercase tracking-wider text-stone-400">
              Selected Ingredients ({ingredients.length})
            </div>
            {ingredients.map((ing, idx) => {
              const fObj = allFoods.find((f) => f.slug === ing.food_slug);
              return (
                <div
                  key={`${ing.food_slug}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200/90 bg-stone-50/70 p-2.5 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FoodImage
                      src={fObj?.image_url}
                      foodName={fObj?.name_en || ing.food_slug}
                      categorySlug={fObj?.category_slug}
                      aspectClass="h-11 w-14 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0">
                      <div className="truncate font-extrabold text-stone-900">
                        {fObj ? fObj.name_en : ing.food_slug}
                      </div>
                      <div className="text-stone-500">
                        {ing.quantity} × {ing.unit_name.replace('_', ' ')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="inline-flex items-center rounded-xl border border-stone-300 bg-white">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(idx, -0.5)}
                        className="px-2 py-1 font-bold text-stone-700 hover:bg-stone-100"
                      >
                        −
                      </button>
                      <span className="px-2 font-extrabold">{ing.quantity}</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(idx, 0.5)}
                        className="px-2 py-1 font-bold text-stone-700 hover:bg-stone-100"
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveIngredient(idx)}
                      className="rounded-lg p-1.5 text-stone-400 hover:bg-rose-50 hover:text-rose-700 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-emerald-800 py-3.5 text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {loading ? 'Calculating...' : 'Calculate Nutrition & Save Recipe'}
          </button>
        </form>

        {/* Right: Visual Recipe Nutrition Results */}
        <div className="lg:col-span-6 space-y-5">
          {!calculatedRecipe ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center space-y-3">
              <div className="text-4xl">🍲</div>
              <h3 className="text-base font-extrabold text-stone-900">
                Ready to Calculate Your Recipe
              </h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto">
                Click <strong>"Calculate Nutrition &amp; Save Recipe"</strong> to generate interactive per-serving and total recipe charts.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm">
                <div className="relative h-44">
                  <FoodImage
                    src={calculatedRecipe.image_url}
                    foodName={calculatedRecipe.title}
                    categorySlug="indian-dishes"
                    aspectClass="h-full w-full"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5 flex flex-wrap items-end justify-between gap-2 text-white">
                    <div>
                      <span className="rounded-full bg-emerald-700/90 px-2.5 py-0.5 text-[10px] font-bold uppercase">
                        {calculatedRecipe.meal_type} • {calculatedRecipe.servings} Servings
                      </span>
                      <h2 className="mt-1 text-xl font-black">{calculatedRecipe.title}</h2>
                    </div>
                    <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-emerald-950">
                      {calculatedRecipe.completeness_pct}% Data Complete
                    </span>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-stone-100 p-1.5">
                    <button
                      type="button"
                      onClick={() => setDisplayMode('per_serving')}
                      className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition ${
                        displayMode === 'per_serving'
                          ? 'bg-emerald-800 text-white shadow-sm'
                          : 'text-stone-700'
                      }`}
                    >
                      Per 1 Serving ({calculatedRecipe.serving_weight_grams}g)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplayMode('total')}
                      className={`flex-1 rounded-xl py-2 text-xs font-extrabold transition ${
                        displayMode === 'total'
                          ? 'bg-emerald-800 text-white shadow-sm'
                          : 'text-stone-700'
                      }`}
                    >
                      Total Recipe ({calculatedRecipe.total_weight_grams}g)
                    </button>
                  </div>

                  <div className="grid grid-cols-5 gap-2 text-center">
                    {[
                      { label: 'Calories', val: getVal('energy_kcal'), unit: 'kcal' },
                      { label: 'Protein', val: getVal('protein_g'), unit: 'g' },
                      { label: 'Carbs', val: getVal('carbs_g'), unit: 'g' },
                      { label: 'Fat', val: getVal('fat_total_g'), unit: 'g' },
                      { label: 'Fibre', val: getVal('fibre_g'), unit: 'g' },
                    ].map((s) => (
                      <div key={s.label} className="rounded-2xl bg-stone-50 p-2.5 border border-stone-100">
                        <div className="text-[10px] font-bold text-stone-500">{s.label}</div>
                        <div className="mt-0.5 text-sm font-black text-stone-900">
                          {s.val !== null ? `${s.val}${s.unit === 'kcal' ? '' : s.unit}` : 'NULL'}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-stone-100 text-xs">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/recipes/${calculatedRecipe.id}`}
                        className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white hover:bg-emerald-700"
                      >
                        📖 View Full Recipe &amp; Cook Mode
                      </Link>
                      <button
                        type="button"
                        onClick={() =>
                          void api.addRecipeToShoppingList({
                            recipe_id: calculatedRecipe.id,
                            subtract_pantry: true,
                          })
                        }
                        className="rounded-xl bg-amber-400 px-4 py-2 font-extrabold text-stone-950 hover:bg-amber-300"
                      >
                        🛒 Get Ingredients
                      </button>
                    </div>
                    <Link
                      to="/kitchen/grocery"
                      className="font-extrabold text-emerald-800 hover:underline"
                    >
                      Open Shopping List →
                    </Link>
                  </div>
                </div>
              </div>

              <MacroDistributionBarChart
                energyKcal={getVal('energy_kcal')}
                proteinG={getVal('protein_g')}
                carbsG={getVal('carbs_g')}
                fatG={getVal('fat_total_g')}
                fibreG={getVal('fibre_g')}
                basisLabel={
                  displayMode === 'per_serving'
                    ? `Per Serving (${calculatedRecipe.serving_weight_grams}g)`
                    : `Entire Recipe (${calculatedRecipe.total_weight_grams}g)`
                }
              />

              <ExpandableSection
                title="Ingredient Contributions"
                subtitle="How each ingredient contributes to total weight and calories"
              >
                <div className="space-y-2">
                  {calculatedRecipe.ingredients.map((ing, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded-xl bg-stone-50 p-2.5 text-xs"
                    >
                      <span className="font-bold text-stone-800">
                        {ing.food_name} ({ing.grams_equivalent}g)
                      </span>
                      <span className="font-mono text-stone-600">
                        {ing.energy_kcal_contribution ?? 'NULL'} kcal •{' '}
                        {ing.protein_g_contribution ?? 'NULL'}g P •{' '}
                        {ing.carbs_g_contribution ?? 'NULL'}g C
                      </span>
                    </div>
                  ))}
                </div>
              </ExpandableSection>

              <ExpandableSection
                title="Complete 20-Nutrient Recipe Table & Missing Data Check"
                subtitle={calculatedRecipe.completeness_notice}
              >
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-1.5">Nutrient</th>
                        <th className="py-1.5">Total Known</th>
                        <th className="py-1.5">Per Serving</th>
                        <th className="py-1.5">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {calculatedRecipe.nutrients.map((n) => (
                        <tr key={n.nutrient_code}>
                          <td className="py-1.5 font-bold text-stone-800">
                            {n.nutrient_name} ({n.unit})
                          </td>
                          <td className="py-1.5 font-mono">
                            {n.total_known_value !== null ? `${n.total_known_value} ${n.unit}` : 'NULL'}
                          </td>
                          <td className="py-1.5 font-mono font-bold text-emerald-900">
                            {n.per_serving_known_value !== null
                              ? `${n.per_serving_known_value} ${n.unit}`
                              : 'NULL'}
                          </td>
                          <td className="py-1.5">
                            {n.is_complete ? (
                              <span className="text-emerald-700 font-bold">Complete</span>
                            ) : (
                              <span className="text-amber-700">
                                {n.ingredients_missing_data} ing. NULL
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </ExpandableSection>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// PAGE 9: VISUAL SAVED RECIPES PAGE
// ==========================================
export const SavedRecipesPage: React.FC = () => {
  const { household } = useHousehold();
  const [recipes, setRecipes] = useState<RecipeDetail[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecipes = () => {
    setLoading(true);
    api
      .listRecipes(household?.household_token)
      .then(setRecipes)
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadRecipes();
  }, [household?.household_token]);

  const handleDelete = async (id: number) => {
    await api.deleteRecipe(id);
    loadRecipes();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-stone-900">Saved Household Recipes</h1>
          <p className="text-xs text-stone-500">
            Open any recipe for step-by-step Guided Cooking Mode, or adjust ingredients in the calculator.
          </p>
        </div>
        <Link
          to="/recipes/calculator"
          className="rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
        >
          + Create New Recipe
        </Link>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-3xl bg-stone-200/70" />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((rec) => {
            const kcal = rec.nutrients.find((n) => n.nutrient_code === 'energy_kcal')
              ?.per_serving_known_value;
            const prot = rec.nutrients.find((n) => n.nutrient_code === 'protein_g')
              ?.per_serving_known_value;
            return (
              <div
                key={rec.id}
                data-testid={`saved-recipe-card-${rec.id}`}
                className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm flex flex-col justify-between"
              >
                <div>
                  <Link to={`/recipes/${rec.id}`} className="block relative">
                    <FoodImage
                      src={rec.image_url}
                      foodName={rec.title}
                      categorySlug="indian-dishes"
                      aspectClass="aspect-[16/10]"
                    />
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                      <span className="rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-950">
                        {rec.verification_badge_label || 'GharPlate-curated recipe'}
                      </span>
                      {(rec.steps?.length || 0) > 0 && (
                        <span className="rounded-full bg-emerald-800/95 px-2.5 py-0.5 text-[10px] font-extrabold text-white">
                          {rec.steps?.length} Steps
                        </span>
                      )}
                    </div>
                  </Link>
                  <div className="p-5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-bold uppercase text-stone-700">
                        {rec.meal_type} • {rec.servings} servings
                      </span>
                      <span className="text-emerald-800 font-bold">
                        {rec.completeness_pct}% Complete
                      </span>
                    </div>
                    <Link
                      to={`/recipes/${rec.id}`}
                      className="mt-2 block text-lg font-extrabold text-stone-900 hover:text-emerald-800"
                    >
                      {rec.title}
                    </Link>
                    <div className="mt-3 flex gap-2 text-xs">
                      <span className="rounded-xl bg-stone-50 px-3 py-1.5 font-bold">
                        {kcal ?? 'NULL'} kcal / serve
                      </span>
                      <span className="rounded-xl bg-emerald-50 px-3 py-1.5 font-bold text-emerald-900">
                        {prot ?? 'NULL'}g Protein
                      </span>
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/recipes/${rec.id}`}
                      data-testid={`view-recipe-btn-${rec.id}`}
                      className="rounded-xl bg-emerald-800 px-3 py-1.5 font-extrabold text-white hover:bg-emerald-700"
                    >
                      📖 View Recipe
                    </Link>
                    <Link
                      to={`/recipes/calculator?edit=${rec.id}`}
                      className="font-extrabold text-emerald-800 hover:underline"
                    >
                      Adjust Servings →
                    </Link>
                    <button
                      type="button"
                      onClick={() =>
                        void api.addRecipeToShoppingList({
                          recipe_id: rec.id,
                          subtract_pantry: true,
                        })
                      }
                      className="rounded-lg bg-amber-100 px-2.5 py-1 font-extrabold text-amber-950 hover:bg-amber-200"
                    >
                      🛒 Get Ingredients
                    </button>
                  </div>
                  {rec.household_token !== 'system_template' && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(rec.id)}
                      className="text-stone-400 hover:text-rose-700 font-bold"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==========================================
// PAGE 10: COMPLETE RECIPE DETAIL EXPERIENCE & GUIDED COOKING MODE (/recipes/:id)
// ==========================================
export const RecipeDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeMember } = useHousehold();

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [targetServings, setTargetServings] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nutritionMode, setNutritionMode] = useState<'per_serving' | 'total'>('per_serving');

  // Checklists for ingredients & preparation steps
  const [checkedIngredients, setCheckedIngredients] = useState<Record<string, boolean>>({});
  const [checkedSteps, setCheckedSteps] = useState<Record<number, boolean>>({});
  const [stepUserNotes, setStepUserNotes] = useState<Record<number, string>>({});

  // Guided Cooking Mode state
  const [cookModeOpen, setCookModeOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [cookingFinished, setCookingFinished] = useState(false);

  // Interactive Step Timer state
  const [timerSecondsLeft, setTimerSecondsLeft] = useState<number>(0);
  const [timerRunning, setTimerRunning] = useState<boolean>(false);
  const [timerInitialSeconds, setTimerInitialSeconds] = useState<number>(0);

  // Post-cooking & action feedback state
  const [servingsConsumed, setServingsConsumed] = useState<string>('1');
  const [diaryMealCategory, setDiaryMealCategory] = useState<string>('lunch');
  const [shoppingListMode, setShoppingListMode] = useState<'missing_pantry' | 'all'>('missing_pantry');
  const [actionBanner, setActionBanner] = useState<string | null>(null);
  const [enrichingSteps, setEnrichingSteps] = useState(false);

  const loadRecipe = useCallback(
    async (servingsOverride?: number) => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const res = await api.getRecipe(id, servingsOverride);
        setRecipe(res);
        if (servingsOverride === undefined) {
          setTargetServings(res.servings);
          setDiaryMealCategory(res.meal_type || 'lunch');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load recipe details.');
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    void loadRecipe();
    return () => {
      clearAssistantEntityContext(`/recipes/${id}`);
    };
  }, [loadRecipe, id]);

  useEffect(() => {
    if (!recipe) return;
    publishAssistantContext({
      page_type: 'recipe_detail',
      route: `/recipes/${id}`,
      selected_entity: {
        type: 'recipe',
        id: String(recipe.slug || recipe.id),
        name: recipe.title,
        category: recipe.meal_type,
        summary: recipe.description || null,
      },
      selected_recipe: {
        id: recipe.id,
        slug: recipe.slug,
        title: recipe.title,
        servings: targetServings || recipe.servings,
        step_count: recipe.steps?.length || 0,
      },
    });
  }, [recipe, targetServings, id]);

  const handleScaleServings = async (newServings: number) => {
    const clamped = Math.max(0.5, Math.min(20, Number(newServings.toFixed(1))));
    setTargetServings(clamped);
    await loadRecipe(clamped);
  };

  // Sync step timer when active step changes in Cook Mode
  const steps: RecipeStep[] = recipe?.steps || [];
  const currentCookStep: RecipeStep | undefined = steps[activeStepIndex];

  useEffect(() => {
    if (!cookModeOpen || !currentCookStep) return;
    const mins = currentCookStep.duration_minutes || 0;
    const secs = mins > 0 ? mins * 60 : 0;
    setTimerInitialSeconds(secs);
    setTimerSecondsLeft(secs);
    setTimerRunning(false);
  }, [cookModeOpen, activeStepIndex, currentCookStep?.duration_minutes]);

  useEffect(() => {
    if (!timerRunning || timerSecondsLeft <= 0) {
      if (timerSecondsLeft <= 0 && timerRunning) {
        setTimerRunning(false);
      }
      return;
    }
    const handle = window.setInterval(() => {
      setTimerSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(handle);
  }, [timerRunning, timerSecondsLeft]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleEnrichSteps = async () => {
    if (!recipe) return;
    setEnrichingSteps(true);
    try {
      const updated = await api.enrichRecipeSteps(recipe.id);
      setRecipe(updated);
      setActionBanner('Generated structured step-by-step preparation instructions.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enrich recipe steps.');
    } finally {
      setEnrichingSteps(false);
    }
  };

  const handleToggleFavourite = async () => {
    if (!recipe) return;
    const updated = await api.rateOrFavouriteRecipe(recipe.id, {
      is_favourite: !recipe.is_favourite,
    });
    setRecipe(updated);
    setActionBanner(
      updated.is_favourite
        ? `Saved “${updated.title}” to your Favourite Cook-Again recipes.`
        : `Removed “${updated.title}” from favourites.`
    );
  };

  const handleRateRecipe = async (stars: number) => {
    if (!recipe) return;
    const updated = await api.rateOrFavouriteRecipe(recipe.id, {
      user_rating: stars,
    });
    setRecipe(updated);
    setActionBanner(`Rated “${updated.title}” ${stars} / 5 stars.`);
  };

  const handleAddIngredientsToShoppingList = async () => {
    if (!recipe) return;
    const subtractPantry = shoppingListMode === 'missing_pantry';
    const res = await api.addRecipeToShoppingList({
      recipe_id: recipe.id,
      serving_multiplier: (targetServings || recipe.servings) / Math.max(recipe.servings, 1),
      subtract_pantry: subtractPantry,
    });
    setActionBanner(
      subtractPantry
        ? `Added missing pantry ingredients for “${recipe.title}” to Smart Shopping List (${res.unpurchased_count} unpurchased items).`
        : `Added all ingredients for “${recipe.title}” to Smart Shopping List (${res.unpurchased_count} unpurchased items).`
    );
  };

  const handleConfirmLogToDiary = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipe) return;
    const srv = Math.max(0.25, Number(servingsConsumed) || 1);
    await api.logRecipeToDiary(recipe.id, {
      member_id: activeMember?.id,
      user_confirmed: true,
      servings_consumed: srv,
      meal_category: diaryMealCategory,
    });
    setActionBanner(
      `Confirmed & logged ${srv} serving${srv !== 1 ? 's' : ''} of “${recipe.title}” to Today’s Food Diary (${diaryMealCategory.replace('_', ' ')}).`
    );
  };

  const getMacroVal = (code: string) => {
    if (!recipe) return null;
    const row = recipe.nutrients.find((n) => n.nutrient_code === code);
    if (!row) return null;
    return nutritionMode === 'per_serving'
      ? row.per_serving_known_value
      : row.total_known_value;
  };

  if (loading && !recipe) {
    return <div className="h-80 animate-pulse rounded-3xl bg-stone-200/70" />;
  }

  if (error || !recipe) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center space-y-4">
        <h1 className="text-xl font-black text-stone-900">Recipe Not Found</h1>
        <p className="text-xs text-stone-600">{error || 'Could not load recipe.'}</p>
        <Link
          to="/recipes/discover"
          className="inline-block rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white"
        >
          ← Back to Recipe Discovery
        </Link>
      </div>
    );
  }

  const completedIngredientsCount = Object.values(checkedIngredients).filter(Boolean).length;
  const completedStepsCount = Object.values(checkedSteps).filter(Boolean).length;

  return (
    <div data-testid="recipe-detail-page" className="space-y-8">
      {/* Top Breadcrumb & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 font-bold text-stone-600">
          <Link to="/recipes/discover" className="hover:text-emerald-800">
            ← Recipe Discovery
          </Link>
          <span>/</span>
          <span className="text-stone-900 font-extrabold">{recipe.title}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="favourite-recipe-btn"
            onClick={() => void handleToggleFavourite()}
            className={`rounded-2xl border px-3.5 py-2 font-extrabold transition ${
              recipe.is_favourite
                ? 'border-amber-400 bg-amber-100 text-amber-950'
                : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {recipe.is_favourite ? '★ Saved in Favourites (Cook Again)' : '☆ Save Recipe'}
          </button>
          <Link
            to={`/recipes/calculator?edit=${recipe.id}`}
            className="rounded-2xl border border-stone-200 bg-white px-3.5 py-2 font-bold text-stone-700 hover:bg-stone-50"
          >
            Adjust Ingredients in Calculator
          </Link>
        </div>
      </div>

      {actionBanner && (
        <div
          data-testid="recipe-detail-action-banner"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-xs font-bold text-emerald-950"
        >
          <span>✓ {actionBanner}</span>
          <div className="flex items-center gap-2">
            <Link
              to="/tracker/daily"
              className="rounded-xl bg-emerald-800 px-3 py-1.5 text-white"
            >
              Open Food Diary →
            </Link>
            <Link
              to="/kitchen/grocery"
              className="rounded-xl border border-emerald-700 px-3 py-1.5 text-emerald-900"
            >
              Shopping List →
            </Link>
          </div>
        </div>
      )}

      {/* SECTION A: RECIPE IDENTITY & OVERVIEW HERO */}
      <section className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm">
        <div className="grid lg:grid-cols-12">
          <div className="lg:col-span-5 relative min-h-[260px]">
            <FoodImage
              src={recipe.image_url}
              foodName={recipe.title}
              categorySlug="indian-dishes"
              aspectClass="h-full w-full min-h-[260px]"
            />
            <div className="absolute top-4 left-4 flex flex-wrap gap-1.5">
              <span
                data-testid="recipe-provenance-badge"
                className="rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-emerald-950 shadow-sm"
              >
                ✓ {recipe.verification_badge_label || 'GharPlate-curated recipe'}
              </span>
              <span className="rounded-full bg-stone-900/85 px-3 py-1 text-xs font-bold text-white">
                {recipe.difficulty || 'Easy'}
              </span>
            </div>
          </div>

          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-emerald-100 px-3 py-0.5 font-extrabold uppercase text-emerald-950">
                  {recipe.meal_type.replace('_', ' ')}
                </span>
                {(recipe.dietary_tags || []).slice(0, 4).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-stone-100 px-2.5 py-0.5 font-bold text-stone-700"
                  >
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              <h1
                data-testid="recipe-detail-title"
                className="text-2xl sm:text-3xl font-black text-stone-900 leading-tight"
              >
                {recipe.title}
              </h1>
              {recipe.description && (
                <p className="text-sm text-stone-600 leading-relaxed">{recipe.description}</p>
              )}

              {/* Timing, Cost & Servings Scaler */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
                <div className="rounded-2xl border border-stone-200/80 bg-stone-50 p-3">
                  <div className="text-[11px] font-bold text-stone-500">Prep &amp; Cook Time</div>
                  <div className="mt-0.5 font-black text-stone-900">
                    {recipe.prep_time_minutes ?? 10}m prep + {recipe.cook_time_minutes ?? 15}m cook
                  </div>
                  <div className="text-[10px] text-emerald-800 font-bold">
                    Total: {recipe.total_time_minutes ?? 25} mins
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200/80 bg-stone-50 p-3">
                  <div className="text-[11px] font-bold text-stone-500">Interactive Servings</div>
                  <div className="mt-1 flex items-center gap-2">
                    <button
                      type="button"
                      data-testid="decrease-servings-btn"
                      onClick={() =>
                        void handleScaleServings((targetServings || recipe.servings) - 1)
                      }
                      className="h-7 w-7 rounded-lg border border-stone-300 bg-white font-black text-stone-800 hover:bg-stone-100"
                    >
                      −
                    </button>
                    <span
                      data-testid="current-servings-value"
                      className="text-sm font-black text-emerald-950"
                    >
                      {targetServings || recipe.servings}
                    </span>
                    <button
                      type="button"
                      data-testid="increase-servings-btn"
                      onClick={() =>
                        void handleScaleServings((targetServings || recipe.servings) + 1)
                      }
                      className="h-7 w-7 rounded-lg border border-stone-300 bg-white font-black text-stone-800 hover:bg-stone-100"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200/80 bg-stone-50 p-3">
                  <div className="text-[11px] font-bold text-stone-500">Serving Weight</div>
                  <div className="mt-0.5 font-black text-stone-900">
                    {recipe.serving_weight_grams} g / serve
                  </div>
                  <div className="text-[10px] text-stone-500">
                    Total batch: {recipe.total_weight_grams} g
                  </div>
                </div>

                <div className="rounded-2xl border border-stone-200/80 bg-stone-50 p-3">
                  <div className="text-[11px] font-bold text-stone-500">Est. Kitchen Cost</div>
                  <div className="mt-0.5 font-black text-stone-900">
                    {recipe.cost_per_serving_inr
                      ? `~₹${recipe.cost_per_serving_inr} / serve`
                      : recipe.estimated_cost_inr
                      ? `~₹${recipe.estimated_cost_inr} total`
                      : 'Homestyle'}
                  </div>
                  <div className="text-[10px] text-stone-500">
                    {recipe.completeness_pct}% nutrient data
                  </div>
                </div>
              </div>
            </div>

            {/* Primary CTA Bar: Start Cooking (Guided Mode) + Shopping List */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-100">
              <div className="flex flex-wrap items-center gap-2.5">
                {steps.length > 0 && (
                  <button
                    type="button"
                    data-testid="start-cooking-btn"
                    onClick={() => {
                      setActiveStepIndex(0);
                      setCookingFinished(false);
                      setCookModeOpen(true);
                    }}
                    className="rounded-2xl bg-emerald-800 px-6 py-3 text-xs sm:text-sm font-extrabold text-white shadow-md hover:bg-emerald-700 transition"
                  >
                    👨‍🍳 Start Cooking (Guided Step-by-Step Mode)
                  </button>
                )}

                <div className="inline-flex items-center rounded-2xl border border-amber-300 bg-amber-50 p-1 text-xs">
                  <select
                    aria-label="Shopping List Ingredient Scope"
                    value={shoppingListMode}
                    onChange={(e) =>
                      setShoppingListMode(e.target.value as 'missing_pantry' | 'all')
                    }
                    className="bg-transparent px-2.5 py-1.5 font-bold text-amber-950 focus:outline-hidden"
                  >
                    <option value="missing_pantry">Missing from Pantry</option>
                    <option value="all">All Recipe Ingredients</option>
                  </select>
                  <button
                    type="button"
                    data-testid="recipe-detail-get-ingredients-btn"
                    onClick={() => void handleAddIngredientsToShoppingList()}
                    className="rounded-xl bg-amber-400 px-3.5 py-1.5 font-extrabold text-stone-950 hover:bg-amber-300"
                  >
                    🛒 Add to Shopping List
                  </button>
                </div>
              </div>

              {/* Quick Star Rating */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-stone-500 font-bold mr-1">Rate:</span>
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    data-testid={`rate-star-${star}`}
                    onClick={() => void handleRateRecipe(star)}
                    className={`text-base transition ${
                      (recipe.user_rating || 0) >= star
                        ? 'text-amber-500'
                        : 'text-stone-300 hover:text-amber-400'
                    }`}
                    title={`Rate ${star} stars`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GUIDED COOKING MODE MODAL / INTERACTIVE VIEW (PART A.4) */}
      {cookModeOpen && steps.length > 0 && (
        <section
          data-testid="guided-cook-mode"
          className="rounded-3xl border-2 border-emerald-700 bg-white p-6 sm:p-8 shadow-xl space-y-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 pb-4">
            <div>
              <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-extrabold text-emerald-900">
                👨‍🍳 Interactive Guided Cooking Mode
              </span>
              <h2 className="mt-1 text-xl font-black text-stone-900">{recipe.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span
                data-testid="cook-mode-progress-indicator"
                className="rounded-full bg-stone-100 px-3.5 py-1.5 text-xs font-extrabold text-stone-800"
              >
                {cookingFinished
                  ? `Completed All ${steps.length} Steps`
                  : `Step ${activeStepIndex + 1} of ${steps.length}`}
              </span>
              <button
                type="button"
                data-testid="close-cook-mode-btn"
                onClick={() => {
                  setTimerRunning(false);
                  setCookModeOpen(false);
                }}
                className="rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
              >
                Exit Cook Mode ✕
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
            <div
              className="h-full bg-emerald-700 transition-all duration-300"
              style={{
                width: `${
                  cookingFinished
                    ? 100
                    : Math.round(((activeStepIndex + 1) / steps.length) * 100)
                }%`,
              }}
            />
          </div>

          {!cookingFinished && currentCookStep ? (
            <div className="grid gap-6 lg:grid-cols-12">
              {/* Active Step Card */}
              <div className="lg:col-span-8 rounded-3xl border border-emerald-200 bg-emerald-50/40 p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-xl bg-emerald-800 px-3 py-1 text-xs font-extrabold text-white">
                    Step {currentCookStep.step_number} of {steps.length}
                  </span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {currentCookStep.temperature && (
                      <span className="rounded-xl bg-amber-100 px-3 py-1 font-bold text-amber-950">
                        🔥 {currentCookStep.temperature}
                      </span>
                    )}
                    {currentCookStep.equipment && (
                      <span className="rounded-xl bg-stone-200/80 px-3 py-1 font-bold text-stone-800">
                        🍳 {currentCookStep.equipment}
                      </span>
                    )}
                  </div>
                </div>

                <h3
                  data-testid="cook-mode-step-title"
                  className="text-xl sm:text-2xl font-black text-stone-900"
                >
                  {currentCookStep.step_title}
                </h3>

                <p
                  data-testid="cook-mode-step-instruction"
                  className="text-sm sm:text-base text-stone-800 leading-relaxed font-medium"
                >
                  {currentCookStep.instruction_text}
                </p>

                {currentCookStep.tip && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-950">
                    <strong>Chef &amp; Nutrition Tip:</strong> {currentCookStep.tip}
                  </div>
                )}

                {/* Functional Step Timer */}
                {timerInitialSeconds > 0 && (
                  <div
                    data-testid="cook-step-timer"
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4"
                  >
                    <div>
                      <div className="text-[11px] font-bold uppercase text-stone-500">
                        Step Timer ({currentCookStep.duration_minutes} min recommended)
                      </div>
                      <div
                        data-testid="cook-timer-display"
                        className="text-2xl font-mono font-black text-emerald-900"
                      >
                        {formatTimer(timerSecondsLeft)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        data-testid="cook-timer-start-pause-btn"
                        onClick={() => setTimerRunning((r) => !r)}
                        className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white hover:bg-emerald-700"
                      >
                        {timerRunning ? 'Pause Timer' : 'Start Timer'}
                      </button>
                      <button
                        type="button"
                        data-testid="cook-timer-reset-btn"
                        onClick={() => {
                          setTimerRunning(false);
                          setTimerSecondsLeft(timerInitialSeconds);
                        }}
                        className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-bold text-stone-700"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}

                {/* Optional Personal Step Note */}
                <div className="pt-2">
                  <input
                    type="text"
                    value={stepUserNotes[currentCookStep.step_number] || ''}
                    onChange={(e) =>
                      setStepUserNotes((prev) => ({
                        ...prev,
                        [currentCookStep.step_number]: e.target.value,
                      }))
                    }
                    placeholder="Optional kitchen note for this step (e.g. used 1/2 tsp less salt)..."
                    className="w-full rounded-xl border border-stone-200 bg-white px-3.5 py-2 text-xs"
                  />
                </div>

                {/* Step Navigation Controls */}
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-emerald-200/70">
                  <button
                    type="button"
                    data-testid="cook-prev-step-btn"
                    disabled={activeStepIndex === 0}
                    onClick={() => setActiveStepIndex((i) => Math.max(0, i - 1))}
                    className="rounded-2xl border border-stone-300 bg-white px-5 py-2.5 text-xs font-extrabold text-stone-800 disabled:opacity-40"
                  >
                    ← Previous Step
                  </button>

                  {activeStepIndex < steps.length - 1 ? (
                    <button
                      type="button"
                      data-testid="cook-next-step-btn"
                      onClick={() => {
                        setCheckedSteps((prev) => ({
                          ...prev,
                          [currentCookStep.step_number]: true,
                        }));
                        setActiveStepIndex((i) => Math.min(steps.length - 1, i + 1));
                      }}
                      className="rounded-2xl bg-emerald-800 px-6 py-2.5 text-xs font-extrabold text-white shadow hover:bg-emerald-700"
                    >
                      Mark Step Done &amp; Next Step →
                    </button>
                  ) : (
                    <button
                      type="button"
                      data-testid="cook-finish-btn"
                      onClick={() => {
                        setCheckedSteps((prev) => ({
                          ...prev,
                          [currentCookStep.step_number]: true,
                        }));
                        setTimerRunning(false);
                        setCookingFinished(true);
                      }}
                      className="rounded-2xl bg-amber-400 px-6 py-2.5 text-xs font-extrabold text-stone-950 shadow hover:bg-amber-300"
                    >
                      🎉 Finish Cooking
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column inside Cook Mode: Quick Ingredient Checklist */}
              <div className="lg:col-span-4 rounded-3xl border border-stone-200 bg-stone-50 p-5 space-y-3 text-xs">
                <div className="font-black text-stone-900">
                  Ingredient Mise-en-Place ({completedIngredientsCount}/{recipe.ingredients.length})
                </div>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {recipe.ingredients.map((ing) => (
                    <label
                      key={ing.food_slug}
                      className="flex items-start gap-2.5 rounded-xl bg-white p-2.5 border border-stone-200/80 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(checkedIngredients[ing.food_slug])}
                        onChange={() =>
                          setCheckedIngredients((prev) => ({
                            ...prev,
                            [ing.food_slug]: !prev[ing.food_slug],
                          }))
                        }
                        className="mt-0.5 h-4 w-4 rounded border-stone-300 text-emerald-700"
                      />
                      <div>
                        <div
                          className={`font-extrabold ${
                            checkedIngredients[ing.food_slug]
                              ? 'line-through text-stone-400'
                              : 'text-stone-900'
                          }`}
                        >
                          {ing.food_name}
                        </div>
                        <div className="text-[11px] text-emerald-800 font-semibold">
                          {ing.household_measure_note ||
                            `${ing.quantity} × ${ing.unit_name} (${ing.grams_equivalent}g)`}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* POST-COOKING COMPLETION SCREEN (PART A.4 & PART D.1) */
            <div
              data-testid="cook-completion-panel"
              className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-6 sm:p-8 space-y-6"
            >
              <div className="space-y-1">
                <span className="rounded-full bg-emerald-800 px-3 py-0.5 text-xs font-extrabold text-white">
                  ✓ Dish Ready to Serve
                </span>
                <h3 className="text-2xl font-black text-stone-900">
                  Well done! You completed cooking {recipe.title}.
                </h3>
                <p className="text-xs text-stone-600">
                  Would you like to log the portion you ate to Today’s Food Diary or save this recipe to your Cook-Again favourites?
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                {/* Explicit User Confirmation Form to Log Cooked Recipe to Food Diary */}
                <form
                  onSubmit={(e) => void handleConfirmLogToDiary(e)}
                  data-testid="cook-complete-log-diary-form"
                  className="rounded-2xl border border-stone-200 bg-white p-5 space-y-3.5 text-xs"
                >
                  <div className="font-black text-sm text-stone-900">
                    📒 Add Cooked Meal to Today’s Food Diary (Requires Confirmation)
                  </div>
                  <p className="text-stone-500">
                    Confirm how many servings you consumed so GharPlate records the exact per-serving IFCT nutrient snapshot.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-stone-700">
                        Servings Consumed
                      </label>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        max="10"
                        data-testid="cooked-servings-consumed-input"
                        value={servingsConsumed}
                        onChange={(e) => setServingsConsumed(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-stone-700">Meal Slot</label>
                      <select
                        value={diaryMealCategory}
                        onChange={(e) => setDiaryMealCategory(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-bold"
                      >
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="evening_snack">Evening Snack</option>
                        <option value="post_workout">Post-Workout</option>
                        <option value="dinner">Dinner</option>
                      </select>
                    </div>
                  </div>
                  <button
                    type="submit"
                    data-testid="confirm-log-cooked-recipe-btn"
                    className="w-full rounded-xl bg-emerald-800 py-2.5 font-extrabold text-white hover:bg-emerald-700"
                  >
                    ✓ Confirm &amp; Add to Today’s Food Diary
                  </button>
                </form>

                {/* Save to Favourites, Rate & Shopping List Actions */}
                <div className="rounded-2xl border border-stone-200 bg-white p-5 space-y-4 text-xs flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="font-black text-sm text-stone-900">
                      ⭐ Save to Favourites &amp; Rate Recipe
                    </div>
                    <button
                      type="button"
                      data-testid="cook-complete-favourite-btn"
                      onClick={() => void handleToggleFavourite()}
                      className="w-full rounded-xl border border-amber-300 bg-amber-50 py-2.5 font-extrabold text-amber-950 hover:bg-amber-100"
                    >
                      {recipe.is_favourite
                        ? '★ Saved in Cook-Again Favourites'
                        : '☆ Save as Favourite (Cook Again)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleAddIngredientsToShoppingList()}
                      className="w-full rounded-xl border border-stone-300 bg-stone-50 py-2.5 font-bold text-stone-800 hover:bg-stone-100"
                    >
                      🛒 Restock Ingredients on Smart Shopping List
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-stone-100">
                    <button
                      type="button"
                      onClick={() => {
                        setCookingFinished(false);
                        setActiveStepIndex(0);
                      }}
                      className="font-bold text-emerald-800 hover:underline"
                    >
                      ← Review Steps Again
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/tracker/daily')}
                      className="font-extrabold text-stone-900 hover:underline"
                    >
                      Go to Daily Tracker →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* MAIN BODY: LEFT = INGREDIENTS & NUTRITION, RIGHT = STEP-BY-STEP PREPARATION */}
      <div className="grid gap-8 lg:grid-cols-12">
        {/* SECTION B: COMPLETE INGREDIENT LIST WITH CHECKBOXES & FOOD DETAIL LINKS */}
        <div className="lg:col-span-5 space-y-6">
          <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-black text-stone-900">
                  Complete Ingredients ({recipe.ingredients.length})
                </h2>
                <p className="text-xs text-stone-500">
                  Scaled for <strong>{targetServings || recipe.servings} servings</strong> •{' '}
                  {completedIngredientsCount} of {recipe.ingredients.length} checked
                </p>
              </div>
              {completedIngredientsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setCheckedIngredients({})}
                  className="text-xs font-bold text-stone-500 hover:text-stone-800"
                >
                  Reset checks
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {recipe.ingredients.map((ing, idx) => {
                const isChecked = Boolean(checkedIngredients[ing.food_slug]);
                return (
                  <div
                    key={`${ing.food_slug}-${idx}`}
                    data-testid={`recipe-ingredient-row-${ing.food_slug}`}
                    className={`rounded-2xl border p-3.5 transition ${
                      isChecked
                        ? 'border-emerald-200 bg-emerald-50/40'
                        : 'border-stone-200/90 bg-stone-50/60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <label className="flex items-start gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          data-testid={`ingredient-check-${ing.food_slug}`}
                          checked={isChecked}
                          onChange={() =>
                            setCheckedIngredients((prev) => ({
                              ...prev,
                              [ing.food_slug]: !prev[ing.food_slug],
                            }))
                          }
                          className="mt-1 h-4 w-4 rounded border-stone-300 text-emerald-700"
                        />
                        <div className="space-y-0.5 text-xs">
                          <div
                            className={`text-sm font-extrabold ${
                              isChecked ? 'line-through text-stone-400' : 'text-stone-900'
                            }`}
                          >
                            {ing.food_name}
                          </div>
                          <div className="font-bold text-emerald-900">
                            {ing.household_measure_note ||
                              `${ing.quantity} × ${ing.unit_name} (${ing.grams_equivalent} g)`}
                          </div>
                          {ing.preparation_note && (
                            <div className="text-[11px] text-stone-600">
                              Prep: {ing.preparation_note}
                            </div>
                          )}
                          {ing.alternative_ingredient && (
                            <div className="text-[11px] text-amber-900">
                              Alternative: {ing.alternative_ingredient}
                            </div>
                          )}
                        </div>
                      </label>

                      <Link
                        to={`/foods/${ing.food_slug}`}
                        data-testid={`ingredient-food-link-${ing.food_slug}`}
                        className="shrink-0 rounded-xl border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-50"
                      >
                        IFCT Profile →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION D: NUTRITIONAL INFORMATION */}
          <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-black text-stone-900">
                  Calculated Nutritional Profile
                </h2>
                <p className="text-[11px] text-stone-500">
                  Computed from verified GharPlate IFCT 2017 / ICMR-NIN ingredient records
                </p>
              </div>
              <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setNutritionMode('per_serving')}
                  className={`rounded-lg px-2.5 py-1 font-extrabold ${
                    nutritionMode === 'per_serving'
                      ? 'bg-emerald-800 text-white'
                      : 'text-stone-700'
                  }`}
                >
                  Per Serving
                </button>
                <button
                  type="button"
                  onClick={() => setNutritionMode('total')}
                  className={`rounded-lg px-2.5 py-1 font-extrabold ${
                    nutritionMode === 'total'
                      ? 'bg-emerald-800 text-white'
                      : 'text-stone-700'
                  }`}
                >
                  Total Recipe
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center text-xs">
              {[
                { label: 'Energy', code: 'energy_kcal', unit: 'kcal' },
                { label: 'Protein', code: 'protein_g', unit: 'g' },
                { label: 'Carbs', code: 'carbs_g', unit: 'g' },
                { label: 'Total Fat', code: 'fat_total_g', unit: 'g' },
                { label: 'Dietary Fibre', code: 'fibre_g', unit: 'g' },
                { label: 'Sodium', code: 'sodium_mg', unit: 'mg' },
                { label: 'Calcium', code: 'calcium_mg', unit: 'mg' },
                { label: 'Iron', code: 'iron_mg', unit: 'mg' },
                { label: 'Potassium', code: 'potassium_mg', unit: 'mg' },
              ].map((m) => {
                const v = getMacroVal(m.code);
                return (
                  <div
                    key={m.code}
                    className="rounded-2xl border border-stone-100 bg-stone-50 p-3"
                  >
                    <div className="text-[11px] font-bold text-stone-500">{m.label}</div>
                    <div className="mt-0.5 text-sm font-black text-stone-900">
                      {v !== null && v !== undefined ? `${v} ${m.unit}` : 'NULL'}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="rounded-2xl bg-stone-50 p-3 text-[11px] text-stone-600">
              {recipe.completeness_notice}
            </div>
          </section>
        </div>

        {/* SECTION C: STEP-BY-STEP PREPARATION & COOKING METHOD */}
        <div className="lg:col-span-7 space-y-6">
          <section className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-stone-900">
                  Step-by-Step Preparation &amp; Cooking Method
                </h2>
                <p className="text-xs text-stone-500">
                  {steps.length > 0
                    ? `${completedStepsCount} of ${steps.length} steps completed • Click any step checkbox as you cook`
                    : 'Structured step-by-step instructions'}
                </p>
              </div>
              {steps.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveStepIndex(0);
                    setCookingFinished(false);
                    setCookModeOpen(true);
                  }}
                  className="rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-extrabold text-emerald-900 hover:bg-emerald-100"
                >
                  Open Guided Cook Mode →
                </button>
              )}
            </div>

            {steps.length === 0 ? (
              <div
                data-testid="missing-instructions-fallback"
                className="rounded-2xl border border-amber-200 bg-amber-50/70 p-6 space-y-3 text-xs"
              >
                <div className="text-sm font-black text-amber-950">
                  Cooking instructions are not yet available.
                </div>
                {recipe.instructions_notes && (
                  <p className="text-stone-700 leading-relaxed">
                    <strong>Summary Notes:</strong> {recipe.instructions_notes}
                  </p>
                )}
                <p className="text-stone-600">
                  You can generate structured step-by-step culinary instructions from this recipe’s verified ingredient list.
                </p>
                <button
                  type="button"
                  disabled={enrichingSteps}
                  data-testid="enrich-recipe-steps-btn"
                  onClick={() => void handleEnrichSteps()}
                  className="rounded-xl bg-emerald-800 px-4 py-2 font-extrabold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {enrichingSteps
                    ? 'Generating Structured Steps...'
                    : '✨ Enrich with Step-by-Step Cooking Instructions'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {steps.map((step, idx) => {
                  const isDone = Boolean(checkedSteps[step.step_number]);
                  return (
                    <div
                      key={step.step_number}
                      data-testid={`recipe-step-card-${step.step_number}`}
                      className={`rounded-2xl border p-5 transition space-y-2.5 ${
                        isDone
                          ? 'border-emerald-200 bg-emerald-50/35'
                          : 'border-stone-200/90 bg-white hover:border-stone-300'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer">
                          <input
                            type="checkbox"
                            data-testid={`recipe-step-check-${step.step_number}`}
                            checked={isDone}
                            onChange={() =>
                              setCheckedSteps((prev) => ({
                                ...prev,
                                [step.step_number]: !prev[step.step_number],
                              }))
                            }
                            className="h-4 w-4 rounded border-stone-300 text-emerald-700"
                          />
                          <span className="rounded-lg bg-emerald-800 px-2.5 py-0.5 text-xs font-extrabold text-white">
                            Step {step.step_number}
                          </span>
                          <h3
                            className={`text-base font-black ${
                              isDone ? 'line-through text-stone-400' : 'text-stone-900'
                            }`}
                          >
                            {step.step_title}
                          </h3>
                        </label>

                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
                          {step.duration_minutes && (
                            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">
                              ⏱ {step.duration_minutes} min
                            </span>
                          )}
                          {step.temperature && (
                            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-950">
                              🔥 {step.temperature}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setActiveStepIndex(idx);
                              setCookingFinished(false);
                              setCookModeOpen(true);
                            }}
                            className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-emerald-900 hover:bg-emerald-100"
                          >
                            Focus Step →
                          </button>
                        </div>
                      </div>

                      <p className="text-xs sm:text-sm text-stone-700 leading-relaxed pl-6">
                        {step.instruction_text}
                      </p>

                      {step.tip && (
                        <div className="ml-6 rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-2 text-xs text-amber-950">
                          <strong>Tip:</strong> {step.tip}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Quick Confirmed Log to Today's Food Diary Box */}
            <form
              onSubmit={(e) => void handleConfirmLogToDiary(e)}
              className="rounded-2xl border border-stone-200 bg-stone-50 p-4 flex flex-wrap items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-extrabold text-stone-900">
                  Cooked this recipe today? Log your portion to Today’s Food Diary:
                </div>
                <div className="text-[11px] text-stone-500">
                  Requires your explicit confirmation of servings consumed.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  step="0.25"
                  min="0.25"
                  max="10"
                  value={servingsConsumed}
                  onChange={(e) => setServingsConsumed(e.target.value)}
                  className="w-20 rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 font-bold"
                  aria-label="Servings Consumed"
                />
                <span className="font-bold text-stone-600">servings</span>
                <select
                  value={diaryMealCategory}
                  onChange={(e) => setDiaryMealCategory(e.target.value)}
                  className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 font-bold"
                  aria-label="Meal Category"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="evening_snack">Evening Snack</option>
                  <option value="post_workout">Post-Workout</option>
                  <option value="dinner">Dinner</option>
                </select>
                <button
                  type="submit"
                  data-testid="detail-page-log-recipe-btn"
                  className="rounded-xl bg-emerald-800 px-4 py-1.5 font-extrabold text-white hover:bg-emerald-700"
                >
                  + Confirm &amp; Log to Diary
                </button>
              </div>
            </form>

            {/* Provenance Footer */}
            <div className="rounded-2xl border border-stone-200/80 bg-stone-50/70 p-4 text-[11px] text-stone-600 flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong>Recipe Provenance:</strong> {recipe.verification_badge_label} •{' '}
                <span>{recipe.source_name}</span>
              </div>
              {recipe.source_url && (
                <a
                  href={recipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-emerald-800 hover:underline"
                >
                  Reference Source ↗
                </a>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
