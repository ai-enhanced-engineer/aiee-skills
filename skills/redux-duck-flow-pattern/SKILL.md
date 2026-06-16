---
name: redux-duck-flow-pattern
description: Redux Duck pattern with Flow type annotations. Actions, reducers, selectors, types, api, mappers in same folder per domain. Redux Thunk async actions, type-safe dispatch. Use when structuring Redux modules by domain or working in a Flow-typed React Native Redux codebase.
kb-sources:
  - wiki/software-engineering/redux-ducks
updated: 2026-05-21
---

# Redux Duck Pattern with Flow Types

Redux Duck pattern organizes actions, reducers, selectors, types, API, and mappers in a single feature folder with Flow type safety.

## When to Use

- React Native with Redux and Flow
- Feature-based code organization
- Type-safe Redux dispatch and selectors
- API layer separation from Redux logic
- Data transformation between backend and frontend

## Pattern Comparison

**Traditional** (Rails-style): Grouped by type (actions/, reducers/, selectors/)

**Duck** (Feature-based): Grouped by feature (user/, videos/)
```
src/data/user/
├── actions.js      # All user actions
├── reducers.js     # User reducer
├── selectors.js    # User selectors
├── types.js        # Flow types
├── api.js          # API calls
└── mappers.js      # Data transformers
```

## Duck Module Structure

| File | Purpose | Exports |
|------|---------|---------|
| `types.js` | Flow type definitions | Action types, State type, Domain models |
| `actions.js` | Action creators + thunks | Async actions, sync actions |
| `reducers.js` | State updates | Default export (reducer function) |
| `selectors.js` | State queries | Memoized selectors |
| `api.js` | Backend calls | API functions (axios) |
| `mappers.js` | Data transformation | DTO ↔ Domain mappers |

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Mixing action types across modules | Prefix with module: `USER_FETCH_REQUEST` |
| Not typing action creators | Use Flow union types for all actions |
| Business logic in reducers | Move to thunk actions or action creators |
| Not separating API calls | Create `api.js` module per domain |
| Expensive selectors without memoization | Use `reselect` for derived state |
| Tight coupling to backend | Use mappers to transform API responses |

**reference.md**: Duck pattern architecture, Flow typing patterns, ThunkAction types, API layer separation, mapper patterns, reselect optimization
**examples.md**: Complete duck modules (user, videos, connection), async actions with Flow, memoized selectors, API + mappers, real-world patterns
