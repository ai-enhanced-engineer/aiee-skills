---
name: mongodb-atlas-patterns
description: MongoDB Atlas + PyMongo 4.8 production patterns — connection pooling, Atlas Search index design (text/autocomplete/fuzzy), aggregation pipelines with $search/$facet, collection caching with TTL, read/write concerns, sync-PyMongo-in-async bridging. Use for schema-less catalog services, full-text/fuzzy matching, and FastAPI services hitting MongoDB Atlas.
updated: 2026-04-25
---

# MongoDB Atlas + PyMongo Patterns

PyMongo 4.8 driver patterns specialized for MongoDB Atlas: connection pool sizing for Atlas tiers, Atlas Search index design for fuzzy matching, aggregation pipelines, and the right way to call sync PyMongo from async FastAPI.

## When to use

- Designing a catalog or product-matching service on MongoDB Atlas
- Tuning Atlas Search indexes for full-text or fuzzy product/SKU lookup
- Writing aggregation pipelines with `$search`, `$searchMeta`, or `$facet`
- Bridging sync PyMongo into async FastAPI endpoints (`asyncio.to_thread`)
- Evaluating a future migration to `AsyncMongoClient` (Motor is deprecated 2026-05-14)

For modern Python idioms and async fundamentals, see `arch-python-modern`. For wrapping sync calls in async endpoints, see `fastapi-patterns`.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Pool sizing | `maxPoolSize` is **per replica set member** — Atlas M10+ allows 1500 total; M0 caps at 500 |
| Singleton client | `MongoClient` is thread-safe and pool-managed; one instance per process (module-level or `app.state`) shares connections across requests. Per-request construction exhausts the Atlas connection cap quickly. |
| Atlas SRV URI | `mongodb+srv://` implicitly enables TLS; an explicit `tls=True` is redundant and can conflict with Atlas defaults. |
| Atlas Search first | `$search`/`$searchMeta` is only valid as the first stage of an aggregation pipeline — placing it later raises `MongoServerError` |
| Search index | Dual-mapping `string` + `autocomplete` on the same field for full-text + prefix queries |
| Fuzzy params | `maxEdits: 1` for ≤5 chars, `2` for longer; `prefixLength: 2–3`; `maxExpansions: 50` |
| Sync-in-async | Calling sync PyMongo directly inside `async def` blocks the event loop; `await asyncio.to_thread(coll.find_one, q)` offloads to the thread pool |
| Read concern | Atlas default `local`; use `majority` only for audit/financial reads |
| Write concern | Atlas default `w="majority"`. `w=1` returns once the primary acks before replication — fits ephemeral writes (logs, metrics) more than data that must survive a failover |
| Project early | `$limit` + `$project` early in pipeline — bound work, drop fields you don't need |

## Quick reference

```python
# Singleton client (module-level)
mongo_client: MongoClient | None = None

def create_mongo_client():
    global mongo_client
    mongo_client = MongoClient(
        os.environ["MONGODB_URI"],         # mongodb+srv://...
        maxPoolSize=50,
        minPoolSize=5,                     # keep persistent connections warm
        maxIdleTimeMS=30_000,
        serverSelectionTimeoutMS=30_000,   # ≥30s for Atlas failover
        socketTimeoutMS=30_000,
        waitQueueTimeoutMS=5_000,
        retryWrites=True,                  # Atlas defaults
        retryReads=True,
    )

# Atlas Search aggregation (sync PyMongo in async endpoint)
async def search_products(query: str, limit: int = 20) -> list[dict]:
    pipeline = [
        {"$search": {                       # MUST be first stage
            "index": "atlas-search-index",
            "compound": {
                "must": [{"text": {
                    "query": query,
                    "path": ["product_name", "description"],
                    "fuzzy": {"maxEdits": 1, "prefixLength": 2}
                }}],
                "filter": [{"equals": {"path": "status", "value": "active"}}],
            }
        }},
        {"$limit": limit},                  # bound work early
        {"$addFields": {"score": {"$meta": "searchScore"}}},
        {"$project": {"_id": 1, "product_name": 1, "sku": 1, "score": 1}},
    ]
    coll = get_database()["products"]
    return await asyncio.to_thread(lambda: list(coll.aggregate(pipeline)))
```

## Anti-patterns (top 5)

1. **`MongoClient(uri)` per request** → singleton; create once in lifespan
2. **Unbounded `.find()`/`.aggregate()`** → always `$limit` early in the pipeline
3. **Missing index on filter field** → `create_index([("field", ASCENDING)])` or Atlas UI; verify with `.explain("executionStats")`
4. **Sync PyMongo in `async def` without thread wrap** → `await asyncio.to_thread(coll.find_one, q)`
5. **`$search` not first stage** → MongoServerError; pre-filters go inside `compound.filter`, not as preceding `$match`

## Important: Motor deprecated 2026-05-14

If any code in this project (or sibling services) uses Motor (`motor.motor_asyncio.AsyncIOMotorClient`), plan migration to `AsyncMongoClient` (PyMongo 4.9+) before May 14, 2026. The current `example-service` uses sync PyMongo — no Motor migration needed, but evaluate `AsyncMongoClient` at the next major version bump.

See `reference.md` for full pattern catalogue, `examples.md` for project-grounded implementations.
