---
name: frontend-material-design-3
description: Material Design 3 (Material You) patterns for dashboards and web apps. Use for M3 components, design tokens, color system, tonal elevation, navigation patterns, canonical layouts, or dashboard layouts. Covers Angular Material and Svelte implementations.
kb-sources:
  - wiki/software-engineering/material-design-3
updated: 2026-05-21
---

# Material Design 3 Patterns

M3 is Google's design system emphasizing dynamic color, personalization, and accessibility.

## Key Pillars

| Pillar | Description |
|--------|-------------|
| **Dynamic Color** | System-driven color from source color or user preferences |
| **Tonal Elevation** | Surface tints replace drop shadows (5-14% opacity) |
| **Typography** | 15-token scale: Display, Headline, Title, Body, Label |
| **Motion** | Physics-based animations (M3 Expressive, 2025) |

## Color Roles Quick Reference

| Role | Purpose | Light | Dark |
|------|---------|-------|------|
| `primary` | Key actions | Tone 40 | Tone 80 |
| `on-primary` | Text on primary | Tone 100 | Tone 20 |
| `surface` | Background | Tone 99 | Tone 10 |
| `on-surface` | Default text | Tone 10 | Tone 90 |
| `surface-variant` | Differentiated areas | Tone 90 | Tone 30 |

## Window Size Classes

| Class | Width | Navigation |
|-------|-------|------------|
| **Compact** | 0-599dp | Bottom nav bar |
| **Medium** | 600-839dp | Navigation rail |
| **Expanded** | 840dp+ | Navigation drawer |

## Canonical Layouts

| Layout | Use Case |
|--------|----------|
| **List-Detail** | Email, file browsers, settings |
| **Supporting Pane** | Document + properties, chat + context |
| **Feed** | Social feeds, news, product catalogs |

## Quick Example

```css
/* M3 Token Usage */
.card {
  background: var(--md-sys-color-surface);
  color: var(--md-sys-color-on-surface);
  border-radius: var(--md-sys-shape-corner-medium, 12px);
}
```

## When NOT to Use

- Simple static pages (hand-code faster)
- Non-Google ecosystem projects preferring other systems (Carbon, Fluent)
- Projects requiring M2 backwards compatibility

See `reference.md` for complete token system, Angular/Svelte setup, and component patterns.
See `examples.md` for dashboard implementations and theme switching.
