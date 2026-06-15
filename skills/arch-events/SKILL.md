---
name: arch-events
description: Event-driven architecture patterns for Python including Domain Events, Commands, Message Bus, CQRS, and Bootstrap. Use for implementing event sourcing, decoupled workflows, reactive systems, microservices integration, or making decisions about event-driven design.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/arch-events
updated: 2026-05-20
---

# Event-Driven Architecture

Patterns for building reactive, decoupled Python applications using domain events and commands.

## Foundation

These patterns build on domain-driven design principles — see the `arch-ddd` skill for Repository, Service Layer, Unit of Work, and Aggregates.

## Core Patterns

### Domain Events
Facts about what happened in the business domain.

- Immutable dataclasses with past-tense naming (`OrderAllocated`, `OutOfStock`)
- Aggregates collect events during operations
- Published after transaction commits

### Commands
Instructions to perform actions - requests that may fail.

- Imperative naming (`Allocate`, `CreateBatch`)
- Exactly one handler per command
- Surface failures as exceptions — a swallowed failure leaves callers unable to tell success from failure

### Message Bus
Central routing for commands and events.

- Routes messages to appropriate handlers
- Handlers may emit new events (handler chaining)
- Enables reactive, decoupled systems

### CQRS (Command Query Responsibility Segregation)
Separate models for reads and writes.

- **Write model**: Full domain logic, transactional consistency
- **Read model**: Denormalized views, optimized for queries
- Event handlers keep read models updated

### Bootstrap Pattern
Composition root for dependency wiring.

- Single initialization point for the application
- Wire handlers with their dependencies
- Enables easy testing with fakes

## Commands vs Events

| Aspect | Command | Event |
|--------|---------|-------|
| **Intent** | "Please do this" | "This happened" |
| **Naming** | Imperative | Past tense |
| **Handlers** | Exactly one | Zero or more |
| **Failure** | Raises exception | Handler fails independently |

## When to Apply

| Scenario | Pattern |
|----------|---------|
| Side effects from domain operations | Domain Events |
| Decoupled workflows | Message Bus |
| Request/response operations | Commands |
| Query performance at scale | CQRS |
| Testable dependency management | Bootstrap |

## Event Flow

```
Command → Handler → Aggregate → Collect Events → UoW Commit → Publish Events
                                                                    ↓
                                                              Event Handlers
```

See `reference.md` for detailed explanations and `examples.md` for implementations.
