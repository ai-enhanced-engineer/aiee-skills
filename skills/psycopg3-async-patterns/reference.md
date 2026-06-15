# psycopg 3 Async Patterns Reference

Detailed patterns for psycopg 3 + `AsyncConnectionPool` against Azure Postgres flexible-server. Companion to SKILL.md.

## 1. `AsyncConnectionPool` constructor

```python
AsyncConnectionPool(
    conninfo: str | Callable[[], str] | Callable[[], Awaitable[str]] = '',
    *,
    min_size: int = 4,
    max_size: int | None = None,        # always set in production
    open: bool | None = None,           # use False; future default
    configure: Callable[[ACT], Awaitable[None]] | None = None,
    reset: Callable[[ACT], Awaitable[None]] | None = None,
    check: Callable[[ACT], Awaitable[None]] | None = None,
    reconnect_failed: Callable | None = None,
    timeout: float = 30.0,              # wait-for-connection
    max_waiting: int = 0,               # 0 = unlimited queue
    max_lifetime: float = 3600.0,       # ALIGN with token TTL
    max_idle: float = 600.0,
    reconnect_timeout: float = 300.0,
    num_workers: int = 3,
)
```

### Sizing rule

```
min_size = number of uvicorn workers     # one warm conn per worker
max_size = min(workers × cpu + 4, pg_max_connections × 0.8)
```

Azure Postgres flexible-server SKU defaults (verify in portal):

| SKU | `max_connections` |
|---|---|
| Burstable B1ms | 25 |
| Burstable B2ms | 50 |
| GP D2s_v3 | 859 |

For B2ms with 4 uvicorn workers: cap `max_size` ≤ 40 to leave room for migrations and `psql` sessions.

### `max_lifetime` vs token TTL

Set `max_lifetime` strictly less than the AAD token TTL so connections are recycled while the token used to open them is still valid:

| Identity | Token TTL | Recommended `max_lifetime` |
|---|---|---|
| User principal | 1 hour | `2700` (45m) |
| Managed Identity | 24 hours | `69120` (~19.2h), or `2700` for conservative |

Note: a token remains valid for an *existing* connection even after expiry. The risk is that auth errors surface only on reconnect — better to recycle proactively.

## 2. AAD token plumbing

### `conninfo` callable (preferred)

```python
import asyncio, time
from azure.core.credentials import AccessToken
from azure.identity import DefaultAzureCredential
from psycopg_pool import AsyncConnectionPool

_credential = DefaultAzureCredential()
_cached: AccessToken | None = None
_lock = asyncio.Lock()
_SCOPE = "https://ossrdbms-aad.database.windows.net/.default"

async def _get_token() -> str:
    global _cached
    async with _lock:
        if _cached is None or _cached.expires_on - time.time() < 300:
            _cached = await asyncio.to_thread(_credential.get_token, _SCOPE)
    return _cached.token

async def _build_conninfo() -> str:
    token = await _get_token()
    return (
        f"host={settings.PG_HOST} port=5432 dbname={settings.PG_DB} "
        f"user={settings.PG_USER} password={token} sslmode=require"
    )

pool = AsyncConnectionPool(conninfo=_build_conninfo, min_size=4, max_size=20, open=False, max_lifetime=2700)
```

The `asyncio.Lock` prevents a thundering-herd token refresh when the pool opens `min_size` connections at startup.

### Why not the `configure` hook for token refresh

`configure` runs *after* the connection is established. It cannot change the password — by then libpq has already authenticated. The only reliable refresh is per-new-connection via `conninfo`.

### `configure` is right for *session* settings

Use `configure` for things that survive on the connection: `SET search_path`, `SET application_name`, prepared-statement priming.

```python
async def _configure(conn):
    await conn.execute('SET search_path = ag_catalog, "$user", public;')
    await conn.execute("SET application_name = 'reco-api';")

pool = AsyncConnectionPool(conninfo=_build_conninfo, configure=_configure, ...)
```

## 3. Health and reconnection

```python
# Probe in a /health endpoint
await pool.check()        # tests idle conns, replaces broken ones

def _on_reconnect_failed(pool):
    logger.error("psycopg pool exhausted reconnect retries")

pool = AsyncConnectionPool(..., reconnect_failed=_on_reconnect_failed)

# Metrics
stats = pool.get_stats()
# Keys: pool_min, pool_max, pool_size, pool_available, requests_waiting, ...
```

`reconnect_failed` is for alerting only — do not raise inside it; the pool keeps trying.

## 4. Parameterized SQL

### Values

```python
# Position
await conn.execute("SELECT * FROM rec WHERE id = %s", (rec_id,))
# Named
await conn.execute("SELECT * FROM rec WHERE id = %(rid)s", {"rid": rec_id})
```

Rules:
- Always supply values via the second argument; never f-string into the query string.
- Tuple wraps single value: `(value,)` not `value`.
- Placeholder `%s` is unquoted regardless of type.

### Identifiers

```python
from psycopg import sql

query = sql.SQL("SELECT id FROM {s}.{t} WHERE id = %s").format(
    s=sql.Identifier(schema),
    t=sql.Identifier(table),
)
await conn.execute(query, (id_,))
```

`sql.Identifier` quotes and escapes properly. Use this whenever a table/column name comes from `graph_db_mapping.yaml` or any external source.

### Prepared statements

psycopg 3 auto-prepares at the protocol level (not SQL `PREPARE`).

```python
# Auto-prepare after 5 calls (default threshold)
async with AsyncConnection.connect(conninfo, prepare_threshold=5) as conn:
    ...

# Force on a hot query
await conn.execute("SELECT ... WHERE x = %s", (x,), prepare=True)

# Disable for dynamic DDL
await conn.execute(ddl, prepare=False)
```

PgBouncer compatibility: requires PgBouncer 1.22+ with `max_prepared_statements > 0` and PostgreSQL 17+ libpq. Older setups: `prepare_threshold=None` to disable.

## 5. Row factories

```python
from psycopg.rows import dict_row, class_row
from pydantic import BaseModel

# Dict
async with conn.cursor(row_factory=dict_row) as cur:
    await cur.execute("SELECT id, score FROM rec")
    rows = await cur.fetchall()   # list[dict]

# Pydantic
class Rec(BaseModel):
    id: str
    score: float

async with conn.cursor(row_factory=class_row(Rec)) as cur:
    await cur.execute("SELECT id, score FROM rec")
    recs = await cur.fetchall()   # list[Rec]
```

Set at the connection level (`AsyncConnection.connect(row_factory=dict_row)`) when most queries use the same factory.

### Streaming

```python
async with conn.cursor() as cur:
    await cur.execute("SELECT id FROM rec")
    async for row in cur:
        yield row
```

Use for unbounded result sets. For bounded results (rec lists ≤ 100), `fetchall()` is simpler.

## 6. Transactions

```python
# Writes — explicit transaction
async with pool.connection() as conn:
    async with conn.transaction():
        await conn.execute("INSERT INTO event ...")
        await conn.execute("UPDATE stats ...")
    # COMMIT here; ROLLBACK on exception

# Reads — implicit transaction is enough
async with pool.connection() as conn:
    async with conn.cursor(row_factory=dict_row) as cur:
        await cur.execute("SELECT ... WHERE customer_id = %s", (cid,))
        return await cur.fetchall()

# Savepoints — nested transactions
async with conn.transaction():
    await conn.execute("INSERT INTO outer ...")
    async with conn.transaction():     # SAVEPOINT
        await conn.execute("INSERT INTO inner ...")
        # If this fails, only the SAVEPOINT rolls back
```

### Critical rule: never hold a connection across external I/O

```python
# Wrong — pool slot held for HTTP latency
async with pool.connection() as conn:
    data = await httpx.get(url)
    await conn.execute("INSERT ...", (data,))

# Right
data = await httpx.get(url)
async with pool.connection() as conn:
    await conn.execute("INSERT ...", (data,))
```

## 7. Migration: sync `psycopg2` ConnectionPool → async

| Sync | Async |
|---|---|
| `psycopg_pool.ConnectionPool` | `psycopg_pool.AsyncConnectionPool` |
| `threading.RLock` | `asyncio.Lock` |
| `pool.getconn()` / `putconn()` | `async with pool.connection() as conn:` |
| `cur.execute()` | `await cur.execute()` |
| Manual token-expiry detection + pool teardown/recreate | `conninfo` callable + `max_lifetime` |
| `with conn.cursor() as cur:` | `async with conn.cursor() as cur:` |
| `cur.fetchall()` | `await cur.fetchall()` or `async for row in cur` |

## 8. Anti-patterns (extended)

| Anti-pattern | Risk | Fix |
|---|---|---|
| Sync `psycopg2` in async code | Blocks event loop | psycopg 3 native async |
| `max_size=None` | Exhausts `pg_max_connections` | Always cap |
| f-string SQL | Injection | `execute(query, (value,))` |
| `sql.SQL("... " + table + ...)` | Injection via identifier | `sql.Identifier` |
| Static AAD token in conninfo | Auth failures after TTL | `conninfo` callable |
| Missing `pool.close()` | Idle conns linger after deploy | `await pool.close()` in lifespan teardown |
| Connection per request | TLS handshake every call | Pool with `min_size` ≥ workers |
| Hold conn across `await httpx` | Pool starvation | Acquire just before DB work |
| `threading.Lock` in async | Deadlock risk | `asyncio.Lock` |
| `open=True` | Deprecated | `open=False` + explicit `await pool.open()` |
| `SET search_path` per query | Redundant | Move to `configure` callback |
| Catching all `psycopg.Error` | Hides programming errors | Catch specific subclasses (`OperationalError` etc.) |

## 9. References

- [psycopg 3 docs](https://www.psycopg.org/psycopg3/docs/)
- [`psycopg_pool` — AsyncConnectionPool](https://www.psycopg.org/psycopg3/docs/api/pool.html)
- [Connection pools guide](https://www.psycopg.org/psycopg3/docs/advanced/pool.html)
- [Parameterized queries](https://www.psycopg.org/psycopg3/docs/basic/params.html)
- [Prepared statements](https://www.psycopg.org/psycopg3/docs/advanced/prepare.html)
- [Microsoft Entra auth — Azure Postgres flexible-server](https://learn.microsoft.com/en-us/azure/postgresql/flexible-server/concepts-azure-ad-authentication)
- Sibling skills: `azure-identity-m2m-auth`, `fastapi-patterns`, `arch-python-modern`
