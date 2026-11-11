import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FoodImage } from '../components/UIWidgets';
import {
  openAssistantWorkspace,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';

interface NutrientCatalogItem {
  code: string;
  name: string;
  unit: string;
  category: string;
  explorer_group_code: string;
  explorer_group_label: string;
  is_core_11: boolean;
  display_order: number;
  description: string;
  aliases: string[];
  rda_adult_note: string | null;
  bioavailability_note: string | null;
  coverage_limitation_note: string | null;
  measured_food_count: number;
}

interface NutrientCategoryGroup {
  code: string;
  label: string;
  icon: string;
  description: string;
  nutrient_count: number;
  nutrients: NutrientCatalogItem[];
}

interface RankedNutrientFoodCard {
  slug: string;
  name_en: string;
  name_vernacular?: string;
  category_slug: string | null;
  category_name: string;
  image_url: string | null;
  is_vegetarian: boolean;
  is_vegan: boolean;
  is_packaged: boolean;
  food_forms: string[];
  nutrient_code: string;
  nutrient_name: string;
  nutrient_unit: string;
  amount_per_100g: number;
  amount_per_serving: number;
  density_per_100kcal: number | null;
  formatted_amount: string;
  formatted_per_serving: string;
  standard_serving_name: string;
  standard_serving_grams: number;
  source_code: string;
  source_name: string;
  source_url: string | null;
  view_details_path: string;
}

const QUICK_NUTRIENT_CHIPS: { code: string; label: string; badge: string }[] = [
  { code: 'vit_d_mcg', label: 'Vitamin D', badge: '☀️ Bone & Immunity' },
  { code: 'vit_b12_mcg', label: 'Vitamin B12', badge: '🧬 Nerve & RBC' },
  { code: 'iron_mg', label: 'Iron', badge: '🩸 Haemoglobin' },
  { code: 'calcium_mg', label: 'Calcium', badge: '🦴 Bone Density' },
  { code: 'protein_g', label: 'Protein', badge: '💪 Muscle & Repair' },
  { code: 'folate_mcg', label: 'Folate (B9)', badge: '🥬 Cell Synthesis' },
  { code: 'vit_c_mg', label: 'Vitamin C', badge: '🍋 Iron Absorption' },
  { code: 'fibre_g', label: 'Dietary Fibre', badge: '🌾 Gut & Glycaemic' },
  { code: 'magnesium_mg', label: 'Magnesium', badge: '⚡ Metabolic' },
  { code: 'zinc_mg', label: 'Zinc', badge: '🛡️ Immunity' },
  { code: 'omega3_g', label: 'Omega-3', badge: '🫀 Heart & Brain' },
  { code: 'leucine_g', label: 'Leucine (BCAA)', badge: '🏋️ Muscle Synthesis' },
];

export const NutrientExplorerPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialQueryParam = searchParams.get('nutrient') || 'vit_d_mcg';
  const [catalogGroups, setCatalogGroups] = useState<NutrientCategoryGroup[]>([]);
  const [allNutrients, setAllNutrients] = useState<NutrientCatalogItem[]>([]);
  const [activeGroupTab, setActiveGroupTab] = useState<string>('vitamins');

  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedNutrientQuery, setSelectedNutrientQuery] = useState<string>(initialQueryParam);
  const [dietaryFilter, setDietaryFilter] = useState<string>('all');
  const [foodFormFilter, setFoodFormFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('per_100g_desc');

  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);
  const [resultsLoading, setResultsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [searchResult, setSearchResult] = useState<{
    matched: boolean;
    nutrient: NutrientCatalogItem | null;
    total_matching_foods: number;
    foods: RankedNutrientFoodCard[];
    empty_or_sparse_explanation: string | null;
    suggestions?: { code: string; name: string; unit: string }[];
    message?: string;
  } | null>(null);

  // Load full 65-nutrient catalog on mount
  useEffect(() => {
    let mounted = true;
    setCatalogLoading(true);
    api
      .getNutrientCatalog()
      .then((res) => {
        if (!mounted) return;
        const groups = (res.groups || []) as NutrientCategoryGroup[];
        const nutrients = (res.nutrients || []) as NutrientCatalogItem[];
        setCatalogGroups(groups);
        setAllNutrients(nutrients);
      })
      .catch((err) => {
        if (!mounted) return;
        setErrorMsg(err instanceof Error ? err.message : 'Unable to load nutrient catalog');
      })
      .finally(() => {
        if (mounted) setCatalogLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Fetch ranked foods whenever selectedNutrientQuery, dietaryFilter, foodFormFilter, or sortBy changes
  const executeNutrientSearch = useCallback(
    async (
      queryToRun: string,
      diet: string,
      form: string,
      sortOrder: string
    ) => {
      setResultsLoading(true);
      setErrorMsg(null);
      try {
        const res = await api.searchFoodsByNutrient({
          q: queryToRun,
          dietary_preference: diet,
          food_form: form,
          sort_by: sortOrder,
          limit: 80,
        });
        setSearchResult(res as any);
        if (res.matched && res.nutrient?.explorer_group_code) {
          setActiveGroupTab(res.nutrient.explorer_group_code);
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Nutrient food search failed');
      } finally {
        setResultsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void executeNutrientSearch(
      selectedNutrientQuery,
      dietaryFilter,
      foodFormFilter,
      sortBy
    );
  }, [selectedNutrientQuery, dietaryFilter, foodFormFilter, sortBy, executeNutrientSearch]);

  // Filter nutrients in catalog when user types in the search box
  const matchingCatalogNutrients = useMemo(() => {
    const q = searchInput.trim().toLowerCase();
    if (!q) return [];
    return allNutrients
      .filter((n) => {
        if (n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q)) {
          return true;
        }
        return (n.aliases || []).some((al) => al.toLowerCase().includes(q));
      })
      .slice(0, 12);
  }, [allNutrients, searchInput]);

  const activeGroupObj = useMemo(() => {
    return (
      catalogGroups.find((g) => g.code === activeGroupTab) || catalogGroups[0] || null
    );
  }, [catalogGroups, activeGroupTab]);

  const selectNutrient = (codeOrQuery: string) => {
    setSelectedNutrientQuery(codeOrQuery);
    setSearchParams({ nutrient: codeOrQuery }, { replace: true });
  };

  const handleSearchFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (!trimmed) return;
    selectNutrient(trimmed);
  };

  const activeNutrient = searchResult?.nutrient || null;
  const foods = searchResult?.foods || [];

  // Publish contextual data to Ask GharPlate AI Assistant
  useEffect(() => {
    publishAssistantContext({
      page_type: 'nutrient_explorer',
      route: '/nutrient-explorer',
      selected_entity: activeNutrient
        ? {
            type: 'food',
            id: activeNutrient.code,
            name: `${activeNutrient.name} (${activeNutrient.unit})`,
          }
        : null,
    });
  }, [activeNutrient]);

  // Format displayed amount on the minimal food card according to active sort order
  const formatCardNutrientAmount = (food: RankedNutrientFoodCard): string => {
    if (sortBy === 'per_serving_desc') {
      return `${food.formatted_per_serving} (${food.standard_serving_name})`;
    }
    if (sortBy === 'density_per_100kcal_desc' && food.density_per_100kcal !== null) {
      return `${food.density_per_100kcal} ${food.nutrient_unit} per 100 kcal (${food.formatted_amount})`;
    }
    return food.formatted_amount;
  };

  return (
    <div data-testid="nutrient-explorer-page" className="space-y-6">
      {/* Hero Section: Heading, Subtitle, Search Bar & Category Tabs */}
      <section className="rounded-3xl border border-emerald-900/15 bg-gradient-to-br from-white via-[#f7fbf7] to-[#e7f3e9] p-6 sm:p-8 shadow-sm">
        <div className="max-w-3xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-900/10 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-[#087153]">
            <span>🧬</span>
            <span>ICMR-NIN IFCT 2017 · RDA 2020 · 65 Tracked Nutrients</span>
          </span>
          <h1
            data-testid="nutrient-explorer-heading"
            className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172b23]"
          >
            What Nutrient Are You Looking For?
          </h1>
          <p className="mt-1.5 text-sm sm:text-base text-[#566960]">
            Explore Indian foods by their vitamin, mineral and nutritional composition.
          </p>
        </div>

        {/* Nutrient Search Bar */}
        <form
          onSubmit={handleSearchFormSubmit}
          className="mt-5 flex flex-col sm:flex-row gap-2.5"
        >
          <div className="relative flex-1">
            <input
              type="text"
              data-testid="nutrient-search-input"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search a nutrient — e.g. Vitamin D, Iron, Protein, Calcium..."
              aria-label="Search a nutrient"
              className="w-full rounded-2xl border border-emerald-900/20 bg-white px-4 py-3 text-sm font-semibold text-[#172b23] placeholder:text-stone-400 shadow-inner focus:border-[#087153] focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
            />
            {searchInput.trim().length > 0 && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                aria-label="Clear nutrient search"
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-0.5 text-xs font-bold text-stone-400 hover:text-stone-700"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            data-testid="nutrient-search-submit-btn"
            className="rounded-2xl bg-[#087153] px-6 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-[#064E3B] transition shrink-0"
          >
            Search Nutrient
          </button>
          {activeMember && (
            <button
              type="button"
              data-testid="nutrient-apply-member-diet-btn"
              onClick={() => {
                const pref = (activeMember.dietary_preference || 'vegetarian').toLowerCase();
                setDietaryFilter(
                  ['vegetarian', 'vegan', 'eggetarian', 'non_vegetarian'].includes(pref)
                    ? pref
                    : 'vegetarian'
                );
              }}
              className="rounded-2xl border border-emerald-900/20 bg-white px-4 py-3 text-xs font-extrabold text-[#087153] hover:bg-emerald-50 transition shrink-0"
            >
              Use {activeMember.display_name}’s Diet ({activeMember.dietary_preference})
            </button>
          )}
        </form>

        {/* Live Autocomplete Matches when typing */}
        {searchInput.trim().length > 0 && matchingCatalogNutrients.length > 0 && (
          <div
            data-testid="nutrient-autocomplete-results"
            className="mt-2.5 flex flex-wrap items-center gap-2 rounded-2xl border border-emerald-900/15 bg-white/95 p-3"
          >
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#566960]">
              Matching Nutrients:
            </span>
            {matchingCatalogNutrients.map((nut) => (
              <button
                key={nut.code}
                type="button"
                data-testid={`autocomplete-nutrient-${nut.code}`}
                onClick={() => {
                  selectNutrient(nut.code);
                  setSearchInput('');
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-[#f1f6f1] px-3 py-1.5 text-xs font-bold text-[#172b23] hover:bg-[#087153] hover:text-white transition"
              >
                <span>{nut.name}</span>
                <span className="opacity-75">({nut.unit})</span>
              </button>
            ))}
          </div>
        )}

        {/* Quick Popular Nutrient Chips */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-[#566960] mr-1">
            Popular Nutrients:
          </span>
          {QUICK_NUTRIENT_CHIPS.map((chip) => {
            const isSelected = activeNutrient?.code === chip.code;
            return (
              <button
                key={chip.code}
                type="button"
                data-testid={`quick-nutrient-chip-${chip.code}`}
                onClick={() => selectNutrient(chip.code)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  isSelected
                    ? 'bg-[#064E3B] text-white shadow-sm ring-2 ring-emerald-400/50'
                    : 'bg-white/90 text-[#172b23] border border-emerald-900/15 hover:bg-emerald-50'
                }`}
              >
                <span>{chip.label}</span>
                <span
                  className={`text-[10px] ${
                    isSelected ? 'text-emerald-200' : 'text-[#566960]'
                  }`}
                >
                  · {chip.badge}
                </span>
              </button>
            );
          })}
        </div>

        {/* Clean Category Tabs (6 Required Nutrient Groups) */}
        <div
          role="tablist"
          aria-label="Nutrient Categories"
          data-testid="nutrient-category-tabs"
          className="mt-6 flex flex-wrap gap-2 border-t border-emerald-900/10 pt-5"
        >
          {catalogGroups.map((grp) => {
            const isActive = activeGroupTab === grp.code;
            return (
              <button
                key={grp.code}
                type="button"
                role="tab"
                aria-selected={isActive}
                data-testid={`nutrient-group-tab-${grp.code}`}
                onClick={() => setActiveGroupTab(grp.code)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-xs font-extrabold transition ${
                  isActive
                    ? 'bg-[#087153] text-white shadow-sm'
                    : 'bg-white/85 text-[#172b23] border border-emerald-900/15 hover:bg-emerald-50'
                }`}
              >
                <span aria-hidden="true">{grp.icon}</span>
                <span>{grp.label}</span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                    isActive
                      ? 'bg-emerald-950/35 text-emerald-100'
                      : 'bg-emerald-900/10 text-[#087153]'
                  }`}
                >
                  {grp.nutrient_count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Clickable Nutrients within the Active Category Tab */}
        {!catalogLoading && activeGroupObj && (
          <div
            data-testid={`nutrient-pills-group-${activeGroupObj.code}`}
            className="mt-4 rounded-2xl border border-emerald-900/10 bg-white/85 p-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
              <div className="text-xs font-extrabold text-[#172b23]">
                {activeGroupObj.icon} {activeGroupObj.label} — Select a nutrient to rank Indian foods:
              </div>
              <div className="text-[11px] text-[#566960]">
                {activeGroupObj.description}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeGroupObj.nutrients.map((nut) => {
                const isSelected = activeNutrient?.code === nut.code;
                return (
                  <button
                    key={nut.code}
                    type="button"
                    data-testid={`nutrient-pill-${nut.code}`}
                    onClick={() => selectNutrient(nut.code)}
                    className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                      isSelected
                        ? 'bg-[#087153] text-white shadow-sm'
                        : 'bg-[#f1f6f1] text-[#172b23] border border-emerald-900/10 hover:bg-emerald-100/70'
                    }`}
                  >
                    <span>{nut.name}</span>
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-extrabold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-white text-[#087153]'
                      }`}
                    >
                      {nut.measured_food_count} foods
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Selected Nutrient Summary & Scientific Bioavailability / RDA Context */}
      {activeNutrient && (
        <section
          data-testid="selected-nutrient-header"
          className="rounded-3xl border border-emerald-900/15 bg-white p-5 sm:p-6 shadow-sm space-y-4"
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-[#087153]">
                  {activeNutrient.explorer_group_label}
                </span>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">
                  Unit: {activeNutrient.unit}
                </span>
                <span className="rounded-full bg-amber-50 border border-amber-200/80 px-3 py-1 text-xs font-bold text-amber-900">
                  {searchResult?.total_matching_foods ?? 0} verified Indian foods matched
                </span>
              </div>
              <h2
                data-testid="selected-nutrient-title"
                className="mt-2 text-xl sm:text-2xl font-extrabold text-[#172b23]"
              >
                Indian Foods Ranked by {activeNutrient.name}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-[#566960]">
                {activeNutrient.description}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="nutrient-ask-ai-btn"
                onClick={() => openAssistantWorkspace()}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#064E3B] px-4 py-2.5 text-xs font-extrabold text-white shadow-sm hover:bg-[#087153] transition"
              >
                <span>🤖</span>
                <span>Ask GharPlate AI about {activeNutrient.name}</span>
              </button>
              <Link
                to="/health/reports"
                className="inline-flex items-center gap-1.5 rounded-2xl border border-emerald-900/15 bg-[#f1f6f1] px-4 py-2.5 text-xs font-extrabold text-[#172b23] hover:bg-emerald-100 transition"
              >
                <span>🧪</span>
                <span>Check Lab Reports</span>
              </Link>
            </div>
          </div>

          {/* Scientific RDA, Bioavailability & Coverage Notes */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-emerald-900/10">
            {activeNutrient.rda_adult_note && (
              <div
                data-testid="nutrient-rda-note"
                className="rounded-2xl bg-[#f1f6f1] p-3.5 border border-emerald-900/10"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#087153]">
                  ICMR-NIN RDA 2020 Reference
                </div>
                <p className="mt-1 text-xs font-semibold text-[#172b23] leading-relaxed">
                  {activeNutrient.rda_adult_note}
                </p>
              </div>
            )}
            {activeNutrient.bioavailability_note && (
              <div
                data-testid="nutrient-bioavailability-note"
                className="rounded-2xl bg-amber-50/75 p-3.5 border border-amber-200/70"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-900">
                  Absorption &amp; Bioavailability
                </div>
                <p className="mt-1 text-xs font-medium text-stone-800 leading-relaxed">
                  {activeNutrient.bioavailability_note}
                </p>
              </div>
            )}
            {activeNutrient.coverage_limitation_note ? (
              <div
                data-testid="nutrient-coverage-note"
                className="rounded-2xl bg-sky-50/80 p-3.5 border border-sky-200/70"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-sky-900">
                  Scientific Coverage Note
                </div>
                <p className="mt-1 text-xs font-medium text-stone-800 leading-relaxed">
                  {activeNutrient.coverage_limitation_note}
                </p>
              </div>
            ) : (
              <div
                data-testid="nutrient-null-integrity-note"
                className="rounded-2xl bg-stone-50 p-3.5 border border-stone-200/80"
              >
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-stone-700">
                  Data Integrity &amp; Provenance
                </div>
                <p className="mt-1 text-xs font-medium text-stone-600 leading-relaxed">
                  Only foods with verified measured values for {activeNutrient.name} are ranked below. Unmeasured nutrients remain NULL and are never replaced with zero.
                </p>
              </div>
            )}
          </div>

          {/* Dietary Filter, Food Form Filter & Ranking Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t border-emerald-900/10">
            {/* Dietary Filter */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-extrabold text-[#566960] mr-1">
                Diet:
              </span>
              {[
                { id: 'all', label: 'All Diets' },
                { id: 'vegetarian', label: 'Vegetarian' },
                { id: 'vegan', label: 'Vegan' },
                { id: 'eggetarian', label: 'Eggetarian' },
                { id: 'non_vegetarian', label: 'Non-Vegetarian' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  data-testid={`diet-filter-${opt.id}`}
                  onClick={() => setDietaryFilter(opt.id)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    dietaryFilter === opt.id
                      ? 'bg-[#087153] text-white shadow-sm'
                      : 'bg-[#f1f6f1] text-[#172b23] hover:bg-emerald-100/70'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Food Form Filter & Sort Order */}
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-[#566960]">
                <span>Food Form:</span>
                <select
                  data-testid="food-form-filter-select"
                  value={foodFormFilter}
                  onChange={(e) => setFoodFormFilter(e.target.value)}
                  className="rounded-xl border border-emerald-900/15 bg-[#f1f6f1] px-3 py-1.5 text-xs font-bold text-[#172b23] focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="all">All Forms</option>
                  <option value="natural">Natural Whole Foods &amp; Dishes</option>
                  <option value="raw">Raw / Uncooked Ingredients</option>
                  <option value="cooked">Cooked / Boiled / Steamed</option>
                  <option value="prepared_dish">Prepared Indian Dishes</option>
                  <option value="fortified">Fortified Foods</option>
                  <option value="packaged">Packaged Products</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-xs font-bold text-[#566960]">
                <span>Rank By:</span>
                <select
                  data-testid="nutrient-sort-select"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="rounded-xl border border-emerald-900/15 bg-[#f1f6f1] px-3 py-1.5 text-xs font-bold text-[#172b23] focus:outline-none focus:ring-2 focus:ring-emerald-700"
                >
                  <option value="per_100g_desc">Highest per 100 g</option>
                  <option value="per_serving_desc">Highest per serving</option>
                  <option value="density_per_100kcal_desc">
                    Highest nutrient density (per 100 kcal)
                  </option>
                  <option value="name_asc">Alphabetical (A → Z)</option>
                </select>
              </label>
            </div>
          </div>
        </section>
      )}

      {/* Error State */}
      {errorMsg && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-900"
        >
          {errorMsg}
        </div>
      )}

      {/* Unmatched Nutrient Query Suggestions */}
      {!resultsLoading && searchResult && !searchResult.matched && (
        <section
          data-testid="nutrient-unmatched-state"
          className="rounded-3xl border border-amber-200 bg-amber-50/80 p-6 text-center space-y-3"
        >
          <h3 className="text-base font-extrabold text-amber-950">
            {searchResult.message || 'No matching nutrient found.'}
          </h3>
          {searchResult.suggestions && searchResult.suggestions.length > 0 && (
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              {searchResult.suggestions.map((sug) => (
                <button
                  key={sug.code}
                  type="button"
                  onClick={() => selectNutrient(sug.code)}
                  className="rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-[#087153] border border-amber-300 hover:bg-emerald-50"
                >
                  {sug.name} ({sug.unit})
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Loading State */}
      {resultsLoading ? (
        <div
          data-testid="nutrient-loading-state"
          className="rounded-3xl border border-emerald-900/15 bg-white p-8 text-center text-sm font-bold text-[#087153]"
        >
          Ranking verified Indian foods by nutrient composition...
        </div>
      ) : (
        <>
          {/* Honest Empty or Sparse Explanation Banner */}
          {searchResult?.empty_or_sparse_explanation && (
            <div
              data-testid="nutrient-sparse-explanation"
              className="rounded-2xl border border-amber-300/80 bg-amber-50/90 p-4 text-xs font-semibold text-amber-950 leading-relaxed"
            >
              <span className="font-extrabold uppercase tracking-wider mr-1.5">
                Scientific Coverage Notice:
              </span>
              {searchResult.empty_or_sparse_explanation}
            </div>
          )}

          {/* Clean, Minimal Food Cards Grid (Part G Strict Requirement: Image, Food Name, Selected Nutrient Amount, View Details ->) */}
          {foods.length > 0 ? (
            <section
              aria-label="Ranked Indian Foods"
              data-testid="nutrient-foods-grid"
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            >
              {foods.map((food) => (
                <article
                  key={food.slug}
                  data-testid={`nutrient-food-card-${food.slug}`}
                  className="group flex flex-col justify-between overflow-hidden rounded-2xl border border-emerald-900/12 bg-white shadow-sm hover:shadow-md hover:border-[#087153]/40 transition"
                >
                  <div>
                    <div className="relative h-40 w-full overflow-hidden bg-[#e8f2e9]">
                      <FoodImage
                        src={food.image_url}
                        foodName={food.name_en}
                        foodSlug={food.slug}
                        categorySlug={food.category_slug || 'indian-dishes'}
                        isPackaged={food.is_packaged}
                        aspectClass="h-40 w-full"
                      />
                    </div>
                    <div className="p-4">
                      <h3 className="text-sm font-extrabold text-[#172b23] line-clamp-2">
                        {food.name_en}
                      </h3>
                      <p
                        data-testid={`nutrient-food-amount-${food.slug}`}
                        className="mt-1.5 text-xs font-extrabold text-[#087153]"
                      >
                        {activeNutrient ? `${activeNutrient.name}: ` : ''}
                        {formatCardNutrientAmount(food)}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-1">
                    <Link
                      to={`/foods/${food.slug}`}
                      data-testid={`nutrient-food-detail-link-${food.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-extrabold text-[#087153] hover:text-[#064E3B] hover:underline"
                    >
                      <span>View Details</span>
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </section>
          ) : (
            searchResult?.matched && (
              <div
                data-testid="nutrient-empty-results"
                className="rounded-3xl border border-emerald-900/15 bg-white p-8 text-center space-y-3"
              >
                <p className="text-sm font-extrabold text-[#172b23]">
                  No Indian foods in the current filter view have a positive measured value for{' '}
                  {activeNutrient?.name}.
                </p>
                <p className="text-xs text-[#566960] max-w-xl mx-auto">
                  {searchResult.empty_or_sparse_explanation ||
                    'Try switching the Dietary Filter to "All Diets" or Food Form to "All Forms" to view all measured food records.'}
                </p>
                <div className="pt-2 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDietaryFilter('all');
                      setFoodFormFilter('all');
                    }}
                    className="rounded-xl bg-[#087153] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#064E3B] transition"
                  >
                    Reset Filters
                  </button>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};

export default NutrientExplorerPage;
