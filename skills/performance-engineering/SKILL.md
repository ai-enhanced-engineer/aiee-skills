---
name: performance-engineering
description: Profiling, load testing, and optimization patterns for Python web services. Use for CPU/memory profiling (py-spy), load testing (Locust/k6), query optimization, or scaling WebSocket connections.
kb-sources:
  - wiki/software-engineering/performance-engineering
updated: 2026-04-18
---

# Performance Engineering Skill

Profiling, load testing, and optimization patterns for Python web services.

## When to Use

- Profiling CPU/memory bottlenecks
- Running load tests with Locust or k6
- Optimizing database queries
- Scaling WebSocket connections
- Debugging async performance issues

## Quick Reference

### Performance Optimization Flow

```
Measure → Identify Bottleneck → Hypothesize → Fix → Verify → Monitor
```

### Common Bottleneck Categories

| Category | Symptoms | First Tool |
|----------|----------|------------|
| **CPU** | High CPU, slow compute | py-spy, cProfile |
| **Memory** | OOM, high RSS | memory_profiler |
| **I/O** | Slow responses, waits | asyncio debug |
| **Database** | Slow queries | pg_stat_statements |
| **Network** | Latency variance | Cloud Trace |

### Key Metrics (SLOs)

| Metric | Target | Alert |
|--------|--------|-------|
| P50 latency | <100ms | >200ms |
| P95 latency | <500ms | >1s |
| P99 latency | <2s | >5s |
| Error rate | <0.1% | >1% |
| Throughput | Varies | >20% drop |

## Quick Profiling Commands

### CPU Profiling (py-spy)

```bash
# Profile running process
py-spy record -o profile.svg --pid <PID>

# Profile command
py-spy record -o profile.svg -- python app.py
```

### Memory Profiling

```bash
# Line-by-line memory
python -m memory_profiler script.py

# Track allocations
python -m tracemalloc script.py
```

### Load Testing (Locust)

```bash
# Run load test
locust -f locustfile.py --host=https://api.example.com

# Headless with params
locust -f locustfile.py --headless -u 100 -r 10 -t 60s
```

## Common Optimizations

| Pattern | When to Apply | Impact |
|---------|---------------|--------|
| Connection pooling | DB bottleneck | High |
| Async I/O | I/O-bound code | High |
| Caching | Repeated reads | Medium-High |
| Query optimization | Slow queries | High |
| Batch processing | Many small ops | Medium |
| **Startup warmup** | First-request latency | Medium-High |

## Startup Warmup Pattern

Eliminate first-request latency penalty by warming HTTP connection pools during application startup.

**Problem**: Lazy connection pool initialization causes 500-1000ms penalty on first request (TCP + SSL/TLS + HTTP/2 setup).

**Quick Implementation**:
```python
# FastAPI lifespan warmup
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        await client.models.list(limit=1)  # Lightweight authenticated call
        logger.info("Connection pool warmed")
    except Exception as e:
        logger.warning("Warmup failed - will lazy-init", error=str(e))
        # Non-fatal: first request will initialize

    yield
```

**When to use**: Any HTTP client (OpenAI, httpx, aiohttp) in Cloud Run / serverless.

See `reference.md` for full pattern with timing measurement and error handling.

## Database Query Anti-Patterns

### MD5 Hash JOINs on Large Tables

**Anti-Pattern:**
```sql
-- SLOW: MD5 JOIN between raw data and materialized view
SELECT mv.category, m.content AS example
FROM mv_top_questions mv
JOIN messages m ON MD5(m.content) = mv.content_hash
WHERE mv.customer_id = 'cust_123';
```

**Why it's slow:**
- MD5() computes for every row in messages table
- Hash functions prevent index usage
- Full table scan (millions of rows) = 10-60 seconds per query

**Correct Pattern:**
```sql
-- Pre-compute during MV refresh - store needed data directly
CREATE MATERIALIZED VIEW mv_top_questions AS
SELECT customer_id, category, COUNT(*) as frequency,
       ARRAY_AGG(content ORDER BY created_at DESC LIMIT 3) as examples
FROM categorized_messages
GROUP BY customer_id, category;

-- Query is instant (no JOIN needed)
SELECT category, frequency, examples
FROM mv_top_questions WHERE customer_id = 'cust_123';
```

**Rule:** For MVs serving user-facing queries, pre-compute every needed column during refresh. JOINing raw tables to an MV at query time defeats the entire purpose of materializing — the MV becomes a slow indirection layer instead of a cache.

**Impact:** 10-60 sec → <50ms (100-1000x improvement)

## Files

- `reference.md` - Detailed profiling, load testing, optimization patterns
- `examples.md` - Working code for profiling, Locust tests, async patterns
