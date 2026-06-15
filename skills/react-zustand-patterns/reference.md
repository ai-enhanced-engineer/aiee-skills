# Zustand State Management - Reference Documentation

Comprehensive guide to Zustand 5.x state management patterns for React 18 applications.

## Table of Contents

1. [Store Creation](#store-creation)
2. [Middleware](#middleware)
3. [Store Slices](#store-slices)
4. [Performance Optimization](#performance-optimization)
5. [TypeScript Integration](#typescript-integration)
6. [Best Practices](#best-practices)

---

## Store Creation

### Basic Pattern

```javascript
import { create } from 'zustand';

const useStore = create((set, get) => ({
  // State
  count: 0,
  items: [],

  // Actions
  increment: () => set((state) => ({ count: state.count + 1 })),
  addItem: (item) => set((state) => ({ items: [...state.items, item] })),
  reset: () => set({ count: 0, items: [] }),
}));
```

**Key Concepts**:
- `set(updates)` - Merges partial state (shallow merge)
- `set(fn)` - Functional update based on current state
- `set(updates, true)` - Replace state entirely (no merge)
- `get()` - Read current state without subscribing

### State Updates

**Merge (Default)**:
```javascript
set({ count: 5 });  // Merges { count: 5 } into existing state
```

**Replace**:
```javascript
set({ count: 5 }, true);  // Replaces entire state with { count: 5 }
```

**Functional**:
```javascript
set((state) => ({ count: state.count + 1 }));  // Based on current state
```

---

## Middleware

### devtools Middleware

Integrate with Redux DevTools for time-travel debugging.

```javascript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const useStore = create()(
  devtools(
    (set) => ({
      count: 0,
      increment: () => set((state) => ({ count: state.count + 1 }), undefined, 'increment'),
    }),
    { name: 'CounterStore' }
  )
);
```

**Action Naming**:
```javascript
set(
  { count: 1 },
  false,  // replace = false (merge)
  'counter/increment'  // Action name in DevTools
)
```

**Configuration**:
- `name` - Store identifier in DevTools
- `enabled` - Enable/disable (default: true in dev)
- `anonymousActionType` - Default action name
- `actionsDenylist` - Filter actions from DevTools

### persist Middleware

Save state to localStorage, sessionStorage, or custom storage.

```javascript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const useStore = create()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setUser: (user) => set({ user }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ user: state.user, token: state.token }),
      version: 1,
      migrate: (persistedState, version) => {
        if (version === 0) {
          persistedState.newField = 'default';
        }
        return persistedState;
      },
    }
  )
);
```

**Options**:
- `name` - Storage key (required)
- `storage` - Storage engine (localStorage, sessionStorage, AsyncStorage)
- `partialize` - Select which state to persist
- `version` - Schema version for migrations
- `migrate` - Transform persisted state on version change
- `skipHydration` - Disable auto-rehydration (for SSR)

**API Methods**:
```javascript
useStore.persist.clearStorage();      // Clear persisted data
useStore.persist.rehydrate();         // Manual rehydration
useStore.persist.hasHydrated();       // Check if rehydrated
useStore.persist.onFinishHydration(); // Subscribe to completion
```

### Combining Middleware

**Order matters**: devtools (outer) → persist → store

```javascript
const useStore = create()(
  devtools(
    persist(
      (set) => ({ /* state */ }),
      { name: 'storage-key' }
    ),
    { name: 'StoreName' }
  )
);
```

---

## Store Slices

Divide large stores into modular, domain-specific pieces.

### Slice Definition

```javascript
// userSlice.js
export const createUserSlice = (set, get) => ({
  user: null,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
});

// chatSlice.js
export const createChatSlice = (set, get) => ({
  messages: [],
  addMessage: (msg) => set((state) => ({
    messages: [...state.messages, msg]
  })),
  sendMessage: async (text) => {
    const user = get().user;  // Access user slice
    if (!user) return;

    const message = { text, userId: user.id };
    set((state) => ({ messages: [...state.messages, message] }));
  },
});
```

### Combining Slices

```javascript
// store.js
import { create } from 'zustand';
import { createUserSlice } from './userSlice';
import { createChatSlice } from './chatSlice';

const useStore = create()(
  devtools(
    (...args) => ({
      ...createUserSlice(...args),
      ...createChatSlice(...args),
    }),
    { name: 'AppStore' }
  )
);
```

**Key Points**:
- Apply middleware to combined store, not individual slices
- Use spread operator to merge slices
- Slices can access each other via `get()`

---

## Performance Optimization

### Selector Patterns

**Problem**: Returns new object every render → unnecessary re-renders

```javascript
// ❌ Bad: Creates new object
const { a, b } = useStore((state) => ({ a: state.a, b: state.b }));
```

**Solution 1**: useShallow

```javascript
import { useShallow } from 'zustand/react/shallow';

const { a, b } = useStore(useShallow((state) => ({ a: state.a, b: state.b })));
```

**Solution 2**: Split selectors

```javascript
const a = useStore((state) => state.a);
const b = useStore((state) => state.b);
```

**Solution 3**: Memoize in component

```javascript
const todos = useStore((state) => state.todos);
const activeTodos = useMemo(() => todos.filter(t => t.active), [todos]);
```

### Avoiding Re-renders

**Separate state and actions**:
```javascript
// State subscription
const count = useStore((state) => state.count);

// Action subscription (doesn't cause re-render)
const increment = useStore((state) => state.increment);
```

**Use React.memo for expensive children**:
```javascript
const ExpensiveChild = React.memo(({ data }) => {
  // Expensive rendering
  return <div>{/* ... */}</div>;
});
```

---

## TypeScript Integration

### Basic Type Annotation

```typescript
interface BearState {
  bears: number;
  increasePopulation: () => void;
  removeAllBears: () => void;
}

const useBearStore = create<BearState>()((set) => ({
  bears: 0,
  increasePopulation: () => set((state) => ({ bears: state.bears + 1 })),
  removeAllBears: () => set({ bears: 0 }),
}));
```

**Note**: Extra parentheses `create<T>()()` required for TypeScript.

### Typing with Middleware

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

interface UserState {
  user: User | null;
  setUser: (user: User) => void;
}

const useUserStore = create<UserState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        setUser: (user) => set({ user }),
      }),
      { name: 'user-storage' }
    ),
    { name: 'UserStore' }
  )
);
```

### Typing Slices

```typescript
import { StateCreator } from 'zustand';

interface UserSlice {
  user: User | null;
  setUser: (user: User) => void;
}

interface ChatSlice {
  messages: Message[];
  sendMessage: (text: string) => void;
}

type StoreState = UserSlice & ChatSlice;

const createUserSlice: StateCreator<StoreState, [], [], UserSlice> = (set) => ({
  user: null,
  setUser: (user) => set({ user }),
});

const createChatSlice: StateCreator<StoreState, [], [], ChatSlice> = (set, get) => ({
  messages: [],
  sendMessage: (text) => {
    const user = get().user;  // Type-safe access
    if (!user) return;

    set((state) => ({
      messages: [...state.messages, { text, userId: user.id }],
    }));
  },
});

const useStore = create<StoreState>()((...args) => ({
  ...createUserSlice(...args),
  ...createChatSlice(...args),
}));
```

---

## Best Practices

### Store Design

- Define stores at module level, not inside components
- Use multiple small stores over one large monolithic store
- Separate concerns: one store per domain (auth, chat, ui)
- Keep actions co-located with state
- Use TypeScript for type safety

### State Updates

- Always use `set()` for updates (never mutate directly)
- Use functional form when updating based on current state
- Provide action names to devtools for better debugging
- Keep state shape flat (avoid deep nesting)
- Store only essential data, derive computed values

### Performance

- Always use selectors, even for single values
- Use `useShallow` when selecting multiple primitive properties
- Separate action subscriptions from state subscriptions
- Memoize expensive computations with `useMemo`
- Avoid creating new objects/arrays in selectors

### Middleware

- Apply middleware only to combined store
- Use devtools as outermost wrapper
- Enable devtools only in development
- Use `partialize` to persist only essential state
- Version persisted state and provide migrations

---

## Load-Once External Reference Store

Some stores hold reference data fetched once at startup (e.g., country lists, category taxonomies, feature flags). Two footguns surface when the store is implemented as a module-level mutable object:

### Re-render Footgun

A component reading a module-level object synchronously captures the value at render time. If the object is mutated after first paint (e.g., after an async fetch resolves), React has no signal to re-render consumers — they display stale data indefinitely.

A `setTick(t => t + 1)` workaround forces a re-render from a single consumer but is a manual signal that the next consumer will forget to wire.

**Fix**: expose the store via `useSyncExternalStore` so React's scheduler manages re-render propagation:

```ts
import { useSyncExternalStore } from 'react';

let referenceData: ReferenceItem[] = BUNDLED_FALLBACK;
let listeners: (() => void)[] = [];

function subscribe(cb: () => void) {
  listeners.push(cb);
  return () => { listeners = listeners.filter(l => l !== cb); };
}

function getSnapshot() { return referenceData; }

export function setReferenceData(data: ReferenceItem[]) {
  referenceData = data;
  listeners.forEach(l => l());
}

export function useReferenceData() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
```

Alternatively, hold the data inside a Zustand store (which uses `useSyncExternalStore` internally) and avoid the module-level object entirely.

### Fetch-with-Bundled-Fallback

Load-once stores that return `[]` on fetch failure leave dependent forms blank and block user progress even when offline.

**Pattern**: initialize the store with a BUNDLED constant (compiled into the JS bundle) rather than an empty array. The fetch attempt upgrades the data; on failure the fallback remains:

```ts
import { BUNDLED_CATEGORIES } from './bundledData'; // compiled at build time

let referenceData: Category[] = BUNDLED_CATEGORIES; // never []

async function loadReferenceData() {
  try {
    const fresh = await fetchCategories();
    setReferenceData(fresh);
  } catch {
    // Fallback already in place — no action needed
  }
}
```

Bundled fallback guarantees: first paint renders, offline renders, dependent forms never block on network. The fallback may be stale (ship it at build time; fetch upgrades it at runtime).

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| **Storing derived state** | Compute in selectors or getters using `get()` |
| **Mutating state directly** | Always use `set()` — direct mutation bypasses Zustand's subscription system |
| **Not using functional updates** | Use `set(state => ...)` for state-dependent changes |
| **Creating stores in components** | Define stores at module level for reusability |
| **Subscribing to entire store** | Use selectors: `useStore(state => state.count)` |
| **Over-normalizing state** | Keep denormalized for small apps |
| **Persisting too much data** | Use `partialize` to limit stored data |
| **Complex selectors without memoization** | Use `useMemo` or getters |
| **Not using shallow equality** | Use `useShallow` when selecting objects |
| **Forgetting action names** | Provide name as 3rd param to `set()` for DevTools |
| **Applying middleware to slices** | Apply to combined store only |
| **Storing component UI state globally** | Keep local in `useState` |
| **Module-level object mutated after first paint** | Subscribe via `useSyncExternalStore` or use a Zustand store |
| **Fetch failure returns `[]` from load-once store** | Initialize with a BUNDLED fallback constant — never `[]` |

---

## References

### Official Documentation
- [Zustand GitHub](https://github.com/pmndrs/zustand)
- [Zustand Docs](https://zustand.docs.pmnd.rs/)
- [Redux DevTools Extension](https://github.com/reduxjs/redux-devtools)

### Best Practices
- [Working with Zustand - TkDodo](https://tkdodo.eu/blog/working-with-zustand)
- [Zustand Best Practices](https://www.projectrules.ai/rules/zustand)
- [Zustand Architecture Patterns](https://brainhub.eu/library/zustand-architecture-patterns-at-scale)

### Comparison
- [Zustand vs Redux](https://betterstack.com/community/guides/scaling-nodejs/zustand-vs-redux/)
- [State Management 2026](https://veduis.com/blog/state-management-comparing-zustand-signals-redux/)

## SSR-Safe Storage

Reading `localStorage`/`sessionStorage` in a React render body crashes during SSR and `next export` prerender. Use a lazy `useState` initializer with a `typeof window` guard:

```ts
const [isAuthenticated] = useState<boolean>(() => {
  if (typeof window === "undefined") return false;
  return !!(localStorage.getItem("token") || sessionStorage.getItem("token"));
});
```

