# Laravel 8+ Modern Architecture Patterns Examples

Example implementations for a production Laravel app and complete CRUD examples.

## Table of Contents

1. [Complete CRUD with Repository + Action](#complete-crud-with-repository--action)
2. [Item Detection Example](#shape-detection-example)
3. [Sanctum SPA Authentication Flow](#sanctum-spa-authentication-flow)
4. [Eloquent Relationships](#eloquent-relationships)
5. [Feature Test Examples](#feature-test-examples)

---

## Complete CRUD with Repository + Action

### Step 1: Create Interface

```php
// app/Repositories/UserRepositoryInterface.php
namespace App\Repositories;

use App\Models\User;
use Illuminate\Support\Collection;

interface UserRepositoryInterface {
    public function all(): Collection;
    public function find(int $id): User;
    public function create(array $data): User;
    public function update(int $id, array $data): User;
    public function delete(int $id): bool;
}
```

### Step 2: Implement Repository

```php
// app/Repositories/UserRepository.php
namespace App\Repositories;

use App\Models\User;
use Illuminate\Support\Collection;

class UserRepository implements UserRepositoryInterface {
    public function all(): Collection {
        return User::with('roles')->get();
    }

    public function find(int $id): User {
        return User::with('roles')->findOrFail($id);
    }

    public function create(array $data): User {
        return User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => bcrypt($data['password']),
        ]);
    }

    public function update(int $id, array $data): User {
        $user = $this->find($id);
        $user->update($data);
        return $user->fresh();
    }

    public function delete(int $id): bool {
        return User::destroy($id) > 0;
    }
}
```

### Step 3: Create Action Classes

```php
// app/Actions/Users/CreateUserAction.php
namespace App\Actions\Users;

use App\Repositories\UserRepositoryInterface;
use App\Models\User;

class CreateUserAction {
    public function __construct(
        private UserRepositoryInterface $repository
    ) {}

    public function execute(array $data): User {
        // Business logic here (e.g., send welcome email)
        $user = $this->repository->create($data);

        // Additional operations
        event(new UserCreated($user));

        return $user;
    }
}
```

```php
// app/Actions/Users/UpdateUserAction.php
namespace App\Actions\Users;

use App\Repositories\UserRepositoryInterface;
use App\Models\User;

class UpdateUserAction {
    public function __construct(
        private UserRepositoryInterface $repository
    ) {}

    public function execute(int $id, array $data): User {
        $user = $this->repository->update($id, $data);

        event(new UserUpdated($user));

        return $user;
    }
}
```

### Step 4: Create Form Requests

```php
// app/Http/Requests/CreateUserRequest.php
namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateUserRequest extends FormRequest {
    public function authorize() {
        return true;
    }

    public function rules() {
        return [
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users',
            'password' => 'required|string|min:8|confirmed',
        ];
    }
}
```

### Step 5: Create API Resource

```php
// app/Http/Resources/UserResource.php
namespace App\Http\Resources;

use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource {
    public function toArray($request) {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'roles' => RoleResource::collection($this->whenLoaded('roles')),
            'created_at' => $this->created_at->toDateTimeString(),
        ];
    }
}
```

### Step 6: Create Controller

```php
// app/Http/Controllers/UserController.php
namespace App\Http\Controllers;

use App\Actions\Users\CreateUserAction;
use App\Actions\Users\UpdateUserAction;
use App\Http\Requests\CreateUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Repositories\UserRepositoryInterface;

class UserController extends Controller {
    public function __construct(
        private UserRepositoryInterface $repository
    ) {}

    public function index() {
        $users = $this->repository->all();
        return UserResource::collection($users);
    }

    public function show(int $id) {
        $user = $this->repository->find($id);
        return new UserResource($user);
    }

    public function store(CreateUserRequest $request, CreateUserAction $action) {
        $user = $action->execute($request->validated());
        return new UserResource($user);
    }

    public function update(int $id, UpdateUserRequest $request, UpdateUserAction $action) {
        $user = $action->execute($id, $request->validated());
        return new UserResource($user);
    }

    public function destroy(int $id) {
        $this->repository->delete($id);
        return response()->json(['message' => 'User deleted'], 200);
    }
}
```

### Step 7: Bind Interface in Service Provider

```php
// app/Providers/AppServiceProvider.php
namespace App\Providers;

use Illuminate\Support\ServiceProvider;
use App\Repositories\UserRepositoryInterface;
use App\Repositories\UserRepository;

class AppServiceProvider extends ServiceProvider {
    public function register() {
        $this->app->bind(
            UserRepositoryInterface::class,
            UserRepository::class
        );
    }
}
```

### Step 8: Define Routes

```php
// routes/api.php
use App\Http\Controllers\UserController;

Route::middleware('auth:sanctum')->group(function () {
    Route::apiResource('users', UserController::class);
});
```

---

## Item Detection Example

### Example Implementation for a Laravel App

**Controller:**

```php
// app/Http/Controllers/ItemController.php
namespace App\Http\Controllers;

use App\Actions\Shapes\SaveItemAction;
use Illuminate\Http\Request;

class ItemController extends Controller {
    public function save(Request $request, SaveItemAction $action) {
        $validatedData = $request->validate([
            'image' => 'required|mimes:jpeg,jpg,png',
            'shape' => 'required|string'
        ]);

        return $action->execute(
            $validatedData['image'],
            $request->user()->id,
            $validatedData['shape']
        );
    }
}
```

**Action:**

```php
// app/Actions/Items/SaveItemAction.php
namespace App\Actions\Shapes;

use App\Repositories\ShapeRepository;
use Illuminate\Support\Facades\Storage;

class SaveItemAction {
    private $shapeRepository;

    public function __construct(ShapeRepository $shapeRepository) {
        $this->shapeRepository = $shapeRepository;
    }

    public function execute($file, $userId, $shape) {
        // Upload to S3
        $path = Storage::disk('s3')->put('items', $file, 'public');
        $url = Storage::disk('s3')->url($path);

        // Save to database via repository
        return $this->shapeRepository->save($userId, $shape, $url);
    }
}
```

**Repository:**

```php
// app/Repositories/ShapeRepository.php
namespace App\Repositories;

use App\Models\Item;

class ShapeRepository {
    public function save(int $userId, string $shapeName, string $url, Shape $shape = null) {
        if (!$shape) {
            $shape = new Shape();
        }

        $shape->user_id = $userId;
        $shape->shape = $shapeName;
        $shape->url = $url;
        $shape->save();

        return $shape;
    }
}
```

**Model:**

```php
// app/Models/Shape.php
namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Shape extends Model {
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'id',
        'user_id',
        'shape',
        'url',
        'created_at'
    ];

    protected $hidden = [
        'deleted_at',
        'updated_at'
    ];

    public function user() {
        return $this->belongsTo(User::class);
    }
}
```

**Route:**

```php
// routes/api.php
Route::middleware('auth:sanctum')->group(function () {
    Route::post('/detection/item', [ItemController::class, 'save']);
});
```

---

## Sanctum SPA Authentication Flow

### Backend Implementation

**AuthController:**

```php
// app/Http/Controllers/AuthController.php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller {
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

**Routes:**

```php
// routes/api.php
Route::post('/auth/token', [AuthController::class, 'store']);

Route::middleware('auth:sanctum')->group(function () {
    Route::delete('/auth/token', [AuthController::class, 'delete']);
    Route::get('/user', [UserController::class, 'show']);
});
```

### Frontend Implementation (React)

**Login Component:**

```javascript
// LoginPage.js
import { useState } from 'react';
import axios from 'axios';

function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleLogin = async (e) => {
        e.preventDefault();

        try {
            // Step 1: Get CSRF token
            await axios.get('/sanctum/csrf-cookie');

            // Step 2: Login
            const response = await axios.post('/api/auth/token', {
                email,
                password
            });

            // User is now authenticated
            console.log('Logged in:', response.data.user);

        } catch (error) {
            console.error('Login failed:', error.response.data);
        }
    };

    return (
        <form onSubmit={handleLogin}>
            <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
            />
            <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
            />
            <button type="submit">Login</button>
        </form>
    );
}
```

**Axios Configuration for Sanctum:**

For complete Axios setup including CORS, credentials, and base URL configuration, see `react-redux-spa-patterns/examples.md` Section "Axios Configuration".

**Minimal Sanctum setup:**

```javascript
import axios from 'axios';

// Fetch CSRF cookie, then authenticate
await axios.get('/sanctum/csrf-cookie');
const response = await axios.post('/api/auth/token', credentials);
```

**Authenticated Request:**

```javascript
// Making authenticated API calls
const fetchUser = async () => {
    try {
        const response = await axios.get('/api/user');
        console.log('Current user:', response.data);
    } catch (error) {
        console.error('Not authenticated');
    }
};
```

---

## Eloquent Relationships

### Laravel Project Example

**Course → Modules (One-to-Many):**

```php
// app/Models/Course.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Course extends Model {
    use SoftDeletes;

    protected $fillable = [
        'id', 'name', 'description', 'image', 'created_at'
    ];

    protected $hidden = [
        'deleted_at', 'updated_at'
    ];

    public function modules() {
        return $this->hasMany(Module::class, 'course_id');
    }
}
```

**Module → Course (Belongs To):**

```php
// app/Models/Module.php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Module extends Model {
    use SoftDeletes;

    protected $fillable = [
        'id', 'name', 'description', 'course_id', 'created_at'
    ];

    public function course() {
        return $this->belongsTo(Course::class);
    }
}
```

**Usage with Eager Loading:**

```php
// In Controller
public function index() {
    // N+1 Problem avoided
    $courses = Course::with('modules')->get();

    return CourseResource::collection($courses);
}

public function show(int $id) {
    // Load with count
    $course = Course::withCount('modules')->findOrFail($id);

    return new CourseResource($course);
}
```

---

## Feature Test Examples

### Testing Controller + Action + Repository

```php
// tests/Feature/ItemControllerTest.php
namespace Tests\Feature;

use App\Models\User;
use App\Models\Item;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class ItemControllerTest extends TestCase {
    use RefreshDatabase;

    public function test__save__valid_image__creates_shape() {
        // Arrange
        Storage::fake('s3');
        $user = User::factory()->create();
        $file = UploadedFile::fake()->image('shape.jpg');

        // Act
        $response = $this->actingAs($user)
            ->post('/api/detection/item', [
                'image' => $file,
                'shape' => 'circle'
            ]);

        // Assert
        $response->assertStatus(200);

        $this->assertDatabaseHas('items', [
            'user_id' => $user->id,
            'shape' => 'circle'
        ]);

        Storage::disk('s3')->assertExists('shapes/' . $file->hashName());
    }

    public function test__save__missing_image__returns_validation_error() {
        $user = User::factory()->create();

        $response = $this->actingAs($user)
            ->post('/api/detection/item', [
                'shape' => 'circle'
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['image']);
    }

    public function test__save__unauthenticated__returns_401() {
        $file = UploadedFile::fake()->image('shape.jpg');

        $response = $this->post('/api/detection/item', [
            'image' => $file,
            'shape' => 'circle'
        ]);

        $response->assertStatus(401);
    }
}
```

### Testing with Relationships

```php
// tests/Feature/CourseControllerTest.php
public function test__index__includes_modules() {
    $user = User::factory()->create();
    $course = Course::factory()->create();
    $modules = Module::factory()->count(3)->create([
        'course_id' => $course->id
    ]);

    $response = $this->actingAs($user)
        ->get('/api/courses');

    $response->assertStatus(200);
    $response->assertJsonCount(3, 'data.0.modules');
}
```

### Testing Sanctum Authentication

```php
// tests/Feature/AuthControllerTest.php
public function test__login__valid_credentials__returns_user() {
    $user = User::factory()->create([
        'email' => 'test@example.com',
        'password' => bcrypt('password')
    ]);

    $response = $this->post('/api/auth/token', [
        'email' => 'test@example.com',
        'password' => 'password'
    ]);

    $response->assertStatus(200);
    $response->assertJson([
        'user' => [
            'email' => 'test@example.com'
        ]
    ]);

    $this->assertAuthenticatedAs($user);
}

public function test__logout__destroys_session() {
    $user = User::factory()->create();

    $this->actingAs($user);

    $response = $this->delete('/api/auth/token');

    $response->assertStatus(200);
    $this->assertGuest();
}
```

---

## Before/After Refactoring

### Before: Fat Controller

```php
// ❌ Before refactoring
class ItemController extends Controller {
    public function save(Request $request) {
        // Validation in controller
        $validated = $request->validate([
            'image' => 'required|mimes:jpeg,jpg,png',
            'shape' => 'required|string'
        ]);

        // Business logic in controller
        $path = Storage::disk('s3')->put('items', $validated['image'], 'public');
        $url = Storage::disk('s3')->url($path);

        // Data access in controller
        $shape = new Shape();
        $shape->user_id = auth()->id();
        $shape->shape = $validated['shape'];
        $shape->url = $url;
        $shape->save();

        // Event dispatching in controller
        event(new ShapeSaved($shape));

        // Manual JSON response
        return response()->json([
            'id' => $shape->id,
            'shape' => $shape->shape,
            'url' => $shape->url
        ], 201);
    }
}
```

### After: Clean Architecture

```php
// ✅ After refactoring
class ItemController extends Controller {
    public function save(SaveShapeRequest $request, SaveItemAction $action) {
        $shape = $action->execute($request->validated());
        return new ShapeResource($shape);
    }
}
```

**Extracted to:**
- `SaveShapeRequest` - Validation
- `SaveItemAction` - Business logic
- `ShapeRepository` - Data access
- `ShapeResource` - Response transformation

---

## Testing Anti-Patterns

### N+1 Query Detection

```php
public function test__index__no_n_plus_1_queries() {
    $courses = Course::factory()->count(10)->create();

    foreach ($courses as $course) {
        Module::factory()->count(5)->create(['course_id' => $course->id]);
    }

    // Enable query log
    DB::enableQueryLog();

    $this->actingAs(User::factory()->create())
        ->get('/api/courses');

    $queries = DB::getQueryLog();

    // Should be 2 queries: 1 for courses, 1 for all modules
    // NOT 11 queries (1 for courses + 10 for modules)
    $this->assertLessThanOrEqual(2, count($queries));
}
```

---

## Complete Example: CRUD with All Patterns

This combines all patterns from the skill in one cohesive example:

1. ✅ Repository pattern with interface
2. ✅ Action classes for business logic
3. ✅ Form requests for validation
4. ✅ API resources for transformation
5. ✅ Eloquent relationships with eager loading
6. ✅ Sanctum authentication
7. ✅ Feature tests
8. ✅ Soft deletes

See the complete implementation in the sections above!
