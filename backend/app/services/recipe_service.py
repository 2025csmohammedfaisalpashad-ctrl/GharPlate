"""
Recipe & Meal Nutrition Calculator Service (Module 5 + Complete Recipe Intelligence).
Calculates total and per-serving nutrition across ingredients, converts household units consistently,
supports dynamic serving scaling, serializes structured preparation steps and provenance metadata,
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
    RecipeStep,
)
from app.schemas.api_schemas import (
    RecipeCreateRequest,
    RecipeDetailOut,
    RecipeIngredientContributionOut,
    RecipeNutrientBreakdown,
    RecipeStepOut,
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

VERIFICATION_BADGE_LABELS: dict[str, str] = {
    "gharplate_verified": "GharPlate-curated recipe",
    "user_saved": "User-created recipe",
    "user_created": "User-created recipe",
    "generated_from_db": "AI-assisted recipe",
    "ai_assisted": "AI-assisted recipe",
    "external_attributed": "External recipe with attribution",
}


def compute_ingredient_grams(food: FoodItem, unit_name: str, quantity: float) -> float:
    for srv in food.servings:
        if srv.unit_name.lower() == unit_name.lower():
            return round(srv.grams_equivalent * quantity, 2)
    if unit_name.lower() == "standard_serving":
        return round(food.standard_serving_grams * quantity, 2)
    base = DEFAULT_UNIT_GRAMS.get(unit_name.lower(), food.standard_serving_grams)
    return round(base * quantity, 2)


def _format_household_measure_note(food: FoodItem, unit_name: str, quantity: float, grams: float) -> str:
    u_low = unit_name.lower()
    if u_low == "standard_serving":
        return f"{round(quantity, 2)} × {food.standard_serving_name} ({round(grams, 1)} g)"
    if u_low in ("100g", "100ml"):
        return f"{round(grams, 1)} g (~{round(grams / 150.0, 1)} katori)"
    if u_low in ("katori", "cup", "bowl", "tbsp", "tsp", "piece", "roti"):
        return f"{round(quantity, 2)} {unit_name} ({round(grams, 1)} g)"
    return f"{round(quantity, 2)} {unit_name} ({round(grams, 1)} g)"


def serialize_recipe_detail(
    db: Session,
    recipe: Recipe,
    target_servings: float | None = None,
) -> RecipeDetailOut:
    nutrient_defs = (
        db.query(NutrientDefinition).order_by(NutrientDefinition.display_order.asc()).all()
    )
    base_servings = max(float(recipe.servings or 2.0), 0.1)
    effective_servings = (
        max(float(target_servings), 0.25)
        if target_servings is not None and target_servings > 0
        else base_servings
    )
    scale_ratio = effective_servings / base_servings

    total_weight = sum((ing.grams_equivalent * scale_ratio) for ing in recipe.ingredients)
    serving_weight = round(total_weight / effective_servings, 2)

    contributions: list[RecipeIngredientContributionOut] = []
    primary_img_url: str | None = getattr(recipe, "image_url", None)

    for ing in recipe.ingredients:
        food = ing.food
        img = getattr(food, "image_url", None) or resolve_food_image_url(food.slug)
        if primary_img_url is None:
            primary_img_url = img

        scaled_qty = round(ing.quantity * scale_ratio, 2)
        scaled_grams = round(ing.grams_equivalent * scale_ratio, 2)
        factor = scaled_grams / 100.0
        nv_map: dict[str, float | None] = {
            nv.nutrient_code: nv.value for nv in food.nutrient_values
        }
        missing_codes = [
            nd.code for nd in nutrient_defs if nv_map.get(nd.code) is None
        ]
        hh_note = getattr(ing, "household_measure_note", None) or _format_household_measure_note(
            food, ing.unit_name, scaled_qty, scaled_grams
        )
        contributions.append(
            RecipeIngredientContributionOut(
                food_slug=food.slug,
                food_name=food.name_en,
                image_url=img,
                quantity=scaled_qty,
                unit_name=ing.unit_name,
                grams_equivalent=scaled_grams,
                household_measure_note=hh_note,
                alternative_ingredient=getattr(ing, "alternative_ingredient", None),
                preparation_note=getattr(ing, "preparation_note", None),
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
            scaled_grams = ing.grams_equivalent * scale_ratio
            factor = scaled_grams / 100.0
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
            round(known_sum / effective_servings, 2) if with_data > 0 else None
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

    steps_rows = sorted(
        list(getattr(recipe, "steps", None) or []),
        key=lambda s: s.step_number,
    )
    steps_out: list[RecipeStepOut] = [
        RecipeStepOut(
            id=s.id,
            step_number=s.step_number,
            step_title=s.step_title,
            instruction_text=s.instruction_text,
            duration_minutes=s.duration_minutes,
            temperature=s.temperature,
            tip=s.tip,
            image_url=s.image_url,
            equipment=s.equipment,
        )
        for s in steps_rows
    ]

    # If no structured steps exist yet, check if instructions_notes has numbered lines or preserve transparent missing status
    instructions_status = (
        "available"
        if steps_out
        else ("notes_only" if (recipe.instructions_notes and recipe.instructions_notes.strip()) else "missing")
    )

    prep_m = getattr(recipe, "prep_time_minutes", None)
    cook_m = getattr(recipe, "cook_time_minutes", None)
    total_m = (
        (prep_m or 0) + (cook_m or 0)
        if (prep_m is not None or cook_m is not None)
        else (sum(s.duration_minutes or 0 for s in steps_out) or None)
    )

    base_cost = getattr(recipe, "estimated_cost_inr", None)
    scaled_cost = round(base_cost * scale_ratio, 2) if base_cost is not None else None
    cost_per_srv = round(scaled_cost / effective_servings, 2) if scaled_cost is not None else None

    src_type = getattr(recipe, "source_type", None) or "gharplate_verified"
    ver_status = getattr(recipe, "verification_status", None) or src_type
    badge_label = VERIFICATION_BADGE_LABELS.get(ver_status, "GharPlate-curated recipe")

    return RecipeDetailOut(
        id=recipe.id,
        slug=getattr(recipe, "slug", None),
        household_token=recipe.household_token,
        title=recipe.title,
        description=recipe.description,
        image_url=primary_img_url,
        servings=round(effective_servings, 2),
        meal_type=recipe.meal_type,
        prep_time_minutes=prep_m,
        cook_time_minutes=cook_m,
        total_time_minutes=total_m,
        difficulty=getattr(recipe, "difficulty", None) or "Easy",
        estimated_cost_inr=scaled_cost,
        cost_per_serving_inr=cost_per_srv,
        source_type=src_type,
        source_name=getattr(recipe, "source_name", None)
        or "GharPlate IFCT 2017 / ICMR-NIN DGI 2024 Kitchen",
        source_url=getattr(recipe, "source_url", None),
        verification_status=ver_status,
        verification_badge_label=badge_label,
        instructions_reviewed=bool(getattr(recipe, "instructions_reviewed", True)),
        instructions_status=instructions_status,
        is_favourite=bool(getattr(recipe, "is_favourite", False)),
        user_rating=getattr(recipe, "user_rating", None),
        rating_notes=getattr(recipe, "rating_notes", None),
        dietary_tags=list(getattr(recipe, "dietary_tags", None) or []),
        suitable_goals=list(getattr(recipe, "suitable_goals", None) or []),
        total_weight_grams=round(total_weight, 2),
        serving_weight_grams=serving_weight,
        completeness_pct=completeness_pct,
        completeness_notice=notice,
        instructions_notes=recipe.instructions_notes,
        steps=steps_out,
        ingredients=contributions,
        nutrients=nutrient_breakdowns,
        created_at=recipe.created_at,
    )


def create_or_update_recipe(
    db: Session,
    req: RecipeCreateRequest,
    recipe_id: int | None = None,
    household_id: int | None = None,
    household_token: str | None = None,
) -> RecipeDetailOut:
    resolved_hh_id = household_id
    resolved_hh_token = household_token or req.household_token
    if resolved_hh_id is None and resolved_hh_token:
        hh = (
            db.query(Household)
            .filter(Household.household_token == resolved_hh_token)
            .first()
        )
        if hh:
            resolved_hh_id = hh.id
            resolved_hh_token = hh.household_token

    if recipe_id is not None:
        recipe = db.query(Recipe).filter(Recipe.id == recipe_id).first()
        if not recipe:
            raise ValueError(f"Recipe {recipe_id} not found")
        if resolved_hh_id is not None and recipe.household_id != resolved_hh_id and not recipe.is_system_template:
            raise PermissionError("You do not have permission to modify this recipe.")
        recipe.title = req.title
        recipe.description = req.description
        recipe.servings = req.servings
        recipe.meal_type = req.meal_type
        if req.prep_time_minutes is not None:
            recipe.prep_time_minutes = req.prep_time_minutes
        if req.cook_time_minutes is not None:
            recipe.cook_time_minutes = req.cook_time_minutes
        if req.difficulty:
            recipe.difficulty = req.difficulty
        recipe.instructions_notes = req.instructions_notes
        db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe.id).delete()
        if req.steps:
            db.query(RecipeStep).filter(RecipeStep.recipe_id == recipe.id).delete()
    else:
        recipe = Recipe(
            household_id=resolved_hh_id,
            household_token=resolved_hh_token,
            title=req.title,
            description=req.description,
            servings=req.servings,
            meal_type=req.meal_type,
            prep_time_minutes=req.prep_time_minutes,
            cook_time_minutes=req.cook_time_minutes,
            difficulty=req.difficulty or "Easy",
            source_type="user_saved",
            source_name="Household Kitchen Recipe",
            verification_status="user_created",
            instructions_reviewed=bool(req.steps or req.instructions_notes),
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
                household_measure_note=ing_in.household_measure_note,
                alternative_ingredient=ing_in.alternative_ingredient,
                preparation_note=ing_in.preparation_note,
            )
        )

    for idx, step_in in enumerate(req.steps or [], start=1):
        db.add(
            RecipeStep(
                recipe_id=recipe.id,
                step_number=step_in.step_number or idx,
                step_title=step_in.step_title,
                instruction_text=step_in.instruction_text,
                duration_minutes=step_in.duration_minutes,
                temperature=step_in.temperature,
                tip=step_in.tip,
                image_url=step_in.image_url,
                equipment=step_in.equipment,
            )
        )

    db.commit()
    db.refresh(recipe)
    return serialize_recipe_detail(db, recipe)
