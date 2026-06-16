# Redux Duck Pattern with Flow Reference

Detailed patterns for organizing Redux with Duck pattern and Flow type annotations.

## Duck Pattern Architecture

### Module Structure

Each feature domain gets its own folder with complete Redux logic:

```
src/data/
├── user/
│   ├── types.js        # Flow type definitions
│   ├── actions.js      # Action creators + thunks
│   ├── reducers.js     # State updates
│   ├── selectors.js    # State queries
│   ├── api.js          # Backend calls
│   ├── mappers.js      # DTO transformations
│   └── __tests__/      # Unit tests
│       ├── actions.test.js
│       ├── reducers.test.js
│       └── selectors.test.js
└── videos/
    ├── types.js
    ├── actions.js
    └── ...
```

### File Responsibilities

**types.js**: Flow type definitions
- Domain models (User, Video, etc.)
- State shape type
- Action union type
- API response types

**actions.js**: Action creators and thunks
- Async thunks with API calls
- Sync action creators
- Action type constants
- Error handling

**reducers.js**: State updates
- Initial state
- Reducer function (default export)
- Immutable state updates
- Loading/error state management

**selectors.js**: State queries
- Simple selectors
- Memoized selectors (reselect)
- Derived data computation

**api.js**: Backend integration
- Axios calls
- Request/response formatting
- Error handling
- Base URL configuration

**mappers.js**: Data transformation
- API response → Domain model
- Domain model → API request
- Normalize/denormalize data

## Flow Type Patterns

### Action Type Union

```javascript
// types.js
export type UserAction =
  | { type: 'FETCH_USER_REQUEST' }
  | { type: 'FETCH_USER_SUCCESS', user: User }
  | { type: 'FETCH_USER_FAILURE', error: string }
  | { type: 'UPDATE_USER_REQUEST' }
  | { type: 'UPDATE_USER_SUCCESS', user: User }
  | { type: 'UPDATE_USER_FAILURE', error: string };
```

**Benefits**:
- Exhaustive case checking in reducers
- Autocomplete for action types
- Compile-time detection of typos

### State Type

```javascript
// types.js
export type User = {
  +id: number,           // Read-only (covariant)
  name: string,
  email: string,
  avatar: ?string,       // Optional (nullable)
};

export type UserState = {
  user: ?User,           // null when not loaded
  users: Array<User>,    // List of users
  isLoading: boolean,
  error: ?string,
  lastUpdated: ?Date,
};
```

**Flow modifiers**:
- `+` prefix: Read-only property (covariant)
- `?` prefix: Optional/nullable
- `Array<T>`: Typed arrays

### Thunk Action Type

```javascript
// types/generics.js (shared)
export type ThunkAction<S, A> = (
  dispatch: (action: A | ThunkAction<S, A>) => any,
  getState: () => { data: S }
) => any;
```

**Usage in actions**:
```javascript
// actions.js
import type { ThunkAction } from '../types/generics';
import type { UserAction, UserState } from './types';

export const fetchUser = (id: number): ThunkAction<UserState, UserAction> => {
  return async (dispatch, getState) => {
    dispatch({ type: 'FETCH_USER_REQUEST' });

    try {
      const user = await api.fetchUser(id);
      dispatch({ type: 'FETCH_USER_SUCCESS', user });
      return user;
    } catch (error) {
      dispatch({ type: 'FETCH_USER_FAILURE', error: error.message });
      throw error;
    }
  };
};
```

### Reducer with Flow

```javascript
// reducers.js
// @flow
import type { UserState, UserAction } from './types';

const initialState: UserState = {
  user: null,
  users: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
};

export default function userReducer(
  state: UserState = initialState,
  action: UserAction
): UserState {
  switch (action.type) {
    case 'FETCH_USER_REQUEST':
      return { ...state, isLoading: true, error: null };

    case 'FETCH_USER_SUCCESS':
      return {
        ...state,
        isLoading: false,
        user: action.user,
        lastUpdated: new Date(),
      };

    case 'FETCH_USER_FAILURE':
      return { ...state, isLoading: false, error: action.error };

    default:
      return state;
  }
}
```

### Selectors with Flow

```javascript
// selectors.js
// @flow
import type { User } from './types';

type RootState = {
  data: {
    user: UserState,
  },
};

// Simple selector
export const getUser = (state: RootState): ?User => {
  return state.data.user.user;
};

// Selector with multiple inputs
export const isUserLoading = (state: RootState): boolean => {
  return state.data.user.isLoading;
};

// Memoized selector
import { createSelector } from 'reselect';

const getUsersArray = (state: RootState): Array<User> => {
  return state.data.user.users;
};

export const getSortedUsers = createSelector(
  [getUsersArray],
  (users: Array<User>): Array<User> => {
    return [...users].sort((a, b) => a.name.localeCompare(b.name));
  }
);
```

## API Layer Separation

### api.js Pattern

```javascript
// api.js
// @flow
import axios from 'axios';
import type { User } from './types';
import { mapUserFromAPI, mapUserToAPI } from './mappers';

const BASE_URL = 'https://api.example.com';

export const fetchUser = async (id: number): Promise<User> => {
  const response = await axios.get(`${BASE_URL}/users/${id}`);
  return mapUserFromAPI(response.data);
};

export const updateUser = async (user: User): Promise<User> => {
  const dto = mapUserToAPI(user);
  const response = await axios.put(`${BASE_URL}/users/${user.id}`, dto);
  return mapUserFromAPI(response.data);
};

export const fetchUsers = async (): Promise<Array<User>> => {
  const response = await axios.get(`${BASE_URL}/users`);
  return response.data.map(mapUserFromAPI);
};
```

### mappers.js Pattern

```javascript
// mappers.js
// @flow
import type { User } from './types';

type UserDTO = {
  id: number,
  full_name: string,      // Snake case from API
  email_address: string,
  avatar_url: ?string,
  created_at: string,
};

// API → Domain
export const mapUserFromAPI = (dto: UserDTO): User => {
  return {
    id: dto.id,
    name: dto.full_name,
    email: dto.email_address,
    avatar: dto.avatar_url,
  };
};

// Domain → API
export const mapUserToAPI = (user: User): UserDTO => {
  return {
    id: user.id,
    full_name: user.name,
    email_address: user.email,
    avatar_url: user.avatar,
    created_at: new Date().toISOString(),
  };
};
```

**Benefits**:
- Decouples frontend from backend contract
- Centralizes data transformation
- Easy to update when API changes
- Type safety at API boundary

## Selector Patterns

### When to Memoize

```javascript
import { createSelector } from 'reselect';

// ✅ Memoize: Expensive computation
export const getFilteredAndSortedUsers = createSelector(
  [getUsersArray, getFilter],
  (users, filter) => {
    return users
      .filter(u => u.name.includes(filter))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
);

// ❌ Don't memoize: Simple property access
export const getUser = (state) => state.data.user.user;

// ❌ Don't memoize: Single transformation
export const getUserName = (state) => {
  const user = state.data.user.user;
  return user ? user.name : 'Guest';
};
```

### Selector Composition

```javascript
// Base selectors
const getUsers = state => state.data.user.users;
const getActiveFilter = state => state.ui.filters.active;
const getSortOrder = state => state.ui.sorting.order;

// Composed selector
export const getFilteredAndSortedUsers = createSelector(
  [getUsers, getActiveFilter, getSortOrder],
  (users, filter, sortOrder) => {
    let result = users;

    // Apply filter
    if (filter) {
      result = result.filter(u => u.name.includes(filter));
    }

    // Apply sort
    result = [...result].sort((a, b) => {
      const compare = a.name.localeCompare(b.name);
      return sortOrder === 'desc' ? -compare : compare;
    });

    return result;
  }
);
```

## Error Handling

### Action Error Pattern

```javascript
// actions.js
export const fetchUser = (id: number): ThunkAction<UserState, UserAction> => {
  return async (dispatch) => {
    dispatch({ type: 'FETCH_USER_REQUEST' });

    try {
      const user = await api.fetchUser(id);
      dispatch({ type: 'FETCH_USER_SUCCESS', user });
      return user;
    } catch (error) {
      // Normalize error message
      const message = error.response?.data?.message || error.message || 'Unknown error';

      dispatch({ type: 'FETCH_USER_FAILURE', error: message });

      // Show user-friendly toast
      ToastError.showToast({ message });

      // Re-throw for caller to handle
      throw error;
    }
  };
};
```

### API Error Handling

```javascript
// api.js
import axios from 'axios';

// Axios interceptor for global error handling
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

export const fetchUser = async (id: number): Promise<User> => {
  try {
    const response = await axios.get(`${BASE_URL}/users/${id}`);
    return mapUserFromAPI(response.data);
  } catch (error) {
    // Add context to error
    throw new Error(`Failed to fetch user ${id}: ${error.message}`);
  }
};
```

## Testing Duck Modules

### Testing Actions

```javascript
// __tests__/actions.test.js
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import * as actions from '../actions';
import * as api from '../api';

jest.mock('../api');

const middlewares = [thunk];
const mockStore = configureMockStore(middlewares);

describe('user actions', () => {
  it('fetchUser dispatches SUCCESS on success', async () => {
    const user = { id: 1, name: 'John', email: 'john@example.com' };
    api.fetchUser.mockResolvedValue(user);

    const store = mockStore({});
    await store.dispatch(actions.fetchUser(1));

    const dispatched = store.getActions();
    expect(dispatched[0]).toEqual({ type: 'FETCH_USER_REQUEST' });
    expect(dispatched[1]).toEqual({ type: 'FETCH_USER_SUCCESS', user });
  });

  it('fetchUser dispatches FAILURE on error', async () => {
    api.fetchUser.mockRejectedValue(new Error('Network error'));

    const store = mockStore({});
    await expect(store.dispatch(actions.fetchUser(1))).rejects.toThrow();

    const dispatched = store.getActions();
    expect(dispatched[0]).toEqual({ type: 'FETCH_USER_REQUEST' });
    expect(dispatched[1]).toEqual({
      type: 'FETCH_USER_FAILURE',
      error: 'Network error',
    });
  });
});
```

### Testing Reducers

```javascript
// __tests__/reducers.test.js
import reducer from '../reducers';

describe('user reducer', () => {
  it('handles FETCH_USER_SUCCESS', () => {
    const user = { id: 1, name: 'John', email: 'john@example.com' };

    const state = reducer(undefined, {
      type: 'FETCH_USER_SUCCESS',
      user,
    });

    expect(state.user).toEqual(user);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('handles FETCH_USER_FAILURE', () => {
    const state = reducer(undefined, {
      type: 'FETCH_USER_FAILURE',
      error: 'Network error',
    });

    expect(state.user).toBeNull();
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Network error');
  });
});
```

### Testing Selectors

```javascript
// __tests__/selectors.test.js
import * as selectors from '../selectors';

describe('user selectors', () => {
  const state = {
    data: {
      user: {
        user: { id: 1, name: 'John' },
        users: [
          { id: 1, name: 'John' },
          { id: 2, name: 'Alice' },
        ],
        isLoading: false,
        error: null,
      },
    },
  };

  it('getUser returns current user', () => {
    expect(selectors.getUser(state)).toEqual({ id: 1, name: 'John' });
  });

  it('getSortedUsers returns alphabetically sorted users', () => {
    const sorted = selectors.getSortedUsers(state);
    expect(sorted[0].name).toBe('Alice');
    expect(sorted[1].name).toBe('John');
  });
});
```

## Duck Pattern vs Redux Toolkit

### Duck Pattern
```
✅ Explicit control
✅ Works with Flow
✅ No magic/abstractions
❌ More boilerplate
❌ Manual immutability
```

### Redux Toolkit (createSlice)
```
✅ Less boilerplate
✅ Immer for immutability
✅ TypeScript first-class
❌ TypeScript only (no Flow)
❌ More abstraction
❌ Harder migration from Duck
```

**When to use Duck pattern**:
- Existing project using Flow
- Team prefers explicit code
- Need fine-grained control
- Gradual migration from legacy Redux

**When to use Redux Toolkit**:
- New TypeScript project
- Want less boilerplate
- Okay with abstractions
- Modern Redux best practices

## Common Anti-Patterns

### ❌ Mixing Action Types Across Modules

```javascript
// ❌ Bad: Generic action types
const FETCH_REQUEST = 'FETCH_REQUEST';  // Collides with other modules

// ✅ Good: Prefixed action types
const FETCH_USER_REQUEST = 'FETCH_USER_REQUEST';
```

### ❌ Business Logic in Reducers

```javascript
// ❌ Bad: Complex logic in reducer
case 'ADD_ITEM':
  const existingIndex = state.items.findIndex(i => i.id === action.item.id);
  if (existingIndex >= 0) {
    // Update existing
    return {
      ...state,
      items: state.items.map((item, i) =>
        i === existingIndex ? action.item : item
      ),
    };
  } else {
    // Add new
    return {
      ...state,
      items: [...state.items, action.item],
    };
  }

// ✅ Good: Logic in action creator
export const addOrUpdateItem = (item) => (dispatch, getState) => {
  const { items } = getState().data.items;
  const exists = items.some(i => i.id === item.id);

  dispatch({
    type: exists ? 'UPDATE_ITEM' : 'ADD_ITEM',
    item,
  });
};
```

### ❌ Not Separating API Calls

```javascript
// ❌ Bad: API call in action
export const fetchUser = (id) => async (dispatch) => {
  dispatch({ type: 'FETCH_USER_REQUEST' });
  try {
    const response = await axios.get(`/api/users/${id}`);
    dispatch({ type: 'FETCH_USER_SUCCESS', user: response.data });
  } catch (error) {
    dispatch({ type: 'FETCH_USER_FAILURE', error: error.message });
  }
};

// ✅ Good: API call in api.js
// actions.js
export const fetchUser = (id) => async (dispatch) => {
  dispatch({ type: 'FETCH_USER_REQUEST' });
  try {
    const user = await api.fetchUser(id);  // Abstracted
    dispatch({ type: 'FETCH_USER_SUCCESS', user });
  } catch (error) {
    dispatch({ type: 'FETCH_USER_FAILURE', error: error.message });
  }
};

// api.js
export const fetchUser = async (id) => {
  const response = await axios.get(`${BASE_URL}/users/${id}`);
  return mapUserFromAPI(response.data);
};
```

### ❌ Expensive Selectors Without Memoization

```javascript
// ❌ Bad: Recomputes every render
export const getFilteredUsers = (state) => {
  return state.data.user.users
    .filter(u => u.active)
    .sort((a, b) => a.name.localeCompare(b.name));
};

// ✅ Good: Memoized with reselect
export const getFilteredUsers = createSelector(
  [getUsers],
  (users) => {
    return users
      .filter(u => u.active)
      .sort((a, b) => a.name.localeCompare(b.name));
  }
);
```
