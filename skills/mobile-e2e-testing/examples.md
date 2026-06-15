# Mobile E2E Testing Examples

## Maestro YAML: Login Flow

```yaml
# .maestro/flows/login-flow.yaml
appId: com.myapp.example
---
- launchApp
- tapOn: "Email"
- inputText: "user@example.com"
- tapOn: "Password"
- inputText: "secretPassword123"
- tapOn: "Sign In"
- assertVisible: "Welcome, User"
```

## Maestro YAML: Login with Environment Variables and Error Handling

```yaml
# .maestro/flows/login-with-env.yaml
appId: com.myapp.example
env:
  USERNAME: ${TEST_USER}
  PASSWORD: ${TEST_PASS}
---
- launchApp

# Dismiss optional onboarding if present
- runFlow:
    when:
      visible: "Skip Onboarding"
    file: dismiss-onboarding.yaml

- tapOn: "Email"
- inputText: ${USERNAME}
- tapOn: "Password"
- inputText: ${PASSWORD}
- tapOn: "Sign In"
- assertVisible: "Welcome"

# Verify error case
- tapOn: "Sign Out"
- tapOn: "Email"
- inputText: "wrong@example.com"
- tapOn: "Password"
- inputText: "badpassword"
- tapOn: "Sign In"
- assertVisible: "Invalid credentials"
```

## Maestro YAML: Navigation and Form Submission

```yaml
# .maestro/flows/create-profile.yaml
appId: com.myapp.example
---
- launchApp

# Navigate to profile creation
- tapOn: "Get Started"
- tapOn: "Create Profile"

# Fill form fields
- tapOn: "First Name"
- inputText: "Jane"
- tapOn: "Last Name"
- inputText: "Doe"
- tapOn: "Email"
- inputText: "jane.doe@example.com"

# Scroll to reveal more fields
- scroll

- tapOn: "Phone Number"
- inputText: "+15551234567"

# Select from dropdown
- tapOn: "Country"
- scrollUntilVisible:
    element: "Canada"
- tapOn: "Canada"

# Submit
- tapOn: "Save Profile"
- waitForAnimationToEnd
- assertVisible: "Profile created successfully"
- assertVisible: "Jane Doe"
```

## Maestro YAML: Camera Permission Grant and Photo Capture

```yaml
# .maestro/flows/camera-permission-denied.yaml
appId: com.myapp.example
---
- launchApp:
    permissions:
      camera: deny
- tapOn: "Open Camera"
- assertVisible: "Camera permission required"
- assertVisible: "Grant Permission"
```

```yaml
# .maestro/flows/camera-capture-flow.yaml
appId: com.myapp.example
---
- launchApp:
    permissions:
      camera: grant
      photos: grant
- tapOn: "Open Camera"
- assertVisible: "Camera Preview"

# Take a photo
- tapOn: "Capture"
- waitForAnimationToEnd
- assertVisible: "Photo Preview"

# Save to library
- tapOn: "Save to Library"
- waitForAnimationToEnd:
    timeout: 5000
- assertVisible: "Photo saved"

# Verify in gallery
- back
- tapOn: "Gallery"
- assertVisible: "1 Photo"
```

## Maestro YAML: Video Player Controls

```yaml
# .maestro/flows/video-playback.yaml
appId: com.myapp.example
---
- launchApp
- tapOn: "Video Library"
- tapOn: "My Recording"

# Verify player loaded
- assertVisible: "00:00"

# Play and verify controls
- tapOn: "Play"
- waitForAnimationToEnd
- assertVisible: "Pause"

# Pause playback
- tapOn: "Pause"
- assertVisible: "Play"
```

## Maestro YAML: File Upload Flow

```yaml
# .maestro/flows/video-upload.yaml
appId: com.myapp.example
---
- launchApp
- tapOn: "Upload Video"
- tapOn: "Recent"
- tapOn: "test-video.mp4"
- assertVisible: "Uploading..."
- waitForAnimationToEnd:
    timeout: 30000
- assertVisible: "Upload Complete"
```

## Maestro CI: GitHub Actions Workflow

```yaml
# .github/workflows/mobile-e2e.yml
name: Mobile E2E Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-report
          path: coverage/

  e2e-android:
    needs: unit-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: cd android && ./gradlew assembleDebug
      - uses: mobile-dev-inc/action-maestro-cloud@v2.0.2
        with:
          api-key: ${{ secrets.MAESTRO_API_KEY }}
          project-id: ${{ secrets.MAESTRO_PROJECT_ID }}
          app-file: android/app/build/outputs/apk/debug/app-debug.apk

  e2e-ios:
    needs: unit-tests
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx expo prebuild --platform ios
      - name: Build iOS simulator app
        run: |
          xcodebuild -workspace ios/MyApp.xcworkspace \
            -scheme MyApp -configuration Debug \
            -sdk iphonesimulator -derivedDataPath build
      - uses: mobile-dev-inc/action-maestro-cloud@v2.0.2
        with:
          api-key: ${{ secrets.MAESTRO_API_KEY }}
          project-id: ${{ secrets.MAESTRO_PROJECT_ID }}
          app-file: build/Build/Products/Debug-iphonesimulator/MyApp.app
```

## Detox TypeScript: Login Flow

```typescript
// e2e/login.test.ts
import { device, element, by, expect } from "detox";

describe("Login Flow", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("should login with valid credentials", async () => {
    await element(by.id("email-input")).typeText("user@example.com");
    await element(by.id("password-input")).typeText("secretPassword123");
    await element(by.id("login-button")).tap();

    await expect(element(by.text("Welcome, User"))).toBeVisible();
  });

  it("should show error for invalid credentials", async () => {
    await element(by.id("email-input")).typeText("wrong@example.com");
    await element(by.id("password-input")).typeText("wrongpassword");
    await element(by.id("login-button")).tap();

    await expect(element(by.text("Invalid credentials"))).toBeVisible();
  });

  it("should navigate to forgot password", async () => {
    await element(by.id("forgot-password-link")).tap();

    await expect(element(by.text("Reset Password"))).toBeVisible();
    await expect(element(by.id("reset-email-input"))).toBeVisible();
  });
});
```

## Detox TypeScript: Camera Permission Handling

```typescript
// e2e/camera-permissions.test.ts
import { device, element, by, expect } from "detox";

describe("Camera Permissions", () => {
  it("should handle camera permission granted", async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { camera: "YES" },
    });

    await element(by.id("open-camera-button")).tap();
    await expect(element(by.id("camera-preview"))).toBeVisible();
    await expect(element(by.id("capture-button"))).toBeVisible();
  });

  it("should show permission prompt when denied", async () => {
    await device.launchApp({
      newInstance: true,
      permissions: { camera: "NO" },
    });

    await element(by.id("open-camera-button")).tap();
    await expect(element(by.text("Camera permission required"))).toBeVisible();
    await expect(element(by.id("grant-permission-button"))).toBeVisible();
  });
});
```

## Jest + RNTL: Component Test for Video Player

```typescript
// __tests__/components/VideoPlayer.test.tsx
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { VideoPlayer } from "../../src/components/VideoPlayer";

const mockVideo = {
  uri: "https://example.com/video.mp4",
  title: "Test Video",
  duration: 120,
};

describe("VideoPlayer", () => {
  it("renders video title and duration", () => {
    const { getByText } = render(<VideoPlayer video={mockVideo} />);

    expect(getByText("Test Video")).toBeVisible();
    expect(getByText("2:00")).toBeVisible();
  });

  it("toggles play and pause", () => {
    const { getByLabelText, queryByLabelText } = render(
      <VideoPlayer video={mockVideo} />
    );

    const playButton = getByLabelText("Play video");
    fireEvent.press(playButton);

    expect(queryByLabelText("Pause video")).toBeVisible();
    expect(queryByLabelText("Play video")).toBeNull();

    fireEvent.press(getByLabelText("Pause video"));
    expect(queryByLabelText("Play video")).toBeVisible();
  });

  it("calls onComplete when video finishes", async () => {
    const onComplete = jest.fn();
    const { getByLabelText } = render(
      <VideoPlayer video={mockVideo} onComplete={onComplete} />
    );

    fireEvent.press(getByLabelText("Play video"));

    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 }
    );
  });

  it("displays loading indicator while buffering", () => {
    const { getByLabelText, getByTestId } = render(
      <VideoPlayer video={mockVideo} initialBuffering={true} />
    );

    expect(getByTestId("buffering-indicator")).toBeVisible();
    expect(getByLabelText("Play video")).toBeDisabled();
  });

  it("handles seek interaction", () => {
    const { getByLabelText, getByText } = render(
      <VideoPlayer video={mockVideo} />
    );

    fireEvent.press(getByLabelText("Play video"));
    fireEvent(getByLabelText("Seek bar"), "onSlidingComplete", 60);

    expect(getByText("1:00")).toBeVisible();
  });
});
```

## Jest + RNTL: Navigation Test

```typescript
// __tests__/screens/HomeScreen.test.tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../../src/screens/HomeScreen";
import { DetailsScreen } from "../../src/screens/DetailsScreen";

const Stack = createNativeStackNavigator();

const renderWithNavigation = () => {
  return render(
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Details" component={DetailsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

describe("HomeScreen Navigation", () => {
  it("navigates to Details when item is pressed", async () => {
    const { getByText, findByText } = renderWithNavigation();

    fireEvent.press(getByText("View Details"));

    expect(await findByText("Details Screen")).toBeVisible();
  });
});
```

## Device Farm Configuration: Firebase Test Lab

```bash
#!/usr/bin/env bash
# scripts/run-firebase-tests.sh
# Run E2E tests on Firebase Test Lab with real devices

set -euo pipefail

APP_APK="android/app/build/outputs/apk/debug/app-debug.apk"
TEST_APK="android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"

echo "Running instrumented tests on Firebase Test Lab..."

gcloud firebase test android run \
  --app "$APP_APK" \
  --test "$TEST_APK" \
  --device model=Pixel6,version=33,locale=en,orientation=portrait \
  --device model=Pixel7Pro,version=34,locale=en,orientation=portrait \
  --timeout 15m \
  --results-bucket gs://my-app-test-results \
  --results-dir "run-$(date +%Y%m%d-%H%M%S)" \
  --num-flaky-test-attempts 2

echo "Tests complete. Results at: https://console.firebase.google.com/project/my-project/testlab"
```

```yaml
# .github/workflows/firebase-test-lab.yml
name: Firebase Test Lab

on:
  push:
    branches: [main]

jobs:
  firebase-e2e:
    runs-on: ubuntu-latest
    permissions:
      id-token: write
      contents: read
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"

      - name: Build APKs
        run: |
          cd android
          ./gradlew assembleDebug assembleAndroidTest

      - name: Authenticate to Google Cloud
        uses: google-github-actions/auth@v2
        with:
          workload_identity_provider: ${{ secrets.WIF_PROVIDER }}
          service_account: ${{ secrets.GCP_SA_EMAIL }}

      - name: Run Firebase Test Lab
        run: |
          gcloud firebase test android run \
            --app android/app/build/outputs/apk/debug/app-debug.apk \
            --test android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk \
            --device model=Pixel6,version=33 \
            --timeout 10m \
            --num-flaky-test-attempts 2
```

## Accessibility Test: Detox with Label Verification

```typescript
// e2e/accessibility.test.ts
import { device, element, by, expect } from "detox";

describe("Accessibility", () => {
  beforeAll(async () => {
    await device.launchApp({ newInstance: true });
  });

  beforeEach(async () => {
    await device.reloadReactNative();
  });

  it("login form has proper accessibility labels", async () => {
    await expect(element(by.id("email-input"))).toHaveAccessibilityLabel(
      "Email address"
    );
    await expect(element(by.id("password-input"))).toHaveAccessibilityLabel(
      "Password"
    );
    await expect(element(by.id("login-button"))).toHaveAccessibilityLabel(
      "Sign in to your account"
    );
  });

  it("form elements have correct accessibility roles", async () => {
    await expect(element(by.id("email-input"))).toHaveAccessibilityRole(
      "textField"
    );
    await expect(element(by.id("login-button"))).toHaveAccessibilityRole(
      "button"
    );
    await expect(element(by.id("page-header"))).toHaveAccessibilityRole(
      "header"
    );
  });

  it("error messages are accessible after invalid submission", async () => {
    await element(by.id("login-button")).tap();

    await expect(
      element(by.id("email-error"))
    ).toHaveAccessibilityLabel("Error: Email is required");

    await expect(
      element(by.id("password-error"))
    ).toHaveAccessibilityLabel("Error: Password is required");
  });

  it("navigation tabs have proper labels", async () => {
    await expect(element(by.id("tab-home"))).toHaveAccessibilityLabel("Home");
    await expect(element(by.id("tab-profile"))).toHaveAccessibilityLabel(
      "Profile"
    );
    await expect(element(by.id("tab-settings"))).toHaveAccessibilityLabel(
      "Settings"
    );
  });
});
```

## Complete Test Suite Structure

```
my-react-native-app/
├── __tests__/
│   ├── components/
│   │   ├── VideoPlayer.test.tsx
│   │   ├── LoginForm.test.tsx
│   │   ├── ProfileCard.test.tsx
│   │   └── CameraButton.test.tsx
│   ├── hooks/
│   │   ├── useAuth.test.ts
│   │   ├── useCamera.test.ts
│   │   └── useVideoUpload.test.ts
│   ├── screens/
│   │   ├── HomeScreen.test.tsx
│   │   ├── LoginScreen.test.tsx
│   │   └── ProfileScreen.test.tsx
│   └── utils/
│       ├── formatDuration.test.ts
│       └── validateForm.test.ts
├── .maestro/
│   ├── flows/
│   │   ├── login-flow.yaml
│   │   ├── login-with-env.yaml
│   │   ├── create-profile.yaml
│   │   ├── camera-permission-denied.yaml
│   │   ├── camera-capture-flow.yaml
│   │   ├── video-playback.yaml
│   │   └── video-upload.yaml
│   └── subflows/
│       ├── dismiss-onboarding.yaml
│       └── dismiss-cookies.yaml
├── e2e/
│   ├── login.test.ts
│   ├── camera-permissions.test.ts
│   ├── accessibility.test.ts
│   └── jest.config.ts
├── jest.config.ts
├── .detoxrc.js
└── scripts/
    └── run-firebase-tests.sh
```

**Jest configuration (`jest.config.ts`):**

```typescript
// jest.config.ts
import type { Config } from "jest";

const config: Config = {
  preset: "react-native",
  setupFilesAfterEnv: ["@testing-library/react-native/extend-expect"],
  transformIgnorePatterns: [
    "node_modules/(?!(@react-native|react-native|@react-navigation)/)",
  ],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/**/index.ts",
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};

export default config;
```

**Detox configuration (`.detoxrc.js`):**

```javascript
// .detoxrc.js
/** @type {import('detox').DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      config: "e2e/jest.config.ts",
      _: ["e2e"],
    },
    jest: {
      setupTimeout: 120000,
    },
  },
  apps: {
    "ios.debug": {
      type: "ios.app",
      binaryPath:
        "ios/build/Build/Products/Debug-iphonesimulator/MyApp.app",
      build:
        "xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build",
    },
    "android.debug": {
      type: "android.apk",
      binaryPath:
        "android/app/build/outputs/apk/debug/app-debug.apk",
      build:
        "cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug",
      reversePorts: [8081],
    },
  },
  devices: {
    simulator: {
      type: "ios.simulator",
      device: {
        type: "iPhone 15 Pro",
      },
    },
    emulator: {
      type: "android.emulator",
      device: {
        avdName: "Pixel_6_API_34",
      },
    },
  },
  configurations: {
    "ios.sim.debug": {
      device: "simulator",
      app: "ios.debug",
    },
    "android.emu.debug": {
      device: "emulator",
      app: "android.debug",
    },
  },
};
```

**Detox Jest configuration (`e2e/jest.config.ts`):**

```typescript
// e2e/jest.config.ts
import type { Config } from "jest";

const config: Config = {
  rootDir: "..",
  testMatch: ["<rootDir>/e2e/**/*.test.ts"],
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: "detox/runners/jest/globalSetup",
  globalTeardown: "detox/runners/jest/globalTeardown",
  reporters: ["detox/runners/jest/reporter"],
  testEnvironment: "detox/runners/jest/testEnvironment",
  verbose: true,
};

export default config;
```

## EAS Build Configuration for E2E

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "e2e": {
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      },
      "ios": {
        "simulator": true
      }
    },
    "production": {
      "autoIncrement": true
    }
  }
}
```
