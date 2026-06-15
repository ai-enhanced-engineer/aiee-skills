# pytest + FastAPI Async Testing Examples

Project-grounded test recipes for `example-service`.

## Example 1: Setting up the project for async tests

### `pyproject.toml`

```toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
asyncio_default_fixture_loop_scope = "function"
testpaths = ["tests"]
env = [
    "AUTH_BYPASS=true",
    "CACHE_BYPASS=false",
    "ENV=local",
    "M2M_TENANT_ID=00000000-0000-0000-0000-000000000000",
    "M2M_CLIENT_ID=00000000-0000-0000-0000-000000000000",
]

[tool.coverage.run]
source = ["app"]
omit = [
    "tests/*",
    "**/__init__.py",
    "**/scripts/**",
    "**/app/exceptions/**",
    "app/main.py",
]

[tool.coverage.report]
fail_under = 80
show_missing = true

[tool.coverage.xml]
output = "coverage.xml"
```

### `tests/conftest.py`

```python
import os, pytest, pytest_asyncio
from httpx import AsyncClient, ASGITransport
import fakeredis

def pytest_configure(config):
    # Belt-and-suspenders for env vars read at app.settings import time.
    os.environ.setdefault("AUTH_BYPASS", "true")
    os.environ.setdefault("CACHE_BYPASS", "false")
    os.environ.setdefault("ENV", "local")

@pytest.fixture(scope="session")
def app():
    from app.main import app as fastapi_app
    return fastapi_app

@pytest_asyncio.fixture
async def fake_redis():
    async with fakeredis.FakeAsyncRedis() as r:
        yield r

@pytest_asyncio.fixture
async def client(app, fake_redis):
    from app.dependencies import get_redis
    app.dependency_overrides = {}
    app.dependency_overrides[get_redis] = lambda: fake_redis
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac
    app.dependency_overrides.clear()
```

## Example 2: Testing a recommendation route

```python
# tests/routers/test_recommendation.py
import pytest

async def test__recommendations__returns_200_for_known_account(client):
    response = await client.get("/v1/reco/recommendations/account-123")
    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)

async def test__recommendations__returns_empty_list_for_unknown_account(client):
    response = await client.get("/v1/reco/recommendations/unknown")
    assert response.status_code == 200
    assert response.json() == []

async def test__recommendations__returns_422_for_invalid_account_format(client):
    response = await client.get("/v1/reco/recommendations/INVALID FORMAT WITH SPACES")
    # depends on router validators; example assumes path validation
    assert response.status_code in {422, 404}
```

The `client` fixture already wires `fake_redis` through `dependency_overrides`, so cache reads/writes hit fakeredis with zero latency.

## Example 3: Testing a cached service method

```python
# tests/services/test_recommendation_service.py
import pytest
from app.services.cache import CacheManager
from app.services.recommendation import RecommendationService

class FakeGraph:
    def __init__(self):
        self.calls = 0

    async def recommend(self, tenantid, line_items, limit=20):
        self.calls += 1
        return [{"sku": "A", "score": 0.9}]

async def test__recommend__hits_graph_on_cache_miss(fake_redis):
    cache = CacheManager(fake_redis)
    graph = FakeGraph()
    service = RecommendationService(graph, cache)

    result = await service.recommend("TENANT1", "acct-1", ["sku-1"])

    assert result == [{"sku": "A", "score": 0.9}]
    assert graph.calls == 1

async def test__recommend__skips_graph_on_cache_hit(fake_redis):
    cache = CacheManager(fake_redis)
    graph = FakeGraph()
    service = RecommendationService(graph, cache)

    await service.recommend("TENANT1", "acct-1", ["sku-1"])  # populates cache
    await service.recommend("TENANT1", "acct-1", ["sku-1"])  # should hit cache

    assert graph.calls == 1   # second call did not hit the graph
```

These are behavioral tests (cite `unit-test-standards`): they assert observable side effects (call count + return shape), not implementation details.

## Example 4: Testing the AUTH_BYPASS branch

```python
# tests/auth/test_jwt.py
async def test__bypass_returns_mock_claims(client):
    # AUTH_BYPASS=true is set globally; any protected route should pass without a token
    response = await client.get("/v1/reco/recommendations/account-123")
    assert response.status_code != 401

async def test__no_bypass_route_requires_token(app, fake_redis):
    """Verify that auth fires when bypass is disabled — by replacing the dependency."""
    from app.dependencies import get_redis
    from app.auth.dependencies import authenticate
    from fastapi import HTTPException

    async def deny_auth(*args, **kwargs):
        raise HTTPException(401, "no token", headers={"WWW-Authenticate": "Bearer"})

    app.dependency_overrides[get_redis] = lambda: fake_redis
    app.dependency_overrides[authenticate] = deny_auth
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        response = await client.get("/v1/reco/recommendations/account-123")
    app.dependency_overrides.clear()

    assert response.status_code == 401
```

Why not `monkeypatch.setenv("AUTH_BYPASS", "false")`: the `Settings` object is instantiated at app-import time. Changing the env var afterward doesn't update the existing Settings instance — the dependency still sees `AUTH_BYPASS=true`. Override the dependency directly instead.

## Example 5: Testing CACHE_BYPASS

```python
# tests/services/test_cache.py
import pytest
from app.services.cache import CacheManager

async def test__cache_get__returns_none_when_client_is_none():
    cache = CacheManager(redis_client=None)
    assert await cache.get("any-key") is None

async def test__cache_set__is_no_op_when_client_is_none():
    cache = CacheManager(redis_client=None)
    await cache.set("any-key", {"value": 1}, ttl=60)   # should not raise
```

The null facade pattern means consumers never branch on `CACHE_BYPASS` — the facade returns `None` cleanly.

## Example 6: Testing the JWT validator (with a real token)

```python
# tests/auth/test_jwt.py
import jwt
from app.auth.dependencies import authenticate, AzureADClaims

@pytest.fixture
def signed_token(rsa_private_key, rsa_public_jwk):
    return jwt.encode(
        {
            "iss": f"https://login.microsoftonline.com/{TENANT}/v2.0",
            "aud": CLIENT_ID,
            "exp": int(time.time()) + 600,
            "iat": int(time.time()),
            "tid": TENANT,
            "sub": "test-sp",
            "azp": "caller-app",
        },
        rsa_private_key,
        algorithm="RS256",
        headers={"kid": "test-kid"},
    )

async def test__authenticate__accepts_valid_signed_token(signed_token, monkeypatch):
    # Construct a real PyJWKClient pointing at a local mock JWKS endpoint
    # (not shown — see PyJWKClient.from_jwk_set_data for synthetic key sets)
    ...
```

For most route tests this level of fidelity is unnecessary — relying on `AUTH_BYPASS` for the happy path and the dependency-override pattern (Example 4) for failure paths is sufficient. Reach for signed-token tests only when validating the JWT decode pipeline itself.

## Example 7: Mirrored test tree

```
tests/
  conftest.py
  routers/
    conftest.py                   # router-specific fixtures (e.g. pre-seeded Redis)
    test_recommendation.py
    test_health.py
  services/
    conftest.py                   # service fixtures (FakeGraph, etc.)
    test_recommendation_service.py
    test_cache.py
    test_postgres_graph.py
  auth/
    test_jwt.py
    test_m2m.py
```

Each subfolder's `conftest.py` adds layer-specific fixtures. The root `conftest.py` provides global fixtures and the `pytest_configure` hook for env vars.

## Example 8: Running coverage in CI

```yaml
# .github/workflows/quality-pipeline.yaml (excerpt)
- name: Run tests with coverage
  run: |
    poetry run pytest \
      --cov=app \
      --cov-report=xml \
      --cov-report=html \
      --cov-fail-under=80
```

The `coverage.xml` artifact feeds into SonarQube via the existing `sonar-project.properties` — see `github-actions-cicd` for the full workflow pattern.
