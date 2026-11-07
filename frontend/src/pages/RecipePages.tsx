import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ExpandableSection,
  FoodImage,
  MacroDistributionBarChart,
} from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { FoodSummary, RecipeDetail, RecipeIngredientInput } from '../types/api';

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
            Recipe & Meal Nutrition Calculator
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

            {/* Visual Ingredient Thumbnails Strip */}
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

            {/* Full Dropdown + Unit Selector */}
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

          {/* Visual Selected Ingredient Cards with Stepper Controls */}
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
                Click <strong>"Calculate Nutrition & Save Recipe"</strong> to generate interactive per-serving and total recipe charts.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Recipe Header Card with Per-Serving vs Total Switch */}
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
                  {/* Prominent Switch: Per Serving vs Total Recipe */}
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

                  {/* 5 Highlight Cards */}
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
                      🛒 Get Ingredients (Add to Smart Shopping List)
                    </button>
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

              {/* Progressive Disclosure for Ingredient Contributions & All 20 Nutrients */}
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
            Reopen any saved recipe in the calculator to adjust ingredients or servings.
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
                className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm flex flex-col justify-between"
              >
                <div>
                  <FoodImage
                    src={rec.image_url}
                    foodName={rec.title}
                    categorySlug="indian-dishes"
                    aspectClass="aspect-[16/10]"
                  />
                  <div className="p-5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 font-bold uppercase text-stone-700">
                        {rec.meal_type} • {rec.servings} servings
                      </span>
                      <span className="text-emerald-800 font-bold">
                        {rec.completeness_pct}% Complete
                      </span>
                    </div>
                    <h2 className="mt-2 text-lg font-extrabold text-stone-900">{rec.title}</h2>
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

                <div className="px-5 pb-5 pt-3 border-t border-stone-100 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-3">
                    <Link
                      to={`/recipes/calculator?edit=${rec.id}`}
                      className="font-extrabold text-emerald-800 hover:underline"
                    >
                      Open in Calculator →
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
