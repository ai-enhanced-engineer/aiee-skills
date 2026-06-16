---
name: dev-debugging-strategies
description: Systematic production debugging patterns including hypothesis-driven investigation, temporal regression analysis, and environment-first triage. Use when diagnosing production failures, investigating regressions, or debugging issues without an obvious root cause. Call for recently broken features, hypothesis enumeration, or root cause analysis.
allowed-tools: Read, Grep, Glob, Bash
kb-sources:
  - wiki/software-engineering/dev-debugging-strategies
updated: 2026-06-10
---

# Production Debugging Strategies

Systematic patterns for investigating production failures, validated by diagnosing a React Native ML inference failure across 9 competing hypotheses (Feb 2026).

## Hypothesis-Driven Framework

For production failures without an obvious cause, structure investigation as numbered hypotheses:

```
H1: <Short name>
  Confidence: High / Medium / Low
  Category: Environment / Code / Data / Infrastructure
  Failure Mechanism: step-by-step description of how this causes the symptom
  Predicted Symptom: what the user would experience
  Diagnostic Test: cheapest test to confirm/deny (curl, log check, version check)
  Remediation: fix if confirmed
```

Enumerate all hypotheses first, then rank by diagnostic cost — premature commitment to one hypothesis creates confirmation bias, causing contradicting evidence to be rationalized away.

## Temporal Analysis Filter

**First question for any regression**: "When did this last work?"

Split hypotheses into regression candidates (recent change could explain it) and static bugs (would have been broken from day one) — test regression candidates first. This single question eliminated 4 of 9 hypotheses in one session.

## Environment Before Code

For "recently broken" features, check infrastructure before reading application code:

| Check | Cost | What It Rules Out |
|-------|------|-------------------|
| `curl -sL "URL" \| head -30` | 2 min | Dead external dependency, wrong URL |
| Check OS/runtime version compatibility | 5 min | Platform-breaking update |
| Verify CDN / auth tokens unexpired | 5 min | Infrastructure regression |
| Check dependency version matrix | 10 min | Package incompatibility after upgrade |
| Read application code | 30+ min | Use only after environment checks pass |

**Recurring environment traps** (jsdom Node 22, PHP display_errors, SQLite/MySQL DDL, Homebrew Python 3.14 ABI, empty CA store) — see `reference.md` for probes and fallbacks.

## CWD-First Diagnostic for Babel/Jest Failures

CWD drift (e.g., `cd android && ./gradlew ...` leaving shell in a subdirectory) produces identical symptoms to version incompatibilities in Babel/Jest transform errors — check CWD and config resolution before investigating parser/plugin versions. Full probe commands in `reference.md`.

## Deeper Debugging Patterns

- **CI vs Local Divergence** — fetch real error with `gh run view <id> --log-failed`, then check SDK/toolchain version mismatch. See `reference.md`.
- **Webhook & Wire-Level** — root-cause checklist, wire-level JSON inspection, vendor prompt-injection handling. See `reference.md`.
- **Documentation & Review-Bot Loops** — doc-vs-reality drift, review-bot false-positive triage, Playwright visual-verification loop. See `reference.md`.

## Confident False-Negatives (Tool Dialect Traps)

A "0 results" that contradicts a strong prior is a signal to suspect the *tool's dialect*, not to conclude absence:

- **`git grep -E` with `\s`**: POSIX ERE has no `\s`, so the pattern silently matches nothing and reports a false "absent." Use a literal space, a bracket class `[[:space:]]`, or `grep -P` (PCRE).
- **`curl -w` format starting with `@`**: a write-out format string beginning with `@` is parsed as a *filename* ("error reading"), not a format — never lead the `-w` string with `@`.

Both produce confident false-negatives that derail diagnosis. When a search result contradicts what you're nearly certain is true, re-run with a different tool/dialect before trusting the zero.

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| Reading code before checking environment for regressions | curl/version checks first; static bugs don't suddenly appear |
| Trusting a `git grep -E '\s'` "0 results" as proof of absence | `\s` is invalid in POSIX ERE — matches nothing; use `[[:space:]]` or `grep -P` |
| Ranking hypotheses by confidence alone | Rank by diagnostic cost; cheap low-confidence tests beat expensive high-confidence ones |
| Mixing regression hypotheses with always-broken ones | Apply temporal filter first; eliminates ~40% of hypotheses in one step |
| Fixing the most likely cause without a diagnostic test | Diagnostic confirms before remediation — avoids fixing the wrong thing |
| Assuming backend involvement without tracing data flow | Trace actual data flow first; mobile apps may run entirely on-device |

Tool-specific incident anti-patterns (dispatch direction, FK type asymmetry, pre-commit gitignore loop, Pint casing, Edit on single-line files, PHP display_errors) — see `reference.md`.

See `reference.md` for: Investigation Audit Pattern (8 steps), Frontend CSS rules, Reviewer Blocker Triage, Tooling Pitfalls, cost tiers, hypothesis examples, Sanctum triage, Playwright FE↔BE drift + backend-less `page.route` mocking (OPTIONS preflight, `run_code_unsafe` realm), git branch & merge hygiene + pre-push commit-contents check + fix-forward recovery for omitted-last-fix, CI-flake, Python `extra=` trap.
