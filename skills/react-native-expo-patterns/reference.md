# React Native + Expo Patterns Reference

Detailed patterns for React Native 0.64 + Expo 44 managed workflow development.

## Managed Workflow Best Practices

### Decision Matrix

| Factor | Managed | Bare |
|--------|---------|------|
| Setup Time | 5 minutes | 30+ minutes |
| Native Code Access | Limited (Expo SDK only) | Full |
| OTA Updates | Built-in | Manual setup required |
| Build Process | Cloud (EAS Build) | Local + Cloud |
| Team Skill Required | JavaScript only | JavaScript + Native (iOS/Android) |
| Bundle Size | Larger (includes Expo modules) | Smaller (only what you need) |
| Best For | MVPs, prototypes, rapid iteration | Production apps with custom native needs |

### Expo Go vs Development Builds

**Expo Go** (Sandbox app):
- Instant preview on physical devices
- No build required
- Limited to Expo SDK modules only
- Cannot use custom native modules or config plugins

**Development Builds** (`expo-dev-client`):
- Custom development client with your native code
- Required for bare workflow
- Required for managed workflow with custom native modules or config plugins
- Behaves like a production build but with dev tools

**2026 Recommendation**: Always use development builds, not Expo Go. Build once, iterate fast.

## Expo Configuration

### app.json Structure

```json
{
  "expo": {
    "name": "Display Name",
    "slug": "url-safe-slug",
    "scheme": "myapp",
    "owner": "expo-username",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "assetBundlePatterns": [
      "**/*"
    ],
    "ios": {
      "bundleIdentifier": "com.company.app",
      "buildNumber": "1",
      "infoPlist": {
        "NSCameraUsageDescription": "Explain why you need camera",
        "NSPhotoLibraryUsageDescription": "Explain why you need photo library",
        "NSMicrophoneUsageDescription": "Explain why you need microphone"
      }
    },
    "android": {
      "package": "com.company.app",
      "versionCode": 1,
      "permissions": ["CAMERA", "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"]
    },
    "extra": {
      "eas": {
        "projectId": "your-project-id"
      }
    }
  }
}
```

### Environment Variables with app.config.js

For multiple environments (dev, staging, production):

```javascript
// app.config.js
export default ({ config }) => {
  const env = process.env.APP_ENV || 'development';

  const envConfig = {
    development: {
      apiUrl: 'http://localhost:3000',
    },
    staging: {
      apiUrl: 'https://staging-api.example.com',
    },
    production: {
      apiUrl: 'https://api.example.com',
    },
  };

  return {
    ...config,
    name: env === 'production' ? 'My App' : `My App (${env})`,
    slug: 'my-app',
    extra: {
      apiUrl: envConfig[env].apiUrl,
      env,
    },
  };
};
```

Access in app:

```javascript
import Constants from 'expo-constants';

const API_URL = Constants.manifest?.extra?.apiUrl;
```

**Secrets Management**: Store sensitive keys in EAS Secrets, not in source control:

```bash
# Set secret in EAS
eas secret:create --scope project --name API_KEY --value "your-secret-key"
```

Access in `app.config.js`:

```javascript
export default ({ config }) => ({
  ...config,
  extra: {
    apiKey: process.env.API_KEY, // From EAS Secrets
  },
});
```

## Expo Modules Integration

### Camera Module

**Installation**:
```bash
expo install expo-camera
```

**Complete Pattern**:

```javascript
import React, { useState, useRef } from 'react';
import { Camera } from 'expo-camera';
import * as FileSystem from 'expo-file-system';

export default function CameraScreen() {
  const [hasPermission, setHasPermission] = useState(null);
  const [type, setType] = useState(Camera.Constants.Type.back);
  const cameraRef = useRef(null);

  // Request permission on mount
  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const takePicture = async () => {
    if (cameraRef.current) {
      // Capture photo to temp storage
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
        exif: true,
      });

      // CRITICAL: Copy to permanent storage
      const filename = `${FileSystem.documentDirectory}${Date.now()}.jpg`;
      await FileSystem.copyAsync({
        from: photo.uri,
        to: filename,
      });

      return filename; // Permanent URI
    }
  };

  if (hasPermission === null) {
    return <Text>Requesting camera permission...</Text>;
  }
  if (hasPermission === false) {
    return <Text>No access to camera</Text>;
  }

  return (
    <Camera style={{ flex: 1 }} type={type} ref={cameraRef}>
      <TouchableOpacity onPress={takePicture}>
        <Text>Take Photo</Text>
      </TouchableOpacity>
    </Camera>
  );
}
```

**Anti-Pattern**: Not copying photos from temp storage. Camera photos are saved to a temporary location that may be cleared by the OS.

### FileSystem Module

**Installation**:
```bash
expo install expo-file-system
```

**Common Operations**:

```javascript
import * as FileSystem from 'expo-file-system';

// Read file as string
const content = await FileSystem.readAsStringAsync(fileUri);

// Read file as base64
const base64 = await FileSystem.readAsStringAsync(fileUri, {
  encoding: FileSystem.EncodingType.Base64,
});

// Write file
await FileSystem.writeAsStringAsync(fileUri, data);

// Copy file
await FileSystem.copyAsync({
  from: sourceUri,
  to: destinationUri,
});

// Delete file
await FileSystem.deleteAsync(fileUri, { idempotent: true });

// Check if file exists
const fileInfo = await FileSystem.getInfoAsync(fileUri);
if (fileInfo.exists) {
  console.log('File size:', fileInfo.size);
}

// Download file
const downloadResumable = FileSystem.createDownloadResumable(
  url,
  FileSystem.documentDirectory + 'file.pdf',
  {},
  (downloadProgress) => {
    const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
    console.log(`Downloaded ${Math.round(progress * 100)}%`);
  }
);

const { uri } = await downloadResumable.downloadAsync();
```

**Storage Locations**:
- `FileSystem.documentDirectory` - Persistent, backed up, visible to user
- `FileSystem.cacheDirectory` - Persistent until system clears, not backed up

### Sharing Module

**Installation**:
```bash
expo install expo-sharing
```

**Pattern**:

```javascript
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

const shareFile = async (fileUri, mimeType = 'image/jpeg') => {
  // Check if sharing is available
  if (!(await Sharing.isAvailableAsync())) {
    alert('Sharing is not available on this device');
    return;
  }

  // Share using native share sheet
  await Sharing.shareAsync(fileUri, {
    mimeType,
    dialogTitle: 'Share your file',
    UTI: mimeType, // iOS Universal Type Identifier
  });
};

// Example: Share generated PDF
const pdfUri = FileSystem.documentDirectory + 'report.pdf';
await shareFile(pdfUri, 'application/pdf');
```

### SecureStore Module

For encrypted key-value storage (auth tokens, sensitive user data):

**Installation**:
```bash
expo install expo-secure-store
```

**Pattern**:

```javascript
import * as SecureStore from 'expo-secure-store';

// Store encrypted value
await SecureStore.setItemAsync('userToken', token);

// Retrieve encrypted value
const token = await SecureStore.getItemAsync('userToken');

// Delete encrypted value
await SecureStore.deleteItemAsync('userToken');
```

**Limitations**:
- iOS: 2048 bytes per value
- Android: No size limit

**Anti-Pattern**: Storing tokens in AsyncStorage (unencrypted) instead of SecureStore.

## Deep Linking

### Configuration

**app.json**:
```json
{
  "expo": {
    "scheme": "myapp",
    "slug": "my-app"
  }
}
```

This creates two URL schemes:
- `myapp://` (custom scheme)
- `https://my-app.expo.io` (universal link for Expo Go)

### Implementation

```javascript
import * as Linking from 'expo-linking';
import { useEffect } from 'react';

// Parse incoming URL
const url = Linking.useURL();

useEffect(() => {
  if (url) {
    const { hostname, path, queryParams } = Linking.parse(url);
    // myapp://profile/123?tab=posts
    // hostname: 'profile'
    // path: '123'
    // queryParams: { tab: 'posts' }

    // Navigate to appropriate screen
    navigation.navigate('Profile', { id: path, tab: queryParams.tab });
  }
}, [url]);

// Listen for URL changes
useEffect(() => {
  const subscription = Linking.addEventListener('url', ({ url }) => {
    const { hostname, path } = Linking.parse(url);
    // Handle URL change
  });

  return () => subscription.remove();
}, []);

// Create URL for sharing
const shareUrl = Linking.makeUrl('profile/123', { tab: 'posts' });
// Result: myapp://profile/123?tab=posts
```

### React Navigation Integration

```javascript
import * as Linking from 'expo-linking';

const prefix = Linking.makeUrl('/');

const linking = {
  prefixes: [prefix],
  config: {
    screens: {
      Home: '',
      Profile: 'profile/:id',
      Settings: 'settings',
    },
  },
};

<NavigationContainer linking={linking}>
  {/* Your navigators */}
</NavigationContainer>
```

## Font Loading

### Coordinated with Splash Screen

```javascript
import * as Font from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState, useCallback } from 'react';

// Prevent splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [appIsReady, setAppIsReady] = useState(false);

  useEffect(() => {
    async function prepare() {
      try {
        // Load fonts
        await Font.loadAsync({
          'Roboto': require('./assets/fonts/Roboto-Regular.ttf'),
          'Roboto-Bold': require('./assets/fonts/Roboto-Bold.ttf'),
        });

        // Artificial delay (optional, for logo visibility)
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (e) {
        console.warn(e);
      } finally {
        setAppIsReady(true);
      }
    }

    prepare();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if (appIsReady) {
      // Hide splash screen
      await SplashScreen.hideAsync();
    }
  }, [appIsReady]);

  if (!appIsReady) {
    return null;
  }

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView}>
      {/* Your app content */}
    </View>
  );
}
```

**Anti-Pattern**: Rendering app before fonts load → causes text flash or crash.

## EAS Build Configuration

### eas.json

```json
{
  "cli": {
    "version": ">= 0.60.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "env": {
        "APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "1234567890"
      },
      "android": {
        "serviceAccountKeyPath": "./path/to/service-account.json",
        "track": "internal"
      }
    }
  }
}
```

### Build Commands

```bash
# Development build (with dev client)
eas build --profile development --platform ios

# Preview build (internal distribution)
eas build --profile preview --platform android

# Production build
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

## OTA Updates with expo-updates

### Configuration

**app.json**:
```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/your-project-id",
      "fallbackToCacheTimeout": 0
    },
    "runtimeVersion": {
      "policy": "sdkVersion"
    }
  }
}
```

### Manual Update Check

```javascript
import * as Updates from 'expo-updates';

const checkForUpdates = async () => {
  try {
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // Restart app with new update
    }
  } catch (error) {
    console.error('Error checking for updates:', error);
  }
};
```

### Publishing Updates

```bash
# Publish update to all users on default channel
eas update --auto

# Publish to specific channel
eas update --channel preview --message "Fix login bug"
```

**Update Frequency**: Updates check on app start. Set `fallbackToCacheTimeout: 0` for immediate updates.

## Troubleshooting

### Build Fails

**"Unable to resolve module"**:
- Run `expo install` instead of `npm install` for Expo packages
- Clear cache: `expo start -c`
- Delete `node_modules` and reinstall

**"Native module cannot be found"**:
- You may be using a library that requires custom native code
- Options: Find an Expo-compatible alternative, or migrate to bare workflow

### Camera Issues

**"Camera permission denied"**:
- Check `Info.plist` (iOS) or `AndroidManifest.xml` (Android) for permission descriptions
- Request permission before using: `Camera.requestCameraPermissionsAsync()`

**Photos not persisting**:
- Always copy from temp URI to `FileSystem.documentDirectory`

### Deep Linking Not Working

**iOS Simulator**:
- Use `xcrun simctl openurl booted myapp://path`

**Android**:
- Use `adb shell am start -a android.intent.action.VIEW -d "myapp://path"`

**Expo Go**:
- Use the app.expo.io URL scheme, not your custom scheme

### Font Loading Crashes App

- Ensure fonts are loaded before rendering text
- Use SplashScreen coordination pattern
- Verify font file paths are correct

## Platform-Specific Code

```javascript
import { Platform } from 'react-native';

// Platform.select
const styles = StyleSheet.create({
  container: {
    ...Platform.select({
      ios: { paddingTop: 20 },
      android: { paddingTop: 0 },
    }),
  },
});

// Platform.OS
if (Platform.OS === 'ios') {
  // iOS-specific code
} else if (Platform.OS === 'android') {
  // Android-specific code
}

// Platform.Version
if (Platform.OS === 'ios' && Platform.Version >= '14') {
  // iOS 14+ specific code
}
```

## Bundle Size Optimization

1. **Remove unused Expo modules** (if using bare workflow)
2. **Use Hermes** JavaScript engine (Android):
   ```json
   {
     "expo": {
       "android": {
         "enableHermes": true
       }
     }
   }
   ```
3. **Enable tree shaking**: Import specific modules, not entire packages
   ```javascript
   // Good
   import Camera from 'expo-camera';

   // Avoid
   import * as Expo from 'expo';
   ```
4. **Analyze bundle**: `npx react-native-bundle-visualizer`

## expo-av to expo-video Migration

expo-av is deprecated since SDK 52 (warnings) and becomes a hard error in SDK 53. Migrate to `expo-video`, which uses a hook-based API that requires functional components.

### API Shape

```js
import { useVideoPlayer, VideoView, useEvent } from 'expo-video';

// Inside a functional component:
const player = useVideoPlayer(videoUrl, (p) => {
  p.loop = false;
  p.play();
});

// Event listeners
useEvent(player, 'playingChange', ({ isPlaying }) => { /* handle */ });
useEvent(player, 'playToEnd', () => { /* handle completion */ });
```

```jsx
<VideoView player={player} contentFit="contain" nativeControls={true} style={styles.video} />
```

### Critical Gotchas

- **`player.duration` is seconds, not milliseconds** — multiply by 1000 when comparing with elapsed time in millis. Failing to convert causes completion detection to fire far too early or never.
- **`player.duration` resolves asynchronously** — it may be 0 when the `playToEnd` event first fires. Always guard with `player.duration > 0` before doing arithmetic to avoid false completion triggers.
- **No `posterSource` prop** — unlike `expo-av`'s `Video` component, `expo-video` has no poster image support. Use a manual `<Image>` overlay positioned absolutely over the `VideoView`; hide the image on the first `playingChange` event.
- **Class components must be converted to functional** — `useVideoPlayer` and `useEvent` are hooks and cannot be called in class components.
- **Rebuild after native module changes** — after adding or removing `expo-video` (or any native module), regenerate the native project: `npx expo prebuild --platform ios --clean`. JS bundle changes alone are insufficient.

### Jest Mocking

`expo-av` in a `try/catch` block does not protect you — native module fatal errors bypass JavaScript error handling. Mock the module at the test level:

```js
jest.mock('expo-video', () => ({
  ...jest.requireActual('expo-video'),
  useVideoPlayer: jest.fn(() => ({ duration: 0, play: jest.fn() })),
  useEvent: jest.fn(),
}));
```

When mocking a single export from a barrel module like `expo`, spread `...jest.requireActual('expo')` to avoid breaking all other exports from that package.

## Cross-Platform PickerSelect

### The Problem with Native `<Picker>` on iOS

When multiple `<Picker>` components are stacked vertically on iOS, the native inline wheel spinner renders over adjacent pickers and breaks layout. On Android the same native `<Picker>` works fine.

### Pattern: Platform Branch

```js
import { Platform, Picker, TouchableOpacity, Modal, FlatList } from 'react-native';

if (Platform.OS === 'android') {
  // Use native Picker directly
  return (
    <Picker selectedValue={value} onValueChange={setValue}>
      <Picker.Item label="Select..." value={null} enabled={false} />
      {items.map(item => <Picker.Item key={item.id} label={item.label} value={item.id} />)}
    </Picker>
  );
} else {
  // iOS: modal-based picker
  return (
    <>
      <TouchableOpacity onPress={() => setModalVisible(true)}>
        <Text>{selectedLabel || 'Select...'}</Text>
      </TouchableOpacity>
      <Modal visible={modalVisible} transparent animationType="slide">
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { setValue(item.id); setModalVisible(false); }}>
              <Text>{item.label}</Text>
            </TouchableOpacity>
          )}
        />
      </Modal>
    </>
  );
}
```

### Android Placeholder Gotcha

Native `<Picker>` initializes showing the first item in the list, but it does **not** fire `onValueChange` for that initial item — the value stays `undefined` until the user actually interacts. This causes a subtle bug where a form looks filled out (the label is visible) but the underlying state value is `null`.

**Fix**: Add a disabled placeholder as the first `Picker.Item`:

```jsx
<Picker.Item label="Select an option..." value={null} enabled={false} />
```

**Defensive UX**: Pair with `disabled={!allRequiredFieldsSelected}` on the submit button so users cannot submit while fields appear filled but are actually null.

## Environment Variables (app.config.js)

### Spread Order Gotcha

When spreading environment-specific values into `app.config.js`, key order matters:

```js
// app.config.js
export default ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,           // app.json base values
    apiUrl: process.env.API_URL,  // overrides app.json if set
  },
});
```

Keys set after the spread overwrite it. A common mistake: using `process.env.X || undefined` hoping to "skip" the key when unset — `|| undefined` still creates the key with value `undefined`, which overwrites any value from the spread. Use a conditional spread instead:

```js
extra: {
  ...config.extra,
  ...(process.env.API_URL ? { apiUrl: process.env.API_URL } : {}),
},
```

### Build-Time Baking

`expoConfig.extra` (and all values set in `app.config.js`) are baked into the native binary at **build time**, not bundle time. This means:

- Changing `app.config.js` and restarting Metro does **not** pick up the new values — the old values remain in the installed app.
- The symptom progression: Network Error (wrong URL) → persists after Metro restart → resolves only after a full native rebuild with `npx expo run:ios --device`.
- This is confirmed by tracing: the env var value is embedded in the native binary's asset bundle at `eas build` or `expo run` time.

**Confirmed error progression**: If you see a Network Error that persists after Metro restart but resolves after `npx expo run:ios`, the root cause is stale baked config — not a network issue.

### On-Device Testing with Real Secrets

To bake real API credentials into a device build for end-to-end testing:

```bash
CLASSIFIER_URL=https://api.example.com CLASSIFIER_API_KEY=my-key npx expo run:ios --device
```

### Dev-Key Injection with Safe Default

A keep-forever pattern for dev builds that need to authenticate against a real server:

```js
// app.config.js
extra: {
  apiKey: process.env.CLASSIFIER_API_KEY ?? (__DEV__ ? 'local-dev-api-key' : null),
}
```

When `CLASSIFIER_API_KEY` is supplied (device build), it authenticates against the real server. When not supplied (local Metro dev), it falls back to `'local-dev-api-key'` for mock/local backend use. This pattern does not need to be reverted after testing — it is safe to keep permanently.
