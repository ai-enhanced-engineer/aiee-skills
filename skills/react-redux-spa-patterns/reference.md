# React + Redux SPA Patterns Reference

Detailed patterns for React 17 SPAs with Redux, Router v6, and Formik.

## Redux Thunk Best Practices

### Standard Async Pattern

```javascript
// Action types
const FETCH_USER_REQUEST = 'FETCH_USER_REQUEST';
const FETCH_USER_SUCCESS = 'FETCH_USER_SUCCESS';
const FETCH_USER_FAILURE = 'FETCH_USER_FAILURE';

// Thunk action creator
export const fetchUser = (id) => async (dispatch) => {
    dispatch({ type: FETCH_USER_REQUEST });

    try {
        const response = await axios.get(`/api/users/${id}`);
        dispatch({
            type: FETCH_USER_SUCCESS,
            payload: response.data
        });
        return response.data;
    } catch (error) {
        dispatch({
            type: FETCH_USER_FAILURE,
            payload: error.response?.data?.message || 'Failed to fetch user'
        });
        throw error;
    }
};

// Reducer
const initialState = {
    user: null,
    isLoading: false,
    error: null
};

export default function userReducer(state = initialState, action) {
    switch (action.type) {
        case FETCH_USER_REQUEST:
            return { ...state, isLoading: true, error: null };
        case FETCH_USER_SUCCESS:
            return { ...state, isLoading: false, user: action.payload };
        case FETCH_USER_FAILURE:
            return { ...state, isLoading: false, error: action.payload };
        default:
            return state;
    }
}
```

## redux-persist Configuration

### Complete Setup

```javascript
import { createStore, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';  // localStorage

const persistConfig = {
    key: 'root',
    storage,
    whitelist: ['user'],  // Only persist user slice
    blacklist: ['ui'],    // Don't persist UI state
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = createStore(
    persistedReducer,
    applyMiddleware(thunkMiddleware)
);

export const persistor = persistStore(store);
```

### Logout State Cleanup

```javascript
import { PURGE } from 'redux-persist';

// In your root reducer
const rootReducer = (state, action) => {
    if (action.type === 'LOGGED_OUT') {
        // Clear persisted state
        storage.removeItem('persist:root');
        state = undefined;
    }
    return appReducer(state, action);
};

// Logout action
export const logout = () => async (dispatch) => {
    await axios.delete('/api/auth/token');
    dispatch({ type: 'LOGGED_OUT' });
    dispatch({ type: PURGE, key: 'root', result: () => null });
};
```

## React Router v6 Patterns

### Protected Routes

```javascript
import { Navigate, Outlet } from 'react-router-dom';
import { useSelector } from 'react-redux';

function ProtectedRoute() {
    const { isLoggedIn } = useSelector(state => state.data.user.user);

    return isLoggedIn ? <Outlet /> : <Navigate to="/login" />;
}

// In routes
<Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
    </Route>
</Routes>
```

### Programmatic Navigation

```javascript
import { useNavigate } from 'react-router-dom';

function LoginPage() {
    const navigate = useNavigate();
    const dispatch = useDispatch();

    const handleLogin = async (credentials) => {
        await dispatch(login(credentials));
        navigate('/dashboard', { replace: true });
    };
}
```

## Formik + Yup Validation

### Complete Form Example

```javascript
import { Formik, Form, Field, ErrorMessage } from 'formik';
import * as yup from 'yup';

const loginSchema = yup.object({
    email: yup.string()
        .email('Invalid email')
        .required('Email is required'),
    password: yup.string()
        .min(8, 'Password must be at least 8 characters')
        .required('Password is required')
});

function LoginForm() {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    return (
        <Formik
            initialValues={{ email: '', password: '' }}
            validationSchema={loginSchema}
            onSubmit={async (values, { setSubmitting, setErrors }) => {
                try {
                    await dispatch(login(values));
                    navigate('/dashboard');
                } catch (error) {
                    setErrors({ submit: error.message });
                } finally {
                    setSubmitting(false);
                }
            }}
        >
            {({ errors, touched, isSubmitting }) => (
                <Form>
                    <div>
                        <Field name="email" type="email" />
                        <ErrorMessage name="email" component="div" />
                    </div>

                    <div>
                        <Field name="password" type="password" />
                        <ErrorMessage name="password" component="div" />
                    </div>

                    {errors.submit && <div>{errors.submit}</div>}

                    <button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? 'Logging in...' : 'Login'}
                    </button>
                </Form>
            )}
        </Formik>
    );
}
```

## API Integration with Axios

### Axios Configuration

```javascript
// bootstrap.js
import axios from 'axios';

axios.defaults.baseURL = process.env.REACT_APP_API_URL || 'http://localhost';
axios.defaults.withCredentials = true;  // For Sanctum
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// Request interceptor (add token)
axios.interceptors.request.use(
    config => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    error => Promise.reject(error)
);

// Response interceptor (handle errors)
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response?.status === 401) {
            // Redirect to login
            store.dispatch({ type: 'LOGGED_OUT' });
        }
        return Promise.reject(error);
    }
);
```

## Error Boundary

```javascript
import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div>
                    <h1>Something went wrong</h1>
                    <p>{this.state.error?.message}</p>
                </div>
            );
        }

        return this.props.children;
    }
}

// Usage
<ErrorBoundary>
    <App />
</ErrorBoundary>
```

## Migration Guides

### React 17 to 18

```javascript
// Before (React 17)
import ReactDOM from 'react-dom';
ReactDOM.render(<App />, document.getElementById('root'));

// After (React 18)
import { createRoot } from 'react-dom/client';
const root = createRoot(document.getElementById('root'));
root.render(<App />);
```

### Classic Redux to Redux Toolkit

```javascript
// Before: Classic Redux
const FETCH_USER_REQUEST = 'FETCH_USER_REQUEST';
const FETCH_USER_SUCCESS = 'FETCH_USER_SUCCESS';

export const fetchUser = () => async (dispatch) => {
    dispatch({ type: FETCH_USER_REQUEST });
    // ...
};

// After: Redux Toolkit
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';

export const fetchUser = createAsyncThunk(
    'user/fetch',
    async (userId) => {
        const response = await axios.get(`/api/users/${userId}`);
        return response.data;
    }
);

const userSlice = createSlice({
    name: 'user',
    initialState: { user: null, loading: false, error: null },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchUser.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchUser.fulfilled, (state, action) => {
                state.loading = false;
                state.user = action.payload;
            })
            .addCase(fetchUser.rejected, (state, action) => {
                state.loading = false;
                state.error = action.error.message;
            });
    }
});
```

## Anti-Patterns Solutions

### 1. Prop Drilling

```javascript
// ❌ Bad: Passing props through multiple levels
<Parent user={user}>
    <Child user={user}>
        <GrandChild user={user} />

// ✅ Good: Use Redux
function GrandChild() {
    const user = useSelector(state => state.data.user.user);
}
```

### 2. Missing Cleanup

```javascript
// ❌ Bad: Memory leak
useEffect(() => {
    const subscription = api.subscribe();
}, []);

// ✅ Good: Cleanup
useEffect(() => {
    const subscription = api.subscribe();
    return () => subscription.unsubscribe();
}, []);
```

## Imperative DOM Bridge

When bridging an imperative library (maplibre-gl, Leaflet, d3, WebGL canvas) to React state, event handlers registered on library objects capture a stale closure of state values set at the time the handler was first registered. Under React 19 Strict Mode, side effects inside `setState` updaters run twice (updaters are expected to be pure).

**Pattern**: mirror React state into a `useRef` and read the ref inside handlers:

```tsx
const [selected, setSelected] = useState<T | null>(null);
const selectedRef = useRef<T | null>(null);
useEffect(() => { selectedRef.current = selected; }, [selected]);

useEffect(() => {
  if (!map) return;
  const handler = () => {
    const item = selectedRef.current; // reads current value, not stale closure
    // project screen position, update overlay position…
  };
  map.on("move", handler);
  return () => map.off("move", handler);
}, [map]);
```

**Companion anti-patterns**:

| Anti-Pattern | Pattern |
|---|---|
| Side effect inside `setState(prev => { sideEffect(); return prev; })` | Side effect runs twice under React 19 Strict Mode; move to `useRef` + `useEffect` |
| `map.once("load", fn)` inside a prop-change effect | Each render queues a fresh `once` listener; track readiness with a ref flag and `map.off("load", fn)` on cleanup |
| Parent callback recreated each render passed to child `useEffect([onClose])` | Wrap parent callback in `useCallback([], [])` so child effect deps stay stable — prevents document listeners being re-bound on every parent render |
| `mousedown` used both to open and to close-outside-click detect | Same event closes the dialog before the user sees it; `useEffect` fires post-commit so the close listener isn't yet attached when the opening `mousedown` bubbles — but switching to `pointerdown` (which fires earlier) resurrects the race |


## Official Documentation

- [React Documentation](https://react.dev/)
- [Redux Documentation](https://redux.js.org/)
- [React Router](https://reactrouter.com/)
- [Formik](https://formik.org/)
- [redux-persist](https://github.com/rt2zz/redux-persist)
