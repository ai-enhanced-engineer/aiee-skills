---
name: gcp-observability
description: Cloud-native observability patterns for GCP using Cloud Monitoring, Cloud Logging, and SLO-based alerting. Use for metrics design, dashboard creation, burn-rate alerting, or implementing SRE practices.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/gcp-observability
updated: 2026-05-21
---

# GCP Observability Patterns

Cloud-native monitoring and alerting patterns following Google SRE practices, emphasizing service-level objectives and error budgets.

## Core Services

| Service | Purpose | Use When |
|---------|---------|----------|
| **Cloud Monitoring** | Metrics, dashboards, alerts | Performance tracking, SLOs |
| **Cloud Logging** | Log aggregation, analysis | Debugging, audit trails |
| **Cloud Trace** | Distributed tracing | Latency analysis |
| **Error Reporting** | Exception tracking | Application errors |

**Note:** MQL usability disabled Oct 2024 (new creation blocked July 2025; use PromQL). Alerting pricing starts May 1, 2026 ($0.10/condition, $0.35/1M time series).

## SLO Framework

### Service Level Indicators (SLIs)

| SLI Type | Measures | Example |
|----------|----------|---------|
| **Availability** | Successful requests / total | 99.9% requests succeed |
| **Latency** | Response time distribution | P95 < 200ms |
| **Throughput** | Requests per time unit | > 1000 RPS capacity |
| **Error Rate** | Errors / total requests | < 0.1% 5xx errors |

### Service Level Objectives (SLOs)

- Target < 100% (typically 99%, 99.9%, or 99.99%)
- Higher SLO = smaller error budget
- Error budget = 100% - SLO target

```
SLO: 99.9% availability (3 nines)
Error budget: 0.1% = ~43 minutes/month downtime allowed
```

### Error Budget

The error budget is your "budget" for acceptable failures:

1. Track consumption rate (burn rate)
2. Alert when burning too fast
3. Slow feature releases when budget low
4. Reset at compliance period end

## Alerting Strategy

### Two-Alert Pattern

Every SLO should have two alerts:

| Alert Type | Purpose | Threshold |
|------------|---------|-----------|
| **Fast-burn** | Sudden spike, immediate response | Burn rate > 14x (exhausts in 1 hour) |
| **Slow-burn** | Gradual degradation | Burn rate > 2x (exhausts in 2 weeks) |

### Burn Rate Formula

```
Burn rate = (current error rate) / (error budget rate)

If SLO = 99.9% over 30 days:
- Error budget = 0.1% = 43 minutes
- Budget rate = 43 min / 30 days = 1.43 min/day

If current errors = 10 min/day:
- Burn rate = 10 / 1.43 = 7x (will exhaust in ~4 days)
```

## Logging Best Practices

### Structured Logging

Use JSON with consistent fields — unstructured plain-text logs cannot be filtered by `httpRequest.status` or `labels.service`, so log-based metrics and burn-rate alerts can't be built on them:

```json
{
  "severity": "ERROR",
  "message": "Request failed",
  "httpRequest": {"requestMethod": "POST", "status": 500},
  "labels": {"service": "api", "version": "v2"},
  "trace": "projects/p/traces/abc123"
}
```

### Log-Based Metrics

Create metrics from log patterns for alerting:

- Count specific errors
- Track custom business events
- Bridge logs to monitoring

## Key Trade-offs

1. **SLO before alerting** - Alerts without defined objectives fire on noise, not budget exhaustion
2. **Actionable alerts only** - Non-actionable alerts train responders to ignore the queue
3. **Structured logs** - Unstructured plain-text logs cannot be filtered by field, so log-based metrics and burn-rate alerts cannot be built on them
4. **Trace correlation** - Missing trace IDs across services makes cross-service latency root-causing impossible
5. **Dashboard hierarchy** - Flat dashboards mix signal levels; Overview → Service → Component keeps triage fast
6. **Environment naming** - Staging services typically have `-staging` suffix (e.g., `gateway-service-staging`). Verify actual service names with `gcloud run services list` before creating queries/dashboards — assumed names produce empty dashboards that look healthy.

## Monitoring AI Services

### RAG Hallucination Detection

For AI assistants using RAG, monitor entity grounding rate:

**Metrics:**
- Entity grounding rate (% responses with only known entities)
- Hallucination detection rate (invented entities caught)

**Cloud Logging Filter (example):**
```
resource.type="cloud_run_revision"
jsonPayload.assistant_response =~ "Chillax Cruiser|Adventure Seeker|invented_entity_pattern"
severity>=WARNING
```

**Alert:** Hallucinated entity detected → Slack #ai-quality

**Why:** LLMs may invent plausible entities despite correct knowledge base. Active monitoring catches production hallucinations before customers see them.

See `reference.md` for detailed configurations and `examples.md` for alerting policies.
