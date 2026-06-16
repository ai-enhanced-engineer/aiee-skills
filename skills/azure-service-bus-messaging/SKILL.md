---
name: azure-service-bus-messaging
description: Azure Service Bus async producer/consumer patterns with azure-servicebus 7.x — singleton credential, AutoLockRenewer for long jobs, dead-letter queue routing, Pydantic event schemas per queue, state-machine idempotency. Use for queue-based microservices, document processing pipelines, or async workflows on Azure. See `arch-events` for event-driven concepts.
updated: 2026-04-27
---

# Azure Service Bus Messaging Patterns

Concrete `azure-servicebus` 7.14+ patterns for async Python producers and consumers — the SDK-level sibling to `arch-events`. Covers the patterns that bite in production: singleton credentials, lock renewal on long handlers, explicit DLQ routing, and idempotency on retries.

## When to use

- Queue-based microservices on Azure Service Bus (sender + consumer lifecycle)
- Document/order pipelines where handlers run longer than queue lock duration
- Adding explicit DLQ routing instead of relying on `MaxDeliveryCount` auto-dead-lettering
- Pydantic event schemas shared across producer and consumer packages
- **Not** for high-throughput streaming or multi-consumer-group fan-out — Kafka fits there

For Azure auth, see `azure-identity-m2m-auth`. For event/command modeling, see `arch-events`.

## Core patterns

| Pattern | One-line rule |
|---|---|
| Singleton credential | One `DefaultAzureCredential` per process, injected into a shared `ServiceBusClient`; per-send construction forces a chain walk and AMQP reconnect |
| Persistent client | `ServiceBusClient(fully_qualified_namespace, credential)` opened at lifespan startup, closed at shutdown; `get_queue_sender/receiver` are short-lived contexts inside it |
| Receive mode | `PEEK_LOCK` (default) so failures hit DLQ; `RECEIVE_AND_DELETE` only for fire-and-forget |
| `AutoLockRenewer` | One renewer per consumer lifecycle, registered per-message with `max_lock_renewal_duration` covering worst-case handler time |
| Settle after success | `await receiver.complete_message(msg)` only after all side effects confirm; `dead_letter_message` on poison; `abandon_message` on transient |
| Explicit DLQ | `dead_letter_message(msg, reason=type(exc).__name__, error_description=...)` — beats `MaxDeliveryCountExceeded` with no context |
| Pydantic event schemas | Per-queue subtype hierarchy on `DefaultEventPayload`; metadata (`eventType`, `timestamp`) merged into body in `send_message` |
| State-machine idempotency | DB-level status guard (`update_one` with prior-state filter) — not message-level keys; safe under Service Bus redelivery |

## Quick reference

```python
from azure.identity.aio import DefaultAzureCredential
from azure.servicebus import ServiceBusMessage
from azure.servicebus.aio import AutoLockRenewer, ServiceBusClient

# Lifespan: one credential, one client, shared
credential = DefaultAzureCredential()
client = ServiceBusClient(
    fully_qualified_namespace="myns.servicebus.windows.net",
    credential=credential,
    logging_enable=True,
)

# Producer
async with client.get_queue_sender("orders") as sender:
    msg = ServiceBusMessage(
        body=json.dumps(payload),
        content_type="application/json",
        correlation_id=transaction_id,
    )
    await sender.send_messages(msg)

# Consumer with lock renewal + explicit DLQ
async with AutoLockRenewer() as renewer:
    async with client.get_queue_receiver("orders", max_wait_time=5) as receiver:
        for msg in await receiver.receive_messages(max_message_count=1):
            renewer.register(receiver, msg, max_lock_renewal_duration=300)
            try:
                await process(msg)
                await receiver.complete_message(msg)
            except PoisonError as exc:
                await receiver.dead_letter_message(
                    msg, reason=type(exc).__name__, error_description=str(exc)[:2000]
                )
            except TransientError:
                await receiver.abandon_message(msg)
```

## Anti-patterns (top 5)

1. **Per-send `DefaultAzureCredential()` + temp `ServiceBusClient`** → singleton at startup; every per-send credential triggers a chain walk and AMQP reconnect (full fallback-path walkthrough in `examples.md`)
2. **No explicit `dead_letter_message`** → auto-DLQ at `MaxDeliveryCount` with reason `MaxDeliveryCountExceeded` and no context; instead dead-letter on known poison errors with `reason=type(exc).__name__`
3. **Sync I/O in async consumer** → wrap with `await asyncio.to_thread(...)` or use the `azure.servicebus.aio` package; never call sync `azure-servicebus` methods from `async def`
4. **`complete_message` before processing finishes** → settle only after all side effects (DB write, downstream send) confirm; `RECEIVE_AND_DELETE` mode is the same bug, structural
5. **Missing `AutoLockRenewer` on long handlers** → handlers exceeding queue lock duration (often 30s–5min) lose the lock; `complete_message` then raises `MessageLockLostError`

## See also

- `arch-events` — Domain Events, Commands, Message Bus, CQRS theory
- `azure-identity-m2m-auth` — singleton `DefaultAzureCredential`, Managed Identity, KeyVault

See `reference.md` for the full pattern catalogue and `examples.md` for project-grounded implementations.
