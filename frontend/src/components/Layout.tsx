import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthGate } from '../App';
import {
  openAssistantWorkspace,
  usePublishedAssistantContext,
} from '../hooks/useAssistantContext';
import { useHousehold } from '../hooks/useHousehold';
import { GharPlateBrandMark } from '../pages/AuthLandingPage';
import { AssistantWorkspacePanel as AssistantDrawer } from './AssistantWorkspacePanel';
import { MedicalSafetyBanner } from './UIWidgets';

export interface NavItem {
  label: string;
  to: string;
  desc: string;
  icon: string;
  exact?: boolean;
  matchPrefixes?: string[];
}

export interface NavGroup {
  id: 'overview' | 'explore' | 'health' | 'fitness' | 'kitchen' | 'tools' | 'trust';
  label: string;
  icon: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Home',
    icon: '🏠',
    items: [
      {
        label: 'Home',
        to: '/',
        desc: 'Personalised food, health & progress overview',
        icon: '🏠',
        exact: true,
      },
    ],
  },
  {
    id: 'explore',
    label: 'Explore',
    icon: '🥗',
    items: [
      {
        label: 'Food Explorer',
        to: '/foods',
        desc: 'Indian whole foods, dishes & packaged products',
        icon: '🌾',
        matchPrefixes: ['/foods'],
      },
      {
        label: 'Nutrient Explorer',
        to: '/nutrient-explorer',
        desc: 'Search & discover Indian foods by vitamins, minerals, proteins & nutrients',
        icon: '🧬',
        matchPrefixes: ['/nutrient-explorer'],
      },
      {
        label: 'Body & Nutrition',
        to: '/explore/body-nutrition',
        desc: 'Interactive 3D human body & organ nutrition explorer',
        icon: '🧬',
        matchPrefixes: ['/explore/body-nutrition'],
      },
      {
        label: 'Find Food Nearby',
        to: '/food-nearby',
        desc: 'Find restaurants near you serving your desired Indian dish',
        icon: '📍',
        matchPrefixes: ['/food-nearby'],
      },
    ],
  },
  {
    id: 'health',
    label: 'My Health',
    icon: '🩺',
    items: [
      {
        label: 'Household & Profiles',
        to: '/household',
        desc: 'Family members, conditions & allergies',
        icon: '🏡',
        matchPrefixes: ['/household'],
      },
      {
        label: 'Health Reports',
        to: '/health/reports',
        desc: 'Upload lab reports (PDF/Image), review values & Lab-to-Plate foods',
        icon: '🧪',
        matchPrefixes: ['/health/reports'],
      },
      {
        label: 'Symptom Review',
        to: '/health/symptoms',
        desc: 'AI Symptom Review & Care Guidance with emergency red-flag safety',
        icon: '🩺',
        matchPrefixes: ['/health/symptoms'],
      },
      {
        label: 'Health Measurements',
        to: '/health/measurements',
        desc: 'Blood pressure, blood glucose & body metrics',
        icon: '🫀',
        matchPrefixes: [
          '/health/measurements',
          '/health/blood-pressure',
          '/health/blood-glucose',
        ],
      },
      {
        label: 'Health Guidance',
        to: '/conditions',
        desc: 'Condition-aware nutrition guidance',
        icon: '❤️',
        matchPrefixes: ['/conditions'],
      },
    ],
  },
  {
    id: 'fitness',
    label: 'My Progress',
    icon: '📈',
    items: [
      {
        label: 'Fitness',
        to: '/fitness/dashboard',
        desc: 'Fitness profile, training schedule & protein intelligence',
        icon: '🏋️',
        matchPrefixes: ['/fitness/dashboard', '/fitness/protein'],
      },
      {
        label: 'Daily Tracker',
        to: '/fitness/tracker',
        desc: 'Log meals, natural-language diary & water intake',
        icon: '📒',
        matchPrefixes: ['/fitness/tracker', '/fitness/hydration'],
      },
      {
        label: 'Goals & Habits',
        to: '/fitness/goals',
        desc: 'Graph-first habit tracker, AI habit builder & milestones',
        icon: '🎯',
        matchPrefixes: ['/fitness/goals', '/fitness/habit-builder'],
      },
      {
        label: 'Analytics',
        to: '/fitness/analytics',
        desc: 'Nutrition, hydration, BP, glucose & habit trends',
        icon: '📊',
        matchPrefixes: ['/fitness/analytics'],
      },
    ],
  },
  {
    id: 'kitchen',
    label: 'My Kitchen',
    icon: '🍲',
    items: [
      {
        label: 'Recipes',
        to: '/recipes/discover',
        desc: 'Recipe discovery, cooking calculator & saved household recipes',
        icon: '🍲',
        matchPrefixes: ['/recipes', '/meals'],
      },
      {
        label: 'Pantry & Shopping',
        to: '/kitchen/grocery',
        desc: 'Pantry inventory & consolidated grocery list',
        icon: '🛒',
        matchPrefixes: ['/kitchen/grocery'],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    icon: '🔍',
    items: [
      {
        label: 'Food Photo Analyzer',
        to: '/recognition',
        desc: 'Identify Indian food from a photograph and explore its nutrition.',
        icon: '📸',
        matchPrefixes: ['/recognition'],
      },
      {
        label: 'Scanners',
        to: '/barcode',
        desc: 'Barcode scanner & multi-source product lookup',
        icon: '🏷️',
        matchPrefixes: ['/barcode'],
      },
      {
        label: 'Nutrition Label OCR',
        to: '/scanner',
        desc: 'Scan package nutrition & ingredient panels',
        icon: '📄',
        matchPrefixes: ['/scanner'],
      },
      {
        label: 'Product Comparison',
        to: '/compare',
        desc: 'Side-by-side packaged product comparison',
        icon: '⚖️',
        matchPrefixes: ['/compare'],
      },
      {
        label: 'Mess Analyzer',
        to: '/tools/mess-analyzer',
        desc: 'Hostel/canteen menu analyzer & family meal portions',
        icon: '🍱',
        matchPrefixes: ['/tools/mess-analyzer'],
      },
    ],
  },
  {
    id: 'trust',
    label: 'Settings',
    icon: '⚙️',
    items: [
      {
        label: 'Sources',
        to: '/sources',
        desc: 'ICMR-NIN, WHO, KDIGO, AHA, ADA & FSSAI',
        icon: '📚',
        matchPrefixes: ['/sources'],
      },
      {
        label: 'Privacy',
        to: '/privacy-safety',
        desc: 'Medical safety & privacy policy',
        icon: '🔒',
        matchPrefixes: ['/privacy-safety', '/about'],
      },
      {
        label: 'Settings',
        to: '/settings',
        desc: 'Account, household & notification preferences',
        icon: '⚙️',
        matchPrefixes: ['/settings'],
      },
    ],
  },
];

export const SIDEBAR_STORAGE_KEY = 'gharplate_sidebar_collapsed';
export const SIDEBAR_GROUP_KEY = 'gharplate_sidebar_active_group';
export const SIDEBAR_WIDTH_STORAGE_KEY = 'gharplate_sidebar_width';
export const SIDEBAR_MIN_WIDTH = 190;
export const SIDEBAR_DEFAULT_WIDTH = 240;
export const SIDEBAR_MAX_WIDTH = 360;

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function readStoredSidebarWidth(): number {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT_WIDTH;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < SIDEBAR_MIN_WIDTH || parsed > SIDEBAR_MAX_WIDTH) {
      return SIDEBAR_DEFAULT_WIDTH;
    }
    return Math.round(parsed);
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

const QUICK_ADD_ITEMS = [
  {
    id: 'log-food',
    label: 'Log Food',
    sub: 'Search, natural language or scan',
    to: '/fitness/tracker?quick=log-food',
    icon: '📒',
  },
  {
    id: 'upload-report',
    label: 'Upload Health Report',
    sub: 'Lab PDF or image report analysis',
    to: '/health/reports',
    icon: '🧪',
  },
  {
    id: 'find-food-nearby',
    label: 'Find Food Nearby',
    sub: 'Dish-first nearby restaurant discovery',
    to: '/food-nearby',
    icon: '📍',
  },
  {
    id: 'add-water',
    label: 'Add Water',
    sub: 'Quick glass or bottle log',
    to: '/fitness/hydration',
    icon: '💧',
  },
  {
    id: 'record-bp',
    label: 'Record BP',
    sub: 'Systolic, diastolic & pulse reading',
    to: '/health/blood-pressure',
    icon: '🫀',
  },
  {
    id: 'record-glucose',
    label: 'Record Glucose',
    sub: 'Fasting, pre-meal or post-meal log',
    to: '/health/blood-glucose',
    icon: '🩸',
  },
  {
    id: 'log-workout',
    label: 'Log Workout',
    sub: 'Mark training session or milestone',
    to: '/fitness/dashboard?quick=log-workout',
    icon: '🏋️',
  },
  {
    id: 'complete-habit',
    label: 'Complete Habit',
    sub: 'Check off today’s scheduled habits',
    to: '/fitness/goals?tab=habits',
    icon: '✅',
  },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) {
    return pathname === item.to;
  }
  if (item.matchPrefixes && item.matchPrefixes.length > 0) {
    return item.matchPrefixes.some((prefix) =>
      prefix === '/' ? pathname === '/' : pathname.startsWith(prefix)
    );
  }
  return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
}

export function findGroupForPathname(pathname: string): NavGroup['id'] {
  const matched = NAV_GROUPS.find((g) =>
    g.items.some((item) => isNavItemActive(item, pathname))
  );
  return matched ? matched.id : 'overview';
}

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { household, activeMember, setActiveMemberId } = useHousehold();
  const { authProfile, signOut } = useAuthGate();
  const publishedAssistantCtx = usePublishedAssistantContext();
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const quickAddRef = useRef<HTMLDivElement | null>(null);
  const sidebarAsideRef = useRef<HTMLElement | null>(null);
  const mainWorkspaceRef = useRef<HTMLDivElement | null>(null);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  const [sidebarWidth, setSidebarWidth] = useState<number>(() => readStoredSidebarWidth());
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const applyAndSaveSidebarWidth = useCallback((nextWidth: number) => {
    const clamped = clampSidebarWidth(nextWidth);
    setSidebarWidth(clamped);
    try {
      localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      // ignore storage errors
    }
    try {
      window.dispatchEvent(new Event('resize'));
    } catch {
      // ignore
    }
  }, []);

  const startSidebarResize = useCallback(
    (startX: number) => {
      if (sidebarCollapsed) return;
      const initialWidth = sidebarAsideRef.current?.getBoundingClientRect().width || sidebarWidth;
      const sidebarLeft = sidebarAsideRef.current?.getBoundingClientRect().left ?? 0;

      setIsResizingSidebar(true);
      const prevCursor = document.body.style.cursor;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const computeFromClientX = (clientX: number) => {
        const delta = clientX - startX;
        const candidate =
          sidebarLeft === 0 && initialWidth > 0 ? initialWidth + delta : clientX - sidebarLeft;
        applyAndSaveSidebarWidth(candidate);
      };

      const handleMouseMove = (ev: MouseEvent) => {
        ev.preventDefault();
        computeFromClientX(ev.clientX);
      };

      const handlePointerMove = (ev: PointerEvent) => {
        ev.preventDefault();
        computeFromClientX(ev.clientX);
      };

      const stopResize = () => {
        setIsResizingSidebar(false);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevUserSelect;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', stopResize);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', stopResize);
        window.removeEventListener('pointercancel', stopResize);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', stopResize);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', stopResize);
      window.addEventListener('pointercancel', stopResize);
    },
    [applyAndSaveSidebarWidth, sidebarCollapsed, sidebarWidth]
  );

  // Only the active navigation group expands automatically by default
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const activeGroupId = findGroupForPathname(window.location.pathname || '/');
    let savedGroup: string | null = null;
    try {
      savedGroup = localStorage.getItem(SIDEBAR_GROUP_KEY);
    } catch {
      // ignore
    }
    const initialOpen = savedGroup || activeGroupId;
    return {
      overview: initialOpen === 'overview' || activeGroupId === 'overview',
      explore: initialOpen === 'explore' || activeGroupId === 'explore',
      health: initialOpen === 'health' || activeGroupId === 'health',
      fitness: initialOpen === 'fitness' || activeGroupId === 'fitness',
      kitchen: initialOpen === 'kitchen' || activeGroupId === 'kitchen',
      tools: initialOpen === 'tools' || activeGroupId === 'tools',
      trust: initialOpen === 'trust' || activeGroupId === 'trust',
    };
  });

  const toggleSidebarCollapsed = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          window.dispatchEvent(new Event('resize'));
        } catch {
          // ignore
        }
      }, 50);
      return next;
    });
  };

  // Accordion behavior: expanding a group opens it and collapses non-active groups
  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const willExpand = !prev[groupId];
      const activeGroupId = findGroupForPathname(location.pathname);
      const nextState: Record<string, boolean> = {};
      for (const g of NAV_GROUPS) {
        if (g.id === groupId) {
          nextState[g.id] = willExpand;
        } else if (g.id === activeGroupId) {
          nextState[g.id] = true;
        } else {
          nextState[g.id] = false;
        }
      }
      try {
        if (willExpand) {
          localStorage.setItem(SIDEBAR_GROUP_KEY, groupId);
        }
      } catch {
        // ignore
      }
      return nextState;
    });
  };

  // On route change, automatically expand only the active group (and close transient menus)
  useEffect(() => {
    const activeGroupId = findGroupForPathname(location.pathname);
    setExpandedGroups({
      overview: activeGroupId === 'overview',
      explore: activeGroupId === 'explore',
      health: activeGroupId === 'health',
      fitness: activeGroupId === 'fitness',
      kitchen: activeGroupId === 'kitchen',
      tools: activeGroupId === 'tools',
      trust: activeGroupId === 'trust',
    });
    setQuickAddOpen(false);
    setMobileDrawerOpen(false);
    if (mainWorkspaceRef.current && typeof mainWorkspaceRef.current.scrollTo === 'function') {
      mainWorkspaceRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [location.pathname, location.search]);

  // Close Quick Add menu on outside click or Escape
  useEffect(() => {
    if (!quickAddOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQuickAddOpen(false);
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleEsc);
    };
  }, [quickAddOpen]);

  // Part G.23 — Cursor-Responsive Subtle Light-Green Glow in Main Content Workspace
  const handleWorkspacePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = mainWorkspaceRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.round(e.clientX - rect.left);
    const y = Math.round(e.clientY - rect.top);
    el.style.setProperty('--cursor-x', `${x}px`);
    el.style.setProperty('--cursor-y', `${y}px`);
  };

  return (
    <div
      data-testid="gharplate-app-shell"
      className="relative min-h-screen lg:h-screen flex flex-col bg-[#f1f6f1] text-[#172b23] pb-16 lg:pb-0 overflow-x-hidden lg:overflow-hidden"
    >
      {/* Subtle Ambient Light-Green Botanical Backdrop Orbs & Curves (Pointer-Events None, Respects Reduced Motion) */}
      <div
        aria-hidden="true"
        data-testid="ambient-botanical-backdrop"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="animate-gp-orb absolute -top-24 -left-24 h-96 w-96 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="animate-gp-orb-delayed absolute top-1/4 -right-28 h-[28rem] w-[28rem] rounded-full bg-teal-100/40 blur-3xl" />
        <div className="animate-gp-orb absolute bottom-8 left-1/3 h-80 w-80 rounded-full bg-amber-100/25 blur-3xl" />
        <svg
          className="absolute top-0 right-0 w-[640px] h-[360px] opacity-[0.045] text-emerald-900"
          viewBox="0 0 640 360"
          fill="none"
        >
          <path
            d="M80 -20 C 220 120, 420 40, 660 220"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path
            d="M160 -40 C 290 150, 470 90, 680 280"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* Top Header — Glossy Botanical Surface, Compact Brand, Unified + Quick Add Menu, Member Switcher */}
      <header className="sticky top-0 z-40 shrink-0 border-b border-emerald-900/10 bg-white/85 backdrop-blur-xl shadow-[0_4px_20px_-4px_rgba(8,113,83,0.06)]">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
          {/* Left: Mobile Drawer Button, Desktop Sidebar Toggle & Brand Mark */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
              aria-label="Toggle Navigation Menu"
              aria-expanded={mobileDrawerOpen}
              className="rounded-xl border border-emerald-900/15 bg-white/90 p-2 text-stone-700 hover:bg-emerald-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 lg:hidden"
            >
              ☰
            </button>

            <button
              type="button"
              data-testid="sidebar-collapse-toggle"
              onClick={toggleSidebarCollapsed}
              aria-label={sidebarCollapsed ? 'Expand Left Sidebar' : 'Collapse Left Sidebar'}
              aria-expanded={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Expand navigation sidebar' : 'Collapse navigation sidebar'}
              className="hidden lg:inline-flex items-center justify-center rounded-xl border border-emerald-900/15 bg-[#064E3B] px-2.5 py-1.5 text-xs font-bold text-[#E8FFF4] hover:bg-[#087A5B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition"
            >
              {sidebarCollapsed ? '»' : '«'}
            </button>

            <Link to="/" className="flex items-center gap-2.5 group">
              <GharPlateBrandMark size="sm" />
              <div className="leading-tight">
                <span className="text-base font-extrabold tracking-tight text-[#172b23]">
                  GharPlate
                </span>
                <span className="block text-[10px] font-bold tracking-wider text-[#087153]">
                  Food, Anatomy &amp; Health
                </span>
              </div>
            </Link>
          </div>

          {/* Right: Unified + Quick Add Menu, Active Household Member Switcher & Account Controls */}
          <div className="flex items-center gap-2.5">
            <div ref={quickAddRef} className="relative">
              <button
                type="button"
                data-testid="header-quick-add-btn"
                onClick={() => setQuickAddOpen((prev) => !prev)}
                aria-expanded={quickAddOpen}
                aria-haspopup="menu"
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#087153] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#064d3c] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 transition"
              >
                <span>+</span>
                <span>Quick Add</span>
                <span className="text-[10px] opacity-80">▾</span>
              </button>

              {quickAddOpen && (
                <div
                  role="menu"
                  aria-label="Quick Add Actions"
                  data-testid="header-quick-add-menu"
                  className="absolute right-0 mt-2 w-64 rounded-2xl border border-emerald-900/15 bg-white/95 backdrop-blur-xl p-1.5 shadow-xl z-50"
                >
                  {QUICK_ADD_ITEMS.map((action) => (
                    <Link
                      key={action.id}
                      to={action.to}
                      role="menuitem"
                      data-testid={`quick-add-${action.id}`}
                      onClick={() => setQuickAddOpen(false)}
                      className="flex items-start gap-2.5 rounded-xl px-3 py-2 text-left hover:bg-[#e8f2e9]/70 transition"
                    >
                      <span className="text-sm mt-0.5 shrink-0" aria-hidden="true">
                        {action.icon}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#172b23]">
                          {action.label}
                        </div>
                        <div className="text-[11px] text-[#566960] truncate">
                          {action.sub}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {household && household.members.length > 0 ? (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-900/15 bg-[#e8f2e9]/75 px-2.5 py-1.5 text-xs">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#087153] text-[10px] font-bold text-white">
                  {activeMember?.display_name.slice(0, 1).toUpperCase() || 'M'}
                </span>
                <select
                  aria-label="Select Active Household Member"
                  value={activeMember?.id || ''}
                  onChange={(e) => void setActiveMemberId(Number(e.target.value))}
                  className="bg-transparent font-bold text-[#172b23] focus:outline-none cursor-pointer"
                >
                  {household.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.display_name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <Link
                to="/household/member"
                className="rounded-xl border border-emerald-900/15 bg-[#e8f2e9] px-3 py-1.5 text-xs font-semibold text-[#172b23] hover:bg-emerald-100 transition"
              >
                + Profile
              </Link>
            )}

            {authProfile ? (
              <button
                type="button"
                data-testid="header-signout-btn"
                onClick={() => void signOut()}
                title={`Signed in as ${authProfile.email} — Click to sign out`}
                className="rounded-xl border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#566960] hover:bg-rose-50 hover:text-rose-800 hover:border-rose-200 transition"
              >
                Sign Out
              </button>
            ) : (
              <Link
                to="/login"
                data-testid="header-signin-link"
                className="hidden md:inline-flex rounded-xl border border-emerald-900/15 bg-white px-3 py-1.5 text-xs font-semibold text-[#172b23] hover:bg-emerald-50 transition"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Slide-Out Navigation Drawer — Dark-Emerald Theme */}
        {mobileDrawerOpen && (
          <nav
            aria-label="Mobile Navigation Drawer"
            data-testid="mobile-navigation-drawer"
            className="border-t border-emerald-300/20 bg-[#064E3B] text-[#E8FFF4] px-4 py-3 lg:hidden max-h-[80vh] overflow-y-auto space-y-1.5 shadow-xl"
          >
            {NAV_GROUPS.map((group) => {
              const isExpanded = expandedGroups[group.id] ?? false;
              const hasActiveChild = group.items.some((item) =>
                isNavItemActive(item, location.pathname)
              );

              return (
                <div
                  key={`mobile-group-${group.id}`}
                  className="rounded-xl border border-emerald-200/15 bg-[#075B45]/85 p-1.5"
                >
                  <button
                    type="button"
                    onClick={() =>
                      group.items.length === 1
                        ? navigate(group.items[0].to)
                        : toggleGroupExpanded(group.id)
                    }
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-xs font-bold rounded-lg ${
                      hasActiveChild ? 'text-emerald-200' : 'text-[#E8FFF4]'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{group.icon}</span>
                      <span>{group.label}</span>
                    </span>
                    {group.items.length > 1 && (
                      <span className="text-[10px] text-[#A7D9C0]">
                        {isExpanded ? '▾' : '▸'}
                      </span>
                    )}
                  </button>

                  {(isExpanded || group.items.length === 1) && (
                    <div className="mt-1 space-y-0.5 pl-2">
                      {group.items.map((item) => {
                        const active = isNavItemActive(item, location.pathname);
                        return (
                          <NavLink
                            key={`mobile-${group.id}-${item.to}`}
                            to={item.to}
                            end={Boolean(item.exact)}
                            onClick={() => setMobileDrawerOpen(false)}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                              active
                                ? 'gp-sidebar-item-active'
                                : 'gp-sidebar-item-idle'
                            }`}
                          >
                            <span className="text-sm">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </NavLink>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="pt-1 border-t border-emerald-200/15">
              <button
                type="button"
                data-testid="mobile-sidebar-ask-gharplate-btn"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  openAssistantWorkspace();
                }}
                className="gp-sidebar-ai-btn w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-extrabold text-white shadow-sm"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden="true">🤖</span>
                  <span>Ask GharPlate AI</span>
                </span>
                <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-stone-950">
                  Open
                </span>
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* Desktop Fixed Dark-Emerald Left Sidebar + Independent Scrollable Main Content Workspace */}
      <div className="relative z-10 flex flex-1 min-w-0 min-h-0 lg:overflow-hidden">
        <aside
          ref={sidebarAsideRef}
          aria-label="Primary Sidebar Navigation"
          data-testid="desktop-left-sidebar"
          style={
            sidebarCollapsed
              ? undefined
              : {
                  width: `${sidebarWidth}px`,
                  minWidth: `${sidebarWidth}px`,
                  maxWidth: `${sidebarWidth}px`,
                }
          }
          className={`gp-sidebar-surface relative hidden lg:flex flex-col justify-between shrink-0 lg:h-full lg:overflow-hidden ${
            isResizingSidebar
              ? ''
              : 'transition-[width] duration-200 motion-reduce:transition-none'
          } ${sidebarCollapsed ? 'w-16' : 'w-60'}`}
        >
          <div
            data-testid="sidebar-scroll-container"
            className="h-full max-h-full flex flex-col justify-between overflow-y-auto overflow-x-hidden px-3 py-4 gap-4"
          >
            <div className="space-y-2.5">
              {NAV_GROUPS.map((group) => {
                const isExpanded = expandedGroups[group.id] ?? false;
                const hasActiveChild = group.items.some((item) =>
                  isNavItemActive(item, location.pathname)
                );

                if (sidebarCollapsed) {
                  return (
                    <div
                      key={group.id}
                      data-testid={`sidebar-group-${group.id}`}
                      className="flex justify-center"
                    >
                      <button
                        type="button"
                        data-testid={`nav-hub-${group.id}`}
                        onClick={() => navigate(group.items[0].to)}
                        title={`${group.label}: ${group.items.map((i) => i.label).join(', ')}`}
                        aria-label={group.label}
                        className={`flex h-10 w-10 items-center justify-center rounded-xl text-base transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                          hasActiveChild
                            ? 'bg-[#087A5B] text-white shadow-sm ring-1 ring-emerald-300/40'
                            : 'text-[#A7D9C0] hover:bg-emerald-400/15 hover:text-white'
                        }`}
                      >
                        <span aria-hidden="true">{group.icon}</span>
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={group.id}
                    data-testid={`sidebar-group-${group.id}`}
                    className="space-y-1 rounded-xl bg-[#075B45]/55 p-1.5 border border-emerald-200/10"
                  >
                    <div className="flex items-center justify-between px-2 py-1">
                      <button
                        type="button"
                        data-testid={`nav-hub-${group.id}`}
                        onClick={() =>
                          group.items.length === 1
                            ? navigate(group.items[0].to)
                            : toggleGroupExpanded(group.id)
                        }
                        className={`flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 rounded-md ${
                          hasActiveChild
                            ? 'text-emerald-200'
                            : 'text-[#A7D9C0] hover:text-white'
                        }`}
                      >
                        <span className="text-sm" aria-hidden="true">
                          {group.icon}
                        </span>
                        <span>{group.label}</span>
                      </button>
                      {group.items.length > 1 && (
                        <button
                          type="button"
                          data-testid={`sidebar-group-toggle-${group.id}`}
                          onClick={() => toggleGroupExpanded(group.id)}
                          aria-expanded={isExpanded}
                          aria-label={`Toggle ${group.label} group`}
                          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-[#A7D9C0] hover:bg-emerald-400/15 hover:text-white"
                        >
                          {isExpanded ? '▾' : '▸'}
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="space-y-0.5 pl-1">
                        {group.items.map((item) => {
                          const active = isNavItemActive(item, location.pathname);
                          return (
                            <NavLink
                              key={`${group.id}-${item.to}`}
                              to={item.to}
                              end={Boolean(item.exact)}
                              title={item.desc}
                              className={() =>
                                `group flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 ${
                                  active
                                    ? 'gp-sidebar-item-active'
                                    : 'gp-sidebar-item-idle'
                                }`
                              }
                            >
                              <span className="text-sm shrink-0" aria-hidden="true">
                                {item.icon}
                              </span>
                              <span className="truncate">{item.label}</span>
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dedicated Ask GharPlate AI Assistant Entry in Main Left Sidebar */}
            <div className="pt-3 border-t border-emerald-200/20">
              {sidebarCollapsed ? (
                <button
                  type="button"
                  data-testid="sidebar-ask-gharplate-btn"
                  onClick={() => openAssistantWorkspace()}
                  title="Ask GharPlate AI — Open contextual food, report, symptom & restaurant assistant"
                  aria-label="Ask GharPlate AI"
                  className="gp-sidebar-ai-btn mx-auto flex h-10 w-10 items-center justify-center rounded-xl text-base text-white shadow-sm"
                >
                  <span aria-hidden="true">🤖</span>
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="sidebar-ask-gharplate-btn"
                  onClick={() => openAssistantWorkspace()}
                  title="Open Ask GharPlate AI Assistant with your current food, health report, symptom, or nearby restaurant context"
                  className="gp-sidebar-ai-btn w-full flex flex-col gap-1 rounded-2xl p-3 text-left text-white shadow-md"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-extrabold tracking-tight">
                      <span className="text-base" aria-hidden="true">🤖</span>
                      <span>Ask GharPlate AI</span>
                    </span>
                    <span className="rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-stone-950">
                      AI Chat
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-emerald-50/95 leading-snug">
                    {publishedAssistantCtx.selected_entity?.name
                      ? `Active: ${publishedAssistantCtx.selected_entity.name}`
                      : 'Ask about any food, lab report, symptom, or restaurant'}
                  </p>
                </button>
              )}
            </div>
          </div>

          {/* Subtle Right-Edge Horizontal Resize Handle (Desktop Only when Expanded) */}
          {!sidebarCollapsed && (
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize left navigation sidebar"
              aria-valuemin={SIDEBAR_MIN_WIDTH}
              aria-valuemax={SIDEBAR_MAX_WIDTH}
              aria-valuenow={sidebarWidth}
              tabIndex={0}
              data-testid="sidebar-resize-handle"
              title="Drag to resize sidebar width"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startSidebarResize(e.clientX);
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                startSidebarResize(e.clientX);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault();
                  applyAndSaveSidebarWidth(sidebarWidth + 12);
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault();
                  applyAndSaveSidebarWidth(sidebarWidth - 12);
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  applyAndSaveSidebarWidth(SIDEBAR_MIN_WIDTH);
                } else if (e.key === 'End') {
                  e.preventDefault();
                  applyAndSaveSidebarWidth(SIDEBAR_MAX_WIDTH);
                }
              }}
              className="group/resize absolute top-0 right-0 bottom-0 z-30 w-2 cursor-col-resize select-none touch-none focus-visible:outline-none"
            >
              <div
                className={`ml-auto h-full w-[2.5px] transition-colors duration-150 ${
                  isResizingSidebar
                    ? 'bg-emerald-300/90 shadow-[0_0_8px_rgba(52,211,153,0.65)]'
                    : 'bg-transparent group-hover/resize:bg-emerald-300/60 group-focus-visible/resize:bg-emerald-300/80'
                }`}
              />
            </div>
          )}
        </aside>

        {/* Main Content Area — Independent Vertical Scroll Container with Cursor-Responsive Glow */}
        <div
          ref={mainWorkspaceRef}
          data-testid="main-content-workspace"
          onPointerMove={handleWorkspacePointerMove}
          className="gp-main-workspace flex-1 min-w-0 min-h-0 lg:h-full lg:overflow-y-auto overflow-x-hidden flex flex-col justify-between"
        >
          <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
            {children}
            <div className="mt-10">
              <MedicalSafetyBanner compact={location.pathname === '/privacy-safety'} />
            </div>
          </main>

          {/* Clean Light-Green Botanical Footer */}
          <footer className="mt-12 border-t border-emerald-900/10 bg-white/85 backdrop-blur-md py-5 text-xs text-[#566960]">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="font-bold text-[#172b23]">
                  GharPlate — Indian Household Food, 3D Anatomy &amp; Health Intelligence
                </p>
                <p className="mt-0.5 text-[#566960]">
                  Grounded in ICMR-NIN IFCT 2017, Dietary Guidelines for Indians 2024, BodyParts3D 4.0 (CC BY 4.0), HuBMAP v1.10 (CC BY 4.0), Open Food Facts &amp; FSSAI sources.
                </p>
              </div>
              <div className="flex flex-wrap gap-4 font-bold text-[#087153]">
                <Link to="/sources" className="hover:underline">Sources</Link>
                <Link to="/privacy-safety" className="hover:underline">Privacy &amp; Safety</Link>
                <Link to="/about" className="hover:underline">About</Link>
                <Link to="/settings" className="hover:underline">Settings</Link>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Floating Ask GharPlate Local Ollama AI Assistant Drawer */}
      <AssistantDrawer />

      {/* Mobile Fixed Bottom Navigation Bar for Primary Actions */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-emerald-900/10 bg-white/95 py-2 backdrop-blur lg:hidden"
      >
        {[
          { label: 'Home', to: '/', icon: '🏠' },
          { label: 'Explore', to: '/foods', icon: '🥗' },
          { label: 'Reports', to: '/health/reports', icon: '🧪' },
          { label: 'Nearby', to: '/food-nearby', icon: '📍' },
          { label: 'Tracker', to: '/fitness/tracker', icon: '📒' },
        ].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1 text-[11px] font-bold ${
                isActive ? 'text-[#087153]' : 'text-[#566960]'
              }`
            }
          >
            <span className="text-sm">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
};
