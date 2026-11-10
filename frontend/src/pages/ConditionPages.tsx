import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  EducationalCategoryBadge,
  ExpandableSection,
  FoodImage,
  ObservationCard,
} from '../components/UIWidgets';
import {
  clearAssistantEntityContext,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  ConditionFoodRecommendationItem,
  ConditionFoodRecommendationResponse,
  GuidanceEvaluationResponse,
  HealthConditionDetail,
  HealthConditionSummary,
} from '../types/api';
import { CONDITION_GROUP_VISUALS } from '../utils/visualAssets';

const RELEVANCE_BADGE_STYLES: Record<
  string,
  { label: string; bg: string; border: string; text: string; icon: string }
> = {
  relevant_food_to_explore: {
    label: 'Relevant food to explore',
    bg: 'bg-emerald-50',
    border: 'border-emerald-300',
    text: 'text-emerald-900',
    icon: '🌿',
  },
  portion_sensitive: {
    label: 'Portion-sensitive',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    text: 'text-amber-950',
    icon: '⚖️',
  },
  nutrient_to_monitor: {
    label: 'Nutrient to monitor',
    bg: 'bg-orange-50',
    border: 'border-orange-300',
    text: 'text-orange-950',
    icon: '📊',
  },
  individualised_advice_required: {
    label: 'Individualised advice required',
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    text: 'text-purple-950',
    icon: '🩺',
  },
  insufficient_information: {
    label: 'Insufficient information',
    bg: 'bg-stone-100',
    border: 'border-stone-300',
    text: 'text-stone-700',
    icon: 'ℹ️',
  },
};

function formatDietaryBadge(item: ConditionFoodRecommendationItem): {
  label: string;
  className: string;
} {
  if (item.dietary_compatibility.is_vegan) {
    return {
      label: 'Vegan & Vegetarian',
      className: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    };
  }
  if (item.dietary_compatibility.is_vegetarian) {
    return {
      label: 'Vegetarian',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    };
  }
  if (item.dietary_compatibility.is_eggetarian_compatible) {
    return {
      label: 'Contains Egg (Eggetarian)',
      className: 'bg-amber-100 text-amber-900 border-amber-300',
    };
  }
  return {
    label: 'Non-Vegetarian',
    className: 'bg-rose-100 text-rose-900 border-rose-300',
  };
}

// ==========================================
// PAGE 4: VISUAL CONDITION EXPLORER PAGE
// ==========================================
export const ConditionExplorerPage: React.FC = () => {
  const { household, activeMember, setActiveMemberId } = useHousehold();
  const [conditions, setConditions] = useState<HealthConditionSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getConditions()
      .then(setConditions)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const groups = Array.from(
    new Map(conditions.map((c) => [c.condition_group_code, c.condition_group_name])).entries()
  );

  const visibleConditions = selectedGroup
    ? conditions.filter((c) => c.condition_group_code === selectedGroup)
    : conditions;

  return (
    <div className="space-y-8">
      {/* Header + Active Household Member Selector */}
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-stone-900">
            Check Food for a Health Condition
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-600">
            Choose a condition group below to see personalised nutritional relevance for your active family member.
          </p>
        </div>

        {household && household.members.length > 0 && (
          <div className="flex items-center gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-2 text-xs">
            <span className="font-bold text-emerald-950">Active Member:</span>
            <select
              aria-label="Condition Explorer Member Selector"
              value={activeMember?.id || ''}
              onChange={(e) => void setActiveMemberId(Number(e.target.value))}
              className="bg-transparent font-extrabold text-emerald-900 focus:outline-none"
            >
              {household.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name} ({m.age_group.replace('_', ' ')})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Visual Condition Category Cards (9 Categories with Icons & Short Descriptions) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-stone-500">
            Visual Condition Categories
          </h2>
          {selectedGroup && (
            <button
              type="button"
              onClick={() => setSelectedGroup('')}
              className="text-xs font-bold text-emerald-800 hover:underline"
            >
              Show All Categories
            </button>
          )}
        </div>

        <div className="grid gap-3.5 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {groups.map(([code, fullName]) => {
            const meta = CONDITION_GROUP_VISUALS[code] || CONDITION_GROUP_VISUALS.A_metabolic;
            const active = selectedGroup === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => setSelectedGroup(active ? '' : code)}
                className={`text-left rounded-3xl border p-4 transition-all ${
                  active
                    ? 'border-emerald-800 bg-emerald-900 text-white shadow-md scale-[1.02]'
                    : `${meta.bgClass} ${meta.borderClass} ${meta.textClass} hover:shadow-md`
                }`}
              >
                <div className="text-2xl">{meta.icon}</div>
                <div className="mt-2.5 text-sm font-extrabold">
                  {meta.shortTitle || fullName}
                </div>
                <p
                  className={`mt-1 text-[11px] line-clamp-2 ${
                    active ? 'text-emerald-100' : 'opacity-75'
                  }`}
                >
                  {meta.subtitle}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Condition Cards */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-44 animate-pulse rounded-3xl bg-stone-200/70" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleConditions.map((cond) => {
            const meta =
              CONDITION_GROUP_VISUALS[cond.condition_group_code] ||
              CONDITION_GROUP_VISUALS.A_metabolic;
            const isMemberSelected = activeMember?.selected_conditions.includes(cond.code);

            return (
              <Link
                key={cond.code}
                to={`/conditions/${cond.code}`}
                className="group flex flex-col justify-between rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-600 hover:shadow-lg"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${meta.badgeClass}`}>
                      {meta.icon} {meta.shortTitle}
                    </span>
                    {isMemberSelected && (
                      <span className="rounded-full bg-emerald-800 px-2.5 py-0.5 text-[10px] font-bold text-white">
                        In {activeMember?.display_name}’s Profile
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 text-lg font-extrabold text-stone-900 group-hover:text-emerald-800">
                    {cond.name}
                  </h3>
                  <p className="mt-1.5 text-xs text-stone-600 line-clamp-2 leading-relaxed">
                    {cond.nutritional_meaning}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {cond.relevant_nutrients.slice(0, 4).map((nut) => (
                      <span
                        key={nut}
                        className="rounded-lg bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700"
                      >
                        {nut.replace('_g', '').replace('_mg', '').replace('_mcg', '').replace('_kcal', '')}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
                  <span className="text-stone-400">
                    {cond.source_name} ({cond.publication_year})
                  </span>
                  <span className="font-extrabold text-emerald-800">
                    Explore Foods →
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ==========================================
// PAGE 5: PERSONALISED CONDITION DETAIL & FOOD CHECKER PAGE
// ==========================================
export const ConditionDetailPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const { household, activeMember, setActiveMemberId } = useHousehold();
  const [condition, setCondition] = useState<HealthConditionDetail | null>(null);
  const [recommendationData, setRecommendationData] =
    useState<ConditionFoodRecommendationResponse | null>(null);
  const [dietaryOverride, setDietaryOverride] = useState<string>('');
  const [relevanceFilter, setRelevanceFilter] = useState<string>('all');
  const [foodFilterQuery, setFoodFilterQuery] = useState('');
  const [selectedFoodForCheck, setSelectedFoodForCheck] =
    useState<ConditionFoodRecommendationItem | null>(null);
  const [liveGuidance, setLiveGuidance] = useState<GuidanceEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);

    const effectiveDietaryPref =
      dietaryOverride === 'all_unfiltered'
        ? undefined
        : dietaryOverride || activeMember?.dietary_preference || undefined;

    const effectiveMemberId =
      dietaryOverride === 'all_unfiltered' ? undefined : activeMember?.id;

    Promise.all([
      api.getConditionDetail(code),
      api.getFoodsByCondition(code, {
        household_token:
          dietaryOverride === 'all_unfiltered' ? undefined : household?.household_token,
        member_id: effectiveMemberId,
        dietary_preference: effectiveDietaryPref,
      }),
    ])
      .then(([condRes, recRes]) => {
        setCondition(condRes);
        setRecommendationData(recRes);
        publishAssistantContext({
          page_type: 'condition_detail',
          route: `/conditions/${condRes.code}`,
          condition_code: condRes.code,
          selected_entity: {
            type: 'condition',
            id: condRes.code,
            name: condRes.name,
            category: condRes.condition_group_name,
            summary: condRes.nutritional_meaning,
          },
          selected_condition: {
            code: condRes.code,
            name: condRes.name,
            relevant_nutrients: condRes.relevant_nutrients,
          },
        });
        if (recRes.foods.length > 0) {
          setSelectedFoodForCheck((prev) => {
            if (prev && recRes.foods.some((f) => f.slug === prev.slug)) {
              return recRes.foods.find((f) => f.slug === prev.slug) || recRes.foods[0];
            }
            return recRes.foods[0];
          });
        } else {
          setSelectedFoodForCheck(null);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));

    return () => {
      clearAssistantEntityContext(`/conditions/${code}`);
    };
  }, [code, activeMember?.id, activeMember?.dietary_preference, household?.household_token, dietaryOverride]);

  useEffect(() => {
    if (!condition || !selectedFoodForCheck) return;
    const condsToEval = Array.from(
      new Set([condition.code, ...(activeMember?.selected_conditions || [])])
    );
    api
      .evaluateGuidance({
        food_slug: selectedFoodForCheck.slug,
        condition_codes: condsToEval,
        serving_unit: 'standard_serving',
        serving_quantity: 1,
        age_group: activeMember?.age_group || 'adult',
        allergies: activeMember?.allergies || [],
        intolerances: activeMember?.intolerances || [],
        dietary_preference:
          dietaryOverride && dietaryOverride !== 'all_unfiltered'
            ? dietaryOverride
            : activeMember?.dietary_preference,
      })
      .then(setLiveGuidance)
      .catch(() => null);
  }, [condition, selectedFoodForCheck, activeMember, dietaryOverride]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-stone-200/70" />;
  }
  if (!condition) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        Condition record not found.{' '}
        <Link to="/conditions" className="font-bold underline">
          Return to Condition Explorer
        </Link>
      </div>
    );
  }

  const meta =
    CONDITION_GROUP_VISUALS[condition.condition_group_code] ||
    CONDITION_GROUP_VISUALS.A_metabolic;

  const foods = recommendationData?.foods || [];

  const filteredFoods = foods.filter((f) => {
    const matchesRelevance =
      relevanceFilter === 'all' || f.relevance_type === relevanceFilter;
    const matchesQuery =
      !foodFilterQuery.trim() ||
      f.name_en.toLowerCase().includes(foodFilterQuery.toLowerCase()) ||
      f.reason.toLowerCase().includes(foodFilterQuery.toLowerCase()) ||
      f.relevant_tags.some((t) =>
        t.toLowerCase().includes(foodFilterQuery.toLowerCase())
      ) ||
      f.aliases.some((a) =>
        a.alias_text.toLowerCase().includes(foodFilterQuery.toLowerCase())
      );
    return matchesRelevance && matchesQuery;
  });

  const relevanceCounts = foods.reduce<Record<string, number>>((acc, item) => {
    acc[item.relevance_type] = (acc[item.relevance_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-stone-500 flex items-center gap-2">
        <Link to="/conditions" className="hover:underline text-emerald-800 font-bold">
          Condition Explorer
        </Link>
        <span>/</span>
        <span className="text-stone-800 font-semibold">{condition.name}</span>
      </nav>

      {/* Concise Visual Condition Header */}
      <section className={`rounded-3xl border p-6 sm:p-8 shadow-sm ${meta.bgClass} ${meta.borderClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-stone-900 shadow-sm">
                {meta.icon} {condition.condition_group_name}
              </span>
              {condition.is_short_term_illness && (
                <span className="rounded-full bg-amber-200 px-3 py-1 text-xs font-extrabold text-amber-950">
                  Short-Term Illness Support (Not Chronic)
                </span>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-stone-900">{condition.name}</h1>
            <p className="text-sm text-stone-800 leading-relaxed">
              {condition.nutritional_meaning}
            </p>
          </div>

          <a
            href={condition.source.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-2xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-sm hover:bg-emerald-50"
          >
            Source: {condition.source.name} ({condition.publication_year}) ↗
          </a>
        </div>

        {condition.red_flag_warning && (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-white/95 p-4 text-xs font-semibold text-rose-900">
            {condition.red_flag_warning}
          </div>
        )}
      </section>

      {/* Household Member & Dietary Preference Context Bar */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
              Evidence-Reviewed Condition Food Relevance
            </span>
            {recommendationData?.member_context.personalised ? (
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                Personalised Filter Active
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700">
                All Dietary Preferences Shown
              </span>
            )}
          </div>
          <p className="text-xs text-stone-600">
            {recommendationData?.member_context.personalisation_note}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {household && household.members.length > 0 && (
            <div className="flex items-center gap-2 rounded-2xl bg-stone-50 border border-stone-200 px-3.5 py-2 text-xs">
              <span className="font-bold text-stone-700">Member:</span>
              <select
                aria-label="Member Filter for Condition"
                value={activeMember?.id || ''}
                onChange={(e) => {
                  setDietaryOverride('');
                  void setActiveMemberId(Number(e.target.value));
                }}
                className="bg-transparent font-extrabold text-emerald-900 focus:outline-none"
              >
                {household.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name} ({m.dietary_preference.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 rounded-2xl bg-stone-50 border border-stone-200 px-3.5 py-2 text-xs">
            <span className="font-bold text-stone-700">Dietary Filter:</span>
            <select
              aria-label="Dietary Preference Override"
              value={dietaryOverride}
              onChange={(e) => setDietaryOverride(e.target.value)}
              className="bg-transparent font-extrabold text-stone-900 focus:outline-none"
            >
              <option value="">
                {activeMember
                  ? `Use ${activeMember.display_name}’s Preference (${activeMember.dietary_preference.replace('_', ' ')})`
                  : 'All Reviewed Foods (No Dietary Assumption)'}
              </option>
              <option value="all_unfiltered">Show All Reviewed Foods (Unfiltered)</option>
              <option value="vegetarian">Vegetarian Only</option>
              <option value="vegan">Vegan Only</option>
              <option value="eggetarian">Eggetarian (Vegetarian + Egg)</option>
              <option value="non_vegetarian">Non-Vegetarian Inclusive</option>
              <option value="jain">Jain Compatible</option>
            </select>
          </div>
        </div>
      </section>

      {/* INTERACTIVE FOOD-AGAINST-CONDITION CHECKER */}
      {selectedFoodForCheck && (
        <section className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-stone-900">
                Interactive Food Check for {condition.name}
              </h2>
              <p className="text-xs text-stone-500">
                {activeMember
                  ? `Evaluated for ${activeMember.display_name} • Select any reviewed food below to inspect its rule-based guidance`
                  : 'Select any reviewed food below to inspect its rule-based guidance'}
              </p>
            </div>
            <Link
              to={`/foods/${selectedFoodForCheck.slug}`}
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
            >
              Open Full {selectedFoodForCheck.name_en} Page →
            </Link>
          </div>

          <div className="grid gap-6 lg:grid-cols-12 items-start">
            {/* Selected Food Photo Card */}
            <div className="lg:col-span-4 rounded-2xl border border-stone-200 overflow-hidden bg-stone-50">
              <FoodImage
                src={selectedFoodForCheck.image_url}
                foodName={selectedFoodForCheck.name_en}
                categorySlug={selectedFoodForCheck.category_slug}
                aspectClass="aspect-[16/10]"
              />
              <div className="p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="text-xs font-bold text-emerald-800">
                    {selectedFoodForCheck.category_name}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                      formatDietaryBadge(selectedFoodForCheck).className
                    }`}
                  >
                    {formatDietaryBadge(selectedFoodForCheck).label}
                  </span>
                </div>
                <div className="text-lg font-black text-stone-900">
                  {selectedFoodForCheck.name_en}
                </div>
                <p className="text-xs text-stone-700 leading-relaxed">
                  {selectedFoodForCheck.reason}
                </p>
                <div className="text-[11px] text-stone-500">
                  Evaluated Serving: {selectedFoodForCheck.standard_serving_name} ({selectedFoodForCheck.standard_serving_grams}g)
                </div>
              </div>
            </div>

            {/* Concise Guidance Observations */}
            <div className="lg:col-span-8 space-y-3">
              {liveGuidance?.multi_condition_conflicts.map((conf) => (
                <div
                  key={conf.conflict_code}
                  className="rounded-2xl border border-purple-300 bg-purple-50 p-4 text-xs text-purple-950"
                >
                  <strong>🩺 Multi-Condition Note ({conf.competing_domain}):</strong>{' '}
                  {conf.conflict_explanation}
                </div>
              ))}
              {liveGuidance?.observations.map((obs) => (
                <ObservationCard key={`${obs.rule_code}-${obs.condition_code}`} obs={obs} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Reviewed Condition-Specific Food Recommendations Grid */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-stone-900">
              Reviewed Foods & Nutritional Relevance for {condition.name}
            </h2>
            <p className="text-xs text-stone-500">
              Only explicitly mapped, evidence-reviewed foods for this condition are displayed — never unreviewed category dumps.
            </p>
          </div>
          <input
            type="text"
            value={foodFilterQuery}
            onChange={(e) => setFoodFilterQuery(e.target.value)}
            placeholder="Filter reviewed foods or tags..."
            className="rounded-2xl border border-stone-300 bg-white px-4 py-2 text-xs w-64"
          />
        </div>

        {/* Relevance Category Filter Pills */}
        {foods.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setRelevanceFilter('all')}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition ${
                relevanceFilter === 'all'
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-700 border-stone-200 hover:bg-stone-50'
              }`}
            >
              All Reviewed ({foods.length})
            </button>
            {Object.entries(RELEVANCE_BADGE_STYLES).map(([typeKey, style]) => {
              const count = relevanceCounts[typeKey] || 0;
              if (count === 0) return null;
              const active = relevanceFilter === typeKey;
              return (
                <button
                  key={typeKey}
                  type="button"
                  onClick={() => setRelevanceFilter(active ? 'all' : typeKey)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-bold border transition ${
                    active
                      ? 'bg-emerald-900 text-white border-emerald-900'
                      : `${style.bg} ${style.border} ${style.text}`
                  }`}
                >
                  {style.icon} {style.label} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Empty State if No Reviewed Foods Exist */}
        {foods.length === 0 ? (
          <div
            data-testid="empty-condition-foods"
            className="rounded-3xl border border-stone-200 bg-stone-50 p-8 text-center space-y-2"
          >
            <div className="text-2xl">📋</div>
            <div className="text-sm font-extrabold text-stone-900">
              {recommendationData?.empty_state_message ||
                'No sufficiently reviewed food recommendations are available for this condition yet.'}
            </div>
            <p className="text-xs text-stone-600 max-w-xl mx-auto">
              GharPlate only displays foods that have been explicitly mapped and reviewed against documented nutritional guidance for this condition.
            </p>
          </div>
        ) : filteredFoods.length === 0 ? (
          <div className="rounded-3xl border border-stone-200 bg-stone-50 p-6 text-center text-xs text-stone-600">
            No reviewed foods match your current filter query. Try clearing the search filter above.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filteredFoods.map((item) => {
              const badge =
                RELEVANCE_BADGE_STYLES[item.relevance_type] ||
                RELEVANCE_BADGE_STYLES.relevant_food_to_explore;
              const dietBadge = formatDietaryBadge(item);

              return (
                <div
                  key={item.slug}
                  data-testid={`condition-food-card-${item.slug}`}
                  className="flex flex-col justify-between rounded-3xl border border-stone-200/90 bg-white overflow-hidden shadow-sm hover:shadow-md transition"
                >
                  <div>
                    <div className="relative">
                      <FoodImage
                        src={item.image_url}
                        foodName={item.name_en}
                        categorySlug={item.category_slug}
                        aspectClass="aspect-[16/10]"
                      />
                      <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-extrabold shadow-sm ${badge.bg} ${badge.border} ${badge.text}`}
                        >
                          {badge.icon} {item.relevance_label || badge.label}
                        </span>
                      </div>
                      <div className="absolute top-3 right-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold shadow-sm ${dietBadge.className}`}
                        >
                          {dietBadge.label}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 space-y-3">
                      <div>
                        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                          {item.category}
                        </div>
                        <Link
                          to={`/foods/${item.slug}`}
                          className="mt-0.5 block text-lg font-black text-stone-900 hover:text-emerald-800"
                        >
                          {item.name_en}
                        </Link>
                      </div>

                      {/* Evidence-based explanation for why this food appears */}
                      <p className="text-xs text-stone-700 leading-relaxed">
                        {item.reason}
                      </p>

                      {item.portion_guidance && (
                        <div className="rounded-xl bg-stone-50 border border-stone-200/80 p-2.5 text-[11px] text-stone-700">
                          <strong>Portion note:</strong> {item.portion_guidance}
                        </div>
                      )}

                      {item.caution_notes && (
                        <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-2.5 text-[11px] text-amber-950">
                          <strong>Consideration:</strong> {item.caution_notes}
                        </div>
                      )}

                      {/* Key Nutrient Highlights (per 100g/ml) */}
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        {Object.entries(item.nutrition_highlights)
                          .slice(0, 6)
                          .map(([nutCode, val]) => (
                            <div
                              key={nutCode}
                              className="rounded-xl bg-stone-50 px-2.5 py-1.5 text-center border border-stone-100"
                            >
                              <div className="text-[10px] font-semibold text-stone-500 truncate">
                                {nutCode
                                  .replace('_kcal', ' kcal')
                                  .replace('_g', ' (g)')
                                  .replace('_mg', ' (mg)')
                                  .replace('_mcg', ' (mcg)')
                                  .replace('_', ' ')}
                              </div>
                              <div className="text-xs font-extrabold text-stone-900">
                                {val !== null && val !== undefined ? val : 'Not measured'}
                              </div>
                            </div>
                          ))}
                      </div>

                      {/* Relevant Food Characteristics / Tags */}
                      {item.relevant_tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {item.relevant_tags.slice(0, 5).map((tag) => (
                            <span
                              key={tag}
                              className="rounded-md bg-emerald-50/80 border border-emerald-200/70 px-2 py-0.5 text-[10px] font-semibold text-emerald-900"
                            >
                              {tag.replace(/_/g, ' ')}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Allergen Flags & Member Allergen/Intolerance Warnings */}
                      {(item.allergen_flags.length > 0 ||
                        item.allergen_warnings.length > 0 ||
                        item.intolerance_warnings.length > 0 ||
                        item.incomplete_ingredient_warning) && (
                        <div className="space-y-1 pt-1">
                          {item.allergen_flags.length > 0 && (
                            <div className="text-[11px] font-semibold text-rose-800">
                              Declared allergens: {item.allergen_flags.join(', ')}
                            </div>
                          )}
                          {item.allergen_warnings.map((w, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[11px] font-bold text-rose-900"
                            >
                              ⚠️ {w}
                            </div>
                          ))}
                          {item.intolerance_warnings.map((w, idx) => (
                            <div
                              key={idx}
                              className="rounded-xl bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] font-semibold text-amber-950"
                            >
                              ℹ️ {w}
                            </div>
                          ))}
                          {item.incomplete_ingredient_warning && (
                            <div className="text-[10px] text-stone-500 italic">
                              {item.incomplete_ingredient_warning}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer: Source Citation & Preview Action */}
                  <div className="border-t border-stone-100 bg-stone-50/60 p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-[11px] text-stone-500">
                      <span className="truncate max-w-[70%]" title={item.source.name}>
                        Source: {item.source.name} ({item.source.year})
                      </span>
                      <Link
                        to={`/foods/${item.slug}`}
                        className="font-bold text-emerald-800 hover:underline"
                      >
                        Details →
                      </Link>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSelectedFoodForCheck(item)}
                      className={`w-full rounded-xl py-2 text-xs font-bold transition ${
                        selectedFoodForCheck?.slug === item.slug
                          ? 'bg-emerald-800 text-white'
                          : 'bg-white border border-stone-200 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      {selectedFoodForCheck?.slug === item.slug
                        ? '✓ Currently Previewing Above'
                        : 'Preview Rule Evaluation Above ↑'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Progressive Disclosure: Evidence, Portions & Rules Engine Details */}
      <section className="space-y-3">
        <ExpandableSection
          title="Dietary Patterns, Portion Size & Individual Differences"
          subtitle="Evidence synthesis from clinical guidelines"
        >
          <div className="grid gap-4 sm:grid-cols-2 text-xs text-stone-700 leading-relaxed">
            <div className="rounded-2xl bg-stone-50 p-4 space-y-1">
              <div className="font-bold text-stone-900">Evidence-Supported Dietary Patterns</div>
              <p>{condition.evidence_dietary_patterns}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 space-y-1">
              <div className="font-bold text-stone-900">Portion Considerations</div>
              <p>{condition.portion_considerations}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 space-y-1">
              <div className="font-bold text-stone-900">Individual Differences</div>
              <p>{condition.individual_differences}</p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4 space-y-1">
              <div className="font-bold text-stone-900">When Professional Advice Is Required</div>
              <p>{condition.professional_advice_circumstances}</p>
              <p className="text-stone-500 pt-1">
                <strong>Evidence Limits:</strong> {condition.what_evidence_does_not_establish}
              </p>
            </div>
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="View Evidence & Registered Rules Engine Logic"
          subtitle={`${condition.rules.length} deterministic rule(s) active for ${condition.name}`}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {condition.rules.map((r) => (
              <div
                key={r.rule_code}
                className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <EducationalCategoryBadge category={r.educational_category} />
                  <span className="font-mono text-stone-400">{r.rule_code}</span>
                </div>
                <p className="text-stone-800">{r.explanation}</p>
                <div className="border-t border-stone-200/70 pt-2 flex justify-between text-stone-500">
                  <span>{r.source_section}</span>
                  <a
                    href={r.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-800 underline font-semibold"
                  >
                    {r.source_name} ({r.publication_year}) ↗
                  </a>
                </div>
              </div>
            ))}
          </div>
        </ExpandableSection>
      </section>
    </div>
  );
};
