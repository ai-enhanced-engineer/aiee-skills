---
name: product-sprint-planning
description: Sprint planning patterns including effort estimation, cross-project validation, ticket refinement workflows, two-validator parallel intent-only refinement, Foundation→Gates ticket pairs, workstream split thresholds, and hub/per-project reconciliation. Use for sprint capacity planning, ticket validation, dependency discovery, tier-gated dispatch, strategic pivots, or coordinating multi-agent ticket processing.
kb-sources:
  - wiki/product/product-sprint-planning
updated: 2026-06-03
---

# Sprint Planning Patterns

Patterns for accurate sprint planning with emphasis on validation and cross-project dependencies.

## Two-Stage Effort Estimation

Prevent sprint over-commitment with validation against actual codebase state.

| Stage | Focus | Who | Output |
|-------|-------|-----|--------|
| **Phase 3 (Architecture)** | Technical complexity | Architect | High-level estimates |
| **Phase 3.5 (Codebase)** | Implementation state | Domain engineer | Validated estimates |

**Key insight:** Expect 30-50% reduction after codebase validation. Committing to capacity based on architecture estimates alone causes systematic over-commitment.

```
Architecture estimate: 10 days
After codebase check: Found existing schema → 3 days
Savings: 70% effort reduction
```

## Three-Component Estimation Formula

`Total = Implementation + Validation + Review`

Omitting review time causes 30-60% variance. See `reference.md § Three-Component Estimation Formula` for component breakdown, review-time-by-change-type table, and a worked example.

## Cross-Project Dependency Validation

Validating only the primary project misses existing implementations in sibling repos (e.g., schema in `schema-migrations`). See `reference.md § Cross-Project Dependency Matrix` for the service dependency graph and validation prompt template.

## Parallel Ticket Validation

Group tickets by agent/domain for O(1) validation time:

```
backend-engineer: [a prior ticket, a prior ticket] (parallel)
frontend-engineer: [a prior ticket] (parallel)
devops-engineer: [a prior ticket, a prior ticket] (parallel)
```

## Ticket Lifecycle

```
sprints/        → Raw sprint features (input)
    ↓
Phases 1-4      → Parse, refine, validate
    ↓
refined/        → Implementation-ready tickets
    ↓
project/tickets → Dispatch to target repos
```

## Sprint Close-Out Discipline

A ≥80%-merged threshold is a natural close-out trigger: at that point the options are to timebox the tail (≤1 week) or roll it to the next backlog — leaving the sprint informally open accumulates rebase pain and distorts velocity metrics. Shorter 1–2 week sprints suit solo-founder cadence, and a single authoritative ticket tracker (warning when folder state and `git log` diverge) avoids reconciliation drift. See `reference.md § Sprint Close-Out Discipline`.

## Tier-Gated Dispatch

Dispatch only current-tier tickets; keep future tiers in `tickets/todo/`. Annotate next-tier tickets with learnings before dispatch. Independent workstreams within a tier can run in parallel. See `reference.md § Tier-Based Dispatch Strategy`.

## Strategic Pivot Patterns

When positioning changes mid-sprint, batch document updates by dependency order (identity → architecture → metadata → research). Grep for stale terminology in meta tags and JSON-LD after each batch. See `reference.md` and `design-system-workflow` skill.

## Multi-Agent Review Overhead

Multi-agent workflows underestimate by 42% when review overhead is excluded. Sprint-level formula:

```
Total = Implementation + Review (75% of implementation)
```

| Ticket Type | Review Overhead | Example |
|-------------|----------------|---------|
| Feature (backend/frontend) | +75% | 8h impl → 14h total |
| Simple chore | +25% | 8h impl → 10h total |
| Investigation (time-boxed) | +0% | Already includes analysis |

Use the 75% multiplier for sprint capacity planning; the Three-Component formula for individual ticket estimates.

## Single-PR Batching Pattern

Batch 2+ tickets targeting the same repo and tier into a single PR — reduces review overhead, enables atomic deployment. See `reference.md § Single-PR Batching Pattern` for criteria and evidence.

## INVEST Ticket Pattern

- Map each success criterion 1:1 to a document section.
- One Explore agent per repo for parallel multi-repo exploration.
- Write findings doc, close with `/implementation-update`.
- API gaps found → backend-first delivery as separate PR.

## Cross-Project Validation Additions

- Grep for expected changes before estimating (prevents phantom work items).
- Group items sharing the same root cause into one implementation unit (avoids partial fixes).

## Pre-Implementation Ticket Validation

Validate each ticket claim against the codebase before coding. Status report per claim: CONFIRMED / LINE SHIFT / NOT FOUND / PARTIAL.

## Triage Clarifications Block

Lock design decisions into the ticket as `## Triage Clarifications (YYYY-MM-DD)` before `/implement` — ~10 min triage saves ~30–60 min review back-and-forth. See `reference.md § Triage Clarifications Block`.

## Twin-Vertical Mirror Triage

When porting a feature across analogous verticals, enumerate structural divergences (join level, amenity semantics, resource existence, predecessor migration) in the Triage Clarifications block. See `reference.md § Twin-Vertical Mirror Checklist`.

## Per-Project Ticket Copies for Cross-Repo Features

For features spanning both repos, write one ticket file per repo, each scoped to its half with an out-of-scope banner. See `reference.md § Per-Project Ticket Copies` for the banner template.

## Dangling-Reference Detection

In triage Phase 2, verify every ticket ID in `Depends on:` exists. An empty `find` result = dangling dependency. Surface as 4 options: create now, fold scope, user creates, or abort. See `reference.md § Dangling-Reference Detection`.

See `examples.md` for evidence tables and estimation tracking templates; `reference.md` for workflow phases and anti-patterns.
