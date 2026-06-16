# pytest + FastAPI Async Testing Reference

Detailed patterns for testing async FastAPI services with pytest-asyncio and httpx. Companion to SKILL.md.

## 1. pytest-asyncio configuration

### Required pyproject.toml block

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]
env = [
    "AUTH_BYPASS=true",
    "CACHE_BYPASS=false",
    "ENV=local",
]
```

### Mode comparison

| Mode | `async def test_*` | Async fixtures |
|---|---|---|
| `auto` | Auto-marked asyncio | `@pytest_asyncio.fixture` not required |
| `strict` | Need `@pytest.mark.asyncio` | Need `@pytest_asyncio.fixture` |

Choose `auto` for projects with one async backend (asyncio). `strict` only when anyio + asyncio coexist.

### loop_scope reference

| Scope | Loop lifetime | When |
|---|---|---|
| `function` (default) | New per test | Maximum isolation |
| `class` | Within a test class | Related tests sharing setup |
| `module` | Within a module | Module-level async setup |
| `session` | Whole test run | Very expensive global resources (rare) |

Fixture scope must match loop_scope or you get `ScopeMismatch`.

### `event_loop` fixture removal timeline

| Version | Status |
|---|---|
| ≤ 0.21 | `event_loop` override worked |
| 0.22 (Oct 2023) | Deprecated |
| 1.0 (May 2025) | **Removed** — raises `AttributeError` |

Replacement: `asyncio_default_fixture_loop_scope = "function"`. Never override `event_loop`.

## 2. httpx `AsyncClient` + `ASGITransport`

```python
from httpx import AsyncClient, ASGITransport

async with AsyncClient(
    transport=ASGITransport(app=app),
    base_url="http://test",
) as client:
    response = await client.get("/v1/recommendations")
```

- `ASGITransport(app=app)` routes through ASGI in-process — no socket
- `base_url` is required by httpx; value is arbitrary for in-process transport
- `async with` ensures pool teardown

### `TestClient` vs `AsyncClient`

| | `TestClient` | `AsyncClient` |
|---|---|---|
| Sync test | OK | OK (but pointless) |
| `async def test_*` with no async fixtures | OK | OK |
| `async def test_*` calling async fixtures | **Conflicts** | **Required** |
| Lifespan events | Fires automatically | Does **not** fire |

Use `AsyncClient` whenever an async fixture is involved (DB pool, Redis, async auth).

### Lifespan handling options

#### A. Override resources via `dependency_overrides` (recommended)

The project pattern. Lifespan starts the real DB pool / Redis client; tests replace those via `dependency_overrides` before any request runs:

```python
@pytest_asyncio.fixture
async def client(app, fake_redis, fake_pool):
    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[get_pool] = lambda: fake_pool
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

This sidesteps the missing-lifespan issue because nothing the tests touch comes from lifespan.

#### B. `asgi-lifespan` LifespanManager (when lifespan must run)

```python
from asgi_lifespan import LifespanManager

@pytest_asyncio.fixture
async def client(app):
    async with LifespanManager(app) as manager:
        async with AsyncClient(transport=ASGITransport(app=manager.app), base_url="http://test") as ac:
            yield ac
```

Use only when integration-testing the lifespan boot path itself.

## 3. Fixture recipes

### App fixture

```python
@pytest.fixture(scope="session")
def app():
    from app.main import app as fastapi_app
    return fastapi_app
```

Session scope — the app object is stateless and cheap.

### Client fixture

```python
@pytest_asyncio.fixture
async def client(app):
    app.dependency_overrides = {}    # belt-and-suspenders setup
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()  # teardown (see fastapi-patterns)
```

### DB pool override

```python
@pytest_asyncio.fixture
async def fake_pool():
    class FakePool:
        async def connection(self):
            return _FakeConn()
    return FakePool()

@pytest_asyncio.fixture
async def client_with_db(app, fake_pool):
    app.dependency_overrides[get_pool] = lambda: fake_pool
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

For integration tests against a real test DB (testcontainers-postgres), replace `FakePool` with the real pool.

### `FakeAsyncRedis`

```python
import fakeredis

@pytest_asyncio.fixture
async def fake_redis():
    async with fakeredis.FakeAsyncRedis() as r:
        yield r

@pytest_asyncio.fixture
async def client_with_redis(app, fake_redis):
    app.dependency_overrides[get_redis] = lambda: fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
```

`FakeAsyncRedis` is in-process, zero latency, supports `setex`, `get`, `scan_iter`, pub/sub, etc. The retired `aioredis` package is no longer needed; `fakeredis` targets `redis-py` directly.

### `AUTH_BYPASS` and `CACHE_BYPASS` global default

Toggles must be set **before** `app.settings` imports — `monkeypatch.setenv` runs at fixture-setup, too late.

```python
# tests/conftest.py
import os, pytest

def pytest_configure(config):
    os.environ.setdefault("AUTH_BYPASS", "true")
    os.environ.setdefault("CACHE_BYPASS", "false")
```

`pytest-env` in pyproject.toml duplicates this for safety:

```toml
[tool.pytest.ini_options]
env = ["AUTH_BYPASS=true", "CACHE_BYPASS=false"]
```

### Per-test overrides (auth-failure paths)

```python
async def test__missing_token__returns_401(monkeypatch, client):
    # Limitation: AUTH_BYPASS is read at settings import — monkeypatch.setenv
    # affects os.environ but not the already-instantiated Settings object.
    # Workaround: replace the dependency directly.
    from app.auth.dependencies import authenticate

    async def deny(*args, **kwargs):
        raise HTTPException(401, "no token", headers={"WWW-Authenticate": "Bearer"})

    client._transport.app.dependency_overrides[authenticate] = deny
    response = await client.get("/v1/reco/recommendations/account-123")
    assert response.status_code == 401
    client._transport.app.dependency_overrides.pop(authenticate, None)
```

## 4. Coverage configuration

```toml
[tool.coverage.run]
source = ["app"]
omit = [
    "tests/*",
    "test_*.py",
    "*_test.py",
    "**/__init__.py",
    "**/scripts/**",
    "**/app/exceptions/**",
    "app/main.py",       # lifespan boot needs real Azure backends
]

[tool.coverage.report]
fail_under = 80          # cite unit-test-standards
show_missing = true

[tool.coverage.html]
directory = "htmlcov"

[tool.coverage.xml]
output = "coverage.xml"  # SonarQube / Azure DevOps
```

CI:
```bash
poetry run pytest \
    --cov=app \
    --cov-report=xml \
    --cov-report=html \
    --cov-fail-under=80
```

### Why omit `app/main.py`

The lifespan boot creates real psycopg pools and Redis clients with Azure auth — unreachable in unit tests. Including it inflates the "missing" count. Cover it via integration tests against a real deployment.

## 5. Project structure

```
tests/
  conftest.py                  # pytest_configure + global fixtures
  routers/
    test_recommendation.py
    test_health.py
  services/
    test_recommendation_service.py
    test_postgres_graph.py
    test_cache.py
  auth/
    test_jwt.py
    test_m2m.py
```

Each subfolder mirrors the `app/` tree. Subfolder `conftest.py` files can layer in additional fixtures.

## 6. Anti-patterns (extended)

| Anti-pattern | Risk | Fix |
|---|---|---|
| Real Azure resources in tests | Slow, flaky, credentials in CI logs | `dependency_overrides` + fakes |
| Tautological tests (cite `unit-test-standards`) | No real assertion | Test observable behavior |
| Skip auth without `AUTH_BYPASS` | Masks real failures | Set globally via `pytest_configure` |
| `event_loop` fixture override | Deprecated → removed | `asyncio_default_fixture_loop_scope` |
| `TestClient` with async fixtures | Loop conflict | `AsyncClient` + `ASGITransport` |
| Forgot `app.dependency_overrides.clear()` | Cross-test mock leakage | Always clear in teardown |
| `monkeypatch.setenv` for import-time vars | Too late | `pytest_configure` or `pytest-env` |
| No `asyncio_default_fixture_loop_scope` | Deprecation warnings; future error | Set explicitly to `function` |
| Coverage with no `source` | Reports unexpected files | `[tool.coverage.run] source = ["app"]` |
| Mixing scope levels | `ScopeMismatch` errors | Match fixture and loop scopes |

## 7. References

- [pytest-asyncio Concepts](https://pytest-asyncio.readthedocs.io/en/latest/concepts.html)
- [pytest-asyncio Changelog](https://pytest-asyncio.readthedocs.io/en/latest/reference/changelog.html)
- [FastAPI: Async Tests](https://fastapi.tiangolo.com/advanced/async-tests/)
- [asgi-lifespan](https://github.com/florimondmanca/asgi-lifespan)
- [fakeredis](https://fakeredis.readthedocs.io/)
- Sibling skills: `unit-test-standards`, `fastapi-patterns`, `pyjwt-fastapi-validation`
