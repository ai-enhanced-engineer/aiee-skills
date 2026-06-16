# React Native Modern Patterns — Reference

## New Architecture Migration Guide

### JSI (JavaScript Interface)

JSI replaces the asynchronous bridge with synchronous, direct communication between JavaScript and native code. Key characteristics:

- No JSON serialization overhead
- Shared memory between JS and native layers
- Synchronous function calls (native functions callable like regular JS functions)

### Turbo Modules

Turbo Modules replace legacy Native Modules. They offer lazy loading (modules initialize on first use, not at startup), codegen-verified type safety, and native-equivalent performance via JSI.

**Migration path**: Native Modules using `NativeModules.MyModule` migrate to codegen-based Turbo Modules. Libraries without Turbo Module support break on RN 0.82+ where the bridge is removed entirely.

**Codegen**: Run `npx react-native codegen` during the build to generate typed native interfaces from JS/TS specs.

### Fabric Renderer

Fabric replaces Paper (UIManager) with a shared C++ core across platforms. Benefits include synchronous layout calculations, direct native view manipulation, and concurrent rendering support aligned with React 18/19.

### Hermes Engine

Hermes is the default (and only supported) JS engine from RN 0.76+. It provides AOT bytecode compilation for faster startup, reduced memory footprint, and smaller binary sizes. Debugging uses Chrome DevTools Protocol (CDP).

### Version Migration Path

Incremental upgrades are the recommended approach:

```
0.64 → 0.68 (React 17)
0.68 → 0.72 (Hermes default)
0.72 → 0.76 (New Arch default, opt-out available)
0.76 → 0.82 (New Arch mandatory, bridge removed)
0.82 → 0.83 (React 19.2)
```

Use the React Native Upgrade Helper for diff-based guidance at each step. Verify all dependencies have "New Arch" compatibility via reactnative.directory.

---

## Expo SDK 50+ Workflow

### CNG (Continuous Native Generation)

Native `ios/` and `android/` directories are generated artifacts produced by `npx expo prebuild`. This approach treats native projects as derived output from `app.json`, `package.json`, and config plugins. Benefits include cleaner git history, reliable regeneration, and simplified RN version upgrades.

### Config Plugins

Config plugins automate native project configuration without ejecting. They modify AndroidManifest.xml, Info.plist, entitlements, and build settings declaratively in `app.config.js`. Custom plugins handle scenarios like App Clips, share extensions, and native SDK integrations.

### Expo Router

File-based routing (similar to Next.js) with automatic deep linking derived from the filesystem. Type inference comes from file paths. First-class web support makes it well-suited for universal apps. Expo Router is built on React Navigation, so the two are compatible.

### Development Builds

`expo-dev-client` replaces Expo Go for projects with custom native code. It provides the same developer experience (hot reload, error overlay) while supporting any native library.

### Expo Modules API

Write custom native modules in Swift/Kotlin with `npx create-expo-module@latest`. The resulting module has automatic backward compatibility and works in the managed workflow via prebuild.

---

## TypeScript Strict Patterns

### Configuration (RN 0.80+)

Extend `@react-native/typescript-config` with `strict: true` and `noUncheckedIndexedAccess: true`. The `customConditions: ["react-native-strict-api"]` flag enables stricter React Native type definitions where optional props are typed as `T | undefined`.

### Typed Navigation (React Navigation 7)

The static API (`createNativeStackNavigator({ screens: {...} })`) enables auto-inferred param types via `StaticParamList<typeof RootStack>`. Deep linking configuration is co-located with screen definitions. Global type declaration via `ReactNavigation.RootParamList` provides type safety across the entire app.

### Typed Native Modules

Use `requireNativeModule<T>('ModuleName')` from `expo-modules-core` with a TypeScript interface extending `NativeModule` to get typed access to native functionality.

### Common Patterns

- Style props: `StyleProp<ViewStyle>`, `StyleProp<TextStyle>`
- Ref typing (0.80+): `useRef<ComponentRef<typeof TextInput>>(null)`
- Platform checks: `Platform.OS === 'ios'` with type narrowing

---

## State Management Deep Dive

### Zustand + MMKV Persistence

Zustand provides a minimal API (~3KB) for global state. Combined with MMKV (~30x faster than AsyncStorage, synchronous, encryption-capable), it forms a performant persistence layer using Zustand's `persist` middleware with a custom `createJSONStorage` adapter.

### TanStack Query for Server State

TanStack Query handles server state concerns: automatic caching, background refetching, request deduplication, and offline support. The `staleTime` option controls cache freshness. Mutations support optimistic updates via `onMutate` and automatic cache invalidation via `onSuccess`.

**Offline pattern**: Combine TanStack Query's `networkMode: 'offlineFirst'` with MMKV-backed persistence for offline-capable apps.

### When to Combine

A common production pattern: Zustand for UI/client state (auth, theme, preferences), TanStack Query for server state (API data, remote resources), MMKV for persistence of both layers.

---

## Modern UI Libraries

### NativeWind v4

Tailwind CSS utilities compiled ahead-of-time for React Native. Uses `className` prop on standard RN components. Provides web support and familiar syntax for teams with web/Tailwind experience.

### Reanimated 3

Worklet-based animations executing on the native UI thread. Key APIs: `useSharedValue`, `useAnimatedStyle`, `withSpring`, `withTiming`. Combined with Gesture Handler 2 for gesture-driven animations.

### FlashList v2

Shopify's FlatList replacement, rewritten for New Architecture. v2 removes the need for size estimates, reduces blank areas by 50%, and is JavaScript-only (no native code dependency). Maintains 60 FPS with complex items.

---

## React Navigation 7.x

### Static Type-Safe API

The static configuration API (`createNativeStackNavigator({ screens: {...} })`) replaces dynamic JSX-based navigation. Types are inferred automatically, deep linking is co-located, and the `createStaticNavigation` wrapper produces the root component.

### Authentication Flow

Navigation groups with `if` guards (`if: useIsSignedIn`) declaratively switch between authenticated and unauthenticated screen sets. The navigation container can be keyed on auth state to handle deep linking transitions.

### Composition

Stack, Tab, and Drawer navigators compose by nesting: Drawer wraps Tabs, Tabs wrap Stacks. Each navigator is a static configuration object passed as a screen to the parent.

---

## Form Handling

### react-hook-form + zod

`react-hook-form` with `@hookform/resolvers/zod` provides schema-based validation with full TypeScript inference via `z.infer<typeof schema>`. The `Controller` component bridges RN's `TextInput` with form state. This combination offers fewer re-renders than Formik, first-class TS support, and smaller bundle size.

---

## Build and Deploy

### EAS Build

EAS Build supports multiple profiles (development, preview, production) in `eas.json`. Development builds include `expo-dev-client` for debugging. Production builds support auto-incrementing version numbers and environment variables.

### OTA Updates

`expo-updates` enables JavaScript/asset-only updates without app store submissions. Updates target branches (channels) and are scoped by runtime version for binary compatibility. Native code changes still require a new binary build.

---

## React Navigation 7 Migration

### SplashScreen Hiding (Nav 7)

`NavigationContainer` does not accept `onLayout` in Nav 7. Call `SplashScreen.hideAsync()` directly in the async prepare function's `finally` block:

```js
async function prepare() {
  try { await Font.loadAsync(fonts); }
  finally { await SplashScreen.hideAsync(); }
}
```

### Bottom Tabs vs Material Top Tabs Property Names

Both move `tabBarOptions` to `screenOptions`, but property names differ:

| Bottom Tabs | Material Top Tabs |
|------------|-------------------|
| `tabBarShowLabel` | `tabBarLabelStyle` |
| `tabBarActiveTintColor` | `tabBarActiveTintColor` |
| `tabBarStyle` | `tabBarStyle` |
| — | `tabBarPressColor` |
| — | `tabBarIndicatorStyle` |

The `NavigationContainer` linking prop (prefixes + config.screens) is backwards compatible from v5 to v7.

---

## Legacy Migration Patterns

### Pressable Accessibility

`Pressable` has no implicit accessibility role — screen readers won't announce it as interactive without explicit `accessibilityRole="button"`.

### Layout: width 100% + margin

Combining `width: '100%'` with `margin` renders at parent-width + 2*margin, causing overflow. `alignSelf: 'stretch'` + `marginVertical` achieves the same layout without the overflow:

```js
{ alignSelf: 'stretch', marginVertical: 10 }
```

### Migration Guard Tickets

For incremental legacy→modern migrations:
1. Validate tickets against actual target codebase (not assumed from legacy)
2. Use constraint records (hard exclusions) instead of cleanup tickets for fresh scaffolds
3. Hard exclusions list travels with the project as a migration guard

### Jest Mock: react-native-toast-message

Default export must be a callable function with `.show`/`.hide` attached:

```js
jest.mock('react-native-toast-message', () => {
  const Toast = () => null;
  Toast.show = jest.fn();
  Toast.hide = jest.fn();
  return { __esModule: true, default: Toast };
});
```

---

## Video Playback (expo-video)

expo-av is deprecated (SDK 52 warnings, SDK 53 hard error). expo-video uses a hook-based API:

- `useVideoPlayer(source, setup)` hook + `<VideoView player={player}>` component
- Control via direct properties: `player.play()`, `player.currentTime = 5`
- Event handling with `useEvent(player, 'statusChange', callback)`
- HLS streaming: set `contentType: 'hls'` in source for URLs without `.m3u8` extension (iOS fails silently without it)
- Config plugin required: `["expo-video", { "supportsBackgroundPlayback": true }]` in app.json

---

## Jest + babel-jest Version Pinning

When `jest-expo@55` hoists `babel-jest@29` but the project uses Jest 27, add `"babel-jest": "^27.5.1"` as a direct devDependency to win the hoisting race. Without this, Jest's transform pipeline uses an incompatible babel-jest version. Commit `package-lock.json` to the repo — without it, transitive `@babel/parser` versions resolve non-deterministically across installs, especially between npm 10 (Node 20) and npm 11 (Node 25), so CI and local machines silently end up with different transform pipelines.

---

## Old Architecture Compatibility

**react-native-pager-view v8 drops old arch support**: `react-native-pager-view@8.0.0` only ships Fabric `ComponentView` — no bridge `ViewManager` for old architecture. Apps with `newArchEnabled: false` crash with `RCTUIManager createView:viewName:rootTag:props:` on any screen using `@react-navigation/material-top-tabs`.

**Diagnostic**: Check for `RNCPagerViewManager.m` in the package's `ios/` directory — if only `RNCPagerViewComponentView.mm` exists, old arch is unsupported. Pin to `~6.9.1` for `newArchEnabled: false` projects.

This is a silent breaking change — the package installs and pods link without error, but crashes at runtime.

---

## SDK Migration: Icon Verification

Icon glyphmap names change between Expo SDK versions without deprecation warnings. Broken icons render as `?` with no error. Compare rendered icons against legacy screenshots, not just source code. See `examples.md` for the glyphmap verification command.

---

## AsyncStorage v3.x Android Build

`@react-native-async-storage/async-storage` v3.x (confirmed broken as of 3.0.2) ships a local `.aar` not published to Maven Central. Local Android builds fail; EAS cloud builds work. Fix requires adding a local maven repo declaration to `android/build.gradle` — see `examples.md` for the Gradle config. Note: `prebuild --clean` wipes this; use an Expo config plugin for persistence.

---

## Navigation vs. External URL Buttons

Wrapper components designed for internal screen navigation (calling `navigation.navigate()`) are architecturally distinct from components that trigger external URLs via `Linking.openURL`. Mixing these leads to broken back-navigation and unintended app exits. Using `onPress` directly on the base button component preserves caller control.

**Dead CSS on View/Pressable**: The `color` property on a `Pressable` or `View` style is a no-op in React Native — it only applies to `Text` nodes. This is a common copy-paste trap when reusing styles between components.

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Bridge-based Native Modules with JSON serialization | Turbo Modules via JSI for sync, direct native calls |
| AsyncStorage for persistence (slow, async-only, no encryption) | MMKV for synchronous, encrypted storage (~30x faster) |
| FlatList for long/complex lists | FlashList v2 with recycling and 60 FPS rendering |
| Inline style objects in render (causes re-creation each render) | StyleSheet.create or NativeWind className for cached styles |
| Manual UIManager/setChildren manipulation | React state/props with Fabric renderer |
| Loading all Native Modules at startup | Turbo Modules with lazy loading on first use |
| Formik + Yup for forms (more re-renders, larger bundle) | react-hook-form + zod (fewer re-renders, TS inference) |
| Manual fetch/cache/loading state management | TanStack Query for automatic caching, dedup, background refresh |
| Ejecting from Expo to modify native code | Config Plugins + CNG (prebuild) for declarative native config |
| `requiresMainQueueSetup: true` without justification | Set to false; blocking the main thread causes ANR on Android |
| Libraries without New Arch / Codegen support | Check reactnative.directory for compatibility badges before adopting |
| Redux for simple global state in small apps | Zustand (~3KB) for lightweight state; Redux Toolkit for enterprise complexity |
