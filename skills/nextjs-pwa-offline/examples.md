# Next.js PWA Offline Examples


---

## Example 1: The Current State (PWA not yet wired)

`next.config.ts` snapshot (pre-PWA):

```typescript
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  turbopack: {},              // ⚠️ blocks next-pwa
  images: { unoptimized: true },
};

export default nextConfig;
```

`package.json` has `next-pwa: ^5.6.0` installed but unused. `public/manifest.json` doesn't exist. No `app/apple-touch-icon.png`.

**What's needed to wire it up**:
1. Remove `turbopack: {}` from `nextConfig`
2. Wrap with `withPWA`
3. Create `public/manifest.json` + icons
4. Add SW registration (with Capacitor guard) in `app/layout.tsx`
5. Reference manifest + apple-touch-icon in layout metadata

---

## Example 2: Wired `next.config.ts`

```typescript
// next.config.ts
import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: false,            // manual registration in app/layout.tsx
  skipWaiting: true,
  runtimeCaching: [
    // Auth: always fresh, never cached (overrides defaultCache /api/* rule)
    { urlPattern: /\/api\/auth\/.*/, handler: "NetworkOnly" },

    // Current user state: always fresh
    { urlPattern: /\/api\/me/, handler: "NetworkOnly" },

    // Static Next.js assets: cache aggressively (hashed filenames)
    {
      urlPattern: /\/_next\/static\/.*/,
      handler: "CacheFirst",
      options: {
        cacheName: "next-static",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },

    // Images: stale-while-revalidate
    {
      urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },

    ...require("next-pwa/cache").defaultCache,  // fallthrough rules
  ],
});

const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // Turbopack removed — incompatible with next-pwa's webpack SW build
};

export default withPWA(nextConfig);
```

**Scripts** (`package.json`):

```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start"
  }
}
```

Turbopack stays in dev (faster HMR); `build` uses webpack so next-pwa can generate `public/sw.js` and `public/workbox-*.js`.

---

## Example 3: Root Layout with Capacitor Guard

```tsx
// app/layout.tsx
import type { Metadata, Viewport } from "next";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "Example App",
  description: "Item booking",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/apple-touch-icon.png",
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
      <body>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
```

```tsx
// app/ServiceWorkerRegistration.tsx
"use client";
import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    // Never register SW inside Capacitor native shell
    if (Capacitor.isNativePlatform()) return;
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        console.log("[SW] registered:", reg.scope);
      })
      .catch((err) => {
        console.error("[SW] registration failed:", err);
      });
  }, []);

  return null;
}
```

**Why a separate client component**: `useEffect` requires `"use client"`, but `app/layout.tsx` should stay a server component for the rest of the metadata tree. The registration is isolated to this one component.

---

## Example 4: `public/manifest.json`

```json
{
  "name": "Example App",
  "short_name": "Example App",
  "description": "Book item access in real time",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#ffffff",
  "theme_color": "#1f2937",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any"
    },
    {
      "src": "/icons/icon-maskable-512x512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

**Icon generation**: Use [maskable.app](https://maskable.app) to generate the maskable variant — it must have at least 20% padding inside the safe zone so Android's adaptive icon shapes don't crop the logo.

**iOS touch icon**: drop `apple-touch-icon.png` (180×180) directly in `public/`. iOS reads this from the `<link rel="apple-touch-icon">` tag, not the manifest.

---

## Example 5: Auth Safety — The Rule That Prevents Login Loops

Without an explicit `NetworkOnly` rule for `/api/auth/*`, the default caching behavior is:

```
User logs out
  → Client calls POST /api/auth/logout
  → Server invalidates session
  → SW caches the 200 response (NetworkFirst via defaultCache)
  → User navigates to /profile
  → Client calls GET /api/auth/session
  → SW serves cached response showing "logged in"
  → UI is in broken state — user is logged in from UI perspective,
    logged out from server perspective
```

Fix — place BEFORE `...defaultCache`:

```typescript
runtimeCaching: [
  { urlPattern: /\/api\/auth\/.*/, handler: "NetworkOnly" },
  // ... other specific rules
  ...defaultCache,
],
```

**Ordering is load-bearing**: Workbox uses first-match-wins. If `...defaultCache` came first, it would match `/api/.*` before your specific `/api/auth/.*` rule gets a chance.

---

## Example 6: Offline Fallback Page

```typescript
// next.config.ts — add to withPWA options
const withPWA = require("next-pwa")({
  dest: "public",
  register: false,
  fallbacks: {
    document: "/offline",    // when no cached match for a navigation
    image: "/icons/offline-image.png",
  },
  runtimeCaching: [...],
});
```

```tsx
// app/offline/page.tsx
export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <h1 className="text-2xl font-bold">You're offline</h1>
      <p className="mt-2 text-gray-600">
        Check your connection and try again.
      </p>
      <button
        onClick={() => window.location.reload()}
        className="mt-4 rounded bg-primary px-4 py-2 text-white"
      >
        Retry
      </button>
    </main>
  );
}
```

`app/offline/page.tsx` gets statically exported to `out/offline/index.html` and precached by the SW. When a user navigates while offline and nothing matches, they see this page instead of the browser's default offline screen.

---

## Example 7: Build Verification Checklist

After wiring, verify with:

```bash
# 1. Remove Turbopack flag from build script, then:
npm run build

# 2. Check emitted SW files in out/
ls -la out/sw.js out/workbox-*.js
# Expected: both files present, ~2 KB sw.js, ~50 KB workbox-*.js

# 3. Check manifest emitted
cat out/manifest.json
# Expected: your manifest.json served as-is

# 4. Serve locally and inspect via Chrome DevTools
npx serve out
# → http://localhost:3000
# → DevTools > Application > Service Workers → should show registered
# → DevTools > Application > Manifest → should parse without warnings
# → Chrome install icon in address bar → should appear
```

### Capacitor native verification

```bash
# Build web + sync to native
npm run build
npx cap sync

# Run on iOS simulator
npx cap run ios

# In Safari Web Inspector (Mac only):
# → Attach to the Capacitor WKWebView
# → Console: navigator.serviceWorker
# → Expected: undefined (confirms iOS limitation)
# → Your registration code's Capacitor.isNativePlatform() check should early-return
# → No SW registration errors in console
```

---

## Summary Walkthrough

1. **Drop Turbopack from `build`** — keep in `dev` only
2. **Wrap `next.config.ts`** with `withPWA`, set `register: false`
3. **Create `public/manifest.json`** + 192/512 PNG icons + `apple-touch-icon.png`
4. **Add `ServiceWorkerRegistration` client component** in root layout with `Capacitor.isNativePlatform()` guard
5. **Order `runtimeCaching`**: auth `NetworkOnly` first, static CacheFirst next, `...defaultCache` last
6. **Verify**: `out/sw.js` exists, DevTools shows registered SW on web, `navigator.serviceWorker` is undefined in Capacitor iOS

Net result: web target is installable PWA with offline fallback; Capacitor native builds carry the SW file but never register it — the native shell's asset bundle handles offline naturally.
