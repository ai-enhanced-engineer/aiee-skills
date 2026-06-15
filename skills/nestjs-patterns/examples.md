# NestJS 11 Modern Patterns Examples

## Feature module skeleton

```ts
// src/modules/businesses/businesses.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from './entities/business.entity';
import { BusinessImage } from './entities/business-image.entity';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';

@Module({
  imports: [TypeOrmModule.forFeature([Business, BusinessImage])],
  controllers: [BusinessesController],
  providers: [BusinessesService],
  exports: [BusinessesService],         // export only the service, not TypeOrmModule
})
export class BusinessesModule {}
```

## Thin controller, fat service

```ts
// businesses.controller.ts
@Controller('businesses')
export class BusinessesController {
  constructor(private readonly businesses: BusinessesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser('id') userId: string, @Body() dto: CreateBusinessDto) {
    return this.businesses.create(userId, dto);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.businesses.findOne(id);
  }
}
```

```ts
// businesses.service.ts
@Injectable()
export class BusinessesService {
  constructor(
    @InjectRepository(Business) private readonly repo: Repository<Business>,
  ) {}

  async create(ownerId: string, dto: CreateBusinessDto) {
    const existing = await this.repo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException('Business slug already exists');

    const business = this.repo.create({ ...dto, owner_id: ownerId });
    return this.repo.save(business);
  }

  async findOne(id: string) {
    const business = await this.repo.findOne({ where: { id }, relations: { images: true } });
    if (!business) throw new NotFoundException('Business not found');
    return business;
  }
}
```

## DTO with class-validator

```ts
// businesses/dto/create-business.dto.ts
export class CreateBusinessDto {
  @IsString() @IsNotEmpty() @MaxLength(100)
  businessName: string;

  @IsEmail()
  businessEmail: string;

  @IsOptional() @IsUrl()
  website?: string;

  @IsOptional() @IsEnum(BusinessType)
  businessType?: BusinessType;

  @IsOptional()
  @ValidateNested()
  @Type(() => OperatingHoursDto)
  operatingHours?: OperatingHoursDto;
}
```

## `CurrentUser` param decorator

```ts
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { User } from '../../modules/users/entities/user.entity';

export const CurrentUser = createParamDecorator(
  (key: keyof User | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return key ? req.user?.[key] : req.user;
  },
);
```

```ts
// usage — services stay singleton, no REQUEST scope
@Get('me')
@UseGuards(JwtAuthGuard)
me(@CurrentUser() user: User) { return user; }

@Delete('account')
@UseGuards(JwtAuthGuard)
delete(@CurrentUser('id') id: string) { return this.users.softDelete(id); }
```

## Global exception filter wiring

```ts
// src/common/filters/all-exceptions.filter.ts
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

```ts
// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
```

## Domain exception with stable code

```ts
// src/common/exceptions/app.exception.ts
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

```ts
throw new AppException(
  'Business has not been verified',
  HttpStatus.FORBIDDEN,
  'BUSINESS_NOT_VERIFIED',
  { businessId },
);
```

## Logging interceptor

```ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const start = Date.now();
    return next.handle().pipe(
      tap(() => this.logger.log(`${req.method} ${req.url} ${Date.now() - start}ms`)),
    );
  }
}
```

```ts
// main.ts
app.useGlobalInterceptors(new LoggingInterceptor());
```

## Config validation schema

```ts
// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  load: [databaseConfig, jwtConfig],
  validationSchema: Joi.object({
    DB_HOST: Joi.string().required(),
    DB_PORT: Joi.number().default(5432),
    DB_USERNAME: Joi.string().required(),
    DB_PASSWORD: Joi.string().required(),
    DB_NAME: Joi.string().default('cabos'),
    JWT_SECRET: Joi.string().min(32).required(),
    JWT_EXPIRATION: Joi.string().default('7d'),
    FRONTEND_URL: Joi.string().uri().default('http://localhost:3000'),
    NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  }),
}),
```

## Typed config injection

```ts
@Injectable()
export class AuthService {
  constructor(
    @Inject(jwtConfig.KEY) private readonly jwt: ConfigType<typeof jwtConfig>,
  ) {}

  signToken(sub: string) {
    return this.jwtService.sign({ sub }, { secret: this.jwt.secret, expiresIn: this.jwt.expiresIn });
  }
}
```
