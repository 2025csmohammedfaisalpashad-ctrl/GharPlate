import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  EducationalCategoryBadge,
  ExpandableSection,
  FoodImage,
} from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  FoodSummary,
  MealSuggestionCard,
  MealSuggestionResponse,
  ProductComparisonResponse,
} from '../types/api';

// ==========================================
// PAGE 13: VISUAL PACKAGED PRODUCT COMPARISON (2–4 PRODUCTS)
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

  const visualMetrics = [
    { code: 'sugars_added_g', label: 'Added Sugars', unit: 'g', max: 30, color: 'bg-amber-500' },
    { code: 'protein_g', label: 'Protein', unit: 'g', max: 20, color: 'bg-emerald-600' },
    { code: 'energy_kcal', label: 'Energy', unit: 'kcal', max: 600, color: 'bg-stone-700' },
    { code: 'fat_total_g', label: 'Total Fat', unit: 'g', max: 40, color: 'bg-orange-500' },
    { code: 'sodium_mg', label: 'Sodium', unit: 'mg', max: 1200, color: 'bg-rose-500' },
    { code: 'fibre_g', label: 'Dietary Fibre', unit: 'g', max: 15, color: 'bg-teal-600' },
  ];

  return (
    <div className="space-y-8">
      {/* Header & Visual Product Selector */}
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
            Compare Packaged Products Side by Side
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-500">
            Select 2 to 4 packaged products below. Values are normalised to 100g/100ml so different serving sizes don’t mislead you.
          </p>
        </div>

        <div className="grid gap-2.5 grid-cols-2 sm:grid-cols-4">
          {packagedFoods.map((pf) => {
            const active = selectedSlugs.includes(pf.slug);
            return (
              <button
                key={pf.slug}
                type="button"
                onClick={() => toggleProduct(pf.slug)}
                className={`flex items-center gap-2.5 rounded-2xl border p-2.5 text-left text-xs transition ${
                  active
                    ? 'border-emerald-800 bg-emerald-50 font-extrabold text-emerald-950 ring-2 ring-emerald-700/20'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
                }`}
              >
                <FoodImage
                  src={pf.image_url}
                  foodName={pf.name_en}
                  categorySlug="packaged-foods"
                  aspectClass="h-10 w-10 shrink-0 rounded-xl"
                />
                <span className="line-clamp-2">{pf.name_en.replace('Packaged ', '')}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-xs font-bold text-rose-900">
          {error}
        </div>
      )}

      {loading ? (
        <div className="h-64 animate-pulse rounded-3xl bg-stone-200/70" />
      ) : (
        comparison && (
          <div className="space-y-8">
            {/* Side-by-Side Visual Product Cards */}
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {comparison.products.map((p) => (
                <div
                  key={p.slug}
                  className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm flex flex-col justify-between"
                >
                  <div>
                    <FoodImage
                      src={p.image_url}
                      foodName={p.name_en}
                      categorySlug="packaged-foods"
                      aspectClass="aspect-[16/10]"
                    />
                    <div className="p-5 space-y-4">
                      <div>
                        <span className="text-[11px] font-bold text-purple-800">
                          {p.brand}
                        </span>
                        <Link
                          to={`/foods/${p.slug}`}
                          className="block mt-0.5 text-lg font-extrabold text-stone-900 hover:text-emerald-800"
                        >
                          {p.name_en}
                        </Link>
                        <p className="text-xs text-stone-500 mt-0.5">
                          Declared Serving: {p.original_serving_name} ({p.original_serving_grams}g)
                        </p>
                      </div>

                      {/* Visual Nutrient Bars per 100g/ml */}
                      <div className="space-y-2.5 pt-2 border-t border-stone-100">
                        {visualMetrics.map((m) => {
                          const val = p.nutrients_per_100[m.code];
                          const pct =
                            val !== null && val !== undefined
                              ? Math.min(100, Math.round((val / m.max) * 100))
                              : 0;
                          return (
                            <div key={m.code} className="text-xs">
                              <div className="flex justify-between font-bold text-stone-800">
                                <span>{m.label}</span>
                                <span>
                                  {val !== null && val !== undefined
                                    ? `${val} ${m.unit}`
                                    : 'NULL (Not Declared)'}
                                </span>
                              </div>
                              <div className="mt-1 h-2 w-full rounded-full bg-stone-100">
                                {val !== null && val !== undefined ? (
                                  <div
                                    className={`h-full rounded-full ${m.color}`}
                                    style={{ width: `${Math.max(pct, 3)}%` }}
                                  />
                                ) : (
                                  <div className="h-full w-full bg-stone-200/50" />
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Concise Condition Badges */}
                      {p.condition_notes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-2">
                          {p.condition_notes.slice(0, 2).map((obs) => (
                            <EducationalCategoryBadge
                              key={obs.rule_code}
                              category={obs.educational_category}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="px-5 py-3 border-t border-stone-100 bg-stone-50/60 flex items-center justify-between text-xs">
                    <span className="text-stone-500">Per {p.normalized_basis} basis</span>
                    <Link
                      to={`/foods/${p.slug}`}
                      className="font-extrabold text-emerald-800 hover:underline"
                    >
                      Inspect Label →
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* Expandable Full Comparison Table & Ingredients */}
            <ExpandableSection
              title="Detailed Ingredients, Allergens & Per-Serving Table"
              subtitle={comparison.neutrality_disclaimer}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200">
                      <th className="py-2 pr-4 text-stone-500">Attribute</th>
                      {comparison.products.map((p) => (
                        <th key={p.slug} className="py-2 px-4 font-extrabold text-stone-900">
                          {p.name_en}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    <tr>
                      <td className="py-2 pr-4 font-bold">Declared Allergens</td>
                      {comparison.products.map((p) => (
                        <td key={p.slug} className="py-2 px-4">
                          {p.allergen_tags.length > 0 ? p.allergen_tags.join(', ') : 'None listed'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-bold">Ingredients List</td>
                      {comparison.products.map((p) => (
                        <td key={p.slug} className="py-2 px-4 text-stone-600">
                          {p.ingredients_text || 'Not available'}
                        </td>
                      ))}
                    </tr>
                    <tr>
                      <td className="py-2 pr-4 font-bold">Undeclared (NULL) Nutrients</td>
                      {comparison.products.map((p) => (
                        <td key={p.slug} className="py-2 px-4 text-stone-500">
                          {p.unavailable_nutrients.join(', ') || 'None'}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </ExpandableSection>
          </div>
        )
      )}
    </div>
  );
};

// ==========================================
// PAGE 14: IMAGE-LED MEAL SUGGESTIONS PAGE
// ==========================================
const MealCardItem: React.FC<{ card: MealSuggestionCard }> = ({ card }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm flex flex-col justify-between transition hover:shadow-md">
      <div>
        <div className="relative">
          <FoodImage
            src={card.image_url}
            foodName={card.title}
            categorySlug="indian-dishes"
            aspectClass="aspect-[16/10]"
          />
          <span className="absolute top-3 left-3 rounded-full bg-emerald-900/90 px-3 py-1 text-[11px] font-extrabold uppercase text-white backdrop-blur">
            {card.meal_type}
          </span>
        </div>

        <div className="p-5 space-y-3">
          <h2 className="text-lg font-extrabold text-stone-900">{card.title}</h2>
          <p className="text-xs text-stone-600 leading-relaxed line-clamp-2">
            {card.why_suggested}
          </p>

          {/* Compact Nutritional Highlights */}
          <div className="grid grid-cols-4 gap-2 rounded-2xl bg-stone-50 p-2.5 text-center text-xs">
            <div>
              <div className="text-[10px] text-stone-400 font-bold">Calories</div>
              <div className="font-extrabold text-stone-900">
                {card.nutritional_summary.energy_kcal}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-emerald-700 font-bold">Protein</div>
              <div className="font-extrabold text-emerald-900">
                {card.nutritional_summary.protein_g}g
              </div>
            </div>
            <div>
              <div className="text-[10px] text-stone-400 font-bold">Carbs</div>
              <div className="font-extrabold text-stone-900">
                {card.nutritional_summary.carbs_g}g
              </div>
            </div>
            <div>
              <div className="text-[10px] text-amber-700 font-bold">Fibre</div>
              <div className="font-extrabold text-amber-900">
                {card.nutritional_summary.fibre_g}g
              </div>
            </div>
          </div>

          {expanded && (
            <div className="space-y-2.5 rounded-2xl bg-stone-50 p-3.5 text-xs border border-stone-200/70">
              <div>
                <strong className="text-stone-900">Serving Components:</strong>{' '}
                <span className="text-stone-700">{card.components.join(' + ')}</span>
              </div>
              {card.condition_relevance_notes.map((n, i) => (
                <p key={i} className="text-emerald-900 font-medium">
                  • {n}
                </p>
              ))}
              {card.caution_notes.map((c, i) => (
                <p key={i} className="text-amber-900 font-medium">
                  • {c}
                </p>
              ))}
              <div className="pt-1 text-[11px] text-stone-500">
                Sources: {card.source_citations.join('; ')}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 py-3.5 border-t border-stone-100 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="font-extrabold text-emerald-800 hover:underline"
        >
          {expanded ? 'Hide Meal Details ▴' : 'Ingredients & Evidence ▾'}
        </button>

        <div className="flex gap-2">
          {card.primary_food_slugs.slice(0, 2).map((slug) => (
            <Link
              key={slug}
              to={`/foods/${slug}`}
              className="rounded-lg bg-stone-100 px-2.5 py-1 font-bold text-stone-700 hover:bg-emerald-50 hover:text-emerald-900"
            >
              {slug.split('-')[0]} →
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

export const MealSuggestionsPage: React.FC = () => {
  const { household, activeMember, setActiveMemberId } = useHousehold();
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
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
              Discover Indian Meals
            </h1>
            <p className="text-xs sm:text-sm text-stone-500">
              Practical Breakfast, Lunch, Dinner, and Snack ideas tailored to your household member.
            </p>
          </div>

          {household && household.members.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-3.5 py-2 text-xs">
              <span className="font-bold text-emerald-950">Member:</span>
              <select
                value={activeMember?.id || ''}
                onChange={(e) => void setActiveMemberId(Number(e.target.value))}
                className="bg-transparent font-extrabold text-emerald-900 focus:outline-none"
              >
                {household.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Visual Meal Type Tabs + Diet Filter */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap gap-1.5">
            {[
              { id: 'all', label: 'All Meals', icon: '🍽️' },
              { id: 'breakfast', label: 'Breakfast', icon: '🌅' },
              { id: 'lunch', label: 'Lunch', icon: '☀️' },
              { id: 'dinner', label: 'Dinner', icon: '🌙' },
              { id: 'snack', label: 'Snacks', icon: '🍵' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMealType(tab.id)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold transition ${
                  mealType === tab.id
                    ? 'bg-emerald-800 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter Meal Dietary Preference"
              value={dietaryPreference}
              onChange={(e) => setDietaryPreference(e.target.value)}
              className="rounded-2xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold"
            >
              <option value="vegetarian">Vegetarian</option>
              <option value="eggetarian">Eggetarian</option>
              <option value="non_vegetarian">Non-Vegetarian</option>
              <option value="vegan">Vegan</option>
            </select>
            <input
              type="text"
              value={ingredientKeywords}
              onChange={(e) => setIngredientKeywords(e.target.value)}
              placeholder="Pantry items (e.g. ragi, dal)..."
              className="rounded-2xl border border-stone-300 px-3.5 py-2 text-xs w-44"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-72 animate-pulse rounded-3xl bg-stone-200/70" />
          ))}
        </div>
      ) : (
        suggestionsRes && (
          <div className="space-y-5">
            {suggestionsRes.has_conflicting_conditions && (
              <div className="rounded-2xl border border-purple-300 bg-purple-50 p-4 text-xs text-purple-950">
                <strong>🩺 Multi-Condition Note:</strong>{' '}
                {suggestionsRes.conflict_warnings.map((cw) => cw.conflict_explanation).join(' ')}
              </div>
            )}

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {suggestionsRes.suggestions.map((card) => (
                <MealCardItem key={card.suggestion_id} card={card} />
              ))}
            </div>
          </div>
        )
      )}
    </div>
  );
};
