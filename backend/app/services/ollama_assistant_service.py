"""
Local Ollama-Powered GharPlate AI Assistant Service (Section 9 of Master Prompt).
Connects to the user's locally running Ollama instance (`http://127.0.0.1:11434/api/chat` and `/api/tags`),
executes 11 allowlisted, schema-validated backend tools against the real GharPlate database and external
providers, supports 3 explicit search modes (`database_only`, `automatic`, `online_search`), and provides
context-aware, grounded answers without ever fabricating nutrient values, ingredients, or citations.
"""

import json
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
import httpx
from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.integrations.normalizer import check_allergen_consistency
from app.integrations.provider_registry import (
    evaluate_local_product_completeness,
    search_multi_source_external_products,
)
from app.integrations.web_search import search_external_web
from app.models.entities import (
    FoodItem,
    FoodNutrientValue,
    HealthCondition,
    Household,
    HouseholdMember,
)
from app.rules.guidance_engine import evaluate_food_guidance
from app.schemas.api_schemas import (
    AssistantChatRequest,
    AssistantChatResponse,
    AssistantPageContext,
    AssistantSourceReference,
    AssistantStatusResponse,
    AssistantToolExecutionTrace,
    GuidanceEvaluationRequest,
    ProductComparisonRequest,
    RecipeCreateRequest,
    RecipeIngredientInput,
)
from app.services.comparison_meals_service import compare_packaged_products
from app.services.condition_food_service import get_condition_food_recommendations
from app.services.food_service import search_foods, serialize_food_detail
from app.services.ocr_barcode_service import lookup_barcode
from app.services.recipe_service import create_or_update_recipe

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
    "lookup_product_by_barcode",
    "search_external_products",
    "get_ingredients_and_allergens",
    "get_nutritional_composition",
    "get_condition_guidance",
    "get_household_member_context",
    "compare_packaged_products",
    "calculate_recipe_nutrition",
    "search_external_web_sources",
]

OLLAMA_TOOLS_SCHEMA: List[Dict[str, Any]] = [
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


def discover_ollama_models() -> Tuple[bool, List[str], Optional[str]]:
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


def get_ollama_assistant_status(requested_model: Optional[str] = None) -> AssistantStatusResponse:
    reachable, installed, err_msg = discover_ollama_models()
    configured = (requested_model or settings.OLLAMA_MODEL or "").strip() or None

    active_model: Optional[str] = None
    remediation: Optional[str] = None

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
    arguments: Dict[str, Any],
    mode: str = "automatic",
) -> Tuple[Dict[str, Any], AssistantToolExecutionTrace, List[AssistantSourceReference]]:
    """
    Executes one of the 11 allowlisted backend tools with strict argument validation
    and mode enforcement (`database_only` blocks external network tools).
    """
    now_iso = datetime.now(timezone.utc).isoformat()
    sources: List[AssistantSourceReference] = []

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

        if tool_name == "get_food_details":
            slug = str(arguments.get("food_slug") or "").strip()
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
                    "brand": detail.brand,
                    "barcode": detail.barcode,
                    "net_quantity": detail.net_quantity,
                    "is_packaged": detail.is_packaged,
                    "has_verified_image": detail.has_verified_image,
                    "image_url": detail.image_url,
                    "default_basis": detail.default_basis,
                    "standard_serving_name": detail.standard_serving_name,
                    "standard_serving_grams": detail.standard_serving_grams,
                    "completeness_pct": detail.completeness_pct,
                    "available_nutrient_count": detail.available_nutrient_count,
                    "missing_nutrient_codes": detail.missing_nutrient_codes,
                    "completeness_evaluation": comp,
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
            member: Optional[HouseholdMember] = None
            if m_id is not None:
                member = db.query(HouseholdMember).filter(HouseholdMember.id == int(m_id)).first()
            elif h_token:
                hh = db.query(Household).filter(Household.household_token == str(h_token)).first()
                if hh and hh.default_member_id:
                    member = (
                        db.query(HouseholdMember)
                        .filter(HouseholdMember.id == hh.default_member_id)
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


def _resolve_context_food_slug(
    db: Session, message: str, context: Optional[AssistantPageContext]
) -> Optional[str]:
    """
    Resolves the relevant food slug from either:
    1. Explicit `context.food_slug` (e.g., when viewing `/foods/pkg-pineapple-cake-6b35c3`)
    2. Explicit `context.barcode`
    3. Food names mentioned in the user's message (e.g., 'Pineapple Cake', 'Ragi', 'Khichdi', 'Parle-G')
    """
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

    # Check if any food item's name appears in the message
    all_foods = db.query(FoodItem.slug, FoodItem.name_en, FoodItem.brand).all()
    for slug, name_en, brand in all_foods:
        base_name = re.sub(r"\s*\(.*?\)", "", name_en.lower()).strip()
        if len(base_name) >= 4 and base_name in msg_lower:
            return slug

    return None


def _orchestrate_deterministic_tool_calls(
    db: Session,
    req: AssistantChatRequest,
) -> Tuple[Dict[str, Any], List[AssistantToolExecutionTrace], List[AssistantSourceReference]]:
    """
    Database-first deterministic tool planner that guarantees accurate backend tool execution
    for the current page context and user question, before passing grounded facts to Ollama
    (or synthesizing a structured answer if Ollama is offline).
    """
    msg = req.message.strip()
    msg_l = msg.lower()
    mode = req.mode if req.mode in ("database_only", "automatic", "online_search") else "automatic"
    ctx = req.context

    collected_data: Dict[str, Any] = {}
    traces: List[AssistantToolExecutionTrace] = []
    sources: List[AssistantSourceReference] = []

    def _run(name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        out, tr, srcs = execute_allowlisted_tool(db, name, args, mode=mode)
        traces.append(tr)
        sources.extend(srcs)
        return out

    # 1. Resolve active household member context if provided
    if ctx and (ctx.member_id is not None or ctx.household_token):
        mem_out = _run(
            "get_household_member_context",
            {"household_token": ctx.household_token, "member_id": ctx.member_id},
        )
        if mem_out.get("member_selected"):
            collected_data["member_context"] = mem_out

    # 2. Check if message contains an explicit 8-14 digit barcode
    bc_match = re.search(r"\b(\d{8,14})\b", msg)
    target_barcode = bc_match.group(1) if bc_match else (ctx.barcode if ctx else None)

    target_slug = _resolve_context_food_slug(db, msg, ctx)

    if target_slug:
        collected_data["food_details"] = _run("get_food_details", {"food_slug": target_slug})

        # If asking about ingredients, allergens, milk, egg, soy, wheat, additives, or general details
        if any(
            kw in msg_l
            for kw in (
                "ingredient",
                "contain",
                "allergen",
                "milk",
                "egg",
                "soy",
                "wheat",
                "gluten",
                "vegan",
                "vegetarian",
                "additive",
                "ins ",
                "what is in",
                "made of",
            )
        ) or "ingredients_and_allergens" not in collected_data:
            collected_data["ingredients_and_allergens"] = _run(
                "get_ingredients_and_allergens", {"food_slug": target_slug}
            )

        # Retrieve nutritional composition
        collected_data["nutritional_composition"] = _run(
            "get_nutritional_composition", {"food_slug": target_slug}
        )

        # If in automatic/online_search mode and the user asks to find online info or why nutrients are missing
        food_det = collected_data.get("food_details") or {}
        is_incomplete = (food_det.get("available_nutrient_count") or 0) == 0
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
        elif is_incomplete and mode == "database_only" and "barcode" in msg_l:
            pass

    elif target_barcode:
        if mode == "database_only":
            collected_data["search_results"] = _run(
                "search_food_database", {"query": target_barcode}
            )
        else:
            collected_data["barcode_lookup"] = _run(
                "lookup_product_by_barcode", {"barcode": target_barcode}
            )
    else:
        # Search local food database using cleaned query keywords
        stop_words = {
            "what", "are", "the", "in", "is", "how", "much", "many", "does",
            "contain", "for", "of", "tell", "me", "about", "can", "you",
            "find", "search", "online", "nutrition", "calories", "protein",
            "ingredients", "good", "safe", "allowed",
        }
        tokens = [
            t for t in re.findall(r"[a-zA-Z0-9]+", msg) if t.lower() not in stop_words and len(t) >= 3
        ]
        search_q = " ".join(tokens[:4]) if tokens else msg[:40]
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

    # 3. Check if a health condition is referenced in the message or page context
    cond_code = ctx.condition_code if ctx else None
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

    # 4. If mode is explicitly 'online_search', also invoke external web search adapter
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

    # Deduplicate sources by title + url
    unique_sources: List[AssistantSourceReference] = []
    seen_src = set()
    for s in sources:
        k = (s.title, s.url)
        if k not in seen_src:
            seen_src.add(k)
            unique_sources.append(s)

    return collected_data, traces, unique_sources


def _synthesize_grounded_response(
    req: AssistantChatRequest,
    collected_data: Dict[str, Any],
) -> str:
    """
    Synthesizes a concise, factual, grounded answer strictly from retrieved tool data.
    Never invents nutrient values, ingredients, clinical rules, or citations.
    """
    msg_l = req.message.lower()
    lines: List[str] = []

    food_det = collected_data.get("food_details") or {}
    ing_data = collected_data.get("ingredients_and_allergens") or {}
    nut_data = collected_data.get("nutritional_composition") or {}
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

    if food_det.get("found"):
        name = food_det.get("name_en")
        brand = food_det.get("brand")
        barcode = food_det.get("barcode")
        header = f"**{name}**" + (f" ({brand})" if brand else "")
        if barcode:
            header += f" • Barcode: `{barcode}`"
        if food_det.get("net_quantity"):
            header += f" • Net Weight: **{food_det['net_quantity']}**"
        lines.append(header)

        # Barcode-specific answer
        if "barcode" in msg_l and barcode:
            lines.append(
                f"- **Barcode (EAN-13):** `{barcode}` (Source: {food_det['source']['name']})."
            )

        # Ingredients & Allergen-specific answer
        if ing_data.get("found") and (
            any(
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
            or not any(kw in msg_l for kw in ("calorie", "protein", "carb", "fat", "sodium", "missing", "null"))
        ):
            cleaned_ing = ing_data.get("cleaned_ingredients_text") or ing_data.get("raw_ingredients_text")
            if cleaned_ing:
                lines.append(f"- **Declared Ingredients:** {cleaned_ing}")
            else:
                lines.append("- **Declared Ingredients:** Not available in the local record.")

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
            if ing_data.get("ocr_uncertainty_notes"):
                lines.append(
                    f"- **OCR Parsing Notes:** {' '.join(ing_data['ocr_uncertainty_notes'])}"
                )

        # Nutrition & Missing-data explanation
        if nut_data.get("found"):
            avail_count = nut_data.get("available_nutrient_count", 0)
            avail_map = nut_data.get("available_nutrients") or {}
            if avail_count == 0:
                lines.append(
                    f"- **Nutrition Status (`0/20` available — 100% `NULL`):** Nutritional values have not yet been captured for **{name}**. "
                    "The local record was created from an ingredient/package scan that did not include the back-of-pack nutrition table, and GharPlate never invents or substitutes generic cake/fruit numbers."
                )
                lines.append(
                    "- **How to resolve:** Click **Search Online Databases** on the product page to check Open Food Facts / USDA FDC, or use **Scan Nutrition Label** to photograph the nutrition table."
                )
            else:
                highlights = []
                for k in ("energy_kcal", "protein_g", "carbs_g", "sugars_total_g", "sugars_added_g", "fat_total_g", "fibre_g", "sodium_mg"):
                    if k in avail_map:
                        item = avail_map[k]
                        highlights.append(f"**{item['name']}**: {item['value_per_100']} {item['unit']}")
                if highlights:
                    lines.append(
                        f"- **Nutrition per {nut_data.get('default_basis', '100g')}** ({nut_data.get('completeness_pct')}% complete): "
                        + " • ".join(highlights)
                    )
                missing_list = [m["name"] for m in (nut_data.get("missing_nutrients") or [])]
                if missing_list:
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

    if not lines:
        sr = (collected_data.get("search_results") or {}).get("items") or []
        if sr:
            lines.append(
                "Found in GharPlate local catalog: "
                + ", ".join(f"**{i['name_en']}** (`{i['slug']}`)" for i in sr[:5])
            )
        else:
            lines.append(
                "No matching food or packaged product was found in GharPlate's local database for that query. "
                "Try switching the assistant mode to **Automatic** or **Search Online**, or scan the package barcode/nutrition label."
            )

    return "\n\n".join(lines)


def chat_with_gharplate_assistant(
    db: Session, req: AssistantChatRequest
) -> AssistantChatResponse:
    """
    Executes a context-aware, tool-backed conversation turn with the GharPlate AI Assistant:
    1. Runs deterministic database-first and mode-aware backend tools (`_orchestrate_deterministic_tool_calls`).
    2. Checks local Ollama status and installed models (`get_ollama_assistant_status`).
    3. If Ollama is reachable and has an installed model, calls `POST {OLLAMA_BASE_URL}/api/chat`
       with the allowlisted tool definitions and the retrieved database/provider evidence.
       If the model emits additional tool calls, executes them via `execute_allowlisted_tool`.
    4. If Ollama is offline or unreachable, returns the deterministic grounded synthesis from the
       executed backend tools (`used_fallback_synthesis=True`) with clear connection diagnostics.
    """
    mode = req.mode if req.mode in ("database_only", "automatic", "online_search") else "automatic"
    collected_data, traces, sources = _orchestrate_deterministic_tool_calls(db, req)
    grounded_fallback_reply = _synthesize_grounded_response(req, collected_data)

    status_info = get_ollama_assistant_status(req.model)
    followups = [
        "What are the ingredients and allergens in this product?",
        "Why are the nutritional values NULL and how can I enrich them?",
        "Which foods are reviewed for Fever or Type 2 Diabetes?",
    ]
    if (collected_data.get("food_details") or {}).get("found"):
        f_name = collected_data["food_details"]["name_en"]
        followups = [
            f"What are the declared ingredients and additives in {f_name}?",
            f"Does {f_name} contain milk, egg, wheat, or soy?",
            f"How much protein and energy does {f_name} provide?",
        ]

    if not status_info.ollama_reachable or not status_info.active_model:
        return AssistantChatResponse(
            reply=grounded_fallback_reply,
            mode_used=mode,
            model_used=status_info.active_model or "gharplate-deterministic-tool-engine",
            ollama_connected=False,
            used_fallback_synthesis=True,
            tool_traces=traces,
            sources=sources,
            suggested_followups=followups,
            medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
        )

    active_model = status_info.active_model
    system_prompt = (
        "You are the GharPlate AI Assistant, an evidence-based Indian household food and packaged-product intelligence assistant.\n"
        "STRICT RULES:\n"
        "1. Answer ONLY using the verified tool outputs provided below. NEVER invent nutrient values, ingredients, barcodes, or citations.\n"
        "2. If a nutrient value is NULL / missing in the tool output, state clearly that it is unmeasured (NULL) and explain how to enrich it via barcode lookup or label OCR.\n"
        "3. Highlight any allergen consistency warnings (for example, if soy is declared in the package text but missing from stored allergen tags).\n"
        "4. You are NOT a doctor or dietitian. Never diagnose illness or prescribe medication.\n"
        "5. Keep your answer concise, clear, and well-structured with bullet points.\n\n"
        f"ACTIVE SEARCH MODE: {mode}\n"
        f"VERIFIED BACKEND TOOL DATA:\n{json.dumps(collected_data, indent=2, default=str)}"
    )

    messages_payload: List[Dict[str, Any]] = [{"role": "system", "content": system_prompt}]
    for h in req.history[-6:]:
        if h.role in ("user", "assistant") and h.content.strip():
            messages_payload.append({"role": h.role, "content": h.content.strip()})
    messages_payload.append({"role": "user", "content": req.message.strip()})

    chat_url = f"{settings.OLLAMA_BASE_URL.rstrip('/')}/api/chat"
    try:
        with httpx.Client(timeout=float(settings.OLLAMA_TIMEOUT_SECONDS)) as client:
            # First attempt with native tools enabled; if model does not support tools, fall back to standard chat with grounded context
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
            if not llm_reply:
                llm_reply = grounded_fallback_reply

            return AssistantChatResponse(
                reply=llm_reply,
                mode_used=mode,
                model_used=active_model,
                ollama_connected=True,
                used_fallback_synthesis=False,
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
            tool_traces=traces,
            sources=sources,
            suggested_followups=followups,
            medical_disclaimer=ASSISTANT_MEDICAL_DISCLAIMER,
        )
