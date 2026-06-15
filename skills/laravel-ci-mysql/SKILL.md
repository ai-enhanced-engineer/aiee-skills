---
name: laravel-ci-mysql
description: Laravel CI patterns for GitHub Actions with MySQL service containers — env injection without .env bootstrap, multi-job lint + test split, justfile local-parity pattern, pre-commit framework integration, MySQL service health checks, and SQLite limitation triggers. Use when setting up GitHub Actions CI for a Laravel project, switching from SQLite to MySQL in CI, or achieving local-dev and CI command parity. Call for Laravel CI foundation, MySQL service container setup, or Pint --dirty lint gate bug.
updated: 2026-05-15
---

# Laravel CI with MySQL in GitHub Actions

Patterns for Laravel GitHub Actions CI that handles env injection, MySQL service containers, and local-dev parity.

## When to Use

- Setting up CI for a new Laravel project on GitHub Actions
- Switching from SQLite `:memory:` to MySQL when migrations use `dropForeign`
- Configuring env injection without `.env.example` bootstrap
- Achieving command parity between local `just` recipes and CI inlined commands
- Onboarding Pint as a CI lint gate on an existing codebase

## Why SQLite Fails on Some Projects

SQLite `:memory:` is the canonical Laravel test database but it cannot drop foreign keys. If any migration uses `$table->dropForeign(['foo_id'])` in its `up()` method (not just `down()`), the entire test suite crashes with `BadMethodCallException: SQLite doesn't support dropping foreign keys`.

The fix is a MySQL service container. The ~10s spin-up cost per CI run is acceptable and mirrors production.

## MySQL Service Container

Use `mysql:8` with health checks: `--health-cmd="mysqladmin ping -h localhost -u root -proot"`, `--health-interval=10s`, `--health-retries=10`. Add `extensions: pdo_mysql` to `shivammathur/setup-php` — not included by default. See `reference.md` for the full service block.

## Env Injection Without `.env` Bootstrap

Inject all configuration via the workflow `env:` block at job level (`APP_KEY`, `APP_ENV`, `DB_*`). No `cp .env.example .env`, no `php artisan key:generate`, no bootstrap dance. APP_KEY is a static base64 string — not a secret.

`phpunit.xml` `<server>` tags override workflow `env:` — if `phpunit.xml` has `DB_CONNECTION=sqlite`, remove the `<server>` directive or it will override your MySQL injection. See `reference.md` for the full job env block.

## Justfile Local Parity Pattern

CI inlines underlying tool commands directly (`vendor/bin/pint --test`) rather than calling `just lint`. The justfile recipe and the CI step call the same command — parity without a `just` install step on the runner. Developers run `just lint`; CI runs the same underlying call.

## `pint --dirty` Lint Gate Bug

`pint --test --dirty` checks working-tree changes vs HEAD. CI checkouts have no unstaged changes — diff is always empty, Pint exits 0, lint gate silently disabled. Use `pint --test` (full tree) in CI.

## Pre-Commit Integration

Use `language: system` + `pass_filenames: false` hooks for Pint, PHPStan, and PHPUnit. This runs each tool unconditionally against the full codebase, mirroring the CI job exactly. See `reference.md` for the full `.pre-commit-config.yaml` template.

## Justfile Recipes for FE-Handoff Workflow

During FE↔BE integration days, the BE engineer reaches for `serve`, `seed`, and `db-fresh` repeatedly. Standardize them in the justfile:

```just
serve port="8000":
    php artisan serve --port={{port}}

seed:
    php artisan db:seed --no-interaction

db-fresh:
    php artisan migrate:fresh --seed --no-interaction
```

`db-fresh` is destructive — drops all tables. Required when seeders change `firstOrCreate` keys (existing matching rows won't be updated to new `$values` on re-seed). Use `seed` alone when only adding new rows to an already-migrated DB.

These match the commands CI inlines directly, preserving the local-parity principle: developers run `just db-fresh`; CI runs `php artisan migrate:fresh --seed --no-interaction`.

## Bootstrap Exception

The commit adding pre-commit hooks cannot pass them if infrastructure (MySQL) is not yet running. Use `--no-verify` on the bootstrap commit and document the exception in the commit message.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `cp .env.example .env` in CI | Inject `APP_KEY`, `DB_*` via workflow `env:` block directly |
| `php artisan key:generate --env=testing` in CI | Static base64 APP_KEY in workflow env; no generate step needed |
| `pint --test --dirty` as the CI lint gate | `pint --test` (full tree); `--dirty` is always empty in CI checkouts |
| `assertJson([])` for empty-collection assertions | `$response->assertJsonCount(0)` — `assertJson([])` is a partial-match and passes against any JSON |
| Using SQLite when any migration has `dropForeign` in `up()` | MySQL service container; SQLite cannot drop foreign keys |
| PHPUnit `<server>` overriding workflow env | Remove `<server>` directive or prefer `<env>` (respects precedence differently) |

See `reference.md` for the multi-job workflow skeleton and PSR-4 case-sensitivity on Linux CI.

## Related

- `laravel-pint-patterns` — Pint mode semantics (`--test` vs `--dirty`, `php_unit_method_casing`, two-pass idempotency) underlying the lint gate here
- `github-actions-cicd` — platform-neutral GHA workflow syntax (reusable workflows, matrix) this skill specializes for Laravel
