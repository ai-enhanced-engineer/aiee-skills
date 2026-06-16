---
name: react-zustand-patterns
description: Zustand 5.x state management patterns for React 18 including store slices, middleware, async actions, and performance optimization. Use when choosing a state library for React, structuring Zustand stores, or migrating from Redux/Context.
kb-sources:
  - wiki/software-engineering/react-zustand
updated: 2026-06-15
---

# Zustand State Management Patterns

Lightweight (< 1KB) state management for React with hook-based API, no providers, and first-class TypeScript support.

## When to Use

- Managing server state without React Query
- Global UI state (modals, theme, sidebar)
- Simple apps without Redux complexity
- Need minimal boilerplate with maximum flexibility
- Cross-component state without prop drilling
- Real-time state (chat, streaming, WebSocket)

## Quick Reference

### Basic Store Creation

Create stores with `create()` function:
- No providers needed, direct hook usage
- Actions co-located with state
- Selective subscriptions via selectors
- `set()` merges state by default
- `get()` reads current state without subscription

See **examples.md** for complete store implementations.

### Store with Middleware

Zustand middleware enhances stores:
- `devtools()` - Redux DevTools integration
- `persist()` - localStorage persistence
- `immer()` - Immutable state updates
- **Middleware order**: devtools (outer) → persist → immer → store (inner)

See **reference.md** for middleware configuration and TypeScript patterns.

## Key Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Slices** | Modular store organization | `{ ...userSlice, ...chatSlice }` |
| **Persist** | Save state to localStorage | `persist(store, { name: 'key' })` |
| **DevTools** | Redux DevTools integration | `devtools(store, { name: 'Store' })` |
| **Async Actions** | API calls, streaming | `async () => { const data = await fetch(); set({ data }); }` |
| **Optimistic Updates** | Instant UI feedback | Snapshot → update → rollback on error |
| **Shallow Compare** | Select multiple values | `useStore(useShallow(s => ({ a: s.a, b: s.b })))` |

## SSR-Safe Storage Reads

Reading `localStorage`/`sessionStorage` in a React render body crashes during SSR and `next export` prerender. The fix is a lazy `useState` initializer with a `typeof window` guard that runs once on mount (client-only). See `reference.md → SSR-Safe Storage` for the implementation.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| **Storing derived state** | Compute in selectors or getters using get() |
| **Direct mutation** | Use set() for state updates — direct mutation bypasses Zustand's subscription system and subscribers miss the change |
| **Not using functional updates** | Use set(state => ...) for state-dependent changes |
| **Creating stores in components** | Define stores at module level for reusability |
| **Subscribing to entire store** | Use selectors: useStore(state => state.count) |
| **Not memoizing selectors** | Wrap complex selectors in useCallback |
| **Persisting too much** | Use partialize to limit stored data |
| **`localStorage.getItem(...)` in render body** | Lazy `useState` initializer with `typeof window === "undefined"` guard |
| **Module-level object mutated after first paint (load-once store)** | Subscribe via `useSyncExternalStore` or return a versioned snapshot — direct mutation is invisible to React |
| **Fetch failure returns `[]` from a load-once reference store** | Return a BUNDLED fallback constant so first paint and offline still render; dependent forms never block |

---

**See reference.md** for complete store patterns, middleware configuration, TypeScript integration, and performance optimization.

**See examples.md** for production implementations including async actions, optimistic updates, and store slices from example-frontend.
