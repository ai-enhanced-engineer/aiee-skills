---
name: azure-workflow-execution-models
description: Time-bound reference for comparing Camunda, Azure Functions, Dapr, and KEDA as workflow execution models in Azure-native environments. Use when evaluating execution model candidates for a service orchestration layer, or when assessing claims about these technologies in architecture comparison artifacts. Call for Camunda Python SDK, Zeebe streaming, Dapr CNCF status, Azure Functions timeout, KEDA workload identity, or any freshness check on vendor-specific execution-model facts.
updated: 2026-05-20
---

# Azure Workflow Execution Models

**Research verified as of 2026-05-13. Re-verify before reuse in any client-facing artifact.**

This skill is time-bound by design. The "Before You Compare" section is the first stop — corrections here have already invalidated claims in production evaluation memos.

## Before You Compare

Seven material corrections relative to common 2024-era evaluation memos. Verify each against vendor docs before citing:

1. **Camunda official Python SDK exists** — `camunda-python-sdk` (REST-based, sync/async, OAuth/Basic auth). `pyzeebe` (community, gRPC) is no longer the canonical Python SDK.
2. **Zeebe gRPC streaming since Camunda 8.3 (Sept 2023)** — opt-in; Camunda benchmarks show ~50% p50 / ~75% p99 latency improvement. Poll-only latency-penalty claims that omit the streaming caveat misrepresent Camunda 8.3+ performance.
3. **Camunda Self-Managed commercial license since 8.6 (Oct 2024)** — Zeebe was Apache 2.0 free for production pre-8.6; now requires a commercial license for production deployment.
4. **Camunda Web Modeler git sync since 8.6** — two-way sync with GitHub, GitLab, Azure DevOps. BPMN-not-in-code risk is now a configuration choice, not structural.
5. **Dapr graduated CNCF November 2024** — same tier as Kubernetes, Prometheus. "Incubating" claims are factually wrong.
6. **Azure Functions Premium plan timeout is configurable to unbounded** — 30 min is the default, not a hard cap.
7. **Azure Functions Service Bus extension v4.x retired March 2025** — use v5.x.

## Quick Reference

| Candidate | Role | Latest stable | Python story | Key recent change | Churn rate |
|---|---|---|---|---|---|
| Camunda | BPMN workflow engine | 8.8 (Oct 2025); 8.10 forthcoming | Official REST SDK + legacy pyzeebe (community) | Self-Managed commercial license since 8.6; gRPC streaming since 8.3 | High |
| Azure Functions | Serverless compute | Runtime v4; Python 3.10-3.13 | First-class (isolated-process model) | Service Bus v4.x retired Mar 2025; Premium timeout configurable to unbounded | Medium |
| Dapr | Sidecar runtime for distributed apps | v1.16 (Sep 2025) | Sidecar-agnostic; SDK available | CNCF graduated Nov 2024; OTel-native (portability tax if APM SDK is proprietary) | Medium |
| KEDA | Event-driven autoscaler | 2.19 (stable) | N/A — infra layer | Pod-identity removed in 2.15; migrate to workload identity | Low |

## Azure Functions — Additional Verification Items

Two commonly mis-stated facts to pin before citing Functions in feasibility or handoff docs:

- **Handler-load isolation check** — cheapest CI gate for "is this Function App well-formed" without deploying the host. The one-liner that imports the app and asserts trigger registration lives in `reference.md` (and the build-side detail is owned by `azure-functions-python-v2`).
- **Dynatrace Functions extension is App-level, not container-level** — installed as a `siteExtensions` resource on the Function App (portal or ARM/Bicep), not via `RUN apt-get install` in a custom container Dockerfile. Custom containers are compatible with the extension. The common misread is that a custom container image precludes the extension.

## Freshness Discipline

Vendor-specific facts age at different rates. Licensing models, SDK ecosystem shifts (official vs community), CNCF tier transitions, broker transport modes, and default-on flags churn annually to sub-annually. Language runtimes and mature CNCF post-graduation contracts are stable for multiple years. When one claim is flagged outdated, sweep all comparable claims — outdated facts cluster. See `reference.md` for the full fast/slow taxonomy and `arch-decision-records` for the cluster-sweep rule.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Using poll-only latency as a Camunda differentiator without streaming caveat | Qualify: polling is default; gRPC streaming (opt-in since 8.3) reaches push-broker parity |
| Citing Dapr as "CNCF incubating" | Dapr graduated CNCF top-level project November 2024 |
| Citing `pyzeebe` as the canonical Python SDK for Camunda | The official `camunda-python-sdk` (REST-based) is now first-party; `pyzeebe` is community |
| Treating Azure Functions 30-min timeout as a hard cap | 30 min is the default; `host.json` configures it to unbounded |
| Reusing this skill beyond ~12 months without re-verifying vendor docs | Re-run a vendor-doc-first research sweep; high-churn vendors (Camunda, Dapr) shift annually |

## Cross-References

- `azure-functions-python-v2` — implementation-side companion for Functions: `function_app.py` shape, `host.json`, startup-state pattern, container deployment, Dynatrace extension wiring
- `arch-decision-records` — fast/slow churn taxonomy; cluster-sweep rule; vendor-doc-first sourcing
- `azure-service-bus-messaging` — Service Bus trigger details, v5.x extension, session handling
- `azure-identity-m2m-auth` — workload identity for KEDA, Dapr component auth

See `reference.md` for per-claim source citations organized by technology.
