---
name: redis-async-caching-python
description: redis-py async caching patterns for Azure Cache for Redis with Entra ID (AAD) auth. Covers BlockingConnectionPool sizing, the redis-entraid CredentialProvider, hierarchical key taxonomy with version prefix, TTL strategy per namespace, and asyncio.Lock stampede protection. Sibling to azure-identity-m2m-auth and fastapi-patterns. Use for adding cached service methods, designing cache keys, debugging stampedes, or migrating from sync redis-py + asyncio.to_thread to native async.
updated: 2026-04-27
---

# redis-py Async Caching for Azure

Caching patterns for Azure Cache for Redis with EntraID auth — AAD token refresh on the redis client, key taxonomy that supports invalidation, and stampede protection.

## When to use

- Adding a cached method to a service that calls Postgres or another expensive backend
- Designing the cache key for a new entity (result, metadata, negative cache)
- Debugging hot-key stampedes or cache thrash under load
- Migrating from synchronous redis-py + `asyncio.to_thread` to native `redis.asyncio`

For lifespan + DI, see `fastapi-patterns`. For acquiring the EntraID token, see `azure-identity-m2m-auth`.

## Core patterns

| Pattern | Description |
|---|---|
| Pool type | `BlockingConnectionPool` waits for a free connection; the default `ConnectionPool` raises immediately. The blocking variant is preferable for bursty rec APIs that prefer latency over errors. |
| `decode_responses` | `True` simplifies JSON-string values; `False` is needed for binary or msgpack payloads. |
| `aclose()` | redis-py 5+ renamed async `close()` to `aclose()`; old name is a deprecated alias. |
| Singleton client | One `Redis` per process on `app.state.redis` reuses the connection pool; per-request clients pay TLS handshake every call. |
| EntraID auth | scope `https://redis.azure.com/.default`; username = managed identity object ID; password = access token. |
| Token refresh | `redis-entraid` `CredentialProvider` with `expiration_refresh_ratio=0.9` re-issues `AUTH` at 90% of token TTL. |
| Key prefix | A version segment (e.g., `v1:`) lets schema bumps invalidate the previous generation via `SCAN MATCH …:v1:*` without touching live keys. |
| TTL by namespace | Result caches: 300–900s; metadata: 3600–21600s; negative cache: 60–120s. |
| Stampede guard | Per-key `asyncio.Lock` + double-checked `get` (single-replica); `SET NX EX` distributed mutex (multi-replica). |
| Serialization | JSON only. `pickle` deserialization runs arbitrary bytecode — RCE if the cache is poisoned. |

## Skeleton

```python
# Decision shape only — full lifespan setup + facade in examples.md (Example 1, 5)
client = aioredis.Redis(
    connection_pool=BlockingConnectionPool(..., ssl=True),  # blocking, not raising
    credential_provider=cred_provider,                       # redis-entraid, refresh at 0.9
    retry=Retry(ExponentialBackoff(), retries=3),
)

async def get_or_compute(key, compute, ttl):
    if (cached := await client.get(key)) is not None: return cached
    async with _locks.setdefault(key, asyncio.Lock()):       # stampede guard
        if (cached := await client.get(key)) is not None: return cached
        result = await compute()
        await client.setex(key, ttl, json.dumps(result))      # never set without TTL
        return result
```

## Anti-patterns (top 6)

1. **`set(key, val)` with no TTL** → unbounded memory + permanent staleness. Use `setex` or `set(... ex=ttl)`.
2. **`pickle` serialization** → RCE if cache is poisoned. JSON only.
3. **`KEYS *`** → blocks the single-threaded Redis server O(N) over the keyspace. `SCAN MATCH ... COUNT 100` is the iterator alternative.
4. **One client per request** → TLS handshake every call. Singleton on `app.state`.
5. **No stampede protection on hot keys** → cache miss causes N concurrent expensive recomputes.
6. **Sync `redis` inside `async def`** without `asyncio.to_thread` → blocks the event loop on every call.

See `reference.md` for the full pattern catalogue and `examples.md` for the project facade pattern, sync-to-async migration, and SCAN-based invalidation.
