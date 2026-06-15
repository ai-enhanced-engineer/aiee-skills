---
name: passport-jwt-nestjs
description: JWT authentication in NestJS with @nestjs/passport, passport-jwt, and bcrypt. Covers JwtStrategy, token issuance with @nestjs/jwt, refresh-token rotation, password hashing, password reset flow, and role-based authorization. Use for NestJS auth implementation or review.
updated: 2026-05-21
kb-sources:
  - wiki/software-engineering/auth-architecture
---

# Passport JWT Auth in NestJS

JWT auth in NestJS layers `@nestjs/passport` (NestJS adapter) over `passport-jwt` (the Passport strategy). Token issuance is separate, via `@nestjs/jwt`. Get the wiring right once and the rest is mechanical; get it wrong and you ship algorithm-confusion attacks or password reset replay bugs.

For general auth principles (token lifetimes, threat model, defense-in-depth), see KB article `auth-architecture`. For the *concept* of JWT signature/aud/iss/alg validation, see `pyjwt-fastapi-validation` (Python; same principles, different SDK).

## When to use

- Wiring `JwtAuthGuard` and `JwtStrategy` for a new NestJS service
- Adding refresh-token rotation to an existing access-token-only setup
- Building a password reset flow
- Hardening bcrypt cost / token storage / serialization

## Core wiring

```ts
// auth.module.ts
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRATION') ?? '7d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

## Hardening checklist

- [ ] `bcrypt` cost ≥ 12 (OWASP 2026 floor)
- [ ] `JwtStrategy`: `ignoreExpiration: false`, **explicit `algorithms: ['HS256']`** (default accepts all → algorithm confusion)
- [ ] `validate()` does a DB lookup to enforce soft revocation (`is_active`, `deleted_at`)
- [ ] Strip the password-hash field at the DTO layer (`@Exclude` + `class-transformer`, or explicit response mapping) — leaking the bcrypt hash gives attackers a cost-factor oracle and an offline-cracking target
- [ ] Password reset tokens: `crypto.randomBytes(32).toString('hex')`, **bcrypt-hashed at rest**, single-use (`used_at`), short expiry (15–60 min)
- [ ] Identical 200 response on `/forgot-password` for missing vs existing emails (no enumeration)
- [ ] `@nestjs/throttler` on `/forgot-password` and `/login`
- [ ] Refresh tokens use a separate secret, longer expiry, server-side rotation, hashed in DB

## Anti-patterns

- bcrypt cost < 10 → GPU-crackable in hours
- Reusable / unhashed reset tokens → DB read = account takeover
- `ignoreExpiration: true` or missing → expired tokens accepted
- No `algorithms` whitelist on `JwtStrategy` → `alg=none` and HS/RS confusion attacks
- Password hash in API response (`return user`) → leak via any user-fetch endpoint
- Different responses for "email not found" vs "email sent" → enumeration
- JWT in `localStorage` without strict CSP / Trusted Types → any XSS = full takeover
- No rate limit on `/forgot-password` → email-spam DoS

See `reference.md` for the JwtStrategy template, refresh-rotation pattern, password reset state machine, and role guard. See `examples.md` for project-specific service wiring.
