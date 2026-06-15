# TypeORM 0.3 Patterns Examples

## Full entity with relations + indexes

```ts
// src/modules/businesses/entities/business.entity.ts
import {
  Entity, PrimaryGeneratedColumn, Column, Index,
  ManyToOne, OneToMany, ManyToMany, JoinTable, JoinColumn,
  CreateDateColumn, UpdateDateColumn, DeleteDateColumn,
} from 'typeorm';

@Entity('businesses')
@Index(['recognition_status', 'is_active'])    // composite for list filtering
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  business_name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'enum', enum: BusinessType })
  business_type: BusinessType;

  @Column({ type: 'enum', enum: RecognitionStatus, default: RecognitionStatus.PENDING })
  recognition_status: RecognitionStatus;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'jsonb', default: [] })
  features: string[];

  @Column({ type: 'numeric', precision: 3, scale: 2, nullable: true })
  rating: number | null;

  @Column({ type: 'uuid', nullable: true })
  @Index()                                          // FK column always indexed
  owner_id: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_id' })
  owner: User | null;

  @OneToMany(() => BusinessImage, img => img.business)
  images: BusinessImage[];

  @ManyToMany(() => Category)
  @JoinTable({
    name: 'business_categories',
    joinColumn: { name: 'business_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories: Category[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamptz' })
  deleted_at: Date | null;
}
```

## Service using Repository

```ts
// src/modules/businesses/businesses.service.ts
@Injectable()
export class BusinessesService {
  constructor(
    @InjectRepository(Business) private readonly repo: Repository<Business>,
  ) {}

  async listActive(page = 1, limit = 20) {
    return this.repo.find({
      where: { is_active: true },
      relations: { categories: true, images: true },
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  async findBySlug(slug: string) {
    const business = await this.repo.findOne({
      where: { slug },
      relations: { categories: true, images: true, owner: true },
    });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }

  async patch(id: string, partial: DeepPartial<Business>) {
    // update() — fast, no SELECT, no listeners
    const result = await this.repo.update({ id }, partial);
    if (!result.affected) throw new NotFoundException('Business not found');
    return this.repo.findOneByOrFail({ id });
  }
}
```

## QueryBuilder for complex search

```ts
async search(q: string, categorySlug?: string) {
  const qb = this.repo.createQueryBuilder('b')
    .leftJoinAndSelect('b.categories', 'c')
    .leftJoinAndSelect('b.images', 'i', 'i.is_primary = true')
    .where('b.is_active = :active', { active: true });

  if (q) {
    qb.andWhere('(b.business_name ILIKE :q OR b.description ILIKE :q)', { q: `%${q}%` });
  }
  if (categorySlug) {
    qb.andWhere('c.slug = :slug', { slug: categorySlug });
  }

  return qb.orderBy('b.rating', 'DESC', 'NULLS LAST').take(50).getMany();
}
```

## Transaction across multiple entities

```ts
async approveNomination(nominationId: string, adminId: string) {
  return this.dataSource.transaction('READ COMMITTED', async manager => {
    const nomination = await manager.findOneOrFail(Nomination, {
      where: { id: nominationId },
    });

    if (nomination.status !== NominationStatus.PENDING) {
      throw new ConflictException('Nomination already processed');
    }

    await manager.update(Nomination, nominationId, {
      status: NominationStatus.APPROVED,
      reviewed_by: adminId,
      reviewed_at: new Date(),
    });

    if (nomination.business_id) {
      await manager.update(Business, nomination.business_id, {
        recognition_status: RecognitionStatus.RECOGNIZED,
      });
    }

    await manager.save(AnalyticsEvent, {
      event_type: 'nomination_approved',
      business_id: nomination.business_id,
      user_id: adminId,
    });
  });
}
```

## CLI data-source.ts

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
  database: process.env.DB_NAME ?? 'cabos',
  synchronize: false,
  entities: ['src/modules/**/entities/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
});
```

```json
// package.json scripts (excerpt)
"typeorm": "typeorm-ts-node-commonjs",
"migration:generate": "npm run typeorm -- migration:generate -d src/data-source.ts",
"migration:run": "npm run typeorm -- migration:run -d src/data-source.ts",
"migration:revert": "npm run typeorm -- migration:revert -d src/data-source.ts",
"migration:create": "npm run typeorm -- migration:create"
```

## Generated migration

```ts
// src/migrations/1714999999999-AddBusinessSlugIndex.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBusinessSlugIndex1714999999999 implements MigrationInterface {
  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE UNIQUE INDEX businesses_slug_unique
        ON businesses (slug)
        WHERE deleted_at IS NULL
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP INDEX businesses_slug_unique`);
  }
}
```

## Custom repository

```ts
// src/modules/businesses/businesses.repository.ts
@Injectable()
export class BusinessesRepository extends Repository<Business> {
  constructor(private dataSource: DataSource) {
    super(Business, dataSource.createEntityManager());
  }

  async findActiveWithImages(slug: string) {
    return this.findOne({
      where: { slug, is_active: true, recognition_status: RecognitionStatus.RECOGNIZED },
      relations: { images: true, categories: true },
    });
  }
}
```

```ts
// businesses.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Business])],
  providers: [BusinessesService, BusinessesRepository],
  exports: [BusinessesService],
})
export class BusinessesModule {}
```

## Soft delete with partial unique index

```ts
// entity
@Entity('businesses')
export class Business {
  @Column({ unique: false })   // remove the @Column unique; we use a partial index
  slug: string;

  @DeleteDateColumn({ type: 'timestamptz' })
  deleted_at: Date | null;
}
```

```sql
-- migration
CREATE UNIQUE INDEX businesses_slug_unique
  ON businesses (slug)
  WHERE deleted_at IS NULL;
```

```ts
// service
async deactivate(id: string) {
  await this.repo.softDelete(id);
}

async listAll(includeDeleted = false) {
  return this.repo.find({ withDeleted: includeDeleted });
}
```
