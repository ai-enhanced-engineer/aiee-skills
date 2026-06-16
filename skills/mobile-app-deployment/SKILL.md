---
name: mobile-app-deployment
description: Mobile app deployment patterns for iOS App Store and Google Play Store including EAS Submit, signing credentials, TestFlight, staged rollouts, OTA updates (expo-updates), and CI/CD. Use for shipping React Native apps to production.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/mobile-app-deployment
updated: 2026-04-18
---

# Mobile App Deployment

## Deployment Workflow

The standard React Native deployment pipeline follows four phases: **build** (EAS Build compiles native binaries), **submit** (EAS Submit uploads to App Store Connect / Google Play Console), **review** (platform-specific approval, typically 24-48 hours), and **release** (staged rollout or full availability). OTA updates via expo-updates bypass the build-submit-review cycle for JavaScript-only changes.

## OTA Update Decision Matrix

OTA updates (expo-updates) are appropriate for JavaScript/TypeScript code changes, React component and styling updates, asset changes (images, fonts), and API endpoint modifications. A native build is required for permission changes, native module additions, Expo SDK upgrades, app icon or splash screen changes, and any Swift/Objective-C/Kotlin/Java modifications. When uncertain, `@expo/fingerprint` detects whether native changes exist.

## Critical: CodePush Deprecation

Microsoft CodePush was discontinued on March 31, 2025 with the App Center shutdown. The recommended replacement is expo-updates with EAS Update, which provides integrated channel/branch management, automatic rollback on crashes, and compatibility with the React Native New Architecture.

## Camera/Video App Review

Camera and video apps face elevated scrutiny: iOS guideline 2.5.14 requires a visible recording indicator and explicit consent; Google Play's Photo/Video Permissions policy (enforced May 2025) requires a declaration form for apps using READ_MEDIA_IMAGES or READ_MEDIA_VIDEO.

## iOS Provisioning Profile Renewal (EAS)

When `eas build` fails with `Provisioning Profile has expired` in `--non-interactive` mode, renew locally:

```bash
eas credentials --platform ios
```

**Interactive flow**: Select build profile (development) > Build Credentials > All: Set up all required credentials > reuse existing distribution certificate > select devices for ad hoc profile.

The "App Store Configuration" section may show old expired certs — what matters is the "Build Credentials" section showing active status. After renewal, subsequent `--non-interactive` builds will use the new profile.

**Anti-pattern:** Running `--non-interactive` with an expired provisioning profile fails silently — renew first via `eas credentials --platform ios`.

## Google Play Data Safety Preparation

Accurate Data Safety submissions require cross-referencing the codebase: camera usage paths (classification + profile photos), device identifiers (`expo-device` `deviceName`), privacy policy URL coverage for all declared data types, and in-app post-login access to the privacy policy.

## EAS Build Configuration

**Peer dependency conflicts**: `.npmrc` with `legacy-peer-deps=true` resolves peer dependency conflicts for EAS cloud builds (`npm ci` respects `.npmrc`) without modifying `eas.json` install commands.

**Export compliance**: `ITSAppUsesNonExemptEncryption: false` in `app.json` `ios.infoPlist` skips the interactive export compliance prompt that blocks `--non-interactive` builds.

**Free tier budget**: CI-triggered EAS builds consume a build queue slot per attempt (~3h wait) on the free tier — `if: false` in CI with manual `eas build` CLI avoids queue exhaustion.

**EAS-managed credentials**: `eas credentials -p android` generates and stores keystores securely in EAS. Manual `keytool -genkey` adds local credential management burden and risks committing keys to git.

## EAS Secrets Management

API keys belong in EAS Dashboard environment variables, not in `eas.json` `env` blocks (which get committed to git). Create with:

```bash
eas env:create --name CLASSIFIER_API_KEY --value '<key>' --visibility secret --environment production
```

Build logs for secret-visibility vars show "No environment variables with visibility Plain text and Sensitive found" — this is expected; the value is injected at build time but hidden from logs.

**Non-interactive update workaround**: `eas env:update` requires interactive prompts. In CI or non-interactive shells, delete + recreate:

```bash
eas env:delete <env> --variable-name NAME --variable-environment <env> --non-interactive
eas env:create --name NAME --value '<new>' --visibility secret --environment <env>
```

**End-to-end key verification before build**: `curl -s -o /dev/null -w "%{http_code}" -X POST <api-url> -H "Authorization: Bearer <key>"` — returns 403 for a bad key, 500 (or similar) for a good key with missing body. A 30-second curl catches key mismatches that otherwise surface only after a multi-hour build + device install. Client-side EAS secret and server-side secret store (e.g. AWS Secrets Manager) are two locations that must stay in sync.

## References

See `reference.md` for detailed submission workflows, signing credential management, versioning strategies, and anti-patterns. See `examples.md` for production-ready configurations including eas.json profiles, GitHub Actions pipelines, expo-updates integration code, and EAS CLI commands.
