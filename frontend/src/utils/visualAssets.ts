/**
 * Database-driven & local asset registry for GharPlate.
 * Provides:
 * 1. Curated local food photography paths (`/images/foods/<category>/<slug>.webp`) and category photos (`/images/categories/<slug>.webp`).
 * 2. Exact food-slug and food-name image lookup so individual food cards always use their own food photograph first and never fall back to a generic category photo.
 * 3. Distinct, warm SVG botanical/culinary illustrations only when no suitable photograph exists or when an image fails to load.
 * 4. Condition group visual metadata (icons, warm accent palettes, short everyday summaries).
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
    photoUrl: '/images/categories/cereals-millets.webp',
  },
  'pulses-legumes': {
    slug: 'pulses-legumes',
    shortTitle: 'Pulses & Dals',
    tagline: 'Toor, Moong, Masoor, Chana & Rajma',
    accentBg: 'bg-orange-50',
    accentText: 'text-orange-900',
    accentBorder: 'border-orange-200',
    emojiIcon: '🫘',
    photoUrl: '/images/categories/pulses-legumes.webp',
  },
  vegetables: {
    slug: 'vegetables',
    shortTitle: 'Vegetables & Greens',
    tagline: 'Palak, Moringa, Potato, Onion & Gourds',
    accentBg: 'bg-emerald-50',
    accentText: 'text-emerald-900',
    accentBorder: 'border-emerald-200',
    emojiIcon: '🥬',
    photoUrl: '/images/categories/vegetables.webp',
  },
  fruits: {
    slug: 'fruits',
    shortTitle: 'Fresh Fruits',
    tagline: 'Guava, Banana, Mango, Papaya & Pomegranate',
    accentBg: 'bg-rose-50',
    accentText: 'text-rose-900',
    accentBorder: 'border-rose-200',
    emojiIcon: '🥭',
    photoUrl: '/images/categories/fruits.webp',
  },
  dairy: {
    slug: 'dairy',
    shortTitle: 'Dairy & Fermented',
    tagline: 'Milk, Dahi (Curd), Chaas, Paneer & Cheese',
    accentBg: 'bg-sky-50',
    accentText: 'text-sky-900',
    accentBorder: 'border-sky-200',
    emojiIcon: '🥛',
    photoUrl: '/images/categories/dairy.webp',
  },
  'protein-sources': {
    slug: 'protein-sources',
    shortTitle: 'Protein Sources',
    tagline: 'Eggs, Chicken, Rohu Fish, Mutton, Soy & Tofu',
    accentBg: 'bg-red-50',
    accentText: 'text-red-900',
    accentBorder: 'border-red-200',
    emojiIcon: '🥚',
    photoUrl: '/images/categories/protein-sources.webp',
  },
  'nuts-seeds': {
    slug: 'nuts-seeds',
    shortTitle: 'Nuts & Seeds',
    tagline: 'Almonds, Walnuts, Peanuts, Til, Flax & Chia',
    accentBg: 'bg-yellow-50',
    accentText: 'text-yellow-900',
    accentBorder: 'border-yellow-200',
    emojiIcon: '🥜',
    photoUrl: '/images/categories/nuts-seeds.webp',
  },
  'indian-dishes': {
    slug: 'indian-dishes',
    shortTitle: 'Indian Dishes',
    tagline: 'Idli, Dosa, Ragi Mudde, Khichdi, Sambar & Roti',
    accentBg: 'bg-teal-50',
    accentText: 'text-teal-900',
    accentBorder: 'border-teal-200',
    emojiIcon: '🍛',
    photoUrl: '/images/categories/indian-dishes.webp',
  },
  'packaged-foods': {
    slug: 'packaged-foods',
    shortTitle: 'Packaged Foods',
    tagline: 'Oats, Muesli, Biscuits, Noodles, Snacks & Drinks',
    accentBg: 'bg-purple-50',
    accentText: 'text-purple-900',
    accentBorder: 'border-purple-200',
    emojiIcon: '📦',
    photoUrl: '/images/categories/packaged-foods.webp',
  },
};

export const FOOD_LOCAL_IMAGE_PATHS: Record<string, string> = {
  // 1. Cereals & Millets
  'rice-raw-milled': '/images/foods/cereals-millets/rice-raw-milled.webp',
  'brown-rice': '/images/foods/cereals-millets/brown-rice.webp',
  'wheat-whole-flour': '/images/foods/cereals-millets/wheat-whole-flour.webp',
  'ragi-finger-millet': '/images/foods/cereals-millets/ragi-finger-millet.webp',
  'jowar-sorghum': '/images/foods/cereals-millets/jowar-sorghum.webp',
  'bajra-pearl-millet': '/images/foods/cereals-millets/bajra-pearl-millet.webp',
  'foxtail-millet-navane': '/images/foods/cereals-millets/foxtail-millet-navane.webp',
  // 2. Pulses & Legumes
  'toor-dal-red-gram': '/images/foods/pulses-legumes/toor-dal-red-gram.webp',
  'moong-dal-green-gram': '/images/foods/pulses-legumes/moong-dal-green-gram.webp',
  'masoor-dal-red-lentil': '/images/foods/pulses-legumes/masoor-dal-red-lentil.webp',
  'chana-dal-bengal-gram': '/images/foods/pulses-legumes/chana-dal-bengal-gram.webp',
  'chickpeas-kabuli-chana': '/images/foods/pulses-legumes/chickpeas-kabuli-chana.webp',
  'rajma-kidney-beans': '/images/foods/pulses-legumes/rajma-kidney-beans.webp',
  'black-gram-urad-dal': '/images/foods/pulses-legumes/black-gram-urad-dal.webp',
  // 3. Vegetables
  'potato-raw': '/images/foods/vegetables/potato-raw.webp',
  'tomato-ripe': '/images/foods/vegetables/tomato-ripe.webp',
  'onion-big': '/images/foods/vegetables/onion-big.webp',
  'spinach-palak': '/images/foods/vegetables/spinach-palak.webp',
  'carrot-orange': '/images/foods/vegetables/carrot-orange.webp',
  'cabbage-green': '/images/foods/vegetables/cabbage-green.webp',
  cauliflower: '/images/foods/vegetables/cauliflower.webp',
  'french-beans': '/images/foods/vegetables/french-beans.webp',
  'cucumber-green': '/images/foods/vegetables/cucumber-green.webp',
  'drumstick-leaves-moringa': '/images/foods/vegetables/drumstick-leaves-moringa.webp',
  // 4. Fruits
  'banana-ripe': '/images/foods/fruits/banana-ripe.webp',
  'apple-red': '/images/foods/fruits/apple-red.webp',
  'mango-ripe': '/images/foods/fruits/mango-ripe.webp',
  'orange-nagpur': '/images/foods/fruits/orange-nagpur.webp',
  'papaya-ripe': '/images/foods/fruits/papaya-ripe.webp',
  'guava-white-flesh': '/images/foods/fruits/guava-white-flesh.webp',
  pomegranate: '/images/foods/fruits/pomegranate.webp',
  // 5. Dairy
  'milk-cow-whole': '/images/foods/dairy/milk-cow-whole.webp',
  'curd-dahi-whole-milk': '/images/foods/dairy/curd-dahi-whole-milk.webp',
  'buttermilk-chaas': '/images/foods/dairy/buttermilk-chaas.webp',
  'paneer-cottage-cheese': '/images/foods/dairy/paneer-cottage-cheese.webp',
  'cheese-processed-cheddar': '/images/foods/dairy/cheese-processed-cheddar.webp',
  // 6. Protein Sources
  'egg-poultry-whole': '/images/foods/protein-sources/egg-poultry-whole.webp',
  'chicken-breast-skinless': '/images/foods/protein-sources/chicken-breast-skinless.webp',
  'rohu-fish-freshwater': '/images/foods/protein-sources/rohu-fish-freshwater.webp',
  'mutton-goat-lean': '/images/foods/protein-sources/mutton-goat-lean.webp',
  'soybean-brown': '/images/foods/protein-sources/soybean-brown.webp',
  'tofu-firm-soy': '/images/foods/protein-sources/tofu-firm-soy.webp',
  // 7. Nuts & Seeds
  'almonds-badam': '/images/foods/nuts-seeds/almonds-badam.webp',
  'peanuts-groundnut': '/images/foods/nuts-seeds/peanuts-groundnut.webp',
  'cashews-kaju': '/images/foods/nuts-seeds/cashews-kaju.webp',
  'walnuts-akhrot': '/images/foods/nuts-seeds/walnuts-akhrot.webp',
  'flaxseeds-alsi': '/images/foods/nuts-seeds/flaxseeds-alsi.webp',
  'chia-seeds': '/images/foods/nuts-seeds/chia-seeds.webp',
  'sesame-seeds-til': '/images/foods/nuts-seeds/sesame-seeds-til.webp',
  // 8. Indian Dishes
  'idli-steamed-rice-lentil': '/images/foods/indian-dishes/idli-steamed-rice-lentil.webp',
  'dosa-plain': '/images/foods/indian-dishes/dosa-plain.webp',
  'masala-dosa': '/images/foods/indian-dishes/masala-dosa.webp',
  'ragi-mudde-finger-millet-ball': '/images/foods/indian-dishes/ragi-mudde-finger-millet-ball.webp',
  'chapati-roti-whole-wheat': '/images/foods/indian-dishes/chapati-roti-whole-wheat.webp',
  'paratha-plain-wheat': '/images/foods/indian-dishes/paratha-plain-wheat.webp',
  'poha-avalakki-cooked': '/images/foods/indian-dishes/poha-avalakki-cooked.webp',
  'upma-uppittu-semolina': '/images/foods/indian-dishes/upma-uppittu-semolina.webp',
  'bisi-bele-bath': '/images/foods/indian-dishes/bisi-bele-bath.webp',
  'pongal-khara-ven-pongal': '/images/foods/indian-dishes/pongal-khara-ven-pongal.webp',
  'khichdi-moong-dal-rice': '/images/foods/indian-dishes/khichdi-moong-dal-rice.webp',
  'sambar-vegetable-lentil-stew': '/images/foods/indian-dishes/sambar-vegetable-lentil-stew.webp',
  'rasam-tomato-pepper': '/images/foods/indian-dishes/rasam-tomato-pepper.webp',
  'dal-rice-combined': '/images/foods/indian-dishes/dal-rice-combined.webp',
  'curd-rice-mosaranna': '/images/foods/indian-dishes/curd-rice-mosaranna.webp',
  'vegetable-pulao': '/images/foods/indian-dishes/vegetable-pulao.webp',
  'chicken-biryani': '/images/foods/indian-dishes/chicken-biryani.webp',
  'palak-paneer-curry': '/images/foods/indian-dishes/palak-paneer-curry.webp',
  // 9. Packaged Foods
  'packaged-crunchy-muesli-almond': '/images/foods/packaged-foods/packaged-crunchy-muesli-almond.webp',
  'packaged-rolled-oats-plain': '/images/foods/packaged-foods/packaged-rolled-oats-plain.webp',
  'packaged-glucose-biscuits': '/images/foods/packaged-foods/packaged-glucose-biscuits.webp',
  'packaged-digestive-marie-biscuits': '/images/foods/packaged-foods/packaged-digestive-marie-biscuits.webp',
  'packaged-instant-masala-noodles': '/images/foods/packaged-foods/packaged-instant-masala-noodles.webp',
  'packaged-salted-potato-chips': '/images/foods/packaged-foods/packaged-salted-potato-chips.webp',
  'packaged-sweetened-mango-drink': '/images/foods/packaged-foods/packaged-sweetened-mango-drink.webp',
  'packaged-ready-to-eat-dal-makhani': '/images/foods/packaged-foods/packaged-ready-to-eat-dal-makhani.webp',
};

/**
 * Resolves the exact local food photograph for an item (by slug or foodName), or returns
 * the provided `src` when it is a valid local path or verified external product image.
 * Never substitutes a generic category photograph for an individual food item.
 */
export function resolveFoodSpecificPhotoUrl(
  src?: string | null,
  foodName?: string,
  foodSlug?: string
): string | null {
  if (foodSlug && FOOD_LOCAL_IMAGE_PATHS[foodSlug]) {
    // For packaged foods, if `src` is an external verified barcode image (e.g. Open Food Facts),
    // prefer that exact product image; otherwise use the local food image.
    if (
      src &&
      (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:image/')) &&
      !src.includes('upload.wikimedia.org/wikipedia/commons/thumb/')
    ) {
      return src;
    }
    return FOOD_LOCAL_IMAGE_PATHS[foodSlug];
  }

  if (src && src.trim()) {
    const trimmed = src.trim();
    if (!trimmed.includes('upload.wikimedia.org/wikipedia/commons/thumb/')) {
      return trimmed;
    }
  }

  if (foodName) {
    const norm = foodName.toLowerCase();
    for (const [slug, localPath] of Object.entries(FOOD_LOCAL_IMAGE_PATHS)) {
      const slugWords = slug.split('-').filter((w) => w.length > 2 && w !== 'raw' && w !== 'ripe');
      if (slugWords.length > 0 && slugWords.every((w) => norm.includes(w))) {
        return localPath;
      }
    }
  }

  return null;
}

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
