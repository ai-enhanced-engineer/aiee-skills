---
name: laravel-sail-docker
description: Laravel Docker development and production environment. Sail for local dev (MySQL, Redis, Mailhog), production PHP-FPM images, multi-stage builds, container permissions. Use for local dev setup, production Dockerfiles, or deployment containerization.
kb-sources:
  - wiki/software-engineering/laravel-docker
updated: 2026-05-10
---

# Laravel Sail Docker Development

Laravel Sail provides Docker-powered local development environment with MySQL, Redis, Mailhog, and other services pre-configured.

## When to Use

- Setting up Laravel local development environment
- Configuring Docker services (MySQL, Redis, etc.)
- Troubleshooting Docker/Sail issues
- Adding custom services to docker-compose
- Optimizing volume performance (macOS)
- Running Artisan commands in containers

## Quick Start

```bash
# Create alias for convenience
alias sail='./vendor/bin/sail'

# Start environment
sail up -d
```

## Common Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `sail up` | Start all services | `sail up -d` (detached) |
| `sail down` | Stop all services | `sail down` |
| `sail artisan` | Run Artisan commands | `sail artisan migrate` |
| `sail composer` | Run Composer | `sail composer install` |
| `sail npm` | Run NPM | `sail npm run dev` |
| `sail test` | Run PHPUnit tests | `sail test --filter UserTest` |
| `sail shell` | Access app container | `sail shell` |
| `sail mysql` | Access MySQL CLI | `sail mysql` |
| `sail redis` | Access Redis CLI | `sail redis` |

## Docker Services

**Default services:**
- Laravel app (`http://localhost`)
- MySQL 8.0 (`localhost:3306`)
- Redis (`localhost:6379`)
- Mailhog UI (`http://localhost:8025`)
- Meilisearch (`http://localhost:7700`)
- Selenium (browser testing)

## Volume Performance (macOS)

Use `delegated` consistency mode for 3-5x faster file access:

```yaml
volumes:
    - '.:/var/www/html:delegated'
```

## Production PHP-FPM Image

For production (not Sail), use `php:8.2-fpm` with Laravel extensions (`opcache`, `zip`, `mbstring`, `bcmath`, `pcntl` + database driver: `pdo_pgsql` or `pdo_mysql`). Key production settings:

- **OPcache**: `validate_timestamps=0` (eliminates stat calls — safe in immutable containers)
- **FPM pool**: `pm = dynamic`, `pm.max_requests = 500` (guards memory leaks), size `max_children` as `container_memory_mb / avg_process_mb`
- **Non-root**: Remapping `www-data` to UID 1000 avoids permission mismatches on Linux hosts (default UID 33 on Debian, 82 on Alpine)

## Multi-Stage Builds

Three-stage separation: (1) `composer:2` for `composer install --no-dev`, (2) `node:20-alpine` for `npm ci && npm run build`, (3) `php:8.2-fpm-alpine` (lightweight base) copies only `/vendor` and `public/build`. Copy lock files before source code for layer caching (saves 30-90s per CI build).

## Container Storage Permissions

Build-time `COPY --chown=www-data:www-data` works when storage is not volume-mounted. For named volumes or bind mounts, use an entrypoint script: `chown -R www-data:www-data storage bootstrap/cache && exec "$@"`. The `exec "$@"` is required for correct PID 1 signal handling.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Port conflict (3306, 6379) | Stop local MySQL/Redis or change port in `.env` (service already running on host) |
| Permission denied | `sail shell` then `chown -R sail:sail /var/www/html` (file ownership mismatch) |
| Slow performance (macOS) | Use `:delegated` consistency mode (default volume sync mode) |
| Container not starting | Check `docker ps -a` and stop conflicting containers (port already in use) |
| Database connection refused | Wait for health checks or use `depends_on` with `condition: service_healthy` (service not ready) |
| Running PHP-FPM as root in production | Use `USER www-data` after `chown` — exposes host if container escapes |
| `validate_timestamps=1` in production | Set to 0 — code never changes in immutable containers |
| `chmod -R 777` for storage permissions | Use 775 — 777 grants write to all users including attackers |
| `chown` in build layer on volume-mounted path | Work discarded at runtime — use entrypoint script instead |
| Composer/Node in production image | Use multi-stage builds — build tools expand attack surface |

## GitHub Actions: MySQL Service Container

Use a `mysql:8` service container for Laravel CI when any migration calls `dropForeign()` inside `up()`. SQLite `:memory:` does not support dropping foreign keys and throws `BadMethodCallException` on `migrate:fresh`. The full health-check incantation:

```yaml
services:
  mysql:
    image: mysql:8
    env:
      MYSQL_ROOT_PASSWORD: root
      MYSQL_DATABASE: testing
    options: >-
      --health-cmd="mysqladmin ping -h localhost -u root -proot"
      --health-interval=10s
      --health-retries=10
    ports:
      - 3306:3306
```

`setup-php` step must include `extensions: pdo_mysql` explicitly. Inject `DB_CONNECTION: mysql`, `DB_HOST: 127.0.0.1` via job-level `env:`. Check for `dropForeign` in migration `up()` methods before defaulting to SQLite.

See **reference.md** for installation steps, health checks, environment variables, Xdebug configuration.
See **examples.md** for custom services (PostgreSQL), Dockerfile patterns, troubleshooting workflows, example project configuration.
