# Event-Driven Architecture Examples

## Event and Command Examples

### Base Message Classes

```python
from dataclasses import dataclass


class Event:
    """Base class for domain events."""
    pass


class Command:
    """Base class for commands."""
    pass
```

### Domain Events

```python
@dataclass(frozen=True)
class Allocated(Event):
    """Emitted when an order line is allocated to a batch."""
    orderid: str
    sku: str
    qty: int
    batchref: str


@dataclass(frozen=True)
class OutOfStock(Event):
    """Emitted when allocation fails due to insufficient stock."""
    sku: str


@dataclass(frozen=True)
class BatchCreated(Event):
    """Emitted when a new batch is added to inventory."""
    ref: str
    sku: str
    qty: int
    eta: str | None = None
```

### Commands

```python
@dataclass(frozen=True)
class Allocate(Command):
    """Request to allocate an order line."""
    orderid: str
    sku: str
    qty: int


@dataclass(frozen=True)
class CreateBatch(Command):
    """Request to create a new batch."""
    ref: str
    sku: str
    qty: int
    eta: str | None = None


@dataclass(frozen=True)
class ChangeBatchQuantity(Command):
    """Request to adjust batch quantity."""
    ref: str
    qty: int
```

## Aggregate with Event Collection

```python
class Product:
    """Aggregate root that collects domain events."""

    def __init__(self, sku: str, batches: list[Batch], version: int = 0):
        self.sku = sku
        self.batches = batches
        self.version = version
        self.events: list[Event] = []  # Event collection

    def allocate(self, line: OrderLine) -> str:
        try:
            batch = next(
                b for b in sorted(self.batches)
                if b.can_allocate(line)
            )
            batch.allocate(line)
            self.version += 1
            # Emit event on successful allocation
            self.events.append(
                Allocated(line.orderid, line.sku, line.qty, batch.reference)
            )
            return batch.reference
        except StopIteration:
            # Emit event on failure
            self.events.append(OutOfStock(line.sku))
            raise OutOfStockError(f"Out of stock for sku {line.sku}")

    def change_batch_quantity(self, ref: str, qty: int):
        batch = next(b for b in self.batches if b.reference == ref)
        batch._purchased_quantity = qty
        while batch.available_quantity < 0:
            line = batch.deallocate_one()
            # Emit event for each deallocated line
            self.events.append(
                Deallocated(line.orderid, line.sku, line.qty)
            )
```

## Message Bus Implementation

```python
from typing import Callable, Union
from collections import deque

Message = Union[Command, Event]


class MessageBus:
    def __init__(
        self,
        uow: AbstractUnitOfWork,
        event_handlers: dict[type[Event], list[Callable]],
        command_handlers: dict[type[Command], Callable],
    ):
        self.uow = uow
        self.event_handlers = event_handlers
        self.command_handlers = command_handlers

    def handle(self, message: Message):
        results = []
        queue = deque([message])

        while queue:
            message = queue.popleft()
            if isinstance(message, Event):
                self._handle_event(message, queue)
            elif isinstance(message, Command):
                result = self._handle_command(message, queue)
                results.append(result)

        return results

    def _handle_event(self, event: Event, queue: deque):
        for handler in self.event_handlers.get(type(event), []):
            try:
                handler(event)
                queue.extend(self.uow.collect_new_events())
            except Exception:
                # Log and continue - events don't fail the whole operation
                continue

    def _handle_command(self, command: Command, queue: deque):
        handler = self.command_handlers[type(command)]
        result = handler(command)
        queue.extend(self.uow.collect_new_events())
        return result
```

### Handler Registration

```python
EVENT_HANDLERS: dict[type[Event], list[Callable]] = {
    OutOfStock: [handlers.send_out_of_stock_notification],
    Allocated: [handlers.publish_allocated_event, handlers.add_allocation_to_read_model],
}

COMMAND_HANDLERS: dict[type[Command], Callable] = {
    Allocate: handlers.allocate,
    CreateBatch: handlers.add_batch,
    ChangeBatchQuantity: handlers.change_batch_quantity,
}
```

## Command and Event Handlers

### Command Handler

```python
def allocate(cmd: Allocate, uow: AbstractUnitOfWork) -> str:
    """Command handler - returns result, raises on failure."""
    line = OrderLine(cmd.orderid, cmd.sku, cmd.qty)

    with uow:
        product = uow.products.get(sku=cmd.sku)
        if product is None:
            raise InvalidSku(f"Invalid sku {cmd.sku}")

        batchref = product.allocate(line)
        uow.commit()

    return batchref


def add_batch(cmd: CreateBatch, uow: AbstractUnitOfWork):
    """Command handler for creating a batch."""
    with uow:
        product = uow.products.get(sku=cmd.sku)
        if product is None:
            product = Product(sku=cmd.sku, batches=[])
            uow.products.add(product)

        product.batches.append(Batch(cmd.ref, cmd.sku, cmd.qty, cmd.eta))
        uow.commit()
```

### Event Handler

```python
def send_out_of_stock_notification(event: OutOfStock, uow: AbstractUnitOfWork):
    """Event handler - side effect, failures don't propagate."""
    email.send(
        to="stock@example.com",
        subject=f"Out of stock: {event.sku}",
        body=f"The SKU {event.sku} is out of stock.",
    )


def publish_allocated_event(event: Allocated, uow: AbstractUnitOfWork):
    """Event handler - publish to external message broker."""
    redis_client.publish("allocated", json.dumps(asdict(event)))
```

## Unit of Work with Event Collection

```python
class AbstractUnitOfWork(ABC):
    products: AbstractProductRepository

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.rollback()

    def collect_new_events(self):
        """Yield events from all seen aggregates."""
        for product in self.products.seen:
            while product.events:
                yield product.events.pop(0)

    @abstractmethod
    def commit(self):
        raise NotImplementedError

    @abstractmethod
    def rollback(self):
        raise NotImplementedError


class TrackingRepository(AbstractProductRepository):
    """Repository that tracks seen aggregates for event collection."""

    def __init__(self, session: Session):
        self.session = session
        self.seen: set[Product] = set()

    def add(self, product: Product):
        self.seen.add(product)
        self.session.add(product)

    def get(self, sku: str) -> Product | None:
        product = self.session.query(Product).filter_by(sku=sku).first()
        if product:
            self.seen.add(product)
        return product
```

## CQRS Examples

### Query Service (Read Side)

```python
from sqlalchemy import text


def allocations_view(orderid: str, uow: AbstractUnitOfWork) -> list[dict]:
    """Read model query - bypasses domain model entirely."""
    with uow:
        results = uow.session.execute(
            text("SELECT sku, batchref FROM allocations_view WHERE orderid = :orderid"),
            {"orderid": orderid},
        )
        return [{"sku": row.sku, "batchref": row.batchref} for row in results]


def stock_view(sku: str, uow: AbstractUnitOfWork) -> dict:
    """Read model for current stock levels."""
    with uow:
        result = uow.session.execute(
            text("SELECT sku, available_qty FROM stock_view WHERE sku = :sku"),
            {"sku": sku},
        ).first()
        return {"sku": result.sku, "available": result.available_qty} if result else None
```

### Event Handler Updating Read Model

```python
def add_allocation_to_read_model(event: Allocated, uow: AbstractUnitOfWork):
    """Event handler that maintains denormalized read model."""
    with uow:
        uow.session.execute(
            text(
                "INSERT INTO allocations_view (orderid, sku, batchref) "
                "VALUES (:orderid, :sku, :batchref)"
            ),
            {"orderid": event.orderid, "sku": event.sku, "batchref": event.batchref},
        )
        uow.commit()


def remove_allocation_from_read_model(event: Deallocated, uow: AbstractUnitOfWork):
    """Update read model when allocation is removed."""
    with uow:
        uow.session.execute(
            text(
                "DELETE FROM allocations_view "
                "WHERE orderid = :orderid AND sku = :sku"
            ),
            {"orderid": event.orderid, "sku": event.sku},
        )
        uow.commit()
```

## Bootstrap Example

```python
from functools import partial


def bootstrap(
    start_orm: bool = True,
    uow: AbstractUnitOfWork | None = None,
    send_mail: Callable | None = None,
    publish: Callable | None = None,
) -> MessageBus:
    """Composition root - wire all dependencies."""
    if start_orm:
        orm.start_mappers()

    # Use provided dependencies or defaults
    uow = uow or SqlAlchemyUnitOfWork()
    send_mail = send_mail or email.send
    publish = publish or redis_eventpublisher.publish

    # Inject dependencies into handlers
    injected_event_handlers = {
        OutOfStock: [partial(handlers.send_out_of_stock_notification, send_mail=send_mail)],
        Allocated: [partial(handlers.publish_allocated_event, publish=publish)],
    }

    injected_command_handlers = {
        Allocate: partial(handlers.allocate, uow=uow),
        CreateBatch: partial(handlers.add_batch, uow=uow),
    }

    return MessageBus(
        uow=uow,
        event_handlers=injected_event_handlers,
        command_handlers=injected_command_handlers,
    )
```

### Test Configuration with Bootstrap

```python
def test__allocate__happy_path():
    """Test using bootstrap with fakes."""
    uow = FakeUnitOfWork()
    uow.products.add(Product("LAMP", [Batch("b1", "LAMP", 100)]))

    bus = bootstrap(start_orm=False, uow=uow)

    bus.handle(Allocate("o1", "LAMP", 10))

    assert uow.products.get("LAMP").batches[0].available_quantity == 90


def test__out_of_stock__sends_notification():
    """Test event handler is triggered."""
    uow = FakeUnitOfWork()
    uow.products.add(Product("LAMP", [Batch("b1", "LAMP", 5)]))

    notifications = []
    fake_send_mail = lambda **kwargs: notifications.append(kwargs)

    bus = bootstrap(start_orm=False, uow=uow, send_mail=fake_send_mail)

    bus.handle(Allocate("o1", "LAMP", 10))  # More than available

    assert len(notifications) == 1
    assert "LAMP" in notifications[0]["subject"]
```

## External Event Consumer Example

```python
import json
import redis


def main():
    """Entry point for external event consumer."""
    bus = bootstrap()
    pubsub = redis.Redis().pubsub()
    pubsub.subscribe("batch_quantity_changed")

    for message in pubsub.listen():
        if message["type"] == "message":
            data = json.loads(message["data"])
            cmd = ChangeBatchQuantity(ref=data["ref"], qty=data["qty"])
            bus.handle(cmd)
```
