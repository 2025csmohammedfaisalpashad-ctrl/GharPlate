"""
Source A — Open Food Facts Integration (API v3 Primary + Documented Search Adapter).
Official documentation:
- https://openfoodfacts.github.io/documentation/
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/
- https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/tutorials/license-be-on-the-legal-side/
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import re
from typing import Any, Optional
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.cache import (
    enforce_provider_rate_limit,
    get_cached_lookup,
    set_cached_lookup,
)
from app.integrations.normalizer import (
    NormalizedExternalProduct,
    normalize_allergen_tag_name,
)

OFF_LICENSE_ATTRIBUTION = (
    "Open Food Facts — Open Database License (ODbL 1.0); product images under CC BY-SA 3.0 where applicable."
)


@dataclass
class ProviderLookupAttempt:
    provider_code: str
    provider_name: str
    status: str  # found, not_found, cached_found, cached_not_found, timeout, rate_limited, http_error, network_error, disabled, unconfigured_api_key
    http_status: Optional[int] = None
    message: str = ""
    retrieved_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    from_cache: bool = False
    product: Optional[NormalizedExternalProduct] = None


def _safe_float(val: Any) -> Optional[float]:
    if val is None or val == "":
        return None
    try:
        num = float(val)
        return round(num, 2) if num >= 0 else None
    except (TypeError, ValueError):
        return None


def _parse_serving_grams(serving_size_str: Optional[str], serving_qty: Any) -> Optional[float]:
    q_val = _safe_float(serving_qty)
    if q_val and q_val > 0:
        return q_val
    if serving_size_str:
        m = re.search(r"(\d+(?:\.\d+)?)\s*(?:g|gm|ml)\b", serving_size_str, re.IGNORECASE)
        if m:
            return _safe_float(m.group(1))
    return None


def parse_off_product_dict(
    prod: dict[str, Any], fallback_barcode: Optional[str] = None, api_version: str = "v3"
) -> NormalizedExternalProduct:
    """
    Normalizes an Open Food Facts API v3 (or v2 search) product payload into NormalizedExternalProduct.
    Never invents missing fields; tracks available_fields and missing_fields explicitly.
    """
    barcode = str(prod.get("code") or prod.get("_id") or fallback_barcode or "").strip()
    name = (
        prod.get("product_name_en")
        or prod.get("product_name")
        or prod.get("generic_name_en")
        or prod.get("generic_name")
    )
    if isinstance(name, str):
        name = name.strip() or None

    brands_raw = prod.get("brands")
    brand = None
    if isinstance(brands_raw, str) and brands_raw.strip():
        brand = brands_raw.split(",")[0].strip()
    elif isinstance(prod.get("brands_tags"), list) and prod["brands_tags"]:
        brand = str(prod["brands_tags"][0]).replace("en:", "").strip()

    quantity = prod.get("quantity")
    if isinstance(quantity, str):
        quantity = quantity.strip() or None

    serving_label = prod.get("serving_size")
    if isinstance(serving_label, str):
        serving_label = serving_label.strip() or None
    serving_grams = _parse_serving_grams(serving_label, prod.get("serving_quantity"))

    front_img = (
        prod.get("image_front_url")
        or prod.get("image_front_small_url")
        or prod.get("image_url")
    )
    nutr_img = prod.get("image_nutrition_url")
    ing_img = prod.get("image_ingredients_url")

    ingredients_text = (
        prod.get("ingredients_text_en")
        or prod.get("ingredients_text")
        or prod.get("ingredients_text_with_allergens_en")
    )
    if isinstance(ingredients_text, str):
        ingredients_text = ingredients_text.strip() or None

    allergens_raw = prod.get("allergens_tags") or []
    allergen_tags = sorted(
        list(
            {
                normalize_allergen_tag_name(str(a))
                for a in allergens_raw
                if isinstance(a, str) and a.strip()
            }
        )
    )

    cats_raw = prod.get("categories_tags") or []
    categories = [
        str(c).replace("en:", "") for c in cats_raw if isinstance(c, str) and c.strip()
    ][:8]

    nutr = prod.get("nutriments") or {}

    # Compute sodium_mg carefully (Open Food Facts stores sodium_100g in grams by convention, or salt_100g in grams)
    sodium_mg: Optional[float] = None
    if nutr.get("sodium_100g") is not None:
        raw_sod = _safe_float(nutr.get("sodium_100g"))
        if raw_sod is not None:
            sodium_mg = round(raw_sod * 1000.0, 1) if raw_sod < 50.0 else raw_sod
    elif nutr.get("salt_100g") is not None:
        raw_salt = _safe_float(nutr.get("salt_100g"))
        if raw_salt is not None:
            sodium_mg = round((raw_salt * 1000.0) / 2.5, 1)

    energy_kcal = _safe_float(nutr.get("energy-kcal_100g"))
    if energy_kcal is None and nutr.get("energy-kj_100g") is not None:
        kj = _safe_float(nutr.get("energy-kj_100g"))
        if kj is not None:
            energy_kcal = round(kj / 4.184, 1)

    nutrients_per_100: dict[str, Optional[float]] = {
        "energy_kcal": energy_kcal,
        "protein_g": _safe_float(nutr.get("proteins_100g")),
        "carbs_g": _safe_float(nutr.get("carbohydrates_100g")),
        "sugars_total_g": _safe_float(nutr.get("sugars_100g")),
        "sugars_added_g": _safe_float(nutr.get("added-sugars_100g")),
        "fat_total_g": _safe_float(nutr.get("fat_100g")),
        "fat_saturated_g": _safe_float(nutr.get("saturated-fat_100g")),
        "fat_trans_g": _safe_float(nutr.get("trans-fat_100g")),
        "fibre_g": _safe_float(nutr.get("fiber_100g")),
        "sodium_mg": sodium_mg,
        "potassium_mg": (
            round(_safe_float(nutr.get("potassium_100g")) * 1000.0, 1)  # type: ignore[operator]
            if _safe_float(nutr.get("potassium_100g")) is not None
            and _safe_float(nutr.get("potassium_100g")) < 20.0  # type: ignore[operator]
            else _safe_float(nutr.get("potassium_100g"))
        ),
        "calcium_mg": (
            round(_safe_float(nutr.get("calcium_100g")) * 1000.0, 1)  # type: ignore[operator]
            if _safe_float(nutr.get("calcium_100g")) is not None
            and _safe_float(nutr.get("calcium_100g")) < 20.0  # type: ignore[operator]
            else _safe_float(nutr.get("calcium_100g"))
        ),
        "iron_mg": (
            round(_safe_float(nutr.get("iron_100g")) * 1000.0, 2)  # type: ignore[operator]
            if _safe_float(nutr.get("iron_100g")) is not None
            and _safe_float(nutr.get("iron_100g")) < 2.0  # type: ignore[operator]
            else _safe_float(nutr.get("iron_100g"))
        ),
    }

    available_fields: list[str] = []
    missing_fields: list[str] = []
    for key, val in [
        ("product_name", name),
        ("brand", brand),
        ("quantity", quantity),
        ("serving_size", serving_label),
        ("front_image_url", front_img),
        ("ingredients_text", ingredients_text),
        ("allergen_tags", allergen_tags if allergen_tags else None),
    ]:
        if val:
            available_fields.append(key)
        else:
            missing_fields.append(key)

    for n_code, n_val in nutrients_per_100.items():
        if n_val is not None:
            available_fields.append(n_code)
        else:
            missing_fields.append(n_code)

    source_url = (
        f"https://world.openfoodfacts.org/product/{barcode}"
        if barcode
        else "https://world.openfoodfacts.org"
    )

    return NormalizedExternalProduct(
        provider_code="OPEN_FOOD_FACTS",
        provider_name="Open Food Facts",
        source_url=source_url,
        source_record_id=barcode or "unknown",
        barcode=barcode or None,
        product_name=name,
        brand=brand,
        quantity=quantity,
        serving_size_label=serving_label,
        serving_size_grams=serving_grams,
        image_url=front_img,
        front_image_url=front_img,
        nutrition_image_url=nutr_img,
        ingredients_image_url=ing_img,
        ingredients_text=ingredients_text,
        allergen_tags=allergen_tags,
        categories=categories,
        nutrients_per_100=nutrients_per_100,
        available_fields=available_fields,
        missing_fields=missing_fields,
        is_branded_packaged=True,
        data_version=api_version,
        retrieved_at=datetime.now(timezone.utc),
        license_attribution=OFF_LICENSE_ATTRIBUTION,
    )


def fetch_open_food_facts_by_barcode(
    db: Session, barcode: str, force_refresh: bool = False
) -> ProviderLookupAttempt:
    """
    Looks up an exact barcode in Open Food Facts using the documented API v3 endpoint
    (`/api/v3/product/{barcode}.json`).
    Uses SQLite caching, polite rate limiting, bounded timeout, and structured error reporting.
    """
    if not settings.ENABLE_EXTERNAL_BARCODE_LOOKUP:
        return ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="disabled",
            message="External barcode lookup is disabled in configuration (ENABLE_EXTERNAL_BARCODE_LOOKUP=false).",
        )

    clean_code = barcode.strip()
    if not force_refresh:
        cached = get_cached_lookup(db, "OPEN_FOOD_FACTS", "barcode", clean_code)
        if cached is not None:
            cache_row, payload = cached
            if cache_row.response_status == "found" and payload and payload.get("product"):
                norm_prod = parse_off_product_dict(
                    payload["product"],
                    fallback_barcode=clean_code,
                    api_version=payload.get("_api_version", "v3"),
                )
                return ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="cached_found",
                    http_status=cache_row.http_status,
                    message="Retrieved verified barcode record from local Open Food Facts cache.",
                    retrieved_at=cache_row.retrieved_at,
                    from_cache=True,
                    product=norm_prod,
                )
            if cache_row.response_status == "not_found":
                return ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="cached_not_found",
                    http_status=cache_row.http_status,
                    message=f"Barcode '{clean_code}' is not listed in Open Food Facts (cached lookup).",
                    retrieved_at=cache_row.retrieved_at,
                    from_cache=True,
                    product=None,
                )

    enforce_provider_rate_limit("OPEN_FOOD_FACTS")
    v3_url = f"{settings.OPEN_FOOD_FACTS_API_V3_URL.rstrip('/')}/{clean_code}.json"
    headers = {"User-Agent": settings.OPEN_FOOD_FACTS_USER_AGENT}

    try:
        with httpx.Client(timeout=settings.OPEN_FOOD_FACTS_TIMEOUT_SECONDS) as client:
            resp = client.get(v3_url, headers=headers)

            if resp.status_code == 429:
                return ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="rate_limited",
                    http_status=429,
                    message="Open Food Facts API rate limit reached (HTTP 429). Please retry after a short pause.",
                )

            if resp.status_code == 404:
                set_cached_lookup(
                    db,
                    "OPEN_FOOD_FACTS",
                    "barcode",
                    clean_code,
                    http_status=404,
                    response_status="not_found",
                    payload={"status": "not_found"},
                    ttl_hours=settings.OPEN_FOOD_FACTS_CACHE_HOURS,
                )
                return ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="not_found",
                    http_status=404,
                    message=f"Barcode '{clean_code}' was not found in Open Food Facts (API v3).",
                )

            if resp.status_code >= 400:
                return ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="http_error",
                    http_status=resp.status_code,
                    message=f"Open Food Facts returned HTTP {resp.status_code}.",
                )

            data = resp.json()
            # API v3 uses status="success" / "product_found" or status=1 in v2 compatibility responses
            status_val = data.get("status")
            product_dict = data.get("product")
            is_found = bool(
                product_dict
                and status_val not in ("failure", "product_not_found", 0, "0")
            )

            if not is_found:
                set_cached_lookup(
                    db,
                    "OPEN_FOOD_FACTS",
                    "barcode",
                    clean_code,
                    http_status=resp.status_code,
                    response_status="not_found",
                    payload={"status": "not_found"},
                    ttl_hours=settings.OPEN_FOOD_FACTS_CACHE_HOURS,
                )
                return ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="not_found",
                    http_status=resp.status_code,
                    message=f"Barcode '{clean_code}' was not found in Open Food Facts.",
                )

            cache_payload = {"_api_version": "v3", "product": product_dict}
            set_cached_lookup(
                db,
                "OPEN_FOOD_FACTS",
                "barcode",
                clean_code,
                http_status=resp.status_code,
                response_status="found",
                payload=cache_payload,
                ttl_hours=settings.OPEN_FOOD_FACTS_CACHE_HOURS,
            )
            norm_prod = parse_off_product_dict(
                product_dict, fallback_barcode=clean_code, api_version="v3"
            )
            return ProviderLookupAttempt(
                provider_code="OPEN_FOOD_FACTS",
                provider_name="Open Food Facts",
                status="found",
                http_status=resp.status_code,
                message=f"Retrieved product '{norm_prod.product_name or clean_code}' from Open Food Facts API v3.",
                product=norm_prod,
            )

    except httpx.TimeoutException:
        return ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="timeout",
            message="Open Food Facts request timed out. Local record returned without external update.",
        )
    except httpx.RequestError as exc:
        return ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="network_error",
            message=f"Open Food Facts network connection unavailable ({exc.__class__.__name__}).",
        )
    except Exception as exc:
        return ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="http_error",
            message=f"Unexpected error parsing Open Food Facts response ({exc.__class__.__name__}).",
        )


def search_open_food_facts_products(
    db: Session, query: str, brand: Optional[str] = None, page_size: int = 5
) -> tuple[list[NormalizedExternalProduct], ProviderLookupAttempt]:
    """
    Searches Open Food Facts by product name and optional brand.
    Uses persistent caching and polite rate limiting (never triggered on every keystroke).
    """
    if not settings.ENABLE_EXTERNAL_BARCODE_LOOKUP:
        return [], ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="disabled",
            message="External product search is disabled in configuration.",
        )

    combined_q = f"{brand or ''} {query}".strip()
    if not combined_q:
        return [], ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="not_found",
            message="Empty search query.",
        )

    cached = get_cached_lookup(db, "OPEN_FOOD_FACTS", "search", combined_q)
    if cached is not None:
        cache_row, payload = cached
        products_raw = (payload or {}).get("products", [])
        norm_list = [
            parse_off_product_dict(p, api_version="v2_search")
            for p in products_raw[:page_size]
            if isinstance(p, dict)
        ]
        return norm_list, ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="cached_found" if norm_list else "cached_not_found",
            http_status=cache_row.http_status,
            message=f"Retrieved {len(norm_list)} Open Food Facts candidate(s) from cache.",
            retrieved_at=cache_row.retrieved_at,
            from_cache=True,
        )

    enforce_provider_rate_limit("OPEN_FOOD_FACTS")
    headers = {"User-Agent": settings.OPEN_FOOD_FACTS_USER_AGENT}
    params = {
        "search_terms": combined_q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": page_size,
    }

    try:
        with httpx.Client(timeout=settings.OPEN_FOOD_FACTS_TIMEOUT_SECONDS) as client:
            resp = client.get(settings.OPEN_FOOD_FACTS_SEARCH_URL, params=params, headers=headers)
            if resp.status_code == 429:
                return [], ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="rate_limited",
                    http_status=429,
                    message="Open Food Facts search rate limit reached (HTTP 429).",
                )
            if resp.status_code >= 400:
                return [], ProviderLookupAttempt(
                    provider_code="OPEN_FOOD_FACTS",
                    provider_name="Open Food Facts",
                    status="http_error",
                    http_status=resp.status_code,
                    message=f"Open Food Facts search returned HTTP {resp.status_code}.",
                )

            data = resp.json()
            products_raw = data.get("products") or []
            set_cached_lookup(
                db,
                "OPEN_FOOD_FACTS",
                "search",
                combined_q,
                http_status=resp.status_code,
                response_status="found" if products_raw else "not_found",
                payload={"products": products_raw[:page_size]},
                ttl_hours=settings.OPEN_FOOD_FACTS_CACHE_HOURS,
            )
            norm_list = [
                parse_off_product_dict(p, api_version="v2_search")
                for p in products_raw[:page_size]
                if isinstance(p, dict)
            ]
            return norm_list, ProviderLookupAttempt(
                provider_code="OPEN_FOOD_FACTS",
                provider_name="Open Food Facts",
                status="found" if norm_list else "not_found",
                http_status=resp.status_code,
                message=f"Found {len(norm_list)} candidate product(s) on Open Food Facts.",
            )
    except httpx.TimeoutException:
        return [], ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="timeout",
            message="Open Food Facts search timed out.",
        )
    except httpx.RequestError as exc:
        return [], ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="network_error",
            message=f"Open Food Facts search network error ({exc.__class__.__name__}).",
        )
    except Exception as exc:
        return [], ProviderLookupAttempt(
            provider_code="OPEN_FOOD_FACTS",
            provider_name="Open Food Facts",
            status="http_error",
            message=f"Open Food Facts search error ({exc.__class__.__name__}).",
        )
