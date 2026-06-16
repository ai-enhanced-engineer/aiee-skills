---
name: fastapi-patterns
description: Modern FastAPI 0.111+ production patterns for Python services — async lifespan, Pydantic v2 schemas, dependency injection, middleware ordering, structured exception handlers, router composition. Use for FastAPI endpoint design, service composition, API contract evolution, and migrating from `@app.on_event` / Pydantic v1.
updated: 2026-04-25
---

# FastAPI Production Patterns

Modern FastAPI 0.111+ patterns for production microservices. This skill covers the patterns that *change* across versions and trip up teams: lifespan replacing `@app.on_event`, Pydantic v2 schema patterns, `Depends()` caching/scoping, middleware LIFO order, and structured error handling.

## When to use

- Designing or refactoring a FastAPI service (new endpoints, lifespan resources, DI graph)
- Migrating from `@app.on_event` → `lifespan` or Pydantic v1 → v2
- Debugging "CORS missing on 500 errors" or "blocking async endpoint" issues
- Evolving API contracts (versioning, OpenAPI customization, response schemas)

For modern Python idioms throughout, see `arch-python-modern`. For service-layer separation (`app/routers/` ↔ `app/services/` ↔ `app/crud/`), see `arch-ddd`.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Lifespan | `@asynccontextmanager async def lifespan(app)` — startup before `yield`, shutdown after; reverse-order resource teardown |
| `Depends()` | Cached once per request; use `Annotated[T, Depends(get_x)]` aliases at module level |
| Pydantic v2 | `model_config = ConfigDict(...)`; `@field_validator`/`@model_validator`; `model_dump()` not `.dict()` |
| Schema separation | Three classes per resource: `XCreate` (request), `XRead` (response), `XUpdate` (PATCH, all optional) |
| Middleware order | LIFO — `add_middleware` *last* = runs *first* on request. CORSMiddleware sits outermost so OPTIONS preflight reaches it before auth runs and 500 responses still pass through it (otherwise CORS headers are lost — see reference.md) |
| Exception handlers | Register `@app.exception_handler(Exception)` so errors pass through CORS layer (else 500s lose CORS headers) |
| Router composition | `APIRouter(prefix=..., tags=..., dependencies=[Depends(Auth())])` — apply auth at router, not per-endpoint |
| Test overrides | `app.dependency_overrides[get_db] = fake_db`; clearing in fixture teardown prevents cross-test leakage when the app instance persists across tests |

## Quick reference

```python
# Lifespan (replaces @app.on_event)
@asynccontextmanager
async def lifespan(app: FastAPI):
    create_mongo_client()              # mandatory — let exception abort startup
    await initialize_http_client()
    yield
    shutdown_http_client()              # reverse order
    shutdown_mongo_client()

app = FastAPI(lifespan=lifespan)

# Pydantic v2 schemas
class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    sku: str

class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    sku: str
    created_at: datetime

# Dependency injection (Annotated alias style)
DbSession = Annotated[AsyncSession, Depends(get_db)]

@router.get("/products", response_model=list[ProductRead])
async def list_products(db: DbSession): ...
```

## Anti-patterns (top 4)

1. **Blocking I/O in `async def`** → wrap with `await asyncio.to_thread(...)` or use `httpx.AsyncClient`
2. **Mutable default in `Depends`** (`tags: list = []`) → use `None` + reassign, or `Query(default_factory=list)`
3. **Single schema for request + response** → split into `XCreate` / `XRead` / `XUpdate`
4. **Missing HTTP client timeouts** → `httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=5.0))`

See `reference.md` for the full pattern catalogue and `examples.md` for project-grounded implementations.
