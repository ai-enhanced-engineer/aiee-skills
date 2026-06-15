---
name: jest-nestjs-testing
description: Unit and e2e testing for NestJS with Jest, Test.createTestingModule, supertest, and TypeORM. Covers repository mocking, test database isolation, auth in e2e tests, and coverage targets per layer. Use when writing or reviewing NestJS tests.
updated: 2026-05-21
kb-sources:
  - wiki/software-engineering/unit-test-standards
---

# Jest Testing for NestJS Services

NestJS testing has a few load-bearing primitives: `Test.createTestingModule` for assembling a DI graph, `getRepositoryToken(Entity)` for swapping the repo, `INestApplication` + supertest for e2e, and a real Postgres test DB (SQLite-in-memory breaks on `uuid` and `jsonb`).

For test naming (`test__<what>__<expected>`) and coverage thresholds, see `unit-test-standards`. The async-test lifecycle parallels `pytest-fastapi-async` (`dependency_overrides` ↔ `overrideProvider`, fixture teardown ↔ `app.close()` in `afterAll`).

## When to use

- Writing the first unit test for a service
- Adding e2e coverage for an authenticated route
- Eliminating Jest open-handle warnings or hangs
- Migrating from "mock everything" to integration-with-test-DB

## Decision: unit vs e2e

| Layer | Test type | Why |
|---|---|---|
| Service business logic | Unit (mock repo) | Highest priority — most logic lives here |
| Controller routing / DTO validation | Unit + e2e | Unit for shape; e2e for the validation pipe |
| Guards / interceptors | Unit | Pass + fail paths both required |
| Repository custom queries | Integration with real Postgres | Mocks lie about query semantics |
| Auth flows end-to-end | e2e | Whole pipeline matters |

## Skeletons

- **Unit tests** use `Test.createTestingModule` + `getRepositoryToken(Entity)` + `createMock<Repository<Entity>>()` from `@golevelup/ts-jest` (auto-mocks every method including QueryBuilder chains).
- **E2E tests** boot the full `AppModule` once in `beforeAll` (not `beforeEach`), apply the production `ValidationPipe`, and `await app.close()` in `afterAll` — without it Jest hangs.

See `examples.md` for the full unit and e2e test skeletons, controller test with guard bypass, guard unit test, and DB truncation helper.

## Anti-patterns

- Mocking down to the repository in every test → 80% coverage, 0% confidence
- Shared test DB state across tests → order-dependent flakes
- Snapshot tests for HTTP responses → churn on every harmless change
- Asserting on log output → brittle
- Tests with no negative-path assertions → "happy path only" coverage
- `synchronize: true` against a shared dev DB in tests → schema drift on every run
- `beforeEach(app.init)` → re-creates the app per test; ~10× slower e2e suite, also masks shared-state bugs
- Missing `afterAll(app.close)` → Jest "open handle" warning, eventual hang

See `reference.md` for repository mock patterns, the three test-DB isolation strategies, and auth in e2e. See `examples.md` for project-specific specs.
