"""
Controlled, Repeatable Nutrient & Food Composition Ingestion CLI / Service (`backend/app/db/nutrient_import_cli.py`).

Executes transactional validation, unit normalization checks, duplicate detection, provenance verification,
and database seeding for the GharPlate Indian Food Composition Database, outputting a full audit report.

Usage:
    cd backend && ./.venv/bin/python -m app.db.nutrient_import_cli
"""

from __future__ import annotations

import json
import sys
from typing import Any

from app.db.init_db import seed_database
from app.db.seed_catalog import DATA_SOURCES_SEED, NUTRIENT_DEFINITIONS_SEED
from app.db.seed_expanded_nutrients_and_foods import (
    EXISTING_FOODS_NUTRIENT_ENRICHMENT,
    EXPANDED_DATA_SOURCES_SEED,
    EXPANDED_FOOD_ITEMS_SEED,
    EXPANDED_NUTRIENT_DEFINITIONS_SEED,
)
from app.db.seed_foods_part1 import FOOD_ITEMS_SEED
from app.db.seed_foods_part2 import FOOD_ITEMS_SEED_PART2
from app.db.seed_foods_part3 import FOOD_ITEMS_SEED_PART3
from app.db.seed_foods_part4 import FOOD_ITEMS_SEED_PART4
from app.db.session import Base, SessionLocal, engine
from app.services.nutrient_food_search_service import (
    get_database_import_and_coverage_summary,
)

ALLOWED_UNITS = {"kcal", "g", "mg", "mcg"}


def validate_seed_integrity() -> dict[str, Any]:
    """
    Validates all nutrient definitions, units, food slugs, data source codes, and numeric bounds
    prior to database commit.
    """
    errors: list[str] = []
    warnings: list[str] = []

    valid_source_codes = {
        s["code"] for s in DATA_SOURCES_SEED + EXPANDED_DATA_SOURCES_SEED
    }
    valid_nutrient_codes: dict[str, str] = {}
    for nd in NUTRIENT_DEFINITIONS_SEED + EXPANDED_NUTRIENT_DEFINITIONS_SEED:
        code = nd["code"]
        unit = nd["unit"]
        if unit not in ALLOWED_UNITS:
            errors.append(f"Nutrient '{code}' has unsupported unit '{unit}'.")
        valid_nutrient_codes[code] = unit

    all_foods = (
        FOOD_ITEMS_SEED
        + FOOD_ITEMS_SEED_PART2
        + FOOD_ITEMS_SEED_PART3
        + FOOD_ITEMS_SEED_PART4
        + EXPANDED_FOOD_ITEMS_SEED
    )

    seen_slugs: set[str] = set()
    duplicate_slugs: list[str] = []

    for f in all_foods:
        slug = f["slug"]
        if slug in seen_slugs:
            duplicate_slugs.append(slug)
        seen_slugs.add(slug)

        src_code = f.get("source_code")
        if src_code not in valid_source_codes:
            errors.append(f"Food '{slug}' references unknown source_code '{src_code}'.")

        nuts = dict(f.get("nutrients") or {})
        enrichment = EXISTING_FOODS_NUTRIENT_ENRICHMENT.get(slug) or {}
        for k, v in enrichment.items():
            nuts[k.strip()] = v

        for n_code, n_val in nuts.items():
            clean_code = n_code.strip()
            if clean_code not in valid_nutrient_codes:
                errors.append(f"Food '{slug}' references undefined nutrient '{clean_code}'.")
            if n_val is not None:
                if not isinstance(n_val, int | float) or n_val < 0:
                    errors.append(f"Food '{slug}' has invalid negative/non-numeric value for '{clean_code}': {n_val}")

    return {
        "valid": len(errors) == 0,
        "total_seed_records_checked": len(all_foods),
        "unique_food_slugs": len(seen_slugs),
        "duplicate_slugs_skipped": duplicate_slugs,
        "total_validated_nutrients": len(valid_nutrient_codes),
        "errors": errors,
        "warnings": warnings,
    }


def run_controlled_nutrient_import() -> dict[str, Any]:
    precheck = validate_seed_integrity()
    if not precheck["valid"]:
        raise ValueError(f"Pre-import validation failed: {precheck['errors']}")

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_report = seed_database(db, write_report=True)
        coverage_summary = get_database_import_and_coverage_summary(db)
        return {
            "status": "SUCCESS",
            "precheck": precheck,
            "seed_report": seed_report,
            "coverage_summary": coverage_summary,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    result = run_controlled_nutrient_import()
    print(json.dumps(result, indent=2))
    sys.exit(0)
