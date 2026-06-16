---
name: laravel-modern-patterns
description: Laravel 8+ architecture patterns including Repository + Action pattern, Sanctum API authentication, Eloquent relationships, and service layer design. Use for Laravel backend development, API design, authentication implementation, or database modeling.
kb-sources:
  - wiki/software-engineering/laravel-patterns
updated: 2026-06-15
---

# Laravel 8+ Modern Architecture Patterns

Clean architecture patterns for Laravel 8+ applications using Repository + Action pattern, Sanctum authentication, and Eloquent best practices.

## Architecture Layers

```
Controller → FormRequest (validation)
         → Action (business logic)
         → Repository (data access)
         → Model (Eloquent)
         → API Resource (transformation)
```

## Pattern Decision Matrix

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Action** | Single-purpose operation | SaveItemAction, ProcessPaymentAction |
| **Service** | Multi-step orchestration | OrderService (create order + email + log) |
| **Job** | Async/queued work | SendEmailJob, ProcessVideoJob |
| **Repository** | Data access abstraction | UserRepository, ShapeRepository |

## Socialite OAuth + Sanctum Tokens

`->stateless()` skips session/CSRF for API clients; `->plainTextToken` returns the storable string; revoke via `currentAccessToken()->delete()`. See **reference.md → "Sanctum SPA Authentication"**.

## Status Event Pattern

Append-only `_status_events` table for audits; enum column on the parent for simple toggles. Query current status via `latestOfMany()` (Laravel 8.42+); record transitions via an Action class. Index on `(parent_id, id DESC)`.

## Domain-Organized Controllers

Group by business domain with `Route::prefix()`. Use `->shallow()` to avoid 4-ID URLs; `->scoped()` (Laravel 9+) for automatic parent-child binding.

## FormRequest as Security Boundary

`->validated()` strips unallowed keys (mass-assignment safety); `authorize()` returning `true` is correct when upstream middleware already enforces auth. See **reference.md → "FormRequest as Security Boundary"** for the skeleton with nested-array rules (`reviews.*.author_user_id`).

## Mass-Assignment Tripwire

`Model::create([...])`, `firstOrCreate`, and seed-time mass-assignment silently drop keys not in `$fillable` with no warning. Post-create direct assignment (`$m->field = $val; $m->save()`) is the safe path for privilege-gated fields. See **reference.md → "Mass-Assignment Tripwire"**.

## Variadic Role Middleware

`role:Admin,Owner` syntax via `string ...$roles`, strict `in_array(..., true)` to prevent type-juggling, ordered after `auth:sanctum` so unauthenticated requests get 401 before role returns 403. See **reference.md → "Variadic Role Middleware"**.

## Webhook Handler Discipline

Verify signature against raw body (`getContent()`); wrap idempotency-row creation and the handler in one transaction; partition errors into permanent (200) vs transient (500). See **reference.md → "Webhook Idempotency: Atomic Pattern"**.

## Common Pitfalls

See **reference.md → "Common Pitfalls"** for the full anti-pattern table (30+ entries covering N+1, mass-assignment, enum migrations, polymorphic controllers, Larastan findings, Pint idempotency, and more).

## Eloquent Relationships Quick Guide

`hasMany`/`belongsTo` for one-to-many; `belongsToMany` for pivot tables; `hasManyThrough` for two-hop relations. Always eager-load with `with(['relation'])` to prevent N+1. See **reference.md → "Eloquent Relationships"** for strategies including nested eager loading, `withCount`, and soft deletes.

## Constant-Owned Validation-Rule Accessor

Expose `static rule(): In` on enum/const classes alongside `values()` — callers write `MyConst::rule()` instead of `Rule::in(MyConst::values())`, eliminating the `Illuminate\Validation\Rule` import from every FormRequest and preventing N-way allow-list duplication across Store/Update/Import requests. See **reference.md → "Constant-Owned Validation-Rule Accessor"** for the skeleton.

## Wildcard `field.*` Rules Are Per-Present-Element

`field.*` rules fire only for elements present in the payload — `sometimes` on the `.*` key is a no-op. Array-level PATCH semantics (`sometimes`, `nullable`) belong on the `field` key; element-level rules need no presence guard. See **reference.md → "Wildcard `field.*` Rules"** for the disambiguation table and the common reviewer false-positive this closes.

## JSON Column: Lock Write and Filter Vocabulary

Diverging stored vs. queried strings make `whereJsonContains` silently match nothing. Lock both the write FormRequest rules and the query filter to one validated constant so stored and filtered values are byte-identical. See **reference.md → "Free-Form Storage Behind an Exact-Match JSON Filter"**.

## PHP 8.1+ Spread on Associative Arrays

`...$assocArray` throws "unknown named parameters" on PHP 8.1+ when the array has string keys. Wrap with `array_values()` before spreading or replace with an explicit `foreach` + `array_push`. See **reference.md → "PHP 8.1+ Spread on Associative Arrays"**.

See **reference.md** for detailed patterns, configuration, and testing strategies.
See **examples.md** for complete CRUD implementations and real code examples.
