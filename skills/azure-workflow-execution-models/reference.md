# azure-workflow-execution-models — Reference

Per-claim source citations from the 2026-05-13 research sweep. Organized by technology. Re-verify URLs before citing in client artifacts — vendor docs restructure frequently.

**Research method note**: vendor blog posts and official release notes beat third-party "best of X" listicles for currency. Camunda's own release notes documented gRPC streaming years before architecture comparison sites caught up. Dapr's CNCF graduation was announced via CNCF press release before it appeared in popular comparison articles.

---

## Camunda

### C1 — Zeebe as underlying engine
- **Verdict**: Current.

### C2 — Worker polling vs gRPC streaming
- **Verdict**: Polling remains the default; gRPC streaming is opt-in since Camunda 8.3 (Sept 2023). Streaming uses long-lived gRPC connections, delivers tasks immediately on prior-task completion. Camunda benchmarks: ~50% p50 latency improvement, ~75% p99 improvement on single-task processes. From Camunda 8.10 (Oct 2026), gRPC API will be disabled by default in new self-managed clusters — re-enableable via config.
- **Sources**:
  - https://camunda.com/blog/2024/03/reducing-job-activation-delay-zeebe/
  - https://docs.camunda.io/docs/apis-tools/java-client/job-worker/
  - https://camunda.com/blog/2024/12/api-changes-in-camunda-8-a-unified-and-streamlined-experience/

### C3 — Python SDK
- **Verdict**: Camunda ships an official Python SDK (`camunda-python-sdk`): sync/async, strict typing, OAuth/Basic auth, job worker abstraction, REST-based (not gRPC). `pyzeebe` (camunda-community-hub, v4.7.0, gRPC) remains active but is no longer first-party canonical.
- **Sources**:
  - https://docs.camunda.io/docs/next/apis-tools/python-sdk/
  - https://github.com/camunda-community-hub/pyzeebe

### C4 — Operational ecosystem (Java)
- **Verdict**: Operate, Tasklist, Optimize remain Java applications requiring OpenJDK 21+ for self-managed. Operate and Tasklist REST APIs deprecated in 8.8 and removed in 8.10, replaced by the unified Orchestration Cluster REST API.
- **Sources**:
  - https://docs.camunda.io/docs/self-managed/setup/overview/
  - https://docs.camunda.io/docs/reference/announcements-release-notes/880/880-announcements/

### C5 — BPMN-in-modeler-UI vs code risk
- **Verdict**: Partially mitigated. Web Modeler native git sync (GitHub, GitLab, Azure DevOps) added in 8.6 (Oct 2024), available SaaS and Self-Managed. Two-way sync, versioned commits, optional CI/CD triggers. Git sync is not the default — must be explicitly configured; teams that skip it remain exposed to the original risk.
- **Sources**:
  - https://docs.camunda.io/docs/components/modeler/web-modeler/git-sync/
  - https://camunda.com/blog/2025/02/continuous-integration-and-continuous-deployment-with-git-sync/
  - https://camunda.com/blog/2024/10/camunda-8-6-release/

### C6 — Java/Spring at heart
- **Verdict**: Current. Java SDK + Spring Boot Starter is primary. TypeScript/Node SDK has GA. Official Python SDK documented as primary (stability label not surfaced). C# in technical preview.

### C7 — Licensing
- **Verdict**: Material change. From Camunda 8.6 (Oct 8, 2024), all Self-Managed components — including Zeebe, previously Apache 2.0 free for production — require a commercial license for production use. Source remains publicly readable; production deployment rights are commercial. Free for development/testing. Camunda 8.5 supported through Oct 14, 2025.

### C8 — Poll-based latency
- **Verdict**: Polling does introduce poll-cycle delay. Streaming (opt-in since 8.3) eliminates this. Any argument using the latency gap to differentiate Camunda must qualify with streaming caveat.
- **Sources**:
  - https://camunda.com/blog/2024/03/reducing-job-activation-delay-zeebe/
  - https://docs.camunda.io/docs/apis-tools/java-client/job-worker/

---

## Azure Functions

### F1 — Python runtime versions
- **Verdict**: Functions runtime v4 supports Python 3.10, 3.11, 3.12, 3.13 on Linux. Python 3.9 support ended Oct 31, 2025.
- **Sources**:
  - https://learn.microsoft.com/en-us/azure/azure-functions/functions-reference-python
  - https://learn.microsoft.com/en-us/azure/azure-functions/supported-languages

### F2 — Premium plan timeout
- **Verdict**: 30-min default is correct, but maximum is unbounded via `host.json` configuration. Platform graceful-shutdown windows of 60 min during scale-in. "Cap" framing is misleading.

### F3 — Service Bus trigger
- **Verdict**: Service Bus extension v4.x retired March 31, 2025. Use v5.x. Batch message support requires runtime 4.1039+. Session-enabled trigger support has documented sequencing constraints for batched session handling in the isolated-process model.
- **Sources**:
  - https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-service-bus-trigger
  - https://learn.microsoft.com/en-us/azure/azure-functions/functions-bindings-service-bus

### F4 — Premium SKU pricing
- **Verdict**: EP1/EP2/EP3 SKU structure unchanged. Minimum-one-always-active-instance floor cost unchanged. Verify list prices at https://azure.microsoft.com/pricing/details/functions/

---

## Dapr

### D1 — CNCF status
- **Verdict**: Graduated to CNCF top-level project Oct 30, 2024; announced Nov 12, 2024 at KubeCon NA. Same tier as Kubernetes, Prometheus, Istio, Vitess. "Incubating" claims are wrong.

### D2 — Latest stable version
- **Verdict**: v1.16 released Sep 16, 2025. v1.15.5 patch ~May 2025. v1.17 may be available as of May 2026 — check https://github.com/dapr/dapr/releases for current.
- **Sources**:
  - https://blog.dapr.io/posts/2025/02/27/dapr-v1.15-is-now-available/
  - https://blog.dapr.io/posts/2025/09/16/dapr-v1.16-is-now-available/

### D3 — Sidecar memory footprint
- **Verdict**: Published benchmark: ~23 MB sidecar memory at 1,000 req/s (3-node K8s, 4 cores, 8 GB RAM). Actors test ~18.2 MB. "20-50 MB per pod" range cited in architecture comparisons is consistent.

### D4 — Production-readiness signals
- **Verdict**: 2025 State of Dapr Report (Apr 2025): 49% surveyed teams in production (up from 37% in 2023); 96% report time savings; 40,000+ companies show usage signals. Named adopters include Alibaba Cloud, ZEISS, HDFC Bank, Vonage, Grafana, DataGalaxy (25M+ msgs/month, 130 production clusters).
- **Sources**:
  - https://www.cncf.io/announcements/2025/04/01/cloud-native-computing-foundation-releases-2025-state-of-dapr-report-highlighting-adoption-trends-and-ai-innovations/
  - https://github.com/dapr/community/blob/master/ADOPTERS.md

---

## KEDA

### K1 — Azure Service Bus scaler
- **Verdict**: Current in KEDA 2.19. Queue + topic scaling. Breaking change in 2.15+: pod identity support removed; migrate to workload identity if applicable.
- **Sources**:
  - https://keda.sh/docs/2.19/scalers/azure-service-bus/
  - https://learn.microsoft.com/en-us/azure/aks/keda-about

### K2 — Latest stable version
- **Verdict**: KEDA 2.19 is current stable as of 2026-05-13; 2.20 listed as unreleased.

---

## Freshness Taxonomy

Architecture comparison artifacts age unevenly. This distinction matters when deciding how much re-verification to do before reusing claims:

**Stable (multi-year)**: language runtimes, Kubernetes API surface, CNCF projects with multi-year post-graduation stability, sidecar-agnostic integration contracts.

**Fast-moving (annual to sub-annual churn)**: licensing models, SDK ecosystems (especially official-vs-community client library shifts), CNCF tier transitions (incubating → graduated), broker transport modes (poll vs push/streaming), default-on vs default-off feature flags, extension EOL dates.

Any comparison artifact older than ~12 months should re-verify vendor-specific claims against current docs before reuse. When a reviewer flags one claim as outdated, sweep all comparable claims rather than patching only the one — outdated facts cluster (e.g., a license change and an SDK ecosystem shift often land in the same release window).

The `arch-decision-records` skill owns the general cluster-sweep rule and vendor-doc-first sourcing discipline. This section documents the specific fast/slow claim types for Azure workflow execution model comparisons.

## Observability-Coupling Note

When evaluating Dapr adoption in a codebase that uses a proprietary APM SDK (e.g., Dynatrace OneAgent wired directly via SDK, not OTel collector), Dapr's OTel-native telemetry emission creates a portability mismatch: Dapr emits OTel; the APM SDK doesn't auto-trace sidecars. Resolving this requires either an OTel→APM bridge or an SDK migration. This is a procurement and migration cost, not a blocker, but must appear in the gate evaluation. The pattern generalizes: any proprietary APM SDK creates a portability tax when the candidate runtime emits OTel natively.

## Azure Functions — Handler-Load Isolation Check

The cheapest CI gate for "is this Function App well-formed" without deploying the host:

```bash
python -c "from <service>.function_app import app; fns = list(app.get_functions()); assert len(fns) == 1; assert fns[0][1].trigger.trigger_type == 'serviceBusTrigger'"
```

Caveat: `app.get_functions()` return shape and the `.trigger.trigger_type` attribute path are SDK-internal and version-sensitive against `azure-functions-python` v1.x. For a more durable smoke test, assert only that the app object loads and registers at least one trigger without prescribing the attribute chain. See `azure-functions-python-v2` for the build-side context.
