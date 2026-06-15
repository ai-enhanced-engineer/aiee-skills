# Laravel Auth Hardening — Reference

## Anti-Enumeration Timing Parity

A uniform response body (200 + generic message) eliminates the response-body side-channel but leaves the timing side-channel open. A DB lookup for an existing user takes measurably longer than an early-return for a non-existent one — an attacker can distinguish the two paths by timing responses.

**Unconditional dispatch pattern**: dispatch the side-effect job regardless of whether the user exists. The job implementation short-circuits when no user is found:

```php
// Controller: always dispatch — timing is uniform
SendPasswordResetEmail::dispatch($request->email);
return response()->json(['message' => 'If an account exists, a reset email was sent.']);

// Job: no-op when user not found
public function handle(): void
{
    $user = User::where('email', $this->email)->first();
    if (! $user) {
        return; // no-op — job queued, controller timing already uniform
    }
    // ... send the email
}
```

A fixed minimum delay (`sleep(random_int(100, 200) / 1000)` ms of jitter) is an alternative when unconditional dispatch is impractical, but introduces artificial latency on all requests. Unconditional dispatch is preferred.

## Role Mass-Assignment Guard

Even after closing role-write in validation rules, `role` in `$fillable` keeps the surface open for `fill()`/`update()` calls elsewhere in the codebase:

```php
// Unsafe: role is writable via any fill()/update() call
protected $fillable = ['name', 'email', 'password', 'role'];

// Safe: remove role from fillable; write only through a named setter
protected $fillable = ['name', 'email', 'password'];

public function assignRole(string $role): void
{
    // Role validation lives here, not scattered across controllers
    abort_unless(in_array($role, ['user', 'admin'], true), 422, 'Invalid role.');
    $this->role = $role;
    $this->save();
}
```

A named setter centralises role-validation logic and makes every write site visible in a single grep (`User::assignRole`).

## Orphaned Route Detection

Controller methods can accumulate without corresponding route registrations. A method handling a deep-link callback (`completeSignup` handling `app://complete-signup`) may compile and be advertised in mobile flow docs while `routes/api.php` has no matching `Route::post(...)` registration.

Detection pattern: after any controller method change, grep routes files for the method name:

```bash
grep -n 'completeSignup\|complete-signup' routes/api.php routes/web.php
```

Running this during triage Phase 2 (codebase delta) caught an orphaned `AuthController::completeSignup` that would have produced "code-complete but unreachable" outcomes without the grep.

## `php artisan policy:list` Version Gap

Laravel 10 does not ship `php artisan policy:list`. To inspect the registered policy map:

```bash
php artisan tinker --execute="dd(Gate::policies())"
```

This dumps the `AuthServiceProvider::$policies` array including all registered model-policy bindings and abilities.

## Dual-Key Models — FK Verification Before Comparison

When a model exposes both an integer PK (`id`) and a UUID column (`uuid`), different relation FKs may reference different columns. Before writing a policy comparison, verify the FK target:

1. Read the migration: check whether the FK column is `unsignedBigInteger` (→ `id`) or `string`/`uuid` (→ `uuid`)
2. Read the model's `belongsTo` third argument: `belongsTo(User::class, 'member_user_id', 'id')` confirms integer PK linkage

Reflexively "fixing" a UUID vs integer comparison inconsistency without this step risks introducing a regression. Asymmetry in a dual-key model is frequently intentional.

## Password Reset Table Reuse

Laravel's default `password_resets` migration (`2014_10_12_100000_create_password_resets_table.php`) remains in place for most projects. The canonical password-reset flow reuses `email`, `token`, `created_at` columns:

- Token stored as `Hash::make($rawToken)`
- Validated via `Hash::check`
- Expiry from `config('auth.passwords.users.expire')` (default 60 minutes)

No custom table is required unless expiry policy or multi-tenancy demands it.

## Sanctum Revocation — Correct Assertion Pattern

Count-delta assertions (`$countBefore - 1`) pass a broken `deleteAccessTokens()` implementation that deletes all tokens for the user rather than only the presented token. A count change is observed either way — the assertion provides no safety signal.

The precise assertion captures the specific token's ID at login, then asserts it is absent after logout:

```php
// Capture the token ID at login time
$loginResponse = $this->postJson('/login', $credentials);
$tokenId = PersonalAccessToken::where('tokenable_id', $user->id)
    ->latest()
    ->value('id');

// Log out using that token
$this->withHeader('Authorization', "Bearer {$loginResponse->json('access_token')}")
    ->postJson('/logout');

// Assert the specific token row is gone — not just that the count changed
$this->assertDatabaseMissing('personal_access_tokens', ['id' => $tokenId]);
```

"Count-delta passes a logout that nukes all user sessions even when single-token revocation is broken" — the test passes, but in production a user logging out on one device logs out everywhere.

## Auth Seam Catalog — Role-Aware Redirect Completeness

Before declaring any role-dependent post-auth behavior (redirect, flag write, session scope) complete, enumerate every token-issuing seam in the codebase. Typical seams in a Laravel + frontend SPA stack:

| Seam | Laravel side | Frontend side |
|------|-------------|---------------|
| Email login | `AuthController::login` | `LoginForm` submit handler |
| OTP → login | `AuthController::verifyOtp` | `OtpVerifyClient` |
| Google OAuth callback | `AuthController::handleGoogleBackendResponse` | — |
| Social success handler | — | `SocialSuccessClient` |
| Registration complete-signup | `AuthController::completeSignup` | `CompleteSignupClient` |
| Password reset | `AuthController::resetPassword` | `ResetPasswordForm` |

A layout-level guard (e.g. middleware redirect in a route group) partially masks missed seams — the user sees a flash and is corrected on next render — but the gap remains a correctness failure. PR reviewers reliably catch it.

**Seam-catalog discipline**: when adding a role-aware behavior at any one seam, grep the codebase for every other token-issuing call site and apply the same behavior. Treat it as a class closure, not a single-point change. In one a prior ticket cycle, two seams (`handleGoogleBackendResponse`, `SocialSuccessClient`) were missed in Cycle 1 and caught in PR review — a full seam catalog before implementation eliminates the rework.

## Cycle Scoping for Auth Hardening PRs

When cycle N produces CONDITIONAL PASS with specific warnings, scope cycle N+1 to those exact warnings — no broader refactor, no opportunistic cleanup. Explicitly list out-of-scope items in the cycle prompt so reviewers don't surface the same deferred items as new blockers.

The pattern "fold parallel vulnerabilities into the same PR rather than spawn follow-up tickets" applies when:
- The parallel instance is discovered during triage or cycle-1 review
- The additional scope fits within the original time estimate (or the estimate is revised upward with PM awareness)
- The result is a single coherent auth-hardening PR rather than fragmented partial fixes
