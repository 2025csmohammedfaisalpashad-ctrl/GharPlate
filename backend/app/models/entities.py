from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DataSource(Base):
    __tablename__ = "data_sources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    organization: Mapped[str] = mapped_column(String(200), nullable=False)
    document_title: Mapped[str] = mapped_column(String(300), nullable=False)
    publication_year: Mapped[int] = mapped_column(Integer, nullable=False)
    version: Mapped[str] = mapped_column(String(80), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    license_notes: Mapped[str] = mapped_column(Text, nullable=False)
    source_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="official"
    )  # official, clinical_guideline, third_party_open, user_entered, ocr_extracted
    imported_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class FoodCategory(Base):
    __tablename__ = "food_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    foods: Mapped[List["FoodItem"]] = relationship("FoodItem", back_populates="category")


class FoodTag(Base):
    """
    Structured, reusable food characteristic tag definition.
    Separates dietary classifications, digestive traits, nutritional characteristics, and allergen indications.
    """
    __tablename__ = "food_tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    tag_domain: Mapped[str] = mapped_column(
        String(60), index=True, nullable=False
    )  # dietary_classification, digestive_characteristic, nutritional_characteristic, allergen_indication, intolerance_marker
    description: Mapped[str] = mapped_column(Text, nullable=False)


class FoodItemTag(Base):
    """
    Structured relational link between an individual FoodItem and a FoodTag.
    """
    __tablename__ = "food_item_tags"
    __table_args__ = (
        UniqueConstraint("food_id", "tag_id", name="uq_food_item_tag"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tag_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_tags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    derivation_note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="structured_tags")
    tag: Mapped["FoodTag"] = relationship("FoodTag")


class FoodItem(Base):
    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    ifct_code: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    name_en: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    scientific_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    region_state: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)

    is_packaged: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(64), unique=True, index=True, nullable=True)
    net_quantity: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    default_basis: Mapped[str] = mapped_column(String(20), default="100g", nullable=False)  # 100g or 100ml
    standard_serving_name: Mapped[str] = mapped_column(String(100), default="1 standard serving", nullable=False)
    standard_serving_grams: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)

    is_vegetarian: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_vegan: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allergen_tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    intolerance_tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    dietary_tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    ingredients_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cleaned_ingredients_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allergen_statement: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_ocr_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    manufacturer_info: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    allergen_declaration_complete: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    confidence_level: Mapped[str] = mapped_column(
        String(40), default="high", nullable=False
    )  # high, medium, label_declared, user_entered, incomplete
    conversion_methodology: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date_imported: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    external_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    category: Mapped["FoodCategory"] = relationship("FoodCategory", back_populates="foods")
    source: Mapped["DataSource"] = relationship("DataSource")
    aliases: Mapped[List["FoodAlias"]] = relationship(
        "FoodAlias", back_populates="food", cascade="all, delete-orphan"
    )
    nutrient_values: Mapped[List["FoodNutrientValue"]] = relationship(
        "FoodNutrientValue", back_populates="food", cascade="all, delete-orphan"
    )
    servings: Mapped[List["ServingConversion"]] = relationship(
        "ServingConversion", back_populates="food", cascade="all, delete-orphan"
    )
    structured_tags: Mapped[List["FoodItemTag"]] = relationship(
        "FoodItemTag", back_populates="food", cascade="all, delete-orphan"
    )
    condition_mappings: Mapped[List["ConditionFoodMapping"]] = relationship(
        "ConditionFoodMapping", back_populates="food", cascade="all, delete-orphan"
    )
    field_provenance: Mapped[List["ProductFieldProvenance"]] = relationship(
        "ProductFieldProvenance", back_populates="food", cascade="all, delete-orphan"
    )
    data_conflicts: Mapped[List["ProductDataConflict"]] = relationship(
        "ProductDataConflict", back_populates="food", cascade="all, delete-orphan"
    )


class ProductFieldProvenance(Base):
    """
    Stores field-level data provenance for packaged products and foods.
    Preserves field value, data source, source record identifier, confidence, retrieval date, and review status.
    """
    __tablename__ = "product_field_provenance"
    __table_args__ = (
        UniqueConstraint("food_id", "field_name", "source_code", name="uq_product_field_provenance"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(
        String(100), nullable=False, index=True
    )  # e.g., "image_url", "ingredients_text", "allergen_tags", "energy_kcal", "protein_g"
    field_type: Mapped[str] = mapped_column(
        String(50), nullable=False, default="metadata"
    )  # metadata, ingredient, allergen, nutrient, image
    field_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    source_record_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    confidence_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="user_confirmed"
    )  # user_confirmed, external_verified_barcode, ocr_extracted, verified_ifct, fdc_supplemental
    review_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="confirmed"
    )  # confirmed, pending_user_review, auto_merged_missing
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="field_provenance")


class ProductDataConflict(Base):
    """
    Records conflicts between local user-confirmed/stored data and external provider records
    so nothing is silently overwritten and conflicts are surfaced for user review.
    """
    __tablename__ = "product_data_conflicts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    field_name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    local_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    local_source: Mapped[str] = mapped_column(String(150), nullable=False)
    external_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    external_source: Mapped[str] = mapped_column(String(150), nullable=False)
    external_source_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    resolution_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="requires_user_review"
    )  # requires_user_review, kept_local, accepted_external
    detected_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="data_conflicts")


class ExternalLookupCache(Base):
    """
    Persistent SQLite cache for Open Food Facts, USDA FoodData Central, and External Web Search responses.
    Prevents repeated remote API calls for the same barcode or search query.
    """
    __tablename__ = "external_lookup_cache"
    __table_args__ = (
        UniqueConstraint("cache_key", name="uq_external_lookup_cache_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    cache_key: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    provider_name: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    lookup_type: Mapped[str] = mapped_column(String(60), index=True, nullable=False)  # barcode, search, detail
    query_value: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    http_status: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    response_status: Mapped[str] = mapped_column(
        String(60), nullable=False, default="ok"
    )  # found, not_found, error, rate_limited
    payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class FoodAlias(Base):
    __tablename__ = "food_aliases"
    __table_args__ = (
        Index("ix_food_aliases_normalized_lang", "normalized_text", "language"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    language: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # en, hi, kn, ta, te, etc.
    alias_text: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    normalized_text: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    script_text: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="aliases")


class NutrientDefinition(Base):
    __tablename__ = "nutrient_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    unit: Mapped[str] = mapped_column(String(30), nullable=False)
    category: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # macronutrient, mineral, vitamin
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class FoodNutrientValue(Base):
    """
    Stores per-basis (100g or 100ml) nutrient values.
    CRITICAL RULE: Missing nutrients MUST have value = None (NULL), NEVER 0.
    """
    __tablename__ = "food_nutrient_values"
    __table_args__ = (
        UniqueConstraint("food_id", "nutrient_code", name="uq_food_nutrient_code"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nutrient_code: Mapped[str] = mapped_column(
        String(60), ForeignKey("nutrient_definitions.code", ondelete="RESTRICT"), nullable=False, index=True
    )
    value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # NULL = unknown/unmeasured
    basis: Mapped[str] = mapped_column(String(20), default="100g", nullable=False)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    confidence_status: Mapped[str] = mapped_column(
        String(50), default="verified_ifct", nullable=False
    )  # verified_ifct, verified_recipe_calc, label_declared, openfoodfacts, user_entered, not_measured
    measurement_notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="nutrient_values")
    nutrient: Mapped["NutrientDefinition"] = relationship("NutrientDefinition")
    source: Mapped["DataSource"] = relationship("DataSource")


class ServingConversion(Base):
    __tablename__ = "serving_conversions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_name: Mapped[str] = mapped_column(String(60), nullable=False)  # 100g, 100ml, cup, katori, piece, roti, tbsp, tsp, bowl
    unit_label: Mapped[str] = mapped_column(String(120), nullable=False)
    grams_equivalent: Mapped[float] = mapped_column(Float, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    conversion_source: Mapped[str] = mapped_column(
        String(200), default="ICMR-NIN Household Measures Standardisation (DGI 2024)", nullable=False
    )

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="servings")


class HealthCondition(Base):
    __tablename__ = "health_conditions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    condition_group_code: Mapped[str] = mapped_column(String(60), index=True, nullable=False)
    condition_group_name: Mapped[str] = mapped_column(String(150), nullable=False)
    is_short_term_illness: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_special_life_stage: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    applicable_age_groups: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    nutritional_meaning: Mapped[str] = mapped_column(Text, nullable=False)
    relevant_nutrients: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    relevant_food_groups: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    evidence_dietary_patterns: Mapped[str] = mapped_column(Text, nullable=False)
    portion_considerations: Mapped[str] = mapped_column(Text, nullable=False)
    individual_differences: Mapped[str] = mapped_column(Text, nullable=False)
    professional_advice_circumstances: Mapped[str] = mapped_column(Text, nullable=False)
    red_flag_warning: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    what_evidence_does_not_establish: Mapped[str] = mapped_column(Text, nullable=False)

    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    publication_year: Mapped[int] = mapped_column(Integer, nullable=False)
    review_status: Mapped[str] = mapped_column(String(50), default="clinically_reviewed_educational", nullable=False)

    source: Mapped["DataSource"] = relationship("DataSource")
    rules: Mapped[List["NutritionRule"]] = relationship(
        "NutritionRule", back_populates="condition", cascade="all, delete-orphan"
    )
    food_mappings: Mapped[List["ConditionFoodMapping"]] = relationship(
        "ConditionFoodMapping", back_populates="condition", cascade="all, delete-orphan"
    )


class ConditionFoodMapping(Base):
    """
    Explicit, reviewed condition-food relevance mapping.
    Replaces naive category-membership food recommendations.
    A food appears in condition-specific exploration ONLY when an active, reviewed mapping exists.
    """
    __tablename__ = "condition_food_mappings"
    __table_args__ = (
        UniqueConstraint("condition_id", "food_id", name="uq_condition_food_mapping"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    condition_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("health_conditions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )

    relevance_category: Mapped[str] = mapped_column(
        String(60), nullable=False, index=True, default="relevant_to_explore"
    )
    relevance_display_label: Mapped[str] = mapped_column(
        String(100), nullable=False, default="Relevant food to explore"
    )
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    relevant_nutrient_or_characteristic: Mapped[str] = mapped_column(String(255), nullable=False)
    relevant_tags: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)

    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    source_section: Mapped[str] = mapped_column(String(200), nullable=False)
    review_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reviewed", index=True
    )  # reviewed, requires_research, unreviewed
    applicability_limitations: Mapped[str] = mapped_column(Text, nullable=False)
    serving_consideration: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    condition: Mapped["HealthCondition"] = relationship("HealthCondition", back_populates="food_mappings")
    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="condition_mappings")
    source: Mapped["DataSource"] = relationship("DataSource")


class NutritionRule(Base):
    __tablename__ = "nutrition_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    rule_code: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    condition_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("health_conditions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nutrient_code: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    food_category_slug: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    dietary_tag_match: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)

    comparison_operator: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # gt, gte, lt, lte, between, is_null, tag_present
    threshold_low: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    threshold_high: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    evaluation_basis: Mapped[str] = mapped_column(String(20), default="100g", nullable=False)  # 100g or serving

    educational_category: Mapped[str] = mapped_column(
        String(80), nullable=False
    )
    relevance_level: Mapped[str] = mapped_column(
        String(40), default="monitor", nullable=False
    )  # contextual_note, monitor, portion_awareness, individualised_review
    explanation: Mapped[str] = mapped_column(Text, nullable=False)
    applicability_limitations: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_status: Mapped[str] = mapped_column(String(80), nullable=False)
    source_section: Mapped[str] = mapped_column(String(150), nullable=False)
    publication_year: Mapped[int] = mapped_column(Integer, nullable=False)
    review_status: Mapped[str] = mapped_column(String(50), default="verified", nullable=False)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )

    condition: Mapped["HealthCondition"] = relationship("HealthCondition", back_populates="rules")
    source: Mapped["DataSource"] = relationship("DataSource")


class ConditionConflictRule(Base):
    __tablename__ = "condition_conflict_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conflict_code: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    condition_a_code: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    condition_b_code: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    competing_domain: Mapped[str] = mapped_column(String(150), nullable=False)
    conflict_explanation: Mapped[str] = mapped_column(Text, nullable=False)
    why_conflict_exists: Mapped[str] = mapped_column(Text, nullable=False)
    professional_guidance_notice: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )

    source: Mapped["DataSource"] = relationship("DataSource")


class Household(Base):
    __tablename__ = "households"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_token: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), default="My Household", nullable=False)
    default_member_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    privacy_notice_accepted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    members: Mapped[List["HouseholdMember"]] = relationship(
        "HouseholdMember", back_populates="household", cascade="all, delete-orphan"
    )
    recipes: Mapped[List["Recipe"]] = relationship(
        "Recipe", back_populates="household", cascade="all, delete-orphan"
    )


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    age_group: Mapped[str] = mapped_column(
        String(40), default="adult", nullable=False
    )  # child, adolescent, adult, older_adult
    dietary_preference: Mapped[str] = mapped_column(
        String(50), default="vegetarian", nullable=False
    )  # vegetarian, eggetarian, non_vegetarian, vegan, jain
    selected_conditions: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    allergies: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    intolerances: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    dietary_restrictions: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    food_preferences: Mapped[List[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    household: Mapped["Household"] = relationship("Household", back_populates="members")


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=True, index=True
    )
    household_token: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    servings: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    meal_type: Mapped[str] = mapped_column(
        String(40), default="lunch", nullable=False
    )  # breakfast, lunch, dinner, snack
    is_system_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    instructions_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    household: Mapped[Optional["Household"]] = relationship("Household", back_populates="recipes")
    ingredients: Mapped[List["RecipeIngredient"]] = relationship(
        "RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan"
    )


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_name: Mapped[str] = mapped_column(String(60), nullable=False)
    grams_equivalent: Mapped[float] = mapped_column(Float, nullable=False)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ingredients")
    food: Mapped["FoodItem"] = relationship("FoodItem")
