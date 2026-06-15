---
name: unit-test-standards
description: Unit test standards across Python (pytest), PHP/Laravel (PHPUnit + Pint), TypeScript/React (Vitest), and Swift (Swift Testing). Covers naming conventions (test__<what>__<expected>), behavioral testing patterns, coverage requirements, tautological test detection, flaky test avoidance, and language-specific addenda covering test false-positives in framework-specific contexts. Use when reviewing or writing tests, enforcing coverage thresholds, debugging false-positive test traps, or onboarding multi-language test infrastructure.
kb-sources:
  - wiki/software-engineering/unit-test-standards
updated: 2026-06-15
allowed-tools: Read, Grep, Glob
---

# Python Unit Test Standards

Standards for writing meaningful, maintainable tests that verify behavior.

## Test Naming Convention

| Type | Pattern | Example |
|------|---------|---------|
| Unit | `test__<what>__<expected>` (Python/PHP convention; Swift uses a different convention — see Swift Testing Conventions section) | `test__batch_allocation__reduces_available_quantity` |
| Integration | `test__<component>__<behavior>` | `test__repository__saves_and_retrieves_batch` |
| E2E | `test__<use_case>__<scenario>` | `test__order_allocation__happy_path` |

## Quality Criteria

| Good (Behavioral) | Bad (Tautological) |
|-------------------|-------------------|
| Test outcomes and state changes | Assert mocked return values |
| Use real objects where possible | Test that assignment works |
| Verify domain invariants | Tests with no assertions |
| Test error conditions explicitly | Test implementation details |

## Coverage Requirements

| Scope | Minimum | Target |
|-------|---------|--------|
| New code | 80% | 90% |
| Critical paths | 95% | 100% |
| Overall project | 70% | 80% |

## File Organization

Structure: `tests/{unit,integration,e2e}/` + `conftest.py`. See `examples.md` for full directory tree with source mirroring.

## Tautological Test Detection

Tests that can't fail provide false confidence. Five patterns: mock assertion (asserting what you told the mock to return), assignment test (`x = 5; assert x == 5`), empty test (no assertions), implementation test (HOW not WHAT), timing assertion (flaky on CI load).

**Red Flags in test names:** "sets", "receives", "stores", "assigns" (mechanics, not behavior). Svelte/Web: tests verifying prop passing or store assignment instead of DOM output — see `examples.md`.

**Forwarding-wrapper shape assertion:** A wrapper that forwards a payload unchanged should not be tested by asserting it received the verbatim payload — that tests nothing. Test the real transforms (URL construction, response unwrap) and assert field shape via `expect.objectContaining({ key: expect.any(Type) })`. Shape assertions still fail on key-name regressions without echoing the literal value. See `reference.md → Tautological Test Detection → Pattern 6`.

**CSS/utility class-string assertion as a behavioral guarantee:** `className.toContain("min-h-[44px]")` under jsdom tests the string, not the rendered size — jsdom cannot compute layout. Assert a stable `data-*` contract attribute the component declares instead. Common in component tests claiming WCAG touch-target or sizing guarantees. See `reference.md → Tautological Test Detection → Pattern 7`.

## Assertion Strength Guidelines

See `reference.md → Assertion Strength Guidelines` for `> 0` trap, meaningful lower bounds, and Double threshold boundary testing (Swift numeric types).

## Mock Default Tautology

When a mock's `reset()` or shallow envelope causes the assertion to pass regardless of the transform under test, the test provides false confidence. See `reference.md → Mock-Fidelity Tautology` for the shape-shallow-mock pattern; reset-default row is in `reference.md → Additional Anti-Patterns`.

## Additional Anti-Patterns

Four rows kept inline above (ORDER BY reverse-insertion, `assert_not_called()` on unwired mock, key-existence-only, timing assertion). Full extended catalog — see `reference.md → Additional Anti-Patterns`.

## Reference Pointers

Depth in `reference.md`:
- **Testing Specialized Domains** — AI/LLM grounding, Pydantic security, async SQLAlchemy, JSDOM, TypeScript signals, Django two-conftest, aiohttp async context managers
- **Env-Gated Feature Test Suite** — three-layer pattern for env-var-gated features (runtime-allowlist, happy-path, cache-identity)
- **Laravel Testing Addendum** — Sanctum revocation, Pint snake_case, RefreshDatabase gap, SDK mocking, coverage scoping
- **Vitest Patterns Addendum** — `vi.hoisted`, `vi.resetModules()` + dynamic import

See `examples.md` for code comparisons across all test patterns.

## Swift Testing Conventions (language-specific addendum)

Swift uses `<what>__<expected>` (no `test__` prefix). SwiftLint's `identifier_name` rule rejects names under 3 characters and blocks the pre-commit hook. See `reference.md → Swift Testing Conventions` for `@Suite(.serialized)` naming, `type_body_length` splitting, and anti-pattern table.
