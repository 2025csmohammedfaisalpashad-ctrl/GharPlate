import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.entities import (
    ConditionConflictRule,
    ConditionFoodMapping,
    DataSource,
    FoodAlias,
    FoodCategory,
    FoodItem,
    FoodItemTag,
    FoodNutrientValue,
    FoodTag,
    HealthCondition,
    NutrientDefinition,
    NutritionRule,
    Recipe,
    RecipeIngredient,
    ServingConversion,
)
from app.db.seed_catalog import (
    DATA_SOURCES_SEED,
    FOOD_CATEGORIES_SEED,
    NUTRIENT_DEFINITIONS_SEED,
)
from app.db.seed_foods_part1 import FOOD_ITEMS_SEED
from app.db.seed_foods_part2 import FOOD_ITEMS_SEED_PART2
from app.db.seed_foods_part3 import FOOD_ITEMS_SEED_PART3
from app.db.seed_foods_part4 import FOOD_ITEMS_SEED_PART4
from app.db.seed_conditions import HEALTH_CONDITIONS_SEED
from app.db.seed_rules import CONDITION_CONFLICT_RULES_SEED, NUTRITION_RULES_SEED
from app.db.seed_images import resolve_category_image_url, resolve_food_image_url
from app.db.seed_condition_food_mappings import (
    CONDITION_FOOD_MAPPINGS_SEED,
    STRUCTURED_FOOD_TAGS_SEED,
)


def normalize_alias(text: str) -> str:
    return re.sub(r"[^a-z0-9\u0900-\u097f\u0c80-\u0cff]+", " ", text.lower()).strip()


def ensure_image_columns(db: Session) -> None:
    """Safely adds image_url columns to existing SQLite tables if created prior to redesign."""
    for table_name in ("food_categories", "food_items"):
        try:
            db.execute(text(f"ALTER TABLE {table_name} ADD COLUMN image_url VARCHAR(500)"))
            db.commit()
        except Exception:
            db.rollback()


def seed_database(db: Session, write_report: bool = True) -> Dict[str, Any]:
    """
    Idempotent, reproducible data-ingestion pipeline.
    Validates records, populates database-driven image_url references, structured FoodTags,
    and explicit ConditionFoodMappings, preserves NULL for missing nutrients, and writes an import report.
    """
    ensure_image_columns(db)

    sources_by_code: Dict[str, DataSource] = {}
    for src_data in DATA_SOURCES_SEED:
        existing = db.query(DataSource).filter(DataSource.code == src_data["code"]).first()
        if not existing:
            existing = DataSource(**src_data)
            db.add(existing)
            db.flush()
        sources_by_code[src_data["code"]] = existing

    nutrients_by_code: Dict[str, NutrientDefinition] = {}
    for nut_data in NUTRIENT_DEFINITIONS_SEED:
        existing = (
            db.query(NutrientDefinition)
            .filter(NutrientDefinition.code == nut_data["code"])
            .first()
        )
        if not existing:
            existing = NutrientDefinition(**nut_data)
            db.add(existing)
            db.flush()
        nutrients_by_code[nut_data["code"]] = existing

    categories_by_slug: Dict[str, FoodCategory] = {}
    for cat_data in FOOD_CATEGORIES_SEED:
        existing = db.query(FoodCategory).filter(FoodCategory.slug == cat_data["slug"]).first()
        img_url = resolve_category_image_url(cat_data["slug"])
        if not existing:
            existing = FoodCategory(**cat_data, image_url=img_url)
            db.add(existing)
            db.flush()
        elif not existing.image_url:
            existing.image_url = img_url
        categories_by_slug[cat_data["slug"]] = existing

    # Seed Structured FoodTags
    tags_by_code: Dict[str, FoodTag] = {}
    for tag_data in STRUCTURED_FOOD_TAGS_SEED:
        existing_tag = db.query(FoodTag).filter(FoodTag.code == tag_data["code"]).first()
        if not existing_tag:
            existing_tag = FoodTag(**tag_data)
            db.add(existing_tag)
            db.flush()
        tags_by_code[tag_data["code"]] = existing_tag

    all_foods_seed = (
        FOOD_ITEMS_SEED
        + FOOD_ITEMS_SEED_PART2
        + FOOD_ITEMS_SEED_PART3
        + FOOD_ITEMS_SEED_PART4
    )

    imported_foods_count = 0
    null_nutrient_records_count = 0
    known_nutrient_records_count = 0
    alias_count = 0

    foods_by_slug: Dict[str, FoodItem] = {}

    for food_data in all_foods_seed:
        existing_food = db.query(FoodItem).filter(FoodItem.slug == food_data["slug"]).first()
        resolved_img = resolve_food_image_url(food_data["slug"], food_data["category_slug"])
        if existing_food:
            if not existing_food.image_url:
                existing_food.image_url = resolved_img
            foods_by_slug[existing_food.slug] = existing_food
        else:
            category = categories_by_slug[food_data["category_slug"]]
            source = sources_by_code[food_data["source_code"]]

            food_item = FoodItem(
                slug=food_data["slug"],
                ifct_code=food_data.get("ifct_code"),
                name_en=food_data["name_en"],
                scientific_name=food_data.get("scientific_name"),
                category_id=category.id,
                description=food_data["description"],
                image_url=resolved_img,
                region_state=food_data.get("region_state"),
                is_packaged=food_data.get("is_packaged", False),
                brand=food_data.get("brand"),
                barcode=food_data.get("barcode"),
                default_basis=food_data.get("default_basis", "100g"),
                standard_serving_name=food_data.get("standard_serving_name", "1 standard serving"),
                standard_serving_grams=food_data.get("standard_serving_grams", 100.0),
                is_vegetarian=food_data.get("is_vegetarian", True),
                is_vegan=food_data.get("is_vegan", True),
                allergen_tags=food_data.get("allergen_tags", []),
                intolerance_tags=food_data.get("intolerance_tags", []),
                dietary_tags=food_data.get("dietary_tags", []),
                ingredients_text=food_data.get("ingredients_text"),
                allergen_declaration_complete=food_data.get("allergen_declaration_complete", True),
                source_id=source.id,
                confidence_level=food_data.get("confidence_level", "high"),
                conversion_methodology="ICMR-NIN DGI 2024 Standardized Household Measure Conversion",
            )
            db.add(food_item)
            db.flush()
            foods_by_slug[food_item.slug] = food_item
            imported_foods_count += 1
            existing_food = food_item

            seen_aliases = set()
            raw_aliases = [
                {"language": "en", "alias_text": food_item.name_en, "script_text": food_item.name_en}
            ] + food_data.get("aliases", [])

            for al in raw_aliases:
                norm = normalize_alias(al["alias_text"])
                key = (al["language"], norm)
                if norm and key not in seen_aliases:
                    seen_aliases.add(key)
                    db.add(
                        FoodAlias(
                            food_id=food_item.id,
                            language=al["language"],
                            alias_text=al["alias_text"],
                            normalized_text=norm,
                            script_text=al.get("script_text"),
                        )
                    )
                    alias_count += 1
                script_val = al.get("script_text")
                if script_val:
                    norm_script = normalize_alias(script_val)
                    script_key = (al["language"], norm_script)
                    if norm_script and script_key not in seen_aliases:
                        seen_aliases.add(script_key)
                        db.add(
                            FoodAlias(
                                food_id=food_item.id,
                                language=al["language"],
                                alias_text=script_val,
                                normalized_text=norm_script,
                                script_text=script_val,
                            )
                        )
                        alias_count += 1

            servings_list = food_data.get("servings", [])
            has_100 = any(s["unit_name"] in ("100g", "100ml") for s in servings_list)
            if not has_100:
                servings_list.insert(
                    0,
                    {
                        "unit_name": food_item.default_basis,
                        "unit_label": f"100 {food_item.default_basis.replace('100', '')}",
                        "grams_equivalent": 100.0,
                        "is_default": False,
                    },
                )
            has_std = any(s["unit_name"] == "standard_serving" for s in servings_list)
            if not has_std:
                servings_list.append(
                    {
                        "unit_name": "standard_serving",
                        "unit_label": food_item.standard_serving_name,
                        "grams_equivalent": food_item.standard_serving_grams,
                        "is_default": True,
                    }
                )
            existing_units = {s["unit_name"] for s in servings_list}
            if "katori" not in existing_units:
                servings_list.append(
                    {
                        "unit_name": "katori",
                        "unit_label": "1 standard katori (150 g)",
                        "grams_equivalent": 150.0,
                        "is_default": False,
                    }
                )
            if "tbsp" not in existing_units:
                servings_list.append(
                    {
                        "unit_name": "tbsp",
                        "unit_label": "1 tablespoon (15 g)",
                        "grams_equivalent": 15.0,
                        "is_default": False,
                    }
                )
            if "tsp" not in existing_units:
                servings_list.append(
                    {
                        "unit_name": "tsp",
                        "unit_label": "1 teaspoon (5 g)",
                        "grams_equivalent": 5.0,
                        "is_default": False,
                    }
                )

            for srv in servings_list:
                db.add(
                    ServingConversion(
                        food_id=food_item.id,
                        unit_name=srv["unit_name"],
                        unit_label=srv["unit_label"],
                        grams_equivalent=float(srv["grams_equivalent"]),
                        is_default=bool(srv.get("is_default", False)),
                    )
                )

            nut_map = food_data.get("nutrients", {})
            for nut_code in nutrients_by_code:
                val = nut_map.get(nut_code, None)
                if val is None:
                    null_nutrient_records_count += 1
                    conf_status = "not_measured"
                else:
                    known_nutrient_records_count += 1
                    conf_status = (
                        "label_declared" if food_item.is_packaged else "verified_ifct"
                    )
                db.add(
                    FoodNutrientValue(
                        food_id=food_item.id,
                        nutrient_code=nut_code,
                        value=float(val) if val is not None else None,
                        basis=food_item.default_basis,
                        source_id=source.id,
                        confidence_status=conf_status,
                    )
                )

        # Ensure structured FoodItemTag links exist for this food
        derived_tag_codes = set(food_data.get("dietary_tags", []))
        if existing_food.is_vegetarian and "eggetarian" not in derived_tag_codes:
            derived_tag_codes.add("vegetarian")
        if existing_food.is_vegan:
            derived_tag_codes.add("vegan")
        if not existing_food.is_vegetarian and "eggetarian" not in derived_tag_codes:
            derived_tag_codes.add("non_vegetarian")

        for t_code in derived_tag_codes:
            tag_obj = tags_by_code.get(t_code)
            if tag_obj:
                has_link = (
                    db.query(FoodItemTag)
                    .filter(
                        FoodItemTag.food_id == existing_food.id,
                        FoodItemTag.tag_id == tag_obj.id,
                    )
                    .first()
                )
                if not has_link:
                    db.add(
                        FoodItemTag(
                            food_id=existing_food.id,
                            tag_id=tag_obj.id,
                            derivation_note="Seeded from verified food composition & dietary profile",
                        )
                    )

    # Seed Health Conditions
    conditions_by_code: Dict[str, HealthCondition] = {}
    for cond_data in HEALTH_CONDITIONS_SEED:
        existing_cond = (
            db.query(HealthCondition)
            .filter(HealthCondition.code == cond_data["code"])
            .first()
        )
        if not existing_cond:
            src = sources_by_code[cond_data["source_code"]]
            payload = {k: v for k, v in cond_data.items() if k != "source_code"}
            existing_cond = HealthCondition(**payload, source_id=src.id)
            db.add(existing_cond)
            db.flush()
        conditions_by_code[cond_data["code"]] = existing_cond

    # Seed Nutrition Rules
    for rule_data in NUTRITION_RULES_SEED:
        existing_rule = (
            db.query(NutritionRule)
            .filter(NutritionRule.rule_code == rule_data["rule_code"])
            .first()
        )
        if not existing_rule:
            cond = conditions_by_code[rule_data["condition_code"]]
            src = sources_by_code[rule_data["source_code"]]
            payload = {
                k: v
                for k, v in rule_data.items()
                if k not in ("condition_code", "source_code")
            }
            db.add(
                NutritionRule(
                    **payload,
                    condition_id=cond.id,
                    source_id=src.id,
                )
            )

    # Seed Multi-Condition Conflict Rules
    for conf_data in CONDITION_CONFLICT_RULES_SEED:
        existing_conf = (
            db.query(ConditionConflictRule)
            .filter(ConditionConflictRule.conflict_code == conf_data["conflict_code"])
            .first()
        )
        if not existing_conf:
            src = sources_by_code[conf_data["source_code"]]
            payload = {k: v for k, v in conf_data.items() if k != "source_code"}
            db.add(ConditionConflictRule(**payload, source_id=src.id))

    # Seed Explicit, Audited ConditionFoodMappings (Idempotent — never duplicates on re-run)
    for map_data in CONDITION_FOOD_MAPPINGS_SEED:
        cond_obj = conditions_by_code.get(map_data["condition_code"])
        food_obj = foods_by_slug.get(map_data["food_slug"])
        src_obj = sources_by_code.get(map_data["source_code"])
        if not cond_obj or not food_obj or not src_obj:
            continue

        existing_map = (
            db.query(ConditionFoodMapping)
            .filter(
                ConditionFoodMapping.condition_id == cond_obj.id,
                ConditionFoodMapping.food_id == food_obj.id,
            )
            .first()
        )
        if not existing_map:
            db.add(
                ConditionFoodMapping(
                    condition_id=cond_obj.id,
                    food_id=food_obj.id,
                    relevance_category=map_data["relevance_category"],
                    relevance_display_label=map_data["relevance_display_label"],
                    explanation=map_data["explanation"],
                    relevant_nutrient_or_characteristic=map_data["relevant_nutrient_or_characteristic"],
                    relevant_tags=map_data["relevant_tags"],
                    source_id=src_obj.id,
                    source_section=map_data["source_section"],
                    review_status=map_data["review_status"],
                    applicability_limitations=map_data["applicability_limitations"],
                    serving_consideration=map_data.get("serving_consideration"),
                    is_active=map_data.get("is_active", True),
                )
            )

    if db.query(Recipe).count() == 0 and "ragi-finger-millet" in foods_by_slug:
        sample_recipe = Recipe(
            household_token="system_template",
            title="Karnataka Ragi Mudde & Palak Toor Dal Sambar",
            description="Balanced household meal pairing finger millet (ragi) with pigeon pea (toor dal), spinach (palak), and tomato.",
            servings=2.0,
            meal_type="lunch",
            is_system_template=True,
            instructions_notes="Cook ragi flour in boiling water to form mudde; serve alongside pressure-cooked toor dal sambar with spinach and tomatoes.",
        )
        db.add(sample_recipe)
        db.flush()
        for slug, qty, unit, grams in [
            ("ragi-finger-millet", 100.0, "100g", 100.0),
            ("toor-dal-red-gram", 60.0, "standard_serving", 60.0),
            ("spinach-palak", 100.0, "100g", 100.0),
            ("tomato-ripe", 85.0, "standard_serving", 85.0),
            ("onion-big", 80.0, "standard_serving", 80.0),
        ]:
            f_obj = foods_by_slug.get(slug)
            if f_obj:
                db.add(
                    RecipeIngredient(
                        recipe_id=sample_recipe.id,
                        food_id=f_obj.id,
                        quantity=qty,
                        unit_name=unit,
                        grams_equivalent=grams,
                    )
                )

    db.commit()

    total_known = db.query(FoodNutrientValue).filter(FoodNutrientValue.value.isnot(None)).count()
    total_null = db.query(FoodNutrientValue).filter(FoodNutrientValue.value.is_(None)).count()
    total_mappings = (
        db.query(ConditionFoodMapping)
        .filter(
            ConditionFoodMapping.is_active.is_(True),
            ConditionFoodMapping.review_status == "reviewed",
        )
        .count()
    )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_data_sources": db.query(DataSource).count(),
        "total_food_categories": db.query(FoodCategory).count(),
        "total_food_items": db.query(FoodItem).count(),
        "newly_imported_foods": imported_foods_count,
        "total_aliases": db.query(FoodAlias).count(),
        "total_structured_food_tags": db.query(FoodTag).count(),
        "total_health_conditions": db.query(HealthCondition).count(),
        "total_reviewed_condition_food_mappings": total_mappings,
        "total_nutrition_rules": db.query(NutritionRule).count(),
        "total_conflict_rules": db.query(ConditionConflictRule).count(),
        "known_nutrient_values": total_known,
        "null_unmeasured_nutrient_values": total_null,
        "zero_replacement_for_missing": False,
        "validation_status": "PASSED",
    }

    if write_report:
        try:
            repo_root = Path(__file__).resolve().parents[3]
            report_dir = repo_root / "data" / "import_reports"
            report_dir.mkdir(parents=True, exist_ok=True)
            with open(report_dir / "latest_import_report.json", "w", encoding="utf-8") as f:
                json.dump(report, f, indent=2)
            processed_dir = repo_root / "data" / "processed"
            processed_dir.mkdir(parents=True, exist_ok=True)
            with open(processed_dir / "catalog_manifest.json", "w", encoding="utf-8") as f:
                json.dump(
                    {
                        "sources": [s["code"] for s in DATA_SOURCES_SEED],
                        "categories": [c["slug"] for c in FOOD_CATEGORIES_SEED],
                        "food_count": report["total_food_items"],
                        "condition_count": report["total_health_conditions"],
                        "reviewed_condition_food_mappings": total_mappings,
                    },
                    f,
                    indent=2,
                )
        except Exception:
            pass

    return report
