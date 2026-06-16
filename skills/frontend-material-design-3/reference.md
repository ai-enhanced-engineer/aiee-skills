# Material Design 3 Reference

Complete reference for M3 design tokens, theming, and implementation patterns.

---

## Color System

### Tonal Palette Architecture

```
Source Color (Brand) → Material Color Algorithm → 5 Key Colors → 5 Tonal Palettes → 40+ Semantic Tokens
```

Each tonal palette has 13 tones: 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100

### Complete Color Roles

| Role | Purpose | Light Theme | Dark Theme |
|------|---------|-------------|------------|
| `primary` | Key actions, prominent elements | Tone 40 | Tone 80 |
| `on-primary` | Content on primary | Tone 100 | Tone 20 |
| `primary-container` | Less prominent containers | Tone 90 | Tone 30 |
| `on-primary-container` | Content on primary-container | Tone 10 | Tone 90 |
| `secondary` | Secondary actions | Tone 40 | Tone 80 |
| `on-secondary` | Content on secondary | Tone 100 | Tone 20 |
| `tertiary` | Accent elements | Tone 40 | Tone 80 |
| `surface` | Background | Tone 99 | Tone 10 |
| `on-surface` | Default text | Tone 10 | Tone 90 |
| `surface-variant` | Differentiated surfaces | Tone 90 | Tone 30 |
| `surface-container-lowest` | Lowest elevation surface | Tone 100 | Tone 4 |
| `surface-container-low` | Low elevation (cards) | Tone 96 | Tone 10 |
| `surface-container` | Medium elevation | Tone 94 | Tone 12 |
| `surface-container-high` | High elevation (modals) | Tone 92 | Tone 17 |
| `surface-container-highest` | Highest elevation | Tone 90 | Tone 22 |
| `outline` | Borders, dividers | Tone 50 | Tone 60 |
| `error` | Error states | Tone 40 | Tone 80 |
| `on-error` | Content on error | Tone 100 | Tone 20 |

### Tonal Elevation

M3 uses surface tints instead of drop shadows:

| Level | Opacity | Use Case |
|-------|---------|----------|
| 0 | 0% | Flat surfaces |
| 1 | 5% | Cards, slight elevation |
| 2 | 8% | Modals, dropdowns |
| 3 | 11% | Navigation drawers |
| 4 | 12% | Dialogs |
| 5 | 14% | Maximum elevation |

---

## Typography Scale

### 15 Type Tokens

| Category | Large | Medium | Small |
|----------|-------|--------|-------|
| **Display** | 57/64 | 45/52 | 36/44 |
| **Headline** | 32/40 | 28/36 | 24/32 |
| **Title** | 22/28 | 16/24 | 14/20 |
| **Body** | 16/24 | 14/20 | 12/16 |
| **Label** | 14/20 | 12/16 | 11/16 |

Format: size/line-height in sp (scalable pixels)

### CSS Token Names

```css
--md-sys-typescale-display-large-size: 57px;
--md-sys-typescale-display-large-line-height: 64px;
--md-sys-typescale-body-large-size: 16px;
--md-sys-typescale-label-large-weight: 500;
```

---

## Shape Tokens

| Token | Value | Use Case |
|-------|-------|----------|
| `corner-none` | 0px | Square edges |
| `corner-extra-small` | 4px | Small chips |
| `corner-small` | 8px | Buttons, small cards |
| `corner-medium` | 12px | Cards, dialogs |
| `corner-large` | 16px | Large containers |
| `corner-extra-large` | 28px | FABs, sheets |
| `corner-full` | 9999px | Circular/pill shapes |

---

## Angular Material 3 Setup

### CSS-First Theming (Angular 21+, Recommended)

Angular 21 uses CSS custom properties by default. No Sass required:

```typescript
// app.config.ts
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';

export const appConfig = {
  providers: [
    provideAnimationsAsync(),
    provideExperimentalZonelessChangeDetection(),
  ]
};
```

```css
/* styles.css - Override M3 tokens directly */
:root {
  /* Primary colors */
  --mat-sys-primary: #1e5ba8;
  --mat-sys-on-primary: #ffffff;
  --mat-sys-primary-container: #d4e3ff;
  --mat-sys-on-primary-container: #001c38;

  /* Surface colors */
  --mat-sys-surface: #faf8f5;
  --mat-sys-on-surface: #0a0a0a;
  --mat-sys-surface-container-low: #f4f2ef;
  --mat-sys-surface-container: #eeecea;

  /* Shape */
  --mat-sys-corner-medium: 12px;
}

.dark-theme {
  --mat-sys-primary: #a5c8ff;
  --mat-sys-on-primary: #00305a;
  --mat-sys-surface: #1a1a1a;
  --mat-sys-on-surface: #e6e1dc;
}
```

### Legacy Sass Theming (Angular 18 and earlier)

<details>
<summary>Click to expand Sass-based configuration</summary>

```scss
@use '@angular/material' as mat;

$light-theme: mat.define-theme((
  color: (
    theme-type: light,
    primary: mat.$violet-palette,
    tertiary: mat.$blue-palette,
  ),
  typography: Roboto,
  density: 0,
));

:root {
  @include mat.all-component-themes($light-theme);
}
```

</details>

### Component Token Overrides

```css
/* Override specific component tokens */
.custom-button {
  --mdc-filled-button-container-color: var(--mat-sys-primary);
  --mdc-filled-button-label-text-color: var(--mat-sys-on-primary);
}

.custom-card {
  --mdc-elevated-card-container-color: var(--mat-sys-surface-container-low);
}
```

---

## Svelte M3 Implementation

### Direct CSS Token Approach

```svelte
<script lang="ts">
  let { theme = 'light' } = $props();
</script>

<div class="container" class:dark={theme === 'dark'}>
  <slot />
</div>

<style>
  .container {
    background: var(--md-sys-color-surface, #fef7ff);
    color: var(--md-sys-color-on-surface, #1d1b20);
    border-radius: var(--md-sys-shape-corner-medium, 12px);
  }

  .container.dark {
    background: var(--md-sys-color-surface-dark, #141218);
    color: var(--md-sys-color-on-surface-dark, #e6e0e9);
  }
</style>
```

### M3 Svelte Library (Optional)

```bash
npm install m3-svelte
```

Full M3 implementation with components, animations, and theming.

> **Bundle Note**: Evaluate bundle size impact before using in widgets. For size-constrained applications (< 50KB target), prefer the CSS token approach above. The CSS approach is also more flexible for custom theming.

---

## Component Patterns

### Cards

| Type | Style | Use Case |
|------|-------|----------|
| **Elevated** | Tonal elevation level 1 | Primary content |
| **Filled** | Surface-variant background | Grouped content |
| **Outlined** | 1dp outline, no elevation | Selectable items |

### Navigation

| Component | Window Class | Max Destinations |
|-----------|--------------|------------------|
| Navigation Bar | Compact | 3-5 |
| Navigation Rail | Medium | 3-7 + FAB |
| Navigation Drawer | Expanded | Unlimited |

### Data Tables

- Embed in cards with header actions
- Sort indicators in column headers
- Selection checkboxes left-aligned
- Pagination at footer
- Row hover: `surface-variant`

---

## Accessibility Requirements

### Contrast Ratios (WCAG 2.1 AA)

| Element | Minimum Ratio |
|---------|---------------|
| Normal text | 4.5:1 |
| Large text (18pt+) | 3:1 |
| UI components | 3:1 |

### Built-in M3 Accessibility

- Tonal palettes designed for AA compliance
- `on-*` tokens guarantee readable text
- Dynamic color maintains contrast
- 48x48dp minimum touch targets

---

## M3 Expressive (2025)

New emotional design patterns from Google I/O 2025:

| Element | Traditional | Expressive |
|---------|------------|------------|
| Color | Functional | Emotional, attention-guiding |
| Motion | Subtle | Physics-based, energetic |
| Shape | Rounded | More varied |
| Size | Consistent | Emphasis through variation |

**Status**: Alpha - experiment in non-critical features first.

---

## Tools

- **[Material Theme Builder](https://m3.material.io/theme-builder/)** - Generate color schemes
- **[Figma M3 Design Kit](https://www.figma.com/community/file/1035203688168086460)** - Design resources
- **[WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)** - Accessibility validation
