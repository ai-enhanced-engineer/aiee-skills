# FastAPI Production Patterns Examples

Project-grounded implementations from `example-service`. Examples annotate what works, what to refactor, and what the recommended pattern looks like.

---

## Example 1: Lifespan with Mixed Mandatory/Optional Resources (current pattern)

The project's `app/main.py` shows the correct lifespan pattern:

```python
# app/main.py — actual code (annotated)
from contextlib import asynccontextmanager
from fastapi import FastAPI

from app.auth.auth_service import get_auth_token
from app.crud.db import create_mongo_client, shutdown_mongo_client
from app.services.clients.http_client import (
    initialize_http_client,
    shutdown_http_client,
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize resources before startup and clean up after shutdown."""
    # --- OPTIONAL resource: M2M token (soft-fail with warning)
    logger.info("Initializing M2M token fetcher")
    try:
        get_auth_token()
    except Exception:
        logger.exception("Failed to fetch initial M2M token")
        logger.warning("App starting without M2M authentication")

    # --- MANDATORY resources: let exceptions abort startup
    create_mongo_client()
    await initialize_http_client()

    yield

    # --- TEARDOWN in reverse order: drain outbound HTTP first, then close DB pool
    shutdown_http_client()
    shutdown_mongo_client()


app = FastAPI(
    docs_url=settings.BASE_URL + "/docs",
    openapi_url=settings.BASE_URL + "/openapi.json",
    lifespan=lifespan,
)
```

**What works**:
- Soft-fail for the M2M token (auth is nice-to-have at startup; the token can be fetched lazily on first request).
- Mandatory resources (MongoDB, HTTP client) let exceptions abort startup — better than running with broken state.
- Reverse-order teardown.

**Refactor opportunity**: store the MongoDB client and HTTP client on `app.state` instead of module globals, then access via `request.app.state.mongo`. Makes testing cleaner — each test app instance gets fresh state without monkey-patching module globals.

---

## Example 2: Router Composition — Refactoring Per-Endpoint Auth

### Current pattern (per-endpoint, in `app/routers/product.py`)

```python
search_router = APIRouter(
    tags=[OpenApiTags.PRODUCT_MATCHING],
)

@search_router.post("/tenants/{tenantId}/account/{accountId}/products/search")
async def search_product(
    request: Request,
    tenantId: str,
    accountId: str,
    search_query_payload: SearchQueryPayload,
    mongo_client=Depends(get_client),
    # ... no Depends(Auth()) here, but easy to forget if added later
):
    ...
```

### Recommended refactor — auth at router level

```python
from fastapi import APIRouter, Depends
from app.dependencies import Auth

search_router = APIRouter(
    prefix="/v1/product",
    tags=[OpenApiTags.PRODUCT_MATCHING],
    dependencies=[Depends(Auth())],     # applies to ALL routes here
    responses={
        401: {"description": "Unauthorized"},
        503: {"description": "Upstream service unavailable"},
    },
)

@search_router.post(
    "/tenants/{tenantId}/account/{accountId}/products/search",
    response_model=SearchResults,
)
async def search_product(
    tenantId: str,
    accountId: str,
    search_query_payload: SearchQueryPayload,
    mongo_client=Depends(get_client),
):
    ...
```

**Benefits**:
- Cannot forget auth on new endpoints.
- Cleaner endpoint signatures.
- OpenAPI documents the 401 response globally for the router.

### main.py side (also fix duplicate tags)

```python
# Current — duplicate tags
app.include_router(search_router, prefix=settings.BASE_URL, tags=[OpenApiTags.PRODUCT_MATCHING])

# Recommended — let the APIRouter own its tags
app.include_router(search_router, prefix=settings.BASE_URL)
```

---

## Example 3: Pydantic v2 Request/Response Schema Triple

```python
# app/schemas/product.py
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator

class ProductCreate(BaseModel):
    """Request body for product creation. No server-generated fields."""
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str
    sku: str
    description: str | None = None

    @field_validator("sku")
    @classmethod
    def sku_format(cls, v: str) -> str:
        if not v or len(v) < 3:
            raise ValueError("sku must be at least 3 characters")
        return v.upper()


class ProductUpdate(BaseModel):
    """PATCH body — all fields optional."""
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    sku: str | None = None
    description: str | None = None


class ProductRead(BaseModel):
    """Response schema. Server-generated fields included."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    sku: str
    description: str | None = None
    created_at: datetime
    updated_at: datetime
```

Usage in router:

```python
@router.post("/products", response_model=ProductRead, status_code=201)
async def create_product(
    payload: ProductCreate,
    db: DbSession,
) -> ProductRead:
    doc = await db.products.insert_one(payload.model_dump())
    saved = await db.products.find_one({"_id": doc.inserted_id})
    return ProductRead.model_validate(saved)


@router.patch("/products/{id}", response_model=ProductRead)
async def update_product(id: str, payload: ProductUpdate, db: DbSession) -> ProductRead:
    update_data = payload.model_dump(exclude_unset=True)   # only fields client set
    if update_data:
        await db.products.update_one({"_id": id}, {"$set": update_data})
    saved = await db.products.find_one({"_id": id})
    return ProductRead.model_validate(saved)
```

`exclude_unset=True` is critical for PATCH — distinguishes "field omitted" from "field set to None".

---

## Example 4: Structured Exception Handler — Solving the CORS-on-500 Gotcha

```python
# app/main.py — add after app = FastAPI(lifespan=lifespan)

import logging
from fastapi import HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    """Pydantic validation errors → 422 with structured detail."""
    return JSONResponse(
        status_code=422,
        content={
            "error": "VALIDATION_ERROR",
            "detail": exc.errors(),
            "body": exc.body,
        },
    )


@app.exception_handler(HTTPException)
async def http_handler(request: Request, exc: HTTPException):
    """Project-wide HTTPException envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else "HTTP_ERROR",
            "status_code": exc.status_code,
        },
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def generic_handler(request: Request, exc: Exception):
    """
    Catches anything not caught above. CRITICAL: without this, 500s bypass
    CORSMiddleware and browsers hide the response body from JS clients.
    """
    logger.exception("Unhandled exception", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={"error": "INTERNAL_ERROR", "detail": "An internal error occurred."},
    )
```

The current `search_product` endpoint catches a long list of exception types itself — that's defensible for domain-specific responses (different DB error → different message), but the generic-`Exception` handler is the safety net for everything else.

---

## Example 5: Test Setup with `dependency_overrides`

```python
# tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.crud.db import get_client, get_database
from app.dependencies import Auth


class FakeAuth:
    """Bypass auth in tests — accepts any token."""
    async def __call__(self, request):
        return "fake-token"


@pytest.fixture(autouse=True)
def setup_overrides(fake_mongo_client, fake_db):
    app.dependency_overrides[get_client] = lambda: fake_mongo_client
    app.dependency_overrides[get_database] = lambda: fake_db
    app.dependency_overrides[Auth] = FakeAuth
    yield
    app.dependency_overrides.clear()    # CRITICAL — prevent cross-test leakage


@pytest.fixture
def client():
    return TestClient(app)


# tests/routers/test_product.py
def test_search_product_returns_200(client):
    response = client.post(
        "/v1/product/tenants/op1/account/acc1/products/search",
        json={"query": "cable"},
    )
    assert response.status_code == 200
```

The `autouse=True` + `clear()` pattern is the safest — even if a test forgets the fixture, overrides are cleared after each test.

---

## Example 6: Logging Middleware — Project Pattern Critique

The project's `log_requests` middleware (`app/main.py`) is functional but mixes concerns. Refactored version:

```python
import logging
import time
import uuid
from contextvars import ContextVar
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="-")


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Assigns a request ID and logs entry/exit timing."""

    async def dispatch(self, request: Request, call_next):
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:8]
        token = request_id_ctx.set(rid)
        start = time.monotonic()

        logger.info(
            "request.start",
            extra={"rid": rid, "method": request.method, "path": request.url.path},
        )

        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            return response
        finally:
            elapsed_ms = (time.monotonic() - start) * 1000
            logger.info(
                "request.end",
                extra={
                    "rid": rid,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": getattr(response, "status_code", 500),
                    "duration_ms": round(elapsed_ms, 2),
                },
            )
            request_id_ctx.reset(token)


# in main.py
app.add_middleware(RequestContextMiddleware)
```

**Improvements over the current pattern**:
- Uses cryptographically lazy `uuid.uuid4()` instead of `random.choices` (no `# noqa: S311` needed).
- Honors incoming `X-Request-ID` headers (distributed tracing correlation).
- Echoes the request ID in the response header for client-side correlation.
- Uses `ContextVar` so log records anywhere in the request can include the RID without explicit threading.
- Structured logging via `extra=` — no string formatting in the log message.
- `time.monotonic()` instead of `time.time()` — wall-clock-jump-safe.

---

## Anti-patterns observed in the project

| File | Issue | Fix |
|---|---|---|
| `app/main.py` | CORSMiddleware uses `allow_origins=cors_origins` with `allow_credentials=True` — if `CORS_ORIGINS` includes `"*"`, browsers reject this combination. | Validate at startup: `if "*" in cors_origins and allow_credentials: raise ValueError("incompatible CORS")` |
| `app/main.py` | `tags=[...]` passed to both `APIRouter` constructor AND `include_router` → duplicate tags in OpenAPI | Set tags on the `APIRouter` only |
| `app/routers/product.py` | Endpoint signature has 8 parameters across `Path`, `Header`, `Query`, `Body`, `Depends` — hard to scan | Group request inputs into a single `SearchRequest` model with `Annotated` headers |
| `app/dependencies.py` | `Auth.verify_token` returns `True` unconditionally — not yet implemented | Add real JWT validation against M2M issuer; fail closed |

These are documented as project-specific notes — the patterns themselves are addressed in `reference.md`.
