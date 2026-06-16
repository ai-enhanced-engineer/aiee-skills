# Vite PWA Reference - vite-plugin-pwa

Complete guide to Progressive Web App configuration in Vite 5 applications.

## Table of Contents

1. [PWA Fundamentals](#pwa-fundamentals)
2. [Plugin Setup](#plugin-setup)
3. [Caching Strategies](#caching-strategies)
4. [Service Worker Modes](#service-worker-modes)
5. [Offline Support](#offline-support)
6. [Web App Manifest](#web-app-manifest)
7. [Update Strategies](#update-strategies)

---

## PWA Fundamentals

### What is a PWA?

Progressive Web Apps provide native app-like experiences using modern web capabilities:

- **Offline functionality** - Works without network connection
- **Installability** - Can be installed to device home screen
- **App-like experience** - Standalone window, no browser UI
- **Auto-updates** - Service workers enable seamless updates
- **Fast performance** - Cached assets load instantly

### PWA Requirements

| Requirement | Purpose | Validation |
|------------|---------|------------|
| **HTTPS** | Security for service workers | Required (except localhost) |
| **Service Worker** | Offline support and caching | Must be registered |
| **Web App Manifest** | Installation and app metadata | Must include name, icons, start_url |
| **Responsive Design** | Works on all screen sizes | Mobile viewport configured |
| **Fast Load** | Time to Interactive < 10s | Lighthouse audit |

### Service Worker Lifecycle

```
Installation → Waiting → Activation → Idle → Fetch/Message Events
```

**Key States**:
- **Installing**: Service worker script downloading and parsing
- **Installed/Waiting**: New version installed but old version still controls pages
- **Activating**: New service worker taking control
- **Activated**: Service worker active and controlling pages
- **Redundant**: Old service worker replaced or installation failed

**Critical Behavior**: New versions wait in "waiting" state until all tabs using old service worker are closed.

---

## Plugin Setup

### Installation

```bash
npm install -D vite-plugin-pwa
```

### Basic Configuration

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'My Awesome App',
        short_name: 'MyApp',
        description: 'App description',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
})
```

### registerType Options

| Option | Behavior | Use Case |
|--------|----------|----------|
| **autoUpdate** | Automatically activates new versions | Seamless updates, no user interaction |
| **prompt** | Shows UI notification about update | User controls when to update |

**autoUpdate** (recommended):
```javascript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}']
  }
})
```

**prompt** (user control):
```javascript
VitePWA({
  registerType: 'prompt',
  // App shows custom update notification
})
```

### includeAssets

Specify public resources for precaching:

```javascript
VitePWA({
  includeAssets: [
    'favicon.ico',           // Browser favicon
    'apple-touch-icon.png',  // iOS home screen icon
    'mask-icon.svg',         // Safari pinned tab
    'robots.txt'             // SEO file
  ]
})
```

**Important**:
- Resolved from Vite's `publicDir`
- Manifest icons auto-included
- Don't duplicate manifest icons here
- All listed assets are precached

---

## Caching Strategies

Workbox provides five core strategies for service worker caching.

### 1. CacheFirst

Check cache first, fall back to network if not cached.

**Best for**:
- Static assets (CSS, JS, images, fonts)
- Versioned files with cache-busting
- Resources that don't change frequently

**Configuration**:
```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images-cache',
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
          }
        }
      }
    ]
  }
})
```

**Pros**: Fastest response, works offline immediately
**Cons**: Users may see stale content

---

### 2. NetworkFirst

Try network first, fall back to cache if network fails.

**Best for**:
- API responses
- Frequently updated content
- Resources where freshness matters

**Configuration**:
```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\.example\.com\/.*/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 5,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 // 1 hour
          }
        }
      }
    ]
  }
})
```

**Pros**: Always tries fresh data, offline fallback
**Cons**: Slower than cache-first

---

### 3. StaleWhileRevalidate

Return cached response immediately, update cache in background.

**Best for**:
- User avatars
- Non-critical UI assets
- Balance between performance and freshness

**Configuration**:
```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/cdn\.example\.com\/.*/,
        handler: 'StaleWhileRevalidate',
        options: {
          cacheName: 'cdn-cache',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 7 * 24 * 60 * 60 // 7 days
          }
        }
      }
    ]
  }
})
```

**Pros**: Fast response, auto-updates in background
**Cons**: First request may show stale content

---

### 4. NetworkOnly

Always fetch from network, never use cache.

**Best for**:
- Real-time data
- Sensitive information
- Admin panels

**Configuration**:
```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /\/admin\/.*/,
        handler: 'NetworkOnly'
      }
    ]
  }
})
```

**Pros**: Always fresh data
**Cons**: No offline support

---

### 5. CacheOnly

Always use cache, never fetch from network.

**Best for**:
- Pre-cached versioned assets
- Offline-only content

**Configuration**:
```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /\/offline\/.*/,
        handler: 'CacheOnly',
        options: {
          cacheName: 'offline-content'
        }
      }
    ]
  }
})
```

**Pros**: Fastest, guaranteed offline
**Cons**: No way to get fresh content

---

### Strategy Decision Matrix

| Scenario | Strategy | Reasoning |
|----------|----------|-----------|
| Static assets (CSS, JS, images) | CacheFirst | Fast load, rarely change |
| API responses | NetworkFirst | Need fresh data, offline fallback |
| User avatars, non-critical UI | StaleWhileRevalidate | Balance speed + freshness |
| Real-time data, admin panels | NetworkOnly | Must be fresh, no offline |
| Pre-cached app shell | CacheOnly | Guaranteed offline availability |

---

## Service Worker Modes

### generateSW (Automatic)

Plugin generates complete service worker automatically.

**Best for**: Standard PWAs without complex caching logic

**Configuration**:
```javascript
VitePWA({
  strategies: 'generateSW', // Default
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\.example\.com\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24
          }
        }
      }
    ]
  }
})
```

**What it does**:
- Automatically generates service worker
- Handles precaching of static assets
- Applies runtime caching rules
- No custom code needed

---

### injectManifest (Custom)

Use custom service worker with injected precache manifest.

**Best for**: Advanced use cases requiring custom logic

**Configuration**:
```javascript
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.ts',
  injectManifest: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg}']
  }
})
```

**Custom Service Worker**:
```typescript
// src/sw.ts
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

// Precache static assets (injected by Vite PWA)
precacheAndRoute(self.__WB_MANIFEST)

// Custom runtime caching
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5
  })
)
```

---

## Offline Support

### Offline Fallback Page

```javascript
VitePWA({
  workbox: {
    navigateFallback: '/offline.html',
    navigateFallbackDenylist: [/^\/api\//],
  }
})
```

**Offline Page**:
```html
<!-- public/offline.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Offline</title>
  <style>
    body {
      font-family: system-ui, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
    }
    .offline-message {
      text-align: center;
      padding: 2rem;
    }
  </style>
</head>
<body>
  <div class="offline-message">
    <h1>You're offline</h1>
    <p>Please check your internet connection.</p>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>
```

### Background Sync

Retry failed requests when connection restored:

```typescript
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

const bgSyncPlugin = new BackgroundSyncPlugin('api-queue', {
  maxRetentionTime: 24 * 60 // Retry for 24 hours
})

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
)
```

---

## Web App Manifest

### Complete Manifest

```javascript
manifest: {
  name: 'My Awesome App',
  short_name: 'MyApp',
  description: 'Application description',
  theme_color: '#ffffff',
  background_color: '#ffffff',
  display: 'standalone',
  orientation: 'portrait',
  scope: '/',
  start_url: '/',
  icons: [
    {
      src: 'pwa-64x64.png',
      sizes: '64x64',
      type: 'image/png'
    },
    {
      src: 'pwa-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable'
    },
    {
      src: 'pwa-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable'
    }
  ]
}
```

### Icon Sizes

| Size | Purpose | Required |
|------|---------|----------|
| 64x64 | Favicon, notifications | Optional |
| 192x192 | Android home screen | Required |
| 512x512 | Android splash screen | Required |
| 180x180 | iOS home screen (apple-touch-icon) | iOS only |

### Display Modes

| Mode | Behavior |
|------|----------|
| `standalone` | Looks like native app, no browser UI |
| `fullscreen` | Full screen, no system UI |
| `minimal-ui` | Minimal browser controls |
| `browser` | Standard browser tab |

---

## Update Strategies

### Auto-Update Pattern

```javascript
VitePWA({
  registerType: 'autoUpdate',
  workbox: {
    cleanupOutdatedCaches: true
  }
})
```

Automatically activates new service worker when available.

### Prompt Pattern

```javascript
VitePWA({
  registerType: 'prompt'
})
```

Show custom UI for user to approve updates:

```javascript
import { useRegisterSW } from 'virtual:pwa-register/react'

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div className="update-prompt">
      <p>New version available!</p>
      <button onClick={() => updateServiceWorker(true)}>
        Update
      </button>
      <button onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  )
}
```

---

## Cache Management

### Cache Versioning

```javascript
VitePWA({
  workbox: {
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: /\.(?:png|jpg)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'images-v1', // Version in name
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 30 * 24 * 60 * 60
          }
        }
      }
    ]
  }
})
```

### Storage Limits

```javascript
import { ExpirationPlugin } from 'workbox-expiration'

new ExpirationPlugin({
  maxEntries: 50,
  maxAgeSeconds: 7 * 24 * 60 * 60,
  purgeOnQuotaError: true // Auto-delete when quota exceeded
})
```

---

## Development

### DevTools Integration

```javascript
VitePWA({
  devOptions: {
    enabled: true // Enable PWA in dev mode
  }
})
```

**Testing**:
- Chrome DevTools → Application → Service Workers
- View registered service workers
- Update on reload
- Bypass for network
- Unregister service worker

**Cache Inspection**:
- Chrome DevTools → Application → Cache Storage
- View all caches
- Inspect cached files
- Delete individual entries

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **Not versioning caches** | Stale content persists | Use versioned cache names |
| **No expiration limits** | Storage quota exceeded | Set maxEntries and maxAgeSeconds |
| **Caching sensitive data** | Security risk | Use NetworkOnly for sensitive routes |
| **No offline fallback** | Poor UX when offline | Implement navigateFallback |
| **Disabling cleanupOutdatedCaches** | Old caches accumulate | Enable cleanup |
| **Not testing offline** | Broken offline experience | Test with DevTools offline mode |
| **Wrong strategy for API** | Stale data or no offline support | Use NetworkFirst for APIs |

---

## References

- [vite-plugin-pwa Documentation](https://vite-pwa-org.netlify.app/)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)
- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web.dev: Progressive Web Apps](https://web.dev/progressive-web-apps/)
