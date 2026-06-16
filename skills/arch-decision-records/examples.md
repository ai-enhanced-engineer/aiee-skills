# Architecture Decision Records Examples

Templates and real-world ADR examples.

## Blank ADR Template

```markdown
# ADR-NNN: [Short Title]

**Status**: Proposed | Accepted | Deprecated | Superseded by ADR-XXX
**Date**: YYYY-MM-DD
**Deciders**: [List of people involved]

## Context

[Describe the situation that requires a decision. Include:
- What problem are we solving?
- What constraints exist?
- What forces make this decision non-obvious?]

## Decision

[State the decision clearly and unambiguously.
Use active voice: "We will..." not "It was decided..."]

## Consequences

### Positive
- [Benefit 1]
- [Benefit 2]

### Negative
- [Trade-off 1]
- [Trade-off 2]

### Neutral
- [Observation that's neither positive nor negative]

## Alternatives Considered

### [Alternative 1]
- Pros: [List]
- Cons: [List]
- Why rejected: [Reason]

### [Alternative 2]
- Pros: [List]
- Cons: [List]
- Why rejected: [Reason]

## References

- [Link to research synthesis]
- [Link to documentation]
- [Link to related ADR]
```

---

## Example: Technology Selection ADR

```markdown
# ADR-001: Use PostgreSQL for Primary Database

**Status**: Accepted
**Date**: 2024-01-15
**Deciders**: Alice (Tech Lead), Bob (Backend), Carol (DBA)

## Context

Our e-commerce platform needs to store:
- User profiles with varying fields per user type (customers, merchants, admins)
- Order transactions requiring ACID compliance
- Product catalog with full-text search

Constraints:
- Team has strong PostgreSQL experience (3+ years)
- Limited budget for managed services
- Expected load: 10K users year 1, 100K by year 3
- Need both relational queries and flexible schema

## Decision

We will use PostgreSQL as our primary database, leveraging:
- JSONB columns for flexible user profile fields
- Standard relational tables for orders and products
- Built-in full-text search with tsvector/tsquery

## Consequences

### Positive
- Single database technology reduces operational complexity
- Team can leverage existing PostgreSQL expertise
- JSONB provides schema flexibility without sacrificing transactions
- Strong ecosystem (pgvector for future ML features, PostGIS if needed)

### Negative
- JSONB queries can be slower than native document DBs for complex nesting
- Need to carefully design indexes for JSONB fields
- Full-text search less powerful than dedicated solutions (Elasticsearch)

### Neutral
- Will need connection pooling (PgBouncer) at ~500 concurrent connections
- Requires backup strategy planning

## Alternatives Considered

### MongoDB
- Pros: Native flexible schema, built-in sharding
- Cons: Team unfamiliar, weaker transactions, higher operational overhead
- Why rejected: Learning curve and transaction requirements

### PostgreSQL + Elasticsearch
- Pros: Best full-text search, separation of concerns
- Cons: Data synchronization complexity, two systems to maintain
- Why rejected: Over-engineering for current scale

## References

- [Research: Database Selection](context/research/database-selection-deep.md)
- [PostgreSQL JSONB Performance](https://www.postgresql.org/docs/current/datatype-json.html)
```

---

## Example: Architecture Pattern ADR

```markdown
# ADR-002: Adopt Event-Driven Architecture for Order Processing

**Status**: Accepted
**Date**: 2024-01-20
**Deciders**: Alice (Tech Lead), David (Architect)

## Context

Order processing involves multiple downstream actions:
- Inventory update
- Payment processing
- Notification sending
- Analytics tracking
- Shipping initiation

Current synchronous approach causes:
- Long response times (user waits for all operations)
- Tight coupling (failure in one system blocks order completion)
- Difficulty adding new downstream consumers

## Decision

We will adopt an event-driven architecture for order processing:
- Publish `OrderCreated` event after order is persisted
- Downstream services subscribe to events independently
- Use Redis Streams for event transport (migrate to Kafka at scale)

## Consequences

### Positive
- Order creation responds immediately (< 500ms)
- Downstream failures don't block order completion
- Easy to add new consumers without modifying publisher
- Natural audit log through event stream

### Negative
- Eventual consistency (inventory may be briefly out of sync)
- More complex debugging (distributed tracing needed)
- Need to handle duplicate event delivery (idempotency)

### Neutral
- Requires event schema versioning strategy
- Team needs to learn event-driven patterns

## Alternatives Considered

### Keep Synchronous
- Pros: Simpler mental model, immediate consistency
- Cons: Doesn't solve coupling or latency issues
- Why rejected: Current pain points will only worsen

### Saga Pattern with Orchestrator
- Pros: Centralized workflow control
- Cons: Orchestrator becomes bottleneck, single point of failure
- Why rejected: Choreography better fits our decoupled services

## References

- [Research: Event-Driven Patterns](context/research/event-architecture-deep.md)
- ADR-001 (database choice affects event storage)
```

---

## Example: Integration Approach ADR

```markdown
# ADR-003: Use Stripe for Payment Processing

**Status**: Accepted
**Date**: 2024-02-01
**Deciders**: Alice (Tech Lead), Eve (Product), Finance Team

## Context

We need to accept payments for our e-commerce platform:
- Credit/debit cards (primary)
- Support for subscriptions (future)
- PCI compliance required
- International customers (multi-currency)

Budget: Up to 3% transaction fee acceptable
Timeline: MVP in 4 weeks

## Decision

We will use Stripe as our payment processor:
- Stripe Elements for card input (PCI compliance handled)
- Payment Intents API for transactions
- Webhooks for async payment confirmations

## Consequences

### Positive
- PCI compliance handled by Stripe (SAQ-A eligible)
- Excellent developer experience and documentation
- Built-in fraud detection
- Easy subscription addition later

### Negative
- 2.9% + $0.30 per transaction (higher than some alternatives)
- Vendor lock-in for payment logic
- Payout delay (2 business days)

### Neutral
- Need webhook endpoint for payment confirmations
- Test mode available for development

## Alternatives Considered

### Adyen
- Pros: Lower fees at volume, more payment methods
- Cons: More complex integration, enterprise-focused
- Why rejected: Overkill for MVP, revisit at $1M+ GMV

### Square
- Pros: Good for in-person + online
- Cons: Less developer-friendly API, limited international
- Why rejected: We're online-only, need global support

### Build with Payment Gateway
- Pros: Lowest fees, full control
- Cons: PCI compliance burden, 3-6 month implementation
- Why rejected: Timeline and compliance risk

## References

- [Stripe Documentation](https://stripe.com/docs)
- [PCI Compliance Guide](context/research/pci-compliance.md)
```

---

## Full ADR.md File Example

For projects using a single file:

```markdown
# Architecture Decision Records

This document captures architecturally significant decisions for the Document Processing API project.

---

## ADR-001: Use FastAPI as Web Framework

**Status**: Accepted
**Date**: 2024-01-15

### Context
We need a Python web framework for our REST API. Requirements:
- Async support for I/O-bound PDF processing
- Automatic OpenAPI documentation
- Type hints integration
- Team familiar with Python

### Decision
We will use FastAPI as our web framework.

### Consequences
- **Positive**: Native async, automatic docs, Pydantic integration
- **Negative**: Smaller community than Flask/Django
- **Neutral**: Requires Python 3.8+

### References
- [FastAPI Documentation](https://fastapi.tiangolo.com/)

---

## ADR-002: Use PyMuPDF for PDF Processing

**Status**: Accepted
**Date**: 2024-01-16

### Context
We need to extract text from PDF files. Options include PyMuPDF, pdfplumber, PyPDF2.

### Decision
We will use PyMuPDF (fitz) for PDF text extraction.

### Consequences
- **Positive**: Fastest option, handles complex layouts well
- **Negative**: GPL license (acceptable for our use case)
- **Neutral**: Requires system dependencies

### References
- [PyMuPDF Benchmarks](context/research/pdf-libraries.md)

---

## ADR-003: Use Qdrant for Vector Storage

**Status**: Accepted
**Date**: 2024-01-20

### Context
Need vector database for semantic search over extracted document content.

### Decision
We will use Qdrant for vector storage with text-embedding-3-small embeddings.

### Consequences
- **Positive**: Easy local development, good filtering, Rust performance
- **Negative**: Less mature than Pinecone
- **Neutral**: Can self-host or use cloud

### References
- ADR-002 (text extraction feeds into embeddings)
- [Research: Vector Databases](context/research/vector-db-comparison.md)
```
