# FastAPI Production Patterns Reference

Detailed reference for FastAPI 0.111+ production patterns. Companion to `SKILL.md`.

---

## 1. Lifespan + Async Resource Init

### The `@asynccontextmanager` pattern

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI

@asynccontextmanager
async def lifespan(app: FastAPI):
    # --- STARTUP ---
    create_mongo_client()
    await initialize_http_client()
    yield
    # --- SHUTDOWN (reverse order: drain outbound, then close pools) ---
    shutdown_http_client()
    shutdown_mongo_client()

app = FastAPI(lifespan=lifespan)
```

**Rules**:

- Code before `yield` runs once at startup, before any request.
- Code after `yield` runs once at shutdown, after the last request.
- Lifespan only runs for the **main** app — sub-apps mounted via `app.mount()` need their own.
- Initialize resources in module globals or `app.state` (preferred for testability).
- Mandatory resources (DB, HTTP client) should let exceptions propagate — fail fast at startup. Optional resources (M2M token, cache warmup) can soft-fail with logged warnings.

### `app.state` alternative (avoids module globals)

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.mongo = MongoClient(settings.MONGO_URI, maxPoolSize=50)
    app.state.http = httpx.AsyncClient(
        timeout=httpx.Timeout(5.0),
        limits=httpx.Limits(max_connections=100),
    )
    yield
    await app.state.http.aclose()
    app.state.mongo.close()
```

Access in endpoints via `request.app.state.mongo`. Better for tests because each test app instance gets clean state.

### Soft-fail for optional resources

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_auth_token()
    except Exception:
        logger.exception("Failed to fetch initial M2M token")
        logger.warning("App starting without M2M authentication")
    create_mongo_client()           # MANDATORY — let exception abort startup
    await initialize_http_client()
    yield
    shutdown_http_client()
    shutdown_mongo_client()
```

### Legacy `@app.on_event` (do not use)

When a `lifespan=` parameter is passed to `FastAPI()`, startup/shutdown event handlers are silently ignored.

---

## 2. Dependency Injection

### Resolution and caching

FastAPI resolves the dependency graph before calling the path operation. Within a single request, each dependency is called **once** and the result is cached. Two endpoints both `Depends(get_db)` → one DB session per request, shared.

To opt out of caching (rare):

```python
@app.get("/nonce")
async def get_nonce(nonce: Annotated[str, Depends(make_nonce, use_cache=False)]):
    ...
```

### Annotated alias style (recommended)

```python
from typing import Annotated
from fastapi import Depends

DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]

@router.get("/products")
async def list_products(db: DbSession, user: CurrentUser):
    ...
```

Reduces signature noise and centralizes test overrides — override the alias once, not every endpoint.

### Yield dependencies for cleanup

```python
async def get_db():
    session = AsyncSession(engine)
    try:
        yield session
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()
```

- `finally` always executes, even on exception.
- Re-raise after handling — swallowing yields generic 500 with no log trace.
- Cleanup runs **after the response is sent** (request scope) by default.

### Sub-dependency teardown order

FastAPI guarantees reverse-order cleanup:

```python
async def dep_a():
    a = ...
    try: yield a
    finally: a.close()         # runs LAST

async def dep_b(a: Annotated[A, Depends(dep_a)]):
    b = ...
    try: yield b
    finally: b.close()         # runs FIRST (b depends on a)
```

### Class-based dependencies (parameterized)

```python
class Paginator:
    def __init__(self, max_limit: int = 100):
        self.max_limit = max_limit
    def __call__(self, skip: int = 0, limit: int = 20) -> dict:
        return {"skip": skip, "limit": min(limit, self.max_limit)}

standard_pagination = Depends(Paginator())
admin_pagination = Depends(Paginator(max_limit=1000))
```

### Router-level vs per-endpoint dependencies

Apply auth at the router level:

```python
search_router = APIRouter(
    prefix="/v1/product",
    dependencies=[Depends(Auth())],   # applies to all routes here
)
```

Per-endpoint `Depends(Auth())` is repetitive and easy to forget on new routes.

### `app.dependency_overrides` for testing

```python
@pytest.fixture(autouse=True)
def reset_overrides():
    app.dependency_overrides[get_database] = lambda: fake_db
    yield
    app.dependency_overrides.clear()    # CRITICAL — prevent cross-test leakage
```

---

## 3. Pydantic v2 Schema Patterns

### `ConfigDict` (replaces `class Config`)

```python
class ProductBase(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,        # was: orm_mode = True
        extra="forbid",              # reject unexpected fields
        str_strip_whitespace=True,
        populate_by_name=True,       # accept alias OR field name
    )
```

### v1 → v2 migration table

| v1 | v2 |
|---|---|
| `class Config: orm_mode = True` | `model_config = ConfigDict(from_attributes=True)` |
| `@validator("x")` | `@field_validator("x")` (must be `@classmethod`) |
| `@root_validator` | `@model_validator(mode="before"\|"after")` |
| `pre=True` | `mode="before"` |
| `model.dict()` | `model.model_dump()` |
| `model.json()` | `model.model_dump_json()` |
| `Config.allow_population_by_field_name` | `populate_by_name=True` |

### Field validators

```python
from pydantic import field_validator

class SearchQuery(BaseModel):
    query: str
    limit: int = 20

    @field_validator("query")
    @classmethod
    def query_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("query must not be empty")
        return v.strip()

    @field_validator("limit")
    @classmethod
    def limit_in_range(cls, v: int) -> int:
        if not 1 <= v <= 200:
            raise ValueError("limit must be between 1 and 200")
        return v
```

### Model validators (cross-field)

```python
from pydantic import model_validator
from typing import Self

class DateRange(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_order(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self
```

`mode="before"` for raw dict access (key normalization). `mode="after"` for post-coercion validation (default, safer).

### `model_dump` modes

```python
product.model_dump()                       # Python dict, native types
product.model_dump(mode="json")            # datetime → ISO, UUID → str (JSON-safe)
product.model_dump(exclude_unset=True)     # only fields explicitly set (PATCH)
product.model_dump(exclude_none=True)      # drop None values
product.model_dump(by_alias=True)          # use field aliases
```

`mode="json"` removes the need for `jsonable_encoder` in most cases.

### Request / Response separation

Three classes per resource:

```python
class ProductCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str
    sku: str
    description: str | None = None

class ProductRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    sku: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime

class ProductUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str | None = None
    sku: str | None = None
    description: str | None = None
```

Single-schema reuse causes: (a) clients can submit server-generated fields like `id`; (b) responses leak storage-only fields like `hashed_password`.

### Performance note

Pydantic v2's core is Rust (`pydantic-core`); 5–50× faster than v1 for validation-heavy workloads. Reusing schema instances across requests is safe and skips repeated compilation.

---

## 4. Middleware Ordering + Exception Handlers

### LIFO execution

Middleware added **last** runs **first** on requests, **last** on responses. Decorators (`@app.middleware("http")`) are first-in-first-applied; `app.add_middleware(...)` calls are applied after decorators.

```
add order:           Request flow:           Response flow:
1. @log_requests     log_requests           log_requests
2. @suppress_health  suppress_health        suppress_health
3. CORSMiddleware    CORSMiddleware (out)   CORSMiddleware (out)
```

### Production-safe order (outer to inner)

1. **CORSMiddleware** — outermost, must process OPTIONS before auth rejects
2. **Logging / request-ID** — track all requests including auth failures
3. **Tracing (OpenTelemetry)** — span around the request
4. **Auth middleware** (or `Depends()` — preferred for most cases)
5. Application routes

### CORS + 500 error gotcha

Starlette has two exception layers:

- **`ExceptionMiddleware`** (inner): catches `HTTPException` + registered `@app.exception_handler` → response passes back through CORS.
- **`ServerErrorMiddleware`** (outer): catches unhandled `Exception` → CORS already exited → **no CORS headers on the 500**.

Browsers then hide the error body from JS clients, masking the actual cause. **Fix**: register a broad handler so all errors pass through the inner layer:

```python
@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "request_id": get_request_id(request)},
    )
```

### Structured error envelope

```python
from fastapi.exceptions import RequestValidationError

@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "detail": exc.errors(),    # list of {loc, msg, type}
            "body": exc.body,
        },
    )

@app.exception_handler(HTTPException)
async def http_handler(request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else "HTTP_ERROR",
            "status_code": exc.status_code,
        },
        headers=exc.headers,
    )
```

Stable envelope shape — clients rely on structure, not arbitrary strings.

### Tracing middleware

```python
from opentelemetry import trace

@app.middleware("http")
async def trace_middleware(request: Request, call_next):
    tracer = trace.get_tracer(__name__)
    with tracer.start_as_current_span(f"{request.method} {request.url.path}") as span:
        span.set_attribute("http.method", request.method)
        span.set_attribute("http.url", str(request.url))
        response = await call_next(request)
        span.set_attribute("http.status_code", response.status_code)
    return response
```

---

## 5. Router Composition + OpenAPI

### `APIRouter` constructor options

```python
search_router = APIRouter(
    prefix="/v1/product",                   # no trailing slash
    tags=["Product Matching"],              # human-readable
    dependencies=[Depends(Auth())],         # applies to all routes
    responses={
        401: {"description": "Unauthorized"},
        503: {"description": "Upstream unavailable"},
    },
)
```

### Including routers

```python
app.include_router(health_router, prefix=settings.BASE_URL)
app.include_router(search_router, prefix=settings.BASE_URL)
```

**Avoid duplicate tags**: if you set `tags` on the `APIRouter` constructor, do **not** also pass `tags` to `include_router` — they merge and create duplicates in the OpenAPI spec.

### Custom OpenAPI schema

```python
def modify_openapi():
    if app.openapi_schema:                 # CRITICAL — cache or schema rebuilds per request
        return app.openapi_schema
    schema = get_openapi(
        title="my-service",
        version=settings.API_VERSION,
        description="Service description",
        routes=app.routes,
        tags=[
            {"name": "Product Matching", "description": "..."},
        ],
    )
    schema["components"]["securitySchemes"] = {
        "BearerAuth": {"type": "http", "scheme": "bearer"}
    }
    app.openapi_schema = schema
    return schema

app.openapi = modify_openapi
```

### Versioning strategies

| Strategy | Trade-off |
|---|---|
| URL prefix `/v1/`, `/v2/` | Simple, explicit, easy testing — **recommended default** for B2B |
| Header `Accept: application/vnd.foo+v2+json` | Cleaner URLs, harder to test in browser |
| Separate router per version | Maximum flexibility, more code |

---

## Anti-patterns

| Anti-Pattern | Why It's Bad | Fix |
|---|---|---|
| Blocking I/O inside `async def` | Stalls event loop; throughput collapses to ~1 req/s under load | `httpx.AsyncClient`, or `await asyncio.to_thread(legacy_sync_call, arg)` |
| Mutable default in `Depends` | Default evaluated once; shared across requests; cross-request state bleed | `def f(x: list \| None = None): x = x or []`; or `Query(default_factory=list)` |
| Single schema for request + response | Clients can submit server-generated fields; server-only fields leak in responses | `XCreate`, `XRead`, `XUpdate` triple |
| Missing HTTP timeouts | Slow upstream → connection pool fills → service appears hung | `httpx.AsyncClient(timeout=httpx.Timeout(connect=2.0, read=5.0))`; create once in lifespan |
| Mixing `@app.on_event` with `lifespan` | Events silently ignored when lifespan is set | Use `lifespan` only |
| Per-endpoint `Depends(Auth())` | Repetitive, easy to forget on new routes | `APIRouter(dependencies=[Depends(Auth())])` |
| Cached OpenAPI schema not guarded | `get_openapi()` rebuilds schema on every `/openapi.json` request | `if app.openapi_schema: return app.openapi_schema` |
| Forgotten `dependency_overrides.clear()` | Test pollution — overrides leak across tests in same session | Always clear in `autouse=True` fixture teardown |

---

## References

- [FastAPI — Lifespan Events](https://fastapi.tiangolo.com/advanced/events/)
- [FastAPI — Dependencies](https://fastapi.tiangolo.com/tutorial/dependencies/)
- [FastAPI — Bigger Applications](https://fastapi.tiangolo.com/tutorial/bigger-applications/)
- [FastAPI — Handling Errors](https://fastapi.tiangolo.com/tutorial/handling-errors/)
- [Pydantic v2 — Validators](https://docs.pydantic.dev/latest/concepts/validators/)
- [FastAPI — CORS](https://fastapi.tiangolo.com/tutorial/cors/)
- Foundation: `arch-python-modern`, `arch-ddd`
