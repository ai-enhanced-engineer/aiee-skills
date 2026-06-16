# Passport JWT Auth in NestJS Examples

## Auth module wiring

```ts
// src/modules/auth/auth.module.ts
@Module({
  imports: [
    TypeOrmModule.forFeature([User, PasswordResetToken]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: cfg.get<string>('JWT_EXPIRATION') ?? '7d' },
      }),
    }),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

## JwtStrategy with DB-backed validate

```ts
// src/modules/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    cfg: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });
  }

  async validate(payload: { sub: string; email: string }) {
    const user = await this.users.findOne({
      where: { id: payload.sub, is_active: true, deleted_at: IsNull() },
    });
    if (!user) throw new UnauthorizedException('Account inactive or removed');
    return user;
  }
}
```

## Auth service

```ts
// src/modules/auth/auth.service.ts
@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PasswordResetToken) private readonly tokens: Repository<PasswordResetToken>,
    private readonly jwt: JwtService,
    private readonly mailer: MailService,
    private readonly dataSource: DataSource,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Passwords do not match');
    }
    const existing = await this.users.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    const password_hash = await bcrypt.hash(dto.password, 12);
    const user = await this.users.save({
      email: dto.email,
      full_name: dto.fullName,
      password_hash,
      user_type: UserType.NORMAL,
    });
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.users.findOne({ where: { email: dto.email } });
    if (!user || !(await bcrypt.compare(dto.password, user.password_hash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!user.is_active) throw new ForbiddenException('Account deactivated');
    return this.buildAuthResponse(user);
  }

  async forgotPassword(email: string) {
    const user = await this.users.findOne({ where: { email } });
    if (user) {
      // invalidate prior unused tokens
      await this.tokens.update(
        { user_id: user.id, used_at: IsNull() },
        { used_at: new Date() },
      );
      const raw = randomBytes(32).toString('hex');
      const token_hash = await bcrypt.hash(raw, 10);
      await this.tokens.save({
        user_id: user.id,
        token_hash,
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
      });
      await this.mailer.sendResetEmail(user.email, raw);
    }
    // identical response regardless of user existence
    return { message: 'If the email exists, a reset link has been sent.' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const candidates = await this.tokens.find({
      where: { used_at: IsNull(), expires_at: MoreThan(new Date()) },
    });
    let match: PasswordResetToken | null = null;
    for (const c of candidates) {
      if (await bcrypt.compare(dto.token, c.token_hash)) { match = c; break; }
    }
    if (!match) throw new BadRequestException('Invalid or expired token');

    await this.dataSource.transaction(async m => {
      await m.update(User, match.user_id, {
        password_hash: await bcrypt.hash(dto.newPassword, 12),
      });
      await m.update(PasswordResetToken, match.id, { used_at: new Date() });
    });
  }

  private buildAuthResponse(user: User) {
    return {
      access_token: this.jwt.sign({ sub: user.id, email: user.email }),
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        user_type: user.user_type,
      },
    };
  }
}
```

## Auth controller with throttler

```ts
@Controller('auth')
@UseGuards(ThrottlerGuard)              // @nestjs/throttler
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) { return this.auth.register(dto); }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto) { return this.auth.login(dto); }

  @Post('forgot-password')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })   // strict limit
  forgot(@Body() dto: ForgotPasswordDto) { return this.auth.forgotPassword(dto.email); }

  @Post('reset-password')
  reset(@Body() dto: ResetPasswordDto) { return this.auth.resetPassword(dto); }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: User) {
    return { id: user.id, email: user.email, full_name: user.full_name };
  }
}
```

## Roles guard

```ts
// src/common/decorators/roles.decorator.ts
export const Roles = (...roles: UserType[]) => SetMetadata('roles', roles);
```

```ts
// src/common/guards/roles.guard.ts
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserType[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required?.length) return true;
    const { user } = ctx.switchToHttp().getRequest();
    return user && required.includes(user.user_type);
  }
}
```

```ts
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserType.MEMBER)
@Patch(':id')
updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto) { /* ... */ }
```

## Reset token entity (with hashed storage)

```ts
@Entity('password_reset_tokens')
export class PasswordResetToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  user_id: string;

  @Column()                             // bcrypt hash, never raw
  token_hash: string;

  @Column({ type: 'timestamptz' })
  expires_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  used_at: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}
```
