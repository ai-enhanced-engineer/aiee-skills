---
name: nestjs-patterns
description: NestJS 11 production patterns for module organization, dependency injection scopes, DTO validation pipeline, guards/interceptors/middleware/pipes, exception filters, and typed configuration. Use when building or reviewing NestJS APIs.
updated: 2026-05-06
---

# NestJS 11 Modern Patterns

NestJS 11 (Jan 2026) defaults to the SWC compiler and ESM modules; the DI/module API is unchanged from v10. This skill covers the runtime patterns that decide whether a NestJS service stays maintainable past 20+ modules.

## When to use

- Designing or reviewing a NestJS feature module
- Wiring `forRoot` / `forFeature` for shared infrastructure (TypeORM, JWT, mailer)
- Choosing between guard / interceptor / middleware / pipe for a cross-cutting concern
- Configuring the global `ValidationPipe` and exception filter
- Resolving circular module dependencies or DI scope mistakes

## Core patterns

| Concern | Tool | Example |
|---|---|---|
| Authn / authz | Guard | `JwtAuthGuard`, `RolesGuard` |
| Request timing / response envelope | Interceptor | `LoggingInterceptor` |
| DTO validation, param coercion | Pipe | global `ValidationPipe` |
| CORS, rate limit, cookie parse | Middleware | `app.use(cors(...))` |
| Error normalization | Exception filter | `AllExceptionsFilter` |

## DI scopes

Default to **singleton** (`@Injectable()`). Use `Scope.REQUEST` only when a service truly needs the raw `Request` object — request scope bubbles up the entire DI subtree and costs ~20–30% throughput. Prefer the `@CurrentUser()` param decorator pattern at the controller boundary.

## Validation pipeline

```ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
}));
```

`whitelist` strips unknown fields (mass-assignment defense). `forbidNonWhitelisted` rejects requests with extras. `enableImplicitConversion` removes the need for `@Type(() => Number)` on every numeric query param.

## Module boundaries

`forRoot(options)` — once at app level (TypeORM, JWT). `forFeature([entities])` — per feature module. Export only the service the consumer needs; **do not re-export `TypeOrmModule`** from a feature module — it leaks every repository registered for that feature.

For broader DDD module-boundary guidance, see the `arch-ddd` skill.

## Anti-patterns

- Business logic in controllers → untestable, violates SRP
- Circular module deps → providers `undefined` at runtime; refactor over `forwardRef()`
- Throwing raw `Error` instead of `HttpException` → 500 instead of 400/422
- Overusing `Scope.REQUEST` → measurable throughput drop from scope bubble-up
- Missing config validation schema → runtime failure under load instead of startup failure

See `reference.md` for the full guard/interceptor/pipe decision tree, exception filter template, and `@nestjs/config` typed-config patterns. See `examples.md` for project-specific feature-module skeletons.
