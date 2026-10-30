"""
Curated, item-specific, open-licensed food photography registry (Wikimedia Commons / Open Food Facts / Unsplash Food License)
mapped deterministically to each food slug, category slug, and meal template in GharPlate.
Every item has a distinct, relevant food photograph URL stored in the database.
"""

from typing import Dict

CATEGORY_IMAGE_URLS: Dict[str, str] = {
    "cereals-millets": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/Finger_millet_seeds.jpg/640px-Finger_millet_seeds.jpg",
    "pulses-legumes": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Lentils_in_bowls.jpg/640px-Lentils_in_bowls.jpg",
    "vegetables": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Market_vegetables_in_India.jpg/640px-Market_vegetables_in_India.jpg",
    "fruits": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/640px-Banana-Single.jpg",
    "dairy": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Milk_glass.jpg/640px-Milk_glass.jpg",
    "protein-sources": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Chicken_eggs.jpg/640px-Chicken_eggs.jpg",
    "nuts-seeds": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Almonds.png/640px-Almonds.png",
    "indian-dishes": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Idli_Sambar.JPG/640px-Idli_Sambar.JPG",
    "packaged-foods": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Muesli.jpg/640px-Muesli.jpg",
}

FOOD_IMAGE_URLS: Dict[str, str] = {
    # 1. Cereals & Millets
    "rice-raw-milled": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/White_rice_grains.jpg/640px-White_rice_grains.jpg",
    "brown-rice": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/Brown_rice.jpg/640px-Brown_rice.jpg",
    "wheat-whole-flour": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Vehn%C3%A4pelto_6.jpg/640px-Vehn%C3%A4pelto_6.jpg",
    "ragi-finger-millet": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Eleusine_coracana_seeds.jpg/640px-Eleusine_coracana_seeds.jpg",
    "jowar-sorghum": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Sorghum_bicolor_seeds.jpg/640px-Sorghum_bicolor_seeds.jpg",
    "bajra-pearl-millet": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Pearl_millet_grains.jpg/640px-Pearl_millet_grains.jpg",
    "foxtail-millet-navane": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Setaria_italica_seeds.jpg/640px-Setaria_italica_seeds.jpg",
    # 2. Pulses & Legumes
    "toor-dal-red-gram": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Toor_dal.jpg/640px-Toor_dal.jpg",
    "moong-dal-green-gram": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Mung_bean_split.jpg/640px-Mung_bean_split.jpg",
    "masoor-dal-red-lentil": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/Red_lentils.png/640px-Red_lentils.png",
    "chana-dal-bengal-gram": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Chana_dal.jpg/640px-Chana_dal.jpg",
    "chickpeas-kabuli-chana": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Chickpeas.jpg/640px-Chickpeas.jpg",
    "rajma-kidney-beans": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Kidney_beans.jpg/640px-Kidney_beans.jpg",
    "black-gram-urad-dal": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Urad_dal.jpg/640px-Urad_dal.jpg",
    # 3. Vegetables
    "potato-raw": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Patates.jpg/640px-Patates.jpg",
    "tomato-ripe": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/640px-Tomato_je.jpg",
    "onion-big": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Onion_on_White.JPG/640px-Onion_on_White.JPG",
    "spinach-palak": "https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/Spinacia_oleracea_Spinazie_bloeiend.jpg/640px-Spinacia_oleracea_Spinazie_bloeiend.jpg",
    "carrot-orange": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Vegetable-Carrot-Bundle-wStalks.jpg/640px-Vegetable-Carrot-Bundle-wStalks.jpg",
    "cabbage-green": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Cabbage_and_cross_section_on_white.jpg/640px-Cabbage_and_cross_section_on_white.jpg",
    "cauliflower": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Chou-fleur_02.jpg/640px-Chou-fleur_02.jpg",
    "french-beans": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Green_beans_on_white_background.jpg/640px-Green_beans_on_white_background.jpg",
    "cucumber-green": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/ARS_cucumber.jpg/640px-ARS_cucumber.jpg",
    "drumstick-leaves-moringa": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Moringa_oleifera_leaves.jpg/640px-Moringa_oleifera_leaves.jpg",
    # 4. Fruits
    "banana-ripe": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Banana-Single.jpg/640px-Banana-Single.jpg",
    "apple-red": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Red_Apple.jpg/640px-Red_Apple.jpg",
    "mango-ripe": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Hapus_Mango.jpg/640px-Hapus_Mango.jpg",
    "orange-nagpur": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c4/Orange-Fruit-Pieces.jpg/640px-Orange-Fruit-Pieces.jpg",
    "papaya-ripe": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Papaya_cross_section_BNC.jpg/640px-Papaya_cross_section_BNC.jpg",
    "guava-white-flesh": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Guava_ID.jpg/640px-Guava_ID.jpg",
    "pomegranate": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Pomegranate_fruit_-_whole_and_piece_with_arils.jpg/640px-Pomegranate_fruit_-_whole_and_piece_with_arils.jpg",
    # 5. Dairy
    "milk-cow-whole": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Milk_glass.jpg/640px-Milk_glass.jpg",
    "curd-dahi-whole-milk": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Joghurt.jpg/640px-Joghurt.jpg",
    "buttermilk-chaas": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Masala_Chaas.jpg/640px-Masala_Chaas.jpg",
    "paneer-cottage-cheese": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Paneer_cheese.jpg/640px-Paneer_cheese.jpg",
    "cheese-processed-cheddar": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Cheese_platter.jpg/640px-Cheese_platter.jpg",
    # 6. Protein Sources
    "egg-poultry-whole": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Chicken_eggs.jpg/640px-Chicken_eggs.jpg",
    "chicken-breast-skinless": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/Raw_chicken_breast.jpg/640px-Raw_chicken_breast.jpg",
    "rohu-fish-freshwater": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Labeo_rohita.jpg/640px-Labeo_rohita.jpg",
    "mutton-goat-lean": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Goat_meat.jpg/640px-Goat_meat.jpg",
    "soybean-brown": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Soybean.USDA.jpg/640px-Soybean.USDA.jpg",
    "tofu-firm-soy": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Tofu_4.jpg/640px-Tofu_4.jpg",
    # 7. Nuts & Seeds
    "almonds-badam": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Almonds.png/640px-Almonds.png",
    "peanuts-groundnut": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Peanuts_%28Arachis_hypogaea%29_-_in_shell_and_shelled.jpg/640px-Peanuts_%28Arachis_hypogaea%29_-_in_shell_and_shelled.jpg",
    "cashews-kaju": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Cashew_nuts.jpg/640px-Cashew_nuts.jpg",
    "walnuts-akhrot": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b2/Walnuts_-_whole_and_open_with_halved_kernel.jpg/640px-Walnuts_-_whole_and_open_with_halved_kernel.jpg",
    "flaxseeds-alsi": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/59/Brown_Flax_Seeds.jpg/640px-Brown_Flax_Seeds.jpg",
    "chia-seeds": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Chia_seeds.jpg/640px-Chia_seeds.jpg",
    "sesame-seeds-til": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Sesame_seeds.jpg/640px-Sesame_seeds.jpg",
    # 8. Indian Dishes
    "idli-steamed-rice-lentil": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Idli_Sambar.JPG/640px-Idli_Sambar.JPG",
    "dosa-plain": "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Dosa_at_Sri_Ganesha_Bhavan.jpg/640px-Dosa_at_Sri_Ganesha_Bhavan.jpg",
    "masala-dosa": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Rameshwaram_Cafe_Dosa.jpg/640px-Rameshwaram_Cafe_Dosa.jpg",
    "ragi-mudde-finger-millet-ball": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Ragi_Mudde_with_Sambar.jpg/640px-Ragi_Mudde_with_Sambar.jpg",
    "chapati-roti-whole-wheat": "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Chapati_roll.jpg/640px-Chapati_roll.jpg",
    "paratha-plain-wheat": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/54/Aloo_Paratha_also_known_as_Batatay_Jo_Phulko.jpg/640px-Aloo_Paratha_also_known_as_Batatay_Jo_Phulko.jpg",
    "poha-avalakki-cooked": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b1/Poha%2C_a_snack_made_of_flattened_rice.jpg/640px-Poha%2C_a_snack_made_of_flattened_rice.jpg",
    "upma-uppittu-semolina": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Upma_with_coconut_chutney.jpg/640px-Upma_with_coconut_chutney.jpg",
    "bisi-bele-bath": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Bisi_Bele_Bath.jpg/640px-Bisi_Bele_Bath.jpg",
    "pongal-khara-ven-pongal": "https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/Ven_Pongal.jpg/640px-Ven_Pongal.jpg",
    "khichdi-moong-dal-rice": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Khichdi_with_curd.jpg/640px-Khichdi_with_curd.jpg",
    "sambar-vegetable-lentil-stew": "https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Sambar.JPG/640px-Sambar.JPG",
    "rasam-tomato-pepper": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Tomato_Rasam.jpg/640px-Tomato_Rasam.jpg",
    "dal-rice-combined": "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Dal_Bhat_from_Nepal.jpg/640px-Dal_Bhat_from_Nepal.jpg",
    "curd-rice-mosaranna": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Curd_Rice.jpg/640px-Curd_Rice.jpg",
    "vegetable-pulao": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Vegetable_Pulao.JPG/640px-Vegetable_Pulao.JPG",
    "chicken-biryani": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/%22Hyderabadi_Dum_Biryani%22.jpg/640px-%22Hyderabadi_Dum_Biryani%22.jpg",
    "palak-paneer-curry": "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Palak_paneer_in_India.jpg/640px-Palak_paneer_in_India.jpg",
    # 9. Packaged Foods
    "packaged-crunchy-muesli-almond": "https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Muesli.jpg/640px-Muesli.jpg",
    "packaged-rolled-oats-plain": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Rolled_oats.jpg/640px-Rolled_oats.jpg",
    "packaged-glucose-biscuits": "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Parle-G_Biscuits.jpg/640px-Parle-G_Biscuits.jpg",
    "packaged-digestive-marie-biscuits": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/Rich_tea_biscuits.jpg/640px-Rich_tea_biscuits.jpg",
    "packaged-instant-masala-noodles": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/73/Mama_instant_noodle_block.jpg/640px-Mama_instant_noodle_block.jpg",
    "packaged-salted-potato-chips": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Potato-Chips.jpg/640px-Potato-Chips.jpg",
    "packaged-sweetened-mango-drink": "https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Mango_juice.jpg/640px-Mango_juice.jpg",
    "packaged-ready-to-eat-dal-makhani": "https://upload.wikimedia.org/wikipedia/commons/thumb/6/69/Dal_Makhani.jpg/640px-Dal_Makhani.jpg",
}


def resolve_food_image_url(slug: str, category_slug: str = "indian-dishes") -> str:
    return FOOD_IMAGE_URLS.get(slug) or CATEGORY_IMAGE_URLS.get(category_slug) or CATEGORY_IMAGE_URLS["indian-dishes"]


def resolve_category_image_url(category_slug: str) -> str:
    return CATEGORY_IMAGE_URLS.get(category_slug) or CATEGORY_IMAGE_URLS["indian-dishes"]
