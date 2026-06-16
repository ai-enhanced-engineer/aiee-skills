# Web Open-Redirect Guards — Reference

## Full 10-Case Test Matrix

The `isSafeNext` guard should pass all ten cases before being deployed:

| Input | Expected | Reason |
|---|---|---|
| `null` | `false` | No parameter present |
| `""` | `false` | Empty string — no destination |
| `"/dashboard"` | `true` | Clean relative path |
| `"/path?q=1#hash"` | `true` | Query string and fragment are safe |
| `"//evil.com"` | `false` | Protocol-relative URL — browser follows to `evil.com` |
| `"/\\evil.com"` | `false` | Backslash bypass — browsers normalize `\` to `/` before navigation |
| `"https://evil.com"` | `false` | Absolute URL with scheme — does not start with `/` |
| `"javascript:void(0)"` | `false` | Non-slash prefix — XSS vector |
| `"/%2Fevil.com"` | `false` | Percent-encoded `/` decodes to `//evil.com` — protocol-relative bypass |
| `"/%5Cevil.com"` | `false` | Percent-encoded `\` decodes to `/\evil.com` — backslash bypass |

The first two `startsWith("/")` rejects cover cases 7 and 8. Cases 5 and 6 require the explicit `//` and `/\` follow-on checks. Cases 9 and 10 (encoded-slash bypasses) require either a `decodeURIComponent` pass before the prefix checks, or explicit rejection of raw `%2F`/`%5C` sequences.

## Per-Framework Implementations

### TypeScript — Type-Predicate Helper

The type predicate `next is string` narrows the type at the call site, eliminating a separate null check.

**Decoding note**: Next.js `useSearchParams().get("next")` decodes percent-encoding automatically, so `/%2Fevil.com` arrives as `//evil.com` and is caught by the existing `//` check. Express `req.query.next` may leave the value percent-encoded depending on middleware — decode explicitly before the prefix checks to be safe.

```ts
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next) return false;
  // Decode percent-encoding so %2F and %5C bypasses are caught by the prefix checks below.
  let decoded: string;
  try {
    decoded = decodeURIComponent(next);
  } catch {
    return false; // malformed percent-encoding — reject
  }
  if (!decoded.startsWith("/")) return false;
  if (decoded.startsWith("//")) return false;   // protocol-relative URL
  if (decoded.startsWith("/\\")) return false;  // backslash bypass
  return true;
}
```

Usage with Next.js `useRouter`:

```ts
const nextParam = searchParams.get("next");

router.push(isSafeNext(nextParam) ? nextParam : defaultRoute(user));
```

### Laravel — Validator Rule

A reusable `Rule` closure keeps validation inline with the rest of the request rules:

```php
use Illuminate\Validation\Rule;

$request->validate([
    'next' => [
        'nullable',
        'string',
        Rule::when(fn () => $request->has('next'), function ($attribute, $value, $fail) {
            if (!str_starts_with($value, '/')) {
                $fail('Redirect must be a relative path.');
            }
            if (str_starts_with($value, '//') || str_starts_with($value, '/\\')) {
                $fail('Redirect contains a protocol-relative bypass.');
            }
        }),
    ],
]);
```

Fallback on validation failure: return to `route('dashboard')` or any role-default route, not a 422 error page.

### Ruby — `safe_redirect` Helper

```ruby
module SafeRedirect
  # Returns a verified relative path, or nil if the input is unsafe.
  def safe_next(value)
    return nil unless value.is_a?(String)
    return nil unless value.start_with?("/")
    return nil if value.start_with?("//")
    return nil if value.start_with?("/\\")
    value
  end
end
```

Use in controllers:

```ruby
destination = safe_next(params[:next]) || default_route_for(current_user)
redirect_to destination
```

## Capacitor WebView Escape-Hatch Pattern

In Capacitor WKWebView (iOS) and Chromium WebView (Android), a successful open-redirect drops the user out of the app shell into an external browser or an in-app browser tab. Recovery typically requires killing and restarting the app.

**In-app browser fallback**: If a flow legitimately needs to open an external URL (OAuth IdP, payment gateway), use the Capacitor Browser plugin (`@capacitor/browser`) rather than navigating the WebView directly. This keeps the app shell alive:

```ts
import { Browser } from "@capacitor/browser";

// Open external URL in an in-app browser overlay, not the WebView itself
await Browser.open({ url: externalUrl });
```

For internal redirects only the `isSafeNext` guard is needed — the in-app browser escape-hatch is exclusively for legitimately external destinations.

Apply the guard at every consumer of the redirect parameter (login handler, OAuth callback, post-checkout return) — not just the primary entry point.
