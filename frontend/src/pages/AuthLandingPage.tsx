import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHousehold } from '../hooks/useHousehold';
import { api } from '../services/api';
import type { AuthSessionResponse } from '../types/api';

export type AuthMode = 'login' | 'signup' | 'forgot';

interface PlateIngredient {
  id: string;
  name: string;
  regionalName: string;
  category: string;
  emoji: string;
  photoUrl: string;
  calories: number;
  proteinG: number;
  fibreG: number;
  calciumMg: number;
  highlightBadge: string;
  orbitPositionClass: string;
  platedPositionClass: string;
  accentColor: string;
}

const PLATE_INGREDIENTS: PlateIngredient[] = [
  {
    id: 'ragi',
    name: 'Ragi (Finger Millet)',
    regionalName: 'रागी • ರಾಗಿ',
    category: 'Cereals & Millets',
    emoji: '🌾',
    photoUrl: '/images/foods/cereals-millets/ragi-finger-millet.webp',
    calories: 160,
    proteinG: 3.6,
    fibreG: 5.6,
    calciumMg: 182,
    highlightBadge: '364 mg Calcium / 100g',
    orbitPositionClass: '-top-5 left-2 sm:-left-4',
    platedPositionClass: 'top-[22%] left-[21%]',
    accentColor: 'from-amber-500/20 to-amber-600/10 border-amber-300/60 text-amber-200',
  },
  {
    id: 'toor-dal',
    name: 'Toor Dal (Arhar)',
    regionalName: 'तूर दाल • ತೊಗರಿ ಬೇಳೆ',
    category: 'Pulses & Dals',
    emoji: '🫘',
    photoUrl: '/images/foods/pulses-legumes/toor-dal-red-gram.webp',
    calories: 145,
    proteinG: 9.2,
    fibreG: 4.1,
    calciumMg: 36,
    highlightBadge: '22.3g Protein / 100g',
    orbitPositionClass: '-top-4 right-2 sm:-right-4',
    platedPositionClass: 'top-[22%] right-[21%]',
    accentColor: 'from-orange-500/20 to-amber-500/10 border-orange-300/60 text-orange-200',
  },
  {
    id: 'palak',
    name: 'Fresh Palak (Spinach)',
    regionalName: 'पालक • ಪಾಲಕ್ ಸೊಪ್ಪು',
    category: 'Vegetables & Greens',
    emoji: '🥬',
    photoUrl: '/images/foods/vegetables/spinach-palak.webp',
    calories: 26,
    proteinG: 2.1,
    fibreG: 2.4,
    calciumMg: 82,
    highlightBadge: 'Rich in Iron & Folate',
    orbitPositionClass: 'top-[38%] -left-3 sm:-left-8',
    platedPositionClass: 'top-[45%] left-[16%]',
    accentColor: 'from-emerald-500/25 to-teal-500/10 border-emerald-300/60 text-emerald-200',
  },
  {
    id: 'idli',
    name: 'Steamed Idli & Sambar',
    regionalName: 'इडली • ಇಡ್ಲಿ ಸಾಂಬಾರ್',
    category: 'Indian Dishes',
    emoji: '🍛',
    photoUrl: '/images/foods/indian-dishes/idli-steamed-rice-lentil.webp',
    calories: 146,
    proteinG: 4.6,
    fibreG: 2.8,
    calciumMg: 38,
    highlightBadge: 'Fermented & Gentle',
    orbitPositionClass: 'top-[38%] -right-3 sm:-right-8',
    platedPositionClass: 'top-[45%] right-[16%]',
    accentColor: 'from-teal-500/20 to-emerald-500/10 border-teal-300/60 text-teal-200',
  },
  {
    id: 'mango',
    name: 'Ripe Mango & Guava',
    regionalName: 'आम • ಮಾವಿನ ಹಣ್ಣು',
    category: 'Fresh Fruits',
    emoji: '🥭',
    photoUrl: '/images/foods/fruits/mango-ripe.webp',
    calories: 74,
    proteinG: 0.8,
    fibreG: 2.2,
    calciumMg: 14,
    highlightBadge: 'Vitamin C & Carotenoids',
    orbitPositionClass: '-bottom-4 left-3 sm:left-0',
    platedPositionClass: 'bottom-[20%] left-[24%]',
    accentColor: 'from-rose-500/20 to-amber-500/10 border-rose-300/60 text-rose-200',
  },
  {
    id: 'almonds',
    name: 'Almonds (Badam)',
    regionalName: 'बादाम • ಬಾದಾಮಿ',
    category: 'Nuts & Seeds',
    emoji: '🥜',
    photoUrl: '/images/foods/nuts-seeds/almonds-badam.webp',
    calories: 92,
    proteinG: 3.1,
    fibreG: 1.9,
    calciumMg: 38,
    highlightBadge: 'Healthy Fats & Vit E',
    orbitPositionClass: '-bottom-4 right-3 sm:right-0',
    platedPositionClass: 'bottom-[20%] right-[24%]',
    accentColor: 'from-yellow-500/20 to-amber-500/10 border-yellow-300/60 text-yellow-200',
  },
];

interface DiscoveryFoodItem {
  slug: string;
  name: string;
  hindiKannada: string;
  category: string;
  photoUrl: string;
  energyKcal: number;
  proteinG: number;
  fibreG: number;
  tag: string;
}

const DISCOVERY_FOODS: DiscoveryFoodItem[] = [
  {
    slug: 'ragi-finger-millet',
    name: 'Ragi (Finger Millet)',
    hindiKannada: 'रागी • ರಾಗಿ',
    category: 'Cereals & Millets',
    photoUrl: '/images/foods/cereals-millets/ragi-finger-millet.webp',
    energyKcal: 320,
    proteinG: 7.2,
    fibreG: 11.2,
    tag: '364 mg Calcium',
  },
  {
    slug: 'idli-steamed-rice-lentil',
    name: 'Steamed Idli & Sambar',
    hindiKannada: 'इडली • ಇಡ್ಲಿ',
    category: 'Indian Dishes',
    photoUrl: '/images/foods/indian-dishes/idli-steamed-rice-lentil.webp',
    energyKcal: 146,
    proteinG: 4.6,
    fibreG: 2.8,
    tag: 'Fermented Gut-Friendly',
  },
  {
    slug: 'palak-paneer-curry',
    name: 'Palak Paneer Homestyle',
    hindiKannada: 'पालक पनीर • ಪಾಲಕ್ ಪನೀರ್',
    category: 'Indian Dishes',
    photoUrl: '/images/foods/indian-dishes/palak-paneer-curry.webp',
    energyKcal: 185,
    proteinG: 9.4,
    fibreG: 2.9,
    tag: 'Iron + Calcium Pair',
  },
  {
    slug: 'khichdi-moong-dal-rice',
    name: 'Moong Dal Khichdi',
    hindiKannada: 'खिचड़ी • ಹೆಸರುಬೇಳೆ ಖಿಚಡಿ',
    category: 'Indian Dishes',
    photoUrl: '/images/foods/indian-dishes/khichdi-moong-dal-rice.webp',
    energyKcal: 118,
    proteinG: 4.3,
    fibreG: 1.9,
    tag: 'Gentle Recovery Bowl',
  },
  {
    slug: 'poha-avalakki-cooked',
    name: 'Vegetable Poha (Avalakki)',
    hindiKannada: 'पोहा • ಅವಲಕ್ಕಿ ಒಗ್ಗರಣೆ',
    category: 'Indian Dishes',
    photoUrl: '/images/foods/indian-dishes/poha-avalakki-cooked.webp',
    energyKcal: 158,
    proteinG: 3.4,
    fibreG: 2.1,
    tag: 'Light Morning Staple',
  },
  {
    slug: 'toor-dal-red-gram',
    name: 'Toor Dal (Red Gram)',
    hindiKannada: 'तूर दाल • ತೊಗರಿ ಬೇಳೆ',
    category: 'Pulses & Dals',
    photoUrl: '/images/foods/pulses-legumes/toor-dal-red-gram.webp',
    energyKcal: 335,
    proteinG: 22.3,
    fibreG: 15.0,
    tag: 'High Plant Protein',
  },
  {
    slug: 'curd-dahi-whole-milk',
    name: 'Fresh Dahi (Home Curd)',
    hindiKannada: 'दही • ಮೊಸರು',
    category: 'Dairy & Fermented',
    photoUrl: '/images/foods/dairy/curd-dahi-whole-milk.webp',
    energyKcal: 60,
    proteinG: 3.1,
    fibreG: 0,
    tag: 'Live Probiotic',
  },
  {
    slug: 'almonds-badam',
    name: 'Almonds (Badam)',
    hindiKannada: 'बादाम • ಬಾದಾಮಿ',
    category: 'Nuts & Seeds',
    photoUrl: '/images/foods/nuts-seeds/almonds-badam.webp',
    energyKcal: 609,
    proteinG: 20.8,
    fibreG: 10.9,
    tag: 'Vitamin E & Magnesium',
  },
];

export const GharPlateBrandMark: React.FC<{ size?: 'sm' | 'md' | 'lg' }> = ({ size = 'md' }) => {
  const dims =
    size === 'lg' ? 'h-12 w-12' : size === 'sm' ? 'h-9 w-9' : 'h-11 w-11';
  return (
    <div
      className={`relative flex ${dims} shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 shadow-lg ring-1 ring-amber-400/40`}
    >
      <svg
        viewBox="0 0 64 64"
        className="h-7 w-7"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <circle cx="32" cy="32" r="28" stroke="#A7F3D0" strokeWidth="2" strokeOpacity="0.45" />
        {/* Rising warm steam wisps */}
        <path
          d="M25 22C23.5 18.5 26.8 15.5 25.2 12"
          stroke="#FBBF24"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        <path
          d="M34 21C32.5 17.5 35.8 14.5 34.2 11"
          stroke="#F59E0B"
          strokeWidth="2.8"
          strokeLinecap="round"
        />
        {/* Fresh Ayurvedic / Curry Leaf */}
        <path
          d="M36 22C42 15 51 14 53 15C52 22 46 27 36 22Z"
          fill="#10B981"
        />
        <path
          d="M37 21.5L49 16.5"
          stroke="#ECFDF5"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        {/* GharPlate Serving Bowl */}
        <path
          d="M14 31C22 27.5 42 27.5 50 31"
          stroke="#ECFDF5"
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M16 32H48C46.5 44 39.5 50 32 50C24.5 50 17.5 44 16 32Z"
          fill="#10B981"
          fillOpacity="0.28"
          stroke="#ECFDF5"
          strokeWidth="2.6"
        />
        {/* Rice & Turmeric Dal accents */}
        <circle cx="24" cy="39" r="2.3" fill="#FBBF24" />
        <circle cx="40" cy="39" r="2.3" fill="#F59E0B" />
        <ellipse cx="29" cy="37" rx="1.6" ry="2.8" transform="rotate(-18 29 37)" fill="#FFFFFF" />
        <ellipse cx="35" cy="37" rx="1.6" ry="2.8" transform="rotate(15 35 37)" fill="#FFFFFF" />
      </svg>
    </div>
  );
};

interface AuthLandingPageProps {
  initialMode?: AuthMode;
  onAuthenticated?: (session: AuthSessionResponse, targetPath?: string) => void;
}

export const AuthLandingPage: React.FC<AuthLandingPageProps> = ({
  initialMode = 'login',
  onAuthenticated,
}) => {
  const navigate = useNavigate();
  const { applyAuthenticatedSession } = useHousehold();

  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [plateAssembled, setPlateAssembled] = useState<boolean>(false);
  const [selectedIngredientIds, setSelectedIngredientIds] = useState<string[]>([
    'ragi',
    'toor-dal',
    'palak',
    'idli',
  ]);
  const [activeIngredientSpot, setActiveIngredientSpot] = useState<PlateIngredient>(
    PLATE_INGREDIENTS[0]
  );

  // Login & Sign-up Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Discovery Search Bar State
  const [discoveryQuery, setDiscoveryQuery] = useState('');
  const [selectedCategoryChip, setSelectedCategoryChip] = useState<string>('All');

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const togglePlateIngredient = (ing: PlateIngredient) => {
    setActiveIngredientSpot(ing);
    setSelectedIngredientIds((prev) =>
      prev.includes(ing.id)
        ? prev.length > 1
          ? prev.filter((id) => id !== ing.id)
          : prev
        : [...prev, ing.id]
    );
  };

  const handleAssemblePlateAnimation = () => {
    if (!plateAssembled) {
      setSelectedIngredientIds(PLATE_INGREDIENTS.map((i) => i.id));
      setPlateAssembled(true);
    } else {
      setPlateAssembled(false);
    }
  };

  const activePlateNutrients = useMemo(() => {
    const activeItems = PLATE_INGREDIENTS.filter((i) =>
      selectedIngredientIds.includes(i.id)
    );
    return activeItems.reduce(
      (acc, item) => ({
        calories: Math.round(acc.calories + item.calories),
        proteinG: Number((acc.proteinG + item.proteinG).toFixed(1)),
        fibreG: Number((acc.fibreG + item.fibreG).toFixed(1)),
        calciumMg: Math.round(acc.calciumMg + item.calciumMg),
      }),
      { calories: 0, proteinG: 0, fibreG: 0, calciumMg: 0 }
    );
  }, [selectedIngredientIds]);

  const filteredDiscoveryFoods = useMemo(() => {
    const q = discoveryQuery.trim().toLowerCase();
    return DISCOVERY_FOODS.filter((item) => {
      const matchesCategory =
        selectedCategoryChip === 'All' || item.category === selectedCategoryChip;
      const matchesQuery =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.hindiKannada.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.tag.toLowerCase().includes(q);
      return matchesCategory && matchesQuery;
    });
  }, [discoveryQuery, selectedCategoryChip]);

  const passwordStrength = useMemo(() => {
    if (!password) return { score: 0, label: 'Enter password', color: 'bg-stone-200' };
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password) || password.length >= 12) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', color: 'bg-rose-500' };
    if (score === 2) return { score: 2, label: 'Fair', color: 'bg-amber-500' };
    if (score === 3) return { score: 3, label: 'Good', color: 'bg-emerald-500' };
    return { score: 4, label: 'Strong', color: 'bg-emerald-700' };
  }, [password]);

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (mode === 'forgot') {
      if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
        setErrorMessage('Please enter a valid email address to receive recovery instructions.');
        return;
      }
      setSuccessMessage(
        `If an account is registered for ${normalizedEmail}, please contact your household administrator or sign in with your registered password.`
      );
      return;
    }

    if (mode === 'signup') {
      if (!fullName.trim() || fullName.trim().length < 2) {
        setErrorMessage('Please enter your name or family household name (at least 2 characters).');
        return;
      }
    }

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      setErrorMessage('Please enter a valid email address (for example, priya.rao@example.com).');
      return;
    }

    if (!password || password.length < 6) {
      setErrorMessage('Password must be at least 6 characters long.');
      return;
    }

    if (mode === 'signup' && password !== confirmPassword) {
      setErrorMessage('Passwords do not match. Please check your confirm password field.');
      return;
    }

    setIsSubmitting(true);
    try {
      let session: AuthSessionResponse;
      if (mode === 'signup') {
        session = await api.registerAccount({
          name: fullName.trim(),
          email: normalizedEmail,
          password,
          password_confirmation: confirmPassword,
          remember_me: rememberMe,
        });
      } else {
        session = await api.loginAccount({
          email: normalizedEmail,
          password,
          remember_me: rememberMe,
        });
      }

      setSuccessMessage(session.message);
      applyAuthenticatedSession(session);
      if (onAuthenticated) {
        onAuthenticated(session, '/');
      } else {
        navigate('/');
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Authentication failed. Please check your email and password.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="auth-landing-page"
      className="min-h-screen bg-[#FAF7F2] text-stone-900 selection:bg-amber-300 selection:text-stone-950"
    >
      {/* Top Ambient Decorative Ribbon */}
      <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-stone-900 text-emerald-100 text-xs py-2 px-4 border-b border-emerald-800/60">
        <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            <span>
              Grounded in ICMR-NIN IFCT 2017 &amp; Dietary Guidelines for Indians 2024 • English, हिन्दी &amp; ಕನ್ನಡ
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-[11px] text-emerald-200/90 font-medium">
            <span>✓ 75+ Verified Indian Foods</span>
            <span>✓ 24 Health Condition Guides</span>
            <span>✓ Live Barcode &amp; Label OCR</span>
          </div>
        </div>
      </div>

      {/* Main Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-[#FAF7F2]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <GharPlateBrandMark size="md" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl sm:text-2xl font-black tracking-tight text-stone-900">
                  GharPlate
                </span>
                <span className="hidden sm:inline-flex items-center rounded-full bg-amber-100 border border-amber-300/80 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-900">
                  Family Nutrition
                </span>
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-emerald-800">
                Indian Household Food Intelligence
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="#discover-indian-foods"
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-200/60 transition"
            >
              <span>🔍</span>
              <span>Explore Food Catalog</span>
            </a>
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                mode === 'login'
                  ? 'bg-emerald-900 text-white shadow-sm'
                  : 'border border-stone-300 bg-white text-stone-800 hover:bg-stone-100'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => switchMode('signup')}
              className={`rounded-xl px-4 py-2 text-xs font-extrabold transition ${
                mode === 'signup'
                  ? 'bg-amber-400 text-stone-950 shadow-sm'
                  : 'bg-amber-400/90 text-stone-950 hover:bg-amber-400'
              }`}
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Column Hero & Authentication Section */}
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-16 sm:px-6 lg:px-8 space-y-16">
        <section className="grid items-stretch gap-8 lg:grid-cols-12">
          {/* LEFT COLUMN (7 cols): Animated Indian Serving Plate & Story */}
          <div className="lg:col-span-7 flex flex-col justify-between overflow-hidden rounded-[2.25rem] bg-gradient-to-br from-[#052E22] via-[#064E3B] to-[#111827] p-6 sm:p-10 text-white shadow-2xl relative border border-emerald-800/50">
            {/* Ambient Radial Saffron & Leafy Glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-emerald-400/15 blur-3xl"
            />

            {/* Top Headline & Story */}
            <div className="relative z-10 space-y-4">
              <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-900/70 px-3.5 py-1.5 text-xs font-bold text-emerald-100 shadow-sm">
                <span>🌿</span>
                <span>Smart Indian Kitchen • Whole Foods, Home Recipes &amp; Packaged Labels</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-black tracking-tight leading-[1.12]">
                Every Indian Kitchen Deserves{' '}
                <span className="bg-gradient-to-r from-amber-300 via-amber-200 to-emerald-200 bg-clip-text text-transparent">
                  Honest Food Intelligence.
                </span>
              </h1>

              <p className="text-sm sm:text-base text-emerald-100/90 max-w-2xl leading-relaxed">
                Understand what goes onto your family’s plate — from Ragi Mudde, Toor Dal, and Idli to packaged snacks — personalised for blood sugar, blood pressure, kids, and elders.
              </p>
            </div>

            {/* CENTERPIECE: Interactive Animated Indian Serving Plate / Thali */}
            <div
              data-testid="interactive-food-plate"
              data-plate-state={plateAssembled ? 'assembled' : 'orbiting'}
              className="relative z-10 my-6 flex flex-col items-center justify-center py-6"
            >
              {/* Outer Interactive Stage */}
              <div className="relative h-[320px] w-full max-w-[440px] sm:h-[360px] flex items-center justify-center">
                {/* Pulsing Concentric Brass & Emerald Aura Rings */}
                <div
                  aria-hidden="true"
                  className="animate-gp-ring absolute h-64 w-64 sm:h-72 sm:w-72 rounded-full border border-amber-300/25 bg-gradient-to-br from-amber-400/5 to-emerald-400/5"
                />
                <div
                  aria-hidden="true"
                  className="absolute h-52 w-52 sm:h-60 sm:w-60 rounded-full border border-emerald-300/30 border-dashed"
                />

                {/* Central Artisanal Indian Thali / Serving Bowl */}
                <div
                  className={`relative z-10 flex h-44 w-44 sm:h-52 sm:w-52 flex-col items-center justify-center rounded-full border-4 transition-all duration-700 shadow-2xl ${
                    plateAssembled
                      ? 'scale-105 border-amber-300 bg-gradient-to-br from-amber-950/90 via-emerald-950 to-stone-900 ring-8 ring-amber-400/20'
                      : 'border-emerald-500/60 bg-gradient-to-br from-emerald-950 via-stone-900 to-emerald-950 ring-4 ring-white/10'
                  }`}
                >
                  {/* Animated Rising Steam Wisps */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute -top-7 flex items-center gap-3"
                  >
                    <span className="animate-gp-steam-1 h-5 w-1 rounded-full bg-amber-300/60 blur-[1px]" />
                    <span className="animate-gp-steam-2 h-6 w-1 rounded-full bg-emerald-200/60 blur-[1px]" />
                    <span className="animate-gp-steam-3 h-5 w-1 rounded-full bg-amber-200/60 blur-[1px]" />
                  </div>

                  {/* Inner Katori / Thali Center */}
                  <div className="flex flex-col items-center text-center px-3">
                    <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-300">
                      {plateAssembled ? '✨ Thali Assembled' : '🍽️ Interactive Thali'}
                    </span>
                    <div
                      data-testid="plate-calorie-readout"
                      className="mt-1 text-2xl sm:text-3xl font-black text-white"
                    >
                      {activePlateNutrients.calories}{' '}
                      <span className="text-xs font-bold text-amber-300">kcal</span>
                    </div>
                    <div className="mt-1 flex flex-wrap justify-center gap-1.5 text-[10px] font-bold text-emerald-200">
                      <span className="rounded-full bg-white/10 px-2 py-0.5">
                        {activePlateNutrients.proteinG}g Protein
                      </span>
                      <span className="rounded-full bg-white/10 px-2 py-0.5">
                        {activePlateNutrients.fibreG}g Fibre
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] font-semibold text-amber-200/90">
                      {activePlateNutrients.calciumMg} mg Calcium
                    </div>
                  </div>
                </div>

                {/* Floating & Landing Food Ingredient Cards around the Plate */}
                {PLATE_INGREDIENTS.map((ing, index) => {
                  const isSelected = selectedIngredientIds.includes(ing.id);
                  const floatClass =
                    index % 2 === 0 ? 'animate-gp-float' : 'animate-gp-float-reverse';
                  const positionClass = plateAssembled
                    ? ing.platedPositionClass
                    : ing.orbitPositionClass;

                  return (
                    <button
                      key={ing.id}
                      type="button"
                      data-testid={`plate-ingredient-${ing.id}`}
                      onClick={() => togglePlateIngredient(ing)}
                      className={`${floatClass} ${positionClass} group absolute z-20 flex items-center gap-2 rounded-2xl border bg-gradient-to-r backdrop-blur-md px-2.5 py-1.5 text-left shadow-lg transition-all duration-700 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-300 ${
                        ing.accentColor
                      } ${
                        isSelected
                          ? 'opacity-100 ring-1 ring-amber-300/60'
                          : 'opacity-60 hover:opacity-95'
                      }`}
                      title={`${ing.name} (${ing.regionalName}) — ${ing.highlightBadge}`}
                    >
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-xl border border-white/25 bg-stone-900">
                        <img
                          src={ing.photoUrl}
                          alt={ing.name}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                        <span className="absolute -bottom-0.5 -right-0.5 text-[11px]">
                          {ing.emoji}
                        </span>
                      </div>
                      <div className="pr-1">
                        <div className="text-[11px] font-extrabold text-white leading-tight">
                          {ing.name.split(' (')[0]}
                        </div>
                        <div className="text-[9px] font-semibold text-amber-200/90">
                          {ing.highlightBadge}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Interactive Controls Under the Plate */}
              <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  data-testid="animate-plate-btn"
                  onClick={handleAssemblePlateAnimation}
                  className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-5 py-2.5 text-xs font-extrabold text-stone-950 shadow-lg hover:bg-amber-300 transition transform active:scale-95"
                >
                  <span>{plateAssembled ? '🔄 Float Ingredients Out' : '✨ Assemble Nourishing Plate'}</span>
                </button>
                <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md px-3.5 py-2 text-xs text-emerald-100">
                  <span className="font-bold text-amber-300">{activeIngredientSpot.emoji} {activeIngredientSpot.name}:</span>{' '}
                  <span>{activeIngredientSpot.regionalName} • {activeIngredientSpot.highlightBadge}</span>
                </div>
              </div>
            </div>

            {/* Bottom Floating Nutrition & Feature Highlight Glass Cards */}
            <div className="relative z-10 grid gap-3 sm:grid-cols-3 pt-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-3.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-amber-300">
                  <span>👨‍👩‍👧‍👦 Family Profiles</span>
                  <span className="rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] text-emerald-100">
                    All Ages
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-100/85 leading-snug">
                  Separate allergies from intolerances and tailor guidance for parents, kids &amp; elders.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-3.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-amber-300">
                  <span>🏷️ Barcode &amp; OCR</span>
                  <span className="rounded-full bg-amber-500/30 px-2 py-0.5 text-[10px] text-amber-100">
                    Live Scan
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-100/85 leading-snug">
                  Decode Indian packaged food labels, INS additives, and hidden sugars in seconds.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-md p-3.5">
                <div className="flex items-center justify-between text-xs font-extrabold text-amber-300">
                  <span>🍲 Katori &amp; Roti Math</span>
                  <span className="rounded-full bg-teal-500/30 px-2 py-0.5 text-[10px] text-teal-100">
                    IFCT 2017
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-emerald-100/85 leading-snug">
                  Convert everyday household measures into accurate macros &amp; micronutrients.
                </p>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (5 cols): Glassmorphic Login / Sign-up Card */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <div className="rounded-[2.25rem] border border-stone-200/90 bg-white/95 p-6 sm:p-9 shadow-xl backdrop-blur-xl space-y-6">
              {/* Top Card Header & Segmented Mode Switcher */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[11px] font-extrabold text-emerald-900">
                    <span>🔒</span>
                    <span>Private Account &amp; Household</span>
                  </div>
                  <span className="text-[11px] font-bold text-stone-400">
                    Argon2 &amp; HttpOnly Session
                  </span>
                </div>

                <div>
                  <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-stone-900">
                    {mode === 'login'
                      ? 'Welcome Back to GharPlate'
                      : mode === 'signup'
                      ? 'Create Your Family Account'
                      : 'Reset Your Password'}
                  </h2>
                  <p className="mt-1 text-xs sm:text-sm text-stone-500">
                    {mode === 'login'
                      ? 'Sign in with your registered email and password to access your private household profiles, saved recipes, and AI assistant conversations.'
                      : mode === 'signup'
                      ? 'Create a verified account to establish your private household workspace, family nutrition profiles, and saved recipes.'
                      : 'Enter your registered email address for account recovery guidance.'}
                  </p>
                </div>

                {/* Segmented Switcher between Login and Sign-up */}
                <div
                  role="tablist"
                  aria-label="Authentication Mode"
                  className="grid grid-cols-2 rounded-2xl bg-stone-100 p-1.5 border border-stone-200/80"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'login'}
                    data-testid="tab-login"
                    onClick={() => switchMode('login')}
                    className={`rounded-xl py-2.5 text-xs font-extrabold transition ${
                      mode === 'login'
                        ? 'bg-white text-emerald-950 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={mode === 'signup'}
                    data-testid="tab-signup"
                    onClick={() => switchMode('signup')}
                    className={`rounded-xl py-2.5 text-xs font-extrabold transition ${
                      mode === 'signup'
                        ? 'bg-white text-emerald-950 shadow-sm'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    Sign Up (New User)
                  </button>
                </div>
              </div>

              {/* Validation Error / Success Feedback */}
              {errorMessage && (
                <div
                  role="alert"
                  data-testid="auth-error-banner"
                  className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-900 flex items-start gap-2.5"
                >
                  <span className="text-base leading-none">⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              {successMessage && (
                <div
                  role="status"
                  data-testid="auth-success-banner"
                  className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 flex items-start gap-2.5"
                >
                  <span className="text-base leading-none">✓</span>
                  <span>{successMessage}</span>
                </div>
              )}

              {/* Authentication Form */}
              <form onSubmit={(e) => void handleFormSubmit(e)} noValidate className="space-y-4">
                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-full-name"
                      className="block text-xs font-extrabold text-stone-700"
                    >
                      Full Name or Family Name
                    </label>
                    <input
                      id="auth-full-name"
                      data-testid="signup-name-input"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Priya Rao or Sharma Family"
                      className="mt-1.5 w-full rounded-2xl border border-stone-300 bg-stone-50/60 px-4 py-3 text-sm font-medium text-stone-900 placeholder-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                    />
                  </div>
                )}

                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-extrabold text-stone-700"
                  >
                    Email Address
                  </label>
                  <input
                    id="auth-email"
                    data-testid="auth-email-input"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="mt-1.5 w-full rounded-2xl border border-stone-300 bg-stone-50/60 px-4 py-3 text-sm font-medium text-stone-900 placeholder-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                  />
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <div className="flex items-center justify-between">
                      <label
                        htmlFor="auth-password"
                        className="block text-xs font-extrabold text-stone-700"
                      >
                        Password
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          data-testid="forgot-password-link"
                          onClick={() => switchMode('forgot')}
                          className="text-xs font-bold text-emerald-800 hover:text-emerald-950 hover:underline"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative mt-1.5">
                      <input
                        id="auth-password"
                        data-testid="auth-password-input"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={
                          mode === 'login' ? 'Enter your password' : 'Create a password (6+ chars)'
                        }
                        className="w-full rounded-2xl border border-stone-300 bg-stone-50/60 pl-4 pr-20 py-3 text-sm font-medium text-stone-900 placeholder-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      />
                      <button
                        type="button"
                        data-testid="toggle-password-visibility"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-xl bg-stone-200/80 px-2.5 py-1 text-[11px] font-extrabold text-stone-700 hover:bg-stone-300/80 transition"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    {mode === 'signup' && password.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4].map((step) => (
                            <div
                              key={step}
                              className={`h-1.5 flex-1 rounded-full transition-all ${
                                passwordStrength.score >= step
                                  ? passwordStrength.color
                                  : 'bg-stone-200'
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] font-semibold text-stone-500">
                          Password strength: <strong className="text-stone-800">{passwordStrength.label}</strong>
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {mode === 'signup' && (
                  <div>
                    <label
                      htmlFor="auth-confirm-password"
                      className="block text-xs font-extrabold text-stone-700"
                    >
                      Confirm Password
                    </label>
                    <div className="relative mt-1.5">
                      <input
                        id="auth-confirm-password"
                        data-testid="signup-confirm-password-input"
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter your password"
                        className="w-full rounded-2xl border border-stone-300 bg-stone-50/60 pl-4 pr-20 py-3 text-sm font-medium text-stone-900 placeholder-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-700/20"
                      />
                      <button
                        type="button"
                        data-testid="toggle-confirm-password-visibility"
                        aria-label={
                          showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'
                        }
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-xl bg-stone-200/80 px-2.5 py-1 text-[11px] font-extrabold text-stone-700 hover:bg-stone-300/80 transition"
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                )}

                {mode !== 'forgot' && (
                  <div className="flex items-center justify-between pt-1">
                    <label className="inline-flex items-center gap-2.5 text-xs font-bold text-stone-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        data-testid="remember-me-checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="h-4 w-4 rounded border-stone-300 text-emerald-800 focus:ring-emerald-700"
                      />
                      <span>Remember me on this device</span>
                    </label>
                    <span className="text-[11px] font-medium text-stone-400">
                      HttpOnly Session Cookie
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  data-testid="auth-submit-btn"
                  disabled={isSubmitting}
                  className="w-full rounded-2xl bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 px-6 py-3.5 text-sm font-extrabold text-white shadow-lg hover:from-emerald-800 hover:to-teal-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2 transition disabled:opacity-60"
                >
                  {isSubmitting
                    ? 'Verifying with GharPlate Server...'
                    : mode === 'login'
                    ? 'Login to GharPlate →'
                    : mode === 'signup'
                    ? 'Create Family Account →'
                    : 'Request Password Reset'}
                </button>

                {mode === 'forgot' && (
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full rounded-2xl border border-stone-300 bg-white px-4 py-2.5 text-xs font-extrabold text-stone-700 hover:bg-stone-50"
                  >
                    ← Back to Sign In
                  </button>
                )}
              </form>

              {/* Mode Switch Footer & Essential Session Cookie Notice */}
              <div className="border-t border-stone-200/80 pt-4 space-y-3">
                <div className="flex items-center justify-between text-xs text-stone-600 pt-1">
                  <span>
                    {mode === 'login' ? 'New to GharPlate?' : 'Already have an account?'}
                  </span>
                  <button
                    type="button"
                    data-testid="switch-auth-mode-link"
                    onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
                    className="font-extrabold text-emerald-800 hover:underline"
                  >
                    {mode === 'login' ? 'Create a free family account →' : 'Sign in instead →'}
                  </button>
                </div>

                <p className="rounded-xl bg-stone-100/90 p-2.5 text-[11px] text-stone-500 leading-relaxed">
                  <strong className="text-stone-700">Essential Session Cookie &amp; Privacy Notice:</strong> GharPlate uses a server-validated HttpOnly session cookie and CSRF token to keep your account securely signed in and isolate your family’s household data.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* INTERACTIVE FOOD DISCOVERY & SEARCH PREVIEW SECTION */}
        <section
          id="discover-indian-foods"
          className="rounded-[2.25rem] border border-stone-200/90 bg-white p-6 sm:p-10 shadow-sm space-y-6"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-extrabold text-amber-900">
                <span>🌾</span>
                <span>Live Food Intelligence Preview</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-stone-900">
                Preview Indian Foods, Regional Aliases &amp; Macros
              </h2>
              <p className="text-xs sm:text-sm text-stone-500 max-w-2xl">
                Search by English, Hindi, or Kannada name before signing in — then log in above to unlock full 20-nutrient breakdowns, condition checks, and recipe calculations.
              </p>
            </div>

            {/* Interactive Search Input */}
            <div className="w-full md:w-80">
              <label htmlFor="landing-food-search" className="sr-only">
                Search Indian Foods Preview
              </label>
              <input
                id="landing-food-search"
                data-testid="landing-food-search-input"
                type="search"
                value={discoveryQuery}
                onChange={(e) => setDiscoveryQuery(e.target.value)}
                placeholder="Search Ragi, Idli, Palak, Avalakki, Dahi..."
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-xs sm:text-sm font-medium text-stone-900 placeholder-stone-400 focus:border-emerald-700 focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              'All',
              'Indian Dishes',
              'Cereals & Millets',
              'Pulses & Dals',
              'Dairy & Fermented',
              'Nuts & Seeds',
            ].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategoryChip(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                  selectedCategoryChip === cat
                    ? 'bg-emerald-900 text-white shadow-sm'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Food Photo Cards Grid */}
          {filteredDiscoveryFoods.length === 0 ? (
            <div className="rounded-2xl border border-stone-200 bg-stone-50 p-8 text-center space-y-2">
              <p className="text-sm font-extrabold text-stone-800">
                No preview items match “{discoveryQuery}”
              </p>
              <p className="text-xs text-stone-500">
                Sign in above to search the full 75+ Indian food catalog, Open Food Facts barcodes, and USDA records.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {filteredDiscoveryFoods.map((food) => (
                <div
                  key={food.slug}
                  data-testid={`discovery-food-card-${food.slug}`}
                  className="group overflow-hidden rounded-3xl border border-stone-200/90 bg-[#FAF8F5] shadow-sm transition hover:-translate-y-1 hover:border-emerald-600 hover:shadow-md flex flex-col justify-between"
                >
                  <div>
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-200">
                      <img
                        src={food.photoUrl}
                        alt={food.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <span className="absolute top-2.5 left-2.5 rounded-full bg-white/90 backdrop-blur px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-950">
                        {food.category}
                      </span>
                      <span className="absolute bottom-2.5 left-2.5 rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-extrabold text-stone-950">
                        {food.tag}
                      </span>
                    </div>

                    <div className="p-4 space-y-1">
                      <h3 className="text-sm font-extrabold text-stone-900">
                        {food.name}
                      </h3>
                      <p className="text-[11px] font-semibold text-emerald-800">
                        {food.hindiKannada}
                      </p>
                    </div>
                  </div>

                  <div className="px-4 pb-4 pt-1">
                    <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-white p-2.5 text-center border border-stone-200/70">
                      <div>
                        <div className="text-[10px] font-bold text-stone-400">Energy</div>
                        <div className="text-xs font-black text-stone-900">{food.energyKcal} kcal</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-stone-400">Protein</div>
                        <div className="text-xs font-black text-emerald-800">{food.proteinG}g</div>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-stone-400">Fibre</div>
                        <div className="text-xs font-black text-amber-800">{food.fibreG}g</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
