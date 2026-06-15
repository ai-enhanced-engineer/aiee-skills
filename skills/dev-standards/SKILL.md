---
name: dev-standards
description: Development standards for Python projects including code style, git conventions, testing patterns, timing measurement, and validation requirements. Use when writing code, reviewing PRs, or making commits. Loaded by all implementation agents.
kb-sources:
  - wiki/software-engineering/dev-standards
updated: 2026-06-10
allowed-tools: Read, Grep, Glob
---

# Development Standards

Core behavioral rules for code generation and project maintenance.

## Core Rules

1. **Do what's asked** - Nothing more, nothing less
2. **Prefer editing** - Always edit existing files over creating new ones
3. **No unnecessary files** - Never proactively create documentation unless explicitly requested
4. **No backwards compatibility assumptions** - Unless specifically instructed

## Decision Priority Order

| Priority | Focus | Question |
|----------|-------|----------|
| 1 | Business requirements | What problem are we solving? |
| 2 | Domain model integrity | Does this preserve our invariants? |
| 3 | Existing patterns | Consistency over perfection |
| 4 | Project conventions | Check project's CLAUDE.md |
| 5 | Team standards | As documented in configs/docs |
| 6 | Industry best practices | Only if no project precedent |

## Before Making Changes

- [ ] Searched for existing implementations?
- [ ] Will this break existing functionality?
- [ ] Following the project's patterns?
- [ ] Checked the test suite?
- [ ] Is this the minimal change needed?
- [ ] **Ticket claims validated?** File paths, line numbers, method signatures may be stale before implementation starts.
- [ ] **Git history checked?** `git log --all --oneline --follow -- <file>` — current code shows one era; history reveals all.

## Critical Reminders

1. **Assuming a dependency exists** causes `ModuleNotFoundError` at runtime — check `pyproject.toml` first
2. **Test modifications immediately** - Don't accumulate changes
3. **Read existing code patterns first** - Match the project's style
4. **Domain logic stays pure** - No framework dependencies in domain model
5. **Restore mocks properly** — `jest.restoreAllMocks()` in `afterEach`; `clearAllMocks` does not restore implementations.

## Before Any Commit (Non-negotiable)

**Run `make validate-branch` (or `just validate-branch`) before every commit and push** — running it only at PR time lets format/lint errors slip through to CI. Do not add claude signatures to commits; do not commit until confirmed by user.

## Quality & Process Gates

| Gate | When |
|------|------|
| Pre-Implementation Validation | Before 50+ file refactors — grep all file types, Dockerfiles, CI configs |
| Observable Removal Scope | Removing a log field, metric, counter, or status code — grep non-code consumers too: runbooks, dashboards, alert configs |
| Cross-Service Integration Readiness | Before first cross-service communication in any tier |
| Backend Logging Before Integration Testing | Replace `print()` with named loggers before cross-service testing |
| Code Review Before Refactoring | Invoke specialist agents before refactoring code-smell modules |
| Error Handling in HTTP Responses | `type(e).__name__` reveals internal module structure — log internally, return generic |
| Multi-Cycle Gated Review | Ship incrementally with user approval gates (Cycle 1 → 2 → 3+) |
| CI Hygiene | `.gitignore htmlcov/`, pin mypy + type stubs, `git status` before staging on macOS |

See `reference.md` for each gate's checklist, anti-patterns, and examples.

## Git Discipline

| Pattern | Rule |
|---------|------|
| PR Branching | Branch new PRs off `main`; stacked PRs orphan on squash-merge |
| Intermixed Edits | Feature branch + `git add <specific files>`; avoid `git add -p` across >3 files |
| Staging Safety | Check size before `git add -f` on gitignored files |
| Protected Repos | Branch + PR by default; bypass is for emergencies, not workflow |
| Pre-Commit Hook Trap | Auto-stash leaves untracked files in place; bundle test-infra with tests |

See `reference.md` for: git guidelines, test naming, timing measurement, quality gate placement, feedback severity classification, code review cycles, review-panel blind spots, lint discipline, coverage thresholds, static-site test-enforcement skip, verify-by-callers reflex, pre-commit-vs-Husky, orchestrator ship procedure, documentation review, skill maintenance gates, and skill authoring standards.
