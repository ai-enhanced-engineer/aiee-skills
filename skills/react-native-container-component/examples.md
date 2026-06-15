# React Native Container/Component Examples

Example implementations for a React Native app showing Container/Component pattern with Redux.

## Complete Container/Component Pair

### HomeContainer.js - Redux Connected

```javascript
// @flow
import React from 'react';
import { connect } from 'react-redux';
import HomeComponent from './HomeComponent';
import { getUser, isRequestingUser } from '../../data/user/selectors';
import { isConnected } from '../../data/connection/selectors';
import type { User } from '../../data/user/types';

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
  isRequestingUser: isRequestingUser(state),
  isConnected: isConnected(state)
});

export default connect(mapStateToProps, null)(HomeContainer);
```

**Pattern notes**:
- Container is thin - just connects and passes props
- Uses selectors instead of direct state access
- Flow-typed props
- `mapDispatchToProps` is `null` (no actions needed)

### HomeComponent.js - Presentational

```javascript
// @flow
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Card, Container, Content } from 'native-base';
import { StackNavigationProp } from '@react-navigation/stack';
import type { AppParamList } from '../routes/param/AppParamList';
import type { User } from '../../data/user/types';
import LoadingSpinner from '../components/loading/LoadingSpinner';
import { Colors } from '../components/styles/Colors';

type Props = {
  navigation: StackNavigationProp<AppParamList, 'HomePage'>,
  user: User,
  isRequestingUser: boolean,
  isConnected: boolean,
};

class HomeComponent extends React.Component<Props> {
  render() {
    const { navigation, user, isRequestingUser, isConnected } = this.props;

    const showSpinner = isRequestingUser && !user;

    return (
      <Container>
        <Content>
          {!isConnected && <Text>Offline mode</Text>}
          {showSpinner ? (
            <LoadingSpinner />
          ) : (
            <Card>
              <Text>Welcome, {user.name}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                <Text>View Profile</Text>
              </TouchableOpacity>
            </Card>
          )}
        </Content>
      </Container>
    );
  }
}

export default HomeComponent;
```

**Pattern notes**:
- Pure presentation logic
- No Redux dependencies
- Navigation handled via props
- Easily testable with mock props

## Container with Actions

### RegistrationContainer.js

```javascript
// @flow
import { connect } from 'react-redux';
import RegistrationComponent from './components/RegistrationComponent';
import { register, clearRegistration } from '../../data/user/actions';
import { isRegistering, getUser } from '../../data/user/selectors';
import type { RegisterUser } from '../../data/user/types';

type Props = {
  isRegistering: boolean,
  user: ?User,
  register: (registerUser: RegisterUser) => Promise<void>,
  clearRegistration: () => void,
  navigation: StackNavigationProp<AuthParamList, 'Registration'>,
};

class RegistrationContainer extends React.Component<Props> {
  render() {
    return <RegistrationComponent {...this.props} />;
  }
}

const mapStateToProps = state => ({
  isRegistering: isRegistering(state),
  user: getUser(state),
});

const mapDispatchToProps = {
  register,
  clearRegistration,
};

export default connect(mapStateToProps, mapDispatchToProps)(RegistrationContainer);
```

### RegistrationComponent.js

```javascript
// @flow
import React from 'react';
import { View } from 'react-native';
import { Formik } from 'formik';
import * as Yup from 'yup';
import type { RegisterUser } from '../../data/user/types';

type Props = {
  isRegistering: boolean,
  register: (registerUser: RegisterUser) => Promise<void>,
  navigation: StackNavigationProp<AuthParamList, 'Registration'>,
};

const validationSchema = Yup.object({
  name: Yup.string().required(),
  email: Yup.string().email().required(),
  password: Yup.string().min(8).required(),
});

class RegistrationComponent extends React.Component<Props> {
  handleSubmit = async (values: RegisterUser) => {
    try {
      await this.props.register(values);
      this.props.navigation.navigate('RegistrationSuccess');
    } catch (error) {
      // Error handled by action creator (toast shown)
    }
  };

  render() {
    return (
      <Formik
        initialValues={{ name: '', email: '', password: '' }}
        validationSchema={validationSchema}
        onSubmit={this.handleSubmit}
      >
        {({ handleChange, handleBlur, handleSubmit, values, errors }) => (
          <View>
            <TextInput
              onChangeText={handleChange('name')}
              onBlur={handleBlur('name')}
              value={values.name}
            />
            {errors.name && <Text>{errors.name}</Text>}

            <Button
              onPress={handleSubmit}
              disabled={this.props.isRegistering}
            >
              <Text>{this.props.isRegistering ? 'Registering...' : 'Register'}</Text>
            </Button>
          </View>
        )}
      </Formik>
    );
  }
}

export default RegistrationComponent;
```

## Nested Containers - Connecting Deeper

### VideoGalleryContainer.js (Top Level)

```javascript
// @flow
import { connect } from 'react-redux';
import VideoGalleryComponent from './components/VideoGalleryComponent';
import { getVideos, isLoadingVideos } from '../../data/videos/selectors';
import { fetchVideos } from '../../data/videos/actions';

const mapStateToProps = state => ({
  videos: getVideos(state),
  isLoading: isLoadingVideos(state),
});

const mapDispatchToProps = {
  fetchVideos,
};

export default connect(mapStateToProps, mapDispatchToProps)(VideoGalleryComponent);
```

### VideoGalleryComponent.js (Passes Props)

```javascript
// @flow
import React from 'react';
import { FlatList } from 'react-native';
import VideoItem from './VideoItem';  // Presentational, receives props
import type { Video } from '../../data/videos/types';

type Props = {
  videos: Array<Video>,
  isLoading: boolean,
  fetchVideos: () => void,
};

class VideoGalleryComponent extends React.Component<Props> {
  componentDidMount() {
    this.props.fetchVideos();
  }

  renderItem = ({ item }: { item: Video }) => (
    <VideoItem
      video={item}
      onPress={this.handleVideoPress}
    />
  );

  handleVideoPress = (video: Video) => {
    this.props.navigation.navigate('VideoPlayer', { videoId: video.id });
  };

  render() {
    return (
      <FlatList
        data={this.props.videos}
        renderItem={this.renderItem}
        keyExtractor={item => item.id.toString()}
      />
    );
  }
}

export default VideoGalleryComponent;
```

### VideoItem.js (Presentational)

```javascript
// @flow
import React from 'react';
import { TouchableOpacity, Text, Image } from 'react-native';
import type { Video } from '../../data/videos/types';

type Props = {
  video: Video,
  onPress: (video: Video) => void,
};

const VideoItem = ({ video, onPress }: Props) => (
  <TouchableOpacity onPress={() => onPress(video)}>
    <Image source={{ uri: video.thumbnail }} />
    <Text>{video.title}</Text>
    <Text>{video.duration}</Text>
  </TouchableOpacity>
);

export default VideoItem;
```

**Pattern notes**:
- VideoGalleryContainer connects once
- VideoItem receives props (not connected)
- Good performance (one Redux subscription, not 100+)

## Testing Examples

### Testing Presentational Component

```javascript
// __tests__/HomeComponent.test.js
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HomeComponent from '../HomeComponent';

describe('HomeComponent', () => {
  const mockNavigation = {
    navigate: jest.fn(),
  };

  const mockProps = {
    navigation: mockNavigation,
    user: { id: 1, name: 'John', email: 'john@example.com' },
    isRequestingUser: false,
    isConnected: true,
  };

  it('renders user name', () => {
    const { getByText } = render(<HomeComponent {...mockProps} />);
    expect(getByText('Welcome, John')).toBeTruthy();
  });

  it('navigates to profile on button press', () => {
    const { getByText } = render(<HomeComponent {...mockProps} />);

    fireEvent.press(getByText('View Profile'));

    expect(mockNavigation.navigate).toHaveBeenCalledWith('Profile');
  });

  it('shows loading spinner when requesting user', () => {
    const { getByTestId } = render(
      <HomeComponent {...mockProps} isRequestingUser={true} user={null} />
    );
    expect(getByTestId('loading-spinner')).toBeTruthy();
  });

  it('shows offline mode banner when disconnected', () => {
    const { getByText } = render(
      <HomeComponent {...mockProps} isConnected={false} />
    );
    expect(getByText('Offline mode')).toBeTruthy();
  });
});
```

### Testing Container

```javascript
// __tests__/HomeContainer.test.js
import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import configureMockStore from 'redux-mock-store';
import HomeContainer from '../HomeContainer';

const mockStore = configureMockStore();

describe('HomeContainer', () => {
  it('maps user from state to props', () => {
    const store = mockStore({
      data: {
        user: {
          user: { id: 1, name: 'John', email: 'john@example.com' },
          isLoading: false,
        },
        connection: {
          isConnected: true,
        },
      },
    });

    const { getByText } = render(
      <Provider store={store}>
        <HomeContainer navigation={{}} />
      </Provider>
    );

    expect(getByText('Welcome, John')).toBeTruthy();
  });

  it('maps isRequestingUser from state to props', () => {
    const store = mockStore({
      data: {
        user: {
          user: null,
          isLoading: true,
        },
        connection: {
          isConnected: true,
        },
      },
    });

    const { getByTestId } = render(
      <Provider store={store}>
        <HomeContainer navigation={{}} />
      </Provider>
    );

    expect(getByTestId('loading-spinner')).toBeTruthy();
  });
});
```

## Feature-Based Folder Structure

Real structure from a React Native app:

```
src/features/
├── home/
│   ├── Home.js  (exports HomeContainer)
│   ├── HomeContainer.js
│   └── HomeComponent.js
├── registration/
│   ├── containers/
│   │   ├── RegistrationContainer.js
│   │   ├── RegistrationSuccessContainer.js
│   │   └── RegistrationTourEndContainer.js
│   └── components/
│       ├── RegistrationComponent.js
│       ├── RegistrationSuccessComponent.js
│       ├── RegistrationFormComponent.js
│       └── RegistrationTourEndComponent.js
├── video/
│   ├── container/
│   │   ├── VideoGalleryContainer.js
│   │   └── VideoGalleryCategoriesContainer.js
│   └── components/
│       ├── VideoGalleryComponent.js
│       ├── VideoComponent.js
│       └── VideoGalleryCategoriesComponent.js
└── settings/
    ├── containers/
    │   └── SettingsContainer.js
    └── components/
        └── SettingsComponent.js
```

## Performance Optimization Example

### Memoizing Selector in Container

```javascript
// VideoGalleryContainer.js with memoized selector
import { createSelector } from 'reselect';
import { getVideos } from '../../data/videos/selectors';
import { getActiveCategory } from '../../data/videoFilters/selectors';

// Memoized selector - only recomputes when videos or category changes
const getFilteredVideos = createSelector(
  [getVideos, getActiveCategory],
  (videos, category) => {
    if (!category) return videos;
    return videos.filter(v => v.category === category);
  }
);

const mapStateToProps = state => ({
  videos: getFilteredVideos(state),  // Memoized
  category: getActiveCategory(state),
});

export default connect(mapStateToProps)(VideoGalleryComponent);
```

**Benefits**:
- Filtering only runs when videos or category changes
- Component doesn't re-render unnecessarily
- Better performance with large lists

## Key Patterns

1. **Thin containers**: Containers just connect and pass props
2. **Selectors**: Use selectors instead of direct state access
3. **Feature folders**: Organize by feature, not by type
4. **Flow types**: Always type props for type safety
5. **Testing separation**: Test containers and components separately
6. **Performance**: Memoize expensive selectors, avoid over-connecting
