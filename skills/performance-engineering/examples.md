# Performance Engineering - Examples

Working code for profiling, load testing, and optimization patterns.

## Profiling Examples

### FastAPI Middleware for Timing

```python
from fastapi import FastAPI, Request
from starlette.middleware.base import BaseHTTPMiddleware
import time
import structlog

logger = structlog.get_logger()

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.perf_counter()

        response = await call_next(request)

        elapsed_ms = (time.perf_counter() - start) * 1000

        logger.info(
            "request_complete",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(elapsed_ms, 2),
        )

        # Add timing header
        response.headers["X-Response-Time"] = f"{elapsed_ms:.2f}ms"

        return response

app = FastAPI()
app.add_middleware(TimingMiddleware)
```

### Database Query Profiler

```python
from sqlalchemy import event
from sqlalchemy.engine import Engine
import time
import structlog

logger = structlog.get_logger()

@event.listens_for(Engine, "before_cursor_execute")
def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    context._query_start_time = time.perf_counter()

@event.listens_for(Engine, "after_cursor_execute")
def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
    elapsed_ms = (time.perf_counter() - context._query_start_time) * 1000

    # Log slow queries
    if elapsed_ms > 100:
        logger.warning(
            "slow_query",
            duration_ms=round(elapsed_ms, 2),
            query=statement[:200],  # Truncate long queries
        )
```

### Memory Leak Detection Script

```python
import tracemalloc
import asyncio
import gc
from datetime import datetime

async def detect_memory_leaks(app, duration_seconds: int = 60):
    """Run app and detect memory growth."""

    tracemalloc.start()
    snapshots = []

    for i in range(duration_seconds // 10):
        await asyncio.sleep(10)
        gc.collect()

        snapshot = tracemalloc.take_snapshot()
        snapshots.append((datetime.now(), snapshot))

        print(f"Snapshot {i+1}: {tracemalloc.get_traced_memory()[0] / 1024 / 1024:.2f} MB")

    # Compare first and last
    if len(snapshots) >= 2:
        first = snapshots[0][1]
        last = snapshots[-1][1]

        diff = last.compare_to(first, 'lineno')

        print("\nTop 10 memory increases:")
        for stat in diff[:10]:
            print(f"  {stat}")

    tracemalloc.stop()
```

---

## Load Testing Examples

### Complete Locust Suite

```python
"""
locustfile.py - Load Test Suite

Run: TARGET_HOST=https://api.example.com locust -f locustfile.py --host=$TARGET_HOST
"""
from locust import HttpUser, task, between, events
from locust.exception import StopUser
import random
import json
import logging

# Test data
MESSAGES = [
    "Hello, how can you help me?",
    "What are your business hours?",
    "I need help with my order",
    "Can you tell me more about your products?",
    "Thanks for your help!",
]

class WidgetVisitor(HttpUser):
    """Simulates typical widget visitor behavior."""

    wait_time = between(2, 5)
    weight = 10  # Most common user type

    def on_start(self):
        """Initialize session."""
        self.client_id = "test_client_123"
        self.session_id = None
        self.message_count = 0

        # Init widget
        response = self.client.post(
            f"/api/v1/widget/{self.client_id}/init",
            json={},
            headers={"Origin": "https://test.example.com"},
            name="/widget/init"
        )

        if response.status_code == 200:
            data = response.json()
            self.session_id = data.get("session_id")
        else:
            logging.error(f"Init failed: {response.status_code}")
            raise StopUser()

    @task(10)
    def send_message(self):
        """Send a chat message."""
        if not self.session_id:
            return

        message = random.choice(MESSAGES)

        response = self.client.post(
            f"/api/v1/widget/{self.client_id}/chat",
            json={
                "message": message,
                "session_id": self.session_id,
            },
            headers={"Origin": "https://test.example.com"},
            name="/widget/chat"
        )

        self.message_count += 1

        # Simulate conversation ending after 3-5 messages
        if self.message_count >= random.randint(3, 5):
            self.message_count = 0
            self.session_id = None
            self.on_start()  # Start new session

    @task(1)
    def idle(self):
        """Simulate user thinking/reading."""
        pass


class PowerUser(HttpUser):
    """Simulates power user with rapid messages."""

    wait_time = between(0.5, 1)
    weight = 1  # Less common

    def on_start(self):
        self.client_id = "test_client_123"
        response = self.client.post(
            f"/api/v1/widget/{self.client_id}/init",
            json={},
            headers={"Origin": "https://test.example.com"},
            name="/widget/init (power)"
        )
        if response.status_code == 200:
            self.session_id = response.json().get("session_id")
        else:
            raise StopUser()

    @task
    def rapid_messages(self):
        """Send messages rapidly."""
        self.client.post(
            f"/api/v1/widget/{self.client_id}/chat",
            json={
                "message": "Quick question!",
                "session_id": self.session_id,
            },
            headers={"Origin": "https://test.example.com"},
            name="/widget/chat (rapid)"
        )


class DashboardUser(HttpUser):
    """Simulates dashboard customer."""

    wait_time = between(3, 10)
    weight = 2

    def on_start(self):
        # Login
        response = self.client.post(
            "/api/v1/dashboard/auth/login",
            json={
                "email": "test@example.com",
                "password": "testpass123"
            },
            name="/dashboard/login"
        )
        if response.status_code != 200:
            raise StopUser()

    @task(5)
    def list_conversations(self):
        """Fetch conversation list."""
        self.client.get(
            "/api/v1/dashboard/conversations",
            name="/dashboard/conversations"
        )

    @task(2)
    def view_analytics(self):
        """Fetch analytics data."""
        self.client.get(
            "/api/v1/dashboard/analytics",
            name="/dashboard/analytics"
        )

    @task(1)
    def update_settings(self):
        """Update widget settings."""
        self.client.put(
            "/api/v1/dashboard/widget/settings",
            json={"welcome_message": f"Hello! Updated at {random.randint(1, 1000)}"},
            name="/dashboard/settings"
        )


# Custom event handlers
@events.request.add_listener
def log_slow_requests(request_type, name, response_time, **kwargs):
    """Log slow requests."""
    if response_time > 1000:  # > 1 second
        logging.warning(f"Slow request: {name} took {response_time}ms")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Summary on test completion."""
    stats = environment.stats

    print("\n=== Load Test Summary ===")
    print(f"Total requests: {stats.total.num_requests}")
    print(f"Failure rate: {stats.total.fail_ratio * 100:.2f}%")
    print(f"Average response time: {stats.total.avg_response_time:.2f}ms")
    print(f"P95 response time: {stats.total.get_response_time_percentile(0.95):.2f}ms")
```

### Locust Commands for Different Scenarios

```bash
# Target host (override per environment)
TARGET_HOST="${TARGET_HOST:-https://api.example.com}"

# Smoke test (10 users)
locust -f locustfile.py \
    --headless \
    --users 10 \
    --spawn-rate 2 \
    --run-time 1m \
    --host=$TARGET_HOST

# Load test (100 users)
locust -f locustfile.py \
    --headless \
    --users 100 \
    --spawn-rate 10 \
    --run-time 10m \
    --csv=load_test_results \
    --host=$TARGET_HOST

# Stress test (ramp to 500)
locust -f locustfile.py \
    --headless \
    --users 500 \
    --spawn-rate 50 \
    --run-time 15m \
    --csv=stress_test_results \
    --host=$TARGET_HOST

# Soak test (2 hours at steady load)
locust -f locustfile.py \
    --headless \
    --users 50 \
    --spawn-rate 5 \
    --run-time 2h \
    --csv=soak_test_results \
    --host=$TARGET_HOST
```

---

## Optimization Examples

### Async Database Operations

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
import asyncio

# Async engine
engine = create_async_engine(
    "postgresql+asyncpg://user:pass@localhost/db",
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

async def get_messages_async(session: AsyncSession, customer_id: str, limit: int = 100):
    """Async message retrieval."""
    result = await session.execute(
        select(Message)
        .filter(Message.customer_id == customer_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()

async def batch_get_conversations(customer_ids: list[str]):
    """Fetch conversations for multiple customers concurrently."""
    async with AsyncSessionLocal() as session:
        tasks = [
            get_messages_async(session, cid)
            for cid in customer_ids
        ]
        results = await asyncio.gather(*tasks)
        return dict(zip(customer_ids, results))
```

### Redis Caching with Invalidation

```python
import redis.asyncio as redis
import json
from typing import TypeVar, Generic
from datetime import timedelta

T = TypeVar('T')

class CacheManager:
    def __init__(self, redis_url: str):
        self.redis = redis.from_url(redis_url)

    async def get_or_set(
        self,
        key: str,
        factory,
        ttl: timedelta = timedelta(minutes=5)
    ):
        """Get from cache or compute and store."""
        cached = await self.redis.get(key)
        if cached:
            return json.loads(cached)

        value = await factory()
        await self.redis.setex(key, ttl, json.dumps(value))
        return value

    async def invalidate_pattern(self, pattern: str):
        """Invalidate all keys matching pattern."""
        async for key in self.redis.scan_iter(match=pattern):
            await self.redis.delete(key)

# Usage
cache = CacheManager("redis://localhost:6379")

async def get_customer_config(customer_id: str):
    return await cache.get_or_set(
        f"customer:{customer_id}:config",
        lambda: fetch_customer_config_from_db(customer_id),
        ttl=timedelta(minutes=10)
    )

async def update_customer_config(customer_id: str, config: dict):
    await save_customer_config_to_db(customer_id, config)
    await cache.invalidate_pattern(f"customer:{customer_id}:*")
```

### Connection Pool Health Check

```python
from sqlalchemy.pool import QueuePool
from sqlalchemy import event
import logging

logger = logging.getLogger(__name__)

def setup_pool_monitoring(engine):
    """Monitor connection pool health."""

    @event.listens_for(engine, "checkout")
    def on_checkout(dbapi_conn, connection_record, connection_proxy):
        pool = engine.pool
        logger.debug(
            "pool_checkout",
            checkedout=pool.checkedout(),
            checkedin=pool.checkedin(),
            overflow=pool.overflow(),
        )

    @event.listens_for(engine, "checkin")
    def on_checkin(dbapi_conn, connection_record):
        pool = engine.pool
        logger.debug(
            "pool_checkin",
            checkedout=pool.checkedout(),
            checkedin=pool.checkedin(),
        )

    @event.listens_for(engine, "invalidate")
    def on_invalidate(dbapi_conn, connection_record, exception):
        logger.warning(
            "pool_connection_invalidated",
            exception=str(exception),
        )

def get_pool_stats(engine):
    """Get current pool statistics."""
    pool = engine.pool
    return {
        "pool_size": pool.size(),
        "checked_out": pool.checkedout(),
        "checked_in": pool.checkedin(),
        "overflow": pool.overflow(),
        "invalid": pool.invalidatedcount() if hasattr(pool, 'invalidatedcount') else 0,
    }
```

### WebSocket Connection Manager

```python
from dataclasses import dataclass, field
from typing import Dict, Set
import asyncio
import weakref

@dataclass
class ConnectionStats:
    total_connections: int = 0
    active_connections: int = 0
    messages_sent: int = 0
    messages_received: int = 0

class WebSocketManager:
    """Manage WebSocket connections with performance tracking."""

    def __init__(self, max_connections_per_customer: int = 100):
        self.connections: Dict[str, Set] = {}
        self.max_per_customer = max_connections_per_customer
        self.stats = ConnectionStats()
        self._lock = asyncio.Lock()

    async def connect(self, websocket, customer_id: str) -> bool:
        """Register new connection."""
        async with self._lock:
            customer_connections = self.connections.setdefault(customer_id, set())

            if len(customer_connections) >= self.max_per_customer:
                return False

            customer_connections.add(websocket)
            self.stats.total_connections += 1
            self.stats.active_connections += 1
            return True

    async def disconnect(self, websocket, customer_id: str):
        """Remove connection."""
        async with self._lock:
            if customer_id in self.connections:
                self.connections[customer_id].discard(websocket)
                self.stats.active_connections -= 1

                if not self.connections[customer_id]:
                    del self.connections[customer_id]

    async def broadcast(self, customer_id: str, message: str):
        """Send to all customer connections."""
        connections = self.connections.get(customer_id, set())

        if not connections:
            return 0

        tasks = []
        for ws in list(connections):
            tasks.append(self._safe_send(ws, customer_id, message))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        sent = sum(1 for r in results if r is True)
        self.stats.messages_sent += sent
        return sent

    async def _safe_send(self, websocket, customer_id: str, message: str) -> bool:
        """Send with error handling."""
        try:
            await websocket.send_text(message)
            return True
        except Exception:
            await self.disconnect(websocket, customer_id)
            return False

    def get_stats(self) -> dict:
        """Get connection statistics."""
        return {
            "total_customers": len(self.connections),
            "active_connections": self.stats.active_connections,
            "total_connections": self.stats.total_connections,
            "messages_sent": self.stats.messages_sent,
        }
```

---

## Performance Dashboard Queries

### Cloud Monitoring Dashboard Definition

```yaml
# dashboard.yaml - GCP Monitoring Dashboard
displayName: "API Performance"
mosaicLayout:
  tiles:
    - widget:
        title: "API Response Time (P95)"
        xyChart:
          dataSets:
            - timeSeriesQuery:
                timeSeriesFilter:
                  filter: 'metric.type="run.googleapis.com/request_latencies"'
                  aggregation:
                    perSeriesAligner: ALIGN_PERCENTILE_95
                    crossSeriesReducer: REDUCE_MEAN
          yAxis:
            label: "Latency (ms)"

    - widget:
        title: "Active Connections"
        xyChart:
          dataSets:
            - timeSeriesQuery:
                timeSeriesFilter:
                  filter: 'metric.type="custom.googleapis.com/websocket/active_connections"'

    - widget:
        title: "Error Rate"
        xyChart:
          dataSets:
            - timeSeriesQuery:
                timeSeriesFilter:
                  filter: 'metric.type="run.googleapis.com/request_count" resource.type="cloud_run_revision"'
                  aggregation:
                    perSeriesAligner: ALIGN_RATE
                    groupByFields:
                      - "metric.labels.response_code_class"
```

### PostgreSQL Performance Queries

```sql
-- Current active queries
SELECT
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
AND state != 'idle'
ORDER BY duration DESC;

-- Table bloat estimation
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) as total_size,
    n_live_tup,
    n_dead_tup,
    round(n_dead_tup::numeric / nullif(n_live_tup, 0) * 100, 2) as dead_ratio
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;

-- Index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC
LIMIT 20;
```
