# GharPlate — Body & Nutrition Explorer Two-Level Full-Width Layout

## 1. Structural Problem Fixed

Previously, `BodyNutritionExplorerPage.tsx` placed the entire page inside a single permanent two-column grid (`lg:grid-cols-12`), trapping **Key Nutrients**, **Verified Indian Foods**, **Food Recommendations**, and **Evidence** inside the right-hand 6-column container and leaving empty vertical whitespace beneath the 3D viewer on the left.

## 2. Two-Level Page Composition (`BodyNutritionExplorerPage.tsx`)

### Level A — Top Anatomy Exploration Area (`data-testid="anatomy-exploration-level-a"`)

A balanced 12-column top section (`grid gap-6 lg:grid-cols-12 items-stretch`):

- **Left (`lg:col-span-7`) — 3D Internal Anatomy Viewer**:
  - High-resolution (`860×920` internal canvas, `560px–600px` display height) 3D viewport.
  - Four presets: **`Full Internal Anatomy` (`Default`)**, **`Muscular System`**, **`Internal Organs`**, and **`Skeletal System`**, plus **Male Ref / Female Ref** switcher and 10-layer visibility popover.
  - Camera toolbar (`⌖ Focus`, Rotate Left/Right, Zoom In/Out, Front/Back View, Isolate Selected, Reset).
  - Real-time FMA / structure search (`data-testid="anatomy-structure-search"`) and 28 skinless internal structure chips.
- **Right (`lg:col-span-5`) — Selected Anatomy Information (`data-testid="selected-anatomy-info-panel"`)**:
  - **Selected 3D Structure Banner (`data-testid="selected-3d-structure-card"`)**: Displays the selected mesh's `FMA ID`, full anatomical name, system label, structural description, camera focus trigger, and quick jump to verified foods.
  - **Selected Body Region Physiology Card (`data-testid="body-region-detail-panel"`)**: Displays the physiological function, ICMR-NIN 2024 dietary pattern guidance, hydration link, Key Nutrients Overview pills, and summary counters.

### Level B — Full-Width Nutrition, Food Recommendations, Comparison, Recipes & Evidence (`data-testid="anatomy-full-width-level-b"`)

Separated below Level A and spanning **100% of the available content width (`max-w-7xl w-full`)** from the left edge to the right edge:

1. **Full-Width Section 1 — Key Nutrients for This Body Region (`data-testid="full-width-nutrients-section"`)**:
   - Responsive 4-column desktop grid (`grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`) presenting each nutrient's physiological role, ICMR-NIN RDA reference note, evidence grade, and publication source.
2. **Full-Width Section 2 — Verified Indian Food Sources & Recommendations (`data-testid="full-width-foods-section"`)**:
   - Responsive 3-to-4 column desktop grid (`grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`), 2 columns on tablet, 1 column on mobile.
   - Each card displays the verified food photograph (`FoodImage`), food name, household serving size, primary nutrient value & basis (`per 100g`), protein, energy, kitchen preparation tip, IFCT 2017 / ICMR-NIN 2024 source badge, `Open Food Detail →` link, and `+ Log in Diary` with inline serving confirmation.
3. **Full-Width Section 3 — Side-by-Side Nutrient Comparison (`data-testid="full-width-food-comparison-section"`)**:
   - Full-width tabular comparison of all recommended Indian foods for the selected body region.
4. **Full-Width Section 4 — Recommended Indian Recipes (`data-testid="full-width-recipes-section"`)**:
   - Responsive 3-column grid (`grid gap-5 sm:grid-cols-2 lg:grid-cols-3`) of verified GharPlate recipes with per-serving macros and links to Guided Cooking mode.
5. **Full-Width Section 5 — Evidence, Clinical References & 3D Attribution (`data-testid="full-width-evidence-section"`)**:
   - Full-width 3-column reference footer documenting physiological scope (`"These foods contain nutrients that support normal physiological function"`), ICMR-NIN citations, and CC BY 4.0 3D anatomy attributions.
