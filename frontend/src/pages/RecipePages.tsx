import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MacroDistributionBarChart } from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { FoodSummary, RecipeDetail, RecipeIngredientInput } from '../types/api';

// ==========================================
// PAGE 8: RECIPE AND MEAL NUTRITION CALCULATOR
// ==========================================
export const RecipeCalculatorPage: React.FC = () => {
  const { household } = useHousehold();
  const [searchParams] = useSearchParams();
  const editRecipeId = searchParams.get('edit') ? Number(searchParams.get('edit')) : null;

  const [allFoods, setAllFoods] = useState<FoodSummary[]>([]);
  const [title, setTitle] = useState('Homemade Vegetable Ragi Upma & Moong Dal');
  const [description, setDescription] = useState(
    'Nutritious household meal combining finger millet, split green gram, carrot, onion, and tomato.'
  );
  const [servings, setServings] = useState(2);
  const [mealType, setMealType] = useState('lunch');
  const [ingredients, setIngredients] = useState<RecipeIngredientInput[]>([
    { food_slug: 'ragi-finger-millet', quantity: 2, unit_name: 'standard_serving' },
    { food_slug: 'moong-dal-green-gram', quantity: 1, unit_name: 'standard_serving' },
    { food_slug: 'carrot-orange', quantity: 1, unit_name: 'standard_serving' },
    { food_slug: 'tomato-ripe', quantity: 1, unit_name: 'standard_serving' },
  ]);

  const [selectedFoodSlug, setSelectedFoodSlug] = useState('spinach-palak');
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

  const handleAddIngredient = () => {
    if (!selectedFoodSlug) return;
    setIngredients((prev) => [
      ...prev,
      { food_slug: selectedFoodSlug, quantity: selectedQty, unit_name: selectedUnit },
    ]);
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

  const getPerServingVal = (code: string) => {
    if (!calculatedRecipe) return null;
    const row = calculatedRecipe.nutrients.find((n) => n.nutrient_code === code);
    return row ? row.per_serving_known_value : null;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">
            Recipe & Meal Nutrition Calculator
          </h1>
          <p className="mt-1 text-xs text-stone-600">
            Combine whole ingredients and packaged foods using Indian household measures (katori, cup, roti, tbsp, tsp, or 100g). Unknown ingredient nutrients remain NULL and are never treated as zero.
          </p>
        </div>
        <Link
          to="/recipes/saved"
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
        >
          View Saved Household Recipes →
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recipe Builder Form */}
        <form
          onSubmit={(e) => void handleCalculateAndSave(e)}
          className="lg:col-span-6 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4"
        >
          <h2 className="text-base font-bold text-stone-900">
            1. Configure Recipe & Ingredients
          </h2>

          {error && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-900">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-stone-700">Recipe Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700">Number of Servings</label>
              <input
                type="number"
                min={0.5}
                step={0.5}
                value={servings}
                onChange={(e) => setServings(Math.max(0.5, Number(e.target.value) || 1))}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Meal Type</label>
              <select
                value={mealType}
                onChange={(e) => setMealType(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </div>
          </div>

          {/* Add Ingredient Row */}
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 space-y-2.5">
            <div className="text-xs font-bold text-stone-700">Add Ingredient from Database</div>
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-6">
                <select
                  aria-label="Select Recipe Ingredient"
                  value={selectedFoodSlug}
                  onChange={(e) => setSelectedFoodSlug(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-2 text-xs"
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
                  className="w-full rounded-lg border border-stone-300 px-2 py-2 text-xs"
                />
              </div>
              <div className="col-span-4">
                <select
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-2 text-xs"
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
              onClick={handleAddIngredient}
              className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800"
            >
              + Add Ingredient to Recipe
            </button>
          </div>

          {/* Current Ingredients List */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-stone-700">
              Recipe Ingredients ({ingredients.length})
            </div>
            {ingredients.map((ing, idx) => {
              const fObj = allFoods.find((f) => f.slug === ing.food_slug);
              return (
                <div
                  key={`${ing.food_slug}-${idx}`}
                  className="flex items-center justify-between rounded-xl border border-stone-200 px-3 py-2 text-xs"
                >
                  <div>
                    <span className="font-bold text-stone-900">
                      {fObj ? fObj.name_en : ing.food_slug}
                    </span>
                    <span className="ml-2 text-stone-600">
                      {ing.quantity} × {ing.unit_name}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveIngredient(idx)}
                    className="text-rose-700 font-semibold hover:underline"
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-emerald-800 py-3 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? 'Calculating...' : 'Calculate Nutrition & Save to Household'}
          </button>
        </form>

        {/* Calculated Output */}
        <div className="lg:col-span-6 space-y-4">
          {!calculatedRecipe ? (
            <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-600">
              Click <strong>"Calculate Nutrition & Save to Household"</strong> on the left to compute total recipe nutrition, per-serving breakdown, ingredient contributions, and data completeness.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm text-emerald-950">
                    {calculatedRecipe.title}
                  </span>
                  <span className="rounded-full bg-emerald-800 px-2.5 py-0.5 text-white font-bold">
                    {calculatedRecipe.completeness_pct}% Data Complete
                  </span>
                </div>
                <p className="text-stone-700">
                  Total Recipe Weight: <strong>{calculatedRecipe.total_weight_grams} g</strong> •{' '}
                  Servings: <strong>{calculatedRecipe.servings}</strong> • Per Serving Weight:{' '}
                  <strong>{calculatedRecipe.serving_weight_grams} g</strong>
                </p>
                <p className="text-amber-900 font-medium">{calculatedRecipe.completeness_notice}</p>
              </div>

              <MacroDistributionBarChart
                proteinG={getPerServingVal('protein_g')}
                carbsG={getPerServingVal('carbs_g')}
                fatG={getPerServingVal('fat_total_g')}
                fibreG={getPerServingVal('fibre_g')}
                basisLabel={`Per Serving (${calculatedRecipe.serving_weight_grams}g)`}
              />

              {/* Ingredient Contributions */}
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-stone-900">
                  Ingredient Contribution Breakdown
                </h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-1.5">Ingredient</th>
                        <th className="py-1.5">Weight</th>
                        <th className="py-1.5">Energy</th>
                        <th className="py-1.5">Protein</th>
                        <th className="py-1.5">Carbs</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {calculatedRecipe.ingredients.map((ing, i) => (
                        <tr key={i}>
                          <td className="py-1.5 font-semibold text-stone-800">{ing.food_name}</td>
                          <td className="py-1.5">{ing.grams_equivalent} g</td>
                          <td className="py-1.5">
                            {ing.energy_kcal_contribution !== null
                              ? `${ing.energy_kcal_contribution} kcal`
                              : 'NULL'}
                          </td>
                          <td className="py-1.5">
                            {ing.protein_g_contribution !== null
                              ? `${ing.protein_g_contribution} g`
                              : 'NULL'}
                          </td>
                          <td className="py-1.5">
                            {ing.carbs_g_contribution !== null
                              ? `${ing.carbs_g_contribution} g`
                              : 'NULL'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Nutrient Totals Table */}
              <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="text-sm font-bold text-stone-900">
                  Known Total & Per-Serving Nutrients
                </h3>
                <div className="mt-3 max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="py-1.5">Nutrient</th>
                        <th className="py-1.5">Total Known</th>
                        <th className="py-1.5">Per Serving</th>
                        <th className="py-1.5">Coverage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {calculatedRecipe.nutrients.map((n) => (
                        <tr key={n.nutrient_code}>
                          <td className="py-1.5 font-semibold text-stone-800">
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
                              <span className="text-emerald-700 font-semibold">Complete</span>
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
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// PAGE 9: SAVED RECIPES PAGE
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
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-2xl font-extrabold text-stone-900">Saved Household Recipes</h1>
          <p className="mt-1 text-xs text-stone-600">
            Reopen, scale, or edit your saved household recipes and ICMR-NIN reference meal templates.
          </p>
        </div>
        <Link
          to="/recipes/calculator"
          className="rounded-xl bg-emerald-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
        >
          + Create New Recipe
        </Link>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-stone-200/70" />
      ) : recipes.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-xs text-stone-600">
          No saved recipes yet. Use the Recipe Calculator to create one.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {recipes.map((rec) => {
            const kcal = rec.nutrients.find((n) => n.nutrient_code === 'energy_kcal')?.per_serving_known_value;
            const prot = rec.nutrients.find((n) => n.nutrient_code === 'protein_g')?.per_serving_known_value;
            return (
              <div
                key={rec.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold uppercase text-stone-700">
                      {rec.meal_type} • {rec.servings} servings
                    </span>
                    <span className="text-emerald-800 font-bold">
                      {rec.completeness_pct}% Complete
                    </span>
                  </div>
                  <h2 className="mt-2 text-lg font-bold text-stone-900">{rec.title}</h2>
                  {rec.description && (
                    <p className="mt-1 text-xs text-stone-600">{rec.description}</p>
                  )}
                  <p className="mt-2 text-xs text-stone-700">
                    <strong>Per Serving ({rec.serving_weight_grams}g):</strong>{' '}
                    {kcal ?? 'NULL'} kcal • {prot ?? 'NULL'} g protein
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    Ingredients: {rec.ingredients.map((i) => i.food_name).join(', ')}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                  <Link
                    to={`/recipes/calculator?edit=${rec.id}`}
                    className="font-bold text-emerald-800 hover:underline"
                  >
                    Reopen & Edit in Calculator →
                  </Link>
                  {rec.household_token !== 'system_template' && (
                    <button
                      type="button"
                      onClick={() => void handleDelete(rec.id)}
                      className="text-rose-700 hover:underline"
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
