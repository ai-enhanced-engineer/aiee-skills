# Redux Persist with AsyncStorage Examples

Example implementations for a React Native app showing redux-persist with AsyncStorage patterns.

## Complete Store Configuration

### store.js - Redux Persist Setup with Logout Cleanup

```javascript
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import data from '../index';
import { persistReducer, persistStore } from 'redux-persist';
import { LOGGED_OUT } from '../user/actions';
import AsyncStorage from '@react-native-async-storage/async-storage';

let middleware = [thunkMiddleware];

export const appReducer = combineReducers({
    data: data
});

const rootReducer = (state, action) => {
    if (action.type === LOGGED_OUT) {
        state = {
            data: {
                user: {
                    user: {
                        user: null,
                        token: null,
                        isLoggedIn: false
                    }
                }
            }
        };
    }
    return appReducer(state, action);
};

const persistConfig = {
    key: 'primary',
    storage: AsyncStorage
}

const persistedReducer = persistReducer(persistConfig, rootReducer);
export const store = createStore(persistedReducer,  applyMiddleware(...middleware));
export const persistor = persistStore(store);
```

**Pattern notes**:
- **AsyncStorage** imported from `@react-native-async-storage/async-storage` (modern import path)
- **Persist config** with key `'primary'` and AsyncStorage as storage engine
- **No whitelist/blacklist**: Persists entire state (all slices under `data`)
- **Logout cleanup**: `rootReducer` intercepts `LOGGED_OUT` action and resets state to initial structure (with null user/token)
- **Exports**: Both `store` and `persistor` exported for use in app

**Improvement opportunities**:
- Add `whitelist: ['user', 'settings']` to avoid persisting transient UI state
- Use `PURGE` action in logout handler for complete cleanup
- Remove hardcoded state structure in logout handler (better to set `state = undefined`)

---

## App Integration

### index.js - Provider Setup

```javascript
import 'react-native-gesture-handler';
import { registerRootComponent } from 'expo';
import { Provider } from 'react-redux';
import AuthProvider from './src/features/routes/Providers';
import { store } from './src/data/store/store';

function App() {
    return (
        <Provider store={store}>
            <AuthProvider />
        </Provider>
    );
}

registerRootComponent(App);
```

**Pattern notes**:
- Provider wraps AuthProvider with Redux store
- **Missing PersistGate**: This app does not use PersistGate, which is an anti-pattern
- Without PersistGate, app may render with unhydrated state (flash of empty/default content)

**Recommended improvement**:
```javascript
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './src/data/store/store';
import LoadingScreen from './src/features/components/loading/LoadingSpinner';

function App() {
    return (
        <Provider store={store}>
            <PersistGate loading={<LoadingScreen />} persistor={persistor}>
                <AuthProvider />
            </PersistGate>
        </Provider>
    );
}
```

---

## Improved Logout Handler

### actions.js - Complete Logout with PURGE

```javascript
import { PURGE } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const LOGGED_OUT = 'LOGGED_OUT';

export const logout = () => async (dispatch) => {
    // 1. Call API to invalidate token (if applicable)
    try {
        await api.logout();
    } catch (error) {
        console.warn('Logout API call failed:', error);
    }

    // 2. Dispatch logout action (triggers state reset in root reducer)
    dispatch({ type: LOGGED_OUT });

    // 3. Dispatch PURGE to clear persisted state
    dispatch({ type: PURGE, key: 'primary', result: () => null });

    // 4. Manually remove persisted storage (belt and suspenders)
    await AsyncStorage.removeItem('persist:primary');
};
```

**Improved root reducer**:
```javascript
const rootReducer = (state, action) => {
    if (action.type === LOGGED_OUT) {
        // Reset to undefined (will initialize with reducer's initial state)
        state = undefined;
    }
    return appReducer(state, action);
};
```

**Pattern notes**:
- **PURGE action**: Dispatched with key matching persistConfig key (`'primary'`)
- **Manual removal**: `AsyncStorage.removeItem('persist:primary')` ensures cleanup even if PURGE fails
- **State reset**: Setting `state = undefined` is cleaner than hardcoding reset structure
- **API logout**: Invalidates token on server (if using server-side sessions)

---

## Selective Persistence with Whitelist

### Improved Store Configuration

```javascript
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import { persistReducer, persistStore } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import userReducer from '../user/reducers';
import settingsReducer from '../settings/reducers';
import uiReducer from '../ui/reducers';

const rootReducer = combineReducers({
    user: userReducer,
    settings: settingsReducer,
    ui: uiReducer,  // Transient UI state (should not persist)
});

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    whitelist: ['user', 'settings'],  // Only persist user and settings
    // ui is excluded (not in whitelist)
};

const persistedReducer = persistReducer(persistConfig, rootReducer);
export const store = createStore(persistedReducer, applyMiddleware(thunkMiddleware));
export const persistor = persistStore(store);
```

**Pattern notes**:
- **Whitelist**: Explicitly lists slices to persist (`user`, `settings`)
- **Excluded slices**: `ui` is not persisted (resets on app restart)
- **Benefits**: Smaller persisted state, no transient UI state, faster rehydration

---

## Nested Persistence for Deep Filtering

### User Slice with Selective Field Persistence

```javascript
import { combineReducers } from 'redux';
import { persistReducer } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import userReducer from '../user/reducers';
import settingsReducer from '../settings/reducers';

// Persist only specific user fields
const userPersistConfig = {
    key: 'user',
    storage: AsyncStorage,
    whitelist: ['profile', 'preferences'],  // Don't persist sessionToken
};

const rootReducer = combineReducers({
    user: persistReducer(userPersistConfig, userReducer),
    settings: settingsReducer,
});

const rootPersistConfig = {
    key: 'root',
    storage: AsyncStorage,
    whitelist: ['user', 'settings'],
};

export default persistReducer(rootPersistConfig, rootReducer);
```

**User reducer structure**:
```javascript
// user/reducers.js
const initialState = {
    profile: null,        // ✅ Persisted
    preferences: {},      // ✅ Persisted
    sessionToken: null,   // ❌ Not persisted (security)
    isLoading: false,     // ❌ Not persisted (transient)
};
```

**Pattern notes**:
- **Nested persist**: User slice has its own persistConfig
- **Whitelist nested fields**: Only `profile` and `preferences` persist
- **Security**: `sessionToken` excluded from persistence (should use secure storage)
- **Transient state**: `isLoading` excluded (resets on app restart)

---

## State Migration Example

### Version Migration for Breaking Changes

```javascript
import { createMigrate } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

const migrations = {
    0: (state) => {
        // Version 0: Add new preferences field
        return {
            ...state,
            settings: {
                ...state.settings,
                preferences: { theme: 'light', language: 'en' },
            },
        };
    },
    1: (state) => {
        // Version 1: Rename user.name to user.fullName
        return {
            ...state,
            user: {
                ...state.user,
                fullName: state.user.name,
                name: undefined,  // Remove old field
            },
        };
    },
    2: (state) => {
        // Version 2: Move nested structure
        return {
            ...state,
            user: {
                ...state.user,
                profile: {
                    ...state.user.profile,
                    email: state.user.email,  // Move email into profile
                },
                email: undefined,  // Remove old location
            },
        };
    },
};

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    version: 2,  // Current version
    migrate: createMigrate(migrations, { debug: __DEV__ }),
    whitelist: ['user', 'settings'],
};
```

**Migration flow**:
1. App v1.0: State stored with version 0
2. App v2.0: State stored with version 1 (migrates 0 → 1 on first launch)
3. App v3.0: State stored with version 2 (migrates 1 → 2 on first launch)

**Pattern notes**:
- **Sequential migrations**: Applied in order (0 → 1 → 2)
- **Debug mode**: `debug: __DEV__` logs migration steps during development
- **Testing**: Test migrations with real production data before deployment

---

## Custom Transform for Encryption

### Encrypting Sensitive User Fields

```javascript
import { createTransform } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encrypt, decrypt } from './crypto';  // Custom encryption utils

// Encrypt sensitive fields before persisting
const encryptTransform = createTransform(
    // Inbound: State → Storage (encrypt before persisting)
    (inboundState, key) => {
        if (key === 'user' && inboundState.email) {
            return {
                ...inboundState,
                email: encrypt(inboundState.email),
            };
        }
        return inboundState;
    },
    // Outbound: Storage → State (decrypt after rehydrating)
    (outboundState, key) => {
        if (key === 'user' && outboundState.email) {
            return {
                ...outboundState,
                email: decrypt(outboundState.email),
            };
        }
        return outboundState;
    },
    { whitelist: ['user'] }  // Only apply to user slice
);

const persistConfig = {
    key: 'root',
    storage: AsyncStorage,
    transforms: [encryptTransform],
    whitelist: ['user', 'settings'],
};
```

**Pattern notes**:
- **Transform pipeline**: Runs before persistence and after rehydration
- **Selective application**: `{ whitelist: ['user'] }` applies only to user slice
- **Security note**: AsyncStorage encryption is better than plain text, but secure storage (Keychain/Keystore) is still preferred for highly sensitive data

---

## PersistGate with Custom Loading State

### App.js with PersistGate (Recommended Pattern)

```javascript
import React from 'react';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './data/store/store';
import Routes from './features/routes/Routes';
import LoadingSpinner from './features/components/loading/LoadingSpinner';

export default function App() {
    return (
        <Provider store={store}>
            <PersistGate loading={<LoadingSpinner />} persistor={persistor}>
                <Routes />
            </PersistGate>
        </Provider>
    );
}
```

**Alternative: Function children pattern**

```javascript
<PersistGate persistor={persistor}>
    {(bootstrapped) => {
        if (!bootstrapped) {
            return <LoadingSpinner />;
        }
        return <Routes />;
    }}
</PersistGate>
```

**Pattern notes**:
- **Loading prop**: Shows `<LoadingSpinner />` during rehydration
- **Blocks render**: App does not render until persistence is complete
- **Prevents flash**: No flash of empty/default state on app restart
- **Function children**: Provides more control over loading → ready transition

---

## Anti-Pattern: No PersistGate

### Current Project Pattern (Anti-Pattern)

```javascript
// ❌ Anti-pattern: No PersistGate
function App() {
    return (
        <Provider store={store}>
            <AuthProvider />
        </Provider>
    );
}
```

**Problems**:
1. App renders immediately, before rehydration completes
2. User sees flash of empty/default state (e.g., logged out screen)
3. After rehydration, app suddenly switches to logged-in state (confusing UX)
4. Race condition: Components may dispatch actions before state is rehydrated

**Fix**:
```javascript
// ✅ Good: Add PersistGate
import { PersistGate } from 'redux-persist/integration/react';
import { persistor } from './src/data/store/store';

function App() {
    return (
        <Provider store={store}>
            <PersistGate loading={<LoadingScreen />} persistor={persistor}>
                <AuthProvider />
            </PersistGate>
        </Provider>
    );
}
```

---

## Secure Token Storage (Complementary Pattern)

### Using expo-secure-store for Tokens

```javascript
// actions.js
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const login = (email, password) => async (dispatch) => {
    dispatch({ type: 'LOGIN_REQUEST' });

    try {
        const response = await api.login(email, password);

        // ✅ Store token in secure storage (encrypted)
        await SecureStore.setItemAsync('authToken', response.token);

        // ✅ Store non-sensitive user data in redux-persist (AsyncStorage)
        dispatch({
            type: 'LOGIN_SUCCESS',
            user: {
                id: response.user.id,
                name: response.user.name,
                email: response.user.email,
            },
        });
    } catch (error) {
        dispatch({ type: 'LOGIN_FAILURE', error: error.message });
    }
};

export const logout = () => async (dispatch) => {
    // Remove token from secure storage
    await SecureStore.deleteItemAsync('authToken');

    // Clear redux-persist state
    dispatch({ type: 'LOGGED_OUT' });
    await AsyncStorage.removeItem('persist:root');
};
```

**Pattern notes**:
- **Tokens in SecureStore**: Auth tokens stored in platform-secure storage (Keychain/Keystore)
- **User data in AsyncStorage**: Non-sensitive user profile persisted via redux-persist
- **Best of both worlds**: Security for tokens, convenience for user data
- **Rehydration**: On app restart, check SecureStore for token and fetch user data from AsyncStorage

---

## Key Patterns

1. **AsyncStorage Import**: Use `@react-native-async-storage/async-storage` (modern package)
2. **Logout Cleanup**: Intercept `LOGGED_OUT` action in root reducer to reset state
3. **No Whitelist**: the example app persists entire state (improvement opportunity: add whitelist)
4. **No PersistGate**: Anti-pattern — should add PersistGate to prevent flash of unhydrated state
5. **Secure Storage Separation**: Tokens stored in `expo-secure-store`, user data in redux-persist (good pattern)
6. **Manual State Reset**: Logout handler hardcodes reset structure (improvement: use `state = undefined`)

**Production recommendations**:
- Add `whitelist: ['user', 'settings']` to persistConfig
- Add `<PersistGate loading={<LoadingScreen />}>` wrapper
- Use `PURGE` action in logout handler
- Consider state versioning for future app updates
