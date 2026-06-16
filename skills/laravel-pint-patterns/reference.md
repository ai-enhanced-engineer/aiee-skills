# Laravel Pint Patterns — Reference

## PHP Tooling Map

Laravel's tooling parallels Python's ruff/mypy/pytest/pyupgrade split:

| Concern | Tool | Mode |
|---|---|---|
| Format + lint | Pint (`./vendor/bin/pint`) | `pint` = autofix; `pint --test` = check-only |
| Type checking | Larastan (`./vendor/bin/phpstan`) | `phpstan analyse` |
| Tests | `php artisan test` | PHPUnit wrapper with better output |
| Refactor | Rector | `rector process` = autofix; `rector process --dry-run` = preview |

Pint differs from Python formatters (ruff format vs ruff check) in that format and lint are the same command — mode is determined solely by `--test`.

## Larastan Level Guidance

PHPStan alone produces noise on Laravel codebases — it doesn't understand Eloquent magic, facades, or the service container. Larastan extends it with Laravel-specific stubs.

| Level | Guidance |
|---|---|
| 5 | Start here for legacy code. Catches real bugs (type mismatches, undefined variables, method calls on null) without drowning in untyped facade noise |
| 6 | Add when type coverage improves |
| 7+ | Ratchet up after the codebase has meaningful type annotations |

Installing Larastan: `composer require --dev nunomaduro/larastan:^2`

## PHP 8.4+ Namespaced PDO Constants

PDO namespaced subclasses (`PDO\Mysql`, `PDO\Pgsql`) were introduced in PHP 8.4. Code written on a PHP 8.5 dev machine that references `PDO\Mysql::ATTR_SSL_CA` fails on PHP 8.2 CI with a `package:discover` error.

The legacy `PDO::MYSQL_ATTR_SSL_CA` constant exists since PHP 5.1 and works on all versions. Watch for `// Use the new PHP 8.5 constant` style comments in legacy code — they are often added by a developer on a newer PHP version without awareness of the declared project minimum.

Version-safe pattern using `defined()` + `constant()`:

```php
// Works on PHP 8.2+ (declared minimum) through PHP 8.5
$sslAttr = defined('Pdo\\Mysql::ATTR_SSL_CA')
    ? constant('Pdo\\Mysql::ATTR_SSL_CA')
    : constant('PDO::MYSQL_ATTR_SSL_CA');
```

## Deprecation Notices and HTML Injection

Using the legacy non-namespaced PDO constants (e.g., `PDO::MYSQL_ATTR_SSL_CA`) on PHP 8.4+ emits deprecation notices. With `display_errors=On` (any PHP version) those notices render as HTML (`<br /><b>Deprecated</b>...`) before any output, injecting into API responses and breaking browser-side JSON parsing. Fix the constant usage rather than suppressing `display_errors`.

`-d display_errors=Off` does not propagate through `php artisan serve` — the server spawns child processes for each request that read their own ini config. Fix the deprecated constant at the source rather than suppressing display.

## Seeder Mirroring Pattern

When seeding records that the application also creates at runtime, mirror the controller's `create()` or `updateOrCreate()` shape exactly — same column set, same defaults, same plan-code literals. Schema drift between the seeder and the controller surfaces at query time (NOT NULL violations, type mismatches) rather than at test time.

Always verify FK target type from the migration before writing seeder code:
- `unsignedBigInteger` FK → reference `$user->id`
- `uuid`/`string` FK → reference `$user->uuid`

Tickets and inline code examples drift from the schema; the migration is the truth.

## Defense-in-Depth Production Guard for Seeders

Preview and test data seeders should include a production environment guard:

```php
public function run(): void
{
    abort_if(app()->environment('production'), 403, 'Preview seeders cannot run in production');
    // ...
}
```

This guard costs one line per seeder and prevents accidental test data creation even when invoked directly via `php artisan db:seed --class=PreviewSeeder`.
