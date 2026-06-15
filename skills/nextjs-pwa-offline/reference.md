# Next.js PWA Offline Reference

Detailed patterns for next-pwa in Next.js 16 App Router + static export + Capacitor hybrid shells. Foundation (Workbox strategies, offline UX) is cited from existing skills — this reference focuses on the Next.js-specific and Capacitor-specific wiring.

---

## 1. Foundation — Cited

### 1.1 Workbox Caching Strategies


The five strategies (CacheFirst, NetworkFirst, StaleWhileRevalidate, NetworkOnly, CacheOnly) are bundler-agnostic. The decision table in `vite-pwa-patterns` applies directly to next-pwa's `runtimeCaching` array. Treat that skill as source of truth; don't rewrite.

Transfer rule: **specific URL rules before broad catch-all rules** — first match wins.

### 1.2 Offline UX Patterns


For a PWA web target, the relevant patterns:
- **Optimistic UI**: write locally first, queue sync
- **Queue-and-retry**: Workbox `BackgroundSyncPlugin` replays failed POST/PATCH when online
- **Conflict handling**: last-write-wins is safe for single-user records

---

## 2. Package Landscape

| Package | Status | Use when |
|---|---|---|
| `next-pwa` (shadowwalker) | 5.6 — maintenance-only | Already installed (the example project's case) |
| `@ducanh2912/next-pwa` | Community fork, active | New projects on Next.js 15+ |
| Serwist | Long-term successor | Greenfield with Workbox familiarity |

For existing projects on `next-pwa` 5.6, no urgent migration needed — the core `withPWA` API is identical across forks.

---

## 3. `next.config.ts` Wiring

```typescript
import type { NextConfig } from "next";
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,          // manual registration (see §4)
  skipWaiting: true,
  runtimeCaching: [...],    // see §6
});

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Do NOT include `turbopack: {}` here — breaks next-pwa's webpack build
};

export default withPWA(nextConfig);
```

### Critical: Turbopack/webpack boundary

next-pwa uses webpack to emit the service worker. Turbopack bypasses this entirely. Fix:

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build"
  }
}
```

Dev keeps Turbopack for speed; production drops to webpack so `withPWA` runs.

### Key options

| Option | Default | Notes |
|---|---|---|
| `dest` | — | Required. Usually `"public"` |
| `disable` | `false` | `NODE_ENV === "development"` to skip in dev |
| `register` | `true` | **Set to `false` for Capacitor-aware apps** |
| `scope` | `/` | Restrict to sub-path if needed |
| `skipWaiting` | `true` | New SW activates without waiting for tabs |
| `runtimeCaching` | `defaultCache` | Specific rules before `...defaultCache` |
| `publicExcludes` | `[]` | Glob patterns to skip precache |

### App Router known issue

`next-pwa` GitHub #424: `app-build-manifest.json` not auto-precached with App Router. Workaround: add it via `additionalManifestEntries` in `workboxOptions`, or rely on runtime caching for navigation.

---

## 4. Capacitor Guard Pattern (Critical)

### Why disable SW in native

- **iOS WKWebView**: `navigator.serviceWorker` is `undefined`. Registration silently fails (Capacitor issues #580, #7069). WebKit-level limitation.
- **Android WebView**: SW runs but intercepts Capacitor's local-file-server requests before the native bridge, breaking navigation and asset loading.

**Rule**: Never register SW inside a Capacitor native shell. The native bundle already has everything a SW would cache.

### Implementation: `register: false` + runtime guard

```tsx
// app/layout.tsx (App Router root)
"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;      // native: skip SW entirely
    if (!("serviceWorker" in navigator)) return;   // old browser: skip

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("SW registration failed:", err));
  }, []);

  return <html><body>{children}</body></html>;
}
```

### Build-time vs runtime disable

| Approach | When | Trade-off |
|---|---|---|
| `disable: true` in `withPWA` (CI flag) | Separate native-only builds | Cleanest; requires two targets |
| `register: false` + runtime guard | Single unified build | SW file (~2 KB) emitted but unused in native |

For a single-codebase hybrid app with static export (the example project's model), **runtime guard wins** — one build, one `out/`, Capacitor copies it.

---

## 5. Manifest + Icons

### Static export constraint

`output: "export"` means **no `app/manifest.ts`** — that convention requires a running Next.js server. Use `public/manifest.json`.

### Minimum viable manifest

```json
{
  "name": "Example App",
  "short_name": "Example App",
  "description": "item booking app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1f2937",
  "icons": [
    { "src": "/icons/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

### Icon requirements

| Size | Platform | Status |
|---|---|---|
| 192×192 | Android home, Chrome install | Required |
| 512×512 | Android splash, maskable | Required |
| 180×180 (apple-touch-icon.png) | iOS add-to-homescreen | Recommended |
| 64×64 | Favicon / notifications | Optional |

iOS **ignores** manifest icons — read from `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` in `app/layout.tsx` head.

### Install prompts

- Chrome/Edge: auto-show when manifest + HTTPS + registered SW are present
- iOS Safari: **never** auto-prompts; user must tap Share → Add to Home Screen
- Don't rely on `beforeinstallprompt` on iOS

---

## 6. Auth-Safe Runtime Caching

### The problem

`next-pwa` `defaultCache` includes `NetworkFirst` matching `/api/.*`. This means `/api/auth/session`, `/api/auth/token`, OAuth callbacks get cached with a short TTL. On offline/expiry, the SW serves stale (possibly revoked) auth responses — login loops, phantom sessions, stale JWTs.

### The fix

```typescript
import { defaultCache } from "next-pwa/cache";

const withPWA = require("next-pwa")({
  dest: "public",
  register: false,
  runtimeCaching: [
    // Auth — always fresh, never cached
    { urlPattern: /\/api\/auth\/.*/, handler: "NetworkOnly" },

    // Current-user state — always fresh
    { urlPattern: /\/api\/user\/me/, handler: "NetworkOnly" },

    // Next.js static assets — safe to cache aggressively
    {
      urlPattern: /\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },

    ...defaultCache,   // must come LAST
  ],
});
```

### Never-cache list

- `/api/auth/*` — sessions, CSRF, callbacks
- `/api/user/me` or similar current-user endpoints
- OAuth callback URLs (`/api/auth/callback/*`) — token leakage risk on cached response
- Any mutation endpoint (POST/PATCH/DELETE is skipped by default, but verify)

---

## 7. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| SW not generated in `out/` | Build used Turbopack | Remove `--turbopack` from `build` script |
| `navigator.serviceWorker` undefined on iOS native | Expected — WKWebView limitation | Add `Capacitor.isNativePlatform()` guard |
| Users stuck logged-in after logout | `/api/auth/*` cached by defaultCache | Add `NetworkOnly` for `/api/auth/*` before defaultCache |
| Install prompt never appears (Android) | Missing 192×192 or 512×512 icon | Add both sizes; validate with Chrome DevTools Application tab |
| Install prompt never appears (iOS) | iOS never auto-prompts | Expected — guide user to Share → Add to Home Screen |
| Stale HTML after deploy | `CacheFirst` on navigation requests | Switch to `NetworkFirst` or `StaleWhileRevalidate` with short TTL |
| SW 404 when `basePath` is set | Scope mismatch | Pass `scope: basePath` to `register()` and `withPWA` |

---

## 8. Testing Under jsdom (Node 22 Webstorage Shadow)

Node 22 ships experimental built-in `localStorage` / `sessionStorage` globals. These shadow the `jsdom` implementations, causing `TypeError: localStorage.removeItem is not a function` when `jsdom` is configured as the test environment (Vitest + `environment: 'jsdom'`). The jsdom stub is overwritten by Node's incomplete native implementation.

**Symptom**: `TypeError: localStorage.removeItem is not a function` in Vitest; Storage-dependent component tests fail only on Node 22+.

**Fix — Map-backed Storage shim in `vitest.setup.ts`**:

```ts
// vitest.setup.ts
const makeStorage = (): Storage => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
};

Object.defineProperty(globalThis, 'localStorage', {
  value: makeStorage(), writable: true, configurable: true,
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: makeStorage(), writable: true, configurable: true,
});
```

**Cross-reference**: `dev-debugging-strategies` skill documents the environment-trap probe pattern; the Node 22 webstorage shadow is the canonical jsdom example there.

---

## 9. Related Resources

- [Next.js PWA Guide](https://nextjs.org/docs/app/guides/progressive-web-apps)
- [next-pwa GitHub](https://github.com/shadowwalker/next-pwa)
- [@ducanh2912/next-pwa docs](https://ducanh-next-pwa.vercel.app/docs/next-pwa/configuring)
- [Capacitor PWA docs](https://capacitorjs.com/docs/web/progressive-web-apps)
- `vite-pwa-patterns` — Workbox strategies (cite, don't rewrite)
- `mobile-offline-sync` — offline UX mental models
