---
name: static-site-deployment
description: Static site deployment patterns for SiteGround shared hosting via GitHub Actions — SSH key setup, Actions secrets injection, deploy workflow structure, OG image pipeline for static sites, Facebook scraper WAF debugging, and robots.txt social scraper allowlisting. Use when deploying a static site to SiteGround, debugging social preview images, or setting up a no-build-step deployment pipeline. Call for SiteGround SSH deploy setup, OG image broken on Facebook, or GitHub Actions deploy secrets configuration.
updated: 2026-06-12
---

# Static Site Deployment

Deployment patterns for static sites hosted on SiteGround via GitHub Actions SSH push, plus OG image pipeline and social scraper debugging.

## When to Use

- Setting up SiteGround SSH deployment via GitHub Actions
- Configuring Actions secrets for SSH-based deploy
- Building OG images for a static site without a build step
- Debugging "OG image broken on Facebook/Messenger" symptoms
- Allowlisting social scrapers blocked by SiteGround WAF

## SiteGround SSH Key Setup

SiteGround's textarea importer rejects pasted keys with trailing comments (`user@host`) or paste-injected newlines. Use "Import Key from File" — it bypasses both quirks.

One SSH key can authorize multiple sites under the same SiteGround account. If a key already exists for another site, skip key generation and go directly to adding the Actions secrets.

## GitHub Actions Secrets for Deploy

Four secrets: `SSH_PRIVATE_KEY`, `SSH_HOST`, `SSH_USER`, `SSH_PORT` (SiteGround uses a non-standard port, typically 18765). Set via file pipe: `gh secret set SSH_PRIVATE_KEY < ~/.ssh/github_siteground_deploy`.

Empty secret references produce cryptic argument-parsing errors (e.g., `ssh-keyscan` reporting "option requires an argument -- p" when `SSH_PORT` is empty). Run `gh secret list` to verify secrets are populated before debugging the command.

## OG Image Pipeline (No Build Step)

Ship `og-template.html` rendering at exactly 1200×630. Capture via Chrome DevTools device toolbar, convert with `sips`. Verify dimensions match the meta tag — a 1424×752 file declared as 1200×630 causes scrapers to crop. For pixel-precise text+icon spacing, use HTML flex layout rather than SVG with hardcoded coordinates. See `reference.md` for the DevTools workflow and DPR-scale canvas pattern.

## Facebook Scraper Debugging

Facebook OG cache is aggressive (days to weeks). When Messenger shows an old image but WhatsApp shows the new one, the file on disk is likely correct — only Facebook's CDN is stale.

Diagnosis ladder: (1) verify file dimensions on disk; (2) `curl -A "facebookexternalhit/1.1" <URL>` — 200 means the UA is not blocked, the issue is at the IP layer; (3) SiteGround "Blocked Traffic" panel only shows manual blocks, not WAF blocks; (4) contact support with [Facebook crawler IP ranges](https://developers.facebook.com/docs/sharing/webmasters/crawler) to request WAF whitelisting — there is no self-serve toggle.

Facebook Sharing Debugger shows "Bad Response Code — could be due to a robots.txt block" as generic boilerplate for any 403 — do not take this literally.

## robots.txt Social Scraper Allowlist

A repo with no `robots.txt` still serves one — SiteGround injects a default with `Crawl-delay: 10`. Ship an explicit `robots.txt` with `Allow: /` for `facebookexternalhit`, `facebookcatalog`, `Twitterbot`, `LinkedInBot`, `Slackbot`, and `WhatsApp`. See `reference.md` for the full template.

## CDN Script Embeds (SRI Integrity)

When a page loads a CDN script with Subresource Integrity (`<script src="…@1.2.3" integrity="sha384-…">`), bumping the version **requires recomputing the hash** — the browser blocks execution silently if the `integrity` value no longer matches the fetched bytes. Recompute:

```bash
curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
```

SRI also demands an **exact version pin**: `@latest` or a floating `@1` is incompatible with `integrity` and breaks on the next CDN release, since the hash is computed for one specific build.

## Page Removal and URL Changes

When a page is renamed, folded into another, or removed entirely, old URLs continue to circulate in bookmarks, social shares, and external links. A static site has no server-side 301 redirect, so the static equivalent is a stub file at the old path.

**Redirect stub pattern:**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Page moved</title>
  <!-- Redirect after 0 seconds; users with JS see the meta-refresh -->
  <meta http-equiv="refresh" content="0; url=/new-path/">
  <link rel="canonical" href="https://example.com/new-path/">
  <meta name="robots" content="noindex">
</head>
<body>
  <p>This page has moved. <a href="/new-path/">Go to the new location</a>.</p>
</body>
</html>
```

Place this file at the old URL's path (e.g. `old-page/index.html`). The `noindex` meta tag prevents search engines from indexing the stub as a duplicate; the `canonical` points crawlers at the real destination. Update the sitemap simultaneously — remove the old URL entry and add (or confirm) the new one.

If the page is removed without a replacement (not renamed), skip the meta-refresh and canonical; keep only the `noindex` and a plain "this page is no longer available" message so crawlers don't retry it repeatedly.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Pasting SSH public keys into SiteGround textarea | Use "Import Key from File" link — textarea rejects trailing comments and paste newlines |
| Bumping the version in an SRI `integrity` script tag without recomputing the sha384 | Recompute with `openssl dgst -sha384 -binary \| openssl base64 -A`; silent execution-block otherwise |
| `integrity` + a floating `@latest`/`@1` pin | SRI needs an exact version pin — a floating tag breaks execution on the next CDN release |
| Empty `${{ secrets.X }}` → debugging downstream command | Run `gh secret list` first |
| OG image dimensions not matching meta tag declaration | Render at declared dimensions; verify with `sips -g pixelWidth -g pixelHeight` |
| Trusting FB Sharing Debugger "robots.txt block" text | Diagnose with `curl -A "facebookexternalhit/1.1"` — actual cause is usually WAF IP block |
| Assuming "Blocked Traffic" panel shows WAF blocks | WAF blocks require support escalation; panel shows only manual blocks |
| Missing `robots.txt` → relying on SiteGround default | Ship explicit `robots.txt` with allow-rules for social scrapers |
| Removing or renaming a page without a redirect stub | Leave a stub at the old path (meta-refresh + canonical + noindex) and update the sitemap; old bookmarks and external links otherwise 404 permanently |

See `reference.md` for DevTools device-toolbar screenshot workflow, DPR-scale canvas pattern, and scraper cache lifetime reference.
