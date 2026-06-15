---
name: stripe-elements-react
description: Stripe Elements integration patterns for React 19 + Next.js static export — loadStripe module scope, client_secret null path, bounded webhook-race retry, PCI SAQ-A, and the BE contract pair (payment_behavior=default_incomplete + expand). Use when implementing Stripe card checkout, PaymentIntent confirmation, or subscription payment in React. Call for Stripe Elements setup, webhook race handling, or Capacitor payment integration.
updated: 2026-05-10
---

# Stripe Elements in React

End-to-end patterns for Stripe Elements in React 19 + Next.js (static export) + Capacitor. Covers subscription creation through PaymentIntent confirmation.

## When to Use

- Building a card checkout UI with `<CardElement>` + `confirmCardPayment`
- Integrating Stripe Elements in a Next.js static export (app router or pages)
- Handling the `client_secret === null` path ($0-invoice or 100%-off coupon)
- Implementing bounded retry for the `incomplete → active` webhook race
- Preserving PCI SAQ-A compliance in React single-page apps

## Required BE Contract Pair

Two backend parameters are both required for the Elements flow:

| Parameter | Effect if absent |
|---|---|
| `payment_behavior=default_incomplete` | Stripe attempts immediate charge against nonexistent default PM; subscription falls to `incomplete_expired` after 23h |
| `expand=['latest_invoice.payment_intent']` | `latest_invoice` returns as a bare ID string; `client_secret` is unreachable |

Together they surface `client_secret` on the `POST /subscriptions` response for `confirmCardPayment`.

## Module-Scope loadStripe

`loadStripe(key)` hoisted to module scope inside a `"use client"` component. Render-function or effect placement reloads the script on every render — module-scope loads it once per page load. Turbopack HMR reloads on file changes; Stripe.js deduplicates injection (annoying, not dangerous). See `reference.md` for the full snippet.

## Missing Env Var Defense

`loadStripe(undefined)` → `null`; `<Elements stripe={null}>` renders; `useStripe()` returns null; the submit button silently disables — no user-visible error. This is the highest-probability production failure mode. Detect at module scope and render an explicit `payment-config-error` phase. See `reference.md` for the detection pattern.

## `client_secret === null` Path

Stripe returns `null` when no PaymentIntent is created ($0 invoice, 100%-off coupon) — detect and skip the Elements form, treat as success. Emit the key from the backend with `?? null` so FE branches on value, not key presence.

## Bounded Webhook-Race Retry

After `confirmCardPayment` resolves, the subscription stays `incomplete` until the `customer.subscription.updated` webhook fires (≤1-2s). The post-redirect `GET /me` may briefly see `incomplete`. Use a bounded retry (≤2 attempts × 1.5s, only on `incomplete` status — no infinite loop). Use distinct copy during the retry window (`"Activating your PRO membership…"` with `aria-live="polite"`) — not a generic spinner. See `reference.md` for the loop pattern.

## Error Code Mapping

Stripe's `error.message` strings are clear but actionless. Map common codes (`card_declined`, `incorrect_cvc`, `expired_card`, `processing_error`, `rate_limit`) to next-step copy, with a catch-all fallback. See `reference.md` for the full mapping table.

## PCI SAQ-A

`confirmCardPayment` passes an opaque element reference — card data never crosses the origin's JS heap. SAQ-A holds as long as `<CardElement>` is the only card-data interface.

## Accessibility + Static Export Notes

`<label htmlFor>` does NOT bind to a div wrapping a Stripe iframe — use `aria-label` on the wrapper div instead.

`useSearchParams` inside a payment page requires `<Suspense fallback={null}>` wrapping in static export builds. `next build` catches this; `next dev` and tests do not.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `loadStripe(key)` inside a render function | Hoist to module scope — leaks script loads on remount |
| `<Elements stripe={null}>` with no user-facing error | Detect missing key at module scope; render explicit error phase |
| Generic `Loading…` after payment confirmation | `aria-live="polite"` + distinct activation copy |
| Raw `error.message` displayed to user | Map common error codes to actionable copy |
| `<label htmlFor>` on a div wrapping a Stripe iframe | `aria-label` on the wrapper div |
| Stripe SDK packages with wrong React peer range | `@stripe/stripe-js@^9` + `@stripe/react-stripe-js@^6` for React 19 |

See `reference.md` for `localStorage` SSR-safe initializer, Capacitor WebView notes, and the `vi.resetModules` env-var test pattern.
