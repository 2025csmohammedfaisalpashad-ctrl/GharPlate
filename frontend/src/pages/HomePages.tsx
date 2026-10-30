import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ConfidenceBadge,
  ExpandableSection,
  FoodCard,
  FoodImage,
  MacroDistributionBarChart,
  ObservationCard,
} from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type {
  FoodCategory,
  FoodDetail,
  FoodSearchResponse,
  FoodSummary,
  GuidanceEvaluationResponse,
  HealthConditionSummary,
} from '../types/api';
import { CATEGORY_VISUALS } from '../utils/visualAssets';

// ==========================================
// PAGE 1: REDESIGNED VISUAL LANDING / HOME PAGE
// ==========================================
export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    household,
    activeMember,
    setActiveMemberId,
    searchHistory,
    addSearchHistory,
  } = useHousehold();
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState<{ foods: number; conditions: number; sources: number } | null>(
    null
  );
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [featuredFoods, setFeaturedFoods] = useState<FoodSummary[]>([]);

  useEffect(() => {
    void api.getHealth().then((res) => setStats(res.counts)).catch(() => null);
    void api.getCategories().then(setCategories).catch(() => null);
    void api
      .searchFoods({ page_size: 6, sort_by: 'protein_desc' })
      .then((res) => setFeaturedFoods(res.items))
      .catch(() => null);
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
    <div className="space-y-10">
      {/* A. HERO SECTION — Visual, Concise & Action-Oriented */}
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 text-white shadow-xl">
        <div className="grid items-center gap-8 p-6 sm:p-10 lg:grid-cols-12">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-800/70 px-3.5 py-1 text-xs font-bold text-emerald-100 border border-emerald-600/40">
              <span>🌿</span>
              <span>Transparent, Evidence-Based Nutrition Intelligence</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight">
              Know What’s on Your Plate.
            </h1>

            <p className="text-sm sm:text-base text-emerald-100/90 max-w-xl">
              Explore Indian whole foods, home-cooked dishes, and packaged labels tailored to your family’s health considerations in English, Hindi, and Kannada.
            </p>

            {/* Prominent Search Bar */}
            <form
              onSubmit={handleQuickSearch}
              className="flex flex-col sm:flex-row gap-2.5 pt-1"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Ragi, Aloo, Avalakki, Idli, Almonds, Paneer..."
                aria-label="Search Indian Foods"
                className="flex-1 rounded-2xl border-0 bg-white px-5 py-3.5 text-sm font-medium text-stone-900 placeholder-stone-400 shadow-inner focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <button
                type="submit"
                className="rounded-2xl bg-amber-400 px-6 py-3.5 text-sm font-extrabold text-stone-950 shadow-md hover:bg-amber-300 transition"
              >
                Search Food
              </button>
            </form>

            {/* Primary & Secondary CTAs + Quick Chips */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                to="/foods"
                className="rounded-2xl bg-white px-5 py-2.5 text-xs font-extrabold text-emerald-950 shadow hover:bg-emerald-50 transition"
              >
                Explore Food Catalog →
              </Link>
              <Link
                to="/scanner"
                className="rounded-2xl border border-emerald-500/60 bg-emerald-800/50 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 transition"
              >
                📸 Scan Food Label
              </Link>
              {searchHistory.slice(0, 4).map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => navigate(`/foods?q=${encodeURIComponent(term)}`)}
                  className="rounded-full bg-emerald-900/80 px-3 py-1 text-xs font-medium text-emerald-100 hover:bg-emerald-800 border border-emerald-700/60"
                >
                  {term}
                </button>
              ))}
            </div>

            {stats && (
              <div className="flex items-center gap-6 pt-2 text-xs text-emerald-200/90">
                <div>
                  <strong className="text-base font-black text-amber-300">{stats.foods}</strong> Indian Foods
                </div>
                <div>
                  <strong className="text-base font-black text-amber-300">{stats.conditions}</strong> Health Guides
                </div>
                <div>
                  <strong className="text-base font-black text-amber-300">{stats.sources}</strong> Clinical Sources
                </div>
              </div>
            )}
          </div>

          {/* Right: Visual Indian Food Collage */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            {[
              {
                title: 'Idli & Sambar',
                sub: '146 kcal / 2 idlis',
                slug: 'idli-steamed-rice-lentil',
                cat: 'indian-dishes',
                img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Idli_Sambar.JPG/640px-Idli_Sambar.JPG',
              },
              {
                title: 'Ragi (Finger Millet)',
                sub: '364 mg Calcium / 100g',
                slug: 'ragi-finger-millet',
                cat: 'cereals-millets',
                img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Eleusine_coracana_seeds.jpg/640px-Eleusine_coracana_seeds.jpg',
              },
              {
                title: 'Palak Paneer',
                sub: 'Rich in Folate & Calcium',
                slug: 'palak-paneer-curry',
                cat: 'indian-dishes',
                img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Palak_paneer_in_India.jpg/640px-Palak_paneer_in_India.jpg',
              },
              {
                title: 'Almonds (Badam)',
                sub: '18.4g Protein / 100g',
                slug: 'almonds-badam',
                cat: 'nuts-seeds',
                img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Almonds.png/640px-Almonds.png',
              },
            ].map((card) => (
              <Link
                key={card.slug}
                to={`/foods/${card.slug}`}
                className="group relative overflow-hidden rounded-2xl border border-white/15 bg-stone-900 shadow-lg"
              >
                <FoodImage
                  src={card.img}
                  foodName={card.title}
                  categorySlug={card.cat}
                  aspectClass="aspect-[4/3]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-2.5 left-3 right-3">
                  <div className="text-xs font-extrabold text-white">{card.title}</div>
                  <div className="text-[10px] font-medium text-amber-300">{card.sub}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* D. HOUSEHOLD MEMBER CONTEXT BAR — Simple One-Click Profile Switcher */}
      <section className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-xl font-black text-emerald-900">
            {activeMember ? activeMember.display_name.slice(0, 1).toUpperCase() : '🏡'}
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-400">
              Active Household Profile
            </div>
            {activeMember ? (
              <div className="text-sm sm:text-base font-extrabold text-stone-900">
                Personalising for <span className="text-emerald-800">{activeMember.display_name}</span>{' '}
                <span className="text-xs font-semibold text-stone-500">
                  ({activeMember.dietary_preference.replace('_', ' ')} • {activeMember.selected_conditions.length} condition{activeMember.selected_conditions.length === 1 ? '' : 's'})
                </span>
              </div>
            ) : (
              <div className="text-sm font-bold text-stone-800">
                Personalise food guidance for your family members (no login required)
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {household?.members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => void setActiveMemberId(m.id)}
              className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                activeMember?.id === m.id
                  ? 'bg-emerald-800 text-white shadow-sm'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {m.display_name}
            </button>
          ))}
          <Link
            to="/household/member"
            className="rounded-xl border border-emerald-700 px-3.5 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50"
          >
            + Add / Edit Member
          </Link>
        </div>
      </section>

      {/* C. QUICK ACTIONS — 6 Visual Shortcuts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-stone-900">What Would You Like to Do?</h2>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-6">
          {[
            {
              title: 'Explore Food',
              sub: 'Photos & macros',
              icon: '🥗',
              to: '/foods',
              color: 'bg-emerald-50 border-emerald-200 text-emerald-950',
            },
            {
              title: 'Check a Condition',
              sub: 'Blood sugar, BP, kidney',
              icon: '❤️',
              to: '/conditions',
              color: 'bg-rose-50 border-rose-200 text-rose-950',
            },
            {
              title: 'Calculate Recipe',
              sub: 'Visual cooking helper',
              icon: '🍲',
              to: '/recipes/calculator',
              color: 'bg-amber-50 border-amber-200 text-amber-950',
            },
            {
              title: 'Scan Food Label',
              sub: 'Instant OCR check',
              icon: '📸',
              to: '/scanner',
              color: 'bg-sky-50 border-sky-200 text-sky-950',
            },
            {
              title: 'Compare Products',
              sub: 'Side-by-side per 100g',
              icon: '⚖️',
              to: '/compare',
              color: 'bg-purple-50 border-purple-200 text-purple-950',
            },
            {
              title: 'Discover Meals',
              sub: 'Breakfast to dinner',
              icon: '🍛',
              to: '/meals',
              color: 'bg-teal-50 border-teal-200 text-teal-950',
            },
          ].map((act) => (
            <Link
              key={act.to}
              to={act.to}
              className={`group flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${act.color}`}
            >
              <span className="text-2xl">{act.icon}</span>
              <div className="mt-3">
                <div className="text-sm font-extrabold">{act.title}</div>
                <div className="text-[11px] opacity-80">{act.sub}</div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* B. EXPLORE FOOD CATEGORIES — 9 Image-Based Category Cards */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-black text-stone-900">Explore Food Categories</h2>
            <p className="text-xs text-stone-500">
              Tap any category to browse Indian ingredients, dishes, and packaged foods
            </p>
          </div>
          <Link to="/foods" className="text-xs font-extrabold text-emerald-800 hover:underline">
            Browse All 75+ Foods →
          </Link>
        </div>

        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {(categories.length > 0
            ? categories
            : Object.values(CATEGORY_VISUALS).map((v, i) => ({
                id: i,
                slug: v.slug,
                name: v.shortTitle,
                description: v.tagline,
                image_url: v.photoUrl,
                display_order: i,
              }))
          ).map((cat) => {
            const meta = CATEGORY_VISUALS[cat.slug] || CATEGORY_VISUALS['indian-dishes'];
            return (
              <Link
                key={cat.slug}
                to={`/foods?category=${encodeURIComponent(cat.slug)}`}
                className="group relative overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-sm transition hover:-translate-y-1 hover:border-emerald-600 hover:shadow-lg"
              >
                <FoodImage
                  src={cat.image_url || meta.photoUrl}
                  foodName={cat.name}
                  categorySlug={cat.slug}
                  aspectClass="aspect-[4/3]"
                />
                <div className="p-3.5">
                  <div className="flex items-center gap-1.5">
                    <span>{meta.emojiIcon}</span>
                    <h3 className="text-sm font-extrabold text-stone-900 group-hover:text-emerald-800 truncate">
                      {meta.shortTitle || cat.name}
                    </h3>
                  </div>
                  <p className="mt-0.5 text-[11px] text-stone-500 line-clamp-1">
                    {meta.tagline}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* E. FEATURED INDIAN FOODS — Image-First Cards */}
      {featuredFoods.length > 0 && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-stone-900">Featured Nutrient-Rich Indian Foods</h2>
              <p className="text-xs text-stone-500">
                Real composition values from ICMR-NIN IFCT 2017 & Dietary Guidelines for Indians 2024
              </p>
            </div>
            <Link
              to="/foods?sort_by=protein_desc"
              className="text-xs font-extrabold text-emerald-800 hover:underline"
            >
              See All →
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featuredFoods.slice(0, 6).map((f) => (
              <FoodCard key={f.slug} food={f} />
            ))}
          </div>
        </section>
      )}

      {/* F. BITE-SIZED EDUCATIONAL INSIGHTS — Interactive Cards */}
      <section className="space-y-4">
        <h2 className="text-xl font-black text-stone-900">Everyday Nutrition Insights</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            {
              badge: 'Sugar Check',
              title: 'Compare sugar per 100 g, not just per biscuit.',
              caption:
                'Small serving sizes can hide high added sugar. Normalising to 100 g makes packaged comparisons fair.',
              cta: 'Compare Packaged Products →',
              to: '/compare',
              bg: 'bg-amber-50/90 border-amber-200',
            },
            {
              badge: 'Portion Awareness',
              title: 'Check serving size before comparing meals.',
              caption:
                '1 katori of cooked dal or 1 medium roti changes total carbohydrates and sodium significantly.',
              cta: 'Try Recipe & Serving Calculator →',
              to: '/recipes/calculator',
              bg: 'bg-emerald-50/90 border-emerald-200',
            },
            {
              badge: 'Fibre Discovery',
              title: 'Explore the fibre content of everyday Indian grains.',
              caption:
                'Whole millets like Ragi (11.2g fibre/100g) and Jowar (10.2g/100g) offer 3–4× the fibre of milled white rice.',
              cta: 'Browse High-Fibre Foods →',
              to: '/foods?nutrient=high_fibre',
              bg: 'bg-sky-50/90 border-sky-200',
            },
          ].map((ins) => (
            <Link
              key={ins.title}
              to={ins.to}
              className={`flex flex-col justify-between rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${ins.bg}`}
            >
              <div>
                <span className="inline-block rounded-full bg-white/90 px-3 py-0.5 text-[11px] font-bold text-stone-800 shadow-sm">
                  {ins.badge}
                </span>
                <h3 className="mt-3 text-base font-extrabold text-stone-900">{ins.title}</h3>
                <p className="mt-1.5 text-xs text-stone-700 leading-relaxed">{ins.caption}</p>
              </div>
              <span className="mt-4 text-xs font-extrabold text-emerald-900">{ins.cta}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};

// ==========================================
// PAGE 2: IMAGE-FIRST FOOD EXPLORER PAGE
// ==========================================
export const FoodExplorerPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { searchHistory, addSearchHistory } = useHousehold();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [nutrientFilter, setNutrientFilter] = useState(searchParams.get('nutrient') || '');
  const [vegetarianOnly, setVegetarianOnly] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
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
    if (nutrientFilter) nextParams.nutrient = nutrientFilter;
    setSearchParams(nextParams);
  };

  return (
    <div className="space-y-6">
      {/* Search & Visual Filter Header */}
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-stone-900">Explore Indian Foods</h1>
            <p className="text-xs text-stone-500">
              Search in English, Hindi, or Kannada (e.g., Aloo, Eerulli, Avalakki, Baale Hannu, Ragi)
            </p>
          </div>

          {/* Grid vs Compact List Switcher */}
          <div className="inline-flex rounded-xl bg-stone-100 p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewMode === 'grid' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
              }`}
            >
              ⊞ Visual Grid
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-lg px-3 py-1.5 transition ${
                viewMode === 'list' ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-600'
              }`}
            >
              ☰ Compact List
            </button>
          </div>
        </div>

        {/* Search Input + Quick Sort/Filter Controls */}
        <form onSubmit={handleSearchSubmit} className="grid gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Search food name or regional alias (e.g. Ragi, Avalakki, Paneer, Idli)..."
              aria-label="Food Search Input"
              className="w-full rounded-2xl border border-stone-300 px-4 py-2.5 text-sm focus:border-emerald-600 focus:outline-none"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              aria-label="Filter by Nutritional Characteristic"
              value={nutrientFilter}
              onChange={(e) => {
                setNutrientFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-2xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-bold text-stone-700"
            >
              <option value="">All Nutrient Highlights</option>
              <option value="high_protein">High Protein (&ge;10g/100g)</option>
              <option value="high_fibre">High Fibre (&ge;6g/100g)</option>
              <option value="high_calcium">Calcium Rich (&ge;100mg/100g)</option>
              <option value="high_iron">Iron Rich (&ge;3mg/100g)</option>
              <option value="low_sodium">Low Sodium (&le;50mg/100g)</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              aria-label="Sort Results"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full rounded-2xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-bold text-stone-700"
            >
              <option value="relevance">Sort: Best Match</option>
              <option value="name_asc">Name (A–Z)</option>
              <option value="protein_desc">Highest Protein</option>
              <option value="fibre_desc">Highest Fibre</option>
              <option value="energy_asc">Lowest Calories</option>
            </select>
          </div>
        </form>

        {/* Visual Category Pill Selector */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => {
              setCategory('');
              setPage(1);
            }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
              category === ''
                ? 'bg-emerald-800 text-white shadow-sm'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            All Categories
          </button>
          {categories.map((c) => {
            const meta = CATEGORY_VISUALS[c.slug];
            const active = category === c.slug;
            return (
              <button
                key={c.slug}
                type="button"
                onClick={() => {
                  setCategory(active ? '' : c.slug);
                  setPage(1);
                }}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${
                  active
                    ? 'bg-emerald-800 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                <span>{meta?.emojiIcon || '🍽️'}</span>
                <span>{meta?.shortTitle || c.name}</span>
              </button>
            );
          })}

          <label className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-stone-700 cursor-pointer">
            <input
              type="checkbox"
              checked={vegetarianOnly}
              onChange={(e) => {
                setVegetarianOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-stone-300 text-emerald-700"
            />
            Veg Only
          </label>
        </div>

        {/* Recent Searches */}
        {searchHistory.length > 0 && !query && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
            <span className="text-stone-400 font-medium">Quick search:</span>
            {searchHistory.slice(0, 6).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => {
                  setQuery(item);
                  setPage(1);
                }}
                className="rounded-lg bg-stone-100 px-2.5 py-0.5 text-stone-700 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Fuzzy Search Suggestions */}
      {results && results.suggestions.length > 0 && query.trim() && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-600">
          <span className="font-bold">Did you mean:</span>
          {results.suggestions.map((sug) => (
            <button
              key={sug}
              type="button"
              onClick={() => setQuery(sug.split(' (')[0])}
              className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-bold text-emerald-900 hover:bg-emerald-100"
            >
              {sug}
            </button>
          ))}
        </div>
      )}

      {/* Food Cards Grid / List */}
      {loading ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-72 animate-pulse rounded-3xl bg-stone-200/70" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-900">
          Error loading food records: {error}
        </div>
      ) : results && results.items.length > 0 ? (
        <>
          <div className="flex items-center justify-between text-xs text-stone-500 px-1">
            <span>
              Showing <strong className="text-stone-800">{results.items.length}</strong> of{' '}
              <strong className="text-stone-800">{results.total}</strong> foods
            </span>
            <span>Tap any food card for visual charts & personalised health context</span>
          </div>

          <div
            className={
              viewMode === 'grid'
                ? 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3'
                : 'space-y-3'
            }
          >
            {results.items.map((food) => (
              <FoodCard key={food.slug} food={food} viewMode={viewMode} />
            ))}
          </div>

          {results.total > results.page_size && (
            <div className="flex items-center justify-center gap-3 pt-4">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-bold disabled:opacity-40"
              >
                ← Previous
              </button>
              <span className="text-xs font-bold text-stone-700">
                Page {page} of {Math.ceil(results.total / results.page_size)}
              </span>
              <button
                type="button"
                disabled={page >= Math.ceil(results.total / results.page_size)}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-bold disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-3xl border border-stone-200 bg-white p-10 text-center space-y-3">
          <div className="text-3xl">🔍</div>
          <h3 className="text-base font-extrabold text-stone-900">No matching foods found</h3>
          <p className="text-xs text-stone-500">
            Try resetting filters or scan a packaged food nutrition label directly.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('');
                setNutrientFilter('');
                setVegetarianOnly(false);
              }}
              className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white"
            >
              Reset Filters
            </button>
            <Link
              to="/scanner"
              className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white"
            >
              📸 Scan Food Label
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// PAGE 3: REDESIGNED FOOD DETAIL PAGE (Visual & Progressive Disclosure)
// ==========================================
export const FoodDetailPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { activeMember } = useHousehold();

  const [food, setFood] = useState<FoodDetail | null>(null);
  const [relatedFoods, setRelatedFoods] = useState<FoodSummary[]>([]);
  const [conditions, setConditions] = useState<HealthConditionSummary[]>([]);
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [basisMode, setBasisMode] = useState<'serving' | '100g'>('serving');
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
        setServingQty(1);
        void api
          .searchFoods({ category: res.category.slug, page_size: 4 })
          .then((rel) => setRelatedFoods(rel.items.filter((i) => i.slug !== res.slug).slice(0, 3)))
          .catch(() => null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load food'))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!food) return;
    const unitToEval = basisMode === '100g' ? food.default_basis : servingUnit;
    const qtyToEval = basisMode === '100g' ? 1 : servingQty;
    api
      .evaluateGuidance({
        food_slug: food.slug,
        condition_codes: selectedConditions,
        serving_unit: unitToEval,
        serving_quantity: qtyToEval,
        age_group: activeMember?.age_group || 'adult',
        allergies: activeMember?.allergies || [],
        intolerances: activeMember?.intolerances || [],
        dietary_preference: activeMember?.dietary_preference,
      })
      .then(setGuidance)
      .catch(() => null);
  }, [food, selectedConditions, basisMode, servingUnit, servingQty, activeMember]);

  if (loading) {
    return <div className="h-96 animate-pulse rounded-3xl bg-stone-200/70" />;
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
  const activeGrams =
    basisMode === '100g'
      ? 100.0
      : (selectedServingObj ? selectedServingObj.grams_equivalent : food.standard_serving_grams) *
        servingQty;
  const scaleFactor = activeGrams / 100.0;

  const getScaled = (code: string) => {
    const n = food.nutrients.find((item) => item.nutrient_code === code);
    if (!n || n.value_per_100 === null) return null;
    return Number((n.value_per_100 * scaleFactor).toFixed(1));
  };

  const toggleCondition = (code: string) => {
    setSelectedConditions((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const vitaminsAndMinerals = food.nutrients.filter(
    (n) => n.category === 'mineral' || n.category === 'vitamin'
  );

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-xs text-stone-500 flex items-center gap-2">
        <Link to="/foods" className="hover:underline text-emerald-800 font-bold">
          Food Explorer
        </Link>
        <span>/</span>
        <Link
          to={`/foods?category=${food.category.slug}`}
          className="hover:underline text-emerald-800 font-bold"
        >
          {food.category.name}
        </Link>
        <span>/</span>
        <span className="text-stone-800 font-semibold">{food.name_en}</span>
      </nav>

      {/* LEVEL 1: FIRST VISIBLE SECTION — Large Food Photo + Highlights + Basis Switch */}
      <section className="overflow-hidden rounded-[2rem] border border-stone-200/90 bg-white shadow-sm">
        <div className="grid lg:grid-cols-12">
          {/* Large Food Photograph */}
          <div className="lg:col-span-5 relative">
            <FoodImage
              src={food.image_url}
              foodName={food.name_en}
              categorySlug={food.category.slug}
              aspectClass="h-64 sm:h-80 lg:h-full w-full"
              showBadge
            />
            <div className="absolute top-4 left-4 flex flex-wrap gap-2">
              <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-extrabold text-stone-900 shadow-sm backdrop-blur">
                {food.category.name}
              </span>
              <span className="rounded-full bg-white/95 px-3 py-1 text-xs font-bold text-stone-800 shadow-sm backdrop-blur flex items-center gap-1.5">
                <span
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    food.is_vegetarian ? 'bg-emerald-600' : 'bg-rose-600'
                  }`}
                />
                {food.is_vegetarian ? 'Vegetarian' : 'Non-Vegetarian'}
              </span>
            </div>
          </div>

          {/* Right: Food Identity, Serving Switch & 5 Key Nutrient Cards */}
          <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ConfidenceBadge status={food.confidence_level} />
                <a
                  href={food.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-emerald-800 hover:underline"
                >
                  Source: {food.source.name} ({food.source.publication_year}) ↗
                </a>
              </div>

              <h1 className="mt-2.5 text-2xl sm:text-3xl font-black text-stone-900">
                {food.name_en}
              </h1>
              <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">
                {food.description}
              </p>

              {/* Interactive Switch: Selected Serving vs Per 100g */}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-50 p-3 border border-stone-200/80">
                <div className="inline-flex rounded-xl bg-stone-200/80 p-1 text-xs font-extrabold">
                  <button
                    type="button"
                    onClick={() => setBasisMode('serving')}
                    className={`rounded-lg px-3.5 py-1.5 transition ${
                      basisMode === 'serving'
                        ? 'bg-emerald-800 text-white shadow-sm'
                        : 'text-stone-700 hover:text-stone-900'
                    }`}
                  >
                    Selected Serving ({activeGrams.toFixed(0)}g)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBasisMode('100g')}
                    className={`rounded-lg px-3.5 py-1.5 transition ${
                      basisMode === '100g'
                        ? 'bg-emerald-800 text-white shadow-sm'
                        : 'text-stone-700 hover:text-stone-900'
                    }`}
                  >
                    Per {food.default_basis}
                  </button>
                </div>

                {basisMode === 'serving' && (
                  <div className="flex items-center gap-2 text-xs">
                    <select
                      aria-label="Serving Unit Selector"
                      value={servingUnit}
                      onChange={(e) => setServingUnit(e.target.value)}
                      className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 font-bold text-stone-800"
                    >
                      {food.servings.map((srv) => (
                        <option key={srv.unit_name} value={srv.unit_name}>
                          {srv.unit_label} ({srv.grams_equivalent}g)
                        </option>
                      ))}
                    </select>
                    <div className="inline-flex items-center rounded-xl border border-stone-300 bg-white">
                      <button
                        type="button"
                        onClick={() => setServingQty((q) => Math.max(0.5, q - 0.5))}
                        className="px-2.5 py-1 font-bold text-stone-700 hover:bg-stone-100"
                      >
                        −
                      </button>
                      <span className="px-2 font-extrabold">{servingQty}×</span>
                      <button
                        type="button"
                        onClick={() => setServingQty((q) => q + 0.5)}
                        className="px-2.5 py-1 font-bold text-stone-700 hover:bg-stone-100"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* 5 Visual Nutrient Cards */}
              <div className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                {[
                  { label: 'Calories', val: getScaled('energy_kcal'), unit: 'kcal', bg: 'bg-stone-100 text-stone-900' },
                  { label: 'Protein', val: getScaled('protein_g'), unit: 'g', bg: 'bg-emerald-50 text-emerald-950' },
                  { label: 'Carbs', val: getScaled('carbs_g'), unit: 'g', bg: 'bg-amber-50 text-amber-950' },
                  { label: 'Total Fat', val: getScaled('fat_total_g'), unit: 'g', bg: 'bg-orange-50 text-orange-950' },
                  { label: 'Fibre', val: getScaled('fibre_g'), unit: 'g', bg: 'bg-teal-50 text-teal-950' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`rounded-2xl p-3 text-center ${stat.bg}`}
                  >
                    <div className="text-[11px] font-bold opacity-75">{stat.label}</div>
                    <div className="mt-1 text-lg font-black">
                      {stat.val !== null ? `${stat.val} ${stat.unit}` : 'NULL'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-4 text-xs text-stone-500">
              <span>Standard Serving: <strong>{food.standard_serving_name}</strong></span>
              <span>Data Completeness: <strong>{food.completeness_pct}% ({food.available_nutrient_count}/20 nutrients)</strong></span>
            </div>
          </div>
        </div>
      </section>

      {/* LEVEL 2: VISUAL NUTRITION CHART & PERSONALISED CONDITION GUIDANCE */}
      <section className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <MacroDistributionBarChart
            energyKcal={getScaled('energy_kcal')}
            proteinG={getScaled('protein_g')}
            carbsG={getScaled('carbs_g')}
            fatG={getScaled('fat_total_g')}
            fibreG={getScaled('fibre_g')}
            basisLabel={
              basisMode === '100g'
                ? `Per ${food.default_basis}`
                : `Selected Serving (${activeGrams.toFixed(0)}g)`
            }
          />
        </div>

        {/* Personalised Condition-Aware Food Guidance */}
        <div className="lg:col-span-7 rounded-3xl border border-stone-200/90 bg-white p-6 shadow-sm space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-black text-stone-900">
                Food and Health Considerations
              </h2>
              <p className="text-xs text-stone-500">
                {activeMember
                  ? `Personalised for ${activeMember.display_name} (${activeMember.age_group.replace('_', ' ')})`
                  : 'Select one or more health considerations below'}
              </p>
            </div>
            <Link
              to="/household"
              className="rounded-xl bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-200"
            >
              Switch Member
            </Link>
          </div>

          {/* Interactive Condition Chips */}
          <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
            {conditions.map((c) => {
              const active = selectedConditions.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCondition(c.code)}
                  className={`rounded-full border px-3 py-1 text-xs font-bold transition ${
                    active
                      ? 'border-emerald-800 bg-emerald-800 text-white shadow-sm'
                      : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>

          {guidance && (
            <div className="space-y-3 pt-2">
              {(guidance.allergen_alerts.length > 0 ||
                guidance.intolerance_alerts.length > 0 ||
                guidance.dietary_preference_alerts.length > 0) && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-950 space-y-1">
                  <div className="font-extrabold">Allergy & Preference Alerts</div>
                  {guidance.allergen_alerts.map((al, idx) => (
                    <p key={idx}>• {al}</p>
                  ))}
                  {guidance.intolerance_alerts.map((il, idx) => (
                    <p key={idx}>• {il}</p>
                  ))}
                  {guidance.dietary_preference_alerts.map((dl, idx) => (
                    <p key={idx}>• {dl}</p>
                  ))}
                </div>
              )}

              {guidance.multi_condition_conflicts.length > 0 && (
                <div className="rounded-2xl border border-purple-300 bg-purple-50 p-4 text-xs text-purple-950 space-y-1.5">
                  <div className="font-extrabold text-purple-900">
                    🩺 Competing Multi-Condition Needs Detected
                  </div>
                  {guidance.multi_condition_conflicts.map((conf) => (
                    <div key={conf.conflict_code}>
                      <strong>{conf.competing_domain}:</strong> {conf.conflict_explanation}{' '}
                      <span className="font-semibold">({conf.professional_guidance_notice})</span>
                    </div>
                  ))}
                </div>
              )}

              {selectedConditions.length === 0 ? (
                <div className="rounded-2xl bg-stone-50 p-5 text-center text-xs text-stone-500">
                  Tap any health condition pill above to see how <strong>{food.name_en}</strong> fits your profile.
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  {guidance.observations.map((obs) => (
                    <ObservationCard
                      key={`${obs.rule_code}-${obs.condition_code}`}
                      obs={obs}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* LEVEL 3 & 4: EXPANDABLE PROGRESSIVE DISCLOSURE SECTIONS */}
      <section className="space-y-3">
        <ExpandableSection
          title="Vitamins & Minerals Spotlight"
          subtitle="Calcium, Iron, Potassium, Folate, Vitamin C, Vitamin D & Vitamin B12"
          badge={`${vitaminsAndMinerals.filter((v) => v.is_available).length} measured`}
        >
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {vitaminsAndMinerals.map((vm) => {
              const val =
                vm.value_per_100 !== null
                  ? (vm.value_per_100 * scaleFactor).toFixed(1)
                  : null;
              return (
                <div
                  key={vm.nutrient_code}
                  className="rounded-2xl border border-stone-200/80 bg-stone-50 p-3 text-xs"
                >
                  <div className="text-stone-500 font-medium">{vm.nutrient_name}</div>
                  <div className="mt-1 text-base font-extrabold text-stone-900">
                    {val !== null ? `${val} ${vm.unit}` : 'NULL (Not Measured)'}
                  </div>
                </div>
              );
            })}
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="Complete Nutritional Composition Table (All 20 Tracked Nutrients)"
          subtitle="Per 100g/100ml and evaluated serving — missing values are preserved as NULL"
          badge={`${food.completeness_pct}% complete`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-500 uppercase">
                  <th className="py-2 pr-3">Nutrient</th>
                  <th className="py-2 px-3">Per {food.default_basis}</th>
                  <th className="py-2 px-3">Selected Serving ({activeGrams.toFixed(0)}g)</th>
                  <th className="py-2 pl-3">Data Provenance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {food.nutrients.map((n) => {
                  const scaledVal =
                    n.value_per_100 !== null
                      ? (n.value_per_100 * scaleFactor).toFixed(2)
                      : null;
                  return (
                    <tr
                      key={n.nutrient_code}
                      className={n.is_available ? '' : 'bg-stone-50/70 text-stone-400'}
                    >
                      <td className="py-2 pr-3 font-bold text-stone-800">
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
        </ExpandableSection>

        <ExpandableSection
          title="Regional Names (English, Hindi & Kannada)"
          subtitle="Searchable local household names and scripts"
          badge={`${food.aliases.length} aliases`}
        >
          <div className="flex flex-wrap gap-2">
            {food.aliases.map((al, i) => (
              <span
                key={`${al.language}-${i}`}
                className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-800"
              >
                <strong className="uppercase text-emerald-800">{al.language}:</strong>{' '}
                {al.alias_text}
                {al.script_text && al.script_text !== al.alias_text
                  ? ` (${al.script_text})`
                  : ''}
              </span>
            ))}
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="Allergens, Intolerances & Ingredients"
          subtitle="Data-based allergen indications (distinct from digestive intolerances)"
        >
          <div className="space-y-2 text-xs text-stone-700">
            <div>
              <strong>Declared Allergen Indications: </strong>
              {food.allergen_tags.length > 0 ? food.allergen_tags.join(', ') : 'None listed'}
            </div>
            <div>
              <strong>Digestive Intolerance Markers: </strong>
              {food.intolerance_tags.length > 0 ? food.intolerance_tags.join(', ') : 'None listed'}
            </div>
            {food.ingredients_text && (
              <div>
                <strong>Declared Ingredients: </strong>
                {food.ingredients_text}
              </div>
            )}
            <p className="text-amber-900 font-medium">{food.allergen_safety_disclaimer}</p>
          </div>
        </ExpandableSection>

        <ExpandableSection
          title="Data Source, IFCT Code & Household Measure Conversions"
          subtitle={`${food.source.document_title} (${food.source.publication_year})`}
        >
          <div className="space-y-2 text-xs text-stone-700">
            <p>
              <strong>Primary Source:</strong>{' '}
              <a
                href={food.source.url}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-emerald-800 underline"
              >
                {food.source.name} — {food.source.organization} ({food.source.publication_year}) ↗
              </a>
            </p>
            {food.ifct_code && (
              <p>
                <strong>ICMR-NIN IFCT Food Code:</strong> {food.ifct_code}
              </p>
            )}
            <p>
              <strong>Serving Conversion Methodology:</strong> {food.conversion_methodology}
            </p>
          </div>
        </ExpandableSection>
      </section>

      {/* Related Foods Photo Strip */}
      {relatedFoods.length > 0 && (
        <section className="space-y-4 pt-2">
          <h2 className="text-lg font-black text-stone-900">
            More in {food.category.name}
          </h2>
          <div className="grid gap-5 sm:grid-cols-3">
            {relatedFoods.map((rf) => (
              <FoodCard key={rf.slug} food={rf} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};
