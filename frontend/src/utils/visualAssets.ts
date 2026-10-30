/**
 * Database-driven & fallback visual asset registry for GharPlate.
 * Provides:
 * 1. Curated food photography URLs (from backend `image_url` or local slug lookup).
 * 2. Distinct, warm SVG botanical/culinary illustrations when offline or when a photo is unavailable
 *    (explicitly marked as an illustration so unavailable images never pretend to be photographs).
 * 3. Condition group visual metadata (icons, warm accent palettes, short everyday summaries).
 */

export interface CategoryVisualMeta {
  slug: string;
  shortTitle: string;
  tagline: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  emojiIcon: string;
  photoUrl: string;
}

export const CATEGORY_VISUALS: Record<string, CategoryVisualMeta> = {
  'cereals-millets': {
    slug: 'cereals-millets',
    shortTitle: 'Grains & Millets',
    tagline: 'Ragi, Jowar, Bajra, Rice & Whole Wheat',
    accentBg: 'bg-amber-50',
    accentText: 'text-amber-900',
    accentBorder: 'border-amber-200',
    emojiIcon: '🌾',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Eleusine_coracana_seeds.jpg/640px-Eleusine_coracana_seeds.jpg',
  },
  'pulses-legumes': {
    slug: 'pulses-legumes',
    shortTitle: 'Pulses & Dals',
    tagline: 'Toor, Moong, Masoor, Chana & Rajma',
    accentBg: 'bg-orange-50',
    accentText: 'text-orange-900',
    accentBorder: 'border-orange-200',
    emojiIcon: '🫘',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Lentils_in_bowls.jpg/640px-Lentils_in_bowls.jpg',
  },
  vegetables: {
    slug: 'vegetables',
    shortTitle: 'Vegetables & Greens',
    tagline: 'Palak, Moringa, Potato, Onion & Gourds',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-900',
    accentBorder: 'border-emerald-200',
    emojiIcon: '🥬',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Spinacia_oleracea_Spinazie_bloeiend.jpg/640px-Spinacia_oleracea_Spinazie_bloeiend.jpg',
  },
  fruits: {
    slug: 'fruits',
    shortTitle: 'Fresh Fruits',
    tagline: 'Guava, Banana, Mango, Papaya & Pomegranate',
    accentBg: 'bg-rose-50',
    accentText: 'text-rose-900',
    accentBorder: 'border-rose-200',
    emojiIcon: '🥭',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Hapus_Mango.jpg/640px-Hapus_Mango.jpg',
  },
  dairy: {
    slug: 'dairy',
    shortTitle: 'Dairy & Fermented',
    tagline: 'Milk, Dahi (Curd), Chaas, Paneer & Cheese',
    accentBg: 'bg-sky-50',
    accentText: 'text-sky-900',
    accentBorder: 'border-sky-200',
    emojiIcon: '🥛',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Paneer_cheese.jpg/640px-Paneer_cheese.jpg',
  },
  'protein-sources': {
    slug: 'protein-sources',
    shortTitle: 'Protein Sources',
    tagline: 'Eggs, Chicken, Rohu Fish, Mutton, Soy & Tofu',
    accentBg: 'bg-red-50',
    accentText: 'text-red-900',
    accentBorder: 'border-red-200',
    emojiIcon: '🥚',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Chicken_eggs.jpg/640px-Chicken_eggs.jpg',
  },
  'nuts-seeds': {
    slug: 'nuts-seeds',
    shortTitle: 'Nuts & Seeds',
    tagline: 'Almonds, Walnuts, Peanuts, Til, Flax & Chia',
    accentBg: 'bg-yellow-50',
    accentText: 'text-yellow-900',
    accentBorder: 'border-yellow-200',
    emojiIcon: '🥜',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Almonds.png/640px-Almonds.png',
  },
  'indian-dishes': {
    slug: 'indian-dishes',
    shortTitle: 'Indian Dishes',
    tagline: 'Idli, Dosa, Ragi Mudde, Khichdi, Sambar & Roti',
    accentBg: 'bg-teal-50',
    accentText: 'text-teal-900',
    accentBorder: 'border-teal-200',
    emojiIcon: '🍛',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Idli_Sambar.JPG/640px-Idli_Sambar.JPG',
  },
  'packaged-foods': {
    slug: 'packaged-foods',
    shortTitle: 'Packaged Foods',
    tagline: 'Oats, Muesli, Biscuits, Noodles, Snacks & Drinks',
    accentBg: 'bg-purple-50',
    accentText: 'text-purple-900',
    accentBorder: 'border-purple-200',
    emojiIcon: '📦',
    photoUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Muesli.jpg/640px-Muesli.jpg',
  },
};

export interface ConditionGroupVisualMeta {
  groupCode: string;
  shortTitle: string;
  subtitle: string;
  icon: string;
  bgClass: string;
  borderClass: string;
  textClass: string;
  badgeClass: string;
}

export const CONDITION_GROUP_VISUALS: Record<string, ConditionGroupVisualMeta> = {
  A_metabolic: {
    groupCode: 'A_metabolic',
    shortTitle: 'Blood Sugar',
    subtitle: 'Type 1 & 2 Diabetes, Prediabetes, Insulin Resistance & GDM',
    icon: '🩸',
    bgClass: 'bg-amber-50/80',
    borderClass: 'border-amber-200',
    textClass: 'text-amber-950',
    badgeClass: 'bg-amber-100 text-amber-900',
  },
  B_cardiovascular: {
    groupCode: 'B_cardiovascular',
    shortTitle: 'Blood Pressure & Heart',
    subtitle: 'Hypertension, High LDL Cholesterol & Lipid Balance',
    icon: '❤️',
    bgClass: 'bg-rose-50/80',
    borderClass: 'border-rose-200',
    textClass: 'text-rose-950',
    badgeClass: 'bg-rose-100 text-rose-900',
  },
  C_kidney: {
    groupCode: 'C_kidney',
    shortTitle: 'Kidney Health',
    subtitle: 'Stage-Aware CKD & Kidney Stone Considerations',
    icon: '💧',
    bgClass: 'bg-sky-50/80',
    borderClass: 'border-sky-200',
    textClass: 'text-sky-950',
    badgeClass: 'bg-sky-100 text-sky-900',
  },
  D_digestive: {
    groupCode: 'D_digestive',
    shortTitle: 'Digestive Comfort',
    subtitle: 'GERD, IBS, Constipation, Lactose & Coeliac Gluten Care',
    icon: '🌿',
    bgClass: 'bg-emerald-50/80',
    borderClass: 'border-emerald-200',
    textClass: 'text-emerald-950',
    badgeClass: 'bg-emerald-100 text-emerald-900',
  },
  E_liver_gout: {
    groupCode: 'E_liver_gout',
    shortTitle: 'Liver & Uric Acid',
    subtitle: 'Fatty Liver (MASLD) & Gout Purine/Sugar Balance',
    icon: '⚖️',
    bgClass: 'bg-orange-50/80',
    borderClass: 'border-orange-200',
    textClass: 'text-orange-950',
    badgeClass: 'bg-orange-100 text-orange-900',
  },
  F_deficiency: {
    groupCode: 'F_deficiency',
    shortTitle: 'Nutrient Deficiencies',
    subtitle: 'Iron Anaemia, Vitamin B12 & Folate Repletion',
    icon: '✨',
    bgClass: 'bg-red-50/80',
    borderClass: 'border-red-200',
    textClass: 'text-red-950',
    badgeClass: 'bg-red-100 text-red-900',
  },
  G_bone: {
    groupCode: 'G_bone',
    shortTitle: 'Bone Strength',
    subtitle: 'Osteoporosis, Dietary Calcium & Vitamin D Support',
    icon: '🦴',
    bgClass: 'bg-stone-100',
    borderClass: 'border-stone-300',
    textClass: 'text-stone-900',
    badgeClass: 'bg-stone-200 text-stone-900',
  },
  H_short_term_illness: {
    groupCode: 'H_short_term_illness',
    shortTitle: 'Fever & Recovery',
    subtitle: 'Short-Term Illness Hydration, Khichdi & Gentle Foods',
    icon: '🍵',
    bgClass: 'bg-teal-50/80',
    borderClass: 'border-teal-200',
    textClass: 'text-teal-950',
    badgeClass: 'bg-teal-100 text-teal-900',
  },
  I_life_stage: {
    groupCode: 'I_life_stage',
    shortTitle: 'Life Stages',
    subtitle: 'Pregnancy, Lactation, Children & Older Adults',
    icon: '👨‍👩‍👧‍👦',
    bgClass: 'bg-indigo-50/80',
    borderClass: 'border-indigo-200',
    textClass: 'text-indigo-950',
    badgeClass: 'bg-indigo-100 text-indigo-900',
  },
};

/**
 * Generates a clean, food-specific SVG illustration data URI when an external photograph
 * is offline or unavailable. Clearly styled as a botanical/culinary illustration card.
 */
export function buildFoodIllustrationDataUri(
  foodName: string,
  categorySlug = 'indian-dishes'
): string {
  const cat = CATEGORY_VISUALS[categorySlug] || CATEGORY_VISUALS['indian-dishes'];
  const paletteMap: Record<string, [string, string, string]> = {
    'cereals-millets': ['#fef3c7', '#d97706', '#78350f'],
    'pulses-legumes': ['#ffedd5', '#ea580c', '#7c2d12'],
    vegetables: ['#d1fae5', '#059669', '#064e3b'],
    fruits: ['#ffe4e6', '#e11d48', '#881337'],
    dairy: ['#e0f2fe', '#0284c7', '#0c4a6e'],
    'protein-sources': ['#fee2e2', '#dc2626', '#7f1d1d'],
    'nuts-seeds': ['#fef9c3', '#ca8a04', '#713f12'],
    'indian-dishes': ['#ccfbf1', '#0d9488', '#134e4a'],
    'packaged-foods': ['#f3e8ff', '#9333ea', '#581c87'],
  };
  const [bgHex, accentHex, textHex] =
    paletteMap[categorySlug] || paletteMap['indian-dishes'];
  const safeTitle = foodName.replace(/[<>&"']/g, '').slice(0, 28);
  const safeCat = cat.shortTitle.replace(/[<>&"']/g, '');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 260" width="400" height="260">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${bgHex}" />
        <stop offset="100%" stop-color="#ffffff" />
      </linearGradient>
    </defs>
    <rect width="400" height="260" fill="url(#g)" />
    <circle cx="330" cy="50" r="85" fill="${accentHex}" opacity="0.10" />
    <circle cx="70" cy="210" r="70" fill="${accentHex}" opacity="0.08" />
    <circle cx="200" cy="105" r="46" fill="#ffffff" stroke="${accentHex}" stroke-width="2.5" opacity="0.95" />
    <text x="200" y="120" text-anchor="middle" font-size="38">${cat.emojiIcon}</text>
    <text x="200" y="182" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" font-weight="700" fill="${textHex}">${safeTitle}</text>
    <text x="200" y="205" text-anchor="middle" font-family="system-ui, sans-serif" font-size="11" font-weight="600" fill="${accentHex}">${safeCat} • Illustrated Reference</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
