# GharPlate — Dark-Emerald Sidebar & Cursor-Responsive Glow Design Update

## 1. Dark-Emerald Left Sidebar Theme
Implemented in `frontend/src/index.css` and `frontend/src/components/Layout.tsx`:
- **CSS Custom Properties**:
  - `--sidebar-bg: #064E3B`
  - `--sidebar-surface: #075B45`
  - `--sidebar-active: #087A5B`
  - `--sidebar-hover: rgba(52, 211, 153, 0.14)`
  - `--sidebar-text: #E8FFF4`
  - `--sidebar-muted: #A7D9C0`
  - `--sidebar-border: rgba(210, 255, 232, 0.18)`
- **Visual Boundary Separation**:
  - `.gp-sidebar-surface` uses a rich dark-emerald vertical gradient (`#064E3B` -> `#075B45` -> `#053F30`), a crisp right-hand border (`1.5px solid var(--sidebar-border)`), and an elevated right-edge shadow so the navigation sidebar is immediately distinct from the light-green main workspace (`#f1f6f1`).
- **Updated Navigation Hierarchy**:
  - **Explore**: `Food Explorer` (`/foods`), `Body & Nutrition` (`/explore/body-nutrition`), `Find Food Nearby` (`/food-nearby`)
  - **My Health**: `Household & Profiles` (`/household`), `Health Reports` (`/health/reports`), `Symptom Review` (`/health/symptoms`), `Health Measurements` (`/health/measurements`), `Health Guidance` (`/conditions`)
  - **Bottom AI Entry**: Prominent `Ask GharPlate AI` button (`data-testid="sidebar-ask-gharplate-btn"`).

## 2. Cursor-Responsive Light-Green Glow & Reduced-Motion Support
- `Layout.tsx` tracks pointer movement on `data-testid="main-content-workspace"` and updates `--cursor-x` and `--cursor-y` CSS variables on the workspace container without triggering React re-renders.
- `.gp-main-workspace` renders a subtle `560px` radial emerald glow following `--cursor-x` and `--cursor-y`.
- Under `@media (prefers-reduced-motion: reduce)`, the dynamic radial glow is automatically disabled in favor of a calm static botanical background.
