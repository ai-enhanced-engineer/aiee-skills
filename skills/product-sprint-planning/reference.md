# Sprint Planning - Reference

Detailed patterns for sprint planning, ticket validation, and cross-project coordination.

## Three-Component Estimation Formula

**Formula**: `Total = Implementation + Validation + Review`

| Component | What it covers | Typical cost |
|-----------|---------------|--------------|
| **Implementation** | Hands-on coding (store refactors, service changes) | Traditional estimate |
| **Validation** | Phase 3.5 codebase exploration (file counts, test scope, bundle constraints) | 2–3h for medium complexity |
| **Review** | Multi-cycle specialist review (see table below) | Varies by change type |

**Review time by change type:**

| Change Type | Review Time | When to Apply |
|-------------|-------------|---------------|
| Architectural (store, service, >10 files) | +50% | Integration risks, cross-component concerns |
| Feature (new component, isolated) | +20% | Standard QA, accessibility check |
| Bug fix (isolated, clear root cause) | +15% | Verify fix, check for similar bugs |
| UI-only (styling, single component) | +10% | Visual QA, responsive check |
| Docs/tests only | +5% | Quick review, low risk |

**Worked example:**
```
a prior ticket: Store Singleton Isolation
- Implementation: 14h
- Validation: 2h (codebase check)
- Review: 8h (3 cycles, 4 specialists)
- Total: 24h ✅  (Original estimate was 16h — only implementation)
- Variance: +50% (review time missed)
```

**Detection**: Estimate variance >30% usually means review time was not estimated. Add review time for architectural changes — skipping it is how PRs land with downstream-contract breaks that other teams discover only when their builds fail — and skip for trivial work (docs, typos).

---

## Effort Estimation Deep Dive

### Why Two-Stage Estimation Works

**Stage 1: Architecture Assessment (Phase 3)**
- Architect evaluates technical complexity
- Based on feature requirements, not code
- Produces initial estimates (often inflated)

**Stage 2: Codebase Validation (Phase 3.5)**
- Domain engineer reads actual source files
- Discovers existing implementations
- Checks related projects for dependencies
- Produces validated estimates

### Real-World Example

```
a prior ticket: Analytics Dashboard Schema

Phase 3 (Architecture):
  - New tables needed: 3
  - Migrations: 5
  - Estimate: 10 days

Phase 3.5 (Codebase Validation):
  - Found: a prior ticket, a prior ticket in schema-migrations
  - Existing: 2 of 3 tables already exist
  - Revised estimate: 3 days
  - Savings: 70%
```

### Adjustment Factors

| Finding | Adjustment |
|---------|------------|
| Full implementation exists | 80-90% reduction |
| Partial implementation | 40-60% reduction |
| Schema exists, logic needed | 30-50% reduction |
| No existing code | No adjustment |

### Review Overhead by Change Type

Different types of work have different review overhead multipliers. Apply these to base implementation estimates:

| Work Type | Review Overhead | Total Estimate | Example |
|-----------|----------------|----------------|---------|
| Bug fixes | +25-40% | 1.25x - 1.4x base | Simple logic errors, typos |
| Feature additions | +40-60% | 1.4x - 1.6x base | New endpoints, UI components |
| Architectural changes | +75-100% | 1.75x - 2x base | Deployment configs, service patterns |
| Cross-service changes | +100-150% | 2x - 2.5x base | Protocol changes, breaking changes |

**Example**: 8h architectural change = 14-16h total estimate (8h x 1.75-2.0)

**Root cause**: Multi-phase gated review workflows for architectural changes require 3+ cycles with specialist agents, pushing overhead beyond the standard 50% assumption.

---

## Feature Tier Classification

Features are classified by visibility and customer interaction level. This taxonomy replaces the ambiguous "Invisible" label (which was used for both automatic features and infrastructure changes).

| Tier | Customer Action | Example | Dashboard Visibility |
|------|----------------|---------|---------------------|
| **Automatic** | None required — works without customer action | Auto-categorize visitor questions by topic | Shows results, no config needed |
| **Configuration** | Customer configures in dashboard | Set business hours for AI responses | Settings panel with options |
| **Infrastructure** | None — internal change, no customer visibility | Upgrade IAM roles for CI/CD pipeline | Not visible to customers |

### Classification Decision Tree

```
Does the customer see or interact with this feature?
  ├─ No → Infrastructure
  └─ Yes → Does it require customer configuration?
            ├─ No → Automatic
            └─ Yes → Configuration
```

### Impact on Ticket Writing

- **Automatic** features need acceptance criteria for both "it works" and "customer can see results"
- **Configuration** features need dashboard wireframes or descriptions
- **Infrastructure** features need verification steps but no customer-facing documentation

---

## Cross-Project Dependency Matrix

### Backend Services

```
Primary: reporting-service
  └── db-migrations (schema)
  └── api-gateway (event source)
  └── web-widget (event source)

Primary: api-gateway
  └── db-migrations (schema)
  └── worker-service (downstream)

Primary: auth-service
  └── db-migrations (schema)
  └── All services (consumers)
```

### Frontend Services

```
Primary: web-widget
  └── api-gateway (API)
  └── design-tokens (design tokens)

Primary: admin-dashboard
  └── api-gateway (API)
  └── design-tokens (design tokens)
  └── reporting-service (data)
```

### Validation Prompt Template

```markdown
Validate ticket against:
1. Primary project: {target_project}
2. Related projects: {related_projects}
3. Schema repository: schema-migrations

For each project, check:
- Existing implementations matching ticket scope
- Schema/table definitions
- API endpoints that overlap
- Shared utilities or components
```

---

## Validation Patterns

### Two-Validator Parallel (Intent + Code-Surface, Split by Phase)

At refinement, run product + architect validators with **explicit "intent only — do NOT read source code"** prompts. Defer code-surface validation to per-implementer Phase 3.5 at ticket pickup. Justified when the audit baseline is fresh (≤14 days) and implementers will naturally read code at pickup.

```
Phase 2/3 (refinement): [product-manager, architect] (intent-only, doc-reads only) → consolidated validation
Phase 3.5 (pickup): per-implementer code-surface validation, generates discovery tickets organically
```

Empirical: 5–10x cost savings vs full-codebase validation at refinement (~80–150k tokens vs ~600k–1M tokens), with zero quality loss because intent-only flags catch artifact-internal issues (contradictions, missing acceptance criteria) while implementers catch code-level gaps naturally during pickup. Discovery tickets that emerge from pickup-time validation (e.g., a missing logout endpoint, a schema repair) are the *expected* output of this split, not a process failure.

### Verifier-Output Spot-Check Rule

When a validator agent's verdict count skews unusually heavy (e.g., 22 CONCERN of 32 items), spot-check 3–5 specific findings before acting. If 3+ are invalidated by the cheapest possible test (`ls`, `grep`, single-file read), discount the report and proceed without it.

Empirical: a single architect validator opened with "the 32 ticket files do not exist on disk" — disprovable by one `ls`. Spot-checking its 5 CONCERN claims found all 5 already-handled in tickets. Without the spot-check, the report would have triggered unnecessary rework. Treat validator output as evidence, not verdict.

### Workstream Split When Scope Balloons Past ~30h

When a single workstream grows past ~30h during refinement or mid-execution, split into **WS-Na (foundation)** + **WS-Nb (dependent)**, with WS-Nb gated on WS-Na merging via a *numbered* acceptance list (not a vague "after"). Internal split, doesn't change the contract — pairs cleanly with `/refine-sprint` dispatch order.

```
Original a prior ticket (44–54h estimated)
  ↓
a prior ticket (foundation, 18–22h) — auth + core integrations
a prior ticket (dependent, 26–32h) — features that build on a prior ticket, gated on a prior ticket merge + numbered acceptance list
```

The 30h threshold is empirical, not absolute — the deeper signal is "single review cycle costs grow super-linearly past this point" because the diff exceeds what reviewers can hold in a single context.

## Ticket Templates

### Foundation→Gates Ticket Pair (a prior ticket / a prior ticket)

Every "CI foundation" ticket has an implicit follow-up that tightens gates. When planning a CI foundation ticket (a prior ticket-style: install tooling, write minimal config, get one stage passing), pre-allocate a **deferred follow-up** ticket (a prior ticket-style: type-check, format-check strict, coverage threshold) with:

```
Status: optional / deferred
Pickup window: End of WS-N
```

Both halves should land in the same workstream. Empirical: this pattern emerged organically in 2 of 2 cases (both repos of one a project generated a prior ticket after a prior ticket merged, without prior templating). Predictable enough to template.

### Optional/Deferred Ticket as Discovery Capture

When mid-execution discoveries surface (missing endpoint, schema drift, sibling pattern that should be replicated), create a **lightweight ticket** with:

- `Status: optional / deferred`
- `Pickup window: End of WS-N`
- A short description of the discovery + recommended pickup approach

Pick it up immediately if the implementer is already in context, or defer to the pickup window otherwise. Records the discovery without re-running `/refine-sprint`. The discovery itself is signal that intent-only refinement was working as designed — code-surface gaps surfacing at pickup is the expected mode.

### Sibling-Repo Audit Before CI Design

When adding CI to a new project in a multi-project hub, **list sibling projects' workflow files first**. Align stages, job naming, and gate strictness. Saves invention time and produces consistency across hub projects. Empirical: one a project's CI explicitly mirrors a sibling service's 4-stage `format / lint / type-check / test` parallel-jobs pattern; the new ticket reads "match the multi-stage pattern in the sibling service" rather than re-deriving.

## Hub/Per-Project Ticket Reconciliation

When tickets dispatch to per-project sprint dirs and execution happens there, the hub-level `sprints/.../tickets/in_progress/` doesn't auto-update. After execution completes, the hub may show all original tickets in `in_progress/` with `done/` empty, while per-project dirs hold the actual execution state plus any optional/deferred tickets generated mid-execution.

`/collect-sprint-results` must reconcile both views: scan `{project}/sprint/{sprint-name}/tickets/` for tickets that don't exist in the hub's `sprints/{sprint-name}/tickets/{todo,in_progress,done}/` — those are mid-execution additions (a prior ticket-class). Backfill them into the hub sprint dir before generating the tier report. Without reconciliation, the tier report under-represents both sprint scope and effort.

## Bundled Commit Strategy for Review Cycles

For review-cycle blocker fixes (after `/code-review` Deep), group all blockers into a **single bundled commit** rather than one commit per finding:

```
fix(scope): code-review blockers — <comma-list of categories>

- file:line — <one-line rationale>
- file:line — <one-line rationale>
- file:line — <one-line rationale>
- ...
```

Cuts CI Action minutes (critical when budgets are constrained), survives multi-cycle reviews without commit-graph churn, and gives next reviewers structured evidence of judgment. Each fix needs one line in the commit body for traceability.

## Sprint Close-Out Discipline


### ≥80%-Merged Close-Out Trigger

When ≥80% of sprint tickets have merged, timebox the remaining tail to **1 week**. If the tail hasn't cleared by then, roll the open tickets to the next backlog and formally close the sprint.

Rationale: leaving a sprint "informally open" while main evolves accumulates rebase pain onto all in-flight branches and distorts velocity metrics for subsequent planning.

### Sprint Duration for Solo-Founder Cadence

Prefer **1–2 week sprints**. Tails that strand for 4 weeks can only happen in long sprints. Short sprints force the close-out decision before drift compounds.

| Cadence | Max sprint length | Why |
|---------|------------------|-----|
| Solo founder | 2 weeks | Tail timeboxed naturally; no cross-team coordination cost |
| Small team (2–4) | 2–3 weeks | One PR review chain shouldn't outlive sprint clock |

### Single Source of Truth for Ticket State

Designate **one authoritative tracker** for ticket state — e.g., the hub `tickets/` directory. Update it on every merge. Stop maintaining a parallel project-side ticket tree (or automate its sync if both must exist).

Warning signal: folder state (`ls tickets/done/`) and `git log` disagree on what shipped. When they diverge, treat `git log` as ground truth and reconcile the tracker immediately.

### Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Stranded tail — no formal close after the merge burst | Apply the ≥80% trigger; timebox remainder to 1 week or roll to next backlog |
| Dual ticket trackers drifting from git | One authoritative tracker; update on every merge; or script the sync |

---

## Anti-Patterns

### 1. Single-Project Validation Blindness

**Bad:**
```
Validate a prior ticket against analytics-service only
→ Reports "schema missing"
→ Actually exists in schema-migrations
```

**Good:**
```
Validate a prior ticket against:
- analytics-service (primary)
- schema-migrations (schema)
→ Finds existing schema a prior ticket
→ Adjusts estimate accordingly
```

### 2. Sequential Phase Execution

**Bad:**
```
Phase 2 (product refinement) → wait → Phase 2.5 (investigations)
Total time: 2x
```

**Good:**
```
Phase 2 (FEAT items) ─┬─→ Results
Phase 2.5 (INVEST items) ─┘
Total time: 1x (parallel)
```

### 3. Architecture-Only Estimates

**Bad:**
```
Sprint commitment based on Phase 3 estimates
→ 40 story points committed
→ After validation: only 20 points needed
→ Wasted capacity planning
```

**Good:**
```
Wait for Phase 3.5 validation
→ 40 points estimated (Phase 3)
→ 22 points validated (Phase 3.5)
→ Accurate sprint capacity
```

---

## Orchestration Repository Pattern

For repositories coordinating multiple projects without tracking source:

```gitignore
# Ignore everything by default
/*

# Track only orchestration files
!.gitignore
!claude.md
!workflow.md
!services.yaml
!sprints/
!refined/
!context/
```

### Directory Structure

```
orchestration-repo/
├── .gitignore           # Selective tracking
├── claude.md            # AI instructions
├── workflow.md          # Phase definitions
├── services.yaml        # Project metadata
├── sprints/             # Input: raw features
├── refined/             # Output: validated tickets
├── context/             # Research artifacts
└── [project-folders]/   # Ignored (linked or cloned)
```

---

## Phase 3.5 Audit Checklists

### Model-to-Migration Audit

For any migration ticket, verify ALL models in the target service have corresponding migrations — not just the ticket's model.

**Steps:**
1. `grep __tablename__` across the target service's models directory
2. For each model found, verify a Liquibase changeset exists in `schema-migrations`
3. Flag any model without a migration

**Why:** Sprint 3 a prior ticket created 3 SQLAlchemy models (`widgets`, `attachment_files`, `record_ownership`). Sprint 4 only migrated `attachment_files`. The `record_ownership` table was invisible until staging because factory tests use `Base.metadata.create_all()` which auto-creates ALL tables from models — masking missing migrations.

**Detection rule:** Services using `create_all()` in test fixtures are especially vulnerable to this gap, since `create_all()` auto-creates tables from models and masks missing migrations.

### Data Continuity Checklist

When a new service takes ownership of data from another service, verify:

| Check | Question | Example |
|-------|----------|---------|
| **Backfill** | Does existing data need copying to new tables? | `record_ownership` needed 5 rows from `widgets` |
| **Path conventions** | Do storage paths differ between services? | Gateway: `configs/{namespace}/rec_*.json` vs Factory: `configs/rec_*.json` |
| **FK/ownership mapping** | Are foreign key relationships preserved? | `customer_id` + `record_id` mapping across services |

**Why:** Sprint 4 a prior ticket required manual backfill and GCS path corrections when worker-service took ownership from gateway-service. Both services mocked each other in tests, so contract drift was invisible.

---

## Workflow Phases Summary

| Phase | Name | Input | Output | Agents |
|-------|------|-------|--------|--------|
| 1 | Parsing | Raw sprint doc | Structured items | Orchestrator |
| 2 | Product Refinement | FEAT items | User stories, ACs | Product manager |
| 2.5 | Investigation | INVEST items | Research findings | Domain experts |
| 3 | Technical Refinement | All items | Architecture, estimates | Architects |
| 3.5 | Codebase Validation | Refined items | Validated estimates | Domain engineers |
| 4 | Dispatch | Validated items | Project tickets | Orchestrator |
| 5 | Results Collection | Completed tier | Results report | Orchestrator |
| 5.5 | Next-Tier Updates | Tier N results | Updated Tier N+1 tickets | Orchestrator |

---

## Integration with services.yaml

Define cross-cutting dependencies explicitly:

```yaml
projects:
  analytics-service:
    path: ./analytics-service
    dependencies:
      - schema-migrations    # Schema dependency
      - gateway-service  # Event source

  gateway-service:
    path: ./gateway-service
    dependencies:
      - schema-migrations
      - notification-service
```

Validation agents read `dependencies` to know which projects to check.

## Sprint Artifact Protection

### .gitignore Hygiene for Sprint Artifacts

**Problem**: Sprint tickets can be accidentally excluded from version control through `.gitignore` entries added during cleanup PRs.

**Protected Directories**:
- `sprint/` - Dispatched tickets for current/active sprints
- `refined/` - Product-refined tickets ready for dispatch
- `context/` - Session context and workflow documentation

**Anti-Pattern: Silent Exclusion**

```gitignore
# ❌ BAD - Added during ESLint cleanup PR
sprint/
refined/
*.md
```

**Impact**:
- Tickets exist locally but invisible to git
- Collaborators can't see sprint progress
- Accidental deletion on `git clean -fd`

### Pre-Cleanup Checklist

Before any PR that modifies `.gitignore` or removes untracked files:

1. **Check git status** - Are any untracked directories sprint/ticket artifacts?
   ```bash
   git status
   # Look for: sprint/, refined/, context/
   ```

2. **Review .gitignore diff** - Are any new entries hiding coordination artifacts?
   ```bash
   git diff .gitignore
   # Check for: sprint/, refined/, *.md patterns
   ```

3. **Verify sprint folder** - Does it exist and contain dispatched tickets?
   ```bash
   ls -la sprint/tickets/
   # Should show: FEAT-*.md, CHORE-*.md files
   ```

4. **Get explicit approval** - If cleanup touches these directories, flag in PR description

### What to Version Control

**Always commit**:
- Active sprint tickets (`sprint/tickets/FEAT-*.md`)
- Refined tickets ready for dispatch (`refined/*.md`)
- Workflow documentation (`context/workflows/*.md`)

**Never commit**:
- Sensitive planning (budget, salary estimates)
- Temporary scratch files (`sprint/scratch/`)
- Local agent state (unless part of coordination pattern)

### Recovery Pattern

If tickets were accidentally gitignored:

1. **Check if files still exist locally**:
   ```bash
   ls -la sprint/tickets/
   ```

2. **Remove offending .gitignore entry**:
   ```bash
   # Edit .gitignore, remove sprint/ line
   git add .gitignore
   ```

3. **Force-add the tickets**:
   ```bash
   git add -f sprint/tickets/*.md
   git commit -m "fix: restore sprint tickets to version control"
   ```

4. **Verify restoration**:
   ```bash
   git status sprint/
   # Should show: sprint/tickets/*.md files as staged (green)
   git log --oneline -1
   # Should show: "fix: restore sprint tickets to version control"
   ```

5. **Cross-reference actual work** - Add completion status (PR links, commit hashes) to restored tickets

---

## Sprint Retrospective Template

### Effort Estimate Accuracy Tracking

Track Phase 3.5 estimate accuracy to calibrate future sprints:

```markdown
## Effort Estimate Accuracy

| Ticket | Phase 3 Est. | Phase 3.5 Est. | Actual | Accuracy |
|--------|-------------|----------------|--------|----------|
| a prior ticket | L (10d) | M (3d) | 3d | 100% |
| a prior ticket | S (1d) | S (1d) | 1.5d | 67% |
| a prior ticket | M (3d) | XS (2h) | 2h | 100% |

### Sprint-Level Accuracy

- Phase 3 total: 14 days estimated
- Phase 3.5 total: 4.25 days estimated
- Actual total: 4.6 days
- **Phase 3 accuracy: 33%** (over-estimated by 3x)
- **Phase 3.5 accuracy: 92%** (within 10% of actual)
- **Phase 3.5 savings: 69%** reduction from Phase 3 estimates
```

### Accuracy Calculation

```
Accuracy = 1 - |estimated - actual| / actual
```

Target: Phase 3.5 accuracy > 80% sprint over sprint.

### Unplanned Work Rate

Track tickets not in the original sprint plan as a discovery gap metric:

```
Unplanned Work Rate = unplanned tickets / total tickets completed
Target: < 15%
```

**Why:** Sprint 4 had 99% estimation accuracy on planned work but 31% unplanned rate (5/16 tickets). The unplanned rate reveals discovery gaps that estimation accuracy misses.

### Dual-View Health Scoring

When unplanned work invalidates original sprint metrics, score both views:

```markdown
## Health Score

| Dimension | Planned-Only | Actual (incl. unplanned) |
|-----------|-------------|-------------------------|
| Estimation Accuracy | 99% | 85% |
| Scope Completion | 100% | 69% (11/16) |
| Cross-Service Integration | N/A | 4/10 |
| ... | ... | ... |
| **Overall** | **8.9** | **7.1** |
```

**Why:** Sprint 4 scored 8.9 planned-only but 7.1 actual — the 1.8-point drop made the integration blindspot visible. Without dual-view, the inflated score hides systemic issues.

### Retrospective Sections

A complete sprint retrospective includes:

1. **Process patterns** — What workflow patterns proved effective?
2. **Workflow gaps** — Where did the process break down?
3. **Domain patterns** — Technical patterns discovered during implementation
4. **Orchestration patterns** — Multi-agent coordination learnings
5. **Effort estimate accuracy** — Phase 3 vs 3.5 vs actual (table above)
6. **Unplanned work rate** — Discovery gap metric (target < 15%)
7. **Cross-service integration** — Integration health dimension
8. **Recommended skill updates** — Patterns to codify for future reuse

---

## Sprint-Based Ticket Organization

### Directory Structure Pattern

Organize dispatched tickets by sprint date to prevent mixing across sprints:

```
project/sprint/
├── 2026-02-sprint-2/     # Sprint-dated folder
│   ├── a prior ticket.md
│   ├── a prior ticket.md
│   └── INFRA-001.md
└── tickets/              # Legacy (deprecated)
```

### Dispatch Commands

```bash
# Create sprint directory
mkdir -p "projects/{project}/sprint/{sprint-name}/"

# Copy ticket to project
cp "refined/{sprint-name}/{TICKET}.md" "projects/{project}/sprint/{sprint-name}/"
```

**When to Use**: Always for all sprint ticket dispatch (Tier 1, 2, 3).

---

## Tier-Based Dispatch Strategy

Dispatch tickets in tiers based on urgency, dependencies, and blocking relationships.

### Tier Definitions

| Tier | When to Dispatch | Characteristics |
|------|------------------|-----------------|
| **Tier 1** | Immediately after user approval | Urgent, blocking, or quick wins |
| **Tier 2** | After infrastructure validation | Deployment tickets waiting on infra |
| **Tier 3** | After Tier 1 dependencies complete | Customer-facing features, investigations |

### Dispatch Flow

```
User approves all tickets
  ↓
Dispatch Tier 1 immediately
  ↓
Wait for infrastructure validation (Day 1, 2-3h)
  ↓
Dispatch Tier 2 (if validation passes)
  ↓
Wait for Tier 1 blocking tickets complete
  ↓
Dispatch Tier 3
```

---

## Ticket Lifecycle Management

### Status-Based Organization

Organize refined tickets by status for visual workflow tracking:

```
refined/{sprint-name}/
├── done/              # Completed & validated
├── in_progress/       # Dispatched, active work
└── todo/              # Awaiting dispatch
```

**Workflow**:
1. After refinement → tickets in `todo/`
2. After dispatch → move to `in_progress/`
3. After validation → move to `done/`

### Sprint Artifact Co-Location

Group related sprint artifacts in a single directory:

```
sprints/{sprint-name}/
├── plan.md              # What we planned to build
└── results/            # What actually got built
    ├── tier-1.md
    ├── tier-2.md
    └── tier-3.md
```

**Benefits**: Self-contained sprint directories, natural before/after comparison, easier archival.

---

## Phase 5.5: Automated Next-Tier Updates

After completing a sprint tier and collecting results, automatically update next-tier tickets with learnings.

### What It Does

1. Identifies next tier tickets in `refined/{sprint}/todo/` or `in_progress/`
2. Analyzes current tier completion impact (blockers resolved, infrastructure validated)
3. Writes "Tier N Completion Notes" section to affected tickets

### Update Template

```markdown
## Tier {N} Completion Notes

**Added**: {YYYY-MM-DD}

### Dependencies Resolved
- {TICKET-ID}: {Title} - COMPLETED
  - Impact: {how this unblocks current ticket}

### Infrastructure Validation
- **{Component}**: {PASS/FAIL} ({items-passed}/{items-total})
  - Impact: {ready to proceed / blocked / requires adjustment}

### Risk Updates
| Risk | Previous | Current | Reason |
|------|----------|---------|--------|
| {Risk} | {Medium} | {Low} | {Tier N validation passed} |
```

**Benefits**: Eliminates manual context transfer, prevents stale assumptions, creates audit trail.

---

## Infrastructure Validation as Standalone Ticket

### When to Create INFRA-001

- 2+ deployment tickets share infrastructure prerequisites
- Validation is time-boxed (2-3h) and parallelizable
- Validation results affect multiple teams

### When NOT to Create

- Only 1 ticket needs infrastructure (embed in that ticket)
- Validation is quick (<30 min) and non-blocking

### Ticket Template

```markdown
# INFRA-001: Sprint {N} Infrastructure Validation

**Priority**: CRITICAL (BLOCKS Tier 2)
**Owner**: devops-engineer
**Complexity**: S (2-3h)

## Validation Scope
- [ ] Service A prerequisites (gcloud commands)
- [ ] Service B prerequisites (gcloud commands)

## Blocked Tickets
- a prior ticket (waits for Service A infra)
- a prior ticket (waits for Service B infra)

## Provisioning Commands (If Needed)
[Commands to create missing infrastructure]
```

**Dispatch Target**: infrastructure-repo project (keeps validation separate from implementation).

---

## Comprehensive Ticket Integration

After Phase 3.5, integrate ALL validation phases into a single comprehensive ticket:

### Standard Ticket Structure

1. **Overview** (Phase 2: Product) - Problem statement, user story
2. **Product Validation** - Sarah Test, zero-code compliance, tier classification
3. **Technical Validation** (Phase 3) - Feasibility, service routing, dependencies
4. **Project Validation Findings** (Phase 3.5) - Codebase deep dive results
5. **Effort Revision Table** - Phase 3 vs Phase 3.5 (if different)
6. **Technical Approach** - Implementation strategy
7. **Acceptance Criteria** - Merged criteria from all phases

### Effort Revision Table Example

| Phase | Estimate | Reason |
|-------|----------|--------|
| Phase 3 (Architecture) | 16h | Based on architecture complexity |
| Phase 3.5 (Codebase) | 18-20h | Found 41 test files (not 15), bundle at 99.3% |

**Benefits**: Single source of truth, effort transparency, context preservation for implementation agents.

---

## Command Organization

### Global vs Project-Specific Decision Matrix

|--------|------------------------------|----------------------------|
| References project-specific paths | | Yes |
| Invokes project-specific agents | | Yes |
| Reusable pattern across projects | Yes | |
| Generic workflow | Yes | |
| Used in one project only | | Yes |

---

## Single-PR Batching Pattern

When 2+ tickets in the same sprint target the same repository and the same priority tier, batch them into a single PR.

### Application Criteria

| Criterion | Required |
|-----------|----------|
| Same repository | Yes |
| Same priority tier (S/M/L) | Yes |
| No cross-ticket dependencies | Preferred but not required |
| Combined estimate < 24h | Yes |

### Benefits

- **Reduced review overhead**: One review cycle instead of N (saves ~75% per additional ticket)
- **Atomic deployment**: Related changes ship together
- **Less CI churn**: Single pipeline run for combined changes

### Evidence

Sprint 3 batched a prior ticket + a prior ticket (both S-tier, same repo) into one PR. Estimated 6h separate → 4h combined. Actual: 4.5h (25% savings vs separate PRs).

### When NOT to Batch

- Tickets owned by different specialists
- Tickets with different deployment targets (staging-only vs production)
- Tickets where one is blocked pending external input


---

## Twin-Vertical Mirror Checklist

When porting a feature pattern across analogous verticals (vertical A ↔ vertical B, record ↔ sub-record, etc.), enumerate these divergences in the Triage Clarifications block before dispatch:

| Dimension | Question | Example divergence |
|---|---|---|
| Join level | Per-model or per-child record? | Vertical A: per-record join; Vertical B: per-child join |
| Filter semantics | AND (must-have-all) or OR (any-match)? | Amenities = AND; categories = OR |
| Resource existence | Does the target vertical have a Resource class? | the child Resource was net-new; the parent Resource already existed |
| Index migration | Does a sibling `*_search_indexes_*` migration exist for the target vertical? | Missing index migration = Cycle 2 fix |
| FK naming | Does the FK column name match the convention? | `owner_id` vs `owner_id` |
| Availability join table | Which booking table carries the FK? | ChildRecord.child_id vs Record.parent_id |

**ROI evidence**: a prior ticket triage block with 11 locked decisions → 715-line clean diff + 1 cycle-2 fix. a prior ticket without equivalent block → 3 fix commits across review feedback.

## Strategic Pivot Patterns

When product positioning changes mid-sprint, batch document updates by dependency order: identity → architecture → metadata → research. This ordering reduces inconsistency between dependent documents.

After all batches, grep for stale terminology — including meta tags, OG descriptions, and JSON-LD — to catch invisible copy that visible audits miss.

Founder (or stakeholder) review at each stage, not just final approval, catches UX and business-coherence issues that optimizing for technical completeness alone misses.

## Triage Corrections Block — Preserving the Audit Trail

When `/triage` Phase 2 discovers stale references in a ticket (wrong file paths, shifted line numbers, non-existent dependencies, incorrect route names), **append** a `## Triage Corrections (YYYY-MM-DD)` block to the ticket's Notes section rather than silently editing the original Scope text. This preserves what the ticket *said* vs what was *true* — essential for retrospectives and for understanding why a ticket's effort estimate shifted.

**Format**:

```markdown
## Triage Corrections (2026-05-03)

- `app/auth/login/page.tsx:L47` → shifted to L62 after a prior ticket merge
- `GET /api/subscriptions/me` → route renamed to `/api/v1/billing/status` in a PR
- `Depends on a prior ticket` → a prior ticket was never created; scope folded into a prior ticket

Original ticket scope preserved above for traceability.
```

**Why append, not overwrite**: two tickets in a prior ticket had stale references (wrong path/line on a prior ticket, non-existent dependency on a prior ticket). If the original scope was edited in place, it became impossible to tell whether the estimate overshoot came from scope discovery or from the original ticket being poorly specified. The corrections block keeps that signal intact.

**Anti-Pattern**: editing the original Scope text to "fix" stale references without marking the correction — reviewers see the ticket as having been accurate from the start, losing the retrospective signal.

## Parallel BE/FE Ticket Split

When a sprint ticket spans BE+FE and one half has zero blockers on the other (e.g., BE contract already merged, FE has independent UI work), split the ticket in-place into halves:

- Keep one parent ticket as the joint gate
- Each half gets a suffix label (`a prior ticket` BE, `a prior ticket` FE) with its own acceptance checklist
- Coordinate via concrete shared values in env templates (e.g., Stripe publishable key ships with BE half and becomes `VITE_STRIPE_KEY` consumed by FE half)
- Both halves can run in parallel sessions in different repos

This pattern applies whenever a "Repo: both" ticket has prior workstreams that already shipped one side's contract.

## Triage Clarifications Block

Before dispatching `/implement`, lock the hardest design decisions into the ticket body as a `## Triage Clarifications (YYYY-MM-DD)` section. Include naming conventions, structural divergences from sibling implementations, validation-rule edge cases, and any "must mirror" file patterns from predecessor commits. Implementer receives answers, not questions; reviewers don't relitigate.

- Vertical B: 11 locked decisions → 715-line clean diff + 1 cycle-2 fix
- Vertical A: no locked-decisions section → 3 fix commits across review feedback

## Twin-Vertical Mirror Checklist

When porting a feature from one vertical to an analogous vertical (e.g., property search → Unit search), enumerate every structural divergence in the Triage Clarifications block before dispatch:

- Join level (per-model vs per-child)
- Amenities: AND semantics (filter requirements — must have all) vs OR semantics (preferences — any match)
- Resource existence: resource may not exist for the target vertical — include creation in feature scope if privacy regression would otherwise ship
- Predecessor migration mirror: grep for `*_search_indexes_*` siblings; include in scope if not present

## Per-Project Ticket Copies

When a feature spans both repos, write two ticket files — one per repo — each with a banner:

```
Per-project copy — focus on {BE/FE} half
Out of scope from this session: edits to the other repo
If the contract is wrong, file a focused contract-extension ticket
```

Anti-pattern: a prior ticket a PR — silent cross-repo edits caused a contract mismatch discovered only at integration.

## Dangling-Reference Detection

During triage Phase 2, when a ticket's `Depends on:` names another ticket ID, verify it exists:

```bash
find sprint -name "T-XXX*" 2>/dev/null
grep -rn "T-XXX" sprint/
```

Empty `find` + grep showing only the dependent ticket's own references = dangling dependency (ticket was never created, not "not yet merged"). Surface as a 4-option decision: create now, fold scope, user creates, or abort.
