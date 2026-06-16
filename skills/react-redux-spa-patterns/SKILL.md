---
name: react-redux-spa-patterns
description: React 17 + Redux + React Router v6 patterns for Laravel SPAs. Redux Thunk async actions, redux-persist state hydration, feature-based architecture, form handling with Formik + Yup. Use for React SPA development, state management, routing, or form validation.
kb-sources:
  - wiki/software-engineering/react-redux-spa
updated: 2026-05-21
---

# React + Redux SPA Patterns

Modern React 17 SPA patterns with Redux Thunk, React Router v6, redux-persist, and Formik for Laravel backends.

## When to Use

- Building React SPAs with Laravel backends
- Implementing Redux state management
- Setting up React Router v6 navigation
- Creating forms with Formik + Yup
- Managing authenticated sessions with redux-persist
- Integrating with Sanctum API authentication

## Feature-Based Architecture

```
src/
├── features/
│   ├── auth/          # Login, logout, auth state
│   ├── training/      # Courses, modules
│   ├── videos/        # Video library
│   └── user/          # Profile, settings
├── data/              # Redux slices
│   └── users/
│       ├── actions.js     # Thunk actions
│       ├── reducer.js     # State logic
│       └── selectors.js   # Memoized selectors
└── store.js           # Redux store + persist
```

## Redux Flow

```
Component → dispatch(asyncAction)
         → Thunk (API call)
         → dispatch(success/failure)
         → Reducer updates state
         → Component re-renders
```

## Quick Reference

### Redux Thunk Async Action

```javascript
export const fetchUser = () => async (dispatch) => {
    dispatch({ type: 'USER_LOADING' });
    try {
        const response = await axios.get('/api/user');
        dispatch({ type: 'USER_SUCCESS', payload: response.data });
    } catch (error) {
        dispatch({ type: 'USER_ERROR', payload: error.message });
    }
};
```

### redux-persist Setup

```javascript
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';

const persistConfig = {
    key: 'root',
    storage,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);
export const store = createStore(persistedReducer, applyMiddleware(thunk));
export const persistor = persistStore(store);
```

### Logout Cleanup

```javascript
const rootReducer = (state, action) => {
    if (action.type === 'LOGGED_OUT') {
        state = undefined;  // Reset state
    }
    return appReducer(state, action);
};
```

## React Router v6 Hooks

| Hook | Use Case | Example |
|------|----------|---------|
| `useNavigate` | Programmatic navigation | `navigate('/dashboard')` |
| `useParams` | URL parameters | `const { id } = useParams()` |
| `useLocation` | Current location | `location.pathname` |
| `useSearchParams` | Query strings | `const [params] = useSearchParams()` |

## Formik + Yup Pattern

```javascript
<Formik
    initialValues={{ email: '', password: '' }}
    validationSchema={yup.object({
        email: yup.string().email().required(),
        password: yup.string().min(8).required()
    })}
    onSubmit={async (values) => {
        await dispatch(login(values));
    }}
>
    {({ errors, touched }) => (
        <Form>
            <Field name="email" />
            {errors.email && touched.email && <div>{errors.email}</div>}
        </Form>
    )}
</Formik>
```

## Imperative DOM Bridge — Stale-Closure Fix

When bridging an imperative library (maplibre-gl, Leaflet, d3) to React state, event handlers registered on library objects capture stale state values. The pattern: mirror state into a `useRef` and read the ref inside handlers. See **reference.md → "Imperative DOM Bridge"** for the full snippet and companion anti-patterns.

## Common Pitfalls

| Anti-Pattern | Solution |
|--------------|----------|
| Prop drilling | Use Redux `useSelector` |
| Missing loading state | Track `isLoading` in reducer |
| Async in reducers | Use Thunk middleware |
| Memory leaks | Cleanup in `useEffect` return |
| No error boundaries | Wrap components with ErrorBoundary |
| Persisted sensitive data | Blacklist from redux-persist |

See **reference.md** for detailed patterns, migration guides, and API integration.
See **examples.md** for complete implementations for a Laravel + React SPA.
