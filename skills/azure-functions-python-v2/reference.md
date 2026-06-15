# Azure Functions Python v2 — Reference

Deep-dive content supplementing `SKILL.md`. Load when implementing a new Functions Service Bus trigger, authoring a cloud-team handoff, or debugging init/credential/container issues.

## Full host.json — Premium + Service Bus v5

```json
{
  "version": "2.0",
  "extensionBundle": {
    "id": "Microsoft.Azure.Functions.ExtensionBundle",
    "version": "[4.*, 5.0)"
  },
  "functionTimeout": "-1",
  "logging": {
    "logLevel": {
      "default": "Information"
    }
  }
}
```

**Notes:**
- Extension bundle `[4.*, 5.0)` carries Service Bus extension v5.x. Bundle v3.x carried v4.x (retired March 2025).
- `functionTimeout: "-1"` is unbounded — Premium SKU only. On Consumption the runtime ignores `-1` and enforces the plan cap (5 min default, 10 min max).
- The string form `"-1"` (not the integer `-1`) is correct for the current runtime (2026). Older runtime versions expected an integer; the string form is accepted by the current host and is the form used in all current Azure docs and samples.
- `maxConcurrentCalls` defaults to 16. `maxAutoLockRenewalDuration` defaults to 5 minutes. Tune explicitly only after measuring a bottleneck — the defaults are well-chosen for most SB-triggered pipelines.

## Full Startup Guard Pattern

```python
import asyncio
from azure.identity import DefaultAzureCredential
import azure.functions as func
import json
import logging

logger = logging.getLogger(__name__)

app = func.FunctionApp()

# Module-level singletons — shared across warm invocations
_initialized = False
_credential: DefaultAzureCredential | None = None

async def _ensure_startup() -> None:
    """POC HACK: lazy init guard because v2 has no reliable async on_startup hook."""
    global _initialized, _credential
    if _initialized:
        return
    _credential = DefaultAzureCredential()
    # Replace with your actual async init calls:
    await startup_db_client()
    logger.info("Function App startup complete")
    _initialized = True


@app.service_bus_queue_trigger(
    arg_name="msg",
    queue_name="%SERVICE_BUS_QUEUE_NAME%",
    connection="ServiceBusConnection",
)
async def handle_stage(msg: func.ServiceBusMessage) -> None:
    await _ensure_startup()
    body = json.loads(msg.get_body().decode("utf-8"))
    payload = build_payload(body)
    await run_stage(payload, _credential)
```

**Why sync `DefaultAzureCredential` (not `aio`)**:
The sync variant is thread-safe and handles token refresh internally. Storing the `aio` variant as a module-level global can cause issues when the async context changes between invocations. Pass the sync credential to async stage code as-is — the Azure SDK async clients accept it.

## Handler-Load Isolation CI Check

```bash
python -c "
from <service>.function_app import app
fns = list(app.get_functions())
assert len(fns) == 1, f'Expected 1 function, got {len(fns)}'
assert fns[0][1].trigger.trigger_type == 'serviceBusTrigger', \
    f'Expected serviceBusTrigger, got {fns[0][1].trigger.trigger_type}'
print('OK: function_app registers 1 serviceBusTrigger')
"
```

Cheapest CI gate for "is this Function App well-formed without deploying it." Catches import errors, missing trigger decorators, and accidentally doubled registrations. Add to `make validate` or as a pre-push hook alongside mypy and ruff.

## Identity-Based App Settings Keys

| App Setting Key | Value | Purpose |
|---|---|---|
| `ServiceBusConnection__fullyQualifiedNamespace` | `<namespace>.servicebus.windows.net` | Identity-based trigger auth (double-underscore) |
| `AzureWebJobsStorage` | Storage account connection string | Functions runtime state/logs — required even if code doesn't use storage |
| `DISABLE_ONEAGENT` | `true` (POC), `false` (after extension wired) | Dynatrace OneAgent SDK gate |
| `SERVICE_BUS_QUEUE_NAME` | `<queue-name>` | Resolved by `%SERVICE_BUS_QUEUE_NAME%` in decorator |

**Role assignments required for identity-based trigger:**
- `Azure Service Bus Data Receiver` on the namespace for the trigger connection
- `Azure Service Bus Data Sender` on the namespace for any output bindings
- Assigned to the Function App's managed identity (system-assigned or user-assigned)

## Full Dockerfile Pattern — Functions Container

```dockerfile
# syntax=docker/dockerfile:1
# Stage 1: build wheels (identical to non-Functions builder pattern)
FROM python:3.11-slim-bullseye AS builder
RUN pip install "setuptools<81" wheel
WORKDIR /build
COPY pyproject.toml poetry.lock ./
# Pre-build wheels for packages with legacy sdists (e.g. oneagent-sdk):
RUN pip wheel --no-build-isolation "oneagent-sdk" -w /tmp/wheels/
# Export remaining requirements and build wheels:
RUN pip install "poetry>=1.8,<2.0" "poetry-plugin-export>=1.8" && \
    poetry export -f requirements.txt -o requirements.txt --without-hashes --only main
RUN pip wheel --find-links=/tmp/wheels/ --no-cache-dir -r requirements.txt -w /tmp/wheels/

# Stage 2: Functions runtime
FROM mcr.microsoft.com/azure-functions/python:4-python3.11 AS runtime
WORKDIR /home/site/wwwroot
COPY --from=builder /tmp/wheels/ /tmp/wheels/
COPY --from=builder /build/requirements.txt .
RUN pip install --no-cache-dir --find-links=/tmp/wheels/ -r requirements.txt
COPY . .
# No CMD — the Functions base image owns the entrypoint
# No EXPOSE — the Functions host owns HTTP readiness and AMQP binding
```

**Key differences from a non-Functions container:**
- Final `WORKDIR` / copy target is `/home/site/wwwroot/` (Functions contract)
- No `CMD` line — the base image entrypoint starts the Functions host
- No custom `EXPOSE` for health check or AMQP — the host manages both
- The `setuptools<81` + `--no-build-isolation` workaround for `oneagent-sdk` applies identically to this base image (Debian + Python; same `pkg_resources` story as documented in `docker-python-poetry`)

## Dynatrace Functions Extension — App-Level Setup

The Dynatrace Functions extension (`siteExtensions` resource) is installed on the Function App resource, not inside the container. Supported methods:

1. **Azure portal**: Function App → Extensions → Add → search "Dynatrace"
2. **ARM / Bicep**: add a `siteExtensions` child resource to the `Microsoft.Web/sites` resource with `name: "Dynatrace.AzureSiteExtension"`

Custom container Function Apps are compatible with the extension — the extension attaches to the Functions host process, not the container image.

Once the extension is configured, set `DISABLE_ONEAGENT=false` in App Settings and restart the Function App. The OneAgent SDK code in your service (`oneagent.get_sdk()` calls) works unchanged.

## Cloud-Team Handoff Checklist

Items that are commonly missing from first-pass Function App deployments:

- [ ] **Function App resource provisioned** on Premium EP1/EP2/EP3 plan (not Consumption)
- [ ] **App Settings block complete**: `AzureWebJobsStorage`, `ServiceBusConnection__fullyQualifiedNamespace`, `SERVICE_BUS_QUEUE_NAME`, `DISABLE_ONEAGENT`
- [ ] **Managed identity enabled** (system-assigned or user-assigned) and role assignments applied:
  - `Azure Service Bus Data Receiver` on SB namespace
  - Any additional roles needed by stage functions (e.g., Cognitive Services user for DocIntel)
- [ ] **Storage account** for `AzureWebJobsStorage` provisioned and accessible from the Function App's VNet
- [ ] **Dynatrace Functions extension** installed as `siteExtensions` resource (not container-level) — flip `DISABLE_ONEAGENT` to `false` post-install
- [ ] **Bicep/ARM template** authored in `common-pipelines` (or equivalent) — do not hand off a portal-click-only deployment
- [ ] **handler-load isolation check** added to CI (see above)
- [ ] `functionTimeout: "-1"` confirmed in `host.json` if stages run > 5 min
- [ ] **Kafka client teardown gap documented** if service has `KafkaSingletonManager` — Functions has no user-code shutdown hook

## Implementation-Validated Notes

### Typed-DLQ Loss on Migration (autoCompleteMessages default)

When migrating a Service Bus worker to Functions, the binding default `autoCompleteMessages=true` changes the dead-letter path:

| Shape | Dead-letter mechanism | Typed reason preserved? |
|---|---|---|
| Long-lived worker with `dead_letter_message(reason=type(exc).__name__, ...)` | Application-side explicit call | Yes — reason + description set by your code |
| Functions with `autoCompleteMessages=true` (default) | Handler exception → host abandons → `MaxDeliveryCountExceeded` auto-DLQs | No — no typed reason or description |

**Fix options:**

1. **Output binding to a DLQ-shaped queue**: add a `servicebus_queue_output` binding that writes a structured error record; call it explicitly before returning on failure. The DLQ-shaped queue is a regular queue with a naming convention (e.g., `<stage>-dlq`). Your downstream dead-letter consumer reads from it with full context.
2. **SDK call in-handler**: use `ServiceBusClient` + `dead_letter_message(reason=..., error_description=...)` directly inside the handler, then `return` (not raise). This is the lowest-friction migration path if the worker's DLQ consumer already exists and expects the Service Bus DLQ.

**Deferred-item flag**: the correct approach depends on whether the consuming side reads from a shaped dead-letter queue or the Service Bus DLQ directly. Document this as an open decision in the cloud-team handoff.

**Cross-reference**: `azure-service-bus-messaging` documents `dead_letter_message(reason=...)` as the canonical worker pattern.

### Version-Pin Verify Pattern

When pinning `azure-functions` to a specific version in `pyproject.toml`, treat the pin as "verify before first `poetry lock`" rather than a committed decision:

```toml
# Verify this resolves on PyPI before committing:
# pip index versions azure-functions
azure-functions = "==1.21.0"
```

The `azure-functions` package release cadence is irregular and patch versions are sometimes yanked. If two reviewers disagree on whether a specific version is published, that disagreement is itself the signal — convert it to a verify step rather than resolving it by consensus. Run `pip index versions azure-functions` (or check PyPI directly) and record the confirmed version in the pin.


