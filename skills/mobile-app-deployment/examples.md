# Mobile App Deployment Examples

## eas.json — Build and Submit Profiles

A complete `eas.json` with development, preview, and production profiles for both build and submit:

```json
{
  "cli": {
    "version": ">= 12.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      },
      "env": {
        "APP_ENV": "development"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      },
      "env": {
        "APP_ENV": "preview"
      }
    },
    "production": {
      "autoIncrement": true,
      "env": {
        "APP_ENV": "production"
      }
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production",
        "releaseStatus": "completed"
      },
      "ios": {
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234",
        "ascApiKeyPath": "./AuthKey_ABC123.p8",
        "ascApiKeyIssuerId": "00000000-0000-0000-0000-000000000000",
        "ascApiKeyId": "ABC123"
      }
    },
    "internal": {
      "extends": "production",
      "android": {
        "track": "internal"
      }
    },
    "preview": {
      "extends": "production",
      "android": {
        "track": "closed",
        "releaseStatus": "draft"
      }
    }
  }
}
```

---

## app.config.ts — Versioning and Runtime Version Policy

Dynamic configuration with environment-aware settings and fingerprint runtime version:

```typescript
import { ExpoConfig, ConfigContext } from "expo/config";

const APP_ENV = process.env.APP_ENV ?? "development";

const envConfig = {
  development: {
    name: "MyApp (Dev)",
    bundleIdentifier: "com.example.myapp.dev",
    apiUrl: "https://api-dev.example.com",
  },
  preview: {
    name: "MyApp (Preview)",
    bundleIdentifier: "com.example.myapp.preview",
    apiUrl: "https://api-staging.example.com",
  },
  production: {
    name: "MyApp",
    bundleIdentifier: "com.example.myapp",
    apiUrl: "https://api.example.com",
  },
} as const;

const env = envConfig[APP_ENV as keyof typeof envConfig] ?? envConfig.development;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: env.name,
  slug: "my-app",
  version: "1.2.0",
  runtimeVersion: {
    policy: "fingerprint",
  },
  updates: {
    url: "https://u.expo.dev/your-project-id",
    enabled: true,
    checkAutomatically: "ON_LOAD",
    fallbackToCacheTimeout: 30000,
  },
  ios: {
    bundleIdentifier: env.bundleIdentifier,
    buildNumber: "1",
    infoPlist: {
      NSCameraUsageDescription: "Take photos for your profile and posts",
      NSMicrophoneUsageDescription: "Record audio for video messages",
      NSPhotoLibraryUsageDescription: "Select photos from your library",
    },
  },
  android: {
    package: env.bundleIdentifier,
    versionCode: 1,
    permissions: [
      "CAMERA",
      "READ_MEDIA_IMAGES",
      "READ_MEDIA_VIDEO",
      "RECORD_AUDIO",
    ],
  },
  extra: {
    apiUrl: env.apiUrl,
    eas: {
      projectId: "your-project-id",
    },
  },
});
```

---

## GitHub Actions — Build, Test, and Submit Pipeline

Complete CI/CD workflow that runs lint and tests on PRs, builds on merge to main, and submits to stores:

```yaml
name: Mobile CI/CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage

  build:
    needs: lint-and-test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}

      - run: npm ci
      - run: eas build --platform all --profile production --non-interactive

  submit:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: eas submit --platform all --profile production --non-interactive
```

---

## expo-updates — Update Check and Application

### Custom Update Hook

A reusable hook for checking, downloading, and applying OTA updates with user-facing state:

```typescript
import * as Updates from "expo-updates";
import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";

interface UpdateState {
  isChecking: boolean;
  isDownloading: boolean;
  isUpdateAvailable: boolean;
  error: string | null;
}

export function useAppUpdates() {
  const [state, setState] = useState<UpdateState>({
    isChecking: false,
    isDownloading: false,
    isUpdateAvailable: false,
    error: null,
  });

  const checkForUpdate = useCallback(async () => {
    if (__DEV__) return;

    setState((prev) => ({ ...prev, isChecking: true, error: null }));
    try {
      const result = await Updates.checkForUpdateAsync();
      setState((prev) => ({
        ...prev,
        isChecking: false,
        isUpdateAvailable: result.isAvailable,
      }));
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isChecking: false,
        error: e instanceof Error ? e.message : "Update check failed",
      }));
    }
  }, []);

  const downloadAndApply = useCallback(async () => {
    setState((prev) => ({ ...prev, isDownloading: true, error: null }));
    try {
      const result = await Updates.fetchUpdateAsync();
      if (result.isNew) {
        await Updates.reloadAsync();
      }
    } catch (e) {
      setState((prev) => ({
        ...prev,
        isDownloading: false,
        error: e instanceof Error ? e.message : "Update download failed",
      }));
    }
  }, []);

  const promptUpdate = useCallback(() => {
    Alert.alert(
      "Update Available",
      "A new version is ready. Restart now to get the latest features.",
      [
        { text: "Later", style: "cancel" },
        { text: "Restart", onPress: downloadAndApply },
      ]
    );
  }, [downloadAndApply]);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate]);

  return { ...state, checkForUpdate, downloadAndApply, promptUpdate };
}
```

### Force Update Gate Component

A component that blocks app usage until a critical update is applied:

```typescript
import * as Updates from "expo-updates";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

interface ForceUpdateGateProps {
  children: React.ReactNode;
}

export function ForceUpdateGate({ children }: ForceUpdateGateProps) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function forceCheck() {
      if (__DEV__) {
        setChecking(false);
        return;
      }

      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch {
        // Allow app to continue if update check fails
      } finally {
        setChecking(false);
      }
    }

    forceCheck();
  }, []);

  if (checking) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.text}>Checking for updates...</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
});
```

---

## TestFlight Distribution Setup

### Submit to TestFlight via EAS

Build and submit to TestFlight for internal and external testing:

```bash
# Build production iOS binary
eas build --platform ios --profile production

# Submit to App Store Connect (goes to TestFlight automatically)
eas submit --platform ios --profile production

# Or use the shortcut that builds and submits in one step
eas build --platform ios --profile production --auto-submit
```

### TestFlight-Specific Submit Profile

An eas.json submit profile targeting TestFlight groups:

```json
{
  "submit": {
    "testflight": {
      "ios": {
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD1234",
        "ascApiKeyPath": "./AuthKey_ABC123.p8",
        "ascApiKeyIssuerId": "00000000-0000-0000-0000-000000000000",
        "ascApiKeyId": "ABC123"
      }
    }
  }
}
```

After submission, the build appears in App Store Connect under the TestFlight tab. Internal testers receive it immediately. External testers receive it after Beta App Review approval (24-48 hours).

---

## Play Store Staged Rollout Configuration

### Staged Rollout Submit Profiles

Configure incremental rollout percentages in eas.json:

```json
{
  "submit": {
    "rollout-5": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production",
        "releaseStatus": "inProgress",
        "rollout": 0.05
      }
    },
    "rollout-25": {
      "extends": "rollout-5",
      "android": {
        "rollout": 0.25
      }
    },
    "rollout-50": {
      "extends": "rollout-5",
      "android": {
        "rollout": 0.5
      }
    },
    "rollout-full": {
      "android": {
        "serviceAccountKeyPath": "./google-service-account.json",
        "track": "production",
        "releaseStatus": "completed"
      }
    }
  }
}
```

### Staged Rollout Workflow

```bash
# Step 1: Submit to 5% of users
eas submit --platform android --profile rollout-5

# Step 2: Monitor crash rates in Play Console (wait 24-48 hours)

# Step 3: Increase to 25%
eas submit --platform android --profile rollout-25

# Step 4: Continue monitoring, then expand
eas submit --platform android --profile rollout-50

# Step 5: Full release after stability confirmed
eas submit --platform android --profile rollout-full
```

---

## EAS Credentials Commands Cheat Sheet

```bash
# Interactive credential management (prompts for platform and action)
eas credentials

# iOS-specific credential operations
eas credentials --platform ios

# Android-specific credential operations
eas credentials --platform android

# Build with automatic credential creation (creates if missing)
eas build --profile production --platform ios

# Store a secret for CI/CD (string value)
eas secret:create --name SENTRY_DSN --value "https://key@sentry.io/123" --scope project

# Store a secret file for CI/CD
eas secret:create --name GOOGLE_SERVICES_JSON --value "$(cat google-services.json)" --type file

# List all secrets
eas secret:list

# Delete a secret
eas secret:delete --name OLD_SECRET

# Check project configuration and credentials
eas diagnostics
```

---

## Complete CI/CD Pipeline: Build, Test, Submit, OTA

An end-to-end pipeline covering all deployment scenarios:

```yaml
name: Complete Mobile Pipeline

on:
  push:
    branches: [main, "release/*"]
    tags: ["v*"]
  pull_request:
    branches: [main]

env:
  EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}
  NODE_VERSION: "20"

jobs:
  # ----- Phase 1: Quality Gates -----
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  # ----- Phase 2: Fingerprint Check -----
  fingerprint:
    needs: quality
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    outputs:
      native-changed: ${{ steps.check.outputs.native-changed }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - run: npm ci
      - id: check
        run: |
          CURRENT=$(npx @expo/fingerprint .)
          PREVIOUS=$(git stash list | head -1) # simplified; use stored fingerprint in practice
          if [ "$CURRENT" != "$PREVIOUS" ]; then
            echo "native-changed=true" >> "$GITHUB_OUTPUT"
          else
            echo "native-changed=false" >> "$GITHUB_OUTPUT"
          fi

  # ----- Phase 3a: Native Build (when native changes detected) -----
  native-build:
    needs: fingerprint
    if: needs.fingerprint.outputs.native-changed == 'true'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
          key: gradle-${{ hashFiles('**/*.gradle*', '**/gradle-wrapper.properties') }}
      - run: npm ci
      - run: eas build --platform all --profile production --non-interactive

  # ----- Phase 3b: OTA Update (when JS-only changes) -----
  ota-update:
    needs: fingerprint
    if: needs.fingerprint.outputs.native-changed == 'false'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: npm
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      - run: npm ci
      - run: |
          eas update \
            --branch production \
            --message "$(git log -1 --pretty=%B)" \
            --non-interactive

  # ----- Phase 4: Store Submission (after native build) -----
  submit-stores:
    needs: native-build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      # Submit to internal tracks first
      - run: eas submit --platform all --profile internal --non-interactive

  # ----- Phase 5: Production Release (manual trigger on tags) -----
  production-release:
    if: startsWith(github.ref, 'refs/tags/v')
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}
      # Android: staged rollout at 5%
      - run: |
          eas submit --platform android --profile rollout-5 --non-interactive
      # iOS: submit for App Store review
      - run: |
          eas submit --platform ios --profile production --non-interactive
```

---

## expo-updates — Code Signing Configuration

For apps requiring verified update authenticity, expo-updates supports code signing:

```json
{
  "expo": {
    "updates": {
      "url": "https://u.expo.dev/your-project-id",
      "enabled": true,
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 30000,
      "codeSigningCertificate": "./code-signing/certificate.pem",
      "codeSigningMetadata": {
        "keyid": "main",
        "alg": "rsa-v1_5-sha256"
      }
    },
    "runtimeVersion": {
      "policy": "fingerprint"
    }
  }
}
```

Publish a signed update:

```bash
eas update \
  --branch production \
  --message "Signed hotfix" \
  --private-key-path ./code-signing/private-key.pem
```

---

## EAS Workflows (eas.yaml)

Define build and submit workflows directly in the project, replacing raw GitHub Actions for mobile-specific steps:

```yaml
# eas.yaml
build:
  production:
    platform: all
    profile: production
    auto_submit: true
    submit_profile: internal

workflows:
  release:
    steps:
      - name: Build iOS
        uses: eas/build
        with:
          platform: ios
          profile: production
      - name: Build Android
        uses: eas/build
        with:
          platform: android
          profile: production
      - name: Submit iOS
        uses: eas/submit
        with:
          platform: ios
          profile: production
      - name: Submit Android
        uses: eas/submit
        with:
          platform: android
          profile: internal
```

Invoke from CI or locally:

```bash
eas workflow:run release
```
