# Laravel Sail Docker Examples

Example docker-compose.yml for a Laravel app and customization patterns for local development.

## Example Production Configuration

Complete docker-compose.yml from the example project.

**File:** `docker-compose.yml`

```yaml
# For more information: https://laravel.com/docs/sail
version: '3'
services:
    laravel.test:
        build:
            context: ./docker/8.0
            dockerfile: Dockerfile
            args:
                WWWGROUP: '${WWWGROUP}'
        image: sail-8.0/app
        ports:
            - '${APP_PORT:-80}:80'
        environment:
            WWWUSER: '${WWWUSER}'
            LARAVEL_SAIL: 1
        volumes:
            - '.:/var/www/html'
        networks:
            - sail
        depends_on:
            - mysql
            - redis
            - selenium
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
    meilisearch:
        image: 'getmeili/meilisearch:latest'
        ports:
            - '${FORWARD_MEILISEARCH_PORT:-7700}:7700'
        volumes:
            - 'sailmeilisearch:/data.ms'
        networks:
            - sail
    mailhog:
        image: 'mailhog/mailhog:latest'
        ports:
            - '${FORWARD_MAILHOG_PORT:-1025}:1025'
            - '${FORWARD_MAILHOG_DASHBOARD_PORT:-8025}:8025'
        networks:
            - sail
    selenium:
       image: 'selenium/standalone-chrome'
       volumes:
            - '/dev/shm:/dev/shm'
       networks:
           - sail
networks:
    sail:
        driver: bridge
volumes:
    sailmysql:
        driver: local
    sailredis:
        driver: local
    sailmeilisearch:
        driver: local
```

---

## Custom Service Addition

### Add PostgreSQL

Example of adding PostgreSQL database service alongside MySQL.

**docker-compose.yml:**

```yaml
services:
    pgsql:
        image: 'postgres:14'
        ports:
            - '${FORWARD_DB_PORT:-5432}:5432'
        environment:
            PGPASSWORD: '${DB_PASSWORD:-secret}'
            POSTGRES_DB: '${DB_DATABASE}'
            POSTGRES_USER: '${DB_USERNAME}'
            POSTGRES_PASSWORD: '${DB_PASSWORD:-secret}'
        volumes:
            - 'sailpgsql:/var/lib/postgresql/data'
        networks:
            - sail
        healthcheck:
            test: ["CMD", "pg_isready", "-q", "-d", "${DB_DATABASE}", "-U", "${DB_USERNAME}"]

volumes:
    sailpgsql:
        driver: local
```

**Update laravel.test depends_on:**

```yaml
laravel.test:
    depends_on:
        - mysql
        - pgsql
        - redis
```

---

## Custom Dockerfile Patterns

### Add PHP Extensions

Example of extending the Sail PHP container with additional extensions and system packages.

**File:** `docker/8.0/Dockerfile`

```dockerfile
FROM sail-8.0/app

USER root

# Install additional PHP extensions
RUN apt-get update && apt-get install -y \
    libpq-dev \
    && docker-php-ext-install pdo_pgsql pgsql

# Install FFmpeg for video processing
RUN apt-get install -y ffmpeg

# Cleanup
RUN apt-get clean && rm -rf /var/lib/apt/lists/*

USER sail
```

**Rebuild container after changes:**

```bash
# Rebuild without cache to ensure changes apply
sail build --no-cache

# Start services
sail up -d
```

**Common extensions to add:**

| Extension | Use Case | Install Command |
|-----------|----------|-----------------|
| `pdo_pgsql` | PostgreSQL | `docker-php-ext-install pdo_pgsql pgsql` |
| `gd` | Image manipulation | `docker-php-ext-install gd` |
| `imagick` | Advanced image processing | `apt-get install -y libmagickwand-dev && pecl install imagick` |
| `redis` | Redis PHP extension | `pecl install redis` |
| `xdebug` | Debugging | `pecl install xdebug` |

---

## Debugging Workflows

### Service Logs and Restart

**Check Service Logs:**

```bash
# View all service logs
sail logs

# View specific service logs
sail logs mysql
sail logs redis

# Follow logs in real-time
sail logs -f

# View last 50 lines
sail logs --tail=50
```

**Restart Services:**

```bash
# Restart all services
sail restart

# Restart specific service
sail restart mysql
sail restart redis
```

**Rebuild Containers:**

```bash
# Rebuild without cache (when Dockerfile changes)
sail build --no-cache

# Start fresh (WARNING: Deletes volumes and all data!)
sail down -v
sail up -d
```

**Access Container Shell:**

```bash
# Access app container as sail user
sail shell

# Access app container as root
sail root-shell

# Access MySQL container
docker exec -it app_mysql_1 bash

# Access Redis CLI
sail redis
```

### Xdebug Setup

Enable Xdebug for step-through debugging in PHPStorm or VS Code.

**Configuration in docker-compose.yml:**

```yaml
laravel.test:
    environment:
        SAIL_XDEBUG_MODE: '${SAIL_XDEBUG_MODE:-off}'
        SAIL_XDEBUG_CONFIG: '${SAIL_XDEBUG_CONFIG:-client_host=host.docker.internal}'
```

**Enable Xdebug in .env:**

```bash
# Development mode with debugging enabled
SAIL_XDEBUG_MODE=develop,debug

# Coverage mode for tests
SAIL_XDEBUG_MODE=coverage
```

**Start Sail with Xdebug:**

```bash
# Start services (reads SAIL_XDEBUG_MODE from .env)
sail up -d
```

**PHPStorm Configuration:**

1. Go to Settings → PHP → Servers
2. Add new server:
   - Name: `laravel-sail`
   - Host: `localhost`
   - Port: `80`
   - Debugger: Xdebug
   - Use path mappings: Yes
   - Map project root to `/var/www/html`
3. Start listening for PHP Debug Connections
4. Set breakpoints and trigger request

**VS Code Configuration:**

```json
// .vscode/launch.json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Listen for Xdebug",
            "type": "php",
            "request": "launch",
            "port": 9003,
            "pathMappings": {
                "/var/www/html": "${workspaceFolder}"
            }
        }
    ]
}
```

### Multi-Service Debugging

**Check which services are running:**

```bash
docker-compose ps
```

**Test database connectivity:**

```bash
# From app container
sail shell
php artisan tinker
DB::connection()->getPdo();

# Direct MySQL test
sail mysql
SHOW DATABASES;
```

**Test Redis connectivity:**

```bash
sail redis
ping
```

**Network troubleshooting:**

```bash
# Inspect Sail network
docker network inspect app_sail

# Check service DNS resolution from app container
sail shell
ping mysql
ping redis
```

**Port conflict resolution:**

```bash
# Check what's using port 3306
lsof -i :3306

# Change MySQL port in .env
FORWARD_DB_PORT=3307

# Restart Sail
sail down
sail up -d
```

---

## Before/After: Basic to Production-Ready

### Before: Minimal Setup

```yaml
# Simple docker-compose.yml
services:
    laravel.test:
        image: sail-8.0/app
        volumes:
            - '.:/var/www/html'
    mysql:
        image: 'mysql:8.0'
```

### After: Production-Ready

```yaml
# Optimized docker-compose.yml
services:
    laravel.test:
        build:
            context: ./docker/8.0
            dockerfile: Dockerfile
        volumes:
            - '.:/var/www/html:delegated'  # macOS performance
        depends_on:
            mysql:
                condition: service_healthy  # Wait for MySQL
            redis:
                condition: service_healthy  # Wait for Redis
        environment:
            SAIL_XDEBUG_MODE: '${SAIL_XDEBUG_MODE:-off}'
    mysql:
        image: 'mysql:8.0'
        healthcheck:
            test: ["CMD", "mysqladmin", "ping"]
            retries: 3
            timeout: 5s
        volumes:
            - 'sailmysql:/var/lib/mysql'
    redis:
        image: 'redis:alpine'
        healthcheck:
            test: ["CMD", "redis-cli", "ping"]
            retries: 3
            timeout: 5s
```

**Key improvements:**

1. **Custom Dockerfile** - Add extensions and system packages
2. **Delegated volumes** - Faster file sync on macOS
3. **Health checks** - Ensure services are ready before app starts
4. **Service dependencies** - Proper startup order
5. **Xdebug configuration** - Enable debugging when needed
6. **Persistent volumes** - Data survives container restarts
