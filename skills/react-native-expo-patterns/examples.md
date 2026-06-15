# React Native + Expo Patterns Examples

Complete implementations from a React Native app (React Native 0.64 + Expo 44).

## app.json Configuration

Example configuration:

```json
{
  "name": "exampleapp",
  "displayName": "Example Mobile App",
  "expo": {
    "scheme": "exampleapp",
    "owner": "exampleapp",
    "name": "Example App",
    "description": "Example Mobile App...",
    "icon": "./assets/app-icon.png",
    "privacy": "public",
    "slug": "exampleapp",
    "ios": {
      "bundleIdentifier": "com.example.exampleapp",
      "buildNumber": "1.5.1",
      "requireFullScreen": true,
      "infoPlist": {
        "NSCameraUsageDescription": "Example App will only use the photos you take to make your account more personal to you. Your photos will never be shared without your permission.",
        "NSPhotoLibraryUsageDescription": "Example App will only use the photos you choose to make your account more personal to you. Your photos will never be shared without your permission."
      }
    },
    "android": {
      "package": "com.example.exampleapp",
      "versionCode": 18,
      "softwareKeyboardLayoutMode": "pan"
    },
    "androidStatusBar": {
      "backgroundColor": "#EEF5F7",
      "translucent": false
    },
    "version": "1.5.0",
    "assetBundlePatterns": [
      "**/*",
      "assets/*"
    ],
    "splash": {
      "image": "./assets/splash-screen.png",
      "resizeMode": "cover",
      "backgroundColor": "#FFFFFF",
      "width": "95%",
      "justifyContent": "center",
      "alignSelf": "center"
    },
    "extra": {
      "eas": {
        "projectId": "00000000-0000-0000-0000-000000000000"
      }
    }
  }
}
```

**Key points**:
- NSCameraUsageDescription explains why camera is needed (required for iOS)
- Build numbers track deployments (iOS buildNumber, Android versionCode)
- androidStatusBar prevents UI overlap on Android
- extra.eas.projectId connects to EAS Build

## Font Loading with Splash Screen Coordination

From `src/features/routes/Routes.js`:

```javascript
import React, { useState, useEffect, useCallback } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';

export default function Routes({ user, isRequestingUser }: Props) {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Load custom fonts and icon fonts
        await Font.loadAsync({
          Roboto: require('native-base/Fonts/Roboto.ttf'),
          Roboto_medium: require('native-base/Fonts/Roboto_medium.ttf'),
          ...Ionicons.font,
        });
      } catch (error) {
        console.warn(error);
      } finally {
        // Mark app as ready (triggers splash screen hide)
        setIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (isReady) {
      // Hide splash screen once fonts are loaded and UI is rendered
      await SplashScreen.hideAsync();
    }
  }, [isReady]);

  // Don't render app until fonts are loaded
  if (!isReady) {
    return null;
  }

  return (
    <NavigationContainer onLayout={onLayoutRootView}>
      {/* App content */}
    </NavigationContainer>
  );
}
```

**Pattern breakdown**:
1. Start with `isReady = false` to block rendering
2. Load fonts in `useEffect` on mount
3. Set `isReady = true` when fonts finish loading
4. Return `null` until ready (splash screen stays visible)
5. Use `onLayout` callback to hide splash screen after first render
6. `useCallback` ensures splash only hides once

**Why this pattern**:
- Prevents "Font not loaded" errors
- Smooth transition from splash to app
- No text flash (fonts loaded before render)

## Deep Linking Configuration

From `src/features/routes/Routes.js`:

```javascript
import * as Linking from 'expo-linking';
import { NavigationContainer } from '@react-navigation/native';

// Create URL prefix for deep links
const prefix = Linking.makeUrl('/');

// Define screen mappings
const config = {
  screens: {
    ResetPassword: 'reset-password'
  },
};

const linking = {
  prefixes: [prefix],
  config
};

// Connect to React Navigation
<NavigationContainer linking={linking}>
  {user ? <AppStack /> : <AuthStack />}
</NavigationContainer>
```

**How it works**:
- `Linking.makeUrl('/')` creates: `exampleapp://` (from app.json scheme)
- URL `exampleapp://reset-password` navigates to ResetPassword screen
- Works with both custom schemes and universal links

**Testing deep links**:
```bash
# iOS Simulator
xcrun simctl openurl booted exampleapp://reset-password

# Android
adb shell am start -a android.intent.action.VIEW -d "exampleapp://reset-password"
```

## Camera Integration with Permanent Storage

Complete pattern for capturing and storing photos:

```javascript
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

export default function ProfilePhotoScreen() {
  const [hasPermission, setHasPermission] = useState(null);
  const [photoUri, setPhotoUri] = useState(null);
  const cameraRef = useRef(null);

  // Request camera permission
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  // Take photo and store permanently
  const takePhoto = async () => {
    if (!cameraRef.current) return;

    try {
      // Capture to temp storage
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8, // Balance quality vs file size
        base64: false, // Don't include base64 (saves memory)
        exif: true, // Include metadata
      });

      // CRITICAL: Copy to permanent storage
      const permanentUri = `${FileSystem.documentDirectory}profile_${Date.now()}.jpg`;
      await FileSystem.copyAsync({
        from: photo.uri, // Temp URI (will be deleted by OS)
        to: permanentUri, // Permanent URI
      });

      setPhotoUri(permanentUri);

      // Upload to server
      await uploadPhoto(permanentUri);
    } catch (error) {
      console.error('Photo capture failed:', error);
      alert('Failed to take photo');
    }
  };

  // Choose from gallery
  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      alert('Permission required to access photos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      const selectedUri = result.assets[0].uri;
      setPhotoUri(selectedUri);
      await uploadPhoto(selectedUri);
    }
  };

  // Upload to backend
  const uploadPhoto = async (uri) => {
    const formData = new FormData();
    formData.append('photo', {
      uri,
      type: 'image/jpeg',
      name: 'profile.jpg',
    });

    await fetch('https://api.example.com/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  };

  if (hasPermission === null) {
    return <Text>Requesting camera permission...</Text>;
  }

  if (hasPermission === false) {
    return (
      <View>
        <Text>Camera access denied</Text>
        <Button title="Grant Permission" onPress={() => {
          Linking.openSettings(); // Open app settings
        }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Camera
        style={{ flex: 1 }}
        type={Camera.Constants.Type.front}
        ref={cameraRef}
      >
        <View style={styles.controls}>
          <TouchableOpacity onPress={takePhoto}>
            <Icon name="camera" size={60} color="white" />
          </TouchableOpacity>
          <TouchableOpacity onPress={pickImage}>
            <Icon name="image" size={50} color="white" />
          </TouchableOpacity>
        </View>
      </Camera>

      {photoUri && (
        <Image source={{ uri: photoUri }} style={styles.preview} />
      )}
    </View>
  );
}
```

**Critical pattern**: `FileSystem.copyAsync` is mandatory. Camera photos go to temp storage and will be deleted by iOS/Android.

## File Sharing

Share documents, images, or PDFs:

```javascript
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

// Share PDF report
const shareReport = async () => {
  // Generate or fetch file
  const pdfUri = FileSystem.documentDirectory + 'report.pdf';

  // Check if sharing available
  if (!(await Sharing.isAvailableAsync())) {
    alert('Sharing not available on this device');
    return;
  }

  // Open native share sheet
  await Sharing.shareAsync(pdfUri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share Report',
    UTI: 'com.adobe.pdf', // iOS Universal Type Identifier
  });
};

// Share training certificate
const shareCertificate = async (imageUri) => {
  await Sharing.shareAsync(imageUri, {
    mimeType: 'image/jpeg',
    dialogTitle: 'Share Certificate',
  });
};
```

## Secure Storage for Auth Tokens

Never store tokens in AsyncStorage (unencrypted):

```javascript
import * as SecureStore from 'expo-secure-store';

// Store auth token securely
const saveAuthToken = async (token) => {
  try {
    await SecureStore.setItemAsync('auth_token', token);
  } catch (error) {
    console.error('Failed to save token:', error);
  }
};

// Retrieve auth token
const getAuthToken = async () => {
  try {
    const token = await SecureStore.getItemAsync('auth_token');
    return token;
  } catch (error) {
    console.error('Failed to read token:', error);
    return null;
  }
};

// Delete on logout
const logout = async () => {
  try {
    await SecureStore.deleteItemAsync('auth_token');
  } catch (error) {
    console.error('Failed to delete token:', error);
  }
};

// Use in API calls
const fetchUserProfile = async () => {
  const token = await getAuthToken();

  const response = await fetch('https://api.example.com/user', {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  return response.json();
};
```

## Environment Variables

Use `app.config.js` for environment-aware configuration:

```javascript
// app.config.js
export default ({ config }) => {
  const env = process.env.APP_ENV || 'development';

  const envConfig = {
    development: {
      apiUrl: 'http://localhost:3000',
      apiKey: process.env.DEV_API_KEY,
    },
    staging: {
      apiUrl: 'https://staging-api.example.com',
      apiKey: process.env.STAGING_API_KEY,
    },
    production: {
      apiUrl: 'https://api.example.com',
      apiKey: process.env.PROD_API_KEY, // From EAS Secrets
    },
  };

  return {
    ...config,
    name: env === 'production' ? 'Example App' : `Example App (${env})`,
    slug: 'exampleapp',
    extra: {
      apiUrl: envConfig[env].apiUrl,
      apiKey: envConfig[env].apiKey,
      env,
    },
  };
};
```

Access in app:

```javascript
import Constants from 'expo-constants';

const API_URL = Constants.manifest?.extra?.apiUrl;
const API_KEY = Constants.manifest?.extra?.apiKey;

// API client
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'X-API-Key': API_KEY,
  },
});
```

Build with environment:

```bash
# Development
APP_ENV=development expo start

# Production build
APP_ENV=production eas build --profile production
```

## EAS Build Workflow

Real workflow for a React Native app:

```bash
# 1. Update version in app.json
# iOS: increment buildNumber
# Android: increment versionCode

# 2. Build for iOS
eas build --profile production --platform ios

# 3. Build for Android
eas build --profile production --platform android

# 4. Test internal build
eas build --profile preview --platform all

# 5. Submit to stores
eas submit --platform ios
eas submit --platform android
```

## OTA Updates

Push JavaScript updates without app store approval:

```javascript
import * as Updates from 'expo-updates';
import { useEffect } from 'react';

export default function App() {
  useEffect(() => {
    // Check for updates on app start
    checkForUpdates();
  }, []);

  const checkForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();

      if (update.isAvailable) {
        // Download update
        await Updates.fetchUpdateAsync();

        // Show alert to user
        Alert.alert(
          'Update Available',
          'A new version is ready. Restart to apply.',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Restart Now', onPress: () => Updates.reloadAsync() },
          ]
        );
      }
    } catch (error) {
      // Handle update error gracefully
      console.error('Update check failed:', error);
    }
  };

  return <AppContent />;
}
```

Publish update:

```bash
# Publish to default channel
eas update --auto --message "Fix login issue"

# Publish to specific channel
eas update --channel preview --message "Test new feature"
```

## Platform-Specific Code

Handle iOS vs Android differences:

```javascript
import { Platform, StyleSheet } from 'react-native';

// Platform.select for inline differences
const styles = StyleSheet.create({
  container: {
    paddingTop: Platform.select({
      ios: 20, // iOS status bar
      android: 0, // Android handles it
    }),
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
});

// Platform.OS for conditional logic
if (Platform.OS === 'ios') {
  // iOS-specific behavior
  await Linking.openURL('tel:1234567890');
} else {
  // Android-specific behavior
  await Linking.openURL('tel://1234567890');
}

// Platform.Version for version-specific code
if (Platform.OS === 'android' && Platform.Version >= 23) {
  // Android 6.0+ runtime permissions
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA
  );
}
```

## Troubleshooting

### "Font not loaded" error

**Problem**: App crashes with "Font 'Roboto' is not loaded"

**Solution**: Load fonts before rendering (see font loading example above)

### Camera photos disappear

**Problem**: Photos taken with camera can't be found later

**Solution**: Copy from temp URI to `FileSystem.documentDirectory` immediately after capture

### Deep links not working

**Problem**: Opening `myapp://screen` does nothing

**Solution**:
1. Check `scheme` in app.json matches URL scheme
2. Verify React Navigation `linking` config
3. Test with development build, not Expo Go (custom schemes don't work in Expo Go)

### Build fails with "Native module cannot be found"

**Problem**: `eas build` fails with module not found error

**Solution**:
1. Check if library requires custom native code
2. Find Expo-compatible alternative, or
3. Run `expo prebuild` to migrate to bare workflow

### AsyncStorage data lost on logout

**Problem**: User data persists after logout

**Solution**: Clear AsyncStorage AND SecureStore on logout:

```javascript
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const logout = async () => {
  // Clear all data
  await AsyncStorage.clear();
  await SecureStore.deleteItemAsync('auth_token');

  // Reset Redux state
  dispatch({ type: 'LOGGED_OUT' });
};
```

## Metro Troubleshooting Commands

### Stale Watcher Fix

When Metro throws `Failed to get the SHA-1 for: .../metro-require/require.js`:

```bash
lsof -ti :8081 | xargs kill -9   # Kill Metro process
rm -rf /tmp/metro-*               # Clear stale watcher cache
npx expo start --clear            # Rebuild watcher index from scratch
```

### Surfacing JS Errors Behind Native Crash Screens

`RCTCxxBridge handleError` crash screen shows only native stack traces. The actual JS error is in Metro's bundle response:

```bash
curl -s http://localhost:8081/index.bundle?platform=ios&dev=true&minify=false | tail -5
```

## Environment Variables: Conditional Spread Pattern

```js
// app.config.js
export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    // ❌ BAD: || undefined still creates the key, overwriting spread value
    // classifierUrl: process.env.CLASSIFIER_URL || undefined,

    // ✅ GOOD: conditional spread preserves app.json extra values when env var is unset
    ...(process.env.CLASSIFIER_URL ? { classifierUrl: process.env.CLASSIFIER_URL } : {}),
  },
});
```
