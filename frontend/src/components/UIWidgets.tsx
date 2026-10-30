import React from 'react';
import { Link } from 'react-router-dom';
import type { FoodSummary, GuidanceObservation } from '../types/api';

export const MedicalSafetyBanner: React.FC<{ compact?: boolean }> = ({ compact = false }) => (
  <div
    role="note"
    aria-label="Medical and Nutritional Disclaimer"
    className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 shadow-sm"
  >
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-medium">
        <span className="font-bold uppercase tracking-wider text-amber-800">Educational Tool Only: </span>
        GharPlate explains Indian food composition and clinical nutrition guidelines. It is not a medical diagnostic or treatment system and never replaces a qualified doctor or registered dietitian.
      </p>
      {!compact && (
        <Link
          to="/privacy-safety"
          className="shrink-0 font-semibold text-amber-900 underline hover:text-amber-700"
        >
          Medical Safety & Privacy Policy →
        </Link>
      )}
    </div>
  </div>
);

export const ConfidenceBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    high: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    verified_ifct: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    label_declared: 'bg-blue-100 text-blue-900 border-blue-300',
    user_entered: 'bg-amber-100 text-amber-900 border-amber-300',
    not_measured: 'bg-stone-100 text-stone-600 border-stone-300',
  };
  const labels: Record<string, string> = {
    high: 'ICMR-NIN Verified',
    verified_ifct: 'IFCT 2017 / DGI 2024',
    label_declared: 'Package Label Declared',
    user_entered: 'User Confirmed',
    not_measured: 'NULL (Not Measured)',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        styles[status] || 'bg-stone-100 text-stone-800 border-stone-300'
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

export const EducationalCategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const colorMap: Record<string, string> = {
    'Nutritionally relevant': 'bg-emerald-100 text-emerald-900 border-emerald-300',
    'Portion-sensitive': 'bg-amber-100 text-amber-900 border-amber-300',
    'Nutrient to monitor': 'bg-orange-100 text-orange-900 border-orange-300',
    'May require individualised advice': 'bg-purple-100 text-purple-900 border-purple-300',
    'Limited evidence available': 'bg-stone-200 text-stone-800 border-stone-400',
    'Insufficient nutritional information': 'bg-slate-100 text-slate-700 border-slate-300',
    'Potential allergen concern': 'bg-rose-100 text-rose-900 border-rose-300',
  };
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold ${
        colorMap[category] || 'bg-stone-100 text-stone-800 border-stone-300'
      }`}
    >
      {category}
    </span>
  );
};

export const FoodCard: React.FC<{ food: FoodSummary }> = ({ food }) => {
  const kcal = food.key_nutrients.energy_kcal;
  const prot = food.key_nutrients.protein_g;
  const carbs = food.key_nutrients.carbs_g;
  const fibre = food.key_nutrients.fibre_g;

  return (
    <Link
      to={`/foods/${food.slug}`}
      className="group flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-emerald-600 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-600"
    >
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="inline-block rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
            {food.category_name}
          </span>
          <div className="flex items-center gap-1.5">
            <span
              title={food.is_vegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
              className={`inline-block h-3 w-3 rounded-full border ${
                food.is_vegetarian ? 'border-emerald-700 bg-emerald-600' : 'border-rose-700 bg-rose-600'
              }`}
            />
            <ConfidenceBadge status={food.confidence_level} />
          </div>
        </div>

        <h3 className="mt-2.5 text-lg font-bold text-stone-900 group-hover:text-emerald-800">
          {food.name_en}
        </h3>

        {food.aliases.length > 0 && (
          <p className="mt-1 text-xs text-stone-600 line-clamp-1">
            <span className="font-medium text-stone-700">Aliases: </span>
            {food.aliases.map((a) => `${a.alias_text}${a.script_text && a.script_text !== a.alias_text ? ` (${a.script_text})` : ''}`).join(' • ')}
          </p>
        )}

        <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-stone-50 p-2.5 text-center text-xs">
          <div>
            <div className="text-stone-500">Energy</div>
            <div className="font-bold text-stone-900">{kcal !== null && kcal !== undefined ? `${kcal} kcal` : 'NULL'}</div>
          </div>
          <div>
            <div className="text-stone-500">Protein</div>
            <div className="font-bold text-emerald-800">{prot !== null && prot !== undefined ? `${prot} g` : 'NULL'}</div>
          </div>
          <div>
            <div className="text-stone-500">Carbs</div>
            <div className="font-bold text-stone-900">{carbs !== null && carbs !== undefined ? `${carbs} g` : 'NULL'}</div>
          </div>
          <div>
            <div className="text-stone-500">Fibre</div>
            <div className="font-bold text-amber-800">{fibre !== null && fibre !== undefined ? `${fibre} g` : 'NULL'}</div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs text-stone-500">
        <span>Per {food.default_basis} • {food.completeness_pct}% complete</span>
        <span className="font-semibold text-emerald-700 group-hover:translate-x-0.5 transition">
          Inspect →
        </span>
      </div>
    </Link>
  );
};

export const MacroDistributionBarChart: React.FC<{
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fibreG: number | null;
  basisLabel: string;
}> = ({ proteinG, carbsG, fatG, fibreG, basisLabel }) => {
  const items = [
    { label: 'Carbohydrates', value: carbsG, unit: 'g', max: 85, color: 'bg-amber-500' },
    { label: 'Protein', value: proteinG, unit: 'g', max: 40, color: 'bg-emerald-600' },
    { label: 'Total Fat', value: fatG, unit: 'g', max: 65, color: 'bg-orange-500' },
    { label: 'Dietary Fibre', value: fibreG, unit: 'g', max: 35, color: 'bg-teal-600' },
  ];

  return (
    <div
      role="region"
      aria-label={`Macronutrient composition chart (${basisLabel})`}
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wider text-stone-700">
          Macronutrient Composition ({basisLabel})
        </h3>
        <span className="text-xs text-stone-500">NULL = Unmeasured</span>
      </div>
      <div className="mt-4 space-y-3">
        {items.map((item) => {
          const pct =
            item.value !== null && item.value !== undefined
              ? Math.min(100, Math.round((item.value / item.max) * 100))
              : 0;
          return (
            <div key={item.label}>
              <div className="flex justify-between text-xs font-medium text-stone-800">
                <span>{item.label}</span>
                <span>
                  {item.value !== null && item.value !== undefined
                    ? `${item.value} ${item.unit}`
                    : 'Not Available (NULL)'}
                </span>
              </div>
              <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                {item.value !== null && item.value !== undefined ? (
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${Math.max(pct, 3)}%` }}
                  />
                ) : (
                  <div className="h-full w-full bg-stone-200 opacity-50" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const ObservationCard: React.FC<{ obs: GuidanceObservation }> = ({ obs }) => (
  <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <EducationalCategoryBadge category={obs.educational_category} />
        <span className="text-xs font-semibold text-stone-700">{obs.condition_name}</span>
      </div>
      <span className="text-xs text-stone-500">Rule: {obs.rule_code}</span>
    </div>
    <p className="mt-2.5 text-sm text-stone-800 leading-relaxed">{obs.explanation}</p>
    <p className="mt-2 text-xs text-stone-600">
      <span className="font-semibold">Individualisation & Limitations: </span>
      {obs.applicability_limitations}
    </p>
    <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2 text-xs text-stone-500">
      <span>Evidence: {obs.evidence_status}</span>
      <a
        href={obs.source_url}
        target="_blank"
        rel="noreferrer"
        className="font-medium text-emerald-700 underline hover:text-emerald-900"
      >
        Source: {obs.source_citation} ↗
      </a>
    </div>
  </div>
);
