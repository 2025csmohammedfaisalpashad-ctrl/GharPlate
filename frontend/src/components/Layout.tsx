import React, { useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { AssistantDrawer } from './AssistantDrawer';
import { MedicalSafetyBanner } from './UIWidgets';

interface NavGroup {
  id: 'explore' | 'household' | 'tools' | 'trust';
  label: string;
  icon: string;
  items: { label: string; to: string; desc: string; icon: string }[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: 'explore',
    label: 'Explore',
    icon: '🥗',
    items: [
      { label: 'Home', to: '/', desc: 'Visual food & nutrition hub', icon: '🏠' },
      { label: 'Food Explorer', to: '/foods', desc: '75+ Indian foods with photos', icon: '🌾' },
      { label: 'Condition Explorer', to: '/conditions', desc: 'Personalised health guidance', icon: '❤️' },
      { label: 'Meal Suggestions', to: '/meals', desc: 'Breakfast, lunch, dinner & snacks', icon: '🍛' },
    ],
  },
  {
    id: 'household',
    label: 'Household',
    icon: '👨‍👩‍👧‍👦',
    items: [
      { label: 'Family Dashboard', to: '/household', desc: 'Switch & manage family members', icon: '🏡' },
      { label: 'Member Profiles', to: '/household/member', desc: 'Conditions, allergies & diet', icon: '👤' },
      { label: 'Saved Recipes', to: '/recipes/saved', desc: 'Your household recipe book', icon: '📖' },
    ],
  },
  {
    id: 'tools',
    label: 'Smart Tools',
    icon: '🔍',
    items: [
      { label: 'Recipe Calculator', to: '/recipes/calculator', desc: 'Visual cooking & macro calculator', icon: '🍲' },
      { label: 'Food Label Scanner', to: '/scanner', desc: 'Instant OCR nutrition label reader', icon: '📸' },
      { label: 'Barcode Lookup', to: '/barcode', desc: 'Scan or enter packaged barcodes', icon: '🏷️' },
      { label: 'Product Comparison', to: '/compare', desc: 'Compare 2–4 products side by side', icon: '⚖️' },
      { label: 'Dish Recognition', to: '/recognition', desc: 'Identify Indian dishes from photos', icon: '✨' },
    ],
  },
  {
    id: 'trust',
    label: 'Sources & Safety',
    icon: '🛡️',
    items: [
      { label: 'Data Sources', to: '/sources', desc: 'ICMR-NIN, WHO, KDIGO & FSSAI', icon: '📚' },
      { label: 'Privacy & Safety', to: '/privacy-safety', desc: 'Medical & RAM-only image policy', icon: '🔒' },
      { label: 'About GharPlate', to: '/about', desc: 'How GharPlate works', icon: '🌿' },
      { label: 'Settings', to: '/settings', desc: 'Local household token controls', icon: '⚙️' },
    ],
  },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { household, activeMember, setActiveMemberId } = useHousehold();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active group based on current path
  const activeGroup =
    NAV_GROUPS.find((g) =>
      g.items.some((item) =>
        item.to === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.to)
      )
    ) || NAV_GROUPS[0];

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5] text-stone-900 pb-16 lg:pb-0">
      {/* Clean Top Navigation Header (No Horizontal Overflow!) */}
      <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          {/* Brand Logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              aria-label="Toggle Navigation Menu"
              className="rounded-xl border border-stone-200 p-2 text-stone-700 hover:bg-stone-100 lg:hidden"
            >
              ☰
            </button>
            <Link to="/" className="flex items-center gap-2.5 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-800 text-white font-black text-xl shadow-sm group-hover:bg-emerald-700 transition">
                G
              </div>
              <div>
                <span className="text-xl font-black tracking-tight text-stone-900">
                  GharPlate
                </span>
                <span className="block text-[10px] font-semibold uppercase tracking-widest text-emerald-800">
                  Indian Food Intelligence
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Grouped Hub Tabs (4 Clean Hubs — Zero Overflow) */}
          <nav
            aria-label="Primary Categories"
            className="hidden lg:flex items-center gap-1.5 rounded-2xl bg-stone-100/90 p-1.5"
          >
            {NAV_GROUPS.map((group) => {
              const isCurrentGroup = activeGroup.id === group.id;
              return (
                <button
                  key={group.id}
                  type="button"
                  onClick={() => navigate(group.items[0].to)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                    isCurrentGroup
                      ? 'bg-white text-emerald-900 shadow-sm'
                      : 'text-stone-600 hover:text-stone-900 hover:bg-white/50'
                  }`}
                >
                  <span>{group.icon}</span>
                  <span>{group.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Right: Active Member Pill Switcher & Scan Shortcut */}
          <div className="flex items-center gap-2.5">
            <Link
              to="/barcode"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100 transition"
            >
              <span>🏷️</span>
              <span>Barcode</span>
            </Link>

            <Link
              to="/scanner"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 hover:bg-emerald-100 transition"
            >
              <span>📸</span>
              <span>Scan Label</span>
            </Link>

            {household && household.members.length > 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-800 text-[11px] font-bold text-white">
                  {activeMember?.display_name.slice(0, 1).toUpperCase() || 'M'}
                </span>
                <select
                  aria-label="Select Active Household Member"
                  value={activeMember?.id || ''}
                  onChange={(e) => void setActiveMemberId(Number(e.target.value))}
                  className="bg-transparent font-bold text-stone-900 focus:outline-none cursor-pointer"
                >
                  {household.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name} ({m.age_group.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <Link
                to="/household/member"
                className="rounded-xl bg-emerald-800 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
              >
                + Add Family Member
              </Link>
            )}
          </div>
        </div>

        {/* Desktop Contextual Sub-Navigation Bar for the Active Hub */}
        <div className="hidden lg:block border-t border-stone-100 bg-stone-50/80">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mr-2">
                {activeGroup.label}:
              </span>
              {activeGroup.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/' || item.to === '/household'}
                  className={({ isActive }) =>
                    `flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                      isActive
                        ? 'bg-emerald-800 text-white shadow-sm'
                        : 'text-stone-700 hover:bg-stone-200/70 hover:text-stone-950'
                    }`
                  }
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>

            {/* Quick Cross-Hub Links */}
            <div className="flex items-center gap-4 text-xs font-semibold text-stone-500">
              <Link to="/foods" className="hover:text-emerald-800">Foods</Link>
              <Link to="/conditions" className="hover:text-emerald-800">Conditions</Link>
              <Link to="/barcode" className="hover:text-emerald-800">Barcode Scanner</Link>
              <Link to="/compare" className="hover:text-emerald-800">Compare Products</Link>
            </div>
          </div>
        </div>

        {/* Mobile Slide-Down Grouped Drawer */}
        {mobileDrawerOpen && (
          <nav
            aria-label="Mobile Navigation Drawer"
            className="border-t border-stone-200 bg-white px-4 py-4 lg:hidden max-h-[80vh] overflow-y-auto space-y-4"
          >
            {NAV_GROUPS.map((group) => (
              <div key={group.id} className="space-y-1.5">
                <div className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400 px-2">
                  {group.icon} {group.label}
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/' || item.to === '/household'}
                      onClick={() => setMobileDrawerOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ${
                          isActive
                            ? 'bg-emerald-800 text-white'
                            : 'bg-stone-50 text-stone-800 hover:bg-stone-100'
                        }`
                      }
                    >
                      <span>{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        )}
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
        {children}
        <div className="mt-10">
          <MedicalSafetyBanner compact={location.pathname === '/privacy-safety'} />
        </div>
      </main>

      {/* Floating Ask GharPlate Local Ollama AI Assistant Drawer */}
      <AssistantDrawer />

      {/* Mobile Fixed Bottom Navigation Bar for Primary Actions */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-stone-200 bg-white/95 py-2 backdrop-blur lg:hidden"
      >
        {[
          { label: 'Home', to: '/', icon: '🏠' },
          { label: 'Foods', to: '/foods', icon: '🌾' },
          { label: 'Conditions', to: '/conditions', icon: '❤️' },
          { label: 'Barcode', to: '/barcode', icon: '🏷️' },
          { label: 'Household', to: '/household', icon: '🏡' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-bold ${
                isActive ? 'text-emerald-800' : 'text-stone-500'
              }`
            }
          >
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Clean Footer */}
      <footer className="mt-12 border-t border-stone-200/80 bg-white py-8 text-xs text-stone-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-extrabold text-stone-900">
              GharPlate — Indian Household Food Intelligence
            </p>
            <p className="mt-0.5 text-stone-500">
              Powered by ICMR-NIN IFCT 2017, Dietary Guidelines for Indians 2024, Open Food Facts, USDA FDC, WHO, KDIGO & FSSAI data.
            </p>
          </div>
          <div className="flex flex-wrap gap-4 font-bold text-emerald-800">
            <Link to="/sources" className="hover:underline">Data Sources</Link>
            <Link to="/privacy-safety" className="hover:underline">Privacy & Safety</Link>
            <Link to="/about" className="hover:underline">About</Link>
            <Link to="/settings" className="hover:underline">Settings</Link>
          </div>
        </div>
      </footer>
    </div>
  );
};
