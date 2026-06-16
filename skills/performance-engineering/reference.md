# Performance Engineering - Reference

Detailed profiling, load testing, and optimization patterns.

## Profiling Tools

### CPU Profiling

#### py-spy (Recommended for Production)

```bash
# Install
pip install py-spy

# Profile running process (no code changes needed)
py-spy record -o profile.svg --pid $(pgrep -f "uvicorn")

# Top-like view
py-spy top --pid $(pgrep -f "uvicorn")

# Profile specific duration
py-spy record -o profile.svg --duration 60 --pid <PID>

# Sample rate (default 100)
py-spy record --rate 200 -o profile.svg --pid <PID>
```

**Interpreting Flamegraph:**
- Width = Time spent
- Tall stacks = Deep call chains
- Flat tops = Time spent in single function

#### cProfile (Development)

```python
import cProfile
import pstats
from pstats import SortKey

# Profile function
profiler = cProfile.Profile()
profiler.enable()
result = expensive_function()
profiler.disable()

# Print stats
stats = pstats.Stats(profiler)
stats.sort_stats(SortKey.CUMULATIVE)
stats.print_stats(20)  # Top 20
```

### Memory Profiling

#### memory_profiler (Line-by-Line)

```python
from memory_profiler import profile

@profile
def memory_intensive_function():
    data = []
    for i in range(100000):
        data.append({'id': i, 'value': 'x' * 1000})
    return data
```

```bash
python -m memory_profiler script.py
```

#### tracemalloc (Allocation Tracking)

```python
import tracemalloc

tracemalloc.start()

# ... code to profile ...

snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics('lineno')

print("Top 10 memory allocations:")
for stat in top_stats[:10]:
    print(stat)
```

#### objgraph (Object Reference Debugging)

```python
import objgraph

# Find memory leaks
objgraph.show_growth(limit=10)

# After some operations
objgraph.show_growth(limit=10)

# Show what's holding references
objgraph.show_backrefs(
    objgraph.by_type('MyClass')[0],
    filename='refs.png'
)
```

### Async Profiling

#### asyncio Debug Mode

```python
import asyncio
import logging

# Enable debug mode
asyncio.get_event_loop().set_debug(True)
logging.getLogger('asyncio').setLevel(logging.DEBUG)

# Slow callback warning threshold (default 0.1s)
asyncio.get_event_loop().slow_callback_duration = 0.05
```

#### Detecting Blocking Calls

```python
import asyncio
import time

def blocking_operation():
    time.sleep(1)  # This blocks!

async def bad_async():
    # This blocks the event loop
    blocking_operation()

async def good_async():
    # Run in thread pool
    await asyncio.to_thread(blocking_operation)
```

---

## Load Testing

### Locust Configuration

#### Basic Locustfile

```python
from locust import HttpUser, task, between, events
from locust.runners import MasterRunner
import logging

class WidgetUser(HttpUser):
    """Simulates a widget visitor."""

    wait_time = between(1, 3)
    client_id = "test_client_123"

    def on_start(self):
        """Initialize session on user start."""
        response = self.client.post(
            f"/api/v1/widget/{self.client_id}/init",
            json={},
            headers={"Origin": "https://test.example.com"}
        )
        if response.status_code == 200:
            self.session_id = response.json()["session_id"]
        else:
            logging.error(f"Init failed: {response.status_code}")

    @task(10)
    def send_message(self):
        """Send a chat message."""
        self.client.post(
            f"/api/v1/widget/{self.client_id}/chat",
            json={
                "message": "Hello, how can you help?",
                "session_id": self.session_id
            },
            headers={"Origin": "https://test.example.com"}
        )

    @task(1)
    def health_check(self):
        """Lightweight health check."""
        self.client.get("/health")
```

#### WebSocket Load Test

```python
from locust import User, task, between
import websocket
import json
import time

class WebSocketUser(User):
    """Test WebSocket connections."""

    wait_time = between(5, 10)

    def on_start(self):
        self.ws = websocket.create_connection(
            f"wss://api.example.com/ws/{self.client_id}",
            header={"Origin": "https://test.example.com"}
        )

    def on_stop(self):
        self.ws.close()

    @task
    def send_message(self):
        start = time.time()
        self.ws.send(json.dumps({
            "type": "message",
            "content": "Test message"
        }))
        response = self.ws.recv()
        elapsed = (time.time() - start) * 1000

        # Report to Locust
        events.request.fire(
            request_type="WebSocket",
            name="send_message",
            response_time=elapsed,
            response_length=len(response)
        )
```

### Load Test Execution

```bash
# Local development
locust -f locustfile.py --host=http://localhost:8000

# Headless mode for CI
locust -f locustfile.py \
    --headless \
    --users 100 \
    --spawn-rate 10 \
    --run-time 5m \
    --host=https://api.example.com \
    --csv=results

# Distributed mode
# Master:
locust -f locustfile.py --master

# Workers:
locust -f locustfile.py --worker --master-host=<master-ip>
```

### k6 Alternative

```javascript
// k6 script for comparison
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
    vus: 100,
    duration: '5m',
};

export default function () {
    const res = http.post('https://api.example.com/chat', {
        message: 'Hello',
        session_id: 'test123'
    });

    check(res, {
        'status is 200': (r) => r.status === 200,
        'response time < 500ms': (r) => r.timings.duration < 500,
    });

    sleep(1);
}
```

```bash
k6 run script.js
```

---

## Optimization Patterns

### Database Optimization

#### Query Analysis

```sql
-- Enable query statistics
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Find slow queries
SELECT
    calls,
    mean_exec_time,
    total_exec_time,
    query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Analyze query plan
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM messages
WHERE customer_id = 'xxx'
ORDER BY created_at DESC
LIMIT 100;
```

#### Index Optimization

```sql
-- Find missing indexes
SELECT
    schemaname,
    relname,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch
FROM pg_stat_user_tables
WHERE seq_scan > 1000
ORDER BY seq_tup_read DESC;

-- Create covering index
CREATE INDEX idx_messages_customer_created
ON messages (customer_id, created_at DESC)
INCLUDE (content, role);
```

### Connection Pooling

#### SQLAlchemy Pool Configuration

```python
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    pool_size=10,           # Base connections
    max_overflow=20,        # Additional under load
    pool_timeout=30,        # Wait for connection
    pool_recycle=1800,      # Recycle after 30 min
    pool_pre_ping=True,     # Check connection health
)
```

#### Redis Connection Pool

```python
import redis

pool = redis.ConnectionPool(
    host='localhost',
    port=6379,
    max_connections=50,
    socket_timeout=5,
    socket_connect_timeout=5,
    retry_on_timeout=True,
)

client = redis.Redis(connection_pool=pool)
```

### Caching Strategies

#### Redis Caching Pattern

```python
from functools import wraps
import json
import redis

redis_client = redis.Redis()

def cache(ttl: int = 300):
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            key = f"{func.__name__}:{hash(str(args) + str(kwargs))}"

            # Try cache
            cached = redis_client.get(key)
            if cached:
                return json.loads(cached)

            # Compute
            result = await func(*args, **kwargs)

            # Store
            redis_client.setex(key, ttl, json.dumps(result))
            return result
        return wrapper
    return decorator

@cache(ttl=60)
async def get_customer_config(customer_id: str) -> dict:
    """Expensive database lookup, cached for 60s."""
    ...
```

### Async Optimization

#### Concurrent HTTP Requests

```python
import httpx
import asyncio

async def fetch_all(urls: list[str]) -> list:
    """Fetch multiple URLs concurrently."""
    async with httpx.AsyncClient() as client:
        tasks = [client.get(url) for url in urls]
        responses = await asyncio.gather(*tasks)
        return [r.json() for r in responses]
```

#### Semaphore for Rate Limiting

```python
import asyncio

async def rate_limited_fetch(urls: list[str], max_concurrent: int = 10):
    """Limit concurrent requests."""
    semaphore = asyncio.Semaphore(max_concurrent)

    async def fetch_with_limit(url):
        async with semaphore:
            async with httpx.AsyncClient() as client:
                return await client.get(url)

    tasks = [fetch_with_limit(url) for url in urls]
    return await asyncio.gather(*tasks)
```

---

## Performance Monitoring

### SLO Definition

| Metric | P50 | P95 | P99 | Alert Threshold |
|--------|-----|-----|-----|-----------------|
| Widget init | 50ms | 200ms | 500ms | P95 > 500ms |
| Chat message | 100ms | 500ms | 2s | P95 > 1s |
| WebSocket connect | 50ms | 100ms | 200ms | P95 > 200ms |
| Dashboard API | 100ms | 300ms | 1s | P95 > 500ms |

### Structured Performance Logging

```python
import structlog
import time
from contextlib import contextmanager

logger = structlog.get_logger()

@contextmanager
def measure(operation: str, **context):
    """Context manager for timing operations."""
    start = time.perf_counter()
    try:
        yield
    finally:
        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "operation_complete",
            operation=operation,
            duration_ms=round(elapsed_ms, 2),
            **context
        )

# Usage
with measure("database_query", table="messages", customer_id=cid):
    results = await db.fetch_messages(cid)
```

### Cloud Monitoring Metrics

```python
from google.cloud import monitoring_v3
from google.protobuf import timestamp_pb2
import time

def record_metric(metric_name: str, value: float, labels: dict):
    """Send custom metric to Cloud Monitoring."""
    client = monitoring_v3.MetricServiceClient()
    project_name = f"projects/{PROJECT_ID}"

    series = monitoring_v3.TimeSeries()
    series.metric.type = f"custom.googleapis.com/{metric_name}"
    series.metric.labels.update(labels)

    now = time.time()
    point = monitoring_v3.Point()
    point.value.double_value = value
    point.interval.end_time.seconds = int(now)
    series.points = [point]

    client.create_time_series(name=project_name, time_series=[series])

# Usage
record_metric(
    "api/response_time",
    value=150.5,
    labels={"endpoint": "/chat", "status": "200"}
)
```

---

## Scaling Patterns

### Horizontal Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| CPU > 70% | 5 min | Add instance |
| Memory > 80% | 5 min | Add instance |
| Request queue > 100 | 1 min | Add instance |
| Response P95 > 1s | 5 min | Investigate + scale |

### Cloud Run Scaling Configuration

```yaml
# service.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: gateway-service
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/minScale: "1"
        autoscaling.knative.dev/maxScale: "100"
        autoscaling.knative.dev/target: "80"  # 80% CPU
    spec:
      containerConcurrency: 80
      timeoutSeconds: 300
      containers:
        - resources:
            limits:
              cpu: "2"
              memory: "2Gi"
```

---

## Startup Warmup for HTTP Connection Pools

### Problem

Lazy connection pool initialization causes first-request latency penalty (500-1000ms) due to:
- TCP connection establishment
- SSL/TLS handshake
- HTTP/2 connection setup

### Solution

Warm up connection pools during application startup with a lightweight API call.

### Full Implementation

```python
from time import perf_counter
from contextlib import asynccontextmanager
from typing import AsyncGenerator

async def warmup_openai_connection_pool(client: AsyncOpenAI) -> None:
    """Establish HTTP connections during startup to eliminate first-request penalty.

    Uses a lightweight API call that requires authentication, forcing
    the httpx client to:
    - Establish TCP connections
    - Complete SSL/TLS handshake
    - Initialize HTTP/2 connection pool
    """
    start = perf_counter()

    try:
        # Lightweight call that requires authentication (forces full connection setup)
        await client.models.list(limit=1)
        elapsed = (perf_counter() - start) * 1000
        logger.info("OpenAI connection pool warmed", elapsed_ms=round(elapsed, 2))
    except Exception as e:
        elapsed = (perf_counter() - start) * 1000
        logger.warning(
            "Connection pool warmup failed - connections will be lazy-initialized",
            error=str(e),
            error_type=type(e).__name__,
            elapsed_ms=round(elapsed, 2)
        )
        # Non-fatal - first request will initialize the pool

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Application starting up...")
    await warmup_openai_connection_pool(api_instance.client)

    yield

    logger.info("Application shutting down...")
    if api_instance.client is not None:
        await api_instance.client.close()
```

### Key Design Decisions

- **Lightweight API call**: Use minimal operation that requires full authentication
- **Non-fatal failure**: Log warning but don't crash startup (graceful degradation)
- **Monotonic timing**: Use `perf_counter()` for accurate elapsed time measurement
- **FastAPI integration**: Call during lifespan startup, before serving traffic

### Measured Impact

- First request: 939ms → 593ms (37% improvement)
- Subsequent requests: Consistent performance
- Startup time: +500-800ms (acceptable trade-off)

### Applicability

Any service using HTTP clients:
- OpenAI/Anthropic clients
- httpx/aiohttp
- requests with connection pooling
- gRPC clients

---

## Optimization Decision Framework

### Documentation as Optimization Strategy

When optimization risks are high and defaults are appropriate, comprehensive documentation delivers similar value with zero implementation risk.

### Decision Table

| Factor | Document Defaults | Implement Configuration |
|--------|-------------------|------------------------|
| Current performance | Acceptable | Measurable problem |
| Implementation risk | Zero | Resource leaks, lifecycle complexity |
| Time to deliver | 15 minutes | 2+ hours |
| Future flexibility | Easy to optimize later | Harder to simplify later |
| Educational value | High (makes implicit explicit) | High (explicit control) |
| YAGNI principle | Satisfied | Violates (no proven need) |

### When Documentation is the Better Optimization

- ✅ Defaults are already appropriate (measure first!)
- ✅ Configuration has non-obvious risks (resource leaks, race conditions)
- ✅ Team needs to understand current behavior before changing it
- ✅ YAGNI applies (You Aren't Gonna Need It)

### When Code Changes Are Required

- ❌ Measured performance problem (latency SLO violations, throughput limits)
- ❌ Load testing shows defaults are insufficient
- ❌ Production metrics indicate resource exhaustion
- ❌ Clear ROI on implementation effort

### Example: httpx Connection Pool Defaults

```python
def get_openai_client(service_config: ServiceConfig) -> AsyncOpenAI:
    """Create OpenAI client with production-grade timeout configuration.

    Connection Pool Limits (httpx defaults, not explicitly configured):
        - max_keepalive_connections: 20 (idle connections kept alive)
        - max_connections: 100 (maximum total connections)
        - keepalive_expiry: 5.0s (connection reuse window)

    These defaults are appropriate for single-assistant architecture with
    moderate concurrency. The warmup function establishes connections during
    startup to eliminate first-request latency.

    Performance Monitoring:
        Monitor connection reuse rate in production. If it drops below 80%
        under sustained load, consider explicit httpx.Limits() configuration.
        Note: Explicit configuration requires careful lifecycle management.
    """
    timeout = httpx.Timeout(connect=10.0, read=300.0, write=60.0, pool=5.0)
    return AsyncOpenAI(api_key=service_config.openai_api_key, timeout=timeout)
```

---

### WebSocket Scaling Considerations

```python
# Connection limits per instance
MAX_CONNECTIONS_PER_INSTANCE = 10000

# Track connections
connections: dict[str, set] = {}

async def accept_connection(websocket, customer_id: str):
    current = len(connections.get(customer_id, set()))
    if current >= MAX_CONNECTIONS_PER_CUSTOMER:
        await websocket.close(4001, "Connection limit reached")
        return

    connections.setdefault(customer_id, set()).add(websocket)
    try:
        await handle_messages(websocket)
    finally:
        connections[customer_id].discard(websocket)
```
