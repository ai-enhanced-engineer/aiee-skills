---
name: tailwindcss-4-patterns
description: Tailwind CSS v4 patterns with Oxide engine, CSS-first config via @theme and @import, @tailwindcss/postcss plugin, v3 migration path, Next.js 16 integration, dark mode with @custom-variant, and framer-motion interop. Documents the "dead tailwind.config.js" anti-pattern when @config isn't linked.
updated: 2026-04-20
---

# Tailwind CSS v4 Patterns

Tailwind v4 moves configuration from JavaScript to CSS. This shift is the main source of confusion during migration: a `tailwind.config.js` file left alongside `@import "tailwindcss"` is **silently ignored** unless explicitly loaded via `@config`.

## When to use this skill

- Migrating a Next.js project from Tailwind v3 to v4
- Configuring tokens via `@theme` and understanding when `:root` is the better choice
- Setting up dark mode without the old `darkMode: "class"` JS option
- Composing framer-motion with Tailwind utilities (and avoiding the `transition-*` + `animate` conflict)
- Debugging "my config changes don't apply" — usually dead `tailwind.config.js`

## Core decisions (quick reference)

### v4 vs v3 at a glance

| Concern | v3 | v4 |
|---|---|---|
| Config | `tailwind.config.js` | `@theme` in CSS (JS optional, needs `@config`) |
| Content detection | `content: [...]` array | Automatic (Oxide scans source) |
| PostCSS plugin | `tailwindcss` | `@tailwindcss/postcss` |
| Import | `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| Dark mode | `darkMode: "class"` in JS | `@custom-variant dark (...)` in CSS |
| Performance | Node.js | Rust (Oxide): 3.5× full, 8× incremental |

### `@theme` vs `:root` — when to use which

| Block | Generates utility classes? | Generates CSS var? | Use for |
|---|---|---|---|
| `@theme { --color-brand: #1f2937 }` | **Yes** → `bg-brand`, `text-brand`, etc. | Yes | Design tokens that need utility + variant access |
| `:root { --color-brand: #1f2937 }` | No | Yes | Non-token CSS vars; tokens that won't use modifiers |

**Gotcha**: `:root` tokens referenced by hand-written `.bg-primary {}` classes lose `hover:`, `dark:`, `sm:` variant support. If you need variants, define in `@theme`.

### `@theme inline` — for variable references

Use when pointing a theme variable at another CSS variable (e.g., Next.js `localFont`):

```css
@theme inline {
  --font-sans: var(--font-geist-sans);
}
```

Without `inline`, Tailwind tries to resolve the value at build time and fails.

## Anti-pattern quick table

| Anti-Pattern | Pattern |
|---|---|
| Keep `tailwind.config.js` without `@config` in CSS | Silently ignored; changes have no effect |
| Use `text-[#1f2937]` arbitrary values instead of tokens | Breaks dark mode variants; drifts from design system |
| Duplicate `.bg-primary { ... }` in multiple CSS blocks | Specificity fights, maintenance risk |
| Combine `transition-*` class with framer-motion `animate` | Stuttery animations, both systems fight over the same properties |

## Foundation (cited, see reference.md)

- Design tokens / CSS var single source of truth → `frontend-design-systems`
- Utility composition, `clsx`/`cn` patterns → `react-vite-modern-patterns`

See **reference.md** for v3→v4 migration table, `@theme`/`@utility`/`@custom-variant` syntax, Next.js 16 wiring. See **examples.md** for annotated `globals.css`, `postcss.config.mjs`, dark mode setup, and framer-motion composition.
