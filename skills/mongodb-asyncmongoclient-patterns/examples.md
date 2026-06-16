# MongoDB AsyncMongoClient Patterns Examples

Project-grounded implementations from `example-service/example-crud`.

---

## Example 1: AsyncMongoDBConnection Base + Index Manager (with bug fix)

`example_crud/aio/db.py` — imports and constructor inject the `AsyncMongoClient` and apply tz-aware codec options:

```python
# example_crud/aio/db.py
from pymongo import AsyncMongoClient, ReadPreference
from pymongo.asynchronous.collection import AsyncCollection
from pymongo.asynchronous.database import AsyncDatabase

# example_crud/aio/db.py (constructor)
class AsyncMongoDBConnection:
    def __init__(
        self,
        client: AsyncMongoClient,
        database_name: str,
        log_level=logging.INFO,
        read_preference=ReadPreference.PRIMARY_PREFERRED,
    ):
        self.client: AsyncMongoClient = client
        self.database_name: str = database_name
        self.readPreference: ReadPreference = read_preference
        self.codec_options = CodecOptions(tz_aware=True)   # ← critical for AwareDatetime
```

**Why it works**: client is injected (not constructed) — connection lifecycle stays at the FastAPI app boundary. `CodecOptions(tz_aware=True)` ensures every BSON datetime decodes with UTC `tzinfo`, which is required for Pydantic v2's `AwareDatetime` to validate without rejecting naive datetimes.

### Latent bug — missing `await` on `server_info()`

`example_crud/aio/db.py` defines `check_database` as a **sync** method calling an **async** method:

```python
# example_crud/aio/db.py (current code — has a bug)
def check_database(self):                          # ← not async
    try:
        server_info = self.client.server_info()    # ← returns a coroutine, not a dict
        if server_info:                            # ← coroutine is always truthy
            logger.debug("MongoDB is available.")
            return True
        ...
```

`AsyncMongoClient.server_info()` is async. Calling it without `await` returns an unawaited coroutine that always evaluates truthy, so the health check returns `True` even when Mongo is down. RuntimeWarning fires but the function silently lies.

**Fix**:

```python
async def check_database(self) -> bool:                # ← async + return type
    try:
        server_info = await self.client.server_info() # ← await
        if server_info:
            logger.debug("MongoDB is available.")
            return True
        logger.fatal("MongoDB is not reachable.")
        return False
    except Exception as e:
        logger.fatal("Check failed with exception: %s", e)
        return False
```

Caller updates: `if await crud.check_database(): ...` or `await asyncio.wait_for(crud.check_database(), timeout=2.0)` for a bounded probe.

### JSON-driven idempotent index manager

`example_crud/aio/db.py` — startup-time index reconciliation:

```python
# example_crud/aio/db.py
async def set_collection_indexes(self, collection_name: str) -> bool:
    index_config = await self._load_index_config(collection_name)   # aiofiles load
    if collection_name not in index_config:
        return False

    collection = self.get_collection(collection_name)
    existing_indexes = await collection.index_information()         # await — async!

    indexes = index_config[collection_name]
    all_succeeded = True
    for index_def in indexes:
        ok = await self._manage_single_index(
            collection, collection_name, index_def, existing_indexes,
        )
        all_succeeded = all_succeeded and ok
    return all_succeeded
```

`_manage_single_index` decides `skip` / `update` / `create` by comparing normalized key tuples against `index_information()`. Idempotent across startups; `background=True` in JSON options keeps reads/writes available during rebuild.

---

## Example 2: Per-Collection CRUD Subclass

`example_crud/aio/crud/transaction.py` — `TransactionCRUD` extends the base, sets `collection_name`, and lazy-inits `self.collection` via `@ensure_collection`:

```python
# example_crud/aio/crud/transaction.py
class TransactionCRUD(AsyncMongoDBConnection):
    def __init__(
        self,
        client: AsyncMongoClient,
        database_name: str,
        collection_name: str,
        log_level=logging.INFO,
    ):
        super().__init__(client, database_name, log_level)
        self.collection_name: str = collection_name
        self.collection: AsyncCollection | None = None     # lazy-init
```

CRUD methods use `await` for every DB call and validate at the boundary:

```python
# example_crud/aio/crud/transaction.py
@ensure_collection
async def get(self, transactionId: str) -> TransactionRead:
    document = await self.collection.find_one({"_id": transactionId})
    if not document:
        raise NotFoundException(transactionId)
    return TransactionRead(**document)                     # validate at boundary

# example_crud/aio/crud/transaction.py (note the to_list pattern)
@ensure_collection
async def list(self, limit=1000) -> list[TransactionRead]:
    cursor = await self.collection.find().to_list(limit)   # bounded
    return [TransactionRead(**document) for document in cursor]
```

> Note: `find().to_list(limit)` works (positional length); the recommended explicit form is `await self.collection.find().to_list(length=limit)`. For unbounded use `to_list(None)` — never `to_list(0)` (Motor idiom, invalid here).

---

## Example 3: Pydantic v2 BaseModel Override

`example_crud/schemas/common.py` — every domain model inherits this:

```python
# example_crud/schemas/common.py
class BaseModel(pydantic.BaseModel):
    def model_dump(self, include_nulls=False, **kwargs):
        kwargs["exclude_none"] = not include_nulls
        return super().model_dump(**kwargs)

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
```

- `exclude_none=True` default → `$set` documents only carry fields the caller actually provided. No accidental null overwrites.
- `extra="ignore"` → BSON fields not in the schema (Mongo internal metadata, legacy fields) drop on parse.
- `str_strip_whitespace=True` → input strings get trimmed before validation.

---

## Example 4: AwareDatetime Fields

`example_crud/schemas/transaction/fields.py`:

```python
# example_crud/schemas/transaction/fields.py
from pydantic import AwareDatetime, Field

# example_crud/schemas/transaction/fields.py
createdAt: AwareDatetime = Field(description="Time of record creation")
updatedAt: AwareDatetime = Field(description="Time of record update")
```

`AwareDatetime` rejects naive datetimes at validation time. This works end-to-end only because the base connection sets `CodecOptions(tz_aware=True)`:

- BSON datetime → Python `datetime` with UTC `tzinfo` (codec) → Pydantic validates as `AwareDatetime` (passes).
- Without `tz_aware=True`: BSON datetime → naive Python datetime → Pydantic rejects.

Pair with `datetime.now(tz=timezone.utc)` on writes (never `datetime.utcnow()`, naive and deprecated in Python 3.12+).

---

## Example 5: field_validator for Domain Rules

`example_crud/schemas/transaction/create.py`:

```python
# example_crud/schemas/transaction/create.py
from pydantic import Field, field_validator

# example_crud/schemas/transaction/create.py
@field_validator("emailAddress")
@classmethod
def validate_email(cls, v):
    if not re.match(EMAIL_PATTERN, v):
        raise ValueError(
            f"The email address '{v}' is not valid. "
            f"Please enter a valid email address (e.g., user@example.com)"
        )
    return v
```

`@classmethod` + `@field_validator` is the Pydantic v2 idiom. For multi-field cross-validation, use `@model_validator(mode="after")` instead. See `arch-python-modern` for selection criteria.

---

## Example 6: Index Configuration JSON

`example_crud/aio/mongo_collection_config/transactions.json` — colocated with the collection code, loaded at startup:

```json
{
  "transactions": [
    {"keys": {"_id": 1}, "options": {"name": "id_index"}},
    {"keys": {"emailAddress": 1}, "options": {"name": "email_index", "background": true}},
    {"keys": {"tenantId": 1}, "options": {"name": "tenant_index", "background": true}},
    {"keys": {"status": 1}, "options": {"name": "status_index", "background": true}},
    {"keys": {"createdAt": -1}, "options": {"name": "created_at_index", "background": true}},
    {"keys": {"updatedAt": -1}, "options": {"name": "updated_at_index", "background": true}}
  ]
}
```

- `background: true` keeps reads/writes available during rebuild on large collections (default for non-unique indexes since MongoDB 4.2; explicit flag is harmless).
- `keys` direction: `1` ascending, `-1` descending. Match the most common query order to avoid redundant sorts.
- Compound indexes follow the **ESR rule** (Equality, Sort, Range) — see `mongodb-atlas-patterns/reference.md` §1.

---

## Example 7: pyproject.toml — No Motor Dependency

`pyproject.toml`:

```toml
[tool.poetry.dependencies]
example-utils = { path = "../example-utils", develop = true }
python = "^3.11"
pymongo = "^4.15.0"          # ← no motor anywhere; AsyncMongoClient ships with PyMongo
pydantic = "^2.7.1"
aiofiles = "^25.1.0"         # ← used for non-blocking JSON config load
```

The project is on the correct side of the Motor 2026-05-14 deprecation — `pymongo = "^4.15.0"` includes `AsyncMongoClient` natively. No migration required.

---

## Example 8: End-to-End — Lifespan + Repository + Pydantic Validation

Composing all the project patterns into a runnable shape:

```python
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from pymongo import AsyncMongoClient

from example_crud.aio.crud.transaction import TransactionCRUD
from example_crud.schemas.transaction.read import TransactionRead

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongo_client = AsyncMongoClient(
        os.environ["MONGODB_URI"],
        maxPoolSize=100, minPoolSize=5,
        maxIdleTimeMS=30_000,
        serverSelectionTimeoutMS=30_000,
        retryWrites=True, retryReads=True,
    )
    # Eager verify (replaces broken sync check_database)
    ping = await app.state.mongo_client["app_db"].command("ping")
    assert ping["ok"] == 1

    # Reconcile indexes at startup
    crud = TransactionCRUD(
        client=app.state.mongo_client,
        database_name="app_db",
        collection_name="transactions",
    )
    await crud.setIndex()

    yield
    await app.state.mongo_client.close()

app = FastAPI(lifespan=lifespan)

def get_transaction_crud(request: Request) -> TransactionCRUD:
    return TransactionCRUD(
        client=request.app.state.mongo_client,
        database_name="app_db",
        collection_name="transactions",
    )

@app.get("/transactions/{tx_id}", response_model=TransactionRead)
async def read_tx(tx_id: str, crud: TransactionCRUD = Depends(get_transaction_crud)):
    # crud.get() returns TransactionRead — Pydantic-validated at the repository boundary
    return await crud.get(tx_id)
```

Highlights:
- One `AsyncMongoClient` per process, lifespan-managed.
- Eager `ping` surfaces startup connection errors cleanly.
- Indexes reconciled idempotently on every startup via JSON config.
- `TransactionCRUD` borrows the client; never constructs one.
- `response_model=TransactionRead` + repository-level `TransactionRead(**document)` = validation at both boundaries.

---

## Anti-patterns observed in the project

| File | Issue | Fix |
|---|---|---|
| `aio/db.py` | `check_database` is sync but calls async `server_info()` without `await` — coroutine always truthy, masks outages | Make `check_database` async, `await self.client.server_info()` |
| `aio/crud/transaction.py` | `find().to_list(limit)` uses positional arg; works but unclear | Prefer `to_list(length=limit)` for explicitness |
| `aio/db.py` | No transaction support exposed in base class | Add `with_transaction` helper if multi-doc atomicity is needed (Atlas replica set required) |

Patterns themselves are addressed in `reference.md` §2, §3, §7.

---

## Migration cheat sheet for sibling repos still on Motor

```python
# Old (Motor — deprecated 2026-05-14)
from motor.motor_asyncio import AsyncIOMotorClient
client = AsyncIOMotorClient(uri)
async for doc in client["db"]["coll"].find():
    ...
docs = await cursor.to_list(0)              # unbounded

# New (PyMongo 4.13+ AsyncMongoClient)
from pymongo import AsyncMongoClient
client = AsyncMongoClient(uri)
async for doc in client["db"]["coll"].find():
    ...
docs = await cursor.to_list(None)            # unbounded — to_list(0) is INVALID
```

API surface is intentionally near-identical to ease migration. Replace imports, swap `to_list(0)` → `to_list(None)`, replace `cursor.each(cb)` → `async for`, drop any `io_loop=` arguments. Performance improves 20–50% on cursor-heavy workloads.
