---
name: testing-angular
description: Angular 21+ testing patterns with Vitest, signal component testing, and Playwright E2E. Use for writing unit tests, integration tests, or E2E tests for Angular applications, including Karma-to-Vitest migration.
kb-sources:
  - wiki/software-engineering/angular-testing
updated: 2026-05-21
---

# Angular Testing Patterns

Testing fundamentals for Angular 21+ applications with Vitest (Karma is deprecated).

## Testing Stack (Angular 21+)

| Tool | Purpose | Status |
|------|---------|--------|
| **Vitest** | Unit/integration tests | Default in v21 |
| **Jasmine** | Test syntax | Still supported |
| **Playwright** | E2E testing | Recommended |
| **Testing Library** | Component queries | Optional |

## Quick Setup

```bash
# New project (Vitest is default)
ng new my-app

# Migrate existing project from Karma
ng generate @angular/core:migrate-to-vitest
```

## Signal Component Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { CounterComponent } from './counter.component';

describe('CounterComponent', () => {
  it('should update signal and computed values', async () => {
    const fixture = TestBed.createComponent(CounterComponent);
    const component = fixture.componentInstance;

    // Initial state
    expect(component.count()).toBe(0);
    expect(component.doubled()).toBe(0);

    // Update signal
    component.count.set(5);

    // CRITICAL: Flush effects for signal updates
    TestBed.flushEffects();

    expect(component.count()).toBe(5);
    expect(component.doubled()).toBe(10);
  });
});
```

## Key Testing APIs

| API | Purpose |
|-----|---------|
| `TestBed.flushEffects()` | Flush signal effects (NEW in v21) |
| `fixture.detectChanges()` | Trigger change detection |
| `fixture.whenStable()` | Wait for async operations |
| `fakeAsync() / tick()` | Control time in tests (requires Zone.js — unavailable in zoneless) |
| `vi.useFakeTimers()` + `vi.advanceTimersByTimeAsync()` | Zoneless time control (Vitest replacement for fakeAsync/tick) |

## Test File Naming

```
component.spec.ts     # Unit tests
component.test.ts     # Alternative (Vitest style)
component.e2e.ts      # E2E tests (Playwright)
```

## When to Use Each Test Type

| Scenario | Test Type | Tool |
|----------|-----------|------|
| Signal logic | Unit | Vitest |
| Component rendering | Integration | Vitest + TestBed |
| User interactions | Integration | Vitest + Testing Library |
| Full user flows | E2E | Playwright |
| Visual regression | E2E | Playwright screenshots |

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| `npx vitest run` directly on Angular projects using `@angular/build:unit-test` | `ng test --no-watch` initializes TestBed, resolves path aliases (`@core/`), and provides DOM APIs. Direct vitest invocation bypasses all of this. |
| `// @vitest-environment jsdom` directive in Angular spec files | Omit entirely. Angular's test builder manages the environment. |
| Hardcoded expected values derived from fixture data (e.g., `'53 questions'`) | Compute expected values programmatically from the same fixture: `mockData.reduce((s, q) => s + q.count, 0)`. Hardcoded values silently break when fixtures change for unrelated tests. |

## Window Method Mocking

When testing code that accesses `window` (e.g., `window.confirm` in guards), spy on the method with `vi.spyOn(window, 'confirm')` rather than replacing the global. Deleting `globalThis.window` in jsdom breaks cross-suite tests — `window` IS the global object itself, and removing it causes `window is not defined` errors in unrelated specs (e.g., Angular Forms' `DefaultValueAccessor`).

See `examples.md` for the `vi.spyOn` window mocking pattern.

For QA code-review, accessibility auditing, or validating AI-generated Angular code, use `qa-angular` instead.

See `reference.md` for detailed patterns and `examples.md` for complete test suites.
