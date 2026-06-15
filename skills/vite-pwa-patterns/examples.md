# Vite PWA Examples - example-frontend

Example patterns from a example-frontend project.

## Project Implementation

### Complete Vite PWA Configuration

**File**: `vite.config.js`

Production-ready PWA setup with caching strategies.

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Example App',
        short_name: 'Chatbot',
        description: 'Assistant de conversation intelligent avec Azure OpenAI',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    })
  ]
})
```

**Configuration Highlights**:
1. **registerType: 'autoUpdate'** - Seamless updates without user prompts
2. **includeAssets** - Precache all icons using glob pattern
3. **manifest** - Complete web app manifest for installation
4. **workbox.globPatterns** - Precache all app assets including fonts
5. **runtimeCaching** - Two strategies for external resources
6. **devOptions.enabled** - Test PWA features during development

---

## Caching Strategy Examples

### Google Fonts Caching

```javascript
{
  urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
  handler: 'CacheFirst',
  options: {
    cacheName: 'google-fonts-cache',
    expiration: {
      maxEntries: 10,
      maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
    },
    cacheableResponse: {
      statuses: [0, 200]
    }
  }
}
```

**Why This Works**:
- Google Fonts rarely change
- CacheFirst provides instant loading
- 1 year expiration (fonts are versioned)
- maxEntries: 10 prevents cache bloat
- cacheableResponse handles CORS (status 0)

---

### External Images Caching

```javascript
{
  urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
  handler: 'CacheFirst',
  options: {
    cacheName: 'images-cache',
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
    }
  }
}
```

**Why This Works**:
- Images from any HTTPS origin
- CacheFirst for performance
- 30 day expiration balances freshness
- maxEntries: 50 prevents unlimited growth

---

## Manifest Configuration

### Complete Web App Manifest

```javascript
manifest: {
  name: 'Example App',
  short_name: 'Chatbot',
  description: 'Assistant de conversation intelligent avec Azure OpenAI',
  theme_color: '#3b82f6',
  background_color: '#ffffff',
  display: 'standalone',
  icons: [
    {
      src: '/icons/icon-192x192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable'
    },
    {
      src: '/icons/icon-512x512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable'
    }
  ]
}
```

**Key Features**:
- **name**: Full app name shown during install
- **short_name**: Name shown on home screen
- **theme_color**: Browser UI color (#3b82f6 = blue-500)
- **display: 'standalone'**: Opens without browser UI
- **purpose: 'any maskable'**: Works for both regular and maskable icons

---

## Complete PWA Setup Examples

### Basic PWA Configuration

```javascript
// vite.config.js
import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'My App',
        short_name: 'App',
        theme_color: '#ffffff',
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
}
```

---

### API Caching Strategy

```javascript
VitePWA({
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/api\.example\.com\/.*$/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'api-cache',
          networkTimeoutSeconds: 5,
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 60 * 60 // 1 hour
          },
          cacheableResponse: {
            statuses: [0, 200]
          }
        }
      }
    ]
  }
})
```

**Pattern**:
- NetworkFirst: Always try fresh data
- 5 second timeout before falling back to cache
- Cache API responses for 1 hour
- Limit to 50 entries to prevent bloat

---

### CDN Assets Caching

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

**Pattern**:
- StaleWhileRevalidate: Instant response + background update
- Good for CDN assets that update occasionally
- 7 day expiration
- Limit to 30 entries

---

### Custom Service Worker

```javascript
// vite.config.js
VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  filename: 'sw.js',
})
```

```javascript
// src/sw.js
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'

// Precache static assets
precacheAndRoute(self.__WB_MANIFEST)

// API calls - network first
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 // 1 hour
      })
    ]
  })
)

// Images - cache first
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 30 * 24 * 60 * 60 // 30 days
      })
    ]
  })
)

// Log when service worker activates
self.addEventListener('activate', (event) => {
  console.log('Service worker activated')
})
```

---

## Offline Support

### Offline Fallback Page

```javascript
// vite.config.js
VitePWA({
  workbox: {
    navigateFallback: '/offline.html',
    navigateFallbackDenylist: [/^\/api\//]
  }
})
```

```html
<!-- public/offline.html -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Offline - Example App</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .offline-container {
      text-align: center;
      padding: 2rem;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      backdrop-filter: blur(10px);
      max-width: 400px;
    }
    h1 {
      margin-top: 0;
      font-size: 2rem;
    }
    button {
      margin-top: 1rem;
      padding: 0.75rem 2rem;
      background: white;
      color: #667eea;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
      font-weight: 600;
    }
    button:hover {
      background: #f0f0f0;
    }
  </style>
</head>
<body>
  <div class="offline-container">
    <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M1 1l22 22M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 12.55a10.94 10.94 0 0 1 5.17-2.39M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M12 20h.01"></path>
    </svg>
    <h1>You're Offline</h1>
    <p>It looks like you've lost your internet connection.</p>
    <p>Check your network and try again.</p>
    <button onclick="location.reload()">Retry</button>
  </div>
</body>
</html>
```

---

## Update Prompt Component

### React Update Notification

```javascript
import { useRegisterSW } from 'virtual:pwa-register/react'

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(registration) {
      console.log('SW registered:', registration)
    },
    onRegisterError(error) {
      console.error('SW registration error:', error)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-prompt">
      <div className="update-content">
        <p>New version available!</p>
        <div className="update-actions">
          <button
            onClick={() => updateServiceWorker(true)}
            className="update-btn"
          >
            Update Now
          </button>
          <button
            onClick={() => setNeedRefresh(false)}
            className="dismiss-btn"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  )
}

export default UpdatePrompt
```

```css
/* Update prompt styles */
.update-prompt {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: white;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
  max-width: 300px;
}

.update-content p {
  margin: 0 0 1rem 0;
  font-weight: 600;
}

.update-actions {
  display: flex;
  gap: 0.5rem;
}

.update-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
}

.dismiss-btn {
  flex: 1;
  padding: 0.5rem 1rem;
  background: #f3f4f6;
  color: #374151;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
```

---

## Development and Testing

### Enable PWA in Development

```javascript
// vite.config.js
VitePWA({
  devOptions: {
    enabled: true,
    type: 'module'
  }
})
```

**Testing Checklist**:
- Chrome DevTools → Application → Service Workers
- Verify service worker registered
- Test "Update on reload"
- Test "Bypass for network"
- Check offline functionality
- Inspect Cache Storage

### Lighthouse Audit

Run PWA audit:
```bash
npm run build
npx serve dist
```

Open Chrome DevTools → Lighthouse → Progressive Web App audit

**Key Metrics**:
- Installable
- Offline support
- Fast and reliable
- Optimized images
- Proper manifest

---

## Advanced Patterns

### Background Sync for Failed Requests

```javascript
// src/sw.js
import { BackgroundSyncPlugin } from 'workbox-background-sync'
import { registerRoute } from 'workbox-routing'
import { NetworkOnly } from 'workbox-strategies'

const bgSyncPlugin = new BackgroundSyncPlugin('api-queue', {
  maxRetentionTime: 24 * 60 // Retry for 24 hours
})

registerRoute(
  ({ url }) => url.pathname.startsWith('/api/chat'),
  new NetworkOnly({
    plugins: [bgSyncPlugin]
  }),
  'POST'
)
```

**Use Case**: Retry chat messages sent while offline

---

### Notification Support

```javascript
// Request notification permission
async function requestNotificationPermission() {
  if ('Notification' in window) {
    const permission = await Notification.requestPermission()
    return permission === 'granted'
  }
  return false
}

// Show notification
function showNotification(title, options = {}) {
  if ('serviceWorker' in navigator && 'Notification' in window) {
    navigator.serviceWorker.ready.then(registration => {
      registration.showNotification(title, {
        body: options.body || '',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        ...options
      })
    })
  }
}
```

---

## Best Practices from Project

1. **Auto-Update**: Use registerType: 'autoUpdate' for seamless updates
2. **Glob Patterns**: Include all asset types in precache
3. **Cache Fonts**: CacheFirst with 1 year expiration
4. **Cache Images**: CacheFirst with 30 day expiration
5. **Dev Mode**: Enable devOptions for testing
6. **Manifest Icons**: Include both 192x192 and 512x512
7. **Purpose: 'any maskable'**: Support both icon types
8. **Versioned Cache Names**: Enable cleanup of old caches
9. **Expiration Limits**: Prevent unlimited cache growth
10. **Offline Fallback**: Provide good UX when offline

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| No expiration limits | Cache grows unbounded | Set maxEntries and maxAgeSeconds |
| Caching API POST requests | Stale mutations | Use NetworkOnly for mutations |
| No offline page | Poor UX when offline | Add navigateFallback |
| Not testing offline | Broken offline experience | Test with DevTools offline mode |
| Wrong strategy for resources | Stale content or poor performance | Match strategy to resource type |
| Not enabling cleanup | Old caches accumulate | Set cleanupOutdatedCaches: true |
| No manifest icons | Can't install | Include 192x192 and 512x512 icons |

---

## Debugging Tips

### View Service Worker

```
Chrome DevTools → Application → Service Workers
```

**Actions**:
- Update on reload
- Bypass for network
- Unregister service worker

### Inspect Caches

```
Chrome DevTools → Application → Cache Storage
```

**Actions**:
- View cached files
- Delete individual entries
- Clear all caches

### Test Offline

```
Chrome DevTools → Network → Offline
```

Verify offline functionality works correctly.

### Check Storage

```javascript
if ('storage' in navigator && 'estimate' in navigator.storage) {
  navigator.storage.estimate().then(estimate => {
    console.log('Usage:', estimate.usage)
    console.log('Quota:', estimate.quota)
    console.log('Percentage:', (estimate.usage / estimate.quota * 100).toFixed(2) + '%')
  })
}
```

---

## Performance Tips

1. **Lazy load service worker**: Don't block main thread
2. **Limit precache size**: Only critical assets
3. **Use appropriate strategies**: Match resource type
4. **Set expiration limits**: Prevent cache bloat
5. **Clean up old caches**: Enable cleanup option
6. **Monitor cache size**: Check storage usage
7. **Test with slow 3G**: Verify performance
8. **Optimize images**: Compress before caching
