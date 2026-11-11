import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { OpenStreetMapView } from '../components/OpenStreetMapView';
import {
  openAssistantWorkspace,
  publishAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';

const POPULAR_DISH_CHIPS = [
  'Masala Dosa',
  'Idli Sambar',
  'Ragi Mudde',
  'Palak Paneer',
  'Khichdi',
  'Chapati & Dal',
  'Chole',
  'Chicken Biryani',
];

const LOCATION_PRESET_CHIPS = [
  'Mysuru',
  'Vijayanagar, Mysuru',
  'Kuvempunagar, Mysuru',
  'Saraswathipuram, Mysuru',
  'Gokulam, Mysuru',
  'Bengaluru',
  'Indiranagar, Bengaluru',
];

const RADIUS_OPTIONS = [2, 5, 10, 15];

const CITY_PRESETS = ['Mysuru', 'Bengaluru', 'Chennai', 'Mumbai', 'New Delhi', 'Hyderabad'];

export const FoodNearbyPage: React.FC = () => {
  const { activeMember } = useHousehold();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialDish = searchParams.get('dish') || 'Masala Dosa';
  const initialCity = searchParams.get('city') || 'Mysuru';
  const initialLocationQuery = searchParams.get('loc') || initialCity;

  const [dishQuery, setDishQuery] = useState(initialDish);
  const [locationQuery, setLocationQuery] = useState(initialLocationQuery);
  const [city, setCity] = useState(initialCity);
  const [area, setArea] = useState('');
  const [pincode] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(5);
  const [dietaryFilter, setDietaryFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<string>('relevance');
  const [includeOsmPois, setIncludeOsmPois] = useState<boolean>(false);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [geoStatusMessage, setGeoStatusMessage] = useState<string | null>(null);

  // Simplified UI state: manual location toggle, expandable Filters, expandable Nutrition Details
  const [showManualLocationInput, setShowManualLocationInput] = useState<boolean>(false);
  const [filtersExpanded, setFiltersExpanded] = useState<boolean>(false);
  const [nutritionDetailsExpanded, setNutritionDetailsExpanded] = useState<boolean>(false);
  const [expandedCardActionsId, setExpandedCardActionsId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discoveryResult, setDiscoveryResult] = useState<Record<string, any> | null>(null);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);

  const cardRefs = useRef<Record<string, HTMLElement | null>>({});

  // Swiggy Builders Club MCP Action Confirmation Modal State
  const [mcpModalOpen, setMcpModalOpen] = useState(false);
  const [mcpPreview, setMcpPreview] = useState<Record<string, any> | null>(null);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpQuantity] = useState(1);
  const [mcpPartySize, setMcpPartySize] = useState(2);
  const [mcpPreferredTime, setMcpPreferredTime] = useState('7:30 PM');

  // Restaurant-to-Food Diary Confirmation State
  const [diaryModalRest, setDiaryModalRest] = useState<Record<string, any> | null>(null);
  const [diaryMealCategory, setDiaryMealCategory] = useState('lunch');
  const [diaryQuantity, setDiaryQuantity] = useState(1);
  const [diaryConfirmedMsg, setDiaryConfirmedMsg] = useState<string | null>(null);

  const executeSearch = async (
    overrideParams?: Partial<{
      dish: string;
      locQuery: string;
      cityVal: string;
      areaVal: string;
      radiusVal: number;
      dietVal: string;
      sortVal: string;
      osmPoisVal: boolean;
      lat: number | null;
      lon: number | null;
      locSource: string;
    }>
  ) => {
    setLoading(true);
    setError(null);
    const d = overrideParams?.dish !== undefined ? overrideParams.dish : dishQuery;
    const lq = overrideParams?.locQuery !== undefined ? overrideParams.locQuery : locationQuery;
    const c = overrideParams?.cityVal !== undefined ? overrideParams.cityVal : city;
    const a = overrideParams?.areaVal !== undefined ? overrideParams.areaVal : area;
    const r = overrideParams?.radiusVal !== undefined ? overrideParams.radiusVal : radiusKm;
    const df =
      overrideParams?.dietVal !== undefined
        ? overrideParams.dietVal
        : dietaryFilter || activeMember?.dietary_preference || 'vegetarian';
    const sb = overrideParams?.sortVal !== undefined ? overrideParams.sortVal : sortBy;
    const osmPois =
      overrideParams?.osmPoisVal !== undefined ? overrideParams.osmPoisVal : includeOsmPois;
    const lat = overrideParams?.lat !== undefined ? overrideParams.lat : coords?.latitude;
    const lon = overrideParams?.lon !== undefined ? overrideParams.lon : coords?.longitude;

    try {
      const res = await api.searchFoodNearby({
        member_id: activeMember?.id,
        dish_query: d,
        location_query: lq || undefined,
        city: c,
        area: a || undefined,
        pincode: pincode || undefined,
        radius_km: r,
        dietary_filter: df,
        sort_by: sb,
        include_osm_pois: osmPois,
        latitude: lat,
        longitude: lon,
        location_source: overrideParams?.locSource,
      });
      setDiscoveryResult(res);
      if (res.restaurants?.length > 0) {
        setSelectedRestaurantId(res.restaurants[0].id);
      } else {
        setSelectedRestaurantId(null);
      }
      publishAssistantContext({
        route: location.pathname,
        page_type: 'food_discovery',
        selected_entity: {
          type: 'food_discovery',
          id: res.matched_gharplate_dish?.food_slug || d,
          name: `${d} near ${res.location_context?.display_name || res.location_context?.city || c}`,
          summary: `Found ${res.total_results} nearby restaurants within ${r} km.`,
        },
        food_discovery_context: res,
      });
    } catch (err: any) {
      setError(err?.message || 'Could not search nearby restaurants.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const qDish = searchParams.get('dish');
    if (qDish && qDish !== dishQuery) {
      setDishQuery(qDish);
      void executeSearch({ dish: qDish });
    } else {
      void executeSearch();
    }
  }, [activeMember?.id]);

  // Browser Geolocation with Graceful Manual Fallback
  const handleUseBrowserGeolocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setShowManualLocationInput(true);
      setGeoStatusMessage(
        'Browser geolocation is unavailable on this device. Please enter a location manually.'
      );
      return;
    }
    setGeoStatusMessage('Detecting your current location...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(5));
        const lon = Number(pos.coords.longitude.toFixed(5));
        setCoords({ latitude: lat, longitude: lon });
        setGeoStatusMessage(
          `Current Location Detected (${lat}, ${lon}). Searching nearby restaurants...`
        );
        void executeSearch({ lat, lon, locSource: 'browser_geolocation' });
      },
      () => {
        setCoords(null);
        setShowManualLocationInput(true);
        setGeoStatusMessage(
          'Location permission was declined or unavailable. You can enter a location manually below.'
        );
      },
      { timeout: 6000 }
    );
  };

  const handleSelectLocationPreset = (preset: string) => {
    setCoords(null);
    setLocationQuery(preset);
    const parts = preset.split(',').map((s) => s.trim());
    const nextCity = parts.length > 1 ? parts[parts.length - 1] : parts[0];
    const nextArea = parts.length > 1 ? parts[0] : '';
    setCity(nextCity);
    setArea(nextArea);
    setGeoStatusMessage(`Searching OpenStreetMap around ${preset}...`);
    void executeSearch({
      locQuery: preset,
      cityVal: nextCity,
      areaVal: nextArea,
      lat: null,
      lon: null,
    });
  };

  const handleSelectRestaurantFromMap = (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
    const cardEl = cardRefs.current[restaurantId];
    if (cardEl && typeof cardEl.scrollIntoView === 'function') {
      try {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch {
        // ignore in jsdom
      }
    }
  };

  const handleOpenSwiggyMcpPreview = async (
    rest: Record<string, any>,
    actionType: 'prepare_cart' | 'book_table',
    userConfirmed = false
  ) => {
    setMcpLoading(true);
    setMcpModalOpen(true);
    try {
      const res = await api.prepareSwiggyMcpPreview({
        member_id: activeMember?.id,
        action_type: actionType,
        restaurant_name: rest.name,
        dish_name: rest.matched_dish?.dish_name || dishQuery,
        city: rest.city,
        quantity: mcpQuantity,
        estimated_price_inr: rest.matched_dish?.estimated_price_inr || 140,
        party_size: mcpPartySize,
        preferred_time: mcpPreferredTime,
        user_confirmed: userConfirmed,
      });
      setMcpPreview({ ...res, restaurant_obj: rest });
    } catch {
      // ignore
    } finally {
      setMcpLoading(false);
    }
  };

  const handleConfirmLogRestaurantMeal = async () => {
    if (!diaryModalRest) return;
    try {
      const res = await api.logRestaurantMealToDiary({
        member_id: activeMember?.id,
        user_confirmed: true,
        food_slug: diaryModalRest.matched_dish?.food_slug,
        dish_name: diaryModalRest.matched_dish?.dish_name || dishQuery,
        restaurant_name: diaryModalRest.name,
        quantity: diaryQuantity,
        unit_name: 'standard_serving',
        meal_category: diaryMealCategory,
      });
      if (res.logged) {
        setDiaryConfirmedMsg(
          `Logged ${diaryQuantity}× ${diaryModalRest.matched_dish?.dish_name || dishQuery} from ${diaryModalRest.name} to your ${diaryMealCategory} Food Diary.`
        );
        setDiaryModalRest(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to log meal to diary.');
    }
  };

  const matchedDish = discoveryResult?.matched_gharplate_dish;
  const goalIntel = discoveryResult?.menu_to_goal_intelligence;
  const restaurants: Record<string, any>[] = discoveryResult?.restaurants || [];
  const selectedRestaurant =
    restaurants.find((r) => r.id === selectedRestaurantId) || restaurants[0] || null;

  const centerLat = Number(
    discoveryResult?.location_context?.latitude ?? coords?.latitude ?? 12.2958
  );
  const centerLon = Number(
    discoveryResult?.location_context?.longitude ?? coords?.longitude ?? 76.6394
  );
  const locationDisplayLabel =
    discoveryResult?.location_context?.display_name ||
    discoveryResult?.location_context?.city ||
    locationQuery ||
    city;

  return (
    <div className="space-y-6 animate-gp-reveal" data-testid="food-nearby-page">
      {/* ================================================================= */}
      {/* 1. CLEAN, SIMPLIFIED SEARCH & CURRENT-LOCATION HEADER             */}
      {/* ================================================================= */}
      <section className="gp-hero-surface rounded-3xl p-6 sm:p-7 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172b23]">
              What would you like to eat today?
            </h1>
            <p className="text-xs sm:text-sm text-[#566960] mt-0.5">
              Search a dish and use your current location to find nearby places on OpenStreetMap.
            </p>
          </div>

          <button
            type="button"
            data-testid="food-nearby-ask-assistant-btn"
            onClick={() =>
              openAssistantWorkspace({
                initialPrompt: `Where can I get ${dishQuery} near ${locationQuery || city} within ${radiusKm} km that fits my dietary preferences and goals?`,
              })
            }
            className="gp-sidebar-ai-btn rounded-xl px-3.5 py-2 text-xs font-extrabold text-white shadow-sm shrink-0 self-start"
          >
            🤖 Ask GharPlate AI
          </button>
        </div>

        {/* Primary Search Bar: One Food Input + Use My Current Location + Find Nearby */}
        <div className="rounded-2xl border border-emerald-900/15 bg-white/95 p-4 space-y-3 shadow-xs">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
            {/* 1. Single Food Search Input */}
            <div className="flex-1">
              <label htmlFor="food-nearby-dish-input" className="sr-only">
                What would you like to eat today?
              </label>
              <input
                id="food-nearby-dish-input"
                type="text"
                data-testid="food-nearby-dish-input"
                value={dishQuery}
                onChange={(e) => setDishQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setSearchParams({ dish: dishQuery, city, loc: locationQuery });
                    void executeSearch();
                  }
                }}
                placeholder="Search dish (e.g., Masala Dosa, Idli Sambar, Ragi Mudde, Palak Paneer)"
                className="w-full rounded-xl border border-emerald-900/20 bg-white px-4 py-2.5 text-sm font-extrabold text-[#172b23] placeholder:font-medium placeholder:text-[#566960]"
              />
            </div>

            {/* 2. Prominent Current Location Control */}
            <button
              type="button"
              data-testid="use-my-location-btn"
              onClick={handleUseBrowserGeolocation}
              className={`rounded-xl px-4 py-2.5 text-xs font-extrabold transition shrink-0 flex items-center justify-center gap-1.5 ${
                coords
                  ? 'bg-emerald-100 text-[#064d3c] border border-emerald-400'
                  : 'border border-emerald-800/25 bg-[#f7fbf7] text-[#087153] hover:bg-emerald-50'
              }`}
            >
              <span>📍</span>
              <span>{coords ? 'Current Location Detected' : 'Use My Current Location'}</span>
            </button>

            {/* 3. Primary Action: Find Nearby */}
            <button
              type="button"
              data-testid="food-nearby-search-btn"
              disabled={loading}
              onClick={() => {
                setSearchParams({ dish: dishQuery, city, loc: locationQuery });
                void executeSearch();
              }}
              className="rounded-xl bg-[#087153] px-5 py-2.5 text-xs font-extrabold text-white shadow-xs hover:bg-[#064d3c] disabled:opacity-50 transition shrink-0"
            >
              {loading ? 'Searching...' : 'Find Nearby'}
            </button>
          </div>

          {/* Secondary Status Row: Current Location Status, Manual Location Toggle, and Filters Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {coords ? (
                <span
                  data-testid="current-location-detected-badge"
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-[#064d3c]"
                >
                  ✓ Current Location Detected ({coords.latitude.toFixed(4)},{' '}
                  {coords.longitude.toFixed(4)})
                </span>
              ) : (
                <span className="text-[11px] font-semibold text-[#566960]">
                  Near: <strong className="text-[#172b23]">{locationDisplayLabel}</strong>
                </span>
              )}

              <button
                type="button"
                data-testid="toggle-manual-location-btn"
                onClick={() => setShowManualLocationInput((prev) => !prev)}
                className="text-[11px] font-bold text-[#087153] hover:underline"
              >
                {showManualLocationInput ? 'Hide manual location' : 'Enter location manually'}
              </button>
            </div>

            <button
              type="button"
              data-testid="food-nearby-filters-toggle"
              aria-expanded={filtersExpanded}
              onClick={() => setFiltersExpanded((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-[#f7fbf7] px-3 py-1.5 text-xs font-extrabold text-[#172b23] hover:bg-emerald-50 transition"
            >
              <span>⚙️ Filters</span>
              <span className="text-[10px] text-[#566960]">
                ({dietaryFilter || activeMember?.dietary_preference || 'Vegetarian'} • {radiusKm} km)
              </span>
              <span>{filtersExpanded ? '▴' : '▾'}</span>
            </button>
          </div>

          {/* Small Secondary Manual Location Input (when toggled open) */}
          {showManualLocationInput && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-emerald-900/10">
              <input
                type="text"
                data-testid="food-nearby-location-input"
                value={locationQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setLocationQuery(val);
                  const parts = val.split(',').map((s) => s.trim());
                  if (parts.length > 1) {
                    setArea(parts[0]);
                    setCity(parts[parts.length - 1]);
                  } else if (val.trim()) {
                    setCity(val.trim());
                  }
                }}
                placeholder="Enter city, area, or neighbourhood (e.g., Vijayanagar, Mysuru)"
                className="flex-1 rounded-xl border border-emerald-900/20 bg-white px-3.5 py-2 text-xs font-bold text-[#172b23]"
              />
              <button
                type="button"
                onClick={() => {
                  setCoords(null);
                  setSearchParams({ dish: dishQuery, city, loc: locationQuery });
                  void executeSearch({
                    locQuery: locationQuery,
                    cityVal: city,
                    areaVal: area,
                    lat: null,
                    lon: null,
                  });
                }}
                className="rounded-xl border border-emerald-800/25 bg-[#e8f2e9] px-3.5 py-2 text-xs font-extrabold text-[#064d3c] hover:bg-emerald-100 shrink-0"
              >
                Use Manual Location
              </button>
            </div>
          )}

          {/* =============================================================== */}
          {/* 2. COMPACT EXPANDABLE FILTERS SECTION                           */}
          {/* =============================================================== */}
          {filtersExpanded && (
            <div
              data-testid="food-nearby-filters-panel"
              className="rounded-2xl border border-emerald-900/12 bg-[#f7fbf7] p-4 space-y-3 mt-2"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Dietary Preference */}
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Dietary Preference
                  </label>
                  <select
                    aria-label="Dietary Filter"
                    data-testid="food-nearby-dietary-select"
                    value={dietaryFilter}
                    onChange={(e) => {
                      setDietaryFilter(e.target.value);
                      void executeSearch({ dietVal: e.target.value });
                    }}
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-2 text-xs font-bold text-[#172b23]"
                  >
                    <option value="">
                      Household Default ({activeMember?.dietary_preference || 'Vegetarian'})
                    </option>
                    <option value="pure_vegetarian">Pure Vegetarian Only</option>
                    <option value="vegetarian">Vegetarian</option>
                    <option value="vegan">Vegan</option>
                    <option value="non_vegetarian">Non-Vegetarian</option>
                  </select>
                </div>

                {/* Search Radius */}
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Search Radius
                  </label>
                  <select
                    aria-label="Search Radius"
                    data-testid="food-nearby-radius-select"
                    value={radiusKm}
                    onChange={(e) => {
                      const nextR = Number(e.target.value);
                      setRadiusKm(nextR);
                      void executeSearch({ radiusVal: nextR });
                    }}
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-2 text-xs font-bold text-[#172b23]"
                  >
                    {RADIUS_OPTIONS.map((km) => (
                      <option key={km} value={km}>
                        {km} km
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sorting */}
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Sort Results By
                  </label>
                  <select
                    aria-label="Sort Restaurants By"
                    data-testid="food-nearby-sort-select"
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value);
                      void executeSearch({ sortVal: e.target.value });
                    }}
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-2 text-xs font-bold text-[#172b23]"
                  >
                    <option value="relevance">Best Dish &amp; Goal Fit</option>
                    <option value="distance">Nearest Distance</option>
                    <option value="rating">Highest Rating</option>
                    <option value="price_low_to_high">Budget Friendly</option>
                  </select>
                </div>

                {/* City Preset */}
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    City Preset
                  </label>
                  <select
                    aria-label="City"
                    data-testid="food-nearby-city-select"
                    value={city}
                    onChange={(e) => {
                      const nextCity = e.target.value;
                      setCity(nextCity);
                      setLocationQuery(nextCity);
                      setArea('');
                      setCoords(null);
                      void executeSearch({
                        locQuery: nextCity,
                        cityVal: nextCity,
                        areaVal: '',
                        lat: null,
                        lon: null,
                      });
                    }}
                    className="w-full rounded-xl border border-emerald-900/15 bg-white px-2.5 py-2 text-xs font-bold text-[#172b23]"
                  >
                    {CITY_PRESETS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Popular Dish Chips & Quick Locations inside Filters */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-bold text-[#566960]">Popular Dishes:</span>
                {POPULAR_DISH_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    data-testid={`dish-chip-${chip.toLowerCase().replace(/\s+/g, '-')}`}
                    onClick={() => {
                      setDishQuery(chip);
                      setSearchParams({ dish: chip, city, loc: locationQuery });
                      void executeSearch({ dish: chip });
                    }}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                      dishQuery.toLowerCase() === chip.toLowerCase()
                        ? 'bg-[#087153] text-white'
                        : 'bg-white text-[#064d3c] border border-emerald-900/15 hover:bg-emerald-50'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-emerald-900/10">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#566960]">Quick Areas:</span>
                  {LOCATION_PRESET_CHIPS.map((locPreset) => (
                    <button
                      key={locPreset}
                      type="button"
                      data-testid={`location-chip-${locPreset.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                      onClick={() => handleSelectLocationPreset(locPreset)}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition ${
                        locationQuery.toLowerCase() === locPreset.toLowerCase()
                          ? 'bg-[#064E3B] text-white'
                          : 'bg-white text-[#172b23] border border-stone-200 hover:bg-emerald-50'
                      }`}
                    >
                      📍 {locPreset}
                    </button>
                  ))}
                </div>

                <label className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-900/15 bg-white px-2.5 py-1 text-[11px] font-bold text-[#172b23] cursor-pointer">
                  <input
                    type="checkbox"
                    data-testid="include-osm-pois-checkbox"
                    checked={includeOsmPois}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setIncludeOsmPois(checked);
                      void executeSearch({ osmPoisVal: checked });
                    }}
                  />
                  <span>+ Include Live OpenStreetMap POIs</span>
                </label>
              </div>

              {/* Household Allergy & Dietary Notice inside Filters */}
              <div
                data-testid="allergy-cross-contact-banner"
                className="rounded-xl border border-amber-300 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-950 flex flex-wrap items-center justify-between gap-2"
              >
                <span>
                  <strong>Allergies &amp; Safety:</strong>{' '}
                  {discoveryResult?.member_context?.allergy_cross_contact_warning ||
                    'Confirm ingredients and cross-contact precautions directly with the restaurant.'}
                </span>
                {discoveryResult?.member_context?.overlapping_dish_allergens?.length > 0 && (
                  <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-black text-white">
                    Allergen Overlap:{' '}
                    {discoveryResult?.member_context?.overlapping_dish_allergens?.join(', ')}
                  </span>
                )}
              </div>
            </div>
          )}

          {geoStatusMessage && (
            <div
              data-testid="geo-status-message"
              className="text-[11px] font-semibold text-[#087153]"
            >
              {geoStatusMessage}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900"
            >
              {error}
            </div>
          )}
        </div>
      </section>

      {diaryConfirmedMsg && (
        <div
          role="status"
          data-testid="restaurant-diary-log-success"
          className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-extrabold text-emerald-950 flex items-center justify-between"
        >
          <span>✅ {diaryConfirmedMsg}</span>
          <Link to="/fitness/tracker" className="underline text-[#087153]">
            Open Daily Tracker →
          </Link>
        </div>
      )}

      {/* ================================================================= */}
      {/* 4. SIMPLIFIED SELECTED FOOD NUTRITION SUMMARY CARD                */}
      {/* ================================================================= */}
      {matchedDish && (
        <section
          data-testid="matched-dish-nutrition-card"
          className="gp-surface rounded-3xl p-4 sm:p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold text-[#172b23]">
                  {matchedDish.food_name}
                </h2>
                <span className="text-xs font-semibold text-[#566960]">
                  • Serving: {matchedDish.standard_serving_name} (
                  {matchedDish.standard_serving_grams}g)
                </span>
              </div>

              {/* Essential Nutrients Only: Calories, Protein, and 1–2 Relevant Nutrients */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-[#172b23]">
                {matchedDish.nutrients_per_serving?.energy_kcal != null && (
                  <span className="rounded-lg bg-white border border-emerald-900/10 px-2.5 py-1">
                    Calories: {matchedDish.nutrients_per_serving.energy_kcal} kcal
                  </span>
                )}
                {matchedDish.nutrients_per_serving?.protein_g != null && (
                  <span className="rounded-lg bg-white border border-emerald-900/10 px-2.5 py-1 text-[#087153]">
                    Protein: {matchedDish.nutrients_per_serving.protein_g} g
                  </span>
                )}
                {matchedDish.nutrients_per_serving?.carbs_g != null && (
                  <span className="rounded-lg bg-white border border-emerald-900/10 px-2.5 py-1">
                    Carbs: {matchedDish.nutrients_per_serving.carbs_g} g
                  </span>
                )}
                {matchedDish.nutrients_per_serving?.fibre_g != null && (
                  <span className="rounded-lg bg-white border border-emerald-900/10 px-2.5 py-1">
                    Fibre: {matchedDish.nutrients_per_serving.fibre_g} g
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                data-testid="toggle-nutrition-details-btn"
                onClick={() => setNutritionDetailsExpanded((prev) => !prev)}
                className="rounded-xl border border-emerald-900/15 bg-[#f7fbf7] px-3 py-1.5 text-xs font-bold text-[#087153] hover:bg-emerald-50 transition"
              >
                {nutritionDetailsExpanded ? 'Hide nutrition details' : 'View nutrition details'}
              </button>
              {matchedDish.food_slug && (
                <Link
                  to={`/foods/${matchedDish.food_slug}`}
                  className="text-xs font-extrabold text-[#087153] hover:underline"
                >
                  Full Profile →
                </Link>
              )}
            </div>
          </div>

          {nutritionDetailsExpanded && (
            <div
              data-testid="matched-dish-nutrition-details"
              className="rounded-2xl border border-emerald-900/12 bg-[#f7fbf7] p-3.5 space-y-1.5 text-xs"
            >
              <div className="font-extrabold text-[#087153]">
                Nutrition &amp; Ordering Guidance ({goalIntel?.active_goal || 'Balanced'}) • Source:{' '}
                {matchedDish.source_name || 'ICMR-NIN IFCT 2017'}
              </div>
              {(goalIntel?.goal_fit_highlights || []).map((h: string, i: number) => (
                <div key={i} className="text-[#172b23] font-semibold">
                  • {h}
                </div>
              ))}
              {(goalIntel?.smart_ordering_tips || []).map((t: string, i: number) => (
                <div key={i} className="text-[#566960] text-[11px]">
                  💡 {t}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ================================================================= */}
      {/* 3. PROMINENT OPENSTREETMAP & CLEAN RESTAURANT RESULT LIST          */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Real Interactive OpenStreetMap & Leaflet Panel */}
        <section
          data-testid="food-nearby-map-panel"
          className="lg:col-span-6 gp-surface-elevated rounded-3xl p-5 space-y-4 lg:sticky lg:top-20"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-[#172b23]">
                OpenStreetMap — {locationDisplayLabel} ({radiusKm} km)
              </h3>
              <p className="text-[11px] text-[#566960]">
                Click any restaurant marker on the map or card in the list to view details and route
                directions
              </p>
            </div>
            <span className="rounded-full bg-[#e8f2e9] px-2.5 py-1 text-[11px] font-extrabold text-[#064d3c] shrink-0">
              {restaurants.length} places
            </span>
          </div>

          <OpenStreetMapView
            centerLat={centerLat}
            centerLon={centerLon}
            locationLabel={locationDisplayLabel}
            userCoords={coords}
            restaurants={restaurants as any}
            selectedRestaurantId={selectedRestaurantId}
            onSelectRestaurant={handleSelectRestaurantFromMap}
            onUseMyLocation={handleUseBrowserGeolocation}
            onOpenRestaurantDetails={(rest) => handleSelectRestaurantFromMap(rest.id)}
          />

          {selectedRestaurant && (
            <div
              data-testid="selected-map-restaurant-summary"
              className="rounded-2xl border border-emerald-900/15 bg-white p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
            >
              <div>
                <div className="font-extrabold text-[#172b23]">{selectedRestaurant.name}</div>
                <div className="text-[11px] text-[#566960]">
                  {selectedRestaurant.address}
                  {selectedRestaurant.distance_km != null && (
                    <>
                      {' '}
                      •{' '}
                      <span className="font-bold text-[#087153]">
                        {selectedRestaurant.distance_km} km
                      </span>
                    </>
                  )}
                </div>
              </div>
              <a
                href={
                  selectedRestaurant.maps_links?.openstreetmap_directions_url ||
                  selectedRestaurant.maps_links?.google_maps_directions_url
                }
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl bg-[#087153] px-3.5 py-2 text-[11px] font-extrabold text-white hover:bg-[#064d3c] shrink-0"
              >
                🧭 Get Directions
              </a>
            </div>
          )}
        </section>

        {/* Right: Clean, Uncluttered Restaurant Cards Synchronised with Map Markers */}
        <section className="lg:col-span-6 space-y-3.5">
          {restaurants.length === 0 ? (
            <div className="gp-surface rounded-3xl p-8 text-center space-y-2">
              <p className="text-base font-extrabold text-[#172b23]">
                No matching restaurants found within {radiusKm} km
              </p>
              <p className="text-xs text-[#566960]">
                Open <strong>Filters</strong> above to expand the search radius or adjust dietary
                preferences.
              </p>
            </div>
          ) : (
            restaurants.map((rest, idx) => {
              const isSelected = selectedRestaurant?.id === rest.id;
              const showMoreOptions = expandedCardActionsId === rest.id;

              return (
                <article
                  key={rest.id}
                  ref={(el) => {
                    cardRefs.current[rest.id] = el;
                  }}
                  data-testid={`restaurant-card-${rest.id}`}
                  onClick={() => setSelectedRestaurantId(rest.id)}
                  className={`gp-surface-elevated rounded-3xl p-4 sm:p-5 space-y-3 transition cursor-pointer ${
                    isSelected ? 'ring-2 ring-[#087153] bg-[#f7fbf7]' : ''
                  }`}
                >
                  {/* Clean Header: Restaurant Name, Rating, Distance, Address */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white shrink-0 ${
                            isSelected ? 'bg-amber-600' : 'bg-[#087153]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <h3 className="text-base font-extrabold text-[#172b23] truncate">
                          {rest.name}
                        </h3>
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-extrabold text-[#064d3c]">
                          {rest.dietary_badge}
                        </span>
                      </div>

                      <p className="text-xs text-[#566960]">
                        {rest.distance_km != null && (
                          <span className="font-extrabold text-[#087153]">
                            {rest.distance_km} km away •{' '}
                          </span>
                        )}
                        <span>{rest.address}</span>
                      </p>
                    </div>

                    {rest.rating != null && (
                      <span className="rounded-xl bg-emerald-900 text-white px-2.5 py-1 text-xs font-black shrink-0">
                        ★ {rest.rating}
                      </span>
                    )}
                  </div>

                  {/* Primary Action Row: Matched Dish + Get Directions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-emerald-900/10">
                    <div className="text-xs font-bold text-[#172b23]">
                      🍲 {rest.matched_dish?.dish_name || dishQuery}
                      {rest.matched_dish?.estimated_price_inr && (
                        <span className="text-[#566960] font-semibold">
                          {' '}
                          • Est. ₹{rest.matched_dish.estimated_price_inr}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <a
                        href={
                          rest.maps_links?.openstreetmap_directions_url ||
                          rest.maps_links?.google_maps_directions_url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid={`get-directions-${rest.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-xl bg-[#087153] px-3.5 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c] transition"
                      >
                        🧭 Get Directions
                      </a>

                      <button
                        type="button"
                        data-testid={`more-options-btn-${rest.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCardActionsId(showMoreOptions ? null : rest.id);
                        }}
                        className="rounded-xl border border-emerald-900/15 bg-white px-3 py-2 text-xs font-bold text-[#172b23] hover:bg-emerald-50 transition"
                      >
                        {showMoreOptions ? 'Less' : 'More'}
                      </button>
                    </div>
                  </div>

                  {/* Secondary Actions (Expandable so cards stay uncluttered) */}
                  {showMoreOptions && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-emerald-900/10">
                      {rest.maps_links?.openstreetmap_place_url && (
                        <a
                          href={rest.maps_links.openstreetmap_place_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          data-testid={`open-osm-${rest.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl border border-emerald-800/25 bg-[#e8f2e9] px-3 py-1.5 text-xs font-extrabold text-[#064d3c] hover:bg-emerald-100"
                        >
                          🌍 Open in OpenStreetMap
                        </a>
                      )}
                      <button
                        type="button"
                        data-testid={`swiggy-mcp-order-btn-${rest.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenSwiggyMcpPreview(rest, 'prepare_cart', false);
                        }}
                        className="rounded-xl border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-extrabold text-orange-950 hover:bg-orange-100"
                      >
                        🛵 Swiggy Preview
                      </button>
                      <button
                        type="button"
                        data-testid={`swiggy-dineout-btn-${rest.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleOpenSwiggyMcpPreview(rest, 'book_table', false);
                        }}
                        className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-950 hover:bg-amber-100"
                      >
                        🪑 Book Table
                      </button>
                      <button
                        type="button"
                        data-testid={`log-restaurant-meal-btn-${rest.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDiaryModalRest(rest);
                        }}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-[#172b23] hover:bg-stone-50"
                      >
                        📒 Log Meal to Diary
                      </button>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>

      {/* Swiggy Builders Club MCP Confirmation Modal */}
      {mcpModalOpen && mcpPreview && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="swiggy-mcp-confirmation-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 space-y-4 shadow-2xl border border-emerald-900/15">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-[10px] font-extrabold text-orange-900">
                  {mcpPreview.provider} • Confirmation Gate
                </span>
                <h3 className="mt-1 text-lg font-extrabold text-[#172b23]">
                  {mcpPreview.action_type === 'book_table'
                    ? `Reserve Table at ${mcpPreview.restaurant_name}`
                    : `Prepare Swiggy Cart — ${mcpPreview.restaurant_name}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setMcpModalOpen(false)}
                className="rounded-lg px-2 py-1 text-xs font-bold text-stone-500 hover:bg-stone-100"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#566960] leading-relaxed">{mcpPreview.status_message}</p>

            {mcpPreview.action_type === 'book_table' ? (
              <div className="grid grid-cols-2 gap-3 bg-[#f7fbf7] p-3.5 rounded-2xl border border-emerald-900/10">
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Guests
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={mcpPartySize}
                    onChange={(e) => setMcpPartySize(Number(e.target.value))}
                    className="w-full rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[#566960] mb-1">
                    Preferred Time
                  </label>
                  <input
                    type="text"
                    value={mcpPreferredTime}
                    onChange={(e) => setMcpPreferredTime(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold"
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-emerald-900/10 bg-[#f7fbf7] p-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between font-bold text-[#172b23]">
                  <span>
                    {mcpPreview.items?.[0]?.dish_name} × {mcpQuantity}
                  </span>
                  <span>Est. ₹{mcpPreview.estimated_item_total_inr}</span>
                </div>
                <p className="text-[11px] text-[#566960]">{mcpPreview.price_disclaimer}</p>
              </div>
            )}

            <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-950 font-semibold">
              ⚠️ {mcpPreview.allergy_reminder}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {!mcpPreview.user_confirmed ? (
                <button
                  type="button"
                  data-testid="confirm-swiggy-mcp-preview-btn"
                  disabled={mcpLoading}
                  onClick={() =>
                    void handleOpenSwiggyMcpPreview(
                      mcpPreview.restaurant_obj,
                      mcpPreview.action_type,
                      true
                    )
                  }
                  className="rounded-xl bg-[#087153] px-4 py-2.5 text-xs font-extrabold text-white hover:bg-[#064d3c]"
                >
                  ✅ Confirm Order / Booking Details
                </button>
              ) : (
                <a
                  href={mcpPreview.external_handoff_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="open-swiggy-handoff-link"
                  className="rounded-xl bg-orange-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-orange-700"
                >
                  🚀 Continue on Swiggy ↗
                </a>
              )}
              <button
                type="button"
                onClick={() => setMcpModalOpen(false)}
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-[#172b23]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restaurant-to-Food Diary Confirmation Modal */}
      {diaryModalRest && (
        <div
          role="dialog"
          aria-modal="true"
          data-testid="restaurant-diary-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 space-y-4 shadow-2xl border border-emerald-900/15">
            <h3 className="text-base font-extrabold text-[#172b23]">
              Confirm Logging Restaurant Meal to Daily Diary
            </h3>
            <p className="text-xs text-[#566960]">
              Log{' '}
              <span className="font-bold text-[#172b23]">
                {diaryModalRest.matched_dish?.dish_name}
              </span>{' '}
              from <span className="font-bold text-[#172b23]">{diaryModalRest.name}</span> to your
              Daily Food Diary (labelled as estimated restaurant portion).
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  Meal Category
                </label>
                <select
                  value={diaryMealCategory}
                  onChange={(e) => setDiaryMealCategory(e.target.value)}
                  className="w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
                >
                  <option value="breakfast">Breakfast</option>
                  <option value="lunch">Lunch</option>
                  <option value="snack">Evening Snack</option>
                  <option value="dinner">Dinner</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#566960] mb-1">
                  Servings
                </label>
                <input
                  type="number"
                  min={0.5}
                  step={0.5}
                  value={diaryQuantity}
                  onChange={(e) => setDiaryQuantity(Number(e.target.value))}
                  className="w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDiaryModalRest(null)}
                className="rounded-xl border border-stone-300 px-3.5 py-2 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="confirm-log-restaurant-meal-btn"
                onClick={() => void handleConfirmLogRestaurantMeal()}
                className="rounded-xl bg-[#087153] px-4 py-2 text-xs font-extrabold text-white hover:bg-[#064d3c]"
              >
                ✅ Confirm &amp; Log Meal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
