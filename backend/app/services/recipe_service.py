"""
Recipe & Meal Nutrition Calculator Service (Module 5).
Calculates total and per-serving nutrition across ingredients, converts household units consistently,
and NEVER replaces missing (NULL) ingredient nutrients with zero.
"""

from sqlalchemy.orm import Session, joinedload

from app.db.seed_images import resolve_food_image_url
from app.models.entities import (
    FoodItem,
    Household,
    NutrientDefinition,
    Recipe,
    RecipeIngredient,
)
from app.schemas.api_schemas import (
    RecipeCreateRequest,
    RecipeDetailOut,
    RecipeIngredientContributionOut,
    RecipeNutrientBreakdown,
)

DEFAULT_UNIT_GRAMS: dict[str, float] = {
    "100g": 100.0,
    "100ml": 100.0,
    "g": 1.0,
    "ml": 1.0,
    "cup": 150.0,
    "katori": 150.0,
    "bowl": 180.0,
    "tbsp": 15.0,
    "tsp": 5.0,
    "piece": 50.0,
    "roti": 40.0,
}


def compute_ingredient_grams(food: FoodItem, unit_name: str, quantity: float) -> float:
    for srv in food.servings:
        if srv.unit_name.lower() == unit_name.lower():
            return round(srv.grams_equivalent * quantity, 2)
    if unit_name.lower() == "standard_serving":
        return round(food.standard_serving_grams * quantity, 2)
    base = DEFAULT_UNIT_GRAMS.get(unit_name.lower(), food.standard_serving_grams)
    return round(base * quantity, 2)


def serialize_recipe_detail(db: Session, recipe: Recipe) -> RecipeDetailOut:
    nutrient_defs = (
        db.query(NutrientDefinition).order_by(NutrientDefinition.display_order.asc()).all()
    )
    servings_count = max(recipe.servings, 0.1)

    total_weight = sum(ing.grams_equivalent for ing in recipe.ingredients)
    serving_weight = round(total_weight / servings_count, 2)

    contributions: list[RecipeIngredientContributionOut] = []
    primary_img_url: str | None = None

    for ing in recipe.ingredients:
        food = ing.food
        img = getattr(food, "image_url", None) or resolve_food_image_url(food.slug)
        if primary_img_url is None:
            primary_img_url = img

        factor = ing.grams_equivalent / 100.0
        nv_map: dict[str, float | None] = {
            nv.nutrient_code: nv.value for nv in food.nutrient_values
        }
        missing_codes = [
            nd.code for nd in nutrient_defs if nv_map.get(nd.code) is None
        ]
        contributions.append(
            RecipeIngredientContributionOut(
                food_slug=food.slug,
                food_name=food.name_en,
                image_url=img,
                quantity=ing.quantity,
                unit_name=ing.unit_name,
                grams_equivalent=ing.grams_equivalent,
                energy_kcal_contribution=(
                    round(nv_map["energy_kcal"] * factor, 2)
                    if nv_map.get("energy_kcal") is not None
                    else None
                ),
                protein_g_contribution=(
                    round(nv_map["protein_g"] * factor, 2)
                    if nv_map.get("protein_g") is not None
                    else None
                ),
                carbs_g_contribution=(
                    round(nv_map["carbs_g"] * factor, 2)
                    if nv_map.get("carbs_g") is not None
                    else None
                ),
                fat_total_g_contribution=(
                    round(nv_map["fat_total_g"] * factor, 2)
                    if nv_map.get("fat_total_g") is not None
                    else None
                ),
                missing_nutrients=missing_codes,
            )
        )

    nutrient_breakdowns: list[RecipeNutrientBreakdown] = []
    complete_nutrients_count = 0

    for nd in nutrient_defs:
        known_sum = 0.0
        with_data = 0
        missing_data = 0
        missing_names: list[str] = []

        for ing in recipe.ingredients:
            food = ing.food
            factor = ing.grams_equivalent / 100.0
            nv_val = next(
                (nv.value for nv in food.nutrient_values if nv.nutrient_code == nd.code),
                None,
            )
            if nv_val is not None:
                known_sum += nv_val * factor
                with_data += 1
            else:
                missing_data += 1
                missing_names.append(food.name_en)

        is_complete = (missing_data == 0) and (with_data > 0)
        if is_complete:
            complete_nutrients_count += 1

        total_known_val = round(known_sum, 2) if with_data > 0 else None
        per_serving_val = (
            round(known_sum / servings_count, 2) if with_data > 0 else None
        )

        nutrient_breakdowns.append(
            RecipeNutrientBreakdown(
                nutrient_code=nd.code,
                nutrient_name=nd.name,
                unit=nd.unit,
                total_known_value=total_known_val,
                per_serving_known_value=per_serving_val,
                ingredients_with_data=with_data,
                ingredients_missing_data=missing_data,
                missing_ingredient_names=missing_names,
                is_complete=is_complete,
            )
        )

    completeness_pct = round(
        (complete_nutrients_count / max(len(nutrient_defs), 1)) * 100.0, 1
    )
    if completeness_pct < 100.0:
        notice = (
            f"Nutrient Data Completeness: {completeness_pct}% of tracked nutrients have complete data across all ingredients. "
            "Where an ingredient has an unknown (NULL) nutrient value, GharPlate reports known ingredient totals separately "
            "and never treats missing ingredient nutrients as zero."
        )
    else:
        notice = "100% of tracked nutrients are available across all selected ingredients."

    return RecipeDetailOut(
        id=recipe.id,
        household_token=recipe.household_token,
        title=recipe.title,
        description=recipe.description,
        image_url=primary_img_url,
        servings=recipe.servings,
        meal_type=recipe.meal_type,
        total_weight_grams=round(total_weight, 2),
        serving_weight_grams=serving_weight,
        completeness_pct=completeness_pct,
        completeness_notice=notice,
        instructions_notes=recipe.instructions_notes,
        ingredients=contributions,
        nutrients=nutrient_breakdowns,
        created_at=recipe.created_at,
    )


def create_or_update_recipe(
    db: Session, req: RecipeCreateRequest, recipe_id: int | None = None
) -> RecipeDetailOut:
    household_id: int | None = None
    if req.household_token:
        hh = (
            db.query(Household)
            .filter(Household.household_token == req.household_token)
            .first()
        )
        if hh:
            household_id = hh.id

    if recipe_id is not None:
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            raise ValueError(f"Recipe {recipe_id} not found")
        recipe.title = req.title
        recipe.description = req.description
        recipe.servings = req.servings
        recipe.meal_type = req.meal_type
        recipe.instructions_notes = req.instructions_notes
        db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe.id).delete()
    else:
        recipe = Recipe(
            household_id=household_id,
            household_token=req.household_token,
            title=req.title,
            description=req.description,
            servings=req.servings,
            meal_type=req.meal_type,
            instructions_notes=req.instructions_notes,
            is_system_template=False,
        )
        db.add(recipe)
        db.flush()

    for ing_in in req.ingredients:
        food = (
            db.query(FoodItem)
            .options(joinedload(FoodItem.servings), joinedload(FoodItem.nutrient_values))
            .filter(FoodItem.slug == ing_in.food_slug)
            .first()
        )
        if not food:
            raise ValueError(f"Ingredient food '{ing_in.food_slug}' not found in database")
        grams = compute_ingredient_grams(food, ing_in.unit_name, ing_in.quantity)
        db.add(
            RecipeIngredient(
                recipe_id=recipe.id,
                food_id=food.id,
                quantity=ing_in.quantity,
                unit_name=ing_in.unit_name,
                grams_equivalent=grams,
            )
        )

    db.commit()
    db.refresh(recipe)
    return serialize_recipe_detail(db, recipe)
