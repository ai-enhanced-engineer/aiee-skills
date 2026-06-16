---
name: azure-functions-python-v2
description: Azure Functions Python v2 programming model patterns for Service Bus-triggered services. Covers function_app.py shape, host.json for Premium SKU + Service Bus extension v5, lazy-init startup-state pattern, DefaultAzureCredential reuse, identity-based connections, custom container deployment, and the Dynatrace Functions extension. Use when migrating a long-lived worker/consumer to Functions, building a new Functions Service Bus consumer, or assessing Functions feasibility for an existing async-Python codebase. Call for function_app.py, service_bus_queue_trigger, func.FunctionApp, host.json, azure functions python v2 programming model, dynatrace functions extension.
updated: 2026-05-20
---

# Azure Functions Python v2 — Service Bus Trigger Patterns

Decorator-based programming model for Service Bus-triggered services on Azure Functions Premium. For model-level comparison, see `azure-workflow-execution-models`.


## When to Use / When Not to Use

| Use Functions v2 when | Prefer long-lived workers when |
|---|---|
| Stage functions are queue-shape-agnostic `(payload, credential)` | Kafka side-effects need a `close_all_clients()` shutdown hook |
| Event-driven burst scaling on SB queue depth is sufficient | Sub-second cold-start is a hard requirement |
| No BPMN visibility or retry orchestration needed | Stateful workflow with compensation steps (use Camunda) |

## The v2 Shape

Decorator-based bindings on a `func.FunctionApp()` instance:

- `queue_name="%ENV_VAR%"` — App Settings interpolation, resolved at host startup. Hardcoded queue names tie the deploy artifact to one environment (see Anti-Patterns table).
- `connection="ServiceBusConnection"` — a prefix (not a full string); host reads either `ServiceBusConnection` or `ServiceBusConnection__fullyQualifiedNamespace` (identity-based, v5, double-underscore).
- Body parse: `json.loads(msg.get_body().decode("utf-8"))` → Pydantic. No auto-deserialization.

Full handler code and CI check in `reference.md`.

## host.json Recipe

Extension bundle `[4.*, 5.0)` (v4.x retired March 2025). `functionTimeout: "-1"` unbounded on Premium; Consumption caps at 5 min. Defaults (`maxConcurrentCalls=16`, `maxAutoLockRenewalDuration=5min`) are well-chosen — tune after measurement. Full JSON in `reference.md`.

## Startup State

No reliable `@app.on_startup` async hook. Use a module-level `_initialized` flag + `await _ensure_startup()` at the top of each handler. Initializes `DefaultAzureCredential()` and async DB clients once per warm instance.

`asyncio.run()` at module import is wrong — the Functions worker owns its event loop. Full pattern in `reference.md`.

## Credentials

`DefaultAzureCredential()` at module scope is safe for warm invocations — sync variant is thread-safe, handles token refresh. Per-invocation construction defeats the token cache.

Identity-based connection: `ServiceBusConnection__fullyQualifiedNamespace = <ns>.servicebus.windows.net` (double-underscore) + managed-identity `Azure Service Bus Data Receiver` role. App Settings table in `reference.md`.

## Container Deployment

Base image `mcr.microsoft.com/azure-functions/python:4-python3.11`. Copy artifacts into `/home/site/wwwroot/`. No `CMD` or `EXPOSE` — base image owns both. `setuptools<81` + `oneagent-sdk` workaround from `docker-python-poetry` applies identically. Full Dockerfile in `reference.md`.

## OneAgent / Dynatrace Functions Extension

App-level (`siteExtensions` on the Function App), not container-level. Custom containers are compatible. `DISABLE_ONEAGENT=true` is the POC default — flip to `false` post-install. Silent if forgotten; document as a handoff footgun.

## What the Host Replaces (vs Worker Shape)

Dropped: `SignalHandler`, Flask+waitress health service, `AutoLockRenewer`, `_handle_auth_error` backoff loop, `ProcessorApplication.run()`. Host or binding owns each.

No equivalent: `KafkaSingletonManager.close_all_clients()` — no shutdown hook. Flag for production.

## Premium SKU Forcing Factors

~100–130 MB compressed is a realistic floor for a LangChain + DocIntel + Service Bus wheel chain (native extensions included). Consumption hard-caps at 250 MB — Premium is mandatory. No KEDA needed; Functions Premium has built-in SB queue-depth scaling.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `os.environ["OPENAI_API_KEY"] = token.token` per invocation | Race under warm concurrency; use `azure_ad_token_provider` on `AzureChatOpenAI` (see `langchain-azure-openai-patterns`) |
| `asyncio.run(startup_db_client())` at module import | Worker owns the event loop; use `await _ensure_startup()` in each handler |
| Hardcoding queue name in decorator | Use `%SERVICE_BUS_QUEUE_NAME%` App Settings interpolation |
| Omitting `AzureWebJobsStorage` App Setting | Runtime requires it even without Durable Functions — app will not start |
| Treating 30-min timeout as a hard cap | `functionTimeout: "-1"` is unbounded on Premium |
| Installing Dynatrace via `RUN apt-get` | Extension is App-level (`siteExtensions`), not container-level |
| Expecting typed DLQ reasons (`dead_letter_message(reason=...)`) to survive migration from a worker | `autoCompleteMessages=true` default: exception → host abandons → `MaxDeliveryCountExceeded` auto-DLQs with no typed reason. Fix: output binding to a DLQ-shaped queue, or SDK call in-handler. Details in `reference.md`. |

## Cross-References

- `azure-workflow-execution-models` — Camunda / Functions / Dapr / KEDA comparison
- `azure-service-bus-messaging` — Service Bus SDK, v5 extension, session handling
- `azure-identity-m2m-auth` — credential lifecycle, workload identity
- `langchain-azure-openai-patterns` — `azure_ad_token_provider` fix for `os.environ` mutation
- `docker-python-poetry` — `setuptools<81` / `oneagent-sdk` workaround; Functions container variant
