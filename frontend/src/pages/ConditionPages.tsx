import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  EducationalCategoryBadge,
  ExpandableSection,
  FoodCard,
  FoodImage,
  ObservationCard,
} from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  FoodSummary,
  GuidanceEvaluationResponse,
  HealthConditionDetail,
  HealthConditionSummary,
} from '../types/api';
import { CONDITION_GROUP_VISUALS } from '../utils/visualAssets';

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
  const { activeMember } = useHousehold();
  const [condition, setCondition] = useState<HealthConditionDetail | null>(null);
  const [foods, setFoods] = useState<FoodSummary[]>([]);
  const [foodFilterQuery, setFoodFilterQuery] = useState('');
  const [selectedFoodForCheck, setSelectedFoodForCheck] = useState<FoodSummary | null>(null);
  const [liveGuidance, setLiveGuidance] = useState<GuidanceEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    Promise.all([api.getConditionDetail(code), api.getFoodsByCondition(code)])
      .then(([condRes, foodsRes]) => {
        setCondition(condRes);
        setFoods(foodsRes);
        if (foodsRes.length > 0) {
          setSelectedFoodForCheck(foodsRes[0]);
        }
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [code]);

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
        dietary_preference: activeMember?.dietary_preference,
      })
      .then(setLiveGuidance)
      .catch(() => null);
  }, [condition, selectedFoodForCheck, activeMember]);

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

  const filteredFoods = foodFilterQuery.trim()
    ? foods.filter(
        (f) =>
          f.name_en.toLowerCase().includes(foodFilterQuery.toLowerCase()) ||
          f.aliases.some((a) =>
            a.alias_text.toLowerCase().includes(foodFilterQuery.toLowerCase())
          )
      )
    : foods;

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
                  ? `Evaluated for ${activeMember.display_name} • Select any food below to preview its relevance`
                  : 'Select any food below to preview its nutritional relevance'}
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
                <div className="text-xs font-bold text-emerald-800">
                  {selectedFoodForCheck.category_name}
                </div>
                <div className="text-lg font-black text-stone-900">
                  {selectedFoodForCheck.name_en}
                </div>
                <div className="text-xs text-stone-500">
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

      {/* Visual Food Grid to Explore for This Condition */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-stone-900">
              Explore Foods for {condition.name}
            </h2>
            <p className="text-xs text-stone-500">
              Click "Preview on This Page" or open any food card for full details
            </p>
          </div>
          <input
            type="text"
            value={foodFilterQuery}
            onChange={(e) => setFoodFilterQuery(e.target.value)}
            placeholder="Filter foods (e.g. Ragi, Dal, Idli, Oats)..."
            className="rounded-2xl border border-stone-300 bg-white px-4 py-2 text-xs w-64"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filteredFoods.slice(0, 12).map((f) => (
            <div key={f.slug} className="space-y-2">
              <FoodCard food={f} />
              <button
                type="button"
                onClick={() => setSelectedFoodForCheck(f)}
                className={`w-full rounded-xl py-2 text-xs font-bold transition ${
                  selectedFoodForCheck?.slug === f.slug
                    ? 'bg-emerald-800 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {selectedFoodForCheck?.slug === f.slug
                  ? '✓ Currently Previewing Above'
                  : 'Preview Against Condition Above ↑'}
              </button>
            </div>
          ))}
        </div>
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
