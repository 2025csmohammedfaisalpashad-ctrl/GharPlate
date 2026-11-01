"""
Source D — Configurable External Web Search Adapter (Brave Search / Tavily).
Provides structured web search results with original URLs, titles, snippets, retrieval dates,
and provider attribution when GharPlate's local catalog and product databases do not contain an answer.
Never sends household medical profiles or personal identifiers to external search engines.
"""

from dataclasses import dataclass
from datetime import datetime, UTC
from typing import Any
import httpx
from sqlalchemy.orm import Session

from app.core.config import settings
from app.integrations.cache import (
    enforce_provider_rate_limit,
    get_cached_lookup,
    set_cached_lookup,
)


@dataclass
class ExternalWebSearchResultItem:
    title: str
    url: str
    snippet: str
    provider: str
    retrieved_at: str


def search_external_web(
    db: Session, query: str, max_results: int = 5
) -> tuple[list[ExternalWebSearchResultItem], dict[str, Any]]:
    """
    Executes an external web search using the configured provider ('brave' or 'tavily').
    If disabled or API credentials are not configured, returns a transparent status dict
    explaining how to enable it in `.env`.
    """
    clean_q = query.strip()
    now_iso = datetime.now(UTC).isoformat()
    provider = (settings.WEB_SEARCH_PROVIDER or "").strip().lower()

    if not settings.ENABLE_EXTERNAL_WEB_SEARCH:
        return [], {
            "provider": provider or "none",
            "status": "disabled",
            "message": (
                "External web search is currently disabled (ENABLE_EXTERNAL_WEB_SEARCH=false). "
                "Set ENABLE_EXTERNAL_WEB_SEARCH=true and configure WEB_SEARCH_PROVIDER=brave or tavily in .env to enable web search."
            ),
            "retrieved_at": now_iso,
        }

    if provider == "brave":
        if not settings.BRAVE_SEARCH_API_KEY.strip():
            return [], {
                "provider": "brave",
                "status": "unconfigured_api_key",
                "message": "BRAVE_SEARCH_API_KEY is not set in .env. Add your Brave Search API key to enable live web search.",
                "retrieved_at": now_iso,
            }
        return _execute_brave_search(db, clean_q, max_results)

    if provider == "tavily":
        if not settings.TAVILY_API_KEY.strip():
            return [], {
                "provider": "tavily",
                "status": "unconfigured_api_key",
                "message": "TAVILY_API_KEY is not set in .env. Add your Tavily API key to enable live web search.",
                "retrieved_at": now_iso,
            }
        return _execute_tavily_search(db, clean_q, max_results)

    return [], {
        "provider": provider or "unconfigured",
        "status": "unconfigured_provider",
        "message": (
            "No external web search provider is configured. Set WEB_SEARCH_PROVIDER=brave (with BRAVE_SEARCH_API_KEY) "
            "or WEB_SEARCH_PROVIDER=tavily (with TAVILY_API_KEY) in .env."
        ),
        "retrieved_at": now_iso,
    }


def _execute_brave_search(
    db: Session, query: str, max_results: int
) -> tuple[list[ExternalWebSearchResultItem], dict[str, Any]]:
    cached = get_cached_lookup(db, "BRAVE_SEARCH", "web_search", query)
    if cached is not None:
        cache_row, payload = cached
        raw_items = (payload or {}).get("results") or []
        items = [
            ExternalWebSearchResultItem(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("snippet", ""),
                provider="Brave Search",
                retrieved_at=cache_row.retrieved_at.isoformat(),
            )
            for r in raw_items[:max_results]
        ]
        return items, {
            "provider": "Brave Search",
            "status": "cached_found" if items else "cached_not_found",
            "from_cache": True,
            "message": f"Retrieved {len(items)} web search result(s) from Brave Search cache.",
            "retrieved_at": cache_row.retrieved_at.isoformat(),
        }

    enforce_provider_rate_limit("BRAVE_SEARCH")
    url = "https://api.search.brave.com/res/v1/web/search"
    headers = {
        "Accept": "application/json",
        "X-Subscription-Token": settings.BRAVE_SEARCH_API_KEY.strip(),
    }
    try:
        with httpx.Client(timeout=settings.WEB_SEARCH_TIMEOUT_SECONDS) as client:
            resp = client.get(url, params={"q": query, "count": max_results}, headers=headers)
            if resp.status_code >= 400:
                return [], {
                    "provider": "Brave Search",
                    "status": "http_error",
                    "http_status": resp.status_code,
                    "message": f"Brave Search returned HTTP {resp.status_code}.",
                    "retrieved_at": datetime.now(UTC).isoformat(),
                }
            data = resp.json()
            web_results = (data.get("web") or {}).get("results") or []
            now_iso = datetime.now(UTC).isoformat()
            normalized = [
                {
                    "title": r.get("title", "Untitled"),
                    "url": r.get("url", ""),
                    "snippet": r.get("description", ""),
                }
                for r in web_results[:max_results]
                if r.get("url")
            ]
            set_cached_lookup(
                db,
                "BRAVE_SEARCH",
                "web_search",
                query,
                http_status=resp.status_code,
                response_status="found" if normalized else "not_found",
                payload={"results": normalized},
            )
            items = [
                ExternalWebSearchResultItem(
                    title=r["title"],
                    url=r["url"],
                    snippet=r["snippet"],
                    provider="Brave Search",
                    retrieved_at=now_iso,
                )
                for r in normalized
            ]
            return items, {
                "provider": "Brave Search",
                "status": "found" if items else "not_found",
                "http_status": resp.status_code,
                "message": f"Retrieved {len(items)} web search result(s) from Brave Search.",
                "retrieved_at": now_iso,
            }
    except Exception as exc:
        return [], {
            "provider": "Brave Search",
            "status": "network_error",
            "message": f"Brave Search request failed ({exc.__class__.__name__}).",
            "retrieved_at": datetime.now(UTC).isoformat(),
        }


def _execute_tavily_search(
    db: Session, query: str, max_results: int
) -> tuple[list[ExternalWebSearchResultItem], dict[str, Any]]:
    cached = get_cached_lookup(db, "TAVILY_SEARCH", "web_search", query)
    if cached is not None:
        cache_row, payload = cached
        raw_items = (payload or {}).get("results") or []
        items = [
            ExternalWebSearchResultItem(
                title=r.get("title", ""),
                url=r.get("url", ""),
                snippet=r.get("snippet", ""),
                provider="Tavily Search",
                retrieved_at=cache_row.retrieved_at.isoformat(),
            )
            for r in raw_items[:max_results]
        ]
        return items, {
            "provider": "Tavily Search",
            "status": "cached_found" if items else "cached_not_found",
            "from_cache": True,
            "message": f"Retrieved {len(items)} web search result(s) from Tavily cache.",
            "retrieved_at": cache_row.retrieved_at.isoformat(),
        }

    enforce_provider_rate_limit("TAVILY_SEARCH")
    url = "https://api.tavily.com/search"
    payload = {
        "api_key": settings.TAVILY_API_KEY.strip(),
        "query": query,
        "max_results": max_results,
        "include_answer": False,
    }
    try:
        with httpx.Client(timeout=settings.WEB_SEARCH_TIMEOUT_SECONDS) as client:
            resp = client.post(url, json=payload)
            if resp.status_code >= 400:
                return [], {
                    "provider": "Tavily Search",
                    "status": "http_error",
                    "http_status": resp.status_code,
                    "message": f"Tavily Search returned HTTP {resp.status_code}.",
                    "retrieved_at": datetime.now(UTC).isoformat(),
                }
            data = resp.json()
            results = data.get("results") or []
            now_iso = datetime.now(UTC).isoformat()
            normalized = [
                {
                    "title": r.get("title", "Untitled"),
                    "url": r.get("url", ""),
                    "snippet": r.get("content", ""),
                }
                for r in results[:max_results]
                if r.get("url")
            ]
            set_cached_lookup(
                db,
                "TAVILY_SEARCH",
                "web_search",
                query,
                http_status=resp.status_code,
                response_status="found" if normalized else "not_found",
                payload={"results": normalized},
            )
            items = [
                ExternalWebSearchResultItem(
                    title=r["title"],
                    url=r["url"],
                    snippet=r["snippet"],
                    provider="Tavily Search",
                    retrieved_at=now_iso,
                )
                for r in normalized
            ]
            return items, {
                "provider": "Tavily Search",
                "status": "found" if items else "not_found",
                "http_status": resp.status_code,
                "message": f"Retrieved {len(items)} web search result(s) from Tavily Search.",
                "retrieved_at": now_iso,
            }
    except Exception as exc:
        return [], {
            "provider": "Tavily Search",
            "status": "network_error",
            "message": f"Tavily Search request failed ({exc.__class__.__name__}).",
            "retrieved_at": datetime.now(UTC).isoformat(),
        }
