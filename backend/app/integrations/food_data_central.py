"""
Source B — USDA FoodData Central Integration.
Official documentation: https://fdc.nal.usda.gov/api-guide/

STRICT INTEGRITY RULE:
Never use a generic food composition match (e.g., generic 'pineapple' or generic 'cake')
to fill unknown nutrient values of a branded packaged product (e.g., 'Pineapple Cake — Winkles').
Packaged products may only be enriched from exact GTIN/UPC barcode matches or user-confirmed package labels.
"""

from datetime import datetime, timezone
from typing import Any, Optional
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.cache import (
    enforce_provider_rate_limit,
    get_cached_lookup,
    set_cached_lookup,
)
from app.integrations.normalizer import NormalizedExternalProduct
from app.integrations.open_food_facts import ProviderLookupAttempt

FDC_LICENSE_ATTRIBUTION = (
    "U.S. Department of Agriculture (USDA), Agricultural Research Service. FoodData Central (CC0 1.0 Public Domain)."
)

# Map USDA FDC nutrient numbers / IDs to GharPlate's 20 nutrient codes
FDC_NUTRIENT_NUMBER_MAP: dict[str, str] = {
    "208": "energy_kcal",
    "1008": "energy_kcal",
    "203": "protein_g",
    "1003": "protein_g",
    "205": "carbs_g",
    "1005": "carbs_g",
    "269": "sugars_total_g",
    "2000": "sugars_total_g",
    "539": "sugars_added_g",
    "1235": "sugars_added_g",
    "204": "fat_total_g",
    "1004": "fat_total_g",
    "606": "fat_saturated_g",
    "1258": "fat_saturated_g",
    "605": "fat_trans_g",
    "1257": "fat_trans_g",
    "291": "fibre_g",
    "1079": "fibre_g",
    "307": "sodium_mg",
    "1093": "sodium_mg",
    "306": "potassium_mg",
    "1092": "potassium_mg",
    "301": "calcium_mg",
    "1087": "calcium_mg",
    "303": "iron_mg",
    "1089": "iron_mg",
    "304": "magnesium_mg",
    "1090": "magnesium_mg",
    "305": "phosphorus_mg",
    "1091": "phosphorus_mg",
    "309": "zinc_mg",
    "1095": "zinc_mg",
    "318": "vit_a_mcg",
    "1106": "vit_a_mcg",
    "401": "vit_c_mg",
    "1162": "vit_c_mg",
    "328": "vit_d_mcg",
    "1114": "vit_d_mcg",
    "418": "vit_b12_mcg",
    "1178": "vit_b12_mcg",
    "417": "folate_mcg",
    "1177": "folate_mcg",
}


def parse_fdc_food_item(item: dict[str, Any]) -> NormalizedExternalProduct:
    fdc_id = str(item.get("fdcId") or "")
    desc = (item.get("description") or "").strip() or None
    brand = (item.get("brandOwner") or item.get("brandName") or "").strip() or None
    gtin = (item.get("gtinUpc") or "").strip() or None
    data_type = (item.get("dataType") or "Foundation").strip()
    ingredients = (item.get("ingredients") or "").strip() or None
    serving_size = item.get("servingSize")
    serving_unit = item.get("servingSizeUnit") or "g"
    serving_label = (
        f"{serving_size} {serving_unit}" if serving_size is not None else None
    )

    nutrients_per_100: dict[str, Optional[float]] = {}
    for fn in item.get("foodNutrients") or []:
        n_num = str(
            fn.get("nutrientNumber")
            or (fn.get("nutrient") or {}).get("number")
            or fn.get("nutrientId")
            or (fn.get("nutrient") or {}).get("id")
            or ""
        )
        gp_code = FDC_NUTRIENT_NUMBER_MAP.get(n_num)
        if not gp_code:
            continue
        val = fn.get("value") if "value" in fn else fn.get("amount")
        if val is not None:
            try:
                nutrients_per_100[gp_code] = round(float(val), 2)
            except (TypeError, ValueError):
                pass

    available_fields = [k for k, v in nutrients_per_100.items() if v is not None]
    if desc:
        available_fields.append("product_name")
    if ingredients:
        available_fields.append("ingredients_text")

    return NormalizedExternalProduct(
        provider_code="USDA_FDC",
        provider_name=f"USDA FoodData Central ({data_type})",
        source_url=f"https://fdc.nal.usda.gov/food-details/{fdc_id}/nutrients"
        if fdc_id
        else "https://fdc.nal.usda.gov/",
        source_record_id=fdc_id or "unknown",
        barcode=gtin,
        product_name=desc,
        brand=brand,
        serving_size_label=serving_label,
        serving_size_grams=float(serving_size) if serving_size else None,
        ingredients_text=ingredients,
        nutrients_per_100=nutrients_per_100,
        available_fields=available_fields,
        is_branded_packaged=(data_type.lower() == "branded"),
        data_version="v1",
        retrieved_at=datetime.now(timezone.utc),
        license_attribution=FDC_LICENSE_ATTRIBUTION,
    )


def lookup_fdc_by_barcode(
    db: Session, barcode: str, force_refresh: bool = False
) -> ProviderLookupAttempt:
    """
    Searches USDA FoodData Central Branded Foods for an exact GTIN/UPC barcode match.
    If FDC_API_KEY is not configured, returns status='unconfigured_api_key' without failing the workflow.
    """
    if not settings.ENABLE_FOODDATA_CENTRAL:
        return ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="disabled",
            message="USDA FoodData Central integration is disabled in configuration.",
        )

    if not settings.FDC_API_KEY or not settings.FDC_API_KEY.strip():
        return ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="unconfigured_api_key",
            message=(
                "USDA FoodData Central API key (FDC_API_KEY) is not configured in .env. "
                "Set FDC_API_KEY in .env to enable supplemental USDA FDC lookups."
            ),
        )

    clean_code = barcode.strip()
    if not force_refresh:
        cached = get_cached_lookup(db, "USDA_FDC", "barcode", clean_code)
        if cached is not None:
            cache_row, payload = cached
            foods = (payload or {}).get("foods") or []
            exact = next(
                (
                    f
                    for f in foods
                    if str(f.get("gtinUpc") or "").strip().lstrip("0")
                    == clean_code.lstrip("0")
                ),
                None,
            )
            if exact:
                return ProviderLookupAttempt(
                    provider_code="USDA_FDC",
                    provider_name="USDA FoodData Central",
                    status="cached_found",
                    http_status=cache_row.http_status,
                    message="Retrieved exact GTIN match from local USDA FDC cache.",
                    retrieved_at=cache_row.retrieved_at,
                    from_cache=True,
                    product=parse_fdc_food_item(exact),
                )
            return ProviderLookupAttempt(
                provider_code="USDA_FDC",
                provider_name="USDA FoodData Central",
                status="cached_not_found",
                http_status=cache_row.http_status,
                message=f"Barcode '{clean_code}' not found in USDA FoodData Central (cached).",
                retrieved_at=cache_row.retrieved_at,
                from_cache=True,
            )

    enforce_provider_rate_limit("USDA_FDC")
    url = f"{settings.FDC_API_BASE_URL.rstrip('/')}/foods/search"
    params = {
        "api_key": settings.FDC_API_KEY.strip(),
        "query": clean_code,
        "dataType": ["Branded"],
        "pageSize": 5,
    }

    try:
        with httpx.Client(timeout=settings.FDC_TIMEOUT_SECONDS) as client:
            resp = client.get(url, params=params)
            if resp.status_code == 429:
                return ProviderLookupAttempt(
                    provider_code="USDA_FDC",
                    provider_name="USDA FoodData Central",
                    status="rate_limited",
                    http_status=429,
                    message="USDA FoodData Central API rate limit reached (HTTP 429).",
                )
            if resp.status_code >= 400:
                return ProviderLookupAttempt(
                    provider_code="USDA_FDC",
                    provider_name="USDA FoodData Central",
                    status="http_error",
                    http_status=resp.status_code,
                    message=f"USDA FoodData Central returned HTTP {resp.status_code}.",
                )

            data = resp.json()
            foods = data.get("foods") or []
            exact = next(
                (
                    f
                    for f in foods
                    if str(f.get("gtinUpc") or "").strip().lstrip("0")
                    == clean_code.lstrip("0")
                ),
                None,
            )
            set_cached_lookup(
                db,
                "USDA_FDC",
                "barcode",
                clean_code,
                http_status=resp.status_code,
                response_status="found" if exact else "not_found",
                payload={"foods": [exact] if exact else []},
            )
            if exact:
                return ProviderLookupAttempt(
                    provider_code="USDA_FDC",
                    provider_name="USDA FoodData Central",
                    status="found",
                    http_status=resp.status_code,
                    message="Found exact GTIN match in USDA FoodData Central Branded Foods.",
                    product=parse_fdc_food_item(exact),
                )
            return ProviderLookupAttempt(
                provider_code="USDA_FDC",
                provider_name="USDA FoodData Central",
                status="not_found",
                http_status=resp.status_code,
                message=f"No exact GTIN match for '{clean_code}' in USDA FoodData Central.",
            )
    except httpx.TimeoutException:
        return ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="timeout",
            message="USDA FoodData Central lookup timed out.",
        )
    except httpx.RequestError as exc:
        return ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="network_error",
            message=f"USDA FoodData Central network error ({exc.__class__.__name__}).",
        )


def search_fdc_foods(
    db: Session, query: str, page_size: int = 5
) -> tuple[list[NormalizedExternalProduct], ProviderLookupAttempt]:
    """
    Searches USDA FoodData Central for generic or branded foods.
    """
    if not settings.ENABLE_FOODDATA_CENTRAL:
        return [], ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="disabled",
            message="USDA FoodData Central is disabled.",
        )
    if not settings.FDC_API_KEY or not settings.FDC_API_KEY.strip():
        return [], ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="unconfigured_api_key",
            message="Set FDC_API_KEY in .env to enable USDA FoodData Central search.",
        )

    clean_q = query.strip()
    cached = get_cached_lookup(db, "USDA_FDC", "search", clean_q)
    if cached is not None:
        cache_row, payload = cached
        foods = (payload or {}).get("foods") or []
        items = [parse_fdc_food_item(f) for f in foods[:page_size] if isinstance(f, dict)]
        return items, ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="cached_found" if items else "cached_not_found",
            http_status=cache_row.http_status,
            message=f"Retrieved {len(items)} USDA FDC result(s) from cache.",
            retrieved_at=cache_row.retrieved_at,
            from_cache=True,
        )

    enforce_provider_rate_limit("USDA_FDC")
    url = f"{settings.FDC_API_BASE_URL.rstrip('/')}/foods/search"
    params = {
        "api_key": settings.FDC_API_KEY.strip(),
        "query": clean_q,
        "pageSize": page_size,
    }
    try:
        with httpx.Client(timeout=settings.FDC_TIMEOUT_SECONDS) as client:
            resp = client.get(url, params=params)
            if resp.status_code >= 400:
                return [], ProviderLookupAttempt(
                    provider_code="USDA_FDC",
                    provider_name="USDA FoodData Central",
                    status="http_error",
                    http_status=resp.status_code,
                    message=f"USDA FDC search returned HTTP {resp.status_code}.",
                )
            data = resp.json()
            foods = data.get("foods") or []
            set_cached_lookup(
                db,
                "USDA_FDC",
                "search",
                clean_q,
                http_status=resp.status_code,
                response_status="found" if foods else "not_found",
                payload={"foods": foods[:page_size]},
            )
            items = [parse_fdc_food_item(f) for f in foods[:page_size] if isinstance(f, dict)]
            return items, ProviderLookupAttempt(
                provider_code="USDA_FDC",
                provider_name="USDA FoodData Central",
                status="found" if items else "not_found",
                http_status=resp.status_code,
                message=f"Found {len(items)} food record(s) in USDA FoodData Central.",
            )
    except Exception as exc:
        return [], ProviderLookupAttempt(
            provider_code="USDA_FDC",
            provider_name="USDA FoodData Central",
            status="network_error",
            message=f"USDA FDC search error ({exc.__class__.__name__}).",
        )
