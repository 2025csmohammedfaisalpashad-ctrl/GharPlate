"""
Provider-Independent Normalization, Barcode Validation, Ingredient/Allergen Extraction,
and Identity Verification for GharPlate.
"""

import difflib
import re
from dataclasses import dataclass, field
from datetime import datetime, UTC


@dataclass
class ParsedIngredientAnalysis:
    raw_text: str | None = None
    cleaned_ingredients: str | None = None
    ingredient_items: list[str] = field(default_factory=list)
    ingredient_percentages: list[str] = field(default_factory=list)
    additives: list[str] = field(default_factory=list)
    allergen_declaration: str | None = None
    label_warnings: list[str] = field(default_factory=list)
    net_weight: str | None = None
    manufacturer_info: str | None = None
    lot_and_date_info: str | None = None
    ocr_uncertainty_notes: list[str] = field(default_factory=list)


@dataclass
class AllergenConsistencyReport:
    stored_allergen_tags: list[str] = field(default_factory=list)
    declared_allergens: list[str] = field(default_factory=list)
    ingredient_inferred_allergens: list[str] = field(default_factory=list)
    missing_from_stored_tags: list[str] = field(default_factory=list)
    consistency_status: str = "consistent"  # consistent, inconsistent_missing_tags, incomplete_declaration
    consistency_warnings: list[str] = field(default_factory=list)
    requires_manual_review: bool = False


@dataclass
class NormalizedExternalProduct:
    provider_code: str  # OPEN_FOOD_FACTS, USDA_FDC
    provider_name: str
    source_url: str
    source_record_id: str
    barcode: str | None = None
    product_name: str | None = None
    brand: str | None = None
    quantity: str | None = None
    serving_size_label: str | None = None
    serving_size_grams: float | None = None
    image_url: str | None = None
    front_image_url: str | None = None
    nutrition_image_url: str | None = None
    ingredients_image_url: str | None = None
    ingredients_text: str | None = None
    allergen_tags: list[str] = field(default_factory=list)
    categories: list[str] = field(default_factory=list)
    nutrients_per_100: dict[str, float | None] = field(default_factory=dict)
    available_fields: list[str] = field(default_factory=list)
    missing_fields: list[str] = field(default_factory=list)
    is_branded_packaged: bool = True
    data_version: str = "v3"
    retrieved_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    license_attribution: str = ""


def compute_gs1_check_digit(digits_without_check: str) -> int:
    """Computes standard GS1 Modulo-10 check digit for EAN-8, UPC-A, EAN-13, and GTIN-14."""
    reversed_digits = [int(d) for d in reversed(digits_without_check)]
    total = 0
    for idx, d in enumerate(reversed_digits):
        weight = 3 if idx % 2 == 0 else 1
        total += d * weight
    return (10 - (total % 10)) % 10


def validate_and_normalize_barcode(
    raw_barcode: str,
) -> tuple[str, bool, str, str | None]:
    """
    Validates and normalizes EAN-8 (8), UPC-A (12), EAN-13 (13), and GTIN-14 (14) barcodes.
    Returns: (cleaned_barcode, is_valid, barcode_format, validation_message)
    """
    if not raw_barcode or not raw_barcode.strip():
        return "", False, "empty", "Barcode cannot be empty."

    cleaned = re.sub(r"[\s\-]+", "", raw_barcode.strip())
    if not cleaned.isdigit():
        return (
            re.sub(r"[^0-9A-Za-z]", "", cleaned),
            False,
            "invalid_characters",
            "Barcode must contain only digits (EAN-8, UPC-A, EAN-13, or GTIN-14).",
        )

    length = len(cleaned)
    format_map = {
        8: "EAN-8",
        12: "UPC-A",
        13: "EAN-13",
        14: "GTIN-14",
    }
    if length not in format_map:
        return (
            cleaned,
            False,
            "invalid_length",
            f"Barcode length ({length} digits) is not a standard EAN-8 (8), UPC-A (12), EAN-13 (13), or GTIN-14 (14) code.",
        )

    b_format = format_map[length]
    expected_check = compute_gs1_check_digit(cleaned[:-1])
    actual_check = int(cleaned[-1])
    if expected_check != actual_check:
        return (
            cleaned,
            True,
            b_format,
            f"Note: {b_format} check digit ({actual_check}) differs from standard GS1 Modulo-10 ({expected_check}); proceeding with exact digit lookup.",
        )
    return cleaned, True, b_format, None


def parse_and_clean_package_ingredients(raw_text: str | None) -> ParsedIngredientAnalysis:
    """
    Distinguishes and separates:
    - Ingredient statement
    - Ingredient percentages
    - Additives (INS / E-numbers)
    - Explicit allergen declarations
    - Label warnings (e.g., polyols laxative warning)
    - Net weight
    - Manufacturer & address metadata
    - Lot / MRP / date metadata
    - OCR character uncertainty notes
    Preserves the original text verbatim while generating a clean, readable ingredient statement.
    """
    analysis = ParsedIngredientAnalysis(raw_text=raw_text)
    if not raw_text or not raw_text.strip():
        return analysis

    text = raw_text.strip()

    # 1. Detect known OCR character ambiguities in package text without discarding original text
    ocr_typo_patterns = [
        (r"\bONS\s*2113?\b", "Possible OCR typo 'ONS 2113' for preservative INS 211 (Sodium Benzoate)."),
        (r"\bSINTHETIC\b", "OCR spelling 'SINTHETIC' detected for 'SYNTHETIC'."),
        (r"\bIMS\s*(\d{3})\b", "OCR prefix 'IMS' detected for 'INS' (International Numbering System) additive code."),
        (r"\bINS\s*500\s*\(H\)", "OCR suffix 'INS 500(H)' detected for 'INS 500(ii)' (Sodium Bicarbonate)."),
    ]
    for pat, note in ocr_typo_patterns:
        if re.search(pat, text, re.IGNORECASE):
            analysis.ocr_uncertainty_notes.append(note)

    # 2. Extract explicit allergen declaration (e.g. "CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS.")
    allergen_match = re.search(
        r"((?:allergen\s*(?:information|advice|declaration)\s*[:\-]\s*[^\n]+)|(?:contains\s+[a-z0-9\s,&()\-]+?(?:ingredients|allergens|\.))|(?:may\s+contain\s+traces\s+of\s+[^\n.]+))",
        text,
        re.IGNORECASE,
    )
    if allergen_match:
        analysis.allergen_declaration = allergen_match.group(1).strip().rstrip(".") + "."

    # 3. Extract label warnings (e.g., "POLYOLS MAY HAVE LAXATIVE EFFECTS.")
    for warn_pat in [
        r"(polyols\s+may\s+have\s+laxative\s+effects\.?)",
        r"(not\s+recommended\s+for\s+children[^\n.]*\.?)",
        r"(contains\s+artificial\s+sweetener[^\n.]*\.?)",
    ]:
        wm = re.search(warn_pat, text, re.IGNORECASE)
        if wm:
            analysis.label_warnings.append(wm.group(1).strip().rstrip(".") + ".")

    # 4. Extract Net Weight / Quantity if present
    nw_match = re.search(
        r"(?:(\d+\s*(?:g|gm|grams|ml|kg))\s+net\s*(?:weight|wt|qty|quantity)|net\s*(?:weight|wt|qty|quantity)\s*[:\-]?\s*(\d+\s*(?:g|gm|grams|ml|kg)?))",
        text,
        re.IGNORECASE,
    )
    if nw_match:
        raw_nw = (nw_match.group(1) or nw_match.group(2) or "").strip()
        if raw_nw:
            if raw_nw.isdigit():
                raw_nw = f"{raw_nw} g"
            analysis.net_weight = raw_nw
    else:
        # Check pattern like "KEEP YOUR CITY CLEAN 110 NET WEIGHT:"
        alt_nw = re.search(r"\b(\d{2,4})\s+NET\s+WEIGHT\b", text, re.IGNORECASE)
        if alt_nw:
            analysis.net_weight = f"{alt_nw.group(1)} g"

    # 5. Extract Manufacturer info
    mfg_match = re.search(
        r"((?:manufactured|marketed|packed)\s+by[^\n]+|[A-Z][A-Z\s.&]+PVT\.?\s*LTD\.?[^\n]*)",
        text,
        re.IGNORECASE,
    )
    if mfg_match:
        analysis.manufacturer_info = mfg_match.group(1).strip()

    # 6. Extract Lot / Date / MRP metadata
    lot_match = re.search(
        r"(MRP\s*:.*?(?:USE\s+BY\s*:|BEST\s+BEFORE\s*:|LOT\s+NO\.?\s*:)[^\n]*)",
        text,
        re.IGNORECASE,
    )
    if lot_match:
        analysis.lot_and_date_info = lot_match.group(1).strip()

    # 7. Extract Ingredient Percentages (e.g., "FRUIT CUTS (5%)", "PINEAPPLE CUTS (2%)")
    for pct_m in re.finditer(r"([A-Za-z][A-Za-z\s]+?\(\s*\d+(?:\.\d+)?\s*%\s*\))", text):
        val = pct_m.group(1).strip()
        if val not in analysis.ingredient_percentages:
            analysis.ingredient_percentages.append(val)

    # 8. Extract Additive Codes (INS / E-numbers, including OCR variants IMS/ONS normalized for summary)
    for add_m in re.finditer(
        r"\b(?:INS|IMS|ONS|E)\s*[-]?\s*(\d{3,4}(?:\s*\([a-zA-Z0-9]+\))?)",
        text,
        re.IGNORECASE,
    ):
        raw_num = add_m.group(1).strip()
        if raw_num == "2113":
            norm_code = "INS 211 (OCR read 'ONS 2113')"
        elif raw_num.upper() == "500(H)":
            norm_code = "INS 500(ii) (OCR read 'INS 500(H)')"
        else:
            norm_code = f"INS {raw_num}"
        if norm_code not in analysis.additives:
            analysis.additives.append(norm_code)

    # 9. Produce cleaned ingredient statement (strip non-ingredient tail sections)
    cleaned = re.sub(r"^\s*ingredients?\s*[:\-]\s*", "", text, flags=re.IGNORECASE)
    cutoff_patterns = [
        r"\(\s*Numbers\s+in\s+brackets\s+as\s+per\s+International\s+Numbering\s+System\s*\)\.?",
        r"\bCONTAINS\s+[A-Z0-9\s,&]+\s+INGREDIENTS\.?",
        r"\bALLERGEN\s+(?:INFORMATION|ADVICE|DECLARATION)\b.*",
        r"\bPOLYOLS\s+MAY\s+HAVE\s+LAXATIVE\s+EFFECTS\.?",
        r"\bKEEP\s+YOUR\s+CITY\s+CLEAN\b.*",
        r"\bNET\s+WEIGHT\s*:.*",
        r"\bMRP\s*:.*",
        r"\bLOT\s+NO\.?\s*:.*",
    ]
    for cp in cutoff_patterns:
        m = re.search(cp, cleaned, re.IGNORECASE)
        if m:
            cleaned = cleaned[: m.start()].strip()

    cleaned = cleaned.rstrip(".,; ") + "." if cleaned else None
    analysis.cleaned_ingredients = cleaned

    if cleaned:
        # Split top-level commas (outside parentheses/brackets) for scannable pills
        top_items: list[str] = []
        depth = 0
        current: list[str] = []
        for ch in cleaned.rstrip("."):
            if ch in "([":
                depth += 1
                current.append(ch)
            elif ch in ")]":
                depth = max(0, depth - 1)
                current.append(ch)
            elif ch == "," and depth == 0:
                piece = "".join(current).strip()
                if piece:
                    top_items.append(piece)
                current = []
            else:
                current.append(ch)
        tail = "".join(current).strip()
        if tail:
            top_items.append(tail)
        analysis.ingredient_items = top_items

    return analysis


CANONICAL_ALLERGEN_SYNONYMS: dict[str, list[str]] = {
    "gluten": ["wheat", "maida", "atta", "sooji", "rava", "semolina", "barley", "rye", "oats", "gluten"],
    "milk": ["milk", "dairy", "whey", "casein", "lactose", "butter", "ghee", "cheese", "paneer", "curd"],
    "egg": ["egg", "eggs", "albumin", "egg white", "egg yolk"],
    "soy": ["soy", "soya", "soybean", "soy lecithin", "soya lecithin", "ins 322"],
    "peanut": ["peanut", "peanuts", "groundnut", "groundnuts", "arachis"],
    "tree_nut": ["almond", "almonds", "badam", "cashew", "cashews", "kaju", "walnut", "walnuts", "pistachio", "hazelnut", "pecan"],
    "sesame": ["sesame", "til", "gingelly"],
    "mustard": ["mustard", "rai", "sarson"],
    "fish": ["fish", "rohu", "anchovy", "cod", "tuna", "salmon"],
    "shellfish": ["prawn", "shrimp", "crab", "lobster", "shellfish"],
    "sulphites": ["sulphite", "sulfite", "sulphur dioxide", "ins 220", "ins 223"],
}


def normalize_allergen_tag_name(raw_tag: str) -> str:
    t = raw_tag.strip().lower().replace("en:", "")
    if t in ("eggs", "egg"):
        return "egg"
    if t in ("wheat", "gluten", "cereals-containing-gluten"):
        return "gluten"
    if t in ("milk", "dairy"):
        return "milk"
    if t in ("soy", "soya", "soybeans"):
        return "soy"
    if t in ("peanuts", "peanut", "groundnut"):
        return "peanut"
    if t in ("nuts", "tree-nuts", "tree_nut", "almonds", "cashews", "walnuts"):
        return "tree_nut"
    return t


def check_allergen_consistency(
    ingredients_text: str | None,
    stored_allergen_tags: list[str] | None,
    allergen_declaration_complete: bool = True,
) -> AllergenConsistencyReport:
    """
    Checks consistency between:
    1. Explicit allergen declarations in label text (e.g., 'CONTAINS WHEAT, MILK, EGG AND SOY INGREDIENTS')
    2. Parsed ingredient keywords
    3. Stored allergen_tags in the database
    Flags missing or conflicting allergen tags for manual review without silently discarding or fabricating safety.
    """
    parsed = parse_and_clean_package_ingredients(ingredients_text)
    normalized_stored = sorted(
        list({normalize_allergen_tag_name(t) for t in (stored_allergen_tags or []) if t})
    )

    declared_set = set()
    if parsed.allergen_declaration:
        decl_lower = parsed.allergen_declaration.lower()
        for canon, keywords in CANONICAL_ALLERGEN_SYNONYMS.items():
            if any(re.search(rf"\b{re.escape(kw)}\b", decl_lower) for kw in keywords):
                declared_set.add(canon)

    inferred_set = set()
    ing_lower = (parsed.cleaned_ingredients or ingredients_text or "").lower()
    if ing_lower:
        for canon, keywords in CANONICAL_ALLERGEN_SYNONYMS.items():
            if any(re.search(rf"\b{re.escape(kw)}\b", ing_lower) for kw in keywords):
                inferred_set.add(canon)

    all_detected = sorted(list(declared_set | inferred_set))
    missing_from_stored = [a for a in all_detected if a not in normalized_stored]

    warnings: list[str] = []
    status = "consistent"
    requires_review = False

    if missing_from_stored:
        status = "inconsistent_missing_tags"
        requires_review = True
        missing_str = ", ".join(missing_from_stored)
        warnings.append(
            f"Allergen consistency alert: Label text or ingredient declaration mentions [{missing_str}], "
            f"which is missing from stored allergen tags ({', '.join(normalized_stored) or 'none'}). "
            "Flagged for review and included in active allergen warnings."
        )

    if not ingredients_text or not allergen_declaration_complete:
        if status == "consistent":
            status = "incomplete_declaration"
        warnings.append(
            "Allergen declaration or ingredient statement is incomplete. GharPlate cannot guarantee absence of any allergen."
        )

    return AllergenConsistencyReport(
        stored_allergen_tags=normalized_stored,
        declared_allergens=sorted(list(declared_set)),
        ingredient_inferred_allergens=sorted(list(inferred_set)),
        missing_from_stored_tags=missing_from_stored,
        consistency_status=status,
        consistency_warnings=warnings,
        requires_manual_review=requires_review,
    )


def verify_product_identity_match(
    local_barcode: str | None,
    local_name: str,
    local_brand: str | None,
    ext: NormalizedExternalProduct,
) -> tuple[bool, str, float]:
    """
    Verifies whether an external product record matches a local packaged product record.
    Priority:
    1. Exact barcode match + compatible product name/brand (never merge a completely unrelated product if a barcode is recycled/mis-indexed).
    2. Careful brand + product-name similarity evaluation for non-barcode candidate searches.
    Returns (is_verified_same_product, reason, similarity_score).
    """
    local_name_norm = re.sub(r"[^a-z0-9]+", " ", (local_name or "").lower()).strip()
    ext_name_norm = re.sub(r"[^a-z0-9]+", " ", (ext.product_name or "").lower()).strip()
    local_brand_norm = re.sub(r"[^a-z0-9]+", " ", (local_brand or "").lower()).strip()
    ext_brand_norm = re.sub(r"[^a-z0-9]+", " ", (ext.brand or "").lower()).strip()

    name_ratio = (
        difflib.SequenceMatcher(None, local_name_norm, ext_name_norm).ratio()
        if local_name_norm and ext_name_norm
        else 0.0
    )
    local_tokens = set(local_name_norm.split())
    ext_tokens = set(ext_name_norm.split())
    token_overlap = (
        len(local_tokens & ext_tokens) / max(len(local_tokens), 1)
        if local_tokens and ext_tokens
        else 0.0
    )

    if local_barcode and ext.barcode and local_barcode.strip() == ext.barcode.strip():
        # Exact barcode match — verify external record has a non-contradictory product identity
        if not ext_name_norm:
            return (
                True,
                f"Exact barcode match ({local_barcode}); external record has no conflicting product title.",
                0.85,
            )
        if token_overlap >= 0.35 or name_ratio >= 0.45 or (
            local_brand_norm and local_brand_norm in ext_brand_norm
        ):
            return (
                True,
                f"Exact barcode match ({local_barcode}) and verified product/brand identity ('{ext.product_name}' / '{ext.brand}').",
                round(max(name_ratio, token_overlap, 0.92), 2),
            )
        return (
            False,
            f"Exact barcode ({local_barcode}) matched, but external product title '{ext.product_name}' ({ext.brand}) conflicts with local product '{local_name}' ({local_brand}). Flagged as conflict for manual review.",
            round(name_ratio, 2),
        )

    # Without an exact barcode match, never auto-merge — require user selection of candidates
    combined_score = round((name_ratio * 0.65) + (token_overlap * 0.35), 2)
    return (
        False,
        "External record does not share an exact verified barcode; returned as a search candidate requiring user confirmation.",
        combined_score,
    )
