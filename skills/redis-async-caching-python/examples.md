# redis-py Async Caching Examples

Project-grounded examples for `example-service` cache facade.

## Example 1: Adding a cached service method

Goal: `recommendation_service.recommend(tenantid, account_id, line_items)` returns top-N products and caches the result keyed on the cart hash.

```python
# app/services/recommendation.py
import hashlib, json
from app.services.cache import CacheManager
from app.services.postgres_graph import GraphService

class RecommendationService:
    def __init__(self, graph: GraphService, cache: CacheManager):
        self._graph = graph
        self._cache = cache

    def _cache_key(self, tenantid: str, account_id: str, line_items: list[str]) -> str:
        items_hash = hashlib.sha256(str(sorted(line_items)).encode()).hexdigest()
        return f"reco:v1:rec:{tenantid}:{account_id}:{items_hash}"

    async def recommend(self, tenantid: str, account_id: str, line_items: list[str]):
        key = self._cache_key(tenantid, account_id, line_items)

        cached = await self._cache.get(key)
        if cached is not None:
            return cached

        recs = await self._graph.recommend(tenantid, line_items, limit=20)
        ttl = 60 if not recs else 900    # short TTL for negative cache
        await self._cache.set(key, recs, ttl=ttl)
        return recs
```

The `reco:v1:` prefix lets a future `v2` schema land without disturbing live keys — invalidate by `SCAN MATCH reco:v1:*` after deploy.

## Example 2: Stampede protection on hot keys

Under load, a brief cache miss on a popular cart would let N concurrent requests recompute the same recommendation. Protect with per-key `asyncio.Lock`:

```python
import asyncio
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")
_locks: dict[str, asyncio.Lock] = {}

async def get_or_compute(
    cache: CacheManager,
    key: str,
    compute: Callable[[], Awaitable[T]],
    ttl: int,
) -> T:
    cached = await cache.get(key)
    if cached is not None:
        return cached
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = await cache.get(key)         # double-check
        if cached is not None:
            return cached
        result = await compute()
        await cache.set(key, result, ttl=ttl)
        return result

# Usage
recs = await get_or_compute(
    cache=cache,
    key=service._cache_key(tenantid, account_id, line_items),
    compute=lambda: graph.recommend(tenantid, line_items),
    ttl=900,
)
```

For multi-replica deployments, replace the in-process `asyncio.Lock` with a `SET key:lock 1 NX EX 10` distributed mutex (see reference.md §4).

## Example 3: Cache invalidation on cart update

When a customer's cart changes, invalidate any rec key tied to their account:

```python
async def invalidate_account(cache: CacheManager, tenantid: str, account_id: str):
    # SCAN, never KEYS *
    pattern = f"reco:v1:rec:{tenantid}:{account_id}:*"
    if cache._client is None:
        return
    async for key in cache._client.scan_iter(match=pattern, count=100):
        await cache._client.delete(key)
```

`scan_iter` is the async iterator wrapper around the SCAN cursor — non-blocking, bounded chunk size.

## Example 4: Migrating from sync `redis.Redis` + `to_thread` to native async

### Before — sync client wrapped in threads

```python
# app/services/redis_client.py (current)
import asyncio, threading, time
import redis

class RedisClientHandler:
    def __init__(self):
        self._lock = threading.RLock()
        self._token = None
        self._client: redis.Redis | None = None

    def _need_refreshing(self) -> bool:
        return self._token is None or self._token.expires_on - time.time() < 300

    def refresh_authentication(self):
        with self._lock:
            self._token = _credential.get_token("https://redis.azure.com/.default")
            self._client = redis.Redis(
                host=settings.AZURE_REDIS_HOST, port=int(settings.AZURE_REDIS_PORT),
                username=settings.MI_OBJECT_ID, password=self._token.token,
                ssl=True, decode_responses=True,
            )
            self._client.ping()

    async def get_client(self) -> redis.Redis:
        if self._need_refreshing():
            await asyncio.to_thread(self.refresh_authentication)
        return self._client
```

Issue: every cache read crosses the thread boundary via `asyncio.to_thread`.

### After — native async + `redis-entraid`

```python
# app/services/redis_client.py (proposed)
import redis.asyncio as aioredis
from redis.asyncio import BlockingConnectionPool
from redis.backoff import ExponentialBackoff
from redis.retry import Retry
from redis.exceptions import ConnectionError, TimeoutError
from redis_entraid.cred_provider import (
    create_from_default_azure_credential,
    TokenManagerConfig,
)

def build_redis_client():
    cred = create_from_default_azure_credential(
        ("https://redis.azure.com/.default",),
        token_manager_config=TokenManagerConfig(expiration_refresh_ratio=0.9),
    )
    pool = BlockingConnectionPool(
        host=settings.AZURE_REDIS_HOST,
        port=int(settings.AZURE_REDIS_PORT),
        max_connections=50, timeout=5.0,
        socket_timeout=5.0, socket_connect_timeout=2.0,
        ssl=True, decode_responses=True,
    )
    return aioredis.Redis(
        connection_pool=pool,
        credential_provider=cred,
        retry=Retry(ExponentialBackoff(), retries=3),
        retry_on_error=[ConnectionError, TimeoutError],
    )
```

Migration impact:
- Removes `threading.RLock` and `asyncio.to_thread` — pure async
- Token refresh is internal to `redis-entraid` (no manual `_need_refreshing`)
- Same `Redis` object surface — `cache.py` doesn't need to change

## Example 5: `CACHE_BYPASS` plumbing end-to-end

### Settings with prod guard

```python
# app/settings.py
from pydantic import BaseSettings, model_validator

class Settings(BaseSettings):
    CACHE_BYPASS: bool = False
    ENV: str = "local"

    @model_validator(mode="after")
    def guard(self) -> "Settings":
        if self.CACHE_BYPASS and self.ENV == "prod":
            raise ValueError("CACHE_BYPASS=true forbidden in prod")
        return self
```

### Lifespan startup branches on the toggle

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.CACHE_BYPASS:
        app.state.redis = None
    else:
        app.state.redis = build_redis_client()
    app.state.cache = CacheManager(app.state.redis)
    yield
    if app.state.redis:
        await app.state.redis.aclose()
```

### Facade null-checks consistently

```python
class CacheManager:
    def __init__(self, client):
        self._client = client

    async def get(self, key: str):
        if self._client is None:
            return None
        raw = await self._client.get(key)
        return json.loads(raw) if raw else None

    async def set(self, key: str, value, ttl: int = 900):
        if self._client is None:
            return
        await self._client.setex(key, ttl, json.dumps(value))
```

The `None` value propagates cleanly through the call chain, so no consumer needs an `if cache_bypass` branch — the null facade does the right thing.

## Example 6: Replacing `print_cache_items` (KEYS *) with safe SCAN

The project's debug helper currently uses `keys("*")`. Replace with:

```python
async def debug_list_keys(cache: CacheManager, pattern: str = "reco:v1:*", limit: int = 1000):
    if not settings.DEBUG:
        raise RuntimeError("debug_list_keys is dev-only")
    if cache._client is None:
        return []

    keys = []
    async for k in cache._client.scan_iter(match=pattern, count=100):
        keys.append(k)
        if len(keys) >= limit:
            break
    return keys
```

Two safety upgrades: `if not settings.DEBUG` guard, and SCAN with bounded result count instead of unbounded `KEYS`.
