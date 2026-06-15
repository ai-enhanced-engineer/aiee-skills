# Next.js 16 App Router Examples


---

## Example 1: `next.config.ts` — Minimal Static Export

```typescript
// next.config.ts (correct)
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {},
};

export default nextConfig;
```

**Why each line**:
- `output: "export"` — tells Next.js to generate a static `out/` directory on `next build`; Capacitor's `webDir` points at this
- `images: { unoptimized: true }` — disables the built-in image optimization server (not available in static export)
- `turbopack: {}` — correct v16 location for Turbopack config (v15 was `experimental.turbopack`)

**What must NOT appear in this file** (would cause build errors with static export):
- `async rewrites()` / `async redirects()` / `async headers()`
- `images: { loader: 'default' }` without `unoptimized: true`
- ISR-related flags

---

## Example 2: The `<Head>` → Metadata Migration (CRITICAL)

The project's current `app/layout.tsx`:

```tsx
// BEFORE — current project state
import Head from "next/head";     // ⚠️ Pages Router API in App Router
import Providers from "./Providers";

export const metadata: Metadata = {
  title: "Item Finder",
  description: "Browse listings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <Head>                                        {/* ⚠️ does nothing in App Router */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#1f2937" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="mask-icon" href="/icons/icon-192.png" color="#1f2937" />
      </Head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

**The silent bug**: `<Head>` from `next/head` is Pages Router API. In App Router, these tags are **not written to the static HTML**. The manifest, theme-color, and apple-touch-icon links are missing from every page — breaks PWA install, iOS home-screen icon, and Safari theme color.

### Fix — move everything to `metadata` + `viewport` exports

```tsx
// AFTER
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Providers from "./Providers";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Item Finder",
  description: "Browse listings",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
    other: [{ rel: "mask-icon", url: "/icons/icon-192.png", color: "#1f2937" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1f2937",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

No `<Head>`, no `import Head from "next/head"`. Next.js injects all metadata tags into the emitted HTML automatically.

**Note on `themeColor`**: in Next.js 14+ this moved from `metadata` to `viewport` (separate export). Don't put it in `metadata` or you'll get a console warning.

---

## Example 3: The `Providers` Pattern (correct as-is in project)

The project's `app/Providers.tsx`:

```tsx
// app/Providers.tsx — correct pattern
"use client";

import { useEffect } from "react";
import { SocialLogin } from '@capgo/capacitor-social-login';

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    SocialLogin.initialize({
      google: {
        webClientId: "362688989926-d5gqpd0htkhuqobrnsb6p9i9gc1969th.apps.googleusercontent.com",
      },
    });
  }, []);

  return <>{children}</>;
}
```

**Why this works** (3 reasons):

1. **`"use client"` gates the Capacitor import** — `@capgo/capacitor-social-login` never enters the server bundle; no build-time native-bridge crash
2. **`useEffect` prevents init during SSR/SSG prerender** — the plugin call only runs in the browser, not during `next build`
3. **`{children}` pass-through preserves Server-Component rendering** — route pages remain Server Components even though they're wrapped by this Client Component

### What NOT to do (anti-pattern)

```tsx
// BAD — no useEffect gate
"use client";
import { SocialLogin } from '@capgo/capacitor-social-login';

SocialLogin.initialize({...});   // runs at module eval — during build too

export default function Providers({ children }) {
  return <>{children}</>;
}
```

Module-scope plugin calls run during `next build` (Node.js context) → crash.

### Secrets note

The Google `webClientId` above is a **public** OAuth client ID (safe to embed in client bundles — it's a public identifier, not a secret). Never put OAuth client *secrets* in Client Components. Pattern for private env vars:

```tsx
// GOOD — public env var (NEXT_PUBLIC_ prefix)
const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

// BAD — private env var in Client Component
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;  // undefined in browser
```

In static export, there is no server to keep secrets — anything referenced in Client Components ships to the browser.

---

## Example 4: Server/Client Composition

```tsx
// app/items/page.tsx — Server Component (default, no directive)
import ItemList from './ItemList';         // Client Component
import ItemFilters from './ItemFilters';   // Server Component

// Data fetching at build time (static export) — embedded in HTML
async function loadProperties() {
  const res = await fetch('https://api.example.com/items');
  return res.json();
}

export default async function Page() {
  const items = await loadProperties();   // runs at build time

  return (
    <main className="p-4">
      <ItemFilters />         {/* Server Component — rendered to static HTML */}
      <ItemList items={items} />   {/* Client Component — hydrated */}
    </main>
  );
}
```

```tsx
// app/items/ItemList.tsx — Client Component (interactive)
"use client";
import { useState } from "react";

interface Item { id: string; name: string; }

export default function ItemList({ items }: { items: Item[] }) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <ul>
      {items.map(p => (
        <li key={p.id} onClick={() => setSelected(p.id)}>
          {p.name} {selected === p.id && '✓'}
        </li>
      ))}
    </ul>
  );
}
```

**Serialization check**: `items: Item[]` is an array of plain objects — serializable across the server→client boundary. If we tried to pass an `onClick` callback from the Server Component, React would throw at build time.

---

## Example 5: Dynamic Route with Static Export

```
app/items/[id]/page.tsx
```

```tsx
// app/items/[id]/page.tsx
interface Item { id: string; name: string; description: string; }

// Required for static export — enumerates which HTML files to generate
export async function generateStaticParams() {
  const items: Item[] = await fetch(
    'https://api.example.com/items'
  ).then(r => r.json());

  return items.map(p => ({ id: p.id }));
  // Next.js generates out/items/<id>/index.html for each item
}

// v16: params is Promise<T> — must await
export default async function ItemDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item: Item = await fetch(
    `https://api.example.com/items/${id}`
  ).then(r => r.json());

  return (
    <article>
      <h1>{item.name}</h1>
      <p>{item.description}</p>
    </article>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await fetch(`https://api.example.com/items/${id}`).then(r => r.json());
  return { title: item.name, description: item.description };
}
```

**Build-time behavior**: `next build` runs `generateStaticParams` once, calls `ItemDetail` for each param, writes `out/items/123/index.html`, `out/items/456/index.html`, etc. No runtime server needed.

**Gotcha — async params**: In v16, sync access to `params.id` throws. Always `await params` (Server Component) or `use(params)` (Client Component).

---

## Example 6: `searchParams` — Client-Side Only in Static Export

The project currently uses query params for filter state (e.g., `/items?category=featured`). In static export, server-side `searchParams` is empty during prerender — so this pattern doesn't work:

```tsx
// BAD — won't work in static export
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const { category } = await searchParams;   // always empty in static build
  const filtered = await filterProperties(category);   // uses stale filter
  return <List items={filtered} />;
}
```

### Fix — read query params in a Client Component at runtime

```tsx
// app/items/page.tsx — Server Component, fetches all data at build
export default async function Page() {
  const allProperties = await fetchAll();
  return <ItemList allProperties={allProperties} />;
}
```

```tsx
// app/items/ItemList.tsx — Client Component, filters at runtime
"use client";
import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

export default function ItemList({ allProperties }: { allProperties: Item[] }) {
  const searchParams = useSearchParams();
  const category = searchParams.get('category');

  const filtered = useMemo(
    () => (category ? allProperties.filter(p => p.category === category) : allProperties),
    [allProperties, category],
  );

  return (
    <ul>
      {filtered.map(p => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

Static export ships the full dataset in the HTML; the Client Component filters client-side based on URL query params at runtime.

---

## Example 7: Route Group for Auth (project uses this)

The project groups auth routes under `app/auth/`:

```
app/
  layout.tsx                      # Root layout (has Providers)
  page.tsx                        # /
  auth/
    login/page.tsx                # /auth/login
    signup/page.tsx               # /auth/signup
  items/
    page.tsx                      # /items
```

To **exclude** `auth` from URLs while keeping the folder grouping (not the project's current choice, but worth documenting):

```
app/
  (auth)/                         # Parentheses = route group, excluded from URL
    login/page.tsx                # /login (not /auth/login)
    signup/page.tsx               # /signup
    layout.tsx                    # Auth-specific layout (e.g., centered, no nav)
  (main)/
    layout.tsx                    # Main app layout with tab bar
    items/page.tsx           # /items
```

Each group can have its own `layout.tsx` — one for a minimal auth shell, another for the main app chrome. Route groups are the standard App Router pattern for co-locating routes with different layout needs.

---

## Example 8: Verification Checklist

After making App Router changes:

```bash
# 1. Build — should succeed without Turbopack override
npm run build
# Expected: Turbopack logs, "Exporting ... X static pages"

# 2. Check static output
ls out/
# Expected: index.html, 404.html, items/, auth/, etc.

# 3. Inspect emitted HTML for metadata
cat out/index.html | grep -E "manifest|theme-color|apple-touch-icon"
# Expected: all three tags present (from metadata export)
# If BAD (using <Head>): tags missing → fix required

# 4. Verify no server-only code leaked
grep -r "process.env.SECRET" out/     # should return nothing
grep -r "DATABASE_URL" out/           # should return nothing

# 5. Serve locally + test
npx serve out
# → http://localhost:3000
```

If any of those checks fail, re-read the Metadata, Server/Client, or static-export sections of reference.md.

---

## Summary Walkthrough (migration path)

1. **Fix `app/layout.tsx`**: remove `import Head from "next/head"` and the `<Head>...</Head>` block; move the manifest/theme-color/apple-touch-icon to `metadata` and `viewport` exports
2. **Keep `app/Providers.tsx` as-is**: the `"use client"` + `useEffect` + `SocialLogin.initialize()` pattern is correct
3. **Audit any `[param]` routes**: if dynamic segments are added, export `generateStaticParams()` — build fails otherwise
4. **Move query-param-driven filters to Client Components**: use `useSearchParams()` at runtime; fetch the full dataset in the Server Component at build time
5. **Before production build**: verify `next.config.ts` has `output: "export"`, `images: { unoptimized: true }`, `turbopack: {}` only — remove any `rewrites`, `redirects`, `headers`

Net result: static HTML output in `out/` that Capacitor can bundle as a native shell, with all metadata tags correctly emitted and no server-runtime features accidentally used.

---

## Static-export-compatible redirect

Pages that need a redirect but must build under `output: "export"` cannot use the server `redirect()` helper. Use a Client Component instead:

```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function LegacyPage() {
  const router = useRouter();
  useEffect(() => { router.replace("/new-path"); }, [router]);
  return null;
}
```

Returning `null` is correct — the redirect fires on first render via `useEffect`, with no flash of legacy-page content. Same constraint drives Capacitor-wrapped Next.js projects: server `redirect()` is unavailable because there's no server runtime.

## `useSearchParams()` Suspense boundary

Components consuming `useSearchParams()` (or `useParams`/`usePathname` in some cases) must be wrapped in `<Suspense>` under `output: "export"` — otherwise `next build` fails with `should be wrapped in a suspense boundary`. Pre-commit hooks (lint/typecheck/test) don't catch this; only `next build` does.

```tsx
"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function PageInner() {
  const sp = useSearchParams();
  return <div>{sp.get("token")}</div>;
}

export default function Page() {
  return <Suspense fallback={null}><PageInner /></Suspense>;
}
```

Pattern: extract the consuming component into an inner function (`PageInner`), then have the default export wrap it in `<Suspense fallback={null}>`. Add `npm run build` to pre-push hooks for pages that use search params so this catches at push-time rather than CI-time.
