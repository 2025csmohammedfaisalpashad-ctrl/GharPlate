# GharPlate — Premium Minimalist UX Transformation & Simplified Daily Tracking

## 1. Guiding Principle: Many Capabilities, Few Visible Choices

GharPlate’s UX refinement reduces the cognitive load of daily food, fitness, habit, and clinical measurement tracking while preserving 100% of the application’s database models, APIs, routes, and condition-safety rules.

- **Palette & Surface Hierarchy**: Warm off-white background (`#FAF8F5`), pure white surfaces (`#FFFFFF`), subtle translucent header/drawer surfaces (`backdrop-blur-md`), stone/charcoal typography, and deep emerald (`#065F46`) primary actions.
- **Motion & Accessibility**: Smooth transitions with full `@media (prefers-reduced-motion: reduce)` support and `tabular-nums` alignment across all nutritional and clinical metrics.

## 2. Refined Left Sidebar & Unified Quick Add (`frontend/src/components/Layout.tsx`)

- **Consolidated Sidebar Hierarchy**:
  - **Home**: `Home` (`/`)
  - **Explore**: `Food Explorer` (`/foods`)
  - **My Health**: `Household & Profiles` (`/household`), `Health Measurements` (`/health/measurements`, active for `/health/blood-pressure` and `/health/blood-glucose`), `Health Guidance` (`/conditions`)
  - **My Progress**: `Fitness` (`/fitness/dashboard`, active for `/fitness/protein`), `Daily Tracker` (`/fitness/tracker`, active for `/fitness/hydration`), `Goals & Habits` (`/fitness/goals`, active for `/fitness/habit-builder`), `Analytics` (`/fitness/analytics`)
  - **My Kitchen**: `Recipes` (`/recipes/discover`, active for `/recipes/calculator`, `/recipes/saved`, `/meals`), `Pantry & Shopping` (`/kitchen/grocery`)
  - **Tools**: `Scanners` (`/barcode`, active for `/scanner`, `/recognition`), `Product Comparison` (`/compare`), `Mess Analyzer` (`/tools/mess-analyzer`)
  - **Settings**: `Sources` (`/sources`), `Privacy` (`/privacy-safety`, active for `/about`), `Settings` (`/settings`)
- **Active-Only Group Auto-Expansion**: Only the currently active navigation group expands automatically on route changes; collapsed mode displays clean group icons with accessible tooltips.
- **Unified `+ Quick Add` Header Menu**: Provides a single entry point for `Log Food`, `Add Water`, `Record BP`, `Record Glucose`, `Log Workout`, and `Complete Habit`.

## 3. Progressive Fitness Profile & Simplified Fitness Dashboard (`FitnessDashboardPage`)

- **Top Summary**: Shows the active member’s selected fitness goal, daily calorie/protein targets, today’s training vs. rest status, and weekly training rhythm at a glance.
- **Progressive Profile Setup**: Hidden behind **Edit Profile** (`data-testid="edit-fitness-profile-btn"`), organised into:
  - **A. Your Goal**: Primary goal selector + optional secondary goal.
  - **B. Personal Details**: Height, current weight, optional target weight, activity level, training style, and daily food budget.
  - **C. Training Schedule**: Compact weekly summary with an expandable **Edit Weekly Schedule** drawer (`data-testid="open-schedule-drawer-btn"`).
  - **Advanced Settings**: Collapsed by default for custom calorie and protein targets.
- **Your Fitness Progress**: Displays one prominent SVG line chart (`data-testid="fitness-dashboard-progress-chart"`) switching between `Protein`, `Energy intake`, `Workout consistency`, `Water intake`, and `Body weight`.

## 4. Simplified Daily Food Tracker (`DailyTrackerPage`)

- **Today’s Food Summary**: Prioritises three core metrics (`Energy`, `Protein`, `Water`) with a compact **More nutrition** disclosure (`data-testid="toggle-more-nutrition-btn"`) for secondary macros and minerals (`Carbohydrates`, `Total Fat`, `Dietary Fibre`, `Sodium`), strictly preserving `NULL` for unmeasured nutrients.
- **Single Primary `+ Log Food` Workflow**: Opens a focused drawer (`data-testid="log-food-drawer"`) where the user selects **When did you eat?** followed by **What did you eat?** across three tabs:
  1. **Search Indian Foods** (quantity and serving unit shown after food selection).
  2. **Describe Meal (AI)** (natural-language parsing with editable nutrient preview and mandatory confirmation).
  3. **Scan Packaged Food** (links to Barcode Scanner, Label OCR, and Mess Plate Analyzer).
- **Clean Meal Timeline**: Only renders full meal cards for meal categories containing actual logged entries, with compact `+ Add Breakfast / Lunch / Dinner` pills for unlogged slots and a separate **Saved Meals** drawer (`data-testid="open-saved-meals-btn"`) for reusing yesterday’s breakfast or applying saved templates.

## 5. Rebuilt Goals, Graph-First Habits & Assistant-Style AI Habit Builder

- **My Goals & Habits (`GoalsHabitsPage`)**:
  - Uses two clean tabs (`Daily Habits` and `Goals`) plus a **Create with AI** action.
  - **Graph-First Habit Consistency Chart**: Prominent SVG line chart (`data-testid="habit-completion-svg-chart"`) with `7 days`, `30 days`, and `90 days` range controls and an individual habit selector (`data-testid="habit-graph-selector"`). Unscheduled or rest days are never counted as missed.
  - **Simplified Habit Cards & Deduplication**: Displays only active, deduplicated habits with a clear title, schedule badge, 7-day ratio, one-click `Mark complete` button, and `Edit` menu. Backend deduplication in `confirm_ai_habit_plan` and `list_habits_endpoint` merges completion history across duplicate water or breakfast habits without deleting historical records.
  - **Once-Only Goal Achievement Celebration**: Awards a congratulatory banner and badge (`data-testid="goal-achievement-celebration"`) once per achieved goal or completed daily habit cycle, with a toggle to disable celebrations (`data-testid="toggle-rewards-checkbox"`).
- **AI Habit Builder (`AIHabitBuilderPage`)**:
  - Initial screen presents only **What would you like to improve?**, a multiline input, and **Create My Plan** (no empty spreadsheet table).
  - Generated plans render 3–5 editable habit cards (`data-testid="proposed-habit-card-0"`, etc.) with inline Edit, Remove, natural-language revision chips, error/retry handling, and mandatory confirmation.
