import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { MedicalSafetyBanner } from './UIWidgets';

interface NavItem {
  label: string;
  to: string;
  group: 'core' | 'tools' | 'household' | 'trust';
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Home', to: '/', group: 'core' },
  { label: 'Food Explorer', to: '/foods', group: 'core' },
  { label: 'Condition Explorer', to: '/conditions', group: 'core' },
  { label: 'Household Dashboard', to: '/household', group: 'household' },
  { label: 'Member Profile', to: '/household/member', group: 'household' },
  { label: 'Recipe Calculator', to: '/recipes/calculator', group: 'tools' },
  { label: 'Saved Recipes', to: '/recipes/saved', group: 'tools' },
  { label: 'Food Label Scanner', to: '/scanner', group: 'tools' },
  { label: 'Barcode Lookup', to: '/barcode', group: 'tools' },
  { label: 'Dish Recognition', to: '/recognition', group: 'tools' },
  { label: 'Product Comparison', to: '/compare', group: 'tools' },
  { label: 'Meal Suggestions', to: '/meals', group: 'tools' },
  { label: 'Data Sources', to: '/sources', group: 'trust' },
  { label: 'Privacy & Safety', to: '/privacy-safety', group: 'trust' },
  { label: 'About GharPlate', to: '/about', group: 'trust' },
  { label: 'Settings', to: '/settings', group: 'trust' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { household, activeMember, setActiveMemberId } = useHousehold();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-900">
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              aria-label="Toggle Navigation Menu"
              className="rounded-lg border border-stone-300 p-2 text-stone-700 lg:hidden"
            >
              ☰
            </button>
            <Link to="/" className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-800 text-white font-bold text-lg shadow-sm">
                G
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-tight text-stone-900">
                  GharPlate
                </span>
                <span className="hidden sm:inline-block ml-2 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 border border-emerald-200">
                  Indian Household Food Intelligence
                </span>
              </div>
            </Link>
          </div>

          {/* Active Household Member Selector */}
          <div className="flex items-center gap-3">
            {household && household.members.length > 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs">
                <span className="text-stone-500 font-medium hidden sm:inline">Active Member:</span>
                <select
                  aria-label="Select Active Household Member"
                  value={activeMember?.id || ''}
                  onChange={(e) => void setActiveMemberId(Number(e.target.value))}
                  className="bg-transparent font-bold text-emerald-900 focus:outline-none"
                >
                  {household.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name} ({m.age_group})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <Link
                to="/household/member"
                className="rounded-xl bg-emerald-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition"
              >
                + Add Household Member
              </Link>
            )}
          </div>
        </div>

        {/* Desktop Secondary Navigation Bar */}
        <nav
          aria-label="Main Navigation"
          className="hidden lg:block border-t border-stone-100 bg-stone-50/70"
        >
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-1.5 sm:px-6 lg:px-8 text-xs font-medium">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-2.5 py-1.5 transition ${
                    isActive
                      ? 'bg-emerald-800 text-white font-semibold shadow-sm'
                      : 'text-stone-700 hover:bg-stone-200/70 hover:text-stone-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <nav
            aria-label="Mobile Navigation"
            className="border-t border-stone-200 bg-white px-4 py-3 lg:hidden"
          >
            <div className="grid grid-cols-2 gap-1.5 text-xs font-medium">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 ${
                      isActive
                        ? 'bg-emerald-800 text-white font-semibold'
                        : 'text-stone-700 hover:bg-stone-100'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5">
          <MedicalSafetyBanner compact={location.pathname === '/privacy-safety'} />
        </div>
        {children}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-stone-200 bg-white py-8 text-xs text-stone-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-bold text-stone-900">
              GharPlate — Indian Household Food Intelligence & Personalised Nutrition Platform
            </p>
            <p className="mt-1">
              Data grounded in ICMR-NIN Indian Food Composition Tables (IFCT 2017), Dietary Guidelines for Indians (2024), WHO, KDIGO, WGO, and FSSAI standards.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 font-medium text-emerald-800">
            <Link to="/sources" className="hover:underline">Data Sources</Link>
            <Link to="/privacy-safety" className="hover:underline">Privacy & Medical Safety</Link>
            <Link to="/about" className="hover:underline">About GharPlate</Link>
            <Link to="/settings" className="hover:underline">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
