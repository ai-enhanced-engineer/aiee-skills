# MongoDB AsyncMongoClient Patterns Reference

Detailed reference for PyMongo 4.13+ `AsyncMongoClient` — the async sibling to `mongodb-atlas-patterns`. This document covers only what differs in async; for pool sizing, Atlas SRV behaviour, write concerns, `$project` / `$limit` discipline, and Atlas Search index design, read `mongodb-atlas-patterns/reference.md`.

---

## 1. Motor Deprecation Timeline

| Date | Event |
|---|---|
| 2026-05-14 | Motor (`motor.motor_asyncio.AsyncIOMotorClient`) officially deprecated |
| 2026-05-14 → 2027-05-14 | Critical bug fixes only — no feature work, no Python version support |
| 2027-05-14 | End of life — Motor unsupported |

Replacement: `from pymongo import AsyncMongoClient` — available since PyMongo 4.9, stable from 4.13. The `example-service/example-crud` project pins `pymongo = "^4.15.0"` and never depended on Motor.

### Migration mapping (full table)

| Motor API | PyMongo Async API | Notes |
|---|---|---|
| `from motor.motor_asyncio import AsyncIOMotorClient` | `from pymongo import AsyncMongoClient` | Core import change |
| `AsyncIOMotorClient(io_loop=loop)` | `AsyncMongoClient()` | `io_loop` parameter **removed** — asyncio loop auto-detected |
| `AsyncIOMotorClient(host, port)` | `AsyncMongoClient(host, port)` | Same kwargs otherwise |
| `client.get_database(name)` | `client.get_database(name)` | Identical |
| `cursor.each(callback)` | `async for doc in cursor:` | `each()` does not exist in PyMongo async |
| `await cursor.to_list(0)` | `await cursor.to_list(None)` | `to_list(0)` is **invalid** in PyMongo async |
| `await cursor.to_list(100)` | `await cursor.to_list(length=100)` | Explicit kwarg preferred |
| `MotorGridOut.stream_to_handler()` | No equivalent | Implement manually with streaming reads |
| `AsyncIOMotorCollection` | `pymongo.asynchronous.collection.AsyncCollection` | Type annotation change |
| `AsyncIOMotorDatabase` | `pymongo.asynchronous.database.AsyncDatabase` | Type annotation change |
| `AsyncIOMotorCursor` | `pymongo.asynchronous.collection.AsyncCursor` | Type annotation change |
| Thread-pool executor model | Native asyncio I/O | 20–50% faster (112 MB/s vs 74 MB/s for large cursor reads) |
| Thread-safe client | **Not** thread-safe | `AsyncMongoClient` belongs to one event loop |

---

## 2. AsyncMongoClient API Tour

### Constructor differences vs Motor

```python
from pymongo import AsyncMongoClient

client = AsyncMongoClient(
    os.environ["MONGODB_URI"],
    maxPoolSize=100,                  # async drives more concurrency than sync — tune higher
    minPoolSize=5,
    maxIdleTimeMS=30_000,
    serverSelectionTimeoutMS=30_000,  # Atlas failover floor
    retryWrites=True, retryReads=True,
)
```

- `__init__()` does **not** block — connection is deferred to first operation.
- `connect` parameter is **not supported** (unlike sync `MongoClient`).
- `io_loop` parameter does **not exist** (was a Motor concept).
- `tz_aware` constructor parameter is accepted, but prefer `CodecOptions(tz_aware=True)` per-collection (project pattern).
- `AsyncMongoClient` is **not thread-safe** — must be used by a single event loop only.

### Awaitable vs sync methods

Async methods on `AsyncMongoClient` (require `await`):
```
close(), list_databases(), list_database_names(), drop_database(),
server_info(), watch(), bulk_write()
```

Sync accessors on `AsyncMongoClient` (no `await`):
```
start_session()       # returns AsyncClientSession (session is async)
get_database()
get_default_database()
__getitem__()         # client["db"]
__getattr__()         # client.db
```

> Mistake to watch for: `server_info()` is **async**. Calling it from sync code (e.g., a sync health-check method) returns an unawaited coroutine that always evaluates truthy — masking real outages. See `examples.md` §1 for the project's latent bug.

### `aconnect()` — eager connection verification

```python
client = await AsyncMongoClient(uri).aconnect()
```

Use to surface connection errors at startup. Equivalent and more idiomatic: a lifespan-time `await client[db].command("ping")`.

### Task cancellation gotcha

> "Cancelling an asyncio Task that is running a PyMongo operation is treated as a fatal interrupt."

Connections, cursors, and transactions are safely closed but subsequent use of those resources raises errors. Never reuse a cursor or session after cancellation.

---

## 3. Async Repository Pattern

The project uses a two-layer pattern (`AsyncMongoDBConnection` base + per-collection CRUD subclass):

### Layer 1 — base connection wrapper

```python
class AsyncMongoDBConnection:
    def __init__(
        self,
        client: AsyncMongoClient,                 # injected, not constructed
        database_name: str,
        read_preference=ReadPreference.PRIMARY_PREFERRED,
    ):
        self.client = client
        self.database_name = database_name
        self.codec_options = CodecOptions(tz_aware=True)   # tz-aware everywhere

    def get_db(self) -> AsyncDatabase:
        return self.client.get_database(
            self.database_name,
            read_preference=self.readPreference,
            codec_options=self.codec_options,
        )

    def get_collection(self, name: str) -> AsyncCollection:
        return self.get_db().get_collection(name, codec_options=self.codec_options)
```

Injection (not construction) keeps connection lifecycle at the application boundary — FastAPI lifespan creates and closes the client; CRUD classes only borrow it. Testing becomes trivial (mock the client).

### Layer 2 — per-collection CRUD subclass

```python
class TransactionCRUD(AsyncMongoDBConnection):
    def __init__(self, client, database_name, collection_name):
        super().__init__(client, database_name)
        self.collection_name = collection_name
        self.collection: AsyncCollection | None = None    # lazy-init

    @ensure_collection                                    # decorator sets self.collection
    async def get(self, _id: str) -> TransactionRead:
        document = await self.collection.find_one({"_id": _id})
        if not document:
            raise NotFoundException(_id)
        return TransactionRead(**document)                # validate at boundary
```

The `@ensure_collection` decorator handles lazy-init of `self.collection = self.get_collection(self.collection_name)` on first call.

### FastAPI dependency injection

```python
def get_transaction_crud(request: Request) -> TransactionCRUD:
    return TransactionCRUD(
        client=request.app.state.mongo_client,
        database_name=settings.DB_NAME,
        collection_name="transactions",
    )

@app.get("/transactions/{tx_id}")
async def read_tx(tx_id: str, crud: TransactionCRUD = Depends(get_transaction_crud)):
    return await crud.get(tx_id)
```

---

## 4. Pydantic v2 + MongoDB Document Mapping

### Project `BaseModel` override

```python
class BaseModel(pydantic.BaseModel):
    def model_dump(self, include_nulls=False, **kwargs):
        kwargs["exclude_none"] = not include_nulls
        return super().model_dump(**kwargs)

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
```

- `exclude_none=True` by default → cleaner `$set` documents (no null-field overwrites).
- `extra="ignore"` → BSON fields not in the schema (e.g., internal metadata) are silently dropped on parse — avoids fighting MongoDB's flexible schema.
- `str_strip_whitespace=True` → guards against whitespace-padded inputs.

### `AwareDatetime` for timestamps

```python
from pydantic import AwareDatetime
createdAt: AwareDatetime
updatedAt: AwareDatetime
```

- Pydantic v2's `AwareDatetime` requires the value to carry timezone info — rejects naive datetimes at validation time.
- Pairs with `CodecOptions(tz_aware=True)` — BSON datetime → Python `datetime` with UTC `tzinfo` → `AwareDatetime` validates cleanly.
- Always use `datetime.now(tz=timezone.utc)` (not `datetime.utcnow()`, which is naive and deprecated in Python 3.12+).

### `_id` as string vs `ObjectId`

The project uses string UUIDs as `_id` (set via `get_uuid()` on insert), not `ObjectId`. This avoids the BeforeValidator dance most ObjectId-based projects need:

```python
# Project pattern — _id is already a string in BSON
return TransactionRead(**document)
```

If you do use `ObjectId`, add a `BeforeValidator(str)` to coerce on read, or use `bson.ObjectId` + `pydantic_core.core_schema` for round-trip support.

### `field_validator` for domain rules

```python
@field_validator("emailAddress")
@classmethod
def validate_email(cls, v):
    if not re.match(EMAIL_PATTERN, v):
        raise ValueError(...)
    return v
```

See `arch-python-modern` for `field_validator` vs `model_validator` selection, ordering, and `mode="before"` / `mode="after"` semantics.

---

## 5. JSON-Driven Index Management at Startup

### Pattern

Indexes are defined per-collection in JSON files colocated with code:

```json
{
  "transactions": [
    {"keys": {"_id": 1}, "options": {"name": "id_index"}},
    {"keys": {"emailAddress": 1}, "options": {"name": "email_index", "background": true}},
    {"keys": {"createdAt": -1}, "options": {"name": "created_at_index", "background": true}}
  ]
}
```

Called at startup: `await crud.setIndex()` → `await super().set_collection_indexes("transactions")`.

### Idempotent algorithm (`set_collection_indexes`)

1. Load JSON config via `aiofiles.open(...)` — non-blocking file read.
2. `existing = await collection.index_information()` — fetch current server state.
3. For each defined index: normalize keys (sorted tuples) and compare against existing.
4. Action:
   - `skip` — name+keys match
   - `update` — name matches, keys differ → drop + recreate
   - `create` — new index; first drop any name-conflicts on same keys
5. `await collection.create_index(key_tuples, **options)`.

### Trade-offs vs migration tooling

| Pro | Con |
|---|---|
| Idempotent — safe to run every startup | No rollback — drops on a large collection block until rebuild completes |
| Single source of truth, lives next to code | No history — old definitions lost when JSON changes |
| No separate migration runner needed | Can't conditionally skip indexes per environment |

Mitigation: `background=True` keeps reads/writes available during rebuild (default for non-unique indexes since MongoDB 4.2; explicit flag is harmless).

---

## 6. Async Aggregation

```python
# Streaming
cursor = collection.aggregate(pipeline)        # returns AsyncCommandCursor
async for doc in cursor:
    process(doc)

# Bounded materialization
docs = await collection.aggregate(pipeline).to_list(length=N)
```

Pipeline rules (`$project` / `$limit` early, `$search` first stage, `$facet` size limits) are identical to sync — see `mongodb-atlas-patterns/reference.md` §3.

---

## 7. Transactions

Replica-set required (Atlas always is one). Standalone MongoDB does not support transactions.

### Preferred — `with_transaction` (auto-retry)

```python
async def callback(session):
    await col_a.insert_one(doc_a, session=session)
    await col_b.update_one(filter, update, session=session)

async with client.start_session() as session:
    await session.with_transaction(callback)
```

- Auto-retries on `TransientTransactionError` and `UnknownTransactionCommitResult`.
- **Callback must be idempotent** — may be invoked multiple times.
- No parallel operations within a transaction — sequence everything.

### Manual — explicit start_transaction

```python
async with client.start_session() as session:
    async with session.start_transaction(
        write_concern=WriteConcern("majority"),
        read_concern=ReadConcern("local"),
    ):
        await col_a.insert_one(doc_a, session=session)
        await col_b.update_one(filter, update, session=session)
        # commits on clean exit; aborts on exception
```

### Bound session — eliminates per-call `session=` argument

```python
async with client.start_session() as session:
    async with session.bind():
        await col_a.insert_one(doc_a)              # session bound implicitly
        await col_b.update_one(filter, update)
```

### Critical rules

- `AsyncClientSession` is **not** thread-safe or fork-safe — one task at a time.
- Use sessions only with the `AsyncMongoClient` that created them.
- `retryWrites=True` (Atlas default) handles single-op retries; transactions need `with_transaction` for callback-level retry.

---

## 8. What This Skill Does NOT Cover (See `mongodb-atlas-patterns`)

| Topic | Where |
|---|---|
| Pool sizing per Atlas tier | `mongodb-atlas-patterns/reference.md` §1 |
| Atlas SRV URI / TLS behaviour | `mongodb-atlas-patterns/reference.md` §1 |
| Atlas Search (`$search`, `$searchMeta`, fuzzy, autocomplete) | `mongodb-atlas-patterns/reference.md` §2–3 |
| `$facet` 100 MB / 16 MiB limits | `mongodb-atlas-patterns/reference.md` §3 |
| Read/write concern selection | `mongodb-atlas-patterns/reference.md` §5 |
| Atlas auto-failover behaviour with `retryWrites` | `mongodb-atlas-patterns/reference.md` §5 |
| Sync PyMongo + `asyncio.to_thread` legacy bridge | `mongodb-atlas-patterns/reference.md` §6 |

---

## References

- [Migrate to PyMongo Async — MongoDB Docs](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)
- [PyMongo 4.13 Async Tutorial](https://pymongo.readthedocs.io/en/4.13.0/async-tutorial.html)
- [PyMongo 4.15 AsyncMongoClient API](https://pymongo.readthedocs.io/en/4.15.1/api/pymongo/asynchronous/mongo_client.html)
- [PyMongo Transactions](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/crud/transactions/)
- [FastAPI + PyMongo Integration](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/integrations/fastapi-integration/)
- [PyMongo Dates & Times](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/data-formats/dates-and-times/)
- Foundation: `mongodb-atlas-patterns`, `arch-python-modern`, `fastapi-patterns`
