# Tailwind CSS v4 Reference

Detailed patterns for Tailwind v4 in Next.js 16 App Router projects. Foundation (design tokens, utility composition) is cited — this reference focuses on v4-specific mechanics and the migration path.

---

## 1. Foundation — Cited

### 1.1 Design Tokens / Single Source of Truth


Token bridge pattern: CSS custom properties in `:root` as single source of truth; alias blocks map template names to project names without find-and-replace. In v4 context, `:root` CSS vars and `@theme` vars serve different roles — both coexist in a typical `globals.css`.

### 1.2 Utility Composition


`clsx`/`cn` patterns for conditional utility application. The mental model is unchanged in v4 — what changes is *where* tokens are defined, not *how* classes compose in JSX.

---

## 2. The Oxide Engine

Tailwind v4's Rust-compiled build engine. Performance numbers (verified):

| Build type | Improvement |
|---|---|
| Full rebuild | >3.5× |
| Incremental | >8× |
| No-CSS-change incremental | >100× (microseconds) |

What moved out of `tailwind.config.js`:

- **Content detection** → automatic (scans JSX/TSX/Vue/Svelte/PHP/etc. using `.gitignore`)
- **Theme configuration** → `@theme` directive in CSS
- **Dark mode** → `@custom-variant` in CSS
- **PostCSS** → `@tailwindcss/postcss` replaces the old `tailwindcss` plugin; `postcss-import` and `autoprefixer` are now built-in

---

## 3. PostCSS Setup

```mjs
// postcss.config.mjs
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    // No postcss-import, no autoprefixer — v4 handles both
  },
};
```

Remove any `postcss-import` or `autoprefixer` entries from v3 configs.

---

## 4. CSS Entry

```css
/* app/globals.css */
@import "tailwindcss";
```

That's it. Replaces `@tailwind base; @tailwind components; @tailwind utilities;`.

---

## 5. `@theme` — Design Token Directive

```css
@theme {
  --color-brand-500: #1f2937;
  --color-brand-secondary: #f97316;
  --font-display: "Inter", sans-serif;
  --breakpoint-3xl: 1920px;
}
```

Every entry is **dual-purpose**:
- Emits a `:root` CSS variable
- Generates corresponding Tailwind utilities (`bg-brand-500`, `text-brand-500`, `font-display`, etc.)

### `@theme` vs `:root` — decision

| Block | Utilities? | CSS var? | Use for |
|---|---|---|---|
| `@theme` | Yes | Yes | Tokens that need utility classes + variant modifiers |
| `:root` | No | Yes | Non-utility CSS vars, or tokens only used in hand-written CSS |

**If you want `hover:bg-primary` or `dark:bg-primary`, the token MUST be in `@theme`.** `:root` tokens referenced by hand-written `.bg-primary {}` classes have no variant support — v4's variant engine only sees `@theme` entries.

### `@theme inline` — variable references

```css
@theme inline {
  --font-sans: var(--font-geist-sans);    /* from next/font/local */
}
```

Emits `font-family: var(--font-geist-sans)` in the generated CSS (vs. trying to resolve the value statically at build time). Required when pointing at runtime-injected variables like Next.js `localFont` output.

### Namespace reset

```css
@theme {
  --color-*: initial;         /* Remove all default Tailwind colors */
  --color-primary: #1f2937;
  --color-secondary: #f97316;
}
```

Useful when you want a brand-only palette and none of Tailwind's defaults.

---

## 6. `@utility` — Custom Utility Classes

```css
@utility btn-primary {
  background-color: var(--color-primary);
  color: white;
  border-radius: var(--card-radius);
  padding: 0.5rem 1rem;
}
```

Usage: `<button class="btn-primary hover:opacity-90 md:btn-primary">`.

Unlike a plain `.btn-primary {}` in `:root`, `@utility` classes participate in Tailwind's modifier system (hover, focus, dark, responsive breakpoints, group/peer).

---

## 7. `@custom-variant` — Dark Mode and Beyond

v4 removes `darkMode: "class"` from JS config. Define variants in CSS:

```css
/* Option 1: class strategy — applies when <html class="dark"> */
@custom-variant dark (&:where(.dark, .dark *));

/* Option 2: data-theme strategy — recommended with next-themes */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

**next-themes recommendation**: use `data-theme` strategy and configure `<ThemeProvider attribute="data-theme">`. Avoids hydration mismatches because Tailwind utility classes in the HTML don't change per theme — only the `data-theme` attribute on `<html>` does, which is safe for SSR.

---

## 8. Next.js 16 Integration

### `app/globals.css` canonical structure

```css
@import "tailwindcss";

/* Design tokens that need utility generation */
@theme {
  --color-primary: #1f2937;
  --color-secondary: #f97316;
}

/* Variable references (e.g., Next.js localFont) */
@theme inline {
  --font-sans: var(--font-geist-sans);
}

/* Dark mode strategy */
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

/* Base element resets (if needed) */
@layer base {
  *, ::after, ::before {
    border-color: var(--color-gray-200, currentColor);
  }
}

/* Reusable component classes */
@layer components {
  .card-theme { ... }
}

/* Or custom utilities with full variant support */
@utility btn-primary { ... }
```

### Server Components compat

v4 emits pure CSS — no runtime JS. RSC has zero interaction with Tailwind internals; utility classes are `className` strings, handled identically in server and client components. No special RSC configuration.

---

## 9. v3 → v4 Migration

### Automated first pass

```bash
npx @tailwindcss/upgrade    # Node 20+ required
```

### Manual renames

| v3 | v4 |
|---|---|
| `shadow-sm` | `shadow-xs` |
| `blur-sm` | `blur-xs` |
| `rounded-sm` | `rounded-xs` |
| `ring` (3px blue) | `ring` (1px currentColor); add `ring-3 ring-blue-500` |
| `bg-opacity-50` | `bg-color/50` (e.g., `bg-red-500/50`) |
| `flex-grow-*` | `grow-*` |
| `flex-shrink-*` | `shrink-*` |
| `outline-none` | `outline-hidden` |
| `@tailwind base/components/utilities` | `@import "tailwindcss"` |
| `tailwindcss` PostCSS plugin | `@tailwindcss/postcss` |

### Backward compat

Keep a v3 `tailwind.config.js` and load explicitly:

```css
@import "tailwindcss";
@config "./tailwind.config.js";
```

**Without `@config`, the JS file is silently ignored** — this is the #1 migration pitfall.

---

## 10. framer-motion Interop

Core rule: let each library do what it does best.

- **Tailwind**: static styling, layout, spacing, responsive design, color
- **Motion**: transitions, spring physics, gesture states, layout animations

### Clean composition

```tsx
<motion.div
  className="flex items-center gap-4 rounded-lg bg-primary p-4"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.3 }}
/>
```

Tailwind handles the static visual layer; Motion owns the animated properties.

### The conflict to avoid

```tsx
// BAD — Tailwind transition AND Motion animate fight over the same properties
<motion.div
  className="transition-all duration-300 bg-primary"
  animate={{ x: 100 }}
/>

// GOOD — Motion owns the animation; Tailwind owns everything else
<motion.div
  className="bg-primary"
  animate={{ x: 100 }}
  transition={{ duration: 0.3 }}
/>
```

Motion uses inline styles with higher specificity, but the CSS transition still tries to run. Result: stuttery or broken animations.

### Decision: CSS transition (Tailwind) vs JS animation (Motion)

| Use case | Tailwind | Motion |
|---|---|---|
| Hover color change | `hover:bg-primary-400 transition-colors` | Overkill |
| Fade-in on mount | — | `initial`/`animate` |
| Modal slide-up | — | `animate` + `AnimatePresence` |
| Focus ring | `focus:ring-2 transition-shadow` | Overkill |
| Spring-physics drag | — | `drag` + `dragConstraints` |
| Responsive layout | `sm:flex-row md:grid` | — |

### Capacitor perf note

Motion's `layout` prop (auto-animated position changes) is expensive in mobile WebView. Prefer explicit `initial`/`animate` values on Capacitor native builds; test on device.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "My `tailwind.config.js` changes don't apply" | No `@config` directive in CSS | Add `@config "./tailwind.config.js"` or migrate to `@theme` |
| `hover:bg-primary` doesn't work | Token in `:root`, not `@theme` | Move to `@theme` or write `@utility` |
| `bg-[var(--font-sans)]` looks wrong | Missing `inline` keyword in `@theme` | Use `@theme inline { --font-sans: var(...) }` |
| Dark mode classes don't apply | v3 `darkMode: "class"` ignored | Add `@custom-variant dark (...)` in CSS |
| Utilities not showing in build | v3 `@tailwind` directives still in CSS | Replace with `@import "tailwindcss"` |
| PostCSS errors about `postcss-import` | Still listed in `postcss.config.mjs` | Remove — v4 handles it |

---

## 12. Related Resources

- [Tailwind v4 official blog](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide)
- [Theme variables docs](https://tailwindcss.com/docs/theme)
- [Motion + Tailwind](https://motion.dev/docs/react-tailwind)
- `frontend-design-systems` — token bridge pattern
- `react-vite-modern-patterns` — component composition
- `nextjs-16-app-router` (sibling skill) — App Router integration, static export context
