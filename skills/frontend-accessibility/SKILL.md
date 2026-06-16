---
name: frontend-accessibility
description: Web accessibility patterns for WCAG 2.1 AA compliance including ARIA, keyboard navigation, screen reader support, contrast ratios, touch targets, design-token contrast safety, and Svelte-specific implementations. Use for accessibility audits, a11y implementation, ADA compliance, or inclusive design.
kb-sources:
  - wiki/software-engineering/frontend-accessibility
updated: 2026-06-15
allowed-tools: Read, Grep, Glob
---

# Frontend Accessibility Patterns

WCAG 2.1 AA compliance patterns for modern web applications.

## Core Principles (POUR)

| Principle | Description |
|-----------|-------------|
| **Perceivable** | Information presentable in ways users can perceive |
| **Operable** | Interface components operable by all users |
| **Understandable** | Information and operation understandable |
| **Robust** | Works with current and future technologies |

## Keyboard Navigation

- **Tab/Shift+Tab**: Navigate interactive elements
- **Enter/Space**: Activate buttons/links
- **Escape**: Close modals/dropdowns
- **Arrow keys**: Navigate lists/menus

## Color Contrast (WCAG AA)

- Normal text: **4.5:1** minimum
- Large text (18pt+): **3:1** minimum
- Interactive elements: **3:1** minimum

Common fix: maintain hue, reduce HSL lightness ~20% (e.g. `#ef4444` → `#c53030`). See `reference.md → Color Contrast` for the safe-combinations table and dark-mode re-validation guidance.

## Focus Management

- Visible focus indicators (`outline: none` without alternative removes keyboard discoverability)
- Use `:focus-visible` over `:focus` — only shows for keyboard navigation
- Trap focus in modals, return focus on close
- Manage focus on route changes

## Motion and Animation

CSS animations include `prefers-reduced-motion` overrides (WCAG 2.1 AAA criterion 2.3.3 — vestibular disorder risk).

## Touch Targets

WCAG 2.5.5 requires interactive elements to have `min-width: 44px; min-height: 44px`. Common violations: `.btn-sm` (36px), `.btn-icon` (28px), `.copy-btn` (32px). Padding alone can produce heights under 44px (e.g., `padding: 0.625rem` = ~42.5px) — explicit `min-height: 44px` prevents the under-44px result.

## Name, Role, Value (WCAG 4.1.2) — Conditional Role

Apply a landmark or group `role` only when an accessible name is present. `role={label ? "group" : undefined}` — a `role` with `aria-labelledby={undefined}` exposes a nameless region that adds nothing to the a11y tree and can mislead AT users.

**Testable touch-target contract**: stamp `data-wcag-touch-target="44"` on sized elements so unit tests assert WCAG intent without computing layout (jsdom cannot measure rendered size). Test: `expect(el).toHaveAttribute('data-wcag-touch-target', '44')`.

See `reference.md` → *Conditional Role and Testable Contract* for code examples and axe-core rule details.

## Design Token Contrast Safety

`var(--text-muted)` (~4.48:1 at `#718096`) lands under WCAG AA's 4.5:1 minimum for body copy below 18px — not safe to default for body text; `var(--text-secondary)` (~7:1) is safe for all sizes. Without a paired override, body text on a dark section fails WCAG AA 4.5:1 contrast.

See `reference.md` → *Design Token Contrast Safety* for the full contrast-ratio table and the dark-section override pattern.

## Checklists

Pre-flight CSS (token validation, contrast, hover-affordance) and pre-placement audit (section rhythm, card-variant reuse, token palette) — see `reference.md` → *Pre-Flight CSS Checklist* and *Pre-Placement Audit* for the full checklists.

## Stretched-Link Cards (Single Tab Stop)

A card with both a title link and a "read more" link creates two tab stops for one destination. Collapse to one via `::after` overlay on the title link; render "read more" as `aria-hidden="true"` `<span>`. See `reference.md → Stretched-Link Cards` for the CSS pattern and Playwright pointer-interception verification.

## Common Mistakes

- Missing `alt` on images
- Form inputs without labels
- Color as only indicator
- Mouse-only interactions
- Missing skip links
- Auto-playing media
- Conflicting visual states (e.g., "featured" and "selected" using same indicator)
- `.sr-only` defined per-component instead of global styles

See `reference.md → Common Mistakes — Extended` for Retina 2x source-size and `<dt>`/`<dd>` ordering items.

See `reference.md` for the Interactive Component Checklist, full WCAG 2.1 AA criteria tables, testing tools, ARIA roles reference, Shadow DOM accessibility, and dark mode contrast details.

See `examples.md` for Svelte 5 accessible components (button, modal, form input, chat message list, typing indicator, connection status, skip link, focus trap utility, Web Component a11y), progressive disclosure HTML/CSS, and decorative element patterns.
