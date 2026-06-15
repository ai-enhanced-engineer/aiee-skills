# Azure Service Bus Messaging — Reference

Full pattern catalogue for `azure-servicebus` 7.14+ async producers and consumers. Companion to `examples.md`.

## Service Bus vs. Kafka — decision callout

Brief decision matrix (Kafka is out of scope for this skill — `example-bus` is Service Bus only):

| Choose Azure Service Bus when... | Choose Kafka when... |
|---|---|
| Built-in DLQ, sessions (FIFO), scheduled delivery, transactions matter | Million-events/sec throughput, partitioned parallelism |
| Moderate volume (thousands/min), enterprise integration patterns | Long-term event log, consumer-group replay via offsets |
| At-most-once / at-least-once with low operational overhead | Fan-out to many independent consumer groups |

For deeper trade-offs see `arch-events`.

## ServiceBusClient instantiation

Two authentication paths:

```python
# Path A — connection string (dev/test only; SAS key embedded)
from azure.servicebus.aio import ServiceBusClient
client = ServiceBusClient.from_connection_string(conn_str)

# Path B — Managed Identity / DefaultAzureCredential (production)
from azure.identity.aio import DefaultAzureCredential
credential = DefaultAzureCredential()  # singleton — once per process
client = ServiceBusClient(
    fully_qualified_namespace="myns.servicebus.windows.net",
    credential=credential,
    logging_enable=True,
)
```

**Critical notes**:
- `fully_qualified_namespace` is `<ns>.servicebus.windows.net`, not just the namespace name
- `ServiceBusClient`, `ServiceBusSender`, `ServiceBusReceiver` are **not coroutine-safe** — do not share across concurrent tasks without an explicit `asyncio.Lock`
- A client opened without `async with` must be `await client.close()`-d at shutdown
- 10-minute idle AMQP link closure is enforced server-side; the SDK reconnects transparently

## Producer lifecycle

Persistent client + short-lived sender context:

```python
async with client.get_queue_sender(queue_name) as sender:
    msg = ServiceBusMessage(
        body=json.dumps(body),
        content_type="application/json",
        correlation_id=transaction_id,
        application_properties={"dt-trace-id": trace_id},
        # time_to_live=timedelta(hours=24),
        # scheduled_enqueue_time_utc=future_dt,
    )
    await sender.send_messages(msg)
```

Batch send for high-throughput:

```python
async with client.get_queue_sender(queue_name) as sender:
    batch = await sender.create_message_batch()
    for payload in payloads:
        batch.add_message(ServiceBusMessage(json.dumps(payload)))
    await sender.send_messages(batch)
```

**`ServiceBusMessage` properties**:
- `body`: `str | bytes | list[bytes]`
- `content_type`: MIME (use `"application/json"`)
- `correlation_id`: ties message to a transaction
- `message_id`: auto-UUID; set deterministically for message-level idempotency
- `application_properties`: dict of primitive headers; visible to broker filters without body deserialization
- `time_to_live`: per-message TTL override
- `scheduled_enqueue_time_utc`: delayed delivery without external infra

## Consumer lifecycle

```python
async with client.get_queue_receiver(
    queue_name=queue_name,
    max_wait_time=5,                   # seconds before receive_messages returns []
    # receive_mode=ServiceBusReceiveMode.PEEK_LOCK,  # default — DLQ-safe
) as receiver:
    messages = await receiver.receive_messages(
        max_message_count=1,
        max_wait_time=5,
    )
    for msg in messages:
        await process(msg)
        await receiver.complete_message(msg)
```

**Settlement methods** (PEEK_LOCK only):

| Method | Effect |
|---|---|
| `complete_message(msg)` | Remove from queue — success |
| `abandon_message(msg)` | Return to queue immediately; increments `delivery_count` |
| `dead_letter_message(msg, reason=..., error_description=...)` | Move to DLQ — unrecoverable |
| `defer_message(msg)` | Park; retrieve later via `receive_deferred_messages()` |

**`RECEIVE_AND_DELETE` caveat**: message removed from queue on receipt — no settlement, no DLQ. Use only for fire-and-forget where loss is acceptable.

## AutoLockRenewer

Queue lock duration is configurable (typically 30s–5min). Handlers that exceed lock duration lose the lock; `complete_message` then raises `MessageLockLostError`.

**Constructor + register**:

```python
from azure.servicebus.aio import AutoLockRenewer

AutoLockRenewer(
    max_lock_renewal_duration=300,         # 5 min default
    on_lock_renew_failure=async_callback,  # (renewable, exc) -> None
)

renewer.register(
    receiver,
    msg,
    max_lock_renewal_duration=120,  # per-message override
    on_lock_renew_failure=cb,
)
```

**Recommended pattern** (one renewer per consumer lifecycle, register per message):

```python
async with AutoLockRenewer() as renewer:
    async with client.get_queue_receiver(queue_name) as receiver:
        for msg in await receiver.receive_messages():
            renewer.register(receiver, msg, max_lock_renewal_duration=300)
            await process(msg)
            await receiver.complete_message(msg)
```

**Failure modes**:
- `AutoLockRenewFailed` — renewal attempt failed (closed receiver / network error)
- `AutoLockRenewTimeout` — `max_lock_renewal_duration` elapsed before settlement
- Observable via `msg.auto_renew_error` or the `on_lock_renew_failure` callback
- Subsequent `complete_message` raises `MessageLockLostError` if renewal fails

## Dead-letter queue

DLQ is a built-in subqueue. The DLQ for queue `orders` is `orders/$deadletterqueue` — no separate creation needed.

**Automatic DLQ triggers**:
- `MaxDeliveryCountExceeded` — delivery count exceeds queue's `MaxDeliveryCount` (default **10**); each abandon or expired lock increments
- `TTLExpiredException` — message TTL elapsed
- `HeaderSizeExceeded` — frame quota breached

**Explicit application-level DLQ** (recommended):

```python
await receiver.dead_letter_message(
    msg,
    reason="ValidationFailed",                          # short code; stored as property
    error_description=f"{type(exc).__name__}: {exc}",   # truncate long traces (256KB Standard tier limit)
)
```

**Reading from the DLQ subqueue**:

```python
from azure.servicebus import ServiceBusSubQueue

async with client.get_queue_receiver(
    queue_name="orders",
    sub_queue=ServiceBusSubQueue.DEAD_LETTER,
) as dlq:
    async for msg in dlq:
        # inspect, resubmit, or discard
        await dlq.complete_message(msg)
```

**Retry-then-DLQ** (transient vs. unrecoverable):

```python
MAX_APP_RETRIES = 3

try:
    await process(msg)
    await receiver.complete_message(msg)
except TransientError:
    if msg.delivery_count >= MAX_APP_RETRIES:
        await receiver.dead_letter_message(
            msg, reason="MaxRetriesExceeded",
            error_description=traceback.format_exc()[:2000],
        )
    else:
        await receiver.abandon_message(msg)
except PoisonMessageError as exc:
    await receiver.dead_letter_message(
        msg, reason=type(exc).__name__, error_description=str(exc),
    )
```

## Idempotency: message-level vs. state-machine

| Dimension | State-machine (DB status) | Message-level key (`message_id`) |
|---|---|---|
| Where dedup lives | Application DB (e.g., MongoDB) | Broker dedup window or external store (Redis) |
| Granularity | Per business entity state | Per message delivery |
| Concurrent workers | Optimistic lock on status transition | Needs external store anyway |
| Visible to other services | No — opaque | Yes — `message_id` readable by any consumer |
| DLQ-safe | Status persists; retry picks up cleanly | Key must survive DLQ round-trip |
| Coupling | DB schema ↔ processing logic | Broker schema ↔ idempotency contract |

**State-machine pattern** (project approach):

```
1. _is_already_published(doc_id)
   → if status == PUBLISHED: return True   # short-circuit
2. _try_transition(doc_id, prior_state → WAITING_FOR_PUBLISH)
   → update_one(filter={status: prior_state}, update={status: WAITING})
   → if modified_count == 0: raise   # another worker won
3. publish events
4. update status → PUBLISHED  (or → FAILED on exception)
```

**Crash-window gap**: if the process dies between step 2 and step 4, status sits at `WAITING_FOR_PUBLISH` indefinitely. Service Bus will redeliver, but step 2 will fail (status no longer matches the expected prior state). Mitigation: a janitor that resets stale `WAITING_FOR_PUBLISH` documents back to `prior_state` after a timeout, or a step-1 check that treats `WAITING_FOR_PUBLISH` older than N minutes as retriable.

## Pydantic event schemas per queue

Layered hierarchy (project pattern):

```
EventMetadataPayload(eventType, timestamp)        # added on every send
DefaultEventPayload(transactionId, tenantId)        # base for all events
  └── EventCreateDocumentProcessingPayload(documentId, blob, filename)
  └── EventCreateDocPayload(documentId, pageIds)
       ├── EventCreateExtractPayload
       └── EventCreateValidationPayload
  └── EventCreateRecordPayload(documentId)
```

The producer merges metadata + default + main payload into the `ServiceBusMessage.body` JSON. Consumers parse the full body to access `eventType`.

**Trade-offs**:
- `eventType` in body (current): simple, requires JSON parse before routing
- `eventType` in `application_properties`: brokers/SDK filters can route on headers without deserialization — valuable when multiple consumers share a queue
- **Schema versioning gap**: add `schemaVersion: str = "1.0"` to `EventMetadataPayload` to enable non-breaking evolution without coordinated consumer deploys

## Graceful shutdown

Signal-driven flag pattern:

```python
import asyncio, signal

class SignalHandler:
    def __init__(self):
        self.shutdown_flag = False

    def register_handlers(self):
        loop = asyncio.get_event_loop()
        loop.add_signal_handler(signal.SIGTERM, self._shutdown)
        loop.add_signal_handler(signal.SIGINT, self._shutdown)

    def _shutdown(self):
        self.shutdown_flag = True
```

Shutdown sequence:
1. Signal → `shutdown_flag = True`
2. Outer `while not shutdown_flag` exits at next loop iteration
3. In-flight messages finish; new messages are not fetched
4. `AutoLockRenewer` context exits → registered renewals cancelled
5. Receiver context exits → AMQP link closed cleanly
6. Process-level `await client.close()` and `await credential.close()`

**Drain gap**: if processing is dispatched via `asyncio.create_task` (project pattern), tasks not yet awaited may be cancelled mid-flight when the event loop exits. For at-most-once on shutdown, track outstanding tasks and `await asyncio.gather(*tasks, return_exceptions=True)` before closing the receiver. Otherwise the message lock will expire and Service Bus redelivers — which is fine for at-least-once semantics with state-machine idempotency.

## Anti-patterns deep dive

| Anti-pattern | Failure mode | Fix |
|---|---|---|
| Per-send `DefaultAzureCredential()` | Credential chain walked on every message; AMQP reconnect; latency spike | Singleton credential at lifespan startup; `set_credential()` injection |
| Temp `ServiceBusClient` per send | AMQP connection churn; rate-limit risk | Persistent client; short-lived `get_queue_sender` context inside |
| No explicit DLQ | DLQ entries reason `MaxDeliveryCountExceeded` with no context | `dead_letter_message(msg, reason=type(exc).__name__, error_description=traceback[:2000])` |
| Settle before processing | Crash mid-handler → message gone, no retry | Settle only after all side effects confirm |
| Missing `AutoLockRenewer` on long handlers | `MessageLockLostError` on `complete_message` | One renewer per consumer; register every message with worst-case `max_lock_renewal_duration` |
| Sync I/O in async consumer | Event loop blocked; lock renewal stalls | `await asyncio.to_thread(sync_fn, ...)`; never mix `azure.servicebus` (sync) inside `async def` |
| `RECEIVE_AND_DELETE` for non-idempotent handlers | Crash before processing → silent loss | `PEEK_LOCK` (default) + explicit settlement |
| Long `error_description` strings | Message body exceeds 256KB Standard tier quota | Truncate `traceback.format_exc()[:2000]` |
| `eventType` only in body | Multi-consumer routing requires JSON parse | Mirror `eventType` into `application_properties` for header-based filters |
| No schema version field | Breaking changes require lock-step deploy | `schemaVersion: str = "1.0"` on metadata payload |
