# Stripe Elements in React — Reference

## Stripe SDK Version Requirements

React 19 peer support requires:
- `@stripe/stripe-js@^9` (not `^4`)
- `@stripe/react-stripe-js@^6` (not `^2`)

Always verify peer ranges against the project's React major before committing a plan to specific SDK versions. `npm install` produces warnings for mismatched peers, not errors — a mismatched version can merge and wobble at runtime.

## SSR-Safe localStorage Initialization

Reading `localStorage` in a React render body crashes during SSR/static-export prerender. The canonical fix uses a lazy `useState` initializer:

```tsx
const [earlySignup] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem("early_signup") === "true";
});
```

The lazy form runs once on mount (client-only); the guard short-circuits on the server. Avoids the hydration-mismatch flicker that `useEffect` + `setState` causes (one render with wrong value, then re-render with correct).

## Promo Eligibility Single-Decision-Point

Honor-system flags (e.g., early-signup promotions) work best with a single named constant and a single decision helper:

```ts
// utils/promoEligibility.ts
export const LAUNCH_PROMO_CUTOFF = new Date("2026-03-01");

export function isEarlySignupEligible(userCreatedAt: string): boolean {
  return new Date(userCreatedAt) < LAUNCH_PROMO_CUTOFF;
}
```

PM swaps the cutoff constant; call sites never change. Persist the eligibility decision across pages via URL query string (`?early_signup=true`) rather than re-deriving on each page — prevents edge cases where different pages reach different conclusions about eligibility.

## Capacitor WebView Considerations

In Capacitor WKWebView (iOS) and Chromium WebView (Android), `loadStripe` loads the Stripe.js library from `js.stripe.com` over HTTPS. This works with default Capacitor security policy.

An unsafe `?next=` redirect after payment can drop the user out of the app shell into an external URL in the WebView context. Apply `isSafeNext` validation at every redirect site — see `web-open-redirect-guards` skill.

`en-CA` locale pinning is appropriate for single-jurisdiction apps to remove device-locale variability (e.g., `fr-CA` users seeing mixed-language number formatting). Revisit when i18n lands.

### Capacitor CSP / allowNavigation for Stripe

Default Capacitor 6+ iOS WKContentRuleList may block iframe navigation to `js.stripe.com` in some configurations. Add `server.allowNavigation` in `capacitor.config.ts`:

```ts
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // ...
  server: {
    allowNavigation: ['*.stripe.com', '*.hcaptcha.com'],
  },
};
export default config;
```

Android: verify that `res/xml/network_security_config.xml` permits `*.stripe.com` — the default template allows HTTPS to all domains, but corporate or hardened base configs may restrict it.

Test on a real device — simulator CSP enforcement differs from physical hardware in both iOS and Android.

## 3DS / PSD2 Redirect Handling

3DS (3D Secure) authentication is mandatory for EU cards under PSD2. `confirmCardPayment` returns an `authentication_required` error or a PaymentIntent with `next_action.type === 'redirect_to_url'` when the issuer requires it.

**Web path**: Stripe Elements handles 3DS automatically via `handleNextAction` when using the full `confirmPayment` flow with the Payment Element. For `confirmCardPayment` with a CardElement, call `stripe.handleNextAction({ clientSecret })` when the returned PaymentIntent status is `requires_action`. Stripe opens a modal redirect within the current window and resolves the promise when the user completes (or cancels) authentication.

**Capacitor path**: The 3DS redirect navigates the WebView frame away from the app shell, dropping the native navigation state. Two mitigations:

1. Use `@capacitor/browser` to open the `next_action.redirect_to_url.url` in an in-app browser overlay rather than navigating the WebView directly (see `web-open-redirect-guards` skill for the `Browser.open` escape-hatch pattern). Register `App.addListener('appUrlOpen', ...)` to handle the deep-link return URL that Stripe redirects back to after authentication.
2. Alternatively, scope the Capacitor payment flow to payment methods that do not trigger 3DS (e.g., restrict to US cards only, or use Stripe's `off_session` flows for subscriptions where 3DS is completed at signup).

```ts
import { Browser } from "@capacitor/browser";
import { App } from "@capacitor/app";
import { stripe } from "./stripeInstance"; // module-scope loadStripe result

// After confirmCardPayment returns requires_action:
if (paymentIntent.status === "requires_action" && paymentIntent.next_action?.type === "redirect_to_url") {
  const redirectUrl = paymentIntent.next_action.redirect_to_url.url;

  // Open in in-app browser to preserve the app shell
  await Browser.open({ url: redirectUrl });

  // Listen for the deep-link return (configure your Stripe return_url to your app scheme)
  App.addListener("appUrlOpen", async ({ url }) => {
    if (url.includes("payment_intent_client_secret")) {
      await Browser.close();
      const { paymentIntent: completed } = await stripe.retrievePaymentIntent(clientSecret);
      // completed.status should now be 'succeeded' or 'requires_payment_method'
    }
  });
}
```

The `return_url` passed to `confirmCardPayment` must match the app's deep-link scheme (e.g., `com.example.app://payment-complete`). The scheme is registered in native project config, not `capacitor.config.ts` — iOS adds a `CFBundleURLTypes` entry to `Info.plist`, Android adds an `<intent-filter>` with `<data android:scheme="..."/>` to the launcher activity in `AndroidManifest.xml`. The JS-side `App.addListener('appUrlOpen', ...)` shown above receives the deep-link event once the native scheme is registered.

## `vi.resetModules` + Dynamic Import for Env-Var Testing

Testing modules whose top-level `process.env.X` read affects behavior requires module cache invalidation:

```ts
describe("missing NEXT_PUBLIC_STRIPE_KEY", () => {
  const originalKey = process.env.NEXT_PUBLIC_STRIPE_KEY;

  afterEach(() => {
    process.env.NEXT_PUBLIC_STRIPE_KEY = originalKey;
    vi.resetModules();
  });

  it("renders payment-config-error phase", async () => {
    delete process.env.NEXT_PUBLIC_STRIPE_KEY;
    vi.resetModules();
    const { PaymentForm } = await import("./PaymentForm");
    render(<PaymentForm />);
    expect(screen.getByTestId("payment-config-error")).toBeInTheDocument();
  });
});
```

Hoisted `vi.mock(...)` calls survive `resetModules()` — other mocks remain live. Always call `resetModules()` in cleanup to restore the module graph for subsequent tests.

## Subagent Commit Hook Bypass

Subagent `git commit` invocations may bypass Husky pre-commit hooks (TTY-dependent or invocation-mode-dependent). CI's `format-check` step catches formatting drift that the local agent commit missed.

Mitigation: run `npm run format:check && npm run lint && npm run type-check` explicitly before declaring an agent's commit complete. Or, the orchestrator runs these as a post-commit gate before declaring the cycle done.

## FE-Gated on BE Follow-Up Pattern

When FE triage surfaces backend contract gaps after a BE merge, the cleanest path is a focused BE follow-up ticket rather than starting FE work against an unmerged BE branch:

- No rebase complexity if BE review forces a contract change
- FE waits <1 day while BE follow-up ships
- FE adjusts response binders after the definitive contract is final

Starting against the BE feature branch means re-coding response binders if the controller signature shifts during BE review. The wait is usually cheaper than the rebase.
