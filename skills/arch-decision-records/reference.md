# Architecture Decision Records Reference

Detailed guidance on creating and maintaining ADRs.

## History and Origin

Architecture Decision Records were popularized by Michael Nygard in his 2011 blog post "Documenting Architecture Decisions." The format has become a standard practice in software architecture.

**Key insight**: Traditional architecture documents become stale. ADRs capture decisions at the moment they're made, preserving context that's otherwise lost.

## ADR Lifecycle Management

### Status Transitions

```
┌──────────┐     ┌──────────┐
│ Proposed │ ──► │ Accepted │
└──────────┘     └────┬─────┘
                      │
         ┌────────────┼────────────┐
         ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌───────────────┐
   │Deprecated│ │ Rejected │ │Superseded by X│
   └──────────┘ └──────────┘ └───────────────┘
```

### Status Definitions

| Status | Meaning | When to Use |
|--------|---------|-------------|
| **Proposed** | Under discussion | Decision not yet made |
| **Accepted** | Decision made | Ready for implementation |
| **Rejected** | Considered but not chosen | Document why (valuable context) |
| **Deprecated** | No longer applies | Context changed, decision irrelevant |
| **Superseded** | Replaced by newer decision | Link to new ADR |

### Changing Status

**Never change the content of an accepted ADR.** Instead:
- Create a new ADR that supersedes it
- Update the old ADR's status to "Superseded by ADR-XXX"
- Explain in the new ADR why the decision changed

## Organizing ADRs in Repositories

### File Structure Options

**Option 1: Flat directory**
```
docs/
└── adr/
    ├── 0001-use-postgresql.md
    ├── 0002-adopt-event-sourcing.md
    └── 0003-jwt-authentication.md
```

**Option 2: Single file (for smaller projects)**
```
ADR.md  # All decisions in one file
```

**Option 3: By domain**
```
docs/adr/
├── infrastructure/
│   ├── 0001-cloud-provider.md
│   └── 0002-container-orchestration.md
└── application/
    ├── 0001-api-framework.md
    └── 0002-authentication.md
```

### Naming Convention

```
NNNN-short-title-with-hyphens.md

Examples:
0001-use-postgresql-for-persistence.md
0002-adopt-event-driven-architecture.md
0003-authenticate-with-jwt.md
```

### Index File

Maintain an index for discoverability:

```markdown
# Architecture Decision Records

| ADR | Title | Status | Date |
|-----|-------|--------|------|
| [ADR-0001](0001-use-postgresql.md) | Use PostgreSQL | Accepted | 2024-01-15 |
| [ADR-0002](0002-event-sourcing.md) | Event Sourcing | Superseded | 2024-01-20 |
| [ADR-0003](0003-cqrs-pattern.md) | CQRS Pattern | Accepted | 2024-02-01 |
```

## ADR Review Process

### When to Review

- Before implementation starts
- When team disagrees on approach
- For decisions affecting multiple teams
- For security-sensitive decisions

### Review Checklist

- [ ] Context clearly explains the problem
- [ ] Alternatives were considered
- [ ] Trade-offs are documented
- [ ] Consequences are realistic
- [ ] References support the decision
- [ ] Affected stakeholders consulted

### Lightweight Review Process

1. **Author** writes ADR in "Proposed" status
2. **Share** in team channel for async review (24-48h)
3. **Discuss** in team meeting if contested
4. **Accept** with consensus (or explicit decision-maker approval)
5. **Update** status to "Accepted"

## Connecting ADRs to Research Synthesis

When context-engineer produces research synthesis:

```markdown
## References

  - Evidence grade: High
  - Key finding: PostgreSQL best fit for JSONB + relational hybrid
```

### Traceability Chain

```
Research Question
    ↓
context-engineer research
    ↓
Research Synthesis (with evidence grades)
    ↓
ADR (references synthesis)
    ↓
Implementation (references ADR)
```

## Multi-ADR Documents

For smaller projects, a single ADR.md file works well:

```markdown
# Architecture Decision Records

## ADR-001: Use PostgreSQL for Persistence

**Status**: Accepted
**Date**: 2024-01-15

### Context
[Why we needed a database decision]

### Decision
[We chose PostgreSQL]

### Consequences
[Trade-offs]

---

## ADR-002: JWT for Authentication

**Status**: Accepted
**Date**: 2024-01-20

### Context
[Why we needed auth decision]

### Decision
[We chose JWT]

### Consequences
[Trade-offs]
```

## Writing Effective Context

### Good Context Includes

- **Problem statement**: What triggered the need for a decision?
- **Constraints**: Budget, timeline, team skills, existing systems
- **Forces**: Competing concerns that make the decision non-obvious
- **Alternatives considered**: What other options existed?

### Example: Good vs Bad Context

**Bad Context:**
> We need to choose a database.

**Good Context:**
> Our application requires storing user profiles with flexible schema (varying fields per user type) alongside transactional order data with strong consistency requirements. The team has PostgreSQL experience but limited NoSQL expertise. We expect 10K users in year one, growing to 100K by year three. Budget is limited, so managed services preferred over self-hosted.

## Writing Effective Consequences

### Categories

| Type | Description | Example |
|------|-------------|---------|
| **Positive** | Benefits gained | "Strong consistency for orders" |
| **Negative** | Trade-offs accepted | "Learning curve for JSONB" |
| **Neutral** | Observations | "Requires connection pooling at scale" |

### Be Specific

**Vague:** "Good performance"
**Specific:** "Sub-100ms query latency for typical read patterns"

**Vague:** "Some complexity"
**Specific:** "Requires implementing connection pooling before 1000 concurrent users"

## Common ADR Topics

### Technology Selection
- Database choice
- Framework selection
- Cloud provider
- Message queue

### Architecture Patterns
- Monolith vs microservices
- Event sourcing
- CQRS
- API design (REST vs GraphQL)

### Cross-Cutting Concerns
- Authentication/authorization
- Logging strategy
- Error handling
- Testing approach

### Integration Decisions
- Third-party service selection
- API versioning strategy
- Data synchronization approach

## Trade-Off Documentation Template

### When to Use This Template

Use this template when choosing between **competing architectures** where multiple valid approaches exist. Examples:
- Single endpoint vs granular endpoints
- Monorepo vs polyrepo
- REST vs GraphQL
- SQL vs NoSQL
- Synchronous vs asynchronous processing

**Do NOT use** for obvious decisions or when only one viable option exists.

### Template Structure

```markdown
## ADR-XXX: [Decision Title]

**Status**: Proposed | Accepted | Rejected | Superseded
**Date**: YYYY-MM-DD
**Deciders**: [Optional - list people involved for multi-team decisions]

### Context

[Describe the problem you're solving and why a decision is needed]

### Decision Drivers

[List the factors influencing this decision]

- Factor 1 (e.g., "Dashboard displays all 4 metrics simultaneously")
- Factor 2 (e.g., "User expects <2 second page load time")
- Factor 3 (e.g., "MVP with <1000 customers")

### Options Considered

#### Option A: [Name of Approach]

**Description**: [What this approach entails]

**Pros**:
- [Specific advantage with data]
- [Another advantage]

**Cons**:
- [Specific disadvantage with data]
- [Another disadvantage]

**Cost**: [Implementation time, maintenance burden, infrastructure cost]

#### Option B: [Alternative Approach]

**Description**: [What this approach entails]

**Pros**:
- [Specific advantage with data]
- [Another advantage]

**Cons**:
- [Specific disadvantage with data]
- [Another disadvantage]

**Cost**: [Implementation time, maintenance burden, infrastructure cost]

### Decision

**Chosen Option**: [Option X] - [Brief justification]

**Rationale**:
- [Key reason 1]
- [Key reason 2]
- [Can refactor to alternative in Phase 2 if needed]

### Consequences

**Positive**:
- [Good consequences of this decision]

**Negative**:
- [Trade-offs accepted with this decision]

**Mitigations**:
- [How to address negative consequences]

### When to Revisit

[Conditions that would trigger reconsidering this decision]

- Condition 1 (e.g., "Users request custom dashboards")
- Condition 2 (e.g., "Payload size exceeds 500KB")
- Condition 3 (e.g., "Customer count exceeds 10,000")

### References

- [Link to implementation plan]
- [Link to performance testing results]
- [Link to related ADRs]
```

### Trade-Off Analysis Framework

When comparing options, quantify trade-offs where possible:

| Dimension | Option A | Option B | Winner |
|-----------|----------|----------|--------|
| **Latency** | 200ms (1 RTT) | 800ms (4 RTTs) | A (4x faster) |
| **Implementation Time** | 20 hours | 28 hours | A (40% faster) |
| **Cache Complexity** | Simple (1 key) | Complex (4 keys) | A |
| **Future Flexibility** | Low (requires refactor) | High (already granular) | B |

**Scoring**: Count wins per dimension → Choose option with most wins for MVP, revisit if losing dimension becomes critical.

**Cost Prioritization for MVP**: Implementation time and latency typically outweigh future flexibility. Accept technical debt if refactoring cost is < 2x initial implementation.

### Why This Matters

**Without trade-off documentation**:
- Future developers don't understand why decisions were made
- Refactoring decisions are made without context
- Teams repeat same architectural debates

**With trade-off documentation**:
- Clear rationale for decisions
- Easier to identify when to revisit (triggers documented)
- Faster onboarding for new team members
- Prevents "why did they build it this way?" frustration

## RCA Verification Matrix

Before writing a root-cause-analysis document, list every load-bearing claim as `V1, V2, …` with the exact file/line that proves or disproves each. Work through the matrix sequentially; tag each row `verified / hypothesis / out-of-scope`. The matrix becomes a section in the final document — it gives reviewers explicit evidence-grading per claim and is the reason a downstream fix-scope refinement is caught before prose is written.

Pattern: pause → draft `(a)` verification list with file/line targets + `(b)` section outline → get approval → then write prose.

## Feasibility POC Discipline

When a feasibility POC produces the evidence for an ADR, four practices keep the evidence honest and actionable.

### Labeled POC Hack

A feasibility POC often requires structurally inelegant minimum-touch fixes — the `poc/` scope is deliberate. The risk is that reviewers see the shortcut, can't tell whether it's intentional, and either propagate it or spend review cycles on it. Labeling the hack eliminates the ambiguity.

Form: a comment block immediately above the hack or in the function docstring:

```python
# POC HACK (DX-1234): try/except wrapping every stage import in the registry because
# the full DI rewiring is out of POC scope. Failure mode: if a handler module is
# missing, the registry silently skips it rather than raising at startup.
# Follow-up: replace with explicit registration in the DI container.
```

Concrete requirements:
- Include the ticket identifier so the grep output is linkable.
- State the deliberate trade-off and the failure mode it creates.
- Name the follow-up action.
- Surface every labeled hack in the ADR's **Deferred Work** section so there is a single authoritative list.

`grep -rn "POC HACK"` then becomes a mechanical punch list for the hardening PR.

### In-Tree Refactor When Migration Cost Is the Deliverable

Two shapes exist for a feasibility POC:

| POC Goal | Correct Artifact Shape |
|---|---|
| "Does technology X work at all?" | Isolated side folder (`poc/`, `spike/`) acceptable — risk surface is narrow |
| "How invasive is adopting technology X?" | In-tree refactor on a branch — the git diff IS the deliverable |

When the stakeholder needs to decide whether to adopt a migration, the blast-radius question is often the whole question. An isolated `poc/` folder answers "does it run?" but not "what does it cost?" — the diff against `main` is the evidence the ADR's decision drivers section cites.

Name any side directories after artifact category, not technology:
- `local/camunda/docker-compose.yaml` — runtime artifact, needs isolation
- `bpmn/pipeline.bpmn` — non-code artifact, needs isolation
- `example_processor/drivers/zeebe_driver.py` — code, belongs in-tree

### Two-Checkpoint Peer Review for Feasibility POCs

Full `/implement`-style per-phase dispatch is appropriate for code-that-ships. A lighter two-checkpoint pattern fits code-that-produces-findings:

| Checkpoint | Timing | Review Focus |
|---|---|---|
| **Plan checkpoint** | After plan is drafted, before code starts | Scope, refactor shape, test parity, structural risk |
| **Code-shape checkpoint** | After the new-tech wiring is complete | New-tech handler shape, retry/fail semantics, variable flow, Phase-N prep |

Rationale: the structural risk (refactor correctness, async hygiene) is independent of the new-tech risk (SDK wiring, broker semantics). Catching them in separate passes avoids a tangle where a structural finding and an SDK finding both block continuation and the root cause of each is unclear. Each review takes ~5 minutes wall-time; skipping the plan checkpoint risks a debug session on a refactor issue that is masquerading as a new-tech issue.

### Deferred-Hardening Section on Single-Domain POCs

A POC that validates one domain or code path (e.g., the happy-path docchain with two stages out of four) produces a feasibility verdict for that slice, not for the production system. Without an explicit enumeration of what was not exercised, the ADR reader may over-promote the confidence level.

Required section in the ADR's **Consequences → Deferred** or a standalone **Deferred Hardening** subsection:

```markdown
### Deferred Hardening (not part of this feasibility verdict)

- Error paths: rate-limit errors, content-filter rejections, upstream timeouts
  (tested against the happy path only)
- Multi-tenant behavior: tenant isolation under concurrent loads
- Scale behavior: >1 concurrent worker; broker-side deduplication
- Remaining pipeline stages: doc_inspection, create_order (2 of 4 stages wired)
```

The list does not need to be exhaustive — it needs to be honest about the POC's scope. A reviewer who sees no Deferred Hardening section should ask for one before accepting the ADR.

## Capturing Alternatives

When writing a fix-spec ticket or decision record, document at minimum two rejected alternatives alongside the chosen one, even when the choice feels obvious:

| Field | Content |
|-------|---------|
| Option name | Short identifier (A, B, C) |
| One-line summary | What this option does |
| Pros | 1–3 bullets |
| Cons | 1–3 bullets |
| Why not chosen | One explicit sentence |

This is cheap insurance against a reviewer asking "why didn't you do X?" — and against a future engineer re-deriving the same trade-offs from scratch.

## Weighted Dimensions Must Trace to Source Documents

In multi-criteria decision frameworks (MCDM), any dimension assigned >15% of total weight should map directly back to the source brief, ticket, or RFP — not to strategic context inferred by the analyst. Strategically inferred axes are defensible in isolation but fragile under review: a single stakeholder can zero the weight, collapsing the recommendation.

If a strategic axis is genuinely critical to the decision, document its grounding (cite the source document or stakeholder statement that establishes it) before assigning it heavy weight. This makes the framework durable across reviewers who were not in the room when the axis was conceived.

| Anti-Pattern | Pattern |
|---|---|
| High-weight axis derived from analyst inference, not source brief | Cite the brief section or stakeholder statement that grounds each axis >15% |
| Weighting framework not shown to stakeholders before scoring | Align on dimension weights before scoring; surprises at review collapse the ranking |

## Adapter-Lie Smell

When a class exists solely to satisfy a duck-typed contract AND lies about a method return value to force a code path (e.g., `exists()` returning literal `True`), the problem is not the lie — it is the consumer's signature that accepted a path-shaped object when a plain value was sufficient. Refactoring the consumer's signature eliminates the adapter.

Convergent signal: when Architecture, Code Quality, and Holistic reviewers all flag the same adapter class in parallel review, the adapter's signature is the root cause, not the adapter's implementation.

| Anti-Pattern | Pattern |
|---|---|
| Adapter with `exists()` → `True` to force a code branch | Refactor the atom/consumer signature to accept a plain value (`str \| None`); the branch falls from `is not None` |
| Adapter class created to satisfy a duck-typed contract in one call site | The duck-typed contract is wrong; change the function signature, not the caller |

## Architecture Comparisons Age Unevenly

Vendor-specific facts in architecture comparison documents age at different rates. Facts that are stable over multiple years: language runtimes, Kubernetes primitives, CNCF projects with multi-year post-graduation stability, storage protocols. Facts that churn annually or faster: licensing models, SDK ecosystems (especially which SDK is the official vs community client library), CNCF tier transitions (incubating → graduated), broker transport modes (poll vs push/streaming), default-on vs default-off feature flag changes.

**Fast/slow churn taxonomy:**

| Stable (safe to carry forward) | Fast-churning (re-verify within 12 months) |
|---|---|
| Language runtimes | Licensing models |
| Kubernetes primitives | SDK ecosystem (official vs community) |
| Storage protocols | CNCF tier transitions (incubating → graduated) |
| Post-graduation CNCF projects (multi-year) | Broker transport modes (poll vs push/streaming) |
| Wire protocols | Default-on vs default-off feature flags |

Any architecture comparison artifact older than ~12 months should re-verify vendor-specific claims against current documentation before reuse.

**Cluster-sweep rule**: when a reviewer flags one claim as outdated, do not patch only that claim. Outdated facts cluster — re-verify all comparable vendor-specific claims in a single sweep. A 30-45 minute research pass with vendor-doc-first citations typically surfaces multiple corrections.

**CNCF status probe**: many CNCF projects graduated in 2024-2025; re-check any project labeled "incubating" in an artifact before reusing that artifact.

| Anti-Pattern | Pattern |
|---|---|
| Patching one outdated claim when a reviewer flags it | Sweep all comparable vendor-specific claims in the same pass |
| Reusing a comparison artifact beyond ~12 months without re-verification | Re-verify fast-moving facts (licensing, SDK status, CNCF tier) before reuse |
| Third-party listicles for current SDK/license state | Vendor release notes and official docs dated within last 12 months |
| Project labeled "incubating" in an artifact used as-is | Re-check CNCF tier; many projects graduated 2024-2025 |

## API Consumption Patterns

This section documents client-side API consumption rules that flow from architecture decisions already encoded in the backend. The backend decision (aggregate boundaries, transactional endpoints) lives in `arch-ddd`; this section captures what the consumer must do to honour that decision.

### Prefer Atomic Nested-Create Over Split Creates

Many REST APIs expose a nested-create endpoint that creates a parent resource and its children atomically — a single POST that wraps both inserts in one server-side transaction. Consuming code that bypasses this endpoint and issues a parent-create followed by N child-creates reintroduces the failure modes the endpoint was designed to eliminate.

**Failure modes of split creates:**

| Failure Mode | Mechanism | Recovery Complexity |
|---|---|---|
| Orphaned parent | Child request fails; parent already committed | Manual cleanup or compensating delete |
| Duplicate parent on retry | Caller re-issues parent-create without checking; server generates a new id | Deduplication logic needed at write and read layers |
| Race under concurrent callers | Two callers hit parent-create simultaneously; no uniqueness constraint on business key | Idempotency key scheme or unique-index addition |

### Verifying the Nested-Create Contract Exists

Before implementing a split-create workaround, verify:

```bash
# Check route handlers for the resource
grep -r "POST.*<resource>" app/

# Check OpenAPI schema for nested fields
curl -s <base>/openapi.json | jq '.paths."/<resource>".post.requestBody.content."application/json".schema'
```

If the schema includes a `children` / `parts` / `<related>` field in the POST body, the nested-create endpoint exists and the split-create is a client-side bug.

### The Retry-Guard Anti-Pattern

A common symptom that the split-create is wrong: the caller adds an "if already created, skip" guard around the parent-create before retrying. This guard:

- Does not remove the orphan row from a prior partial failure — the orphan still exists.
- Does not handle server-generated ids: the caller cannot know which parent to retry children against.
- Adds a branch that must be tested in isolation, then tested again in combination with the retry path.

The correct resolution is to make the create atomic, not to make the retry idempotent. Once the nested-create endpoint is used, the entire guard becomes dead code.

This rule complements the server-side aggregate/transaction guidance in `arch-ddd` § "Aggregate Write Boundaries — Client Side". The two sections should be read together: arch-ddd explains *why* the boundary exists; this section explains *how the client must consume it*.

## Migration Patterns

**Migration-before-deletion for destructive refactors**: Write preservation artifacts to the persistent target before deleting sources. Low cost, makes "destructive" feel reversible, and forces content-value triage at the right moment. Example: before `rm -rf memory/agents/`, emit migration raw episodes to the archive so the retired content still has a home. Applies equally to schema migrations, infra tear-downs, and data archival — the ADR records both the deletion decision and the preservation artifact it produced.
