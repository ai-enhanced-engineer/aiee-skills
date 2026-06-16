# Stripe Webhooks in Laravel — Reference

## Atomic Idempotency Code Example

```php
// In the webhook controller:
try {
    DB::transaction(function () use ($event) {
        StripeProcessedEvent::firstOrCreate(['stripe_event_id' => $event->id]);
        $this->dispatch($event); // handler runs inside transaction
    });
} catch (QueryException $e) {
    // Concurrent duplicate-key: another worker is processing; return 200
    // SQLSTATE 23000 = integrity constraint violation (driver-agnostic: MySQL, Postgres, SQLite).
    // Note: the previous form `str_contains($e->getMessage(), 'Duplicate entry')` is MySQL-only.
    if ($e->getCode() === '23000') {
        return response()->json(['status' => 'duplicate'], 200);
    }
    throw $e;
}
```

## 5-Event Subscription Lifecycle (Full Table)

| Event | Action |
|---|---|
| `customer.subscription.created` | Set `tier=pro` (initial subscribe) |
| `customer.subscription.updated` | Reflect status changes (mid-period upgrades/downgrades, `cancel_at_period_end` reconciliation) |
| `customer.subscription.deleted` | Set `tier=free` (terminal — fires at period end after `cancel_at_period_end=true`) |
| `invoice.payment_succeeded` | Log only — subscription events are the authoritative tier source |
| `invoice.payment_failed` | Log only — subscription events own tier state |

The DELETE endpoint sets `cancel_at_period_end=true`; the subscription stays active until period end. The `subscription.deleted` event fires at actual termination.

## Idempotency Table Schema

```sql
stripe_processed_events:
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE   -- DB UNIQUE is the idempotency boundary
  event_type      VARCHAR(255) NULL
  processed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  created_at      TIMESTAMP NULL
  updated_at      TIMESTAMP NULL
```

`stripe_event_id VARCHAR(255)` is overkill for Stripe's `evt_<24chars>` format but matches Laravel's column default. Keep `NOT NULL` — multiple NULLs are allowed by both MySQL and SQLite UNIQUE indexes, so a nullable column does not provide uniqueness guarantees.

`processed_at` is distinct from `created_at` (from `timestamps()`): keep both for semantic clarity. A future `reprocessed_at` column won't muddle the timeline.

## Stripe Retry Policy Details

- **5xx responses**: Stripe retries with exponential backoff for approximately 72 hours
- **2xx responses**: Terminates retries — the event is considered successfully delivered
- **4xx responses** (signature rejection, malformed): Terminates retries with no further delivery — Stripe treats 4xx as "client error, stop trying"

This asymmetry explains why `PermanentWebhookFailureException` returns 200 rather than 4xx — returning 4xx would suppress retries for an event that Stripe considers its fault to re-deliver.

Stripe's default 300-second tolerance window rejects events older than that before controller logic runs — no app-level replay defense is required for most use cases.

## Customer ID Format and Logging

Stripe customer IDs follow the format `cus_<24chars>`. They are pseudonymous and safe to log for ops correlation. Raw event payloads contain card fingerprints and email addresses — never log full event JSON.

## Coverage Driver Detection

When running `php artisan test --coverage`, CI must have PCOV or Xdebug installed. Local developer machines frequently lack these. Detect driver presence gracefully:

```bash
# In justfile or Makefile:
test-coverage:
    if php -m | grep -qiE "^(pcov|xdebug)$"; then \
        php artisan test --coverage; \
    else \
        echo "No coverage driver found; running without coverage"; \
        php artisan test; \
    fi
```

Enforce coverage thresholds only in CI (where the workflow installs PCOV via `shivammathur/setup-php` with `coverage: pcov`). This prevents local test commands failing for developers who haven't installed PCOV.

## Optimistic Local Persistence + Webhook Reconciliation

When the backend mirrors Stripe state locally (e.g., `memberships.cancel_at_period_end`), write the flag locally on the user-facing API path (e.g., the `DELETE /subscriptions` endpoint) before the webhook arrives. This makes the next `GET /me` reflect the new state without webhook timing dependency.

The `customer.subscription.updated` webhook then authoritatively overwrites the local value with the canonical Stripe data. This self-heals if there's ever a discrepancy (e.g., a concurrent uncancel request).

When persisting state derived from a Stripe response, read it from the returned object:

```php
// Self-correcting: reads from Stripe's response
$membership->cancel_at_period_end = (bool) $subscription->cancel_at_period_end;

// Fragile: hardcoded — breaks silently if an "undo cancel" code path is added
$membership->cancel_at_period_end = true;
```

## Triage Phase 2 for Billing Tickets

Stripe billing tickets frequently have hidden dependencies invisible from the ticket text:
- Orphaned NOT NULL columns blocking model `create()` calls (schema drift from prior work)
- Missing mirror methods (e.g., `User::downgradeToFree()` without a matching `upgradeToPro()`)

Running a codebase-validation phase (opus model reading actual files) before implementation catches these as pre-flight items rather than mid-implementation blockers. Budget ~30min for the validation phase on billing tickets.
