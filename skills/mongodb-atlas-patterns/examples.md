# MongoDB Atlas + PyMongo Patterns Examples

Project-grounded implementations from `example-service`.

---

## Example 1: Project's Singleton Client (annotated)

The project's `app/crud/db.py` shows the right shape — module-level singleton, lifespan-managed, with stale-on-error caching:

```python
# app/crud/db.py — actual code (annotated)
from pymongo import MongoClient, errors
from settings.factories import settings

mongo_client: MongoClient = None    # module-level singleton

def create_mongo_client(connection_string: str = settings.MONGODB_PRODUCT_CATALOG_CONNECTION_STRING):
    """Creates a MongoDB client instance."""
    global mongo_client
    try:
        mongo_client = MongoClient(
            connection_string,
            datetime_conversion="DATETIME_AUTO",
            maxPoolSize=int(settings.MONGODB_MAX_POOL_SIZE),
            minPoolSize=1,                          # ← LOW; recommend 5+ for warm pool
            maxIdleTimeMS=45000,
            socketTimeoutMS=30000,
            serverSelectionTimeoutMS=5000,          # ← LOW; recommend ≥30000 for Atlas failover
            connectTimeoutMS=10000,
        )
        logger.debug("MongoDB client created.")
    except errors.ConnectionFailure:
        logger.exception("Failed to connect to MongoDB")
        raise

def get_client() -> MongoClient:
    """Get the global MongoDB client instance."""
    if not mongo_client:
        create_mongo_client()
    return mongo_client

def shutdown_mongo_client():
    global mongo_client
    if mongo_client:
        mongo_client.close()
        mongo_client = None
```

**What works**: Module-level singleton, called from `lifespan`, idempotent `get_client()` lazy init, clean shutdown.

**Two tunings to consider**:
1. `minPoolSize=1` is low — first few requests after pool drain pay TCP+TLS handshake cost. Recommend `minPoolSize=5`.
2. `serverSelectionTimeoutMS=5000` is too short for Atlas auto-failover (10–30s). Set to 30000 or the service will start failing immediately on every primary election.

---

## Example 2: Collection-Names Cache with `asyncio.Lock` (project pattern — recommended)

`app/crud/db.py:get_collection_names()` is the right pattern for caching expensive metadata calls:

```python
# app/crud/db.py — actual code
import asyncio, time

_collection_names_cache: dict = {"names": None, "timestamp": 0}
_COLLECTION_CACHE_TTL = 300  # 5 minutes
_collection_names_cache_lock = asyncio.Lock()

async def get_collection_names() -> list[str]:
    """
    Get list of collection names with caching to avoid per-request DB metadata calls.
    Uses asyncio.Lock to prevent race conditions in concurrent async contexts.
    """
    async with _collection_names_cache_lock:
        current_time = time.time()
        if (
            _collection_names_cache["names"] is not None
            and current_time - _collection_names_cache["timestamp"] < _COLLECTION_CACHE_TTL
        ):
            return _collection_names_cache["names"]

        try:
            db = get_database()
            names = db.list_collection_names()
            _collection_names_cache["names"] = names
            _collection_names_cache["timestamp"] = current_time
            return names
        except Exception:
            logger.exception("Failed to get collection names")
            # Return cached names even if expired on error (graceful degradation)
            if _collection_names_cache["names"] is not None:
                logger.warning("Returning stale collection names cache due to error")
                return _collection_names_cache["names"]
            raise
```

**Why it's correct**:
- `asyncio.Lock` serializes the read-check-write — under concurrent requests, only one coroutine refreshes; others wait and get the fresh value.
- `time.time()` is acceptable here (not inside a span where wall-clock jumps would matter); for elapsed measurement use `time.monotonic()`.
- Stale-on-error: if `list_collection_names()` fails, return the previous cache rather than 500. This is graceful degradation against transient Atlas blips.

**Minor improvement**: switch to `time.monotonic()` so a wall-clock leap (NTP correction) doesn't expire the cache prematurely.

---

## Example 3: Atlas Search Aggregation — Project Pattern

The project's `app/services/matching.py` runs Atlas Search aggregations. Distilled pattern:

```python
# app/services/matching.py — extracted pattern
import asyncio
from pymongo.collection import Collection

async def search_products_atlas(
    coll: Collection,
    query: str,
    *,
    index_name: str = "atlas-search-index",
    category: str | None = None,
    limit: int = 25,
) -> list[dict]:
    """Run Atlas Search with optional category filter, fuzzy matching, score projection."""
    compound: dict = {
        "must": [{
            "text": {
                "query": query,
                "path": ["product_name", "description"],
                "fuzzy": {"maxEdits": 1, "prefixLength": 2, "maxExpansions": 50},
            }
        }]
    }
    if category:
        compound["filter"] = [{"equals": {"path": "category", "value": category}}]

    pipeline = [
        {"$search": {"index": index_name, "compound": compound}},   # MUST be first
        {"$limit": limit},                                           # bound work early
        {"$addFields": {"score": {"$meta": "searchScore"}}},
        {"$project": {"_id": 1, "product_name": 1, "sku": 1, "category": 1, "score": 1}},
    ]

    # Sync PyMongo + async FastAPI bridge
    return await asyncio.to_thread(lambda: list(coll.aggregate(pipeline)))
```

**Highlights**:
- `$search` first stage — required.
- `$limit` immediately after → bounds the work for everything downstream.
- `$addFields` for the search score (it's not returned by default).
- `$project` to drop heavy fields before returning to the app.
- `asyncio.to_thread(lambda: list(...))` — `aggregate()` returns a sync cursor; `list()` materializes inside the worker thread.

---

## Example 4: Combining Atlas Search + thefuzz Re-ranking

The project does an Atlas Search first pass, then uses `thefuzz` for fine-grained re-ranking. Pattern:

```python
import asyncio
from thefuzz import fuzz

async def search_and_rerank(
    coll: Collection,
    query: str,
    *,
    candidate_limit: int = 50,
    final_limit: int = 10,
) -> list[dict]:
    """Atlas Search broad recall → thefuzz precise re-ranking → top N."""

    # Stage 1: Atlas Search broad pass
    candidates = await search_products_atlas(coll, query, limit=candidate_limit)

    # Stage 2: thefuzz re-ranking — CPU-bound, dispatch to thread pool concurrently
    score_tasks = [
        asyncio.to_thread(fuzz.token_sort_ratio, query, c["product_name"])
        for c in candidates
    ]
    fuzz_scores = await asyncio.gather(*score_tasks)

    # Stage 3: combine atlas score + fuzz score, sort, return top N
    for c, fs in zip(candidates, fuzz_scores, strict=True):
        c["fuzz_score"] = fs
        c["combined_score"] = c["score"] * 0.4 + fs / 100 * 0.6   # weighted

    candidates.sort(key=lambda d: d["combined_score"], reverse=True)
    return candidates[:final_limit]
```

`asyncio.gather` dispatches all `thefuzz` calls in parallel through the thread pool — wall time = (candidate_count / pool_size) × per-call instead of summed serial.

---

## Example 5: Health Check Probe (project pattern)

```python
# app/services/health/mongo_db_checker.py — pattern
import asyncio
from pymongo.errors import PyMongoError

async def check_mongodb_health(client) -> dict:
    """Atlas-aware MongoDB health probe — does not block event loop."""
    try:
        # Run admin command in thread pool — sync PyMongo
        result = await asyncio.to_thread(
            client.admin.command, "ping"
        )
        return {"status": "ok", "ping": result.get("ok") == 1}
    except PyMongoError as e:
        return {"status": "error", "error": type(e).__name__, "detail": str(e)}
```

`admin.command("ping")` is the canonical MongoDB liveness probe — it doesn't require any specific database/collection access, and Atlas always responds quickly when a primary is reachable.

---

## Example 6: Atlas Search Index Definition (recommended for project)

The project uses two Atlas Search indexes (`atlas-search-index`, `atlas-search-ref-index`). Recommended definition for product matching:

```json
{
  "name": "atlas-search-index",
  "analyzer": "lucene.standard",
  "searchAnalyzer": "lucene.standard",
  "mappings": {
    "dynamic": false,
    "fields": {
      "product_name": [
        {
          "type": "string",
          "analyzer": "lucene.standard"
        },
        {
          "type": "autocomplete",
          "analyzer": "lucene.standard",
          "tokenization": "edgeGram",
          "minGrams": 3,
          "maxGrams": 15,
          "foldDiacritics": true
        }
      ],
      "description": {
        "type": "string",
        "analyzer": "lucene.english"
      },
      "sku": {
        "type": "token"
      },
      "category": {
        "type": "token"
      },
      "tenant_id": {
        "type": "token"
      },
      "status": {
        "type": "token"
      }
    }
  }
}
```

**Why these choices**:
- `product_name` dual-indexed — `string` for full-text fuzzy queries, `autocomplete` for type-ahead.
- `description` uses `lucene.english` (stemming + stopwords) since descriptions are prose.
- `sku`, `category`, `tenant_id`, `status` are `token` type — exact match for filters, no analysis cost.
- `dynamic: false` — explicit field schema is faster to maintain and prevents accidental index of large unused fields.
- `foldDiacritics: true` on autocomplete handles "café" / "cafe" equivalence.

---

## Anti-patterns observed in the project

| File | Issue | Fix |
|---|---|---|
| `app/crud/db.py` | `serverSelectionTimeoutMS=5000` too short for Atlas (auto-failover takes 10–30s) | Raise to 30000; otherwise every primary election causes user-facing failures |
| `app/crud/db.py` | `minPoolSize=1` — first req after pool drain pays handshake cost | Raise to 5–10 for a warm pool |
| `app/crud/db.py` | Uses `time.time()` for TTL math — not monotonic | Switch to `time.monotonic()` so NTP corrections don't expire cache |
| `app/routers/product.py` | `mongo_client=Depends(get_client)` parameter is unused (`# noqa: ARG001`) | Either inject a typed dep that actually returns the client, or remove |
| `app/routers/product.py` | Bare `except Exception` returns 500 with hardcoded message | Use `@app.exception_handler(Exception)` registered globally (see `fastapi-patterns`) |

These are project-specific notes — the patterns themselves are addressed in `reference.md`.

---

## Migration Note: Motor → AsyncMongoClient (deadline 2026-05-14)

If any sibling repos use Motor, plan migration to `AsyncMongoClient` (PyMongo 4.9+):

```python
# Old (Motor — deprecated 2026-05-14)
from motor.motor_asyncio import AsyncIOMotorClient
client = AsyncIOMotorClient(uri)
doc = await client["db"]["coll"].find_one({"_id": id})

# New (PyMongo 4.9+ AsyncMongoClient)
from pymongo import AsyncMongoClient
client = AsyncMongoClient(uri)
doc = await client["db"]["coll"].find_one({"_id": id})
```

API surface is intentionally near-identical to ease migration. `example-service` itself uses sync PyMongo + `asyncio.to_thread`, so no immediate Motor migration burden — but evaluate `AsyncMongoClient` at the next major bump for the small (~0.1ms/op) latency saving.
