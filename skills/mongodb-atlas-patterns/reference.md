# MongoDB Atlas + PyMongo Patterns Reference

Detailed reference for PyMongo 4.8 + MongoDB Atlas production patterns. Companion to `SKILL.md`.

---

## 1. PyMongo 4.8 Connection Pooling

### MongoClient parameters

| Parameter | Default | Recommended (Atlas) | Purpose |
|---|---|---|---|
| `maxPoolSize` | 100 | 50–100 (per Atlas tier) | Max concurrent connections per server |
| `minPoolSize` | 0 | 5–10 | Persistent connections to maintain |
| `maxIdleTimeMS` | None | 30000–60000 | Close idle connections above this age |
| `maxConnecting` | 2 | 2 (default) | Concurrent connection establishment |
| `connectTimeoutMS` | 20000 | 20000–30000 | TCP connection timeout |
| `socketTimeoutMS` | None | 30000 | Per-operation network timeout |
| `serverSelectionTimeoutMS` | 30000 | 30000 | Wait for available server (failover-aware) |
| `waitQueueTimeoutMS` | None | 5000 | Wait for pool slot when all busy |
| `retryWrites` | True | True | Auto-retry transient write failures |
| `retryReads` | True | True | Auto-retry transient read failures |

### Atlas SRV connection string

```python
client = MongoClient(
    "mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&w=majority",
    maxPoolSize=50,
    minPoolSize=5,
    maxIdleTimeMS=30_000,
    serverSelectionTimeoutMS=30_000,
    socketTimeoutMS=30_000,
    waitQueueTimeoutMS=5_000,
)
```

**Atlas-specific behavior**:
- `mongodb+srv://` implicitly enables TLS; an explicit `tls=True` is redundant and can conflict with Atlas defaults.
- `maxPoolSize` applies **per replica set member**. A 3-node cluster with `maxPoolSize=50` opens up to 150 connections.
- Atlas tiers: M0 free → 500 total; M10 → 1500; M30+ → 3000+.
- `serverSelectionTimeoutMS=30000` is the floor for Atlas — failovers take 10–30s.
- `maxIdleTimeMS` should sit below your load balancer / firewall idle cutoff (default 30s on most Azure/AWS LBs).

### Pool sizing rule of thumb

- I/O-heavy read service: `maxPoolSize = 50–100`
- CPU-bound service: `maxPoolSize = cpu_count × 4`, capped at 50
- Monitor Atlas's "Current Connections" — alert at sustained >80% of `maxPoolSize`

### Singleton lifecycle

`MongoClient` is thread-safe and meant to be long-lived. Create once at startup, close once at shutdown.

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pymongo import MongoClient

@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongo = MongoClient(os.environ["MONGODB_URI"], maxPoolSize=50, minPoolSize=5)
    yield
    app.state.mongo.close()

app = FastAPI(lifespan=lifespan)
```

---

## 2. Atlas Search Index Design

### Index types

| Type | Input | Purpose |
|---|---|---|
| `string` | String | Full-text search with analyzers, stemming, synonyms |
| `autocomplete` | String | Prefix/infix completion (search-as-you-type) |
| `token` | String | Exact-value faceting and filtering |
| `number` | Int / Double | Range queries, numeric facets |

### Recommended index for product matching

Dual-mapping a name field as both `string` and `autocomplete` enables full-text **and** prefix queries on the same data:

```json
{
  "analyzer": "lucene.standard",
  "searchAnalyzer": "lucene.standard",
  "mappings": {
    "dynamic": false,
    "fields": {
      "product_name": [
        {"type": "string", "analyzer": "lucene.standard"},
        {"type": "autocomplete", "analyzer": "lucene.standard",
         "tokenization": "edgeGram", "minGrams": 3, "maxGrams": 15,
         "foldDiacritics": true}
      ],
      "sku": {"type": "token"},
      "category": {"type": "token"},
      "score": {"type": "number"}
    }
  }
}
```

### Analyzer choice

| Analyzer | Use for |
|---|---|
| `lucene.standard` | Mixed-language product names |
| `lucene.keyword` | SKUs, part numbers (no tokenization) |
| `lucene.english` | English prose descriptions (stemming + stopwords) |
| `lucene.whitespace` | Case-sensitive codes |

### Autocomplete tokenization

| Strategy | Tokens from "cable" | Use for |
|---|---|---|
| `edgeGram` (default) | `ca`, `cab`, `cabl`, `cable` | Left-anchored prefix |
| `rightEdgeGram` | `le`, `ble`, `able`, `cable` | Suffix lookup |
| `nGram` | All sliding windows | Infix anywhere in token |

**Sizing**: `minGrams: 3, maxGrams: 15` is the recommended starting point. `minGrams: 2` creates very large noisy indexes. `maxGrams > 15` degrades performance.

### Fuzzy parameters

```python
{"$search": {
    "index": "atlas-search-index",
    "text": {
        "query": "cabble",
        "path": "product_name",
        "fuzzy": {
            "maxEdits": 1,        # Levenshtein distance: 1 or 2
            "prefixLength": 2,    # First N chars must match exactly
            "maxExpansions": 50   # Cap on candidate terms
        }
    }
}}
```

**Tuning**:
- `maxEdits: 1` for short queries (≤5 chars); `maxEdits: 2` only for longer strings.
- `prefixLength: 2–3` prevents wildcard explosion on very short input.
- `maxExpansions: 50` is the Atlas default; raising costs both index time and memory.
- Always pair fuzzy with `$limit` early.

### Compound operator

```python
{"$search": {
    "index": "atlas-search-index",
    "compound": {
        "must":     [{"text": {"query": q, "path": "product_name",
                              "fuzzy": {"maxEdits": 1, "prefixLength": 2}}}],
        "should":   [{"text": {"query": q, "path": "product_name",
                              "score": {"boost": {"value": 2.0}}}}],
        "filter":   [{"equals": {"path": "category", "value": cat}}],
        "mustNot":  [{"equals": {"path": "status", "value": "discontinued"}}],
    }
}}
```

- `must`: filter + scoring (must satisfy)
- `should`: boost score, no filter
- `filter`: narrow without affecting scores
- `mustNot`: exclude

---

## 3. Aggregation Pipelines with $search and $facet

### $search rules

- `$search`/`$searchMeta` **must be the first stage** when used. Atlas Search runs as a separate service; later stages cause `MongoServerError`.
- Pre-filters belong inside `compound.filter`, **not** in a `$match` before `$search`.

### Search pipeline structure

```python
def build_search_pipeline(query: str, index: str, category: str | None = None,
                         limit: int = 20) -> list[dict]:
    search_stage: dict = {
        "$search": {
            "index": index,
            "compound": {
                "must": [{"text": {
                    "query": query,
                    "path": ["product_name", "description"],
                    "fuzzy": {"maxEdits": 1, "prefixLength": 2}
                }}]
            }
        }
    }
    if category:
        search_stage["$search"]["compound"]["filter"] = [
            {"equals": {"path": "category", "value": category}}
        ]
    return [
        search_stage,
        {"$limit": limit},                                  # bound work
        {"$addFields": {"score": {"$meta": "searchScore"}}},
        {"$project": {"_id": 1, "product_name": 1, "sku": 1, "score": 1}},
    ]
```

### $searchMeta for facet counts

```python
[
  {"$searchMeta": {
      "facet": {
          "operator": {"text": {"query": q, "path": "product_name"}},
          "facets": {
              "categoryFacet": {"type": "string", "path": "category", "numBuckets": 10}
          }
      }
  }}
]
# Returns: {"count": {"lowerBound": N}, "facet": {"categoryFacet": {"buckets": [...]}}}
```

### $facet (aggregation, distinct from Atlas Search facet operator)

Hard limits:
- Each sub-pipeline result capped at **100 MB** (`allowDiskUse` does not lift this).
- Final output capped at **16 MiB** BSON limit.
- Sub-pipelines inside `$facet` cannot use indexes.
- Strategy: filter with `$match` before `$facet`; `$limit` inside each sub-pipeline.

### Project + limit early

```python
# Good — bound work, then project narrow
[
    {"$search": {...}},
    {"$limit": 25},
    {"$project": {"product_name": 1, "sku": 1}},
]

# Bad — full doc transferred over wire, then truncated
[
    {"$search": {...}},
    {"$project": {}},
    {"$limit": 25},
]
```

For Atlas Search results, `"score": {"$meta": "searchScore"}` must be in `$addFields` or `$project` — not returned by default.

---

## 4. Collection / Metadata Caching

### Why cache?

`Collection` objects are lightweight — but per-request constructions of `db[collection_name]` are dict lookups that add up. The deeper reason for **TTL**-based caching is topology resilience: when Atlas auto-fails-over or rolls a replica, cached metadata becomes stale within minutes.

### Pattern A: `functools.lru_cache` (no TTL)

```python
from functools import lru_cache
from pymongo.collection import Collection

@lru_cache(maxsize=32)
def get_collection(db_name: str, collection_name: str) -> Collection:
    return get_client()[db_name][collection_name]
```

Use when topology rarely changes.

### Pattern B: TTL dict with asyncio.Lock (project pattern)

```python
import asyncio, time
from typing import NamedTuple
from pymongo.collection import Collection

_TTL_SECONDS = 300  # 5 minutes
_cache: dict[str, "_Entry"] = {}
_cache_lock = asyncio.Lock()

class _Entry(NamedTuple):
    value: Collection
    expires_at: float

async def get_collection(db_name: str, name: str) -> Collection:
    key = f"{db_name}.{name}"
    async with _cache_lock:                            # prevent concurrent re-fetch
        now = time.monotonic()
        entry = _cache.get(key)
        if entry is None or now >= entry.expires_at:
            coll = get_client()[db_name][name]
            _cache[key] = _Entry(coll, now + _TTL_SECONDS)
        return _cache[key].value
```

The `asyncio.Lock` matters: under concurrent FastAPI requests sharing a process, multiple coroutines could race on cache miss without it.

### Stale-on-error pattern

When the source of truth (e.g., `list_collection_names()`) fails, prefer returning stale cache over erroring:

```python
try:
    fresh = db.list_collection_names()
    _cache[key] = _Entry(fresh, time.monotonic() + _TTL_SECONDS)
    return fresh
except Exception:
    if _cache.get(key) is not None:
        logger.warning("Returning stale cache due to error")
        return _cache[key].value
    raise
```

This is what `app/crud/db.py:get_collection_names()` does in the project.

---

## 5. Read / Write Concerns

### Read concerns

| Level | Guarantee | Atlas Default? | Use When |
|---|---|---|---|
| `local` | Data from current node | Yes | High-throughput reads, eventual OK |
| `available` | Like `local` on RS, orphan risk on sharded | No | Avoid on sharded |
| `majority` | Majority-acknowledged | No | Audit, financial, must-not-rollback |
| `linearizable` | Real-time ordering | No | Single-doc linearizable reads only |
| `snapshot` | Consistent within transaction | No | Multi-doc transactions |

### Write concerns

| Level | Meaning | Latency | Use When |
|---|---|---|---|
| `w=1` | Primary acked | Lowest | Logs, ephemeral analytics |
| `w="majority"` | Majority acked | +2–5ms | **Atlas default** — most writes |
| `w=0` | Fire-and-forget | Fastest | Best-effort metrics only |

Atlas defaults to `w="majority"` in the SRV connection string. Overriding to `w=1` returns once the primary acks before replication — the trade-off is lost durability if the primary fails before secondaries catch up.

### Per-collection overrides

```python
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern
from pymongo import ReadPreference

# Audit-critical writes — journaled majority
audit = client["db"]["audit_log"].with_options(
    write_concern=WriteConcern(w="majority", j=True),
    read_concern=ReadConcern(level="majority"),
)

# High-throughput catalog reads — secondaries OK
catalog = client["db"]["products"].with_options(
    read_preference=ReadPreference.SECONDARY_PREFERRED,
    read_concern=ReadConcern(level="local"),
)
```

### Atlas auto-failover

Atlas elects a new primary in 10–30s on failure. With `retryWrites=True` (default), PyMongo retries eligible writes once on the new primary, transparent to the app. Same for reads with `retryReads=True`. Ensure `serverSelectionTimeoutMS ≥ 30000` so the driver waits long enough.

---

## 6. Sync PyMongo in Async FastAPI

### The problem

```python
# BAD — blocks event loop; all concurrent requests stall
@app.get("/products/{id}")
async def get_product(id: str):
    return db["products"].find_one({"_id": id})
```

### The fix: `asyncio.to_thread`

```python
import asyncio

@app.get("/products/{id}")
async def get_product(id: str, coll=Depends(get_products_collection)):
    doc = await asyncio.to_thread(coll.find_one, {"_id": id})
    return doc

@app.get("/search")
async def search(q: str, coll=Depends(get_products_collection)):
    pipeline = build_search_pipeline(q, "atlas-search-index")
    return await asyncio.to_thread(lambda: list(coll.aggregate(pipeline)))
```

`asyncio.to_thread` (Python 3.9+) runs the callable in a thread pool executor. Equivalent to `loop.run_in_executor(None, fn)` with cleaner syntax.

### CPU-bound code (e.g., `thefuzz`)

```python
from thefuzz import fuzz

async def fuzzy_score(a: str, b: str) -> int:
    return await asyncio.to_thread(fuzz.token_sort_ratio, a, b)

async def batch_fuzzy(query: str, candidates: list[str]) -> list[int]:
    tasks = [asyncio.to_thread(fuzz.token_sort_ratio, query, c) for c in candidates]
    return await asyncio.gather(*tasks)
```

`asyncio.gather` dispatches all comparisons to the thread pool concurrently — reduces wall time vs serial execution.

### When to migrate to AsyncMongoClient

| Factor | Stay sync + to_thread | Migrate to AsyncMongoClient (PyMongo 4.9+) |
|---|---|---|
| Currently using Motor | N/A | Yes — Motor deprecated 2026-05-14 |
| Concurrency | <50 DB ops/s | >500 DB ops/s |
| Code change | Low | High — all callers must be async |
| Performance | ~0.1ms thread pool overhead | Near-native async I/O |

For sync codebases, `asyncio.to_thread` is correct and sufficient. Evaluate `AsyncMongoClient` at the next major version bump.

---

## Anti-patterns

| Anti-Pattern | Risk | Fix |
|---|---|---|
| `MongoClient(uri)` per request | Pool exhaustion; Atlas connection cap hit in seconds | Module-level or `app.state` singleton |
| Unbounded `.find()`/`.aggregate()` | Full collection scan; OOM or multi-second latency | `.limit(N)` cursor; `{"$limit": N}` early in pipeline |
| Missing index on `$match` field | COLLSCAN on every query; O(n) degradation | `create_index()` or Atlas UI; verify with `explain("executionStats")` |
| Sync PyMongo in `async def` without thread wrap | Event loop blocked; P99 latency spikes | `await asyncio.to_thread(coll.find_one, q)` |
| `$search` not first stage | `MongoServerError: $search is only allowed as first stage` | Put `$search`/`$searchMeta` first; pre-filters → `compound.filter` |
| `minPoolSize=1` in production | First few requests after idle period pay connection setup cost | Set `minPoolSize=5–10` for warm pool |
| Dropping connection on failover | `serverSelectionTimeoutMS` too short → premature failure | `serverSelectionTimeoutMS ≥ 30000` for Atlas |

---

## References

- [PyMongo Connection Pools — MongoDB Docs](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/connect/connection-options/connection-pools/)
- [MongoClient API — PyMongo stable](https://pymongo.readthedocs.io/en/stable/api/pymongo/mongo_client.html)
- [Define Field Mappings — Atlas Search](https://www.mongodb.com/docs/atlas/atlas-search/define-field-mappings/)
- [Autocomplete Field Type — Atlas Search](https://www.mongodb.com/docs/atlas/atlas-search/field-types/autocomplete-type/)
- [facet Operator — Atlas Search](https://www.mongodb.com/docs/atlas/atlas-search/facet/)
- [Read Concern — MongoDB Manual](https://www.mongodb.com/docs/manual/reference/read-concern/)
- [Write Concern — MongoDB Manual](https://www.mongodb.com/docs/manual/reference/write-concern/)
- [Migration to PyMongo Async](https://www.mongodb.com/docs/languages/python/pymongo-driver/current/reference/migration/)
- Foundation: `arch-python-modern`, `fastapi-patterns`
