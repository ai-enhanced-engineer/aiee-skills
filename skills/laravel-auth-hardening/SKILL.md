---
name: laravel-auth-hardening
description: Laravel authentication hardening patterns — anti-enumeration on auth-adjacent endpoints, role allowlist discipline, Sanctum token revocation test patterns, null-safe ownership comparisons in policies, and vulnerability-class thinking. Use when implementing or auditing Laravel auth, Sanctum logout, password reset, OTP resend, registration, or policy-based authorization. Call for Laravel security review, auth hardening, or closing enumeration and role-bypass audit findings.
updated: 2026-05-20
---

# Laravel Auth Hardening

Targeted hardening patterns for Laravel authentication and authorization surfaces. Specializes `laravel-modern-patterns` on the security axis.

## When to Use

- Closing audit findings on auth-adjacent endpoints (forgot-password, OTP resend, register)
- Implementing Sanctum logout or TTL expiry tests that actually exercise revocation
- Writing policy ownership comparisons on dual-key (UUID/integer) models
- Locking down role assignment to prevent unauthorized privilege escalation
- Treating a vulnerability as a class across all endpoints, not just the flagged one

## Anti-Enumeration Pattern

Auth-adjacent endpoints that condition their response on email existence leak the existence of registered accounts. Returning distinct status codes (200 vs 404) on `forgotPassword`, `resendOtp`, `register` OTP failure paths all share this shape.

Pattern: return 200 with a generic message regardless of whether the email exists. Call the side-effect service (e.g., send email, create OTP) only when the user is found — the caller never observes the branch.

Timing parity is also required — a DB lookup for an existing user takes longer than an early-return, leaking existence via latency. See `reference.md` for the unconditional-dispatch mitigation.

When an audit names ONE endpoint with an enumeration vulnerability, grep all controllers for the pattern and fix the class. The `resendOtp` and `register` OTP failure paths were live alongside a flagged `forgotPassword` in practice because only the flagged endpoint was patched.

## Role Allowlist Discipline

Role values accepted from public-facing request bodies are a privilege-escalation surface. Admin roles in public-facing validation rules open a privilege-escalation path — they belong in seeders, internal provisioning paths, or migrations.

Validation rules close the endpoint surface; if `role` remains in `$fillable`, any `fill()`/`update()` call elsewhere still writes it. Remove `role` from `$fillable` or route all role writes through a named setter (`User::assignRole()`). See `reference.md` for the pattern.

When an audit closes one endpoint's role-write vulnerability, grep all controllers for `'role' =>` validation rules and `$request->role` writes. Login, mobile-login, register, and complete-signup endpoints often share the same pattern across the same codebase.

## Sanctum Revocation Test Pattern

`actingAs($user, 'sanctum')` injects a `TransientToken`, not an Eloquent `PersonalAccessToken`. The production revocation guard (`instanceof Model`) is never exercised — logout tests pass regardless of whether revocation works.

A genuine revocation test POSTs to `/login`, captures the specific token's `id`, POSTs to `/logout`, then asserts `assertDatabaseMissing('personal_access_tokens', ['id' => $tokenId])`. Row-count delta passes a broken implementation that deletes all tokens. The 401 assertion requires `forgetGuards()` first — the auth guard caches the user from login and masks revocation otherwise. TTL expiry tests need the same flush.

See `reference.md` for the full annotated test stub.

## Null-Safe Ownership Comparisons

Policies that compare user identity to a relation's field should use null-safe navigation so a missing or unloaded relation returns false rather than throwing:

```php
// Returns false on null property relation — no auth bypass via missing relation
return $user->uuid === $order->item?->owner_id;
```

The `?->` operator returns `null` on a null relation, and `null === uuid` evaluates to false. Without it, accessing a field on a null relation throws, and error handlers may produce unexpected HTTP responses.

## Vulnerability-Class Thinking

When an audit flags ONE instance of a pattern (role-write, enumeration, policy hole), the correct scope is every endpoint that shares the shape — not just the named one. Grep-driven class closure prevents the "closed the finding, left the class open" outcome.

**Auth seam catalog for role-aware redirects**: a role-based post-auth redirect added at one entry point (e.g. login) is incomplete until every token-issuing seam applies the same logic. Typical seams: email login, OTP→login, complete-signup (Google OAuth callback), social-success client handler, password reset. A layout guard partially masks misses (flash + redirect), but reviewers catch them. See `reference.md` for the seam catalog checklist.

## Key References

- `laravel-modern-patterns` — broad Sanctum + Eloquent + policy coverage
- `unit-test-standards` — general test anti-patterns including false-positive guards

See `reference.md` for the orphaned-route detection pattern and `php artisan policy:list` version-gap note.
