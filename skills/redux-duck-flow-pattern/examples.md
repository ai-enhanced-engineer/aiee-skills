# Redux Duck Pattern Examples

Example implementations for a React Native app showing Duck pattern with Flow types.

## Complete User Duck Module

### types.js - Flow Type Definitions

```javascript
// @flow
export type User = {
  +id: number,
  name: string,
  email: string,
  avatar: ?string,
  role: string,
};

export type RegisterUser = {
  name: string,
  email: string,
  password: string,
};

export type UserState = {
  user: ?User,
  isLoading: boolean,
  isRegistering: boolean,
  error: ?string,
};

export type UserAction = {
  type: string,
  user?: User,
  errorMessages?: ErrorMessages,
};
```

### actions.js - Thunks and Action Creators

```javascript
// @flow
import type { RegisterUser, User } from './types';
import type { ThunkAction } from '../types/generics';
import type { UserState } from './reducers';
import * as api from './api';
import { ToastError } from '../../features/components/toast/ToastErrors';

// Register user thunk
export const register = (registerUser: RegisterUser): ThunkAction<UserState, UserAction> => {
  return dispatch => {
    dispatch(registeringUser());
    return api.registerUser(registerUser).then(response => {
      dispatch(registeredUser(response.user));
      dispatch(receivedAccessToken(response.accessToken));
    }, error => {
      dispatch(registeringUserFailed(error));
      ToastError.showToast(error);
    });
  };
};

// Action types as constants
export const REGISTERING_USER: 'REGISTERING_USER' = 'REGISTERING_USER';
export const REGISTERED_USER: 'REGISTERED_USER' = 'REGISTERED_USER';
export const REGISTERING_USER_FAILED: 'REGISTERING_USER_FAILED' = 'REGISTERING_USER_FAILED';

// Action creators
export const registeringUser = (): UserAction => ({
  type: REGISTERING_USER
});

export const registeredUser = (user: User): UserAction => ({
  type: REGISTERED_USER,
  user
});

export const registeringUserFailed = (errorMessages: ErrorMessages): UserAction => ({
  type: REGISTERING_USER_FAILED,
  errorMessages
});

// Login thunk
export const login = (email: string, password: string, deviceName: string): ThunkAction<UserState, UserAction> => {
  return dispatch => {
    dispatch(loggingIn());
    return api.login(email, password, deviceName).then(response => {
      dispatch(loggedIn(response.user));
    }, error => {
      dispatch(loggingInFailed(error));
      ToastError.showToast(error);
    });
  };
};

export const LOGGING_IN: 'LOGGING_IN' = 'LOGGING_IN';
export const LOGGED_IN: 'LOGGED_IN' = 'LOGGED_IN';
export const LOGGING_IN_FAILED: 'LOGGING_IN_FAILED' = 'LOGGING_IN_FAILED';

export const loggingIn = (): UserAction => ({ type: LOGGING_IN });
export const loggedIn = (user: User): UserAction => ({ type: LOGGED_IN, user });
export const loggingInFailed = (errorMessages: ErrorMessages): UserAction => ({
  type: LOGGING_IN_FAILED,
  errorMessages
});
```

**Pattern notes**:
- Each async operation has REQUEST/SUCCESS/FAILURE actions
- Action type constants use Flow literal types for type safety
- Thunks return promises for calling code to handle
- Toast errors shown on failures

### reducers.js - State Updates

```javascript
// @flow
import type { UserState, UserAction } from './types';
import * as actions from './actions';

const initialState: UserState = {
  user: null,
  isLoading: false,
  isRegistering: false,
  error: null,
};

export default function userReducer(
  state: UserState = initialState,
  action: UserAction
): UserState {
  switch (action.type) {
    case actions.REGISTERING_USER:
      return { ...state, isRegistering: true, error: null };

    case actions.REGISTERED_USER:
      return {
        ...state,
        isRegistering: false,
        user: action.user,
      };

    case actions.REGISTERING_USER_FAILED:
      return {
        ...state,
        isRegistering: false,
        error: action.errorMessages,
      };

    case actions.LOGGING_IN:
      return { ...state, isLoading: true, error: null };

    case actions.LOGGED_IN:
      return {
        ...state,
        isLoading: false,
        user: action.user,
      };

    case actions.LOGGING_IN_FAILED:
      return {
        ...state,
        isLoading: false,
        error: action.errorMessages,
      };

    case actions.LOGGED_OUT:
      return initialState;

    default:
      return state;
  }
}
```

### selectors.js - State Queries

```javascript
// @flow
import type { User } from './types';

type RootState = {
  data: {
    user: UserState,
  },
};

export const getUser = (state: RootState): ?User => {
  return state.data.user.user;
};

export const isUserLoading = (state: RootState): boolean => {
  return state.data.user.isLoading;
};

export const isRegistering = (state: RootState): boolean => {
  return state.data.user.isRegistering;
};

export const getUserError = (state: RootState): ?string => {
  return state.data.user.error;
};

// Derived selector
export const isLoggedIn = (state: RootState): boolean => {
  return state.data.user.user !== null;
};
```

### api.js - Backend Integration

```javascript
// @flow
import axios from 'axios';
import type { RegisterUser, User } from './types';
import { API_URL } from '../utils/constants';

export const registerUser = async (registerUser: RegisterUser): Promise<{ user: User, accessToken: string }> => {
  const response = await axios.post(`${API_URL}/register`, registerUser);
  return {
    user: response.data.user,
    accessToken: response.data.access_token,
  };
};

export const login = async (email: string, password: string, deviceName: string): Promise<{ user: User, accessToken: string }> => {
  const response = await axios.post(`${API_URL}/login`, {
    email,
    password,
    device_name: deviceName,
  });
  return {
    user: response.data.user,
    accessToken: response.data.access_token,
  };
};

export const fetchUser = async (token: string): Promise<User> => {
  const response = await axios.get(`${API_URL}/user`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });
  return response.data;
};
```

## Container Using Duck Module

```javascript
// HomeContainer.js
import { connect } from 'react-redux';
import HomeComponent from './HomeComponent';
import { getUser, isUserLoading } from '../../data/user/selectors';
import { isConnected } from '../../data/connection/selectors';

type Props = {
  user: User,
  isRequestingUser: boolean,
  isConnected: boolean,
};

class HomeContainer extends React.Component<Props> {
  render() {
    return <HomeComponent {...this.props} />;
  }
}

const mapStateToProps = state => ({
  user: getUser(state),
  isRequestingUser: isUserLoading(state),
  isConnected: isConnected(state)
});

export default connect(mapStateToProps, null)(HomeContainer);
```

## Store Configuration

```javascript
// store.js
import { createStore, combineReducers, applyMiddleware } from 'redux';
import thunkMiddleware from 'redux-thunk';
import userReducer from '../user/reducers';
import videosReducer from '../videos/reducers';
import trainingReducer from '../training/reducers';

const dataReducer = combineReducers({
  user: userReducer,
  videos: videosReducer,
  training: trainingReducer,
});

export const store = createStore(
  combineReducers({ data: dataReducer }),
  applyMiddleware(thunkMiddleware)
);
```

## Testing Examples

```javascript
// actions.test.js
import configureMockStore from 'redux-mock-store';
import thunk from 'redux-thunk';
import * as actions from '../actions';
import * as api from '../api';

jest.mock('../api');

const mockStore = configureMockStore([thunk]);

describe('user actions', () => {
  it('register dispatches success actions', async () => {
    const user = { id: 1, name: 'John', email: 'john@example.com' };
    const accessToken = 'token123';
    api.registerUser.mockResolvedValue({ user, accessToken });

    const store = mockStore({});
    await store.dispatch(actions.register({ name: 'John', email: 'john@example.com', password: 'pass123' }));

    const dispatched = store.getActions();
    expect(dispatched[0].type).toBe('REGISTERING_USER');
    expect(dispatched[1].type).toBe('REGISTERED_USER');
    expect(dispatched[1].user).toEqual(user);
  });
});
```

**Key patterns**:
- Duck pattern keeps all Redux logic per feature in one folder
- Flow types catch errors at compile time
- Thunks handle async logic and dispatch multiple actions
- Selectors provide clean API for reading state
- API layer separates backend concerns
- Toast errors give user feedback on failures
