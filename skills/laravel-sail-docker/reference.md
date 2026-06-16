# Laravel Sail Docker Reference

Complete reference for Laravel Sail Docker development environment configuration and troubleshooting.

## Installation & Setup

### Initial Installation

```bash
# Install Sail
composer require laravel/sail --dev

# Publish docker-compose.yml
php artisan sail:install

# Select services (MySQL, Redis, Meilisearch, Mailhog, etc.)
```

### Shell Alias (Recommended)

**bash (~/.bashrc):**

```bash
alias sail='./vendor/bin/sail'
```

**zsh (~/.zshrc):**

```bash
alias sail='./vendor/bin/sail'
```

**Apply:**

```bash
source ~/.bashrc  # or ~/.zshrc
sail up
```

---

## Service Configuration

### MySQL 8.0

```yaml
mysql:
    image: 'mysql:8.0'
    ports:
        - '${FORWARD_DB_PORT:-3306}:3306'
    environment:
        MYSQL_ROOT_PASSWORD: '${DB_PASSWORD}'
        MYSQL_DATABASE: '${DB_DATABASE}'
        MYSQL_USER: '${DB_USERNAME}'
        MYSQL_PASSWORD: '${DB_PASSWORD}'
        MYSQL_ALLOW_EMPTY_PASSWORD: 'yes'
    volumes:
        - 'sailmysql:/var/lib/mysql'
    networks:
        - sail
    healthcheck:
        test: ["CMD", "mysqladmin", "ping", "-p${DB_PASSWORD}"]
        retries: 3
        timeout: 5s
```

**Connect from host:**

```bash
mysql -h 127.0.0.1 -P 3306 -u sail -p
```

### Redis

```yaml
redis:
    image: 'redis:alpine'
    ports:
        - '${FORWARD_REDIS_PORT:-6379}:6379'
    volumes:
        - 'sailredis:/data'
    networks:
        - sail
    healthcheck:
        test: ["CMD", "redis-cli", "ping"]
        retries: 3
        timeout: 5s
```

**Connect from host:**

```bash
redis-cli -h 127.0.0.1 -p 6379
```

### Mailhog (Email Testing)

```yaml
mailhog:
    image: 'mailhog/mailhog:latest'
    ports:
        - '${FORWARD_MAILHOG_PORT:-1025}:1025'      # SMTP
        - '${FORWARD_MAILHOG_DASHBOARD_PORT:-8025}:8025'  # UI
    networks:
        - sail
```

**Access UI:**
```
http://localhost:8025
```

**Laravel .env:**

```bash
MAIL_MAILER=smtp
MAIL_HOST=mailhog
MAIL_PORT=1025
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
```

### Meilisearch

```yaml
meilisearch:
    image: 'getmeili/meilisearch:latest'
    ports:
        - '${FORWARD_MEILISEARCH_PORT:-7700}:7700'
    volumes:
        - 'sailmeilisearch:/data.ms'
    networks:
        - sail
    environment:
        MEILI_NO_ANALYTICS: 'true'
```

### Selenium (Browser Testing)

```yaml
selenium:
    image: 'selenium/standalone-chrome'
    volumes:
        - '/dev/shm:/dev/shm'
    networks:
        - sail
```

**Laravel Dusk configuration:**

```php
// tests/DuskTestCase.php
return RemoteWebDriver::create(
    'http://selenium:4444/wd/hub',
    DesiredCapabilities::chrome()
);
```

---

## Custom Dockerfile

### Basic Customization

**docker/8.0/Dockerfile:**

```dockerfile
FROM sail-8.0/app

USER root

# Install system packages
RUN apt-get update && apt-get install -y \
    ffmpeg \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Install PHP extensions
RUN docker-php-ext-install \
    pdo_pgsql \
    pgsql

# Install PECL extensions
RUN pecl install redis \
    && docker-php-ext-enable redis

# Cleanup
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

USER sail
```

### Rebuild After Changes

```bash
sail build --no-cache
sail up -d
```

---

## Volume Performance (macOS)

### Problem

Docker Desktop for Mac uses osxfs for file sharing, which has poor performance for projects with many files.

### Solution 1: Delegated Mounts

```yaml
laravel.test:
    volumes:
        - '.:/var/www/html:delegated'
```

**Performance Impact:**
- Default: ~1000ms page load
- Delegated: ~300ms page load

### Solution 2: Docker Sync (Alternative)

```bash
gem install docker-sync
```

**docker-sync.yml:**

```yaml
version: "2"
syncs:
    app-sync:
        src: './'
        sync_strategy: 'native_osx'
```

---

## Health Checks

### Custom Health Check

```yaml
laravel.test:
    healthcheck:
        test: ["CMD", "php", "artisan", "db:show"]
        retries: 3
        timeout: 5s
        interval: 10s
        start_period: 30s
```

### Depend on Healthy Services

```yaml
laravel.test:
    depends_on:
        mysql:
            condition: service_healthy
        redis:
            condition: service_healthy
```

---

## Network Configuration

### Custom Network

```yaml
networks:
    sail:
        driver: bridge
        ipam:
            config:
                - subnet: 172.20.0.0/16
```

### External Network

```yaml
networks:
    sail:
        external: true
        name: my-shared-network
```

---

## Environment Variables

### Sail-Specific Variables

```bash
# User/Group ID (match host)
WWWUSER=1000
WWWGROUP=1000

# Laravel Sail flag
LARAVEL_SAIL=1

# Xdebug
SAIL_XDEBUG_MODE=develop,debug
SAIL_XDEBUG_CONFIG=client_host=host.docker.internal
```

### Port Forwarding

```bash
APP_PORT=80
FORWARD_DB_PORT=3306
FORWARD_REDIS_PORT=6379
FORWARD_MAILHOG_PORT=1025
FORWARD_MAILHOG_DASHBOARD_PORT=8025
FORWARD_MEILISEARCH_PORT=7700
```

---

## Troubleshooting

### Port Conflicts

**Problem:**
```
Error: port is already allocated
```

**Solution:**

```bash
# Check what's using the port
lsof -i :3306

# Option 1: Stop local MySQL
brew services stop mysql

# Option 2: Change port in .env
FORWARD_DB_PORT=33060
```

### Permission Issues

**Problem:**
```
Permission denied: /var/www/html/storage
```

**Solution:**

```bash
# Set correct ownership
sail artisan storage:link
sail shell
chmod -R 775 storage bootstrap/cache
```

### Slow Performance (macOS)

**Problem:** Slow page loads, file operations

**Solution:**

```yaml
# Use delegated volumes
laravel.test:
    volumes:
        - '.:/var/www/html:delegated'
```

### Service Won't Start

**Problem:** MySQL/Redis won't start

**Solution:**

```bash
# Check logs
sail logs mysql

# Remove corrupted volumes
sail down -v  # WARNING: Deletes data!
sail up

# Or remove specific volume
docker volume rm app_sailmysql
```

### Database Connection Refused

**Problem:**
```
SQLSTATE[HY000] [2002] Connection refused
```

**Solution:**

```bash
# Check MySQL is running
sail ps

# Check health
docker inspect app_mysql_1 --format='{{json .State.Health}}'

# Wait for health check
sail up -d && sleep 10 && sail artisan migrate
```

---

## Advanced Patterns

### Multi-Stage Build

```dockerfile
FROM node:16 AS frontend

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY resources/ ./resources/
RUN npm run production

FROM sail-8.0/app

COPY --from=frontend /app/public /var/www/html/public
```

### Custom Entrypoint

**docker/8.0/entrypoint.sh:**

```bash
#!/usr/bin/env bash

# Wait for MySQL
until nc -z -v -w30 mysql 3306
do
  echo "Waiting for MySQL..."
  sleep 1
done

# Run migrations
php artisan migrate --force

# Start PHP-FPM
exec "$@"
```

```yaml
laravel.test:
    entrypoint: ["/docker/8.0/entrypoint.sh"]
```

---

## GitHub Actions MySQL Service Container

Use when any migration uses `$table->dropForeign()` in `up()` — SQLite `:memory:` cannot drop
foreign keys. MySQL service mirrors prod and costs ~10s spin-up per CI run.

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
      - '3306:3306'

steps:
  - uses: shivammathur/setup-php@v2
    with:
      php-version: '8.2'
      extensions: pdo_mysql   # required explicitly — not default
  - run: php artisan test --env=testing
```

**Workflow `env:` block** (no .env.example needed):

```yaml
env:
  DB_CONNECTION: mysql
  DB_HOST: 127.0.0.1
  DB_PORT: 3306
  DB_DATABASE: testing
  DB_USERNAME: root
  DB_PASSWORD: root
  APP_KEY: base64:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=
```

**Decision rule**: start with SQLite `:memory:` (faster, zero setup). Switch to MySQL service if
any migration uses `dropForeign()` in `up()` — or if prod is MySQL and migration fidelity matters.

---

## Official Documentation

- [Laravel Sail Documentation](https://laravel.com/docs/8.x/sail)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Docker Health Checks](https://docs.docker.com/engine/reference/builder/#healthcheck)
