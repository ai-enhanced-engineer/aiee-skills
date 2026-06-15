# Laravel 8+ Modern Architecture Patterns Reference

Comprehensive guide to Repository + Action patterns, Sanctum authentication, and Laravel 8+ best practices.

## Repository Pattern Deep Dive

### Why Use Repositories?

1. **Separation of Concerns** - Controllers don't know about data access
2. **Testability** - Mock repositories in tests
3. **Flexibility** - Swap implementations without changing business logic
4. **Consistency** - Centralized query logic

### Repository Implementation

**Always define an interface:**

```php
namespace App\Repositories;

interface UserRepositoryInterface {
    public function find(int $id): User;
    public function findByEmail(string $email): ?User;
    public function save(User $user): User;
    public function delete(int $id): bool;
}
```

**Implement with dependency injection:**

```php
class UserRepository implements UserRepositoryInterface {
    public function find(int $id): User {
        return User::with('roles')->findOrFail($id);
    }

    public function findByEmail(string $email): ?User {
        return User::where('email', $email)->first();
    }

    public function save(User $user): User {
        $user->save();
        return $user->fresh();
    }

    public function delete(int $id): bool {
        return User::destroy($id) > 0;
    }
}
```

**Bind in service provider:**

```php
// app/Providers/AppServiceProvider.php
public function register() {
    $this->app->bind(
        UserRepositoryInterface::class,
        UserRepository::class
    );
}
```

### Base Repository Pattern

```php
abstract class BaseRepository {
    protected $model;

    public function all() {
        return $this->model->all();
    }

    public function find(int $id) {
        return $this->model->findOrFail($id);
    }

    public function create(array $data) {
        return $this->model->create($data);
    }

    public function update(int $id, array $data) {
        $record = $this->find($id);
        $record->update($data);
        return $record;
    }
}

class UserRepository extends BaseRepository {
    public function __construct(User $model) {
        $this->model = $model;
    }

    // Add custom methods
    public function findActive() {
        return $this->model->where('active', true)->get();
    }
}
```

---

## Action vs Service vs Job

### Decision Tree

```
Need async/queued execution?
├─ YES → Use Job
└─ NO → Need multi-step orchestration?
    ├─ YES → Use Service
    └─ NO → Use Action
```

### Action Class Characteristics

- **Single responsibility** - One operation
- **Reusable** - Can be called from multiple places
- **Injected dependencies** - Constructor injection
- **Returns result** - Direct return value

**Example:**

```php
class SaveItemAction {
    public function __construct(
        private ShapeRepository $repository
    ) {}

    public function execute($file, $userId, $shape) {
        $path = Storage::disk('s3')->put('items', $file, 'public');
        $url = Storage::disk('s3')->url($path);
        return $this->repository->save($userId, $shape, $url);
    }
}
```

### Service Class Characteristics

- **Multi-step orchestration** - Coordinates multiple actions
- **Transaction management** - Often wraps in DB transaction
- **Event dispatching** - Triggers domain events
- **Complex business rules** - More than single operation

**Example:**

```php
class OrderService {
    public function __construct(
        private OrderRepository $orders,
        private PaymentService $payments,
        private NotificationService $notifications
    ) {}

    public function createOrder(array $data) {
        return DB::transaction(function () use ($data) {
            $order = $this->orders->create($data);
            $this->payments->charge($order);
            $this->notifications->sendConfirmation($order);
            event(new OrderCreated($order));
            return $order;
        });
    }
}
```

### Job Class Characteristics

- **Queued** - Async execution
- **Retry logic** - Built-in failure handling
- **Serializable** - State persisted to queue
- **Long-running** - Video processing, emails, etc.

**Example:**

```php
class ProcessVideoJob implements ShouldQueue {
    use Dispatchable, Queueable;

    public int $timeout = 300;
    public int $tries = 3;

    public function __construct(
        public Video $video
    ) {}

    public function handle(FFMpegService $ffmpeg) {
        $ffmpeg->generateThumbnail($this->video);
        $ffmpeg->convertToHLS($this->video);
    }
}
```

---

## Sanctum SPA Authentication

### Configuration

**config/sanctum.php:**

```php
'stateful' => explode(',', env('SANCTUM_STATEFUL_DOMAINS', 'localhost')),
```

**.env:**

```
SANCTUM_STATEFUL_DOMAINS=localhost,localhost:3000
SESSION_DOMAIN=localhost
SPA_URL=http://localhost:3000
```

### CORS Setup

**config/cors.php:**

```php
'paths' => ['api/*', 'sanctum/csrf-cookie'],
'supports_credentials' => true,
```

### Authentication Flow

**1. Get CSRF token:**

```javascript
// React frontend
await axios.get('/sanctum/csrf-cookie');
```

**2. Login:**

```javascript
await axios.post('/api/auth/token', {
    email: 'user@example.com',
    password: 'password'
});
```

**3. Authenticated requests:**

```javascript
await axios.get('/api/user');  // Auto includes session cookie
```

**4. Logout:**

```javascript
await axios.delete('/api/auth/token');
```

### Backend Routes

```php
// routes/api.php
Route::post('/auth/token', [AuthController::class, 'store']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [UserController::class, 'show']);
    Route::delete('/auth/token', [AuthController::class, 'delete']);
});
```

### AuthController

```php
class AuthController {
    public function store(Request $request) {
        $credentials = $request->validate([
            'email' => 'required|email',
            'password' => 'required'
        ]);

        if (!Auth::attempt($credentials)) {
            return response()->json([
                'message' => 'Invalid credentials'
            ], 401);
        }

        $request->session()->regenerate();

        return response()->json([
            'user' => $request->user()
        ]);
    }

    public function delete(Request $request) {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json(['message' => 'Logged out']);
    }
}
```

---

## Eloquent Relationships

### One-to-Many

```php
// Course model
public function modules() {
    return $this->hasMany(Module::class, 'course_id');
}

// Module model (inverse)
public function course() {
    return $this->belongsTo(Course::class);
}
```

### Many-to-Many

```php
// User model
public function roles() {
    return $this->belongsToMany(Role::class)
        ->withTimestamps()
        ->withPivot('assigned_at');
}

// Role model
public function users() {
    return $this->belongsToMany(User::class);
}
```

### Has Many Through

```php
// Country -> User -> Post
public function posts() {
    return $this->hasManyThrough(Post::class, User::class);
}
```

### Eager Loading Strategies

```php
// N+1 Problem
$courses = Course::all();
foreach ($courses as $course) {
    echo $course->modules->count();  // Query per course!
}

// Solution: Eager loading
$courses = Course::with('modules')->get();
foreach ($courses as $course) {
    echo $course->modules->count();  // Already loaded!
}

// Nested eager loading
$courses = Course::with('modules.videos')->get();

// Conditional eager loading
$courses = Course::with(['modules' => function ($query) {
    $query->where('active', true);
}])->get();

// Load counts
$courses = Course::withCount('modules')->get();
echo $courses[0]->modules_count;  // No query needed
```

### Soft Deletes

```php
use Illuminate\Database\Eloquent\SoftDeletes;

class Course extends Model {
    use SoftDeletes;

    protected $dates = ['deleted_at'];
}

// Usage
$course->delete();  // Soft delete
$course->forceDelete();  // Permanent delete
$course->restore();  // Restore

// Query with trashed
Course::withTrashed()->get();
Course::onlyTrashed()->get();
```

---

## Request Validation

### Form Requests

```php
php artisan make:request SaveShapeRequest

class SaveShapeRequest extends FormRequest {
    public function authorize() {
        return true;
    }

    public function rules() {
        return [
            'image' => 'required|mimes:jpeg,jpg,png|max:2048',
            'shape' => 'required|string|max:255'
        ];
    }

    public function messages() {
        return [
            'image.required' => 'Please upload an image',
            'image.mimes' => 'Image must be jpeg, jpg, or png'
        ];
    }
}

// Controller usage
public function save(SaveShapeRequest $request, SaveItemAction $action) {
    // $request is already validated!
    return $action->execute($request->validated());
}
```

### Custom Validation Rules

```php
class UniqueEmail implements Rule {
    public function passes($attribute, $value) {
        return !User::where('email', $value)->exists();
    }

    public function message() {
        return 'The :attribute has already been taken.';
    }
}

// Usage
'email' => ['required', 'email', new UniqueEmail]
```

---

## API Resources

### Basic Resource

```php
php artisan make:resource UserResource

class UserResource extends JsonResource {
    public function toArray($request) {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'created_at' => $this->created_at->toDateTimeString(),
        ];
    }
}

// Controller
return new UserResource($user);
return UserResource::collection($users);
```

### Conditional Attributes

```php
public function toArray($request) {
    return [
        'id' => $this->id,
        'name' => $this->name,
        'email' => $this->when(
            $request->user()->isAdmin(),
            $this->email
        ),
        'secret' => $this->when(
            $request->user()->can('view-secrets'),
            'secret-value'
        ),
    ];
}
```

### Nested Resources

```php
class CourseResource extends JsonResource {
    public function toArray($request) {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'modules' => ModuleResource::collection($this->whenLoaded('modules')),
        ];
    }
}
```

---

## Testing Strategies

### Feature Tests

```php
use Illuminate\Foundation\Testing\RefreshDatabase;

class ItemControllerTest extends TestCase {
    use RefreshDatabase;

    public function test__save__valid_image__creates_shape() {
        $user = User::factory()->create();
        $file = UploadedFile::fake()->image('shape.jpg');

        $response = $this->actingAs($user)
            ->post('/api/detection/item', [
                'image' => $file,
                'shape' => 'circle'
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('items', [
            'user_id' => $user->id,
            'shape' => 'circle'
        ]);
    }
}
```

### Unit Tests (Repository)

```php
class ShapeRepositoryTest extends TestCase {
    public function test__save__valid_data__persists_shape() {
        $repository = new ShapeRepository();

        $shape = $repository->save(1, 'circle', 'http://example.com/shape.jpg');

        $this->assertInstanceOf(Shape::class, $shape);
        $this->assertEquals('circle', $shape->shape);
        $this->assertEquals(1, $shape->user_id);
    }
}
```

### Mocking

```php
public function test__action__calls_repository() {
    $mockRepo = Mockery::mock(ShapeRepository::class);
    $mockRepo->shouldReceive('save')
        ->once()
        ->with(1, 'circle', Mockery::type('string'))
        ->andReturn(new Shape());

    $action = new SaveItemAction($mockRepo);
    $result = $action->execute($file, 1, 'circle');

    $this->assertInstanceOf(Shape::class, $result);
}
```

---

## Mass Assignment Protection

```php
class User extends Model {
    // Allow these fields to be mass assigned
    protected $fillable = [
        'name',
        'email',
        'password',
    ];

    // OR: Block these fields from mass assignment
    protected $guarded = ['id', 'is_admin'];

    // Never use: protected $guarded = [];
}
```

---

## Anti-Patterns & Solutions

### 1. Fat Controllers

**❌ Bad:**

```php
public function store(Request $request) {
    $validated = $request->validate([...]);
    $path = Storage::put('images', $request->file('image'));
    $url = Storage::url($path);
    $shape = new Shape();
    $shape->user_id = auth()->id();
    $shape->shape = $validated['shape'];
    $shape->url = $url;
    $shape->save();
    event(new ShapeSaved($shape));
    return response()->json($shape, 201);
}
```

**✅ Good:**

```php
public function store(SaveShapeRequest $request, SaveItemAction $action) {
    $shape = $action->execute($request->validated());
    return new ShapeResource($shape);
}
```

### 2. Business Logic in Models

**❌ Bad:**

```php
class Order extends Model {
    public function processPayment() {
        // Payment processing logic
    }
}
```

**✅ Good:**

```php
class ProcessPaymentAction {
    public function execute(Order $order) {
        // Payment processing logic
    }
}
```

### 3. N+1 Queries

**❌ Bad:**

```php
$courses = Course::all();
foreach ($courses as $course) {
    echo $course->modules->count();  // N+1!
}
```

**✅ Good:**

```php
$courses = Course::withCount('modules')->get();
foreach ($courses as $course) {
    echo $course->modules_count;
}
```

---

## Migration Path: Laravel 8 → 11

### Key Changes

1. **Minimum PHP 8.1** (Laravel 11)
2. **Route Model Binding** - Now uses `Route::model()` for custom keys
3. **String Helpers** - Import from `Illuminate\Support\Str`
4. **Exception Handling** - New `$this->renderable()` method
5. **Service Providers** - Consolidated to AppServiceProvider

### Incremental Upgrade Path

1. **Laravel 8 → 9** - Update dependencies, test suite
2. **Laravel 9 → 10** - Update minimum PHP to 8.1
3. **Laravel 10 → 11** - Review breaking changes

### Testing During Migration

```bash
composer require laravel/shift --dev
php artisan shift:upgrade
```

---

## Security & Authorization Patterns

### FormRequest as Security Boundary

```php
class StoreReviewRequest extends FormRequest {
    public function authorize(): bool {
        return true; // route middleware (auth:sanctum + role) is upstream
    }

    public function rules(): array {
        return [
            'reviews' => ['required', 'array'],
            'reviews.*.author_user_id' => ['required', 'uuid', 'exists:users,uuid'],
            'reviews.*.rating' => ['required', 'integer', 'between:1,5'],
        ];
    }
}
```

`->validated()` strips unallowed keys (mass-assignment safety). `authorize()` returning `true` is correct when route middleware enforces auth/role upstream — don't duplicate the check here. The first FormRequest in a repo establishes the `app/Http/Requests/` namespace convention. Nested-array rules (`reviews.*.author_user_id`) are the canonical pattern for batch-create endpoints.

### Variadic Role Middleware

```php
class EnsureUserHasRole {
    public function handle(Request $request, Closure $next, string ...$roles): Response {
        if (!in_array($request->user()?->role, $roles, true)) {
            abort(403);
        }
        return $next($request);
    }
}

// route: ->middleware(['auth:sanctum', 'role:Admin,Owner'])
```

Strict `in_array(..., true)` prevents type-juggling bypasses. Pipeline order matters: `auth:sanctum` must run first so unauthenticated requests get 401 before `role` evaluates to 403.

### Sanctum Token Revocation Test Pattern

`actingAs($user, 'sanctum')` injects a `TransientToken` and skips the `instanceof Model` revocation branch. Genuine revocation tests must mint a real token:

```php
public function test_logout_revokes_token(): void {
    $resp = $this->postJson('/v1/auth/login', ['email' => $u->email, 'password' => 'pw']);
    $token = $resp->json('token');

    $before = DB::table('personal_access_tokens')->count();
    $this->withToken($token)->postJson('/v1/auth/logout');
    $this->assertSame($before - 1, DB::table('personal_access_tokens')->count());

    $this->app['auth']->forgetGuards();   // critical: clears the in-memory guard cache
    $this->withToken($token)->getJson('/v1/me')->assertStatus(401);
}
```

Without `forgetGuards()` the follow-up 401 assertion may pass against a stale guard — same trap applies to TTL expiry tests.

### Authorization: Null-Safe Ownership

```php
class OrderPolicy {
    public function updateStatus(User $user, Order $req): bool {
        return $user->uuid === $req->item?->owner_id;
    }
}
```

`?->` returns false on null relations rather than throwing. Laravel 10 lacks `php artisan policy:list` — inspect via `Gate::policies()` in tinker.

### Two Controllers Over One Polymorphic Controller

When a route family already splits a resource into two separate paths (e.g., `/items` and `/units` are separate throughout the API), mirror that split in any admin or approval layer rather than collapsing both into one controller that switches on a type parameter.

A single polymorphic controller introduces a type-confusion attack surface: a UUID from domain A submitted to domain B's route resolves to 404 via per-controller `findOrFail`, not a wrong-table mutation. Two focused controllers each own their eager-load shape and domain relations (e.g., `owner` vs `host`), making them independently testable with no shared branching logic.

The cost is structural duplication (~150 LOC across two files). Accept that cost when the two domains diverge on relations, policies, or resource shapes — the clarity gain outweighs the duplication.

| Anti-Pattern | Pattern |
|---|---|
| One `ListingApprovalController` branching on `$type` parameter | `ItemListingApprovalController` + `UnitListingApprovalController`, each with its own `findOrFail` and relation eager-load |

### API Resources for Public Reads

For unauthenticated read endpoints, always wrap in a Resource with `$wrap = null` even when the contract is currently stable:

```php
class PublicListingResource extends JsonResource {
    public static $wrap = null;

    public function toArray($request): array {
        return [
            'slug' => $this->slug,
            'title' => $this->title,
            // explicitly NOT $this->id — prevents enumeration
        ];
    }
}
```

Prevents two regressions: (1) `id` enumeration leaks, (2) future column adds (e.g. `owner_email`) silently exposed by `return $listing` shortcuts.

### `response()->json($paginatedRaw)` Leaks DB Columns

Returning a raw paginated query result directly as JSON bypasses the Resource transform and exposes every database column — FK columns (`item_id`, `child_id`), raw timestamps, and relation field names the public envelope hides. Consumers end up with defensive fallback readers because admin and public shapes diverge silently.

Route admin `index`/`show` through `Resource::collection()` and a single Resource, the same as the public path. Action-style endpoints (`approve`, `reject`, `hide`, `suspend`, `remove`) can stay minimal — `{id, status, [reason]}` is the correct contract for fire-and-forget POSTs where the FE does not need to re-render the full listing on a status flip.

| Anti-Pattern | Pattern |
|---|---|
| `return response()->json($listing->paginate(20))` on an admin endpoint that has a sibling public Resource | `return AdminListingResource::collection($listing->paginate(20))` — routes through the transform and controls which fields are emitted |

## Data Layer & Migration Patterns

### Enum Migration: Widen → Remap → Narrow

`MODIFY COLUMN ... NOT NULL` on a populated enum fails when existing rows hold values outside the new enum domain. Three-step migration:

```php
public function up(): void {
    if (DB::connection()->getDriverName() === 'sqlite') {
        // SQLite enforces CHECK on enum despite TEXT backing — recreate via temp table
        // ... abbreviated; see examples.md
        return;
    }

    // Step 1: widen to VARCHAR so any value is accepted
    DB::statement("ALTER TABLE bookings MODIFY status VARCHAR(50) NULL");

    // Step 2: data remap with NULL guard FIRST
    DB::table('bookings')->whereNull('status')->update(['status' => 'pending']);
    DB::table('bookings')->where('status', 'old_value')->update(['status' => 'new_value']);

    // Step 3: narrow back to new enum, NOT NULL
    DB::statement("ALTER TABLE bookings MODIFY status ENUM('pending','confirmed','cancelled') NOT NULL");
}
```

The NULL guard MUST precede `MODIFY COLUMN NOT NULL` — otherwise existing NULL rows fail the constraint mid-migration.

**Step 5 — Recreate indexes after any `dropColumn` / `addColumn` cycle on MySQL**: MySQL silently drops indexes attached to a column when that column is dropped, even within the same migration. Always add an index recreation step at the end of `widenTable()` and the symmetric step in `narrowTable()`:

```php
// Step 5: recreate index if it existed on the old ENUM column
if (DB::connection()->getDriverName() === 'mysql') {
    $hasIndex = collect(DB::select("SHOW INDEX FROM bookings WHERE Key_name = 'idx_bookings_status'"))->isNotEmpty();
    if (!$hasIndex) {
        Schema::table('bookings', fn (Blueprint $t) => $t->index('status', 'idx_bookings_status'));
    }
}
```

Gate with `DB::getDriverName() === 'mysql'` so SQLite test runs skip cleanly. Without this step, production read queries on the renamed column run unindexed.

### Polymorphic Audit Ledger with Mixed UUID + Bigint PKs

When the codebase mixes UUID PKs (some models) and bigint PKs (others), polymorphic relations need explicit alignment:

```php
// Migration
Schema::create('audit_events', function (Blueprint $table) {
    $table->id();
    $table->nullableUuidMorphs('related');   // char(36) — matches UUID PKs
    // ... use $table->nullableMorphs('related') for bigint targets
    $table->json('payload');
    $table->timestamps();
});

// AppServiceProvider::boot()
Relation::enforceMorphMap([
    'app_key' => ApiKey::class,
    'user' => User::class,        // critical — Sanctum tokens use User morphs internally
    'subscription' => Subscription::class,
]);
```

`enforceMorphMap` failing to register `User` breaks Sanctum's internal morph relations silently (token issuance fails with cryptic errors). Registering every model that participates in any morph map — including those used by framework internals like Sanctum's User — is what keeps the framework paths intact alongside the application's own polymorphic relations.

### Schema Verification Before Seeders

When mirroring a controller's `create()`/`updateOrCreate()` into a seeder, verify the FK target type **from the migration**, not from inline ticket examples or other seeders:

| Migration | Seeder must use |
|---|---|
| `$table->unsignedBigInteger('user_id')->references('id')` | `$user->id` |
| `$table->uuid('user_uuid')->references('uuid')` | `$user->uuid` |
| `$table->foreignUuid('owner_id')` | the UUID PK of owner |

Tickets and old seeders drift; the migration is the truth.

### Seeder Defense-in-Depth Environment Guard

Two layers prevent accidental seeding in production:

1. `DatabaseSeeder::run()` wraps preview/test seeders in `if (app()->environment(['staging', 'local']))`.
2. Each preview seeder has `abort_if(app()->environment('production'), 500, 'Preview seeder must not run in production')` at the top of `run()`.

Layer 2 protects against direct invocation via `db:seed --class=PreviewUserSeeder`, which bypasses the wrapper. Pair with `firstOrCreate` for idempotency.

### Seeder Split: Always-Run vs Preview-Only

Organize seeders into two buckets:

| Bucket | Examples | Gate |
|---|---|---|
| **Always-run** | `UserSeeder` (admin/member test users), `LegalDocumentSeeder` (required reference data) | No gate — runs in every environment |
| **Preview-only** | `PreviewUserSeeder` (demo persona), `PreviewItemSeeder`, `PreviewUnitSeeder` | `app()->environment(['staging', 'local'])` in `DatabaseSeeder` + inline `abort_if` guard |

The trap: always-run seeders ship real test credentials (`password` as password) to production unless they also carry an inline `abort_if` guard or the seed users are production-safe (no known passwords, no admin roles). The environment gate on `DatabaseSeeder` only protects the preview bucket — it does not protect always-run seeders invoked directly via `--class=`.

### Seeder Guard: `RuntimeException` over `abort_if` in CLI Context

`abort_if()` is an HTTP helper — it calls `abort()`, which throws `HttpException` with an HTTP status code. In an Artisan seeder or command running outside the HTTP kernel, the status code `500` is semantically incoherent ("internal server error" when the intent is a deliberate guard) and any log/alert pipeline scanning for HTTP 5xx patterns flags it as a runtime error rather than an intentional production-safety check.

Prefer `throw new \RuntimeException('Seeder must not run in production.')` inside CLI-only code paths. `RuntimeException` exits the process with a non-zero code, surfaces correctly in scheduler logs, and carries no HTTP status fingerprint.

```php
// ✅ CLI-appropriate guard
if (app()->environment('production')) {
    throw new \RuntimeException('PreviewUserSeeder must not run in production.');
}
```

The two-layer guard pattern (`DatabaseSeeder` env check + per-seeder inline guard) still applies; the change is the exception class used in the per-seeder inline guard.

## External Integration Patterns

### Stripe Subscription Create with Elements

To surface `client_secret` for `confirmCardPayment` on the FE:

```php
$subscription = $stripe->subscriptions->create([
    'customer' => $user->stripe_customer_id,
    'items' => [['price' => $priceId]],
    'payment_behavior' => 'default_incomplete',
    'expand' => ['latest_invoice.payment_intent'],
]);

return [
    'subscription_id' => $subscription->id,
    'client_secret' => $subscription->latest_invoice->payment_intent->client_secret,
    'cancel_at_period_end' => $subscription->cancel_at_period_end,  // direct property — typed
    'current_period_end' => $subscription['current_period_end'],    // offsetGet — untyped
];
```

Two-tier SDK access: direct property for typed top-level fields, `offsetGet()`/array access for expanded untyped children. Don't hardcode flags the API returns — read them from the response so the local state heals against future service-layer extensions (e.g., an undo path).

### External State Mirror Reconciliation

When the BE has both an API call and a webhook providing the same data (Stripe, OAuth providers, payment processors):

1. **Optimistic local write** on the user-facing path so the next read reflects the new state immediately
2. **Webhook authoritatively overwrites** when it arrives
3. **Self-correcting flag derivation**: deriving flags from the response object (rather than hardcoding the booleans an upstream API returns) lets local state heal automatically if the upstream extends behavior

### Webhook Idempotency: Atomic Pattern

```php
DB::transaction(function () use ($event) {
    try {
        WebhookEvent::create([
            'provider' => 'stripe',
            'event_id' => $event->id,
            'received_at' => now(),
        ]);
    } catch (QueryException $e) {
        if ($e->errorInfo[1] === 1062) {
            // concurrent duplicate — another worker already handled this event
            throw new DuplicateEventException();
        }
        throw $e;
    }

    $this->dispatch($event);   // run handler inside same transaction
});
```

Wrapping `firstOrCreate` (or `create` + duplicate-key catch) and the handler in one transaction prevents the case where the idempotency row commits but the handler crashes — on retry, the duplicate-key path returns 200 without re-running the handler, silently losing the work.

## Testing & CI Infrastructure

### Larastan Static Analysis (Level 5 Onboarding)

Onboard at level 5 with no baseline. Expect 30–60 findings on a legacy app — they are real bugs, not noise.

```bash
composer require --dev larastan/larastan:^2.0   # PHPStan 1.x compat; Larastan 3.x requires PHPStan 2.x
```

`phpstan.neon` at repo root:

```neon
includes:
    - vendor/larastan/larastan/extension.neon
parameters:
    paths: [app/, config/, routes/]
    level: 5
    ignoreErrors: []
```

**Common findings + fixes:**

| Finding | Fix |
|---|---|
| Bare `Log::error(...)` / `catch (QueryException ...)` without `use` imports | Add the imports — usually silent runtime bugs in error paths |
| Eloquent relations not discovered by static analysis | Add explicit return types: `: HasMany`, `: BelongsTo` on every relation method |
| Dynamic property access on models (`$user->stripe_customer_id`) | Add class-level `@property` PHPDoc listing every column with concrete type — doubles as schema dictionary |
| `Provider::stateless()` undefined (Socialite) | Narrow with `@var AbstractProvider $driver` |
| `currentAccessToken()->delete()` undefined (Sanctum) | Narrow with `instanceof Model` guard before calling `->delete()` |
| User firing `Verified` event without `MustVerifyEmail` contract | Add the contract |
| `findOrFail()` ambiguous return | Use `User::query()->findOrFail()` + `@var User $user` hint |
| `Property Model::$status ('a'\|'b') does not accept 'c'` after an ALTER migration | Larastan parses only the original `create_<table>_table.php` `enum()` definition — subsequent `ALTER` migrations are not followed. Add an explicit `@property 'a'\|'b'\|'c' $status` PHPDoc union on the model class to override the inferred type. One line per affected model. |

### SQLite `:memory:` Test Infrastructure

Default `phpunit.xml` to SQLite for sub-3s local runs; CI overrides to MySQL via env:

```xml
<server name="DB_CONNECTION" value="sqlite"/>
<server name="DB_DATABASE" value=":memory:"/>
```

CI workflow sets `DB_CONNECTION=mysql` in shell env (precedes phpunit.xml). Best of both: fast local iteration, real-engine validation in CI.

**Three SQLite migration incompatibilities and fixes:**

1. `dropForeign` — wrap in `if (DB::connection()->getDriverName() !== 'sqlite')`. SQLite default is `PRAGMA foreign_keys = OFF` so skipping is safe.
2. Multiple `dropColumn`/`renameColumn` in one `Schema::table` closure — split into separate closures.
3. Mixed `addColumn` + `dropColumn` in one closure — split.

### Local MySQL Container for Test Parity

When a project's tests need MySQL but no `docker-compose.yml` exists, an ephemeral container matching the CI service definition gives local pre-commit hooks the same DDL semantics CI enforces (enum constraints, NOT NULL on existing rows, `dropForeign`) — symptoms that swapping to local SQLite hides:

```bash
docker run -d --name <project>-test-mysql \
  -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=testing \
  -p 3306:3306 mysql:8

until docker exec <project>-test-mysql mysqladmin ping -h localhost -u root -proot --silent; do
  sleep 2
done
```

Then create a local `.env` matching CI env vars (`DB_CONNECTION=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3306`, `DB_DATABASE=testing`, `DB_USERNAME=root`, `DB_PASSWORD=root`). Tear down with `docker rm -f <project>-test-mysql` + `rm .env` when done. Pairs with the SQLite `:memory:` pattern above — SQLite for fast inner-loop iteration, ephemeral MySQL container for pre-commit parity with CI.

### CI Foundation Pitfalls

| Issue | Fix |
|---|---|
| `vendor/bin/pint` not idempotent | Run twice in pre-commit; some rules need a second pass to converge |
| SQLite `:memory:` for tests when migration uses `dropForeign` in `up()` | MySQL service is mandatory; SQLite skips the drop and tests don't catch the FK regression |
| `PDO\Mysql::ATTR_SSL_CA` on PHP 8.2 | Constant only exists on 8.4+; project pinned to `^8.2` must use the legacy `PDO::MYSQL_ATTR_SSL_CA` form |
| `defined('NewClass::C') ? NewClass::C : OldClass::C` ternary on CI PHP version without the class | PHPStan resolves the unreachable branch at static-analysis time and throws "Class X not found". Use `constant('FQCN::NAME')` indirection: `defined('Pdo\Mysql::ATTR_SSL_CA') ? constant('Pdo\Mysql::ATTR_SSL_CA') : constant('PDO::MYSQL_ATTR_SSL_CA')` — PHPStan sees dynamic strings, not class references. |
| `php artisan serve` with parent-process `-d display_errors=Off` | The flag is consumed by the parent CLI process; child request-handlers spawn with their own ini. Fix the deprecated constant at the source — don't rely on ini overrides for dev-server runtime behavior. |
| PHP 8.5 deprecation notices in dev with `display_errors=On` | Notices emit as HTML before any output, breaking client-side JSON parsing. Treat any deprecation in CI logs as P1 the moment a frontend hits the API in dev. |
| `composer config-cache` warming `env()` calls in service classes | `env()` returns null after caching; only safe inside `config/*.php` files |

---

## Constant-Owned Validation-Rule Accessor

When one allow-list (e.g., a PHP `enum` or a class with string constants) feeds multiple FormRequests — Store, Update, Import, and query filters — duplicating `Rule::in(MyConst::values())` across each request creates N-way coupling. Every request must import `Illuminate\Validation\Rule`, and a new allowed value requires edits in N places.

**Pattern: expose two static accessors on the constant class**

```php
// app/Enums/ShapeType.php  (or a plain const class)
use Illuminate\Validation\Rules\In;
use Illuminate\Validation\Rule;

enum ShapeType: string
{
    case Circle = 'circle';
    case Square = 'square';
    case Triangle = 'triangle';

    /** @return string[] */
    public static function values(): array
    {
        return array_column(self::cases(), 'value');
    }

    public static function rule(): In
    {
        return Rule::in(self::values());
    }
}
```

**Consumption in FormRequests (no `Rule` import needed)**

```php
class StoreShapeRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'type' => ['required', ShapeType::rule()],
        ];
    }
}

class UpdateShapeRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'type' => ['sometimes', ShapeType::rule()],
        ];
    }
}
```

**Consumption in query filters**

```php
// Controller or query scope
->when($request->type, fn ($q) => $q->where('type', $request->type))
// Validation upstream already ensured the value is in ShapeType::values()
```

`values()` feeds serialization, API documentation, and query filters. `rule()` feeds every FormRequest. When the allow-list changes, only the enum changes.

| Anti-Pattern | Pattern |
|---|---|
| `Rule::in(ShapeType::values())` repeated in Store, Update, Import FormRequests | `ShapeType::rule()` — one accessor, no `Rule` import, N-way dedup |
| Custom `In` rule built inline per request | Static accessor on the constant class keeps the allow-list co-located with its definition |

---

## Wildcard `field.*` Rules

Laravel's `field.*` rule notation fires for each element present in the `field` array. It does **not** fire when the array is absent or empty. This means:

- `'tags.*' => ['string', 'max:50']` — passes if `tags` is omitted entirely.
- `'tags.*' => ['sometimes', 'string']` — `sometimes` is redundant; the `.*` notation already implies per-present-element semantics.
- `'tags.*' => [Rule::in(Tag::values())]` — allow-lists values for any tag that is present; an omitted `tags` key passes.

**Disambiguation: where `sometimes` belongs**

| Key | Purpose | Where `sometimes` lives |
|---|---|---|
| `tags` (array-level) | Controls whether the array itself is required | `'tags' => ['sometimes', 'array']` on PATCH |
| `tags.*` (element-level) | Controls per-element rules | Never needs `sometimes` — absence = no elements = no rule fires |

**Common reviewer false-positive**: "The `tags.*` rule is missing `sometimes`." It is not — adding `sometimes` there has no effect. The array-level `'tags' => ['sometimes', 'array']` is the PATCH opt-in. Element rules run iff the array is present and non-empty.

```php
// PATCH FormRequest — correct shape
public function rules(): array
{
    return [
        'tags'   => ['sometimes', 'array'],        // array-level: PATCH opt-in
        'tags.*' => ['string', Rule::in(Tag::values())],  // element-level: no 'sometimes' needed
    ];
}
```

---

## Free-Form Storage Behind an Exact-Match JSON Filter

When a JSON column stores arbitrary strings AND those same strings are used as `whereJsonContains` filter arguments, a vocabulary drift between write and read paths causes the filter to return an empty result set silently — no query error, no exception.

**Failure shape**

```php
// Write path: stores whatever the client sends, possibly "Circle" or "CIRCLE"
$shape->update(['tags' => $request->tags]);

// Read/filter path: queries for lowercase canonical form
->whereJsonContains('tags', 'circle')  // matches nothing if stored as "Circle"
```

**Pattern: lock both paths to one validated constant**

```php
// Write path: FormRequest validates against canonical enum
'tags.*' => [Rule::in(ShapeTag::values())]  // stores e.g. "circle", never "Circle"

// Read/filter path: same enum drives the query filter
->when(
    $request->tag,
    fn ($q) => $q->whereJsonContains('tags', $request->tag)
    // $request->tag already validated by FormRequest to be in ShapeTag::values()
)
```

Stored and queried strings are byte-identical because both paths go through the same validated vocabulary. A `whereJsonContains` filter returning zero results when rows clearly have matching data is the diagnostic signal for this bug class.

| Anti-Pattern | Pattern |
|---|---|
| Free-form storage in JSON column + exact-match filter on the same field | Validate writes AND query filter arguments against one shared constant — stored and filtered strings must be byte-identical |
| Trusting that clients send canonical casing | FormRequest `Rule::in(Const::values())` on `field.*` enforces canonical form at the boundary |

---

## PHP 8.1+ Spread on Associative Arrays

PHP 8.1 introduced named arguments, and as a side effect made the spread operator (`...`) on string-keyed arrays throw `Unknown named parameter "$key"` when used in function calls. This affects `array_merge(...$arrayOfArrays)` when the inner arrays have string keys.

**Failure shape**

```php
// Grouped associative constant — string keys
$grouped = [
    'items' => ['circle', 'square'],
    'colors' => ['red', 'blue'],
];

// Flatten all values — throws on PHP 8.1+
$all = array_merge(...array_map('array_values', $grouped));
// TypeError: array_merge(): Named parameters are not supported with spread operator

// Also throws:
$all = array_merge(...$grouped);  // same reason — string-keyed spread
```

**Fix: strip keys before spreading**

```php
// Option 1: array_values() before spread
$all = array_merge(...array_values(array_map(fn ($v) => array_values($v), $grouped)));

// Option 2: explicit loop (clearest)
$all = [];
foreach ($grouped as $items) {
    array_push($all, ...$items);
}

// Option 3: array_merge with splat on list arrays only
$lists = array_values($grouped);   // now a list (integer-indexed)
$all = array_merge(...$lists);     // safe — outer array is now a list
```

The bug surfaces at runtime, not at parse time, so it passes static analysis. It appears when flattening a constant that was originally organized by group (e.g., an enum grouping by category) to produce a flat allow-list.

| Anti-Pattern | Pattern |
|---|---|
| `array_merge(...$assoc)` where `$assoc` has string keys (PHP 8.1+) | `array_merge(...array_values($assoc))` — strip string keys before spreading |
| `array_merge(...array_map(fn, $assocGrouped))` returning string-keyed inner arrays | Wrap inner transform with `array_values()` or replace with explicit `foreach` + `array_push` |

---

## Official Documentation

- [Laravel 8.x Documentation](https://laravel.com/docs/8.x)
- [Laravel 11.x Documentation](https://laravel.com/docs/11.x)
- [Laravel Sanctum](https://laravel.com/docs/sanctum)
- [Laravel Eloquent](https://laravel.com/docs/eloquent)
- [Laravel Testing](https://laravel.com/docs/testing)
- [Repository Pattern Guide](https://asperbrothers.com/blog/implement-repository-pattern-in-laravel/)

---

## Eloquent Cast & FormRequest Discipline

### Array Cast Round-Trip Falsifiability

When a model declares `'array'` cast on a JSON column, the round-trip test must read back through the model — not raw DB — and assert PHP array type:

```php
public function test__item__tags_array__round_trips(): void
{
    $item = Item::create(['tags' => ['a', 'b']]);
    $reloaded  = Item::find($item->id);

    $this->assertIsArray($reloaded->tags);
    $this->assertEquals(['wifi', 'parking'], $reloaded->tags);
}
```

`assertDatabaseHas(['tags' => json_encode(['a', 'b'])])` passes under double-encoding because both the encoded and double-encoded strings are string matches — only a model-mediated read forces the cast to decode, surfacing the regression. Without `assertIsArray`, a controller that calls `json_encode()` before `create()` (causing Eloquent to serialize again) stores `"\"[\\\"wifi\\\"]\""` silently.

### PATCH FormRequest: `sometimes` vs `nullable`

On PATCH endpoints backing NOT NULL columns, `nullable` permits clients to send `{title: null}` and overwrite a required column with null — the request validates and the DB write fails. `sometimes` is the PATCH semantic that validates only when the key is present:

| Scenario | Rule shape | Why |
|---|---|---|
| Field required on create (NOT NULL in DB) | `['sometimes', 'string', ...]` | `sometimes` = skip validation if absent; `nullable` permits explicit null writes |
| Field genuinely nullable in DB | `['sometimes', 'nullable', ...]` | Nullable DB column can legally accept null |

`nullable` alone permits clients to PATCH `{title: null}` and overwrite a required column — `sometimes` is the correct PATCH semantic (validate only when the key is present).

### Cross-Field Validation with Optional Fields

Laravel's built-in `lte`/`gte` cross-field rules fire unconditionally even when the referenced field is null. Use a `withValidator` callback that conditions on both bounds being present:

```php
public function withValidator($v): void
{
    $v->after(function ($validator) {
        $min = $this->input('price_min_cents');
        $max = $this->input('price_max_cents');
        if ($min !== null && $max !== null && $min > $max) {
            $validator->errors()->add('price_min_cents', 'Must be ≤ price_max_cents.');
        }
    });
}
```

`'price_min_cents' => 'integer|nullable|lte:price_max_cents'` fails with "must be ≤ null" when only `price_min_cents` is provided.

---

## Mass Assignment Hardening: Status & Tier Fields

Authorization-gate fields (`status`, `tier`, `role`) must be excluded from `$fillable` — even when current FormRequests don't include them in `rules()`. A future `$request->all()` call silently re-opens self-promotion.

**Pattern: post-create direct assignment**

```php
// ✅ CORRECT
$user = User::create($request->only([
    'name', 'email', 'password', 'role',
]));
$user->status = UserStatus::PENDING;
$user->save();
```

`$user->update(['status' => ...])` silently no-ops on non-fillable columns — this is a hard-to-debug failure mode. Use direct property assignment + `save()` for all non-fillable writes.

**Falsifiable regression test**

```php
public function test__register__malicious_status_payload__lands_as_pending(): void
{
    $this->postJson('/api/auth/register', [
        'name'     => 'Attacker',
        'email'    => 'a@example.com',
        'password' => 'secret',
        'status'   => 'active', // attacker-supplied
    ])->assertStatus(201);

    $this->assertSame('pending', User::where('email', 'a@example.com')->value('status'));
}
```

Same trap applies to `tier`, `role`, and any ownership FK (`owner_id`, `owner_id`).

---

## State-Machine Guard for Privileged Writes

For approve/reject-style endpoints that mutate an enum-status column, add an explicit state check after `firstOrFail()`:

```php
public function approve(string $uuid): JsonResponse
{
    $user = User::where('uuid', $uuid)->firstOrFail();

    if ($user->status !== UserStatus::PENDING) {
        return response()->json([
            'message' => 'User is not in a pending state.',
            'errors'  => ['status' => ['Action only applies to pending users.']],
        ], 422);
    }

    $user->status = UserStatus::ACTIVE;
    $user->save();

    return response()->json(['message' => 'Approved.']);
}
```

**Why 422 over 409**: 422 matches Laravel's default form-validation envelope — the FE reuses the same error-display code path for "user not in pending state" as for form validation errors. 409 requires a new error-handling branch in the client.

Pair with two falsifiable test cases per privileged action: already-decided-state → 422 + assert DB unchanged.

---

## Migration Safety Patterns (a prior ticket additions)

### `Schema::hasIndex` Pre-Check (Laravel 10.42+)

Replace `try/catch (Throwable)` for index-existence checks:

```php
if (!Schema::hasIndex('users', 'users_uuid_unique')) {
    $table->unique('uuid', 'users_uuid_unique');
}
```

Anonymous indexes break `down()`: Laravel's auto-generated index name is driver-and-version-dependent, so a `down()` that calls `$table->dropUnique('users_email_unique')` can fail on a fresh checkout. Naming the index at creation time is what makes `down()` deterministic.

### `registerDoctrineTypeMapping` for ENUM Widening

When widening a native MySQL ENUM column, doctrine/dbal ^3.x throws `Unknown database type enum` on `dropColumn`/`change()`. Register the mapping inside the migration, gated on driver:

```php
public function up(): void
{
    if (DB::connection()->getDriverName() !== 'sqlite') {
        DB::connection()->getDoctrineSchemaManager()
            ->getDatabasePlatform()
            ->registerDoctrineTypeMapping('enum', 'string');
    }
    // ... then ALTER TABLE / widen-remap-narrow steps
}
```

Place this in the migration's `up()` and `down()` rather than `AppServiceProvider` — keeps the mapping scoped to the migration that needs it.

### TOCTOU-Safe Replace (Delete-Old + Store-New + Upsert)

For "delete old file + store new + upsert row" flows on a unique-keyed resource:

1. `storeAs(new path with random suffix)` — **outside** the transaction
2. `DB::transaction()` opens
3. `Model::where(...)->lockForUpdate()->first()` — serializes concurrent same-key requests
4. Delete old path if `oldPath !== newPath`
5. `updateOrCreate()`

Worst-case rollback leaves a fresh-path orphan blob (storage leak only, no data inconsistency). `lockForUpdate` prevents two concurrent uploads for the same key from racing.

### Storage::fake Scope Discipline

Isolate `Storage::fake('s3')` to the test class's `setUp()`, not the global `TestCase.php`. Assertions:

```php
Storage::disk('s3')->assertExists($path);
$this->assertCount(1, Storage::disk('s3')->files($prefix));
```

### Sanctum Cross-Origin SPA Cookie Config

For cross-origin SPA cookie auth, the full required tuple (additions beyond what the standard CORS config shows):

```php
// config/cors.php
'allowed_origins' => array_filter([env('FRONTEND_URL')]),
'supports_credentials' => true,
```

```env
SANCTUM_STATEFUL_DOMAINS={fe-host-without-scheme}
SESSION_DOMAIN=.{shared-parent-domain}
SESSION_SECURE_COOKIE=true
SESSION_SAME_SITE=none
```

`array_filter` ensures a missing `FRONTEND_URL` produces an empty allow-list (fail closed) rather than a wildcard. Browsers reject `*` when `supports_credentials=true`. `SESSION_SAME_SITE=none` requires `SESSION_SECURE_COOKIE=true` — browsers reject otherwise.

**Exact-origin matching** — Sanctum's stateful domain list and the CORS `allowed_origins` both use exact-string comparison. `localhost` and `127.0.0.1` are different origins even when they resolve to the same machine. If the FE can reach the BE on either address (e.g., the FE points to `localhost:3000` but curl tests use `127.0.0.1`), list both explicitly:

```env
SANCTUM_STATEFUL_DOMAINS=localhost,localhost:3000,127.0.0.1,127.0.0.1:3000
```

A request from `127.0.0.1` to a config that only lists `localhost` returns a CORS rejection with no obvious error message on the FE side.

**Config-file load-order gotcha**: `app()->environment(...)` throws `Target class [env] does not exist` inside config files. Use `env('APP_ENV') === 'local'` directly.

### Pagination Envelope Test Rewrite Footprint

Switching from `->get()` to `->paginate(N)` wrapped in `Resource::collection` requires updating every existing test assertion on the bare-array shape. Typical cost per controller index: 3–5 test edits.

| Old assertion | New assertion |
|---|---|
| `assertJsonCount(N)` | `assertJsonCount(N, 'data')` |
| `assertJsonPath('0.field', ...)` | `assertJsonPath('data.0.field', ...)` |
| `assertJson([['id' => ...]])` | `assertJson(['data' => [['id' => ...]]])` |

Count this rewrite in the ticket size estimate — it is consistently underestimated.

### UUID Enumeration Prevention

For public lookup endpoints on tenant-scoped resources, both "doesn't exist" and "exists but not approved/visible" must return 404:

```php
// ✅ CORRECT — no UUID existence leak
$item = Item::where('id', $id)
    ->where('status', 'approved')
    ->first() ?? abort(404);
```

`findOrFail($id)` returns 404 for missing records but `->get()` returning `[]` for hidden records leaks UUID existence. The combined `where + first() ?? abort(404)` pattern eliminates the distinguishable gap.

### Model Boot UUID Hook

When a model has a `static::creating()` hook that auto-generates UUIDs, controllers must not pre-generate IDs — the model handles it. Watch for inconsistency across sibling models (one has the boot hook, another doesn't) — standardize for parity and to remove redundant `Str::uuid()` calls in callers.

### Cascade Delete Inside `DB::transaction`

When migrations declare FK columns without `onDelete('cascade')`, controller `destroy()` must explicitly delete child rows inside a `DB::transaction(...)`. Tests must `assertDatabaseMissing` the children, not just the parent — an orphan-on-partial-failure path passes parent-only tests silently.

## Anti-Pattern Quick Reference (Table)

| Anti-Pattern | Pattern |
|---|---|
| `nullable` rule in Update FormRequest for NOT NULL columns | `nullable` permits explicit null writes; use `sometimes` for PATCH semantics (skip if absent, reject if null) |
| `status`/`tier` in `$fillable` alongside identity-FKs | Authorization-gate fields belong outside `$fillable` even when current paths don't mass-assign them — post-create direct assignment + `save()` is the safe write path |
| No status check before privileged write (approve/reject endpoints) | Add `if ($model->status !== EXPECTED) return 422` after `firstOrFail()` — state-machine guard prevents double-approval/double-reject |
| `lte`/`gte` cross-field rules when both fields are independently optional | Use `withValidator` callback that conditions on both bounds present — built-in rules fire unconditionally on null |
| `json_encode()` before passing array to Eloquent `create()`/`fill()` | Double-encoding silently passes assertion tests; round-trip test must read back through model and `assertIsArray()` |

---

## Common Pitfalls

The following anti-pattern table covers cross-cutting patterns identified in production Laravel apps. Entries marked with a `reference.md` link have dedicated deep-dive sections in this file.

| Anti-Pattern | Pattern |
|--------------|----------|
| Fat controllers | Move logic to Actions |
| Business logic in models | Use Action classes |
| N+1 queries | `with()` eager loading |
| Missing validation | Use FormRequests |
| Inconsistent repositories | Define interfaces |
| `Socialite->user()` without `->stateless()` in API | Stateless mode skips session/CSRF — omitting it causes CSRF mismatch on token-based auth flows |
| Status on parent row AND events table | Dual storage creates sync bugs; pick one source of truth |
| `namespace()` on route groups (Laravel 10+) | Convention removed — use fully-qualified class names or `use` imports |
| Deeply nested non-shallow resources | `->shallow()` avoids URLs requiring 4 IDs |
| Eager loading all columns on large datasets | Constrain: `with(['children:id,item_id,name'])` |
| `env()` in service classes after `config:cache` | Returns null in production; use `config('mail.from.address')` — `env()` only inside `config/*.php` |
| Controller `try/catch` returning `$e->getMessage()` | Bypasses Handler sanitizer; use `Handler::register()` + `renderable()` with bypass list (Validation/Auth/Authorization/ModelNotFound/HttpException) |
| Identity-FK columns (`stripe_customer_id`, `oauth_provider_id`) in `$fillable` | Mass-assignment privilege redirect — exclude from `$fillable`, set via direct property assignment in trusted service-layer |
| Mocking Eloquent for "unit" tests | Eloquent isn't a mockable interface; use SQLite `:memory:` + `RefreshDatabase` |
| One polymorphic controller branching on a type param when the route family already splits the resource | Two focused controllers — each owns its `findOrFail`, eager-load shape, and relations; type-confusion attack surface disappears. See **"Two Controllers Over One Polymorphic Controller"** above |
| `actingAs($user, 'sanctum')` for token revocation tests | Injects `TransientToken`, skips `instanceof Model` revocation branch — mint via `POST /login`, capture token, then `forgetGuards()` before re-asserting 401 |
| `dropForeign()` in migration without driver guard | SQLite has FK off by default — wrap in `if (DB::connection()->getDriverName() !== 'sqlite')` |
| `MODIFY COLUMN NOT NULL` on enum without widen-remap-narrow | Three-step: widen to VARCHAR → data remap with NULL guard → narrow back to new enum |
| Public unauthenticated endpoints returning raw models | Wrap in Resource with `$wrap = null` — prevents id-enumeration and future column-add leaks |
| `enforceMorphMap` registration excludes Sanctum `User` class | Register all morphable targets including User: `Relation::enforceMorphMap(['user' => User::class, ...])` |
| `nullableMorphs()` for UUID-keyed targets | Use `nullableUuidMorphs()` to match `char(36)` PK; bigint vs char(36) misalignment fails silently |
| Seeder uses `$user->id` when migration has UUID PK | Verify FK type in migration before writing seeder; UUID PKs need `$user->uuid` |
| `payment_behavior` default for subscription create with Elements | Use `payment_behavior=default_incomplete` + `expand=['latest_invoice.payment_intent']` to surface `client_secret` |
| Hardcoding flags returned by upstream API | Read derived state from the response object so it self-heals against API extensions (e.g. undo paths) |
| Bare `Log::error` / `catch (QueryException ...)` without `use` imports | Larastan level 5 catches these — they're silent runtime bugs in error paths |
| Eloquent relations missing explicit return types (`: HasMany`) | Required for chaining (`->where(...)`); add uniformly so Larastan can resolve relation types |
| `PDO\Mysql::ATTR_SSL_CA` constant on a PHP ^8.2 project | `PDO\Mysql` namespaced subclass was introduced in PHP 8.4; crashes `package:discover` on 8.2 CI. Use legacy `PDO::MYSQL_ATTR_SSL_CA` (PHP 5.1+) or route both branches through `constant('FQCN::NAME')`: `defined('Pdo\Mysql::ATTR_SSL_CA') ? constant('Pdo\Mysql::ATTR_SSL_CA') : constant('PDO::MYSQL_ATTR_SSL_CA')` |
| Version-conditional class constants referenced literally in PHPStan scope | PHPStan resolves literal `ClassName::CONST` statically and fails when the class doesn't exist on the minimum PHP version. Use `constant('FQCN::NAME')` — PHPStan treats it as a dynamic string and skips the resolution |
| SQLite `:memory:` when any migration calls `dropForeign()` in `up()` | SQLite does not support dropping foreign keys; `migrate:fresh` throws `BadMethodCallException`. Run a `mysql:8` service container in CI (`DB_CONNECTION=mysql`). Detect with `grep -r 'dropForeign' database/migrations/` |
| Single Pint pass before committing | Pint (PHP-CS-Fixer) is not always idempotent — some rule fixes expose other rule violations. After `vendor/bin/pint`, run `vendor/bin/pint --test` immediately; if it still reports failures, re-run `pint` until `--test` exits clean |
| Policy ownership comparison returning `null` or throwing on null relation | Use the null-safe `?->` operator: `$user->uuid === $resource->relation?->owner_id` returns `false` when the relation is null rather than panicking. Pattern: `$user->uuid === $order->item?->owner_id` |
| Nullable API response field omitted when null | Always emit the key with `?? null`: `'client_secret' => $paymentIntent?->client_secret ?? null`. Omitting the key forces consumers to use `isset()`/`array_key_exists()` defensive checks; explicit null makes branching deterministic. Pair tests with `assertJsonPath('field', null)` AND `assertArrayHasKey('field', $response->json())` |
| Free-form strings stored in JSON column queried via `whereJsonContains` | Lock both write rules and query filter to one validated constant (`Rule::in(Const::values())`) so stored and filtered values are byte-identical — mismatched casing or synonyms cause the filter to silently return nothing |
| `array_merge(...$assocArray)` on PHP 8.1+ when inner arrays have string keys | Wrap with `array_values()` before spreading or replace with an explicit `foreach` + `array_push` — string-keyed spread throws "unknown named parameters" at runtime |
| Local mirror of Stripe/external flag hardcoded on write | Write the derived flag by reading it from the API response object (`(bool) $subscription->cancel_at_period_end`), not hardcoded (`true`). This self-corrects against future service-layer extensions (e.g., an undo-cancel path). Write the flag optimistically on the user-facing path before the webhook arrives; the webhook then authoritatively reconciles. |

---

## Mass-Assignment Tripwire: `$fillable`-Excluded Keys

`Model::create([...])`, `firstOrCreate($attrs, $values)`, and seed-time mass-assignment silently drop keys not in `$fillable` — no warning, no exception. Three common shapes:

1. **Controller create with privilege-gated fields** — assign post-create: `$m = Model::create($safeAttrs); $m->privileged = $val; $m->save();` Including the gated key in the create array passes through `$fillable` and the field is silently dropped.
2. **Seeder login-capable user creation** — `User::create(['email' => ..., 'tier' => 'pro'])` silently lands the user at the DB default tier if `tier` is `$fillable`-excluded. Use `$user = User::create([...]); $user->tier = 'pro'; $user->save();`
3. **`firstOrCreate($attrs, $values)` for upserts** — the `$values` array is subject to the same filter; the row lands at column default with no indication anything was dropped. Verify with `$model->fresh()->fieldName` after the call.

| Anti-Pattern | Pattern |
|---|---|
| `User::create([..., 'status' => 'active'])` when `status` is `$fillable`-excluded | Post-create direct assignment: `$m = Model::create($safe); $m->status = 'active'; $m->save();` |
| `firstOrCreate($attrs, ['status' => 'published'])` for seeder upserts | `firstOrCreate` with safe attrs only; assign `$model->status = 'published'; $model->save()` after — and comment *why* to prevent "cleanup" regressions |
| Passing `'tier'`, `'role'`, or `'status'` through any mass-assign path | These are authorization-gate fields; `$fillable` exclusion is the guard, not incidental friction |

See **"Mass Assignment Hardening: Status & Tier Fields"** above for the falsifiable regression test pattern.
