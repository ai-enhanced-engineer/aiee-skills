---
name: typeorm-patterns
description: TypeORM 0.3 patterns with PostgreSQL — entity modeling, relations and N+1 prevention, DataSource vs Repository vs QueryBuilder, migrations workflow, transactions, soft deletes. Use when designing or reviewing TypeORM data access code.
updated: 2026-05-06
---

# TypeORM 0.3 Patterns with PostgreSQL

TypeORM 0.3 removed `getConnection()` and `@Connection`; everything runs through a single `DataSource`. The `findOne(id)` overload, the `@EntityRepository` decorator, and the inline-CLI config are all gone. This skill covers the patterns you actually need for production NestJS + Postgres.

## When to use

- Modeling a new entity (column types, indexes, relations)
- Choosing between `Repository<T>`, `DataSource.createQueryBuilder()`, and `DataSource.transaction()`
- Setting up the migrations CLI for TypeORM 0.3
- Diagnosing slow queries (usually N+1)
- Adding soft delete to an existing entity

## Core patterns

| Need | Use | Notes |
|---|---|---|
| Standard CRUD | `@InjectRepository(Entity) repo: Repository<Entity>` | Default choice |
| Complex JOIN/aggregation | `dataSource.createQueryBuilder()` | Or `repo.createQueryBuilder('alias')` |
| Multi-entity atomic write | `dataSource.transaction(async manager => ...)` | Default isolation `READ COMMITTED` |
| Cross-service tx propagation | `typeorm-transactional` `@Transactional` decorator | Bootstrap `initializeTransactionalContext()` in `main.ts` |
| Raw SQL (DDL, EXPLAIN, upsert) | `dataSource.query(sql, params)` | String interpolation here is a SQL injection vector — pass values via the `params` array |

## Entity essentials

- `@PrimaryGeneratedColumn('uuid')` over auto-increment ints for public-facing IDs — sequential integers leak row counts and enable enumeration attacks
- `@Column({ type: 'timestamptz' })` over bare `'timestamp'` — bare `timestamp` stores wall-clock without offset, so server-TZ changes silently shift historical data
- `@CreateDateColumn` / `@UpdateDateColumn` / `@DeleteDateColumn` for free
- `@Index()` every FK column you filter or join on — Postgres does **not** auto-index FKs
- `@Column({ type: 'enum', enum: SomeEnum })` for fixed sets; jsonb for flexible blobs

## N+1 prevention

```ts
// BAD: lazy relations in loop → 1 + N queries
const businesses = await repo.find();
for (const b of businesses) console.log((await b.images).length);

// GOOD: explicit relations option → one JOIN
const businesses = await repo.find({
  where: { is_active: true },
  relations: { images: true, categories: true },
});
```

Setting `eager: true` on a relation decorator forces the JOIN on every `find*` call site, including high-fanout listing endpoints that only need the parent — the cost compounds invisibly. Prefer per-call `relations: { ... }` so each endpoint declares what it actually consumes.

## Migrations workflow (TypeORM 0.3)

The CLI requires a separate `data-source.ts` file (NestJS uses its own runtime config). Set `synchronize: false` for any environment except local dev. Add scripts using `typeorm-ts-node-commonjs`:

```
migration:generate -- src/migrations/Name   # diffs DB vs entities
migration:run                                # applies pending
migration:revert                             # rolls back last
migration:create                             # empty file for hand-written DDL
```

## Anti-patterns

- `synchronize: true` in production → silent column DROP on rename, no rollback
- Lazy relations iterated in a loop → 1 + N queries
- No `@Index()` on FK columns → full-table scan on every JOIN
- `repository.save(partial)` without an `id` → unintended duplicate insert
- `update(id, partial)` when `@BeforeUpdate` listeners must fire → silent bypass
- `getConnection()` / `@Connection` → throws at runtime in 0.3
- Unique constraint without `WHERE deleted_at IS NULL` partial index → can't reuse soft-deleted slots

See `reference.md` for the full DataSource/Repository/QueryBuilder decision table, transaction patterns, soft-delete recipe, and migration CLI setup. See `examples.md` for project-specific entity, relation, and transaction examples.
