---
name: web-open-redirect-guards
description: Open-redirect guard patterns for ?next=, ?return_to=, and ?redirect= URL parameters — protocol-relative bypass (//evil.com), backslash bypass (/\evil.com), Capacitor WebView drop-out risk, and canonical isSafeNext helper. Use when implementing login redirects, OAuth callbacks, post-checkout returns, or any endpoint that reads and follows a URL from query string parameters. Call for open-redirect security review, ?next= parameter validation, or Capacitor WebView security concerns.
updated: 2026-05-21
---

# Web Open-Redirect Guards

Patterns for validating user-controlled redirect parameters (`?next=`, `?return_to=`, `?redirect=`) to prevent open-redirect vulnerabilities.

## When to Use

- Login flows that redirect to a `?next=` parameter after authentication
- OAuth callback handlers that redirect to a `?return_to=` parameter
- Post-checkout or post-action redirects that follow a URL from query string
- Capacitor/Cordova WebView apps where an unsafe redirect drops users out of the app shell

## The Bypass Cases

A naïve `next.startsWith("/")` check accepts several bypass patterns browsers normalize before navigation:

| Input | Why it bypasses | Browser behavior |
|---|---|---|
| `//evil.com/path` | Starts with `/` — passes the check | Protocol-relative URL; browser follows to `evil.com` |
| `/\evil.com/path` | Starts with `/` — passes the check | Browsers normalize `\` to `/`; resolves to `evil.com` |
| `/%2Fevil.com` | Raw bytes start with `/` — passes the check | Percent-decoded to `//evil.com` before or during navigation; treated as protocol-relative |
| `/%5Cevil.com` | Raw bytes start with `/` — passes the check | Percent-decoded to `/\evil.com`; browsers normalize to `//evil.com` |

Encoded-slash bypasses (`%2F` = `/`, `%5C` = `\`) survive raw-string checks because the percent-encoding is not decoded until the browser processes the URL. Guards operating on the raw parameter value must either reject inputs containing `%2F` or `%5C` (case-insensitive), or decode with `decodeURIComponent()` before applying the existing prefix checks. See `reference.md` for per-framework notes on when decoding is automatic.

## Canonical Guard Helper

The `isSafeNext` helper accepts a string-or-null parameter, rejects anything that doesn't start with `/`, and adds explicit rejections for `//` (protocol-relative) and `/\` (backslash bypass). The TypeScript version uses a type-predicate signature (`next is string`) so the call site requires no separate null check after the guard.

On an unsafe `next`, fail open to a role-based default route rather than an error page — invalid `next` is usually a developer mistake (constructed URL gone wrong), not an attack.

See `reference.md` for the full TypeScript implementation, Laravel validator rule, Ruby `safe_redirect` helper, and the 10-case test matrix.

## Capacitor WebView Risk

In Capacitor WKWebView (iOS) and Chromium WebView (Android), a successful open-redirect exploit drops the user out of the app shell into an external browser context or an in-app browser. The user may be unable to return to the app without killing and restarting it.

Apply the guard at every site that consumes the redirect parameter, not just the primary redirect site. A single unguarded consumer is sufficient for exploitation.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `next.startsWith("/")` as sole validation | Also reject `//` and `/\` prefixes |
| Redirecting to an error page on unsafe `next` | Fail open to a role-based default route — invalid `next` is usually a bug, not an attack |
| Guarding only the primary redirect call site | Apply `isSafeNext` at every consumer of the parameter in the codebase |
| Omitting the backslash check | Browsers normalize `/\` to `//` before navigation — the bypass is real |
