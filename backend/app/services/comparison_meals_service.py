"""
Packaged Product Comparison (Module 9) and Personalised Indian Meal Suggestions (Module 10).
"""

from typing import Optional
from sqlalchemy.orm import Session, joinedload

from app.db.seed_images import resolve_food_image_url
from app.models.entities import (
    ConditionConflictRule,
    FoodItem,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import (
    ConditionConflictOut,
    GuidanceEvaluationRequest,
    MealSuggestionCard,
    MealSuggestionRequest,
    MealSuggestionResponse,
    ProductComparisonItem,
    ProductComparisonRequest,
    ProductComparisonResponse,
)

TRACKED_COMPARISON_NUTRIENTS = [
    "energy_kcal",
    "protein_g",
    "carbs_g",
    "sugars_total_g",
    "sugars_added_g",
    "fat_total_g",
    "fat_saturated_g",
    "fat_trans_g",
    "fibre_g",
    "sodium_mg",
    "potassium_mg",
    "calcium_mg",
    "iron_mg",
]


def compare_packaged_products(
    db: Session, req: ProductComparisonRequest
) -> ProductComparisonResponse:
    if len(req.product_slugs) < 2 or len(req.product_slugs) > 4:
        raise ValueError("Please select between 2 and 4 products to compare.")

    items_out: list[ProductComparisonItem] = []
    conflicts_out: list[ConditionConflictOut] = []

    for idx, slug in enumerate(req.product_slugs):
        food = (
            db.query(FoodItem)
            .options(
                joinedload(FoodItem.category),
                joinedload(FoodItem.source),
                joinedload(FoodItem.nutrient_values),
                joinedload(FoodItem.servings),
            )
            .filter(FoodItem.slug == slug)
            .first()
        )
        if not food:
            raise ValueError(f"Product '{slug}' not found")

        nv_map: dict[str, Optional[float]] = {
            nv.nutrient_code: nv.value for nv in food.nutrient_values
        }
        serving_factor = food.standard_serving_grams / 100.0

        nut_100: dict[str, Optional[float]] = {}
        nut_serv: dict[str, Optional[float]] = {}
        unavailable: list[str] = []

        for code in TRACKED_COMPARISON_NUTRIENTS:
            val = nv_map.get(code, None)
            nut_100[code] = val
            if val is not None:
                nut_serv[code] = round(val * serving_factor, 2)
            else:
                nut_serv[code] = None
                unavailable.append(code)

        guidance_res = evaluate_food_guidance(
            db,
            GuidanceEvaluationRequest(
                food_slug=food.slug,
                condition_codes=req.condition_codes,
                serving_unit="standard_serving",
                serving_quantity=1.0,
                allergies=req.allergies,
                intolerances=req.intolerances,
            ),
        )
        if idx == 0:
            conflicts_out = guidance_res.multi_condition_conflicts

        img_url = getattr(food, "image_url", None) or resolve_food_image_url(
            food.slug, food.category.slug
        )

        items_out.append(
            ProductComparisonItem(
                slug=food.slug,
                name_en=food.name_en,
                image_url=img_url,
                brand=food.brand or ("Packaged Brand" if food.is_packaged else "Whole Food Reference"),
                barcode=food.barcode,
                normalized_basis=food.default_basis,
                original_serving_name=food.standard_serving_name,
                original_serving_grams=food.standard_serving_grams,
                source_origin=food.source.source_type,
                source_name=food.source.name,
                source_url=food.source.url,
                nutrients_per_100=nut_100,
                nutrients_per_serving=nut_serv,
                unavailable_nutrients=unavailable,
                ingredients_text=food.ingredients_text,
                allergen_tags=food.allergen_tags or [],
                allergen_declaration_complete=food.allergen_declaration_complete,
                condition_notes=guidance_res.observations,
            )
        )

    return ProductComparisonResponse(
        normalized_basis_note=(
            "All primary comparison values are normalised to a common per-100g / per-100ml basis alongside each product's declared serving size. "
            "Missing or undeclared nutrients are explicitly marked as Unavailable (NULL) and never assumed to be zero."
        ),
        neutrality_disclaimer=(
            "GharPlate does not declare any packaged product universally 'healthier' or 'safe' for everyone. "
            "Nutritional relevance depends on individual dietary requirements, portion sizes, and clinical context."
        ),
        multi_condition_conflicts=conflicts_out,
        products=items_out,
    )


MEAL_TEMPLATES = [
    {
        "suggestion_id": "bf_idli_sambar",
        "title": "Steamed Idli with Vegetable Toor Dal Sambar",
        "meal_type": "breakfast",
        "primary_food_slugs": ["idli-steamed-rice-lentil", "sambar-vegetable-lentil-stew"],
        "components": ["2 Medium Steamed Idlis (100g)", "1 Katori Vegetable Sambar (150g)"],
        "why_suggested": "Steamed fermented rice-lentil cake paired with vegetable-rich pigeon pea stew provides complementary cereal-pulse amino acids, low saturated fat, and gentle digestibility.",
        "keywords": ["idli", "rice", "urad", "toor", "dal", "sambar", "tomato", "carrot", "beans"],
    },
    {
        "suggestion_id": "bf_poha_curd",
        "title": "Tempered Vegetable Poha (Avalakki) with Fresh Curd & Guava",
        "meal_type": "breakfast",
        "primary_food_slugs": ["poha-avalakki-cooked", "curd-dahi-whole-milk", "guava-white-flesh"],
        "components": ["1 Bowl Tempered Poha (150g)", "1 Small Katori Curd (100g)", "1 Medium Guava (100g)"],
        "why_suggested": "Combines iron-containing flattened rice (avalakki/poha) with Vitamin C-rich guava to support non-heme iron absorption, plus probiotic curd.",
        "keywords": ["poha", "avalakki", "curd", "dahi", "mosaru", "guava", "peanut", "onion"],
    },
    {
        "suggestion_id": "bf_oats_almonds",
        "title": "Unsweetened Wholegrain Rolled Oats Porridge with Almonds & Chia Seeds",
        "meal_type": "breakfast",
        "primary_food_slugs": ["packaged-rolled-oats-plain", "almonds-badam", "chia-seeds"],
        "components": ["1 Serving Rolled Oats (40g)", "1 Handful Almonds (15g)", "1 Tbsp Chia Seeds (10g)"],
        "why_suggested": "High in soluble beta-glucan and mucilage dietary fibre with zero added sugar and low sodium.",
        "keywords": ["oats", "almonds", "badam", "chia", "seeds"],
    },
    {
        "suggestion_id": "lu_ragi_mudde_sambar_palak",
        "title": "Karnataka Ragi Mudde with Toor Dal Sambar & Steamed Spinach-Carrot Palya",
        "meal_type": "lunch",
        "primary_food_slugs": ["ragi-mudde-finger-millet-ball", "sambar-vegetable-lentil-stew", "carrot-orange"],
        "components": ["1 Medium Ragi Mudde (150g)", "1 Katori Vegetable Sambar (150g)", "1 Serving Carrot-Beans Palya (80g)"],
        "why_suggested": "Traditional Karnataka millet meal rich in bioavailable calcium (from finger millet/ragi), dietary fibre, and plant protein from toor dal.",
        "keywords": ["ragi", "mudde", "sambar", "toor", "dal", "carrot", "millet"],
    },
    {
        "suggestion_id": "lu_chapati_moong_palak_paneer",
        "title": "Whole Wheat Chapati with Moong Dal, Palak Paneer & Cucumber Salad",
        "meal_type": "lunch",
        "primary_food_slugs": ["chapati-roti-whole-wheat", "moong-dal-green-gram", "palak-paneer-curry", "cucumber-green"],
        "components": ["2 Whole Wheat Chapatis (80g)", "1 Katori Moong Dal (30g raw eq.)", "1 Serving Palak Paneer (150g)", "Sliced Cucumber (100g)"],
        "why_suggested": "Balanced North/Pan-Indian thali combining whole wheat fibre, easily digestible split green gram, calcium- and folate-rich palak paneer, and hydrating cucumber.",
        "keywords": ["chapati", "roti", "wheat", "moong", "dal", "palak", "paneer", "spinach", "cucumber"],
    },
    {
        "suggestion_id": "lu_brown_rice_fish_rasam",
        "title": "Unmilled Brown Rice with Rohu Fish Curry, Rasam & French Beans",
        "meal_type": "lunch",
        "primary_food_slugs": ["brown-rice", "rohu-fish-freshwater", "rasam-tomato-pepper", "french-beans"],
        "components": ["1 Serving Brown Rice (30g raw eq.)", "1 Piece Rohu Fish (100g)", "1 Bowl Tomato Rasam (150ml)", "Steamed French Beans (100g)"],
        "why_suggested": "Provides high-quality protein, natural Vitamin B12 and Vitamin D from freshwater fish, and whole-grain fibre.",
        "keywords": ["brown", "rice", "fish", "rohu", "meenu", "rasam", "beans", "tomato"],
    },
    {
        "suggestion_id": "dn_moong_khichdi_buttermilk",
        "title": "Comfort Moong Dal Khichdi with Spiced Buttermilk (Chaas / Majjige)",
        "meal_type": "dinner",
        "primary_food_slugs": ["khichdi-moong-dal-rice", "buttermilk-chaas", "papaya-ripe"],
        "components": ["1 Bowl Moong Dal Khichdi (180g)", "1 Glass Buttermilk / Majjige (200ml)", "1 Bowl Ripe Papaya (120g)"],
        "why_suggested": "Light, warm, low-fat evening meal with gentle digestibility, hydration, and complementary rice-moong amino acids.",
        "keywords": ["khichdi", "moong", "rice", "buttermilk", "chaas", "majjige", "papaya"],
    },
    {
        "suggestion_id": "dn_jowar_rotti_chana_drumstick",
        "title": "Gluten-Free Jowar Rotti with Chana Dal & Drumstick Leaves (Moringa) Stir-Fry",
        "meal_type": "dinner",
        "primary_food_slugs": ["jowar-sorghum", "chana-dal-bengal-gram", "drumstick-leaves-moringa", "orange-nagpur"],
        "components": ["2 Jowar Rottis (70g)", "1 Katori Chana Dal (30g raw eq.)", "1 Serving Drumstick Leaves (50g)", "1 Medium Orange (120g)"],
        "why_suggested": "Naturally gluten-free North Karnataka dinner rich in iron, calcium, folate, and dietary fibre, paired with Vitamin C from drumstick leaves and orange.",
        "keywords": ["jowar", "jola", "rotti", "chana", "dal", "drumstick", "moringa", "nugge", "orange"],
    },
    {
        "suggestion_id": "sn_sprouted_moong_pomegranate_walnuts",
        "title": "Steamed Moong-Cucumber Kosambari with Pomegranate & Walnuts",
        "meal_type": "snack",
        "primary_food_slugs": ["moong-dal-green-gram", "cucumber-green", "pomegranate", "walnuts-akhrot"],
        "components": ["1 Small Bowl Steamed Moong & Cucumber (100g)", "1/2 Bowl Pomegranate Arils (50g)", "4-5 Walnut Halves (15g)"],
        "why_suggested": "Whole-food mid-afternoon snack rich in plant protein, fibre, polyphenols, and plant omega-3 ALA without refined flour or added sugar.",
        "keywords": ["moong", "cucumber", "southekayi", "pomegranate", "dalimbe", "walnuts", "akhrot"],
    },
    {
        "suggestion_id": "sn_boiled_egg_roasted_chana",
        "title": "Boiled Poultry Egg with Roasted Chickpeas (Chana) & Buttermilk",
        "meal_type": "snack",
        "primary_food_slugs": ["egg-poultry-whole", "chickpeas-kabuli-chana", "buttermilk-chaas"],
        "components": ["1 Whole Boiled Egg (50g)", "1 Serving Chickpeas (30g)", "1 Glass Buttermilk (200ml)"],
        "why_suggested": "High-protein, low-glycaemic snack providing bioavailable Vitamin B12, choline, and intact legume fibre.",
        "keywords": ["egg", "anda", "motte", "chana", "chickpeas", "buttermilk"],
    },
]


def generate_meal_suggestions(
    db: Session, req: MealSuggestionRequest
) -> MealSuggestionResponse:
    conflicts_out: list[ConditionConflictOut] = []
    if len(req.condition_codes) >= 2:
        selected_set = set(req.condition_codes)
        all_conflicts = (
            db.query(ConditionConflictRule)
            .options(joinedload(ConditionConflictRule.source))
            .all()
        )
        for cr in all_conflicts:
            if cr.condition_a_code in selected_set and cr.condition_b_code in selected_set:
                conflicts_out.append(
                    ConditionConflictOut(
                        conflict_code=cr.conflict_code,
                        condition_a_code=cr.condition_a_code,
                        condition_b_code=cr.condition_b_code,
                        competing_domain=cr.competing_domain,
                        conflict_explanation=cr.conflict_explanation,
                        why_conflict_exists=cr.why_conflict_exists,
                        professional_guidance_notice=cr.professional_guidance_notice,
                        source_citation=f"{cr.source.name} ({cr.source.publication_year})",
                        source_url=cr.source.url,
                    )
                )

    foods_by_slug: dict[str, FoodItem] = {
        f.slug: f
        for f in db.query(FoodItem)
        .options(
            joinedload(FoodItem.source),
            joinedload(FoodItem.nutrient_values),
            joinedload(FoodItem.servings),
        )
        .all()
    }

    cards: list[MealSuggestionCard] = []
    user_allergies = {a.strip().lower() for a in req.allergies if a.strip()}
    user_intols = {i.strip().lower() for i in req.intolerances if i.strip()}
    avail_kw = {k.strip().lower() for k in req.available_ingredient_keywords if k.strip()}

    for tpl in MEAL_TEMPLATES:
        if req.meal_type and req.meal_type != "all" and tpl["meal_type"] != req.meal_type.lower():
            continue

        tpl_foods = [foods_by_slug[s] for s in tpl["primary_food_slugs"] if s in foods_by_slug]
        if not tpl_foods:
            continue

        dp = req.dietary_preference.lower()
        if dp in ("vegetarian", "jain", "vegan") and any(not f.is_vegetarian for f in tpl_foods):
            continue
        if dp == "vegan" and any(not f.is_vegan for f in tpl_foods):
            continue

        has_allergen = False
        for f in tpl_foods:
            f_allergens = {a.lower() for a in (f.allergen_tags or [])}
            if any(ua in fa or fa in ua for ua in user_allergies for fa in f_allergens):
                has_allergen = True
            if "coeliac_disease" in req.condition_codes and ("gluten" in f_allergens or "wheat" in f_allergens):
                has_allergen = True
        if has_allergen:
            continue

        summary_keys = ["energy_kcal", "protein_g", "carbs_g", "fibre_g", "fat_total_g", "sodium_mg", "calcium_mg", "iron_mg"]
        agg_nut: dict[str, Optional[float]] = {k: 0.0 for k in summary_keys}
        missing_set = set()
        sources_set = set()

        for f in tpl_foods:
            sources_set.add(f"{f.source.name} ({f.source.publication_year})")
            factor = f.standard_serving_grams / 100.0
            nv_map = {nv.nutrient_code: nv.value for nv in f.nutrient_values}
            for k in summary_keys:
                v = nv_map.get(k)
                if v is not None and agg_nut[k] is not None:
                    agg_nut[k] = round((agg_nut[k] or 0.0) + v * factor, 1)
                else:
                    missing_set.add(k)

        relevance_notes: list[str] = []
        caution_notes: list[str] = []

        if avail_kw:
            matched_kw = [k for k in avail_kw if any(k in tk for tk in tpl["keywords"])]
            if matched_kw:
                relevance_notes.append(
                    f"Matches available household ingredients: {', '.join(matched_kw)}."
                )

        for f in tpl_foods:
            f_intols = {i.lower() for i in (f.intolerance_tags or [])}
            if any(ui in fi or fi in ui for ui in user_intols for fi in f_intols):
                caution_notes.append(
                    f"Intolerance note: '{f.name_en}' contains {', '.join(f.intolerance_tags)} — adjust portion or substitute as needed."
                )

        for cond_code in req.condition_codes:
            if cond_code in ("type_2_diabetes", "prediabetes_insulin_resistance", "gestational_diabetes"):
                relevance_notes.append(
                    f"Glycaemic context ({cond_code}): Provides {agg_nut.get('fibre_g', 0)}g intact fibre and {agg_nut.get('protein_g', 0)}g protein to pair with {agg_nut.get('carbs_g', 0)}g total carbohydrates."
                )
            elif cond_code == "iron_deficiency_anaemia":
                relevance_notes.append(
                    f"Iron context: Provides {agg_nut.get('iron_mg', 0)}mg iron across whole-food ingredients; pair with fresh lemon/Vitamin C and avoid tea/coffee with the meal."
                )
            elif cond_code == "osteoporosis_bone_health":
                relevance_notes.append(
                    f"Bone health context: Supplies {agg_nut.get('calcium_mg', 0)}mg dietary calcium and {agg_nut.get('protein_g', 0)}g protein."
                )
            elif cond_code == "fever_acute_recovery":
                relevance_notes.append(
                    "Short-term illness recovery: Warm, home-cooked nourishment to support energy and hydration (does not treat fever)."
                )
            elif cond_code == "chronic_kidney_disease":
                caution_notes.append(
                    "Kidney health note: Potassium, phosphorus, and protein portions in whole grains/dals require individualised review based on your CKD stage and serum labs."
                )

        if conflicts_out:
            caution_notes.append(
                "Multiple conditions selected with competing nutritional considerations — see conflict notice above and consult a registered dietitian."
            )

        completeness = round(((len(summary_keys) - len(missing_set)) / len(summary_keys)) * 100.0, 1)
        lead_slug = tpl["primary_food_slugs"][0]
        lead_img = resolve_food_image_url(lead_slug)

        cards.append(
            MealSuggestionCard(
                suggestion_id=tpl["suggestion_id"],
                title=tpl["title"],
                meal_type=tpl["meal_type"],
                image_url=lead_img,
                primary_food_slugs=tpl["primary_food_slugs"],
                components=tpl["components"],
                why_suggested=tpl["why_suggested"],
                condition_relevance_notes=relevance_notes,
                nutritional_summary=agg_nut,
                completeness_pct=completeness,
                missing_nutrients=sorted(missing_set),
                source_citations=sorted(sources_set),
                caution_notes=caution_notes,
            )
        )

    return MealSuggestionResponse(
        meal_type=req.meal_type,
        dietary_preference=req.dietary_preference,
        selected_conditions=req.condition_codes,
        medical_disclaimer=(
            "Educational Meal Ideas Only: Suggestions are generated deterministically from ICMR-NIN DGI 2024 and IFCT 2017 records. "
            "Suggested meals do not treat, cure, or reverse any disease."
        ),
        has_conflicting_conditions=bool(conflicts_out),
        conflict_warnings=conflicts_out,
        suggestions=cards,
    )
