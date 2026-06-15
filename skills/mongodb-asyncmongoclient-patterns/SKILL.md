---
name: mongodb-asyncmongoclient-patterns
description: PyMongo 4.13+ AsyncMongoClient patterns (the official Motor replacement; Motor deprecated 2026-05-14) — async cursors with `async for`, AsyncCollection repository pattern, JSON-driven idempotent index management, Pydantic v2 + AwareDatetime documents, replica-set transactions via `with_transaction`. Use for async MongoDB CRUD layers in FastAPI services. Sibling to `mongodb-atlas-patterns` (sync + Atlas Search).
updated: 2026-04-27
---

# MongoDB AsyncMongoClient Patterns

This is the async sibling to `mongodb-atlas-patterns` (sync). Motor is deprecated 2026-05-14 — use `pymongo.AsyncMongoClient` (PyMongo 4.9+, stable 4.13+). Pool sizing, index design, aggregation rules, Atlas SRV — all unchanged from the sync skill; this one covers only what differs in async.

## When to use

- Async FastAPI services hitting MongoDB (CRUD layer, not search)
- Migrating off Motor before the 2026-05-14 deprecation
- Replica-set / Atlas transactions with `with_transaction` retry
- Pydantic v2 + `AwareDatetime` round-tripping through BSON
- JSON-driven idempotent index management at startup

For sync PyMongo, Atlas Search, `$search` pipelines → see `mongodb-atlas-patterns`. For Pydantic v2 idioms → `arch-python-modern`.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Import | `from pymongo import AsyncMongoClient` (not `motor.motor_asyncio`) |
| Single event loop | `AsyncMongoClient` is **not** thread-safe — one client per event loop, never share across threads |
| Singleton | One client per process via FastAPI lifespan + `app.state.mongo_client`; never per-request |
| Async cursor | `async for doc in collection.find(...)` for streaming |
| Bounded list | `await cursor.to_list(length=N)` — explicit length |
| Unbounded list | `await cursor.to_list(None)` — Motor's `to_list(0)` is **invalid** in PyMongo async |
| `await` everywhere | All collection ops are awaitable: `find_one`, `insert_one`, `update_one`, `index_information`, `create_index`, `server_info`, `command` |
| Repository pattern | Inject `AsyncMongoClient` into a base `AsyncMongoDBConnection`; per-collection CRUD subclasses set `collection_name` and lazy-init the `AsyncCollection` |
| `tz_aware` codec | `CodecOptions(tz_aware=True)` on every collection handle so BSON datetimes decode with UTC tzinfo (required for `AwareDatetime`) |
| JSON-driven indexes | Define indexes in `mongo_collection_config/{coll}.json`; `set_collection_indexes()` runs at startup, idempotent via `index_information()` |
| Transactions | `async with client.start_session() as s: await s.with_transaction(callback)` — auto-retries transient errors; callback **must be idempotent** |
| Task cancellation | Cancelling an asyncio task running PyMongo is a fatal interrupt — never reuse cursors/sessions after cancel |

## Quick reference

```python
from contextlib import asynccontextmanager
from pymongo import AsyncMongoClient
from pymongo.asynchronous.collection import AsyncCollection
from bson import CodecOptions

@asynccontextmanager
async def lifespan(app):
    app.state.mongo = AsyncMongoClient(
        os.environ["MONGODB_URI"],         # mongodb+srv://...
        maxPoolSize=100, minPoolSize=5,    # async drives more concurrency than sync
        maxIdleTimeMS=30_000,
        serverSelectionTimeoutMS=30_000,
        retryWrites=True, retryReads=True,
    )
    await app.state.mongo[db_name].command("ping")  # eager verify
    yield
    await app.state.mongo.close()

class TransactionCRUD:
    def __init__(self, client: AsyncMongoClient, db: str, coll: str):
        self.coll: AsyncCollection = client.get_database(db).get_collection(
            coll, codec_options=CodecOptions(tz_aware=True),
        )
    async def get(self, _id: str) -> dict | None:
        return await self.coll.find_one({"_id": _id})
    async def list(self, limit: int = 1000) -> list[dict]:
        return await self.coll.find().to_list(length=limit)
    async def stream(self):
        async for doc in self.coll.find({"status": "active"}):
            yield doc
```

## Anti-patterns (top 5)

1. **`from motor.motor_asyncio import AsyncIOMotorClient`** → deprecated 2026-05-14; switch to `from pymongo import AsyncMongoClient`
2. **Missing `await` on async methods** (e.g., `self.client.server_info()` in a health-check) → silently returns a coroutine, evaluates truthy, hides outages. Always `await` — see project's `check_database` bug in examples.md
3. **`await cursor.to_list(0)`** → invalid in PyMongo async (Motor idiom). Use `to_list(None)` for unbounded or `to_list(length=N)`
4. **Sync `MongoClient` mixed into async code** → blocks event loop. Use `AsyncMongoClient` end-to-end; for sync legacy bridge wrap with `asyncio.to_thread` (see `mongodb-atlas-patterns`)
5. **Returning raw BSON `dict` from a repository** → no validation, no type safety. Validate at the boundary: `return TransactionRead(**document)`

Migration cheat sheet, full Motor → PyMongo Async API mapping, Pydantic v2 + BSON round-tripping, and transaction details live in `reference.md`. Project-grounded code (including the latent `check_database` missing-`await` bug + fix) lives in `examples.md`.

## See also

- `mongodb-atlas-patterns` — sync sibling; Atlas Search, `$search` pipelines, pool sizing, write concerns (all foundations transfer unchanged)
- `arch-python-modern` — Pydantic v2 validators, `field_validator` vs `model_validator`, modern async idioms
- `fastapi-patterns` — lifespan, dependency injection, app.state singletons
