# GharPlate — Database-Persistent Achievement & Reward System

## Overview

GharPlate’s **Achievement & Reward System** persists earned milestones per household member in the backend database (`achievement_definitions` and `member_achievements`) so rewards survive browser cache clears, sign-outs, and device switches.

## Database Schema

- **`achievement_definitions`**:
  - `id`, `code`, `title`, `description`, `category`, `rule_type`, `target_value`, `is_repeatable`, `badge_icon`
- **`member_achievements`**:
  - `id`, `member_id`, `achievement_id`, `period_key`, `awarded_date`, `awarded_at`, `progress_value`, `metadata_json`, `seen_by_user`
  - **Idempotency Constraint**: `UniqueConstraint("member_id", "achievement_id", "period_key", name="uq_member_achievement_period")` guarantees that once-only (`lifetime`) and date-scoped (`YYYY-MM-DD`) achievements are never awarded twice.
- **`member_fitness_profiles.rewards_enabled`**:
  - Stores each member’s preference for showing celebratory banners without deleting earned achievement history.

## Categories & Ethical Safeguards

1. **Getting Started**: First Food Logged, First Water Target Logged, First Habit Created, First Recipe Cooked, Fitness Profile Completed.
2. **Consistency**: Daily Habit Cycle Complete, 3-Day Habit Consistency, 7-Day Habit Consistency, 7-Day Food Logging Consistency, 7-Day Hydration Consistency.
3. **Personal Goals**: Personal Goal Reached (`progress_pct >= 100`), Daily Protein Target Reached, Daily Fibre Target Reached, Weekly Training Plan Completed.
4. **Exploration**: First Recipe Saved, First Nutrition Label Scanned, First Body Region Explored.

**Ethical Guardrails**: No achievements ever reward extreme calorie restriction, skipping meals, rapid weight loss, or abnormal blood pressure/glucose readings.

## API Endpoints

- `GET /api/v1/fitness/achievements?member_id={id}`
- `POST /api/v1/fitness/achievements/migrate-local`
- `POST /api/v1/fitness/achievements/mark-seen`
- `PUT /api/v1/fitness/achievements/preferences`
