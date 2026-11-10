from datetime import datetime, UTC
from typing import Any, Optional
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
    return datetime.now(UTC)


class UserAccount(Base):
    """
    Authenticated user account stored in the database.
    Passwords are hashed with Argon2id; plaintext passwords are never stored.
    """
    __tablename__ = "user_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    sessions: Mapped[list["UserSession"]] = relationship(
        "UserSession", back_populates="user", cascade="all, delete-orphan"
    )
    households: Mapped[list["Household"]] = relationship(
        "Household", back_populates="owner", cascade="all, delete-orphan"
    )
    conversations: Mapped[list["AssistantConversation"]] = relationship(
        "AssistantConversation", back_populates="user", cascade="all, delete-orphan"
    )


class UserSession(Base):
    """
    Server-validated authentication session.
    Stores only SHA-256 hashes of the opaque session secret and CSRF token.
    """
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    session_token_hash: Mapped[str] = mapped_column(
        String(128), unique=True, index=True, nullable=False
    )
    csrf_token_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    remember_me: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, index=True, nullable=True)

    user: Mapped["UserAccount"] = relationship("UserAccount", back_populates="sessions")


class AssistantConversation(Base):
    """
    Persistent AI Assistant conversation thread owned by an authenticated user account.
    """
    __tablename__ = "assistant_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    household_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="SET NULL"), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(
        String(200), default="New Nutrition Conversation", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, index=True, nullable=False
    )

    user: Mapped["UserAccount"] = relationship("UserAccount", back_populates="conversations")
    messages: Mapped[list["AssistantMessage"]] = relationship(
        "AssistantMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AssistantMessage.id.asc()",
    )


class AssistantMessage(Base):
    """
    Individual message turn (user or assistant) within an AssistantConversation.
    """
    __tablename__ = "assistant_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conversation_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    mode_used: Mapped[str | None] = mapped_column(String(40), nullable=True)
    model_used: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ollama_connected: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tool_traces: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    sources: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    conversation: Mapped["AssistantConversation"] = relationship(
        "AssistantConversation", back_populates="messages"
    )


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
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    foods: Mapped[list["FoodItem"]] = relationship("FoodItem", back_populates="category")


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
    derivation_note: Mapped[str | None] = mapped_column(String(200), nullable=True)

    food: Mapped["FoodItem"] = relationship("FoodItem", back_populates="structured_tags")
    tag: Mapped["FoodTag"] = relationship("FoodTag")


class FoodItem(Base):
    __tablename__ = "food_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    ifct_code: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    name_en: Mapped[str] = mapped_column(String(200), index=True, nullable=False)
    scientific_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    region_state: Mapped[str | None] = mapped_column(String(120), nullable=True)

    is_packaged: Mapped[bool] = mapped_column(Boolean, default=False, index=True, nullable=False)
    brand: Mapped[str | None] = mapped_column(String(150), nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(64), unique=True, index=True, nullable=True)
    net_quantity: Mapped[str | None] = mapped_column(String(80), nullable=True)

    default_basis: Mapped[str] = mapped_column(String(20), default="100g", nullable=False)  # 100g or 100ml
    standard_serving_name: Mapped[str] = mapped_column(String(100), default="1 standard serving", nullable=False)
    standard_serving_grams: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)

    is_vegetarian: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_vegan: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allergen_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    intolerance_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    dietary_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    ingredients_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    cleaned_ingredients_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    allergen_statement: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    manufacturer_info: Mapped[str | None] = mapped_column(Text, nullable=True)
    allergen_declaration_complete: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    confidence_level: Mapped[str] = mapped_column(
        String(40), default="high", nullable=False
    )  # high, medium, label_declared, user_entered, incomplete
    conversion_methodology: Mapped[str | None] = mapped_column(Text, nullable=True)
    date_imported: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    external_updated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    category: Mapped["FoodCategory"] = relationship("FoodCategory", back_populates="foods")
    source: Mapped["DataSource"] = relationship("DataSource")
    aliases: Mapped[list["FoodAlias"]] = relationship(
        "FoodAlias", back_populates="food", cascade="all, delete-orphan"
    )
    nutrient_values: Mapped[list["FoodNutrientValue"]] = relationship(
        "FoodNutrientValue", back_populates="food", cascade="all, delete-orphan"
    )
    servings: Mapped[list["ServingConversion"]] = relationship(
        "ServingConversion", back_populates="food", cascade="all, delete-orphan"
    )
    structured_tags: Mapped[list["FoodItemTag"]] = relationship(
        "FoodItemTag", back_populates="food", cascade="all, delete-orphan"
    )
    condition_mappings: Mapped[list["ConditionFoodMapping"]] = relationship(
        "ConditionFoodMapping", back_populates="food", cascade="all, delete-orphan"
    )
    field_provenance: Mapped[list["ProductFieldProvenance"]] = relationship(
        "ProductFieldProvenance", back_populates="food", cascade="all, delete-orphan"
    )
    data_conflicts: Mapped[list["ProductDataConflict"]] = relationship(
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
    field_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    source_code: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_record_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    confidence_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="user_confirmed"
    )  # user_confirmed, external_verified_barcode, ocr_extracted, verified_ifct, fdc_supplemental
    review_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="confirmed"
    )  # confirmed, pending_user_review, auto_merged_missing
    retrieved_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

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
    local_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    local_source: Mapped[str] = mapped_column(String(150), nullable=False)
    external_value: Mapped[str | None] = mapped_column(Text, nullable=True)
    external_source: Mapped[str] = mapped_column(String(150), nullable=False)
    external_source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
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
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
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
    script_text: Mapped[str | None] = mapped_column(String(200), nullable=True)

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
    description: Mapped[str | None] = mapped_column(Text, nullable=True)


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
    value: Mapped[float | None] = mapped_column(Float, nullable=True)  # NULL = unknown/unmeasured
    basis: Mapped[str] = mapped_column(String(20), default="100g", nullable=False)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    confidence_status: Mapped[str] = mapped_column(
        String(50), default="verified_ifct", nullable=False
    )  # verified_ifct, verified_recipe_calc, label_declared, openfoodfacts, user_entered, not_measured
    measurement_notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

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
    applicable_age_groups: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    nutritional_meaning: Mapped[str] = mapped_column(Text, nullable=False)
    relevant_nutrients: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    relevant_food_groups: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    evidence_dietary_patterns: Mapped[str] = mapped_column(Text, nullable=False)
    portion_considerations: Mapped[str] = mapped_column(Text, nullable=False)
    individual_differences: Mapped[str] = mapped_column(Text, nullable=False)
    professional_advice_circumstances: Mapped[str] = mapped_column(Text, nullable=False)
    red_flag_warning: Mapped[str | None] = mapped_column(Text, nullable=True)
    what_evidence_does_not_establish: Mapped[str] = mapped_column(Text, nullable=False)

    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    publication_year: Mapped[int] = mapped_column(Integer, nullable=False)
    review_status: Mapped[str] = mapped_column(String(50), default="clinically_reviewed_educational", nullable=False)

    source: Mapped["DataSource"] = relationship("DataSource")
    rules: Mapped[list["NutritionRule"]] = relationship(
        "NutritionRule", back_populates="condition", cascade="all, delete-orphan"
    )
    food_mappings: Mapped[list["ConditionFoodMapping"]] = relationship(
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
    relevant_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    source_section: Mapped[str] = mapped_column(String(200), nullable=False)
    review_status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="reviewed", index=True
    )  # reviewed, requires_research, unreviewed
    applicability_limitations: Mapped[str] = mapped_column(Text, nullable=False)
    serving_consideration: Mapped[str | None] = mapped_column(String(255), nullable=True)
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
    nutrient_code: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)
    food_category_slug: Mapped[str | None] = mapped_column(String(80), nullable=True)
    dietary_tag_match: Mapped[str | None] = mapped_column(String(80), nullable=True)

    comparison_operator: Mapped[str] = mapped_column(
        String(30), nullable=False
    )  # gt, gte, lt, lte, between, is_null, tag_present
    threshold_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    threshold_high: Mapped[float | None] = mapped_column(Float, nullable=True)
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
    owner_user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("user_accounts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    household_token: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), default="My Household", nullable=False)
    default_member_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    privacy_notice_accepted: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    owner: Mapped[Optional["UserAccount"]] = relationship("UserAccount", back_populates="households")
    members: Mapped[list["HouseholdMember"]] = relationship(
        "HouseholdMember", back_populates="household", cascade="all, delete-orphan"
    )
    recipes: Mapped[list["Recipe"]] = relationship(
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
    selected_conditions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    allergies: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    intolerances: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    dietary_restrictions: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    food_preferences: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    primary_goal: Mapped[str] = mapped_column(
        String(80), default="maintain_balanced_diet", nullable=False
    )  # manage_health_condition, build_muscle, gain_weight, lose_body_fat, improve_strength, improve_endurance, improve_general_fitness, maintain_current_fitness, improve_everyday_nutrition, improve_hydration_habits, maintain_balanced_diet
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    household: Mapped["Household"] = relationship("Household", back_populates="members")
    fitness_profile: Mapped[Optional["MemberFitnessProfile"]] = relationship(
        "MemberFitnessProfile",
        back_populates="member",
        uselist=False,
        cascade="all, delete-orphan",
    )
    training_schedule: Mapped[list["TrainingScheduleEntry"]] = relationship(
        "TrainingScheduleEntry",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    fitness_goals: Mapped[list["FitnessGoal"]] = relationship(
        "FitnessGoal",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    habits: Mapped[list["HabitDefinition"]] = relationship(
        "HabitDefinition",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    measurements: Mapped[list["BodyMeasurementLog"]] = relationship(
        "BodyMeasurementLog",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    food_logs: Mapped[list["DailyFoodLogEntry"]] = relationship(
        "DailyFoodLogEntry",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    water_logs: Mapped[list["WaterIntakeLog"]] = relationship(
        "WaterIntakeLog",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    hydration_setting: Mapped[Optional["HydrationSetting"]] = relationship(
        "HydrationSetting",
        back_populates="member",
        uselist=False,
        cascade="all, delete-orphan",
    )
    blood_pressure_logs: Mapped[list["BloodPressureLog"]] = relationship(
        "BloodPressureLog",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    blood_glucose_logs: Mapped[list["BloodGlucoseLog"]] = relationship(
        "BloodGlucoseLog",
        back_populates="member",
        cascade="all, delete-orphan",
    )
    health_measurement_targets: Mapped[list["HealthMeasurementTarget"]] = relationship(
        "HealthMeasurementTarget",
        back_populates="member",
        cascade="all, delete-orphan",
    )


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=True, index=True
    )
    household_token: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    servings: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    meal_type: Mapped[str] = mapped_column(
        String(40), default="lunch", nullable=False
    )  # breakfast, lunch, dinner, snack, pre_workout, post_workout
    is_system_template: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    instructions_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cook_time_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_cost_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    source_type: Mapped[str] = mapped_column(
        String(50), default="gharplate_verified", nullable=False
    )  # gharplate_verified, user_saved, generated_from_db, external_attributed
    source_name: Mapped[str] = mapped_column(
        String(200), default="GharPlate IFCT 2017 / ICMR-NIN DGI 2024 Kitchen", nullable=False
    )
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    slug: Mapped[str | None] = mapped_column(String(120), index=True, nullable=True)
    difficulty: Mapped[str | None] = mapped_column(String(40), default="Easy", nullable=True)
    verification_status: Mapped[str | None] = mapped_column(
        String(60), default="gharplate_verified", nullable=True
    )  # gharplate_verified, user_created, ai_assisted, external_attributed
    instructions_reviewed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_favourite: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    user_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rating_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    dietary_tags: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    suitable_goals: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, onupdate=utc_now, nullable=False)

    household: Mapped[Optional["Household"]] = relationship("Household", back_populates="recipes")
    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        "RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan"
    )
    steps: Mapped[list["RecipeStep"]] = relationship(
        "RecipeStep",
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeStep.step_number.asc()",
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
    household_measure_note: Mapped[str | None] = mapped_column(String(160), nullable=True)
    alternative_ingredient: Mapped[str | None] = mapped_column(String(160), nullable=True)
    preparation_note: Mapped[str | None] = mapped_column(String(160), nullable=True)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="ingredients")
    food: Mapped["FoodItem"] = relationship("FoodItem")


class RecipeStep(Base):
    """
    Structured, ordered preparation and cooking step for a Recipe.
    Supports Guided Cooking Mode with step timers, temperatures, tips, and equipment.
    """
    __tablename__ = "recipe_steps"
    __table_args__ = (
        UniqueConstraint("recipe_id", "step_number", name="uq_recipe_step_number"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipe_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    step_title: Mapped[str] = mapped_column(String(160), nullable=False)
    instruction_text: Mapped[str] = mapped_column(Text, nullable=False)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperature: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tip: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    equipment: Mapped[str | None] = mapped_column(String(160), nullable=True)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="steps")


class MemberFitnessProfile(Base):
    """
    Stores fitness profile, anthropometrics (optional), training preferences, and user-editable daily nutrition targets
    for a HouseholdMember. Coexists seamlessly with medical conditions on the same member.
    """
    __tablename__ = "member_fitness_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("household_members.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    age_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    fitness_goal: Mapped[str] = mapped_column(
        String(80), default="maintain_balanced_diet", nullable=False
    )
    training_frequency_days_per_week: Mapped[int] = mapped_column(
        Integer, default=3, nullable=False
    )
    training_type: Mapped[str] = mapped_column(
        String(80), default="mixed_fitness", nullable=False
    )  # strength_training, running_endurance, yoga_mobility, sports, walking, mixed_fitness, none
    typical_workout_duration_min: Mapped[int] = mapped_column(
        Integer, default=45, nullable=False
    )
    preferred_training_time: Mapped[str] = mapped_column(
        String(50), default="morning", nullable=False
    )  # early_morning, morning, afternoon, evening
    daily_activity_level: Mapped[str] = mapped_column(
        String(50), default="moderately_active", nullable=False
    )  # sedentary, lightly_active, moderately_active, active, very_active
    daily_food_budget_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    optional_measurements: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    target_calories_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_protein_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_fat_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    target_fiber_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    goal_start_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    rewards_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    timezone_str: Mapped[str] = mapped_column(
        String(64), default="Asia/Kolkata", nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="fitness_profile"
    )


class TrainingScheduleEntry(Base):
    """
    Weekly training & rest day schedule (Monday through Sunday) for a HouseholdMember.
    """
    __tablename__ = "training_schedule_entries"
    __table_args__ = (
        UniqueConstraint("member_id", "day_of_week", name="uq_member_training_day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    day_of_week: Mapped[str] = mapped_column(
        String(20), nullable=False
    )  # monday, tuesday, wednesday, thursday, friday, saturday, sunday
    is_training_day: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    workout_type: Mapped[str] = mapped_column(
        String(100), default="Rest & Recovery", nullable=False
    )
    workout_time: Mapped[str | None] = mapped_column(String(40), nullable=True)
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="training_schedule"
    )


class FitnessGoal(Base):
    """
    User-defined personal fitness or nutrition goal with configurable targets and progress tracking.
    """
    __tablename__ = "fitness_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    goal_name: Mapped[str] = mapped_column(String(160), nullable=False)
    goal_type: Mapped[str] = mapped_column(
        String(60), nullable=False
    )  # protein_intake, energy_intake, fiber_intake, water_habit, food_logging, training_consistency, weight_record, custom
    start_date: Mapped[str] = mapped_column(String(20), nullable=False)
    target_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    target_value: Mapped[float] = mapped_column(Float, nullable=False)
    current_value: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unit: Mapped[str] = mapped_column(String(40), nullable=False)
    tracking_frequency: Mapped[str] = mapped_column(
        String(40), default="daily", nullable=False
    )  # daily, weekly, monthly
    status: Mapped[str] = mapped_column(
        String(40), default="active", nullable=False
    )  # active, completed, paused
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="fitness_goals"
    )


class HabitDefinition(Base):
    """
    Gentle, non-shaming habit definition for daily/weekly wellness & nutrition routines.
    Supports both manual habits and user-confirmed AI-generated habit plans.
    """
    __tablename__ = "habit_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(
        String(60), default="nutrition", nullable=False
    )  # hydration, nutrition, training, home_cooking, health_routine
    frequency: Mapped[str] = mapped_column(
        String(40), default="daily", nullable=False
    )  # daily, weekdays, training_days, weekly
    reminder_time: Mapped[str | None] = mapped_column(String(20), nullable=True)
    schedule_metadata_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    tracking_method: Mapped[str] = mapped_column(
        String(60), default="manual_check", nullable=False
    )  # food_diary, nutrition_tracker, water_tracker, fitness_tracker, health_measurements, analytics, manual_check
    completion_criteria: Mapped[str | None] = mapped_column(String(200), nullable=True)
    ai_plan_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    user_approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="habits"
    )
    completions: Mapped[list["HabitCompletionLog"]] = relationship(
        "HabitCompletionLog",
        back_populates="habit",
        cascade="all, delete-orphan",
    )


class HabitCompletionLog(Base):
    """
    Records daily completion of a HabitDefinition by date (YYYY-MM-DD).
    """
    __tablename__ = "habit_completion_logs"
    __table_args__ = (
        UniqueConstraint("habit_id", "logged_date", name="uq_habit_completion_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    habit_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("habit_definitions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    logged_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    completed: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    habit: Mapped["HabitDefinition"] = relationship(
        "HabitDefinition", back_populates="completions"
    )


class BodyMeasurementLog(Base):
    """
    Optional historical body measurement and workout milestone log.
    """
    __tablename__ = "body_measurement_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    logged_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    waist_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    chest_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    arm_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    hip_cm: Mapped[float | None] = mapped_column(Float, nullable=True)
    workout_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    milestone_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="measurements"
    )


class DailyFoodLogEntry(Base):
    """
    Persistent Daily Food Diary entry with immutable nutrient snapshot at the time of recording.
    Preserves NULL for unmeasured nutrients (never converts unknown nutrients to 0).
    """
    __tablename__ = "daily_food_log_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    logged_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)  # YYYY-MM-DD
    meal_category: Mapped[str] = mapped_column(
        String(40), index=True, nullable=False
    )  # early_morning, breakfast, mid_morning_snack, lunch, evening_snack, pre_workout, post_workout, dinner, other
    logged_time: Mapped[str | None] = mapped_column(String(20), nullable=True)  # HH:MM if provided

    food_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    recipe_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True, index=True
    )
    food_slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    food_name: Mapped[str] = mapped_column(String(200), nullable=False)
    entry_source_type: Mapped[str] = mapped_column(
        String(50), default="food_database", nullable=False
    )  # food_database, barcode_scan, ocr_scan, recipe_calculator, mess_analyzer, family_meal, manual_entry
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit_name: Mapped[str] = mapped_column(String(60), nullable=False)
    grams_equivalent: Mapped[float] = mapped_column(Float, nullable=False)

    # Historical Nutrient Snapshot (NULL = unmeasured/unknown, NEVER 0)
    energy_kcal: Mapped[float | None] = mapped_column(Float, nullable=True)
    protein_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    carbs_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugars_total_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sugars_added_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_total_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fat_saturated_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    fibre_g: Mapped[float | None] = mapped_column(Float, nullable=True)
    sodium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    calcium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    iron_mg: Mapped[float | None] = mapped_column(Float, nullable=True)
    potassium_mg: Mapped[float | None] = mapped_column(Float, nullable=True)

    nutrient_snapshot_json: Mapped[dict[str, float | None]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    missing_nutrient_codes: Mapped[list[str]] = mapped_column(
        JSON, default=list, nullable=False
    )
    completeness_pct: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    source_citation: Mapped[str] = mapped_column(
        String(255), default="ICMR-NIN IFCT 2017", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="food_logs"
    )


class SavedMealTemplate(Base):
    """
    Reusable meal template saved from the Daily Food Diary so frequently consumed meals can be logged in 1 click.
    """
    __tablename__ = "saved_meal_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    meal_category: Mapped[str] = mapped_column(String(40), default="breakfast", nullable=False)
    items_json: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class WaterIntakeLog(Base):
    """
    Persistent water and hydration intake record with container type, ml amount, date, and timestamp.
    """
    __tablename__ = "water_intake_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    logged_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)
    logged_time: Mapped[str] = mapped_column(String(20), nullable=False)  # HH:MM
    amount_ml: Mapped[int] = mapped_column(Integer, nullable=False)
    container_type: Mapped[str] = mapped_column(
        String(50), default="glass", nullable=False
    )  # small_glass, large_glass, water_bottle, custom_container
    notes: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="water_logs"
    )


class HydrationSetting(Base):
    """
    Member-specific configurable hydration target and non-intrusive reminder settings.
    """
    __tablename__ = "hydration_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    member_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("household_members.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    daily_goal_ml: Mapped[int] = mapped_column(Integer, default=2250, nullable=False)
    preferred_container: Mapped[str] = mapped_column(
        String(50), default="large_glass", nullable=False
    )
    reminders_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reminder_interval_minutes: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    reminder_start_time: Mapped[str] = mapped_column(String(10), default="08:00", nullable=False)
    reminder_end_time: Mapped[str] = mapped_column(String(10), default="21:00", nullable=False)
    quiet_hours_start: Mapped[str] = mapped_column(String(10), default="22:00", nullable=False)
    quiet_hours_end: Mapped[str] = mapped_column(String(10), default="07:00", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="hydration_setting"
    )


class PantryItem(Base):
    """
    Household pantry inventory item with optional quantity, expiry date, and availability flag.
    """
    __tablename__ = "pantry_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    food_slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    ingredient_name: Mapped[str] = mapped_column(String(160), nullable=False)
    category_name: Mapped[str] = mapped_column(String(100), default="Pantry Staple", nullable=False)
    available_quantity: Mapped[float] = mapped_column(Float, default=500.0, nullable=False)
    unit_name: Mapped[str] = mapped_column(String(40), default="g", nullable=False)
    grams_available: Mapped[float] = mapped_column(Float, default=500.0, nullable=False)
    in_stock: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    expiry_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    estimated_price_inr_per_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )


class ShoppingList(Base):
    """
    Consolidated household smart grocery shopping list with optional delivery PIN code for retailer search.
    """
    __tablename__ = "shopping_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(
        String(160), default="Household Smart Grocery List", nullable=False
    )
    delivery_pincode: Mapped[str | None] = mapped_column(String(12), nullable=True)
    location_consent_given: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    items: Mapped[list["ShoppingListItem"]] = relationship(
        "ShoppingListItem",
        back_populates="shopping_list",
        cascade="all, delete-orphan",
    )


class ShoppingListItem(Base):
    """
    Individual consolidated ingredient on a ShoppingList.
    Combines duplicate ingredients across multiple recipes and links to verified retailer search destinations.
    """
    __tablename__ = "shopping_list_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    shopping_list_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="SET NULL"), nullable=True, index=True
    )
    food_slug: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    ingredient_name: Mapped[str] = mapped_column(String(160), nullable=False)
    food_category: Mapped[str] = mapped_column(String(100), default="Groceries", nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    unit_name: Mapped[str] = mapped_column(String(50), default="g", nullable=False)
    grams_needed: Mapped[float] = mapped_column(Float, default=100.0, nullable=False)
    estimated_price_inr: Mapped[float | None] = mapped_column(Float, nullable=True)
    related_recipes: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    is_purchased: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    shopping_list: Mapped["ShoppingList"] = relationship(
        "ShoppingList", back_populates="items"
    )


class LocalFoodPrice(Base):
    """
    User-entered local market prices (INR per 100g) for Indian Protein & Budget Intelligence.
    Never fabricates local prices; stores explicit user-configured prices.
    """
    __tablename__ = "local_food_prices"
    __table_args__ = (
        UniqueConstraint("household_id", "food_slug", name="uq_household_food_price"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_slug: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    price_inr_per_100g: Mapped[float] = mapped_column(Float, nullable=False)
    package_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )


class MessMenuRecord(Base):
    """
    Saved College Mess, Hostel, or Canteen menu with matched GharPlate food items for 1-click meal analysis and logging.
    """
    __tablename__ = "mess_menu_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    institution_or_canteen: Mapped[str | None] = mapped_column(String(160), nullable=True)
    day_or_meal_label: Mapped[str] = mapped_column(String(80), default="Daily Menu", nullable=False)
    raw_menu_text: Mapped[str] = mapped_column(Text, nullable=False)
    matched_dishes_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class BloodPressureLog(Base):
    """
    Dedicated persistent table for Blood Pressure (BP) and pulse measurements.
    Supports multiple readings per session (first vs repeat) and morning/evening context.
    Never stored in BodyMeasurementLog.
    """
    __tablename__ = "blood_pressure_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    systolic_mmhg: Mapped[int] = mapped_column(Integer, nullable=False)
    diastolic_mmhg: Mapped[int] = mapped_column(Integer, nullable=False)
    pulse_bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    logged_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)  # YYYY-MM-DD
    logged_time: Mapped[str] = mapped_column(String(20), nullable=False)  # HH:MM or 7:30 AM
    time_of_day: Mapped[str] = mapped_column(
        String(30), default="morning", index=True, nullable=False
    )  # morning, afternoon, evening, night
    measurement_arm: Mapped[str] = mapped_column(
        String(20), default="left", nullable=False
    )  # left, right
    measurement_position: Mapped[str] = mapped_column(
        String(30), default="seated", nullable=False
    )  # seated, standing, supine
    reading_sequence: Mapped[str] = mapped_column(
        String(30), default="first", nullable=False
    )  # first, repeat_2, repeat_3
    device_type: Mapped[str] = mapped_column(
        String(80), default="automated_upper_arm_cuff", nullable=False
    )  # automated_upper_arm_cuff, wrist_cuff, clinic_sphygmomanometer, other
    measurement_source: Mapped[str] = mapped_column(
        String(60), default="manual_home_entry", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="blood_pressure_logs"
    )


class BloodGlucoseLog(Base):
    """
    Dedicated persistent table for Blood Glucose measurements.
    Preserves both the exact user-entered value & unit ('mg/dL' or 'mmol/L') and normalized conversions,
    along with strict measurement context (fasting, pre-meal, post-meal, bedtime, random).
    """
    __tablename__ = "blood_glucose_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entered_value: Mapped[float] = mapped_column(Float, nullable=False)
    entered_unit: Mapped[str] = mapped_column(
        String(20), default="mg/dL", nullable=False
    )  # mg/dL or mmol/L
    value_mg_dl: Mapped[float] = mapped_column(Float, nullable=False)
    value_mmol_l: Mapped[float] = mapped_column(Float, nullable=False)
    logged_date: Mapped[str] = mapped_column(String(20), index=True, nullable=False)  # YYYY-MM-DD
    logged_time: Mapped[str] = mapped_column(String(20), nullable=False)  # HH:MM
    measurement_context: Mapped[str] = mapped_column(
        String(40), index=True, nullable=False
    )  # fasting, before_breakfast, after_breakfast, before_lunch, after_lunch, before_dinner, after_dinner, bedtime, random, other
    minutes_after_meal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    meal_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    device_type: Mapped[str] = mapped_column(
        String(80), default="home_glucometer", nullable=False
    )
    measurement_source: Mapped[str] = mapped_column(
        String(60), default="manual_home_entry", nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="blood_glucose_logs"
    )


class HealthMeasurementTarget(Base):
    """
    Member-specific clinician-provided target configuration for Blood Pressure or Blood Glucose.
    Never automatically prescribes targets; stores only targets explicitly entered by the user from their clinician.
    """
    __tablename__ = "health_measurement_targets"
    __table_args__ = (
        UniqueConstraint(
            "member_id", "measurement_type", name="uq_member_health_measurement_target"
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    measurement_type: Mapped[str] = mapped_column(
        String(40), index=True, nullable=False
    )  # blood_pressure, blood_glucose
    target_details_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    target_source: Mapped[str] = mapped_column(
        String(160), default="Clinician-provided personal target", nullable=False
    )
    clinician_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    effective_date: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utc_now, onupdate=utc_now, nullable=False
    )

    member: Mapped["HouseholdMember"] = relationship(
        "HouseholdMember", back_populates="health_measurement_targets"
    )


class AchievementDefinition(Base):
    """
    Catalog of ethical, non-shaming achievements and milestones.
    Evaluated strictly from verified database records.
    """
    __tablename__ = "achievement_definitions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(
        String(60), index=True, nullable=False
    )  # getting_started, consistency, personal_goals, exploration
    icon_name: Mapped[str] = mapped_column(String(60), default="award", nullable=False)
    criteria_type: Mapped[str] = mapped_column(String(80), nullable=False)
    target_value: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    unit_label: Mapped[str] = mapped_column(String(40), default="milestone", nullable=False)
    is_repeatable: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)


class MemberAchievement(Base):
    """
    Persistent record of an achievement earned by a specific HouseholdMember.
    Unique constraint prevents duplicate awards for the same member, achievement, and period_key.
    """
    __tablename__ = "member_achievements"
    __table_args__ = (
        UniqueConstraint(
            "member_id",
            "achievement_id",
            "period_key",
            name="uq_member_achievement_period",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    household_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    member_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("household_members.id", ondelete="CASCADE"), nullable=False, index=True
    )
    achievement_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("achievement_definitions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    achievement_code: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    period_key: Mapped[str] = mapped_column(
        String(40), default="once", nullable=False
    )  # 'once' for lifetime milestones, or 'YYYY-Www' / 'YYYY-MM' for repeatable ones
    progress_value: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    target_value: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
    awarded_at: Mapped[datetime] = mapped_column(DateTime, default=utc_now, nullable=False)
    source_context: Mapped[str] = mapped_column(
        String(120), default="backend_verified", nullable=False
    )  # backend_verified, migrated_from_local_storage
    seen_by_user: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    achievement: Mapped["AchievementDefinition"] = relationship("AchievementDefinition")


class BodyRegion(Base):
    """
    Anatomical region or organ system in the Interactive 3D Human Body & Nutrition Explorer.
    """
    __tablename__ = "body_regions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    anatomical_system: Mapped[str] = mapped_column(String(120), nullable=False)
    category: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    short_summary: Mapped[str] = mapped_column(String(255), nullable=False)
    physiological_function: Mapped[str] = mapped_column(Text, nullable=False)
    nutrition_connection: Mapped[str] = mapped_column(Text, nullable=False)
    key_nutrients_summary: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    dietary_pattern_guidance: Mapped[str] = mapped_column(Text, nullable=False)
    hydration_connection: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_limitation_note: Mapped[str] = mapped_column(Text, nullable=False)
    camera_position_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    mesh_coordinates_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    source_section: Mapped[str] = mapped_column(String(200), nullable=False)
    review_status: Mapped[str] = mapped_column(
        String(50), default="clinically_reviewed_educational", nullable=False
    )

    source: Mapped["DataSource"] = relationship("DataSource")
    nutrient_links: Mapped[list["BodyRegionNutrient"]] = relationship(
        "BodyRegionNutrient",
        back_populates="region",
        cascade="all, delete-orphan",
        order_by="BodyRegionNutrient.display_order.asc()",
    )
    food_links: Mapped[list["BodyRegionFoodLink"]] = relationship(
        "BodyRegionFoodLink",
        back_populates="region",
        cascade="all, delete-orphan",
        order_by="BodyRegionFoodLink.priority_rank.asc()",
    )


class BodyRegionNutrient(Base):
    """
    Reviewed physiological link between a BodyRegion and a specific nutrient.
    """
    __tablename__ = "body_region_nutrients"
    __table_args__ = (
        UniqueConstraint("region_id", "nutrient_code", name="uq_body_region_nutrient"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    region_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("body_regions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nutrient_code: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    nutrient_name: Mapped[str] = mapped_column(String(120), nullable=False)
    physiological_role: Mapped[str] = mapped_column(Text, nullable=False)
    daily_reference_note: Mapped[str | None] = mapped_column(String(200), nullable=True)
    evidence_grade: Mapped[str] = mapped_column(
        String(80), default="Established physiological function", nullable=False
    )
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    source_section: Mapped[str] = mapped_column(String(200), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    region: Mapped["BodyRegion"] = relationship("BodyRegion", back_populates="nutrient_links")
    source: Mapped["DataSource"] = relationship("DataSource")


class BodyRegionFoodLink(Base):
    """
    Explicit, reviewed link between a BodyRegion and a verified GharPlate FoodItem.
    """
    __tablename__ = "body_region_food_links"
    __table_args__ = (
        UniqueConstraint("region_id", "food_id", name="uq_body_region_food_link"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    region_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("body_regions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    food_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("food_items.id", ondelete="CASCADE"), nullable=False, index=True
    )
    primary_nutrient_code: Mapped[str] = mapped_column(String(60), nullable=False)
    relevance_explanation: Mapped[str] = mapped_column(Text, nullable=False)
    preparation_or_serving_tip: Mapped[str | None] = mapped_column(String(255), nullable=True)
    priority_rank: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    source_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("data_sources.id", ondelete="RESTRICT"), nullable=False
    )
    source_section: Mapped[str] = mapped_column(String(200), nullable=False)
    review_status: Mapped[str] = mapped_column(String(50), default="reviewed", nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    region: Mapped["BodyRegion"] = relationship("BodyRegion", back_populates="food_links")
    food: Mapped["FoodItem"] = relationship("FoodItem")
    source: Mapped["DataSource"] = relationship("DataSource")

