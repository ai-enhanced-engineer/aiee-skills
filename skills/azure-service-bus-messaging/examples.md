# Azure Service Bus Messaging — Examples


---

## 1. Producer — `ExampleBus.send_message` and the per-send credential anti-pattern


The `ExampleBus` class supports two paths: a **persistent client** (correct production path) and a **temporary client + temporary credential** fallback (anti-pattern, kept for callers that never `set_client()`).

### 1a. Persistent client path — recommended

```python
# example_bus/__init__.py
if self._client:
    log.debug("Sending message using persistent client", extra={...})
    async with self._client.get_queue_sender(queue) as sender:
        await sender.send_messages(single_message)
```

The persistent client (`self._client`) is a `ServiceBusClient` opened once at lifespan startup and injected via `set_client()`. The `get_queue_sender` context is short-lived — opens an AMQP sender link, sends, closes the link. The shared client + shared credential are reused across every message in the process.

### 1b. Anti-pattern — temporary credential + temporary client per send

```python
# example_bus/__init__.py — anti-pattern (kept for example-api callers)
else:
    credential = self._credential
    should_close_credential = False
    if credential is None:
        log.warning(
            "Sending message without a persistent client and no shared credential. "
            "Creating temporary DefaultAzureCredential.",
            extra={"queue": queue, "transactionId": transaction_id},
        )
        credential = DefaultAzureCredential()      # ← chain walk on every send
        should_close_credential = True

    try:
        async with ServiceBusClient(                # ← AMQP reconnect on every send
            fully_qualified_namespace=self.fully_qualified_namespace,
            credential=credential,
            logging_enable=True,
        ) as sender_client:
            async with sender_client.get_queue_sender(queue) as sender:
                await sender.send_messages(single_message)
    finally:
        if should_close_credential:
            await credential.close()
```

**Why this hurts**: every call constructs a `DefaultAzureCredential` (walks env → workload identity → managed identity → CLI), opens a new AMQP connection, sends one message, tears it all down. Under load this dominates latency and can exhaust Azure AD token endpoints.

**Fix**: at app startup (FastAPI `lifespan`), create one credential and one client; inject via `set_client()`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    credential = DefaultAzureCredential()
    client = ServiceBusClient(
        fully_qualified_namespace=settings.SB_NAMESPACE,
        credential=credential,
    )
    example_bus = ExampleBus(fully_qualified_namespace=settings.SB_NAMESPACE)
    example_bus.set_credential(credential)
    example_bus.set_client(client)
    app.state.example_bus = example_bus
    yield
    await client.close()
    await credential.close()
```

### 1c. Message body merging

```python
# example_bus/__init__.py
meta_payload = EventMetadataPayload(
    eventType=event_type,
    timestamp=datetime.now(UTC),
)
default_payload = DefaultEventPayload(
    transactionId=transaction_id,
    tenantId=payload.tenantId,
)
body = {
    **json.loads(json.dumps(meta_payload.model_dump(mode="json"))),
    **json.loads(json.dumps(default_payload.model_dump())),
    **json.loads(json.dumps(payload.__dict__)),
}
single_message = ServiceBusMessage(
    body=json.dumps(body),
    correlationId=transaction_id,
    contentType="application/json",
    application_properties={
        kwargs.get("dynatrace_tag_name", "dt-trace-id"): kwargs.get("dynatrace_tag", ""),
    },
)
```

`eventType` and `timestamp` are merged into the body (not headers). Consumers parse the full JSON body to route. For multi-consumer routing, mirror `eventType` into `application_properties` so broker filters can match without deserializing.

> **Cleanup opportunity**: the `**json.loads(json.dumps(meta_payload.model_dump(mode="json")))` pattern on line 88 is a redundant serialization round-trip — `model_dump(mode="json")` already returns JSON-safe primitives. The simpler form is `**meta_payload.model_dump(mode="json")`. Lines 89 and 90 retain the round-trip because they call `model_dump()` (no `mode="json"`) and `payload.__dict__`, which may contain non-JSON-safe types (datetime, UUID); the round-trip coerces them. Migrating those to `model_dump(mode="json")` would let all three lines drop the round-trip uniformly.

---

## 2. Pydantic event schema hierarchy


```python
# schemas.py
class EventType(Enum):
    EVENT_DOCUMENT_UPLOADED = "document_uploaded"
    EVENT_DOCUMENT_PROCESSED = "document_processed"
    EVENT_DOCUMENT_VALIDATION = "document_validated"
    EVENT_RECORD_CREATION = "order_created"

# schemas.py — added on every send by ExampleBus.send_message
class EventMetadataPayload(BaseModel):
    eventType: EventType = Field(description="The type of the event.")
    timestamp: datetime = Field(description="The timestamp of the event.")

# schemas.py — base for all event subtypes
class DefaultEventPayload(BaseModel):
    transactionId: str = Field(description="The ID of the transaction.")
    tenantId: str = Field(description="The ID of the tenant.")

# schemas.py — processing queue
class EventCreateDocumentProcessingPayload(DefaultEventPayload):
    documentId: str = Field(description=DOCUMENT_ID_DESCRIPTION)
    blob: str = Field(description="The full blob path where the document is stored.")
    filename: str = Field(description="The name of the document file.")

# schemas.py — stage_parse + document_validation queues
class EventCreateDocPayload(DefaultEventPayload):
    documentId: str
    pageIds: list[str]

class EventCreateExtractPayload(EventCreateDocPayload): ...
class EventCreateValidationPayload(EventCreateDocPayload): ...

# schemas.py — create_order queue
class EventCreateRecordPayload(DefaultEventPayload):
    documentId: str = Field(description=DOCUMENT_ID_DESCRIPTION)
```

**Pattern**: each queue has its own payload subtype on `DefaultEventPayload`. Shared fields (`transactionId`, `tenantId`) live on the base; metadata (`eventType`, `timestamp`) is added by the producer at send time. The producer and consumer packages share this module — adding a field is a one-place change.

**Improvement**: add `schemaVersion: str = "1.0"` to `EventMetadataPayload` for non-breaking evolution.

---

## 3. Consumer lifecycle with AutoLockRenewer


### 3a. Outer loop — one renewer per consumer lifecycle

```python
# service_bus_consumer.py
self.signal_handler.register_handlers()
try:
    while not self.signal_handler.shutdown_flag:
        try:
            async with AutoLockRenewer() as lock_renewal:                  # ← one renewer
                async with self.servicebus_client.get_queue_receiver(
                    queue_name=self.queue_name,
                    max_wait_time=self.max_wait_time,
                ) as receiver:
                    self.signal_handler.process_running = True
                    await self._process_message_loop(receiver, lock_renewal)
        except ServiceBusConnectionError:
            # ... reconnect logic with backoff
```

**Pattern**: one `AutoLockRenewer()` per consumer lifecycle (the outer `async with`). The renewer is then passed into `_process_message_loop` and used to register each message individually. On `ServiceBusConnectionError`, the receiver and renewer contexts unwind cleanly and a new pair is created — the SDK does not auto-reconnect across this kind of failure.

### 3b. Per-message registration via background task

```python
# service_bus_consumer.py
process_task = asyncio.create_task(
    process_message(message, self.credential, start_time, self.queue_name, self.debug),
    name=f"process_message_{message.message_id}",
)
process_task.add_done_callback(
    lambda future: asyncio.ensure_future(handle_process_result(future, receiver))
)
lock_task = asyncio.create_task(  # noqa RUF006
    lock_renew_task(
        lock_renewal=lock_renewal,
        message=message,
        receiver=receiver,
    ),
    name=f"lock_renew_task_{message.message_id}",
)
```

**Pattern**: `process_task` does the work; `handle_process_result` settles the message in the done-callback; `lock_task` keeps the lock alive in parallel.

**Refinement**: `lock_task` is fire-and-forget (`# noqa RUF006`). It runs until `AutoLockRenewer.close()` is called (when the outer context exits). Cleaner: cancel `lock_task` from inside `handle_process_result` after `complete_message` / `abandon_message` / `dead_letter_message` settles the message — saves wasted renewal calls.

### 3c. Inline alternative (no per-message task)

A simpler equivalent using `AutoLockRenewer.register()` directly:

```python
async with AutoLockRenewer() as renewer:
    async with client.get_queue_receiver(queue_name, max_wait_time=5) as receiver:
        while not shutdown_flag:
            for msg in await receiver.receive_messages(max_message_count=1):
                renewer.register(receiver, msg, max_lock_renewal_duration=300)
                try:
                    await process(msg)
                    await receiver.complete_message(msg)
                except PoisonError as exc:
                    await receiver.dead_letter_message(
                        msg, reason=type(exc).__name__,
                        error_description=str(exc)[:2000],
                    )
                except TransientError:
                    await receiver.abandon_message(msg)
```

The renewer renews the lock on a background timer until settlement. No manual `lock_renew_task`.

### 3d. Project gap — no explicit DLQ

The current `handle_process_result` (not shown in the read range) calls `abandon_message` on exceptions, letting `MaxDeliveryCount` (default 10) drain to auto-DLQ. Recommended replacement:

```python
async def handle_process_result(future, receiver):
    msg = future.get_coro().__self__.message
    exc = future.exception()
    if exc is None:
        await receiver.complete_message(msg)
    elif isinstance(exc, (SchemaValidationError, DocumentNotFoundError)):
        await receiver.dead_letter_message(
            msg,
            reason=type(exc).__name__,
            error_description=traceback.format_exc()[:2000],
        )
    else:
        await receiver.abandon_message(msg)  # Service Bus retries
```

DLQ entries now carry `reason=SchemaValidationError` instead of `MaxDeliveryCountExceeded` — ops gets actionable context.

---

## 4. State-machine idempotency walkthrough


The record-creation processor uses **MongoDB document status transitions** for idempotency rather than message-level keys.

### 4a. Already-published short-circuit

```python
# test_create_order_idempotency.py
async def test_already_published_returns_true_and_skips_processing(
    sample_order_message, mock_document_already_published,
):
    """Test that already-published events are not reprocessed."""
    mock_crud.get.return_value = mock_document_already_published  # status=PUBLISHED

    result = await process_record_creation(sample_order_message)

    assert result is True
    mock_publish.assert_not_called()    # ← key assertion — no duplicate publish
```

When Service Bus redelivers (lock expiry, network blip, consumer crash), `_is_already_published` reads the document, sees `status == RECORD_EVENT_PUBLISHED`, and returns `True` without calling `publish_events`. The retry settles cleanly with `complete_message`.

### 4b. Optimistic lock on the transition

```python
# test_create_order_idempotency.py
async def test_optimistic_locking_prevents_concurrent_processing(mock_document_ready):
    # First worker — update_one returns modified_count=1
    mock_update_result_success.modified_count = 1
    result1 = await _try_transition_to_waiting_for_publish(...)
    assert result1 is True

    # Second worker (concurrent) — update_one returns modified_count=0
    mock_update_result_fail.modified_count = 0
    with pytest.raises(RecordCreationError):
        await _try_transition_to_waiting_for_publish(...)
```

`_try_transition_to_waiting_for_publish` calls:

```python
collection.update_one(
    filter={"_id": doc_id, "status": STAGE_PARSE_FINISHED},   # ← guard on prior state
    update={"$set": {"status": RECORD_EVENT_WAITING_FOR_PUBLISH}},
)
```

If `modified_count == 0`, another worker won the transition (or status drifted) — raise `RecordCreationError`, abandon the message, let Service Bus retry. The retry will hit the already-published short-circuit (4a) once the winning worker finishes.

### 4c. Full retry-safe flow

```python
# test_create_order_idempotency.py
async def test_full_flow_prevents_duplicate_on_retry(...):
    # First processing attempt
    mock_crud.get.return_value = mock_document_ready              # status=STAGE_PARSE_FINISHED
    mock_update_result.modified_count = 1
    result1 = await process_record_creation(sample_order_message)
    assert result1 is True
    assert mock_publish.call_count == 1                            # ← published once

    # Service Bus retries — document is now PUBLISHED
    mock_crud.get.return_value = mock_document_already_published

    result2 = await process_record_creation(sample_order_message)
    assert result2 is True
    assert mock_publish.call_count == 1                            # ← still once
```

End-to-end retry safety: even if `complete_message` fails (network partition between Mongo update and Service Bus settlement), the redelivery short-circuits via step 1.

### 4d. Failure path keeps state coherent

```python
# test_create_order_idempotency.py
async def test_kafka_failure_does_not_mark_as_published(sample_order_message):
    mock_publish.side_effect = Exception("Kafka connection error")

    with pytest.raises(RecordCreationError):
        await process_record_creation(sample_order_message)

    mock_update_status.assert_called_with(
        "12345678-1234-1234-1234-123456789012",
        DocumentStatus.RECORD_EVENT_FAILED,    # ← FAILED, not PUBLISHED
    )
```

If publishing fails, status flips to `RECORD_EVENT_FAILED` rather than `PUBLISHED` — a retry can detect `FAILED` as retriable and re-attempt the transition.

### 4e. Crash-window gap

If the processor crashes **between** step 2 (transition to `WAITING_FOR_PUBLISH`) and step 4 (final status update), the document sits in `WAITING_FOR_PUBLISH` indefinitely. Service Bus redelivers, but step 2's `update_one` filter expects `status == STAGE_PARSE_FINISHED` — it returns `modified_count=0`, raises `RecordCreationError`, and the message bounces until DLQ.

**Mitigations**:
- A janitor that resets `WAITING_FOR_PUBLISH` documents older than N minutes back to `STAGE_PARSE_FINISHED`
- Step-1 logic that treats stale `WAITING_FOR_PUBLISH` as retriable (re-publish, then transition to `PUBLISHED`)
- Treat `WAITING_FOR_PUBLISH` as a valid prior state in step 2's `update_one` filter (least invasive — but be sure step 3 is genuinely idempotent at the Kafka level)

---

## 5. End-to-end flow

```
┌────────────┐  send_message    ┌──────────────────┐
│ Producer   ├─────────────────▶│ orders queue     │
│ (example-bus)  │  ServiceBusMsg   │ (PEEK_LOCK)      │
└────────────┘                  └────────┬─────────┘
                                         │
                                         │ receive_messages
                                         ▼
                                ┌──────────────────────────┐
                                │ Consumer                 │
                                │ (example-processor)          │
                                │  + AutoLockRenewer       │
                                └────────┬─────────────────┘
                                         │
                            ┌────────────┴────────────┐
                            │                         │
                            ▼                         ▼
                  ┌──────────────────┐    ┌────────────────────────┐
                  │ Idempotent       │    │ Poison error           │
                  │ processor        │    │  (SchemaValidation,    │
                  │ (state-machine)  │    │   DocumentNotFound)    │
                  │  step 1: check   │    └──────────┬─────────────┘
                  │  step 2: lock    │               │
                  │  step 3: publish │               │ dead_letter_message
                  │  step 4: status  │               ▼
                  └────────┬─────────┘    ┌────────────────────────┐
                           │              │ orders/$deadletterqueue│
                           │ complete     │  reason=SchemaValid... │
                           ▼              └────────────────────────┘
                  ┌──────────────────┐
                  │ Settled          │
                  └──────────────────┘
```

**Producer**: shared `ServiceBusClient` + shared `DefaultAzureCredential`; one `get_queue_sender` per send.
**Queue**: `PEEK_LOCK` mode; `MaxDeliveryCount=10` triggers auto-DLQ if the consumer never settles explicitly.
**Consumer**: one `AutoLockRenewer` per lifecycle; per-message register; settle via `complete_message` / `dead_letter_message` / `abandon_message`.
**Idempotency**: state-machine in MongoDB — survives Service Bus redelivery without message-level keys.
**DLQ**: explicit `dead_letter_message` on poison errors with `reason=type(exc).__name__` for ops triage.
