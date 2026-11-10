# GharPlate — Recipe Detail & Guided Cooking Mode

## Overview

GharPlate’s **Recipe Intelligence & Guided Cooking Mode** turns every recipe in `RecipeDiscoveryPage` (`/recipes/discover`) and `SavedRecipesPage` (`/recipes/saved`) into a complete, step-by-step Indian kitchen companion at `/recipes/:id`.

## Database & Backend Architecture

- **`recipes` table extensions (`backend/app/models/entities.py`)**:
  - `meal_type`, `cuisine_region`, `prep_time_minutes`, `cook_time_minutes`, `total_time_minutes`, `difficulty_level`
  - `dietary_tags_json`, `suitable_goals_json`, `source_type`, `is_favourite`, `user_rating`
- **`recipe_ingredients` table extensions**:
  - `preparation_note`, `is_optional`, `step_number`
- **`recipe_steps` table (`RecipeStep`)**:
  - `id`, `recipe_id`, `step_number`, `step_title`, `instruction_text`, `duration_minutes`, `temperature`, `tip`, `image_url`, `equipment`
- **Curated Indian Recipe Seed (`backend/app/services/recipe_intelligence_service.py`)**:
  - 15 authentic Indian dishes (Idli, Masala Dosa with Potato Palya, Ragi Mudde & Palak Sambar, Ven Pongal, Rava Vegetable Upma, Poha/Avalakki, Moong Dal & Vegetable Khichdi, Whole Wheat Chapati/Phulka, South Indian Vegetable Sambar, Tomato Pepper Rasam, Yellow Moong & Toor Dal Tadka, Mixed Vegetable Pulao, High-Protein Soya & Paneer Gym Bowl, Sprouted Moong & Cucumber Chaat, Post-Workout Idli-Sambar-Egg Plate) linked to verified `FoodItem` records and IFCT 2017 retention factors.

## API Endpoints

- `GET /api/v1/recipes/{recipe_id_or_slug}?servings={n}` — Returns complete recipe detail, per-ingredient nutritional contributions, retention-adjusted totals, and ordered `RecipeStep` instructions dynamically scaled to `servings`.
- `POST /api/v1/recipes/{recipe_id}/enrich` — Generates structured step-by-step cooking instructions for older or custom recipes from their verified ingredient list.
- `POST /api/v1/recipes/{recipe_id}/rate` — Updates `user_rating` (1–5) and `is_favourite` (`Cook Again`).
- `POST /api/v1/recipes/{recipe_id}/log-diary` — Logs the cooked recipe’s proportional ingredients into `DailyFoodLog` only when `user_confirmed=true`.
