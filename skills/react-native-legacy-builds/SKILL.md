---
name: react-native-legacy-builds
description: |
  Patterns for building EOL React Native (0.64) + Expo SDK 44 apps on modern toolchains
  (Xcode 14+, Apple Silicon, Node 18+, iOS 16+). Covers CocoaPods compatibility, armv7
  removal, Clang warning suppression, spaces-in-path fixes, FBReactNativeSpec codegen,
  and CI setup. Use when working on legacy RN projects that were frozen before RN 0.71.
kb-sources:
  - wiki/software-engineering/react-native-legacy-builds
updated: 2026-04-18
---

# React Native Legacy Builds (RN 0.64 + Expo SDK 44)

Patterns for making frozen React Native 0.64 / Expo SDK 44 projects build on modern toolchains without upgrading the RN version.

## Build Fixes (in diagnostic order)

| Step | Problem | Fix Summary |
|------|---------|-------------|
| 1 | `npm install` peer conflict | `--legacy-peer-deps` everywhere |
| 2 | `pod install` glog armv7 | sed patch in postinstall replacing `armv7` with `arm64` |
| 3 | `pod install` bash script path (spaces) | Drop `-c` flag in Podfile post_install |
| 4 | Xcode warnings-as-errors | `GCC_WARN_INHIBIT_ALL_WARNINGS = YES` + exclude armv7 |
| 5 | FBReactNativeSpec Generate Specs | Pre-generate in postinstall + skip build phase |
| 6 | pbxproj scripts fail (spaces) | Quote backtick expansions |
| 7 | App stuck on splash | Check Metro logs — Node 18+ causes `transformFile` crash |
| 8 | expo-image-manipulator runtime throw | Inner try/catch + server fallback (library is EOL) |

## Runtime Constraints

- **Node 16 required** — Node 18+ breaks Metro silently
- **expo-image-manipulator broken on modern iOS** — use inner try/catch with server fallback
- **Simulator device names version-specific** — use `xcrun simctl list devices available`
- **`SecureStore.setItemAsync`** — silently no-ops if not awaited

## Device Deployment

- fnm requires shell init in non-interactive bash
- Device install does NOT start Metro — run `npx react-native start` separately
- Use dual-config commenting pattern for simulator vs device configs

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Simulator airplane mode for localhost isolation | Deferred to physical device — simulator doesn't block localhost |
| `fnm use 16` in non-interactive bash | Prepend `source ~/.zshrc 2>/dev/null; eval "$(fnm env)"` |

See `reference.md` for detailed explanations of each fix, runtime compatibility notes, error handling patterns, testing without react-test-renderer, and device deployment workflow.

See `examples.md` for all code blocks: glog patch, Podfile post_install, Clang suppression, FBReactNativeSpec pre-generation, pbxproj quoting, CI configuration, and device build commands.
