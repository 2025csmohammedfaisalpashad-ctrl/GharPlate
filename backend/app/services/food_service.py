import difflib
import re
from sqlalchemy.orm import Session, joinedload

from app.db.seed_images import (
    FOOD_IMAGE_URLS,
    resolve_category_image_url,
    resolve_food_image_url,
)
from app.integrations.normalizer import (
    check_allergen_consistency,
    parse_and_clean_package_ingredients,
)
from app.models.entities import (
    FoodCategory,
    FoodItem,
    FoodNutrientValue,
    NutrientDefinition,
)
from app.schemas.api_schemas import (
    AllergenConsistencyOut,
    DataSourceOut,
    FoodAliasOut,
    FoodCategoryOut,
    FoodDetailOut,
    FoodSearchResponse,
    FoodSummaryOut,
    NutrientValueOut,
    ProductDataConflictOut,
    ProductFieldProvenanceOut,
    ServingConversionOut,
)


def normalize_query(q: str) -> str:
    return re.sub(r"[^a-z0-9\u0900-\u097f\u0c80-\u0cff]+", " ", q.lower()).strip()


def _resolve_display_image(food: FoodItem) -> tuple[str | None, bool]:
    """
    CRITICAL HONESTY RULE:
    For packaged products (`food.is_packaged == True`), NEVER substitute a generic category
    illustration (`Muesli.jpg`) as if it were the actual product packaging!
    Only return `image_url` if the product has a genuine stored `food.image_url` or an explicit
    slug match in `FOOD_IMAGE_URLS`. Otherwise return `(None, False)`.
    """
    explicit_db_img = getattr(food, "image_url", None)
    if explicit_db_img and explicit_db_img.strip():
        return explicit_db_img.strip(), True

    if food.is_packaged:
        curated_pkg_img = FOOD_IMAGE_URLS.get(food.slug)
        if curated_pkg_img:
            return curated_pkg_img, True
        return None, False

    cat_slug = food.category.slug if food.category else "indian-dishes"
    resolved_img = resolve_food_image_url(food.slug, cat_slug)
    return resolved_img, bool(resolved_img)


def serialize_food_summary(food: FoodItem, total_nutrient_defs: int = 20) -> FoodSummaryOut:
    key_codes = [
        "energy_kcal",
        "protein_g",
        "carbs_g",
        "sugars_total_g",
        "sugars_added_g",
        "fat_total_g",
        "fat_saturated_g",
        "fibre_g",
        "sodium_mg",
        "potassium_mg",
        "calcium_mg",
        "iron_mg",
    ]
    val_map: dict[str, float | None] = {nv.nutrient_code: nv.value for nv in food.nutrient_values}
    key_nutrients = {code: val_map.get(code, None) for code in key_codes}
    unavailable = [nv.nutrient_code for nv in food.nutrient_values if nv.value is None]
    available_count = sum(1 for nv in food.nutrient_values if nv.value is not None)
    completeness = round((available_count / max(total_nutrient_defs, 1)) * 100.0, 1)

    seen = set()
    aliases_out: list[FoodAliasOut] = []
    for al in food.aliases:
        k = (al.language, al.alias_text.lower())
        if k not in seen and al.alias_text.lower() != food.name_en.lower():
            seen.add(k)
            aliases_out.append(
                FoodAliasOut(
                    language=al.language,
                    alias_text=al.alias_text,
                    script_text=al.script_text,
                )
            )

    img_url, has_verified_img = _resolve_display_image(food)

    return FoodSummaryOut(
        id=food.id,
        slug=food.slug,
        ifct_code=food.ifct_code,
        name_en=food.name_en,
        image_url=img_url,
        has_verified_image=has_verified_img,
        category_slug=food.category.slug,
        category_name=food.category.name,
        is_packaged=food.is_packaged,
        brand=food.brand,
        barcode=food.barcode,
        net_quantity=getattr(food, "net_quantity", None),
        default_basis=food.default_basis,
        standard_serving_name=food.standard_serving_name,
        standard_serving_grams=food.standard_serving_grams,
        is_vegetarian=food.is_vegetarian,
        is_vegan=food.is_vegan,
        aliases=aliases_out,
        key_nutrients=key_nutrients,
        unavailable_nutrients=unavailable,
        completeness_pct=completeness,
        confidence_level=food.confidence_level,
        source_name=food.source.name,
        source_organization=food.source.organization,
        source_url=food.source.url,
        publication_year=food.source.publication_year,
    )


def serialize_food_detail(db: Session, food: FoodItem) -> FoodDetailOut:
    nutrient_defs = (
        db.query(NutrientDefinition).order_by(NutrientDefinition.display_order.asc()).all()
    )
    nv_by_code: dict[str, FoodNutrientValue] = {
        nv.nutrient_code: nv for nv in food.nutrient_values
    }
    serving_factor = food.standard_serving_grams / 100.0

    nutrients_out: list[NutrientValueOut] = []
    missing_codes: list[str] = []
    available_count = 0

    for nd in nutrient_defs:
        nv = nv_by_code.get(nd.code)
        val_100 = nv.value if nv is not None else None
        if val_100 is not None:
            available_count += 1
            val_serving = round(val_100 * serving_factor, 2)
        else:
            missing_codes.append(nd.code)
            val_serving = None

        src = nv.source if (nv is not None and nv.source is not None) else food.source
        nutrients_out.append(
            NutrientValueOut(
                nutrient_code=nd.code,
                nutrient_name=nd.name,
                unit=nd.unit,
                category=nd.category,
                value_per_100=val_100,
                value_for_serving=val_serving,
                basis=food.default_basis,
                is_available=(val_100 is not None),
                confidence_status=nv.confidence_status if nv else "not_measured",
                source_name=src.name,
                source_url=src.url,
                publication_year=src.publication_year,
                measurement_notes=nv.measurement_notes if nv else "Not reported in source dataset",
            )
        )

    completeness = round((available_count / max(len(nutrient_defs), 1)) * 100.0, 1)

    seen = set()
    aliases_out: list[FoodAliasOut] = []
    for al in food.aliases:
        k = (al.language, al.alias_text.lower())
        if k not in seen:
            seen.add(k)
            aliases_out.append(
                FoodAliasOut(
                    language=al.language,
                    alias_text=al.alias_text,
                    script_text=al.script_text,
                )
            )

    parsed_ing = parse_and_clean_package_ingredients(food.ingredients_text)
    consistency = check_allergen_consistency(
        food.ingredients_text,
        food.allergen_tags,
        food.allergen_declaration_complete,
    )

    if not food.allergen_declaration_complete or (food.is_packaged and not food.ingredients_text):
        allergen_disclaimer = (
            "IMPORTANT ALLERGEN NOTICE: Ingredient or cross-contamination data for this item is incomplete. "
            "GharPlate cannot establish whether this product is free from any allergen. Always inspect the physical package label."
        )
    elif consistency.requires_manual_review:
        allergen_disclaimer = (
            "ALLERGEN CONSISTENCY ALERT: Label ingredient/allergen text declares additional allergens ("
            + ", ".join(consistency.missing_from_stored_tags)
            + ") not present in stored allergen tags. Always verify the physical package label."
        )
    else:
        allergen_disclaimer = (
            "Allergen tags are data-based indications from reference composition or declared ingredients, NOT a clinical safety guarantee against mill or factory cross-contamination."
        )

    cat_out = FoodCategoryOut(
        id=food.category.id,
        slug=food.category.slug,
        name=food.category.name,
        description=food.category.description,
        image_url=getattr(food.category, "image_url", None)
        or resolve_category_image_url(food.category.slug),
        display_order=food.category.display_order,
    )
    img_url, has_verified_img = _resolve_display_image(food)

    provenance_rows = getattr(food, "field_provenance", None) or []
    conflict_rows = getattr(food, "data_conflicts", None) or []

    return FoodDetailOut(
        id=food.id,
        slug=food.slug,
        ifct_code=food.ifct_code,
        name_en=food.name_en,
        image_url=img_url,
        has_verified_image=has_verified_img,
        scientific_name=food.scientific_name,
        description=food.description,
        region_state=food.region_state,
        category=cat_out,
        is_packaged=food.is_packaged,
        brand=food.brand,
        barcode=food.barcode,
        net_quantity=getattr(food, "net_quantity", None) or parsed_ing.net_weight,
        default_basis=food.default_basis,
        standard_serving_name=food.standard_serving_name,
        standard_serving_grams=food.standard_serving_grams,
        is_vegetarian=food.is_vegetarian,
        is_vegan=food.is_vegan,
        allergen_tags=food.allergen_tags or [],
        intolerance_tags=food.intolerance_tags or [],
        dietary_tags=food.dietary_tags or [],
        ingredients_text=food.ingredients_text,
        cleaned_ingredients_text=getattr(food, "cleaned_ingredients_text", None)
        or parsed_ing.cleaned_ingredients,
        ingredient_items=parsed_ing.ingredient_items,
        ingredient_percentages=parsed_ing.ingredient_percentages,
        additives=parsed_ing.additives,
        allergen_statement=getattr(food, "allergen_statement", None)
        or parsed_ing.allergen_declaration,
        label_warnings=parsed_ing.label_warnings,
        manufacturer_info=getattr(food, "manufacturer_info", None)
        or parsed_ing.manufacturer_info,
        lot_and_date_info=parsed_ing.lot_and_date_info,
        ocr_uncertainty_notes=parsed_ing.ocr_uncertainty_notes,
        raw_ocr_text=getattr(food, "raw_ocr_text", None) or food.ingredients_text,
        allergen_declaration_complete=food.allergen_declaration_complete,
        allergen_safety_disclaimer=allergen_disclaimer,
        allergen_consistency=AllergenConsistencyOut(
            stored_allergen_tags=consistency.stored_allergen_tags,
            declared_allergens=consistency.declared_allergens,
            ingredient_inferred_allergens=consistency.ingredient_inferred_allergens,
            missing_from_stored_tags=consistency.missing_from_stored_tags,
            consistency_status=consistency.consistency_status,
            consistency_warnings=consistency.consistency_warnings,
            requires_manual_review=consistency.requires_manual_review,
        ),
        aliases=aliases_out,
        servings=[ServingConversionOut.model_validate(s) for s in food.servings],
        nutrients=nutrients_out,
        available_nutrient_count=available_count,
        missing_nutrient_codes=missing_codes,
        completeness_pct=completeness,
        confidence_level=food.confidence_level,
        conversion_methodology=food.conversion_methodology,
        date_imported=food.date_imported,
        external_updated_at=getattr(food, "external_updated_at", None),
        source=DataSourceOut.model_validate(food.source),
        field_provenance=[
            ProductFieldProvenanceOut.model_validate(p) for p in provenance_rows
        ],
        data_conflicts=[
            ProductDataConflictOut.model_validate(c) for c in conflict_rows
        ],
    )


def search_foods(
    db: Session,
    q: str | None = None,
    category_slug: str | None = None,
    is_packaged: bool | None = None,
    vegetarian_only: bool = False,
    nutrient_filter: str | None = None,
    sort_by: str = "relevance",
    page: int = 1,
    page_size: int = 20,
) -> FoodSearchResponse:
    query = db.query(FoodItem).options(
        joinedload(FoodItem.category),
        joinedload(FoodItem.source),
        joinedload(FoodItem.aliases),
        joinedload(FoodItem.nutrient_values),
    )

    if category_slug:
        query = query.join(FoodCategory).filter(FoodCategory.slug == category_slug)
    if is_packaged is not None:
        query = query.filter(FoodItem.is_packaged == is_packaged)
    if vegetarian_only:
        query = query.filter(FoodItem.is_vegetarian.is_(True))

    all_candidates: list[FoodItem] = query.all()
    total_defs = db.query(NutrientDefinition).count() or 20

    if nutrient_filter:
        filtered: list[FoodItem] = []
        for f in all_candidates:
            nv_map = {nv.nutrient_code: nv.value for nv in f.nutrient_values}
            if nutrient_filter == "high_protein" and (nv_map.get("protein_g") or 0) >= 10.0:
                filtered.append(f)
            elif nutrient_filter == "high_fibre" and (nv_map.get("fibre_g") or 0) >= 6.0:
                filtered.append(f)
            elif nutrient_filter == "high_calcium" and (nv_map.get("calcium_mg") or 0) >= 100.0:
                filtered.append(f)
            elif nutrient_filter == "high_iron" and (nv_map.get("iron_mg") or 0) >= 3.0:
                filtered.append(f)
            elif (
                nutrient_filter == "low_sodium"
                and nv_map.get("sodium_mg") is not None
                and nv_map["sodium_mg"] <= 50.0
            ):
                filtered.append(f)
        all_candidates = filtered

    scored_items: list[tuple[float, FoodItem]] = []
    suggestions: list[str] = []

    if q and q.strip():
        norm_q = normalize_query(q)
        tokens = [t for t in norm_q.split() if t]

        all_vocab: dict[str, str] = {}
        for item in all_candidates:
            best_score = 0.0
            name_norm = normalize_query(item.name_en)
            brand_norm = normalize_query(item.brand or "")
            all_vocab[name_norm] = item.name_en

            if norm_q == name_norm or norm_q == item.slug.replace("-", " ") or (item.barcode and norm_q == item.barcode):
                best_score = max(best_score, 100.0)
            elif name_norm.startswith(norm_q):
                best_score = max(best_score, 90.0)
            elif norm_q in name_norm or (brand_norm and norm_q in f"{brand_norm} {name_norm}"):
                best_score = max(best_score, 80.0)

            for al in item.aliases:
                al_norm = al.normalized_text
                all_vocab[al_norm] = f"{al.alias_text} ({item.name_en})"
                if norm_q == al_norm:
                    best_score = max(best_score, 98.0)
                elif al_norm.startswith(norm_q):
                    best_score = max(best_score, 88.0)
                elif norm_q in al_norm:
                    best_score = max(best_score, 78.0)
                else:
                    for tok in al_norm.split():
                        ratio = difflib.SequenceMatcher(None, norm_q, tok).ratio()
                        if ratio >= 0.72:
                            best_score = max(best_score, ratio * 75.0)
                    full_ratio = difflib.SequenceMatcher(None, norm_q, al_norm).ratio()
                    if full_ratio >= 0.70:
                        best_score = max(best_score, full_ratio * 72.0)

            if tokens and best_score < 70.0:
                searchable_blob = " ".join(
                    [name_norm, brand_norm, item.category.name.lower()]
                    + [a.normalized_text for a in item.aliases]
                )
                matched_tokens = sum(1 for t in tokens if t in searchable_blob)
                if matched_tokens > 0:
                    best_score = max(best_score, 60.0 * (matched_tokens / len(tokens)))

            if best_score >= 52.0:
                scored_items.append((best_score, item))

        scored_items.sort(key=lambda x: (-x[0], x[1].name_en))
        close_keys = difflib.get_close_matches(norm_q, list(all_vocab.keys()), n=5, cutoff=0.55)
        for ck in close_keys:
            label = all_vocab[ck]
            if label not in suggestions:
                suggestions.append(label)
    else:
        scored_items = [(1.0, item) for item in all_candidates]
        scored_items.sort(key=lambda x: x[1].name_en)

    matched_foods = [item for _, item in scored_items]

    if sort_by == "name_asc":
        matched_foods.sort(key=lambda f: f.name_en.lower())
    elif sort_by == "protein_desc":
        matched_foods.sort(
            key=lambda f: next(
                (nv.value for nv in f.nutrient_values if nv.nutrient_code == "protein_g" and nv.value is not None),
                -1.0,
            ),
            reverse=True,
        )
    elif sort_by == "fibre_desc":
        matched_foods.sort(
            key=lambda f: next(
                (nv.value for nv in f.nutrient_values if nv.nutrient_code == "fibre_g" and nv.value is not None),
                -1.0,
            ),
            reverse=True,
        )
    elif sort_by == "energy_asc":
        matched_foods.sort(
            key=lambda f: next(
                (nv.value for nv in f.nutrient_values if nv.nutrient_code == "energy_kcal" and nv.value is not None),
                99999.0,
            )
        )

    total = len(matched_foods)
    start = max((page - 1) * page_size, 0)
    end = start + page_size
    paginated = matched_foods[start:end]

    return FoodSearchResponse(
        query=q,
        category=category_slug,
        total=total,
        page=page,
        page_size=page_size,
        suggestions=suggestions[:5],
        items=[serialize_food_summary(f, total_defs) for f in paginated],
    )
