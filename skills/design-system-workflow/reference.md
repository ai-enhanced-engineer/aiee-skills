# Design System Workflow — Reference

Detailed phase descriptions and supporting patterns for the design system workflow.

## Phase 1: AI-Assisted Direction Exploration (Detail)

Batch Gemini prompts across multiple directions (e.g., 5 prompts per direction, 3 directions = 15 prompts). Natural language color descriptions produce cleaner output than hex codes — Imagen renders CSS specs as literal text in generated images. Storing all prompts in a `gemini-prompts.md` enables repeatability.

**Prompt-per-artifact sequential pattern**: One Gemini prompt per wireframe/mockup, pasted sequentially by the founder. The founder reviews each output before proceeding, catching issues early and building confidence in the direction. This outperforms batch generation because early corrections prevent wasted effort on rejected directions.

## Phase 2: Founder Selection (Detail)

Present all directions in a consolidated HTML review page (e.g., `brand-preview.html`) with annotations, dependency tags (Watch-required, accessibility), and decision boxes. The founder opens it in a browser, reviews everything, and makes decisions inline.

**Gate**: Desktop/detail generation is blocked until mobile/direction is approved. This avoids wasted generation on unapproved directions. The pattern was validated across brand identity, app wireframes, and website design workflows.

## Phase 3: Dual-Format Token Production (Detail)

A single design direction produces two output formats:

- **CSS custom properties** (`design-tokens.css`): For web and marketing sites
- **Asset Catalog + Swift extensions**: `Assets.xcassets` color sets with light/dark variants + `Color`/`Font` extensions for iOS/watchOS

The design direction (palette, typography, color roles) is the source of truth; each format is a translation. Dark mode variants are needed when any app context forces `.preferredColorScheme(.dark)`.

## Pre-Implementation Validation

Running the owner agent's validation pass against the ticket and codebase before starting implementation catches:
- Format mismatches (CSS output specified for an iOS/SwiftUI app)
- Missing requirements (dark mode variants, Reduce Motion alternatives)
- Structural issues (ticket duplication across repos, truncated content)
- Scope gaps (missing acceptance criteria, missing test plan)

Validation cost: ~2 minutes of agent time. Savings: avoids discovering gaps mid-implementation or during review.

## SVG Hand-Coding

When AI image generators produce raster concepts (JPG/PNG), simple geometric marks — wave forms, circles, abstract shapes — can be recreated as SVG bezier curves directly in code. This is faster than using Illustrator or Figma for simple geometric forms but does not scale to complex illustrations. Production SVGs (mark, wordmark, lockup, app icon) can be created this way without design tool dependencies.

## Strategic Pivot Copy Audit Checklist

When product positioning pivots, audit all copy — not just visible text:

1. **Grep for stale terminology** across the full site/app
   ```bash
   grep -rn "old-term" index.html src/ public/
   ```
2. **Meta tags**: `<title>`, `<meta name="description">`, `<meta name="keywords">`
3. **Open Graph**: `og:title`, `og:description`, `og:image` alt text
4. **JSON-LD structured data**: `@type`, `description`, `name` fields
5. **Alt text**: All `<img alt="...">` attributes
6. **App store descriptions**: If applicable, update store listings
7. **Verify with Lighthouse**: Run accessibility and SEO audits after changes

**Common miss**: Meta tags and JSON-LD are invisible in the browser but indexed by search engines and social previews. Stale OG descriptions persist in link previews across Slack, Twitter, LinkedIn.

## Ticket Management

Identical tickets across repos (e.g., same FEAT number in both an app repo and a website repo) create ownership ambiguity and risk of divergent edits. The canonical ticket belongs in the primary consumer repo, with a one-liner reference in secondary repos.
