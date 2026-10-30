import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EducationalCategoryBadge, FoodCard } from '../components/UIWidgets';
import { api } from '../services/api';
import type {
  FoodSummary,
  HealthConditionDetail,
  HealthConditionSummary,
} from '../types/api';

// ==========================================
// PAGE 4: CONDITION EXPLORER PAGE
// ==========================================
export const ConditionExplorerPage: React.FC = () => {
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
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-stone-900">
          Condition-Aware Nutrition Guidance Explorer
        </h1>
        <p className="mt-1 text-xs text-stone-600 leading-relaxed">
          Explore 9 clinical and life-stage condition groups researched from ICMR-NIN, WHO, KDIGO, WGO, and MoHFW guidelines. GharPlate never labels foods as universally "Allowed" or "Forbidden" — instead, inspect relevant nutrients, portion considerations, and individual differences.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedGroup('')}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
              selectedGroup === ''
                ? 'bg-emerald-800 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            All 9 Condition Groups ({conditions.length})
          </button>
          {groups.map(([code, name]) => (
            <button
              key={code}
              type="button"
              onClick={() => setSelectedGroup(code)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                selectedGroup === code
                  ? 'bg-emerald-800 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-44 animate-pulse rounded-2xl bg-stone-200/70" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visibleConditions.map((cond) => (
            <Link
              key={cond.code}
              to={`/conditions/${cond.code}`}
              className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:border-emerald-600 hover:shadow-md transition"
            >
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">
                    {cond.condition_group_name}
                  </span>
                  {cond.is_short_term_illness && (
                    <span className="rounded-full bg-amber-100 border border-amber-300 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                      Short-Term Illness (Not Chronic)
                    </span>
                  )}
                  {cond.is_special_life_stage && (
                    <span className="rounded-full bg-blue-100 border border-blue-300 px-2.5 py-0.5 text-[11px] font-bold text-blue-900">
                      Special Life Stage
                    </span>
                  )}
                </div>

                <h2 className="mt-2.5 text-lg font-bold text-stone-900">{cond.name}</h2>
                <p className="mt-1.5 text-xs text-stone-600 leading-relaxed line-clamp-3">
                  {cond.nutritional_meaning}
                </p>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {cond.relevant_nutrients.map((nut) => (
                    <span
                      key={nut}
                      className="rounded bg-stone-100 px-2 py-0.5 text-[11px] font-mono text-stone-700"
                    >
                      {nut}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
                <span>
                  Source: {cond.source_name} ({cond.publication_year})
                </span>
                <span className="font-bold text-emerald-800">Inspect Rules & Foods →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// ==========================================
// PAGE 5: CONDITION DETAIL PAGE
// ==========================================
export const ConditionDetailPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const [condition, setCondition] = useState<HealthConditionDetail | null>(null);
  const [foods, setFoods] = useState<FoodSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) return;
    setLoading(true);
    Promise.all([api.getConditionDetail(code), api.getFoodsByCondition(code)])
      .then(([condRes, foodsRes]) => {
        setCondition(condRes);
        setFoods(foodsRes);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [code]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-2xl bg-stone-200/70" />;
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

  return (
    <div className="space-y-8">
      <nav aria-label="Breadcrumb" className="text-xs text-stone-500 flex items-center gap-2">
        <Link to="/conditions" className="hover:underline text-emerald-800 font-medium">
          Condition Explorer
        </Link>
        <span>/</span>
        <span className="text-stone-800 font-semibold">{condition.name}</span>
      </nav>

      {/* Condition Header & Clinical Synthesis */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
            {condition.condition_group_name}
          </span>
          {condition.is_short_term_illness && (
            <span className="rounded-md bg-amber-100 border border-amber-300 px-2.5 py-1 text-xs font-bold text-amber-900">
              Short-Term Illness Context
            </span>
          )}
          <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs text-stone-700">
            Applicable Age Scope: {condition.applicable_age_groups.join(', ')}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-stone-900">{condition.name}</h1>

        {condition.red_flag_warning && (
          <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-4 text-xs font-semibold text-rose-950">
            {condition.red_flag_warning}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 text-xs leading-relaxed text-stone-700">
          <div className="rounded-xl bg-stone-50 p-4 space-y-1.5">
            <div className="font-bold text-stone-900 text-sm">1. Nutritional Meaning</div>
            <p>{condition.nutritional_meaning}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4 space-y-1.5">
            <div className="font-bold text-stone-900 text-sm">2. Evidence-Supported Dietary Patterns</div>
            <p>{condition.evidence_dietary_patterns}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4 space-y-1.5">
            <div className="font-bold text-stone-900 text-sm">3. Portion-Size & Individual Differences</div>
            <p><strong>Portions:</strong> {condition.portion_considerations}</p>
            <p><strong>Individual Variation:</strong> {condition.individual_differences}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4 space-y-1.5">
            <div className="font-bold text-stone-900 text-sm">
              4. When Professional Advice Is Required & Evidence Limits
            </div>
            <p><strong>Clinical Care:</strong> {condition.professional_advice_circumstances}</p>
            <p><strong>Evidence Boundaries:</strong> {condition.what_evidence_does_not_establish}</p>
          </div>
        </div>

        <div className="border-t border-stone-100 pt-3 text-xs text-stone-600 flex flex-wrap justify-between gap-2">
          <span>
            Primary Guideline Source:{' '}
            <a
              href={condition.source.url}
              target="_blank"
              rel="noreferrer"
              className="font-bold text-emerald-800 underline"
            >
              {condition.source.document_title} ({condition.publication_year}) ↗
            </a>
          </span>
          <span>Review Status: {condition.review_status}</span>
        </div>
      </section>

      {/* Deterministic Rules Registered for this Condition */}
      <section className="space-y-3">
        <h2 className="text-lg font-bold text-stone-900">
          Transparent Rules Engine Logic for {condition.name}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {condition.rules.map((r) => (
            <div key={r.rule_code} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <EducationalCategoryBadge category={r.educational_category} />
                <span className="font-mono text-stone-500">{r.rule_code}</span>
              </div>
              <div className="font-semibold text-stone-900">
                Evaluated Attribute: {r.nutrient_code || r.food_category_slug || 'Dietary Tag'} ({r.comparison_operator}{' '}
                {r.threshold_low !== null ? r.threshold_low : ''} per {r.evaluation_basis})
              </div>
              <p className="text-stone-700">{r.explanation}</p>
              <p className="text-stone-500">
                <strong>Limitations:</strong> {r.applicability_limitations}
              </p>
              <div className="border-t border-stone-100 pt-2 text-stone-500 flex justify-between">
                <span>{r.source_section}</span>
                <a href={r.source_url} target="_blank" rel="noreferrer" className="text-emerald-800 underline">
                  {r.source_name} ({r.publication_year}) ↗
                </a>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Explore Foods by Nutritional Relevance */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-bold text-stone-900">
            Explore Relevant Indian Foods ({foods.length} items in relevant food groups)
          </h2>
          <p className="text-xs text-stone-600">
            Foods are never ranked as universally "best" or "worst" for a disease. Click any food to inspect its exact nutrient levels and serving-based condition context.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {foods.slice(0, 12).map((f) => (
            <FoodCard key={f.slug} food={f} />
          ))}
        </div>
      </section>
    </div>
  );
};
