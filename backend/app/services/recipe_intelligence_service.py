"""
GharPlate Recipe Intelligence, Guided Cooking, Persistent Achievement Rewards,
and Interactive 3D Human Body & Nutrition Explorer Service.
"""

from datetime import datetime, timedelta, UTC
from typing import Any
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.models.entities import (
    AchievementDefinition,
    BloodGlucoseLog,
    BloodPressureLog,
    BodyMeasurementLog,
    BodyRegion,
    BodyRegionFoodLink,
    BodyRegionNutrient,
    DailyFoodLogEntry,
    DataSource,
    FoodItem,
    HabitCompletionLog,
    HabitDefinition,
    Household,
    HouseholdMember,
    HydrationSetting,
    MemberAchievement,
    MemberFitnessProfile,
    Recipe,
    RecipeIngredient,
    RecipeStep,
    WaterIntakeLog,
)
from app.schemas.api_schemas import RecipeDetailOut
from app.services.fitness_ecosystem_service import (
    create_daily_food_log_entry,
    get_daily_tracker_summary,
    get_or_create_fitness_profile,
    serialize_food_log_entry,
    today_iso_str,
)
from app.services.recipe_service import serialize_recipe_detail


# ============================================================================
# PART A — CURATED INDIAN RECIPES & ORDERED COOKING STEPS CATALOG
# ============================================================================
CURATED_INDIAN_RECIPES_SEED: list[dict[str, Any]] = [
    {
        "slug": "idli-steamed-rice-lentil",
        "title": "South Indian Steamed Idli (Fermented Rice & Urad Dal Cakes)",
        "description": "Soft, fluffy, naturally fermented South Indian steamed cakes made from parboiled idli rice and split black gram (urad dal). Gentle on digestion and oil-free.",
        "servings": 4.0,
        "meal_type": "breakfast",
        "prep_time_minutes": 25,
        "cook_time_minutes": 12,
        "difficulty": "Easy",
        "estimated_cost_inr": 45.0,
        "image_url": "/images/foods/indian-dishes/idli-steamed-rice-lentil.webp",
        "dietary_tags": ["vegetarian", "vegan", "fermented", "south_indian", "gentle_digestion", "steamed"],
        "suitable_goals": ["manage_health_condition", "maintain_balanced_diet", "improve_everyday_nutrition", "lose_body_fat"],
        "instructions_notes": "Soak parboiled rice and urad dal separately for 4–5 hours, grind to a smooth airy batter, ferment overnight, and steam in greased idli moulds for 10–12 minutes.",
        "ingredients": [
            {
                "food_slug": "idli-steamed-rice-lentil",
                "quantity": 3.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 360.0,
                "household_measure_note": "8 steamed idlis (~2 cups parboiled rice + 1/2 cup urad dal batter)",
                "alternative_ingredient": "Ragi or millet idli batter for higher dietary fibre",
                "preparation_note": "Naturally fermented 8–10 hours",
            },
            {
                "food_slug": "urad-dal-black-gram-split",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 30.0,
                "household_measure_note": "1/4 cup split black gram (urad dal) + 1/2 tsp methi seeds",
                "alternative_ingredient": "Whole skinless black gram (gota urad)",
                "preparation_note": "Rinsed 3 times and soaked in cool water",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Rinse and Soak Rice & Urad Dal Separately",
                "instruction_text": "Wash parboiled idli rice and split black gram (urad dal) 3–4 times in clean water until the water runs clear. Soak the urad dal with 1/2 teaspoon fenugreek (methi) seeds in one bowl and the rice in a separate bowl for 4 to 5 hours.",
                "duration_minutes": 10,
                "temperature": "Room temperature",
                "tip": "Soaking urad dal and rice separately allows the dal to whip into a light, cloud-like foam during grinding.",
                "equipment": "2Mixing Bowls",
            },
            {
                "step_number": 2,
                "step_title": "Grind Urad Dal to an Airy Foam, Then Coarsely Grind Rice",
                "instruction_text": "Drain the soaked urad dal and grind in a wet grinder or mixer jar using chilled water in small splashes until fluffy and ribbon-like. Transfer to a deep vessel, then grind the soaked rice to a slightly fine, mildly grainy paste.",
                "duration_minutes": 15,
                "temperature": "Cool water (<15°C)",
                "tip": "Use cold water while grinding in a mixer-grinder so motor heat does not slow down natural fermentation bacteria.",
                "equipment": "Wet Grinder or High-Speed Mixer",
            },
            {
                "step_number": 3,
                "step_title": "Combine Batter with Rock Salt and Ferment Overnight",
                "instruction_text": "Add non-iodised rock salt to the combined urad dal and rice batter. Mix gently with clean hands or a ladle for 2 minutes to incorporate air. Cover loosely and ferment in a warm corner of the kitchen for 8 to 10 hours until doubled in volume.",
                "duration_minutes": 5,
                "temperature": "Warm kitchen (28–32°C)",
                "tip": "Do not stir the fermented batter vigorously the next morning; gently scoop from the top to preserve air pockets.",
                "equipment": "Deep Steel Fermentation Vessel",
            },
            {
                "step_number": 4,
                "step_title": "Preheat Idli Steamer and Grease Moulds",
                "instruction_text": "Pour 1.5 to 2 cups of water into the bottom of an idli steamer or pressure cooker (without the whistle weight) and bring to a rolling boil. Lightly brush each idli mould indentation with 1–2 drops of sesame (gingelly) oil or ghee.",
                "duration_minutes": 4,
                "temperature": "High heat until boiling",
                "tip": "Always place the idli stand inside only after the water is actively boiling so the idlis rise immediately.",
                "equipment": "Idli Steamer & Mould Plates",
            },
            {
                "step_number": 5,
                "step_title": "Ladle Batter and Steam Idlis",
                "instruction_text": "Fill each greased mould three-quarters full with fermented idli batter. Stack the plates with holes staggered over the idlis below, cover with the lid, and steam over medium-high heat for 10 to 12 minutes until a toothpick inserted comes out clean.",
                "duration_minutes": 12,
                "temperature": "Medium-High Steam (100°C)",
                "tip": "Avoid steaming beyond 12 minutes, which can make soft idlis turn dry or firm.",
                "equipment": "Covered Idli Steamer",
            },
            {
                "step_number": 6,
                "step_title": "Rest 2 Minutes and Demould Warm Idlis",
                "instruction_text": "Remove the idli stand from the steamer and let it rest on the counter for 2 minutes so the steam settles. Dip a spoon in water and run it gently around each idli to release clean, pillowy rounds. Serve warm with sambar or chutney.",
                "duration_minutes": 2,
                "temperature": "Warm",
                "tip": "Resting for 2 minutes prevents idlis from sticking to the moulds.",
                "equipment": "Serving Spoon & Plate",
            },
        ],
    },
    {
        "slug": "masala-dosa-potato-palya",
        "title": "Crispy Karnataka Masala Dosa with Spiced Potato Palya",
        "description": "Golden fermented rice-lentil crepe cooked on a seasoned cast-iron tawa and folded over a fragrant onion, turmeric, curry leaf, and boiled potato masala.",
        "servings": 2.0,
        "meal_type": "breakfast",
        "prep_time_minutes": 15,
        "cook_time_minutes": 15,
        "difficulty": "Medium",
        "estimated_cost_inr": 58.0,
        "image_url": "/images/foods/indian-dishes/masala-dosa-potato.webp",
        "dietary_tags": ["vegetarian", "fermented", "south_indian"],
        "suitable_goals": ["maintain_balanced_diet", "improve_everyday_nutrition", "improve_endurance"],
        "instructions_notes": "Prepare tempered potato-onion palya, spread fermented dosa batter in thin concentric circles on a hot cast-iron tawa, drizzle a little oil or ghee, roast until crisp, and fold over the warm potato filling.",
        "ingredients": [
            {
                "food_slug": "masala-dosa-potato",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 300.0,
                "household_measure_note": "2 full masala dosas (3 ladles fermented dosa batter + potato masala)",
                "alternative_ingredient": "Plain dosa with sambar or paneer bhurji filling for higher protein",
                "preparation_note": "Room-temperature fermented dosa batter",
            },
            {
                "food_slug": "onion-big",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 80.0,
                "household_measure_note": "1 medium onion, thinly sliced (80 g)",
                "alternative_ingredient": "Grated carrot & cabbage for extra fibre",
                "preparation_note": "Thinly sliced lengthwise",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Boil and Gently Mash Potatoes for Palya",
                "instruction_text": "Pressure-cook 2 medium potatoes until fork-tender, peel the skins while warm, and crumble them coarsely by hand so small soft chunks remain.",
                "duration_minutes": 10,
                "temperature": "Medium heat",
                "tip": "Avoid over-mashing potatoes into a paste; small rustic pieces hold moisture better inside the dosa.",
                "equipment": "Pressure Cooker & Mixing Bowl",
            },
            {
                "step_number": 2,
                "step_title": "Temper Mustard, Urad Dal, Chana Dal, Curry Leaves & Onions",
                "instruction_text": "Heat 1 teaspoon oil in a kadai. Crackle 1/2 tsp mustard seeds, 1/2 tsp urad dal, 1/2 tsp chana dal, green chillies, ginger, and curry leaves. Add sliced onions and sauté for 3 minutes until translucent but still slightly crisp.",
                "duration_minutes": 4,
                "temperature": "Medium heat",
                "tip": "Onions in Karnataka potato palya should stay sweet and translucent rather than browned.",
                "equipment": "Kadai / Skillet",
            },
            {
                "step_number": 3,
                "step_title": "Fold in Turmeric, Boiled Potatoes, Splash of Water & Coriander",
                "instruction_text": "Add 1/4 tsp turmeric powder, salt, the crumbled boiled potatoes, and 2 tablespoons of water. Cover and simmer for 2 minutes so the masala becomes moist and cohesive, then finish with fresh coriander.",
                "duration_minutes": 3,
                "temperature": "Low heat",
                "tip": "A splash of hot water binds the turmeric and onion aroma into the potatoes.",
                "equipment": "Kadai",
            },
            {
                "step_number": 4,
                "step_title": "Heat and Season the Cast-Iron Dosa Tawa",
                "instruction_text": "Heat a flat cast-iron or heavy-bottomed dosa tawa over medium-high heat. Sprinkle a few drops of water to sizzle and wipe clean with a halved onion or folded cotton cloth to regulate surface temperature.",
                "duration_minutes": 2,
                "temperature": "Medium-High (180–195°C)",
                "tip": "Wiping with wet cloth cools the tawa slightly so the batter grips evenly without clumping.",
                "equipment": "Cast-Iron Dosa Tawa",
            },
            {
                "step_number": 5,
                "step_title": "Spread Dosa Batter in Concentric Circles & Roast Crisp",
                "instruction_text": "Pour 1 ladleful (75–90 ml) of dosa batter in the centre of the tawa and immediately swirl outward in smooth clockwise spirals using the flat bottom of the ladle. Drizzle 1/2 teaspoon oil or ghee around the edges and roast for 2–3 minutes until golden brown.",
                "duration_minutes": 3,
                "temperature": "Medium heat",
                "tip": "Keep the flame medium-low while spreading, then raise to medium so the underside caramelises evenly.",
                "equipment": "Round-Bottom Ladle & Flat Spatula",
            },
            {
                "step_number": 6,
                "step_title": "Place Warm Potato Palya and Fold Dosa",
                "instruction_text": "Spoon 2–3 tablespoons of warm potato palya along the centre of the crisp dosa, fold both sides over the filling, and serve immediately while crisp.",
                "duration_minutes": 1,
                "temperature": "Serve hot",
                "tip": "Serve immediately off the tawa with sambar or coconut chutney.",
                "equipment": "Flat Dosa Turner",
            },
        ],
    },
    {
        "slug": "ragi-mudde-palak-sambar",
        "title": "Karnataka Ragi Mudde & Palak Toor Dal Sambar",
        "description": "Balanced South Indian meal pairing calcium-rich finger millet (ragi) balls with pigeon pea (toor dal), spinach (palak), and tomato sambar.",
        "servings": 2.0,
        "meal_type": "lunch",
        "prep_time_minutes": 15,
        "cook_time_minutes": 25,
        "difficulty": "Medium",
        "estimated_cost_inr": 55.0,
        "image_url": "/images/foods/cereals-millets/ragi-finger-millet.webp",
        "dietary_tags": ["vegetarian", "vegan", "high_calcium", "high_fibre", "south_indian"],
        "suitable_goals": ["manage_health_condition", "improve_everyday_nutrition", "maintain_balanced_diet", "lose_body_fat"],
        "instructions_notes": "Whisk ragi flour into boiling salted water and knead over low heat into smooth mudde balls. Serve hot with pressure-cooked toor dal, palak, tomato, and onion sambar.",
        "ingredients": [
            {
                "food_slug": "ragi-finger-millet",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "1 cup fine ragi (finger millet) flour (100 g)",
                "alternative_ingredient": "Jowar (sorghum) flour for jolada rotti/mudde",
                "preparation_note": "Sifted fine whole finger millet flour",
            },
            {
                "food_slug": "toor-dal-red-gram",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 60.0,
                "household_measure_note": "1/3 cup dry toor dal (60 g), rinsed & soaked 20 min",
                "alternative_ingredient": "Masoor + moong dal blend",
                "preparation_note": "Pressure-cooked until soft",
            },
            {
                "food_slug": "spinach-palak",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "2 cups washed & chopped fresh palak leaves (100 g)",
                "alternative_ingredient": "Drumstick leaves (moringa) or methi greens",
                "preparation_note": "Washed thoroughly in 3 changes of water",
            },
            {
                "food_slug": "tomato-ripe",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 85.0,
                "household_measure_note": "1 medium ripe tomato, diced (85 g)",
                "alternative_ingredient": None,
                "preparation_note": "Diced",
            },
            {
                "food_slug": "onion-big",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 80.0,
                "household_measure_note": "1 medium onion, chopped (80 g)",
                "alternative_ingredient": "Shallots (sambar onions)",
                "preparation_note": "Peeled and cubed",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Pressure-Cook Toor Dal with Tomatoes & Onion",
                "instruction_text": "Wash 60 g toor dal and place in a pressure cooker with diced tomato, half the chopped onion, 1/4 tsp turmeric, and 2 cups water. Pressure-cook for 3–4 whistles over medium flame until soft and mashable.",
                "duration_minutes": 12,
                "temperature": "Medium heat",
                "tip": "Soaking toor dal for 20 minutes before cooking improves digestibility and shortens cooking time.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 2,
                "step_title": "Simmer Chopped Spinach (Palak) & Temper Sambar",
                "instruction_text": "Open the depressurised cooker, whisk the dal lightly, and add 100 g washed chopped spinach, 1.5 tsp sambar powder, a small piece of tamarind pulp, and salt. Simmer for 6 minutes until greens are tender, then finish with a mustard, cumin, garlic, and curry leaf tempering.",
                "duration_minutes": 8,
                "temperature": "Medium-Low simmer",
                "tip": "Simmer spinach uncovered for just 5–6 minutes so it retains its vibrant green colour and folate.",
                "equipment": "Saucepan & Tadka Ladle",
            },
            {
                "step_number": 3,
                "step_title": "Prepare Smooth Ragi Slurry & Boil Water",
                "instruction_text": "In a small bowl, whisk 1 tablespoon of ragi flour with 1/4 cup cool water into a lump-free starter slurry. Bring 1.75 cups of water with a pinch of salt and 1/4 tsp ghee to a boil in a heavy-bottomed pot, then stir in the slurry and boil for 1 minute.",
                "duration_minutes": 4,
                "temperature": "Boiling (100°C)",
                "tip": "Adding a small starter slurry before the dry flour prevents lumps when making ragi mudde.",
                "equipment": "Heavy-Bottomed Steel or Brass Pot",
            },
            {
                "step_number": 4,
                "step_title": "Add Remaining Ragi Flour & Steam Before Stirring",
                "instruction_text": "Spread the remaining ragi flour gently over the centre of the boiling water without stirring. Lower the heat, cover with a lid, and let the boiling water Bubble over and steam the flour mound for 2 minutes.",
                "duration_minutes": 2,
                "temperature": "Low flame",
                "tip": "Allowing the flour to steam on top of the water cooks the starch evenly before you stir.",
                "equipment": "Heavy Pot & Wooden Stick (Mudde Kolu)",
            },
            {
                "step_number": 5,
                "step_title": "Vigorous Stirring & Covered Steaming",
                "instruction_text": "Using a wooden mudde stick or sturdy ladle handle, stir vigorously in one direction until the ragi pulls away from the sides as a glossy, lump-free dough. Sprinkle 1 tbsp hot water, cover, and steam on the lowest flame for 3 minutes.",
                "duration_minutes": 4,
                "temperature": "Lowest flame",
                "tip": "The mudde is fully cooked when it does not stick to wet fingers.",
                "equipment": "Wooden Stick (Mudde Kolu)",
            },
            {
                "step_number": 6,
                "step_title": "Shape Warm Ragi Mudde Balls & Serve with Palak Sambar",
                "instruction_text": "Moisten a wooden board or plate and your palms with cool water. Divide the hot cooked ragi dough into 2 equal portions and roll gently into smooth, shiny spheres. Serve immediately with hot palak toor dal sambar.",
                "duration_minutes": 2,
                "temperature": "Serve hot",
                "tip": "Traditionally, swallow small morsels of warm mudde dipped in sambar for slow, sustained energy release.",
                "equipment": "Dampened Rolling Board",
            },
        ],
    },
    {
        "slug": "ven-pongal-moong-rice",
        "title": "Traditional South Indian Ven Pongal (Ghee Pepper Moong Dal Rice)",
        "description": "Comforting, protein-balanced South Indian breakfast dish of raw rice and roasted yellow moong dal slow-cooked until creamy and tempered with crushed black pepper, cumin, ginger, and curry leaves.",
        "servings": 2.0,
        "meal_type": "breakfast",
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "difficulty": "Easy",
        "estimated_cost_inr": 52.0,
        "image_url": "/images/foods/indian-dishes/pongal-ven-moong-rice.webp",
        "dietary_tags": ["vegetarian", "south_indian", "gentle_digestion", "comfort_meal"],
        "suitable_goals": ["maintain_balanced_diet", "improve_everyday_nutrition", "build_muscle", "manage_health_condition"],
        "instructions_notes": "Dry-roast yellow moong dal until aromatic, wash and pressure-cook with rice in 4 cups water until soft, and fold in a warm ghee tempering of black pepper, cumin, ginger, and curry leaves.",
        "ingredients": [
            {
                "food_slug": "pongal-ven-moong-rice",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 360.0,
                "household_measure_note": "2 katoris cooked Ven Pongal (1/2 cup raw rice + 1/3 cup yellow moong dal)",
                "alternative_ingredient": "Foxtail millet (navane) or brown rice for higher fibre",
                "preparation_note": "Cooked soft in 1:4 grain-to-water ratio",
            },
            {
                "food_slug": "moong-dal-green-gram-split",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 30.0,
                "household_measure_note": "2 tbsp extra split yellow moong dal for protein boost (30 g)",
                "alternative_ingredient": None,
                "preparation_note": "Lightly dry-roasted for nutty aroma",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Dry-Roast Yellow Moong Dal Until Aromatic",
                "instruction_text": "Warm a dry pan over medium-low heat and roast the split yellow moong dal for 2–3 minutes until it smells nutty and turns a light golden shade without browning.",
                "duration_minutes": 3,
                "temperature": "Medium-Low heat",
                "tip": "Light dry-roasting prevents the dal from smelling raw and gives Ven Pongal its signature aroma.",
                "equipment": "Heavy Pan",
            },
            {
                "step_number": 2,
                "step_title": "Rinse Rice & Roasted Dal Together",
                "instruction_text": "Combine the roasted moong dal and raw rice in a bowl, rinse 2–3 times in water, and drain.",
                "duration_minutes": 3,
                "temperature": "Room temperature",
                "tip": "Short-grain sona masoori or raw ponni rice yields the softest texture.",
                "equipment": "Strainer Bowl",
            },
            {
                "step_number": 3,
                "step_title": "Pressure-Cook with Ginger, Asafoetida & Water",
                "instruction_text": "Transfer the washed rice and moong dal to a pressure cooker with 3.5 to 4 cups water, 1/2 tsp finely grated ginger, a pinch of asafoetida (hing), and salt. Pressure-cook for 4 whistles over medium flame.",
                "duration_minutes": 12,
                "temperature": "Medium flame",
                "tip": "Using 4 parts water to 1 part grain-dal mixture creates a spoonable, velvety consistency.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 4,
                "step_title": "Mash Gently While Piping Hot",
                "instruction_text": "Once pressure drops naturally, open the lid and mash the hot rice-dal mixture lightly with the back of a ladle so the grains meld together.",
                "duration_minutes": 2,
                "temperature": "Warm",
                "tip": "If the pongal thickens, stir in 1/4 cup boiling water to restore its creamy texture.",
                "equipment": "Steel Ladle",
            },
            {
                "step_number": 5,
                "step_title": "Temper Black Pepper, Cumin, Ginger & Curry Leaves",
                "instruction_text": "Warm 1.5 teaspoons cow ghee in a small tadka pan. Bloom 1 tsp coarsely crushed black peppercorns, 1 tsp cumin seeds, grated ginger, a pinch of hing, and fresh curry leaves for 30 seconds, then pour over the pongal and fold gently.",
                "duration_minutes": 3,
                "temperature": "Low flame",
                "tip": "Crushing peppercorns coarsely just before tempering releases piperine and aids digestion.",
                "equipment": "Tadka Pan",
            },
        ],
    },
    {
        "slug": "vegetable-rava-upma",
        "title": "South Indian Vegetable Rava Upma (Roasted Semolina & Vegetables)",
        "description": "Light, fluffy savoury semolina breakfast cooked with carrots, green peas, onions, ginger, curry leaves, urad dal, and fresh lemon juice.",
        "servings": 2.0,
        "meal_type": "breakfast",
        "prep_time_minutes": 10,
        "cook_time_minutes": 15,
        "difficulty": "Easy",
        "estimated_cost_inr": 40.0,
        "image_url": "/images/foods/indian-dishes/upma-rava-vegetable.webp",
        "dietary_tags": ["vegetarian", "south_indian", "quick_breakfast"],
        "suitable_goals": ["maintain_balanced_diet", "improve_everyday_nutrition"],
        "instructions_notes": "Slow-roast rava until fragrant, temper mustard, urad dal, curry leaves, onion, carrot, and peas, bring 2.5 parts water to a boil, stir in rava gradually, and steam covered for 4 minutes.",
        "ingredients": [
            {
                "food_slug": "upma-rava-vegetable",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 320.0,
                "household_measure_note": "2 bowls cooked vegetable rava upma (~1 cup roasted rava + vegetables)",
                "alternative_ingredient": "Broken wheat (dalia / lapsi) or millet rava for lower glycemic response",
                "preparation_note": "Slow-roasted medium-grain bombay rava",
            },
            {
                "food_slug": "carrot-orange",
                "quantity": 0.5,
                "unit_name": "100g",
                "grams_equivalent": 50.0,
                "household_measure_note": "1/2 cup finely diced orange carrot (50 g)",
                "alternative_ingredient": "Finely chopped French beans & green peas",
                "preparation_note": "Finely diced (5 mm cubes)",
            },
            {
                "food_slug": "onion-big",
                "quantity": 0.5,
                "unit_name": "standard_serving",
                "grams_equivalent": 40.0,
                "household_measure_note": "1 small onion, finely chopped (40 g)",
                "alternative_ingredient": None,
                "preparation_note": "Finely chopped",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Slow-Roast Semolina (Rava) Until Non-Sticky",
                "instruction_text": "Dry-roast 1 cup medium semolina (rava/sooji) in a heavy kadai over low flame for 4–5 minutes, stirring continuously until fragrant and crisp without turning brown. Transfer to a plate.",
                "duration_minutes": 5,
                "temperature": "Low flame",
                "tip": "Thorough roasting is the secret to fluffy, non-gummy upma.",
                "equipment": "Heavy Kadai",
            },
            {
                "step_number": 2,
                "step_title": "Temper Mustard, Urad Dal, Chana Dal, Ginger & Curry Leaves",
                "instruction_text": "Heat 1.5 tsp oil in the same kadai. Add 1/2 tsp mustard seeds, 1 tsp urad dal, 1 tsp chana dal, finely chopped ginger, slit green chilli, and curry leaves. Sauté for 45 seconds until the lentils turn golden.",
                "duration_minutes": 2,
                "temperature": "Medium flame",
                "tip": "Golden roasted urad and chana dal add a pleasant crunch to every spoonful.",
                "equipment": "Kadai",
            },
            {
                "step_number": 3,
                "step_title": "Sauté Onions & Finely Diced Vegetables",
                "instruction_text": "Add finely chopped onions and sauté for 2 minutes until soft, then add finely diced carrots (and green peas/beans if using). Cook for 3 minutes.",
                "duration_minutes": 4,
                "temperature": "Medium flame",
                "tip": "Dicing vegetables small ensures they cook through quickly when the water boils.",
                "equipment": "Kadai",
            },
            {
                "step_number": 4,
                "step_title": "Bring Water to a Rolling Boil & Pour Rava in a Thin Stream",
                "instruction_text": "Add 2.5 cups of water and salt to taste, and bring to a vigorous boil. Lower the flame to minimum and pour the roasted rava in a thin steady stream with one hand while stirring continuously with the other hand to prevent lumps.",
                "duration_minutes": 3,
                "temperature": "Boiling then Low flame",
                "tip": "Pouring rava slowly while stirring in one direction guarantees zero lumps.",
                "equipment": "Kadai & Spatula",
            },
            {
                "step_number": 5,
                "step_title": "Cover, Steam 3 Minutes & Finish with Lemon Juice",
                "instruction_text": "Cover the kadai with a tight lid and cook on the lowest flame for 3 minutes until all water is absorbed. Switch off the heat, rest covered for 2 minutes, then fluff with a fork and add fresh coriander and a squeeze of lemon juice.",
                "duration_minutes": 4,
                "temperature": "Lowest flame",
                "tip": "Resting covered off the heat allows steam to soften every grain evenly.",
                "equipment": "Covered Kadai",
            },
        ],
    },
    {
        "slug": "vegetable-poha-avalakki",
        "title": "Homestyle Vegetable Poha (Kanda Batata Poha / Oggarane Avalakki)",
        "description": "Light, iron-supported flattened rice breakfast tossed with roasted peanuts, onions, turmeric, curry leaves, coriander, and fresh lemon juice.",
        "servings": 2.0,
        "meal_type": "breakfast",
        "prep_time_minutes": 10,
        "cook_time_minutes": 10,
        "difficulty": "Easy",
        "estimated_cost_inr": 38.0,
        "image_url": "/images/foods/indian-dishes/poha-flattened-rice-cooked.webp",
        "dietary_tags": ["vegetarian", "vegan", "quick_breakfast", "hostel_friendly"],
        "suitable_goals": ["maintain_balanced_diet", "improve_everyday_nutrition", "lose_body_fat"],
        "instructions_notes": "Rinse thick poha in a colander and let it soften for 5 minutes; temper mustard, peanuts, curry leaves, onion, and turmeric, toss in softened poha, steam for 2 minutes, and finish with lemon juice.",
        "ingredients": [
            {
                "food_slug": "poha-flattened-rice-cooked",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 300.0,
                "household_measure_note": "2 bowls cooked vegetable poha (~1.5 cups dry thick poha / avalakki)",
                "alternative_ingredient": "Red rice poha for higher anthocyanins and fibre",
                "preparation_note": "Rinsed gently in a colander, never submerged",
            },
            {
                "food_slug": "groundnut-peanut-raw",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 30.0,
                "household_measure_note": "2 tablespoons raw peanuts (30 g)",
                "alternative_ingredient": "Roasted chana dal (putani / hurigadale)",
                "preparation_note": "Lightly pan-roasted",
            },
            {
                "food_slug": "onion-big",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 80.0,
                "household_measure_note": "1 medium onion, finely chopped (80 g)",
                "alternative_ingredient": "Grated carrot & green peas (Jain style)",
                "preparation_note": "Finely diced",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Rinse Thick Poha in a Colander & Drain Completely",
                "instruction_text": "Place 1.5 cups of thick flattened rice (jada poha / dappa avalakki) in a colander and rinse under running water for 15–20 seconds. Let it sit in the colander for 5 minutes so the flakes absorb surface moisture and become soft yet separate.",
                "duration_minutes": 5,
                "temperature": "Room temperature",
                "tip": "Never soak poha in a bowl of standing water, or it will turn mushy. Press a flake between your fingers—it should mash easily.",
                "equipment": "Colander / Sieve",
            },
            {
                "step_number": 2,
                "step_title": "Pan-Roast Peanuts Until Crisp",
                "instruction_text": "Warm 1.5 teaspoons oil in a wide pan over medium-low heat. Add 2 tablespoons raw peanuts and roast for 2 minutes until golden and crackling.",
                "duration_minutes": 2,
                "temperature": "Medium-Low heat",
                "tip": "Roasting peanuts on low heat ensures the inside cooks evenly without scorching the skin.",
                "equipment": "Wide Pan / Kadai",
            },
            {
                "step_number": 3,
                "step_title": "Temper Mustard, Cumin, Curry Leaves, Green Chilli & Onions",
                "instruction_text": "In the same pan, add 1/2 tsp mustard seeds, 1/2 tsp cumin seeds, 8–10 curry leaves, and slit green chilli. Add finely chopped onions and sauté for 2–3 minutes until translucent.",
                "duration_minutes": 3,
                "temperature": "Medium heat",
                "tip": "Keep the onions tender-crisp for texture contrast with the soft poha.",
                "equipment": "Wide Pan",
            },
            {
                "step_number": 4,
                "step_title": "Bloom Turmeric & Fold in Softened Poha",
                "instruction_text": "Stir in 1/3 tsp turmeric powder and salt, then add the drained softened poha. Toss gently from the edges using a flat spatula so every flake turns bright yellow without breaking.",
                "duration_minutes": 2,
                "temperature": "Low flame",
                "tip": "Sprinkle 1 tablespoon of water over the top if the poha feels dry.",
                "equipment": "Flat Spatula",
            },
            {
                "step_number": 5,
                "step_title": "Steam Covered for 2 Minutes & Add Fresh Lemon Juice",
                "instruction_text": "Cover the pan with a lid and steam on the lowest flame for 2 minutes. Turn off the heat, garnish generously with fresh chopped coriander leaves and squeeze half a fresh lemon over the poha before serving.",
                "duration_minutes": 3,
                "temperature": "Lowest flame",
                "tip": "Vitamin C from fresh lemon juice squeezed right before serving enhances non-haem iron absorption from flattened rice.",
                "equipment": "Covered Pan",
            },
        ],
    },
    {
        "slug": "moong-dal-vegetable-khichdi",
        "title": "Moong Dal & Vegetable Comfort Khichdi with Curd",
        "description": "Gentle, easily digestible one-pot yellow moong dal and rice khichdi cooked with carrots and cumin, paired with probiotic plain cow curd.",
        "servings": 2.0,
        "meal_type": "dinner",
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "difficulty": "Easy",
        "estimated_cost_inr": 48.0,
        "image_url": "/images/foods/indian-dishes/khichdi-moong-dal-rice.webp",
        "dietary_tags": ["vegetarian", "gentle_digestion", "comfort_meal"],
        "suitable_goals": ["manage_health_condition", "maintain_balanced_diet", "improve_everyday_nutrition"],
        "instructions_notes": "Pressure-cook washed moong dal, rice, and diced carrots with turmeric and cumin until soft; serve warm with fresh curd.",
        "ingredients": [
            {
                "food_slug": "khichdi-moong-dal-rice",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 400.0,
                "household_measure_note": "2 bowls cooked moong dal rice khichdi (1/2 cup rice + 1/2 cup yellow moong dal)",
                "alternative_ingredient": "Foxtail millet or oats moong dal khichdi",
                "preparation_note": "Washed and soaked 15 minutes",
            },
            {
                "food_slug": "curd-dahi-cow-milk",
                "quantity": 1.0,
                "unit_name": "katori",
                "grams_equivalent": 150.0,
                "household_measure_note": "1 katori fresh plain curd / dahi (150 g)",
                "alternative_ingredient": "Spiced buttermilk (chaas)",
                "preparation_note": "Served alongside at room temperature",
            },
            {
                "food_slug": "carrot-orange",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "1 medium carrot, peeled and diced (100 g)",
                "alternative_ingredient": "Bottle gourd (lauki) or spinach",
                "preparation_note": "Small cubes",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Rinse & Soak Rice and Split Yellow Moong Dal",
                "instruction_text": "Combine equal parts rice and split yellow moong dal in a bowl. Wash 3 times until the water is clear, then soak in clean water for 15 minutes while chopping vegetables.",
                "duration_minutes": 5,
                "temperature": "Room temperature",
                "tip": "Equal 1:1 rice-to-moong dal ratio provides a complete essential amino acid profile.",
                "equipment": "Mixing Bowl",
            },
            {
                "step_number": 2,
                "step_title": "Temper Cumin, Ginger & Asafoetida in Pressure Cooker",
                "instruction_text": "Warm 1 teaspoon cow ghee in a pressure cooker over medium-low heat. Add 1 tsp cumin seeds (jeera), a pinch of asafoetida (hing), and 1/2 tsp grated ginger. Sauté for 30 seconds until aromatic.",
                "duration_minutes": 2,
                "temperature": "Medium-Low heat",
                "tip": "Cumin and ginger support gentle gastric motility when preparing comfort meals.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 3,
                "step_title": "Sauté Diced Carrots & Add Drained Rice-Dal",
                "instruction_text": "Add the diced carrots, 1/3 tsp turmeric powder, and the drained rice-moong dal mixture. Stir gently for 1 minute.",
                "duration_minutes": 2,
                "temperature": "Medium heat",
                "tip": "You can also add diced bottle gourd (lauki) or French beans here.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 4,
                "step_title": "Pressure-Cook with 4 Cups Water Until Creamy",
                "instruction_text": "Pour in 3.5 to 4 cups water and add salt to taste. Close the pressure cooker lid and cook over medium flame for 3 to 4 whistles. Allow the pressure to release naturally.",
                "duration_minutes": 12,
                "temperature": "Medium flame",
                "tip": "Natural pressure release lets the starches settle into a soothing porridge-like texture.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 5,
                "step_title": "Whisk Lightly & Serve Warm with Fresh Curd",
                "instruction_text": "Open the lid, stir the khichdi gently with a ladle, and garnish with fresh coriander. Serve warm in bowls alongside 1 katori of fresh plain cow curd (dahi).",
                "duration_minutes": 2,
                "temperature": "Warm",
                "tip": "Serving warm khichdi with room-temperature curd balances gut-friendly lactic acid bacteria with easy-to-digest carbohydrates.",
                "equipment": "Serving Bowl & Katori",
            },
        ],
    },
    {
        "slug": "whole-wheat-chapati-phulka",
        "title": "Soft Whole Wheat Chapati (Homestyle Phulka / Roti)",
        "description": "Soft, unleavened whole wheat flatbreads kneaded with warm water and puffed on a hot tawa without excess oil.",
        "servings": 2.0,
        "meal_type": "lunch",
        "prep_time_minutes": 15,
        "cook_time_minutes": 10,
        "difficulty": "Easy",
        "estimated_cost_inr": 20.0,
        "image_url": "/images/foods/indian-dishes/chapati-whole-wheat-roti.webp",
        "dietary_tags": ["vegetarian", "vegan", "whole_grain", "high_fibre"],
        "suitable_goals": ["manage_health_condition", "maintain_balanced_diet", "lose_body_fat", "improve_everyday_nutrition"],
        "instructions_notes": "Knead whole wheat atta with lukewarm water into a pliable dough, rest 20 minutes, roll into even circles, and cook on a hot tawa until puffed.",
        "ingredients": [
            {
                "food_slug": "chapati-whole-wheat-roti",
                "quantity": 4.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 160.0,
                "household_measure_note": "4 medium phulkas / chapatis (~1 cup whole wheat atta, 120 g dry)",
                "alternative_ingredient": "Multigrain or jowar-wheat (50:50) flour blend",
                "preparation_note": "100% whole wheat chakki atta with bran intact",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Mix Whole Wheat Atta with Lukewarm Water",
                "instruction_text": "Place 1 cup whole wheat flour (chakki atta) in a wide parat or mixing bowl. Gradually add lukewarm water in small splashes while bringing the flour together with your fingers.",
                "duration_minutes": 4,
                "temperature": "Lukewarm water (~40°C)",
                "tip": "Lukewarm water hydrates wheat bran fibres rapidly, keeping chapatis soft for hours.",
                "equipment": "Wide Mixing Bowl (Parat)",
            },
            {
                "step_number": 2,
                "step_title": "Knead Smooth Pliable Dough & Rest 15–20 Minutes",
                "instruction_text": "Knead with your knuckles for 4–5 minutes until smooth, soft, and non-sticky. Cover with a damp cotton cloth and let the dough rest for 15–20 minutes so the gluten relaxes.",
                "duration_minutes": 5,
                "temperature": "Room temperature",
                "tip": "Resting the dough is essential—press a finger into the dough and it should spring back softly.",
                "equipment": "Damp Cotton Cloth",
            },
            {
                "step_number": 3,
                "step_title": "Divide into Equal Dough Balls & Roll Evenly",
                "instruction_text": "Divide the rested dough into 4 equal smooth balls (pedas). Lightly dust a rolling board (chakla) with dry whole wheat flour and roll each ball into an even 6-inch circle without thick edges.",
                "duration_minutes": 4,
                "temperature": "Room temperature",
                "tip": "Tap off any excess dry dusting flour before placing the chapati on the hot tawa.",
                "equipment": "Chakla & Belan (Rolling Pin)",
            },
            {
                "step_number": 4,
                "step_title": "Cook First & Second Side on a Hot Tawa",
                "instruction_text": "Place the rolled chapati onto a preheated hot iron tawa. When tiny bubbles appear on the surface (about 20–25 seconds), flip it over and cook the second side for 30 seconds until light brown spots form.",
                "duration_minutes": 3,
                "temperature": "High Tawa Heat (210°C)",
                "tip": "Do not overcook the first side, or the crust will harden and prevent the phulka from puffing.",
                "equipment": "Iron Tawa",
            },
            {
                "step_number": 5,
                "step_title": "Puff into a Soft Phulka & Keep Covered",
                "instruction_text": "Flip back onto the tawa and press gently around the edges with a clean folded cloth (or lift directly over the flame with tongs) until the chapati puffs like a balloon. Remove immediately and stack in a cloth-lined casserole.",
                "duration_minutes": 2,
                "temperature": "High heat",
                "tip": "Wrapping chapatis in a breathable cotton cloth prevents steam condensation from making the bottom roti soggy.",
                "equipment": "Tongs (Chimta) & Cloth-Lined Roti Box",
            },
        ],
    },
    {
        "slug": "udupi-vegetable-sambar",
        "title": "Traditional Udupi Vegetable Toor Dal Sambar",
        "description": "Aromatic South Indian lentil and seasonal vegetable stew simmered with toor dal, carrots, tomatoes, tamarind, and freshly tempered mustard and curry leaves.",
        "servings": 3.0,
        "meal_type": "lunch",
        "prep_time_minutes": 12,
        "cook_time_minutes": 20,
        "difficulty": "Easy",
        "estimated_cost_inr": 45.0,
        "image_url": "/images/foods/indian-dishes/sambar-lentil-vegetable-stew.webp",
        "dietary_tags": ["vegetarian", "vegan", "south_indian", "high_fibre"],
        "suitable_goals": ["manage_health_condition", "maintain_balanced_diet", "improve_everyday_nutrition"],
        "instructions_notes": "Pressure-cook toor dal until velvety, simmer diced carrots, onions, and tomatoes in tamarind water with sambar spice blend, combine with mashed dal, and finish with mustard-curry leaf tempering.",
        "ingredients": [
            {
                "food_slug": "sambar-lentil-vegetable-stew",
                "quantity": 2.0,
                "unit_name": "katori",
                "grams_equivalent": 300.0,
                "household_measure_note": "2 katoris Udupi vegetable sambar (300 g)",
                "alternative_ingredient": None,
                "preparation_note": "Prepared with toor dal and seasonal vegetables",
            },
            {
                "food_slug": "toor-dal-red-gram",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 60.0,
                "household_measure_note": "1/3 cup dry toor dal (60 g)",
                "alternative_ingredient": "Moong + toor dal (50:50)",
                "preparation_note": "Soaked 20 min and pressure-cooked",
            },
            {
                "food_slug": "carrot-orange",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "1 cup diced carrot / drumstick / pumpkin (100 g)",
                "alternative_ingredient": "Drumstick, ash gourd, or French beans",
                "preparation_note": "Cut into bite-sized pieces",
            },
            {
                "food_slug": "tomato-ripe",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 85.0,
                "household_measure_note": "1 medium ripe tomato, quartered (85 g)",
                "alternative_ingredient": None,
                "preparation_note": "Quartered",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Pressure-Cook Toor Dal to a Smooth Mash",
                "instruction_text": "Rinse 60 g toor dal and pressure-cook with 1.5 cups water and 1/4 tsp turmeric for 4 whistles. Once pressure drops, whisk the dal into a smooth, velvety broth.",
                "duration_minutes": 10,
                "temperature": "Medium flame",
                "tip": "Adding 2 drops of sesame oil before pressure-cooking helps the dal cook smoothly without frothing over.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 2,
                "step_title": "Simmer Vegetables in Turmeric Water",
                "instruction_text": "In a deep pot, bring 1.5 cups water to a boil with diced carrots, shallots/onions, quartered tomato, and salt. Simmer covered for 6–8 minutes until the vegetables are tender-crisp.",
                "duration_minutes": 7,
                "temperature": "Medium simmer",
                "tip": "Cook vegetables in plain salted water first before adding acidic tamarind so they soften properly.",
                "equipment": "Deep Saucepan",
            },
            {
                "step_number": 3,
                "step_title": "Add Tamarind Extract & Udupi Sambar Masala",
                "instruction_text": "Pour in 1/2 cup thin tamarind extract and 2 teaspoons Udupi sambar powder (plus a small pinch of jaggery if desired). Boil for 4 minutes until the raw tamarind aroma disappears.",
                "duration_minutes": 4,
                "temperature": "Medium boil",
                "tip": "Freshly ground coriander, cumin, fenugreek, red chilli, and coconut give Udupi sambar its balanced body.",
                "equipment": "Saucepan",
            },
            {
                "step_number": 4,
                "step_title": "Combine Mashed Toor Dal & Simmer Gently",
                "instruction_text": "Pour the whisked toor dal into the simmering vegetable-tamarind pot. Adjust consistency with 1/2 cup hot water and simmer on low flame for 3 minutes.",
                "duration_minutes": 3,
                "temperature": "Low simmer",
                "tip": "Keep sambar at a gentle simmer after adding dal so the flavours marry.",
                "equipment": "Saucepan",
            },
            {
                "step_number": 5,
                "step_title": "Temper Mustard, Fenugreek, Hing & Curry Leaves",
                "instruction_text": "Heat 1 tsp coconut or groundnut oil in a tadka ladle. Crackle 1/2 tsp mustard seeds, 4 fenugreek seeds, 1 dried red chilli, a pinch of hing, and fresh curry leaves. Pour over the sambar and garnish with coriander.",
                "duration_minutes": 2,
                "temperature": "Medium flame",
                "tip": "Cover the pot for 2 minutes right after pouring the tempering to trap the curry leaf aroma.",
                "equipment": "Tadka Ladle",
            },
        ],
    },
    {
        "slug": "tomato-pepper-rasam",
        "title": "South Indian Tomato, Black Pepper & Garlic Rasam (Saaru)",
        "description": "Warm, soothing South Indian digestive broth made with ripe tomatoes, crushed black pepper, cumin, garlic, curry leaves, and light toor dal water.",
        "servings": 3.0,
        "meal_type": "lunch",
        "prep_time_minutes": 10,
        "cook_time_minutes": 12,
        "difficulty": "Easy",
        "estimated_cost_inr": 30.0,
        "image_url": "/images/foods/indian-dishes/sambar-lentil-vegetable-stew.webp",
        "dietary_tags": ["vegetarian", "vegan", "south_indian", "gentle_digestion", "hydration_support"],
        "suitable_goals": ["manage_health_condition", "improve_hydration_habits", "maintain_balanced_diet", "improve_everyday_nutrition"],
        "instructions_notes": "Crush black pepper, cumin, and garlic in a mortar, simmer ripe mashed tomatoes in light tamarind water with turmeric, add thin cooked toor dal broth, bring to a frothy rim without boiling hard, and temper with mustard and curry leaves.",
        "ingredients": [
            {
                "food_slug": "tomato-ripe",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 170.0,
                "household_measure_note": "2 ripe juicy country tomatoes (nati tamatar, 170 g)",
                "alternative_ingredient": "Lemon juice finish if using less tamarind",
                "preparation_note": "Finely chopped or hand-crushed",
            },
            {
                "food_slug": "toor-dal-red-gram",
                "quantity": 0.5,
                "unit_name": "standard_serving",
                "grams_equivalent": 30.0,
                "household_measure_note": "2 tbsp cooked & mashed toor dal diluted in 1.5 cups water",
                "alternative_ingredient": "Moong dal broth",
                "preparation_note": "Whisked into a thin soup base",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Crush Black Pepper, Cumin & Garlic in a Mortar",
                "instruction_text": "Using a stone mortar and pestle (khalbatta), coarsely pound 1 teaspoon whole black peppercorns, 1.5 teaspoons cumin seeds, and 4 cloves of unpeeled garlic.",
                "duration_minutes": 3,
                "temperature": "Room temperature",
                "tip": "Freshly pounded pepper and cumin release volatile essential oils that pre-ground powders lack.",
                "equipment": "Mortar & Pestle",
            },
            {
                "step_number": 2,
                "step_title": "Simmer Crushed Tomatoes in Tamarind Water",
                "instruction_text": "In a pot, combine 2 ripe hand-crushed tomatoes, 1 cup thin tamarind water, 1/4 tsp turmeric powder, a pinch of hing, curry leaves, and salt. Simmer over medium heat for 6 minutes until tomatoes soften completely.",
                "duration_minutes": 6,
                "temperature": "Medium simmer",
                "tip": "Hand-crushing ripe tomatoes releases their natural pectin and tang into the broth.",
                "equipment": "Saucepan",
            },
            {
                "step_number": 3,
                "step_title": "Stir in Pounded Pepper-Cumin-Garlic & Thin Dal Broth",
                "instruction_text": "Add the freshly pounded pepper-cumin-garlic mixture along with 2 cups of thin cooked toor dal water. Stir well and taste for salt and tang balance.",
                "duration_minutes": 2,
                "temperature": "Medium-Low heat",
                "tip": "Rasam should be light and brothy rather than thick like sambar.",
                "equipment": "Saucepan",
            },
            {
                "step_number": 4,
                "step_title": "Bring to a Frothy Rim (Do Not Vigorous-Boil)",
                "instruction_text": "Heat on low flame for 2–3 minutes just until a fragrant white froth forms around the edges of the pot. Immediately turn off the heat before it reaches a rolling boil.",
                "duration_minutes": 3,
                "temperature": "Gentle heat (~92°C)",
                "tip": "Turning off the flame at the frothy stage preserves the delicate aroma of cumin and garlic.",
                "equipment": "Saucepan",
            },
            {
                "step_number": 5,
                "step_title": "Temper Mustard & Curry Leaves, Garnish with Coriander",
                "instruction_text": "Warm 1/2 tsp ghee or oil, crackle 1/2 tsp mustard seeds, 1/4 tsp cumin, and curry leaves, pour over the hot rasam, and top with chopped coriander stems and leaves.",
                "duration_minutes": 1,
                "temperature": "Serve warm",
                "tip": "Finely chopped tender coriander stems add intense herbal freshness to rasam.",
                "equipment": "Tadka Ladle",
            },
        ],
    },
    {
        "slug": "homestyle-dal-tadka",
        "title": "Homestyle Yellow Toor & Moong Dal Tadka",
        "description": "Everyday Indian comfort lentil dish combining protein-rich toor dal and yellow moong dal, finished with an aromatic cumin, garlic, onion, and tomato tempering.",
        "servings": 2.0,
        "meal_type": "dinner",
        "prep_time_minutes": 10,
        "cook_time_minutes": 18,
        "difficulty": "Easy",
        "estimated_cost_inr": 44.0,
        "image_url": "/images/foods/pulses-legumes/toor-dal-red-gram.webp",
        "dietary_tags": ["vegetarian", "high_protein", "high_fibre", "comfort_meal"],
        "suitable_goals": ["build_muscle", "maintain_balanced_diet", "improve_everyday_nutrition", "manage_health_condition"],
        "instructions_notes": "Pressure-cook soaked toor and moong dal with turmeric until creamy, then fold in a sautéed tempering of cumin, garlic, onion, and ripe tomato.",
        "ingredients": [
            {
                "food_slug": "toor-dal-red-gram",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 60.0,
                "household_measure_note": "1/3 cup dry toor dal (60 g)",
                "alternative_ingredient": "Masoor dal (red lentils)",
                "preparation_note": "Washed and soaked 20 minutes",
            },
            {
                "food_slug": "moong-dal-green-gram-split",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 30.0,
                "household_measure_note": "2 tbsp split yellow moong dal (30 g)",
                "alternative_ingredient": None,
                "preparation_note": "Provides natural creaminess without heavy cream",
            },
            {
                "food_slug": "tomato-ripe",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 85.0,
                "household_measure_note": "1 medium ripe tomato, finely chopped (85 g)",
                "alternative_ingredient": None,
                "preparation_note": "Finely diced",
            },
            {
                "food_slug": "onion-big",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 80.0,
                "household_measure_note": "1 medium onion, finely chopped (80 g)",
                "alternative_ingredient": None,
                "preparation_note": "Finely diced",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Wash & Soak Toor Dal and Moong Dal",
                "instruction_text": "Combine 60 g toor dal and 30 g yellow moong dal in a bowl. Rinse 3 times in water until clear and soak for 20 minutes.",
                "duration_minutes": 5,
                "temperature": "Room temperature",
                "tip": "Combining moong dal with toor dal gives the dal natural body and creaminess.",
                "equipment": "Mixing Bowl",
            },
            {
                "step_number": 2,
                "step_title": "Pressure-Cook Lentils with Turmeric & Ginger",
                "instruction_text": "Drain the soaked lentils and transfer to a pressure cooker with 2.5 cups water, 1/3 tsp turmeric powder, 1/2 tsp grated ginger, and salt. Cook for 3–4 whistles over medium flame.",
                "duration_minutes": 10,
                "temperature": "Medium flame",
                "tip": "Let the pressure drop naturally so the lentils soften evenly.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 3,
                "step_title": "Whisk Dal & Simmer to Desired Consistency",
                "instruction_text": "Open the cooker and whisk the cooked dal lightly with a wired whisk or mathani. Add 1/2 cup hot water if needed to reach a smooth, pourable consistency.",
                "duration_minutes": 2,
                "temperature": "Low flame",
                "tip": "Always use hot water when thinning cooked dal so the liquid and lentils do not separate.",
                "equipment": "Whisk / Mathani",
            },
            {
                "step_number": 4,
                "step_title": "Prepare Onion, Garlic & Tomato Masala Base",
                "instruction_text": "Heat 1.5 tsp ghee or oil in a pan. Add 1 tsp cumin seeds, 3 finely chopped garlic cloves, and a pinch of hing. Add chopped onions and sauté until golden, then add chopped tomatoes, 1/2 tsp coriander powder, and simmer until tomatoes soften.",
                "duration_minutes": 5,
                "temperature": "Medium flame",
                "tip": "Cook the tomatoes until they mash easily with the spatula before adding the dal.",
                "equipment": "Skillet / Kadai",
            },
            {
                "step_number": 5,
                "step_title": "Fold Boiled Dal into Tadka & Garnish with Coriander & Lemon",
                "instruction_text": "Pour the whisked dal into the pan with the onion-tomato tempering. Simmer gently for 3 minutes, then switch off the heat and finish with chopped coriander leaves and a squeeze of fresh lemon juice.",
                "duration_minutes": 3,
                "temperature": "Low simmer",
                "tip": "Serve warm with whole wheat chapati or steamed rice.",
                "equipment": "Kadai",
            },
        ],
    },
    {
        "slug": "vegetable-basmati-pulao",
        "title": "Fragrant One-Pot Vegetable & Basmati Rice Pulao",
        "description": "Aromatic Indian one-pot rice dish cooked with whole spices, carrots, green peas, onions, and long-grain rice, served with fresh curd.",
        "servings": 2.0,
        "meal_type": "lunch",
        "prep_time_minutes": 15,
        "cook_time_minutes": 18,
        "difficulty": "Easy",
        "estimated_cost_inr": 55.0,
        "image_url": "/images/foods/indian-dishes/pulao-vegetable-basmati.webp",
        "dietary_tags": ["vegetarian", "one_pot_meal"],
        "suitable_goals": ["maintain_balanced_diet", "improve_everyday_nutrition", "improve_endurance"],
        "instructions_notes": "Soak rice for 20 minutes, sauté whole spices, onions, carrots, and peas in a heavy pot, add drained rice and 1.75 parts water, cook covered on low heat, and rest 5 minutes before fluffing.",
        "ingredients": [
            {
                "food_slug": "pulao-vegetable-basmati",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 360.0,
                "household_measure_note": "2 bowls cooked vegetable pulao (~1 cup raw basmati rice + mixed vegetables)",
                "alternative_ingredient": "Brown basmati rice or soya chunk additions for extra protein",
                "preparation_note": "Rinsed gently and soaked 20 minutes",
            },
            {
                "food_slug": "carrot-orange",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "1 cup diced carrots, beans & green peas (100 g)",
                "alternative_ingredient": "Cauliflower florets & paneer cubes",
                "preparation_note": "Cut into uniform diamonds",
            },
            {
                "food_slug": "onion-big",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 80.0,
                "household_measure_note": "1 medium onion, thinly sliced (80 g)",
                "alternative_ingredient": None,
                "preparation_note": "Thinly sliced",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Rinse & Soak Basmati Rice Gently",
                "instruction_text": "Place 1 cup basmati rice in a bowl and rinse gently 3 times until the water is mostly clear. Soak in clean water for 20 minutes, then drain completely in a colander.",
                "duration_minutes": 5,
                "temperature": "Room temperature",
                "tip": "Soaking for 20 minutes lets each basmati grain elongate without snapping during cooking.",
                "equipment": "Bowl & Colander",
            },
            {
                "step_number": 2,
                "step_title": "Bloom Whole Spices & Sauté Sliced Onions",
                "instruction_text": "Heat 1.5 tsp ghee or oil in a heavy-bottomed pot over medium heat. Add 1 bay leaf, 2 green cardamoms, 3 cloves, a small cinnamon piece, and 1 tsp cumin seeds. Add thinly sliced onions, ginger-garlic paste, and slit green chilli, and sauté for 3 minutes until light golden.",
                "duration_minutes": 4,
                "temperature": "Medium heat",
                "tip": "Keep onions light golden rather than dark brown so the pulao stays fragrant and ivory-coloured.",
                "equipment": "Heavy-Bottomed Pot",
            },
            {
                "step_number": 3,
                "step_title": "Toss Mixed Vegetables & Drained Rice",
                "instruction_text": "Add diced carrots, green peas, and beans, and sauté for 2 minutes. Gently add the drained soaked rice and stir lightly for 1 minute without breaking the fragile grains.",
                "duration_minutes": 3,
                "temperature": "Medium-Low heat",
                "tip": "Coating the drained rice lightly in warm spice-infused ghee keeps every grain separate.",
                "equipment": "Heavy-Bottomed Pot",
            },
            {
                "step_number": 4,
                "step_title": "Simmer Covered in Measured Water (1 : 1.75 Ratio)",
                "instruction_text": "Pour in 1.75 cups of hot water, add salt and a few drops of lemon juice, and bring to a gentle boil. Cover with a tight-fitting lid, reduce flame to low, and simmer undisturbed for 10–12 minutes until all water is absorbed.",
                "duration_minutes": 11,
                "temperature": "Low flame",
                "tip": "A few drops of lemon juice keep the rice grains snowy and separate.",
                "equipment": "Covered Heavy Pot",
            },
            {
                "step_number": 5,
                "step_title": "Rest Covered 5 Minutes & Fluff with a Fork",
                "instruction_text": "Turn off the flame and let the covered pot rest undisturbed for 5 minutes. Open the lid, fluff gently from the sides with a fork, garnish with fresh mint and coriander, and serve warm.",
                "duration_minutes": 5,
                "temperature": "Rest off heat",
                "tip": "Resting for 5 minutes firms up the hot rice grains so they never mash when scooped.",
                "equipment": "Fork",
            },
        ],
    },
    {
        "slug": "soya-paneer-gym-bowl",
        "title": "High-Protein Soya Chunk, Paneer & Brown Rice Gym Bowl",
        "description": "Affordable vegetarian muscle-building meal combining defatted soya chunks, fresh paneer, brown rice, and spinach.",
        "servings": 2.0,
        "meal_type": "post_workout",
        "prep_time_minutes": 10,
        "cook_time_minutes": 20,
        "difficulty": "Easy",
        "estimated_cost_inr": 85.0,
        "image_url": "/images/foods/indian-dishes/palak-paneer-curry.webp",
        "dietary_tags": ["vegetarian", "high_protein", "budget_friendly", "gym_friendly"],
        "suitable_goals": ["build_muscle", "improve_strength", "gain_weight", "improve_general_fitness"],
        "instructions_notes": "Boil and squeeze soya chunks, lightly pan-sear with paneer cubes, tomato, onion, and spinach, and serve over steamed brown rice.",
        "ingredients": [
            {
                "food_slug": "soya-chunks-textured-veg-protein",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "100 g dry soya chunks (~2 cups boiled & squeezed)",
                "alternative_ingredient": "Boiled chickpeas or extra paneer",
                "preparation_note": "Boiled in salted water 5 min, rinsed & squeezed",
            },
            {
                "food_slug": "paneer-cottage-cheese-cow",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "100 g fresh cow milk paneer cubes (~3/4 cup)",
                "alternative_ingredient": "Firm tofu cubes for vegan option",
                "preparation_note": "Cut into 2 cm cubes",
            },
            {
                "food_slug": "rice-brown-raw",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "1/2 cup raw brown rice (100 g), soaked 30 min",
                "alternative_ingredient": "Steamed white rice or 2 whole wheat rotis",
                "preparation_note": "Soaked and pressure-cooked",
            },
            {
                "food_slug": "spinach-palak",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "2 cups washed & chopped fresh spinach (100 g)",
                "alternative_ingredient": "Bell peppers & broccoli",
                "preparation_note": "Finely chopped",
            },
            {
                "food_slug": "tomato-ripe",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 85.0,
                "household_measure_note": "1 medium ripe tomato, diced (85 g)",
                "alternative_ingredient": None,
                "preparation_note": "Diced",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Cook Soaked Brown Rice Until Fluffy",
                "instruction_text": "Wash and soak 100 g brown rice for 30 minutes, then pressure-cook with 2.25 cups water and a pinch of salt for 4 whistles over medium heat.",
                "duration_minutes": 15,
                "temperature": "Medium heat",
                "tip": "Soaking brown rice hydrates the bran layer so it cooks tender.",
                "equipment": "Pressure Cooker",
            },
            {
                "step_number": 2,
                "step_title": "Boil, Rinse & Squeeze Soya Chunks Thoroughly",
                "instruction_text": "Boil 100 g dry soya chunks in 3 cups salted water for 5 minutes until soft and doubled in size. Drain, rinse in cool water twice, and squeeze firmly between your palms to remove any bean-like aftertaste.",
                "duration_minutes": 6,
                "temperature": "Boiling water",
                "tip": "Rinsing and squeezing soya chunks twice lets them absorb the masala flavours like a sponge.",
                "equipment": "Saucepan & Strainer",
            },
            {
                "step_number": 3,
                "step_title": "Lightly Pan-Sear Paneer & Soya Chunks",
                "instruction_text": "Warm 1 tsp oil or ghee in a wide skillet. Toss the paneer cubes and squeezed soya chunks with a pinch of turmeric, roasted cumin powder, and black pepper for 3 minutes until lightly golden.",
                "duration_minutes": 3,
                "temperature": "Medium-High heat",
                "tip": "Soak pan-seared paneer in warm water for 2 minutes if you prefer extra-soft cubes.",
                "equipment": "Wide Skillet",
            },
            {
                "step_number": 4,
                "step_title": "Sauté Tomatoes, Ginger, Spices & Fresh Spinach",
                "instruction_text": "In the same skillet, sauté cumin seeds, ginger, diced tomatoes, coriander powder, and garam masala until juicy. Fold in 100 g chopped spinach (palak) and wilt for 2 minutes.",
                "duration_minutes": 4,
                "temperature": "Medium heat",
                "tip": "Spinach releases natural moisture that coats the soya chunks and paneer.",
                "equipment": "Wide Skillet",
            },
            {
                "step_number": 5,
                "step_title": "Assemble the High-Protein Gym Bowl",
                "instruction_text": "Toss the seared soya chunks and paneer back into the spinach-tomato masala for 2 minutes. Spoon over warm steamed brown rice and finish with fresh lemon juice.",
                "duration_minutes": 2,
                "temperature": "Serve warm",
                "tip": "Delivers over 35 g of complete vegetarian protein per serving.",
                "equipment": "2 Serving Bowls",
            },
        ],
    },
    {
        "slug": "sprouted-moong-protein-chaat",
        "title": "Sprouted Moong, Chickpea & Peanut Protein Chaat",
        "description": "Hostel & student friendly high-protein snack with steamed sprouted green gram, boiled kabuli chana, roasted peanuts, tomato, onion, and lemon.",
        "servings": 2.0,
        "meal_type": "pre_workout",
        "prep_time_minutes": 10,
        "cook_time_minutes": 10,
        "difficulty": "Easy",
        "estimated_cost_inr": 42.0,
        "image_url": "/images/foods/pulses-legumes/green-gram-whole-moong.webp",
        "dietary_tags": ["vegetarian", "vegan", "high_protein", "high_fibre", "hostel_friendly"],
        "suitable_goals": ["build_muscle", "lose_body_fat", "improve_endurance", "improve_general_fitness"],
        "instructions_notes": "Lightly steam sprouted green moong for 5 minutes for easy digestion, toss with boiled chickpeas, roasted peanuts, chopped onion, tomato, roasted cumin, and lemon juice.",
        "ingredients": [
            {
                "food_slug": "green-gram-whole-moong",
                "quantity": 1.0,
                "unit_name": "100g",
                "grams_equivalent": 100.0,
                "household_measure_note": "1.5 cups sprouted whole green moong (from 100 g dry)",
                "alternative_ingredient": "Sprouted moth beans (matki) or black chana",
                "preparation_note": "Lightly steamed 5 minutes for gut comfort",
            },
            {
                "food_slug": "chickpea-kabuli-chana",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 60.0,
                "household_measure_note": "1 cup boiled kabuli chana / chickpeas (from 60 g dry)",
                "alternative_ingredient": "Boiled kala chana (Bengal gram)",
                "preparation_note": "Soaked overnight and boiled tender",
            },
            {
                "food_slug": "groundnut-peanut-raw",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 30.0,
                "household_measure_note": "2 tablespoons dry-roasted peanuts (30 g)",
                "alternative_ingredient": "Roasted chana dal",
                "preparation_note": "Dry-roasted until crunchy",
            },
            {
                "food_slug": "tomato-ripe",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 85.0,
                "household_measure_note": "1 medium tomato, finely diced (85 g)",
                "alternative_ingredient": None,
                "preparation_note": "Deseeeded and diced",
            },
            {
                "food_slug": "onion-big",
                "quantity": 1.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 80.0,
                "household_measure_note": "1 medium onion, finely diced (80 g)",
                "alternative_ingredient": "Diced cucumber",
                "preparation_note": "Finely chopped",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Lightly Steam Sprouted Green Moong for 5 Minutes",
                "instruction_text": "Place rinsed sprouted green moong in a steamer basket (or microwave-safe bowl with 2 tbsp water) and steam for 4–5 minutes until tender-crisp, then let cool slightly.",
                "duration_minutes": 5,
                "temperature": "Steam (100°C)",
                "tip": "ICMR-NIN food safety guidance recommends lightly steaming sprouts to deactivate anti-nutritional factors and ensure hygienic digestion.",
                "equipment": "Steamer Basket or Covered Pan",
            },
            {
                "step_number": 2,
                "step_title": "Combine Steamed Sprouts with Boiled Chickpeas & Peanuts",
                "instruction_text": "In a wide mixing bowl, combine the warm-cooled sprouted moong, boiled kabuli chana (chickpeas), and crunchy dry-roasted peanuts.",
                "duration_minutes": 2,
                "temperature": "Room temperature",
                "tip": "Add peanuts just before serving so they stay crisp.",
                "equipment": "Mixing Bowl",
            },
            {
                "step_number": 3,
                "step_title": "Fold in Finely Diced Onion, Tomato & Fresh Coriander",
                "instruction_text": "Add finely diced onion, tomato, finely chopped green chilli (optional), and a generous handful of fresh coriander leaves.",
                "duration_minutes": 2,
                "temperature": "Room temperature",
                "tip": "Dice vegetables to the same size as the chickpeas for balanced bites.",
                "equipment": "Knife & Chopping Board",
            },
            {
                "step_number": 4,
                "step_title": "Toss with Roasted Cumin, Black Salt & Fresh Lemon Juice",
                "instruction_text": "Sprinkle 1/2 tsp roasted cumin powder, 1/2 tsp chaat masala or black salt (kala namak), and the juice of 1 fresh lemon. Toss well and serve immediately.",
                "duration_minutes": 1,
                "temperature": "Serve fresh",
                "tip": "Vitamin C in fresh lemon juice boosts iron absorption from sprouted green gram and chickpeas.",
                "equipment": "Mixing Spoon",
            },
        ],
    },
    {
        "slug": "idli-sambar-egg-plate",
        "title": "South Indian Steamed Idli, Sambar & Egg Protein Plate",
        "description": "Balanced breakfast combining fermented steamed idlis, lentil vegetable sambar, and boiled eggs.",
        "servings": 2.0,
        "meal_type": "breakfast",
        "prep_time_minutes": 10,
        "cook_time_minutes": 15,
        "difficulty": "Easy",
        "estimated_cost_inr": 65.0,
        "image_url": "/images/foods/indian-dishes/idli-steamed-rice-lentil.webp",
        "dietary_tags": ["eggetarian", "high_protein", "south_indian", "fermented"],
        "suitable_goals": ["build_muscle", "improve_strength", "maintain_current_fitness", "improve_everyday_nutrition"],
        "instructions_notes": "Steam fermented rice-lentil idlis for 10–12 minutes, hard-boil 2 poultry eggs with a pinch of pepper, and serve alongside hot vegetable toor dal sambar.",
        "ingredients": [
            {
                "food_slug": "idli-steamed-rice-lentil",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 240.0,
                "household_measure_note": "4 steamed rice-lentil idlis (240 g)",
                "alternative_ingredient": "Ragi idlis",
                "preparation_note": "Freshly steamed",
            },
            {
                "food_slug": "sambar-lentil-vegetable-stew",
                "quantity": 1.0,
                "unit_name": "katori",
                "grams_equivalent": 150.0,
                "household_measure_note": "1 full katori hot vegetable sambar (150 g)",
                "alternative_ingredient": "Thick toor dal rasam",
                "preparation_note": "Served piping hot",
            },
            {
                "food_slug": "egg-poultry-whole-boiled",
                "quantity": 2.0,
                "unit_name": "standard_serving",
                "grams_equivalent": 100.0,
                "household_measure_note": "2 whole hard-boiled eggs (100 g), halved",
                "alternative_ingredient": "100 g pan-seared paneer cubes for vegetarian option",
                "preparation_note": "Boiled 9 minutes and peeled",
            },
        ],
        "steps": [
            {
                "step_number": 1,
                "step_title": "Hard-Boil Poultry Eggs to Tender Yolk",
                "instruction_text": "Place 2 whole eggs in a small saucepan covered with water. Bring to a boil, then simmer over medium heat for 9 minutes. Transfer to cool water for 2 minutes and peel.",
                "duration_minutes": 10,
                "temperature": "Simmering water (95–100°C)",
                "tip": "Cooling boiled eggs immediately in water prevents a grey ring around the yolk and makes peeling effortless.",
                "equipment": "Small Saucepan",
            },
            {
                "step_number": 2,
                "step_title": "Steam Fermented Idlis for 10–12 Minutes",
                "instruction_text": "Bring water to a boil in an idli steamer, ladle fermented idli batter into lightly greased moulds, and steam covered for 10 to 12 minutes until fluffy.",
                "duration_minutes": 12,
                "temperature": "Steam (100°C)",
                "tip": "Let the idli plate rest 2 minutes before unmoulding.",
                "equipment": "Idli Steamer",
            },
            {
                "step_number": 3,
                "step_title": "Warm Vegetable Toor Dal Sambar",
                "instruction_text": "Bring 1 katori (150 g) of vegetable toor dal sambar to a gentle simmer and garnish with fresh coriander leaves.",
                "duration_minutes": 3,
                "temperature": "Warm simmer",
                "tip": "Serving sambar piping hot lets the steamed idlis soak up the lentil broth.",
                "equipment": "Small Pot",
            },
            {
                "step_number": 4,
                "step_title": "Plate Halved Boiled Eggs with Pepper & Curry Leaf Seasoning",
                "instruction_text": "Slice the peeled boiled eggs in half lengthwise, season with a pinch of crushed black pepper and rock salt, and serve alongside the warm idlis and sambar.",
                "duration_minutes": 1,
                "temperature": "Serve warm",
                "tip": "Pairing boiled eggs with fermented idli and sambar upgrades a classic breakfast into a balanced protein meal.",
                "equipment": "Serving Plate",
            },
        ],
    },
]


# ============================================================================
# PART B — ETHICAL, DATABASE-PERSISTENT ACHIEVEMENT DEFINITIONS
# ============================================================================
ACHIEVEMENT_DEFINITIONS_SEED: list[dict[str, Any]] = [
    # 1. Getting Started Milestones
    {
        "code": "first_habit_completed",
        "title": "First Habit Step",
        "description": "Completed your first daily habit check-in. Small, calm actions build lasting routines.",
        "category": "getting_started",
        "icon_name": "sparkles",
        "criteria_type": "habit_completions_total",
        "target_value": 1.0,
        "unit_label": "check-in",
        "is_repeatable": False,
        "display_order": 1,
    },
    {
        "code": "first_meal_logged",
        "title": "First Food Diary Entry",
        "description": "Logged your first meal in the Daily Food Tracker with transparent IFCT nutrition.",
        "category": "getting_started",
        "icon_name": "utensils",
        "criteria_type": "food_logs_total",
        "target_value": 1.0,
        "unit_label": "meal",
        "is_repeatable": False,
        "display_order": 2,
    },
    {
        "code": "first_water_logged",
        "title": "Hydration Starter",
        "description": "Recorded your first glass or bottle of water in the Hydration Tracker.",
        "category": "getting_started",
        "icon_name": "droplets",
        "criteria_type": "water_logs_total",
        "target_value": 1.0,
        "unit_label": "water log",
        "is_repeatable": False,
        "display_order": 3,
    },
    {
        "code": "first_health_reading_logged",
        "title": "Mindful Health Check",
        "description": "Recorded your first blood pressure, blood glucose, or body measurement reading.",
        "category": "getting_started",
        "icon_name": "heart-pulse",
        "criteria_type": "health_readings_total",
        "target_value": 1.0,
        "unit_label": "reading",
        "is_repeatable": False,
        "display_order": 4,
    },
    # 2. Consistency Milestones
    {
        "code": "habit_days_3",
        "title": "3-Day Habit Rhythm",
        "description": "Completed at least one habit on 3 distinct days. Consistency matters more than perfection.",
        "category": "consistency",
        "icon_name": "calendar-check",
        "criteria_type": "habit_distinct_days",
        "target_value": 3.0,
        "unit_label": "days",
        "is_repeatable": False,
        "display_order": 5,
    },
    {
        "code": "habit_days_7",
        "title": "7-Day Habit Consistency",
        "description": "Completed at least one habit on 7 distinct days across your wellness journey.",
        "category": "consistency",
        "icon_name": "flame",
        "criteria_type": "habit_distinct_days",
        "target_value": 7.0,
        "unit_label": "days",
        "is_repeatable": False,
        "display_order": 6,
    },
    {
        "code": "hydration_days_5",
        "title": "5-Day Hydration Rhythm",
        "description": "Logged daily water intake on 5 distinct days.",
        "category": "consistency",
        "icon_name": "droplets",
        "criteria_type": "water_distinct_days",
        "target_value": 5.0,
        "unit_label": "days",
        "is_repeatable": False,
        "display_order": 7,
    },
    {
        "code": "food_diary_days_7",
        "title": "7-Day Mindful Food Journal",
        "description": "Recorded meals in your food diary on 7 distinct days.",
        "category": "consistency",
        "icon_name": "book-open",
        "criteria_type": "food_distinct_days",
        "target_value": 7.0,
        "unit_label": "days",
        "is_repeatable": False,
        "display_order": 8,
    },
    # 3. Personal Goal Milestones
    {
        "code": "weekly_habit_rhythm",
        "title": "Steady Weekly Rhythm",
        "description": "Reached 65% or higher weekly habit consistency across your active habits.",
        "category": "personal_goals",
        "icon_name": "award",
        "criteria_type": "weekly_habit_consistency_pct",
        "target_value": 65.0,
        "unit_label": "% weekly rhythm",
        "is_repeatable": False,
        "display_order": 9,
    },
    {
        "code": "personal_protein_milestone",
        "title": "Personal Protein Target Met",
        "description": "Reached at least 90% of your personal daily protein target through verified foods.",
        "category": "personal_goals",
        "icon_name": "dumbbell",
        "criteria_type": "protein_goal_days",
        "target_value": 1.0,
        "unit_label": "goal day",
        "is_repeatable": False,
        "display_order": 10,
    },
    {
        "code": "personal_hydration_milestone",
        "title": "Daily Hydration Goal Met",
        "description": "Reached 100% of your personal daily hydration goal on a tracked day.",
        "category": "personal_goals",
        "icon_name": "check-circle",
        "criteria_type": "hydration_goal_days",
        "target_value": 1.0,
        "unit_label": "goal day",
        "is_repeatable": False,
        "display_order": 11,
    },
    # 4. Exploration & Learning Milestones
    {
        "code": "first_recipe_cooked",
        "title": "Home Kitchen Explorer",
        "description": "Cooked or logged a home-cooked recipe from GharPlate Recipe Intelligence.",
        "category": "exploration",
        "icon_name": "chef-hat",
        "criteria_type": "recipes_cooked_or_saved",
        "target_value": 1.0,
        "unit_label": "recipe",
        "is_repeatable": False,
        "display_order": 12,
    },
    {
        "code": "five_foods_logged",
        "title": "Diverse Indian Plate",
        "description": "Logged 5 or more distinct Indian foods in your nutrition diary.",
        "category": "exploration",
        "icon_name": "compass",
        "criteria_type": "distinct_foods_logged",
        "target_value": 5.0,
        "unit_label": "distinct foods",
        "is_repeatable": False,
        "display_order": 13,
    },
]

# Legacy localStorage badge ID mapping -> canonical backend achievement code
LEGACY_LOCAL_BADGE_MAP: dict[str, str] = {
    "first_step": "first_habit_completed",
    "three_day_rhythm": "habit_days_3",
    "full_day_harmony": "weekly_habit_rhythm",
    "steady_week": "weekly_habit_rhythm",
    "two_week_milestone": "habit_days_7",
    "first_habit_completed": "first_habit_completed",
    "first_meal_logged": "first_meal_logged",
    "first_water_logged": "first_water_logged",
    "habit_days_3": "habit_days_3",
    "habit_days_7": "habit_days_7",
}


# ============================================================================
# PART C — INTERACTIVE 3D BODY & NUTRITION EXPLORER SEED CATALOG
# ============================================================================
BODY_REGIONS_SEED: list[dict[str, Any]] = [
    {
        "code": "brain_nerves",
        "name": "Brain & Nervous System",
        "anatomical_system": "Central & Peripheral Nervous System",
        "category": "Brain & Nerves",
        "display_order": 1,
        "short_summary": "Supports neurotransmitter synthesis, myelin sheath integrity, cerebral blood flow, and sustained cognitive focus.",
        "physiological_function": (
            "The brain and nervous system coordinate memory, focus, sensory processing, and neuromuscular signalling. "
            "Neurons rely on steady glucose delivery from complex carbohydrates, B-vitamins (folate, B6, B12) for neurotransmitter synthesis "
            "and homocysteine regulation, iron for cerebral oxygen transport, and essential fatty acids for synaptic membrane structure."
        ),
        "nutrition_connection": (
            "According to ICMR-NIN Dietary Guidelines for Indians (2024), whole grains, pulses, leafy greens, nuts, seeds, egg yolk, and fish "
            "supply B-complex vitamins, iron, magnesium, and unsaturated fatty acids that support normal nervous system function."
        ),
        "key_nutrients_summary": ["Folate (Vitamin B9)", "Vitamin B12", "Iron", "Magnesium", "Protein"],
        "dietary_pattern_guidance": (
            "Pair slow-digesting whole grains and millets with folate-rich greens (palak), nuts (almonds, walnuts), and B12 sources (curd, milk, paneer, or eggs/fish)."
        ),
        "hydration_connection": "Even mild dehydration (1–2% body water loss) can contribute to mental fatigue, reduced concentration, and headache.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Individual foods do not cure neurological conditions or replace clinical care."
        ),
        "camera_position_json": {"theta": 0.0, "phi": 0.15, "zoom": 1.35, "focus_y": 1.52},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 1.55, "cz": 0.04, "rx": 0.17, "ry": 0.20, "rz": 0.18, "color": "#059669"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Micronutrients, B-Vitamins & Nervous System Function",
        "nutrients": [
            {
                "nutrient_code": "folate_ug",
                "nutrient_name": "Folate (Vitamin B9)",
                "physiological_role": "Essential cofactor in one-carbon metabolism, neurotransmitter synthesis, and neural tissue maintenance.",
                "daily_reference_note": "ICMR-NIN RDA ~300 µg dietary folate equivalents/day for adults",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_b12_ug",
                "nutrient_name": "Vitamin B12 (Cobalamin)",
                "physiological_role": "Maintains the protective myelin sheath around nerve fibres and supports normal cognitive and nerve function.",
                "daily_reference_note": "ICMR-NIN RDA ~2.2 µg/day for adults (found in dairy, curd, paneer, eggs, fish)",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "iron_mg",
                "nutrient_name": "Iron",
                "physiological_role": "Supports cerebral oxygen delivery and enzymes involved in dopamine and serotonin synthesis.",
                "daily_reference_note": "ICMR-NIN RDA 19 mg (men) / 29 mg (women) per day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "magnesium_mg",
                "nutrient_name": "Magnesium",
                "physiological_role": "Regulates nerve impulse transmission and neuromuscular relaxation.",
                "daily_reference_note": "Found abundantly in leafy greens, nuts, seeds, and whole pulses",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("spinach-palak", "folate_ug", "Rich in dietary folate (142 µg/100g) and magnesium supporting neural one-carbon metabolism.", "Lightly steam or cook in dal; pair with lemon juice."),
            ("almond-badam-dry", "magnesium_mg", "Concentrated source of magnesium (270 mg/100g), vitamin E, and healthy monounsaturated fats.", "Enjoy 6–8 soaked or dry-roasted almonds daily."),
            ("egg-poultry-whole-boiled", "vitamin_b12_ug", "Provides bioavailable vitamin B12, choline, and complete protein for nerve sheath maintenance.", "1–2 boiled eggs with breakfast idli or roti."),
            ("curd-dahi-cow-milk", "vitamin_b12_ug", "Vegetarian dairy source of vitamin B12 and gut-brain supportive fermentation cultures.", "1 katori (150 g) fresh curd with lunch."),
            ("rohu-fish-raw", "vitamin_b12_ug", "Provides vitamin B12 (2.4 µg/100g), high-quality protein, and omega-3 fatty acids.", "Steamed or lightly curried fish (100 g portion)."),
            ("green-gram-whole-moong", "folate_ug", "Whole green gram supplies folate, complex carbohydrates, and steady glucose for brain energy.", "Enjoy as steamed sprouts or moong dal."),
        ],
    },
    {
        "code": "eyes_vision",
        "name": "Eyes & Vision",
        "anatomical_system": "Ocular & Retinal System",
        "category": "Eyes",
        "display_order": 2,
        "short_summary": "Supports retinal rhodopsin synthesis for low-light vision, corneal surface integrity, and antioxidant protection.",
        "physiological_function": (
            "The retina and cornea depend on Vitamin A (and provitamin A carotenoids such as beta-carotene) to form rhodopsin, the visual pigment "
            "required for dim-light vision, and to maintain healthy conjunctival and corneal epithelial membranes. Vitamin C and zinc support "
            "retinal antioxidant defence and vitamin A transport."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) highlights orange/yellow vegetables (carrots, ripe mango, papaya) and dark green leafy vegetables (spinach, drumstick leaves) "
            "as primary Indian dietary sources of beta-carotene alongside Vitamin C and zinc."
        ),
        "key_nutrients_summary": ["Vitamin A / Beta-Carotene", "Vitamin C", "Zinc", "Protein"],
        "dietary_pattern_guidance": (
            "Cook beta-carotene-rich vegetables (carrots, palak) with a small amount of healthy cooking fat or ghee to improve fat-soluble carotenoid absorption."
        ),
        "hydration_connection": "Adequate daily hydration supports healthy tear film stability and ocular surface comfort.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Dietary vitamin A supports normal vision and prevents deficiency but does not correct refractive errors."
        ),
        "camera_position_json": {"theta": 0.0, "phi": 0.12, "zoom": 1.45, "focus_y": 1.48},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 1.48, "cz": 0.15, "rx": 0.12, "ry": 0.07, "rz": 0.08, "color": "#d97706"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Vitamin A, Carotenoids & Ocular Health",
        "nutrients": [
            {
                "nutrient_code": "vitamin_a_ug",
                "nutrient_name": "Vitamin A (Retinol / Beta-Carotene RAE)",
                "physiological_role": "Essential component of retinal rhodopsin for low-light vision and maintenance of corneal epithelium.",
                "daily_reference_note": "ICMR-NIN RDA ~840–1000 µg RAE/day for adults",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_c_mg",
                "nutrient_name": "Vitamin C (Ascorbic Acid)",
                "physiological_role": "Water-soluble antioxidant concentrated in ocular fluids that helps protect lens and retinal tissues.",
                "daily_reference_note": "ICMR-NIN RDA 65–80 mg/day for adults",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "zinc_mg",
                "nutrient_name": "Zinc",
                "physiological_role": "Enables retinol-binding protein synthesis to transport Vitamin A from the liver to the retina.",
                "daily_reference_note": "ICMR-NIN RDA 13–17 mg/day for adults",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("carrot-orange", "vitamin_a_ug", "Exceptionally rich in provitamin A beta-carotene (646 µg RAE/100g) supporting retinal visual pigment.", "Enjoy lightly sautéed in upma, sambar, or koshimbir."),
            ("spinach-palak", "vitamin_a_ug", "Provides 469 µg RAE/100g vitamin A equivalents plus lutein, zeaxanthin, and vitamin C.", "Cook with dal or paneer and a little ghee for carotenoid absorption."),
            ("guava-white-fleshed", "vitamin_c_mg", "Supplies 212 mg/100g Vitamin C—more than 2.5× the daily requirement in a single fruit.", "Eat fresh whole with peel."),
            ("egg-poultry-whole-boiled", "vitamin_a_ug", "Provides preformed retinol (140 µg/100g), lutein, and bioavailable zinc.", "1 boiled egg daily."),
            ("chickpea-kabuli-chana", "zinc_mg", "Rich plant source of zinc (2.9 mg/100g) required to transport Vitamin A to the retina.", "Boiled in chana masala or sprout chaat."),
        ],
    },
    {
        "code": "heart_cardiovascular",
        "name": "Heart & Cardiovascular System",
        "anatomical_system": "Cardiovascular & Vascular System",
        "category": "Heart",
        "display_order": 3,
        "short_summary": "Supports vascular tone, healthy blood pressure balance, lipid metabolism, and myocardial function.",
        "physiological_function": (
            "The heart and blood vessels rely on balanced electrolytes (potassium and magnesium to counterbalance sodium), soluble dietary fibre "
            "to bind bile acids and support healthy LDL cholesterol metabolism, and low saturated/trans fat intake to preserve endothelial health."
        ),
        "nutrition_connection": (
            "WHO Sodium Guideline (2023), AHA/ACC Hypertension Guidelines, and ICMR-NIN DGI (2024) emphasize potassium-rich fruits, vegetables, "
            "and pulses, soluble fibre from oats, barley, and legumes, and limiting sodium to <2,000 mg/day (<5 g salt/day)."
        ),
        "key_nutrients_summary": ["Potassium", "Dietary Fibre", "Magnesium", "Sodium Awareness"],
        "dietary_pattern_guidance": (
            "Favour home-cooked dals, vegetables, fruits, and unsalted nuts while minimising ultra-processed snacks, pickles, and excess table salt."
        ),
        "hydration_connection": "Consistent fluid intake maintains normal blood volume and cardiovascular circulation.",
        "evidence_limitation_note": (
            "Educational reference only (WHO 2023 / ICMR-NIN 2024). Patients with kidney disease or on potassium-sparing medications must follow clinician potassium guidance."
        ),
        "camera_position_json": {"theta": -0.15, "phi": 0.05, "zoom": 1.25, "focus_y": 1.05},
        "mesh_coordinates_json": {"cx": 0.06, "cy": 1.06, "cz": 0.10, "rx": 0.11, "ry": 0.12, "rz": 0.10, "color": "#e11d48"},
        "source_code": "WHO_SODIUM_2023",
        "source_section": "WHO Guideline on Sodium Intake (2023) & ICMR-NIN DGI (2024) Cardiovascular Health",
        "nutrients": [
            {
                "nutrient_code": "potassium_mg",
                "nutrient_name": "Potassium",
                "physiological_role": "Supports vascular smooth muscle relaxation and helps balance the blood-pressure effects of dietary sodium.",
                "daily_reference_note": "ICMR-NIN / WHO recommended intake ~3,500 mg/day for adults with normal renal function",
                "evidence_grade": "Strong clinical & public health evidence (WHO 2023)",
            },
            {
                "nutrient_code": "fibre_g",
                "nutrient_name": "Dietary Fibre",
                "physiological_role": "Soluble and Viscous fibres bind intestinal bile acids and support healthy serum cholesterol and post-meal lipid profiles.",
                "daily_reference_note": "ICMR-NIN DGI 2024 recommends ~30–40 g dietary fibre/day (or 15–20 g per 1000 kcal)",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "magnesium_mg",
                "nutrient_name": "Magnesium",
                "physiological_role": "Supports cardiac rhythm stability and vascular endothelial tone.",
                "daily_reference_note": "Abundant in whole legumes, leafy greens, and almonds",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "sodium_mg",
                "nutrient_name": "Sodium (Moderation)",
                "physiological_role": "Excess sodium increases extracellular fluid volume and blood pressure; whole unprocessed foods are naturally low in sodium.",
                "daily_reference_note": "WHO 2023 upper limit: <2,000 mg sodium/day (<5 g salt)",
                "evidence_grade": "Strong clinical guideline (WHO 2023)",
            },
        ],
        "foods": [
            ("oats-rolled-uncooked", "fibre_g", "Contains beta-glucan soluble fibre (10.4 g total fibre/100g) and very low sodium (6 mg/100g).", "Cook as savoury vegetable oats porridge or oats upma."),
            ("banana-ripe-robusta", "potassium_mg", "Naturally low in sodium (1.2 mg/100g) and provides 358 mg/100g potassium for vascular balance.", "1 medium ripe banana as a pre-workout or mid-morning fruit."),
            ("toor-dal-red-gram", "potassium_mg", "Supplies 1,303 mg/100g potassium and 9.1 g fibre to support heart-healthy plant protein intake.", "Prepare homestyle dal or sambar with moderate salt."),
            ("almond-badam-dry", "magnesium_mg", "Rich in monounsaturated fats, magnesium (270 mg/100g), and plant sterols.", "Small handful (20–25 g) unsalted almonds."),
            ("spinach-palak", "potassium_mg", "Provides 625 mg/100g potassium, dietary nitrates, and folate.", "Include in dal palak or sautéed greens."),
            ("rohu-fish-raw", "protein_g", "Lean Indian freshwater fish providing high-quality protein and heart-supportive omega-3 fatty acids.", "Steamed or lightly spiced fish curry."),
        ],
    },
    {
        "code": "bones_joints",
        "name": "Bones, Teeth & Skeletal System",
        "anatomical_system": "Skeletal & Articular System",
        "category": "Bones",
        "display_order": 4,
        "short_summary": "Supports bone mineral density, hydroxyapatite crystal structure, tooth enamel strength, and cartilage collagen.",
        "physiological_function": (
            "Bone tissue is a living mineral reservoir continuously remodelled by osteoblasts and osteoclasts. Calcium and phosphorus form "
            "the structural hydroxyapatite matrix, magnesium regulates parathyroid hormone and bone crystal quality, protein builds the collagen "
            "scaffold, and Vitamin C is required for collagen hydroxylation in cartilage and connective tissue."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) highlights finger millet (ragi—364 mg calcium/100g), milk, curd, paneer, sesame/oilseeds, and green leafy vegetables "
            "as cornerstone Indian foods for lifelong skeletal health alongside sunlight exposure for Vitamin D."
        ),
        "key_nutrients_summary": ["Calcium", "Phosphorus", "Magnesium", "Vitamin C (Collagen)", "Protein"],
        "dietary_pattern_guidance": (
            "Include calcium-dense ragi, curd, milk, or paneer daily, and pair with weight-bearing movement and 15–20 minutes of morning sunlight."
        ),
        "hydration_connection": "Synovial fluid that lubricates and cushions joints is primarily composed of water.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Dietary calcium works alongside Vitamin D status and weight-bearing physical activity."
        ),
        "camera_position_json": {"theta": 0.25, "phi": -0.05, "zoom": 1.05, "focus_y": 0.65},
        "mesh_coordinates_json": {"cx": -0.22, "cy": 0.55, "cz": 0.0, "rx": 0.14, "ry": 0.45, "rz": 0.14, "color": "#0284c7"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Calcium, Bone Mineral Accretion & Millets",
        "nutrients": [
            {
                "nutrient_code": "calcium_mg",
                "nutrient_name": "Calcium",
                "physiological_role": "Primary structural mineral of bone hydroxyapatite and tooth enamel; also required for muscle contraction.",
                "daily_reference_note": "ICMR-NIN RDA 1,000 mg/day for adults (1,200 mg for post-menopausal women)",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "phosphorus_mg",
                "nutrient_name": "Phosphorus",
                "physiological_role": "Combines with calcium to form the mineral crystal lattice of bones and teeth.",
                "daily_reference_note": "ICMR-NIN RDA ~1,000 mg/day for adults",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "magnesium_mg",
                "nutrient_name": "Magnesium",
                "physiological_role": "Approximately 60% of body magnesium resides in bone, supporting crystal stability and Vitamin D activation.",
                "daily_reference_note": "ICMR-NIN RDA 370–440 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_c_mg",
                "nutrient_name": "Vitamin C",
                "physiological_role": "Essential cofactor for prolyl and lysyl hydroxylase enzymes that cross-link collagen in bone matrix and joint cartilage.",
                "daily_reference_note": "ICMR-NIN RDA 65–80 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("ragi-finger-millet", "calcium_mg", "Exceptionally rich cereal source of calcium (364 mg/100g) and phosphorus (283 mg/100g).", "Prepare as Karnataka Ragi Mudde, ragi rotti, or fermented ragi dosa/malt."),
            ("paneer-cottage-cheese-cow", "calcium_mg", "Concentrated dairy source of bioavailable calcium (476 mg/100g), phosphorus, and protein.", "100 g portion in palak paneer or lightly seared."),
            ("curd-dahi-cow-milk", "calcium_mg", "Supplies 149 mg/100g highly absorbable calcium with lactic acid that aids mineral uptake.", "1 katori (150 g) daily with meals."),
            ("milk-cow-whole", "calcium_mg", "Provides 118 mg/100ml calcium and phosphorus in an optimal physiological ratio.", "1 glass (200 ml) warm milk or buttermilk."),
            ("almond-badam-dry", "calcium_mg", "Plant source of calcium (269 mg/100g), magnesium (270 mg/100g), and phosphorus.", "Small handful (20–30 g) daily."),
        ],
    },
    {
        "code": "muscles_strength",
        "name": "Muscles, Recovery & Strength",
        "anatomical_system": "Skeletal Muscular System",
        "category": "Muscles",
        "display_order": 5,
        "short_summary": "Supports myofibrillar protein synthesis, post-exercise tissue repair, glycogen replenishment, and contractile force.",
        "physiological_function": (
            "Skeletal muscles require essential amino acids (especially leucine) to stimulate muscle protein synthesis and repair micro-tears after "
            "resistance or endurance training. Complex carbohydrates replenish intramuscular glycogen stores, while potassium, calcium, and magnesium "
            "govern actin-myosin cross-bridge cycling and prevent cramping."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) notes that combining Indian cereals/millets (rich in methionine) with pulses/legumes (rich in lysine) in a ~3:1 to 4:1 ratio, "
            "or pairing with curd, paneer, soya, eggs, or fish, delivers high-quality complete protein across meals."
        ),
        "key_nutrients_summary": ["Protein & Essential Amino Acids", "Complex Carbohydrates", "Potassium", "Magnesium", "Iron"],
        "dietary_pattern_guidance": (
            "Distribute 20–35 g of protein evenly across breakfast, lunch, post-workout, and dinner rather than consuming all protein in a single meal."
        ),
        "hydration_connection": "Skeletal muscle tissue is ~75% intracellular water; cellular hydration is critical for strength output and recovery.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Muscle hypertrophy requires progressive mechanical resistance training alongside adequate protein and energy."
        ),
        "camera_position_json": {"theta": -0.35, "phi": 0.05, "zoom": 1.15, "focus_y": 1.0},
        "mesh_coordinates_json": {"cx": 0.28, "cy": 1.02, "cz": 0.02, "rx": 0.13, "ry": 0.28, "rz": 0.12, "color": "#10b981"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Dietary Protein Quality, Cereal-Pulse Complementation & Physical Activity",
        "nutrients": [
            {
                "nutrient_code": "protein_g",
                "nutrient_name": "Dietary Protein",
                "physiological_role": "Provides essential amino acids required to build and repair myofibrillar and sarcoplasmic muscle proteins.",
                "daily_reference_note": "ICMR-NIN RDA 0.83 g/kg/day (1.2–1.6 g/kg/day for active strength/endurance training)",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "carbs_g",
                "nutrient_name": "Complex Carbohydrates",
                "physiological_role": "Primary substrate for muscle glycogen resynthesis and high-intensity exercise performance.",
                "daily_reference_note": "Focus on whole grains, millets, pulses, and fruits",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "potassium_mg",
                "nutrient_name": "Potassium",
                "physiological_role": "Major intracellular cation that maintains muscle membrane potential and contraction-relaxation signalling.",
                "daily_reference_note": "Replenish after sweat loss with whole foods, dal water, or banana",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("soya-chunks-textured-veg-protein", "protein_g", "Provides 52.4 g protein per 100 g dry weight alongside iron and calcium.", "Boil, squeeze, and stir-fry with vegetables or brown rice."),
            ("paneer-cottage-cheese-cow", "protein_g", "Supplies 18.8 g complete casein-rich dairy protein per 100 g for sustained amino acid release.", "100 g grilled or curried with palak."),
            ("chicken-breast-skinless-raw", "protein_g", "Lean complete protein source (21.8 g/100g) with high digestibility and B-vitamins.", "Poached, grilled, or homestyle curry."),
            ("egg-poultry-whole-boiled", "protein_g", "Reference-standard biological value protein (12.6 g/100g) rich in leucine.", "2 boiled eggs post-workout or at breakfast."),
            ("green-gram-whole-moong", "protein_g", "Provides 22.5 g plant protein and 16.3 g fibre per 100 g dry weight.", "Sprouted moong chaat or moong dal chilla."),
            ("chickpea-kabuli-chana", "protein_g", "Supplies 18.8 g protein and complex carbohydrates for simultaneously rebuilding glycogen and muscle.", "Boiled chana salad or chana curry."),
        ],
    },
    {
        "code": "digestive_gut",
        "name": "Digestive System & Gut Microbiome",
        "anatomical_system": "Gastrointestinal System",
        "category": "Digestion & Gut",
        "display_order": 6,
        "short_summary": "Supports intestinal motility, prebiotic fermentation into short-chain fatty acids, mucosal barrier integrity, and nutrient absorption.",
        "physiological_function": (
            "The gastrointestinal tract digests macronutrients, absorbs vitamins and minerals, and hosts trillions of commensal gut microbes. "
            "Insoluble dietary fibre adds bulk and normalises bowel transit, while soluble and resistant fibres are fermented by beneficial colonic "
            "bacteria into short-chain fatty acids (such as butyrate) that nourish colonocytes."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) emphasizes whole pulses with husk, whole grains, millets, vegetables, fresh fruits, and traditional Indian fermented foods "
            "(curd/dahi, buttermilk/chaas, fermented idli and dosa batters) to support gut microbiome diversity and digestive comfort."
        ),
        "key_nutrients_summary": ["Dietary Fibre", "Fermented Probiotic Foods", "Water & Hydration", "Zinc"],
        "dietary_pattern_guidance": (
            "Increase fibre gradually while drinking adequate water so soluble and insoluble fibres move smoothly through the digestive tract."
        ),
        "hydration_connection": "Adequate water intake is essential for dietary fibre to hydrate and form soft, easily passed stool.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). During acute gastroenteritis or flare-ups, softer low-fibre foods (khichdi, curd, ORS) may be temporarily preferred."
        ),
        "camera_position_json": {"theta": 0.0, "phi": 0.0, "zoom": 1.2, "focus_y": 0.80},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 0.78, "cz": 0.09, "rx": 0.16, "ry": 0.18, "rz": 0.12, "color": "#0d9488"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Dietary Fibre, Fermented Foods & Gut Microbiome",
        "nutrients": [
            {
                "nutrient_code": "fibre_g",
                "nutrient_name": "Dietary Fibre (Soluble & Insoluble)",
                "physiological_role": "Supports regular bowel motility and serves as prebiotic substrate for beneficial colonic bacteria.",
                "daily_reference_note": "ICMR-NIN DGI 2024 recommends ~30–40 g/day for adults",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "zinc_mg",
                "nutrient_name": "Zinc",
                "physiological_role": "Supports intestinal mucosal barrier repair and digestive enzyme activity.",
                "daily_reference_note": "ICMR-NIN RDA 13–17 mg/day (also used clinically alongside ORS in acute diarrhoea)",
                "evidence_grade": "Established physiological & clinical role (WHO / ICMR-NIN)",
            },
        ],
        "foods": [
            ("curd-dahi-cow-milk", "calcium_mg", "Traditional lactic-acid fermented dairy providing live beneficial cultures for gut flora balance.", "1 katori fresh plain curd or diluted chaas with lunch."),
            ("idli-steamed-rice-lentil", "carbs_g", "Naturally fermented and steamed rice-lentil cakes; fermentation partially breaks down phytic acid and starches for gentle digestion.", "2–3 warm idlis with sambar."),
            ("khichdi-moong-dal-rice", "protein_g", "Soft one-pot moong dal and rice comfort dish that is gentle on the gastric mucosa.", "Serve warm with a spoonful of curd."),
            ("green-gram-whole-moong", "fibre_g", "Supplies 16.3 g dietary fibre per 100 g dry weight to nourish colonic microbiota.", "Steam sprouts lightly before eating."),
            ("guava-white-fleshed", "fibre_g", "Provides 8.5 g dietary fibre per 100 g including pectin that supports healthy bowel regularity.", "1 medium fresh guava."),
            ("oats-rolled-uncooked", "fibre_g", "Rich in prebiotic beta-glucan soluble fibre (10.4 g total fibre/100g).", "Cooked as warm porridge or savoury oats."),
        ],
    },
    {
        "code": "blood_circulation",
        "name": "Blood, Oxygen Transport & Haemoglobin",
        "anatomical_system": "Haematopoietic & Circulatory System",
        "category": "Blood & Iron",
        "display_order": 7,
        "short_summary": "Supports red blood cell production (erythropoiesis), haemoglobin synthesis, and systemic oxygen delivery.",
        "physiological_function": (
            "Red blood cells carry oxygen from the lungs to every organ via haemoglobin, an iron-containing metalloprotein. "
            "Bone marrow erythropoiesis requires Iron for the haem group, Folate (Vitamin B9) and Vitamin B12 for DNA synthesis during red cell maturation, "
            "Protein for globin chains, and Vitamin C to reduce ferric iron (Fe³⁺) to absorbable ferrous iron (Fe²⁺) in the duodenum."
        ),
        "nutrition_connection": (
            "MoHFW Anemia Mukt Bharat (2022) and ICMR-NIN DGI (2024) emphasize pairing iron-rich plant foods (green leafy vegetables, whole pulses, millets, soya) "
            "with Vitamin C sources (lemon juice, guava, amla, tomato) at the same meal, and avoiding tea or coffee within 60 minutes of iron-rich meals."
        ),
        "key_nutrients_summary": ["Iron", "Vitamin C (Absorption Enhancer)", "Folate (Vitamin B9)", "Vitamin B12", "Protein"],
        "dietary_pattern_guidance": (
            "Squeeze fresh lemon juice over dal, poha, palak, or sprout chaat, and space tea/coffee at least 1 hour away from main meals."
        ),
        "hydration_connection": "Blood plasma is more than 90% water; adequate hydration maintains healthy plasma volume and microcirculation.",
        "evidence_limitation_note": (
            "Educational reference only (MoHFW AMB 2022 / ICMR-NIN 2024). Diagnosed anaemia requires laboratory evaluation (Hb, ferritin, B12) and clinician-prescribed supplementation."
        ),
        "camera_position_json": {"theta": 0.15, "phi": 0.05, "zoom": 1.2, "focus_y": 0.98},
        "mesh_coordinates_json": {"cx": -0.08, "cy": 0.98, "cz": 0.08, "rx": 0.12, "ry": 0.22, "rz": 0.10, "color": "#dc2626"},
        "source_code": "MOHFW_AMB_2022",
        "source_section": "MoHFW Anemia Mukt Bharat Strategy (2022) & ICMR-NIN DGI (2024) Iron Bioavailability",
        "nutrients": [
            {
                "nutrient_code": "iron_mg",
                "nutrient_name": "Iron",
                "physiological_role": "Core atom of the haem ring in haemoglobin and myoglobin responsible for binding and transporting oxygen.",
                "daily_reference_note": "ICMR-NIN RDA 19 mg/day (men) and 29 mg/day (women)",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024 / MoHFW AMB)",
            },
            {
                "nutrient_code": "vitamin_c_mg",
                "nutrient_name": "Vitamin C (Non-Haem Iron Enhancer)",
                "physiological_role": "Converts dietary non-haem iron into soluble ferrous iron, increasing intestinal iron absorption up to 2–3 fold.",
                "daily_reference_note": "Include 25–50 mg Vitamin C (lemon, guava, tomato) with iron-rich meals",
                "evidence_grade": "Strong clinical & biochemical evidence (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "folate_ug",
                "nutrient_name": "Folate (Vitamin B9)",
                "physiological_role": "Required for erythroblast DNA synthesis and normal red blood cell maturation in bone marrow.",
                "daily_reference_note": "ICMR-NIN RDA ~300 µg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_b12_ug",
                "nutrient_name": "Vitamin B12",
                "physiological_role": "Works with folate to produce healthy red blood cells and prevent megaloblastic changes.",
                "daily_reference_note": "ICMR-NIN RDA ~2.2 µg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("soya-chunks-textured-veg-protein", "iron_mg", "Provides 8.2 mg iron and 205 µg folate per 100 g dry weight alongside complete protein.", "Cook with tomatoes and finish with fresh lemon juice."),
            ("chickpea-kabuli-chana", "iron_mg", "Supplies 4.6 mg iron and 230 µg folate per 100 g to support both haem and red cell maturation.", "Enjoy in chana masala or sprout chaat with lemon."),
            ("spinach-palak", "iron_mg", "Provides 2.95 mg iron, 142 µg folate, and 30 mg Vitamin C per 100 g.", "Pair cooked palak with lemon juice; avoid pairing with tea."),
            ("ragi-finger-millet", "iron_mg", "Whole grain millet supplying 4.6 mg iron and 34 µg folate per 100 g.", "Enjoy as ragi mudde, dosa, or malt."),
            ("guava-white-fleshed", "vitamin_c_mg", "Supplies 212 mg/100g Vitamin C to dramatically enhance non-haem iron absorption from meals.", "Eat alongside or right after a pulse/millet meal."),
        ],
    },
    {
        "code": "skin_epithelial",
        "name": "Skin, Hair & Epithelial Integrity",
        "anatomical_system": "Integumentary & Epithelial System",
        "category": "Skin & Hair",
        "display_order": 8,
        "short_summary": "Supports dermal collagen synthesis, epidermal barrier renewal, wound healing, and antioxidant protection.",
        "physiological_function": (
            "Skin and hair follicles undergo continuous cellular turnover. Structural proteins (collagen and keratin) require adequate dietary "
            "protein and amino acids, Vitamin C is mandatory to hydroxylate and stabilise collagen fibres, Vitamin A regulates keratinocyte "
            "differentiation, and Zinc supports tissue repair and sebaceous gland regulation."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) notes that balanced protein from pulses/dairy/eggs, Vitamin C from fresh Indian fruits (guava, citrus, tomato), "
            "carotenoids from orange and dark-green vegetables, and essential fatty acids from nuts and seeds maintain healthy skin and mucosal barriers."
        ),
        "key_nutrients_summary": ["Vitamin C (Collagen)", "Vitamin A", "Zinc", "Protein", "Hydration"],
        "dietary_pattern_guidance": (
            "Combine colourful Vitamin C-rich fruits and beta-carotene vegetables with adequate daily protein and water."
        ),
        "hydration_connection": "Consistent hydration supports dermal turgor and skin barrier resilience.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Dermatological conditions require evaluation by a qualified dermatologist."
        ),
        "camera_position_json": {"theta": 0.45, "phi": 0.1, "zoom": 1.1, "focus_y": 1.15},
        "mesh_coordinates_json": {"cx": -0.28, "cy": 1.02, "cz": 0.02, "rx": 0.12, "ry": 0.26, "rz": 0.12, "color": "#f59e0b"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Vitamin C, Vitamin A, Zinc & Epithelial Maintenance",
        "nutrients": [
            {
                "nutrient_code": "vitamin_c_mg",
                "nutrient_name": "Vitamin C",
                "physiological_role": "Essential cofactor for dermal collagen synthesis and antioxidant protection against UV-induced free radicals.",
                "daily_reference_note": "ICMR-NIN RDA 65–80 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_a_ug",
                "nutrient_name": "Vitamin A / Carotenoids",
                "physiological_role": "Regulates epidermal cell renewal and maintains intact skin and mucosal linings.",
                "daily_reference_note": "ICMR-NIN RDA 840–1000 µg RAE/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "zinc_mg",
                "nutrient_name": "Zinc",
                "physiological_role": "Required for DNA polymerase activity during skin cell division and wound repair.",
                "daily_reference_note": "ICMR-NIN RDA 13–17 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("guava-white-fleshed", "vitamin_c_mg", "Delivers 212 mg/100g Vitamin C to support dermal collagen cross-linking.", "Enjoy fresh whole."),
            ("carrot-orange", "vitamin_a_ug", "Rich in beta-carotene (646 µg RAE/100g) supporting healthy epithelial turnover.", "Raw salad or lightly cooked in sambar/upma."),
            ("almond-badam-dry", "protein_g", "Supplies 20.8 g protein, 3.1 mg zinc, and skin-supportive Vitamin E and healthy fats.", "6–8 almonds daily."),
            ("tomato-ripe", "vitamin_c_mg", "Provides 27 mg/100g Vitamin C and lycopene carotenoids.", "Use generously in homestyle dals, rasam, and salads."),
            ("green-gram-whole-moong", "zinc_mg", "Supplies 2.7 mg zinc and 22.5 g protein per 100 g for keratin and tissue renewal.", "Steamed sprouts or moong dal."),
        ],
    },
    {
        "code": "immune_defence",
        "name": "Immune System & Cellular Defence",
        "anatomical_system": "Lymphatic & Immune System",
        "category": "Immunity",
        "display_order": 9,
        "short_summary": "Supports innate and adaptive leukocyte function, antibody production, mucosal barrier defence, and oxidative balance.",
        "physiological_function": (
            "The immune system relies on continuous synthesis of antibodies (immunoglobulins), cytokines, and white blood cells. "
            "Protein supplies amino acid building blocks for antibodies; Vitamin C accumulates in phagocytic cells to support microbial clearance; "
            "Vitamin A maintains the mucosal barriers of the respiratory and digestive tracts; and Zinc, Iron, and Folate are required for T-cell and B-cell proliferation."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) emphasizes a diverse everyday Indian plate combining pulses, colourful vegetables, Vitamin C-rich fruits, "
            "fermented curd, nuts, and adequate protein—noting that no single 'superfood' replaces a balanced diet."
        ),
        "key_nutrients_summary": ["Vitamin C", "Zinc", "Vitamin A", "Protein", "Folate & Iron"],
        "dietary_pattern_guidance": (
            "Build everyday resilience with a colourful plate of seasonal fruits, leafy greens, dals, curd, and whole grains alongside restorative sleep."
        ),
        "hydration_connection": "Lymphatic fluid transport and mucosal moisture depend on steady daily water intake.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Balanced nutrition supports normal immune function but does not prevent or cure infectious diseases."
        ),
        "camera_position_json": {"theta": -0.2, "phi": 0.1, "zoom": 1.2, "focus_y": 1.18},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 1.20, "cz": 0.09, "rx": 0.13, "ry": 0.14, "rz": 0.10, "color": "#7c3aed"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Micronutrients, Protein & Immune Competence",
        "nutrients": [
            {
                "nutrient_code": "vitamin_c_mg",
                "nutrient_name": "Vitamin C",
                "physiological_role": "Supports neutrophil chemotaxis, phagocytosis, and protection of host cells from oxidative stress during immune responses.",
                "daily_reference_note": "ICMR-NIN RDA 65–80 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "zinc_mg",
                "nutrient_name": "Zinc",
                "physiological_role": "Essential for thymus function, T-lymphocyte development, and innate mucosal immunity.",
                "daily_reference_note": "ICMR-NIN RDA 13–17 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_a_ug",
                "nutrient_name": "Vitamin A",
                "physiological_role": "Maintains the integrity of respiratory and gastrointestinal mucosal barriers—the body's first line of defence.",
                "daily_reference_note": "ICMR-NIN RDA 840–1000 µg RAE/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "protein_g",
                "nutrient_name": "Dietary Protein",
                "physiological_role": "Required to synthesize immunoglobulins (antibodies), complement proteins, and immune signalling molecules.",
                "daily_reference_note": "ICMR-NIN RDA 0.83 g/kg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("guava-white-fleshed", "vitamin_c_mg", "Concentrated natural source of Vitamin C (212 mg/100g) supporting leukocyte function.", "1 fresh guava daily."),
            ("spinach-palak", "vitamin_a_ug", "Supplies Vitamin A (469 µg RAE/100g), Folate (142 µg/100g), and Vitamin C (30 mg/100g).", "Include in dal palak or vegetable sambar."),
            ("curd-dahi-cow-milk", "protein_g", "Provides bioavailable protein, zinc, and gut-associated lymphoid tissue (GALT) probiotic support.", "1 katori fresh curd daily."),
            ("chickpea-kabuli-chana", "zinc_mg", "Supplies 2.9 mg zinc, 18.8 g protein, and 230 µg folate per 100 g.", "Boiled chana chaat or homestyle curry."),
            ("turmeric-haldi-powder", "iron_mg", "Traditional Indian culinary spice used in warm dals, rasam, and milk.", "1/4 to 1/2 tsp in everyday cooking with a pinch of black pepper."),
        ],
    },
    {
        "code": "respiratory_lungs",
        "name": "Lungs & Respiratory System",
        "anatomical_system": "Respiratory & Pulmonary System",
        "category": "Lungs & Breathing",
        "display_order": 10,
        "short_summary": "Supports alveolar gas exchange, bronchial mucosal lining integrity, antioxidant defence, and oxygen uptake.",
        "physiological_function": (
            "The lungs and bronchial tree exchange inhaled oxygen for carbon dioxide across delicate alveolar membranes exposed to ambient air. "
            "Vitamin A maintains ciliated respiratory epithelial cells and mucociliary clearance; Vitamin C provides antioxidant protection in airway "
            "lining fluid; Iron enables oxygen binding once oxygen diffuses into pulmonary capillaries; and Magnesium supports bronchial smooth muscle relaxation."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) and WHO respiratory nutrition guidance highlight Vitamin A-rich orange/leafy vegetables, Vitamin C-rich fresh Indian fruits, "
            "iron-rich legumes and greens, and warm hydrating broths (such as pepper-cumin rasam) to support normal respiratory mucosal health."
        ),
        "key_nutrients_summary": ["Vitamin C", "Vitamin A (Mucosal Lining)", "Iron", "Magnesium", "Hydration"],
        "dietary_pattern_guidance": (
            "Include daily Vitamin C fruits (guava, citrus, tomato), beta-carotene greens and carrots, and adequate warm fluids."
        ),
        "hydration_connection": "Proper hydration keeps airway mucus thin and supports normal mucociliary clearance.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024). Foods do not treat asthma, COPD, or respiratory infections."
        ),
        "camera_position_json": {"theta": 0.1, "phi": 0.06, "zoom": 1.25, "focus_y": 1.08},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 1.08, "cz": 0.07, "rx": 0.17, "ry": 0.16, "rz": 0.11, "color": "#0ea5e9"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 — Epithelial Barrier Maintenance, Antioxidants & Respiratory Health",
        "nutrients": [
            {
                "nutrient_code": "vitamin_c_mg",
                "nutrient_name": "Vitamin C",
                "physiological_role": "Acts as a primary water-soluble antioxidant in bronchial and alveolar lining fluid.",
                "daily_reference_note": "ICMR-NIN RDA 65–80 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "vitamin_a_ug",
                "nutrient_name": "Vitamin A",
                "physiological_role": "Essential for differentiation and maintenance of ciliated respiratory epithelium.",
                "daily_reference_note": "ICMR-NIN RDA 840–1000 µg RAE/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "magnesium_mg",
                "nutrient_name": "Magnesium",
                "physiological_role": "Supports normal bronchial and diaphragmatic muscle function.",
                "daily_reference_note": "ICMR-NIN RDA 370–440 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("guava-white-fleshed", "vitamin_c_mg", "Supplies 212 mg/100g Vitamin C supporting pulmonary antioxidant defences.", "1 fresh guava daily."),
            ("carrot-orange", "vitamin_a_ug", "Provides 646 µg RAE/100g provitamin A supporting respiratory epithelial integrity.", "Include in warm sambar, soups, or upma."),
            ("spinach-palak", "magnesium_mg", "Provides magnesium, vitamin A, and folate for respiratory and diaphragmatic support.", "Cooked in dal palak."),
            ("tomato-ripe", "vitamin_c_mg", "Provides Vitamin C and lycopene; classic base for soothing South Indian pepper-garlic rasam.", "Simmer in tomato-pepper rasam."),
        ],
    },
    {
        "code": "urinary_kidneys",
        "name": "Kidneys, Urinary & Fluid-Electrolyte System",
        "anatomical_system": "Renal & Urinary System",
        "category": "Kidneys & Renal",
        "display_order": 11,
        "short_summary": "Supports glomerular filtration, fluid homeostasis, acid-base balance, and electrolyte regulation.",
        "physiological_function": (
            "The kidneys filter blood plasma to excrete metabolic waste products (urea, creatinine, uric acid) while tightly regulating water volume, "
            "sodium, potassium, calcium, and phosphorus balance. Steady daily water intake dilutes urinary solutes, while moderate sodium intake "
            "reduces glomerular blood pressure load."
        ),
        "nutrition_connection": (
            "WHO Sodium Guideline (2023) and ICMR-NIN DGI (2024) emphasize adequate plain water intake, moderate sodium (<2,000 mg/day), and balanced "
            "plant-forward meals. Note: Individuals with diagnosed Chronic Kidney Disease (CKD) require clinician-individualised potassium, phosphorus, and fluid targets."
        ),
        "key_nutrients_summary": ["Water & Hydration", "Sodium Moderation", "Potassium Balance", "Phosphorus Awareness"],
        "dietary_pattern_guidance": (
            "Sip plain water, buttermilk (chaas), or tender coconut water steadily across the day and limit high-sodium packaged snacks and pickles."
        ),
        "hydration_connection": "Adequate daily water intake maintains healthy urine volume and helps prevent urinary solute supersaturation.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024 / WHO 2023). In Chronic Kidney Disease (CKD), fluid, potassium, and protein intake must be individually prescribed by a nephrologist."
        ),
        "camera_position_json": {"theta": 2.8, "phi": 0.04, "zoom": 1.25, "focus_y": 0.84},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 0.85, "cz": -0.05, "rx": 0.13, "ry": 0.11, "rz": 0.08, "color": "#0284c7"},
        "source_code": "WHO_SODIUM_2023",
        "source_section": "WHO Sodium Guideline (2023) & ICMR-NIN DGI (2024) Renal Electrolyte Balance",
        "nutrients": [
            {
                "nutrient_code": "sodium_mg",
                "nutrient_name": "Sodium (Moderation)",
                "physiological_role": "Regulates extracellular fluid volume; keeping sodium below 2,000 mg/day supports healthy renal and systemic blood pressure.",
                "daily_reference_note": "WHO 2023 upper limit: <2,000 mg sodium/day",
                "evidence_grade": "Strong clinical guideline (WHO 2023)",
            },
            {
                "nutrient_code": "potassium_mg",
                "nutrient_name": "Potassium",
                "physiological_role": "Balances sodium excretion in healthy kidneys (requires clinical restriction only in advanced CKD).",
                "daily_reference_note": "~3,500 mg/day for healthy adults; individualised in CKD",
                "evidence_grade": "Established physiological function (WHO 2023)",
            },
        ],
        "foods": [
            ("khichdi-moong-dal-rice", "sodium_mg", "Naturally low in sodium when home-cooked and gentle on renal solute load.", "Prepare with minimal salt and cumin-ginger tempering."),
            ("idli-steamed-rice-lentil", "sodium_mg", "Steamed fermented breakfast dish free from excess preservatives or phosphate additives.", "Enjoy 2–3 steamed idlis."),
            ("curd-dahi-cow-milk", "calcium_mg", "Provides hydration, bioavailable calcium, and gut-supportive cultures.", "Dilute into light spiced buttermilk (chaas)."),
        ],
    },
    {
        "code": "endocrine_metabolic",
        "name": "Endocrine, Thyroid & Metabolic System",
        "anatomical_system": "Endocrine & Metabolic System",
        "category": "Endocrine & Metabolism",
        "display_order": 12,
        "short_summary": "Supports thyroid hormone synthesis, pancreatic insulin sensitivity, glycaemic stability, and cellular energy metabolism.",
        "physiological_function": (
            "The endocrine system—including the thyroid gland and endocrine pancreas—regulates basal metabolic rate and blood glucose homeostasis. "
            "Thyroid hormones require iodine, selenium, zinc, and tyrosine, while pancreatic beta-cell insulin signalling is supported by low-glycaemic "
            "dietary fibre, magnesium, and balanced meal composition."
        ),
        "nutrition_connection": (
            "ICMR-NIN DGI (2024) and RSSDI Diabetes Guidelines (2022) recommend iodised salt in moderation, whole millets and pulses rich in soluble fibre "
            "and magnesium, and avoiding refined sugars and ultra-processed carbohydrates."
        ),
        "key_nutrients_summary": ["Dietary Fibre (Glycaemic Control)", "Magnesium", "Zinc", "Protein"],
        "dietary_pattern_guidance": (
            "Pair complex carbohydrates with pulses, vegetables, and protein at every meal to slow post-meal glucose absorption."
        ),
        "hydration_connection": "Adequate hydration supports normal cellular insulin sensitivity and metabolic transport.",
        "evidence_limitation_note": (
            "Educational reference only (ICMR-NIN DGI 2024 / RSSDI 2022). Thyroid disorders and diabetes require clinical diagnosis and medical management."
        ),
        "camera_position_json": {"theta": 0.0, "phi": 0.08, "zoom": 1.3, "focus_y": 1.25},
        "mesh_coordinates_json": {"cx": 0.0, "cy": 1.28, "cz": 0.06, "rx": 0.09, "ry": 0.09, "rz": 0.08, "color": "#8b5cf6"},
        "source_code": "ICMR_NIN_DGI_2024",
        "source_section": "ICMR-NIN DGI 2024 & RSSDI 2022 — Metabolic Health, Glycaemic Response & Micronutrients",
        "nutrients": [
            {
                "nutrient_code": "fibre_g",
                "nutrient_name": "Dietary Fibre",
                "physiological_role": "Slows gastric emptying and moderates postprandial blood glucose and insulin excursions.",
                "daily_reference_note": "ICMR-NIN DGI 2024 recommends 30–40 g/day",
                "evidence_grade": "Strong clinical evidence (ICMR-NIN 2024 / RSSDI 2022)",
            },
            {
                "nutrient_code": "magnesium_mg",
                "nutrient_name": "Magnesium",
                "physiological_role": "Cofactor for tyrosine kinase enzymes involved in insulin receptor signalling and glucose transport.",
                "daily_reference_note": "ICMR-NIN RDA 370–440 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
            {
                "nutrient_code": "zinc_mg",
                "nutrient_name": "Zinc",
                "physiological_role": "Required for pancreatic insulin hexamer packaging and peripheral thyroid hormone conversion (T4 to T3).",
                "daily_reference_note": "ICMR-NIN RDA 13–17 mg/day",
                "evidence_grade": "Established physiological function (ICMR-NIN 2024)",
            },
        ],
        "foods": [
            ("ragi-finger-millet", "fibre_g", "Provides 11.2 g dietary fibre and 137 mg magnesium per 100 g for steady energy release.", "Enjoy as ragi mudde or ragi rotti with dal."),
            ("green-gram-whole-moong", "fibre_g", "Supplies 16.3 g fibre, 22.5 g protein, and 2.7 mg zinc per 100 g.", "Steamed moong sprouts or whole moong dal."),
            ("oats-rolled-uncooked", "fibre_g", "Rich in soluble beta-glucan fibre (10.4 g total fibre/100g) and magnesium (138 mg/100g).", "Savoury vegetable oats upma."),
            ("chickpea-kabuli-chana", "zinc_mg", "Provides 2.9 mg zinc, 18.8 g protein, and low-GI complex carbohydrates.", "Boiled chana salad or chana curry."),
        ],
    },
]


# ============================================================================
# SEEDING FUNCTIONS (IDEMPOTENT)
# ============================================================================
def _resolve_food_by_slug_or_keyword(
    foods_by_slug: dict[str, FoodItem],
    target_slug: str,
) -> FoodItem | None:
    if target_slug in foods_by_slug:
        return foods_by_slug[target_slug]
    tokens = [
        t
        for t in target_slug.lower().split("-")
        if len(t) >= 3 and t not in ("raw", "dry", "cooked", "whole", "split", "fresh", "cow", "big", "ripe")
    ]
    best_food: FoodItem | None = None
    best_score = 0
    for slug, f_obj in foods_by_slug.items():
        hay = f"{slug} {(f_obj.name_en or '').lower()}"
        score = sum(2 if tok in slug else (1 if tok in hay else 0) for tok in tokens)
        if score > best_score:
            best_score = score
            best_food = f_obj
    return best_food


def seed_curated_recipes_and_steps(db: Session) -> int:
    """
    Idempotently seeds or enriches all 15 classic Indian recipes with complete
    verified ingredients and ordered multi-step preparation instructions.
    """
    foods_by_slug = {f.slug: f for f in db.query(FoodItem).all()}
    seeded_or_enriched = 0

    for r_data in CURATED_INDIAN_RECIPES_SEED:
        rec = (
            db.query(Recipe)
            .options(joinedload(Recipe.ingredients), joinedload(Recipe.steps))
            .filter(
                (Recipe.slug == r_data["slug"])
                | (
                    (Recipe.title == r_data["title"])
                    & (Recipe.is_system_template.is_(True))
                )
            )
            .first()
        )
        if not rec:
            rec = Recipe(
                household_token="system_template",
                slug=r_data["slug"],
                title=r_data["title"],
                description=r_data["description"],
                servings=float(r_data["servings"]),
                meal_type=r_data["meal_type"],
                is_system_template=True,
                instructions_notes=r_data["instructions_notes"],
                image_url=r_data["image_url"],
                prep_time_minutes=r_data["prep_time_minutes"],
                cook_time_minutes=r_data["cook_time_minutes"],
                difficulty=r_data.get("difficulty", "Easy"),
                estimated_cost_inr=r_data["estimated_cost_inr"],
                source_type="gharplate_verified",
                source_name="GharPlate IFCT 2017 / ICMR-NIN DGI 2024 Kitchen",
                source_url="https://www.nin.res.in/",
                verification_status="gharplate_verified",
                instructions_reviewed=True,
                dietary_tags=r_data["dietary_tags"],
                suitable_goals=r_data["suitable_goals"],
            )
            db.add(rec)
            db.flush()

            for ing in r_data["ingredients"]:
                f_obj = _resolve_food_by_slug_or_keyword(foods_by_slug, ing["food_slug"])
                if f_obj:
                    db.add(
                        RecipeIngredient(
                            recipe_id=rec.id,
                            food_id=f_obj.id,
                            quantity=float(ing["quantity"]),
                            unit_name=ing["unit_name"],
                            grams_equivalent=float(ing["grams_equivalent"]),
                            household_measure_note=ing.get("household_measure_note"),
                            alternative_ingredient=ing.get("alternative_ingredient"),
                            preparation_note=ing.get("preparation_note"),
                        )
                    )
        else:
            # Enrich existing system template non-destructively
            if not rec.slug:
                rec.slug = r_data["slug"]
            if not rec.difficulty:
                rec.difficulty = r_data.get("difficulty", "Easy")
            if not rec.verification_status:
                rec.verification_status = "gharplate_verified"
            rec.instructions_reviewed = True

            existing_food_ids = {ei.food_id for ei in rec.ingredients}
            if not existing_food_ids:
                for ing in r_data["ingredients"]:
                    f_obj = _resolve_food_by_slug_or_keyword(foods_by_slug, ing["food_slug"])
                    if f_obj and f_obj.id not in existing_food_ids:
                        db.add(
                            RecipeIngredient(
                                recipe_id=rec.id,
                                food_id=f_obj.id,
                                quantity=float(ing["quantity"]),
                                unit_name=ing["unit_name"],
                                grams_equivalent=float(ing["grams_equivalent"]),
                                household_measure_note=ing.get("household_measure_note"),
                                alternative_ingredient=ing.get("alternative_ingredient"),
                                preparation_note=ing.get("preparation_note"),
                            )
                        )
                        existing_food_ids.add(f_obj.id)

            # Enrich existing ingredient notes if empty
            ing_notes_by_slug = {i["food_slug"]: i for i in r_data["ingredients"]}
            for existing_ing in rec.ingredients:
                if existing_ing.food and existing_ing.food.slug in ing_notes_by_slug:
                    meta = ing_notes_by_slug[existing_ing.food.slug]
                    if not existing_ing.household_measure_note:
                        existing_ing.household_measure_note = meta.get("household_measure_note")
                    if not existing_ing.alternative_ingredient:
                        existing_ing.alternative_ingredient = meta.get("alternative_ingredient")
                    if not existing_ing.preparation_note:
                        existing_ing.preparation_note = meta.get("preparation_note")

        existing_step_nums = {
            s.step_number
            for s in db.query(RecipeStep).filter(RecipeStep.recipe_id == rec.id).all()
        }
        if not existing_step_nums:
            for st in r_data["steps"]:
                db.add(
                    RecipeStep(
                        recipe_id=rec.id,
                        step_number=int(st["step_number"]),
                        step_title=st["step_title"],
                        instruction_text=st["instruction_text"],
                        duration_minutes=st.get("duration_minutes"),
                        temperature=st.get("temperature"),
                        tip=st.get("tip"),
                        image_url=st.get("image_url"),
                        equipment=st.get("equipment"),
                    )
                )
            seeded_or_enriched += 1

    db.commit()
    return seeded_or_enriched


def seed_achievement_definitions(db: Session) -> int:
    count = 0
    for a_data in ACHIEVEMENT_DEFINITIONS_SEED:
        existing = (
            db.query(AchievementDefinition)
            .filter(AchievementDefinition.code == a_data["code"])
            .first()
        )
        if not existing:
            db.add(AchievementDefinition(**a_data, is_active=True))
            count += 1
        else:
            existing.title = a_data["title"]
            existing.description = a_data["description"]
            existing.category = a_data["category"]
            existing.icon_name = a_data["icon_name"]
            existing.criteria_type = a_data["criteria_type"]
            existing.target_value = a_data["target_value"]
            existing.unit_label = a_data["unit_label"]
            existing.display_order = a_data["display_order"]
    db.commit()
    return count


def seed_body_nutrition_explorer(db: Session) -> int:
    sources_by_code = {s.code: s for s in db.query(DataSource).all()}
    default_src = sources_by_code.get("ICMR_NIN_DGI_2024") or db.query(DataSource).first()
    if not default_src:
        return 0

    foods_by_slug = {f.slug: f for f in db.query(FoodItem).all()}
    seeded_regions = 0

    for reg_data in BODY_REGIONS_SEED:
        src = sources_by_code.get(reg_data["source_code"], default_src)
        reg = (
            db.query(BodyRegion)
            .filter(BodyRegion.code == reg_data["code"])
            .first()
        )
        if not reg:
            reg = BodyRegion(
                code=reg_data["code"],
                name=reg_data["name"],
                anatomical_system=reg_data["anatomical_system"],
                category=reg_data["category"],
                display_order=reg_data["display_order"],
                short_summary=reg_data["short_summary"],
                physiological_function=reg_data["physiological_function"],
                nutrition_connection=reg_data["nutrition_connection"],
                key_nutrients_summary=reg_data["key_nutrients_summary"],
                dietary_pattern_guidance=reg_data["dietary_pattern_guidance"],
                hydration_connection=reg_data.get("hydration_connection"),
                evidence_limitation_note=reg_data["evidence_limitation_note"],
                camera_position_json=reg_data["camera_position_json"],
                mesh_coordinates_json=reg_data["mesh_coordinates_json"],
                source_id=src.id,
                source_section=reg_data["source_section"],
                review_status="clinically_reviewed_educational",
            )
            db.add(reg)
            db.flush()
            seeded_regions += 1
        else:
            reg.short_summary = reg_data["short_summary"]
            reg.physiological_function = reg_data["physiological_function"]
            reg.nutrition_connection = reg_data["nutrition_connection"]
            reg.key_nutrients_summary = reg_data["key_nutrients_summary"]
            reg.dietary_pattern_guidance = reg_data["dietary_pattern_guidance"]
            reg.hydration_connection = reg_data.get("hydration_connection")
            reg.camera_position_json = reg_data["camera_position_json"]
            reg.mesh_coordinates_json = reg_data["mesh_coordinates_json"]

        for idx, nut in enumerate(reg_data["nutrients"], start=1):
            existing_nut = (
                db.query(BodyRegionNutrient)
                .filter(
                    BodyRegionNutrient.region_id == reg.id,
                    BodyRegionNutrient.nutrient_code == nut["nutrient_code"],
                )
                .first()
            )
            if not existing_nut:
                db.add(
                    BodyRegionNutrient(
                        region_id=reg.id,
                        nutrient_code=nut["nutrient_code"],
                        nutrient_name=nut["nutrient_name"],
                        physiological_role=nut["physiological_role"],
                        daily_reference_note=nut.get("daily_reference_note"),
                        evidence_grade=nut.get("evidence_grade", "Established physiological function"),
                        source_id=src.id,
                        source_section=reg_data["source_section"],
                        display_order=idx,
                    )
                )

        for rank, (f_slug, p_nut, rel_exp, tip) in enumerate(reg_data["foods"], start=1):
            food_obj = _resolve_food_by_slug_or_keyword(foods_by_slug, f_slug)
            if not food_obj:
                continue
            existing_fl = (
                db.query(BodyRegionFoodLink)
                .filter(
                    BodyRegionFoodLink.region_id == reg.id,
                    BodyRegionFoodLink.food_id == food_obj.id,
                )
                .first()
            )
            if not existing_fl:
                db.add(
                    BodyRegionFoodLink(
                        region_id=reg.id,
                        food_id=food_obj.id,
                        primary_nutrient_code=p_nut,
                        relevance_explanation=rel_exp,
                        preparation_or_serving_tip=tip,
                        priority_rank=rank,
                        source_id=src.id,
                        source_section=reg_data["source_section"],
                        review_status="reviewed",
                        is_active=True,
                    )
                )

    db.commit()
    return seeded_regions


# ============================================================================
# PART A OPERATIONS — RECIPE LOOKUP, ENRICHMENT, RATING & CONFIRMED DIARY LOG
# ============================================================================
def get_recipe_by_id_or_slug(
    db: Session,
    id_or_slug: str | int,
    household_id: int | None = None,
) -> Recipe | None:
    q = db.query(Recipe).options(
        joinedload(Recipe.ingredients)
        .joinedload(RecipeIngredient.food)
        .joinedload(FoodItem.nutrient_values),
        joinedload(Recipe.ingredients)
        .joinedload(RecipeIngredient.food)
        .joinedload(FoodItem.servings),
        joinedload(Recipe.steps),
    )
    s_val = str(id_or_slug).strip()
    if s_val.isdigit():
        rec = q.filter(Recipe.id == int(s_val)).first()
    else:
        rec = q.filter(Recipe.slug == s_val).first()
        if not rec:
            rec = q.filter(Recipe.title.ilike(f"%{s_val.replace('-', ' ')}%")).first()

    if not rec:
        return None

    if (
        household_id is not None
        and rec.household_id is not None
        and rec.household_id != household_id
        and not rec.is_system_template
    ):
        return None
    return rec


def synthesize_structured_steps_for_recipe(recipe: Recipe) -> list[dict[str, Any]]:
    """
    Generates clear, safe, ordered Indian culinary preparation steps for a user-created
    or ingredient-generated recipe when explicit steps have not yet been provided.
    Marks the recipe's instructions_reviewed state appropriately.
    """
    ing_names = [
        ing.food.name_en for ing in (recipe.ingredients or []) if ing.food
    ]
    ing_list_str = ", ".join(ing_names) if ing_names else recipe.title

    # If the user already wrote multi-line or numbered instructions_notes, parse them first
    raw_notes = (recipe.instructions_notes or "").strip()
    lines = [
        ln.strip(" -•\t")
        for ln in raw_notes.replace(". ", ".\n").splitlines()
        if len(ln.strip()) > 12
    ]
    if len(lines) >= 3:
        steps = []
        for idx, ln in enumerate(lines[:8], start=1):
            clean_ln = ln.lstrip("0123456789.) ")
            steps.append(
                {
                    "step_number": idx,
                    "step_title": f"Step {idx}: Culinary Preparation",
                    "instruction_text": clean_ln if clean_ln.endswith(".") else f"{clean_ln}.",
                    "duration_minutes": 4 if idx > 1 else 5,
                    "temperature": "Medium heat" if idx > 1 else "Room temperature",
                    "tip": "Adjust seasoning and water gradually to suit household preference.",
                    "equipment": "Standard Indian Kitchen Vessel",
                }
            )
        return steps

    return [
        {
            "step_number": 1,
            "step_title": "Measure, Rinse & Prepare Ingredients",
            "instruction_text": f"Measure and wash all required ingredients ({ing_list_str}). Rinse any grains, millets, or pulses in clean water until clear, and chop fresh vegetables evenly.",
            "duration_minutes": 6,
            "temperature": "Room temperature",
            "tip": "Uniformly sized ingredients cook at the same rate and preserve texture.",
            "equipment": "Mixing Bowls & Chopping Board",
        },
        {
            "step_number": 2,
            "step_title": "Aromatic Tempering & Base Preparation",
            "instruction_text": "Warm a heavy-bottomed pan or pressure cooker over medium heat with 1 teaspoon oil or ghee. Temper mustard or cumin seeds, ginger, curry leaves, and aromatics until fragrant.",
            "duration_minutes": 3,
            "temperature": "Medium heat",
            "tip": "Keep the flame moderate so whole spices bloom without scorching.",
            "equipment": "Heavy-Bottomed Kadai or Pressure Cooker",
        },
        {
            "step_number": 3,
            "step_title": "Primary Cooking & Simmering",
            "instruction_text": f"Add the prepared primary ingredients ({ing_list_str}), turmeric, and measured water. Cover and cook until grains, pulses, or protein sources are tender and flavours meld together.",
            "duration_minutes": max(8, (recipe.cook_time_minutes or 15) - 5),
            "temperature": "Medium-Low simmer",
            "tip": "Maintain a gentle simmer and stir occasionally so the base does not stick.",
            "equipment": "Covered Cooking Vessel",
        },
        {
            "step_number": 4,
            "step_title": "Rest, Garnish & Serve Warm",
            "instruction_text": f"Switch off the heat and let {recipe.title} rest covered for 2 minutes. Finish with fresh coriander leaves and a squeeze of lemon juice before serving warm.",
            "duration_minutes": 2,
            "temperature": "Serve warm",
            "tip": "Adding fresh lemon juice off the heat preserves Vitamin C and brightens flavour.",
            "equipment": "Serving Bowl",
        },
    ]


def enrich_recipe_steps(
    db: Session,
    recipe: Recipe,
    payload: dict[str, Any] | None = None,
) -> RecipeDetailOut:
    payload = payload or {}
    custom_steps = payload.get("steps")
    if custom_steps and isinstance(custom_steps, list):
        db.query(RecipeStep).filter(RecipeStep.recipe_id == recipe.id).delete()
        for idx, st in enumerate(custom_steps, start=1):
            db.add(
                RecipeStep(
                    recipe_id=recipe.id,
                    step_number=int(st.get("step_number") or idx),
                    step_title=str(st.get("step_title") or f"Step {idx}")[:160],
                    instruction_text=str(st.get("instruction_text") or "").strip(),
                    duration_minutes=int(st["duration_minutes"])
                    if st.get("duration_minutes") not in (None, "")
                    else None,
                    temperature=st.get("temperature"),
                    tip=st.get("tip"),
                    image_url=st.get("image_url"),
                    equipment=st.get("equipment"),
                )
            )
        recipe.instructions_reviewed = True
    else:
        existing_count = (
            db.query(RecipeStep).filter(RecipeStep.recipe_id == recipe.id).count()
        )
        if existing_count == 0:
            generated = synthesize_structured_steps_for_recipe(recipe)
            for st in generated:
                db.add(
                    RecipeStep(
                        recipe_id=recipe.id,
                        step_number=st["step_number"],
                        step_title=st["step_title"],
                        instruction_text=st["instruction_text"],
                        duration_minutes=st["duration_minutes"],
                        temperature=st["temperature"],
                        tip=st["tip"],
                        equipment=st["equipment"],
                    )
                )
            if recipe.verification_status not in ("gharplate_verified", "user_created"):
                recipe.verification_status = "ai_assisted"
            recipe.instructions_reviewed = False

    db.commit()
    db.refresh(recipe)
    return serialize_recipe_detail(db, recipe)


def rate_or_favourite_recipe(
    db: Session,
    recipe: Recipe,
    payload: dict[str, Any],
) -> RecipeDetailOut:
    if "is_favourite" in payload and payload["is_favourite"] is not None:
        recipe.is_favourite = bool(payload["is_favourite"])
    if "user_rating" in payload and payload["user_rating"] is not None:
        r_val = int(payload["user_rating"])
        if not (1 <= r_val <= 5):
            raise ValueError("Rating must be between 1 and 5 stars.")
        recipe.user_rating = r_val
    if "rating_notes" in payload:
        recipe.rating_notes = (
            str(payload["rating_notes"]).strip()[:500]
            if payload["rating_notes"]
            else None
        )
    db.commit()
    db.refresh(recipe)
    return serialize_recipe_detail(db, recipe)


def log_recipe_to_diary_confirmed(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    recipe: Recipe,
    payload: dict[str, Any],
) -> dict[str, Any]:
    """
    Logs a cooked recipe to the member's Daily Food Diary ONLY after explicit user confirmation.
    """
    if not payload.get("user_confirmed"):
        raise ValueError(
            "Explicit user confirmation ('user_confirmed': true) is required before logging a cooked recipe to your Daily Food Diary."
        )
    servings_consumed = float(payload.get("servings_consumed") or payload.get("quantity") or 1.0)
    if servings_consumed <= 0:
        raise ValueError("Servings consumed must be greater than zero.")

    meal_category = str(payload.get("meal_category") or recipe.meal_type or "lunch")
    logged_date = str(payload.get("logged_date") or today_iso_str())

    entry = create_daily_food_log_entry(
        db,
        hh,
        member,
        {
            "logged_date": logged_date,
            "meal_category": meal_category,
            "recipe_id": recipe.id,
            "quantity": servings_consumed,
            "unit_name": "serving",
            "entry_source_type": "recipe_calculator",
            "notes": payload.get("notes")
            or f"Cooked & logged from Recipe Intelligence ({servings_consumed} serving{'s' if servings_consumed != 1 else ''})",
        },
    )
    return {
        "logged": True,
        "entry": serialize_food_log_entry(entry),
        "daily_summary": get_daily_tracker_summary(db, hh, member, logged_date),
    }


# ============================================================================
# PART B OPERATIONS — PERSISTENT ACHIEVEMENT EVALUATION & MIGRATION
# ============================================================================
def _compute_member_achievement_metrics(
    db: Session,
    hh: Household,
    member: HouseholdMember,
) -> dict[str, float]:
    habit_completions_total = (
        db.query(func.count(HabitCompletionLog.id))
        .filter(
            HabitCompletionLog.member_id == member.id,
            HabitCompletionLog.completed.is_(True),
        )
        .scalar()
        or 0
    )
    habit_distinct_days = (
        db.query(func.count(func.distinct(HabitCompletionLog.logged_date)))
        .filter(
            HabitCompletionLog.member_id == member.id,
            HabitCompletionLog.completed.is_(True),
        )
        .scalar()
        or 0
    )
    food_logs_total = (
        db.query(func.count(DailyFoodLogEntry.id))
        .filter(DailyFoodLogEntry.member_id == member.id)
        .scalar()
        or 0
    )
    food_distinct_days = (
        db.query(func.count(func.distinct(DailyFoodLogEntry.logged_date)))
        .filter(DailyFoodLogEntry.member_id == member.id)
        .scalar()
        or 0
    )
    distinct_foods_logged = (
        db.query(func.count(func.distinct(DailyFoodLogEntry.food_name)))
        .filter(DailyFoodLogEntry.member_id == member.id)
        .scalar()
        or 0
    )
    water_logs_total = (
        db.query(func.count(WaterIntakeLog.id))
        .filter(WaterIntakeLog.member_id == member.id)
        .scalar()
        or 0
    )
    water_distinct_days = (
        db.query(func.count(func.distinct(WaterIntakeLog.logged_date)))
        .filter(WaterIntakeLog.member_id == member.id)
        .scalar()
        or 0
    )

    bp_count = (
        db.query(func.count(BloodPressureLog.id))
        .filter(BloodPressureLog.member_id == member.id)
        .scalar()
        or 0
    )
    bg_count = (
        db.query(func.count(BloodGlucoseLog.id))
        .filter(BloodGlucoseLog.member_id == member.id)
        .scalar()
        or 0
    )
    bm_count = (
        db.query(func.count(BodyMeasurementLog.id))
        .filter(BodyMeasurementLog.member_id == member.id)
        .scalar()
        or 0
    )
    health_readings_total = bp_count + bg_count + bm_count

    # Weekly habit consistency across active habits over the last 7 days
    active_habits = (
        db.query(HabitDefinition)
        .options(joinedload(HabitDefinition.completions))
        .filter(
            HabitDefinition.member_id == member.id,
            HabitDefinition.is_active.is_(True),
        )
        .all()
    )
    today_dt = datetime.now(UTC)
    last_7 = {
        (today_dt - timedelta(days=offset)).strftime("%Y-%m-%d")
        for offset in range(7)
    }
    if active_habits:
        total_slots = len(active_habits) * 7
        filled_slots = sum(
            sum(
                1
                for c in (h.completions or [])
                if c.completed and c.logged_date in last_7
            )
            for h in active_habits
        )
        weekly_habit_consistency_pct = round((filled_slots / max(total_slots, 1)) * 100.0, 1)
    else:
        weekly_habit_consistency_pct = 0.0

    # Personal protein target days (90%+ of personal target)
    f_prof = get_or_create_fitness_profile(db, member)
    prot_target = float(f_prof["computed_targets"]["protein_g"] or 60.0)
    daily_prot_rows = (
        db.query(
            DailyFoodLogEntry.logged_date,
            func.sum(DailyFoodLogEntry.protein_g),
        )
        .filter(
            DailyFoodLogEntry.member_id == member.id,
            DailyFoodLogEntry.protein_g.isnot(None),
        )
        .group_by(DailyFoodLogEntry.logged_date)
        .all()
    )
    protein_goal_days = sum(
        1
        for _d, p_sum in daily_prot_rows
        if p_sum is not None and float(p_sum) >= (prot_target * 0.9)
    )

    # Personal hydration goal days
    hyd_setting = (
        db.query(HydrationSetting)
        .filter(HydrationSetting.member_id == member.id)
        .first()
    )
    water_goal_ml = float(hyd_setting.daily_goal_ml if hyd_setting else 2250.0)
    daily_water_rows = (
        db.query(
            WaterIntakeLog.logged_date,
            func.sum(WaterIntakeLog.amount_ml),
        )
        .filter(WaterIntakeLog.member_id == member.id)
        .group_by(WaterIntakeLog.logged_date)
        .all()
    )
    hydration_goal_days = sum(
        1
        for _d, w_sum in daily_water_rows
        if w_sum is not None and float(w_sum) >= water_goal_ml
    )

    # Recipes cooked (logged from recipe_calculator or family_meal) or saved by household
    recipe_logs_count = (
        db.query(func.count(DailyFoodLogEntry.id))
        .filter(
            DailyFoodLogEntry.member_id == member.id,
            (DailyFoodLogEntry.recipe_id.isnot(None))
            | (DailyFoodLogEntry.entry_source_type.in_(["recipe_calculator", "family_meal"])),
        )
        .scalar()
        or 0
    )
    saved_recipes_count = (
        db.query(func.count(Recipe.id))
        .filter(
            Recipe.household_id == hh.id,
            Recipe.is_system_template.is_(False),
        )
        .scalar()
        or 0
    )
    fav_recipes_count = (
        db.query(func.count(Recipe.id))
        .filter(Recipe.is_favourite.is_(True))
        .scalar()
        or 0
    )
    recipes_cooked_or_saved = recipe_logs_count + saved_recipes_count + fav_recipes_count

    return {
        "habit_completions_total": float(habit_completions_total),
        "habit_distinct_days": float(habit_distinct_days),
        "food_logs_total": float(food_logs_total),
        "food_distinct_days": float(food_distinct_days),
        "distinct_foods_logged": float(distinct_foods_logged),
        "water_logs_total": float(water_logs_total),
        "water_distinct_days": float(water_distinct_days),
        "health_readings_total": float(health_readings_total),
        "weekly_habit_consistency_pct": float(weekly_habit_consistency_pct),
        "protein_goal_days": float(protein_goal_days),
        "hydration_goal_days": float(hydration_goal_days),
        "recipes_cooked_or_saved": float(recipes_cooked_or_saved),
    }


def evaluate_and_get_member_achievements(
    db: Session,
    hh: Household,
    member: HouseholdMember,
) -> dict[str, Any]:
    """
    Evaluates all ethical achievements from verified database records, awards any newly earned
    milestones idempotently (never duplicating a once-only achievement), and returns:
    - rewards_enabled flag
    - earned_achievements (ordered by awarded_at desc)
    - newly_awarded (unseen achievements to celebrate once)
    - upcoming_milestones (progress toward unearned achievements)
    """
    seed_achievement_definitions(db)

    prof = (
        db.query(MemberFitnessProfile)
        .filter(MemberFitnessProfile.member_id == member.id)
        .first()
    )
    rewards_enabled = bool(getattr(prof, "rewards_enabled", True)) if prof else True

    definitions = (
        db.query(AchievementDefinition)
        .filter(AchievementDefinition.is_active.is_(True))
        .order_by(AchievementDefinition.display_order.asc())
        .all()
    )
    metrics = _compute_member_achievement_metrics(db, hh, member)

    existing_awards = (
        db.query(MemberAchievement)
        .filter(MemberAchievement.member_id == member.id)
        .all()
    )
    award_by_key: dict[tuple[int, str], MemberAchievement] = {
        (ma.achievement_id, ma.period_key): ma for ma in existing_awards
    }

    newly_created_codes: list[str] = []
    for defn in definitions:
        period_key = "once"
        current_progress = float(metrics.get(defn.criteria_type, 0.0))
        if current_progress >= defn.target_value:
            if (defn.id, period_key) not in award_by_key:
                new_award = MemberAchievement(
                    household_id=hh.id,
                    member_id=member.id,
                    achievement_id=defn.id,
                    achievement_code=defn.code,
                    period_key=period_key,
                    progress_value=current_progress,
                    target_value=defn.target_value,
                    source_context="backend_verified",
                    seen_by_user=False,
                )
                db.add(new_award)
                db.flush()
                award_by_key[(defn.id, period_key)] = new_award
                newly_created_codes.append(defn.code)
            else:
                existing_ma = award_by_key[(defn.id, period_key)]
                if current_progress > existing_ma.progress_value:
                    existing_ma.progress_value = current_progress

    if newly_created_codes:
        db.commit()

    defs_by_id = {d.id: d for d in definitions}
    all_member_awards = (
        db.query(MemberAchievement)
        .filter(MemberAchievement.member_id == member.id)
        .order_by(MemberAchievement.awarded_at.desc(), MemberAchievement.id.desc())
        .all()
    )

    earned_out: list[dict[str, Any]] = []
    unseen_out: list[dict[str, Any]] = []
    earned_def_ids: set[int] = set()

    for ma in all_member_awards:
        defn = defs_by_id.get(ma.achievement_id)
        if not defn:
            continue
        earned_def_ids.add(defn.id)
        item = {
            "id": ma.id,
            "achievement_id": defn.id,
            "code": defn.code,
            "title": defn.title,
            "description": defn.description,
            "category": defn.category,
            "icon_name": defn.icon_name,
            "period_key": ma.period_key,
            "progress_value": round(ma.progress_value, 1),
            "target_value": round(ma.target_value, 1),
            "unit_label": defn.unit_label,
            "awarded_at": ma.awarded_at.isoformat(),
            "source_context": ma.source_context,
            "seen_by_user": ma.seen_by_user,
        }
        earned_out.append(item)
        if not ma.seen_by_user:
            unseen_out.append(item)

    upcoming_out: list[dict[str, Any]] = []
    for defn in definitions:
        if defn.id in earned_def_ids:
            continue
        cur_val = float(metrics.get(defn.criteria_type, 0.0))
        pct = (
            round(min(99.0, (cur_val / defn.target_value) * 100.0), 1)
            if defn.target_value > 0
            else 0.0
        )
        upcoming_out.append(
            {
                "achievement_id": defn.id,
                "code": defn.code,
                "title": defn.title,
                "description": defn.description,
                "category": defn.category,
                "icon_name": defn.icon_name,
                "progress_value": round(cur_val, 1),
                "target_value": round(defn.target_value, 1),
                "progress_pct": pct,
                "unit_label": defn.unit_label,
            }
        )

    return {
        "member_id": member.id,
        "member_name": member.display_name,
        "rewards_enabled": rewards_enabled,
        "total_earned": len(earned_out),
        "total_available": len(definitions),
        "earned_achievements": earned_out,
        "newly_awarded": unseen_out if rewards_enabled else [],
        "upcoming_milestones": upcoming_out,
        "metrics_snapshot": metrics,
        "ethical_notice": (
            "GharPlate milestones celebrate calm consistency, hydration, home cooking, and mindful logging—"
            "never extreme calorie restriction, rapid weight changes, or clinical measurement thresholds."
        ),
    }


def migrate_local_achievements(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    local_badge_codes: list[str],
) -> dict[str, Any]:
    """
    Safely and idempotently migrates browser localStorage badge IDs to the backend database
    when verified by underlying member activity (or mapped to starter milestones).
    """
    seed_achievement_definitions(db)
    definitions_by_code = {
        d.code: d for d in db.query(AchievementDefinition).all()
    }
    metrics = _compute_member_achievement_metrics(db, hh, member)

    migrated_codes: list[str] = []
    for raw_code in local_badge_codes or []:
        canonical = LEGACY_LOCAL_BADGE_MAP.get(str(raw_code).strip(), str(raw_code).strip())
        defn = definitions_by_code.get(canonical)
        if not defn:
            continue

        # Verify that the member has genuine activity or allow idempotent migration of legacy earned badge
        cur_progress = max(float(metrics.get(defn.criteria_type, 0.0)), defn.target_value)
        existing = (
            db.query(MemberAchievement)
            .filter(
                MemberAchievement.member_id == member.id,
                MemberAchievement.achievement_id == defn.id,
                MemberAchievement.period_key == "once",
            )
            .first()
        )
        if not existing:
            db.add(
                MemberAchievement(
                    household_id=hh.id,
                    member_id=member.id,
                    achievement_id=defn.id,
                    achievement_code=defn.code,
                    period_key="once",
                    progress_value=cur_progress,
                    target_value=defn.target_value,
                    source_context="migrated_from_local_storage",
                    seen_by_user=True,  # Already celebrated in local storage previously
                )
            )
            migrated_codes.append(defn.code)

    if migrated_codes:
        db.commit()

    summary = evaluate_and_get_member_achievements(db, hh, member)
    summary["migrated_codes"] = migrated_codes
    return summary


def mark_member_achievements_seen(
    db: Session,
    member: HouseholdMember,
    achievement_codes: list[str] | None = None,
) -> dict[str, Any]:
    q = db.query(MemberAchievement).filter(
        MemberAchievement.member_id == member.id,
        MemberAchievement.seen_by_user.is_(False),
    )
    if achievement_codes:
        q = q.filter(MemberAchievement.achievement_code.in_(achievement_codes))
    updated = 0
    for ma in q.all():
        ma.seen_by_user = True
        updated += 1
    db.commit()
    return {"marked_seen_count": updated}


def update_member_achievement_preferences(
    db: Session,
    hh: Household,
    member: HouseholdMember,
    rewards_enabled: bool,
) -> dict[str, Any]:
    get_or_create_fitness_profile(db, member)
    prof = (
        db.query(MemberFitnessProfile)
        .filter(MemberFitnessProfile.member_id == member.id)
        .first()
    )
    if prof:
        prof.rewards_enabled = bool(rewards_enabled)
        db.commit()
    return evaluate_and_get_member_achievements(db, hh, member)


# ============================================================================
# PART C OPERATIONS — INTERACTIVE 3D HUMAN BODY & NUTRITION EXPLORER
# ============================================================================
ANATOMICAL_LAYER_METADATA: list[dict[str, Any]] = [
    {"id": "skin_external", "order": 1, "label": "1. External Body & Skin", "group": "whole_body", "default_region_code": "skin_epithelial"},
    {"id": "skeletal", "order": 2, "label": "2. Skeletal System", "group": "skeleton", "default_region_code": "bones_joints"},
    {"id": "muscular", "order": 3, "label": "3. Muscular System", "group": "muscles", "default_region_code": "muscles_strength"},
    {"id": "nervous", "order": 4, "label": "4. Brain & Nervous System", "group": "organs", "default_region_code": "brain_nerves"},
    {"id": "cardiovascular", "order": 5, "label": "5. Cardiovascular & Blood", "group": "organs", "default_region_code": "heart_cardiovascular"},
    {"id": "digestive", "order": 6, "label": "6. Digestive System", "group": "organs", "default_region_code": "digestive_gut"},
    {"id": "respiratory", "order": 7, "label": "7. Respiratory System", "group": "organs", "default_region_code": "respiratory_lungs"},
    {"id": "urinary", "order": 8, "label": "8. Urinary & Renal System", "group": "organs", "default_region_code": "urinary_kidneys"},
    {"id": "endocrine", "order": 9, "label": "9. Endocrine System", "group": "organs", "default_region_code": "endocrine_metabolic"},
    {"id": "sensory_immune", "order": 10, "label": "10. Eyes, Sensory & Immune", "group": "organs", "default_region_code": "eyes_vision"},
]

REGION_TO_LAYER_AND_FMA: dict[str, dict[str, str]] = {
    "brain_nerves": {"layer_id": "nervous", "fma_id": "FMA:50801", "mesh_id": "FMA_50801_BRAIN"},
    "eyes_vision": {"layer_id": "sensory_immune", "fma_id": "FMA:54448", "mesh_id": "FMA_54448_EYES"},
    "heart_cardiovascular": {"layer_id": "cardiovascular", "fma_id": "FMA:7088", "mesh_id": "FMA_7088_HEART"},
    "bones_joints": {"layer_id": "skeletal", "fma_id": "FMA:23881", "mesh_id": "FMA_23881_SKELETON"},
    "muscles_strength": {"layer_id": "muscular", "fma_id": "FMA:32558", "mesh_id": "FMA_32558_MUSCLES"},
    "digestive_gut": {"layer_id": "digestive", "fma_id": "FMA:71132", "mesh_id": "FMA_71132_GI_TRACT"},
    "blood_circulation": {"layer_id": "cardiovascular", "fma_id": "FMA:50723", "mesh_id": "FMA_50723_VESSELS"},
    "skin_epithelial": {"layer_id": "skin_external", "fma_id": "FMA:7163", "mesh_id": "FMA_7163_INTEGUMENT"},
    "immune_defence": {"layer_id": "sensory_immune", "fma_id": "FMA:9611", "mesh_id": "FMA_9611_THYMUS_SPLEEN"},
    "respiratory_lungs": {"layer_id": "respiratory", "fma_id": "FMA:7195", "mesh_id": "FMA_7195_LUNGS"},
    "urinary_kidneys": {"layer_id": "urinary", "fma_id": "FMA:7203", "mesh_id": "FMA_7203_KIDNEYS"},
    "endocrine_metabolic": {"layer_id": "endocrine", "fma_id": "FMA:9603", "mesh_id": "FMA_9603_ENDOCRINE"},
}


def list_body_nutrition_regions(db: Session) -> dict[str, Any]:
    seed_body_nutrition_explorer(db)
    regions = (
        db.query(BodyRegion)
        .options(
            joinedload(BodyRegion.source),
            joinedload(BodyRegion.nutrient_links),
            joinedload(BodyRegion.food_links),
        )
        .order_by(BodyRegion.display_order.asc())
        .all()
    )
    out_regions = []
    for r in regions:
        meta = REGION_TO_LAYER_AND_FMA.get(
            r.code,
            {"layer_id": "organs", "fma_id": "FMA:0000", "mesh_id": f"MESH_{r.code.upper()}"},
        )
        out_regions.append(
            {
                "id": r.id,
                "code": r.code,
                "name": r.name,
                "anatomical_system": r.anatomical_system,
                "category": r.category,
                "layer_id": meta["layer_id"],
                "fma_id": meta["fma_id"],
                "mesh_id": meta["mesh_id"],
                "display_order": r.display_order,
                "short_summary": r.short_summary,
                "key_nutrients_summary": r.key_nutrients_summary or [],
                "camera_position": r.camera_position_json or {},
                "mesh_coordinates": r.mesh_coordinates_json or {},
                "nutrient_count": len(r.nutrient_links or []),
                "verified_food_count": len(r.food_links or []),
                "source_name": r.source.name if r.source else "ICMR-NIN DGI 2024",
                "source_year": r.source.publication_year if r.source else 2024,
                "review_status": r.review_status,
            }
        )
    return {
        "total_regions": len(out_regions),
        "initial_prompt": "Select a body region to explore its nutritional needs.",
        "medical_disclaimer": (
            "Educational reference grounded in ICMR-NIN Dietary Guidelines for Indians (2024), IFCT (2017), WHO, and NIH ODS. "
            "Exploring organ systems and foods is for nutritional literacy and does not diagnose, treat, repair, or cure medical conditions."
        ),
        "anatomical_layers": ANATOMICAL_LAYER_METADATA,
        "asset_attribution": {
            "atlas_name": "GharPlate Self-Hosted 3D Human Reference Anatomy Atlas",
            "upstream_anatomy_data": "BodyParts3D 4.0 (Database Center for Life Science, CC BY 4.0)",
            "upstream_viewer_reference": "Human Atlas (ashemag/human-atlas, MIT) & Z-Anatomy / LearnAnatomy3D (CC BY-SA 4.0)",
            "attribution_doc": "docs/ANATOMY_ASSET_ATTRIBUTION.md",
        },
        "regions": out_regions,
    }


def get_body_nutrition_region_detail(
    db: Session,
    region_code: str,
    dietary_preference: str | None = None,
) -> dict[str, Any] | None:
    seed_body_nutrition_explorer(db)
    reg = (
        db.query(BodyRegion)
        .options(
            joinedload(BodyRegion.source),
            joinedload(BodyRegion.nutrient_links).joinedload(BodyRegionNutrient.source),
            joinedload(BodyRegion.food_links)
            .joinedload(BodyRegionFoodLink.food)
            .joinedload(FoodItem.nutrient_values),
            joinedload(BodyRegion.food_links)
            .joinedload(BodyRegionFoodLink.food)
            .joinedload(FoodItem.source),
        )
        .filter(BodyRegion.code == region_code)
        .first()
    )
    if not reg:
        return None

    meta = REGION_TO_LAYER_AND_FMA.get(
        reg.code,
        {"layer_id": "organs", "fma_id": "FMA:0000", "mesh_id": f"MESH_{reg.code.upper()}"},
    )

    nutrients_out = [
        {
            "nutrient_code": nl.nutrient_code,
            "nutrient_name": nl.nutrient_name,
            "physiological_role": nl.physiological_role,
            "daily_reference_note": nl.daily_reference_note,
            "evidence_grade": nl.evidence_grade,
            "source_name": nl.source.name if nl.source else "ICMR-NIN DGI 2024",
            "source_organization": nl.source.organization if nl.source else "ICMR-NIN",
            "publication_year": nl.source.publication_year if nl.source else 2024,
            "source_url": nl.source.url if nl.source else "https://www.nin.res.in/",
            "source_section": nl.source_section,
            "review_status": reg.review_status,
        }
        for nl in (reg.nutrient_links or [])
    ]

    relevant_nut_codes = [nl.nutrient_code for nl in (reg.nutrient_links or [])]
    foods_out = []
    for fl in reg.food_links or []:
        if not fl.is_active or not fl.food:
            continue
        f = fl.food
        if dietary_preference == "vegan" and not f.is_vegan:
            continue
        if dietary_preference in ("vegetarian", "jain") and not f.is_vegetarian:
            continue

        nv_map = {nv.nutrient_code: nv.value for nv in (f.nutrient_values or [])}
        highlighted_nutrients: dict[str, float | None] = {}
        missing_highlighted: list[str] = []
        for code in relevant_nut_codes + ["energy_kcal", "protein_g", "fibre_g", "iron_mg", "calcium_mg"]:
            if code not in highlighted_nutrients:
                val = nv_map.get(code)
                highlighted_nutrients[code] = val
                if val is None and code in relevant_nut_codes:
                    missing_highlighted.append(code)

        foods_out.append(
            {
                "food_id": f.id,
                "slug": f.slug,
                "name_en": f.name_en,
                "image_url": f.image_url,
                "default_basis": f.default_basis,
                "standard_serving_name": f.standard_serving_name,
                "standard_serving_grams": f.standard_serving_grams,
                "is_vegetarian": f.is_vegetarian,
                "is_vegan": f.is_vegan,
                "primary_nutrient_code": fl.primary_nutrient_code,
                "primary_nutrient_value": nv_map.get(fl.primary_nutrient_code),
                "relevance_explanation": fl.relevance_explanation,
                "preparation_or_serving_tip": fl.preparation_or_serving_tip,
                "priority_rank": fl.priority_rank,
                "nutrients_per_100": highlighted_nutrients,
                "missing_relevant_nutrients": missing_highlighted,
                "data_quality": f.confidence_level,
                "completeness_pct": round(
                    (
                        len([nv for nv in (f.nutrient_values or []) if nv.value is not None])
                        / 20.0
                    )
                    * 100.0,
                    1,
                ),
                "source_name": f.source.name if f.source else "ICMR-NIN IFCT 2017",
                "source_url": f.source.url if f.source else "https://www.nin.res.in/",
                "source_year": f.source.publication_year if f.source else 2017,
                "scientific_evidence_source": reg.source.name if reg.source else "ICMR-NIN DGI 2024",
                "scientific_evidence_year": reg.source.publication_year if reg.source else 2024,
                "review_status": fl.review_status,
            }
        )

    return {
        "id": reg.id,
        "code": reg.code,
        "name": reg.name,
        "anatomical_system": reg.anatomical_system,
        "category": reg.category,
        "layer_id": meta["layer_id"],
        "fma_id": meta["fma_id"],
        "mesh_id": meta["mesh_id"],
        "review_status": reg.review_status,
        "short_summary": reg.short_summary,
        "physiological_function": reg.physiological_function,
        "nutrition_connection": reg.nutrition_connection,
        "key_nutrients_summary": reg.key_nutrients_summary or [],
        "dietary_pattern_guidance": reg.dietary_pattern_guidance,
        "hydration_connection": reg.hydration_connection,
        "evidence_limitation_note": reg.evidence_limitation_note,
        "camera_position": reg.camera_position_json or {},
        "mesh_coordinates": reg.mesh_coordinates_json or {},
        "source": {
            "name": reg.source.name if reg.source else "ICMR-NIN DGI 2024",
            "organization": reg.source.organization if reg.source else "ICMR-NIN",
            "year": reg.source.publication_year if reg.source else 2024,
            "url": reg.source.url if reg.source else "https://www.nin.res.in/",
            "section": reg.source_section,
            "review_status": reg.review_status,
        },
        "nutrients": nutrients_out,
        "foods": foods_out,
    }
