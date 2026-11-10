# GharPlate — Frontend Visual Refinement & Light-Green Botanical Design System

## 1. Visual Inspiration & Design Philosophy

Inspired by the editorial storytelling, layered hero depth, ambient motion, and visual hierarchy of the official [Mysuru Dasara website](https://mysoredasara.gov.in/), GharPlate translates those presentation principles into a calm, trustworthy, **light-green botanical and culinary design system**.

## 2. CSS Custom Properties & Color Tokens (`frontend/src/index.css`)

```css
:root {
  --background: #f1f6f1;
  --background-elevated: #f7fbf7;
  --surface: rgba(255, 255, 255, 0.86);
  --surface-solid: #ffffff;
  --surface-soft: #e8f2e9;
  --surface-mint: #dff0e4;
  --primary: #087153;
  --primary-dark: #064d3c;
  --primary-light: #d8f0e1;
  --accent-gold: #e9b949;
  --text-primary: #172b23;
  --text-secondary: #566960;
  --border: rgba(25, 75, 55, 0.13);
  --border-strong: rgba(8, 113, 83, 0.24);
}
```

## 3. Glossy Restrained Surfaces & Ambient Animations

- **Glossy Surfaces (`.gp-surface`, `.gp-surface-elevated`, `.gp-hero-surface`)**:
  - Controlled backdrop blur (`backdrop-filter: blur(10px–14px)`), soft botanical borders (`rgba(25, 75, 55, 0.13)`), and layered emerald-tinted elevation shadows (`--shadow-soft`, `--shadow-elevated`), while keeping forms, tables, and nutrition readouts crisp on solid `#ffffff` / `#f7fbf7` surfaces.
- **Ambient Botanical Backdrop (`data-testid="ambient-botanical-backdrop"` in `Layout.tsx`)**:
  - Slow-drifting translucent sage, mint, and warm-gold light orbs (`.animate-gp-orb`, `.animate-gp-orb-delayed`) and delicate botanical vector curves rendered with `pointer-events: none` so they never interfere with clicks, forms, or scrolling.
- **Micro-Interactions & Accessibility**:
  - Interactive cards (`.gp-card-interactive`) gently elevate on hover (`translateY(-3px)`), buttons provide tactile active feedback (`active:scale-[0.98]`), and all keyframe animations and transitions strictly honor `@media (prefers-reduced-motion: reduce)`.
