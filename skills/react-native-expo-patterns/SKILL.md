---
name: react-native-expo-patterns
description: React Native 0.64 + Expo 44 managed workflow patterns. Expo modules (Camera, FileSystem, Sharing), app.json configuration, EAS builds, deep linking, OTA updates. Use when maintaining legacy Expo 44 managed apps, configuring EAS builds, or wiring Expo modules.
kb-sources:
  - wiki/software-engineering/rn-expo
updated: 2026-05-21
---

# React Native + Expo Managed Workflow

React Native 0.64 + Expo 44: managed workflow, EAS builds, OTA updates, Camera/FileSystem/Sharing modules.

## Managed vs Bare Workflow

| Factor | Managed | Bare |
|--------|---------|------|
| Setup | Minutes | 30+ min |
| Native access | Expo SDK only | Full |
| OTA updates | Built-in | Manual |
| Best for | MVPs, OTA, JS-only teams | Custom native modules |

**Migrate to bare**: `expo prebuild` → commit native folders → `expo-dev-client`

## Common Expo Modules

| Module | Use Case |
|--------|----------|
| `expo-camera` | Photo/video (`takePictureAsync`, `recordAsync`) |
| `expo-file-system` | File I/O (`readAsStringAsync`, `writeAsStringAsync`) |
| `expo-sharing` | Native share sheet (`shareAsync`) |
| `expo-secure-store` | Encrypted key-value storage |
| `expo-linking` | Deep linking (`makeUrl`, `addEventListener`) |
| `expo-font` | Custom font loading |
| `expo-updates` | OTA updates (`checkForUpdateAsync`) |

## SDK Migration Gotchas (44→54)

| SDK | Breaking Change |
|-----|----------------|
| 48+ | `image.cancelled` → `image.canceled` (spelling) |
| 46+ | `requestPermissionsAsync` → `requestCameraPermissionsAsync` |
| 52+ | `expo-av` deprecated → `expo-video` (SDK 53 hard error) |
| 54 | `babel-preset-expo` auto-includes `react-native-reanimated/plugin` |

**react-native-reanimated**: Pin `~3.17` for SDK 54 + Jest 27 — v4.x requires `react-native-worklets/plugin`, breaking Jest.

## Jest Configuration

`jest-expo` + Jest 27 causes `TypeError: Class constructor TestRunner cannot be invoked without 'new'` (jest-expo bundles Jest 29). Manual config:

```js
// jest.config.js (manual, version-safe)
module.exports = {
  haste: { defaultPlatform: 'ios', platforms: ['android', 'ios'] },
  transformIgnorePatterns: [
    'node_modules/(?!(expo|@expo|react-native|@react-native)/)'
  ],
  setupFiles: ['./node_modules/react-native/jest/setup.js']
};
```

## Dev Client Native Modules

Native packages need a dev client rebuild — JS bundle succeeds but crashes (`Cannot find native module`). Stub: `const Video = View`.

```bash
npx expo prebuild --clean && npx expo run:ios
```

## expo-av to expo-video Migration (SDK 52+)

expo-av deprecated SDK 52; hard error SDK 53. expo-video requires functional components + hooks. See `reference.md § expo-av to expo-video Migration`.

```js
// Hook: useVideoPlayer(url, initCallback) + Component: <VideoView>
const player = useVideoPlayer(videoUrl, (p) => { p.loop = false; });
// <VideoView player={player} contentFit="contain" nativeControls={true} />
```

**Key**: `player.duration` is **seconds** — guard `player.duration > 0` before arithmetic. Events via `useEvent(player, 'playingChange'|'playToEnd', cb)`.

## Metro Troubleshooting

**Stale watcher** (SHA-1 error on `metro-require/require.js`): kill Metro, clear `/tmp/metro-*`, restart `--clear`. Commands in `examples.md`.

**JS errors behind native crash screen** (`RCTCxxBridge`): fetch bundle to surface real error — see `examples.md`.

## Cross-Platform PickerSelect

Stacked `<Picker>` breaks iOS — branch `Platform.OS`: Android → `<Picker>`, iOS → `TouchableOpacity` + `Modal` + `FlatList`. See `reference.md § Cross-Platform PickerSelect`.

**Android placeholder**: `<Picker>` shows first item but `onValueChange` won't fire — values null. Fix: `<Picker.Item label="Select..." value={null} enabled={false} />` first; `disabled={!allFieldsSelected}` on submit.

## Environment Variables (app.config.js)

**Spread order**: Keys after `...expo.extra` overwrite — `|| undefined` writes the key. See `examples.md` for conditional spread.

**Build-time baking**: `expoConfig.extra` bakes at build time — Metro restart won't reload it. See `reference.md § Environment Variables (app.config.js)`.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| "Module not found" after install | Restart dev server |
| Permissions not working | Add usage descriptions in app.json |
| Deep link not opening | Set `scheme` in app.json |
| OTA update not appearing | Wrong update policy (ON_LOAD/ON_ERROR_RECOVERY) |
| EAS build fails | Check bundleIdentifier/package in app.json |
| `jest-expo` with Jest 27 | Manual config: haste, transformIgnorePatterns, setupFiles |
| `expo-av` in try/catch | Native errors bypass JS — stub `View` |
| Overbroad `jest.mock('expo', ...)` | `...jest.requireActual('expo')` per export |
| `player.duration` unguarded in playToEnd | Guard `player.duration > 0` (async) |
| Metro stale watcher | Clear `/tmp/metro-*`, restart `--clear` |
| Native crash screen hides JS error | `curl localhost:8081/index.bundle` |
| Optional var in config spread | `\|\|` guard still writes the key |
| Hot-reloading `expoConfig.extra` | Baked at build time — rebuild |

**See also**: `reference.md` (app.json, EAS, deep linking, OTA, expo-av migration, PickerSelect, dev-key injection) · `examples.md` (Camera, FileSystem, Metro) · `gcp-cicd-patterns` (EAS Build CI)
