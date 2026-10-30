# GharPlate Figma Design Integration Guide (`docs/FIGMA_INTEGRATION.md`)

In accordance with Section 23 of the Master Prompt, the complete, responsive 18-page initial frontend has been independently designed and implemented first. It is now ready to be mapped to your Figma design file when you provide the Figma URL.

## 1. Pages Ready for Figma Design Integration (All 18 Pages)

| # | Route | Component File | Current Implementation Status |
|---|---|---|---|
| 1 | `/` | `src/pages/HomePages.tsx` (`HomePage`) | Complete — Hero search, live DB metrics, household status strip, 8 module cards, 9 category links |
| 2 | `/foods` | `src/pages/HomePages.tsx` (`FoodExplorerPage`) | Complete — Multilingual search, category & nutrient filters, sorting, pagination, recent searches |
| 3 | `/foods/:slug` | `src/pages/HomePages.tsx` (`FoodDetailPage`) | Complete — IFCT code, English/Hindi/Kannada aliases, serving converter, macro chart, full table, Food & Health Considerations |
| 4 | `/conditions` | `src/pages/ConditionPages.tsx` (`ConditionExplorerPage`) | Complete — Group A–I filter tabs, short-term illness & life-stage badges |
| 5 | `/conditions/:code` | `src/pages/ConditionPages.tsx` (`ConditionDetailPage`) | Complete — 4-quadrant clinical synthesis, red-flag alerts, transparent rules list, relevant foods grid |
| 6 | `/household` | `src/pages/HouseholdPages.tsx` (`HouseholdDashboardPage`) | Complete — Browser token status, member cards, default switcher, instant purge button |
| 7 | `/household/member` | `src/pages/HouseholdPages.tsx` (`MemberProfilePage`) | Complete — Member create/edit form with distinct allergies vs. intolerances |
| 8 | `/recipes/calculator` | `src/pages/RecipePages.tsx` (`RecipeCalculatorPage`) | Complete — Multi-ingredient builder, household unit converter, completeness-aware nutrient breakdown |
| 9 | `/recipes/saved` | `src/pages/RecipePages.tsx` (`SavedRecipesPage`) | Complete — Saved recipes list, reopen/edit in calculator, delete action |
| 10 | `/scanner` | `src/pages/ScannerPages.tsx` (`FoodScannerPage`) | Complete — RAM-only image upload, raw text parser, field-level confidence, proposed typo correction, manual confirmation |
| 11 | `/barcode` | `src/pages/ScannerPages.tsx` (`BarcodeLookupPage`) | Complete — Barcode lookup, sample Indian barcodes, Open Food Facts + manual fallback |
| 12 | `/recognition` | `src/pages/ScannerPages.tsx` (`FoodRecognitionPage`) | Complete — Experimental dish photo upload, candidate similarity cards, uncertainty labels, user confirmation |
| 13 | `/compare` | `src/pages/ComparisonMealsPages.tsx` (`ProductComparisonPage`) | Complete — 2–4 product selector, added sugar & sodium visual bars, per-100g normalized table |
| 14 | `/meals` | `src/pages/ComparisonMealsPages.tsx` (`MealSuggestionsPage`) | Complete — Meal type, diet preference, pantry ingredient filter, conflict alerts, meal cards |
| 15 | `/sources` | `src/pages/TrustPages.tsx` (`DataSourcesPage`) | Complete — Authoritative data sources cards with external links |
| 16 | `/privacy-safety` | `src/pages/TrustPages.tsx` (`PrivacySafetyPage`) | Complete — Medical safety, `NULL` integrity, RAM-only image policy, data deletion |
| 17 | `/about` | `src/pages/TrustPages.tsx` (`AboutPage`) | Complete — Project mission and architecture overview |
| 18 | `/settings` | `src/pages/TrustPages.tsx` (`SettingsPage`) | Complete — Household token controls and local search history management |

## 2. Reusable Components & Design Tokens (`tailwind.config.js` & `src/components/UIWidgets.tsx`)

- **Color Tokens**:
  - `brand` (Emerald/Forest green `#063927` to `#f2fbf7`) for primary actions and verified data indicators.
  - `turmeric` (Warm amber `#b45309` to `#fffbeb`) for portion-awareness and educational highlights.
  - `stone` (`#fafaf9` to `#1c1917`) for warm, readable surface hierarchy.
- **Reusable Widgets**: `Layout`, `MedicalSafetyBanner`, `ConfidenceBadge`, `EducationalCategoryBadge`, `FoodCard`, `MacroDistributionBarChart`, `ObservationCard`.

## 3. Design Decisions That Must Be Preserved During Figma Mapping

1. Persistent visibility of the **Medical Safety Disclaimer** and **Source Citations**.
2. Explicit rendering of **`NULL (Unknown)`** for unmeasured nutrients (never hiding missing values or showing `0`).
3. Strict visual separation between **Immunological Allergies** and **Digestive Intolerances**.
4. Mandatory **User Confirmation Step** before OCR-extracted or image-recognized items are used.

## 4. What Is Required from You Next

Please share:
- The **Figma design URL** (and view access or exported design tokens/assets if the file is private) so we can inspect your frames and map them directly onto the 18 implemented pages and reusable components.
