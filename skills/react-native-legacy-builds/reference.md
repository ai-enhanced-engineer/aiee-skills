# React Native Legacy Builds — Reference

Detailed explanations for each build fix and runtime pattern.

## npm Install

RN 0.64 has peer dependency conflicts with modern npm. Use `--legacy-peer-deps` everywhere. Do not use `yarn` — it resolves deps differently and can produce broken lockfiles for packages that pre-date Yarn 2+.

## glog armv7 Patch (Apple Silicon / Xcode 14+)

`pod install` fails building glog 0.3.5 because the configure script hardcodes `armv7`, which Xcode 14+ dropped. Patch via `npm postinstall` with a sed command that replaces `armv7` with `arm64`. Guard with `uname` check so CI (Linux) skips gracefully.

## CocoaPods + Spaces in Path

CocoaPods wraps build phase scripts as `bash -l -c "..."`. When the project path contains spaces, shell word-splitting breaks the path inside the `-c` string. Fix by dropping the `-c` flag in `post_install` so bash treats the next arg as a file path directly — no word-splitting.

Root cause: `bash -l -c "script_path arg"` passes the script path through the shell, where unquoted spaces split it into multiple words. `bash -l "script_path"` treats the first argument after options as the script file directly.

## Xcode 14+ Clang Warnings-as-Errors

Modern Clang raises new warnings that RN 0.64 pods were never written to handle (deprecated APIs, implicit function declarations). Suppress across all pods with `GCC_WARN_INHIBIT_ALL_WARNINGS = YES` and exclude armv7 from build configurations.

## FBReactNativeSpec Codegen (Spaces in Path)

The `[CP-User] Generate Specs` build phase also fails with spaces in path (different script invocation pattern, harder to fix via gsub). Pre-generate in postinstall.sh instead, then skip the build phase in Podfile post_install.

## project.pbxproj Spaces in Path

Xcode project build scripts (Start Packager, Bundle React Native code) use backtick path expansion without quoting. Fix by quoting the backtick expansion results in the pbxproj file.

## CI Configuration

CI (Linux) must not run iOS-specific steps. The `postinstall.sh` script self-guards with `uname` check. Use a separate `ci-install` recipe that runs `npm ci --legacy-peer-deps` without `pod install`.

## Expo SDK 44 Runtime Compatibility

- **Node 16 hard requirement**: Node 18+ breaks Metro with cryptic `transformFile is not a function` error that does not mention Node version. Fix: `fnm install 16 && fnm use 16`.
- **expo-image-manipulator broken on modern iOS (iOS 16+)**: throws error only at call site (`manipulateAsync()`), not at import. Fix: inner try/catch with server fallback. Do not fix the library (EOL).
- **Simulator device names are version-specific**: use `xcrun simctl list devices available`. Hardcoding breaks when Xcode versions change.
- **Metro hot reload limitations**: may not pick up bootstrap/provider changes. Full restart needed: `xcrun simctl terminate <bundle-id> && xcrun simctl launch <device-id> <bundle-id>`.
- **`SecureStore.setItemAsync`**: async and silently no-ops if not awaited. The key never persists without await.

## Error Handling Patterns

- Module-level error buffer with 50-entry cap and `shift()` eviction. Gate `console.warn` behind `__DEV__`. Pattern: `reportError(error, context)` with phase discrimination (`model_load`, `prediction`, `save`).
- Unbounded module-level arrays persist for the app lifetime in React Native — cap at 50 with `shift()`.

## Testing Without react-test-renderer

White-box inline reproduction: reproduce function body inline in test file when `react-test-renderer` has peer conflicts with Expo SDK 44. Document drift risk in test file header. Replace when testing infra allows.

## Device Deployment

- **fnm shell init for non-interactive bash**: `source ~/.zshrc 2>/dev/null; eval "$(fnm env)" && fnm use 16`. fnm requires shell initialization that Claude Code's non-interactive bash doesn't provide.
- **Background builds**: use `run_in_background: true` for device builds (can exceed 2-min timeout, legacy builds took ~5 min).
- **Device install does NOT start Metro**: Run `npx react-native start` separately. On the phone's Expo Dev Client, tap "Enter URL manually" and enter `http://<LAN_IP>:8081`.
- **Dual-config commenting pattern**: keep both simulator (localhost) and device (LAN IP) configs in `.env` and `constants.js` with labels. Swap by commenting/uncommenting — faster than env vars for short-lived testing.
- **Developer certificate trust**: may not appear in Settings > VPN & Device Management until the app is launched once. Xcode auto-signing may handle it automatically.
- **Expo Dev Client launcher screen**: shows "Development servers" screen on first launch — this is the expo-dev-client module, not a broken install. Use `npx react-native start`, not `expo start --dev-client`.
