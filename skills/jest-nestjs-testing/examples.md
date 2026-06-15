# Jest Testing for NestJS Examples

## Service unit test with mocked repository

```ts
// src/modules/businesses/businesses.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createMock, DeepMocked } from '@golevelup/ts-jest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { BusinessesService } from './businesses.service';
import { Business } from './entities/business.entity';

describe('BusinessesService', () => {
  let service: BusinessesService;
  let repo: DeepMocked<Repository<Business>>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        BusinessesService,
        { provide: getRepositoryToken(Business), useValue: createMock<Repository<Business>>() },
      ],
    }).compile();

    service = module.get(BusinessesService);
    repo = module.get(getRepositoryToken(Business));
  });

  describe('create', () => {
    it('test__create__throws_conflict_when_slug_taken', async () => {
      repo.findOne.mockResolvedValue({ id: 'existing' } as Business);
      await expect(service.create('user-1', { slug: 'taco', businessName: 'Taco' } as any))
        .rejects.toThrow(ConflictException);
    });

    it('test__create__persists_with_owner', async () => {
      repo.findOne.mockResolvedValue(null);
      repo.create.mockReturnValue({ slug: 'taco' } as Business);
      repo.save.mockResolvedValue({ id: 'new', slug: 'taco', owner_id: 'user-1' } as Business);

      const result = await service.create('user-1', { slug: 'taco', businessName: 'Taco' } as any);

      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ slug: 'taco', owner_id: 'user-1' }),
      );
      expect(result.id).toBe('new');
    });
  });

  describe('findOne', () => {
    it('test__findOne__throws_404_when_missing', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.findOne('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
```

## Auth e2e test with real JWT

```ts
// test/auth.e2e-spec.ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/modules/users/entities/user.entity';
import * as bcrypt from 'bcrypt';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let jwt: JwtService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    ds = app.get(DataSource);
    jwt = app.get(JwtService);
  });

  afterAll(async () => { await app.close(); });

  beforeEach(async () => {
    // truncate user-related tables; rest follow CASCADE
    await ds.query('TRUNCATE "users" RESTART IDENTITY CASCADE');
  });

  it('test__POST_register__returns_token_and_user', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        fullName: 'Leo K',
        email: 'leo@example.com',
        password: 'secret-pass',
        confirmPassword: 'secret-pass',
      })
      .expect(201);

    expect(res.body.access_token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'leo@example.com', full_name: 'Leo K' });
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('test__POST_login__rejects_wrong_password', async () => {
    await ds.getRepository(User).save({
      email: 'leo@example.com',
      full_name: 'Leo K',
      password_hash: await bcrypt.hash('right', 10),
      user_type: 'normal',
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'leo@example.com', password: 'wrong' })
      .expect(401);
  });

  it('test__GET_me__returns_user_for_valid_token', async () => {
    const user = await ds.getRepository(User).save({
      email: 'leo@example.com',
      full_name: 'Leo K',
      password_hash: 'x',
      user_type: 'normal',
    });
    const token = jwt.sign({ sub: user.id, email: user.email });

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({ id: user.id, email: 'leo@example.com' });
  });

  it('test__GET_me__rejects_missing_token', () =>
    request(app.getHttpServer()).get('/auth/me').expect(401));
});
```

## Controller test with guard bypass

```ts
// businesses.controller.spec.ts — auth not under test here
describe('BusinessesController', () => {
  let app: INestApplication;
  let service: DeepMocked<BusinessesService>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [BusinessesController],
      providers: [{ provide: BusinessesService, useValue: createMock<BusinessesService>() }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = { id: 'user-1' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    service = module.get(BusinessesService);
  });

  afterAll(() => app.close());

  it('test__POST_businesses__400_on_invalid_dto', () =>
    request(app.getHttpServer()).post('/businesses').send({}).expect(400));

  it('test__GET_business__delegates_to_service', async () => {
    service.findOne.mockResolvedValue({ id: 'b1', slug: 'taco' } as Business);

    const res = await request(app.getHttpServer())
      .get('/businesses/b1')
      .expect(200);

    expect(res.body).toMatchObject({ id: 'b1', slug: 'taco' });
    expect(service.findOne).toHaveBeenCalledWith('b1');
  });
});
```

## Guard unit test

```ts
describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as any;
    guard = new RolesGuard(reflector);
  });

  const ctxFor = (user: any) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => null,
      getClass: () => null,
    }) as unknown as ExecutionContext;

  it('test__canActivate__allows_when_no_roles_required', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(ctxFor({ user_type: 'normal' }))).toBe(true);
  });

  it('test__canActivate__denies_user_without_required_role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserType.ADMIN]);
    expect(guard.canActivate(ctxFor({ user_type: UserType.MEMBER }))).toBe(false);
  });

  it('test__canActivate__allows_user_with_required_role', () => {
    reflector.getAllAndOverride.mockReturnValue([UserType.ADMIN]);
    expect(guard.canActivate(ctxFor({ user_type: UserType.ADMIN }))).toBe(true);
  });
});
```

## Truncate-everything helper

```ts
// test/helpers/reset-db.ts
import { DataSource } from 'typeorm';

export async function resetDb(ds: DataSource) {
  const tables = ds.entityMetadatas.map(e => `"${e.tableName}"`).join(', ');
  await ds.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
}
```

```ts
// usage in any e2e spec
beforeEach(() => resetDb(app.get(DataSource)));
```

## Jest config sanity checks

```jsonc
// package.json (already in this project)
"jest": {
  "rootDir": "src",
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": ["**/*.(t|j)s", "!**/*.module.ts", "!**/main.ts"],
  "coverageThreshold": {
    "global": { "branches": 80, "functions": 80, "lines": 80, "statements": 80 }
  },
  "testEnvironment": "node"
}
```

E2E tests under `test/` use `test/jest-e2e.json`:

```jsonc
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" }
}
```

## Existing project bug to fix

`test/app.e2e-spec.ts` currently uses `beforeEach` to compile and init the app, and is missing `afterAll(app.close)`. Fix:

```diff
- beforeEach(async () => {
+ beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });

+ afterAll(async () => { await app.close(); });
```
