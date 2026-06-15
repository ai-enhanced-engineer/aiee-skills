---
name: arch-ddd
description: Tactical DDD patterns for clean Python architecture including Domain Model, Repository, Service Layer, Unit of Work, and Aggregates. Use for backend architecture decisions, implementing data access layers, separating business logic from infrastructure, or reviewing code separation.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/arch-ddd
updated: 2026-06-15
---

# Domain-Driven Architecture

Architectural patterns for building maintainable Python applications with clean separation between business logic and infrastructure.

## Core Principle

**"Behavior should drive storage, not the reverse."** Focus on what the system does, not just its data model.

## The Four Pillars

### 1. Domain Model Pattern
The heart of your application - pure business logic, no infrastructure dependencies.

- **Entities**: Objects with long-lived identity (User, Order)
- **Value Objects**: Immutable, defined by attributes (Money, Address)
- **Domain Services**: Logic spanning multiple entities

### 2. Repository Pattern
Abstraction over persistent storage with simple interface.

- Decouple domain from data access
- Enable testing with fake implementations
- Hide persistence complexity

### 3. Service Layer Pattern
Orchestrates use cases and defines application boundaries.

- Thin orchestration, not business logic
- Handles transaction boundaries
- Clear API for use cases

### 4. Unit of Work Pattern
Atomic operations and transaction lifecycle management.

- Explicit transaction boundaries
- Single entry point to repositories
- Ensures consistency

## Aggregate Pattern

Consistency boundaries - clusters of objects that must remain consistent together.

- One aggregate = one repository
- Modify one aggregate per transaction — spanning several in one transaction couples their consistency boundaries and complicates rollback
- Reference other aggregates by ID, not object reference — cross-boundary object references trigger unintended cascade loads

## The Dependency Rule

Dependencies point inward:
```
Entrypoints → Service Layer → Domain Model
     ↓              ↓
  Adapters ← ← ← ← ←
```

## When to Apply

| Scenario | Pattern |
|----------|---------|
| Complex business rules | Domain Model |
| Multiple data sources | Repository |
| Multiple entry points | Service Layer |
| Transaction management | Unit of Work |
| Complex invariants | Aggregates |

## Multi-Service Architecture

### Service Placement Decision Framework

When deciding where to place new features, domain ownership typically outweighs infrastructure convenience.

**Decision criteria (priority order):**
1. **Domain Ownership** - Which service owns the business capability?
2. **Data Ownership** - Which service owns the authoritative data?
3. **Infrastructure Reuse** - Which service has needed infrastructure already?
4. **Deployment Coupling** - Which choice minimizes cross-service deployments?

**Example:**
| Option | Domain | Data | Infrastructure | Decision |
|--------|--------|------|----------------|----------|
| gateway-service | No (real-time) | No | Yes (has DB) | Reject |
| migrations-service | No (schemas) | No | Yes (has batch) | Reject |
| analytics-service | Yes (analytics) | Yes (owns data) | No (needs new) | **Accept** |

**Trade-off:** Infrastructure setup is one-time cost; wrong service boundaries compound over time.

## Aggregate Write Boundaries — Client Side

Splitting an aggregate root + children across two requests re-introduces the failure class the boundary prevents: failed child → orphaned parent; retry without checking → duplicate parent. Prefer the single transactional nested-create endpoint. Verify the contract exists before assuming split endpoints are required; a retry id-guard treats the symptom, not the disease.

See `reference.md` § "Aggregate Write Boundaries — Client Side" for failure modes and retry-guard analysis. See `arch-decision-records` § "API Consumption Patterns" for the client-side consumption rule.

See `reference.md` for detailed explanations and `examples.md` for implementations.
