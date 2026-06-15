# Cloud Run Reference

Detailed configuration patterns for Cloud Run deployments.

## Pydantic Settings — Pre-Deployment Injection

Pydantic validates environment variables at container startup (import time). Placeholder values in `HttpUrl` or `AnyUrl` fields crash the container immediately.

```bash
#!/bin/bash
# deploy.sh - Inject real values BEFORE deployment

# 1. Deploy dependency service first
gcloud run services replace notification-service.yaml
SERVICE_URL=$(gcloud run services describe notification-service --format='value(status.url)')

# 2. Inject real URL into YAML before deployment
sed "s|PLACEHOLDER_SET_BY_DEPLOY_SCRIPT|${SERVICE_URL}|" gateway.yaml > /tmp/gateway-processed.yaml

# 3. Deploy with real values already in place
gcloud run services replace /tmp/gateway-processed.yaml
```

**Pattern for self-referential WS_URL:**
- Deploy with placeholder first (WS_URL often optional at startup, won't crash)
- Capture deployed URL
- Update via `gcloud run services update --set-env-vars WS_URL=<url>`
- Triggers new revision but avoids validation failure

---

## Docker Multi-Stage Build (uv)

3-stage Dockerfile with uv package manager + BuildKit caching:

```dockerfile
ARG PYTHON_VERSION=3.12

# Stage 1: Fetch uv executable
FROM ghcr.io/astral-sh/uv:latest AS uv_installer

# Stage 2: Builder - install dependencies
FROM python:${PYTHON_VERSION}-slim AS builder
COPY --from=uv_installer /uv /bin/

RUN apt-get update && apt-get install -y gcc libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

COPY src ./src
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen

# Stage 3: Runtime - minimal image
FROM python:${PYTHON_VERSION}-slim AS runtime

RUN apt-get update && apt-get install -y libpq5 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 appuser
WORKDIR /app

COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --from=builder --chown=appuser:appuser /app/src /app/src

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
USER appuser

CMD ["sh", "-c", "uvicorn src.main:app --host 0.0.0.0 --port ${PORT}"]
```

**GitHub Actions caching:**
```yaml
- name: Build and push
  uses: docker/build-push-action@v5
  with:
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

---

## Connection Pool Configuration

### Database (Cloud SQL)

Cloud Run requires conservative pool settings due to instance scaling; exceeding the database connection limit causes intermittent pool-exhaustion errors under load.

```python
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    database_url,
    pool_size=2,              # Conservative for serverless (2-5)
    max_overflow=1,           # Minimal burst capacity
    pool_timeout=30,          # Fail fast if exhausted
    pool_recycle=300,         # 5 min (Cloud SQL recommendation)
    pool_reset_on_return="rollback",  # Clear RLS context
)
```

### Why These Settings?

| Setting | Value | Rationale |
|---------|-------|-----------|
| `pool_size=2` | 2-5 | Cloud Run scales instances, not connections per instance |
| `max_overflow=1` | 1-2 | Prevents connection explosion during bursts |
| `pool_recycle=300` | 5 min | Cloud SQL closes idle connections after 10 min |
| `pool_reset_on_return` | "rollback" | Clears multi-tenant RLS context between requests |

---

## Redis Configuration (Memorystore)

```python
import redis.asyncio as redis

redis_client = redis.from_url(
    redis_url,
    socket_connect_timeout=10,   # Connection timeout (fail fast)
    socket_timeout=60,           # 60s for cold starts + AI responses
    retry_on_timeout=True,       # Retry transient failures
    max_connections=20,          # Per-instance limit
)
```

### Timeout Rationale

| Timeout | Value | Why |
|---------|-------|-----|
| `socket_connect_timeout` | 10s | Fail fast on connection issues |
| `socket_timeout` | 60s | Cloud Run cold starts (10-30s) + AI response time (30-60s) |

---

## Graceful Shutdown

Cloud Run sends SIGTERM with 10s grace period before SIGKILL.

```python
import signal
import asyncio
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown - triggered by SIGTERM
    logger.info("Shutdown initiated")

    # Close connections gracefully
    await engine.dispose()
    await redis_client.close()

    logger.info("Shutdown complete")

app = FastAPI(lifespan=lifespan)
```

### Shutdown Sequence

1. SIGTERM received
2. Cloud Run stops sending new requests
3. Existing requests have 10s to complete
4. Lifespan `yield` returns, cleanup runs
5. If not done in 10s, SIGKILL sent

---

## Cold Start Optimization

### Image Size

| Base Image | Size | Cold Start Impact |
|------------|------|-------------------|
| `python:3.12` | ~1GB | 15-30s |
| `python:3.12-slim` | ~150MB | 5-10s |
| `python:3.12-alpine` | ~50MB | 3-5s (compatibility issues) |

### Multi-Stage Build

```dockerfile
# Build stage
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# Runtime stage
FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
ENV PATH=/root/.local/bin:$PATH
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
```

### Startup Preloading

Load configs and warm connections during startup, not first request:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Preload configs
    app.state.configs = await load_configs_from_gcs()

    # Warm database connection
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))

    # Warm Redis connection
    await redis_client.ping()

    logger.info("Startup complete, ready for traffic")
    yield
```

---

## Concurrency Settings

### Choosing Concurrency

| Service Type | Recommended | Rationale |
|--------------|-------------|-----------|
| CPU-bound | 1-4 | Limited by CPU |
| I/O-bound (DB/API) | 80-100 | Limited by connections |
| Mixed | 10-20 | Balance |

### Terraform Configuration

```hcl
resource "google_cloud_run_v2_service" "service" {
  template {
    containers {
      image = var.image_url

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0  # Scale to zero
      max_instance_count = 10
    }
  }
}
```

---

## VPC Connectivity Patterns

### VPC Connector vs Direct VPC Egress

| Method | Latency | Cost | Use Case |
|--------|---------|------|----------|
| **VPC Connector** | <1ms | $0.10/GB + instance cost | Most workloads, stable |
| **Direct VPC Egress** | <1ms | Free egress | Cost optimization, high volume |

### VPC Connector Configuration

```hcl
resource "google_vpc_access_connector" "main" {
  name          = "${var.project}-${var.environment}-connector"
  region        = var.region
  network       = var.vpc_network
  ip_cidr_range = "10.8.0.0/28"

  min_instances = 2
  max_instances = var.environment == "production" ? 10 : 3
  machine_type  = "e2-micro"  # Cheapest option
}
```

### Direct VPC Egress (Preview)

```hcl
resource "google_cloud_run_v2_service" "api" {
  template {
    vpc_access {
      # Direct VPC egress - no connector needed
      network_interfaces {
        network    = var.vpc_network
        subnetwork = var.vpc_subnet
      }
      egress = "PRIVATE_RANGES_ONLY"
    }
  }
}
```

### When to Use Each

| Scenario | Recommendation | Rationale |
|----------|----------------|-----------|
| Cloud SQL connection | VPC Connector | Stable, well-tested |
| Redis (Memorystore) | VPC Connector | Private IP required |
| High-volume egress | Direct VPC Egress | No data transfer cost |
| Cost-sensitive staging | Direct VPC Egress | Eliminate connector cost |

### VPC Egress Mode Decision Tree

The egress **mode** controls which traffic routes through VPC (separate from the **method** choice above).

```
Does this service call other internal GCP services?
  ├─ Yes → vpc-access-egress: all-traffic
  │        (routes ALL traffic through VPC, including service-to-service)
  └─ No → vpc-access-egress: private-ranges-only
           (routes only RFC 1918 traffic through VPC, saves egress cost)
```

| Mode | Use When | Trade-off |
|------|----------|-----------|
| `all-traffic` | Service calls other Cloud Run services, Pub/Sub, etc. | Higher egress cost, but internal routing works |
| `private-ranges-only` | Service only serves external HTTP traffic | Lower cost, but breaks internal service calls |


### Cloud SQL Connection Pattern

```python
# Connection via VPC Connector (private IP)
DATABASE_URL = "postgresql+asyncpg://user:pass@10.100.0.5:5432/db"

# No Cloud SQL Proxy needed when using VPC Connector
# Direct connection to private IP
```

---

## Traffic Management

### Gradual Rollout

Deploy new revisions with traffic splitting:

```bash
# Deploy new revision with 0% traffic
gcloud run deploy SERVICE --image=NEW_IMAGE --no-traffic

# Route 10% to new revision
gcloud run services update-traffic SERVICE \
  --to-revisions=NEW_REVISION=10,OLD_REVISION=90

# Gradually increase
gcloud run services update-traffic SERVICE \
  --to-revisions=NEW_REVISION=50,OLD_REVISION=50

# Full rollout
gcloud run services update-traffic SERVICE \
  --to-latest
```

### Terraform Traffic Configuration

```hcl
resource "google_cloud_run_v2_service" "api" {
  template {
    # ... container config
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  # For gradual rollout:
  # traffic {
  #   type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
  #   revision = "api-00001"
  #   percent  = 90
  # }
  # traffic {
  #   type     = "TRAFFIC_TARGET_ALLOCATION_TYPE_REVISION"
  #   revision = "api-00002"
  #   percent  = 10
  # }
}
```

### Session Affinity for WebSocket

WebSocket connections require session affinity to maintain connection to same instance:

```hcl
resource "google_cloud_run_v2_service" "websocket" {
  template {
    session_affinity = true  # Sticky sessions

    containers {
      # ... container config
    }

    scaling {
      min_instance_count = 1  # Keep warm for WebSocket
      max_instance_count = 10
    }
  }
}
```

**Important:** Session affinity is best-effort, not guaranteed. Design WebSocket handlers to be stateless.

## Service Deployment Verification

### Polling Pattern for Cloud Run Service Readiness

**Problem**: `gcloud run services wait` does NOT exist as a valid command (common mistake).

**Solution**: Poll service status with `gcloud run services describe`:

```bash
# Correct polling pattern
SERVICE_NAME="my-service"
REGION="us-central1"
TIMEOUT=300  # 5 minutes
INTERVAL=10   # Check every 10 seconds
ELAPSED=0

echo "Waiting for $SERVICE_NAME to be ready..."

while [ $ELAPSED -lt $TIMEOUT ]; do
  # Get the service status condition
  STATUS=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --format='value(status.conditions[0].status)' \
    2>/dev/null || echo "Unknown")

  # Check if service is ready
  if [ "$STATUS" = "True" ]; then
    echo "✅ Service is ready!"
    gcloud run services describe $SERVICE_NAME --region=$REGION
    exit 0
  fi

  # Service not ready yet
  echo "⏳ Service not ready (status: $STATUS), waiting... (${ELAPSED}s elapsed)"
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

# Timeout reached
echo "❌ Timeout waiting for service to be ready after ${TIMEOUT}s"
gcloud run services describe $SERVICE_NAME --region=$REGION || true
exit 1
```

**Common mistake to avoid**:
```bash
# ❌ This command does NOT exist!
gcloud run services wait $SERVICE_NAME --region=$REGION
```

### Internal Ingress Health Checks

**Problem**: Services with `ingress: internal` cannot be health-checked externally (curl from GitHub Actions fails).

**Solution**: Rely on Cloud Run's internal health verification:

```yaml
# DON'T - Fails for internal ingress
- name: Health check
  run: curl $SERVICE_URL/health

# DO - Cloud Run verifies internally
- name: Wait for service ready
  run: |
    gcloud run services describe $SERVICE_NAME \
      --region=$REGION \
      --format='value(status.conditions[0].status)'
```

**Key insight**: Cloud Run performs internal health checks automatically. External verification is only possible for services with `ingress: all`.

---

## CPU Throttling Configuration

### `--no-cpu-throttling` Implications

| Setting | CPU During Request | CPU Between Requests | Cost |
|---------|-------------------|---------------------|------|
| Default (throttled) | Full | Throttled to near-zero | Per-request |
| `--no-cpu-throttling` | Full | Full | Per-instance-second |

### When to Disable Throttling

| Use Case | Throttling | Rationale |
|----------|------------|-----------|
| HTTP APIs | Default (on) | CPU only needed during requests |
| WebSocket servers | **Off** | Need CPU for keep-alive, heartbeats |
| Background workers | **Off** | Need CPU for polling, processing |
| SSE streaming | **Off** | Need CPU for stream maintenance |

### Terraform Configuration

```hcl
resource "google_cloud_run_v2_service" "websocket" {
  template {
    containers {
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle = false  # Disable CPU throttling
      }
    }
  }
}
```

### Cost Comparison

```
With throttling (HTTP API, 1000 req/hour, 100ms avg):
- CPU seconds: 100 seconds/hour
- Cost: ~$0.00002/hour

Without throttling (WebSocket, always-on):
- CPU seconds: 3600 seconds/hour
- Cost: ~$0.00072/hour (36x more)
```

**Recommendation:** Only disable throttling when required for long-lived connections.

---

## Request Timeout Configuration

### Service-Level Timeout

```yaml
# service.yaml
spec:
  template:
    spec:
      timeoutSeconds: 300  # 5 minutes (default: 60s, max: 3600s)
```

### Client-Side Coordination

If gateway calls assistant service:

| Service | Timeout | Rationale |
|---------|---------|-----------|
| Gateway | 120s | User-facing, reasonable wait |
| Assistant | 300s | AI processing can be slow |

Ensure gateway timeout < assistant timeout to avoid orphaned requests.

---

## Troubleshooting

### Common Deployment Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "Container failed to start" | Port mismatch | Use `PORT` env var |
| "Container exceeded memory" | Memory leak or undersized | Increase memory limit |
| "Revision not ready" | Health check failing | Check `/health/readiness` |
| "Connection refused" | Service not listening on 0.0.0.0 | Bind to `0.0.0.0`, not `127.0.0.1` |

### Debugging Container Startup

```bash
# View container logs
gcloud run services logs read SERVICE_NAME --region=REGION

# Test container locally
docker run -p 8080:8080 -e PORT=8080 IMAGE_NAME

# Check revision status
gcloud run revisions describe REVISION --region=REGION
```

### Memory Profiling

If hitting memory limits:

```python
import tracemalloc

tracemalloc.start()
# ... run code ...
snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')[:10]
for stat in top_stats:
    print(stat)
```
