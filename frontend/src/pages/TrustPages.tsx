import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ExpandableSection } from '../components/UIWidgets';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { DataSource } from '../types/api';

// ==========================================
// PAGE 15: NUTRITION DATA SOURCES PAGE
// ==========================================
export const DataSourcesPage: React.FC = () => {
  const [sources, setSources] = useState<DataSource[]>([]);

  useEffect(() => {
    void api.getSources().then(setSources).catch(() => null);
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm">
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
          📚 Verified Provenance
        </span>
        <h1 className="mt-2 text-2xl sm:text-3xl font-black text-stone-900">
          Nutrition & Clinical Data Sources
        </h1>
        <p className="mt-1 text-xs sm:text-sm text-stone-500">
          Every food record and health rule in GharPlate links directly to an official publication or open database.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sources.map((src) => (
          <div
            key={src.code}
            className="rounded-3xl border border-stone-200/90 bg-white p-5 shadow-sm flex flex-col justify-between space-y-3 text-xs"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 font-bold text-emerald-900">
                  {src.source_type}
                </span>
                <span className="font-mono text-stone-400">{src.publication_year}</span>
              </div>
              <h2 className="text-base font-extrabold text-stone-900">{src.name}</h2>
              <p className="text-stone-600">{src.organization}</p>
              <p className="text-stone-500 line-clamp-2">{src.document_title}</p>
            </div>
            <div className="border-t border-stone-100 pt-3 flex items-center justify-between">
              <span className="text-[11px] text-stone-400">{src.version}</span>
              <a
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="font-extrabold text-emerald-800 hover:underline"
              >
                Open Source ↗
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// PAGE 16: PRIVACY AND MEDICAL SAFETY PAGE
// ==========================================
export const PrivacySafetyPage: React.FC = () => {
  const { household, clearLocalHousehold } = useHousehold();

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <div>
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
            🔒 Safety & Privacy First
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-black text-stone-900">
            Privacy & Medical Safety Guarantees
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-500">
            Clear, everyday summary of how GharPlate protects your family’s privacy and keeps nutrition data honest.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          {[
            {
              icon: '🩺',
              title: 'Educational Guide, Never a Doctor Substitute',
              desc: 'GharPlate explains food composition and portion relevance. It never diagnoses illness, prescribes daily limits, or labels foods universally "Safe" or "Forbidden".',
            },
            {
              icon: '◌',
              title: 'Unknown Nutrients Stay NULL (Never Fake Zero)',
              desc: 'When a vitamin or mineral is unmeasured or missing on a package label, GharPlate displays NULL instead of assuming 0.',
            },
            {
              icon: '📸',
              title: 'RAM-Only Photo Processing (Zero Image Storage)',
              desc: 'Uploaded label and dish photos are processed strictly in memory and deleted immediately after the request completes.',
            },
            {
              icon: '🔑',
              title: 'No Mandatory Account Login',
              desc: `Your household profile uses a local browser token (${household?.household_token.slice(0, 14)}...) that you can reset anytime in one click.`,
            },
          ].map((card) => (
            <div key={card.title} className="rounded-2xl border border-stone-200 bg-stone-50 p-5 space-y-1.5">
              <div className="text-2xl">{card.icon}</div>
              <h2 className="text-sm font-extrabold text-stone-900">{card.title}</h2>
              <p className="text-stone-600 leading-relaxed">{card.desc}</p>
            </div>
          ))}
        </div>

        <div className="border-t border-stone-100 pt-4 flex flex-wrap items-center justify-between gap-4">
          <span className="text-xs text-stone-500">
            Want to erase all locally linked household profiles and saved recipes right now?
          </span>
          <button
            type="button"
            onClick={() => void clearLocalHousehold()}
            className="rounded-2xl bg-rose-700 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-rose-600"
          >
            Delete Household Data & Reset Token
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// PAGE 17: ABOUT GHARPLATE PAGE
// ==========================================
export const AboutPage: React.FC = () => (
  <div className="space-y-6">
    <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-5">
      <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-900">
        🌿 Indian Household Food Intelligence
      </span>
      <h1 className="text-2xl sm:text-3xl font-black text-stone-900">About GharPlate</h1>
      <p className="text-sm text-stone-600 leading-relaxed max-w-3xl">
        <strong>GharPlate</strong> brings together official Indian food composition tables, regional culinary dishes, packaged label scanning, and condition-aware guidance in one visual, easy-to-use household experience.
      </p>

      <div className="grid gap-4 sm:grid-cols-3 text-xs">
        <div className="rounded-2xl bg-stone-50 p-5 space-y-1.5">
          <div className="text-xl">🌾</div>
          <div className="font-extrabold text-stone-900 text-sm">Multilingual Indian Food Graph</div>
          <p className="text-stone-600">
            Search in English, Hindi, and Kannada across 9 food categories from Ragi Mudde and Avalakki to Toor Dal and Paneer.
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-5 space-y-1.5">
          <div className="text-xl">⚖️</div>
          <div className="font-extrabold text-stone-900 text-sm">Transparent Rules Engine</div>
          <p className="text-stone-600">
            Deterministic rules backed by ICMR-NIN, WHO, KDIGO, and WGO citations — with multi-condition conflict checks.
          </p>
        </div>
        <div className="rounded-2xl bg-stone-50 p-5 space-y-1.5">
          <div className="text-xl">🍲</div>
          <div className="font-extrabold text-stone-900 text-sm">Built for Everyday Cooking</div>
          <p className="text-stone-600">
            Convert household katoris, cups, and rotis into accurate nutrient breakdowns without reading a textbook.
          </p>
        </div>
      </div>

      <ExpandableSection
        title="Technical Architecture Overview"
        subtitle="FastAPI, SQLAlchemy 2.0, SQLite/PostgreSQL, React 18, TypeScript & Tailwind CSS"
      >
        <p className="text-xs text-stone-600 leading-relaxed">
          GharPlate is engineered as a modular full-stack platform with reproducible data seeding, parameterised ORM queries, RAM-only image processing, and automated Pytest & Vitest verification suites.
        </p>
      </ExpandableSection>

      <div className="pt-2 flex gap-4 text-xs font-extrabold text-emerald-800">
        <Link to="/foods" className="hover:underline">Explore Food Catalog →</Link>
        <Link to="/sources" className="hover:underline">View Data Sources →</Link>
      </div>
    </div>
  </div>
);

// ==========================================
// PAGE 18: SETTINGS / PREFERENCES PAGE
// ==========================================
export const SettingsPage: React.FC = () => {
  const {
    household,
    searchHistory,
    createNewHousehold,
    clearLocalHousehold,
    clearSearchHistory,
  } = useHousehold();
  const [householdNameInput, setHouseholdNameInput] = useState(household?.name || 'My Household');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const handleCreateFreshHousehold = async (e: React.FormEvent) => {
    e.preventDefault();
    await createNewHousehold(householdNameInput.trim() || 'My Household');
    setSavedMsg('Generated a fresh browser household token and profile.');
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-stone-200/90 bg-white p-6 sm:p-8 shadow-sm space-y-6">
        <h1 className="text-2xl font-black text-stone-900">
          Settings & Local Data Controls
        </h1>

        {savedMsg && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs font-bold text-emerald-900">
            ✓ {savedMsg}
          </div>
        )}

        <div className="space-y-1.5 text-xs">
          <div className="font-bold text-stone-700">Active Browser Convenience Token</div>
          <div className="rounded-2xl border border-stone-200 bg-stone-50 p-3.5 font-mono text-stone-700">
            {household?.household_token}
          </div>
        </div>

        <form
          onSubmit={(e) => void handleCreateFreshHousehold(e)}
          className="space-y-3 border-t border-stone-100 pt-4 max-w-md"
        >
          <label className="block text-xs font-bold text-stone-700">
            Start a Fresh Household Profile
          </label>
          <input
            type="text"
            value={householdNameInput}
            onChange={(e) => setHouseholdNameInput(e.target.value)}
            className="w-full rounded-2xl border border-stone-300 px-3.5 py-2.5 text-sm"
          />
          <button
            type="submit"
            className="rounded-2xl bg-emerald-800 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-emerald-700"
          >
            Generate New Household Token
          </button>
        </form>

        <div className="border-t border-stone-100 pt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={clearSearchHistory}
            className="rounded-2xl border border-stone-300 px-4 py-2.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
          >
            Clear Search History ({searchHistory.length})
          </button>
          <button
            type="button"
            onClick={() => void clearLocalHousehold()}
            className="rounded-2xl bg-rose-700 px-5 py-2.5 text-xs font-extrabold text-white hover:bg-rose-600"
          >
            Purge Household Data from Server & Browser
          </button>
        </div>
      </div>
    </div>
  );
};
