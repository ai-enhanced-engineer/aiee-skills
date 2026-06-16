# Event-Driven Architecture Reference

## Domain Events (Deep Dive)

### What is a Domain Event?

A domain event is an immutable record of something that happened in the business domain. Events are facts - they describe what occurred, not what should happen.

### Event Design Principles

1. **Past Tense Naming**: `OrderAllocated`, `OutOfStock`, `BatchCreated`
2. **Immutable**: Use `@dataclass(frozen=True)`
3. **Self-Contained**: Include all relevant context
4. **Domain Language**: Use ubiquitous language from the business

### Aggregate Event Collection

Aggregates collect events during their operations. The Unit of Work then publishes these events after commit:

```python
class Product:
    def __init__(self, sku: str):
        self.sku = sku
        self.events: list[Event] = []  # Collect events here

    def allocate(self, line: OrderLine) -> str:
        batch = self._find_batch(line)
        if batch is None:
            self.events.append(OutOfStock(self.sku))  # Record event
            raise CannotAllocate()
        batch.allocate(line)
        self.events.append(Allocated(line.orderid, self.sku, batch.reference))
        return batch.reference
```

### UoW Event Publishing

The Unit of Work collects events from all touched aggregates:

```python
class AbstractUnitOfWork:
    def collect_new_events(self):
        for product in self.products.seen:
            while product.events:
                yield product.events.pop(0)
```

## Message Bus (Deep Dive)

### Purpose

The message bus is a central routing mechanism that:
- Receives commands and events
- Routes them to appropriate handlers
- Processes handler-generated events (chaining)

### Handler Registration

Handlers are registered in dictionaries, separated by message type:

```python
EVENT_HANDLERS: dict[type[Event], list[Callable]] = {
    OutOfStock: [send_out_of_stock_notification],
    Allocated: [publish_allocated_event],
}

COMMAND_HANDLERS: dict[type[Command], Callable] = {
    Allocate: handlers.allocate,
    CreateBatch: handlers.add_batch,
}
```

### Event Queue Processing

The bus processes events until the queue is empty:

```python
def handle(message: Message, uow: AbstractUnitOfWork):
    queue = [message]
    while queue:
        message = queue.pop(0)
        if isinstance(message, Event):
            handle_event(message, queue, uow)
        elif isinstance(message, Command):
            handle_command(message, uow)
        queue.extend(uow.collect_new_events())
```

### Error Handling

- **Commands**: Fail fast, raise exceptions
- **Events**: Continue processing other handlers if one fails

## Commands vs Events (Deep Dive)

| Aspect | Command | Event |
|--------|---------|-------|
| **Intent** | "Please do this" | "This happened" |
| **Naming** | Imperative (`Allocate`) | Past tense (`Allocated`) |
| **Handlers** | Exactly one | Zero or more |
| **Failure** | Raises exception | Handler fails independently |

### When to Use Each

**Commands**: User actions, operations needing results, actions that can fail

**Events**: State change notifications, side effects, decoupling, eventual consistency

## CQRS (Deep Dive)

### The Problem

Complex domain models optimized for writes make queries slow. CQRS separates these concerns.

### Write Side (Command Model)

Full domain model with rich behavior, validation, and transactional consistency.

### Read Side (Query Model)

Denormalized views optimized for fast retrieval, specific UI needs, and caching.

### Keeping Read Models Updated

Event handlers update read models when state changes:

```python
def update_allocations_view(event: Allocated, uow: AbstractUnitOfWork):
    with uow:
        uow.session.execute(
            text("INSERT INTO allocations_view VALUES (:orderid, :sku, :batchref)"),
            {"orderid": event.orderid, "sku": event.sku, "batchref": event.batchref}
        )
        uow.commit()
```

## Bootstrap Pattern (Deep Dive)

### The Composition Root

The bootstrap function is where dependencies are created, handlers wired, and configuration loaded.

### Manual Dependency Injection

Use `functools.partial` to inject dependencies:

```python
def bootstrap(
    start_orm: bool = True,
    uow: AbstractUnitOfWork = None,
) -> MessageBus:
    if start_orm:
        orm.start_mappers()

    uow = uow or SqlAlchemyUnitOfWork()

    injected_handlers = {
        Allocate: partial(handlers.allocate, uow=uow),
    }

    return MessageBus(injected_handlers)
```

### Test Configuration

```python
def test_allocation():
    bus = bootstrap(start_orm=False, uow=FakeUnitOfWork())
    # Test with fakes
```

## Validation Patterns

### Three Layers

1. **Syntax**: Is message well-formed? (Message classes, API edges)
2. **Semantic**: Does it make sense? (Service layer - SKU exists?)
3. **Pragmatic**: Can we do it? (Domain - sufficient stock?)

### Tolerant Reader

Accept input variations - extract only needed fields, ignore extras.
