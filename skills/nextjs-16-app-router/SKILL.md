---
name: nextjs-16-app-router
description: Build Next.js 16 App Router projects with React 19, Turbopack-default builds, static export for hybrid mobile apps (Capacitor), Server vs Client component boundaries, async params, generateStaticParams, and the Metadata API. Use when scaffolding App Router routes, debugging static-export build errors, deciding when to add `"use client"`, or wiring Capacitor plugins without breaking the server build.
updated: 2026-05-21
---

# Next.js 16 App Router

Next.js 16 (Oct 2025) makes Turbopack default and enforces async `params`/`searchParams`. For projects using `output: "export"` (static export / Capacitor hybrid), the new Cache Components are irrelevant — static export pre-renders at build time.


## Core decisions (quick reference)

### Server vs Client — when to add `"use client"`

Add `"use client"` when the component uses:
- React state (`useState`, `useReducer`)
- Effects with side effects (`useEffect`)
- Browser APIs (`window`, `localStorage`, `navigator`)
- Event handlers (`onClick`, `onChange`)
- **Capacitor plugins** (native bridge only exists in browser)

Otherwise keep it as a Server Component (default).

### Static export — what breaks

| Feature | Allowed with `output: "export"` |
|---|---|
| Server Components (build-time) | Yes |
| Client Components | Yes |
| `generateStaticParams` | Yes (required for `[param]` routes) |
| `next/image` | Yes with `unoptimized: true` |
| Server Actions | No |
| `cookies()`, `headers()` | No |
| ISR / `revalidate` | No |
| `proxy.ts` / `middleware.ts` | No |
| Dynamic route without `generateStaticParams` | No |

### v16 breaking changes (short list)

- Node.js 20.9+ required (18 dropped); TypeScript 5.1+
- Turbopack default — `next build --webpack` to override
- `params`/`searchParams` are `Promise<T>` — `await params` or `use(params)`
- Parallel routes (`@slot`) require explicit `default.js`
- `middleware.ts` → `proxy.ts` (deprecated; verify rename in release notes)
- AMP, `next lint`, `serverRuntimeConfig` removed

## Anti-pattern quick table

| Anti-Pattern | Pattern |
|---|---|
| `<Head>` from `next/head` in App Router | Pages Router API; use `metadata` export or `generateMetadata` |
| Import Capacitor plugin in a Server Component | Build crashes — bridge is browser-only; add `"use client"` + `useEffect` |
| Server Actions / `cookies()` with `output: "export"` | No server at runtime; use client-side `fetch()` |
| Read `searchParams` in page code under static export | Prerender; use `useSearchParams()` in a Client Component |
| Dynamic `[param]` route without `generateStaticParams` | Build error; Next.js cannot enumerate HTML files |
| `useSearchParams()` without a `<Suspense>` boundary | `next build` fails; lint/typecheck/tests won't catch it |
| Server `redirect()` in a static-export page | Use `useRouter().replace()` inside `useEffect`, return `null` |
| `loadStripe(...)` at module scope in a Server Component | Stripe touches `window`; move to a `"use client"` file |
| `<Elements stripe={null}>` when env var missing | Silent failure; throw explicit error when key is absent |
| Hardcoded `API_URL` const (not via `process.env`) | HMR doesn't propagate const changes; use `NEXT_PUBLIC_API_URL` |
| Hand-removing `console.*` from source for production | Use `compiler.removeConsole` in `next.config.ts` |
| `router.push()` to redirect from invalid-param route | `router.replace()` — prevents Back re-triggering the invalid state |

## Static-export redirect / `useSearchParams` / `[slug]` trio

For the `output: "export"` redirect pattern, `useSearchParams` Suspense requirement, and the `[slug]` dynamic route trio, see **examples.md** for annotated implementations and **reference.md § 9.8** (Static Export Route Patterns).

## The Capacitor pattern

Files importing `@capacitor/*` or `@capgo/capacitor-*` need `"use client"` at the top; plugin calls belong inside `useEffect` — at module scope they crash the build, and during prerender they fire without a browser environment. See **examples.md** for an annotated initialization pattern.

See **reference.md** for file conventions, Metadata API, async params, Server/Client boundary rules, slug trio code, and billing integration patterns. See **examples.md** for annotated root layout, Providers client-boundary pattern, and the `<Head>` → Metadata API migration.
