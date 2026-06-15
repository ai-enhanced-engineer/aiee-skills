# Next.js 16 App Router Reference

Detailed patterns for Next.js 16 App Router with a focus on static export (`output: "export"`) and Capacitor hybrid apps. Foundation patterns (React composition, hooks) are cited — this reference concentrates on v16-specific rules and the static-export constraints.

---

## 1. Foundation — Cited

### 1.1 React Composition, Hooks, Providers


The App Router inherits React 18/19 composition patterns unchanged. `useState`, `useEffect`, `useCallback`, `useMemo`, custom `use*` hooks — all work identically. The divergence: hooks only run in Client Components. Server Components have no hook runtime.

### 1.2 SSR/SSG Mental Model


Mental-model analogy only. SvelteKit's `prerender = true` ≈ Next.js `output: "export"`. SvelteKit's `+page.server.ts` ≈ Next.js Server Components. Svelte-specific APIs (`$state`, `+page.ts`) do not transfer.

### 1.3 Next.js 14 Baseline


Covers App Router foundations as a v14 baseline. This reference documents v16 deltas on top.

---

## 2. v16 Release Delta (vs v14/v15)

Published 2025-10-21. Key changes affecting projects:

| Change | Detail | Impact on static export |
|---|---|---|
| Turbopack default | All builds use Turbopack; `next build --webpack` to override | Works; next-pwa needs `--webpack` override |
| `"use cache"` directive | New caching model via Cache Components | Not applicable (static export pre-renders everything) |
| `proxy.ts` replaces `middleware.ts` | Rename only; same behavior | Both unsupported in static export |
| Async `params`/`searchParams` | Enforced as `Promise<T>` — sync shim removed | Still applies; must `await` |
| Parallel route `default.js` required | Build fails without it for each `@slot` | If using parallel routes |
| Node.js 20.9+ | 18 dropped | Update CI/dev environment |
| TypeScript 5.1+ | Minimum | Update `tsconfig.json` |
| Removed | AMP, `next lint`, `serverRuntimeConfig`/`publicRuntimeConfig` | — |

React 19.2 features available: View Transitions, `useEffectEvent`, `<Activity/>`.

---

## 3. Static Export (`output: "export"`) — Full Matrix

### Configuration

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  turbopack: {},            // correct v16 location (v15 was experimental.turbopack)
};

export default nextConfig;
```

On `next build`, output lands in `out/`. Set `webDir: "out"` in `capacitor.config.ts`.

### Supported

| Feature | Notes |
|---|---|
| Server Components | Run during build, output as static HTML |
| Client Components | Prerendered + hydrated on client |
| `generateStaticParams` | Required for any `[param]` route |
| Route Handlers (`GET` only) | Must return static data |
| `next/image` with `unoptimized: true` | Or custom loader (Cloudinary, etc.) |
| `useEffect` for browser APIs | Only runs in browser — safe |
| `next/font` | Inlined at build time |
| `next/link`, `next/script` | Standard |

### Unsupported — build errors

| Feature | Workaround |
|---|---|
| Server Actions (`"use server"`) | Client-side `fetch()` against external API |
| `cookies()`, `headers()`, `draftMode()` | Manage state client-side (Capacitor Preferences, localStorage) |
| `proxy.ts` / `middleware.ts` | Handle redirects in client routing / Capacitor |
| ISR / `revalidate` | Rebuild + redeploy |
| Dynamic routes without `generateStaticParams` | Always export it |
| `dynamicParams: true` | Set `dynamicParams = false` |
| `next.config.ts` `rewrites`/`redirects`/`headers` | Not applied in static mode |
| Default `next/image` optimization | `unoptimized: true` |

---

## 4. Server vs Client — Boundary Rules

### The default

Every file in `app/` is a **Server Component** unless it has `"use client"` at the top.

### When `"use client"` is required

- React state hooks (`useState`, `useReducer`)
- Effect hooks (`useEffect`, `useLayoutEffect`)
- Browser APIs (`window`, `localStorage`, `navigator`, `document`)
- Event handlers (`onClick`, `onChange`, `onSubmit`)
- Capacitor / native plugin imports
- `useRouter`, `usePathname`, `useSearchParams`

### Boundary semantics

`"use client"` marks a module graph boundary. Everything imported from a Client Component is treated as client code and bundled for the browser. A Client Component importing `fs` or a DB client causes a build error.

### Prop serialization (server → client)

Props crossing the server→client boundary must be serializable by React's RSC Flight protocol.

**Serializable**: primitives, arrays, plain objects, `Date`, `Map`, `Set`, Promises (streamed via `use()`).

**Not serializable** (don't pass from Server to Client):
- Functions (callbacks, event handlers)
- Class instances with methods
- Symbols
- DOM nodes, React refs

### The composition pattern

Pass Server Components as `children` to Client Components — they still render on the server:

```tsx
// layout.tsx (Server Component)
import ClientShell from './ClientShell';      // "use client"
import ServerWidget from './ServerWidget';    // no directive

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <ClientShell>
      <ServerWidget />   {/* renders on server; RSC payload carries output */}
      {children}         {/* route pages — Server-rendered */}
    </ClientShell>
  );
}
```

This is exactly the project's pattern: `layout.tsx` (Server) → `Providers` (Client) → `{children}` (Server route pages). Providers wraps but doesn't break server rendering of children.

### Environment poisoning prevention

```typescript
// lib/db.ts
import 'server-only';   // build error if imported into Client Component
export const db = new DbClient(process.env.DATABASE_URL);
```

Counterpart: `import 'client-only'` for browser-only modules.

---

## 5. File Conventions

### Core files

| File | Purpose | Props |
|---|---|---|
| `layout.tsx` | Shared UI; doesn't re-render on navigation | `{ children, params?: Promise<...> }` |
| `template.tsx` | Like layout but new instance per navigation | `{ children }` |
| `page.tsx` | Unique route UI; leaf | `{ params?: Promise, searchParams?: Promise }` |
| `loading.tsx` | Suspense fallback | no props |
| `error.tsx` | Error boundary (must be Client) | `{ error, reset }` + `"use client"` |
| `not-found.tsx` | Rendered when `notFound()` thrown | no props |
| `default.tsx` | Parallel route fallback | **required in v16** for every `@slot` |
| `route.ts` | API endpoint | `GET` only in static export |

### Route organization

```
app/
  layout.tsx            # Root layout — required; defines <html><body>
  page.tsx              # /
  (auth)/               # Route group — parens excluded from URL
    login/page.tsx      # /login
  items/
    [id]/               # Dynamic segment
      page.tsx          # /items/123
    [...slug]/          # Catch-all — /items/a/b/c
    [[...slug]]/        # Optional catch-all — /items OR /items/a/b
  @analytics/           # Parallel slot
    default.tsx         # REQUIRED in v16
```

### Layout behavior notes

- Layouts do NOT re-render on navigation between child routes — don't put route-specific state here
- Layouts cannot access `searchParams` (use `useSearchParams()` in a Client child)
- Layouts cannot access `pathname` (use `usePathname()` in a Client child)
- Multiple root layouts trigger full page reload between them

---

## 6. Metadata API

### Static metadata

```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Browse Properties',
  description: 'Browse available items',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-192x192.png',
    apple: '/apple-touch-icon.png',
  },
  themeColor: '#1f2937',
};
```

**Never use `<Head>` from `next/head` in the App Router.** That API belongs to the Pages Router. The `metadata` export handles all of this — including `<link rel="manifest">`, `<meta name="theme-color">`, and `<link rel="apple-touch-icon">`.

### Dynamic metadata

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await fetchItem(id);
  return { title: item.name };
}
```

Note: `params` is a `Promise<T>` in v16 — must `await`.

---

## 7. Async Params + `generateStaticParams`

### v16 enforces async params

```tsx
// page.tsx
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <Detail id={id} />;
}
```

Sync access (`params.id` directly) throws in v16. Options to consume:
- `await params` in async Server Components
- `React.use(params)` in Client Components (sync-looking, Suspense-based)

### `generateStaticParams` for static export

**Required** for any `[param]` route with `output: "export"`. Without it, build fails — Next.js can't enumerate HTML files.

```tsx
// app/items/[id]/page.tsx
export async function generateStaticParams() {
  const items = await fetch('https://api.example.com/items').then(r => r.json());
  return items.map((p: { id: string }) => ({ id: p.id }));
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // ...
}
```

### Typed page props (v16)

`PageProps` and `LayoutProps` are globally available after `next build` / `next typegen`:

```tsx
export default async function Page(props: PageProps<'/items/[id]'>) {
  const { id } = await props.params;   // fully typed
}
```

### `searchParams` in static export

Static export pre-renders HTML at build time — `searchParams` is empty during prerender. For query-param-driven UIs, use `useSearchParams()` in Client Components to read at runtime. Don't rely on server-side `searchParams` under `output: "export"`.

---

## 8. Anti-Patterns (Detail)

### 8.1 Legacy `<Head>` in App Router

```tsx
// BAD — App Router
import Head from 'next/head';
<Head>
  <link rel="manifest" href="/manifest.json" />
</Head>
```

No errors thrown, but these tags **do not appear in the static export HTML**. `next/head` is Pages Router only. Use the `metadata` export instead.

### 8.2 Capacitor Plugin in Server Component

```tsx
// BAD
import { SocialLogin } from '@capgo/capacitor-social-login';
export default function Page() {
  SocialLogin.initialize({...});   // runs during build in Node → crash
  return <div>Hello</div>;
}
```

The native bridge is browser-only. Add `"use client"` and gate inside `useEffect`.

### 8.3 Server Action with Static Export

```tsx
// BAD — build error
export default function Form() {
  async function submit(data: FormData) {
    'use server';
    await db.insert(data);
  }
  return <form action={submit}>...</form>;
}
```

No server at runtime. Replace with client-side `fetch()` against the external API.

### 8.4 `router.push()` vs `router.replace()` for invalid-param guards

When a `useEffect` guard redirects because URL params are missing or junk, prefer `router.replace()` over `router.push()`. `router.push()` appends the broken URL to the browser history stack — pressing Back returns the user to the same invalid state and re-triggers the redirect, producing a redirect loop from the user's perspective. `router.replace()` swaps the history entry so Back goes to the page *before* the invalid URL.

```tsx
// "use client"
useEffect(() => {
  if (!id || !isValidUuid(id)) {
    router.replace("/not-found");   // replace — don't pollute history
  }
}, [id, router]);
```

The same principle applies to any programmatic guard that fires on bad state, not just missing params (e.g., unauthenticated redirect, expired-token redirect).

### 8.5 Prop Drilling Instead of Composition

```tsx
// BAD — all fetching done client-side; large bundle
"use client";
export default function Page() {
  const [data, setData] = useState(null);
  useEffect(() => { fetch(...).then(setData); }, []);
  return <Tree data={data} />;
}

// GOOD — fetch in Server Component, hydrate Client leaves
export default async function Page() {          // Server Component
  const data = await fetchOnServer();
  return <Tree data={data} />;                   // Tree has "use client" if needed
}
```

With static export, Server Component fetches happen at **build time** — embed the data in the static HTML. No runtime server needed.

---

## 9. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Build error: "cookies/headers not available" | Server-only API used with `output: "export"` | Replace with client-side storage |
| "Page required param … but no `generateStaticParams`" | Dynamic route missing export | Add `generateStaticParams()` |
| Manifest tags missing from static HTML | `<Head>` used in App Router layout | Move to `metadata` export |
| `params.id` throws | Sync access in v16 | `await params` or `use(params)` |
| Capacitor plugin crashes during `next build` | Imported in Server Component | Add `"use client"` + `useEffect` gate |
| `<link rel="apple-touch-icon">` missing | Set via `<Head>`, not metadata | Use `metadata.icons.apple` |
| Build uses webpack unexpectedly | Older config | Remove `experimental.turbopack`; use top-level `turbopack: {}` |

---

## 9.5 Billing Integration Patterns

### Stripe Elements + static export + Capacitor

```tsx
"use client";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";

const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
if (!key) {
  throw new Error("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is required");
}
const stripePromise = loadStripe(key);

export function CheckoutShell({ clientSecret }: { clientSecret: string | null }) {
  if (clientSecret === null) {
    // $0 invoice short-circuit — subscription is active without payment
    return <SuccessRedirect />;
  }
  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <CheckoutForm />
    </Elements>
  );
}
```

Three rules:

1. `loadStripe(...)` runs at module scope under `"use client"` — loads once per session, never in a Server Component (Stripe SDK touches `window`).
2. Throw an explicit error when the env var is missing — `<Elements stripe={null}>` fails silently otherwise.
3. Pair with the BE pattern `payment_behavior=default_incomplete` + `expand=['latest_invoice.payment_intent']` so the BE response includes a usable `client_secret`. See `laravel-modern-patterns` reference for the BE side.

## 9.6 Production Build Configuration

### Production console removal via `compiler.removeConsole`

```ts
// next.config.ts
const config: NextConfig = {
  compiler: {
    removeConsole: process.env.NODE_ENV === "production"
      ? { exclude: ["error", "warn"] }   // keep error/warn in prod logs
      : false,
  },
};
```

The transform applies to user code only — framework chunks retain their own `console.*` calls (expected). Replaces the wrong reflex of hand-editing source files. Use `removeConsole: true` to strip everything; use the `exclude` form to preserve diagnostic levels.

## 9.7 Dev-Server Pitfalls

### `API_URL` HMR caveat

When a project hardcodes `API_URL` as a module-level `const` in `utils/api.js` or similar, changes to that constant during `npm run dev` do NOT reliably propagate via HMR — the import-time value can be cached in compiled chunks. Symptom: dev server reports "Compiled" with no errors, but the network tab shows requests still going to the old host.

Fix:

```ts
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
```

Env vars trigger a full reload on `.env` changes. Or accept hard-refresh (Cmd+Shift+R) as the toggle ritual when refactoring isn't worth it.

## 9.8 Static Export Route Patterns

### Dynamic `[slug]` route trio

```ts
// app/legal/[slug]/slugs.ts
export const SLUGS = ["privacy", "terms", "cookies"] as const;
export type Slug = (typeof SLUGS)[number];

export const SLUG_META: Record<Slug, { title: string }> = {
  privacy: { title: "Privacy Policy" },
  terms: { title: "Terms of Service" },
  cookies: { title: "Cookie Policy" },
};
```

```tsx
// app/legal/[slug]/page.tsx (Server Component)
import { notFound } from "next/navigation";
import { SLUGS, SLUG_META, type Slug } from "./slugs";
import RouteContent from "./RouteContent";

export function generateStaticParams() {
  return SLUGS.map((slug) => ({ slug }));
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!SLUGS.includes(slug as Slug)) notFound();
  return <RouteContent slug={slug as Slug} meta={SLUG_META[slug as Slug]} />;
}
```

```tsx
// app/legal/[slug]/RouteContent.tsx (Client Component)
"use client";
import { useEffect, useState } from "react";
import type { Slug } from "./slugs";

export default function RouteContent({ slug, meta }: { slug: Slug; meta: { title: string } }) {
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/legal-content/${slug}.md`).then(r => r.text()).then(setBody);
  }, [slug]);
  return <article><h1>{meta.title}</h1>{body}</article>;
}
```

`useEffect`-driven client fetches do NOT need `<Suspense>` — that requirement is specific to `useSearchParams`/`useParams`/`usePathname`.

---

## 9.9 User-Data-Driven IDs Under `output: "export"` — Query-Param Pattern

Dynamic `[id]` route segments require `generateStaticParams` to enumerate every valid ID at build time. For user-owned resources (items, listings) where IDs are runtime-generated UUIDs, `generateStaticParams` is impossible — you cannot enumerate them statically. Additionally, `dynamicParams: true` cannot be combined with `output: "export"` (build error).

**Workaround**: restructure to a query-param route.

```
// WRONG (build error under output: "export")
app/owner/items/[id]/edit/page.tsx  → useParams().id

// CORRECT
app/owner/items/edit/page.tsx       → useSearchParams().get("id")
```

Wrap `useSearchParams()` consumers in `<Suspense>` — `next build` fails without it. The Suspense boundary must wrap the component that calls `useSearchParams()`, not a parent that only conditionally renders it:

```tsx
// app/owner/items/edit/page.tsx
import { Suspense } from 'react';
import EditItemClient from './EditItemClient';

export default function EditItemPage() {
  return (
    <Suspense fallback={<div>Loading…</div>}>
      <EditItemClient />
    </Suspense>
  );
}

// EditItemClient.tsx — "use client"
const id = useSearchParams().get('id');
```

Navigate to the edit page with `router.push("/owner/items/edit?id=" + encodeURIComponent(id))`. Applying `encodeURIComponent` to dynamic segments that flow into the URL is consistent with the API layer's `encodeURIComponent` discipline — UUIDs are low-risk in practice, but encoding provides defense-in-depth.

## 9.10 Browser-API Libraries with `output: "export"` — `next/dynamic({ ssr: false })`

Libraries like `maplibre-gl` and Leaflet touch `window` at module scope, crashing SSR and `next export` prerender. Wrap them in `next/dynamic`:

```tsx
const ItemMap = dynamic(() => import("./ItemMap"), {
  ssr: false,
  loading: () => <div role="status" aria-live="polite">Loading map…</div>,
}) as unknown as ComponentType<{ items: Item[] }>;
```

Two rules:
1. `loading` skeleton must carry `role="status"` + `aria-live="polite"` so screen readers are notified while the map loads.
2. `next/dynamic` erases generic type parameters at the call site. Cast via `as unknown as ComponentType<P>` with the concrete prop shape — `dynamic<P>(...)` does not preserve callsite generics.

**Build-gate as SSR-confirmation step**: run `npm run build` immediately after `npm install <map-lib>` with a stub component to confirm zero static-export breakage before writing real implementation.

Applies to: `maplibre-gl`, `leaflet`, Three.js, any WebGL/Canvas library that reads `window` at import time.

---

## 10. Related Resources

- [Next.js 16 release blog](https://nextjs.org/blog/next-16)
- [Static export docs](https://nextjs.org/docs/app/guides/static-exports)
- [Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)
- [File conventions](https://nextjs.org/docs/app/api-reference/file-conventions)
- `react-vite-modern-patterns` — hooks, composition
- `nextjs-pwa-offline` (sibling) — SW registration with App Router
- `tailwindcss-4-patterns` (sibling) — styling in App Router + Server Components
