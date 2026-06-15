# NestJS 11 Modern Patterns Reference

## NestJS 11 vs 10

| Change | Impact |
|---|---|
| SWC compiler default | ~20× faster builds, no app-code changes |
| ESM-first | `import './app.module.js'` (note `.js` extension on TS imports) |
| Standalone bootstrap | `NestFactory.create(AppController)` without root module — for microservices/lambdas |
| `@nestjs/telemetry` | Auto-instruments controllers, resolvers, DB calls with OpenTelemetry |
| Vitest scaffold | New projects get Vitest by default; existing Jest setups still work |

## Module architecture

### Feature module

```ts
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

### Root module

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig, jwtConfig] }),
    TypeOrmModule.forRootAsync({ /* ... */ }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
```

### Global modules

```ts
@Global()
@Module({
  providers: [LoggerService],
  exports: [LoggerService],
})
export class CoreModule {}
```

Use `@Global()` sparingly — overuse defeats module-boundary discipline.

### `forRoot` vs `forFeature`

- `forRoot(options)` — singleton, app-level. TypeORM connection, JWT signing config, Redis client.
- `forFeature([entities])` — per feature module. Registers repositories scoped to that module.

### Circular dependencies

Last-resort escape hatch:

```ts
@Module({ imports: [forwardRef(() => OtherModule)] })
```

Prefer extracting the shared dependency into a third module. Treat `forwardRef` as a code smell that needs an inline comment explaining why restructuring isn't viable.

## DI scopes

| Scope | Declaration | When |
|---|---|---|
| `DEFAULT` (singleton) | `@Injectable()` | Default for everything stateless |
| `REQUEST` | `@Injectable({ scope: Scope.REQUEST })` | Only when the raw `Request` is needed deep in a service |
| `TRANSIENT` | `@Injectable({ scope: Scope.TRANSIENT })` | Context-aware loggers — each consumer gets its own instance |

### Request-scope bubble-up

Injecting a request-scoped provider into a controller makes the controller request-scoped, which makes its services request-scoped. The entire DI subtree re-instantiates on every request. Benchmarks show ~20–30% throughput drop on high-QPS routes.

### Per-request data without REQUEST scope

```ts
export const CurrentUser = createParamDecorator(
  (key: keyof User | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return key ? req.user?.[key] : req.user;
  },
);

@Get('me')
me(@CurrentUser() user: User) { /* ... */ }
```

This reads `request.user` at the controller boundary. Services stay singleton.

## Validation pipeline

### Global config

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
}));
```

### Common decorators

```ts
import {
  IsString, IsEmail, IsNotEmpty, MinLength, MaxLength,
  IsOptional, IsEnum, IsNumber, Min, Max, IsBoolean,
  IsArray, ArrayNotEmpty, IsUUID, IsUrl, IsDateString,
  ValidateNested, IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
```

### Nested objects

```ts
class OperatingHoursDto {
  @IsString() open: string;
  @IsString() close: string;
}

class UpdateDetailsDto {
  @ValidateNested()
  @Type(() => OperatingHoursDto)   // required; otherwise nested validation silently passes
  operatingHours?: OperatingHoursDto;
}
```

### Partial updates

```ts
import { PartialType } from '@nestjs/mapped-types';
export class UpdateUserDto extends PartialType(CreateUserDto) {}
```

## Guards / interceptors / middleware / pipes

### Execution order

```
Request
  → Middleware           (pre-routing; no DI; CORS, rate limit, cookie parse)
  → Guard                (auth/authz; ExecutionContext sees route metadata)
  → Interceptor (pre)    (wraps handler; logging, caching, transform input)
  → Pipe                 (validation, coercion)
  → Handler
  → Interceptor (post)   (response envelope, metadata headers)
  → Exception filter     (catches throws; normalizes 4xx/5xx)
Response
```

### Decision rules

- Auth in **guard**, never middleware. Middleware runs before route resolution and cannot read `@Roles` / `@Public` decorators.
- Response envelopes (`{ data, meta }`) in **interceptor**, never controller. Centralizes shape changes.
- DTO validation in **pipe** (`ValidationPipe`). Field-level coercion in pipe (`@Param('id', ParseIntPipe)`).
- CORS, rate limit in **middleware**.

## Exception filters

### Built-in `HttpException` hierarchy

`BadRequestException` (400), `UnauthorizedException` (401), `ForbiddenException` (403), `NotFoundException` (404), `ConflictException` (409), `UnprocessableEntityException` (422), `TooManyRequestsException` (429), `InternalServerErrorException` (500).

### Global filter template

```ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isHttp ? exception.getResponse() : 'Internal server error';

    if (status >= 500) this.logger.error(exception);
    else this.logger.warn(`${status} ${req.method} ${req.url}`);

    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.url,
      message: typeof message === 'object' ? message : { message },
    });
  }
}
```

Wire in `main.ts`: `app.useGlobalFilters(new AllExceptionsFilter())`.

### Domain exception base

```ts
export class AppException extends HttpException {
  constructor(
    message: string,
    status: HttpStatus,
    public readonly code: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super({ message, code, details }, status);
  }
}
```

Throw with stable error codes the client can switch on:

```ts
throw new AppException('Business not verified', HttpStatus.FORBIDDEN, 'BUSINESS_NOT_VERIFIED');
```

## `@nestjs/config` typed configuration

### `registerAs` namespace

```ts
export default registerAs('database', () => ({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  /* ... */
}));
```

### Validation schema

```ts
ConfigModule.forRoot({
  isGlobal: true,
  load: [databaseConfig, jwtConfig],
  validationSchema: Joi.object({
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    JWT_SECRET: Joi.string().min(32).required(),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  }),
})
```

Without a schema, missing env vars surface as runtime errors under load instead of clear startup failures.

### Typed injection

```ts
@Injectable()
export class AuthService {
  constructor(
    @Inject(jwtConfig.KEY) private readonly jwt: ConfigType<typeof jwtConfig>,
  ) {}
  // jwt.secret, jwt.expiresIn fully typed
}
```

## Anti-patterns

| Anti-pattern | Consequence | Fix |
|---|---|---|
| Business logic in controllers | Untestable without HTTP layer; not reusable from CLI/queues | Thin controllers; logic in services |
| Circular module deps | Providers `undefined` at runtime, opaque init errors | Extract shared module; `forwardRef` only as last resort with comment |
| Missing global `ValidationPipe` | DTO decorators don't run; mass-assignment vulnerability | `app.useGlobalPipes(new ValidationPipe({ whitelist, forbidNonWhitelisted, transform }))` |
| Throwing raw `Error` | All errors return HTTP 500 | Throw `HttpException` subclasses |
| Overusing `Scope.REQUEST` | DI subtree re-instantiates per request; ~20–30% throughput drop | Singleton services; pass per-request data as method args |
| Missing config validation | Missing env vars fail at runtime, not startup | Joi/Zod `validationSchema` in `ConfigModule.forRoot` |
| Re-exporting `TypeOrmModule` from feature module | Leaks all repositories to consumers; breaks encapsulation | Export only the feature service |

## References

- https://docs.nestjs.com/
- https://docs.nestjs.com/techniques/validation
- https://docs.nestjs.com/exception-filters
- https://docs.nestjs.com/fundamentals/injection-scopes
- `arch-ddd` skill — module boundaries / DDD bounded contexts
