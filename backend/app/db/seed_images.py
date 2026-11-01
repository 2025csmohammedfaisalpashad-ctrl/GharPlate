"""
Curated, item-specific, open-licensed food photography registry (Wikimedia Commons / Open Food Facts)
stored locally in `frontend/public/images/foods/<category_slug>/<food_slug>.webp` and
`frontend/public/images/categories/<category_slug>.webp` for reliable, zero-broken-link loading.
Full creator and license attribution is documented in `docs/IMAGE_ATTRIBUTION.md` and
`frontend/public/images/foods/attribution.json`.
"""


CATEGORY_IMAGE_URLS: dict[str, str] = {
    "cereals-millets": "/images/categories/cereals-millets.webp",
    "pulses-legumes": "/images/categories/pulses-legumes.webp",
    "vegetables": "/images/categories/vegetables.webp",
    "fruits": "/images/categories/fruits.webp",
    "dairy": "/images/categories/dairy.webp",
    "protein-sources": "/images/categories/protein-sources.webp",
    "nuts-seeds": "/images/categories/nuts-seeds.webp",
    "indian-dishes": "/images/categories/indian-dishes.webp",
    "packaged-foods": "/images/categories/packaged-foods.webp",
}

FOOD_IMAGE_URLS: dict[str, str] = {
    # 1. Cereals & Millets
    "rice-raw-milled": "/images/foods/cereals-millets/rice-raw-milled.webp",
    "brown-rice": "/images/foods/cereals-millets/brown-rice.webp",
    "wheat-whole-flour": "/images/foods/cereals-millets/wheat-whole-flour.webp",
    "ragi-finger-millet": "/images/foods/cereals-millets/ragi-finger-millet.webp",
    "jowar-sorghum": "/images/foods/cereals-millets/jowar-sorghum.webp",
    "bajra-pearl-millet": "/images/foods/cereals-millets/bajra-pearl-millet.webp",
    "foxtail-millet-navane": "/images/foods/cereals-millets/foxtail-millet-navane.webp",
    # 2. Pulses & Legumes
    "toor-dal-red-gram": "/images/foods/pulses-legumes/toor-dal-red-gram.webp",
    "moong-dal-green-gram": "/images/foods/pulses-legumes/moong-dal-green-gram.webp",
    "masoor-dal-red-lentil": "/images/foods/pulses-legumes/masoor-dal-red-lentil.webp",
    "chana-dal-bengal-gram": "/images/foods/pulses-legumes/chana-dal-bengal-gram.webp",
    "chickpeas-kabuli-chana": "/images/foods/pulses-legumes/chickpeas-kabuli-chana.webp",
    "rajma-kidney-beans": "/images/foods/pulses-legumes/rajma-kidney-beans.webp",
    "black-gram-urad-dal": "/images/foods/pulses-legumes/black-gram-urad-dal.webp",
    # 3. Vegetables
    "potato-raw": "/images/foods/vegetables/potato-raw.webp",
    "tomato-ripe": "/images/foods/vegetables/tomato-ripe.webp",
    "onion-big": "/images/foods/vegetables/onion-big.webp",
    "spinach-palak": "/images/foods/vegetables/spinach-palak.webp",
    "carrot-orange": "/images/foods/vegetables/carrot-orange.webp",
    "cabbage-green": "/images/foods/vegetables/cabbage-green.webp",
    "cauliflower": "/images/foods/vegetables/cauliflower.webp",
    "french-beans": "/images/foods/vegetables/french-beans.webp",
    "cucumber-green": "/images/foods/vegetables/cucumber-green.webp",
    "drumstick-leaves-moringa": "/images/foods/vegetables/drumstick-leaves-moringa.webp",
    # 4. Fruits
    "banana-ripe": "/images/foods/fruits/banana-ripe.webp",
    "apple-red": "/images/foods/fruits/apple-red.webp",
    "mango-ripe": "/images/foods/fruits/mango-ripe.webp",
    "orange-nagpur": "/images/foods/fruits/orange-nagpur.webp",
    "papaya-ripe": "/images/foods/fruits/papaya-ripe.webp",
    "guava-white-flesh": "/images/foods/fruits/guava-white-flesh.webp",
    "pomegranate": "/images/foods/fruits/pomegranate.webp",
    # 5. Dairy
    "milk-cow-whole": "/images/foods/dairy/milk-cow-whole.webp",
    "curd-dahi-whole-milk": "/images/foods/dairy/curd-dahi-whole-milk.webp",
    "buttermilk-chaas": "/images/foods/dairy/buttermilk-chaas.webp",
    "paneer-cottage-cheese": "/images/foods/dairy/paneer-cottage-cheese.webp",
    "cheese-processed-cheddar": "/images/foods/dairy/cheese-processed-cheddar.webp",
    # 6. Protein Sources
    "egg-poultry-whole": "/images/foods/protein-sources/egg-poultry-whole.webp",
    "chicken-breast-skinless": "/images/foods/protein-sources/chicken-breast-skinless.webp",
    "rohu-fish-freshwater": "/images/foods/protein-sources/rohu-fish-freshwater.webp",
    "mutton-goat-lean": "/images/foods/protein-sources/mutton-goat-lean.webp",
    "soybean-brown": "/images/foods/protein-sources/soybean-brown.webp",
    "tofu-firm-soy": "/images/foods/protein-sources/tofu-firm-soy.webp",
    # 7. Nuts & Seeds
    "almonds-badam": "/images/foods/nuts-seeds/almonds-badam.webp",
    "peanuts-groundnut": "/images/foods/nuts-seeds/peanuts-groundnut.webp",
    "cashews-kaju": "/images/foods/nuts-seeds/cashews-kaju.webp",
    "walnuts-akhrot": "/images/foods/nuts-seeds/walnuts-akhrot.webp",
    "flaxseeds-alsi": "/images/foods/nuts-seeds/flaxseeds-alsi.webp",
    "chia-seeds": "/images/foods/nuts-seeds/chia-seeds.webp",
    "sesame-seeds-til": "/images/foods/nuts-seeds/sesame-seeds-til.webp",
    # 8. Indian Dishes
    "idli-steamed-rice-lentil": "/images/foods/indian-dishes/idli-steamed-rice-lentil.webp",
    "dosa-plain": "/images/foods/indian-dishes/dosa-plain.webp",
    "masala-dosa": "/images/foods/indian-dishes/masala-dosa.webp",
    "ragi-mudde-finger-millet-ball": "/images/foods/indian-dishes/ragi-mudde-finger-millet-ball.webp",
    "chapati-roti-whole-wheat": "/images/foods/indian-dishes/chapati-roti-whole-wheat.webp",
    "paratha-plain-wheat": "/images/foods/indian-dishes/paratha-plain-wheat.webp",
    "poha-avalakki-cooked": "/images/foods/indian-dishes/poha-avalakki-cooked.webp",
    "upma-uppittu-semolina": "/images/foods/indian-dishes/upma-uppittu-semolina.webp",
    "bisi-bele-bath": "/images/foods/indian-dishes/bisi-bele-bath.webp",
    "pongal-khara-ven-pongal": "/images/foods/indian-dishes/pongal-khara-ven-pongal.webp",
    "khichdi-moong-dal-rice": "/images/foods/indian-dishes/khichdi-moong-dal-rice.webp",
    "sambar-vegetable-lentil-stew": "/images/foods/indian-dishes/sambar-vegetable-lentil-stew.webp",
    "rasam-tomato-pepper": "/images/foods/indian-dishes/rasam-tomato-pepper.webp",
    "dal-rice-combined": "/images/foods/indian-dishes/dal-rice-combined.webp",
    "curd-rice-mosaranna": "/images/foods/indian-dishes/curd-rice-mosaranna.webp",
    "vegetable-pulao": "/images/foods/indian-dishes/vegetable-pulao.webp",
    "chicken-biryani": "/images/foods/indian-dishes/chicken-biryani.webp",
    "palak-paneer-curry": "/images/foods/indian-dishes/palak-paneer-curry.webp",
    # 9. Packaged Foods
    "packaged-crunchy-muesli-almond": "/images/foods/packaged-foods/packaged-crunchy-muesli-almond.webp",
    "packaged-rolled-oats-plain": "/images/foods/packaged-foods/packaged-rolled-oats-plain.webp",
    "packaged-glucose-biscuits": "/images/foods/packaged-foods/packaged-glucose-biscuits.webp",
    "packaged-digestive-marie-biscuits": "/images/foods/packaged-foods/packaged-digestive-marie-biscuits.webp",
    "packaged-instant-masala-noodles": "/images/foods/packaged-foods/packaged-instant-masala-noodles.webp",
    "packaged-salted-potato-chips": "/images/foods/packaged-foods/packaged-salted-potato-chips.webp",
    "packaged-sweetened-mango-drink": "/images/foods/packaged-foods/packaged-sweetened-mango-drink.webp",
    "packaged-ready-to-eat-dal-makhani": "/images/foods/packaged-foods/packaged-ready-to-eat-dal-makhani.webp",
}


def resolve_food_image_url(slug: str, category_slug: str = "indian-dishes") -> str | None:
    """
    Resolves the exact food-specific local photograph for a given food slug.
    Does NOT substitute a generic category photograph for an individual food item.
    """
    return FOOD_IMAGE_URLS.get(slug)


def resolve_category_image_url(category_slug: str) -> str:
    return CATEGORY_IMAGE_URLS.get(category_slug) or CATEGORY_IMAGE_URLS["indian-dishes"]
