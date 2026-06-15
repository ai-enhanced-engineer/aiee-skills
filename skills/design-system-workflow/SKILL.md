---
name: design-system-workflow
description: "Human-in-loop design system workflow using AI generation (Gemini) for brand identity exploration, dual-format token output (CSS + Swift), and WCAG contrast validation. Use when establishing a brand identity for a new product, generating design tokens for web and iOS, or validating a color palette against WCAG contrast requirements."
---

# Design System Workflow

Human-in-loop workflow for AI-assisted brand identity exploration and design token generation.

## When to Use

- Creating brand identity for a new product
- Exploring visual directions with AI generation (Gemini)
- Producing design tokens for cross-platform projects (web + iOS)
- Validating color palettes against WCAG accessibility requirements

> For CSS-only design systems, see `frontend-design-systems`.
> For SwiftUI color/font patterns, see `swift-swiftui` (Asset Management section).

---

## Three-Phase Workflow

1. **AI-Assisted Direction Exploration** — Batch Gemini prompts across multiple directions using natural language color descriptions. Sequential prompt-per-artifact generation with founder review between each.
2. **Founder Selection** — Consolidated HTML review page with annotations and decision boxes. Generation of next phase gates on approval.
3. **Dual-Format Token Production** — Single design direction produces CSS custom properties (web) and Asset Catalog + Swift extensions (iOS/watchOS). The design direction is the source of truth; each format is a translation.

## WCAG Contrast Validation

Specifying WCAG contrast ratios as explicit acceptance criteria (4.5:1 body text AA, 3:1 large text/UI AA) catches failures before merge. ~25% of AI-generated colors typically fail on first pass. A complete brand identity exploration typically requires ~15 crafted prompts (logo, palette, screens, app icon, watchOS).

## Strategic Pivot Copy Audit

When product positioning pivots, stale claims often persist in invisible locations — meta tags, OG descriptions, JSON-LD structured data, alt text, and app store descriptions. Auditing all copy (not just visible text) after a pivot prevents search engines and social previews from showing outdated messaging.

See `reference.md` for the pivot copy audit checklist.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| CSS tokens as sole output for iOS/SwiftUI apps | Dual-format: CSS for web + Asset Catalog + Swift extensions for native |
| Hex codes in Gemini/Imagen prompts | Natural language only ("sage green", "deep navy") — hex renders as literal text |
| Batch generation without founder gates | Sequential prompt-per-artifact with review between each |
| Skipping dark mode variants | Dark variants needed when any app context forces dark mode |
| Updating visible copy but leaving meta/OG/JSON-LD stale | Include meta tags, OG tags, and structured data in copy audit scope |

See `reference.md` for detailed phase descriptions, pre-implementation validation patterns, and SVG hand-coding guidance.
