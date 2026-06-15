---
name: laravel-pint-patterns
description: Laravel Pint code style patterns — autofix vs check-only modes, php_unit_method_casing rule behavior, fully_qualified_strict_types import rewriting, PHPStan constant() indirection for version-conditional constants, and two-pass idempotency. Use when setting up or running Pint in a Laravel project, encountering pre-commit hook failures, or navigating PHPStan analysis on PHP version-conditional class constants. Call for Pint pre-commit setup, PHP 8.4 deprecation constant workarounds, or PHPStan level 5 clean CI.
updated: 2026-05-10
---

# Laravel Pint Patterns

Code style automation patterns for Laravel Pint, including mode semantics, auto-rewrite rules, and PHPStan integration.

## When to Use

- Setting up Pint in a new Laravel project
- Resolving pre-commit hook failures from Pint rewrites
- Writing PHPUnit test method names that survive Pint
- Working around PHP version-conditional constants under PHPStan
- Adopting a lint gate on a codebase with existing style debt

## Pint Mode Semantics

Laravel Pint wraps PHP-CS-Fixer with two modes:

| Command | Behavior |
|---|---|
| `./vendor/bin/pint` | Autofix — rewrites files in place |
| `./vendor/bin/pint --test` | Check-only — reports violations, no writes, non-zero exit on failure |
| `./vendor/bin/pint <file>` | Autofix a single file |

The pre-commit hook typically runs `pint --test`. When the hook fails, run `pint` (no flag) locally to autofix, then re-stage.

## Two-Pass Idempotency

Pint is not guaranteed to be idempotent in a single pass — some rules' fixes expose other rules' violations. After running `vendor/bin/pint`, run `vendor/bin/pint --test` immediately. If it reports failures, run `pint` again until the state stabilizes. Without this, CI can fail after a single local pass that appeared clean.

Same applies to PHP-CS-Fixer, Rector, and other AST-rewriting formatters.

## `php_unit_method_casing` Rule

When `pint.json` includes `'@PHPUnit75Migration:risky'`, Pint enforces snake_case PHPUnit method names. camelCase embedded in test description text (referencing SDK method names like `handleSubscriptionUpdated`) is rewritten automatically. Writing snake_case from the start avoids the pre-commit-fail → autofix → restage round-trip. Confirm this rule is in the project's `pint.json` before assuming it applies.

## `fully_qualified_strict_types` Rule

When enabled, Pint hoists `\Vendor\Class::CONST` FQN literals to `use` imports. Run `./vendor/bin/pint <file>` after any manual edit introducing FQN literals to apply the rewrite before committing. See `reference.md` for a before/after example.

## PHPStan `constant()` Indirection

Version-conditional class constants produce PHPStan errors when a class that doesn't exist on the CI PHP version appears in a ternary:

```php
// PHPStan cannot resolve Pdo\Mysql::ATTR_SSL_CA on PHP 8.2 CI:
$attr = defined('Pdo\\Mysql::ATTR_SSL_CA')
    ? \Pdo\Mysql::ATTR_SSL_CA           // PHPStan fails here on PHP 8.2
    : PDO::MYSQL_ATTR_SSL_CA;
```

Route both branches through `constant()` so PHPStan sees them as dynamic strings:

```php
$attr = defined('Pdo\\Mysql::ATTR_SSL_CA')
    ? constant('Pdo\\Mysql::ATTR_SSL_CA')   // PHPStan: dynamic string, passes
    : constant('PDO::MYSQL_ATTR_SSL_CA');
```

This avoids adding `ignoreErrors` entries to `phpstan.neon` for cases that are correct at runtime.

## Adopting a Lint Gate on an Existing Codebase

Run `vendor/bin/pint` once across the entire codebase and commit as a standalone `style:` commit before turning on `pint --test` as a CI gate. Future PRs keep only their own changes Pint-clean, rather than a first PR with 1400 legacy-formatting lines mixed into the diff.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `pint --test --dirty` in CI | `--dirty` checks only working-tree changes; CI checkouts have no unstaged changes — exit 0 every time, lint gate silently disabled. Use `pint --test` (full tree) |
| Bypassing Pint with `--no-verify` | Run `pint` locally to autofix, then re-stage |
| Writing camelCase PHPUnit method names in Pint+PHPUnit75Migration projects | Write snake_case from the start |
| Adding `ignoreErrors` to phpstan.neon for version-conditional constants | Use `constant('FQCN::NAME')` indirection instead |
| Assuming Pint is idempotent in one pass | Run `pint --test` after `pint` to confirm idempotency |

See `reference.md` for PHP tooling map (format/lint/type-check/test/refactor) and Larastan level guidance.

## Related

- `laravel-ci-mysql` — CI integration context where the `pint --test --dirty` lint-gate-silently-disabled bug surfaces
- `github-actions-cicd` — PHP/Laravel multi-job CI workflow shape that wraps Pint as the lint step
