# Cloud Run Examples

Complete implementation examples for Cloud Run patterns.

## Thread-Safe Singleton Caching

Cloud Run can have multiple concurrent requests initializing resources. Use asyncio.Lock with double-check pattern.

```python
import asyncio
from typing import Any

_engine_cache: dict[str, Any] = {}
_cache_lock = asyncio.Lock()

async def get_async_database_engine(database_url: str) -> Any:
    """Thread-safe singleton engine with double-check locking."""
    cache_key = database_url

    # Fast path: engine already exists (no lock needed for read)
    if cache_key in _engine_cache:
        return _engine_cache[cache_key]

    # Slow path: acquire lock and create engine if still missing
    async with _cache_lock:
        # Double-check after acquiring lock
        if cache_key not in _engine_cache:
            from sqlalchemy.ext.asyncio import create_async_engine
            _engine_cache[cache_key] = create_async_engine(
                database_url,
                pool_size=2,
                max_overflow=1,
                pool_recycle=300,
            )
        return _engine_cache[cache_key]
```

### Why Double-Check?

Without double-check locking:
1. Request A checks cache, finds empty
2. Request B checks cache, finds empty
3. Request A acquires lock, creates engine
4. Request B acquires lock, creates **duplicate** engine

With double-check:
1. Request A checks cache, finds empty
2. Request B checks cache, finds empty
3. Request A acquires lock, checks again (empty), creates engine
4. Request B acquires lock, checks again (**found!**), returns existing

---

## Complete Health Check Implementation

```python
import asyncio
import json

from fastapi import FastAPI, Response
from sqlalchemy import text
import structlog

from app.database import get_db_session, engine
from app.cache import redis_client

logger = structlog.get_logger()

@app.get("/health")
async def health():
    """Basic health check - always healthy if process running."""
    return {"status": "healthy"}

@app.get("/health/liveness")
async def liveness():
    """Liveness probe - is the process alive?

    Cloud Run uses this to determine if container should be restarted.
    NEVER check external dependencies here.
    """
    return Response(status_code=200)

@app.get("/health/readiness")
async def readiness():
    """Readiness probe - can the service handle traffic?

    Cloud Run uses this to determine if container should receive traffic.
    Check all critical dependencies with timeouts.
    """
    checks = {}
    all_healthy = True

    # Check database
    try:
        async with get_db_session() as db:
            await asyncio.wait_for(
                db.execute(text("SELECT 1")),
                timeout=5.0
            )
        checks["database"] = "healthy"
    except Exception as e:
        checks["database"] = f"unhealthy: {str(e)}"
        all_healthy = False

    # Check Redis
    try:
        await asyncio.wait_for(
            redis_client.ping(),
            timeout=5.0
        )
        checks["redis"] = "healthy"
    except Exception as e:
        checks["redis"] = f"unhealthy: {str(e)}"
        all_healthy = False

    if all_healthy:
        return {"status": "ready", "checks": checks}
    else:
        logger.error("Readiness check failed", checks=checks)
        return Response(
            content=json.dumps({"status": "not_ready", "checks": checks}),
            status_code=503,
            media_type="application/json"
        )
```

---

## Complete Lifespan with Graceful Shutdown

```python
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import text
import structlog

logger = structlog.get_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown."""

    # === STARTUP ===
    logger.info("Starting up...")

    # 1. Preload configs from GCS
    from app.config import load_configs_from_gcs
    app.state.configs = await load_configs_from_gcs()
    logger.info("Configs loaded", count=len(app.state.configs))

    # 2. Initialize database engine
    from app.database import create_engine
    app.state.engine = await create_engine()

    # 3. Warm database connection
    async with app.state.engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    logger.info("Database connection warmed")

    # 4. Initialize Redis
    from app.cache import create_redis_client
    app.state.redis = await create_redis_client()
    await app.state.redis.ping()
    logger.info("Redis connection established")

    logger.info("Startup complete, ready for traffic")

    yield  # Application runs here

    # === SHUTDOWN ===
    logger.info("Shutdown initiated")

    # 1. Close Redis
    await app.state.redis.close()
    logger.info("Redis closed")

    # 2. Dispose database engine
    await app.state.engine.dispose()
    logger.info("Database engine disposed")

    # 3. Clear configs
    app.state.configs.clear()

    logger.info("Shutdown complete")

app = FastAPI(lifespan=lifespan)
```

---

## Dockerfile for Optimized Cold Starts

```dockerfile
# syntax=docker/dockerfile:1

# ============================================
# Build stage - install dependencies
# ============================================
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --user --no-cache-dir -r requirements.txt

# ============================================
# Runtime stage - minimal image
# ============================================
FROM python:3.12-slim

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /root/.local /root/.local

# Copy application code
COPY src/ ./src/
COPY main.py .

# Set environment
ENV PATH=/root/.local/bin:$PATH
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Create non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Cloud Run uses PORT env var
EXPOSE 8080

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

---

## Cloud Run Service YAML

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: my-service
  labels:
    cloud.googleapis.com/location: us-central1
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "0"
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      serviceAccountName: my-service@project.iam.gserviceaccount.com
      containers:
        - image: gcr.io/project/my-service:latest
          ports:
            - containerPort: 8080
          resources:
            limits:
              cpu: "1"
              memory: "512Mi"
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: database-url
                  key: latest
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: redis-url
                  key: latest
          livenessProbe:
            httpGet:
              path: /health/liveness
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
          readinessProbe:
            httpGet:
              path: /health/readiness
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
            failureThreshold: 3
```

---

## VPC Egress Configuration Examples

### Private-Ranges-Only (Internal Services)

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: notification-service
  annotations:
    run.googleapis.com/launch-stage: GA
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/vpc-access-connector: projects/PROJECT/locations/REGION/connectors/CONNECTOR
        run.googleapis.com/vpc-access-egress: private-ranges-only
    spec:
      containers:
        - image: gcr.io/PROJECT/notification-service:latest
```

### All-Traffic (Gateway Services)

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: gateway-service
spec:
  template:
    metadata:
      annotations:
        run.googleapis.com/vpc-access-connector: projects/PROJECT/locations/REGION/connectors/CONNECTOR
        run.googleapis.com/vpc-access-egress: all-traffic
    spec:
      containers:
        - image: gcr.io/PROJECT/gateway-service:latest
```

**When to use which:**
- `private-ranges-only`: Services that only talk to Cloud SQL, Redis, and other internal GCP resources. Lower cost.
- `all-traffic`: Gateway services that call external APIs (OpenAI, Stripe, etc.). All egress routes through VPC.
