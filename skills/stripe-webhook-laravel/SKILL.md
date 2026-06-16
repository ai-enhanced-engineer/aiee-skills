---
name: stripe-webhook-laravel
description: Stripe webhook handling patterns for Laravel — atomic idempotency via DB::transaction and UNIQUE constraint, permanent vs transient failure partitioning, raw-body signature verification, mockable service layer, and the 5-event subscription lifecycle. Use when implementing Stripe billing webhooks, subscription tier management, or idempotent event processing in Laravel. Call for Stripe webhook setup, retry storm prevention, or webhook handler testing.
updated: 2026-05-10
---

# Stripe Webhooks in Laravel

Patterns for reliable, testable Stripe webhook handlers in Laravel. Covers idempotency, failure partitioning, signature verification, and the subscription event lifecycle.

## When to Use

- Implementing Stripe billing webhooks in a Laravel controller
- Designing idempotent webhook event processing
- Preventing 72h retry storms from permanent failure states
- Mocking Stripe SDK calls in feature tests
- Handling the subscription tier lifecycle across 5 Stripe events

## Atomic Idempotency

`StripeProcessedEvent::firstOrCreate(['stripe_event_id' => $event->id])` alone is not atomic — if the row inserts and the handler then throws, the next delivery sees `wasRecentlyCreated=false` and permanently skips the side effects ("phantom-processed" event).

The DB UNIQUE constraint on `stripe_event_id` is the actual idempotency boundary. Wrap `firstOrCreate` + handler dispatch in `DB::transaction`. Catch `QueryException` outside the transaction and return 200 on concurrent duplicate-key (the other worker is processing). Both the event row and side effects commit together; a rollback un-inserts the event row, enabling correct retry. See `reference.md` for the full code example.

## Permanent vs Transient Failure Partition

Stripe retries 5xx responses for ~72h. For unrecoverable states (unknown customer ID locally, missing subscription record), 5xx causes retry-storm noise with no eventual success.

Pattern: declare a `PermanentWebhookFailureException extends \RuntimeException`. Handlers throw it for unrecoverable cases. The controller catches it outside `DB::transaction`, returns 200 + logs the error. Other exceptions propagate to 500 for legitimate retries.

```php
// Controller-level catch (outside DB::transaction):
} catch (PermanentWebhookFailureException $e) {
    Log::error('Permanent webhook failure', ['event_id' => $event->id, 'error' => $e->getMessage()]);
    return response()->json(['status' => 'permanent_failure'], 200);
}
```

Stripe's 300-second timestamp tolerance window prevents forged events with stale timestamps; idempotency under legitimate Stripe retries (72-hour redelivery window) is handled by the DB UNIQUE constraint on `stripe_event_id`.

## Raw-Body Signature Verification

Stripe HMAC is computed over raw request bytes. `$request->getContent()` preserves them; `$request->all()` and `$request->json()` re-serialize and change byte order — HMAC verification fails silently. Add a class-level docblock warning so future developers don't "fix" this to a more idiomatic-looking form.

## Mockable Service Layer

When controllers are fat-style, introduce a thin service layer (`StripeBillingService`) as a single mock seam shared by the API controller and webhook controller. `$this->instance(StripeBillingService::class, $mock)` in tests keeps all 23+ tests off live Stripe without knowing SDK internals. Direct `Stripe\StripeClient` mocking breaks on SDK upgrades.

## 5-Event Subscription Lifecycle

`subscription.created` → tier=pro. `subscription.updated` → reflect status changes. `subscription.deleted` → tier=free (terminal, fires at period end). `invoice.payment_succeeded/failed` → log only (subscription events own tier state).

The DELETE endpoint sets `cancel_at_period_end=true`; `subscription.deleted` fires at actual termination. See `reference.md` for the full event table.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `firstOrCreate` as idempotency primitive | Wrap `firstOrCreate` + handler in `DB::transaction`; catch `QueryException` for concurrent duplicate-key |
| Returning 5xx for every handler exception | Partition: `PermanentWebhookFailureException` → 200 + log; transient exceptions → re-throw for 5xx retry |
| `$request->all()` or `$request->json()` for signature payload | `$request->getContent()` (raw bytes); add docblock warning against future "cleanup" |
| Mass-assigning identity-FK columns (`stripe_customer_id`) via `$fillable` | Set via direct property assignment in trusted service-layer paths only |
| Mocking the Stripe SDK client directly | Introduce a thin service layer; mock the service via `$this->instance()` |

See `reference.md` for idempotency table schema, retry policy details, and coverage driver detection pattern.
