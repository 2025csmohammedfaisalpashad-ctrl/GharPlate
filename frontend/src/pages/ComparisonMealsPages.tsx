import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EducationalCategoryBadge } from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  FoodSummary,
  MealSuggestionResponse,
  ProductComparisonResponse,
} from '../types/api';

// ==========================================
// PAGE 13: PACKAGED PRODUCT COMPARISON (2–4 PRODUCTS)
// ==========================================
export const ProductComparisonPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [packagedFoods, setPackagedFoods] = useState<FoodSummary[]>([]);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([
    'packaged-crunchy-muesli-almond',
    'packaged-rolled-oats-plain',
    'packaged-glucose-biscuits',
  ]);
  const [comparison, setComparison] = useState<ProductComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .searchFoods({ is_packaged: true, page_size: 50 })
      .then((res) => setPackagedFoods(res.items))
      .catch(() => null);
  }, []);

  useEffect(() => {
    if (selectedSlugs.length < 2 || selectedSlugs.length > 4) return;
    setLoading(true);
    setError(null);
    api
      .compareProducts({
        product_slugs: selectedSlugs,
        condition_codes: activeMember?.selected_conditions || ['type_2_diabetes', 'hypertension'],
        allergies: activeMember?.allergies || [],
        intolerances: activeMember?.intolerances || [],
      })
      .then(setComparison)
      .catch((err) => setError(err instanceof Error ? err.message : 'Comparison failed'))
      .finally(() => setLoading(false));
  }, [selectedSlugs, activeMember]);

  const toggleProduct = (slug: string) => {
    setSelectedSlugs((prev) => {
      if (prev.includes(slug)) {
        return prev.length > 2 ? prev.filter((s) => s !== slug) : prev;
      }
      if (prev.length >= 4) return prev;
      return [...prev, slug];
    });
  };

  const nutrientRows = [
    { code: 'energy_kcal', label: 'Energy (kcal)' },
    { code: 'protein_g', label: 'Protein (g)' },
    { code: 'carbs_g', label: 'Total Carbohydrates (g)' },
    { code: 'sugars_total_g', label: 'Total Sugars (g)' },
    { code: 'sugars_added_g', label: 'Added Sugars (g)' },
    { code: 'fat_total_g', label: 'Total Fat (g)' },
    { code: 'fat_saturated_g', label: 'Saturated Fat (g)' },
    { code: 'fat_trans_g', label: 'Trans Fat (g)' },
    { code: 'fibre_g', label: 'Dietary Fibre (g)' },
    { code: 'sodium_mg', label: 'Sodium (mg)' },
    { code: 'potassium_mg', label: 'Potassium (mg)' },
    { code: 'calcium_mg', label: 'Calcium (mg)' },
    { code: 'iron_mg', label: 'Iron (mg)' },
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          Module 9 — Normalised Packaged Product Comparison (2 to 4 Products)
        </span>
        <h1 className="text-2xl font-extrabold text-stone-900">
          Packaged Product Side-by-Side Comparison
        </h1>
        <p className="text-xs text-stone-600">
          Select 2 to 4 packaged products below. Values are normalised to per 100g / 100ml alongside original serving sizes, data sources, and undeclared (NULL) nutrients.
        </p>

        <div className="flex flex-wrap gap-2">
          {packagedFoods.map((pf) => {
            const active = selectedSlugs.includes(pf.slug);
            return (
              <button
                key={pf.slug}
                type="button"
                onClick={() => toggleProduct(pf.slug)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                  active
                    ? 'border-emerald-800 bg-emerald-800 text-white font-bold'
                    : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {pf.name_en}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-2xl bg-stone-200/70" />
      ) : (
        comparison && (
          <div className="space-y-6">
            <div className="rounded-xl border border-stone-200 bg-stone-100 p-4 text-xs text-stone-700 space-y-1">
              <p><strong>Basis Normalisation:</strong> {comparison.normalized_basis_note}</p>
              <p><strong>Neutrality Principle:</strong> {comparison.neutrality_disclaimer}</p>
            </div>

            {/* Visual Sodium & Added Sugar Bar Chart Comparison */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700">
                Visual Comparison: Added Sugars (g/100g) & Sodium (mg/100g)
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs font-bold text-stone-800 mb-2">Added Sugars per 100g/ml</div>
                  <div className="space-y-2">
                    {comparison.products.map((p) => {
                      const val = p.nutrients_per_100.sugars_added_g;
                      const pct = val !== null && val !== undefined ? Math.min(100, (val / 35) * 100) : 0;
                      return (
                        <div key={p.slug} className="text-xs">
                          <div className="flex justify-between">
                            <span className="truncate pr-2 font-medium">{p.name_en}</span>
                            <span className="font-mono font-bold">{val !== null ? `${val} g` : 'NULL'}</span>
                          </div>
                          <div className="mt-1 h-2.5 w-full rounded-full bg-stone-100">
                            <div
                              className="h-full rounded-full bg-amber-500"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold text-stone-800 mb-2">Sodium per 100g/ml</div>
                  <div className="space-y-2">
                    {comparison.products.map((p) => {
                      const val = p.nutrients_per_100.sodium_mg;
                      const pct = val !== null && val !== undefined ? Math.min(100, (val / 1300) * 100) : 0;
                      return (
                        <div key={p.slug} className="text-xs">
                          <div className="flex justify-between">
                            <span className="truncate pr-2 font-medium">{p.name_en}</span>
                            <span className="font-mono font-bold">{val !== null ? `${val} mg` : 'NULL'}</span>
                          </div>
                          <div className="mt-1 h-2.5 w-full rounded-full bg-stone-100">
                            <div
                              className="h-full rounded-full bg-orange-600"
                              style={{ width: `${Math.max(pct, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Side-by-Side Table */}
            <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="py-3 pr-4 text-stone-500 uppercase">Attribute</th>
                    {comparison.products.map((p) => (
                      <th key={p.slug} className="py-3 px-4 min-w-[200px]">
                        <Link
                          to={`/foods/${p.slug}`}
                          className="text-sm font-extrabold text-stone-900 hover:text-emerald-800 underline"
                        >
                          {p.name_en}
                        </Link>
                        <div className="text-[11px] font-normal text-stone-500 mt-0.5">
                          {p.brand} • Basis: Per {p.normalized_basis}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  <tr>
                    <td className="py-2 pr-4 font-bold text-stone-700">Original Serving Size</td>
                    {comparison.products.map((p) => (
                      <td key={p.slug} className="py-2 px-4">
                        {p.original_serving_name} ({p.original_serving_grams}g)
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-bold text-stone-700">Data Origin & Source</td>
                    {comparison.products.map((p) => (
                      <td key={p.slug} className="py-2 px-4">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-900">
                          {p.source_origin}
                        </span>
                        <div className="text-[11px] text-stone-500 mt-0.5">{p.source_name}</div>
                      </td>
                    ))}
                  </tr>
                  {nutrientRows.map((row) => (
                    <tr key={row.code}>
                      <td className="py-2 pr-4 font-semibold text-stone-800">{row.label}</td>
                      {comparison.products.map((p) => {
                        const v100 = p.nutrients_per_100[row.code];
                        const vServ = p.nutrients_per_serving[row.code];
                        return (
                          <td key={p.slug} className="py-2 px-4 font-mono">
                            {v100 !== null && v100 !== undefined ? (
                              <div>
                                <strong>{v100}</strong> / 100g{' '}
                                <span className="text-stone-500">({vServ} / serve)</span>
                              </div>
                            ) : (
                              <span className="text-stone-400">Unavailable (NULL)</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 pr-4 font-bold text-stone-700">Allergen Declarations</td>
                    {comparison.products.map((p) => (
                      <td key={p.slug} className="py-2 px-4">
                        {p.allergen_tags.length > 0 ? p.allergen_tags.join(', ') : 'None declared'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-bold text-stone-700">Ingredients</td>
                    {comparison.products.map((p) => (
                      <td key={p.slug} className="py-2 px-4 text-[11px] text-stone-600">
                        {p.ingredients_text || 'Not available'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="py-2 pr-4 font-bold text-stone-700">Condition Context</td>
                    {comparison.products.map((p) => (
                      <td key={p.slug} className="py-2 px-4 space-y-1.5">
                        {p.condition_notes.slice(0, 3).map((obs) => (
                          <div key={obs.rule_code} className="space-y-0.5">
                            <EducationalCategoryBadge category={obs.educational_category} />
                            <div className="text-[11px] text-stone-600 line-clamp-2">
                              {obs.explanation}
                            </div>
                          </div>
                        ))}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
};

// ==========================================
// PAGE 14: PERSONALISED INDIAN MEAL SUGGESTIONS
// ==========================================
export const MealSuggestionsPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [mealType, setMealType] = useState('all');
  const [dietaryPreference, setDietaryPreference] = useState(
    activeMember?.dietary_preference || 'vegetarian'
  );
  const [conditionCodes, setConditionCodes] = useState<string[]>(
    activeMember?.selected_conditions || ['type_2_diabetes']
  );
  const [ingredientKeywords, setIngredientKeywords] = useState('ragi, dal, rice, curd');
  const [suggestionsRes, setSuggestionsRes] = useState<MealSuggestionResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (activeMember) {
      setDietaryPreference(activeMember.dietary_preference);
      if (activeMember.selected_conditions.length > 0) {
        setConditionCodes(activeMember.selected_conditions);
      }
    }
  }, [activeMember]);

  useEffect(() => {
    setLoading(true);
    api
      .getMealSuggestions({
        meal_type: mealType,
        dietary_preference: dietaryPreference,
        condition_codes: conditionCodes,
        allergies: activeMember?.allergies || [],
        intolerances: activeMember?.intolerances || [],
        available_ingredient_keywords: ingredientKeywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        age_group: activeMember?.age_group || 'adult',
      })
      .then(setSuggestionsRes)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [mealType, dietaryPreference, conditionCodes, ingredientKeywords, activeMember]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
          Module 10 — Structured Indian Household Meal Suggestions
        </span>
        <h1 className="text-2xl font-extrabold text-stone-900">
          Personalised Indian Meal Suggestions
        </h1>
        <p className="text-xs text-stone-600">
          Generated deterministically from verified ICMR-NIN DGI 2024 recipes and IFCT 2017 food records (never hallucinated by an LLM). Filters automatically respect your household member's dietary preferences, allergies, intolerances, and health considerations.
        </p>

        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <label className="block text-xs font-bold text-stone-700">Meal Type</label>
            <select
              aria-label="Filter Meal Type"
              value={mealType}
              onChange={(e) => setMealType(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
            >
              <option value="all">All Meals (Breakfast, Lunch, Dinner, Snacks)</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
              <option value="snack">Snacks</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700">Dietary Preference</label>
            <select
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
            >
              <option value="vegetarian">Vegetarian</option>
              <option value="eggetarian">Eggetarian</option>
              <option value="non_vegetarian">Non-Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-stone-700">
              Pantry / Available Ingredients (Comma-separated)
            </label>
            <input
              type="text"
              value={ingredientKeywords}
              onChange={(e) => setIngredientKeywords(e.target.value)}
              placeholder="e.g. ragi, moong, poha, curd, jowar, fish"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl bg-stone-200/70" />
      ) : (
        suggestionsRes && (
          <div className="space-y-4">
            {suggestionsRes.has_conflicting_conditions && (
              <div className="rounded-2xl border-2 border-purple-400 bg-purple-50 p-4 text-xs text-purple-950 space-y-1.5">
                <div className="font-extrabold text-sm">
                  Competing Multi-Condition Considerations Detected
                </div>
                {suggestionsRes.conflict_warnings.map((cw) => (
                  <p key={cw.conflict_code}>
                    • <strong>{cw.competing_domain}:</strong> {cw.conflict_explanation}{' '}
                    <em>({cw.professional_guidance_notice})</em>
                  </p>
                ))}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              {suggestionsRes.suggestions.map((card) => (
                <div
                  key={card.suggestion_id}
                  className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col justify-between space-y-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="rounded-md bg-emerald-100 px-2.5 py-0.5 font-bold uppercase text-emerald-900">
                        {card.meal_type}
                      </span>
                      <span className="text-stone-500">
                        Data Completeness: {card.completeness_pct}%
                      </span>
                    </div>

                    <h2 className="text-lg font-bold text-stone-900">{card.title}</h2>
                    <div className="text-xs text-stone-700">
                      <strong>Meal Components:</strong> {card.components.join(' + ')}
                    </div>
                    <p className="text-xs text-stone-600 leading-relaxed">{card.why_suggested}</p>

                    <div className="grid grid-cols-4 gap-2 rounded-xl bg-stone-50 p-2.5 text-center text-xs">
                      <div>
                        <div className="text-stone-500">Energy</div>
                        <div className="font-bold">{card.nutritional_summary.energy_kcal} kcal</div>
                      </div>
                      <div>
                        <div className="text-stone-500">Protein</div>
                        <div className="font-bold text-emerald-800">{card.nutritional_summary.protein_g} g</div>
                      </div>
                      <div>
                        <div className="text-stone-500">Carbs</div>
                        <div className="font-bold">{card.nutritional_summary.carbs_g} g</div>
                      </div>
                      <div>
                        <div className="text-stone-500">Fibre</div>
                        <div className="font-bold text-amber-800">{card.nutritional_summary.fibre_g} g</div>
                      </div>
                    </div>

                    {card.condition_relevance_notes.length > 0 && (
                      <div className="space-y-1 text-xs text-emerald-900 bg-emerald-50/70 p-2.5 rounded-xl">
                        {card.condition_relevance_notes.map((n, i) => (
                          <p key={i}>• {n}</p>
                        ))}
                      </div>
                    )}

                    {card.caution_notes.length > 0 && (
                      <div className="space-y-1 text-xs text-amber-950 bg-amber-50 p-2.5 rounded-xl">
                        {card.caution_notes.map((n, i) => (
                          <p key={i}>• {n}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-stone-100 pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-stone-500">
                      Sources: {card.source_citations.join('; ')}
                    </span>
                    <div className="flex gap-2">
                      {card.primary_food_slugs.map((slug) => (
                        <Link
                          key={slug}
                          to={`/foods/${slug}`}
                          className="font-semibold text-emerald-800 underline"
                        >
                          {slug.split('-')[0]} ↗
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};
