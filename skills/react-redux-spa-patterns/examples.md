# React + Redux SPA Patterns Examples

Example implementations for a production Laravel + React SPA.

## Redux Store Setup

### Store Configuration with redux-persist

```javascript
// resources/js/src/store.js
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import { persistReducer, persistStore } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { LOGGED_OUT } from './data/users/actions';
import data from './data';

let middleware = [thunkMiddleware];

export const appReducer = combineReducers({
    data: data
});

// Handle logout: reset entire state
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
    key: 'root',
    storage,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);
export const store = createStore(persistedReducer, applyMiddleware(...middleware));
export const persistor = persistStore(store);
```

## Complete Login Form with Formik

### Production SPA Example

```javascript
// resources/js/src/features/auth/LoginPageForm.js
import React from 'react';
import { Formik, Form, Field } from 'formik';
import * as yup from 'yup';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { login } from '../../data/users/actions';

const loginSchema = yup.object({
    email: yup.string().email('Invalid email').required('Email is required'),
    password: yup.string().required('Password is required')
});

function LoginPageForm() {
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
                    setErrors({ api: 'Invalid credentials' });
                } finally {
                    setSubmitting(false);
                }
            }}
        >
            {({ errors, touched, isSubmitting }) => (
                <Form className="login-form">
                    <div className="form-group">
                        <label>Email</label>
                        <Field
                            name="email"
                            type="email"
                            className="form-control"
                        />
                        {errors.email && touched.email && (
                            <div className="error">{errors.email}</div>
                        )}
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <Field
                            name="password"
                            type="password"
                            className="form-control"
                        />
                        {errors.password && touched.password && (
                            <div className="error">{errors.password}</div>
                        )}
                    </div>

                    {errors.api && <div className="api-error">{errors.api}</div>}

                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn btn-primary"
                    >
                        {isSubmitting ? 'Logging in...' : 'Login'}
                    </button>
                </Form>
            )}
        </Formik>
    );
}

export default LoginPageForm;
```

## Redux Thunk Actions

### User Login Action

```javascript
// resources/js/src/data/users/actions.js
import axios from 'axios';

export const LOGIN_REQUEST = 'LOGIN_REQUEST';
export const LOGIN_SUCCESS = 'LOGIN_SUCCESS';
export const LOGIN_FAILURE = 'LOGIN_FAILURE';
export const LOGGED_OUT = 'LOGGED_OUT';

export const login = (credentials) => async (dispatch) => {
    dispatch({ type: LOGIN_REQUEST });

    try {
        // Get CSRF token first (for Sanctum)
        await axios.get('/sanctum/csrf-cookie');

        // Login
        const response = await axios.post('/api/auth/token', credentials);

        dispatch({
            type: LOGIN_SUCCESS,
            payload: response.data.user
        });

        return response.data;
    } catch (error) {
        dispatch({
            type: LOGIN_FAILURE,
            payload: error.response?.data?.message || 'Login failed'
        });
        throw error;
    }
};

export const logout = () => async (dispatch) => {
    try {
        await axios.delete('/api/auth/token');
    } catch (error) {
        console.error('Logout error:', error);
    } finally {
        dispatch({ type: LOGGED_OUT });
        // Clear local storage
        localStorage.removeItem('persist:root');
    }
};
```

## React Router v6 Setup

### Routes Configuration

```javascript
// resources/js/src/features/routes/Routes.js
import { Routes, Route, Navigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import LoginPage from '../auth/LoginPage';
import HomePage from '../home/HomePage';
import Dashboard from '../dashboard/Dashboard';

function ProtectedRoute({ children }) {
    const { isLoggedIn } = useSelector(state => state.data.user.user);
    return isLoggedIn ? children : <Navigate to="/login" replace />;
}

export default function AppRoutes() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={
                <ProtectedRoute>
                    <HomePage />
                </ProtectedRoute>
            } />

            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <Dashboard />
                </ProtectedRoute>
            } />
        </Routes>
    );
}
```

## Using Redux in Components

### Fetch Data on Mount

```javascript
import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { fetchCourses } from '../../data/courses/actions';

function CoursesPage() {
    const dispatch = useDispatch();
    const { courses, isLoading, error } = useSelector(state => state.data.courses);

    useEffect(() => {
        dispatch(fetchCourses());
    }, [dispatch]);

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error}</div>;

    return (
        <div>
            {courses.map(course => (
                <div key={course.id}>{course.name}</div>
            ))}
        </div>
    );
}
```

## Axios Configuration

### Bootstrap File

```javascript
// resources/js/bootstrap.js
import axios from 'axios';

axios.defaults.baseURL = process.env.MIX_APP_URL || 'http://localhost';
axios.defaults.withCredentials = true;
axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

// Optional: Add auth token to requests
axios.interceptors.request.use(
    config => {
        const token = localStorage.getItem('auth_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    error => Promise.reject(error)
);
```

## HomePage Component

### Simple Functional Component

```javascript
// resources/js/src/features/home/HomePage.js
import React from 'react';

const HomePage = () => {
    return (
        <div className="container mt-5">
            <div className="row justify-content-center">
                <div className="col-md-8">
                    <div className="card text-center">
                        <div className="card-header">
                            <h2>This is the homepage.</h2>
                        </div>
                        <div className="card-body">
                            Congratulations! It works!
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default HomePage;
```

## Complete Feature: Course Management

### Actions

```javascript
export const FETCH_COURSES_REQUEST = 'FETCH_COURSES_REQUEST';
export const FETCH_COURSES_SUCCESS = 'FETCH_COURSES_SUCCESS';
export const FETCH_COURSES_FAILURE = 'FETCH_COURSES_FAILURE';

export const fetchCourses = () => async (dispatch) => {
    dispatch({ type: FETCH_COURSES_REQUEST });

    try {
        const response = await axios.get('/api/courses');
        dispatch({
            type: FETCH_COURSES_SUCCESS,
            payload: response.data
        });
    } catch (error) {
        dispatch({
            type: FETCH_COURSES_FAILURE,
            payload: error.message
        });
    }
};
```

### Reducer

```javascript
const initialState = {
    courses: [],
    isLoading: false,
    error: null
};

export default function coursesReducer(state = initialState, action) {
    switch (action.type) {
        case FETCH_COURSES_REQUEST:
            return { ...state, isLoading: true, error: null };

        case FETCH_COURSES_SUCCESS:
            return {
                ...state,
                isLoading: false,
                courses: action.payload
            };

        case FETCH_COURSES_FAILURE:
            return {
                ...state,
                isLoading: false,
                error: action.payload
            };

        default:
            return state;
    }
}
```

## Testing Anti-Patterns

### Before: Prop Drilling

```javascript
// ❌ Bad
function App() {
    const [user, setUser] = useState(null);
    return <Dashboard user={user} />;
}

function Dashboard({ user }) {
    return <Sidebar user={user} />;
}

function Sidebar({ user }) {
    return <UserMenu user={user} />;
}
```

### After: Redux

```javascript
// ✅ Good
function App() {
    return <Dashboard />;
}

function Dashboard() {
    return <Sidebar />;
}

function Sidebar() {
    return <UserMenu />;
}

function UserMenu() {
    const user = useSelector(state => state.data.user.user);
    // Use user directly!
}
```

This combines all patterns into a working React + Redux SPA!
