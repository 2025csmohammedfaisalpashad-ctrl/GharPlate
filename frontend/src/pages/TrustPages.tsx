import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-stone-900">
          Authoritative Nutrition & Clinical Data Sources Register
        </h1>
        <p className="mt-1 text-xs text-stone-600 leading-relaxed">
          Every food composition record, household measure conversion, and condition rule in GharPlate is linked to a verifiable source record. Missing or unmeasured nutrients are stored as SQL NULL and never fabricated.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sources.map((src) => (
          <div key={src.code} className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="rounded bg-emerald-100 px-2.5 py-0.5 font-bold text-emerald-900">
                {src.source_type}
              </span>
              <span className="font-mono text-stone-500">
                {src.code} ({src.publication_year})
              </span>
            </div>
            <h2 className="text-base font-bold text-stone-900">{src.name}</h2>
            <p className="text-stone-700">
              <strong>Organisation:</strong> {src.organization}
            </p>
            <p className="text-stone-700">
              <strong>Document:</strong> {src.document_title} (Version: {src.version})
            </p>
            <p className="text-stone-500">
              <strong>Licensing & Reuse Notes:</strong> {src.license_notes}
            </p>
            <div className="pt-2">
              <a
                href={src.url}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-emerald-800 underline"
              >
                Open Official Source Reference ↗
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
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
        <h1 className="text-2xl font-extrabold text-stone-900">
          Medical Safety, Data Integrity & Privacy Guarantees
        </h1>

        <div className="grid gap-4 sm:grid-cols-2 text-xs leading-relaxed text-stone-700">
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2">
            <h2 className="text-sm font-bold text-amber-950">1. Medical Safety Boundaries</h2>
            <ul className="list-disc pl-4 space-y-1">
              <li>GharPlate is an educational household food-information platform, NOT a medical device or diagnostic system.</li>
              <li>It never prescribes treatment, daily clinical nutrient limits, or medication changes, and never claims any food cures, prevents, or reverses a disease.</li>
              <li>Foods are never labelled universally as "Safe", "Unsafe", "Allowed", or "Forbidden".</li>
              <li>Short-term illnesses (such as fever or acute diarrhoea) are strictly distinguished from chronic conditions and include urgent medical red-flag warnings.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 space-y-2">
            <h2 className="text-sm font-bold text-emerald-950">2. Zero-Fabrication & NULL Integrity</h2>
            <ul className="list-disc pl-4 space-y-1">
              <li>Unknown or undeclared nutrient values are strictly stored and displayed as <code>NULL</code> (Unknown), never replaced with <code>0</code>.</li>
              <li>Recipe calculations compute totals across known ingredients while displaying a transparent nutrient completeness indicator.</li>
              <li>Allergen tags are data-based indications, never a safety guarantee against mill or factory cross-contamination.</li>
            </ul>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
            <h2 className="text-sm font-bold text-stone-900">
              3. Passwordless Browser Convenience Identifier
            </h2>
            <p>
              GharPlate requires no mandatory account registration or personal identity verification. Your household profile is linked to a random browser token (<code>{household?.household_token}</code>). This token is a convenience identifier only, not strong cryptographic authentication.
            </p>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 space-y-2">
            <h2 className="text-sm font-bold text-stone-900">
              4. In-Memory Image Processing (Zero Image Persistence)
            </h2>
            <p>
              Uploaded nutrition label images and meal photographs are validated and processed strictly in RAM (<code>io.BytesIO</code>) and immediately purged after the HTTP request finishes. No uploaded photos are written to disk, databases, or analytics logs.
            </p>
          </div>
        </div>

        <div className="border-t border-stone-100 pt-4 flex items-center justify-between">
          <span className="text-xs text-stone-600">
            Want to erase all locally linked household profiles and saved recipes immediately?
          </span>
          <button
            type="button"
            onClick={() => void clearLocalHousehold()}
            className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-600"
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
    <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-4">
      <h1 className="text-2xl font-extrabold text-stone-900">About GharPlate</h1>
      <p className="text-sm text-stone-700 leading-relaxed">
        <strong>GharPlate</strong> is an Indian Household Food Intelligence and Personalised Nutrition Platform designed to make food composition, regional dishes, packaged-food labels, and condition-aware nutrition understandable, transparent, and practical for everyday Indian meals.
      </p>

      <div className="grid gap-4 sm:grid-cols-3 text-xs text-stone-700">
        <div className="rounded-xl bg-stone-50 p-4 space-y-1">
          <div className="font-bold text-stone-900">Multilingual Indian Food Graph</div>
          <p>
            Search seamlessly across English, Hindi, and Kannada names and regional culinary dishes from Ragi Mudde and Bisi Bele Bath to Moong Dal Khichdi and Chapati.
          </p>
        </div>
        <div className="rounded-xl bg-stone-50 p-4 space-y-1">
          <div className="font-bold text-stone-900">Deterministic Clinical Rule Engine</div>
          <p>
            Separates nutrition rules from application code, cites ICMR-NIN, WHO, KDIGO, and WGO guidelines, and explicitly flags multi-condition conflicts (such as Diabetes + CKD).
          </p>
        </div>
        <div className="rounded-xl bg-stone-50 p-4 space-y-1">
          <div className="font-bold text-stone-900">Full-Stack Open Architecture</div>
          <p>
            Built with Python FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2, SQLite/PostgreSQL, React 18, TypeScript, Vite, and Tailwind CSS.
          </p>
        </div>
      </div>

      <div className="pt-2 flex gap-3 text-xs font-bold">
        <Link to="/foods" className="text-emerald-800 underline">
          Explore Food Database →
        </Link>
        <Link to="/sources" className="text-emerald-800 underline">
          Inspect Data Sources →
        </Link>
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
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm space-y-5">
        <h1 className="text-2xl font-extrabold text-stone-900">
          Application Settings & Local Data Controls
        </h1>

        {savedMsg && (
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-semibold text-emerald-900">
            {savedMsg}
          </div>
        )}

        <div className="space-y-2 text-xs">
          <div className="font-bold text-stone-800">Active Browser Household Convenience Token</div>
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 font-mono text-stone-700">
            {household?.household_token}
          </div>
          <p className="text-stone-500">
            Stored in <code>localStorage['gharplate_household_token']</code>.
          </p>
        </div>

        <form onSubmit={(e) => void handleCreateFreshHousehold(e)} className="space-y-3 border-t border-stone-100 pt-4 max-w-md">
          <label className="block text-xs font-bold text-stone-700">
            Initialize New Household Profile
          </label>
          <input
            type="text"
            value={householdNameInput}
            onChange={(e) => setHouseholdNameInput(e.target.value)}
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-xl bg-emerald-800 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
          >
            Generate New Household Token
          </button>
        </form>

        <div className="border-t border-stone-100 pt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={clearSearchHistory}
            className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-100"
          >
            Clear Local Search History ({searchHistory.length} items)
          </button>
          <button
            type="button"
            onClick={() => void clearLocalHousehold()}
            className="rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white hover:bg-rose-600"
          >
            Purge Household Data from Server & Browser
          </button>
        </div>
      </div>
    </div>
  );
};
