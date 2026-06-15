# React Native Container/Component Reference

Detailed patterns for separating concerns in React Native with Redux.

## Container/Component Separation of Concerns

### Container Responsibilities

**What containers DO:**
- Connect to Redux store with `connect()`
- Select data from state with `mapStateToProps`
- Bind action creators with `mapDispatchToProps`
- Handle component lifecycle (fetch data on mount)
- Manage local UI state (form input, modals)
- Pass data and callbacks to presentational component

**What containers DON'T do:**
- Complex rendering logic
- Heavy styling
- Direct DOM/RN component manipulation
- Business logic (belongs in actions/thunks)

### Component Responsibilities

**What components DO:**
- Render UI based on props
- Handle user interactions (call prop callbacks)
- Manage internal UI state (animations, transitions)
- Apply styles
- Compose other presentational components

**What components DON'T do:**
- Access Redux store directly
- Dispatch actions
- Know about app state shape
- Fetch data from APIs

## Redux Connect Patterns

### Basic connect()

```javascript
import { connect } from 'react-redux';
import MyComponent from './MyComponent';

const mapStateToProps = state => ({
  user: state.data.user.user,
  isLoading: state.data.user.isLoading,
});

const mapDispatchToProps = {
  fetchUser,
  updateUser,
};

export default connect(mapStateToProps, mapDispatchToProps)(MyComponent);
```

### connect() with Selectors

```javascript
import { connect } from 'react-redux';
import { getUser, isUserLoading } from '../../data/user/selectors';
import { fetchUser } from '../../data/user/actions';

const mapStateToProps = state => ({
  user: getUser(state),              // Selector
  isLoading: isUserLoading(state),   // Selector
});

export default connect(mapStateToProps, { fetchUser })(MyComponent);
```

**Benefits of selectors:**
- Encapsulate state shape
- Memoization with reselect
- Easier refactoring
- Testable independently

### mapDispatchToProps Patterns

**Object shorthand** (recommended):
```javascript
import { fetchUser, updateUser } from '../../data/user/actions';

const mapDispatchToProps = {
  fetchUser,
  updateUser,
};
```

**Function form** (when you need dispatch):
```javascript
const mapDispatchToProps = dispatch => ({
  fetchUser: id => dispatch(fetchUser(id)),
  updateUser: user => dispatch(updateUser(user)),
  clearErrors: () => dispatch({ type: 'CLEAR_ERRORS' }),
});
```

**Function form with access to ownProps**:
```javascript
const mapDispatchToProps = (dispatch, ownProps) => ({
  fetchUser: () => dispatch(fetchUser(ownProps.userId)),
});
```

### Optimizing mapStateToProps

```javascript
// ❌ Bad: Creates new object every render
const mapStateToProps = state => ({
  user: state.data.user.user,
  preferences: {  // New object reference
    theme: state.data.user.theme,
    language: state.data.user.language,
  },
});

// ✅ Good: Flat props, stable references
const mapStateToProps = state => ({
  user: state.data.user.user,
  theme: state.data.user.theme,
  language: state.data.user.language,
});

// ✅ Better: Use selector for derived data
import { getUserPreferences } from '../../data/user/selectors';

const mapStateToProps = state => ({
  user: state.data.user.user,
  preferences: getUserPreferences(state), // Memoized selector
});
```

## Flow Props Typing

### Basic Props Type

```javascript
// @flow
import type { User } from '../../data/user/types';

type Props = {
  user: ?User,
  isLoading: boolean,
  fetchUser: (id: number) => void,
};

class MyComponent extends React.Component<Props> {
  // ...
}
```

### Props with Navigation

```javascript
// @flow
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import type { AppParamList } from '../routes/param/AppParamList';

type Props = {
  // Redux props
  user: ?User,
  fetchUser: (id: number) => void,

  // Navigation props
  navigation: StackNavigationProp<AppParamList, 'Profile'>,
  route: RouteProp<AppParamList, 'Profile'>,
};

class ProfileComponent extends React.Component<Props> {
  handlePress = () => {
    this.props.navigation.navigate('Settings');
  };

  componentDidMount() {
    const { userId } = this.props.route.params;
    this.props.fetchUser(userId);
  }
}
```

### Optional Props

```javascript
type Props = {
  // Required props
  user: User,
  onPress: () => void,

  // Optional props (? suffix)
  title?: string,
  subtitle?: string,
  icon?: string,

  // Nullable props (? prefix)
  error: ?string,
  data: ?Array<Item>,
};

class MyComponent extends React.Component<Props> {
  static defaultProps = {
    title: 'Default Title',
    subtitle: '',
  };
}
```

### Props with Children

```javascript
type Props = {
  title: string,
  children: React.Node,  // Any renderable content
};

// Or for specific children types
type Props = {
  title: string,
  children: React.ChildrenArray<React.Element<any>>,
};
```

## When to Connect vs Pass Props

### Decision Framework

```
Is component reused in multiple features?
├─ YES → Consider connecting (self-contained)
└─ NO → Is data from parent?
   ├─ YES → Pass props
   └─ NO → Is prop drilling > 2 levels?
      ├─ YES → Connect at deeper level
      └─ NO → Pass props
```

### Connect at Feature Boundaries

```javascript
// ✅ Good: Connect at screen level
// HomeContainer.js
const HomeContainer = connect(mapStateToProps)(HomeComponent);

// HomeComponent.js
const HomeComponent = ({ user, videos }) => (
  <View>
    <UserProfile user={user} />           {/* Pass props */}
    <VideoList videos={videos} />         {/* Pass props */}
  </View>
);

// UserProfile.js (presentational)
const UserProfile = ({ user }) => (
  <Text>{user.name}</Text>
);
```

### Connect Deeper When Prop Drilling

```javascript
// ❌ Bad: Excessive prop drilling
<ScreenA user={user}>
  <ComponentB user={user}>
    <ComponentC user={user}>
      <ComponentD user={user}>
        <UserProfile user={user} />
      </ComponentD>
    </ComponentC>
  </ComponentB>
</ScreenA>

// ✅ Good: Connect at deeper level
<ScreenA>
  <ComponentB>
    <ComponentC>
      <ComponentD>
        <ConnectedUserProfile />  {/* Connects to Redux */}
      </ComponentD>
    </ComponentC>
  </ComponentB>
</ScreenA>
```

## Performance Optimization

### Avoiding Unnecessary Re-renders

```javascript
// ❌ Bad: Creates new function every render
const mapDispatchToProps = dispatch => ({
  onPress: () => dispatch(fetchUser(123)),  // New function reference
});

// ✅ Good: Stable function reference
class MyContainer extends React.Component {
  handlePress = () => {
    this.props.fetchUser(123);
  };

  render() {
    return <MyComponent onPress={this.handlePress} />;
  }
}

// ✅ Better: Use React.memo for functional components
const MyComponent = React.memo(({ user, onPress }) => (
  <TouchableOpacity onPress={onPress}>
    <Text>{user.name}</Text>
  </TouchableOpacity>
));
```

### Memoizing Expensive Computations

```javascript
// Component.js
import memoizeOne from 'memoize-one';

class MyComponent extends React.Component {
  // Memoize expensive filter
  getFilteredItems = memoizeOne((items, filter) => {
    return items.filter(item => item.name.includes(filter));
  });

  render() {
    const { items, filter } = this.props;
    const filteredItems = this.getFilteredItems(items, filter);

    return <FlatList data={filteredItems} />;
  }
}
```

### React.PureComponent for Class Components

```javascript
// Automatically implements shouldComponentUpdate with shallow prop comparison
class MyComponent extends React.PureComponent<Props> {
  render() {
    // Only re-renders if props change (shallow comparison)
    return <View>{this.props.title}</View>;
  }
}
```

## Testing Containers vs Components

### Testing Presentational Components

```javascript
// __tests__/HomeComponent.test.js
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HomeComponent from '../HomeComponent';

describe('HomeComponent', () => {
  const mockProps = {
    user: { id: 1, name: 'John', email: 'john@example.com' },
    isLoading: false,
    fetchUser: jest.fn(),
  };

  it('renders user name', () => {
    const { getByText } = render(<HomeComponent {...mockProps} />);
    expect(getByText('John')).toBeTruthy();
  });

  it('calls fetchUser on mount', () => {
    render(<HomeComponent {...mockProps} />);
    expect(mockProps.fetchUser).toHaveBeenCalledWith(1);
  });

  it('shows loading state', () => {
    const { getByText } = render(
      <HomeComponent {...mockProps} isLoading={true} />
    );
    expect(getByText('Loading...')).toBeTruthy();
  });
});
```

**Benefits of testing presentational components:**
- No Redux setup required
- Fast tests (no store, no middleware)
- Easy to mock props
- Test rendering logic in isolation

### Testing Containers

```javascript
// __tests__/HomeContainer.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import HomeContainer from '../HomeContainer';

const mockStore = configureMockStore();

describe('HomeContainer', () => {
  it('passes user from state to component', () => {
    const store = mockStore({
      data: {
        user: {
          user: { id: 1, name: 'John', email: 'john@example.com' },
          isLoading: false,
        },
      },
    });

    const { getByText } = render(
      <Provider store={store}>
        <HomeContainer />
      </Provider>
    );

    expect(getByText('John')).toBeTruthy();
  });
});
```

## Feature-Based Folder Structure

### Standard Structure

```
src/features/
├── home/
│   ├── containers/
│   │   └── HomeContainer.js
│   ├── components/
│   │   └── HomeComponent.js
│   ├── __tests__/
│   │   ├── HomeContainer.test.js
│   │   └── HomeComponent.test.js
│   └── Home.js  (re-export)
```

### With Nested Components

```
src/features/
├── profile/
│   ├── containers/
│   │   ├── ProfileContainer.js
│   │   └── ProfileEditContainer.js
│   ├── components/
│   │   ├── ProfileComponent.js
│   │   ├── ProfileHeader.js
│   │   ├── ProfileStats.js
│   │   └── forms/
│   │       └── ProfileEditForm.js
│   └── __tests__/
│       ├── ProfileContainer.test.js
│       └── ProfileComponent.test.js
```

### Co-locating Redux Logic

```
src/features/
├── profile/
│   ├── containers/
│   ├── components/
│   └── data/  (feature-specific Redux logic)
│       ├── actions.js
│       ├── reducers.js
│       ├── selectors.js
│       └── types.js
```

## Functional Components with Hooks

### Using useSelector and useDispatch

```javascript
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { getUser, isUserLoading } from '../../data/user/selectors';
import { fetchUser } from '../../data/user/actions';

const HomeComponent = () => {
  const user = useSelector(getUser);
  const isLoading = useSelector(isUserLoading);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUser(1));
  }, [dispatch]);

  if (isLoading) return <Text>Loading...</Text>;
  if (!user) return <Text>No user</Text>;

  return (
    <View>
      <Text>{user.name}</Text>
    </View>
  );
};
```

**Note:** Hooks require React 16.8+. The example app uses React 17, so hooks are available. However, the project uses class components for consistency.

## Common Anti-Patterns

### ❌ Redux Logic in Presentational Components

```javascript
// ❌ Bad
import { useDispatch } from 'react-redux';
import { fetchUser } from '../../data/user/actions';

const UserProfile = ({ userId }) => {
  const dispatch = useDispatch();  // Redux in presentational component

  useEffect(() => {
    dispatch(fetchUser(userId));
  }, [userId, dispatch]);

  return <View>...</View>;
};

// ✅ Good: Container handles Redux
const UserProfileContainer = ({ userId }) => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchUser(userId));
  }, [userId, dispatch]);

  return <UserProfile user={useSelector(getUser)} />;
};
```

### ❌ Over-Connecting

```javascript
// ❌ Bad: Every list item connects
const UserList = ({ userIds }) => (
  <FlatList
    data={userIds}
    renderItem={({ item }) => <ConnectedUserItem userId={item} />}
  />
);

// Each ConnectedUserItem subscribes to store

// ✅ Good: Connect once, pass props
const UserListContainer = () => {
  const users = useSelector(getUsers);
  return <UserList users={users} />;
};

const UserList = ({ users }) => (
  <FlatList
    data={users}
    renderItem={({ item }) => <UserItem user={item} />}
  />
);
```

### ❌ Not Typing Props

```javascript
// ❌ Bad: No Flow types
class MyComponent extends React.Component {
  render() {
    // this.props is `any` type
    return <Text>{this.props.user.name}</Text>;  // No type checking
  }
}

// ✅ Good: Flow typed props
type Props = {
  user: User,
  onPress: () => void,
};

class MyComponent extends React.Component<Props> {
  render() {
    // this.props is fully typed
    return <Text>{this.props.user.name}</Text>;  // Type-checked
  }
}
```

## Migration Strategies

### From All-in-One to Container/Component

**Before** (mixed concerns):
```javascript
class UserProfile extends React.Component {
  componentDidMount() {
    this.props.fetchUser(1);  // Redux
  }

  render() {
    const { user, isLoading } = this.props;  // Redux
    return (
      <View>
        <Text>{user.name}</Text>  // Presentation
      </View>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(UserProfile);
```

**After** (separated):
```javascript
// UserProfileContainer.js
class UserProfileContainer extends React.Component {
  componentDidMount() {
    this.props.fetchUser(1);
  }

  render() {
    return <UserProfileComponent {...this.props} />;
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(UserProfileContainer);

// UserProfileComponent.js (pure presentation)
const UserProfileComponent = ({ user, isLoading }) => (
  <View>
    <Text>{user.name}</Text>
  </View>
);
```

**Benefits:**
- Component is now testable without Redux
- Component is reusable in other contexts
- Easier to refactor rendering logic
