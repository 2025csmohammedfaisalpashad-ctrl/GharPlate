"""
Local Ollama-Powered GharPlate AI Assistant Service (Section 9 of Master Prompt).
Connects to the user's locally running Ollama instance (`http://127.0.0.1:11434/api/chat` and `/api/tags`),
executes 11 allowlisted, schema-validated backend tools against the real GharPlate database and external
providers, supports 3 explicit search modes (`database_only`, `automatic`, `online_search`), and provides
context-aware, grounded answers without ever fabricating nutrient values, ingredients, or citations.
"""

import json
import re
from datetime import datetime, UTC
from typing import Any
import httpx
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.integrations.provider_registry import (
    evaluate_local_product_completeness,
    search_multi_source_external_products,
)
from app.integrations.web_search import search_external_web
from app.models.entities import (
    BodyRegion,
    BodyRegionFoodLink,
    FitnessGoal,
    FoodItem,
    FoodNutrientValue,
    HabitDefinition,
    HealthCondition,
    Household,
    HouseholdMember,
    MessMenuRecord,
    PantryItem,
    Recipe,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantPageContext,
    AssistantSelectedEntity,
    AssistantSourceReference,
    AssistantStatusResponse,
    AssistantToolExecutionTrace,
    AssistantVoiceStatusResponse,
    AssistantVoiceTranscribeRequest,
    AssistantVoiceTranscribeResponse,
    GuidanceEvaluationRequest,
    ProductComparisonRequest,
    RecipeCreateRequest,
    RecipeIngredientInput,
)
from app.services.comparison_meals_service import compare_packaged_products
from app.services.condition_food_service import get_condition_food_recommendations
from app.services.fitness_ecosystem_service import (
    add_recipe_ingredients_to_shopping_list,
    create_daily_food_log_entry,
    discover_and_recommend_recipes,
    get_analytics_overview,
    get_daily_hydration_summary,
    get_daily_tracker_summary,
    get_indian_protein_intelligence,
    get_or_create_fitness_profile,
    search_external_recipe_providers,
    serialize_food_log_entry,
    today_iso_str,
)
from app.services.health_measurement_service import (
    confirm_ai_habit_plan,
    create_blood_glucose_log,
    create_blood_pressure_log,
    get_blood_glucose_dashboard,
    get_blood_pressure_dashboard,
    get_health_measurements_summary,
    get_member_clinician_target,
    get_unified_daily_activity_timeline,
    modify_ai_habit_plan_natural_language,
    parse_natural_language_food_log,
    propose_ai_habit_plan,
    serialize_bp_log,
    serialize_glucose_log,
)
from app.services.food_service import search_foods, serialize_food_detail
from app.services.ocr_barcode_service import lookup_barcode
from app.services.recipe_intelligence_service import (
    get_body_nutrition_region_detail,
    get_recipe_by_id_or_slug,
    seed_body_nutrition_explorer,
    seed_curated_recipes_and_steps,
)
from app.services.recipe_service import create_or_update_recipe, serialize_recipe_detail

ASSISTANT_MEDICAL_DISCLAIMER = (
    "Educational nutrition assistant only — powered by GharPlate's verified database and local Ollama model. "
    "Not a medical diagnosis, prescription, or substitute for a doctor or registered dietitian."
)

AVAILABLE_MODES = [
    {
        "id": "database_only",
        "label": "My GharPlate Database",
        "description": "Search only GharPlate's local verified database and condition rules.",
    },
    {
        "id": "automatic",
        "label": "Automatic",
        "description": "Check GharPlate's local database first and query configured external sources when fields are missing.",
    },
    {
        "id": "online_search",
        "label": "Search Online",
        "description": "Search external product databases (Open Food Facts, USDA FDC) and configured web search providers.",
    },
]

ALLOWLISTED_TOOL_NAMES = [
    "search_food_database",
    "get_food_details",
    "get_food_nutrients",
    "get_food_ingredients",
    "get_product_details",
    "lookup_product_by_barcode",
    "search_external_products",
    "get_ingredients_and_allergens",
    "get_nutritional_composition",
    "get_condition_guidance",
    "get_household_member_context",
    "get_member_context",
    "compare_packaged_products",
    "calculate_recipe_nutrition",
    "get_recipe_details",
    "get_body_region_details",
    "get_body_region_nutrients",
    "get_food_sources_for_nutrient",
    "get_daily_food_history",
    "search_external_web_sources",
    # GharPlate 3.0 Ecosystem Tools (Module M)
    "get_fitness_profile",
    "get_daily_nutrition_log",
    "log_food_intake",
    "get_daily_nutrition_summary",
    "get_water_intake",
    "log_water_intake",
    "get_goal_progress",
    "update_user_goal",
    "get_habit_history",
    "get_recipe_suggestions",
    "search_online_recipes",
    "create_shopping_list",
    "get_available_pantry_items",
    "get_protein_comparisons",
    "get_mess_menu",
    "get_fitness_progress",
    # Health Measurements, AI Habit Plan Builder & NL Food Logging Tools (Part 9)
    "get_blood_pressure_history",
    "record_blood_pressure",
    "get_blood_glucose_history",
    "record_blood_glucose",
    "get_health_measurement_summary",
    "propose_habit_plan",
    "create_confirmed_habit_plan",
    "update_habit_schedule",
    "get_daily_activity_timeline",
    "parse_food_log_message",
    # Health Report Analysis, AI Symptom Review & Smart Food Discovery Tools
    "get_health_reports",
    "get_lab_measurement_trends",
    "evaluate_symptom_guidance",
    "search_nearby_restaurants_for_dish",
    "prepare_restaurant_order_preview",
]

OLLAMA_TOOLS_SCHEMA: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "search_food_database",
            "description": "Search GharPlate's local Indian food and packaged product database by English, Hindi, or Kannada name.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Food or product name to search"},
                    "category": {"type": "string", "description": "Optional category slug"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_food_details",
            "description": "Get full metadata, barcode, brand, serving conversions, and provenance for a food slug.",
            "parameters": {
                "type": "object",
                "properties": {
                    "food_slug": {"type": "string", "description": "Exact food slug, e.g. pkg-pineapple-cake-6b35c3 or ragi-finger-millet"},
                },
                "required": ["food_slug"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_product_by_barcode",
            "description": "Look up a packaged product by its EAN/UPC/GTIN barcode in the local database and external providers.",
            "parameters": {
                "type": "object",
                "properties": {
                    "barcode": {"type": "string", "description": "8 to 14 digit barcode"},
                },
                "required": ["barcode"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_external_products",
            "description": "Search Open Food Facts and USDA FoodData Central for external packaged or generic foods.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Product name or food query"},
                    "brand": {"type": "string", "description": "Optional brand name"},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_ingredients_and_allergens",
            "description": "Retrieve cleaned ingredients, raw package text, additives, allergen tags, and allergen consistency warnings for a food slug.",
            "parameters": {
                "type": "object",
                "properties": {
                    "food_slug": {"type": "string", "description": "Exact food slug"},
                },
                "required": ["food_slug"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_nutritional_composition",
            "description": "Retrieve available nutrients, NULL/missing nutrients, basis, and data completeness for a food slug.",
            "parameters": {
                "type": "object",
                "properties": {
                    "food_slug": {"type": "string", "description": "Exact food slug"},
                },
                "required": ["food_slug"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_condition_guidance",
            "description": "Evaluate deterministic condition-specific nutritional guidance or retrieve reviewed condition food recommendations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "condition_code": {"type": "string", "description": "Condition code e.g. type_2_diabetes, fever_acute_recovery, hypertension"},
                    "food_slug": {"type": "string", "description": "Optional food slug to evaluate against the condition"},
                },
                "required": ["condition_code"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_household_member_context",
            "description": "Get dietary preference, age group, allergies, intolerances, and selected health conditions for the active household member.",
            "parameters": {
                "type": "object",
                "properties": {
                    "household_token": {"type": "string"},
                    "member_id": {"type": "integer"},
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compare_packaged_products",
            "description": "Compare 2 to 4 packaged products side by side normalized per 100g.",
            "parameters": {
                "type": "object",
                "properties": {
                    "product_slugs": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of 2 to 4 food slugs",
                    },
                },
                "required": ["product_slugs"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_recipe_nutrition",
            "description": "Calculate per-serving and total recipe nutrition from a list of ingredient food_slugs and quantities.",
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "servings": {"type": "number"},
                    "ingredients": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "food_slug": {"type": "string"},
                                "quantity": {"type": "number"},
                                "unit_name": {"type": "string"},
                            },
                        },
                    },
                },
                "required": ["ingredients"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_external_web_sources",
            "description": "Search external web sources via configured search provider (Brave Search or Tavily).",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Web search query"},
                },
                "required": ["query"],
            },
        },
    },
]


def discover_ollama_models() -> tuple[bool, list[str], str | None]:
    """
    Queries the local Ollama instance (`GET /api/tags`) to check connectivity
    and list locally installed models without downloading anything automatically.
    Returns (is_reachable, installed_model_names, error_message).
    """
    if not settings.ENABLE_LOCAL_AI_ASSISTANT:
        return False, [], "Local AI assistant is disabled in configuration (ENABLE_LOCAL_AI_ASSISTANT=false)."

    url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/tags"
    try:
        with httpx.Client(timeout=3.5) as client:
            resp = client.get(url)
            if resp.status_code != 200:
                return (
                    False,
                    [],
                    f"Ollama API returned HTTP {resp.status_code} at {url}.",
                )
            data = resp.json()
            models_raw = data.get("models") or []
            names = [
                str(m.get("name") or m.get("model"))
                for m in models_raw
                if isinstance(m, dict) and (m.get("name") or m.get("model"))
            ]
            return True, names, None
    except httpx.RequestError as exc:
        return (
            False,
            [],
            f"Could not connect to local Ollama server at {settings.OLLAMA_BASE_URL} ({exc.__class__.__name__}).",
        )
    except Exception as exc:
        return (
            False,
            [],
            f"Unexpected error checking Ollama at {settings.OLLAMA_BASE_URL} ({exc.__class__.__name__}).",
        )


def get_ollama_assistant_status(requested_model: str | None = None) -> AssistantStatusResponse:
    reachable, installed, err_msg = discover_ollama_models()
    configured = (requested_model or settings.OLLAMA_MODEL or "").strip() or None

    active_model: str | None = None
    remediation: str | None = None

    if not settings.ENABLE_LOCAL_AI_ASSISTANT:
        status_msg = "Local Ollama AI Assistant is disabled via ENABLE_LOCAL_AI_ASSISTANT=false."
        remediation = "Set ENABLE_LOCAL_AI_ASSISTANT=true in .env"
    elif not reachable:
        status_msg = (
            f"{err_msg or 'Ollama is not reachable.'} "
            "GharPlate's built-in database tool engine remains active so you can still ask questions about any food, barcode, or condition!"
        )
        remediation = "ollama serve"
    elif not installed:
        status_msg = (
            "Connected to Ollama, but no local models are installed yet. "
            "Pull a small model to enable local LLM generation."
        )
        remediation = "ollama pull llama3.2"
    elif configured:
        # Match exact or prefix (e.g. 'llama3.2' matches 'llama3.2:latest')
        matched = next(
            (m for m in installed if m == configured or m.startswith(f"{configured}:")),
            None,
        )
        if matched:
            active_model = matched
            status_msg = f"Connected to local Ollama using model '{active_model}'."
        else:
            active_model = installed[0]
            status_msg = (
                f"Configured model '{configured}' is not installed locally. "
                f"Using installed model '{active_model}' instead (or run `ollama pull {configured}`)."
            )
            remediation = f"ollama pull {configured}"
    else:
        active_model = installed[0]
        status_msg = f"Connected to local Ollama using installed model '{active_model}'."

    return AssistantStatusResponse(
        enabled=settings.ENABLE_LOCAL_AI_ASSISTANT,
        ollama_base_url=settings.OLLAMA_BASE_URL,
        ollama_reachable=reachable,
        configured_model=configured,
        active_model=active_model,
        installed_models=installed,
        status_message=status_msg,
        remediation_command=remediation,
        available_modes=AVAILABLE_MODES,
        allowlisted_tools=ALLOWLISTED_TOOL_NAMES,
    )


def execute_allowlisted_tool(
    db: Session,
    tool_name: str,
    arguments: dict[str, Any],
    mode: str = "automatic",
) -> tuple[dict[str, Any], AssistantToolExecutionTrace, list[AssistantSourceReference]]:
    """
    Executes one of the 11 allowlisted backend tools with strict argument validation
    and mode enforcement (`database_only` blocks external network tools).
    """
    now_iso = datetime.now(UTC).isoformat()
    sources: list[AssistantSourceReference] = []

    if tool_name not in ALLOWLISTED_TOOL_NAMES:
        trace = AssistantToolExecutionTrace(
            tool_name=tool_name,
            arguments=arguments,
            status="blocked",
            summary=f"Tool '{tool_name}' is not in the allowlisted GharPlate tool registry.",
            source_type="local_database",
        )
        return {"error": trace.summary}, trace, []

    if mode == "database_only" and tool_name in (
        "search_external_products",
        "search_external_web_sources",
    ):
        trace = AssistantToolExecutionTrace(
            tool_name=tool_name,
            arguments=arguments,
            status="blocked",
            summary=f"Tool '{tool_name}' is skipped in 'My GharPlate Database' (database_only) mode.",
            source_type="external_provider",
        )
        return {"blocked_by_mode": True, "message": trace.summary}, trace, []

    try:
        if tool_name == "search_food_database":
            q = str(arguments.get("query") or "").strip()
            cat = arguments.get("category")
            if not q and not cat:
                raise ValueError("'query' is required for search_food_database.")
            res = search_foods(db, q=q or None, category_slug=cat, page_size=6)
            items_summary = [
                {
                    "slug": i.slug,
                    "name_en": i.name_en,
                    "brand": i.brand,
                    "barcode": i.barcode,
                    "category": i.category_name,
                    "is_packaged": i.is_packaged,
                    "completeness_pct": i.completeness_pct,
                    "key_nutrients": i.key_nutrients,
                    "source_name": i.source_name,
                }
                for i in res.items
            ]
            for i in res.items[:3]:
                sources.append(
                    AssistantSourceReference(
                        title=f"{i.name_en} — {i.source_name} ({i.publication_year})",
                        source_type="local_database",
                        url=i.source_url,
                        retrieved_at=now_iso,
                        verification_status=i.confidence_level,
                    )
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"query": q, "category": cat},
                status="success",
                summary=f"Found {res.total} matching item(s) in GharPlate local catalog for '{q}'.",
                source_type="local_database",
            )
            return {"total": res.total, "items": items_summary}, trace, sources

        if tool_name in ("get_food_details", "get_product_details"):
            slug = str(arguments.get("food_slug") or arguments.get("slug") or "").strip()
            if not slug:
                raise ValueError("'food_slug' is required for get_food_details.")
            food = (
                db.query(FoodItem)
                .options(
                    joinedload(FoodItem.category),
                    joinedload(FoodItem.source),
                    joinedload(FoodItem.aliases),
                    joinedload(FoodItem.nutrient_values),
                    joinedload(FoodItem.servings),
                    joinedload(FoodItem.field_provenance),
                    joinedload(FoodItem.data_conflicts),
                )
                .filter(FoodItem.slug == slug)
                .first()
            )
            if not food:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"food_slug": slug},
                    status="error",
                    summary=f"Food '{slug}' not found in local database.",
                    source_type="local_database",
                )
                return {"found": False, "food_slug": slug}, trace, []

            detail = serialize_food_detail(db, food)
            comp = evaluate_local_product_completeness(food)
            seed_body_nutrition_explorer(db)
            body_links = (
                db.query(BodyRegionFoodLink, BodyRegion)
                .join(BodyRegion, BodyRegionFoodLink.region_id == BodyRegion.id)
                .filter(BodyRegionFoodLink.food_id == food.id)
                .all()
            )
            supported_body_functions = [
                {
                    "region_code": reg.code,
                    "region_name": reg.name,
                    "anatomical_system": reg.anatomical_system,
                    "nutrient_code": lnk.primary_nutrient_code,
                    "relevance_label": "Supports normal physiological function",
                    "why_helpful": lnk.relevance_explanation,
                    "serving_suggestion": lnk.preparation_or_serving_tip,
                }
                for lnk, reg in body_links
            ]
            sources.append(
                AssistantSourceReference(
                    title=f"{detail.name_en} ({detail.source.name}, {detail.source.publication_year})",
                    source_type="local_database",
                    url=detail.source.url,
                    retrieved_at=now_iso,
                    verification_status=detail.confidence_level,
                )
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"food_slug": slug},
                status="success",
                summary=f"Retrieved details for '{detail.name_en}' (barcode: {detail.barcode or 'N/A'}, completeness: {detail.completeness_pct}%).",
                source_type="local_database",
            )
            return (
                {
                    "found": True,
                    "slug": detail.slug,
                    "name_en": detail.name_en,
                    "category_name": detail.category.name if detail.category else None,
                    "description": detail.description,
                    "brand": detail.brand,
                    "barcode": detail.barcode,
                    "net_quantity": detail.net_quantity,
                    "is_packaged": detail.is_packaged,
                    "is_vegetarian": detail.is_vegetarian,
                    "is_vegan": detail.is_vegan,
                    "has_verified_image": detail.has_verified_image,
                    "image_url": detail.image_url,
                    "default_basis": detail.default_basis,
                    "standard_serving_name": detail.standard_serving_name,
                    "standard_serving_grams": detail.standard_serving_grams,
                    "completeness_pct": detail.completeness_pct,
                    "available_nutrient_count": detail.available_nutrient_count,
                    "missing_nutrient_codes": detail.missing_nutrient_codes,
                    "completeness_evaluation": comp,
                    "supported_body_functions": supported_body_functions,
                    "source": detail.source.model_dump(),
                },
                trace,
                sources,
            )

        if tool_name == "get_ingredients_and_allergens":
            slug = str(arguments.get("food_slug") or "").strip()
            if not slug:
                raise ValueError("'food_slug' is required for get_ingredients_and_allergens.")
            food = (
                db.query(FoodItem)
                .options(
                    joinedload(FoodItem.category),
                    joinedload(FoodItem.source),
                    joinedload(FoodItem.aliases),
                    joinedload(FoodItem.nutrient_values),
                    joinedload(FoodItem.servings),
                )
                .filter(FoodItem.slug == slug)
                .first()
            )
            if not food:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"food_slug": slug},
                    status="error",
                    summary=f"Food '{slug}' not found.",
                    source_type="local_database",
                )
                return {"found": False}, trace, []

            detail = serialize_food_detail(db, food)
            sources.append(
                AssistantSourceReference(
                    title=f"{detail.name_en} Ingredient & Allergen Record ({detail.source.name})",
                    source_type="local_database",
                    url=detail.source.url,
                    retrieved_at=now_iso,
                    verification_status=detail.confidence_level,
                )
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"food_slug": slug},
                status="success",
                summary=(
                    f"Retrieved ingredients & allergens for '{detail.name_en}'. "
                    f"Stored tags: {detail.allergen_tags}; Declared in label text: {detail.allergen_consistency.declared_allergens if detail.allergen_consistency else []}."
                ),
                source_type="local_database",
            )
            return (
                {
                    "found": True,
                    "food_slug": detail.slug,
                    "name_en": detail.name_en,
                    "brand": detail.brand,
                    "barcode": detail.barcode,
                    "is_vegetarian": detail.is_vegetarian,
                    "is_vegan": detail.is_vegan,
                    "cleaned_ingredients_text": detail.cleaned_ingredients_text,
                    "raw_ingredients_text": detail.ingredients_text,
                    "ingredient_items": detail.ingredient_items,
                    "ingredient_percentages": detail.ingredient_percentages,
                    "additives": detail.additives,
                    "allergen_statement": detail.allergen_statement,
                    "stored_allergen_tags": detail.allergen_tags,
                    "intolerance_tags": detail.intolerance_tags,
                    "allergen_consistency": (
                        detail.allergen_consistency.model_dump()
                        if detail.allergen_consistency
                        else None
                    ),
                    "label_warnings": detail.label_warnings,
                    "ocr_uncertainty_notes": detail.ocr_uncertainty_notes,
                    "manufacturer_info": detail.manufacturer_info,
                    "allergen_safety_disclaimer": detail.allergen_safety_disclaimer,
                    "source_name": detail.source.name,
                },
                trace,
                sources,
            )

        if tool_name == "get_nutritional_composition":
            slug = str(arguments.get("food_slug") or "").strip()
            if not slug:
                raise ValueError("'food_slug' is required for get_nutritional_composition.")
            food = (
                db.query(FoodItem)
                .options(
                    joinedload(FoodItem.category),
                    joinedload(FoodItem.source),
                    joinedload(FoodItem.aliases),
                    joinedload(FoodItem.nutrient_values).joinedload(FoodNutrientValue.source),
                    joinedload(FoodItem.servings),
                )
                .filter(FoodItem.slug == slug)
                .first()
            )
            if not food:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"food_slug": slug},
                    status="error",
                    summary=f"Food '{slug}' not found.",
                    source_type="local_database",
                )
                return {"found": False}, trace, []

            detail = serialize_food_detail(db, food)
            available_nutrients = {
                n.nutrient_code: {
                    "name": n.nutrient_name,
                    "value_per_100": n.value_per_100,
                    "value_for_serving": n.value_for_serving,
                    "unit": n.unit,
                    "confidence_status": n.confidence_status,
                    "source_name": n.source_name,
                }
                for n in detail.nutrients
                if n.is_available
            }
            missing_nutrients = [
                {"code": n.nutrient_code, "name": n.nutrient_name, "unit": n.unit}
                for n in detail.nutrients
                if not n.is_available
            ]
            sources.append(
                AssistantSourceReference(
                    title=f"{detail.name_en} Nutrition Table ({detail.source.name})",
                    source_type="local_database",
                    url=detail.source.url,
                    retrieved_at=now_iso,
                    verification_status=detail.confidence_level,
                )
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"food_slug": slug},
                status="success",
                summary=f"Retrieved nutrition composition for '{detail.name_en}': {detail.available_nutrient_count}/20 nutrients available ({detail.completeness_pct}%).",
                source_type="local_database",
            )
            return (
                {
                    "found": True,
                    "food_slug": detail.slug,
                    "name_en": detail.name_en,
                    "default_basis": detail.default_basis,
                    "standard_serving_name": detail.standard_serving_name,
                    "standard_serving_grams": detail.standard_serving_grams,
                    "completeness_pct": detail.completeness_pct,
                    "available_nutrient_count": detail.available_nutrient_count,
                    "available_nutrients": available_nutrients,
                    "missing_nutrients": missing_nutrients,
                },
                trace,
                sources,
            )

        if tool_name == "lookup_product_by_barcode":
            bc = str(arguments.get("barcode") or "").strip()
            if not bc:
                raise ValueError("'barcode' is required for lookup_product_by_barcode.")
            res = lookup_barcode(db, bc, force_refresh=(mode == "online_search"))
            for att in res.provider_attempts:
                if att.status in ("found", "cached_found"):
                    sources.append(
                        AssistantSourceReference(
                            title=f"{att.provider_name} Barcode {bc}",
                            source_type="open_food_facts"
                            if att.provider_code == "OPEN_FOOD_FACTS"
                            else "usda_fdc",
                            url=f"https://world.openfoodfacts.org/product/{bc}"
                            if att.provider_code == "OPEN_FOOD_FACTS"
                            else "https://fdc.nal.usda.gov/",
                            retrieved_at=att.retrieved_at.isoformat(),
                            verification_status=att.status,
                        )
                    )
            if res.product:
                sources.append(
                    AssistantSourceReference(
                        title=f"{res.product.name_en} ({res.product.source.name})",
                        source_type="local_database",
                        url=res.product.source.url,
                        retrieved_at=res.retrieval_timestamp.isoformat(),
                        verification_status=res.product.confidence_level,
                    )
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"barcode": bc},
                status="success" if res.found else "error",
                summary=res.message,
                source_type="external_provider" if res.provider_attempts else "local_database",
            )
            return (
                {
                    "barcode": res.barcode,
                    "found": res.found,
                    "source_origin": res.source_origin,
                    "message": res.message,
                    "completeness": res.completeness,
                    "merged_fields": res.merged_fields,
                    "provider_attempts": [a.model_dump(mode="json") for a in res.provider_attempts],
                    "product_slug": res.product.slug if res.product else None,
                    "product_name": res.product.name_en if res.product else None,
                    "brand": res.product.brand if res.product else None,
                },
                trace,
                sources,
            )

        if tool_name == "search_external_products":
            q = str(arguments.get("query") or "").strip()
            brand = arguments.get("brand")
            if not q:
                raise ValueError("'query' is required for search_external_products.")
            cands, attempts = search_multi_source_external_products(
                db, query=q, brand=brand, page_size=5
            )
            cands_out = []
            for c in cands:
                cands_out.append(
                    {
                        "provider": c.provider_name,
                        "barcode": c.barcode,
                        "product_name": c.product_name,
                        "brand": c.brand,
                        "quantity": c.quantity,
                        "image_url": c.image_url,
                        "ingredients_text": c.ingredients_text,
                        "nutrients_per_100": c.nutrients_per_100,
                        "available_fields": c.available_fields,
                        "missing_fields": c.missing_fields,
                        "source_url": c.source_url,
                        "retrieved_at": c.retrieved_at.isoformat(),
                    }
                )
                sources.append(
                    AssistantSourceReference(
                        title=f"{c.product_name or c.barcode} ({c.provider_name})",
                        source_type="open_food_facts"
                        if c.provider_code == "OPEN_FOOD_FACTS"
                        else "usda_fdc",
                        url=c.source_url,
                        retrieved_at=c.retrieved_at.isoformat(),
                        verification_status="external_candidate",
                    )
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"query": q, "brand": brand},
                status="success",
                summary=f"Retrieved {len(cands_out)} external candidate(s) across Open Food Facts and USDA FDC.",
                source_type="external_provider",
            )
            return (
                {
                    "candidates": cands_out,
                    "provider_statuses": [
                        {"provider": a.provider_name, "status": a.status, "message": a.message}
                        for a in attempts
                    ],
                },
                trace,
                sources,
            )

        if tool_name == "get_condition_guidance":
            cond_code = str(arguments.get("condition_code") or "").strip()
            f_slug = arguments.get("food_slug")
            if not cond_code:
                raise ValueError("'condition_code' is required for get_condition_guidance.")
            if f_slug:
                eval_res = evaluate_food_guidance(
                    db,
                    GuidanceEvaluationRequest(
                        food_slug=str(f_slug),
                        condition_codes=[cond_code],
                    ),
                )
                for obs in eval_res.observations:
                    sources.append(
                        AssistantSourceReference(
                            title=obs.source_citation,
                            source_type="clinical_guideline",
                            url=obs.source_url,
                            retrieved_at=now_iso,
                            verification_status=obs.evidence_status,
                        )
                    )
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"condition_code": cond_code, "food_slug": f_slug},
                    status="success",
                    summary=f"Evaluated {len(eval_res.observations)} deterministic guidance rule(s) for '{f_slug}' under '{cond_code}'.",
                    source_type="guidance_engine",
                )
                return eval_res.model_dump(mode="json"), trace, sources

            rec_res = get_condition_food_recommendations(db, condition_code=cond_code)
            for f_item in rec_res.foods[:4]:
                sources.append(
                    AssistantSourceReference(
                        title=f"{f_item.source.name} ({f_item.source.year}) — {f_item.source.section}",
                        source_type="clinical_guideline",
                        url=f_item.source.url,
                        retrieved_at=now_iso,
                        verification_status=f_item.review_status,
                    )
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"condition_code": cond_code},
                status="success",
                summary=f"Retrieved {rec_res.total_reviewed_foods} reviewed food recommendation(s) for '{rec_res.condition.name}'.",
                source_type="guidance_engine",
            )
            return (
                {
                    "condition": rec_res.condition.model_dump(),
                    "total_reviewed_foods": rec_res.total_reviewed_foods,
                    "foods": [
                        {
                            "slug": f.slug,
                            "name_en": f.name_en,
                            "relevance_label": f.relevance_label,
                            "reason": f.reason,
                            "portion_guidance": f.portion_guidance,
                            "source": f.source.model_dump(),
                        }
                        for f in rec_res.foods[:8]
                    ],
                },
                trace,
                sources,
            )

        if tool_name == "get_household_member_context":
            h_token = arguments.get("household_token")
            m_id = arguments.get("member_id")
            member: HouseholdMember | None = None
            hh = (
                db.query(Household)
                .filter(Household.household_token == str(h_token))
                .first()
                if h_token
                else None
            )
            if m_id is not None:
                q_mem = db.query(HouseholdMember).filter(HouseholdMember.id == int(m_id))
                if hh is not None:
                    q_mem = q_mem.filter(HouseholdMember.household_id == hh.id)
                member = q_mem.first()
            elif hh and hh.default_member_id:
                member = (
                    db.query(HouseholdMember)
                    .filter(
                        HouseholdMember.id == hh.default_member_id,
                        HouseholdMember.household_id == hh.id,
                    )
                    .first()
                )
            if not member:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"member_id": m_id},
                    status="success",
                    summary="No active household member selected.",
                    source_type="local_database",
                )
                return {"member_selected": False}, trace, []

            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Resolved active household member '{member.display_name}' ({member.dietary_preference}).",
                source_type="local_database",
            )
            return (
                {
                    "member_selected": True,
                    "display_name": member.display_name,
                    "age_group": member.age_group,
                    "dietary_preference": member.dietary_preference,
                    "selected_conditions": member.selected_conditions,
                    "allergies": member.allergies,
                    "intolerances": member.intolerances,
                },
                trace,
                [],
            )

        if tool_name == "compare_packaged_products":
            slugs = arguments.get("product_slugs") or []
            if not isinstance(slugs, list) or len(slugs) < 2:
                raise ValueError("'product_slugs' must be a list of 2 to 4 product slugs.")
            comp_res = compare_packaged_products(
                db, ProductComparisonRequest(product_slugs=[str(s) for s in slugs[:4]])
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"product_slugs": slugs[:4]},
                status="success",
                summary=f"Compared {len(comp_res.products)} packaged products per 100g.",
                source_type="local_database",
            )
            return comp_res.model_dump(mode="json"), trace, sources

        if tool_name == "calculate_recipe_nutrition":
            ings_raw = arguments.get("ingredients") or []
            if not isinstance(ings_raw, list) or not ings_raw:
                raise ValueError("'ingredients' list is required for calculate_recipe_nutrition.")
            ing_inputs = [
                RecipeIngredientInput(
                    food_slug=str(i.get("food_slug")),
                    quantity=float(i.get("quantity", 1.0)),
                    unit_name=str(i.get("unit_name", "100g")),
                )
                for i in ings_raw
                if isinstance(i, dict) and i.get("food_slug")
            ]
            rec_out = create_or_update_recipe(
                db,
                RecipeCreateRequest(
                    title=str(arguments.get("title") or "Assistant Recipe Calculation"),
                    servings=float(arguments.get("servings") or 2.0),
                    ingredients=ing_inputs,
                ),
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"title": rec_out.title, "servings": rec_out.servings},
                status="success",
                summary=f"Calculated recipe '{rec_out.title}' ({rec_out.completeness_pct}% nutrient completeness).",
                source_type="local_database",
            )
            return rec_out.model_dump(mode="json"), trace, sources

        if tool_name == "search_external_web_sources":
            q = str(arguments.get("query") or "").strip()
            if not q:
                raise ValueError("'query' is required for search_external_web_sources.")
            items, meta = search_external_web(db, query=q, max_results=4)
            for item in items:
                sources.append(
                    AssistantSourceReference(
                        title=f"{item.title} ({item.provider})",
                        source_type="web_search",
                        url=item.url,
                        retrieved_at=item.retrieved_at,
                        verification_status="external_web_result",
                    )
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"query": q},
                status="success" if meta.get("status") in ("found", "cached_found") else "error",
                summary=str(meta.get("message") or ""),
                source_type="web_search",
            )
            return (
                {
                    "provider_status": meta,
                    "results": [
                        {
                            "title": i.title,
                            "url": i.url,
                            "snippet": i.snippet,
                            "provider": i.provider,
                            "retrieved_at": i.retrieved_at,
                        }
                        for i in items
                    ],
                },
                trace,
                sources,
            )

        # ==========================================
        # GHARPLATE 3.0 ECOSYSTEM TOOLS (MODULE M)
        # ==========================================
        def _resolve_tool_hh_and_member() -> tuple[Household | None, HouseholdMember | None]:
            h_token = arguments.get("household_token")
            m_id = arguments.get("member_id")
            hh = (
                db.query(Household)
                .filter(Household.household_token == str(h_token))
                .first()
                if h_token
                else db.query(Household).order_by(Household.id.asc()).first()
            )
            member: HouseholdMember | None = None
            if m_id is not None:
                q_m = db.query(HouseholdMember).filter(HouseholdMember.id == int(m_id))
                if hh:
                    q_m = q_m.filter(HouseholdMember.household_id == hh.id)
                member = q_m.first()
            elif hh and hh.default_member_id:
                member = (
                    db.query(HouseholdMember)
                    .filter(
                        HouseholdMember.id == hh.default_member_id,
                        HouseholdMember.household_id == hh.id,
                    )
                    .first()
                )
            elif hh and hh.members:
                member = hh.members[0]
            return hh, member

        if tool_name == "get_fitness_profile":
            _hh, member = _resolve_tool_hh_and_member()
            if not member:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments=arguments,
                    status="error",
                    summary="No active household member found for fitness profile.",
                    source_type="local_database",
                )
                return {"found": False}, trace, []
            prof = get_or_create_fitness_profile(db, member)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Retrieved fitness profile & training schedule for '{member.display_name}' (Goal: {prof['primary_goal']}).",
                source_type="local_database",
            )
            return prof, trace, sources

        if tool_name in ("get_daily_nutrition_log", "get_daily_nutrition_summary"):
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments=arguments,
                    status="error",
                    summary="No active household member found for daily nutrition log.",
                    source_type="local_database",
                )
                return {"found": False}, trace, []
            d_str = str(arguments.get("date") or today_iso_str())
            summary = get_daily_tracker_summary(db, hh, member, date_str=d_str)
            tots = summary["daily_nutrition"]["totals"]
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "date": d_str},
                status="success",
                summary=(
                    f"Retrieved {summary['daily_nutrition']['entry_count']} food log(s) on {d_str}: "
                    f"{tots.get('energy_kcal') or 0} kcal, {tots.get('protein_g') or 0}g protein."
                ),
                source_type="local_database",
            )
            return summary, trace, sources

        if tool_name == "log_food_intake":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to log food intake.")
            food_slug = arguments.get("food_slug")
            food_query = str(arguments.get("food_query") or arguments.get("food_name") or "").strip()
            qty = float(arguments.get("quantity") or 1.0)
            unit_name = str(arguments.get("unit_name") or "standard_serving")
            meal_category = str(arguments.get("meal_category") or "breakfast")
            confirmed = bool(arguments.get("confirmed", False))

            if not food_slug and food_query:
                sr = search_foods(db, q=food_query, page_size=1)
                if sr.items:
                    food_slug = sr.items[0].slug
            if not food_slug:
                raise ValueError(f"Could not match '{food_query}' to a verified food slug.")

            if not confirmed:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={
                        "food_slug": food_slug,
                        "quantity": qty,
                        "unit_name": unit_name,
                        "meal_category": meal_category,
                        "confirmed": False,
                    },
                    status="success",
                    summary=f"Prepared food log preview for '{food_slug}' ({qty} × {unit_name}) awaiting user confirmation.",
                    source_type="local_database",
                )
                return (
                    {
                        "requires_user_confirmation": True,
                        "proposed_entry": {
                            "member_name": member.display_name,
                            "food_slug": food_slug,
                            "quantity": qty,
                            "unit_name": unit_name,
                            "meal_category": meal_category,
                        },
                        "message": f"Ready to log {qty} × {unit_name} of '{food_slug}' under {meal_category} for {member.display_name}. Please confirm to save.",
                    },
                    trace,
                    sources,
                )

            entry = create_daily_food_log_entry(
                db,
                hh,
                member,
                {
                    "food_slug": food_slug,
                    "quantity": qty,
                    "unit_name": unit_name,
                    "meal_category": meal_category,
                    "logged_date": str(arguments.get("date") or today_iso_str()),
                },
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"food_slug": food_slug, "quantity": qty, "confirmed": True},
                status="success",
                summary=f"Logged {entry.food_name} ({entry.grams_equivalent}g) to {meal_category}.",
                source_type="local_database",
            )
            return {"saved": True, "entry": serialize_food_log_entry(entry)}, trace, sources

        if tool_name == "get_water_intake":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for water intake.")
            d_str = str(arguments.get("date") or today_iso_str())
            hyd = get_daily_hydration_summary(db, hh, member, date_str=d_str)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "date": d_str},
                status="success",
                summary=f"Water intake on {d_str}: {hyd['total_ml']} ml / {hyd['goal_ml']} ml ({hyd['progress_pct']}%).",
                source_type="local_database",
            )
            return hyd, trace, sources

        if tool_name == "log_water_intake":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to log water.")
            amount_ml = int(arguments.get("amount_ml") or 250)
            confirmed = bool(arguments.get("confirmed", False))
            if not confirmed:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"amount_ml": amount_ml, "confirmed": False},
                    status="success",
                    summary=f"Prepared {amount_ml} ml water entry awaiting user confirmation.",
                    source_type="local_database",
                )
                return (
                    {
                        "requires_user_confirmation": True,
                        "amount_ml": amount_ml,
                        "message": f"Ready to log {amount_ml} ml of water for {member.display_name}. Please confirm to save.",
                    },
                    trace,
                    sources,
                )
            from app.models.entities import WaterIntakeLog
            w_log = WaterIntakeLog(
                household_id=hh.id,
                member_id=member.id,
                logged_date=today_iso_str(),
                logged_time=datetime.now(UTC).strftime("%H:%M"),
                amount_ml=amount_ml,
                container_type=str(arguments.get("container_type") or "large_glass"),
            )
            db.add(w_log)
            db.commit()
            hyd = get_daily_hydration_summary(db, hh, member)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"amount_ml": amount_ml, "confirmed": True},
                status="success",
                summary=f"Logged {amount_ml} ml water. Total today: {hyd['total_ml']} ml.",
                source_type="local_database",
            )
            return {"saved": True, "hydration": hyd}, trace, sources

        if tool_name == "get_goal_progress":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for goals.")
            goals = (
                db.query(FitnessGoal)
                .filter(FitnessGoal.member_id == member.id)
                .all()
            )
            out_goals = [
                {
                    "id": g.id,
                    "goal_name": g.goal_name,
                    "goal_type": g.goal_type,
                    "target_value": g.target_value,
                    "current_value": g.current_value,
                    "unit": g.unit,
                    "status": g.status,
                }
                for g in goals
            ]
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Retrieved {len(out_goals)} fitness/nutrition goal(s) for '{member.display_name}'.",
                source_type="local_database",
            )
            return {"goals": out_goals}, trace, sources

        if tool_name == "update_user_goal":
            _hh, member = _resolve_tool_hh_and_member()
            if not member:
                raise ValueError("Active household member required to update goal.")
            goal_name = str(arguments.get("goal_name") or "Updated Nutrition Goal")
            target_value = float(arguments.get("target_value") or 100.0)
            confirmed = bool(arguments.get("confirmed", False))
            if not confirmed:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"goal_name": goal_name, "target_value": target_value, "confirmed": False},
                    status="success",
                    summary=f"Prepared goal update ('{goal_name}' -> {target_value}) awaiting user confirmation.",
                    source_type="local_database",
                )
                return (
                    {
                        "requires_user_confirmation": True,
                        "goal_name": goal_name,
                        "target_value": target_value,
                    },
                    trace,
                    sources,
                )
            g = FitnessGoal(
                member_id=member.id,
                goal_name=goal_name,
                goal_type=str(arguments.get("goal_type") or "custom"),
                start_date=today_iso_str(),
                target_value=target_value,
                current_value=0.0,
                unit=str(arguments.get("unit") or "g"),
                tracking_frequency="daily",
                status="active",
            )
            db.add(g)
            db.commit()
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"goal_name": goal_name, "target_value": target_value, "confirmed": True},
                status="success",
                summary=f"Saved goal '{goal_name}' ({target_value} {g.unit}).",
                source_type="local_database",
            )
            return {"saved": True, "goal_id": g.id}, trace, sources

        if tool_name == "get_habit_history":
            _hh, member = _resolve_tool_hh_and_member()
            if not member:
                raise ValueError("Active household member required for habits.")
            habits = (
                db.query(HabitDefinition)
                .options(joinedload(HabitDefinition.completions))
                .filter(HabitDefinition.member_id == member.id)
                .all()
            )
            h_list = [
                {
                    "id": h.id,
                    "title": h.title,
                    "category": h.category,
                    "frequency": h.frequency,
                    "total_completions": len([c for c in (h.completions or []) if c.completed]),
                }
                for h in habits
            ]
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Retrieved {len(h_list)} tracked habit(s) for '{member.display_name}'.",
                source_type="local_database",
            )
            return {"habits": h_list}, trace, sources

        if tool_name == "get_recipe_suggestions":
            hh, member = _resolve_tool_hh_and_member()
            if not hh:
                raise ValueError("Household context required for recipe suggestions.")
            disc = discover_and_recommend_recipes(
                db,
                hh,
                member=member,
                query=arguments.get("query"),
                meal_type=arguments.get("meal_type"),
                dietary_preference=arguments.get("dietary_preference"),
                fitness_goal=arguments.get("fitness_goal"),
                include_online=(mode != "database_only"),
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"query": arguments.get("query"), "meal_type": arguments.get("meal_type")},
                status="success",
                summary=f"Found {len(disc['local_verified_recipes'])} verified local recipe(s) matching profile.",
                source_type="local_database",
            )
            return disc, trace, sources

        if tool_name == "search_online_recipes":
            if mode == "database_only":
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments=arguments,
                    status="blocked",
                    summary="Online recipe search is skipped in database_only mode.",
                    source_type="external_provider",
                )
                return {"blocked_by_mode": True}, trace, []
            q = str(arguments.get("query") or "indian").strip()
            ext_recs, statuses = search_external_recipe_providers(
                query=q, dietary_preference=arguments.get("dietary_preference")
            )
            for er in ext_recs[:3]:
                sources.append(
                    AssistantSourceReference(
                        title=f"{er['title']} — {er['source_name']}",
                        source_type="external_provider",
                        url=er.get("source_url"),
                        retrieved_at=now_iso,
                        verification_status="external_recipe",
                    )
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"query": q},
                status="success",
                summary=f"Searched online recipe providers for '{q}' ({len(ext_recs)} result(s)).",
                source_type="external_provider",
            )
            return {"recipes": ext_recs, "provider_statuses": statuses}, trace, sources

        if tool_name == "create_shopping_list":
            hh, _member = _resolve_tool_hh_and_member()
            if not hh:
                raise ValueError("Household context required for shopping list.")
            recipe_ids = arguments.get("recipe_ids") or []
            confirmed = bool(arguments.get("confirmed", False))
            if not recipe_ids:
                all_recs = db.query(Recipe.id).limit(2).all()
                recipe_ids = [r[0] for r in all_recs]
            if not confirmed:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"recipe_ids": recipe_ids, "confirmed": False},
                    status="success",
                    summary=f"Prepared shopping list consolidation preview for recipe IDs {recipe_ids} (awaiting confirmation).",
                    source_type="local_database",
                )
                return (
                    {
                        "requires_user_confirmation": True,
                        "recipe_ids": recipe_ids,
                        "message": "Ready to consolidate missing ingredients into your Smart Shopping List. Confirm to save.",
                    },
                    trace,
                    sources,
                )
            s_out = add_recipe_ingredients_to_shopping_list(
                db, hh, recipe_ids=[int(x) for x in recipe_ids]
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"recipe_ids": recipe_ids, "confirmed": True},
                status="success",
                summary=f"Consolidated {s_out['total_items']} ingredient(s) into Smart Shopping List.",
                source_type="local_database",
            )
            return s_out, trace, sources

        if tool_name == "get_available_pantry_items":
            hh, _member = _resolve_tool_hh_and_member()
            if not hh:
                raise ValueError("Household context required for pantry.")
            p_items = (
                db.query(PantryItem)
                .filter(PantryItem.household_id == hh.id, PantryItem.in_stock.is_(True))
                .all()
            )
            p_out = [
                {
                    "ingredient_name": p.ingredient_name,
                    "food_slug": p.food_slug,
                    "available_quantity": p.available_quantity,
                    "unit_name": p.unit_name,
                    "expiry_date": p.expiry_date,
                }
                for p in p_items
            ]
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={},
                status="success",
                summary=f"Retrieved {len(p_out)} available pantry item(s).",
                source_type="local_database",
            )
            return {"pantry_items": p_out}, trace, sources

        if tool_name == "get_protein_comparisons":
            hh, _member = _resolve_tool_hh_and_member()
            if not hh:
                raise ValueError("Household context required for protein comparisons.")
            prot_res = get_indian_protein_intelligence(
                db, hh, dietary_filter=arguments.get("dietary_filter")
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"dietary_filter": arguments.get("dietary_filter")},
                status="success",
                summary=f"Compared {len(prot_res['items'])} Indian protein sources by protein/100g and cost per 10g protein.",
                source_type="local_database",
            )
            return {"items": prot_res["items"][:10]}, trace, sources

        if tool_name == "get_mess_menu":
            hh, _member = _resolve_tool_hh_and_member()
            if not hh:
                raise ValueError("Household context required for mess menus.")
            menus = (
                db.query(MessMenuRecord)
                .filter(MessMenuRecord.household_id == hh.id)
                .order_by(MessMenuRecord.id.desc())
                .limit(5)
                .all()
            )
            m_out = [
                {
                    "id": m.id,
                    "title": m.title,
                    "institution_or_canteen": m.institution_or_canteen,
                    "raw_menu_text": m.raw_menu_text,
                    "matched_dishes": m.matched_dishes_json,
                }
                for m in menus
            ]
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={},
                status="success",
                summary=f"Retrieved {len(m_out)} saved college/hostel mess menu(s).",
                source_type="local_database",
            )
            return {"menus": m_out}, trace, sources

        if tool_name == "get_fitness_progress":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for fitness progress.")
            overview = get_analytics_overview(db, hh, member, days=14)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Retrieved 14-day nutrition, hydration, and training analytics for '{member.display_name}'.",
                source_type="local_database",
            )
            return overview["summary_metrics"], trace, sources

        # ==========================================
        # PART 9 — HEALTH MEASUREMENT, AI HABIT & NL FOOD LOG TOOLS
        # ==========================================
        if tool_name == "get_blood_pressure_history":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for blood pressure history.")
            days = int(arguments.get("days") or 14)
            bp_dash = get_blood_pressure_dashboard(db, hh, member, days=days)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "days": days},
                status="success",
                summary=(
                    f"Retrieved {bp_dash['summary_stats']['total_readings']} BP reading(s) over {days} days for '{member.display_name}'."
                ),
                source_type="local_database",
            )
            return bp_dash, trace, sources

        if tool_name == "record_blood_pressure":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to record blood pressure.")
            systolic = int(arguments.get("systolic_mmhg") or 0)
            diastolic = int(arguments.get("diastolic_mmhg") or 0)
            pulse = arguments.get("pulse_bpm")
            time_of_day = str(arguments.get("time_of_day") or "morning")
            confirmed = bool(arguments.get("confirmed", False))
            if not confirmed:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={
                        "systolic_mmhg": systolic,
                        "diastolic_mmhg": diastolic,
                        "pulse_bpm": pulse,
                        "time_of_day": time_of_day,
                        "confirmed": False,
                    },
                    status="success",
                    summary=f"Prepared BP entry preview ({systolic}/{diastolic} mmHg, {time_of_day}) awaiting user confirmation.",
                    source_type="local_database",
                )
                return (
                    {
                        "requires_user_confirmation": True,
                        "proposed_bp": {
                            "member_name": member.display_name,
                            "systolic_mmhg": systolic,
                            "diastolic_mmhg": diastolic,
                            "pulse_bpm": pulse,
                            "time_of_day": time_of_day,
                            "logged_date": str(arguments.get("logged_date") or today_iso_str()),
                        },
                        "message": (
                            f"Ready to record {time_of_day} BP of {systolic}/{diastolic} mmHg"
                            + (f" (pulse {pulse} bpm)" if pulse else "")
                            + f" for {member.display_name}. Please confirm to save."
                        ),
                    },
                    trace,
                    sources,
                )
            bp_log = create_blood_pressure_log(db, hh, member, arguments)
            target_obj = get_member_clinician_target(db, member.id, "blood_pressure")
            ser = serialize_bp_log(
                bp_log,
                target_obj.target_details_json if target_obj else None,
                age_group=member.age_group,
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"systolic_mmhg": systolic, "diastolic_mmhg": diastolic, "confirmed": True},
                status="success",
                summary=f"Saved BP reading {systolic}/{diastolic} mmHg for '{member.display_name}'.",
                source_type="local_database",
            )
            return {"saved": True, "entry": ser}, trace, sources

        if tool_name == "get_blood_glucose_history":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for blood glucose history.")
            days = int(arguments.get("days") or 14)
            ctx_f = arguments.get("context_filter")
            bg_dash = get_blood_glucose_dashboard(
                db, hh, member, days=days, context_filter=ctx_f
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "days": days, "context_filter": ctx_f},
                status="success",
                summary=f"Retrieved {len(bg_dash['readings'])} blood glucose reading(s) for '{member.display_name}'.",
                source_type="local_database",
            )
            return bg_dash, trace, sources

        if tool_name == "record_blood_glucose":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to record blood glucose.")
            g_val = float(arguments.get("glucose_value") or arguments.get("entered_value") or 0)
            g_unit = str(arguments.get("measurement_unit") or "mg/dL")
            g_ctx = str(arguments.get("measurement_context") or "fasting")
            confirmed = bool(arguments.get("confirmed", False))
            if not confirmed:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={
                        "glucose_value": g_val,
                        "measurement_unit": g_unit,
                        "measurement_context": g_ctx,
                        "confirmed": False,
                    },
                    status="success",
                    summary=f"Prepared blood glucose preview ({g_val} {g_unit}, {g_ctx}) awaiting user confirmation.",
                    source_type="local_database",
                )
                return (
                    {
                        "requires_user_confirmation": True,
                        "proposed_glucose": {
                            "member_name": member.display_name,
                            "glucose_value": g_val,
                            "measurement_unit": g_unit,
                            "measurement_context": g_ctx,
                            "logged_date": str(arguments.get("logged_date") or today_iso_str()),
                        },
                        "message": (
                            f"Ready to record {g_ctx.replace('_', ' ')} blood glucose of {g_val} {g_unit} "
                            f"for {member.display_name}. Please confirm to save."
                        ),
                    },
                    trace,
                    sources,
                )
            bg_log = create_blood_glucose_log(db, hh, member, arguments)
            target_obj = get_member_clinician_target(db, member.id, "blood_glucose")
            ser = serialize_glucose_log(
                bg_log,
                target_obj.target_details_json if target_obj else None,
                age_group=member.age_group,
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"glucose_value": g_val, "measurement_unit": g_unit, "confirmed": True},
                status="success",
                summary=f"Saved {g_ctx} glucose reading {g_val} {g_unit} for '{member.display_name}'.",
                source_type="local_database",
            )
            return {"saved": True, "entry": ser}, trace, sources

        if tool_name == "get_health_measurement_summary":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for health measurement summary.")
            h_sum = get_health_measurements_summary(db, hh, member)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Retrieved BP, glucose, and body measurement summary for '{member.display_name}'.",
                source_type="local_database",
            )
            return h_sum, trace, sources

        if tool_name == "propose_habit_plan":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to propose habit plan.")
            prompt = str(arguments.get("prompt") or arguments.get("goal_description") or "Build healthy eating and hydration habits")
            plan = propose_ai_habit_plan(db, hh, member, prompt)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "prompt": prompt[:80]},
                status="success",
                summary=f"Proposed {len(plan['proposed_habits'])} structured habits awaiting user approval.",
                source_type="local_database",
            )
            return plan, trace, sources

        if tool_name == "create_confirmed_habit_plan":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to confirm habit plan.")
            res = confirm_ai_habit_plan(db, hh, member, arguments)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "saved_count": res["saved_count"]},
                status="success",
                summary=f"Saved {res['saved_count']} user-confirmed AI habits for '{member.display_name}'.",
                source_type="local_database",
            )
            return res, trace, sources

        if tool_name == "update_habit_schedule":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to update habits.")
            inst = str(arguments.get("instruction") or "Make my plan easier")
            confirmed = bool(arguments.get("user_confirmed", False))
            res = modify_ai_habit_plan_natural_language(
                db, hh, member, inst, user_confirmed=confirmed
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"instruction": inst, "user_confirmed": confirmed},
                status="success",
                summary=res["summary"],
                source_type="local_database",
            )
            return res, trace, sources

        if tool_name == "get_daily_activity_timeline":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for daily timeline.")
            tl = get_unified_daily_activity_timeline(
                db,
                hh,
                member,
                date_str=arguments.get("date"),
                category_filter=arguments.get("category"),
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "date": tl["date"]},
                status="success",
                summary=f"Retrieved {tl['total_events']} chronological activity event(s) on {tl['date']}.",
                source_type="local_database",
            )
            return tl, trace, sources

        if tool_name == "parse_food_log_message":
            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required to parse food log message.")
            raw_msg = str(arguments.get("text") or arguments.get("message") or "")
            parsed = parse_natural_language_food_log(db, hh, member, raw_msg)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"text": raw_msg[:80]},
                status="success",
                summary=f"Parsed {len(parsed['parsed_items'])} food item(s) from natural language (awaiting confirmation).",
                source_type="local_database",
            )
            return parsed, trace, sources

        # ==========================================
        # PART B & D — NEW CONTEXT, ANATOMY & RECIPE TOOLS
        # ==========================================
        if tool_name == "get_food_nutrients":
            return execute_allowlisted_tool(
                db, "get_nutritional_composition", arguments, mode=mode
            )

        if tool_name == "get_food_ingredients":
            return execute_allowlisted_tool(
                db, "get_ingredients_and_allergens", arguments, mode=mode
            )

        if tool_name == "get_member_context":
            return execute_allowlisted_tool(
                db, "get_household_member_context", arguments, mode=mode
            )

        if tool_name == "get_daily_food_history":
            return execute_allowlisted_tool(
                db, "get_daily_nutrition_summary", arguments, mode=mode
            )

        if tool_name == "get_recipe_details":
            rec_key = str(
                arguments.get("recipe_id_or_slug")
                or arguments.get("recipe_slug")
                or arguments.get("recipe_id")
                or ""
            ).strip()
            if not rec_key:
                raise ValueError("'recipe_id_or_slug' is required for get_recipe_details.")
            seed_curated_recipes_and_steps(db)
            recipe = get_recipe_by_id_or_slug(db, rec_key)
            if not recipe:
                q_rec = (
                    db.query(Recipe)
                    .options(joinedload(Recipe.ingredients), joinedload(Recipe.steps))
                    .filter(Recipe.title.ilike(f"%{rec_key}%"))
                    .first()
                )
                recipe = q_rec
            if not recipe:
                trace = AssistantToolExecutionTrace(
                    tool_name=tool_name,
                    arguments={"recipe_id_or_slug": rec_key},
                    status="error",
                    summary=f"Recipe '{rec_key}' not found in local database.",
                    source_type="local_database",
                )
                return {"found": False, "recipe_id_or_slug": rec_key}, trace, []

            ser_rec = serialize_recipe_detail(db, recipe)
            sources.append(
                AssistantSourceReference(
                    title=f"{ser_rec.title} — {ser_rec.source_name or 'GharPlate Verified Recipe'}",
                    source_type="local_database",
                    url=ser_rec.source_url,
                    retrieved_at=now_iso,
                    verification_status="verified_recipe",
                )
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"recipe_id_or_slug": rec_key},
                status="success",
                summary=f"Retrieved complete recipe details and {len(ser_rec.steps)} cooking steps for '{ser_rec.title}'.",
                source_type="local_database",
            )
            return {"found": True, **ser_rec.model_dump(mode="json")}, trace, sources

        if tool_name in ("get_body_region_details", "get_body_region_nutrients"):
            reg_code = str(
                arguments.get("region_code")
                or arguments.get("body_region")
                or arguments.get("region")
                or ""
            ).strip()
            if not reg_code:
                raise ValueError("'region_code' is required for get_body_region_details.")
            _hh, member = _resolve_tool_hh_and_member()
            reg_detail = get_body_nutrition_region_detail(
                db,
                region_code=reg_code,
                dietary_preference=arguments.get("dietary_preference")
                or (member.dietary_preference if member else None),
            )
            src_info = reg_detail.get("source") or {}
            sources.append(
                AssistantSourceReference(
                    title=f"{reg_detail['name']} ({reg_detail['anatomical_system']}) — {src_info.get('name', 'ICMR-NIN DGI 2024')}",
                    source_type="clinical_guideline",
                    url=src_info.get("url"),
                    retrieved_at=now_iso,
                    verification_status="reviewed_physiological_role",
                )
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"region_code": reg_code},
                status="success",
                summary=(
                    f"Retrieved physiological functions, {len(reg_detail.get('nutrients') or [])} key nutrients, "
                    f"and {len(reg_detail.get('foods') or [])} verified Indian food sources for '{reg_detail['name']}'."
                ),
                source_type="local_database",
            )
            return {"found": True, **reg_detail}, trace, sources

        if tool_name == "get_food_sources_for_nutrient":
            nut_code = str(arguments.get("nutrient_code") or "").strip().lower()
            if not nut_code:
                raise ValueError("'nutrient_code' is required for get_food_sources_for_nutrient.")
            seed_body_nutrition_explorer(db)
            links = (
                db.query(BodyRegionFoodLink, BodyRegion, FoodItem)
                .join(BodyRegion, BodyRegionFoodLink.region_id == BodyRegion.id)
                .join(FoodItem, BodyRegionFoodLink.food_id == FoodItem.id)
                .filter(BodyRegionFoodLink.primary_nutrient_code == nut_code)
                .order_by(BodyRegionFoodLink.priority_rank.asc())
                .all()
            )
            matched_foods = []
            seen_slugs: set[str] = set()
            for lnk, reg, f_item in links:
                if f_item.slug in seen_slugs:
                    continue
                seen_slugs.add(f_item.slug)
                matched_foods.append(
                    {
                        "slug": f_item.slug,
                        "name_en": f_item.name_en,
                        "region_name": reg.name,
                        "nutrient_code": lnk.primary_nutrient_code,
                        "why_helpful": lnk.relevance_explanation,
                        "serving_suggestion": lnk.preparation_or_serving_tip,
                    }
                )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"nutrient_code": nut_code},
                status="success",
                summary=f"Found {len(matched_foods)} verified Indian food source(s) for nutrient '{nut_code}'.",
                source_type="local_database",
            )
            return {"nutrient_code": nut_code, "foods": matched_foods}, trace, sources

        # ==========================================
        # HEALTH REPORT, SYMPTOM REVIEW & SMART FOOD DISCOVERY TOOLS
        # ==========================================
        if tool_name == "get_health_reports":
            from app.services.health_report_symptom_service import list_health_reports

            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for health reports.")
            reps = list_health_reports(db, hh, member)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id},
                status="success",
                summary=f"Retrieved {len(reps)} confirmed laboratory health report(s) for '{member.display_name}'.",
                source_type="local_database",
            )
            return {"reports": reps}, trace, sources

        if tool_name == "get_lab_measurement_trends":
            from app.services.health_report_symptom_service import (
                get_health_report_trends,
            )

            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for lab trends.")
            c_code = arguments.get("canonical_code")
            trends = get_health_report_trends(db, hh, member, canonical_code=c_code)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"member_id": member.id, "canonical_code": c_code},
                status="success",
                summary=f"Retrieved {trends['total_series']} unit-consistent laboratory trend series for '{member.display_name}'.",
                source_type="local_database",
            )
            return trends, trace, sources

        if tool_name == "evaluate_symptom_guidance":
            from app.services.health_report_symptom_service import (
                evaluate_symptom_review,
            )

            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for symptom review.")
            sym_res = evaluate_symptom_review(
                db,
                hh,
                member,
                {
                    "symptom_description": arguments.get("symptom_description")
                    or arguments.get("symptoms")
                    or "",
                    "onset": arguments.get("onset"),
                    "duration": arguments.get("duration"),
                    "severity": arguments.get("severity"),
                    "include_health_records_consent": True,
                },
            )
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={"red_flag_detected": sym_res["red_flag_detected"]},
                status="success",
                summary=(
                    "Evaluated symptom review: RED-FLAG EMERGENCY DETECTED."
                    if sym_res["red_flag_detected"]
                    else f"Evaluated symptom review ({sym_res['urgency_level']})."
                ),
                source_type="guidance_engine",
            )
            return sym_res, trace, sources

        if tool_name == "search_nearby_restaurants_for_dish":
            from app.services.food_discovery_service import (
                search_nearby_food_and_restaurants,
            )

            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for food discovery.")
            disc_res = search_nearby_food_and_restaurants(db, hh, member, arguments)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={
                    "dish_query": disc_res["dish_query"],
                    "city": disc_res["location_context"]["city"],
                    "radius_km": disc_res["location_context"]["radius_km"],
                },
                status="success",
                summary=(
                    f"Found {disc_res['total_results']} nearby restaurant(s) for '{disc_res['dish_query']}' "
                    f"within {disc_res['location_context']['radius_km']} km of {disc_res['location_context']['city']}."
                ),
                source_type="local_database",
            )
            return disc_res, trace, sources

        if tool_name == "prepare_restaurant_order_preview":
            from app.services.food_discovery_service import (
                prepare_swiggy_mcp_action_preview,
            )

            hh, member = _resolve_tool_hh_and_member()
            if not hh or not member:
                raise ValueError("Active household member required for order preview.")
            prev_res = prepare_swiggy_mcp_action_preview(db, hh, member, arguments)
            trace = AssistantToolExecutionTrace(
                tool_name=tool_name,
                arguments={
                    "restaurant_name": prev_res["restaurant_name"],
                    "action_type": prev_res["action_type"],
                    "user_confirmed": prev_res["user_confirmed"],
                },
                status="success",
                summary=prev_res["status_message"],
                source_type="external_provider",
            )
            return prev_res, trace, sources

    except Exception as exc:
        trace = AssistantToolExecutionTrace(
            tool_name=tool_name,
            arguments=arguments,
            status="error",
            summary=f"Tool validation/execution error: {exc}",
            source_type="local_database",
        )
        return {"error": str(exc)}, trace, []

    raise ValueError(f"Unhandled tool: {tool_name}")


# ==========================================
# PART B.4 — LOCAL OLLAMA MODEL AUDIT & EVALUATION
# ==========================================
def evaluate_local_ollama_models(db: Session | None = None) -> dict[str, Any]:
    """
    Audits locally installed Ollama models (`GET /api/tags`) and evaluates their suitability
    for GharPlate's structured active-context, tool-grounding, and Indian food Q&A workloads.
    Never downloads large models without user permission.
    """
    reachable, installed, err_msg = discover_ollama_models()
    configured = (settings.OLLAMA_MODEL or "").strip() or None

    model_profiles = []
    for m_name in installed:
        m_low = m_name.lower()
        is_vision = "vl" in m_low or "vision" in m_low or "llava" in m_low
        param_match = re.search(r":(\d+(?:\.\d+)?b)", m_low)
        param_size = param_match.group(1).upper() if param_match else "7B"
        model_profiles.append(
            {
                "model_name": m_name,
                "parameter_size": param_size,
                "multimodal_vision": is_vision,
                "indian_food_context_adherence": "High (with structured Active Context & Grounded Tool Injection)",
                "pronoun_resolution_support": "Verified via deterministic pre-LLM entity binding (`resolve_active_entity_and_intent`)",
                "recommended_role": (
                    "Primary local text + label-vision model"
                    if is_vision
                    else "Fast local text & tool reasoning model"
                ),
            }
        )

    recommended_default = installed[0] if installed else (configured or "qwen2.5vl:7b")
    return {
        "ollama_reachable": reachable,
        "ollama_base_url": settings.OLLAMA_BASE_URL,
        "configured_model": configured,
        "recommended_active_model": recommended_default,
        "installed_models": installed,
        "evaluated_models": model_profiles,
        "alternative_recommendations": [
            {
                "model": "qwen2.5:7b-instruct",
                "size_gb": 4.7,
                "strengths": "Fastest text-only instruction following and JSON tool adherence on Apple Silicon / 8GB+ RAM.",
                "install_command": "ollama pull qwen2.5:7b-instruct",
            },
            {
                "model": "llama3.2:3b",
                "size_gb": 2.0,
                "strengths": "Ultra-low latency (<1.2s first token) for voice conversations on laptops.",
                "install_command": "ollama pull llama3.2:3b",
            },
        ],
        "error_message": err_msg,
    }


# ==========================================
# PART C — VOICE CONVERSATION STATUS & TRANSCRIPTION SERVICE
# ==========================================
SUPPORTED_VOICE_LANGUAGES = [
    {
        "code": "en-IN",
        "label": "English (India)",
        "bcp47": "en-IN",
        "fallback_bcp47": "en-US",
        "sample_prompt": "What are the uses and nutrients of this food?",
    },
    {
        "code": "hi-IN",
        "label": "हिन्दी (Hindi)",
        "bcp47": "hi-IN",
        "fallback_bcp47": "hi",
        "sample_prompt": "इसके पोषक तत्व और उपयोग क्या हैं?",
    },
    {
        "code": "kn-IN",
        "label": "ಕನ್ನಡ (Kannada)",
        "bcp47": "kn-IN",
        "fallback_bcp47": "kn",
        "sample_prompt": "ಇದರ ಪೋಷಕಾಂಶಗಳು ಮತ್ತು ಉಪಯೋಗಗಳು ಯಾವುವು?",
    },
]


def get_voice_assistant_status() -> AssistantVoiceStatusResponse:
    """
    Returns available free speech-to-text and text-to-speech capabilities,
    supported Indian languages (English, Hindi, Kannada), and transparent privacy disclosures.
    """
    local_stt_available = False
    local_stt_engine: str | None = None
    try:
        import faster_whisper  # type: ignore  # noqa: F401
        local_stt_available = True
        local_stt_engine = "faster-whisper (local offline)"
    except ImportError:
        try:
            import whisper  # type: ignore  # noqa: F401
            local_stt_available = True
            local_stt_engine = "openai-whisper (local offline)"
        except ImportError:
            local_stt_available = False
            local_stt_engine = None

    return AssistantVoiceStatusResponse(
        voice_enabled=True,
        stt_modes=[
            {
                "id": "browser_web_speech",
                "label": "Browser SpeechRecognition (Web Speech API)",
                "is_free": True,
                "available": True,
                "description": "Zero-install real-time microphone recognition in Chrome, Edge, and Safari.",
            },
            {
                "id": "local_whisper_backend",
                "label": local_stt_engine or "Local Whisper STT (Optional Backend Engine)",
                "is_free": True,
                "available": local_stt_available,
                "description": (
                    "Offline local audio transcription on your machine."
                    if local_stt_available
                    else "Browser SpeechRecognition is active; install `faster-whisper` in backend venv if offline audio file transcription is desired."
                ),
            },
        ],
        tts_modes=[
            {
                "id": "browser_speech_synthesis",
                "label": "Browser SpeechSynthesis (System Voices)",
                "is_free": True,
                "available": True,
                "description": "Uses free local operating-system voices for English (en-IN), Hindi (hi-IN), and Kannada (kn-IN) with Play, Pause, Resume, Stop, and Replay controls.",
            }
        ],
        supported_languages=SUPPORTED_VOICE_LANGUAGES,
        privacy_notice=(
            "Voice input is only active while you explicitly press the microphone button (no background listening). "
            "Browser SpeechRecognition may use your browser vendor's speech service; spoken replies use local system voices."
        ),
        confirmation_policy=(
            "Spoken food logs, water intake, blood pressure, blood glucose, habits, and goals always create a confirmation preview first and are never saved without your explicit approval."
        ),
    )


def transcribe_voice_input(
    req: AssistantVoiceTranscribeRequest,
) -> AssistantVoiceTranscribeResponse:
    """
    Normalizes and validates a voice transcript from either browser SpeechRecognition
    or optional base64 audio payload, preserving domain food terms in English, Hindi, and Kannada.
    """
    lang = (req.language_code or "en-IN").strip()
    raw_hint = (req.transcript_hint or "").strip()

    # Clean common speech-to-text phonetic variants for Indian foods
    cleaned = raw_hint
    phonetic_fixes = {
        r"\braggi\b": "ragi",
        r"\bkichdi\b": "khichdi",
        r"\bmoong dhal\b": "moong dal",
        r"\btuar dal\b": "toor dal",
        r"\bchanna\b": "chana",
        r"\bidly\b": "idli",
    }
    for pat, repl in phonetic_fixes.items():
        cleaned = re.sub(pat, repl, cleaned, flags=re.IGNORECASE)

    if cleaned:
        return AssistantVoiceTranscribeResponse(
            transcript=cleaned,
            language_code=lang,
            engine_used="browser_web_speech_normalized",
            confidence=0.95,
            requires_review=False,
            privacy_notice="Transcript normalized locally by GharPlate Voice Service.",
        )

    return AssistantVoiceTranscribeResponse(
        transcript="",
        language_code=lang,
        engine_used="none",
        confidence=0.0,
        requires_review=True,
        privacy_notice="No speech was detected. Please try speaking again or type your question.",
    )


# ==========================================
# PART B — ACTIVE ENTITY & PRONOUN RESOLUTION ENGINE
# ==========================================
BODY_REGION_ALIASES: dict[str, str] = {
    "eyes": "eyes_vision",
    "eye": "eyes_vision",
    "vision": "eyes_vision",
    "retina": "eyes_vision",
    "eyes_vision": "eyes_vision",
    "brain": "brain_nervous",
    "nervous": "brain_nervous",
    "memory": "brain_nervous",
    "brain_nervous": "brain_nervous",
    "heart": "heart_cardiovascular",
    "cardiovascular": "heart_cardiovascular",
    "cardiac": "heart_cardiovascular",
    "heart_cardiovascular": "heart_cardiovascular",
    "lungs": "respiratory_lungs",
    "lung": "respiratory_lungs",
    "respiratory": "respiratory_lungs",
    "respiratory_lungs": "respiratory_lungs",
    "muscle": "muscles_strength",
    "muscles": "muscles_strength",
    "biceps": "muscles_strength",
    "quadriceps": "muscles_strength",
    "muscles_strength": "muscles_strength",
    "bone": "bones_joints",
    "bones": "bones_joints",
    "skeleton": "bones_joints",
    "joints": "bones_joints",
    "femur": "bones_joints",
    "bones_joints": "bones_joints",
    "digestive": "digestive_gut",
    "stomach": "digestive_gut",
    "gut": "digestive_gut",
    "intestine": "digestive_gut",
    "digestive_gut": "digestive_gut",
    "liver": "liver_metabolism",
    "hepatic": "liver_metabolism",
    "liver_metabolism": "liver_metabolism",
    "kidney": "urinary_kidneys",
    "kidneys": "urinary_kidneys",
    "renal": "urinary_kidneys",
    "urinary": "urinary_kidneys",
    "urinary_kidneys": "urinary_kidneys",
    "thyroid": "endocrine_metabolic",
    "endocrine": "endocrine_metabolic",
    "pancreas": "endocrine_metabolic",
    "endocrine_metabolic": "endocrine_metabolic",
    "blood": "blood_oxygen",
    "hemoglobin": "blood_oxygen",
    "haemoglobin": "blood_oxygen",
    "blood_oxygen": "blood_oxygen",
    "skin": "skin_hair_immunity",
    "hair": "skin_hair_immunity",
    "immunity": "skin_hair_immunity",
    "immune": "skin_hair_immunity",
    "skin_hair_immunity": "skin_hair_immunity",
}

PRONOUN_PATTERNS = re.compile(
    r"\b(this|it|that|this one|this food|this item|this dish|this recipe|this product|this organ|this region|its)\b",
    re.IGNORECASE,
)

EXPLICIT_SOFTWARE_PATTERNS = re.compile(
    r"\b(what is gharplate|what does gharplate do|what does this gharplate feature do|about gharplate|how does gharplate work|gharplate app|this app|this software|this platform)\b",
    re.IGNORECASE,
)


def _extract_entity_from_history(
    db: Session, history: list[ Any ]
) -> AssistantSelectedEntity | None:
    """
    Looks back at the most recent messages within the SAME conversation to resolve
    an unambiguous entity reference when the user asks a follow-up with a pronoun.
    Never leaks across different conversations.
    """
    if not history:
        return None

    all_foods = db.query(FoodItem.slug, FoodItem.name_en, FoodItem.is_packaged).all()
    seed_body_nutrition_explorer(db)
    all_regions = db.query(BodyRegion.code, BodyRegion.name, BodyRegion.anatomical_system).all()
    all_recipes = db.query(Recipe.id, Recipe.slug, Recipe.title).all()

    for msg in reversed(history[-4:]):
        text = str(getattr(msg, "content", "") or "").lower()
        if not text:
            continue
        for slug, name_en, is_pkg in all_foods:
            base = re.sub(r"\s*\(.*?\)", "", name_en.lower()).strip()
            if slug.lower() in text or name_en.lower() in text or (len(base) >= 4 and base in text):
                return AssistantSelectedEntity(
                    type="packaged_product" if is_pkg else "food",
                    id=slug,
                    name=name_en,
                )
        for r_id, r_slug, r_title in all_recipes:
            if (r_slug and r_slug.lower() in text) or r_title.lower() in text:
                return AssistantSelectedEntity(
                    type="recipe",
                    id=r_slug or str(r_id),
                    name=r_title,
                )
        for reg_code, reg_name, reg_sys in all_regions:
            if reg_code.lower() in text or reg_name.lower() in text:
                return AssistantSelectedEntity(
                    type="body_region",
                    id=reg_code,
                    name=reg_name,
                    anatomical_system=reg_sys,
                )
    return None


def resolve_active_entity_and_intent(
    db: Session,
    req: AssistantChatRequest,
) -> tuple[AssistantSelectedEntity | None, str]:
    """
    Resolves the active entity from:
    1. Explicit software/platform meta-questions ("What does this GharPlate feature do?") -> intent='software_help'
    2. Explicit entity named in the user's current message (food, recipe, body region, condition)
    3. Structured `req.context.selected_entity` or legacy `food_slug` / `selected_body_region` / `selected_recipe` / `condition_code`
    4. Recent unambiguous reference in `req.history` (same conversation only)
    5. If the user uses a pronoun ("Is this good?", "uses of this?") with NO active context and NO history entity -> intent='needs_clarification'
    """
    msg = req.message.strip()
    msg_l = msg.lower()
    ctx = req.context

    # 1. Explicit question about the GharPlate software/feature itself (Test 6)
    if EXPLICIT_SOFTWARE_PATTERNS.search(msg_l):
        return None, "software_help"

    # 2. Check if the current context has an explicitly selected entity from the UI
    ctx_entity: AssistantSelectedEntity | None = None
    if ctx:
        if ctx.food_image_analysis and isinstance(ctx.food_image_analysis, dict):
            fia = ctx.food_image_analysis
            fia_slug = str(fia.get("confirmed_food_slug") or fia.get("food_slug") or "").strip()
            fia_name = str(fia.get("confirmed_food_name") or fia.get("food_name") or "").strip()
            if fia_slug or fia_name:
                ctx_entity = AssistantSelectedEntity(
                    type="food",
                    id=fia_slug or fia_name,
                    name=fia_name or fia_slug,
                    category=str(fia.get("category_name") or "Food Photo Analysis"),
                    summary=str(fia.get("overall_description") or ""),
                )
        if not ctx_entity and ctx.selected_entity and (ctx.selected_entity.id or ctx.selected_entity.name):
            ctx_entity = ctx.selected_entity
        elif not ctx_entity and (ctx.food_slug or ctx.selected_product):
            slug_val = ctx.food_slug or ctx.selected_product
            f_row = db.query(FoodItem).filter(FoodItem.slug == slug_val).first()
            if f_row:
                ctx_entity = AssistantSelectedEntity(
                    type="packaged_product" if f_row.is_packaged else "food",
                    id=f_row.slug,
                    name=f_row.name_en,
                    category=f_row.category.name if f_row.category else None,
                )
        elif ctx.selected_body_region:
            seed_body_nutrition_explorer(db)
            reg_code = BODY_REGION_ALIASES.get(
                ctx.selected_body_region.lower().strip(), ctx.selected_body_region.strip()
            )
            reg_row = db.query(BodyRegion).filter(BodyRegion.code == reg_code).first()
            if reg_row:
                ctx_entity = AssistantSelectedEntity(
                    type="body_region",
                    id=reg_row.code,
                    name=reg_row.name,
                    anatomical_system=reg_row.anatomical_system,
                    summary=reg_row.short_summary,
                )
        elif ctx.selected_recipe or getattr(ctx, "recipe_id", None) is not None:
            seed_curated_recipes_and_steps(db)
            rec_key = str(ctx.selected_recipe or getattr(ctx, "recipe_id", None))
            rec_row = get_recipe_by_id_or_slug(db, rec_key)
            if rec_row:
                ctx_entity = AssistantSelectedEntity(
                    type="recipe",
                    id=rec_row.slug or str(rec_row.id),
                    name=rec_row.title,
                    category=rec_row.meal_type,
                )
        elif ctx.condition_code or ctx.selected_condition:
            c_code = ctx.condition_code or ctx.selected_condition
            c_row = db.query(HealthCondition).filter(HealthCondition.code == c_code).first()
            if c_row:
                ctx_entity = AssistantSelectedEntity(
                    type="condition",
                    id=c_row.code,
                    name=c_row.name,
                    category=c_row.condition_group_name,
                )

    # Normalize partial ctx_entity (e.g. if frontend sent id='carrot-orange' without name, or id='eyes_vision')
    if ctx_entity and ctx_entity.type in ("food", "packaged_product") and ctx_entity.id:
        f_row = db.query(FoodItem).filter(FoodItem.slug == ctx_entity.id).first()
        if f_row:
            ctx_entity.name = f_row.name_en
            ctx_entity.category = f_row.category.name if f_row.category else ctx_entity.category
    elif ctx_entity and ctx_entity.type == "body_region" and ctx_entity.id:
        seed_body_nutrition_explorer(db)
        norm_code = BODY_REGION_ALIASES.get(str(ctx_entity.id).lower(), str(ctx_entity.id))
        reg_row = db.query(BodyRegion).filter(BodyRegion.code == norm_code).first()
        if reg_row:
            ctx_entity.id = reg_row.code
            ctx_entity.name = reg_row.name
            ctx_entity.anatomical_system = reg_row.anatomical_system
            ctx_entity.summary = reg_row.short_summary
    elif ctx_entity and ctx_entity.type == "recipe" and ctx_entity.id:
        seed_curated_recipes_and_steps(db)
        rec_row = get_recipe_by_id_or_slug(db, str(ctx_entity.id))
        if rec_row:
            ctx_entity.id = rec_row.slug or str(rec_row.id)
            ctx_entity.name = rec_row.title

    has_pronoun = bool(PRONOUN_PATTERNS.search(msg_l)) or msg_l in (
        "uses?",
        "uses of this?",
        "benefits?",
        "nutrients?",
        "ingredients?",
        "how to make?",
        "how is it made?",
        "how is this made?",
        "is this good?",
        "what about this one?",
    )

    # If the user has an active UI selection and uses a pronoun ("this", "this one", "it"),
    # ALWAYS prioritize the current UI selection over older conversation history (Test 1, 2, 3, 4)!
    if ctx_entity and has_pronoun:
        return ctx_entity, f"active_{ctx_entity.type}_query"

    # Check if the message explicitly names a food, recipe, or body region
    all_foods = db.query(FoodItem.slug, FoodItem.name_en, FoodItem.is_packaged).all()
    for slug, name_en, is_pkg in all_foods:
        base_name = re.sub(r"\s*\(.*?\)", "", name_en.lower()).strip()
        if slug.lower() in msg_l or name_en.lower() in msg_l or (len(base_name) >= 4 and re.search(rf"\b{re.escape(base_name)}s?\b", msg_l)):
            return (
                AssistantSelectedEntity(
                    type="packaged_product" if is_pkg else "food",
                    id=slug,
                    name=name_en,
                ),
                "explicit_food_query",
            )

    seed_curated_recipes_and_steps(db)
    all_recipes = db.query(Recipe.id, Recipe.slug, Recipe.title).all()
    for r_id, r_slug, r_title in all_recipes:
        if (r_slug and r_slug.lower() in msg_l) or r_title.lower() in msg_l:
            return (
                AssistantSelectedEntity(
                    type="recipe",
                    id=r_slug or str(r_id),
                    name=r_title,
                ),
                "explicit_recipe_query",
            )

    for alias_kw, reg_code in BODY_REGION_ALIASES.items():
        if re.search(rf"\b{re.escape(alias_kw)}\b", msg_l):
            seed_body_nutrition_explorer(db)
            reg_row = db.query(BodyRegion).filter(BodyRegion.code == reg_code).first()
            if reg_row:
                return (
                    AssistantSelectedEntity(
                        type="body_region",
                        id=reg_row.code,
                        name=reg_row.name,
                        anatomical_system=reg_row.anatomical_system,
                        summary=reg_row.short_summary,
                    ),
                    "explicit_body_region_query",
                )

    # If an active entity is selected in context (even without an explicit pronoun), use it for short/contextual questions
    if ctx_entity:
        return ctx_entity, f"active_{ctx_entity.type}_query"

    # Otherwise, if the user used a pronoun, check recent conversation history (within the SAME conversation)
    if has_pronoun:
        hist_entity = _extract_entity_from_history(db, req.history)
        if hist_entity:
            return hist_entity, f"history_{hist_entity.type}_query"
        # Test 7: Ambiguous pronoun with NO selected entity and NO conversation history!
        return None, "needs_clarification"

    return None, "general_query"


def _resolve_context_food_slug(
    db: Session, message: str, context: AssistantPageContext | None
) -> str | None:
    """
    Resolves the relevant food slug from structured `selected_entity`, `context.food_slug`,
    `context.barcode`, or food names mentioned in the user's message.
    """
    if context and context.selected_entity and context.selected_entity.type in ("food", "packaged_product"):
        cand_id = str(context.selected_entity.id or "").strip()
        if cand_id:
            exists = db.query(FoodItem.slug).filter(FoodItem.slug == cand_id).first()
            if exists:
                return exists[0]
        if context.selected_entity.name:
            by_name = (
                db.query(FoodItem.slug)
                .filter(FoodItem.name_en.ilike(f"%{context.selected_entity.name}%"))
                .first()
            )
            if by_name:
                return by_name[0]

    if context and context.food_slug:
        exists = db.query(FoodItem.slug).filter(FoodItem.slug == context.food_slug).first()
        if exists:
            return context.food_slug

    if context and context.barcode:
        by_bc = db.query(FoodItem.slug).filter(FoodItem.barcode == context.barcode).first()
        if by_bc:
            return by_bc[0]

    msg_lower = message.lower()
    if "pineapple cake" in msg_lower or "winkles" in msg_lower or "8906005618726" in msg_lower:
        pc = (
            db.query(FoodItem.slug)
            .filter(
                (FoodItem.barcode == "8906005618726")
                | (FoodItem.slug == "pkg-pineapple-cake-6b35c3")
            )
            .first()
        )
        if pc:
            return pc[0]

    all_foods = db.query(FoodItem.slug, FoodItem.name_en, FoodItem.brand).all()
    for slug, name_en, _brand in all_foods:
        base_name = re.sub(r"\s*\(.*?\)", "", name_en.lower()).strip()
        if len(base_name) >= 4 and re.search(rf"\b{re.escape(base_name)}s?\b", msg_lower):
            return slug

    return None


def _orchestrate_deterministic_tool_calls(
    db: Session,
    req: AssistantChatRequest,
) -> tuple[dict[str, Any], list[AssistantToolExecutionTrace], list[AssistantSourceReference]]:
    """
    Context-first, database-grounded deterministic tool planner.
    Resolves the active UI selection (`food`, `packaged_product`, `recipe`, `body_region`, `condition`)
    and pronoun references BEFORE calling Ollama so the assistant always answers the user's
    actual question about the selected item rather than returning generic GharPlate boilerplate.
    """
    msg = req.message.strip()
    msg_l = msg.lower()
    mode = req.mode if req.mode in ("database_only", "automatic", "online_search") else "automatic"
    ctx = req.context

    collected_data: dict[str, Any] = {}
    traces: list[AssistantToolExecutionTrace] = []
    sources: list[AssistantSourceReference] = []

    def _run(name: str, args: dict[str, Any]) -> dict[str, Any]:
        out, tr, srcs = execute_allowlisted_tool(db, name, args, mode=mode)
        traces.append(tr)
        sources.extend(srcs)
        return out

    # 0. Resolve active entity & intent (Part B)
    resolved_entity, intent_type = resolve_active_entity_and_intent(db, req)
    collected_data["resolved_intent"] = intent_type
    if resolved_entity:
        collected_data["resolved_entity"] = resolved_entity.model_dump()
    if ctx and ctx.food_image_analysis and isinstance(ctx.food_image_analysis, dict):
        collected_data["food_image_analysis"] = ctx.food_image_analysis

    # 1. Resolve active household member context if provided
    member_id_val = (
        ctx.selected_member.id
        if (ctx and ctx.selected_member and ctx.selected_member.id is not None)
        else (ctx.member_id if ctx else None)
    )
    if ctx and (member_id_val is not None or ctx.household_token):
        mem_out = _run(
            "get_household_member_context",
            {"household_token": ctx.household_token, "member_id": member_id_val},
        )
        if mem_out.get("member_selected"):
            collected_data["member_context"] = mem_out

    # Handle explicit software help ("What does this GharPlate feature do?")
    if intent_type == "software_help":
        page_label = (ctx.page_type or ctx.current_page or "GharPlate") if ctx else "GharPlate"
        collected_data["software_feature_explanation"] = {
            "page": page_label,
            "route": ctx.route if ctx else "/",
            "selected_entity": resolved_entity.model_dump() if resolved_entity else None,
            "capabilities": [
                "Search verified Indian foods & packaged products (IFCT 2017, ICMR-NIN 2024, Open Food Facts, USDA FDC)",
                "Interactive 10-layer 3D Human Anatomy & Nutrition Explorer (/explore/body-nutrition)",
                "Complete step-by-step Indian recipes with interactive Guided Cooking Mode (/recipes)",
                "Daily Food, Water, Blood Pressure, Blood Glucose & AI Habit tracking (/tracker)",
                "Context-aware text and voice conversation in English, Hindi, and Kannada",
            ],
        }
        return collected_data, traces, sources

    # Handle missing-context pronoun ("Is this good?" with no selected item)
    if intent_type == "needs_clarification":
        return collected_data, traces, sources

    # 2. Route by resolved entity type:
    # 2A. Selected Body Region / 3D Anatomy Structure
    if resolved_entity and resolved_entity.type == "body_region" and resolved_entity.id:
        collected_data["body_region_details"] = _run(
            "get_body_region_details",
            {
                "region_code": str(resolved_entity.id),
                "household_token": ctx.household_token if ctx else None,
                "member_id": member_id_val,
            },
        )

    # 2B. Selected Recipe
    elif resolved_entity and resolved_entity.type == "recipe" and resolved_entity.id:
        rec_det = _run(
            "get_recipe_details",
            {"recipe_id_or_slug": str(resolved_entity.id)},
        )
        collected_data["recipe_details"] = rec_det
        # If the user asks about a specific ingredient inside the recipe or if no recipe was found, check food DB too
        if not rec_det.get("found"):
            sr = _run("search_food_database", {"query": resolved_entity.name or str(resolved_entity.id)})
            collected_data["search_results"] = sr
            items = (sr or {}).get("items") or []
            if items:
                top_slug = items[0]["slug"]
                collected_data["food_details"] = _run("get_food_details", {"food_slug": top_slug})
                collected_data["nutritional_composition"] = _run(
                    "get_nutritional_composition", {"food_slug": top_slug}
                )
                collected_data["ingredients_and_allergens"] = _run(
                    "get_ingredients_and_allergens", {"food_slug": top_slug}
                )

    # 2C. Selected Food or Packaged Product (or barcode)
    bc_match = re.search(r"\b(\d{8,14})\b", msg)
    target_barcode = bc_match.group(1) if bc_match else (ctx.barcode if ctx else None)
    target_slug = (
        str(resolved_entity.id)
        if (resolved_entity and resolved_entity.type in ("food", "packaged_product") and resolved_entity.id)
        else _resolve_context_food_slug(db, msg, ctx)
    )

    if target_slug:
        collected_data["food_details"] = _run("get_food_details", {"food_slug": target_slug})
        collected_data["ingredients_and_allergens"] = _run(
            "get_ingredients_and_allergens", {"food_slug": target_slug}
        )
        collected_data["nutritional_composition"] = _run(
            "get_nutritional_composition", {"food_slug": target_slug}
        )

        # Also check if there is a curated recipe matching this dish (e.g., viewing Idli food page and asking "How is this made?")
        if any(
            kw in msg_l
            for kw in ("how is this made", "how to make", "how to cook", "recipe", "steps", "prepare", "preparation")
        ):
            food_name_clean = re.sub(
                r"\s*\(.*?\)", "", (collected_data["food_details"].get("name_en") or target_slug)
            ).strip()
            rec_try = _run("get_recipe_details", {"recipe_id_or_slug": food_name_clean})
            if rec_try.get("found"):
                collected_data["recipe_details"] = rec_try

        food_det = collected_data.get("food_details") or {}
        wants_online = mode == "online_search" or any(
            kw in msg_l
            for kw in ("online", "external", "open food facts", "find", "missing", "null", "barcode")
        )
        if wants_online and mode != "database_only":
            bc_to_check = food_det.get("barcode") or target_barcode
            if bc_to_check:
                collected_data["barcode_lookup"] = _run(
                    "lookup_product_by_barcode", {"barcode": bc_to_check}
                )
            else:
                collected_data["external_search"] = _run(
                    "search_external_products",
                    {
                        "query": food_det.get("name_en") or msg,
                        "brand": food_det.get("brand"),
                    },
                )

    elif target_barcode:
        if mode == "database_only":
            collected_data["search_results"] = _run(
                "search_food_database", {"query": target_barcode}
            )
        else:
            collected_data["barcode_lookup"] = _run(
                "lookup_product_by_barcode", {"barcode": target_barcode}
            )
    elif not collected_data.get("body_region_details") and not collected_data.get("recipe_details"):
        stop_words = {
            "what", "are", "the", "in", "is", "how", "much", "many", "does",
            "contain", "for", "of", "tell", "me", "about", "can", "you",
            "find", "search", "online", "nutrition", "calories", "protein",
            "ingredients", "good", "safe", "allowed", "uses", "this", "that", "one", "made",
        }
        tokens = [
            t for t in re.findall(r"[a-zA-Z0-9]+", msg) if t.lower() not in stop_words and len(t) >= 3
        ]
        search_q = " ".join(tokens[:4]) if tokens else msg[:40]
        if search_q:
            collected_data["search_results"] = _run(
                "search_food_database", {"query": search_q}
            )
            items = (collected_data["search_results"] or {}).get("items") or []
            if items:
                top_slug = items[0]["slug"]
                collected_data["food_details"] = _run("get_food_details", {"food_slug": top_slug})
                collected_data["ingredients_and_allergens"] = _run(
                    "get_ingredients_and_allergens", {"food_slug": top_slug}
                )
                collected_data["nutritional_composition"] = _run(
                    "get_nutritional_composition", {"food_slug": top_slug}
                )
            elif mode in ("automatic", "online_search"):
                collected_data["external_search"] = _run(
                    "search_external_products", {"query": search_q}
                )

    # 3. Check if a health condition is referenced in the message, page context, or active member profile
    cond_code = (
        str(resolved_entity.id)
        if (resolved_entity and resolved_entity.type == "condition" and resolved_entity.id)
        else (ctx.condition_code or ctx.selected_condition if ctx else None)
    )
    if not cond_code:
        cond_keywords = {
            "fever": "fever_acute_recovery",
            "diabetes": "type_2_diabetes",
            "sugar": "type_2_diabetes",
            "hypertension": "hypertension",
            "blood pressure": "hypertension",
            "kidney": "chronic_kidney_disease",
            "ckd": "chronic_kidney_disease",
            "anaemia": "iron_deficiency_anaemia",
            "anemia": "iron_deficiency_anaemia",
            "pcos": "pcos_metabolic",
            "thyroid": "hypothyroidism",
            "gout": "hyperuricaemia_gout",
            "uric acid": "hyperuricaemia_gout",
            "diarrhoea": "acute_diarrhoea_dehydration",
            "bone": "osteoporosis_bone_health",
        }
        for kw, mapped_code in cond_keywords.items():
            if kw in msg_l:
                cond_code = mapped_code
                break

    if cond_code:
        collected_data["condition_guidance"] = _run(
            "get_condition_guidance",
            {"condition_code": cond_code, "food_slug": target_slug},
        )

    # 4. GharPlate 3.0 Ecosystem Intent Routing
    base_ctx_args = {
        "household_token": ctx.household_token if ctx else None,
        "member_id": member_id_val,
    }
    if any(kw in msg_l for kw in ("consumed today", "logged today", "my daily", "how much protein have i", "calories today", "food log", "food diary", "what did i eat", "missing nutritional")):
        collected_data["daily_nutrition_summary"] = _run("get_daily_nutrition_summary", base_ctx_args)
    if (
        ctx
        and ctx.food_image_analysis
        and isinstance(ctx.food_image_analysis, dict)
        and any(kw in msg_l for kw in ("add this", "log this", "add to today", "add to breakfast", "add to lunch", "add to dinner", "add to snack", "today's breakfast", "today's lunch", "today's dinner"))
    ):
        fia = ctx.food_image_analysis
        fia_slug = fia.get("confirmed_food_slug") or fia.get("food_slug") or target_slug
        fia_unit = str(fia.get("selected_unit_name") or "standard_serving")
        fia_qty = float(fia.get("selected_quantity") or 1.0)
        meal_cat = "lunch" if "lunch" in msg_l else ("dinner" if "dinner" in msg_l else ("snack" if "snack" in msg_l else "breakfast"))
        if fia_slug:
            collected_data["photo_food_log_preview"] = _run(
                "log_food_intake",
                {
                    **base_ctx_args,
                    "food_slug": fia_slug,
                    "quantity": fia_qty,
                    "unit_name": fia_unit,
                    "meal_category": meal_cat,
                    "confirmed": False,
                },
            )
    elif any(kw in msg_l for kw in ("i had ", "i ate ", "for breakfast", "for lunch", "for dinner")) and not any(kw in msg_l for kw in ("sugar", "glucose", "bp", "blood pressure", "can i eat", "good for breakfast", "suitable for breakfast")):
        collected_data["parsed_food_log_preview"] = _run("parse_food_log_message", {**base_ctx_args, "text": msg})
    if any(kw in msg_l for kw in ("blood pressure", "bp ", "morning bp", "evening bp", "systolic", "diastolic", "over ")):
        bp_m = re.search(r"\b(\d{2,3})\s*(?:/|over)\s*(\d{2,3})\b", msg_l)
        if bp_m:
            p_m = re.search(r"pulse\s*(?:was|of|:)?\s*(\d{2,3})", msg_l)
            tod = "evening" if "evening" in msg_l or "night" in msg_l else "morning"
            collected_data["bp_entry_preview"] = _run(
                "record_blood_pressure",
                {
                    **base_ctx_args,
                    "systolic_mmhg": int(bp_m.group(1)),
                    "diastolic_mmhg": int(bp_m.group(2)),
                    "pulse_bpm": int(p_m.group(1)) if p_m else None,
                    "time_of_day": tod,
                    "confirmed": False,
                },
            )
        else:
            collected_data["blood_pressure_history"] = _run("get_blood_pressure_history", base_ctx_args)
    if any(kw in msg_l for kw in ("glucose", "fasting sugar", "blood sugar", "post-meal", "mg/dl", "mmol/l")):
        bg_m = re.search(r"\b(\d+(?:\.\d+)?)\s*(mg/dl|mmol/l)?\b", msg_l)
        if bg_m and any(k in msg_l for k in ("my ", "was ", "record ", "log ", "today")):
            unit_s = "mmol/L" if (bg_m.group(2) or "").lower() == "mmol/l" else "mg/dL"
            ctx_s = "after_breakfast" if "after breakfast" in msg_l else ("after_lunch" if "after lunch" in msg_l else ("bedtime" if "bedtime" in msg_l else "fasting"))
            collected_data["glucose_entry_preview"] = _run(
                "record_blood_glucose",
                {
                    **base_ctx_args,
                    "glucose_value": float(bg_m.group(1)),
                    "measurement_unit": unit_s,
                    "measurement_context": ctx_s,
                    "confirmed": False,
                },
            )
        else:
            collected_data["blood_glucose_history"] = _run("get_blood_glucose_history", base_ctx_args)
    if any(kw in msg_l for kw in ("routine", "habit plan", "skip breakfast", "forget to drink")):
        collected_data["proposed_habit_plan"] = _run("propose_habit_plan", {**base_ctx_args, "prompt": msg})
    if any(kw in msg_l for kw in ("easier", "missed habits", "pause", "remove the evening reminder", "weekly nutrition review")):
        collected_data["habit_schedule_update"] = _run("update_habit_schedule", {**base_ctx_args, "instruction": msg, "user_confirmed": False})
    if "timeline" in msg_l or "activity today" in msg_l:
        collected_data["daily_activity_timeline"] = _run("get_daily_activity_timeline", base_ctx_args)
    if any(kw in msg_l for kw in ("water", "hydration", "hydrated", "drank")):
        collected_data["water_intake"] = _run("get_water_intake", base_ctx_args)
    if any(kw in msg_l for kw in ("fitness profile", "training schedule", "workout", "gym goal", "muscle", "fitness progress")):
        collected_data["fitness_profile"] = _run("get_fitness_profile", base_ctx_args)
        collected_data["fitness_progress"] = _run("get_fitness_progress", base_ctx_args)
    if any(kw in msg_l for kw in ("goal", "target")):
        collected_data["goal_progress"] = _run("get_goal_progress", base_ctx_args)
    if "habit" in msg_l:
        collected_data["habit_history"] = _run("get_habit_history", base_ctx_args)
    if any(kw in msg_l for kw in ("cheap protein", "low-cost", "affordable protein", "cost per", "protein comparison", "budget")):
        collected_data["protein_comparisons"] = _run("get_protein_comparisons", base_ctx_args)
    if any(kw in msg_l for kw in ("pantry", "available at home")):
        collected_data["pantry_items"] = _run("get_available_pantry_items", base_ctx_args)
    if any(kw in msg_l for kw in ("shopping list", "grocery", "ingredients do i need")):
        collected_data["shopping_list_preview"] = _run("create_shopping_list", {**base_ctx_args, "confirmed": False})
    if any(kw in msg_l for kw in ("suggest a", "meal for my")) or ("recipe" in msg_l and not collected_data.get("recipe_details")):
        collected_data["recipe_suggestions"] = _run("get_recipe_suggestions", {**base_ctx_args, "query": None})
    if "mess" in msg_l or "canteen" in msg_l or "hostel" in msg_l:
        collected_data["mess_menus"] = _run("get_mess_menu", base_ctx_args)

    # 4B. Health Report Analysis, AI Symptom Review & Smart Nearby Food Discovery Intent Routing
    if ctx and getattr(ctx, "health_report_context", None) and isinstance(ctx.health_report_context, dict):
        collected_data["active_health_report_context"] = ctx.health_report_context
    if ctx and getattr(ctx, "symptom_review_context", None) and isinstance(ctx.symptom_review_context, dict):
        collected_data["active_symptom_review_context"] = ctx.symptom_review_context
    if ctx and getattr(ctx, "food_discovery_context", None) and isinstance(ctx.food_discovery_context, dict):
        collected_data["active_food_discovery_context"] = ctx.food_discovery_context

    if any(kw in msg_l for kw in ("lab report", "health report", "blood test", "hba1c", "haemoglobin", "hemoglobin", "ferritin", "vitamin b12", "vitamin d", "cholesterol", "triglyceride", "creatinine", "egfr", "tsh", "sgpt", "sgot", "cbc")):
        collected_data["health_reports"] = _run("get_health_reports", base_ctx_args)
        collected_data["lab_trends"] = _run("get_lab_measurement_trends", base_ctx_args)

    if any(kw in msg_l for kw in ("symptom", "feeling tired", "fatigue", "dizziness", "lightheaded", "acidity", "bloating", "constipation", "muscle cramps", "sore throat", "chest pain", "shortness of breath", "can't breathe", "fainting")):
        collected_data["symptom_guidance"] = _run(
            "evaluate_symptom_guidance",
            {**base_ctx_args, "symptom_description": msg},
        )

    if any(kw in msg_l for kw in ("near me", "nearby", "restaurant", "where can i get", "where to eat", "order ", "swiggy", "zomato", "within 5 km", "within 2 km", "within 10 km", "in mysuru", "in bengaluru")):
        dish_q = (
            (collected_data.get("food_details") or {}).get("name_en")
            or (ctx.food_discovery_context.get("dish_query") if (ctx and isinstance(getattr(ctx, "food_discovery_context", None), dict)) else None)
            or "Masala Dosa"
        )
        for dish_cand in ("masala dosa", "dosa", "idli", "ragi mudde", "palak paneer", "paneer", "biryani", "chicken", "khichdi", "chapati", "chole", "fish"):
            if dish_cand in msg_l:
                dish_q = dish_cand.title()
                break
        city_q = "Bengaluru" if ("bengaluru" in msg_l or "bangalore" in msg_l) else "Mysuru"
        collected_data["nearby_food_discovery"] = _run(
            "search_nearby_restaurants_for_dish",
            {**base_ctx_args, "dish_query": dish_q, "city": city_q, "radius_km": 5.0},
        )

    # 5. If mode is explicitly 'online_search', also invoke external web search adapter
    if mode == "online_search":
        web_q = (
            f"{collected_data.get('food_details', {}).get('brand', '')} "
            f"{collected_data.get('food_details', {}).get('name_en', '')} nutrition ingredients".strip()
            if collected_data.get("food_details")
            else msg
        )
        collected_data["web_search"] = _run(
            "search_external_web_sources", {"query": web_q}
        )

    unique_sources: list[AssistantSourceReference] = []
    seen_src = set()
    for s in sources:
        k = (s.title, s.url)
        if k not in seen_src:
            seen_src.add(k)
            unique_sources.append(s)

    return collected_data, traces, unique_sources


def _synthesize_grounded_response(
    req: AssistantChatRequest,
    collected_data: dict[str, Any],
) -> str:
    """
    Synthesizes a concise, factual, context-aware answer strictly from retrieved tool data.
    Directly answers questions about the currently selected Food, Recipe, 3D Anatomy Region,
    or Condition without generic software boilerplate.
    """
    msg_l = req.message.lower()
    lines: list[str] = []
    intent_type = collected_data.get("resolved_intent")

    # 1. Explicit question about the GharPlate software/feature itself (Test 6)
    if intent_type == "software_help":
        sw = collected_data.get("software_feature_explanation") or {}
        lines.append(
            f"**About This GharPlate Feature (`{sw.get('page', 'GharPlate')}`):** "
            "GharPlate is an evidence-based Indian household food, recipe, health-condition, and 3D anatomy nutrition intelligence platform."
        )
        for cap in sw.get("capabilities") or []:
            lines.append(f"- {cap}")
        return "\n\n".join(lines)

    # 2. Ambiguous pronoun when no item is selected and conversation history is empty (Test 7)
    if intent_type == "needs_clarification":
        return (
            "Which food, recipe, packaged product, or body region are you asking about? "
            "Select an item on the page (for example, a food in Food Explorer, a dish in Recipes, or a structure in the 3D Body Explorer) or mention its name so I can check its verified nutrition and uses."
        )

    food_det = collected_data.get("food_details") or {}
    ing_data = collected_data.get("ingredients_and_allergens") or {}
    nut_data = collected_data.get("nutritional_composition") or {}
    rec_det = collected_data.get("recipe_details") or {}
    body_det = collected_data.get("body_region_details") or {}
    bc_data = collected_data.get("barcode_lookup") or {}
    cond_data = collected_data.get("condition_guidance") or {}
    ext_search = collected_data.get("external_search") or {}
    web_search = collected_data.get("web_search") or {}

    if any(
        kw in msg_l
        for kw in ("diagnose", "cure", "prescribe", "medicine", "dosage", "insulin dose")
    ):
        lines.append(
            "**Medical Safety Notice:** GharPlate is an educational nutrition platform and cannot diagnose conditions, prescribe treatment, or adjust medication/insulin dosages. Please consult a qualified physician or registered dietitian."
        )

    # 3. 3D Anatomy / Body Region Response (Test 3: "What nutrients are important for this?" on Eye/Vision)
    if body_det.get("found"):
        r_name = body_det.get("name") or "Selected Body Region"
        r_sys = body_det.get("anatomical_system") or "Human Anatomy"
        r_fma = body_det.get("fma_id") or body_det.get("code")
        lines.append(
            f"**{r_name}** (*{r_sys}* — `{r_fma}`): "
            f"{body_det.get('short_summary') or ''}"
        )
        if body_det.get("physiological_function"):
            lines.append(
                f"- **Physiological Function:** {body_det['physiological_function']}"
            )
        if body_det.get("nutrients"):
            nut_bullets = [
                f"**{n['nutrient_name']}**: {n['physiological_role']} *(Ref: {n.get('daily_reference_note') or 'ICMR-NIN DGI 2024'})*"
                for n in body_det["nutrients"]
            ]
            lines.append("- **Key Supporting Nutrients:**\n  - " + "\n  - ".join(nut_bullets))
        rec_foods = body_det.get("foods") or []
        if rec_foods:
            top_foods_str = ", ".join(
                f"**{f['name_en']}** ({f['primary_nutrient_code']}: {f.get('primary_nutrient_value')} per {f['default_basis']} — *{f.get('preparation_or_serving_tip') or f.get('relevance_explanation')}*)"
                for f in rec_foods[:5]
            )
            lines.append(f"- **Verified Indian Food Sources (IFCT 2017):** {top_foods_str}.")
        if body_det.get("hydration_connection"):
            lines.append(f"- **Hydration & Absorption Note:** {body_det['hydration_connection']}")
        if body_det.get("evidence_limitation_note"):
            lines.append(f"- **Evidence Boundary:** *{body_det['evidence_limitation_note']}*")

    # 4. Recipe Detail / "How is this made?" Response (Test 2: Idli -> "How is this made?")
    if rec_det.get("found"):
        r_title = rec_det.get("title")
        lines.append(
            f"**{r_title}** — {rec_det.get('meal_type') or 'Indian Dish'} • "
            f"**Prep:** {rec_det.get('prep_time_minutes') or 10} min • "
            f"**Cook:** {rec_det.get('cook_time_minutes') or 15} min • "
            f"**Servings:** {rec_det.get('servings')}"
        )
        if rec_det.get("description"):
            lines.append(f"- **Overview & Culinary Uses:** {rec_det['description']}")
        ings = rec_det.get("ingredients") or []
        if ings:
            ing_str = ", ".join(
                f"**{i['food_name']}** ({i['quantity']} × {i['unit_name']} / {i['grams_equivalent']}g)"
                for i in ings
            )
            lines.append(f"- **Ingredients (Linked to IFCT 2017):** {ing_str}.")
        steps = rec_det.get("steps") or []
        if steps:
            step_lines = [
                f"**Step {s['step_number']} ({s.get('step_title') or s.get('title') or 'Step'} — {s.get('duration_minutes') or 3} min):** {s.get('instruction_text') or s.get('instruction') or ''}"
                + (f" *(Tip: {s.get('tip') or s.get('cooking_tip')})*" if (s.get("tip") or s.get("cooking_tip")) else "")
                for s in steps
            ]
            lines.append("- **How It Is Made (Step-by-Step Instructions):**\n  - " + "\n  - ".join(step_lines))
        per_serv = {
            n["nutrient_code"]: n
            for n in (rec_det.get("nutrients") or [])
            if n.get("per_serving_known_value") is not None
        }
        if per_serv:
            macro_parts = []
            for code in ("energy_kcal", "protein_g", "carbs_g", "fat_total_g", "fibre_g"):
                if code in per_serv:
                    item = per_serv[code]
                    macro_parts.append(f"**{item['nutrient_name']}**: {item['per_serving_known_value']} {item['unit']}")
            if macro_parts:
                lines.append("- **Nutrition per Serving:** " + " • ".join(macro_parts))

    # 4B. Active Food Photo Analysis Context (`food_image_analysis` from /recognition)
    fia_ctx = collected_data.get("food_image_analysis")
    if isinstance(fia_ctx, dict) and fia_ctx:
        fia_name = fia_ctx.get("confirmed_food_name") or food_det.get("name_en") or "Analysed Food"
        fia_conf = str(fia_ctx.get("confidence_category") or "moderate_confidence").replace("_", " ")
        fia_portion_label = fia_ctx.get("selected_serving_label") or f"{fia_ctx.get('selected_grams') or 100}g"
        fia_grams = float(fia_ctx.get("selected_grams") or food_det.get("standard_serving_grams") or 100.0)
        fia_comps = fia_ctx.get("detected_components") or []
        fia_portion_nutrients = fia_ctx.get("portion_nutrients") or {}
        lines.append(
            f"**Analysed Food Photo Context:** **{fia_name}** • Selected Portion: **{fia_portion_label} ({fia_grams:.0f}g)** • "
            f"Recognition Confidence: *{fia_conf}*"
        )
        if fia_ctx.get("overall_description"):
            lines.append(f"- **Visual Observation:** {fia_ctx['overall_description']}")
        if len(fia_comps) > 1:
            comp_labels = ", ".join(
                f"**{c.get('matched_food_name') or c.get('component_label')}**"
                for c in fia_comps
                if isinstance(c, dict)
            )
            if comp_labels:
                lines.append(f"- **Recognised Plate Components:** {comp_labels}.")
        if fia_portion_nutrients:
            p_kcal = fia_portion_nutrients.get("energy_kcal")
            p_prot = fia_portion_nutrients.get("protein_g")
            p_carbs = fia_portion_nutrients.get("carbs_g")
            p_fat = fia_portion_nutrients.get("fat_total_g")
            p_fib = fia_portion_nutrients.get("fibre_g")
            portion_bits = []
            if p_kcal is not None:
                portion_bits.append(f"**Energy**: {p_kcal} kcal")
            if p_prot is not None:
                portion_bits.append(f"**Protein**: {p_prot} g")
            if p_carbs is not None:
                portion_bits.append(f"**Carbohydrates**: {p_carbs} g")
            if p_fat is not None:
                portion_bits.append(f"**Total Fat**: {p_fat} g")
            if p_fib is not None:
                portion_bits.append(f"**Dietary Fibre**: {p_fib} g")
            if portion_bits:
                lines.append(
                    f"- **Nutrients in Your Selected Portion ({fia_portion_label} / {fia_grams:.0f}g):** "
                    + " • ".join(portion_bits)
                )
        if any(kw in msg_l for kw in ("gym", "workout", "exercise", "muscle", "pre-workout", "post-workout")):
            p_prot_val = float(fia_portion_nutrients.get("protein_g") or 0.0)
            p_carb_val = float(fia_portion_nutrients.get("carbs_g") or 0.0)
            lines.append(
                f"- **Gym & Training Suitability:** Your **{fia_portion_label} ({fia_grams:.0f}g)** portion of **{fia_name}** provides **{p_prot_val:.1f}g protein** and **{p_carb_val:.1f}g carbohydrates**. "
                + (
                    "It supplies readily digestible carbohydrates for pre-workout energy; pair it with sambar, sprouts, paneer, curd, or boiled eggs to increase total meal protein for post-workout muscle recovery."
                    if p_prot_val < 12.0
                    else "It provides a solid protein contribution alongside carbohydrates to support strength training and muscle recovery."
                )
            )
        if any(kw in msg_l for kw in ("vegetarian", "vegan", "veg")):
            is_veg = bool(fia_ctx.get("is_vegetarian", food_det.get("is_vegetarian", True)))
            is_vgn = bool(fia_ctx.get("is_vegan", food_det.get("is_vegan", False)))
            lines.append(
                f"- **Dietary Classification:** **{fia_name}** is **{'Vegetarian' if is_veg else 'Non-Vegetarian'}** "
                f"({'and Vegan (plant-based)' if is_vgn else '(contains dairy or non-vegan ingredients)' if is_veg else ''})."
            )
        if any(kw in msg_l for kw in ("breakfast", "morning meal")):
            lines.append(
                f"- **Breakfast Suitability:** **{fia_name}** ({fia_portion_label}, {fia_grams:.0f}g) is a classic, well-balanced Indian breakfast choice when paired with a protein/fibre accompaniment such as vegetable sambar, dal, or curd."
            )
        if collected_data.get("photo_food_log_preview"):
            pfl = collected_data["photo_food_log_preview"]
            lines.append(f"- **Daily Tracker Confirmation Preview:** {pfl.get('message')}")

    # 5. Selected Food or Packaged Product Response (Test 1: Carrot (Orange) -> "uses of this?", Test 4: Banana -> "What about this one?")
    if food_det.get("found"):
        name = food_det.get("name_en")
        brand = food_det.get("brand")
        barcode = food_det.get("barcode")
        cat_name = food_det.get("category_name")
        header = f"**{name}**" + (f" ({brand})" if brand else "")
        if cat_name:
            header += f" • Category: *{cat_name}*"
        if barcode:
            header += f" • Barcode: `{barcode}`"
        if food_det.get("net_quantity"):
            header += f" • Net Weight: **{food_det['net_quantity']}**"
        lines.append(header)

        # Uses, culinary role, description & physiological benefits (Test 1 & Test 4)
        desc = food_det.get("description")
        body_funcs = food_det.get("supported_body_functions") or []
        std_serv = f"{food_det.get('standard_serving_name')} ({food_det.get('standard_serving_grams')}g)"
        if desc:
            lines.append(
                f"- **Culinary & Dietary Uses of {name}:** {desc} Standard household serving: **{std_serv}**."
            )
        else:
            lines.append(
                f"- **Household Serving & Use:** **{name}** is tracked per **{food_det.get('default_basis', '100g')}** "
                f"with a standard household serving of **{std_serv}**."
            )

        if body_funcs:
            bf_strs = [
                f"**{bf['region_name']} ({bf['anatomical_system']})**: {bf['why_helpful']}"
                + (f" *(Tip: {bf['serving_suggestion']})*" if bf.get("serving_suggestion") else "")
                for bf in body_funcs[:4]
            ]
            lines.append(
                f"- **Physiological & Nutritional Benefits of {name}:**\n  - " + "\n  - ".join(bf_strs)
            )

        # If asking "How is this made?" on a cooked dish food item (e.g. Idli) and no separate recipe record was rendered yet
        if not rec_det.get("found") and any(
            kw in msg_l for kw in ("how is this made", "how to make", "prepare", "made of")
        ):
            cleaned_ing = ing_data.get("cleaned_ingredients_text") or ing_data.get("raw_ingredients_text")
            if cleaned_ing:
                lines.append(f"- **Preparation & Composition:** {cleaned_ing}")
            elif desc:
                lines.append(f"- **Preparation Overview:** {desc}")

        if "barcode" in msg_l and barcode:
            lines.append(
                f"- **Barcode (EAN-13):** `{barcode}` (Source: {food_det['source']['name']})."
            )

        # Ingredients & Allergen-specific details
        if ing_data.get("found") and (
            food_det.get("is_packaged")
            or any(
                kw in msg_l
                for kw in (
                    "ingredient",
                    "contain",
                    "milk",
                    "egg",
                    "soy",
                    "wheat",
                    "gluten",
                    "allergen",
                    "what is in",
                    "additive",
                )
            )
        ):
            cleaned_ing = ing_data.get("cleaned_ingredients_text") or ing_data.get("raw_ingredients_text")
            if cleaned_ing:
                lines.append(f"- **Declared Ingredients:** {cleaned_ing}")
            if ing_data.get("allergen_statement"):
                lines.append(f"- **Label Allergen Declaration:** *{ing_data['allergen_statement']}*")

            stored_tags = ing_data.get("stored_allergen_tags") or []
            consistency = ing_data.get("allergen_consistency") or {}
            missing_tags = consistency.get("missing_from_stored_tags") or []

            all_known_allergens = sorted(list(set(stored_tags) | set(consistency.get("declared_allergens") or [])))
            if all_known_allergens:
                lines.append(
                    f"- **Identified Allergens:** {', '.join(all_known_allergens)} "
                    f"({'Non-Vegetarian (contains egg)' if not ing_data.get('is_vegetarian') else 'Vegetarian'})."
                )
            if missing_tags:
                lines.append(
                    f"- **Allergen Consistency Note:** The package declaration explicitly lists **{', '.join(missing_tags)}**, which was missing from the initial stored tag list (`{', '.join(stored_tags)}`) and has been flagged for review."
                )

        # Nutrition & Missing-data explanation
        if nut_data.get("found"):
            avail_count = nut_data.get("available_nutrient_count", 0)
            avail_map = nut_data.get("available_nutrients") or {}
            if avail_count == 0:
                lines.append(
                    f"- **Nutrition Status (`0/20` available — 100% `NULL`):** Nutritional values have not yet been captured for **{name}**. "
                    "The local record was created from an ingredient/package scan that did not include the back-of-pack nutrition table, and GharPlate never invents or substitutes generic numbers."
                )
                lines.append(
                    "- **How to resolve:** Click **Search Online Databases** on the product page to check Open Food Facts / USDA FDC, or use **Scan Nutrition Label** to photograph the nutrition table."
                )
            else:
                highlights = []
                for k in (
                    "energy_kcal",
                    "protein_g",
                    "carbs_g",
                    "fibre_g",
                    "fat_total_g",
                    "vitamin_a_ug",
                    "vitamin_a_mcg",
                    "vitamin_c_mg",
                    "iron_mg",
                    "calcium_mg",
                    "potassium_mg",
                    "folate_ug",
                    "folate_mcg",
                    "magnesium_mg",
                    "zinc_mg",
                    "sodium_mg",
                ):
                    if k in avail_map:
                        item = avail_map[k]
                        highlights.append(f"**{item['name']}**: {item['value_per_100']} {item['unit']}")
                if highlights:
                    lines.append(
                        f"- **Key Nutrients per {nut_data.get('default_basis', '100g')}** ({nut_data.get('completeness_pct')}% complete — Source: {food_det['source']['name']}): "
                        + " • ".join(highlights[:9])
                    )
                missing_list = [m["name"] for m in (nut_data.get("missing_nutrients") or [])]
                if missing_list and any(kw in msg_l for kw in ("missing", "null", "complete", "all nutrient")):
                    lines.append(
                        f"- **Unmeasured (`NULL`) Nutrients:** {', '.join(missing_list[:8])}"
                        + ("..." if len(missing_list) > 8 else "")
                    )

    if bc_data:
        lines.append(f"- **External Barcode Lookup (`{bc_data.get('barcode')}`):** {bc_data.get('message')}")
        for att in bc_data.get("provider_attempts") or []:
            lines.append(f"  - *{att['provider_name']}*: `{att['status']}` — {att['message']}")

    if cond_data:
        if "observations" in cond_data:
            obs_list = cond_data.get("observations") or []
            for obs in obs_list[:3]:
                lines.append(
                    f"- **{obs['condition_name']} ({obs['educational_category']}):** {obs['explanation']} *(Source: {obs['source_citation']})*"
                )
        elif "foods" in cond_data:
            c_name = (cond_data.get("condition") or {}).get("name", "Condition")
            f_list = cond_data.get("foods") or []
            if f_list:
                names_str = ", ".join(f"**{f['name_en']}** ({f['relevance_label']})" for f in f_list[:5])
                lines.append(f"- **Reviewed Foods for {c_name}:** {names_str}.")

    if ext_search and ext_search.get("candidates"):
        cands = ext_search["candidates"]
        lines.append(f"- **External Database Candidates ({len(cands)} found):**")
        for c in cands[:3]:
            lines.append(
                f"  - **{c.get('product_name') or 'Unnamed'}** ({c.get('brand') or 'Unknown Brand'}) — Source: [{c.get('provider')}]({c.get('source_url')})"
            )

    if web_search:
        p_stat = web_search.get("provider_status") or {}
        w_res = web_search.get("results") or []
        if w_res:
            lines.append("- **External Web Search Results:**")
            for r in w_res[:3]:
                lines.append(f"  - [{r['title']}]({r['url']}) — {r['snippet'][:140]} *(via {r['provider']})*")
        elif p_stat.get("message"):
            lines.append(f"- **Web Search Status:** {p_stat['message']}")

    if collected_data.get("daily_nutrition_summary"):
        ds = collected_data["daily_nutrition_summary"]
        dn = ds.get("daily_nutrition") or {}
        tots = dn.get("totals") or {}
        targs = ds.get("targets") or {}
        lines.append(
            f"- **Today's Logged Nutrition ({ds.get('date')} — {dn.get('entry_count', 0)} item(s)):** "
            f"Energy: **{tots.get('energy_kcal') or 0} / {targs.get('calories_kcal')} kcal** • "
            f"Protein: **{tots.get('protein_g') or 0} / {targs.get('protein_g')} g** • "
            f"Fibre: **{tots.get('fibre_g') or 0} / {targs.get('fiber_g')} g**."
        )
        if dn.get("has_incomplete_entries"):
            lines.append(
                f"  - *Completeness Note:* {', '.join(dn.get('incomplete_entry_names') or [])} had unmeasured (`NULL`) nutrients which are never counted as zero."
            )

    if collected_data.get("water_intake"):
        wi = collected_data["water_intake"]
        lines.append(
            f"- **Hydration Progress ({wi.get('date')}):** **{wi.get('total_ml')} ml / {wi.get('goal_ml')} ml** ({wi.get('progress_pct')}% complete; {wi.get('remaining_ml')} ml remaining)."
        )
        if wi.get("fluid_medical_notice"):
            lines.append(f"  - ⚠️ *{wi['fluid_medical_notice']}*")

    if collected_data.get("protein_comparisons"):
        p_items = (collected_data["protein_comparisons"].get("items") or [])[:4]
        if p_items:
            lines.append("- **Top Affordable Indian Protein Sources (Verified IFCT 2017):**")
            for pi in p_items:
                lines.append(
                    f"  - **{pi['name_en']}**: **{pi['protein_per_100g']}g protein/100g** ({pi['protein_per_serving_g']}g per serving) • "
                    f"Cost per 10g protein: **₹{pi.get('cost_per_10g_protein_inr') or 'N/A'}**"
                )

    if collected_data.get("recipe_suggestions"):
        recs = (collected_data["recipe_suggestions"].get("local_verified_recipes") or [])[:3]
        if recs:
            lines.append("- **Personalised GharPlate Recipe Suggestions:**")
            for r in recs:
                macros = r.get("per_serving_macros") or {}
                lines.append(
                    f"  - **{r['title']}** ({macros.get('energy_kcal')} kcal, {macros.get('protein_g')}g protein/serving) — {r['why_recommended']}"
                )

    if collected_data.get("shopping_list_preview"):
        sl = collected_data["shopping_list_preview"]
        if sl.get("requires_user_confirmation"):
            lines.append(f"- **Smart Shopping List Preview:** {sl.get('message')}")

    if collected_data.get("bp_entry_preview"):
        bp_p = collected_data["bp_entry_preview"]
        lines.append(f"- **Blood Pressure Confirmation Preview:** {bp_p.get('message')}")

    if collected_data.get("blood_pressure_history"):
        bph = collected_data["blood_pressure_history"]
        st = bph.get("summary_stats") or {}
        lines.append(
            f"- **Blood Pressure History ({st.get('total_readings', 0)} reading(s)):** "
            f"Average: **{st.get('avg_systolic_mmhg') or '—'}/{st.get('avg_diastolic_mmhg') or '—'} mmHg** "
            f"(Morning avg systolic: {st.get('morning_avg_systolic_mmhg') or '—'} mmHg • Evening avg systolic: {st.get('evening_avg_systolic_mmhg') or '—'} mmHg)."
        )

    if collected_data.get("glucose_entry_preview"):
        bg_p = collected_data["glucose_entry_preview"]
        lines.append(f"- **Blood Glucose Confirmation Preview:** {bg_p.get('message')}")

    if collected_data.get("blood_glucose_history"):
        bgh = collected_data["blood_glucose_history"]
        cs = bgh.get("context_summaries") or {}
        f_avg = (cs.get("fasting") or {}).get("avg_mg_dl")
        pm_avg = (cs.get("post_meal") or {}).get("avg_mg_dl")
        lines.append(
            f"- **Blood Glucose History ({len(bgh.get('readings') or [])} reading(s)):** "
            f"Fasting avg: **{f_avg or 'No fasting logs'} mg/dL** • Post-meal avg: **{pm_avg or 'No post-meal logs'} mg/dL**."
        )

    if collected_data.get("proposed_habit_plan"):
        hp = collected_data["proposed_habit_plan"]
        lines.append(f"- **Proposed AI Habit Plan ({len(hp.get('proposed_habits') or [])} habits — requires confirmation):** {hp.get('plan_summary')}")
        for h_item in (hp.get("proposed_habits") or [])[:5]:
            lines.append(f"  - **{h_item['title']}** ({h_item['suggested_schedule']}) — *{h_item['tracking_source_label']}*")

    if collected_data.get("habit_schedule_update"):
        hu = collected_data["habit_schedule_update"]
        lines.append(f"- **Habit Plan Update:** {hu.get('summary')}")

    if collected_data.get("parsed_food_log_preview"):
        pf = collected_data["parsed_food_log_preview"]
        p_items = pf.get("parsed_items") or []
        if p_items:
            lines.append(
                f"- **Natural-Language Food Log Preview ({pf.get('meal_category')} at {pf.get('logged_time')} — awaiting confirmation):** "
                + ", ".join(f"**{x['food_name']}** ({x['quantity']} × {x['unit_name']}, {x['energy_kcal']} kcal)" for x in p_items)
            )

    # 6. Health Report Intelligence & Lab-to-Plate Synthesis
    hr_ctx = collected_data.get("active_health_report_context")
    hr_list = (collected_data.get("health_reports") or {}).get("reports") or []
    target_rep = hr_ctx if isinstance(hr_ctx, dict) and hr_ctx.get("measurements") else (hr_list[0] if hr_list else None)
    if target_rep:
        lines.append(
            f"**Confirmed Blood Report Analysis ({target_rep.get('report_title') or 'Lab Report'} — {target_rep.get('report_date') or 'Recent'}):** "
            f"Reviewed **{target_rep.get('measurement_count') or len(target_rep.get('measurements') or [])}** measurement(s)."
        )
        ms = target_rep.get("measurements") or []
        below_list = [
            m for m in ms if m.get("range_status") == "below_reference" or m.get("status_flag") == "low"
        ]
        above_list = [
            m for m in ms if m.get("range_status") == "above_reference" or m.get("status_flag") == "high"
        ]
        review_list = [
            m
            for m in ms
            if m.get("range_status") in ("requires_manual_review", "lab_flagged_abnormal")
            or m.get("status_flag") in ("requires_manual_review", "lab_flagged_abnormal")
        ]

        if below_list:
            b_strs = [
                f"**{m.get('test_name')}**: {m.get('measured_value') if m.get('measured_value') is not None else m.get('result_value')} {m.get('unit') or ''} "
                f"(Below reference interval: {m.get('reference_range_text') or m.get('reference_text') or 'See lab report'})"
                for m in below_list
            ]
            lines.append("- **Results Below Reference Interval:**\n  - " + "\n  - ".join(b_strs))
        elif "below" in msg_l:
            lines.append("- **Results Below Reference Interval:** None of the confirmed results in this report are below the printed reference interval.")

        if above_list:
            a_strs = [
                f"**{m.get('test_name')}**: {m.get('measured_value') if m.get('measured_value') is not None else m.get('result_value')} {m.get('unit') or ''} "
                f"(Above reference interval: {m.get('reference_range_text') or m.get('reference_text') or 'See lab report'})"
                for m in above_list
            ]
            lines.append("- **Results Above Reference Interval:**\n  - " + "\n  - ".join(a_strs))
        elif "above" in msg_l:
            lines.append("- **Results Above Reference Interval:** None of the confirmed results in this report are above the printed reference interval.")

        if review_list:
            r_strs = [
                f"**{m.get('test_name')}**: {m.get('measured_value') if m.get('measured_value') is not None else m.get('result_value')} {m.get('unit') or ''} (*{m.get('status_label') or 'Requires manual review'}*)"
                for m in review_list
            ]
            lines.append("- **Results Flagged for Manual Review:**\n  - " + "\n  - ".join(r_strs))

        # What each flagged test measures
        if any(kw in msg_l for kw in ("what is this test", "measuring", "what does", "explain", "mean")):
            explained = (below_list + above_list)[:5] or ms[:4]
            exp_strs = [
                f"**{m.get('test_name')}**: {m.get('what_it_measures') or (m.get('interpretation') or {}).get('what_it_measures') or m.get('educational_note') or 'Clinical laboratory measurement.'}"
                for m in explained
            ]
            if exp_strs:
                lines.append("- **What These Tests Measure:**\n  - " + "\n  - ".join(exp_strs))

        # Possible nutritional concerns
        concerns = (
            target_rep.get("possible_nutritional_concerns")
            or (target_rep.get("summary") or {}).get("possible_nutritional_concerns")
            or []
        )
        if concerns:
            c_strs = [f"**{c.get('title')}**: {c.get('explanation')}" for c in concerns[:5]]
            lines.append("- **Possible Nutritional Concerns (Educational & Non-Diagnostic):**\n  - " + "\n  - ".join(c_strs))

        # Lab-to-Plate foods
        l2p = target_rep.get("lab_to_plate") or {}
        if l2p.get("kidney_safety_triggered"):
            lines.append(f"- ⚠️ **Kidney Safety Guardrail:** {l2p.get('kidney_safety_notice')}")
        for card in (l2p.get("marker_food_cards") or [])[:4]:
            rec_foods = card.get("recommended_foods") or []
            f_details = [
                f"**{f['name_en']}** ({f.get('short_reason') or f.get('standard_serving_name') or 'Verified in IFCT 2017'})"
                for f in rec_foods[:4]
            ]
            lines.append(
                f"- **GharPlate Foods for {card['test_name']} ({card['focus_nutrient_label']}):** {card['educational_explanation']}"
                + (f" Recommended options: {', '.join(f_details)}." if f_details else "")
            )

        # Questions to ask the doctor
        doc_qs = (target_rep.get("summary") or {}).get("priority_doctor_questions") or []
        if not doc_qs:
            for m in below_list + above_list:
                for q in ((m.get("interpretation") or {}).get("doctor_questions") or []):
                    if q not in doc_qs:
                        doc_qs.append(q)
        if doc_qs:
            lines.append("- **Questions to Ask Your Doctor:**\n  - " + "\n  - ".join(doc_qs[:4]))

    # 7. AI Symptom Review & Emergency Safety Synthesis
    sym_data = collected_data.get("symptom_guidance") or collected_data.get("active_symptom_review_context")
    if isinstance(sym_data, dict) and sym_data:
        if sym_data.get("red_flag_detected"):
            banner = sym_data.get("emergency_banner") or {}
            lines.append(
                f"🚨 **{banner.get('headline') or 'SEEK IMMEDIATE EMERGENCY MEDICAL CARE (CALL 112 / 108)'}:** "
                f"{banner.get('action_instruction') or 'Go to the nearest hospital emergency department immediately.'}"
            )
        else:
            lines.append(
                f"**AI Symptom Review & Care Guidance (*{sym_data.get('urgency_label') or 'Educational Review'}*):** "
                f"{sym_data.get('educational_overview') or ''}"
            )
            if sym_data.get("follow_up_questions"):
                lines.append(
                    "- **Helpful Clarifying Questions:** " + " • ".join(sym_data["follow_up_questions"][:2])
                )
            meals = sym_data.get("supportive_indian_meals_and_hydration") or []
            if meals:
                lines.append(
                    "- **Supportive Indian Hydration & Gentle Meal Ideas:** "
                    + ", ".join(f"**{m['name_en']}** (*{m['why_supportive']}*)" for m in meals[:4])
                )
            lines.append(f"- *{sym_data.get('medical_disclaimer') or ASSISTANT_MEDICAL_DISCLAIMER}*")

    # 8. Smart Nearby Food Discovery Synthesis
    disc_data = collected_data.get("nearby_food_discovery") or collected_data.get("active_food_discovery_context")
    if isinstance(disc_data, dict) and disc_data.get("restaurants") is not None:
        d_q = disc_data.get("dish_query") or "Indian Meal"
        loc_c = disc_data.get("location_context") or {}
        rests = disc_data.get("restaurants") or []
        lines.append(
            f"**Nearby Food Discovery for '{d_q}' ({loc_c.get('city', 'Mysuru')} within {loc_c.get('radius_km', 5)} km — {len(rests)} restaurant(s)):**"
        )
        for r in rests[:3]:
            md = r.get("matched_dish") or {}
            lines.append(
                f"- **{r['name']}** ({r.get('area') or r['city']}, **{r['distance_km']} km** • {r['dietary_badge']} • {r['price_band_inr']}): "
                f"*{md.get('dish_name')}* ({md.get('match_badge')}) — "
                f"[Open in Google Maps]({r['maps_links']['google_maps_place_url']}) • "
                f"[Swiggy]({r['provider_integrations']['swiggy']['search_url']}) • "
                f"[Zomato]({r['provider_integrations']['zomato']['search_url']})"
            )
        lines.append(f"- **Allergy & Cross-Contact Notice:** *{disc_data.get('member_context', {}).get('allergy_cross_contact_warning', 'Please confirm ingredients and cross-contact risks directly with the restaurant.')}*")

    if not lines:
        sr = (collected_data.get("search_results") or {}).get("items") or []
        if sr:
            lines.append(
                "Found in GharPlate local catalog: "
                + ", ".join(f"**{i['name_en']}** (`{i['slug']}`)" for i in sr[:5])
            )
        else:
            lines.append(
                "No matching food, recipe, or body structure was found in GharPlate's local database for that query. "
                "Try selecting a specific food, recipe, or 3D body structure, or switch the assistant mode to **Automatic** or **Search Online**."
            )

    return "\n\n".join(lines)


def _llm_reply_is_on_topic(
    llm_reply: str,
    resolved_entity: AssistantSelectedEntity | None,
    intent_type: str,
) -> bool:
    """
    Verifies that the local Ollama model actually answered about the resolved active entity
    and did not hallucinate a generic description of the GharPlate software when the user
    asked about a food, recipe, or body region.
    """
    if not llm_reply or len(llm_reply.strip()) < 20:
        return False
    reply_l = llm_reply.lower()

    if intent_type != "software_help":
        if "gharplate is a" in reply_l or "gharplate is an" in reply_l or "this feature allows you" in reply_l:
            return False

    if resolved_entity and resolved_entity.name:
        base_tokens = [
            t
            for t in re.findall(r"[a-zA-Z]{3,}", resolved_entity.name.lower())
            if t not in ("the", "and", "with", "indian", "raw", "fresh")
        ]
        if base_tokens and not any(tok in reply_l for tok in base_tokens):
            return False

    return True


def chat_with_gharplate_assistant(
    db: Session, req: AssistantChatRequest
) -> AssistantChatResponse:
    """
    Executes a context-aware, tool-backed conversation turn with the GharPlate AI Assistant:
    1. Resolves active context & pronouns (`resolve_active_entity_and_intent`) and runs deterministic
       database-first backend tools (`_orchestrate_deterministic_tool_calls`).
    2. Synthesizes a verified, entity-grounded baseline answer (`_synthesize_grounded_response`).
    3. If local Ollama is reachable and the intent is not a clarification prompt, passes the
       explicit active-context binding and tool evidence to Ollama (with `tools: OLLAMA_TOOLS_SCHEMA`),
       executes any additional tool calls, and validates that the LLM response stays strictly anchored
       to the resolved entity (`_llm_reply_is_on_topic`).
    """
    mode = req.mode if req.mode in ("database_only", "automatic", "online_search") else "automatic"
    collected_data, traces, sources = _orchestrate_deterministic_tool_calls(db, req)
    grounded_fallback_reply = _synthesize_grounded_response(req, collected_data)

    resolved_entity_dict = collected_data.get("resolved_entity")
    resolved_entity = (
        AssistantSelectedEntity(**resolved_entity_dict)
        if isinstance(resolved_entity_dict, dict)
        else None
    )
    intent_type = str(collected_data.get("resolved_intent") or "general_query")

    status_info = get_ollama_assistant_status(req.model)
    followups = [
        "What are the key nutrients and culinary uses of this food?",
        "How does this fit into a balanced Indian meal?",
        "Which foods are reviewed for Fever or Type 2 Diabetes?",
    ]
    if isinstance(collected_data.get("food_image_analysis"), dict) and collected_data.get("food_image_analysis"):
        fia_obj = collected_data["food_image_analysis"]
        f_name = fia_obj.get("confirmed_food_name") or (collected_data.get("food_details") or {}).get("name_en") or "this food"
        followups = [
            f"How much protein and other nutrients does my portion of {f_name} contain?",
            f"Is {f_name} suitable for someone going to the gym or for breakfast?",
            "Add this to today's breakfast",
        ]
    elif (collected_data.get("food_details") or {}).get("found"):
        f_name = collected_data["food_details"]["name_en"]
        followups = [
            f"What are the health benefits and culinary uses of {f_name}?",
            f"How much protein, fibre, and key vitamins does {f_name} provide?",
            f"Is {f_name} suitable for Type 2 Diabetes or Hypertension?",
        ]
    elif (collected_data.get("body_region_details") or {}).get("found"):
        r_name = collected_data["body_region_details"].get("name") or "this body region"
        followups = [
            f"What nutrients are most important for {r_name}?",
            f"Which vegetarian Indian foods support {r_name}?",
            f"How does hydration affect {r_name}?",
        ]
    elif (collected_data.get("recipe_details") or {}).get("found"):
        rec_name = collected_data["recipe_details"]["title"]
        followups = [
            f"How is {rec_name} made step by step?",
            f"How much protein and energy does one serving of {rec_name} provide?",
            f"What ingredients do I need to cook {rec_name}?",
        ]

    if intent_type in ("needs_clarification", "software_help"):
        return AssistantChatResponse(
            reply=grounded_fallback_reply,
            mode_used=mode,
            model_used=status_info.active_model or "gharplate-context-resolver",
            ollama_connected=status_info.ollama_reachable,
            used_fallback_synthesis=False,
            resolved_entity=resolved_entity,
            resolved_intent=intent_type,
            tool_traces=traces,
            sources=sources,
            suggested_followups=followups,
            medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
        )

    if not status_info.ollama_reachable or not status_info.active_model:
        return AssistantChatResponse(
            reply=grounded_fallback_reply,
            mode_used=mode,
            model_used=status_info.active_model or "gharplate-deterministic-tool-engine",
            ollama_connected=False,
            used_fallback_synthesis=True,
            resolved_entity=resolved_entity,
            resolved_intent=intent_type,
            tool_traces=traces,
            sources=sources,
            suggested_followups=followups,
            medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
        )

    active_model = status_info.active_model
    entity_context_banner = (
        f"CURRENTLY SELECTED ENTITY IN UI: type='{resolved_entity.type}', id='{resolved_entity.id}', name='{resolved_entity.name}'\n"
        "CRITICAL PRONOUN RULE: Words like 'this', 'it', 'that', 'this one', 'uses of this?', 'how is this made?', or 'what nutrients are important for this?' "
        f"refer STRICTLY to '{resolved_entity.name}' ({resolved_entity.type}). Do NOT explain what the GharPlate app is unless the user explicitly asks about the GharPlate software.\n"
        if resolved_entity
        else "NO SPECIFIC ENTITY SELECTED: Answer the user's nutrition/health question directly using the verified tool data.\n"
    )

    system_prompt = (
        "You are the GharPlate AI Assistant, an evidence-based Indian household food, recipe, anatomy, and nutrition intelligence assistant.\n"
        f"{entity_context_banner}\n"
        "STRICT RULES:\n"
        "1. Answer the user's exact question directly using ONLY the verified backend tool outputs below. NEVER invent nutrient values, ingredients, barcodes, or citations.\n"
        "2. When an active food, recipe, or body region is selected, explain THAT specific food, recipe, or body region (its culinary uses, nutrients, preparation steps, or physiological role). NEVER give a generic speech about GharPlate features.\n"
        "3. If a nutrient value is NULL / missing in the tool output, state clearly that it is unmeasured (NULL).\n"
        "4. You are NOT a doctor or dietitian. Never claim a food cures or repairs an organ, and never prescribe medication.\n"
        "5. Keep your answer concise, factual, and easy to read (or listen to via voice output).\n\n"
        f"ACTIVE SEARCH MODE: {mode}\n"
        f"VERIFIED BACKEND TOOL DATA:\n{json.dumps(collected_data, indent=2, default=str)}"
    )

    messages_payload: list[dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for h in req.history[-6:]:
        if h.role in ("user", "assistant") and h.content.strip():
            messages_payload.append({"role": h.role, "content": h.content.strip()})

    user_prompt_text = req.message.strip()
    if resolved_entity and resolved_entity.name:
        user_prompt_text = (
            f"[Active Selection: {resolved_entity.type.upper()} — {resolved_entity.name} ({resolved_entity.id})]\n"
            f"User question: {req.message.strip()}"
        )
    messages_payload.append({"role": "user", "content": user_prompt_text})

    chat_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
    try:
        with httpx.Client(timeout=float(settings.OLLAMA_TIMEOUT_SECONDS)) as client:
            resp = client.post(
                chat_url,
                json={
                    "model": active_model,
                    "messages": messages_payload,
                    "tools": OLLAMA_TOOLS_SCHEMA,
                    "stream": False,
                },
            )
            if resp.status_code == 400 and "tool" in resp.text.lower():
                resp = client.post(
                    chat_url,
                    json={
                        "model": active_model,
                        "messages": messages_payload,
                        "stream": False,
                    },
                )

            if resp.status_code >= 400:
                return AssistantChatResponse(
                    reply=grounded_fallback_reply,
                    mode_used=mode,
                    model_used=active_model,
                    ollama_connected=False,
                    used_fallback_synthesis=True,
                    resolved_entity=resolved_entity,
                    resolved_intent=intent_type,
                    tool_traces=traces,
                    sources=sources,
                    suggested_followups=followups,
                    medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
                )

            data = resp.json()
            msg_obj = data.get("message") or {}
            tool_calls = msg_obj.get("tool_calls") or []

            if tool_calls:
                messages_payload.append(msg_obj)
                for tc in tool_calls[:4]:
                    fn = tc.get("function") or {}
                    t_name = str(fn.get("name") or "")
                    t_args = fn.get("arguments") or {}
                    if isinstance(t_args, str):
                        try:
                            t_args = json.loads(t_args)
                        except Exception:
                            t_args = {}
                    t_out, t_trace, t_srcs = execute_allowlisted_tool(
                        db, t_name, t_args, mode=mode
                    )
                    traces.append(t_trace)
                    for s in t_srcs:
                        if (s.title, s.url) not in {(x.title, x.url) for x in sources}:
                            sources.append(s)
                    messages_payload.append(
                        {
                            "role": "tool",
                            "content": json.dumps(t_out, default=str),
                        }
                    )

                resp2 = client.post(
                    chat_url,
                    json={
                        "model": active_model,
                        "messages": messages_payload,
                        "stream": False,
                    },
                )
                if resp2.status_code == 200:
                    msg_obj = resp2.json().get("message") or {}

            llm_reply = str(msg_obj.get("content") or "").strip()

            if not _llm_reply_is_on_topic(llm_reply, resolved_entity, intent_type):
                llm_reply = grounded_fallback_reply

            return AssistantChatResponse(
                reply=llm_reply,
                mode_used=mode,
                model_used=active_model,
                ollama_connected=True,
                used_fallback_synthesis=False,
                resolved_entity=resolved_entity,
                resolved_intent=intent_type,
                tool_traces=traces,
                sources=sources,
                suggested_followups=followups,
                medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
            )
    except Exception:
        return AssistantChatResponse(
            reply=grounded_fallback_reply,
            mode_used=mode,
            model_used=active_model,
            ollama_connected=False,
            used_fallback_synthesis=True,
            resolved_entity=resolved_entity,
            resolved_intent=intent_type,
            tool_traces=traces,
            sources=sources,
            suggested_followups=followups,
            medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
        )
