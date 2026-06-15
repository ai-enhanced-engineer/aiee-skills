# Unit Test Standards - Reference

Detailed patterns for writing and reviewing Python tests.

## Naming Convention Deep Dive

### Unit Tests: `test__<what>__<expected>`

| Component | Purpose | Example |
|-----------|---------|---------|
| `<what>` | Function/method/behavior being tested | `batch_allocation`, `user_creation` |
| `<expected>` | Expected outcome or state change | `reduces_available_quantity`, `returns_user_id` |

**Good names:**
- `test__allocate_line__reduces_batch_quantity`
- `test__parse_date__returns_none_for_invalid_format`
- `test__calculate_total__includes_tax_when_applicable`

**Bad names:**
- `test_something` - What is being tested?
- `test_it_works` - What is "it"? What is "works"?
- `test_1`, `test_function` - No information

### Integration Tests: `test__<component>__<behavior>`

Tests that cross boundaries (database, network, filesystem):
- `test__repository__persists_aggregate_with_events`
- `test__api_client__retries_on_transient_failure`
- `test__cache__expires_after_ttl`

### E2E Tests: `test__<use_case>__<scenario>`

Full workflow tests:
- `test__checkout_flow__completes_with_valid_payment`
- `test__user_registration__sends_confirmation_email`
- `test__order_allocation__handles_out_of_stock`

## Tautological Test Detection

### Pattern 0: Circular Import (Value Under Test Imported from Module Under Test)

Importing a constant or computed value directly from the module under test and asserting it equals itself is a circular assertion — the test cannot fail unless the import itself fails.

```typescript
// BAD — imports the value being tested; can never catch a wrong value
import { STATUS_LABELS } from '../statusLabels';
import { getStatusLabel } from '../statusLabels';  // module under test

it('returns the correct label', () => {
  expect(getStatusLabel('pending')).toBe(STATUS_LABELS['pending']);
  // If getStatusLabel just returns STATUS_LABELS[status], this always passes
});

// GOOD — asserts against a literal; will catch regressions
it('returns the correct label', () => {
  expect(getStatusLabel('pending')).toBe('Pending Approval');
});
```

**Detection:** Test file imports both a helper and a constant from the same module, then asserts `helper(x) === constant[x]`.

### Pattern 0b: Misleading Test Name with Weak Assertion

A test name that claims to prove behavior X but whose assertion only proves a weaker property Y gives a false confidence signal — CI is green while the named behavior is untested.

```typescript
// BAD — name says "renders badge for each status" but assertion only checks count
it('renders badge for each status', () => {
  render(<StatusBadgeList statuses={['pending', 'published']} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  // Proves 2 items rendered — does NOT prove badges are correct per status
});

// GOOD — name and assertion are aligned
it('renders "Pending Approval" badge for pending status', () => {
  render(<StatusBadge status="pending" />);
  expect(screen.getByText('Pending Approval')).toBeInTheDocument();
});
```

**Detection:** Test name contains "renders X for Y" / "returns correct Z" but assertion uses only `toHaveLength`, `toBeTruthy`, or `toBeInTheDocument` without checking content.

### Pattern 1: Testing Mock Return Values

```python
# BAD - Tests nothing, mock returns what you configured
def test__get_user__returns_user():
    mock_repo = Mock()
    mock_repo.get.return_value = User(id=1, name="Test")
    service = UserService(mock_repo)

    result = service.get_user(1)

    assert result.name == "Test"  # Tautology! Just asserting mock config
```

**Detection:** Look for `Mock()` + `return_value` + assertion on that same value.

### Pattern 2: Testing Assignment

```python
# BAD - Tests Python's assignment operator
def test__user__has_name():
    user = User(name="Alice")
    assert user.name == "Alice"  # Tautology! Tests nothing
```

**Detection:** Constructor arg directly asserted without transformation.

### Pattern 3: No Meaningful Assertions

```python
# BAD - No assertion
def test__process__runs():
    processor = Processor()
    processor.process()  # Just runs, asserts nothing

# BAD - Trivial assertion
def test__list__is_list():
    result = get_items()
    assert isinstance(result, list)  # Doesn't test content
```

**Detection:** Missing `assert`, or only type/truthy checks.

### Pattern 4: Testing Implementation Details

```python
# BAD - Tests HOW not WHAT
def test__save_user__calls_repository():
    mock_repo = Mock()
    service = UserService(mock_repo)

    service.save(User(name="Test"))

    mock_repo.save.assert_called_once()  # Tests wiring, not behavior
```

**Detection:** `assert_called*` without verifying observable outcomes.

### Pattern 6: Forwarding-Wrapper Shape Assertion

A wrapper that forwards a payload unchanged should not be tested by asserting the wrapper received the verbatim payload — the assertion is tautological because a pass-through can never violate it.

```typescript
// BAD — asserts the literal input payload was echoed; tests nothing
it('passes payload to API client', async () => {
  const payload = { userId: 42, action: 'view' };
  await analyticsWrapper.track(payload);
  expect(mockApiClient.post).toHaveBeenCalledWith('/events', payload);
  // If wrapper just does: client.post('/events', payload) — always passes
});

// GOOD — test real transforms: URL construction and response unwrap
it('constructs correct endpoint and unwraps envelope', async () => {
  mockApiClient.post.mockResolvedValue({ data: { eventId: 'ev-1' }, status: 200 });
  const result = await analyticsWrapper.track({ userId: 42, action: 'view' });

  // URL transform assertion
  expect(mockApiClient.post).toHaveBeenCalledWith('/events', expect.any(Object));

  // Shape assertion: fails on key-name regressions without echoing literal values
  expect(result).toEqual(expect.objectContaining({
    eventId: expect.any(String),
  }));
});
```

**Key distinction from Pattern 1 (mock assertion):** Pattern 1 is about asserting a mock's return value. Pattern 6 is about the thin-wrapper case where the entire test body mirrors the implementation because the wrapper is a pass-through — the remedy is to test non-trivial transforms and use `expect.objectContaining` for structural shape assertions.

**Detection:** The test's `calledWith` argument is identical to a variable constructed in the Arrange step with no transformation applied.

### Pattern 7: CSS/Utility Class-String Assertion as a Behavioral Guarantee

Asserting that a component's `className` contains a specific Tailwind or utility string under jsdom tests the string value, not the rendered layout. jsdom is a non-layout runner; it cannot compute whether `min-h-[44px]` produces a 44 px rendered height.

```typescript
// BAD — tests the string, not the rendered touch target
it('meets WCAG touch target minimum', () => {
  render(<IconButton label="Close" />);
  const btn = screen.getByRole('button');
  expect(btn.className).toContain('min-h-[44px]');
  // Passes even if the CSS is overridden by a parent style, or the class is misspelled
  // in a different branch, or jsdom ignores it entirely
});

// GOOD — assert a stable data-* contract attribute the component declares
it('declares touch-target compliance via data attribute', () => {
  render(<IconButton label="Close" />);
  const btn = screen.getByRole('button');
  expect(btn).toHaveAttribute('data-touch-target', 'compliant');
  // The component declares this attribute when it satisfies the size contract;
  // a real layout regression detected by visual/snapshot testing or real-browser tests
});
```

**When class-string assertions are valid:** Testing that a conditional class is applied based on a prop (`disabled` → `opacity-50`) is fine — that is a class-application behavioral contract, not a layout guarantee. The tautology trap is specifically claiming layout properties (size, spacing, overflow) are verified when jsdom cannot compute them.

**Detection:** Test name includes "size", "touch target", "WCAG", "accessible size", or claims a minimum dimension, and the assertion is `className.toContain(...)` or `toHaveClass(...)` rather than a `data-*` attribute or a real-browser/visual assertion.

### Pattern 5: Hardcoded Expected Values (Tautological Assertions)

```python
# BAD - Hardcoded expectation always passes
def test__get_conversation_count__returns_count():
    result = await analytics_service.get_summary(db, customer_id)
    assert result["conversation_count"] == 47  # ❌ Hardcoded value!
```

**Why This Fails:**
- Test always passes as long as implementation returns 47
- Doesn't validate actual business logic (counting conversations)
- If implementation has a bug that always returns 47, test still passes
- Provides false confidence in correctness

**Real-World Example:**

```python
# Implementation (WRONG but test passes)
async def get_summary(db, customer_id):
    # Bug: Hardcoded return value
    return {"conversation_count": 47, "visitor_count": 23}

# Test (passes despite implementation bug)
def test__get_summary__returns_data():
    result = await service.get_summary(db, "cust-123")
    assert result["conversation_count"] == 47  # ✅ Passes!
    assert result["visitor_count"] == 23  # ✅ Passes!
```

**GOOD - Behavioral Assertions:**

Test structure and types, not specific values:

```python
def test__get_summary__returns_conversation_count():
    # Arrange: Create test data
    await create_test_conversations(db, customer_id, count=5)

    # Act
    result = await analytics_service.get_summary(db, customer_id)

    # Assert: Verify structure and reasonable bounds
    assert isinstance(result["conversation_count"], int)
    assert result["conversation_count"] >= 0  # Validate non-negative
    # Or validate against known test data:
    assert result["conversation_count"] == 5  # ✅ Based on test setup
```

**When Specific Values Are OK:**

1. **Test Data Setup** - When you control the preconditions:
   ```python
   # Create 3 conversations
   await create_conversations(db, count=3)
   result = await service.get_summary(db, customer_id)
   assert result["conversation_count"] == 3  # ✅ Based on setup
   ```

2. **Domain Invariants** - Testing business rules with known inputs:
   ```python
   order = Order(items=[Item(price=100), Item(price=50)])
   assert order.total == 150  # ✅ Validates calculation
   ```

3. **Fixed Reference Data** - Constants or configuration:
   ```python
   assert config.MAX_RETRIES == 3  # ✅ Validates config value
   ```

**Detection Checklist:**

- [ ] Does the assertion use a magic number not derived from test setup?
- [ ] If I change the hardcoded value, does the test still conceptually make sense?
- [ ] Is the test validating behavior or just documenting current output?

**Related Anti-Pattern:** JWT token fixtures missing required fields (e.g., `customer_id`) cause integration tests to fail with authentication errors even though unit tests pass.

## Behavioral Test Patterns

### Arrange-Act-Assert (AAA)

```python
def test__batch_allocation__reduces_available_quantity():
    # Arrange - Set up preconditions
    batch = Batch(sku="LAMP", qty=100)
    line = OrderLine(sku="LAMP", qty=10)

    # Act - Perform the action
    batch.allocate(line)

    # Assert - Verify outcomes
    assert batch.available_quantity == 90
```

### Testing State Changes

```python
def test__order__transitions_to_paid_on_payment():
    # Arrange
    order = Order(items=[Item(price=100)])

    # Act
    order.mark_paid(payment_ref="PAY-123")

    # Assert - Verify state changed
    assert order.status == OrderStatus.PAID
    assert order.payment_reference == "PAY-123"
    assert order.paid_at is not None
```

### Testing Exceptions

```python
def test__withdraw__raises_on_insufficient_funds():
    account = Account(balance=100)

    with pytest.raises(InsufficientFunds) as exc_info:
        account.withdraw(150)

    assert exc_info.value.available == 100
    assert exc_info.value.requested == 150
```

### Testing Invariants

```python
def test__batch_allocation__cannot_exceed_quantity():
    batch = Batch(sku="LAMP", qty=10)
    line = OrderLine(sku="LAMP", qty=15)

    with pytest.raises(OutOfStock):
        batch.allocate(line)

    # Invariant: quantity unchanged on failure
    assert batch.available_quantity == 10
```

## Coverage Guidelines

### What 80% Coverage Means

- 80% of **lines** executed during tests
- Does NOT mean 80% of **behaviors** tested
- Coverage is necessary but not sufficient

### What to Exclude

```ini
# pyproject.toml or .coveragerc
[tool.coverage.run]
omit = [
    "*/migrations/*",
    "*/__init__.py",
    "*/conftest.py",
    "*_test.py",
    "tests/*",
]
```

### pytest-cov Configuration

```ini
[tool.pytest.ini_options]
addopts = "--cov=src --cov-report=term-missing --cov-fail-under=80"
```

### Coverage for New Code Only

```bash
# Compare coverage between branches
diff-cover coverage.xml --compare-branch=main --fail-under=80
```

## File Structure Standards

### Mirror Source Structure

```
src/
├── domain/
│   ├── model.py
│   └── services.py
├── adapters/
│   └── repository.py
└── entrypoints/
    └── api.py

tests/
├── unit/
│   ├── domain/
│   │   ├── test_model.py
│   │   └── test_services.py
│   └── adapters/
│       └── test_repository.py
├── integration/
│   └── test_api.py
└── conftest.py
```

### conftest.py Best Practices

```python
# tests/conftest.py - Shared fixtures
import pytest

@pytest.fixture
def sample_user():
    """Reusable test user."""
    return User(id=1, name="Test User", email="test@example.com")

@pytest.fixture
def in_memory_repo():
    """In-memory repository for integration tests."""
    return InMemoryRepository()
```

## Test Independence

Each test must:
1. Set up its own state (Arrange)
2. Not depend on test execution order
3. Clean up after itself (or use fixtures with cleanup)
4. Not share mutable state with other tests

```python
# BAD - Tests depend on shared state
class TestUser:
    user = None  # Shared mutable state!

    def test_create(self):
        self.user = User(name="Test")

    def test_update(self):
        self.user.name = "Updated"  # Depends on test_create running first!
```

```python
# GOOD - Each test is independent
class TestUser:
    def test_create(self):
        user = User(name="Test")
        assert user.name == "Test"

    def test_update(self):
        user = User(name="Test")
        user.name = "Updated"
        assert user.name == "Updated"
```

---

## Test Data Factories (Builder Pattern)

Fluent chainable factories reduce test setup from 15 lines to 2-3 lines:

```python
class UserFactory:
    def __init__(self) -> None:
        self._id = uuid4()
        self._email = f"user-{uuid4().hex[:8]}@example.com"
        self._role = UserRole.VIEWER

    def with_email(self, email: str) -> "UserFactory":
        self._email = email
        return self

    def as_admin(self) -> "UserFactory":
        self._role = UserRole.ADMIN
        return self

    def build_entity(self) -> UserEntity:
        return UserEntity(id=self._id, email=self._email, role=self._role, ...)

    async def create(self, db: FakeDatabaseSession) -> User:
        user = self.build_model()
        db.add(user)
        await db.flush()
        return user

# Usage
admin = await UserFactory().with_email("admin@co.com").as_admin().create(db)
```

### Factory Anti-Pattern: func.lower() Detection

When implementing fakes for SQLAlchemy:

```python
# WRONG attribute check
if hasattr(left, "fn"):  # ❌ Function objects don't have .fn

# RIGHT attribute check
if hasattr(left, "name") and left.name == "lower":  # ✅
```

**Prevention:** Verify third-party library attributes with `dir()` or debugger.

---

## Fresh Clone Test Setup

Always sync dependencies before running tests on fresh clones:

```bash
# WRONG: Tests fail with "pytest not found"
git clone repo && cd repo && just test  # ❌

# RIGHT: Sync dependencies first
git clone repo && cd repo && just sync && just test  # ✅
```

---

## FakeDatabaseSession Execute Pattern

For async SQLAlchemy testing, `execute()` returns a Result-like object:

```python
from typing import Any

class FakeResult:
    def __init__(self, objects: list[Any]):
        self._objects = objects

    def scalar_one_or_none(self) -> Any | None:
        return self._objects[0] if self._objects else None

    def scalars(self) -> "FakeScalars":
        return FakeScalars(self._objects)

class FakeScalars:
    def __init__(self, objects: list[Any]):
        self._objects = objects

    def all(self) -> list[Any]:
        return self._objects

class FakeDatabaseSession:
    async def execute(self, statement) -> FakeResult | None:
        # Handle RLS context statements
        stmt_str = str(statement)
        if "SET LOCAL" in stmt_str or "RESET" in stmt_str:
            return None

        # Handle select() statements
        if hasattr(statement, "froms"):
            table_name = statement.froms[0].name
            # Filter objects from fake storage based on WHERE clause
            return FakeResult(self._filter_objects(table_name, statement))

        return None
```

**Why:** Async repositories use `result = await db.execute(select(...))` then `obj = result.scalar_one_or_none()`. Without FakeResult, tests fail with "NoneType has no attribute scalar_one_or_none".

---

## Svelte/Web Component Tautological Test Remediation

### Red Flags in Test Names

Tests with these verbs in their names are likely tautological:
- "sets", "receives", "stores", "assigns" → test mechanics, not behavior
- No user interaction simulation (click, type, scroll)
- No side effect validation (DOM update, API call, derived state)
- 100% pass rate even when feature demonstrably broken

### Real Refactor Metrics

- Before: 30% tautological (216 of 720 tests)
- After: 12% tautological (87 of 722 tests)
- Method: Enhanced 14 test files with behavioral assertions
- Critical bug not caught: Singleton references in props-based components
- Why: Tests verified stores existed, not that components used injected stores

### Remediation Strategy

1. Audit tests with "assignment" verbs in names
2. Check if expect uses same variable as prior assignment
3. Enhance with behavioral assertions (DOM, events, derived state)
4. Target reduction: <10% tautological tests

## Context-Specific Anti-Patterns

Patterns observed in production codebases that are too narrow for the SKILL.md summary but worth documenting.

### Always-True Filter Assertions

```python
# BAD: Second branch always true for any call with arguments
assert x == "expected" or (len(captured_calls) > 0)

# GOOD: Assert the specific condition only
assert x == "expected"
```

The `or` branch with `len() > 0` is always true when the function was called with any args — making the entire assertion a tautology.

### Source Code String Matching for Bug Documentation

```python
# BAD: Fragile to reformatting
source = inspect.getsource(my_function)
assert "bug_pattern" in source

# GOOD: Structural assertion via AST
tree = ast.parse(inspect.getsource(my_function))
nodes = [n for n in ast.walk(tree) if isinstance(n, ast.Call)]
assert any(...)  # Check structural property
```

`inspect.getsource()` + string matching breaks on any whitespace or comment change. `ast.parse()` + `ast.walk()` is resilient to formatting.

---

## Swift Testing Conventions

### Naming Convention: `<what>__<expected>` (no `test__` prefix)

The `test__<what>__<expected>` convention in this skill's core section is Python-derived. Swift Testing projects with `swiftTestingTestCaseNames` SwiftFormat rule enforced use `<what>__<expected>` — no `test__` prefix. SwiftFormat silently rewrites `test__foo__bar` → `foo__bar` post-commit when this rule is active. Read existing test files in the target codebase before writing new test names; don't assume the skill's convention applies cross-language.

### `@Suite(.serialized)` Naming

The `swiftTestingTestCaseNames` SwiftFormat rule rejects string-named suites. Use `@Suite(.serialized)` only — the type name carries the test identity. Mirror existing local convention by checking `grep "@Suite" Tests/**/*.swift` before naming a new suite.

### SwiftLint `identifier_name` Minimum 3 Characters

SwiftLint's default `identifier_name` rule requires identifiers ≥3 chars. Variables like `n`, `pm`, `vm`, `id` (loose binding), `h` (height) all fail `--strict` and block pre-commit hooks. Use descriptive names (`progressManager`, `viewModel`, `height`) from the start.

### Test Suite Splitting on `type_body_length`

When a `@Suite` struct exceeds SwiftLint's 250-line `type_body_length`, **split into multiple `@Suite` structs by domain** — one suite per dependency or per behavior cluster (e.g., preauthored-tier vs FM-tier). Promote shared helpers to file-scope `private` functions. Avoid `swiftlint:disable` comments unless the project has precedent. Split pattern preserves test cohesion (still one file) while satisfying the lint rule cleanly.

| Anti-Pattern | Pattern |
|--------------|---------|
| `@Suite("string-name", .serialized)` with SwiftFormat enabled | `@Suite(.serialized)` — type name carries identity |
| 2-char variable names (`pm`, `vm`, `n`) under SwiftLint default | ≥3-char descriptive names |
| `// swiftlint:disable type_body_length` to silence the rule | Split into multiple `@Suite` structs by domain |

---

## Laravel Testing Addendum (2026-05)

Patterns specific to Laravel + PHPUnit + Pint test suites. Companion to the Swift Testing addendum in SKILL.md.

### Sanctum Token Revocation — False-Positive Trap

`actingAs($user, 'sanctum')` injects a `TransientToken`, skipping the `instanceof Model` revocation branch — tests written this way pass even when revocation is broken. The `forgetGuards()` requirement after the revocation request is the second half of the trap (without it, the follow-up 401 assertion may pass against a stale guard cache). Same trap applies to TTL expiry tests.

Full pattern with the canonical code skeleton: **`laravel-modern-patterns` reference → "Sanctum Token Revocation Test Pattern"** (under "Security & Authorization Patterns"). Lives there because the trap is Laravel/Sanctum-specific rather than a general testing principle.

### Pint `php_unit_method_casing` — Write snake_case from the Start

Laravel projects with Pint's `PHPUnit75Migration:risky` preset enforce snake_case test method names. Camel-cased method bodies (`test__handleSubscriptionUpdated__expected`) get auto-rewritten on pre-commit, causing a fail → fix → restage round-trip:

```php
// AVOID — Pint rewrites this
public function test__handleSubscriptionUpdated__resyncsLocalState(): void { ... }

// PREFER — final form
public function test__handle_subscription_updated__resyncs_local_state(): void { ... }
```

`./vendor/bin/pint <file>` autofixes locally; `pint --test <file>` is what the pre-commit hook runs.

### RefreshDatabase + SQLite — Migration Test Gap

`RefreshDatabase` over SQLite `:memory:` does NOT exercise migration `down()` and ignores MySQL's stricter enum / NOT NULL constraints. Migration bugs that only manifest on MySQL pass CI silently. Three mitigations:

1. Require data-engineer review on every migration PR
2. Add a MySQL CI matrix for migration smoke tests
3. Treat any change to enum constraints or NOT NULL as needing manual MySQL verification

This is a **structural test gap** — code review fills it, not test code.

### External SDK Mocking via Service Layer

When testing code that wraps an external SDK (Stripe, Twilio, AWS SDK, Slack), route SDK calls through a thin service-layer class and mock that class:

```php
// In test setup
$this->instance(StripeService::class, $mock = Mockery::mock(StripeService::class));
$mock->shouldReceive('createSubscription')->andReturn($fakeSubscription);

// AVOID — directly mocking the SDK client
// $this->instance(\Stripe\StripeClient::class, ...);  // forces test to know SDK internals; breaks on SDK upgrades
```

Single mock seam, no test-pollution risk from accidental network calls, resilient to SDK version bumps.

### Coverage Scope Curation (Laravel)

Pragmatic floor pattern beats raw threshold. A 60% gate over **functional code only** is more meaningful than 75% over the whole tree. In `phpunit.xml`'s `<coverage>` block, exclude framework wiring:

```xml
<coverage>
  <report><html outputDirectory="coverage"/></report>
  <include><directory suffix=".php">app</directory></include>
  <exclude>
    <directory>app/Console/Kernel.php</directory>
    <directory>app/Http/Kernel.php</directory>
    <directory>app/Providers/AppServiceProvider.php</directory>
    <directory>app/Providers/AuthServiceProvider.php</directory>
    <directory>app/Providers/BroadcastServiceProvider.php</directory>
    <directory>app/Providers/EventServiceProvider.php</directory>
    <directory>app/Providers/RouteServiceProvider.php</directory>
    <!-- scaffolding middleware shipped by Laravel -->
    <directory>app/Http/Middleware/Authenticate.php</directory>
    <directory>app/Http/Middleware/EncryptCookies.php</directory>
    <directory>app/Http/Middleware/TrimStrings.php</directory>
    <directory>app/Http/Middleware/TrustHosts.php</directory>
    <directory>app/Http/Middleware/TrustProxies.php</directory>
    <directory>app/Http/Middleware/VerifyCsrfToken.php</directory>
    <directory>app/Http/Middleware/PreventRequestsDuringMaintenance.php</directory>
    <directory>app/Http/Middleware/RedirectIfAuthenticated.php</directory>
    <directory>app/Constants</directory>
  </exclude>
</coverage>
```

Watch for service classes hiding under conventional directories — `app/Providers/OtpService.php` is service code, not a provider. Exclude provider files individually (by name) rather than blanket-excluding the directory.

Set the gate at a number you can hit on the first run (e.g. 60) and document it as a floor expected to ratchet up as feature tests for new work land. Avoids CI-bouncing the first PR while preserving forward pressure.

### `assertDatabaseHas` for New Persistence Paths

When a feature adds a new persistence write to an existing endpoint, the test must include `assertDatabaseHas` keyed on the new column — response-shape assertions alone can mask the bug if the response field is sourced from a mocked passthrough:

```php
public function test__destroy__cancels_at_period_end(): void
{
    $sub = Subscription::factory()->for($user)->create();
    $this->actingAs($user)->deleteJson("/v1/subscriptions/{$sub->id}")
        ->assertOk()
        ->assertJsonPath('cancel_at_period_end', true);

    // CRITICAL — would pass without this if response field comes from Stripe mock passthrough
    $this->assertDatabaseHas('subscriptions', [
        'id' => $sub->id,
        'cancel_at_period_end' => true,
    ]);
}
```

Pair with the **always-emit-key pattern** for nullable response fields:

```php
->assertJsonPath('field', null)        // value assertion
->assertJsonStructure(['field'])        // key-presence assertion (catches accidental `unset`)
```

---

## Vitest Patterns Addendum (2026-05)

Patterns specific to Vitest in Next.js + Capacitor static-export projects.

### `vi.hoisted` for axios Singleton Mocks

axios singletons configured via `axios.create({...})` with interceptors need a hoisted mock so `vi.mock()` runs before the module loads:

```ts
import { describe, it, vi, expect } from "vitest";

const { mockApi } = vi.hoisted(() => {
  const interceptors = {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  };
  return {
    mockApi: {
      get: vi.fn(),
      post: vi.fn(),
      interceptors,
    },
  };
});

vi.mock("axios", () => ({
  default: { create: () => mockApi, ...mockApi },
}));

// Now the module under test reads the mocked instance at import time
import { fetchUser } from "@/lib/api";

it("calls the right endpoint", async () => {
  mockApi.get.mockResolvedValue({ data: { id: 1 } });
  await fetchUser(1);
  expect(mockApi.get).toHaveBeenCalledWith("/users/1");
});
```

### `vi.resetModules()` + Dynamic Import for Module-State / Env-Var Tests

For modules whose top-level `process.env.X` read affects behavior:

```ts
it("throws when STRIPE_KEY is missing", async () => {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");

  try {
    await expect(async () => {
      await import("@/lib/stripe-client");
    }).rejects.toThrow(/STRIPE_PUBLISHABLE_KEY is required/);
  } finally {
    vi.resetModules();    // critical — second reset prevents leakage to next test
    vi.unstubAllEnvs();
  }
});
```

Three rules:

1. `vi.hoisted()` mocks **survive** `resetModules()` — they re-bind on the next import.
2. Always wrap in `try/finally` with a second `resetModules()` in cleanup — without it, the next test imports the contaminated module.
3. Comment the asymmetry (clear → reload → clear-again). The shape is non-obvious.

Caveat: agent-driven commits skip Husky pre-commit hooks; CI catches `format-check` fails that local manual commits don't. Add `npm run build` (not just `lint` + `test`) to pre-push hooks for any file using these patterns.

## Falsifiability: Filter-Result Anchoring

### `assertJsonMissing` on Empty Result Sets

`assertJsonMissing(['id' => $row->id])` on a single-row pending seed is vacuous — if the result set is empty, every ID is "missing" and the filter could be removed entirely without breaking the test.

**Pattern**: anchor first with a row that SHOULD appear in the filtered result:

```php
$visible = Item::factory()->published()->create();
$hidden  = Item::factory()->pending()->create();

$response = $this->getJson('/api/listings');

$response->assertJsonPath('data.0.id', $visible->id);  // positive control
$response->assertJsonMissing(['id' => $hidden->id]);    // now falsifiable
```

Same logic applies to `assertJsonCount(0, 'data')` — add at least one row that the route *would* have returned if the filter were broken, then assert the count.

### State-Machine Enum Coverage

When testing components or controllers that gate behavior on a status enum, add one test per enum value — not just the "happy path" values. Every value in the state machine is a contract, and rare-state coverage is the highest-priority silent-regression vector.

```php
// Derive enum values from the model's cast definition to stay in sync
$allStatuses = ['pending_approval', 'published', 'hidden', 'suspended', 'rejected', 'removed'];

foreach ($allStatuses as $status) {
    $listing = Item::factory()->create(['status' => $status]);
    // assert the expected behavior for each status...
}
```

Or in Vitest, derive from the TS union:

```ts
const statuses: Item['status'][] = ['pending_approval', 'published', 'hidden', 'suspended', 'rejected', 'removed'];
statuses.forEach(status => {
    it(`renders correct badge for ${status}`, () => { /* ... */ });
});
```

Missing coverage of terminal or edge states (`rejected`, `removed`) is the failure mode — approval-queue components tested only on `pending_approval` + `published` will silently produce `undefined`-themed badges for new enum values when the type is widened.

---

## Mock-Fidelity Tautology (shape-shallow mock)

A mock whose shape is shallower than the real payload silently skips the transform under test. The classic failure: a response-unwrap helper that extracts `response.data.result` becomes a no-op when the mock returns `{ result: ... }` directly instead of `{ data: { result: ... } }`. The assertion passes because the unwrap path never runs — the shallow mock short-circuits to the value without the transform.

```typescript
// BAD — mock shape is shallower than real API envelope
const mockClient = { get: vi.fn().mockResolvedValue({ userId: 99 }) };
//                  Real API returns: { data: { userId: 99 }, status: 200 }

async function getUser(id: number) {
  const response = await client.get(`/users/${id}`);
  return response.data.userId;  // unwrap helper — exercises a real code path
}

// GOOD — mock the full real envelope so the unwrap path is exercised
const mockClient = { get: vi.fn().mockResolvedValue({ data: { userId: 99 }, status: 200 }) };

it('unwraps userId from envelope', async () => {
  const result = await getUser(99);
  expect(result).toBe(99);
  // Removing response.data.userId from the implementation now breaks this test
});
```

**Rule:** When the code under test performs wrapping, unwrapping, or nested property traversal on a response, the mock must mirror the real envelope structure. A shallow mock makes the transform a no-op; the assertion passes even if the transform is deleted or swapped.

**Detection:** Mock return value is a flat object; implementation accesses `.data.*`, `.body.*`, or unwraps a nested key. Removing the unwrap line leaves all tests green.

---

## Additional Anti-Patterns (extended catalog)

Rows beyond the four kept inline in SKILL.md:

| Anti-Pattern | Pattern |
|--------------|---------|
| Broken mocking after DI migration | Patch factory function at module path, not class attribute |
| Hardcoded expected values not from test setup | Assert against values derived from Arrange step |
| Module-level global state pollution | Patch module globals in each test to prevent cross-test pollution |
| Bare fixture name in test body (not in parameter list) | Resolves to fixture function object, not return value — tests pass silently on wrong double |
| Mock default matches expected value (reset sets `.steady`, test asserts `.steady`) | Set mock to non-default AFTER reset-triggering call, then assert non-default |
| Mock shape shallower than real envelope (mock-fidelity tautology) | Mock the full real envelope so the unwrap/traverse path is actually exercised |
| CSS/utility class-string assertion claiming layout guarantee under jsdom | Assert a stable `data-*` contract attribute; jsdom cannot compute rendered size |
| `> 0` assertion on computed numeric outputs | Compute expected value from inputs; assert meaningful bound (e.g., `> 30` when expecting ~90) |
| Mock return propagation (`assert result is mock_x`) | Tests mock wiring, not behavior — assert on observable outcome instead |
| Summary Count Drift | When a document/test contains both raw data and a summary, derive the summary programmatically. Mental tallying is error-prone — one audit found 6/14 categories with wrong counts despite careful manual work. |
| Tautological mocking via unconditional `side_effect` | When testing that production code triggers a handler via a real condition (empty filename → directory path → `IsADirectoryError`), assert on the *call argument* the production code computed, not just on post-handler state. |
| Factory-set field assertion without `->fresh()` | `assertNull` / `assertNotNull` on factory-set fields without `->fresh()` or `Model::find()` is tautological — the assertion checks the in-memory factory output, not what was persisted. |
| Untested `BelongsTo`/`HasMany` relations | Every relation needs at least one assertion that it resolves correctly. Without it, an FK rename or accessor typo passes silently when only the parent table is touched. |
| Laravel `assertJson([])` for empty-collection check | Matches any superset; not falsifiable. Use `assertJsonCount(0)` / `assertEmpty()`. |
| New persistence path covered only by response-shape assertion | Add `assertDatabaseHas` keyed on the new column — a response field sourced from a passthrough mock can mask a deleted persistence line. |
| Privileged-action test asserts only response shape | Add `assertDatabaseHas` (or direct `->fresh()` read) keyed on the status column to catch silent no-ops from `update()` on a non-fillable field. |
| `assertDatabaseHas([..., 'col' => null])` for null-value assertions | Version-fragile (`null` becomes `WHERE col = NULL`, always false). Use `$this->assertNull(Model::where('uuid', ...)->value('col'))`. |
| Eloquent `'array'` cast test reads back via `assertDatabaseHas(json_encode($arr))` | Both a correct and a double-encoded value satisfy the string match. Round-trip test must read through the model and `assertIsArray()`. |
| Mocking an external SDK client directly (e.g., `Stripe\StripeClient`) in tests | Route SDK calls through a thin service class and mock that class via `$this->instance(ServiceClass::class, $mock)`. Single mock seam; tests don't need SDK internals and won't break on SDK upgrades. |

---

## Testing Specialized Domains

| Domain | Key Pattern | Pitfall |
|--------|-------------|---------|
| AI/LLM entity grounding | Three-test pattern (enumerate, select, reject fake) | Not testing multilingual entity consistency |
| Pydantic security controls | `pytest.raises()` around `Model()` instantiation | Testing property access instead of initialization |
| Async SQLAlchemy | Use `postgresql+asyncpg://` driver URL | Sync driver causes import-time error |
| JSDOM browser APIs | Test underlying behavior via `(obj as any).method()` | `vi.spyOn()` fails on readonly properties |
| TypeScript signal queries | Narrow `T | undefined` with `?.` or guard | Direct access causes TS error |
| pytest-mock for external deps | `mocker.patch("module.function")` | Mock responses must match real API schemas |
| Django + pytest (mandatory env vars) | Two-conftest bootstrap: root `conftest.py` uses `pytest_configure()` hook to force-set env vars before Django loads; inner `tests/conftest.py` holds fixtures only | `monkeypatch` runs after module-level imports — too late for `settings.py` bootstrap or mypy django-stubs analysis |
| aiohttp nested context managers | Build `async with` chain layer by layer: `MagicMock()` for session/response, `__aenter__ = AsyncMock(return_value=...)` on each | Single `AsyncMock()` causes "coroutine never awaited" — each nesting level needs separate `__aenter__`/`__aexit__` |

---

## Env-Gated Feature Test Suite

For features whose availability depends on an environment variable (demo mode, debug endpoints, feature flags), a three-layer test suite catches the common regressions:

1. **Runtime allowlist**: `monkeypatch.setenv("ENVIRONMENT", "production")` → endpoint returns 403
2. **Happy-path**: `ENVIRONMENT=development` → endpoint returns 200 with expected payload
3. **Cache identity** (when the feature uses `@lru_cache`): assert `first is second` to verify the cache key actually hits — a parameterized cache key silently misses on every call

Integration tests catch HTTP/middleware issues; unit tests catch cache-key and env-check logic that's hard to trigger through the API. Both add value — integration coverage alone missed a cache key bug in one observed session.

---

## Assertion Strength Guidelines (extended)

### Double Threshold Boundary Testing (Swift / numeric types)

For Double threshold logic, test at exact boundary values (e.g., 70.0 and 70.5, not just integer 71). Avoid `switch` with integer range literals on `Double` values — use `if/else` with explicit comparison operators to prevent silent gaps. A switch case that compares an integer literal against a Double silently falls through without a compiler warning when the value falls between integer steps.
