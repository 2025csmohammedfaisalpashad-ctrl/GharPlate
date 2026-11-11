# GharPlate — Project Status Summary

## Completed Additive Upgrades
1. **Part A — Medical / Health Report Upload, Extraction & Lab-to-Plate Intelligence (`/health/reports`)**:
   - Added `HealthReport` and `HealthReportMeasurement` models + migration `0007_health_reports_symptom_review_food_discovery.py`.
   - Implemented PDF/Image upload validation, embedded PDF stream extraction + OCR/Ollama vision fallback, 7-panel lab marker extraction, mandatory user confirmation screen before saving, Lab-to-Plate Indian food recommendations with strict kidney-safety guardrails, and unit-consistent single-marker trend series.
2. **Part B — AI Symptom Review & Care Guidance (`/health/symptoms` & `/health/reports?tab=symptoms`)**:
   - Added `SymptomReviewSession` model and `/api/v1/health/symptom-review` endpoints.
   - Implemented immediate red-flag emergency detection (`112 / 108`) that halts normal meal suggestions, progressive 1–2 question intake, separation between reported symptoms and confirmed health records, and cautious Indian hydration/meal suggestions.
3. **Parts C, D, E, F — Smart Nearby Food Discovery, Maps & Provider Integrations (`/food-nearby`)**:
   - Added `FoodDiscoveryPreference` and `RestaurantSearchSession` models and `/api/v1/food-discovery/*` endpoints.
   - Implemented food-first Indian dish matching, dietary/allergy/goal filtering, mandatory allergy cross-contact notice, synchronised interactive SVG radar map + compact restaurant cards, Google Maps Search & Directions URL adapter, Swiggy Builders Club MCP confirmation preview modal, Zomato partner adapter, Photo-to-Meal-to-Restaurant link on `/recognition`, and Restaurant-to-Food Diary confirmation logging.
4. **Part G — Dark-Emerald Sidebar & Cursor-Responsive Glow**:
   - Upgraded the main left sidebar to the dark-emerald palette (`#064E3B`, `#075B45`, `#087A5B`, `#E8FFF4`, `#A7D9C0`) with a crisp right-side divider and subtle cursor-responsive light-green glow on the main workspace.
5. **Contextual Ask GharPlate AI Assistant Integration**:
   - Registered 5 new allowlisted tools (`get_health_reports`, `get_lab_measurement_trends`, `evaluate_symptom_guidance`, `search_nearby_restaurants_for_dish`, `prepare_restaurant_order_preview`) and extended active page context (`health_report_context`, `symptom_review_context`, `food_discovery_context`).
