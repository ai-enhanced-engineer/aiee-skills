---
name: psycopg3-async-patterns
description: psycopg 3 async + psycopg_pool.AsyncConnectionPool patterns for Azure Postgres flexible-server. Covers pool sizing/lifespan, AAD token auth via the `conninfo` callable, parameterized SQL with `sql.Identifier` for dynamic schemas, prepared statements, and transaction boundaries. Sibling to azure-identity-m2m-auth (token acquisition) and fastapi-patterns (lifespan/DI). Use for adding async Postgres queries, migrating from sync psycopg2, or debugging pool starvation and AAD token-expiry errors.
updated: 2026-04-27
---

# psycopg 3 Async Patterns

Production patterns for psycopg 3 + `AsyncConnectionPool` against Azure Postgres flexible-server with Entra (AAD) authentication. Focuses on what changes from sync psycopg2: the `conninfo` callable for token refresh, async transaction context managers, and the consequences of token TTL on `max_lifetime`.

## When to use

- Adding an async DB query path or service method against Azure Postgres
- Migrating a sync `psycopg2` / `ConnectionPool` codepath to `psycopg` 3 + `AsyncConnectionPool`
- Debugging "authentication failed" errors after long-running pools (AAD token expiry)
- Sizing the pool for a new deployment SKU

For the lifespan + `Depends` plumbing, see `fastapi-patterns`. For acquiring the AAD token (`DefaultAzureCredential.get_token`), see `azure-identity-m2m-auth`. For `asyncio.Lock` and the "no blocking I/O in async" rule, see `arch-python-modern`.

## Core patterns

| Pattern | Description |
|---|---|
| `AsyncConnectionPool` | `open=False` + explicit `await pool.open()` in lifespan avoids implicit connect at import time and makes startup ordering legible. |
| `max_size` cap | Uncapped pools exhaust Postgres `max_connections` under load; `min(workers × cpu + 4, pg_max_connections × 0.8)` is a safe starting point. |
| `max_lifetime` vs token TTL | Pool connections older than the AAD token used to open them break on reconnect; set below TTL — `2700` (45m) for user tokens, `69120` (~19h) for managed identity. |
| `conninfo` callable | Pool calls it per new physical connection — the only path for fresh AAD tokens. Static-token strings fail after TTL elapses. |
| Token cache | Cache `AccessToken` in module state, refresh at expiry − 300s, guarded by `asyncio.Lock` to prevent thundering-herd refresh on pool open. |
| Parameterized SQL | `await conn.execute("... WHERE x = %s", (x,))` is the only injection-safe shape. f-string interpolation bypasses psycopg's escaping. |
| Dynamic identifiers | Table/column names need `sql.Identifier(name)`; they are not values and cannot use `%s`. |
| Prepared statements | Auto-prepare at `prepare_threshold=5`; `prepare=True` forces immediate caching for hot queries. |
| Transactions | `async with conn.transaction():` for writes; bare `execute()` for single-statement reads (the implicit transaction is enough). |
| `configure` hook | Per-connection setup that survives the connection lifetime (e.g., `SET search_path`); avoids repeating on every checkout. |
| Connection scope | Holding `pool.connection()` across `await httpx.get()` ties up a pool slot for the full HTTP latency; acquire just before DB work. |

## Skeleton

```python
# Decision shape only — full token-refresh + lifespan setup in examples.md (Example 2)
pool = AsyncConnectionPool(
    conninfo=_build_conninfo,    # async callable; returns conninfo with current AAD token
    min_size=4, max_size=20,     # cap based on workers × cpu and pg_max_connections
    open=False,                   # explicit open in lifespan
    max_lifetime=2700,            # < AAD token TTL — recycle before expiry
    configure=_set_session_state, # e.g., SET search_path; runs once per new physical conn
)
```

## Anti-patterns (top 6)

1. **Sync `psycopg2` inside `async def`** → freezes the event loop on every query. Migrate to native `psycopg` 3 async.
2. **`max_size=None` (unbounded)** → exhausts Postgres `max_connections`; OOM on the DB.
3. **Static AAD token in conninfo** → all new connections after token expiry fail with `authentication failed`. Use a `conninfo` callable.
4. **f-string SQL** → injection. Use `execute(query, (value,))` for values; `sql.Identifier` for table/column names.
5. **Holding `pool.connection()` across `await httpx.get()`** → starves the pool for the full HTTP latency. Acquire immediately before DB work.
6. **`threading.Lock` in async code** → deadlock risk; `asyncio.Lock` is the correct primitive.

See `reference.md` for the full pattern catalogue and `examples.md` for a sync→async migration walkthrough and dynamic-schema query recipes.
