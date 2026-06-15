---
name: arch-decision-records
description: Architecture Decision Records (ADRs) for documenting significant technical decisions. Use for capturing decision context, rationale, consequences, and maintaining decision history.
kb-sources:
  - wiki/software-engineering/arch-decision-records
updated: 2026-06-15
---

# Architecture Decision Records

Lightweight documentation for architecturally significant decisions.

## Core Principle

> **"Document the why, not just the what."**

Code shows what was built; ADRs explain why it was built that way.

## What Makes a Decision "Architecturally Significant"?

| Criterion | Example |
|-----------|---------|
| Affects system structure | "Use event-driven architecture" |
| Hard to change later | "PostgreSQL as primary database" |
| Impacts non-functional requirements | "JWT for authentication" |
| Involves technology selection | "FastAPI over Flask" |
| Team disagrees or multiple valid options | Any contested decision |

## ADR Format

### Required Sections

| Section | Content |
|---------|---------|
| **Title** | `ADR-NNN: [Short descriptive title]` |
| **Status** | Proposed / Accepted / Deprecated / Superseded |
| **Context** | Why this decision is needed, constraints, forces |
| **Decision** | What was decided (clear, unambiguous) |
| **Consequences** | Positive, negative, and neutral outcomes |
| **References** | Links to research, docs, related ADRs |

## ADR Best Practices

1. **One decision per ADR** - Keep focused
2. **Mark as superseded, do not delete** - deleting an ADR breaks every inbound reference (PRs, READMEs, other ADRs) and erases the historical reasoning future engineers need to understand the present state
3. **Number sequentially** - reusing a number invalidates every existing reference to the prior decision and produces silent collisions in tooling that keys on ADR ID
4. **Keep them short** - 1-2 pages maximum
5. **Write when deciding** - Not after the fact
6. **Link to research** - Traceability to evidence

## When NOT to Write an ADR

- Trivial decisions (naming conventions, formatting)
- Decisions already covered by team standards
- Temporary/experimental decisions
- Decisions with obvious single answers

## Status Lifecycle

```
Proposed → Accepted → [Deprecated | Superseded by ADR-XXX]
```

## RCA & Alternatives Capture

Two ADR-adjacent practices keep decision records auditable: the **RCA Verification Matrix** (V1/V2 evidence-graded claim list with file/line targets — pause and draft this before prose) and the **Alternatives Capture Table** (≥2 rejected options with pros/cons/why-not, even when the choice feels obvious). See `reference.md → "RCA Verification Matrix"` and `reference.md → "Capturing Alternatives"` for the full patterns and the table schema.

## API Consumption Patterns

Prefer the backend's atomic nested-create endpoint (parent + children in one transactional request) over create-parent-then-loop-children. The split form orphans the parent on child failure and duplicates it on retry. Verify the contract first (grep route handlers or curl the schema) before assuming separate endpoints are required.

| Anti-Pattern | Pattern |
|---|---|
| create-parent → loop child creates | Single nested-create; one transaction, no orphan risk |
| "skip if already created" id-guard on retry | Make the create atomic; guard treats symptom, not disease |
| Assuming split endpoints without checking schema | Grep/curl request schema; nested field may already exist |

Server-side rationale lives in `arch-ddd` § "Aggregate Write Boundaries — Client Side" — cross-reference rather than duplicating transaction semantics here. See `reference.md` § "API Consumption Patterns" for verification steps.

See `reference.md` for: Weighted Dimensions / MCDM axis-grounding, Adapter-Lie Smell, Architecture Comparisons Age Unevenly (fast/slow churn taxonomy, CNCF probe), Migration Patterns (migration-before-deletion), Feasibility POC Discipline (four practices).
