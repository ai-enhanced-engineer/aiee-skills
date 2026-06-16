# Domain-Driven Architecture Reference

## Domain Model Pattern (Deep Dive)

### Rich vs Anemic Domain Models

**Anemic Model (Anti-pattern)**:
- Data containers with getters/setters
- Business logic scattered in services
- Violates encapsulation

**Rich Domain Model (Preferred)**:
- Objects contain both data AND behavior
- Business rules enforced by the model itself
- Self-validating entities

### Entity Design Principles

1. **Identity Equality**: Entities are equal if they have the same ID, regardless of attributes
2. **Encapsulate State**: Use private attributes with methods to modify
3. **Validate Invariants**: Constructor should enforce valid state
4. **Express Domain Language**: Method names should match business terminology

### Value Objects

- Immutable (use `@dataclass(frozen=True)`)
- Equality based on all attributes
- No identity - two value objects with same data are interchangeable
- Can contain domain logic (e.g., `Money.add()`)

### Immutable Entity Updates

Use `@dataclass(frozen=True)` with `with_*` methods for controlled updates:

```python
from dataclasses import dataclass, replace
from datetime import datetime
from typing import Optional

@dataclass(frozen=True)
class UserEntity:
    id: UserId
    email: str
    password_hash: str
    last_login_at: Optional[datetime] = None

    def with_last_login(self, timestamp: datetime) -> "UserEntity":
        """Return new instance with updated last_login_at."""
        return replace(self, last_login_at=timestamp)

    def with_password(self, new_password_hash: str) -> "UserEntity":
        """Return new instance with updated password."""
        return replace(self, password_hash=new_password_hash)
```

**Benefits:**
- Prevents accidental mutations
- Clear intent in code (`user.with_last_login(now)`)
- Thread-safe by default
- Easy to test (no hidden state changes)

**Pattern Structure:**
- Entity declared with `frozen=True`
- Each mutable concern has a `with_{field}()` method
- Methods use `dataclasses.replace()` to create new instances
- New instance returned; original never modified

**Usage in Services:**
```python
# Service layer uses with_* methods
def record_login(self, db: DomainSession, user: UserEntity) -> UserEntity:
    updated_user = user.with_last_login(datetime.now(timezone.utc))
    return self.user_repo.update(db, updated_user)
```

## Repository Pattern (Deep Dive)

### Interface Design

The repository interface should:
- Use domain language, not database language
- Return domain objects, not database rows
- Accept domain objects for persistence
- Hide query complexity

### Abstract Base Class Pattern

```python
class AbstractRepository(ABC):
    @abstractmethod
    def add(self, entity: Entity) -> None:
        """Persist a new entity."""

    @abstractmethod
    def get(self, id: EntityId) -> Entity:
        """Retrieve entity by identity."""

    # Avoid: list() methods that return all entities
    # Prefer: specific query methods like find_by_status()
```

### Fake Repository for Testing

- In-memory implementation using sets/dicts
- Mirrors real repository behavior
- Enables fast, isolated unit tests
- No database setup required

## Service Layer Pattern (Deep Dive)

### Responsibilities

1. **Orchestration**: Coordinate domain objects and repositories
2. **Transaction Boundaries**: Start/commit/rollback
3. **Authorization**: Check permissions before operations
4. **Input Validation**: Validate DTOs before domain interaction

### What Does NOT Belong

- Business logic (belongs in domain)
- Data access logic (belongs in repository)
- HTTP/CLI concerns (belongs in entrypoints)

### Service Function vs Service Class

**Functions** (preferred for simple cases):
- Stateless
- Easy to test
- Clear dependencies via parameters

**Classes** (when needed):
- Multiple related operations
- Shared configuration
- Complex dependency injection

## Unit of Work Pattern (Deep Dive)

### Context Manager Implementation

The UoW should:
- Begin transaction on `__enter__`
- Provide access to repositories
- Commit on explicit `.commit()`
- Rollback on `__exit__` if not committed

### Benefits

1. **Atomicity**: All-or-nothing operations
2. **Consistency**: Single transaction boundary
3. **Testability**: Fake UoW for testing
4. **Explicit**: Developer controls when changes persist

## Aggregate Pattern (Deep Dive)

### Choosing Boundaries

Ask these questions:
1. What must be consistent together?
2. What is the smallest boundary that protects invariants?
3. What can be eventually consistent?

### Rules

1. **Root Entity**: Every aggregate has one root entity
2. **External References**: Other aggregates reference by ID only
3. **Single Transaction**: Only modify one aggregate per transaction
4. **Cascade Deletes**: Deleting root deletes all contained entities

### Version Numbers

Use version numbers for optimistic concurrency:
- Increment on each modification
- Check version before update
- Raise conflict error if changed

## Incremental Adoption

### Step 1: Start with Domain Model
- Move business logic into entity methods
- Create value objects for complex attributes
- Write unit tests for domain logic

### Step 2: Add Repository
- Create abstract interface
- Implement concrete repository
- Create fake for testing

### Step 3: Introduce Service Layer
- Extract orchestration from entrypoints
- Define use case functions
- Handle transactions

### Step 4: Add Unit of Work
- Wrap repository access
- Manage transaction lifecycle
- Enable atomic operations

## Aggregate Write Boundaries — Client Side

The aggregate pattern establishes a server-side transaction boundary: one Unit of Work, one aggregate, one commit. That boundary is undermined when the calling client splits the creation into multiple requests.

### Why Two Requests Break the Guarantee

A nested aggregate (parent root + child entities) created via two sequential requests produces three failure modes that the aggregate pattern is designed to prevent:

**Orphan failure**: The parent-create succeeds and the child-create fails. The parent row now exists in the database referencing no children. Domain invariants are violated — but no exception was raised at the transaction level because each request committed its own micro-transaction independently.

**Duplicate-on-retry**: The caller's retry logic re-issues the parent-create without checking whether the prior attempt committed. A second parent row appears. If the id is caller-generated, subsequent child-creates may write against the wrong id. If the id is server-generated, the caller has no way to know which parent id to use for the retried children.

**Race condition under concurrent callers**: Two callers attempting the same parent-create simultaneously may both succeed if no uniqueness constraint covers the business key, or may produce a constraint error that the caller did not anticipate because the endpoint contract implied idempotency.

### The Correct Pattern

The backend exposes a single nested-create endpoint that wraps the full aggregate creation in one transaction. The client issues one request; if any part fails, the entire transaction rolls back — no orphan, no partial state, no duplicate.

```python
# Two-request form (wrong)
parent = api.post("/widgets", {"name": "A"})       # committed independently
api.post("/widgets/{id}/parts", {"qty": 3})        # if this fails, parent is orphaned

# Nested-create form (correct)
api.post("/widgets", {"name": "A", "parts": [{"qty": 3}]})  # one transaction
```

### Before Assuming Separate Endpoints Are Required

Verify the contract:
- Grep the route handler for the resource (`grep -r "POST.*widgets" app/`)
- Check the request schema for a nested `parts` or `children` field
- `curl -s <base>/openapi.json | jq '.paths."/widgets".post.requestBody'`

If the nested-create endpoint exists but is undiscovered, using the two-request form is a client-side bug, not a missing backend feature.

### When a Retry Guard Appears

An id-guard (`if already_exists(id): skip`) on the retry path treats the symptom. The disease is the non-atomic split create. The guard:
- Does not remove the orphan row from a prior partial failure
- Does not handle the case where the parent id is server-generated and the caller doesn't know which to retry against
- Adds branching logic that must be tested and maintained

Replace the guard with the atomic endpoint. See `arch-decision-records` § "API Consumption Patterns" for the complementary client-side decision rule.
