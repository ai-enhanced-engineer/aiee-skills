# Redux Persist with AsyncStorage Reference

Detailed patterns for persisting Redux state in React Native apps.

## AsyncStorage Fundamentals

### AsyncStorage vs localStorage

AsyncStorage is React Native's asynchronous, mobile-native counterpart to web localStorage.

#### Key Differences

| Aspect | AsyncStorage | localStorage |
|--------|-------------|-------------|
| **API Type** | Async (Promise-based) | Sync (blocking) |
| **Platform** | React Native (iOS/Android) | Browser |
| **Storage Mechanism** | SQLite (Android), Files (iOS) | Browser key-value store |
| **Import Path** | `@react-native-async-storage/async-storage` | `redux-persist/lib/storage` |
| **Capacity** | 6 MB total, 2 MB per record | 5-10 MB (browser-dependent) |
| **Security** | Unencrypted (plain text) | Unencrypted (plain text) |
| **Thread Blocking** | Non-blocking (async) | Blocks main thread |

#### Async vs Sync API

AsyncStorage uses a Promise-based asynchronous API, preventing UI blocking during storage operations:

```javascript
// AsyncStorage (React Native) - async
await AsyncStorage.setItem('key', 'value');
const value = await AsyncStorage.getItem('key');

// localStorage (Web) - sync
localStorage.setItem('key', 'value');
const value = localStorage.getItem('key');
```

Every AsyncStorage method returns a Promise, keeping the app's UI responsive even when reading or writing large amounts of data.

#### Platform Storage Mechanism

AsyncStorage stores data using native platform mechanisms:
- **Android**: SQLite database
- **iOS**: File-based storage

This differs from localStorage, which is a browser-based web API with a simpler key-value store implementation.

#### Import Path Migration

Modern React Native projects must use `@react-native-async-storage/async-storage` as a standalone package. The old AsyncStorage from `react-native` core was deprecated and removed.

**Old (deprecated)**:
```javascript
import { AsyncStorage } from 'react-native';  // ❌ No longer works
```

**New (correct)**:
```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';  // ✅
```

For redux-persist, import AsyncStorage explicitly:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import { persistStore, persistReducer } from 'redux-persist';

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,  // Mobile storage engine
    whitelist: ['user', 'settings'],
};
```

#### Storage Capacity Limits

AsyncStorage has platform-specific storage limits:
- **Default total**: 6 MB
- **Per record**: 2 MB

These limits are significantly smaller than web localStorage (typically 5-10 MB depending on browser), requiring mobile developers to be more selective about what state they persist.

#### API Methods

AsyncStorage provides nine core methods:

**Single Operations**:
- `setItem(key, value)`: Store value (must be string)
- `getItem(key)`: Retrieve value
- `mergeItem(key, value)`: Merge value (shallow merge for objects)
- `removeItem(key)`: Delete value
- `clear()`: Delete all values

**Batch Operations**:
- `multiSet(keyValuePairs)`: Store multiple key-value pairs
- `multiGet(keys)`: Retrieve multiple values
- `multiMerge(keyValuePairs)`: Merge multiple values
- `multiRemove(keys)`: Delete multiple keys

All methods are asynchronous and run concurrently without blocking other code.

#### Serialization Requirements

AsyncStorage only accepts string values. Objects must be serialized with `JSON.stringify()` before storage and deserialized with `JSON.parse()` when retrieved.

```javascript
// Manual serialization (direct AsyncStorage usage)
await AsyncStorage.setItem('user', JSON.stringify({ id: 1, name: 'John' }));
const user = JSON.parse(await AsyncStorage.getItem('user'));
```

Redux-persist handles serialization automatically, so you don't need to manually stringify/parse when using it.

#### Security Considerations

AsyncStorage is **unencrypted** on both iOS and Android. Data is stored in plain text, making it accessible to anyone with device access.

**AsyncStorage is unsuitable for**:
- Authentication tokens
- API keys
- Personally identifiable information (PII)
- Credit card data
- Any sensitive user data

**For sensitive data, use**:
- iOS: Keychain via `react-native-keychain` or `expo-secure-store`
- Android: Keystore via `react-native-keychain` or `expo-secure-store`

#### Recommended Use Cases

AsyncStorage excels at storing non-sensitive data like:
- User preferences (theme selection, language, font size)
- App settings (notifications enabled, offline mode)
- UI state (last viewed tab, scroll position)
- Non-sensitive cached data (public API responses)

For an offline-first mobile app with redux-persist, AsyncStorage is ideal for caching UI state, user preferences, and non-sensitive application data.

## Redux-Persist Setup

### Basic Configuration

```javascript
// store.js
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import { persistStore, persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import userReducer from './user/reducers';
import settingsReducer from './settings/reducers';

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    whitelist: ['user', 'settings'],  // Only persist these slices
};

const rootReducer = combineReducers({
    user: userReducer,
    settings: settingsReducer,
    ui: uiReducer,  // Not persisted (not in whitelist)
});

const persistedReducer = persistReducer(persistConfig, rootReducer);
export const store = createStore(persistedReducer, applyMiddleware(thunkMiddleware));
export const persistor = persistStore(store);
```

### PersistGate Integration

PersistGate is the recommended React component for delaying app rendering until persistence is complete.

```javascript
// App.js
import React from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './store';
import RootNavigator from './navigation';
import LoadingScreen from './components/LoadingScreen';

export default function App() {
    return (
        <Provider store={store}>
            <PersistGate loading={<LoadingScreen />} persistor={persistor}>
                <RootNavigator />
            </PersistGate>
        </Provider>
    );
}
```

**PersistGate Modes**:

**Mode 1: Loading prop** (most common):
```javascript
<PersistGate loading={<LoadingScreen />} persistor={persistor}>
    <App />
</PersistGate>
```

**Mode 2: Function children** (for custom transitions):
```javascript
<PersistGate persistor={persistor}>
    {(bootstrapped) => bootstrapped ? <App /> : <LoadingScreen />}
</PersistGate>
```

**Mode 3: No loading state** (blocks completely):
```javascript
<PersistGate loading={null} persistor={persistor}>
    <App />
</PersistGate>
```

Setting `loading={null}` renders nothing during rehydration, ensuring users never see the app in an uninitialized state. This is critical for offline-first apps where UI depends on rehydrated data.

## Rehydration and App Lifecycle

### REHYDRATE Action

During rehydration, redux-persist dispatches a `REHYDRATE` action containing the persisted state. Reducers can listen for this action to handle special initialization logic:

```javascript
const userReducer = (state = initialState, action) => {
    switch (action.type) {
        case 'persist/REHYDRATE':
            // Handle rehydration completion
            return { ...state, isHydrated: true };
        default:
            return state;
    }
};
```

### State Reconcilers

Redux-persist uses state reconcilers to determine how persisted state merges with initial reducer state. Three built-in reconcilers are available:

| Reconciler | Behavior | Use Case |
|-----------|----------|----------|
| `autoMergeLevel1` (default) | Shallow merge one level deep | Top-level state slices |
| `autoMergeLevel2` | Shallow merge two levels deep | Nested state structures |
| `hardSet` | Replace initial state completely | Nested persisters |

The default `autoMergeLevel1` shallow merges at the root level, meaning persisted values overwrite initial state for each top-level key.

For deeper state structures, use `autoMergeLevel2`:

```javascript
import { persistReducer } from 'redux-persist';
import autoMergeLevel2 from 'redux-persist/lib/stateReconciler/autoMergeLevel2';

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    stateReconciler: autoMergeLevel2,  // Deeper merging
};
```

### App Lifecycle Scenarios

React Native apps must handle multiple lifecycle scenarios:

1. **Cold start**: App launches for the first time (no persisted state)
2. **Warm restart**: App restarts after being closed (full rehydration from AsyncStorage)
3. **Background/foreground**: App returns from background (state already in memory, no rehydration needed)

PersistGate handles cold start and warm restart automatically. Background/foreground transitions don't trigger rehydration since Redux state remains in memory.

## Selective Persistence

### Whitelist vs Blacklist

Redux-persist provides two filtering approaches for selective persistence:

**Whitelist** (recommended):
```javascript
const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    whitelist: ['user', 'settings'],  // Only these persist
};
```

**Blacklist**:
```javascript
const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    blacklist: ['ui', 'temp'],  // Everything except these persists
};
```

**Whitelist is generally preferred** for production apps because it's explicit and safer—you opt-in to persistence rather than accidentally persisting sensitive or transient data.

**Important limitation**: Whitelist and blacklist only work one level deep. They filter root-level state slices but cannot filter nested properties.

### Nested Persistence

For deeper control, nest `persistReducer` calls at multiple state levels:

```javascript
import { combineReducers } from 'redux';
import { persistReducer } from 'redux-persist';

// Persist only specific user fields
const userPersistConfig = {
    key: 'user',
    storage: AsyncStorage,
    whitelist: ['profile', 'preferences'],  // Don't persist sessionToken
};

const rootReducer = combineReducers({
    user: persistReducer(userPersistConfig, userReducer),
    ui: uiReducer,  // Not persisted
});

const rootPersistConfig = {
    key: 'root',
    storage: AsyncStorage,
};

export default persistReducer(rootPersistConfig, rootReducer);
```

### What to Persist Guidelines

| State Type | Persist? | Reason |
|-----------|----------|--------|
| User profile (name, email) | Yes | Core user data for offline use |
| Authentication tokens | No | Security risk; use secure storage |
| User preferences (theme, language) | Yes | Improves UX on restart |
| UI state (modals, tabs, loading) | No | Transient; should reset on restart |
| Cache data (API responses) | Selective | Only non-sensitive, size-limited |
| Form draft data | Yes | Prevents data loss on app crash |
| Recent searches | Yes | Improves UX |
| Temporary flags | No | Reset on app restart |

## State Migrations

As your app evolves, persisted state structure will change. Redux-persist provides `createMigrate` for version management.

### Basic Migration Setup

```javascript
import { createMigrate } from 'redux-persist';

const migrations = {
    0: (state) => {
        // Version 0: Add new field
        return { ...state, newField: 'default' };
    },
    1: (state) => {
        // Version 1: Rename field
        const { oldField, ...rest } = state;
        return { ...rest, renamedField: oldField };
    },
    2: (state) => {
        // Version 2: Remove deprecated field
        const { deprecatedField, ...rest } = state;
        return rest;
    },
};

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    version: 2,  // Current version
    migrate: createMigrate(migrations, { debug: false }),
};
```

### How Migrations Work

Redux-persist compares the stored state's version against the current `version` config:
- **Stored version < current version**: Apply migrations sequentially (0 → 1 → 2) to bring state up to date
- **No stored version**: First install, skip migrations
- **Stored version = current version**: No migration needed

### Breaking State Changes

For breaking changes that cannot be migrated (e.g., complete restructure), use a version bump with state reset:

```javascript
const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    version: 3,  // Bump version
    migrate: (state) => {
        if (state._persist.version < 3) {
            // Cannot migrate from v2 to v3, reset state
            return Promise.resolve(undefined);
        }
        return Promise.resolve(state);
    },
};
```

### Testing Migrations

**Critical**: Always test state migrations with real production data before deployment. Migration bugs can cause data loss or app crashes for existing users.

```javascript
// Migration testing pattern
describe('State migrations', () => {
    it('migrates from v1 to v2', () => {
        const v1State = { oldField: 'value' };
        const migratedState = migrations[1](v1State);
        expect(migratedState.renamedField).toBe('value');
        expect(migratedState.oldField).toBeUndefined();
    });
});
```

## Logout Cleanup

Logout cleanup requires two actions: dispatching a PURGE action to clear redux-persist state and removing the persisted storage item.

### Complete Logout Pattern

```javascript
// actions.js
import { PURGE } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOGGED_OUT = 'LOGGED_OUT';

export const logout = () => async (dispatch) => {
    // 1. Call API to invalidate token
    try {
        await api.logout();
    } catch (error) {
        console.warn('Logout API call failed:', error);
    }

    // 2. Dispatch logout action (triggers state reset in root reducer)
    dispatch({ type: LOGGED_OUT });

    // 3. Dispatch PURGE to clear persisted state
    dispatch({ type: PURGE, key: 'root', result: () => null });

    // 4. Manually remove persisted storage (belt and suspenders)
    await AsyncStorage.removeItem('persist:root');
};
```

### Root Reducer State Reset

```javascript
// store.js
const rootReducer = (state, action) => {
    if (action.type === LOGGED_OUT) {
        // Reset state to undefined (will initialize with initial state)
        state = undefined;
    }
    return appReducer(state, action);
};
```

**Important**: Setting `state = undefined` resets the state to the initial reducer state. When the next action is dispatched, reducers will initialize with their default state.

## Transforms

For custom serialization (e.g., encrypting sensitive fields, handling non-JSON types), use transforms.

### Encryption Transform

```javascript
import { createTransform } from 'redux-persist';
import { encrypt, decrypt } from './crypto';

// Encrypt sensitive fields
const encryptTransform = createTransform(
    // Transform state before persisting
    (inboundState, key) => {
        if (key === 'user') {
            return { ...inboundState, email: encrypt(inboundState.email) };
        }
        return inboundState;
    },
    // Transform state after rehydrating
    (outboundState, key) => {
        if (key === 'user') {
            return { ...outboundState, email: decrypt(outboundState.email) };
        }
        return outboundState;
    },
    { whitelist: ['user'] }  // Only apply to user slice
);

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    transforms: [encryptTransform],
};
```

### Date Transform

```javascript
import { createTransform } from 'redux-persist';

// Handle Date objects (JSON.stringify converts to string)
const dateTransform = createTransform(
    // Persist: Date → ISO string
    (inboundState, key) => {
        if (inboundState.lastLogin instanceof Date) {
            return { ...inboundState, lastLogin: inboundState.lastLogin.toISOString() };
        }
        return inboundState;
    },
    // Rehydrate: ISO string → Date
    (outboundState, key) => {
        if (typeof outboundState.lastLogin === 'string') {
            return { ...outboundState, lastLogin: new Date(outboundState.lastLogin) };
        }
        return outboundState;
    },
    { whitelist: ['user'] }
);
```

## Redux Toolkit Integration

When using Redux Toolkit, configure the serializable check middleware to ignore redux-persist actions:

```javascript
import { configureStore } from '@reduxjs/toolkit';
import { FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';

const store = configureStore({
    reducer: persistedReducer,
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
            serializableCheck: {
                ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
            },
        }),
});
```

## Performance Best Practices

1. **Minimize Persisted State**: Only persist essential data. Large persisted state slows app startup.

2. **Use Whitelist**: Explicit whitelist prevents accidentally persisting transient UI state.

3. **Monitor Storage Size**: AsyncStorage has 6 MB total / 2 MB per record limits. Monitor state size carefully.

4. **Debounce Persistence**: For high-frequency state changes, consider debouncing persistence writes.

5. **Lazy Loading**: Don't persist large datasets. Fetch from API on demand.

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|-------------|---------|----------|
| **Persisting Sensitive Data** | Storing auth tokens, API keys, or PII in unencrypted AsyncStorage | Use secure storage (react-native-keychain, expo-secure-store) for tokens |
| **Persisting Entire State** | Including transient UI state wastes storage and causes confusing UX | Use explicit whitelist of only user-facing data |
| **No Rehydration Loading State** | Rendering app before rehydration causes flash of default/empty state | Always wrap with `<PersistGate loading={<LoadingScreen />}>` |
| **Not Clearing State on Logout** | Leaves previous user's data accessible to next user | Dispatch PURGE action and `storage.removeItem('persist:root')` |
| **No State Versioning** | Deploying app updates with breaking state changes causes crashes | Always increment `version` and provide `createMigrate` migrations |

## Terminology Update

Modern redux-persist versions use `allowlist` and `blocklist` instead of `whitelist` and `blacklist` for inclusive language. Both are supported for backward compatibility.

```javascript
const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    allowlist: ['user', 'settings'],  // Modern terminology
};
```
