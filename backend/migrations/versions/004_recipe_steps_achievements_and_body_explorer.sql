-- GharPlate Additive Migration 004:
-- Complete Recipe Steps, Persistent Member Achievements, and Interactive 3D Body & Nutrition Explorer

ALTER TABLE recipes ADD COLUMN slug VARCHAR(120);
ALTER TABLE recipes ADD COLUMN difficulty VARCHAR(40) DEFAULT 'Easy';
ALTER TABLE recipes ADD COLUMN verification_status VARCHAR(60) DEFAULT 'gharplate_verified';
ALTER TABLE recipes ADD COLUMN instructions_reviewed BOOLEAN DEFAULT 1 NOT NULL;
ALTER TABLE recipes ADD COLUMN is_favourite BOOLEAN DEFAULT 0 NOT NULL;
ALTER TABLE recipes ADD COLUMN user_rating INTEGER;
ALTER TABLE recipes ADD COLUMN rating_notes TEXT;

ALTER TABLE recipe_ingredients ADD COLUMN household_measure_note VARCHAR(160);
ALTER TABLE recipe_ingredients ADD COLUMN alternative_ingredient VARCHAR(160);
ALTER TABLE recipe_ingredients ADD COLUMN preparation_note VARCHAR(160);

ALTER TABLE member_fitness_profiles ADD COLUMN rewards_enabled BOOLEAN DEFAULT 1 NOT NULL;

CREATE TABLE IF NOT EXISTS recipe_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    step_number INTEGER NOT NULL,
    step_title VARCHAR(160) NOT NULL,
    instruction_text TEXT NOT NULL,
    duration_minutes INTEGER,
    temperature VARCHAR(80),
    tip TEXT,
    image_url VARCHAR(500),
    equipment VARCHAR(160),
    CONSTRAINT uq_recipe_step_number UNIQUE (recipe_id, step_number)
);

CREATE TABLE IF NOT EXISTS achievement_definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(160) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(60) NOT NULL,
    icon_name VARCHAR(60) NOT NULL DEFAULT 'award',
    criteria_type VARCHAR(80) NOT NULL,
    target_value FLOAT NOT NULL DEFAULT 1.0,
    unit_label VARCHAR(40) NOT NULL DEFAULT 'milestone',
    is_repeatable BOOLEAN NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS member_achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    household_id INTEGER NOT NULL REFERENCES households(id) ON DELETE CASCADE,
    member_id INTEGER NOT NULL REFERENCES household_members(id) ON DELETE CASCADE,
    achievement_id INTEGER NOT NULL REFERENCES achievement_definitions(id) ON DELETE CASCADE,
    achievement_code VARCHAR(80) NOT NULL,
    period_key VARCHAR(40) NOT NULL DEFAULT 'once',
    progress_value FLOAT NOT NULL DEFAULT 1.0,
    target_value FLOAT NOT NULL DEFAULT 1.0,
    awarded_at DATETIME NOT NULL,
    source_context VARCHAR(120) NOT NULL DEFAULT 'backend_verified',
    seen_by_user BOOLEAN NOT NULL DEFAULT 0,
    CONSTRAINT uq_member_achievement_period UNIQUE (member_id, achievement_id, period_key)
);

CREATE TABLE IF NOT EXISTS body_regions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(80) NOT NULL UNIQUE,
    name VARCHAR(160) NOT NULL,
    anatomical_system VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    short_summary VARCHAR(255) NOT NULL,
    physiological_function TEXT NOT NULL,
    nutrition_connection TEXT NOT NULL,
    key_nutrients_summary JSON NOT NULL DEFAULT '[]',
    dietary_pattern_guidance TEXT NOT NULL,
    hydration_connection TEXT,
    evidence_limitation_note TEXT NOT NULL,
    camera_position_json JSON NOT NULL DEFAULT '{}',
    mesh_coordinates_json JSON NOT NULL DEFAULT '{}',
    source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
    source_section VARCHAR(200) NOT NULL,
    review_status VARCHAR(50) NOT NULL DEFAULT 'clinically_reviewed_educational'
);

CREATE TABLE IF NOT EXISTS body_region_nutrients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region_id INTEGER NOT NULL REFERENCES body_regions(id) ON DELETE CASCADE,
    nutrient_code VARCHAR(60) NOT NULL,
    nutrient_name VARCHAR(120) NOT NULL,
    physiological_role TEXT NOT NULL,
    daily_reference_note VARCHAR(200),
    evidence_grade VARCHAR(80) NOT NULL DEFAULT 'Established physiological function',
    source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
    source_section VARCHAR(200) NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_body_region_nutrient UNIQUE (region_id, nutrient_code)
);

CREATE TABLE IF NOT EXISTS body_region_food_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region_id INTEGER NOT NULL REFERENCES body_regions(id) ON DELETE CASCADE,
    food_id INTEGER NOT NULL REFERENCES food_items(id) ON DELETE CASCADE,
    primary_nutrient_code VARCHAR(60) NOT NULL,
    relevance_explanation TEXT NOT NULL,
    preparation_or_serving_tip VARCHAR(255),
    priority_rank INTEGER NOT NULL DEFAULT 1,
    source_id INTEGER NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
    source_section VARCHAR(200) NOT NULL,
    review_status VARCHAR(50) NOT NULL DEFAULT 'reviewed',
    is_active BOOLEAN NOT NULL DEFAULT 1,
    CONSTRAINT uq_body_region_food_link UNIQUE (region_id, food_id)
);
