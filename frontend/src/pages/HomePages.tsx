import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ConfidenceBadge,
  FoodCard,
  MacroDistributionBarChart,
  ObservationCard,
} from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  FoodCategory,
  FoodDetail,
  FoodSearchResponse,
  GuidanceEvaluationResponse,
  HealthConditionSummary,
} from '../types/api';

// ==========================================
// PAGE 1: LANDING / HOME PAGE
// ==========================================
export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const { household, activeMember, searchHistory, addSearchHistory } = useHousehold();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<{ foods: number; conditions: number; sources: number } | null>(
    null
  );
  const [categories, setCategories] = useState<FoodCategory[]>([]);

  useEffect(() => {
    void api.getHealth().then((res) => setStats(res.counts)).catch(() => null);
    void api.getCategories().then(setCategories).catch(() => null);
  }, []);

  const handleQuickSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      addSearchHistory(searchQuery.trim());
      navigate(`/foods?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      navigate('/foods');
    }
  };

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <section className="rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-stone-900 px-6 py-10 text-white shadow-lg sm:px-10">
        <div className="max-w-3xl space-y-4">
          <span className="inline-block rounded-full bg-emerald-700/70 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-100 border border-emerald-500/40">
            ICMR-NIN IFCT 2017 • Dietary Guidelines for Indians 2024 • FSSAI • WHO
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Transparent, Evidence-Based Nutrition Intelligence for Indian Households
          </h1>
          <p className="text-sm sm:text-base text-emerald-100 leading-relaxed">
            Explore Indian grains, millets, dals, regional dishes, and packaged foods in English, Hindi, and Kannada. Understand how nutrient composition relates to your family’s health considerations — with full source provenance and zero fabricated data.
          </p>

          <form onSubmit={handleQuickSearch} className="mt-6 flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search in English, Hindi, or Kannada (e.g. Ragi, Aloo, Avalakki, Baale Hannu, Toor Dal)..."
              aria-label="Search Indian Foods"
              className="flex-1 rounded-xl border border-emerald-600 bg-white px-4 py-3 text-sm text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              type="submit"
              className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-bold text-stone-950 shadow hover:bg-amber-400 transition"
            >
              Search Foods
            </button>
          </form>

          {searchHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs text-emerald-100">
              <span>Quick try:</span>
              {searchHistory.slice(0, 6).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => navigate(`/foods?q=${encodeURIComponent(term)}`)}
                  className="rounded-lg bg-emerald-800/80 px-2.5 py-1 hover:bg-emerald-700 border border-emerald-600/50 transition"
                >
                  {term}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Real API Database Metrics */}
        {stats && (
          <div className="mt-8 grid grid-cols-3 gap-4 border-t border-emerald-700/60 pt-6 text-center sm:max-w-lg">
            <div>
              <div className="text-2xl font-extrabold text-amber-400">{stats.foods}</div>
              <div className="text-xs text-emerald-100">Verified Indian Foods</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-amber-400">{stats.conditions}</div>
              <div className="text-xs text-emerald-100">Clinical Condition Guides</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-amber-400">{stats.sources}</div>
              <div className="text-xs text-emerald-100">Authoritative Sources</div>
            </div>
          </div>
        )}
      </section>

      {/* Active Household Status Strip */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-500">
            Household Personalisation Status
          </h2>
          {activeMember ? (
            <p className="mt-1 text-sm text-stone-800">
              Evaluating food guidance for <span className="font-bold text-emerald-900">{activeMember.display_name}</span> ({activeMember.age_group}, {activeMember.dietary_preference}) •{' '}
              <span className="font-semibold">{activeMember.selected_conditions.length}</span> condition(s),{' '}
              <span className="font-semibold">{activeMember.allergies.length}</span> allergy(s),{' '}
              <span className="font-semibold">{activeMember.intolerances.length}</span> intolerance(s).
            </p>
          ) : (
            <p className="mt-1 text-sm text-stone-700">
              No mandatory login required. Create member profiles stored via your browser convenience token ({household?.household_token.slice(0, 12)}...) to personalise food guidance.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/household"
            className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100"
          >
            Household Dashboard
          </Link>
          <Link
            to="/household/member"
            className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
          >
            {activeMember ? 'Edit Member Profiles' : '+ Add Household Member'}
          </Link>
        </div>
      </section>

      {/* Core Platform Capabilities Grid */}
      <section>
        <h2 className="text-xl font-bold text-stone-900">Core Modules & Interactive Tools</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: 'Food Intelligence Explorer',
              desc: 'Search 9 Indian food categories in English, Hindi & Kannada with full per-100g & household serving metrics.',
              to: '/foods',
              badge: 'Multilingual Search',
            },
            {
              title: 'Condition-Aware Guidance',
              desc: 'Deterministic, citation-backed nutritional context for 9 condition groups with multi-condition conflict checks.',
              to: '/conditions',
              badge: 'Evidence-Based',
            },
            {
              title: 'Recipe Nutrition Calculator',
              desc: 'Build household recipes in katoris, cups, rotis, or grams and inspect completeness-aware nutrient totals.',
              to: '/recipes/calculator',
              badge: 'NULL-Safe Math',
            },
            {
              title: 'Packaged Label OCR Scanner',
              desc: 'Extract and validate FSSAI nutrition facts from label photos or text strictly in memory with manual review.',
              to: '/scanner',
              badge: 'RAM-Only Privacy',
            },
            {
              title: 'Barcode Product Lookup',
              desc: 'Look up Indian packaged barcodes via verified local catalog + Open Food Facts with clean manual fallback.',
              to: '/barcode',
              badge: 'Open Food Facts',
            },
            {
              title: '2–4 Product Comparison',
              desc: 'Compare packaged cereals, biscuits, snacks, and drinks normalised per 100g/100ml with condition context.',
              to: '/compare',
              badge: 'Normalised Basis',
            },
            {
              title: 'Personalised Meal Suggestions',
              desc: 'Practical Indian Breakfast, Lunch, Dinner, and Snack combinations tailored to member profiles.',
              to: '/meals',
              badge: 'Indian Meals',
            },
            {
              title: 'Experimental Dish Recognition',
              desc: 'Upload a meal photo for multi-candidate Indian dish suggestions with explicit uncertainty safeguards.',
              to: '/recognition',
              badge: 'Experimental CV',
            },
          ].map((card) => (
            <Link
              key={card.to}
              to={card.to}
              className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-sm hover:border-emerald-600 hover:shadow-md transition"
            >
              <div>
                <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                  {card.badge}
                </span>
                <h3 className="mt-2.5 text-base font-bold text-stone-900">{card.title}</h3>
                <p className="mt-1.5 text-xs text-stone-600 leading-relaxed">{card.desc}</p>
              </div>
              <span className="mt-4 text-xs font-bold text-emerald-800">Open Module →</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Browse by 9 Indian Food Categories */}
      {categories.length > 0 && (
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-stone-900">Browse by Food Category</h2>
            <Link to="/foods" className="text-xs font-bold text-emerald-800 hover:underline">
              View All Foods →
            </Link>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {categories.map((cat) => (
              <Link
                key={cat.slug}
                to={`/foods?category=${encodeURIComponent(cat.slug)}`}
                className="rounded-xl border border-stone-200 bg-white p-4 hover:border-emerald-600 transition"
              >
                <div className="font-bold text-sm text-stone-900">{cat.name}</div>
                <p className="mt-1 text-xs text-stone-600 line-clamp-2">{cat.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ==========================================
// PAGE 2: FOOD EXPLORER PAGE
// ==========================================
export const FoodExplorerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchHistory, addSearchHistory, clearSearchHistory } = useHousehold();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [nutrientFilter, setNutrientFilter] = useState(searchParams.get('nutrient') || '');
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [page, setPage] = useState(1);

  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [results, setResults] = useState<FoodSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getCategories().then(setCategories).catch(() => null);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .searchFoods({
        q: query || undefined,
        category: category || undefined,
        vegetarian_only: vegetarianOnly,
        nutrient_filter: nutrientFilter || undefined,
        sort_by: sortBy,
        page,
        page_size: 18,
      })
      .then((res) => {
        if (active) setResults(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Search failed');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [query, category, vegetarianOnly, nutrientFilter, sortBy, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    if (query.trim()) addSearchHistory(query.trim());
    const nextParams: Record<string, string> = {};
    if (query.trim()) nextParams.q = query.trim();
    if (category) nextParams.category = category;
    setSearchParams(nextParams);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-stone-900">
          Food Intelligence Explorer & Multilingual Search
        </h1>
        <p className="mt-1 text-xs text-stone-600">
          Search across English, Hindi (Devanagari or transliterated), and Kannada (script or transliterated) names, fuzzy spelling variations, categories, and nutritional characteristics.
        </p>

        <form onSubmit={handleSearchSubmit} className="mt-4 grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-5">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search e.g. Aloo, Eerulli, Avalakki, Baale Hannu, Ragi, Idli..."
              aria-label="Food Search Input"
              className="w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              aria-label="Filter by Food Category"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All 9 Categories</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              aria-label="Filter by Nutritional Characteristic"
              value={nutrientFilter}
              onChange={(e) => {
                setNutrientFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="">All Nutrient Profiles</option>
              <option value="high_protein">High Protein (&ge;10g/100g)</option>
              <option value="high_fibre">High Fibre (&ge;6g/100g)</option>
              <option value="high_calcium">Calcium Rich (&ge;100mg/100g)</option>
              <option value="high_iron">Iron Rich (&ge;3mg/100g)</option>
              <option value="low_sodium">Low Sodium (&le;50mg/100g)</option>
            </select>
          </div>

          <div className="sm:col-span-2">
            <select
              aria-label="Sort Results"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm"
            >
              <option value="relevance">Sort: Relevance</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="protein_desc">Highest Protein</option>
              <option value="fibre_desc">Highest Fibre</option>
              <option value="energy_asc">Lowest Energy (kcal)</option>
            </select>
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <label className="inline-flex items-center gap-2 font-medium text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={vegetarianOnly}
              onChange={(e) => {
                setVegetarianOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-stone-300 text-emerald-700 focus:ring-emerald-600"
            />
            Vegetarian Foods Only
          </label>

          {searchHistory.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-stone-400">Recent searches:</span>
              {searchHistory.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setQuery(item);
                    setPage(1);
                  }}
                  className="rounded-md bg-stone-100 px-2 py-0.5 text-stone-700 hover:bg-emerald-50 hover:text-emerald-800"
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={clearSearchHistory}
                className="ml-1 text-stone-400 underline hover:text-stone-600"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Did you mean / Search suggestions */}
      {results && results.suggestions.length > 0 && query.trim() && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
          <span className="font-semibold">Related matches & aliases:</span>
          {results.suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => setQuery(sug.split(' (')[0])}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium text-emerald-900 hover:bg-emerald-100"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Results State */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-52 animate-pulse rounded-2xl bg-stone-200/70" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
          Error loading food records: {error}
        </div>
      ) : results && results.items.length > 0 ? (
        <>
          <div className="flex items-center justify-between text-xs text-stone-600">
            <span>
              Showing <strong>{results.items.length}</strong> of <strong>{results.total}</strong> verified food records
            </span>
            <span>Missing nutrients are preserved as NULL, never assumed zero.</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.items.map((food) => (
              <FoodCard key={food.slug} food={food} />
            ))}
          </div>

          {/* Pagination */}
          {results.total > results.page_size && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-xs font-semibold text-stone-700">
                Page {page} of {Math.ceil(results.total / results.page_size)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(results.total / results.page_size)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center">
          <h3 className="text-base font-bold text-stone-900">No matching food items found</h3>
          <p className="mt-1 text-xs text-stone-600">
            Try clearing category or nutrient filters, or scan a packaged food label using the OCR Scanner.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('');
                setNutrientFilter('');
                setVegetarianOnly(false);
              }}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-semibold text-white"
            >
              Reset Filters
            </button>
            <Link
              to="/scanner"
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-semibold text-white"
            >
              Scan Packaged Label
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// PAGE 3: FOOD DETAIL & HEALTH CONSIDERATIONS PAGE
// ==========================================
export const FoodDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { activeMember } = useHousehold();

  const [food, setFood] = useState<FoodDetail | null>(null);
  const [conditions, setConditions] = useState<HealthConditionSummary[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [servingUnit, setServingUnit] = useState('standard_serving');
  const [servingQty, setServingQty] = useState(1);
  const [guidance, setGuidance] = useState<GuidanceEvaluationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getConditions().then(setConditions).catch(() => null);
  }, []);

  useEffect(() => {
    if (activeMember && activeMember.selected_conditions.length > 0 && selectedConditions.length === 0) {
      setSelectedConditions(activeMember.selected_conditions);
    }
  }, [activeMember]);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    api
      .getFoodDetail(slug)
      .then((res) => {
        setFood(res);
        setServingUnit('standard_serving');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load food'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!food) return;
    api
      .evaluateGuidance({
        food_slug: food.slug,
        condition_codes: selectedConditions,
        serving_unit: servingUnit,
        serving_quantity: servingQty,
        age_group: activeMember?.age_group || 'adult',
        allergies: activeMember?.allergies || [],
        intolerances: activeMember?.intolerances || [],
        dietary_preference: activeMember?.dietary_preference,
      })
      .then(setGuidance)
      .catch(() => null);
  }, [food, selectedConditions, servingUnit, servingQty, activeMember]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-2xl bg-stone-200/70" />;
  }
  if (error || !food) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
        {error || 'Food record not found.'}{' '}
        <Link to="/foods" className="font-bold underline">
          Return to Food Explorer
        </Link>
      </div>
    );
  }

  const selectedServingObj =
    food.servings.find((s) => s.unit_name === servingUnit) || food.servings[0];
  const activeGrams = (selectedServingObj ? selectedServingObj.grams_equivalent : food.standard_serving_grams) * servingQty;
  const scaleFactor = activeGrams / 100.0;

  const getScaled = (code: string) => {
    const n = food.nutrients.find((item) => item.nutrient_code === code);
    if (!n || n.value_per_100 === null) return null;
    return Number((n.value_per_100 * scaleFactor).toFixed(2));
  };

  const toggleCondition = (code: string) => {
    setSelectedConditions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-stone-500 flex items-center gap-2">
        <Link to="/foods" className="hover:underline text-emerald-800 font-medium">
          Food Explorer
        </Link>
        <span>/</span>
        <Link
          to={`/foods?category=${food.category.slug}`}
          className="hover:underline text-emerald-800 font-medium"
        >
          {food.category.name}
        </Link>
        <span>/</span>
        <span className="text-stone-800 font-semibold">{food.name_en}</span>
      </nav>

      {/* Header Card */}
      <section className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-semibold text-stone-700">
                {food.category.name}
              </span>
              {food.ifct_code && (
                <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                  ICMR-NIN IFCT Code: {food.ifct_code}
                </span>
              )}
              <ConfidenceBadge status={food.confidence_level} />
            </div>
            <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold text-stone-900">
              {food.name_en}
            </h1>
            {food.scientific_name && (
              <p className="text-xs italic text-stone-500 mt-0.5">{food.scientific_name}</p>
            )}
            <p className="mt-2 max-w-3xl text-sm text-stone-700 leading-relaxed">
              {food.description}
            </p>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 text-xs space-y-1.5 min-w-[240px]">
            <div className="font-bold text-stone-800">Data Provenance & Completeness</div>
            <div>
              <span className="text-stone-500">Source: </span>
              <a
                href={food.source.url}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-emerald-800 underline"
              >
                {food.source.name} ({food.source.publication_year}) ↗
              </a>
            </div>
            <div>
              <span className="text-stone-500">Known Nutrients: </span>
              <strong>{food.available_nutrient_count} / 20 ({food.completeness_pct}%)</strong>
            </div>
            <div>
              <span className="text-stone-500">Standard Serving: </span>
              <strong>{food.standard_serving_name} ({food.standard_serving_grams}g)</strong>
            </div>
          </div>
        </div>

        {/* Multilingual Aliases */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-4 text-xs">
          <span className="font-bold text-stone-700">Regional Names (English / Hindi / Kannada):</span>
          {food.aliases.map((al, i) => (
            <span
              key={`${al.language}-${i}`}
              className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-stone-800"
            >
              <strong className="uppercase text-emerald-800">{al.language}:</strong> {al.alias_text}
              {al.script_text && al.script_text !== al.alias_text ? ` (${al.script_text})` : ''}
            </span>
          ))}
        </div>

        {/* Allergen & Ingredient Notice */}
        <div className="mt-4 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs text-stone-700 space-y-1">
          <div>
            <strong>Declared Allergen Indications: </strong>
            {food.allergen_tags.length > 0 ? food.allergen_tags.join(', ') : 'None listed in reference record'}
            {' • '}
            <strong>Digestive Intolerance Markers: </strong>
            {food.intolerance_tags.length > 0 ? food.intolerance_tags.join(', ') : 'None listed'}
          </div>
          {food.ingredients_text && (
            <div>
              <strong>Declared Ingredients: </strong>
              {food.ingredients_text}
            </div>
          )}
          <div className="text-amber-900 font-medium">{food.allergen_safety_disclaimer}</div>
        </div>
      </section>

      {/* Serving Converter & Macronutrient Chart */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-bold uppercase tracking-wider text-stone-700">
              Serving Size & Household Measure Converter
            </h2>
            <div className="mt-3 grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-stone-600">Select Household Unit</label>
                <select
                  aria-label="Serving Unit Selector"
                  value={servingUnit}
                  onChange={(e) => setServingUnit(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
                >
                  {food.servings.map((srv) => (
                    <option key={srv.unit_name} value={srv.unit_name}>
                      {srv.unit_label} ({srv.grams_equivalent}g)
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600">Quantity</label>
                <input
                  type="number"
                  min={0.25}
                  step={0.25}
                  value={servingQty}
                  onChange={(e) => setServingQty(Math.max(0.25, Number(e.target.value) || 1))}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <p className="mt-3 text-xs text-emerald-900 font-semibold">
              Evaluated Serving Weight: {activeGrams.toFixed(1)} g ({food.conversion_methodology})
            </p>
          </div>

          <MacroDistributionBarChart
            proteinG={getScaled('protein_g')}
            carbsG={getScaled('carbs_g')}
            fatG={getScaled('fat_total_g')}
            fibreG={getScaled('fibre_g')}
            basisLabel={`${activeGrams.toFixed(0)}g Evaluated Serving`}
          />
        </div>

        {/* Full Nutrient Table */}
        <div className="lg:col-span-7 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-stone-900">
              Complete Nutritional Composition Table
            </h2>
            <span className="text-xs text-stone-500">
              Missing nutrients shown explicitly as NULL / Not Available
            </span>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-2 pr-3">Nutrient</th>
                  <th className="py-2 px-3">Per {food.default_basis}</th>
                  <th className="py-2 px-3">Evaluated Serving ({activeGrams.toFixed(0)}g)</th>
                  <th className="py-2 pl-3">Data Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {food.nutrients.map((n) => {
                  const scaledVal =
                    n.value_per_100 !== null ? (n.value_per_100 * scaleFactor).toFixed(2) : null;
                  return (
                    <tr key={n.nutrient_code} className={n.is_available ? '' : 'bg-stone-50/70 text-stone-400'}>
                      <td className="py-2 pr-3 font-semibold text-stone-800">
                        {n.nutrient_name} ({n.unit})
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {n.value_per_100 !== null ? `${n.value_per_100} ${n.unit}` : 'NULL (Unknown)'}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-emerald-900">
                        {scaledVal !== null ? `${scaledVal} ${n.unit}` : 'NULL (Unknown)'}
                      </td>
                      <td className="py-2 pl-3">
                        <ConfidenceBadge status={n.confidence_status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Dedicated Section: FOOD AND HEALTH CONSIDERATIONS (Module 3.5) */}
      <section className="rounded-3xl border-2 border-emerald-800/20 bg-white p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
              Module 3 — Condition-Aware Food Guidance
            </span>
            <h2 className="mt-2 text-xl font-extrabold text-stone-900">
              Food and Health Considerations
            </h2>
            <p className="mt-1 text-xs text-stone-600">
              Select one or more health conditions below (or use your active household member profile) to evaluate how <strong>{food.name_en}</strong> relates to those considerations.
            </p>
          </div>
          {activeMember && (
            <div className="rounded-xl bg-stone-100 px-3.5 py-2 text-xs">
              Active Profile: <strong>{activeMember.display_name}</strong> ({activeMember.age_group})
            </div>
          )}
        </div>

        {/* Condition Selector Chips */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">
            Select Health Conditions to Evaluate Together (Supports Multi-Condition Reasoning):
          </label>
          <div className="flex flex-wrap gap-1.5">
            {conditions.map((c) => {
              const active = selectedConditions.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCondition(c.code)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'border-emerald-800 bg-emerald-800 text-white font-semibold shadow-sm'
                      : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Guidance Output */}
        {guidance && (
          <div className="space-y-4 border-t border-stone-200 pt-4">
            {/* Allergen & Intolerance Alerts */}
            {(guidance.allergen_alerts.length > 0 ||
              guidance.intolerance_alerts.length > 0 ||
              guidance.dietary_preference_alerts.length > 0) && (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-xs text-rose-950 space-y-1.5">
                <div className="font-bold text-sm">Household Allergen, Intolerance & Preference Alerts</div>
                {guidance.allergen_alerts.map((al, idx) => (
                  <p key={idx}>• <strong>Allergy Alert:</strong> {al}</p>
                ))}
                {guidance.intolerance_alerts.map((il, idx) => (
                  <p key={idx}>• <strong>Intolerance Note:</strong> {il}</p>
                ))}
                {guidance.dietary_preference_alerts.map((dl, idx) => (
                  <p key={idx}>• <strong>Preference Note:</strong> {dl}</p>
                ))}
              </div>
            )}

            {/* Multi-Condition Conflict Warnings */}
            {guidance.multi_condition_conflicts.length > 0 && (
              <div className="rounded-2xl border-2 border-purple-400 bg-purple-50 p-5 text-xs text-purple-950 space-y-2">
                <div className="text-sm font-extrabold text-purple-900">
                  Competing Multi-Condition Considerations Detected (Requires Individualised Professional Guidance)
                </div>
                {guidance.multi_condition_conflicts.map((conf) => (
                  <div key={conf.conflict_code} className="space-y-1 border-t border-purple-200 pt-2">
                    <div className="font-bold">
                      Competing Domain: {conf.competing_domain} ({conf.condition_a_code} + {conf.condition_b_code})
                    </div>
                    <p>{conf.conflict_explanation}</p>
                    <p><strong>Why this conflict exists:</strong> {conf.why_conflict_exists}</p>
                    <p className="font-semibold text-purple-900">{conf.professional_guidance_notice}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Observations List */}
            {selectedConditions.length === 0 ? (
              <div className="rounded-xl bg-stone-50 p-4 text-xs text-stone-600">
                Select one or more health conditions above to view deterministic, source-cited nutritional guidance for <strong>{food.name_en}</strong>.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {guidance.observations.map((obs) => (
                  <ObservationCard key={`${obs.rule_code}-${obs.condition_code}`} obs={obs} />
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
