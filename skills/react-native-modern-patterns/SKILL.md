---
name: react-native-modern-patterns
description: Modern React Native 0.76+ patterns with New Architecture, Expo SDK 53+, TypeScript, Zustand, MMKV, and React Navigation 7.x. Use for new RN projects or modernizing legacy stacks.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/rn-modern
updated: 2026-05-22
---

# Modern React Native Patterns

Quick reference for React Native 0.76+ with New Architecture, Expo SDK 53-55, and the current ecosystem (2025-2026).

## Recommended Modern Stack

| Library | Version | Replaces |
|---------|---------|----------|
| Expo SDK | 55 | Bare RN CLI |
| Hermes | Default engine | JavaScriptCore |
| Turbo Modules | New Arch | Bridge Native Modules |
| Fabric | New Arch | Paper/UIManager |
| Zustand | 5.x | Redux (for most apps) |
| TanStack Query | 5.x | Manual fetch/cache |
| MMKV | 4.x | AsyncStorage |
| FlashList | 2.x | FlatList |
| NativeWind | 4.x | StyleSheet (utility styling) |
| Reanimated | 3.x | Animated API |
| Expo Router | 4.x | Manual route config |
| React Navigation | 7.x | React Navigation 5/6 |
| react-hook-form + zod | Latest | Formik + Yup |

## New Architecture Quick Reference

- **JSI**: Synchronous JS-to-native calls, no JSON serialization
- **Turbo Modules**: Lazy-loaded, codegen-verified native modules
- **Fabric**: C++ shared renderer, synchronous layout, concurrent rendering support
- **Hermes**: AOT bytecode compilation, lower memory, smaller binaries

## State Management Decision Matrix

| Scenario | Option | Trade-off |
|----------|--------|-----------|
| Most apps, simple global state | Zustand (~3KB) | Minimal API, low boilerplate |
| Fine-grained reactivity | Jotai (~4KB) | Atomic model, steeper mental model |
| Enterprise, complex logic | Redux Toolkit (~15KB) | Rich DevTools, higher boilerplate |
| Server state / caching | TanStack Query | Handles cache, dedup, background refresh |
| Persistence layer | MMKV | ~30x faster than AsyncStorage, sync API |

## React Navigation 7 Migration

Key breaking changes from v5/v6:

| v5/v6 | v7 | Notes |
|-------|-----|-------|
| `tabBarOptions={{ activeTintColor }}` | `screenOptions={{ tabBarActiveTintColor }}` | All `tabBarOptions` move into `screenOptions` with `tabBar` prefix |
| `navigate('ParentScreen')` pops back | `popTo('ParentScreen')` | `navigate()` only pushes forward in v7; back-navigation requires `popTo()` |
| Cross-navigator `Stack.Screen` permissive | Strict mode hard-fails | Audit all screen registrations before migration |
| `Linking.makeUrl(path)` | `Linking.createURL(path)` | Method rename |

SplashScreen hiding, Bottom Tabs vs Material Top Tabs property name differences, and linking backwards-compat details: see `reference.md` § React Navigation 7 Migration.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Icon glyphs as `?` after SDK upgrade | Glyphmap names change silently — verify against the SDK's glyphmap JSON |
| AsyncStorage v3.x Android local build fails | Add local maven repo to `android/build.gradle`; use Expo config plugin for persistence |
| `react-native-pager-view@8` with `newArchEnabled: false` | Silent runtime crash — pin to `~6.9.1` |
| `color` on `View`/`Pressable` | No-op — applies to `Text` nodes only |
| expo-av usage on SDK 53+ | Deprecated; use `expo-video` (`useVideoPlayer` hook + `<VideoView>`) |
| `jest-expo@55` with Jest 27 (transform errors) | Pin `babel-jest@^27.5.1`; commit `package-lock.json` |
| `navigation.navigate()` wrapper used for `Linking.openURL` | Internal nav and external URL openers are architecturally distinct — don't mix |
| `Pressable` without `accessibilityRole` | Screen readers won't announce it as interactive |
| `width: '100%'` + `margin` | Overflows by 2×margin; use `alignSelf: 'stretch'` + `marginVertical` |

See `reference.md` for full detail on each pattern and `examples.md` for production TypeScript examples.
