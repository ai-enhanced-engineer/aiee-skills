# Jest Testing for NestJS Services Reference

## `Test.createTestingModule` patterns

### Pattern A — providers list (unit tests)

Compose only what you need. Avoid importing the full `AppModule` for unit tests — it pulls in TypeORM, JWT, mailer, and slows the test by orders of magnitude.

```ts
const module = await Test.createTestingModule({
  providers: [
    BusinessesService,
    { provide: getRepositoryToken(Business), useValue: createMock<Repository<Business>>() },
    { provide: ConfigService, useValue: { get: () => 'test' } },
  ],
}).compile();
```

### Pattern B — `.useMocker(createMock)` (NestJS 8+)

Auto-mock any provider not explicitly listed. Removes `useValue: createMock(...)` boilerplate.

```ts
import { createMock } from '@golevelup/ts-jest';

const module = await Test.createTestingModule({
  providers: [BusinessesService],
})
  .useMocker(createMock)
  .compile();
```

### Pattern C — `overrideProvider` / `overrideGuard` (e2e)

When importing `AppModule` for e2e, swap pieces:

```ts
const module = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(MailService).useValue({ sendResetEmail: jest.fn() })
  .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })   // bypass auth in unrelated specs
  .compile();
```

## Mocking the TypeORM Repository

### Token

```ts
import { getRepositoryToken } from '@nestjs/typeorm';
{ provide: getRepositoryToken(Business), useValue: createMock<Repository<Business>>() }
```

### `createMock` from @golevelup/ts-jest

Install once: `npm i -D @golevelup/ts-jest`. Auto-mocks every method, including chained `QueryBuilder`:

```ts
const repo = createMock<Repository<Business>>();
repo.findOne.mockResolvedValue({ id: 'b1', slug: 'taco' } as Business);
repo.createQueryBuilder().leftJoinAndSelect('b.images', 'i').getMany
  .mockResolvedValue([{ id: 'b1' } as Business]);
```

`DeepMocked<T>` gives full TS inference on `.mockResolvedValue` etc.

### Manual mock (no extra dep)

```ts
useValue: {
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
  createQueryBuilder: jest.fn().mockReturnValue({
    where: jest.fn().mockReturnThis(),
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
  }),
}
```

Manual is fine for one-off; `createMock` saves time once your service hits 5+ repo methods.

## E2E with supertest + INestApplication

### Lifecycle rules

- `beforeAll` for `app.init()` — once per spec file
- `afterAll` for `app.close()` — closes Postgres pool, JWT timers, mailer connections
- `beforeEach` only for **state reset** (truncate tables, reset mocks)

### Why a real Postgres test DB

TypeORM relies on Postgres-specific column types: `uuid`, `jsonb`, `enum`, `timestamptz`, `text[]`. SQLite-in-memory rejects all of these. Either:

- Run a Postgres container in CI (recommended)
- Use the dev Postgres with a separate `test` database created fresh per CI run

### Global pipes / filters

Apply the same global pipes/filters in tests as in `main.ts`, otherwise validation/error-shape tests will pass for the wrong reasons:

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
app.useGlobalFilters(new AllExceptionsFilter());
```

## Test database isolation

| Pattern | Pros | Cons | When |
|---|---|---|---|
| **A. Truncate tables in `beforeEach`** | Simple; works without library | Slow as schema grows; still serial | Small suites, < 50 tests |
| **B. Transaction rollback** (`typeorm-test-transactions`) | ~73% faster than truncate; no test data leaks | Connection routing discipline (must use the same `Manager` per test) | Default for serious projects |
| **C. Per-test schema (`SET search_path`)** | Parallelizable | Migration overhead per test, complex setup | Rare — choose only if test parallelism is the bottleneck |

### Pattern A example

```ts
beforeEach(async () => {
  const ds = app.get(DataSource);
  for (const e of ds.entityMetadatas) {
    await ds.query(`TRUNCATE "${e.tableName}" RESTART IDENTITY CASCADE`);
  }
});
```

### Pattern B example

```ts
import { runInTransaction } from 'typeorm-transactional';

beforeEach(() => runInTransaction(async () => { /* test runs inside; rolled back after */ }));
```

(Or use `typeorm-test-transactions` which wraps Jest hooks for you.)

## Auth in e2e tests

### Real token via `JwtService`

Use this for auth-flow tests where the JWT pipeline itself is under test:

```ts
let access: string;
beforeAll(async () => {
  const jwt = app.get(JwtService);
  access = jwt.sign({ sub: 'user-1', email: 'leo@example.com' });
});

it('GET /auth/me', () =>
  request(app.getHttpServer())
    .get('/auth/me')
    .set('Authorization', `Bearer ${access}`)
    .expect(200));
```

### Bypass guard

For controller tests where auth isn't the subject under test:

```ts
.overrideGuard(JwtAuthGuard).useValue({
  canActivate: (ctx: ExecutionContext) => {
    ctx.switchToHttp().getRequest().user = { id: 'user-1', email: 'leo@example.com' };
    return true;
  },
})
```

Don't use guard bypass in your auth-flow specs themselves — you'll be testing nothing.

## Coverage targets per layer

| Layer | Target | Notes |
|---|---|---|
| Services | 90 %+ | Core business logic; behavioral tests required |
| Controllers | 80 %+ | Route mapping, DTO binding |
| Guards / interceptors / pipes | Both pass and fail paths | Negative path always |
| DTOs (custom validators) | 90 %+ | Validation failure cases |
| Custom repositories | Integration only | Don't unit-test mocks of yourself |
| Module bootstrap | One e2e smoke test | "app starts" |

Critical paths — auth, payments, anything irreversible — push to 95 % per `unit-test-standards`.

## Open-handle / hang debug

| Symptom | Cause | Fix |
|---|---|---|
| Jest hangs after suite passes | `app.close()` never called | Add `afterAll(async () => app.close())` |
| "A worker process has failed to exit gracefully" | `setInterval` / DB pool / mailer connection | Find the unclosed resource; mock or close it |
| Tests pass locally, fail in CI | Schema drift via `synchronize: true` | Run migrations in CI; `synchronize: false` |
| Random order-dependent failures | Shared DB state | Truncate/rollback in `beforeEach` |

## Anti-patterns

| Anti-pattern | Consequence | Fix |
|---|---|---|
| Mocking down to repo in every test | Tests pass against fiction; integration bugs slip | Service unit tests mock repo; controller e2e hits real DB |
| Shared DB state between tests | Order-dependent flakes | Truncate or rollback per test |
| Snapshot tests for HTTP bodies | Churn on every harmless change | Assert specific fields |
| Asserting on log output | Brittle; logs aren't contract | Assert behavior or returned value |
| No negative-path tests | High coverage, low confidence | One assertion per failure mode |
| `synchronize: true` in tests on shared DB | Schema drift across runs | `synchronize: false`; run migrations |
| `beforeEach(app.init)` | ~10× slower e2e; masks state bugs | `beforeAll(app.init)` |
| Missing `afterAll(app.close)` | Jest open handles, hangs | Always close |

## References

- `unit-test-standards` skill — naming convention, coverage thresholds, behavioral test rules
- `pytest-fastapi-async` skill — conceptual parallels for async test lifecycle
- https://docs.nestjs.com/fundamentals/testing
- https://github.com/jmcdo29/testing-nestjs (community reference suite)
- https://golevelup.github.io/nestjs/testing/ts-jest.html
