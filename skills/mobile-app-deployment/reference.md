# Mobile App Deployment Reference

## iOS Submission Workflow

### Certificates and Provisioning

iOS distribution requires a **Distribution Certificate** (max 3 per organization) and a **Provisioning Profile** linking the app to a distribution method. Certificates expire and must be renewed before expiration.

EAS credential management offers three modes:
- **Automatic** (recommended): `eas credentials` generates, stores, and manages all certificates and profiles.
- **Manual**: A `credentials.json` file points to local `.p12` certificate and `.mobileprovision` profile.
- **Import existing**: Credentials from Apple Developer Portal are imported via `eas credentials`.

### App Store Connect

Required setup: create an app record with a bundle ID matching `app.json`, configure App Privacy labels (mandatory since iOS 14.5), set up an App Store Connect API Key for automation, and configure TestFlight groups.

Authentication for EAS Submit uses either an **App Store Connect API Key** (`ascApiKeyPath`, `ascApiKeyIssuerId`, `ascApiKeyId` in eas.json) or an **App-Specific Password** via the `EXPO_APPLE_APP_SPECIFIC_PASSWORD` environment variable.

### TestFlight Distribution

- **Internal testing**: Up to 100 team members, available immediately after processing, no additional review.
- **External testing**: Up to 10,000 users via email or public link, requires Beta App Review (24-48 hours).

---

## Google Play Submission

### Play App Signing

Google manages the app signing key while developers retain an upload key. The upload key signs AABs for verification; Google re-signs with the app signing key for distribution. Upload keys must be RSA 2048+ bits. This architecture enables signing key rotation without breaking existing installs.

### Testing Tracks and Staged Rollouts

| Track | Availability | Review | Max Testers |
|-------|-------------|--------|-------------|
| Internal Testing | Minutes | None | 100 |
| Closed Testing | Hours | Light | Custom list |
| Open Testing | Hours | Standard | Public opt-in |
| Production | 24-48 hours | Full | All users |

Staged rollouts start at 1-5% of users, increase incrementally (10%, 25%, 50%, 100%), with crash rate and ANR monitoring at each stage. Rollouts can be halted if issues are detected.

### Android 15 (API 35) Requirement

All new submissions and updates must target API level 35 as of August 31, 2025. Key changes include enhanced privacy permissions for photos/videos, new foreground service types, and predictive back gesture support.

---

## EAS Submit Configuration

Submit profiles in `eas.json` support platform-specific credentials and profile inheritance via `"extends"`. EAS Submit automates store uploads for both platforms from the CLI or CI/CD.

First-time Android submission requires manual upload through the Play Console due to a Google Play API limitation. Subsequent submissions can be fully automated.

EAS Workflows (defined in `eas.yaml`, invoked via `eas workflow:run`) are the recommended approach over raw GitHub Actions for build and submit orchestration, as they handle code signing and provisioning automatically.

---

## OTA Updates (expo-updates)

### Runtime Version Policies

The **fingerprint** policy (recommended) automatically calculates a hash of the native surface area, detecting SDK upgrades, custom native code, and config changes. Upgraded from experimental to beta in SDK 52.

Alternatives: `nativeVersion` (based on version + buildNumber/versionCode), `appVersion` (version only), `sdkVersion` (Expo SDK version).

### Update Check Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| `ON_LOAD` | Check every app launch (default) | Most apps |
| `ON_ERROR_RECOVERY` | After crash recovery only | Bandwidth-sensitive |
| `NEVER` | Manual control | Custom update UI |
| `WIFI_ONLY` | Only on WiFi | Large updates |

### Update Strategies

- **Force update**: Block app usage until update is applied via `Updates.reloadAsync()`.
- **Soft update**: Prompt the user with an option to defer.
- **Silent update**: Apply on next cold start (default with `ON_LOAD`).

### Rollback and Error Recovery

expo-updates detects crashes after an update and automatically reverts to the previous working bundle. Manual rollback is possible by publishing an update pointing to a previous bundle or using the EAS Update dashboard. Rollback may be unsafe if the broken update modified persistent state in a non-backwards-compatible way.

### CodePush Alternatives

| Solution | Hosting | New Architecture | Rollback |
|----------|---------|-----------------|----------|
| EAS Update | Expo Cloud | Yes | Yes |
| Stallion | Self-hosted | Yes | Yes |
| RevoPush | Cloud | Yes | Yes |
| Source Push | Cloud | Yes | Yes |
| Self-hosted CodePush | Your infra | Manual patching | Yes |

---

## App Versioning

The `version` field (semver format like 1.2.3) maps to `CFBundleShortVersionString` on iOS and `versionName` on Android. The `buildNumber` field maps to `CFBundleVersion` (string allowed) on iOS and `versionCode` (integer required) on Android. Both must increment for each store upload.

EAS supports `"autoIncrement": true` in build profiles. For teams using conventional commits, semantic-release with the `semantic-release-react-native` plugin automates version bumping and changelog generation.

---

## CI/CD Patterns

The recommended hybrid approach combines EAS Build for native compilation with GitHub Actions for linting, testing, and orchestration. iOS and Android builds run concurrently. Build caching (Gradle, CocoaPods, node_modules) reduces incremental build times from 10+ minutes to 3-5 minutes.

EAS secrets (`eas secret:create`) store sensitive values. GitHub Secrets and HashiCorp Vault are alternatives for CI/CD credential management.

---

## Signing and Credentials Management

### EAS CLI Commands

- `eas credentials` - Interactive management for all platforms.
- `eas credentials --platform ios` - iOS-specific credential operations.
- `eas secret:create --name KEY --value "val" --type file` - Store secrets for CI/CD.

### Credential Rotation

iOS: Create new distribution certificate, generate new provisioning profile, update EAS, build and submit, then revoke old certificate after successful release.

Android upload key: Request reset in Play Console, generate new key, upload certificate, update EAS credentials. Signing key rotation (distinct from upload key) requires proof-of-rotation and is significantly more complex.

---

## Camera/Video App Rejection Reasons

### iOS

| Rejection | Guideline | Resolution |
|-----------|-----------|------------|
| No recording indicator | 2.5.14 | Add visible UI element when camera is active |
| Missing privacy policy | 5.1.1(i) | Add policy detailing camera/video data usage |
| Unnecessary permission | 5.1.1(iii) | Remove camera access if not a core feature |
| Privacy label mismatch | Privacy Labels | Update labels to match actual data collection |
| Monetizing camera | 5.6.2 | Remove paywall for built-in camera features |

### Google Play

| Rejection | Policy | Resolution |
|-----------|--------|------------|
| Broad photo/video access | Photo/Video Permissions | Submit declaration form or remove READ_MEDIA_* |
| Missing data safety | Data Safety Section | Complete form with accurate declarations |
| Missing privacy policy | Privacy Policy | Add policy link in store listing |

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|-------------|---------|
| Shipping OTA updates containing native changes | Use `@expo/fingerprint` to verify JS-only changes before publishing |
| Hardcoding credentials in source code | Use EAS secrets or CI/CD secret management (GitHub Secrets, Vault) |
| Skipping TestFlight or internal testing tracks | Always validate on internal/closed tracks before production submission |
| Manual version bumping across team members | Enable `autoIncrement` in EAS or use semantic-release automation |
| Releasing to 100% of users immediately | Use staged rollouts starting at 1-5%, monitoring crash rates at each stage |
| Ignoring App Privacy labels or Data Safety section | Complete privacy declarations before submission to avoid rejection delays |
| Over-requesting camera/photo permissions | Request access only when needed; use photo picker for single-image flows |
| Forcing immediate OTA updates without fallback | Provide graceful degradation for users on poor connectivity |
| Using deprecated CodePush in new projects | Migrate to expo-updates with EAS Update for long-term support |
| Managing iOS certificates manually when EAS is available | Use EAS automatic credential management to avoid expiration and mismatch issues |
