import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FoodSummary, GuidanceObservation } from '../types/api';
import {
  buildFoodIllustrationDataUri,
  CATEGORY_VISUALS,
} from '../utils/visualAssets';

/**
 * Responsive, lazy-loaded Food Photograph component with loading placeholder.
 * CRITICAL HONESTY RULE FOR PACKAGED PRODUCTS:
 * When `isPackaged === true` and `(!src || hasVerifiedImage === false)`,
 * renders an explicit "No verified product image available" state rather than
 * displaying a generic category illustration as if it were the actual product packaging.
 */
export const FoodImage: React.FC<{
  src?: string | null;
  foodName: string;
  categorySlug?: string;
  isPackaged?: boolean;
  hasVerifiedImage?: boolean;
  className?: string;
  aspectClass?: string;
  showBadge?: boolean;
}> = ({
  src,
  foodName,
  categorySlug = 'indian-dishes',
  isPackaged = false,
  hasVerifiedImage = true,
  className = '',
  aspectClass = 'aspect-[16/10]',
  showBadge = false,
}) => {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const isUnverifiedPackagedImage =
    isPackaged && (!src || !hasVerifiedImage || failed);

  if (isUnverifiedPackagedImage) {
    return (
      <div
        data-testid="no-verified-product-image"
        className={`relative flex flex-col items-center justify-center bg-stone-100 border-b border-stone-200/80 p-6 text-center ${aspectClass} ${className}`}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-200/90 text-2xl text-stone-600 shadow-inner">
          📦
        </div>
        <div className="mt-2.5 text-xs font-extrabold text-stone-800">
          No verified product image available
        </div>
        <p className="mt-1 text-[11px] text-stone-500 max-w-[230px] leading-snug">
          GharPlate does not substitute generic food photos for actual retail packaging.
        </p>
      </div>
    );
  }

  const catVisual = CATEGORY_VISUALS[categorySlug] || CATEGORY_VISUALS['indian-dishes'];
  const primarySrc = src || catVisual.photoUrl;
  const fallbackIllustration = buildFoodIllustrationDataUri(foodName, categorySlug);
  const effectiveSrc = failed || !primarySrc ? fallbackIllustration : primarySrc;

  return (
    <div
      className={`relative overflow-hidden bg-stone-100 ${aspectClass} ${className}`}
    >
      {!loaded && !failed && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-stone-100 via-stone-200 to-stone-100"
        />
      )}
      <img
        src={effectiveSrc}
        alt={foodName}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => {
          setFailed(true);
          setLoaded(true);
        }}
        className={`h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
      />
      {showBadge && (
        <span className="absolute bottom-2.5 right-2.5 rounded-full bg-stone-900/75 px-2.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
          {failed
            ? 'Illustrated Reference'
            : isPackaged
            ? 'Verified Package Photo'
            : 'Food Reference Photo'}
        </span>
      )}
    </div>
  );
};

/**
 * Compact, single-line Medical Safety Pill (replaces repetitive large banners).
 */
export const MedicalSafetyBanner: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      role="note"
      aria-label="Medical and Nutritional Disclaimer"
      className="rounded-2xl border border-stone-200/90 bg-white/90 px-4 py-2.5 text-xs text-stone-600 shadow-sm backdrop-blur"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 font-bold text-[11px]">
            i
          </span>
          <span>
            <strong className="text-stone-800">Educational Tool Only:</strong> Evidence-based Indian food & nutrition guide — not a medical diagnosis or doctor substitute.
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="font-semibold text-emerald-800 hover:underline"
          >
            {expanded ? 'Hide note' : 'Safety note'}
          </button>
          {!compact && (
            <Link
              to="/privacy-safety"
              className="font-semibold text-stone-700 hover:text-emerald-800 hover:underline"
            >
              Full Policy →
            </Link>
          )}
        </div>
      </div>
      {expanded && (
        <p className="mt-2 border-t border-stone-100 pt-2 text-[11px] text-stone-600 leading-relaxed">
          GharPlate presents verified food composition data from ICMR-NIN IFCT 2017, Dietary Guidelines for Indians 2024, WHO, KDIGO, WGO, FSSAI, Open Food Facts, and USDA FoodData Central. Missing nutrients are always shown as NULL (never assumed zero). Always consult a qualified doctor or registered dietitian for personal medical decisions.
        </p>
      )}
    </div>
  );
};

export const ConfidenceBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    high: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    verified_ifct: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    label_declared: 'bg-sky-50 text-sky-900 border-sky-200',
    openfoodfacts: 'bg-teal-50 text-teal-900 border-teal-200',
    fdc_supplemental: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    user_entered: 'bg-amber-50 text-amber-900 border-amber-200',
    not_measured: 'bg-stone-100 text-stone-500 border-stone-200',
  };
  const labels: Record<string, string> = {
    high: 'ICMR-NIN Verified',
    verified_ifct: 'IFCT 2017 / DGI 2024',
    label_declared: 'Label Declared',
    openfoodfacts: 'Open Food Facts Verified',
    fdc_supplemental: 'USDA FDC Verified',
    user_entered: 'User Confirmed',
    not_measured: 'Not Measured (NULL)',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${
        styles[status] || 'bg-stone-100 text-stone-700 border-stone-200'
      }`}
    >
      {labels[status] || status}
    </span>
  );
};

/**
 * Translates technical rule categories into friendly, everyday visual labels
 * while preserving the exact underlying clinical meaning.
 */
export const EducationalCategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const friendlyMap: Record<string, { label: string; style: string; icon: string }> = {
    'Nutritionally relevant': {
      label: 'Helpful Nutrient Match',
      style: 'bg-emerald-100 text-emerald-950 border-emerald-300',
      icon: '✓',
    },
    'Portion-sensitive': {
      label: 'Portion Matters',
      style: 'bg-amber-100 text-amber-950 border-amber-300',
      icon: '⚖️',
    },
    'Nutrient to monitor': {
      label: 'Nutrient to Monitor',
      style: 'bg-orange-100 text-orange-950 border-orange-300',
      icon: '👀',
    },
    'May require individualised advice': {
      label: 'Individual Advice May Be Needed',
      style: 'bg-purple-100 text-purple-950 border-purple-300',
      icon: '🩺',
    },
    'Limited evidence available': {
      label: 'Limited Evidence Available',
      style: 'bg-stone-200 text-stone-800 border-stone-400',
      icon: 'ℹ️',
    },
    'Insufficient nutritional information': {
      label: 'Limited Information Available (NULL)',
      style: 'bg-slate-100 text-slate-700 border-slate-300',
      icon: '◌',
    },
    'Potential allergen concern': {
      label: 'Potential Allergen Concern',
      style: 'bg-rose-100 text-rose-950 border-rose-300',
      icon: '⚠️',
    },
  };

  const item = friendlyMap[category] || {
    label: category,
    style: 'bg-stone-100 text-stone-800 border-stone-300',
    icon: '•',
  };

  return (
    <span
      title={category}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold ${item.style}`}
    >
      <span>{item.icon}</span>
      <span>{item.label}</span>
    </span>
  );
};

/**
 * Image-First Visual Food Card for Food Explorer, Home Featured Foods, and Condition Explorer.
 * Supports both 'grid' (photo card) and 'list' (compact visual row) modes.
 */
export const FoodCard: React.FC<{
  food: FoodSummary;
  viewMode?: 'grid' | 'list';
}> = ({ food, viewMode = 'grid' }) => {
  const kcal = food.key_nutrients.energy_kcal;
  const prot = food.key_nutrients.protein_g;
  const fibre = food.key_nutrients.fibre_g;
  const catMeta = CATEGORY_VISUALS[food.category_slug];

  if (viewMode === 'list') {
    return (
      <Link
        to={`/foods/${food.slug}`}
        className="group flex items-center justify-between gap-4 rounded-2xl border border-stone-200/90 bg-white p-3.5 shadow-sm transition hover:border-emerald-600 hover:shadow-md"
      >
        <div className="flex items-center gap-4 min-w-0">
          <FoodImage
            src={food.image_url}
            foodName={food.name_en}
            categorySlug={food.category_slug}
            isPackaged={food.is_packaged}
            hasVerifiedImage={food.has_verified_image ?? Boolean(food.image_url)}
            aspectClass="h-16 w-20 shrink-0 rounded-xl"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-emerald-800">
                {food.category_name}
              </span>
              {food.barcode && (
                <span className="font-mono text-[10px] text-stone-400">
                  #{food.barcode}
                </span>
              )}
              <span
                title={food.is_vegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  food.is_vegetarian ? 'bg-emerald-600' : 'bg-rose-600'
                }`}
              />
            </div>
            <h3 className="truncate text-base font-bold text-stone-900 group-hover:text-emerald-800">
              {food.name_en}
            </h3>
            {food.aliases.length > 0 && (
              <p className="truncate text-xs text-stone-500">
                {food.aliases
                  .slice(0, 3)
                  .map((a) => a.alias_text)
                  .join(' • ')}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          <div className="hidden sm:flex items-center gap-3 text-xs">
            <span className="rounded-xl bg-stone-100 px-3 py-1.5 font-semibold text-stone-800">
              {kcal !== null && kcal !== undefined ? `${kcal} kcal` : 'Not captured'}
            </span>
            <span className="rounded-xl bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-900">
              {prot !== null && prot !== undefined ? `${prot}g Protein` : 'Not captured'}
            </span>
          </div>
          <span className="rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white group-hover:bg-emerald-700 transition">
            Explore →
          </span>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/foods/${food.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-emerald-600 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-600"
    >
      <div className="relative">
        <FoodImage
          src={food.image_url}
          foodName={food.name_en}
          categorySlug={food.category_slug}
          isPackaged={food.is_packaged}
          hasVerifiedImage={food.has_verified_image ?? Boolean(food.image_url)}
          aspectClass="aspect-[16/10]"
        />
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold backdrop-blur-md shadow-sm ${
              catMeta
                ? `${catMeta.accentBg}/95 ${catMeta.accentText} ${catMeta.accentBorder}`
                : 'bg-white/90 text-stone-800 border-stone-200'
            }`}
          >
            {catMeta?.emojiIcon} {food.category_name}
          </span>
        </div>
        <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full bg-white/95 px-2 py-1 shadow-sm backdrop-blur">
          <span
            title={food.is_vegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              food.is_vegetarian ? 'bg-emerald-600' : 'bg-rose-600'
            }`}
          />
          <span className="text-[10px] font-bold text-stone-700">
            {food.is_vegetarian ? 'Veg' : 'Non-Veg'}
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-between p-5">
        <div>
          <h3 className="text-lg font-extrabold text-stone-900 group-hover:text-emerald-800 line-clamp-1">
            {food.name_en}
          </h3>
          {food.brand ? (
            <p className="mt-0.5 text-xs font-semibold text-stone-500 line-clamp-1">
              {food.brand} {food.barcode ? `• #${food.barcode}` : ''}
            </p>
          ) : food.aliases.length > 0 ? (
            <p className="mt-0.5 text-xs text-stone-500 line-clamp-1">
              {food.aliases
                .slice(0, 3)
                .map((a) => a.alias_text)
                .join(' • ')}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-stone-400">{food.standard_serving_name}</p>
          )}

          {/* 2 Key Nutritional Highlights */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <div className="flex-1 rounded-2xl bg-stone-50 px-3 py-2 border border-stone-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                Energy / {food.default_basis}
              </div>
              <div className="text-sm font-extrabold text-stone-900">
                {kcal !== null && kcal !== undefined ? `${kcal} kcal` : 'Not captured'}
              </div>
            </div>
            <div className="flex-1 rounded-2xl bg-emerald-50/70 px-3 py-2 border border-emerald-100">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                {fibre !== null && fibre !== undefined && fibre >= (prot || 0)
                  ? 'Dietary Fibre'
                  : 'Protein'}
              </div>
              <div className="text-sm font-extrabold text-emerald-950">
                {fibre !== null && fibre !== undefined && fibre >= (prot || 0)
                  ? `${fibre} g`
                  : prot !== null && prot !== undefined
                  ? `${prot} g`
                  : 'Not captured'}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs">
          <span className="text-stone-500 truncate max-w-[65%]">
            {food.standard_serving_name}
          </span>
          <span className="font-extrabold text-emerald-800 group-hover:translate-x-1 transition-transform">
            View Details →
          </span>
        </div>
      </div>
    </Link>
  );
};

/**
 * Interactive Donut + Animated Bar Chart for Macronutrient Composition.
 */
export const MacroDistributionBarChart: React.FC<{
  energyKcal?: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fibreG: number | null;
  basisLabel: string;
}> = ({ energyKcal, proteinG, carbsG, fatG, fibreG, basisLabel }) => {
  const p = proteinG ?? 0;
  const c = carbsG ?? 0;
  const f = fatG ?? 0;
  const fb = fibreG ?? 0;
  const totalGrams = Math.max(p + c + f + fb, 1);

  const items = [
    {
      label: 'Carbohydrates',
      value: carbsG,
      unit: 'g',
      max: 85,
      color: 'bg-amber-500',
      stroke: '#f59e0b',
    },
    {
      label: 'Protein',
      value: proteinG,
      unit: 'g',
      max: 40,
      color: 'bg-emerald-600',
      stroke: '#059669',
    },
    {
      label: 'Total Fat',
      value: fatG,
      unit: 'g',
      max: 60,
      color: 'bg-orange-500',
      stroke: '#f97316',
    },
    {
      label: 'Dietary Fibre',
      value: fibreG,
      unit: 'g',
      max: 30,
      color: 'bg-teal-600',
      stroke: '#0d9488',
    },
  ];

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let cumulativePct = 0;

  return (
    <div
      role="region"
      aria-label={`Macronutrient composition chart (${basisLabel})`}
      className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-extrabold text-stone-900">
            Visual Nutrition Breakdown
          </h3>
          <p className="text-xs text-stone-500">{basisLabel}</p>
        </div>
        <span className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-semibold text-stone-600">
          NULL = Not Measured
        </span>
      </div>

      <div className="mt-5 grid items-center gap-6 sm:grid-cols-12">
        <div className="sm:col-span-5 flex flex-col items-center justify-center">
          <div className="relative h-36 w-36 flex items-center justify-center">
            <svg viewBox="0 0 110 110" className="h-full w-full -rotate-90">
              <circle
                cx="55"
                cy="55"
                r={radius}
                fill="none"
                stroke="#f5f5f4"
                strokeWidth="12"
              />
              {items.map((seg) => {
                const segVal = seg.value ?? 0;
                const pct = segVal / totalGrams;
                const dashArray = `${pct * circumference} ${circumference}`;
                const dashOffset = -cumulativePct * circumference;
                cumulativePct += pct;
                if (segVal <= 0) return null;
                return (
                  <circle
                    key={seg.label}
                    cx="55"
                    cy="55"
                    r={radius}
                    fill="none"
                    stroke={seg.stroke}
                    strokeWidth="12"
                    strokeDasharray={dashArray}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-xl font-extrabold text-stone-900">
                {energyKcal !== undefined && energyKcal !== null
                  ? Math.round(energyKcal)
                  : p > 0 || c > 0 || f > 0
                  ? Math.round(p * 4 + c * 4 + f * 9)
                  : '—'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
                kcal
              </span>
            </div>
          </div>
        </div>

        <div className="sm:col-span-7 space-y-3.5">
          {items.map((item) => {
            const pct =
              item.value !== null && item.value !== undefined
                ? Math.min(100, Math.round((item.value / item.max) * 100))
                : 0;
            return (
              <div key={item.label}>
                <div className="flex justify-between text-xs font-bold text-stone-800">
                  <span className="flex items-center gap-1.5">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${item.color}`} />
                    {item.label}
                  </span>
                  <span>
                    {item.value !== null && item.value !== undefined
                      ? `${item.value} ${item.unit}`
                      : 'Not captured'}
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-stone-100">
                  {item.value !== null && item.value !== undefined ? (
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                      style={{ width: `${Math.max(pct, 4)}%` }}
                    />
                  ) : (
                    <div className="h-full w-full bg-stone-200/60" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Progressive Disclosure Expandable Accordion Section (Levels 3 & 4 hierarchy).
 */
export const ExpandableSection: React.FC<{
  title: string;
  subtitle?: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}> = ({ title, subtitle, badge, defaultOpen = false, children }) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm transition">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-stone-50/80 transition"
      >
        <div>
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm sm:text-base font-extrabold text-stone-900">{title}</h3>
            {badge && (
              <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                {badge}
              </span>
            )}
          </div>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-700 font-bold transition-transform duration-200 ${
            open ? 'rotate-180 bg-emerald-100 text-emerald-900' : ''
          }`}
        >
          ▾
        </span>
      </button>
      {open && <div className="border-t border-stone-100 p-5">{children}</div>}
    </div>
  );
};

/**
 * Progressive-Disclosure Condition Observation Card.
 */
export const ObservationCard: React.FC<{ obs: GuidanceObservation }> = ({ obs }) => {
  const [showWhy, setShowWhy] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  return (
    <div className="rounded-2xl border border-stone-200/90 bg-white p-5 shadow-sm transition hover:border-stone-300">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <EducationalCategoryBadge category={obs.educational_category} />
        <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-xs font-bold text-stone-800">
          {obs.condition_name}
        </span>
      </div>

      {obs.nutrient_name && (
        <div className="mt-3 inline-flex items-center gap-2 rounded-xl bg-stone-50 border border-stone-200/80 px-3 py-1.5 text-xs">
          <span className="font-semibold text-stone-600">{obs.nutrient_name}:</span>
          <span className="font-extrabold text-stone-900">
            {obs.evaluated_value !== null && obs.evaluated_value !== undefined
              ? `${obs.evaluated_value} ${obs.unit || ''}`
              : 'NULL (Not Measured)'}
          </span>
          <span className="text-stone-400">({obs.evaluation_basis})</span>
        </div>
      )}

      <p className="mt-3 text-sm text-stone-800 leading-relaxed">{obs.explanation}</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowWhy(!showWhy)}
            className="font-bold text-emerald-800 hover:underline"
          >
            {showWhy ? 'Hide context ▴' : 'Why am I seeing this? ▾'}
          </button>
          <button
            type="button"
            onClick={() => setShowEvidence(!showEvidence)}
            className="font-semibold text-stone-600 hover:text-stone-900 hover:underline"
          >
            {showEvidence ? 'Hide evidence ▴' : 'View evidence & details ▾'}
          </button>
        </div>

        <a
          href={obs.source_url}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-emerald-700 hover:underline"
        >
          Source ({obs.publication_year}) ↗
        </a>
      </div>

      {showWhy && (
        <div className="mt-3 rounded-xl bg-amber-50/70 border border-amber-200/80 p-3 text-xs text-amber-950 space-y-1">
          <div className="font-bold">Personalisation & Individual Differences</div>
          <p>{obs.applicability_limitations}</p>
        </div>
      )}

      {showEvidence && (
        <div className="mt-3 rounded-xl bg-stone-50 border border-stone-200 p-3 text-xs text-stone-600 space-y-1">
          <div>
            <strong>Clinical Citation:</strong>{' '}
            <a
              href={obs.source_url}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-800 underline font-semibold"
            >
              {obs.source_citation} ↗
            </a>
          </div>
          <div>
            <strong>Evidence Status:</strong> {obs.evidence_status} •{' '}
            <span className="font-mono">Rule ID: {obs.rule_code}</span>
          </div>
        </div>
      )}
    </div>
  );
};
