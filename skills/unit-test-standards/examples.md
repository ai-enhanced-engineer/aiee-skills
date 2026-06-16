# Unit Test Standards - Examples

Before/after comparisons demonstrating good vs bad testing patterns.

## Example 1: Domain Logic Testing

### BAD: Tautological Test

```python
def test__order__has_items():
    """Tests nothing - just verifies assignment works."""
    items = [Item(sku="LAMP", qty=2)]
    order = Order(items=items)

    assert order.items == items  # Tautology!
    assert len(order.items) == 1  # Still tautology!
```

### GOOD: Behavioral Test

```python
def test__order_total__sums_item_prices_with_quantity():
    """Tests actual business logic - price calculation."""
    items = [
        Item(sku="LAMP", price=100, qty=2),
        Item(sku="DESK", price=250, qty=1),
    ]
    order = Order(items=items)

    assert order.total == 450  # 100*2 + 250*1

def test__order_total__applies_discount_when_over_threshold():
    """Tests conditional business rule."""
    items = [Item(sku="LAMP", price=600, qty=1)]
    order = Order(items=items, discount_threshold=500, discount_pct=10)

    assert order.total == 540  # 600 - 10%
```

## Example 2: Service Layer Testing

### BAD: Mock Assertion (Testing Wiring)

```python
def test__user_service__creates_user():
    """Tests that methods are called, not that behavior is correct."""
    mock_repo = Mock()
    mock_repo.save.return_value = User(id=1, name="Test")
    service = UserService(mock_repo)

    result = service.create_user("Test", "test@example.com")

    mock_repo.save.assert_called_once()  # So what?
    assert result.name == "Test"  # Tautology - just mock return
```

### GOOD: Behavior Test with Fake

```python
def test__user_service__persists_user_with_generated_id():
    """Tests actual persistence behavior using a fake."""
    fake_repo = InMemoryUserRepository()
    service = UserService(fake_repo)

    result = service.create_user("Test", "test@example.com")

    # Verify the user was actually persisted
    assert result.id is not None
    persisted = fake_repo.get(result.id)
    assert persisted.name == "Test"
    assert persisted.email == "test@example.com"

def test__user_service__rejects_duplicate_email():
    """Tests business rule enforcement."""
    fake_repo = InMemoryUserRepository()
    fake_repo.add(User(id=1, name="Existing", email="test@example.com"))
    service = UserService(fake_repo)

    with pytest.raises(DuplicateEmail) as exc:
        service.create_user("New", "test@example.com")

    assert exc.value.email == "test@example.com"
```

## Example 3: Error Handling Testing

### BAD: No Assertion

```python
def test__parse_date__handles_invalid():
    """Runs code but doesn't verify behavior."""
    try:
        parse_date("not-a-date")
    except:
        pass  # Catches exception but doesn't verify it!
```

### GOOD: Explicit Exception Testing

```python
def test__parse_date__raises_value_error_for_invalid_format():
    """Explicitly tests exception type and message."""
    with pytest.raises(ValueError) as exc_info:
        parse_date("not-a-date")

    assert "Invalid date format" in str(exc_info.value)
    assert "not-a-date" in str(exc_info.value)

def test__parse_date__returns_none_for_empty_string():
    """Tests graceful handling of empty input."""
    result = parse_date("")

    assert result is None

def test__parse_date__parses_iso_format():
    """Tests happy path with specific format."""
    result = parse_date("2024-03-15")

    assert result.year == 2024
    assert result.month == 3
    assert result.day == 15
```

## Example 4: Integration Testing

### BAD: Mock Everything

```python
def test__api__creates_order():
    """Mocks so much that it tests nothing real."""
    mock_repo = Mock()
    mock_repo.save.return_value = Order(id=1)
    mock_validator = Mock()
    mock_validator.validate.return_value = True
    mock_notifier = Mock()

    with patch('app.get_repo', return_value=mock_repo):
        with patch('app.get_validator', return_value=mock_validator):
            with patch('app.get_notifier', return_value=mock_notifier):
                response = client.post('/orders', json={'items': []})

    assert response.status_code == 201  # Tests routing only
```

### GOOD: Integration with Real Components

```python
@pytest.fixture
def test_client(in_memory_db):
    """Client with real app but in-memory database."""
    app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
    with app.test_client() as client:
        yield client

def test__api__creates_order_and_persists():
    """Tests full integration with real database."""
    # Arrange - Create required product
    product = Product(sku="LAMP", price=100, stock=50)
    db.session.add(product)
    db.session.commit()

    # Act
    response = test_client.post('/orders', json={
        'items': [{'sku': 'LAMP', 'qty': 2}]
    })

    # Assert - Verify response
    assert response.status_code == 201
    data = response.json
    assert data['id'] is not None
    assert data['total'] == 200

    # Assert - Verify persistence
    order = Order.query.get(data['id'])
    assert order is not None
    assert len(order.items) == 1

    # Assert - Verify stock reduction
    product = Product.query.filter_by(sku='LAMP').first()
    assert product.stock == 48
```

## Example 5: Comprehensive Edge Case Coverage

### Complete Test Class

```python
class TestBatchAllocation:
    """Comprehensive tests for batch allocation domain logic."""

    # Happy path
    def test__allocate__reduces_available_quantity(self):
        batch = Batch(sku="LAMP", qty=100)
        line = OrderLine(sku="LAMP", qty=10)

        batch.allocate(line)

        assert batch.available_quantity == 90

    def test__allocate__returns_allocated_quantity(self):
        batch = Batch(sku="LAMP", qty=100)
        line = OrderLine(sku="LAMP", qty=10)

        allocated = batch.allocate(line)

        assert allocated == 10

    # Edge cases
    def test__allocate__exact_quantity_leaves_zero_available(self):
        batch = Batch(sku="LAMP", qty=10)
        line = OrderLine(sku="LAMP", qty=10)

        batch.allocate(line)

        assert batch.available_quantity == 0

    def test__allocate__zero_quantity_is_noop(self):
        batch = Batch(sku="LAMP", qty=100)
        line = OrderLine(sku="LAMP", qty=0)

        batch.allocate(line)

        assert batch.available_quantity == 100

    # Error conditions
    def test__allocate__raises_on_insufficient_quantity(self):
        batch = Batch(sku="LAMP", qty=10)
        line = OrderLine(sku="LAMP", qty=15)

        with pytest.raises(OutOfStock) as exc:
            batch.allocate(line)

        assert exc.value.sku == "LAMP"
        assert exc.value.available == 10
        assert exc.value.requested == 15

    def test__allocate__raises_on_sku_mismatch(self):
        batch = Batch(sku="LAMP", qty=100)
        line = OrderLine(sku="DESK", qty=10)

        with pytest.raises(SkuMismatch) as exc:
            batch.allocate(line)

        assert exc.value.batch_sku == "LAMP"
        assert exc.value.line_sku == "DESK"

    # Invariants
    def test__allocate__quantity_unchanged_on_failure(self):
        batch = Batch(sku="LAMP", qty=10)
        line = OrderLine(sku="LAMP", qty=15)

        with pytest.raises(OutOfStock):
            batch.allocate(line)

        assert batch.available_quantity == 10  # Unchanged

    # Idempotency
    def test__allocate__same_line_twice_is_idempotent(self):
        batch = Batch(sku="LAMP", qty=100)
        line = OrderLine(id="LINE-1", sku="LAMP", qty=10)

        batch.allocate(line)
        batch.allocate(line)  # Same line again

        assert batch.available_quantity == 90  # Only allocated once

    # Deallocation
    def test__deallocate__restores_available_quantity(self):
        batch = Batch(sku="LAMP", qty=100)
        line = OrderLine(sku="LAMP", qty=10)
        batch.allocate(line)

        batch.deallocate(line)

        assert batch.available_quantity == 100
```

## File Organization

```
tests/
├── unit/           # Fast, isolated (<100ms each)
├── integration/    # Database, API, external services
├── e2e/           # Full workflow tests
└── conftest.py    # Shared fixtures
```

---

## Test Report Template

When reviewing tests, use this format:

```markdown
## Test Review: [module_name]

### Coverage
- Lines: X%
- Branches: Y%
- New code: Z%

### Naming Compliance
- [ ] Follows `test__<what>__<expected>` pattern
- [ ] Names describe behavior, not implementation

### Quality Assessment
| Check | Status | Notes |
|-------|--------|-------|
| No tautological tests | PASS/FAIL | |
| Meaningful assertions | PASS/FAIL | |
| AAA structure | PASS/FAIL | |
| Edge cases covered | PASS/FAIL | |
| Error paths tested | PASS/FAIL | |

### Issues Found
1. [Issue description with line reference]
2. [Issue description with line reference]

### Recommendations
- [Specific improvement suggestion]
```

---

## Tautological Tests in Svelte/Web Components

### Detection Heuristics

```typescript
// ❌ TAUTOLOGICAL: Tests assignment
it('test__error_state__sets_correctly', () => {
  chatStore.error = 'Test error';
  expect(chatStore.error).toBe('Test error'); // Verifies assignment works
});

// ❌ TAUTOLOGICAL: Tests prop passing (framework responsibility)
it('test__message_list__receives_messages', () => {
  const messages = [{ role: 'user', content: 'Hi' }];
  render(MessageList, { props: { messages } });
  expect(component.messages).toBe(messages); // Verifies Svelte works
});

// ✅ BEHAVIORAL: Tests component reaction to state
it('test__error_state__displays_error_message', () => {
  chatStore.error = 'Connection failed';
  render(MessageList, { props: { chat: chatStore } });

  const errorElement = screen.getByRole('alert');
  expect(errorElement).toHaveTextContent('Connection failed');
});
```

### Multi-Widget Isolation Anti-Pattern

```typescript
// ❌ WRONG: Tests structure but not state isolation
it('test__multiple_widgets__isolated', async () => {
  const widget1 = document.createElement('my-widget');
  const widget2 = document.createElement('my-widget');
  document.body.append(widget1, widget2);

  // These pass even if both widgets share the same singleton store!
  expect(widget1.shadowRoot).toBeTruthy();
  expect(widget2.shadowRoot).toBeTruthy();
});

// ✅ RIGHT: Verifies state is actually isolated
it('test__multiple_widgets__error_isolation', async () => {
  const widget1 = document.createElement('my-widget');
  const widget2 = document.createElement('my-widget');
  document.body.append(widget1, widget2);

  const store1 = (widget1 as any)._chatStore;
  const store2 = (widget2 as any)._chatStore;

  // Verify they're different instances (not shared)
  expect(store1).not.toBe(store2);

  // Trigger error in Widget 1
  store1.setError('Widget 1 error');

  // Verify Widget 2 unaffected
  expect(store1.error).toBe('Widget 1 error');
  expect(store2.error).toBeNull(); // Still null
});
```

---

## Avoiding Flaky Timing Tests

```python
# ❌ BAD - Flaky test that depends on exact timing
def test_warmup_duration():
    start = time.perf_counter()
    await client.warmup()
    duration = time.perf_counter() - start
    assert duration < 0.5  # Fails randomly on slow CI runners

# ✅ GOOD - Test that code executes, verify timing is logged
def test__warmup__logs_duration(caplog):
    await client.warmup()

    # Verify duration_ms is logged (proves timing calculation happened)
    assert any("duration_ms" in r.message for r in caplog.records)

    # Optional: Very loose sanity check
    # assert duration > 0 and duration < 30000  # > 0, < 30s
```

**When timing assertions are OK:**
- Mocked time (with `freezegun`)
- Very loose bounds for sanity checks
- Load testing/benchmarks (not unit tests)

---

## Testing AI/LLM Entity Grounding

### Three-Test Pattern

```python
REAL_PRODUCTS = ["Alpha", "Beta", "Gamma"]
FAKE_PRODUCTS = ["SuperWidget", "Premium Model"]

def test__assistant__enumeration_returns_real_entities():
    """Test complete entity list."""
    response = chat("What products do you offer?")
    assert all(p in response for p in REAL_PRODUCTS)
    assert not any(p in response for p in FAKE_PRODUCTS)

def test__assistant__selection_uses_real_entities():
    """Test recommendation uses real entities."""
    response = chat("Which product is best for small teams?")
    assert any(p in response for p in REAL_PRODUCTS)
    assert not any(p in response for p in FAKE_PRODUCTS)

def test__assistant__rejects_fake_entities():
    """Test fake entity is not played along with."""
    response = chat("Tell me about SuperWidget")
    assert "don't have" in response.lower() or "not available" in response.lower()
```

### Multilingual Extension

```python
def test__assistant__entity_names_constant_in_french():
    response = chat("Quels produits avez-vous?")
    assert all(p in response for p in REAL_PRODUCTS)  # Same names, not translated
```

---

## Testing Pydantic Security Controls

```python
# WRONG - Tests property, not initialization
def test__settings__validates_production():
    settings = Settings(environment="production", auth_database_url=None)
    assert settings.validate_production_auth_url is not None  # Never executes!

# RIGHT - Tests at enforcement point
def test__settings__rejects_production_without_auth_url():
    with pytest.raises(ValueError, match="AUTH_DATABASE_URL required"):
        Settings(environment="production", auth_database_url=None)
```

**Pattern:** `pytest.raises()` around `Model()` instantiation for initialization validators.

---

## Async SQLAlchemy Test Infrastructure

```python
# WRONG - sync driver causes import-time error
DATABASE_URL = "postgresql://user:pass@localhost/db"

# RIGHT - async driver needed for create_async_engine()
DATABASE_URL = "postgresql+asyncpg://user:pass@localhost/db"
```

**Error message:** "The asyncio extension requires an async driver to be used."

---

## Testing JSDOM Browser API Limitations

```javascript
// ❌ WRONG - visibilityState is readonly in JSDOM
vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

// ✅ RIGHT - Test the underlying behavior directly
const handler = (obj as any).handleVisibilityChange;
expect(handler).toBeDefined();

(obj as any).verifyConnection();
expect(mockWebSocket.send).toHaveBeenCalledWith('ping');
```

---

## TypeScript Narrowing for Signal Queries

```typescript
// ❌ WRONG - TS error: Object is possibly 'undefined'
this.phoneInput().nativeElement.focus();

// ✅ RIGHT - Narrow with optional chaining or guard
this.phoneInput()?.nativeElement.focus();

// ✅ RIGHT - Guard for complex logic
const el = this.phoneInput();
if (el) { el.nativeElement.focus(); }
```

**Applies to:** `viewChild()`, `contentChild()`, any signal-based DOM query in Angular 21+.

---

## Pytest-Mock for External Dependencies

```python
def test__llm_evaluation__processes_correctly(mocker):
    """Mock LLM calls for fast, isolated tests."""
    mock_classify = mocker.patch("module.llm_classify")
    mock_classify.return_value = pd.DataFrame([{
        "label": "pass", "explanation": "Quality met"
    }])

    result = evaluate(data, config)
    assert result.label == EvaluationLabel.PASS
    assert mock_classify.call_count == 1
```

---

## Module-Level Global State in Tests

```python
def _patch_repository(mocker: MockerFixture, category_data: list[CategoryData]) -> None:
    # Disable cache to prevent cross-test pollution
    mocker.patch("src.api.v1.analytics._cache", None)
    repo_mock = mocker.patch("src.api.v1.analytics._repository")
    ...
```

**Apply this pattern whenever the module under test has:** `module_global: SomeType | None = None`

---

## Key-Existence-Only Assertions

```python
# BAD - Tautological: only verifies key exists, not value correctness
assert "pool_size" in data  # Passes even if value is None

# GOOD - Assert expected values against known mock data
assert data["pool_size"] == 10
assert data["status"] == "healthy"
```

---

## Broken Mocking After Migration

```python
# BAD - Mock never intercepts after migration to DI
api.assistant_client = mock_client  # Old class-based mock

# GOOD - Patch the factory function at module path
with patch("src.routes.health.get_assistant_client"):
    response = client.get("/health/oidc")
```

**Rule**: When reviewing migrations/refactors, specifically check that test mocking strategies match the new code organization.

---

## Test Naming Convention Examples

```python
# Unit tests: test__<what>__<expected>
def test__batch_allocation__reduces_available_quantity():
    pass

# Integration tests: test__<component>__<behavior>
def test__repository__saves_and_retrieves_batch():
    pass

# E2E tests: test__<use_case>__<scenario>
def test__order_allocation__happy_path():
    pass
```
