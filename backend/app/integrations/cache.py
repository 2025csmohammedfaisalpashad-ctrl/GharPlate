"""
Persistent SQLite Caching & Rate-Limiting Layer for External Product & Nutrition Providers.
Prevents repeated API calls for the same barcode or search query and enforces polite request intervals.
"""

import json
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.entities import ExternalLookupCache

_LAST_PROVIDER_CALL_TS: Dict[str, float] = {}


def enforce_provider_rate_limit(provider_name: str, min_interval_sec: Optional[float] = None) -> None:
    """Enforces a polite minimum interval between outbound requests to the same external provider."""
    interval = (
        min_interval_sec
        if min_interval_sec is not None
        else settings.EXTERNAL_PROVIDER_MIN_INTERVAL_SECONDS
    )
    if interval <= 0:
        return
    now_ts = time.monotonic()
    last_ts = _LAST_PROVIDER_CALL_TS.get(provider_name)
    if last_ts is not None:
        elapsed = now_ts - last_ts
        if elapsed < interval:
            time.sleep(interval - elapsed)
    _LAST_PROVIDER_CALL_TS[provider_name] = time.monotonic()


def get_cached_lookup(
    db: Session,
    provider_name: str,
    lookup_type: str,
    query_value: str,
) -> Optional[Tuple[ExternalLookupCache, Optional[Dict[str, Any]]]]:
    """
    Returns (cache_row, parsed_payload) if a non-expired cache entry exists for the given key.
    """
    if not settings.ENABLE_PRODUCT_CACHE:
        return None

    cache_key = f"{provider_name}:{lookup_type}:{query_value.strip().lower()}"
    row = (
        db.query(ExternalLookupCache)
        .filter(ExternalLookupCache.cache_key == cache_key)
        .first()
    )
    if not row:
        return None

    now = datetime.now(timezone.utc)
    expires = row.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    if now > expires:
        return None

    payload: Optional[Dict[str, Any]] = None
    if row.payload_json:
        try:
            payload = json.loads(row.payload_json)
        except Exception:
            payload = None
    return row, payload


def set_cached_lookup(
    db: Session,
    provider_name: str,
    lookup_type: str,
    query_value: str,
    http_status: int,
    response_status: str,
    payload: Optional[Dict[str, Any]],
    ttl_hours: Optional[int] = None,
) -> ExternalLookupCache:
    """
    Stores or updates a cached external lookup result in `external_lookup_cache`.
    """
    hours = ttl_hours if ttl_hours is not None else settings.PRODUCT_CACHE_HOURS
    now = datetime.now(timezone.utc)
    expires = now + timedelta(hours=max(hours, 1))
    cache_key = f"{provider_name}:{lookup_type}:{query_value.strip().lower()}"
    payload_str = json.dumps(payload) if payload is not None else None

    existing = (
        db.query(ExternalLookupCache)
        .filter(ExternalLookupCache.cache_key == cache_key)
        .first()
    )
    if existing:
        existing.http_status = http_status
        existing.response_status = response_status
        existing.payload_json = payload_str
        existing.retrieved_at = now
        existing.expires_at = expires
        db.commit()
        db.refresh(existing)
        return existing

    row = ExternalLookupCache(
        cache_key=cache_key,
        provider_name=provider_name,
        lookup_type=lookup_type,
        query_value=query_value.strip(),
        http_status=http_status,
        response_status=response_status,
        payload_json=payload_str,
        retrieved_at=now,
        expires_at=expires,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
