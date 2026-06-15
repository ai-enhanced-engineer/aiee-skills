---
name: redux-persist-asyncstorage
description: Redux persistence for React Native using redux-persist + AsyncStorage. PersistGate rehydration, selective persistence, state migrations, logout cleanup. Use when adding persisted state to a React Native Redux app, or debugging rehydration or logout-cleanup issues.
kb-sources:
  - wiki/software-engineering/redux-persist
updated: 2026-05-21
---

# Redux Persist with AsyncStorage

Persist Redux state in React Native apps using redux-persist with AsyncStorage.

## When to Use

- React Native with Redux (offline-first)
- User preferences, profile data, app settings
- State rehydration on app restart
- Logout cleanup and state migrations

## AsyncStorage vs localStorage

| Aspect | AsyncStorage | localStorage |
|--------|-------------|-------------|
| **API** | Async (Promise-based) | Sync (blocking) |
| **Platform** | React Native | Browser |
| **Security** | Unencrypted | Unencrypted |

AsyncStorage is unencrypted on disk — tokens stored there are readable if the device is compromised; `react-native-keychain` / `expo-secure-store` write to the OS secure enclave.

## What to Persist

| State Type | Persist? | Reason |
|-----------|----------|--------|
| User profile | Yes | Core data for offline |
| Auth tokens | No | Use secure storage |
| Preferences | Yes | UX on restart |
| UI state | No | Transient |

## Testing: Store Isolation

When `store.js` runs `persistStore()` at module-load time, any test importing from it gets a dangling timer. Extract reducers into a side-effect-free file:

```js
// rootReducer.js — no persistence, safe for tests
export const appReducer = combineReducers({ auth, settings, ... });
export const rootReducer = (state, action) =>
  action.type === 'RESET' ? appReducer(undefined, action) : appReducer(state, action);

// store.js — production only
import { rootReducer } from './rootReducer';
const store = createStore(persistReducer(persistConfig, rootReducer));
export const persistor = persistStore(store);
```

Tests import from `rootReducer.js`; production code imports from `store.js`. Public API unchanged.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Persisting sensitive data | Use secure storage (keychain/expo-secure-store) |
| Persisting entire state | Use whitelist for selective persistence |
| No rehydration loading | Wrap with `<PersistGate>` |
| Not clearing on logout | Dispatch PURGE + removeItem |
| No state versioning | Use createMigrate with version |

**reference.md**: AsyncStorage API, PersistGate modes, state reconcilers, transforms, Redux Toolkit integration, performance best practices
**examples.md**: Complete store configuration, logout cleanup with PURGE, selective persistence, nested filtering, state migrations, real-world patterns
