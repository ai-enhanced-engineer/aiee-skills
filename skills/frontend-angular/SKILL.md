---
name: frontend-angular
description: Modern Angular 21+ patterns including signals, standalone components, zoneless change detection, and new control flow syntax (@if, @for). Use for Angular architecture decisions, implementing components with latest APIs, computed signal chains, select binding, ngModel two-way binding, or CanDeactivate guard patterns.
kb-sources:
  - wiki/software-engineering/frontend-angular
updated: 2026-06-03
---

# Angular Production Patterns

Production-ready patterns for Angular 21+ applications with zoneless change detection.

## Key APIs

| API | Purpose |
|-----|---------|
| `signal()` | Reactive state declaration |
| `computed()` | Derived values (auto-tracked) |
| `effect()` | Side effects on signal changes |
| `input()` | Component inputs (replaces @Input) |
| `output()` | Component outputs (replaces @Output) |
| `model()` | Two-way bindable signals |
| `viewChild()` | Signal-based DOM queries (replaces @ViewChild) |

## Performance Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| INP | < 200ms |
| CLS | < 0.1 |
| Initial Bundle | < 250KB |

## When NOT to Use Angular

- Simple interactivity → Vanilla JS
- Static marketing site → Astro/11ty
- < 100KB JS budget → Svelte or Web Components
- React ecosystem dependency → React

## Signal-Based Service Pattern

Private writable signal → public readonly → update in `tap()` → component injects and reads. Matches AuthService pattern for consistency across services.

## Signal Testing Patterns

| Pattern | Use Case |
|---------|----------|
| PLATFORM_ID mocking | Prevent constructor side effects in SSR tests |
| WritableSignal with `.set()` | Control signal state without reassignment |
| NG0100 prevention | Initialize signals before `detectChanges()` |

## Angular 21+ Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| `CommonModule` in standalone imports | Remove it (`@if`/`@for` don't need it) |
| `@ViewChild` decorator | `viewChild()` signal (reactive, no ExpressionChanged errors) |
| `setTimeout()` in components | `timer().pipe(takeUntilDestroyed())` (prevents memory leaks) |
| 401 handling in services | HTTP interceptor only (prevents conflicting error paths) |
| Public injected services | Private + local signal aliases (encapsulation) |
| Timer in service `tap()` | Auto-clear timers outlive component; move timer to component, expose `clearSaveSuccess()` on service |
| `effect()` in `ngOnInit` | Stacks subscriptions on re-init; use `toObservable(signal)` + `switchMap` + `takeUntilDestroyed` |
| `toObservable()` in `ngOnInit` | Throws `NG0203` — requires injection context; build chain as class field, `.subscribe()` in ngOnInit |
| `inputs: []` metadata property | Use `input()` signal API — `@angular-eslint/no-inputs-metadata-property` flags this |
| Direct property assignment in specs | `component.authService = mock` breaks with `protected`; use `{ provide: AuthService, useValue: mock }` in TestBed |
| `<div (click)>` without keyboard peer | ESLint `interactive-supports-focus`: add `(keydown)` + `tabindex="0"` + semantic `role` (e.g., `role="document"` for modal containers) |
| Single-slot in-flight marker cleared unconditionally | Capture the operation ID before the call; clear only when stored ID still matches — late responses otherwise clobber a newer operation's marker |
| Optimistic-insert CRUD reused for ephemeral entities (preview/draft) | Add a side-effect-free HTTP method that skips signal writes; reusing list-mutating CRUD pollutes shared list/counts with internal rows |

## Select Binding Gotcha

Angular's `<select [value]="signal()">` does not select the matching `<option>` — the browser uses `selectedIndex`, not the `value` attribute. The dropdown silently appears stuck on the first option. Two fixes: `[selected]="optionValue === signal()"` per `<option>`, or importing `FormsModule` and using `[(ngModel)]`.

## Progressive Signal Chain Pattern

For data transformation in presentational components, chaining computed signals with single responsibility keeps logic clean: `input → filtered → transformed → derived metrics`. Downstream signals derive from the filtered signal (not raw input), ensuring filter logic applies exactly once. This pattern naturally emerges in components displaying categorized, aggregated, or excluded data.

See `reference.md` for the Multi-Entity Page Pattern, CanDeactivate Guard Patterns, HTTP Error Handling Ownership, Debounced Signal-to-Iframe Preview, zoneless change detection, dependency injection, HTTP client patterns, Resource API, component libraries comparison (PrimeNG, Kendo, Angular Material), reactive forms, router patterns, and error handling.

See `examples.md` for dashboard metrics component, data table with filtering, authentication service, WebSocket service, and signal testing patterns (PLATFORM_ID mocking, WritableSignal, NG0100 prevention).
