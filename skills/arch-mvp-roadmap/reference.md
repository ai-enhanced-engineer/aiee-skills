# MVP & Roadmap Reference

Detailed patterns for effective MVP definition and phased delivery.

## Visible-as-Placeholder


| FE-ID | Surface | Launch state | Wired in |
|---|---|---|---|
| a prior ticket | Map drawing tool | Button visible, opens "coming soon" modal | Phase 2 |
| a prior ticket | Analytics dashboard | Empty-state card with placeholder copy | Phase 2 |
| a prior ticket | Availability rules | Read-only display of defaults; no editor | Phase 2 |
| a prior ticket | Subscription states beyond Active | Active/Cancelled only at launch; Pause/Trial UI hidden | Phase 3 |
| a prior ticket | Support surfaces | Link present; routes to email-support fallback | Phase 3 |

Signal to stakeholders: "These five surfaces ship visible at launch as placeholders; functionality lands in Phase 2/3 per the roadmap." Sets the right expectation without leaving holes in the UX.

---

## MVP Anti-Patterns

### 1. Feature Creep

**Symptom**: Scope grows without corresponding value validation.

**Example**: "While we're building auth, let's add social login, MFA, and password recovery."

**Fix**: Each feature must tie to a validated assumption. Ask: "Does this prove or disprove our core hypothesis?"

### 2. Premature Optimization

**Symptom**: Investing in scale before proving value.

**Example**: "We need Kubernetes, Redis caching, and CDN before launch."

**Fix**: Build the simplest thing that works. Optimize when you have evidence of need.

### 3. Horizontal Slices

**Symptom**: Building complete layers without end-to-end flow.

**Example**: "Let's finish the entire API before touching the frontend."

**Fix**: Build vertical slices—complete user journeys across all layers.

```
WRONG (Horizontal):          RIGHT (Vertical):
┌────────────────────┐       ┌─────┐ ┌─────┐ ┌─────┐
│     Frontend       │       │ UI  │ │ UI  │ │ UI  │
├────────────────────┤       │     │ │     │ │     │
│       API          │       │ API │ │ API │ │ API │
├────────────────────┤       │     │ │     │ │     │
│     Database       │       │ DB  │ │ DB  │ │ DB  │
└────────────────────┘       └─────┘ └─────┘ └─────┘
                             Flow 1  Flow 2  Flow 3
```

### 4. Gold Plating

**Symptom**: Adding polish before validating core value.

**Example**: "The UI needs to be perfect before we show users."

**Fix**: "Good enough" for validation beats "perfect" that ships late.

### 5. Parallel Development

**Symptom**: Multiple features built simultaneously without integration.

**Example**: "Team A builds auth, Team B builds billing, we'll integrate later."

**Fix**: Complete one flow before starting another. Integration risks compound.

## Vertical Slice Architecture

A vertical slice delivers value by cutting through all layers:

```
User Story: "As a user, I can create and view my profile"

Slice includes:
├── Frontend: Profile form + display component
├── API: POST /profile, GET /profile endpoints
├── Domain: Profile entity, validation rules
├── Database: profiles table, migrations
└── Tests: Unit, integration, e2e for this flow
```

### Benefits

- **Demonstrable progress**: Each slice is user-visible
- **Early integration**: Catch integration issues immediately
- **Flexible scope**: Easy to add/remove slices based on feedback
- **Clear ownership**: Slice = unit of work for one developer

### Slice Sizing

| Size | Characteristics | Timeline |
|------|-----------------|----------|
| **Too small** | No user-visible value | < 1 day |
| **Right size** | One user story, demonstrable | 1-3 days |
| **Too large** | Multiple stories combined | > 1 week |

## Iterative vs Incremental Delivery

### Incremental Delivery

Build complete pieces, add more pieces.

```
Version 1: [Feature A]
Version 2: [Feature A] [Feature B]
Version 3: [Feature A] [Feature B] [Feature C]
```

**Best for**: Well-understood domains, stable requirements.

### Iterative Refinement

Build rough version, refine progressively.

```
Version 1: [Feature A - basic]
Version 2: [Feature A - improved]
Version 3: [Feature A - polished]
```

**Best for**: Unknown domains, evolving requirements.

### Hybrid Approach (Recommended)

Combine both: increment features, iterate quality.

```
MVP:     [A-basic] [B-basic]
Phase 2: [A-improved] [B-improved] [C-basic]
Phase 3: [A-polished] [B-polished] [C-improved]
```

## Stakeholder Communication

### Roadmap Presentation Format

```markdown
## Project Roadmap

### MVP (Target: [Date])
**Goal**: Validate core hypothesis
**Success Criteria**: [Measurable outcome]

Features:
- [Must-have 1]: [One sentence description]
- [Must-have 2]: [One sentence description]

### Phase 2 (Target: [Date])
**Goal**: [Specific goal]
**Prerequisite**: MVP deployed and validated
...
```

### Managing Expectations

| Stakeholder Question | Response Pattern |
|---------------------|------------------|
| "Can we add X to MVP?" | "What would you remove to make room?" |
| "When will everything be done?" | "MVP by [date], then we'll learn and adapt" |
| "Why can't we build it all at once?" | "We validate assumptions before investing more" |
| "This feels too small" | "Small scope = fast feedback = better product" |

## Handling Scope Changes

### Mid-Roadmap Change Request

1. **Acknowledge**: "I understand you need X"
2. **Assess impact**: Dependencies, timeline, effort
3. **Present trade-offs**: "To add X, we could remove Y or extend by Z weeks"
4. **Document decision**: Update roadmap with rationale

### Scope Change Template

```markdown
## Scope Change: [Title]

**Requested by**: [Stakeholder]
**Date**: [Date]

**Request**: [What was asked for]

**Impact Assessment**:
- Timeline: [+/- weeks]
- Dependencies: [What's affected]
- Trade-offs: [What could be removed/deferred]

**Decision**: [Accepted/Rejected/Modified]
**Rationale**: [Why]
```

## Success Criteria Patterns

### SMART Criteria

| Component | Example |
|-----------|---------|
| **Specific** | "Users can create accounts" not "Users can use the system" |
| **Measurable** | "< 3 seconds page load" not "Fast page load" |
| **Achievable** | Based on current team capacity |
| **Relevant** | Ties to business goal |
| **Time-bound** | "By end of Phase 1" |

### Examples by Type

**Functional**: "Users can complete purchase flow end-to-end"
**Performance**: "API responds in < 200ms at p95"
**Quality**: "Zero critical bugs in production for 2 weeks"
**Adoption**: "10 beta users complete onboarding"

## Phase Transition Criteria

### Exit Criteria (When to Move On)

- [ ] All features in phase complete and tested
- [ ] Success criteria met
- [ ] No blocking bugs
- [ ] Stakeholder sign-off
- [ ] Documentation updated

### Entry Criteria (When to Start Next Phase)

- [ ] Previous phase deployed to production
- [ ] Feedback collected and analyzed
- [ ] Next phase scope confirmed
- [ ] Team capacity available
- [ ] Dependencies resolved

## Workstream Sizing and Split Threshold

When a single workstream grows past approximately 30 hours, splitting into a foundation workstream (WS-Na) and a dependent workstream (WS-Nb) reduces downstream risk. WS-Nb is gated on WS-Na merging via a numbered acceptance list (not a vague "after N is done"). This is an internal planning split — it does not change the client contract.

**Why 30h is the threshold**: above ~30h, a single workstream is large enough that mid-WS discoveries (scope drift, unexpected dependencies, auth redesigns) can invalidate the second half's estimates. Splitting at the beginning locks in a stable foundation before the dependent work starts.

**Numbered acceptance gate pattern**:

```
WS-Na merges when:
1. Auth middleware wired and integration-tested
2. Stripe Billing webhooks passing staging validation
3. Migration 0019 merged to main

WS-Nb pickup window: after all 3 conditions satisfied
```

The numbered list becomes the hand-off checklist for `/refine-sprint` dispatch ordering — run WS-Na in Sprint 1, gate WS-Nb on the acceptance list, dispatch WS-Nb in Sprint 2.

**Anti-pattern**: splitting by feature (auth vs billing) rather than by dependency order (foundation vs dependent). Feature-based splits produce two workstreams that can't be tested in isolation because each assumes the other's output. Dependency-order splits keep WS-Na self-contained and WS-Nb independently startable once WS-Na lands.

---

## Extensible Algorithm Design

Design algorithms for evolution using stable interfaces. MVP delivers value immediately while building ground truth for future ML phases.

**Evolution path:**
1. **MVP:** Deterministic algorithm (keyword matching, rule-based)
2. **Phase 2:** Statistical approach (TF-IDF, collaborative filtering)
3. **Phase 3:** ML/embeddings (neural networks, transformers)
4. **Phase 4:** LLM-powered (if needed)

**Interface pattern:**
```python
class Categorizer(Protocol):
    def categorize(self, text: str) -> tuple[str, float]:
        """Returns (category, confidence_score)"""
        ...
```

**Key principles:**
- MVP uses zero ML infrastructure (no model serving, no embeddings DB)
- Interface stays stable across phases (same input/output signature)
- Each phase is independently measurable (track accuracy improvement)
- Switch implementations via dependency injection, not rewrite
- Builds ground truth dataset during MVP phase (for training Phase 2 models)
