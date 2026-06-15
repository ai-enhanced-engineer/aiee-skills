---
name: frontend-design-systems
description: Integrating design systems (Material Design, Carbon, etc.) into existing sites while preserving brand identity and design tokens. Use for design system adoption, brand preservation, visual consistency improvements, and subtle UX enhancements. Call for any work involving design tokens, CSS token bridges, or component-level design system integration.
kb-sources:
  - wiki/software-engineering/frontend-design-systems
updated: 2026-06-10
allowed-tools: Read, Grep, Glob
---

# Frontend Design Systems Integration

Best practices for integrating design systems without destroying existing brand identity.

## Core Principle

**Brand preservation > Design system purity**

Design systems provide valuable patterns, but blindly applying them can harm established brands.

## Safe Integration Pattern

1. **Audit first** - Document what would change
2. **Impact assessment** - Present changes to stakeholders
3. **Get approval** - Explicit sign-off on brand changes
4. **Start subtle** - Interaction patterns before visual overhaul
5. **Keep escape hatch** - Separate commits for easy reversion

## CSS Token Bridge for Template Adoption

When adopting a template that uses its own CSS custom property names, a token bridge alias section avoids the need to find-and-replace template variable names across all CSS files. Append an alias block to the project's existing `design-tokens.css`:

```css
/* Token bridge: template aliases → project tokens */
--color-bg: var(--bg-primary);
--color-text: var(--text-primary);
--color-accent: var(--accent-primary);
--font-heading: var(--font-brand);
```

Template CSS works without modification, project tokens remain the single source of truth, and both naming schemes are documented for future developers. This approach also makes template updates easier since template CSS files are never modified.

Find-and-replacing across all template CSS files is error-prone, makes template updates difficult, and can miss references in media queries or pseudo-elements.

## Hero Section Best Practices

- **Subtext length**: 80-120 characters max, 1-2 sentences. Leading with outcome rather than mechanism communicates value faster.
- **Trust signals** (privacy, security, AI): standalone badge elements near CTA tend to perform better than embedding multiple ideas in subtext.
- **H1 font weight**: 600-700 for marketing heroes; weight 300-400 reads as body text at display sizes.
- **5-second rule**: the value proposition should be clear without scrolling. Line count per viewport is a useful verification metric.

## Image Integration: Grid Flow over Absolute Positioning

When adding lifestyle or editorial photos to hero sections, the existing grid system (e.g., `hero-grid` with `1fr 1fr`) creates intentional-looking layouts with zero new CSS. Absolute positioning (`position: absolute; bottom: 0; right: 5%`) on centered-text layouts reads as an afterthought and often requires opacity tricks or gradient masks to look acceptable. Grid flow handles responsive collapse naturally.

## Grid Orphan Centering (2-Column Layouts)

When a 2-column grid has an odd number of items, the last item sits alone on the left. Center it with:

```css
@media (min-width: 969px) {
  .grid > :last-child:nth-child(odd) {
    grid-column: 1 / -1;
    justify-self: center;
    max-width: calc(50% - var(--space-xl) / 2);
  }
}
```

On mobile single-column layouts, the `max-width` constraint makes the card too narrow — scope to desktop breakpoints only.

## `max-width` + `text-align: center` Interaction

| Anti-Pattern | Pattern |
|--------------|---------|
| Global `p { max-width: 60ch }` inside `text-align: center` containers — paragraph is narrower than container and sits left-aligned | Add `margin-left: auto; margin-right: auto` to centered paragraphs, or scope `max-width` more narrowly |

## Shared-Stylesheet Scoping (Single-File Design Systems)

When new rules live in a stylesheet shared across pages that reuse base selectors, scope them so they cannot leak:

```css
/* Prefix the component root, then descend with explicit child combinators */
.blog-article > .container > p { margin-block: var(--space-md); }
```

A unique prefix class plus `> .container >` child combinators confines the rule to one component subtree — a bare `p { … }` or `.container p { … }` will reach every page sharing the base markup.

**Reset-based base-`p` rhythm gotcha**: in reset-based systems the base `p` has `margin: 0`, and each context re-adds its own spacing. A new prose context inherits *nothing* and collapses into a wall of text until you give it scoped vertical rhythm. Don't assume default paragraph spacing exists — set it explicitly on the new context. Screenshot-verify at real widths: markup and JSON-LD validation pass while a collapsed-spacing or CSS-leak bug only shows in the browser.

## Post-Build UI Audit Cycle

Ship to branch → launch audit agent in background (`aiee-frontend-engineer` or `frontend-accessibility`) → group findings by severity (Critical → High → Medium → Low) → batch-fix per tier → visual verify with Playwright before merge.

In practice this catches 20+ issues per page: broken `aria-labelledby`, wrong semantic elements, cursor affordances on non-interactive elements. See `reference.md § Post-Build UI Audit Cycle` for the full step-by-step procedure.

## Headless Playwright + IntersectionObserver fade-ins

Sites that use IntersectionObserver to fade cards in from `opacity: 0` (common pattern: `main.js` toggles `.is-visible` class on scroll-into-view) render as empty white space in headless Playwright screenshots — no scroll event fires, so the observer never triggers.

Fix before screenshotting:

```js
await page.evaluate(() => {
    document.querySelectorAll('.card, [data-animate]').forEach(el => {
        el.style.opacity = '1';
        el.classList.add('is-visible');
    });
});
await page.screenshot({ path: 'out.png', fullPage: true });
```

**Localhost gotcha**: `WebFetch` auto-upgrades `http://` to `https://` and fails on local dev servers. Use Playwright MCP tools (`browser_navigate` + `browser_snapshot`) to inspect localhost — the accessibility snapshot is structured text that's easier to analyze than a screenshot.

See `reference.md` for detailed patterns and case studies.
