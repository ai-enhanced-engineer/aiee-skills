# psycopg 3 Async Patterns Examples

Project-grounded implementations from `example-service`.

## Example 1: Adding a new async graph query

Goal: a service method `get_co_purchased(tenantid, sku)` that returns products commonly ordered together with `sku` for the given tenant's schema.

### Layout

```
app/services/postgres_graph.py    # this skill
graph_db_mapping.yaml             # tenant → schema
db/postgres/create_indexes.sql    # idx_ordered_along_with_start
```

### Code

```python
# app/services/postgres_graph.py
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

class GraphService:
    def __init__(self, pool: AsyncConnectionPool, mapping: dict[str, str]):
        self._pool = pool
        self._mapping = mapping

    async def get_co_purchased(self, tenantid: str, sku: str, limit: int = 20) -> list[dict]:
        schema = sql.Identifier(self._mapping[tenantid])
        query = sql.SQL(
            "SELECT end_id AS sku, weight "
            "FROM {s}.ordered_along_with "
            "WHERE start_id = %s "
            "ORDER BY weight DESC LIMIT %s"
        ).format(s=schema)

        async with self._pool.connection() as conn:
            async with conn.cursor(row_factory=dict_row) as cur:
                await cur.execute(query, (sku, limit), prepare=True)
                return await cur.fetchall()
```

`prepare=True` forces immediate prepared-statement caching — relevant because this is a hot read. The dynamic `schema` flows through `sql.Identifier`, never f-string.

### Wiring

```python
# app/main.py
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.pool = AsyncConnectionPool(
        conninfo=_build_conninfo,
        min_size=4, max_size=20,
        open=False, max_lifetime=2700,
        configure=_configure_age,   # SET search_path = ag_catalog if AGE used
    )
    await app.state.pool.open()
    app.state.graph = GraphService(app.state.pool, mapping=load_mapping())
    yield
    await app.state.pool.close()

# app/dependencies.py
def get_graph(request: Request) -> GraphService:
    return request.app.state.graph
```

```python
# app/routers/recommendation.py
@reco_router.get("/co-purchased/{sku}")
async def co_purchased(
    sku: str,
    tenantid: Annotated[str, Header()],
    graph: Annotated[GraphService, Depends(get_graph)],
):
    return await graph.get_co_purchased(tenantid, sku)
```

## Example 2: Migrating `PostgresAgeGraph` from sync to async

The current synchronous implementation:

```python
# Before — sync psycopg2 + threading
class PostgresAgeGraph:
    def __init__(self, conninfo_factory):
        self._conninfo_factory = conninfo_factory
        self._pool: ConnectionPool | None = None
        self._lock = threading.RLock()
        self._token_expiry: float | None = None

    def _ensure_pool(self):
        with self._lock:
            if self._should_refresh_token():
                if self._pool:
                    self._pool.close()
                self._pool = ConnectionPool(self._conninfo_factory(), max_size=20)

    def query(self, sql_text, params):
        self._ensure_pool()
        with self._pool.connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SET search_path = ag_catalog;")
                cur.execute(sql_text, params)
                return cur.fetchall()
```

### After — psycopg 3 async with `conninfo` callable

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
    return f"host={settings.PG_HOST} dbname={settings.PG_DB} user={settings.PG_USER} password={token} sslmode=require"

async def _configure_age(conn):
    await conn.execute('SET search_path = ag_catalog, "$user", public;')

class PostgresAgeGraph:
    def __init__(self, pool: AsyncConnectionPool):
        self._pool = pool

    async def query(self, sql_text, params):
        async with self._pool.connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(sql_text, params)
                return await cur.fetchall()

# Lifespan setup
pool = AsyncConnectionPool(
    conninfo=_build_conninfo,
    configure=_configure_age,
    min_size=4, max_size=20, open=False,
    max_lifetime=2700,
)
await pool.open()
graph = PostgresAgeGraph(pool)
```

### What disappeared

| Sync code | Replaced by |
|---|---|
| `_should_refresh_token` + `_token_timestamps` dict | `_get_token` cache with single `asyncio.Lock` |
| `pool.close() + ConnectionPool(...)` rebuild on token expiry | `max_lifetime=2700` recycles connections automatically |
| `cur.execute("SET search_path = ag_catalog;")` per query | `configure=_configure_age` runs once per new connection |
| `threading.RLock` | `asyncio.Lock` |

## Example 3: Handling token rotation on long-lived connections

```python
# Validate that pool sizing aligns with token TTL
import logging
logger = logging.getLogger(__name__)

async def health_check(pool: AsyncConnectionPool) -> dict:
    await pool.check()
    stats = pool.get_stats()
    logger.info(
        "psycopg pool: size=%d available=%d waiting=%d",
        stats["pool_size"], stats["pool_available"], stats["requests_waiting"],
    )
    return {
        "pool": stats,
        "max_lifetime_s": pool.max_lifetime,
        "approx_token_ttl_s": 3600,   # user; managed identity is 86400
    }
```

If `max_lifetime > approx_token_ttl_s`, log a warning. The mismatch is the most common cause of the "auth failed" Heisenbug after deploys.

## Example 4: Avoiding pool starvation

Wrong:
```python
@router.get("/recommendations/{sku}")
async def recommendations(sku: str, graph: GraphService = Depends(get_graph)):
    async with graph._pool.connection() as conn:
        details = await fetch_product_details(sku)   # external HTTP — pool slot held
        async with conn.cursor() as cur:
            await cur.execute("SELECT ... WHERE sku = %s", (sku,))
            return await cur.fetchall()
```

Right:
```python
@router.get("/recommendations/{sku}")
async def recommendations(sku: str, graph: GraphService = Depends(get_graph)):
    details = await fetch_product_details(sku)        # done before DB
    async with graph._pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute("SELECT ... WHERE sku = %s", (sku,))
            return await cur.fetchall()
```

Under load, the wrong version locks `max_size` connections for the duration of the HTTP latency × concurrent requests. The right version uses each connection for ~1ms of DB work.

## Example 5: Streaming a large export

```python
async def stream_all_recs(pool: AsyncConnectionPool, tenantid: str):
    schema = sql.Identifier(_mapping[tenantid])
    query = sql.SQL("SELECT account_id, sku, score FROM {s}.rec").format(s=schema)
    async with pool.connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(query)
            async for row in cur:    # backpressure-aware
                yield row
```

Use `async for` only when the result set is unbounded (full export, streaming response). For bounded queries (≤ a few hundred rows), `fetchall()` is simpler and fast enough.
