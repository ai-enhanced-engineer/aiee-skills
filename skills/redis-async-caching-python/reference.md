# redis-py Async Caching Reference

Detailed patterns for redis-py async + Azure Cache for Redis with EntraID auth. Companion to SKILL.md.

## 1. Pool selection

| Pool | Behavior on exhaustion | Use case |
|---|---|---|
| `ConnectionPool` | Raises `ConnectionError` | Predictable load, fail-fast desired |
| `BlockingConnectionPool` | Blocks Task until conn free or `timeout` elapsed | Bursty rec APIs (recommended default) |

```python
from redis.asyncio import BlockingConnectionPool, Redis

pool = BlockingConnectionPool(
    host=settings.AZURE_REDIS_HOST,
    port=int(settings.AZURE_REDIS_PORT),
    max_connections=50,         # tune to workers × concurrency
    timeout=5.0,                # wait-for-conn (NOT socket timeout)
    socket_timeout=5.0,
    socket_connect_timeout=2.0,
    ssl=True,
    decode_responses=True,
)
client = Redis(connection_pool=pool)
```

### `decode_responses`

| Value | When |
|---|---|
| `True` | Plain string / JSON-string values (project default) |
| `False` | Binary, msgpack, pickled (avoid pickle — see anti-patterns) |

### Retry config

```python
from redis.backoff import ExponentialBackoff
from redis.retry import Retry
from redis.exceptions import ConnectionError, TimeoutError

client = Redis(
    connection_pool=pool,
    retry=Retry(ExponentialBackoff(), retries=3),
    retry_on_error=[ConnectionError, TimeoutError],
)
```

### Shutdown

redis-py 5+ uses `aclose()`:

```python
@asynccontextmanager
async def lifespan(app):
    app.state.redis = Redis(connection_pool=pool)
    yield
    await app.state.redis.aclose()
    await pool.aclose()
```

## 2. EntraID (AAD) authentication

### Scope and credentials

| Field | Value |
|---|---|
| Scope | `https://redis.azure.com/.default` |
| Username | Object ID of the managed identity / SP (not UPN) |
| Password | Access token from `DefaultAzureCredential` |
| TLS | Enforced — `ssl=True` always |

### `redis-entraid` CredentialProvider (recommended)

```python
from redis_entraid.cred_provider import (
    create_from_default_azure_credential, TokenManagerConfig
)

cred = create_from_default_azure_credential(
    ("https://redis.azure.com/.default",),
    token_manager_config=TokenManagerConfig(
        expiration_refresh_ratio=0.9,    # refresh at 90% TTL
    ),
)

client = Redis(
    connection_pool=pool,
    credential_provider=cred,
)
```

`expiration_refresh_ratio=0.9` on a 1-hour token refreshes at ~54 minutes elapsed. The library re-issues `AUTH` automatically.

### Microsoft guidance

- Send a fresh token at least 3 minutes before expiry
- Add random jitter to `AUTH` calls in multi-replica deployments to avoid coordinated `AUTH` storms
- Use private link / firewall rules; access keys are deprecated when EntraID is enabled

### Legacy: synchronous client + `asyncio.to_thread`

The current project pattern wraps sync `redis.Redis` in `asyncio.to_thread`:

```python
# Legacy — fine but blocking-thread overhead
class RedisClientHandler:
    def __init__(self):
        self._lock = threading.RLock()
        self._token: AccessToken | None = None
        self._client: redis.Redis | None = None

    def _need_refreshing(self) -> bool:
        return self._token is None or self._token.expires_on - time.time() < 300

    def refresh_authentication(self) -> None:
        with self._lock:
            self._token = _credential.get_token("https://redis.azure.com/.default")
            self._client = redis.Redis(host=..., password=self._token.token, ssl=True)
            self._client.ping()

# Use:
client = await asyncio.to_thread(handler.get_client)
```

Migration to native async: replace this whole layer with `redis-entraid` CredentialProvider. The thread-pool round-trip disappears.

## 3. Key taxonomy

### Recommended schema

```
reco:v{version}:{namespace}:{discriminators...}
```

| Namespace | Pattern | TTL |
|---|---|---|
| Recommendation result | `reco:v1:rec:{tenantid}:{account_id}:{items_sha256}` | 300–900s |
| Graph metadata | `reco:v1:graph:{graph_name}:{field}` | 3600–21600s |
| Negative cache | `reco:v1:neg:{tenantid}:{account_id}` | 60–120s |

The `v1:` prefix lets you bump to `v2:` for schema changes and invalidate the old generation via `SCAN MATCH reco:v1:*` rather than touching live keys.

### Hashing inputs

```python
import hashlib
items_hash = hashlib.sha256(str(sorted(line_items)).encode()).hexdigest()
key = f"reco:v1:rec:{tenantid}:{account_id}:{items_hash}"
```

Sorting normalizes order; SHA-256 produces a fixed-length suffix. Truncating to 16 hex chars is acceptable if collision probability at expected key counts is tolerable.

### `SCAN`, never `KEYS`

```python
# Production-safe iteration
async for key in client.scan_iter(match="reco:v1:rec:*", count=100):
    await client.delete(key)

# NEVER in production
# await client.keys("*")
```

`KEYS *` is O(N) over the full keyspace and blocks the single-threaded server. The project's `print_cache_items` uses it — guard behind `if settings.DEBUG:` or remove.

## 4. Stampede protection

### Single-replica: per-key `asyncio.Lock`

```python
_locks: dict[str, asyncio.Lock] = {}

async def get_or_compute(client, key, compute, ttl):
    cached = await client.get(key)
    if cached is not None:
        return cached
    lock = _locks.setdefault(key, asyncio.Lock())
    async with lock:
        cached = await client.get(key)         # double-check
        if cached is not None:
            return cached
        result = await compute()
        await client.setex(key, ttl, result)
        return result
```

Locks live for the process lifetime; for a long-running instance with many keys, evict from `_locks` after computation completes.

### Multi-replica: `SET NX EX` distributed mutex

```python
mutex_key = f"{key}:lock"
got_lock = await client.set(mutex_key, "1", nx=True, ex=10)
if got_lock:
    try:
        result = await compute()
        await client.setex(key, ttl, result)
    finally:
        await client.delete(mutex_key)
else:
    # Another replica is computing; poll briefly
    for _ in range(20):
        cached = await client.get(key)
        if cached is not None:
            return cached
        await asyncio.sleep(0.1)
```

### Negative caching

```python
NO_REC = "NO_REC"
result = await compute()
payload = NO_REC if not result else json.dumps(result)
await client.setex(key, 60 if not result else 900, payload)

# Read side
cached = await client.get(key)
if cached == NO_REC:
    return []
```

Avoid recomputing for users with genuinely no recommendations.

### Probabilistic early refresh (XFetch)

Refresh hot keys with probability rising as TTL nears expiry — avoids cliff-edge misses. Implementation overhead is high; reach for it only when Lock-based protection is insufficient on a single hot key.

## 5. Project facade pattern

```python
# CACHE_BYPASS propagates as None client through the call chain
class CacheManager:
    def __init__(self, redis_client: Redis | None):
        self._client = redis_client

    async def get(self, key: str) -> dict | None:
        if self._client is None:
            return None
        raw = await self._client.get(key)
        return json.loads(raw) if raw else None

    async def set(self, key: str, value: dict, ttl: int = 900) -> None:
        if self._client is None:
            return
        await self._client.setex(key, ttl, json.dumps(value))

    async def invalidate(self, key: str) -> None:
        if self._client is None:
            return
        await self._client.delete(key)
```

### `CACHE_BYPASS` prod guard

```python
class Settings(BaseSettings):
    CACHE_BYPASS: bool = False
    ENV: str = "local"

    @model_validator(mode="after")
    def guard(self) -> "Settings":
        if self.CACHE_BYPASS and self.ENV == "prod":
            raise ValueError("CACHE_BYPASS=true forbidden in prod")
        return self
```

## 6. Anti-patterns (extended)

| Anti-pattern | Risk | Fix |
|---|---|---|
| `set(key, val)` no TTL | Unbounded memory + permanent stale | `setex(key, ttl, val)` |
| `pickle` serialization | RCE on poisoned cache | JSON only |
| `KEYS *` | Blocks single-threaded server | `SCAN MATCH ... COUNT 100` |
| One client per request | TLS every call | Singleton on `app.state` |
| Tokens / PII in cache | Exposure to any reader | Cache opaque payloads only |
| No stampede guard on hot keys | N concurrent recomputes | `asyncio.Lock` or `SET NX EX` |
| `CACHE_BYPASS=true` in prod | Cold backend on every request | `model_validator` guard |
| Sync `redis` in async without `to_thread` | Blocks event loop | `redis.asyncio` or wrap |
| Per-key lock dict that grows forever | Memory leak | Evict after compute, or use weak refs |
| Encrypting nothing on a tier without TLS | Token interception risk | `ssl=True` always with EntraID |

## 7. References

- [redis-py asyncio examples](https://redis.readthedocs.io/en/stable/examples/asyncio_examples.html)
- [redis-py connections reference](https://redis.readthedocs.io/en/stable/connections.html)
- [Microsoft: Entra for Azure Cache for Redis](https://learn.microsoft.com/en-us/azure/azure-cache-for-redis/cache-azure-active-directory-for-authentication)
- [redis-entraid](https://github.com/redis/redis-py-entraid)
- Sibling skills: `azure-identity-m2m-auth`, `fastapi-patterns`, `arch-python-modern`
