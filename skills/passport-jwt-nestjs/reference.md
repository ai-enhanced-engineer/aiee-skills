# Passport JWT Auth in NestJS Reference

## JwtStrategy

```ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly cfg: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],          // explicit; default accepts all algorithms
    });
  }

  // Whatever this returns becomes req.user
  async validate(payload: { sub: string; email: string }) {
    const user = await this.users.findOne({
      where: { id: payload.sub, is_active: true, deleted_at: IsNull() },
    });
    if (!user) throw new UnauthorizedException();
    return user;                      // soft-revocation: deactivated users get 401
  }
}
```

## JwtAuthGuard

```ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```ts
@UseGuards(JwtAuthGuard)
@Get('me')
me(@CurrentUser() user: User) { return user; }
```

For controller-wide protection, apply at the class: `@UseGuards(JwtAuthGuard)` above `@Controller(...)`.

## Token issuance

```ts
@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(user: User) {
    return this.jwt.sign({ sub: user.id, email: user.email });
  }
}
```

Configure in module:

```ts
JwtModule.registerAsync({
  inject: [ConfigService],
  useFactory: (cfg: ConfigService) => ({
    secret: cfg.getOrThrow<string>('JWT_SECRET'),
    signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRATION') ?? '7d' },
  }),
}),
```

`JWT_SECRET` should be ≥ 32 random bytes (Joi: `Joi.string().min(32).required()`).

## Refresh-token rotation

Two strategies, two secrets, separate DB table for refresh tokens (hashed). On each refresh: verify, **rotate** (issue new refresh token, invalidate old), return new access + new refresh. Detect reuse of an already-rotated token → revoke entire chain (likely theft).

```ts
// auth.module.ts — register both strategies
providers: [AuthService, JwtStrategy, JwtRefreshStrategy],
```

```ts
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: cfg.getOrThrow('JWT_REFRESH_SECRET'),
      algorithms: ['HS256'],
      passReqToCallback: true,
    });
  }
  async validate(req: Request, payload: any) {
    const raw = req.headers.authorization?.replace('Bearer ', '');
    return { ...payload, refreshToken: raw };  // forward raw token to controller for hash compare
  }
}
```

```ts
@UseGuards(AuthGuard('jwt-refresh'))
@Post('refresh')
refresh(@CurrentUser() user: any) {
  return this.auth.rotateRefreshToken(user.sub, user.refreshToken);
}
```

In `rotateRefreshToken`: bcrypt-compare presented token vs the row in `refresh_tokens`, mark used, issue new pair.

## Password hashing

```ts
import * as bcrypt from 'bcrypt';
const COST = 12;                                  // OWASP 2026 floor

const hash = await bcrypt.hash(password, COST);
const ok = await bcrypt.compare(plaintext, hash); // timing-safe
```

argon2 is preferred for new projects (`argon2id`, memory-hard). bcrypt is acceptable when the rest of the stack already uses it. Never `bcrypt.hashSync` in a request path — blocks the event loop.

## Password reset flow

State machine for `password_reset_tokens`:

```
issued (created_at, expires_at, hashed_token, used_at NULL)
  → consumed (used_at = NOW)
  → expired (expires_at < NOW)
```

```ts
async forgotPassword(email: string) {
  const user = await this.users.findOne({ where: { email } });
  if (user) {
    // invalidate any prior unused tokens
    await this.tokens.update(
      { user_id: user.id, used_at: IsNull() },
      { used_at: new Date() },
    );
    const raw = randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(raw, 10);
    await this.tokens.save({
      user_id: user.id,
      token_hash: hash,
      expires_at: new Date(Date.now() + 60 * 60 * 1000), // 1h
    });
    await this.mailer.sendResetEmail(user.email, raw);
  }
  return { message: 'If the email exists, a reset link has been sent.' };
}
```

Constant message regardless of `user` existence → no enumeration.

```ts
async resetPassword(rawToken: string, newPassword: string) {
  const candidates = await this.tokens.find({
    where: { used_at: IsNull(), expires_at: MoreThan(new Date()) },
  });
  const match = await this.findMatch(candidates, rawToken);
  if (!match) throw new BadRequestException('Invalid or expired token');

  await this.dataSource.transaction(async m => {
    await m.update(User, match.user_id, { password_hash: await bcrypt.hash(newPassword, 12) });
    await m.update(PasswordResetToken, match.id, { used_at: new Date() });
  });
}
```

## Role-based authorization

```ts
// roles.decorator.ts
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

// roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return required.includes(user?.role);
  }
}
```

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Delete(':id')
remove(@Param('id') id: string) { /* admin only */ }
```

`AuthGuard('jwt')` runs first (sets `req.user`); `RolesGuard` reads it.

## Serialization — never leak the hash

```ts
@Entity('users')
export class User {
  @Exclude()
  @Column()
  password_hash: string;
}
```

With `class-transformer` + `ClassSerializerInterceptor` registered globally, `@Exclude` strips the field from any response. Alternative (preferred when the DTO shape is well-defined): explicit DTO mapping in the service:

```ts
private toAuthResponse(user: User, token: string): AuthResponse {
  return {
    access_token: token,
    user: { id: user.id, email: user.email, full_name: user.full_name },
  };
}
```

## Storage tradeoffs (SPA tokens)

| Storage | XSS risk | CSRF risk | Refresh-on-load | When |
|---|---|---|---|---|
| `localStorage` | High (any XSS = takeover) | None | Easy | Default for many SPAs; only safe with strict CSP + Trusted Types |
| Memory + `httpOnly` refresh cookie | Low | Mitigated by SameSite=Strict + CSRF token | Refresh fetch on load | Recommended when refresh tokens exist |
| Plain `httpOnly` cookie (access token) | None | Yes (need CSRF token) | n/a | Server-rendered apps |

## Anti-patterns

| Anti-pattern | Consequence | Fix |
|---|---|---|
| bcrypt cost < 10 | GPU-crackable in hours | Cost ≥ 12 (or argon2id) |
| Reset tokens in plaintext in DB | DB read = account takeover | Store bcrypt hash; raw value in email only |
| Reusable reset tokens | Replay window | Single-use via `used_at` |
| Identical reset URL after expiry | Enumeration through timing | Constant response text and timing |
| `ignoreExpiration: true` | Expired tokens accepted | `false` (or omit; default is false) |
| No `algorithms` whitelist | `alg=none`, HS/RS confusion | `algorithms: ['HS256']` explicitly |
| Returning user with `password_hash` | Leak via any user endpoint | DTO mapping or `@Exclude` |
| Different `/forgot-password` responses | Email enumeration | Identical message regardless of email existence |
| No throttler on auth endpoints | Spam, DoS, brute force | `@nestjs/throttler` with strict per-IP limits |
| Long-lived single access token (no refresh) | Server-side revocation impossible without per-request DB hit | Short access (15–60 min) + rotating refresh |

## References

- KB: `software-engineering/auth-architecture` — token lifetimes, threat model, defense-in-depth
- Sibling skill: `pyjwt-fastapi-validation` — JWT validation concepts (Python equivalent)
- https://docs.nestjs.com/security/authentication
- https://docs.nestjs.com/security/authorization
- https://www.passportjs.org/packages/passport-jwt/
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
