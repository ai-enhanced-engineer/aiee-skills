# Tailwind CSS v4 Examples


---

## Example 1: The Current State — Dead `tailwind.config.js`

The project has this in the project root:

```javascript
// tailwind.config.js (actual)
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1f2937",
        primaryAccent: "#f97316",
      },
    },
  },
  plugins: [],
};
```

And this in `app/globals.css`:

```css
@import "tailwindcss";     /* v4 entry */

:root {
  --color-primary: #1f2937;
  --color-secondary: #f97316;
}

.bg-primary { background-color: var(--color-primary); }
.text-primary { color: var(--color-primary); }
```

**The problem**: `@config` is missing. Tailwind v4 does NOT auto-load `tailwind.config.js` — the `theme.extend.colors.primary` and `primaryAccent` are silently discarded. The project works visually only because the same colors are re-declared as CSS vars in `globals.css`.

**Verification that config is dead**:
```bash
# This class should exist if tailwind.config.js was active:
grep -r "class=.bg-primary" app/  # uses the hand-written rule, not Tailwind-generated
```

`bg-primaryAccent` wouldn't work as a utility class — it only works because someone hand-wrote a `.bg-primaryAccent {}` rule.

---

## Example 2: Fix — Migrate to `@theme`

### Option A (recommended): delete `tailwind.config.js`, move tokens to `@theme`

```css
/* app/globals.css — migrated */
@import "tailwindcss";

@theme {
  --color-primary: #1f2937;
  --color-primary-orange: #f97316;
}

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

Then delete `tailwind.config.js` entirely.

**What you gain**:
- `bg-primary`, `text-primary`, `border-primary`, `bg-primary/50`, `hover:bg-primary`, `dark:bg-primary`, `md:bg-primary` — all work automatically
- `bg-primary-orange` generated for free
- Delete the hand-written `.bg-primary {}` and `.text-primary {}` rules — utilities replace them

### Option B (slower migration): keep config, link it

```css
@import "tailwindcss";
@config "./tailwind.config.js";       /* explicit load */
```

Now `tailwind.config.js` is live. But this is a migration waypoint, not a destination — v4 projects should land on option A.

---

## Example 3: The `:root` vs `@theme` Distinction in Practice

The project's `globals.css` has this pattern (simplified):

```css
:root {
  --color-primary: #1f2937;
}

.bg-primary {
  background-color: var(--color-primary);
}
```

And this component:

```tsx
<button className="bg-primary hover:bg-primary-dark">Submit</button>
```

**`hover:bg-primary-dark` silently does nothing.** Tailwind's variant engine only sees `@theme` entries — your hand-written `.bg-primary` class has no hover variant. The `hover:` prefix gets parsed by Tailwind but finds no matching utility to modify.

### Fix — move primary to `@theme`

```css
@import "tailwindcss";

@theme {
  --color-primary: #1f2937;
  --color-primary-dark: #0d3815;
}
```

Delete `.bg-primary {}` and `.hover:bg-primary-dark {}` — no longer needed. The utilities are generated with full variant support.

---

## Example 4: Next.js `localFont` Wiring (correct pattern)

```tsx
// app/layout.tsx
import localFont from "next/font/local";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff2",
  variable: "--font-geist-sans",
});

const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff2",
  variable: "--font-geist-mono",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

```css
/* app/globals.css */
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);    /* inline is critical */
  --font-mono: var(--font-geist-mono);
}
```

**Why `inline`**: without it, Tailwind tries to resolve `var(--font-geist-sans)` at build time. The variable doesn't exist yet — it's injected at runtime by `next/font/local` on the `<html>` element. `inline` tells Tailwind to emit the `var()` reference verbatim in the generated CSS.

Usage:
```tsx
<p className="font-sans">Body text in Geist</p>
<code className="font-mono">Code in Geist Mono</code>
```

---

## Example 5: Fixing a Duplicate `.bg-primary`

The project's `globals.css` has `.bg-primary` defined at two locations. Simplified:

```css
/* Around line 100 */
:root {
  --color-primary: #1f2937;
}
.bg-primary {
  background-color: var(--color-primary);
}

/* Around line 177 */
.bg-primary {
  background-color: #1f2937;     /* hardcoded, no var */
}
```

The second definition wins by source-order. Any future change to `--color-primary` won't propagate to components using `bg-primary` — they'll keep the hardcoded hex.

### Fix — pick one source, delete the other

```css
@theme {
  --color-primary: #1f2937;
}
/* That's it. Tailwind generates .bg-primary automatically.
   Delete both hand-written blocks. */
```

---

## Example 6: Dark Mode with next-themes

```bash
npm install next-themes
```

```tsx
// app/providers.tsx
"use client";
import { ThemeProvider } from "next-themes";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
      {children}
    </ThemeProvider>
  );
}
```

```css
/* app/globals.css */
@import "tailwindcss";

@theme {
  --color-bg: #ffffff;
  --color-fg: #0a0a0a;
  --color-primary: #1f2937;
}

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

/* Optional: override tokens inside dark mode */
[data-theme=dark] {
  --color-bg: #0a0a0a;
  --color-fg: #ededed;
}
```

```tsx
// Usage — standard Tailwind dark variants
<div className="bg-bg text-fg">
  <h1 className="text-primary dark:text-primary/90">Headline</h1>
</div>
```

**Why `data-theme` and not `class`**: with the class strategy, `<html class="dark">` changes between SSR and hydration if theme detection runs client-side — React warns about hydration mismatch. With `data-theme`, Tailwind utility classes in the HTML never change per theme; only the attribute on `<html>` changes, which is safe.

---

## Example 7: framer-motion Composition

### Clean composition

```tsx
// components/FadeInCard.tsx
import { motion } from "framer-motion";

export function FadeInCard({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      className="rounded-lg bg-primary p-4 text-white shadow-lg"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

Tailwind: layout (`rounded-lg`, `p-4`), color (`bg-primary`, `text-white`), shadow. Motion: the animation. No overlap.

### The conflict — broken pattern

```tsx
// BAD
<motion.div
  className="transition-all duration-300 bg-primary"
  animate={{ x: 100 }}
  whileHover={{ scale: 1.05 }}
/>
```

`transition-all` tells the browser to animate any changing property over 300ms. Motion's `animate` and `whileHover` also try to animate. Result: both fight; animations stutter or freeze mid-way.

### Fix

```tsx
// GOOD — remove transition-* class
<motion.div
  className="bg-primary"
  animate={{ x: 100 }}
  transition={{ duration: 0.3 }}
  whileHover={{ scale: 1.05 }}
/>
```

### When each wins

```tsx
// Tailwind: simple hover, no Motion props
<button className="bg-primary hover:bg-primary/80 transition-colors duration-200">
  Hover me
</button>

// Motion: entrance, gestures, orchestrated sequences
<motion.ul
  initial="hidden"
  animate="visible"
  variants={{
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  }}
>
  {items.map(item => (
    <motion.li key={item.id} variants={{ hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } }}>
      {item.name}
    </motion.li>
  ))}
</motion.ul>
```

---

## Example 8: Capacitor Performance Note

On iOS WKWebView, Motion's `layout` prop (auto-animated reflows) can jank:

```tsx
// Expensive on Capacitor iOS — auto-calculates position changes
<motion.div layout className="grid grid-cols-2 gap-4">
  {items.map(item => (
    <motion.div key={item.id} layout />
  ))}
</motion.div>
```

Prefer explicit coordinates when hybrid-app smoothness matters:

```tsx
<motion.div
  initial={{ x: -100, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  transition={{ duration: 0.3 }}
/>
```

Test on device (not simulator) — the iOS simulator's WebKit isn't identical to device WebKit.

---

## Summary Walkthrough (migration)

1. **Delete `tailwind.config.js`** (or add `@config` if you need more time to migrate tokens)
2. **Move brand tokens from `:root` to `@theme`** in `globals.css` — unlocks `hover:bg-primary`, `dark:bg-primary`, `bg-primary/50`
3. **Keep `@theme inline` for Next.js localFont** — this is already correct
4. **Add `@custom-variant dark (...)`** for v4 dark mode (current project has no explicit dark setup)
5. **Delete duplicate `.bg-primary` blocks** — consolidate to the `@theme` token
6. **Audit `transition-*` classes on `motion.div`** — remove from any element with `animate`, `initial`, or `exit` props

Net result: ~30 lines of hand-written `.bg-primary`/`.text-primary` CSS delete; token changes propagate system-wide; variant modifiers work consistently.
