# Static Site Deployment — Reference

## DevTools Device Toolbar Screenshot Workflow

For capturing OG images at exact dimensions:

1. Open `og-template.html` in Chrome
2. Open DevTools → toggle Device Toolbar (Ctrl+Shift+M / Cmd+Shift+M)
3. Set custom dimensions to 1200×630
4. Set Device Pixel Ratio to 2 (for crisp social previews on retina displays)
5. Right-click → "Capture screenshot" (captures at 2400×1260 device pixels)
6. Use `sips` to resize and convert: `sips -z 630 1200 -s format jpeg -s formatOptions 85 capture.png --out assets/og-image.jpg`

Alternative: set DPR to 1, capture at 1200×630 device pixels directly — acceptable for JPG-85 quality where retina difference is invisible after compression.

## DPR-Scale Canvas for Capture-Bound Assets

When a canvas element exists specifically to be screenshotted (not just displayed in-page), scale it for the capture target DPR:

```js
const dpr = window.devicePixelRatio || 1;
canvas.width = CSS_WIDTH * dpr;
canvas.height = CSS_HEIGHT * dpr;
ctx.scale(dpr, dpr);
// Draw at CSS coordinates — output will be crisp at device resolution
```

Without DPR scaling, retina-display screenshots produce blurry edges on social previews. With it, the canvas renders at native resolution regardless of the display.

## Inline Apple Glyph SVG

The Apple glyph (U+F8FF) only renders on macOS/iOS — it appears as a missing-character box on other platforms. Use an inline SVG with `fill: currentColor` instead of the Unicode glyph or a font load:

```html
<svg viewBox="0 0 170 170" width="16" height="16" style="fill: currentColor; vertical-align: middle;">
  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.2-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.93 0.21-9.84-1.96-14.75-6.52-3.13-2.73-7.05-7.41-11.73-14.04-5.02-7.08-9.14-15.29-12.39-24.65-3.48-10.11-5.23-19.9-5.23-29.38 0-10.86 2.35-20.23 7.06-28.08 3.7-6.31 8.63-11.29 14.82-14.95 6.19-3.66 12.89-5.52 20.12-5.64 3.95 0 9.11 1.22 15.53 3.61 6.4 2.4 10.51 3.62 12.31 3.62 1.35 0 5.9-1.42 13.63-4.25 7.31-2.64 13.48-3.73 18.54-3.29 13.7 1.11 24.01 6.5 30.87 16.22-12.25 7.42-18.3 17.81-18.17 31.14 0.11 10.38 3.87 19.02 11.26 25.88 3.35 3.19 7.09 5.66 11.25 7.41-0.9 2.62-1.86 5.13-2.87 7.54zM119.11 7.24c0 8.14-2.97 15.74-8.9 22.78-7.15 8.36-15.8 13.19-25.18 12.43-0.12-0.97-0.19-2-0.19-3.07 0-7.82 3.41-16.19 9.45-23.03 3.01-3.47 6.84-6.35 11.47-8.65 4.62-2.26 8.99-3.51 13.1-3.73 0.12 1.09 0.19 2.17 0.19 3.24l-0.12 0.03z"/>
</svg>
```

## Scraper Cache Lifetime Reference

| Scraper | Cache lifetime | Refresh mechanism |
|---|---|---|
| WhatsApp | Minutes to hours | Re-share the URL to trigger re-fetch |
| Facebook / Messenger | Days to weeks | FB Sharing Debugger → "Scrape Again" |
| LinkedIn | Per-post configurable | Post Inspector (LinkedIn developer tools) |
| Twitter / X | Hours | Card Validator |
| Slack | Hours | Re-paste URL in channel |

Use WhatsApp as the fast feedback control during iteration. Reserve Facebook Sharing Debugger for "did the deploy stick" verification.

## OG Image Format Standards

- **Dimensions**: 1200×630 (1.91:1 aspect ratio) — Facebook, LinkedIn, Twitter standard
- **Format**: JPG preferred over WebP/PNG for broader scraper compatibility
- **File size**: Under ~300KB; social scrapers may reject larger files
- **Messenger cropping**: Aggressively square-crops to ~630×630 — design with center-safe content
- **Apple platform naming**: `iOS` and `watchOS` (lowercase `w`), not `WatchOS`

## Key Reuse for Multi-Site SiteGround Accounts

One SSH key can power multiple SiteGround sites under the same account. The key is authorized at the user level (not per-site). Trade-off: revoking the key affects all sites it powers. Acceptable for solo-operator setups; revisit if multiple operators share access.

If reusing an existing key:
1. Skip key generation and SiteGround key import
2. Go directly to Step 3 (add the key's public fingerprint to GitHub Actions secrets)
3. Document which sites share the key in the repo README or deploy runbook
