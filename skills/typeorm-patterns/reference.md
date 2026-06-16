# TypeORM 0.3 Patterns Reference

## Entity modeling

### Common decorators

```ts
@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  @Index()
  business_name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'enum', enum: BusinessType })
  business_type: BusinessType;

  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ type: 'timestamptz', nullable: true })
  verified_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deleted_at: Date | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;
}
```

### PostgreSQL-native column types

| TypeORM | Postgres | When |
|---|---|---|
| `'uuid'` | `uuid` | All public-facing IDs |
| `'timestamptz'` | `timestamp with time zone` | All datetimes |
| `'jsonb'` | `jsonb` | Flexible blobs, arrays |
| `{ type: 'text', array: true }` | `text[]` | Lighter than jsonb for flat arrays |
| `'enum'` + `enum:` | Postgres ENUM | Fixed value sets |
| `'numeric'` + `precision:` `scale:` | `numeric(p,s)` | Money — never `float`/`double` |

### Indexes

```ts
@Index()                                 // single column
@Column() email: string;

@Index(['user_id', 'business_id'])       // composite
@Unique(['user_id', 'business_id'])      // composite unique
```

Partial / functional indexes need a hand-written migration:

```sql
CREATE UNIQUE INDEX businesses_slug_unique
  ON businesses (slug)
  WHERE deleted_at IS NULL;
```

## Relations

### One-to-many / many-to-one

```ts
// Business side
@OneToMany(() => BusinessImage, img => img.business)
images: BusinessImage[];

// BusinessImage side
@ManyToOne(() => Business, b => b.images, { onDelete: 'CASCADE' })
@JoinColumn({ name: 'business_id' })
business: Business;
```

### Many-to-many with join table

```ts
@ManyToMany(() => Category)
@JoinTable({
  name: 'business_categories',
  joinColumn: { name: 'business_id' },
  inverseJoinColumn: { name: 'category_id' },
})
categories: Category[];
```

### Cascade rules

- `onDelete: 'CASCADE'` — DB-level cascade (preferred for child rows)
- `onDelete: 'SET NULL'` — preserve child, null the FK
- `cascade: ['insert', 'update']` — TypeORM-level cascade through `save()`; use sparingly, can mask bugs

### N+1 prevention

```ts
// Single query with JOIN
await repo.find({
  where: { is_active: true },
  relations: { categories: true, images: true },
});

// QueryBuilder for filtering on joined columns
await repo.createQueryBuilder('b')
  .leftJoinAndSelect('b.categories', 'c')
  .where('c.slug = :slug', { slug: 'restaurants' })
  .getMany();
```

## DataSource / Repository / QueryBuilder

### Decision table

| Use | Abstraction |
|---|---|
| CRUD on one entity | `Repository<T>` via `@InjectRepository` |
| JOINs, aggregates, subqueries | `dataSource.createQueryBuilder()` |
| Multi-entity atomic write | `dataSource.transaction(...)` |
| Raw SQL (DDL, EXPLAIN, ON CONFLICT) | `dataSource.query(sql, params)` |

### `findOne` signature changed in 0.3

```ts
// removed
repo.findOne(id, { relations: ['user'] });
// 0.3
repo.findOne({ where: { id }, relations: { user: true } });
repo.findOneBy({ id });
```

### Custom repository (no more `@EntityRepository`)

```ts
@Injectable()
export class BusinessRepository extends Repository<Business> {
  constructor(private dataSource: DataSource) {
    super(Business, dataSource.createEntityManager());
  }

  async findActiveBySlug(slug: string) {
    return this.findOne({ where: { slug, is_active: true } });
  }
}
```

Provide it in the module: `providers: [BusinessRepository]`. Inject directly — no token boilerplate.

## Migrations workflow

### `data-source.ts`

```ts
// src/data-source.ts
import 'dotenv/config';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  synchronize: false,
  entities: ['src/modules/**/entities/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
```

### `package.json` scripts

```json
"typeorm": "typeorm-ts-node-commonjs",
"migration:generate": "npm run typeorm -- migration:generate -d src/data-source.ts",
"migration:run": "npm run typeorm -- migration:run -d src/data-source.ts",
"migration:revert": "npm run typeorm -- migration:revert -d src/data-source.ts",
"migration:create": "npm run typeorm -- migration:create"
```

### Workflow

1. Change an entity
2. `npm run migration:generate -- src/migrations/AddXIndex` — diffs live DB vs entities
3. Inspect generated SQL; trim or hand-edit
4. `npm run migration:run` — applies pending
5. `npm run migration:revert` — rolls back last (one at a time)

For `CREATE INDEX CONCURRENTLY` (zero-downtime), use `migration:create` and add `--transaction none` flag, then write SQL by hand.

### `synchronize` rule

`synchronize: true` is fine for local dev only. Any shared environment must use `synchronize: false` and run migrations explicitly. The drift detection lives in `migration:generate` — if it produces a non-empty migration on a "clean" prod, your env diverged.

## Transactions

### Pattern A — `DataSource.transaction()` (default)

```ts
await this.dataSource.transaction('READ COMMITTED', async manager => {
  await manager.save(Nomination, nomination);
  await manager.update(Business, businessId, { recognition_status: 'pending' });
});
```

### Pattern B — `QueryRunner` (fine-grained)

```ts
const qr = this.dataSource.createQueryRunner();
await qr.connect();
await qr.startTransaction();
try {
  await qr.manager.save(...);
  await qr.commitTransaction();
} catch (e) {
  await qr.rollbackTransaction();
  throw e;
} finally {
  await qr.release();   // omitting exhausts the pool
}
```

### Pattern C — `@Transactional` decorator (cross-service propagation)

```ts
// main.ts (before NestFactory.create)
import { initializeTransactionalContext, StorageDriver } from 'typeorm-transactional';
initializeTransactionalContext({ storageDriver: StorageDriver.AUTO });
addTransactionalDataSource(dataSource);
```

```ts
@Transactional({ isolationLevel: IsolationLevel.READ_COMMITTED })
async createNomination(dto: CreateNominationDto) {
  // sub-service calls share this transaction automatically
}
```

## Soft deletes

```ts
@DeleteDateColumn({ type: 'timestamptz' })
deleted_at: Date | null;
```

```ts
await repo.softDelete(id);            // sets deleted_at; no listeners
await repo.softRemove(entity);        // sets deleted_at; fires @BeforeRemove
await repo.restore(id);               // clears deleted_at
await repo.find({ withDeleted: true });
qb.withDeleted();                     // QueryBuilder
```

`find*` queries auto-add `WHERE deleted_at IS NULL`. Unique constraints still apply to soft-deleted rows — use a partial unique index in a manual migration.

## Anti-patterns

| Anti-pattern | Consequence | Solution |
|---|---|---|
| `synchronize: true` in prod | Silent column DROP on rename; no rollback | `synchronize: false` + migrations |
| Lazy relations in loop | 1 + N queries | `relations` option or `leftJoinAndSelect` |
| `eager: true` on decorator | Fires on every list endpoint | Per-query `relations` |
| No `@Index()` on FK columns | Full-table scan on JOIN | Add `@Index()` to every filtered/joined FK |
| `save()` for known-existing rows | SELECT before UPDATE; 2 round trips | `update(id, partial)` |
| `update()` when listeners must fire | `@BeforeUpdate` silently bypassed | `save()` (incurs the SELECT) |
| Multiple `DataSource` per test run | Pool exhaustion | One shared `DataSource`; `destroy()` in `afterAll` |
| Partial entity to `save()` no `id` | Inserts a duplicate | Ensure `id` present or use `update()` |
| `getConnection()` / `@Connection` | Runtime error in 0.3 | Inject `DataSource` |
| `findOne(id)` (positional) | Removed in 0.3 | `findOne({ where: { id } })` or `findOneBy({ id })` |

## References

- https://typeorm.io/
- https://typeorm.io/data-source
- https://typeorm.io/migrations
- https://typeorm.io/relations
- `arch-ddd` skill — repository pattern foundation
