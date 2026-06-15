---
name: pytest-fastapi-async
description: pytest-asyncio + httpx AsyncClient patterns for testing async FastAPI services. Covers asyncio_mode/loop_scope config, ASGITransport, fixture recipes (app, DB pool, fakeredis FakeAsyncRedis, env-based bypass toggles), and coverage config. Sibling to unit-test-standards (which owns naming/coverage thresholds) and fastapi-patterns (which owns dependency_overrides). Use for writing a new async test, debugging pytest-asyncio deprecation warnings, or migrating off the deprecated event_loop fixture override.
updated: 2026-04-27
---

# pytest + FastAPI Async Testing

Async-specific testing patterns for FastAPI services — pytest-asyncio config, `httpx.AsyncClient` + `ASGITransport`, async fixture recipes.

## When to use

- Writing a new test for an async router or service
- Adding/debugging fixtures for DB pool, Redis, or env-based bypass toggles
- Resolving `DeprecationWarning` from pytest-asyncio about `asyncio_default_fixture_loop_scope`
- Migrating off the deprecated `event_loop` fixture override (removed in pytest-asyncio 1.0)

For test naming (`test__<what>__<expected>`), tautological-test detection, and the `--cov-fail-under=80` threshold, see `unit-test-standards`. For `app.dependency_overrides[get_x] = fake_x` and teardown discipline, see `fastapi-patterns`.

## Core patterns

| Pattern | Description |
|---|---|
| `asyncio_mode = "auto"` | Tests are auto-marked asyncio without per-function `@pytest.mark.asyncio`; right default for projects with one async backend. |
| `asyncio_default_fixture_loop_scope = "function"` | Required since pytest-asyncio 0.24; suppresses the deprecation warning that appears on every run otherwise. |
| `event_loop` fixture override | Removed in pytest-asyncio 1.0 (May 2025); raises `AttributeError`. Replaced by the loop_scope config above. |
| `AsyncClient` + `ASGITransport` | Routes through ASGI in-process, no socket. `TestClient` (sync, runs its own loop) conflicts with async fixtures. |
| Lifespan handling | `AsyncClient` does not fire lifespan events. Override DB/Redis via `dependency_overrides` so tests don't depend on real lifespan boot. |
| `app` fixture | Session-scoped — the FastAPI app object is cheap and stateless; shared safely across tests. |
| `client` fixture | Function-scoped; clearing `app.dependency_overrides` in teardown prevents mock leakage across tests. |
| Fake Redis | `from fakeredis import FakeAsyncRedis` — in-process, zero latency, no daemon. The retired `aioredis` package is no longer required. |
| Env-var settings (e.g. AUTH bypass) | Module-import-time settings need `pytest_configure` hook or `pytest-env`; `monkeypatch.setenv` runs too late. |
| Coverage source | `[tool.coverage.run] source = ["app"]`; omit `main.py` when its lifespan boot needs real cloud backends. |

## Skeleton

```python
# Decision shape only — full conftest in examples.md (Example 1)
def pytest_configure(config):
    os.environ.setdefault("AUTH_BYPASS", "true")    # before app.settings is imported

@pytest_asyncio.fixture
async def client(app, fake_redis):
    app.dependency_overrides[get_redis] = lambda: fake_redis
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()                 # teardown — see fastapi-patterns
```

## Anti-patterns (top 5)

1. **`TestClient` in `async def test_*`** that touches async fixtures → event-loop conflict. Use `AsyncClient` + `ASGITransport`.
2. **Overriding `event_loop` fixture** → deprecated v0.22, removed v1.0. Use `asyncio_default_fixture_loop_scope` instead.
3. **Hitting real Azure / cloud resources in tests** → slow, flaky, leaks credentials in CI logs. `dependency_overrides` + `FakeAsyncRedis`.
4. **`monkeypatch.setenv` for module-import-time vars** → fixture-setup runs after import; setting has no effect. Use `pytest_configure` or `pytest-env`.
5. **Forgetting `app.dependency_overrides.clear()`** → mocks leak across tests. Clear in fixture teardown.

See `reference.md` for the full pattern catalogue and `examples.md` for project-grounded recipes (route tests, service tests, auth-failure tests).
