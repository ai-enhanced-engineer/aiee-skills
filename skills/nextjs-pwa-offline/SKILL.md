---
name: nextjs-pwa-offline
description: next-pwa configuration for Next.js 16 App Router with static export and Capacitor hybrid shells. Covers Turbopack/webpack boundary, service worker registration guards for iOS WKWebView, Workbox caching for auth routes, and manifest setup for static export builds.
updated: 2026-05-21
kb-sources: [wiki/software-engineering/vite-pwa]
---

# Next.js PWA Offline

next-pwa patterns for Next.js 16 App Router apps that ship as both PWA and Capacitor hybrid native builds. The hybrid constraint is load-bearing: service workers must be disabled inside iOS/Android native shells.

## When to use this skill

- Wiring `next-pwa` into `next.config.ts` with `output: "export"`
- Disabling SW registration inside Capacitor native builds (iOS WKWebView has no SW support)
- Configuring runtime caching that doesn't break auth flows
- Setting up a valid `public/manifest.json` (static export can't use `app/manifest.ts`)
- Debugging why install prompts don't appear or auth endpoints serve stale responses

## Core decisions (quick reference)

### Turbopack vs webpack
next-pwa **requires webpack** — keeping `--turbopack` in the `build` script silently bypasses next-pwa, so the service worker never reaches the production output. Scope `--turbopack` to `dev`; in `next.config.ts`, drop `turbopack: {}` or gate it behind `NODE_ENV`.

### Manifest location
- `output: "export"` → use `public/manifest.json` (static file)
- Server-rendered → `app/manifest.ts` works (generated at request time)

### SW registration
Use `register: false` in `withPWA` + manual registration in root layout with a `Capacitor.isNativePlatform()` guard. The SW file ships to `public/` but never registers inside the native shell.

## Caching strategy (cited, see reference.md)

Full Workbox strategy table is in `vite-pwa-patterns` — the concepts are bundler-agnostic. Quick version:

| Asset | Strategy |
|---|---|
| Static (JS, CSS, images) | CacheFirst |
| API (non-auth) | NetworkFirst |
| `/api/auth/*` | **NetworkOnly** (critical) |
| HTML navigation | StaleWhileRevalidate or NetworkFirst (short TTL) |

**Ordering rule**: specific rules before `...defaultCache` — first match wins.

## Anti-pattern quick table

| Don't | Why it breaks |
|---|---|
| Cache `/api/auth/*` | Stale tokens, phantom sessions, logout doesn't take effect |
| Register SW in Capacitor native | iOS: silently fails. Android: SW intercepts local server, breaks nav |
| Rely on `app/manifest.ts` with static export | Requires server; not generated in `out/` |
| `CacheFirst` on HTML | Users see old shell after deploy until TTL expires |

## Foundation (cited, see reference.md)

- Workbox caching strategies → `vite-pwa-patterns` (decision table transfers verbatim)
- Offline UX (optimistic UI, queue-and-retry) → `mobile-offline-sync`

**Testing note**: Node 22 experimental `localStorage` globals shadow the `jsdom` implementation in Vitest, causing `TypeError: localStorage.removeItem is not a function`. A Map-backed shim in `vitest.setup.ts` fixes this — see `reference.md § 8. Testing Under jsdom`.

See **reference.md** for full `withPWA` options, Capacitor guard code, manifest schema, auth exclusion pattern, and Node 22 jsdom storage shim. See **examples.md** for annotated `next.config.ts`, root layout registration,.
