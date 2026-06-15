---
name: watchos-development
description: "watchOS app architecture, WatchConnectivity, battery optimization, and watch-specific SwiftUI patterns. Covers independent and companion app models. Use when building Apple Watch apps, implementing WatchConnectivity data transfer, or optimizing watchOS battery and memory."
kb-sources:
  - wiki/software-engineering/watchos-development
updated: 2026-06-03
---

# watchOS Development

watchOS application architecture, WatchConnectivity framework, and watch-specific optimization patterns.

## When to Use

- Building Apple Watch apps (independent or companion)
- Transferring data between iPhone and Watch
- Optimizing for battery life and memory constraints
- Implementing watch-specific interactions (Digital Crown, haptics)

## App Architecture Decision

```
Does the watch app need the iPhone?
├── No → Independent watchOS app (preferred for iOS 26+)
│   └── WatchConnectivity optional for sync
├── Real-time data from iPhone → Companion with sendMessage
└── Background sync only → Companion with transferUserInfo
```

## WatchConnectivity Transfer Methods

| Method | Delivery | Use Case | Overwrites? |
|--------|----------|----------|-------------|
| `sendMessage` | Immediate (both reachable) | Live heart rate | N/A |
| `transferUserInfo` | Queued background | Session summaries | No (FIFO) |
| `updateApplicationContext` | Latest-value background | Current settings | Yes |
| `transferFile` | Queued background | Audio files, large data | No |

## Battery Optimization

Use `isLuminanceReduced` to detect Always On Display and reduce refresh rate (2s vs 1/30s). Show a simplified static view in AOD mode — no animations. Use `TimelineView` with `.periodic` schedule instead of `Timer`.

## Memory Management

watchOS has ~30MB usable RAM. Use ring buffers with fixed capacity instead of growing arrays. Reserve capacity upfront to avoid reallocation.

## Watch-Specific SwiftUI

- **Digital Crown**: Use `.digitalCrownRotation()` with `.low` sensitivity for precise input
- **Haptics**: `WKInterfaceDevice.current().play()` with `.start`, `.stop`, `.click` for rhythm cues

## App Lifecycle & Extended Runtime

Use `WKApplicationDelegate` for activation/resignation hooks. `WKExtendedRuntimeSession` keeps the app active when the wrist is lowered (e.g., during breathing sessions). Handle `extendedRuntimeSessionWillExpire` to save state.

## Background App Refresh

Schedule periodic background tasks via `WKApplication.shared().scheduleBackgroundRefresh()`. Handle in `handle(_ backgroundTasks:)` delegate method. Rescheduling after completion maintains the periodic cycle.

## Error Handling & Recovery

WatchConnectivity delivery is not guaranteed; handle the disconnection case. Check `isReachable` before `sendMessage`, fall back to `transferUserInfo`. Use exponential backoff for retries (2s, 4s, 8s), then queue for background transfer. Monitor `outstandingUserInfoTransfers` for stale transfers.

## WCSession Companion Pairing

`WKCompanionAppBundleIdentifier` + `WKApplication: true` in the watchOS Info.plist is necessary but **not sufficient** for WCSession companion pairing. The iOS app's `.app` bundle also needs to embed the watchOS app via the "Embed Watch Content" copy build phase — without the embed, iOS treats the watchOS app as standalone and `WCSession.default.isReachable` stays false permanently.

**xcodegen syntax** — add to the iOS target's `dependencies:` block in `project.yml`:

```yaml
MyApp:  # iOS target name
  dependencies:
    - target: MyAppWatch
      embed: true
```

Run `xcodegen generate`, then verify with `grep -i "embed" MyApp.xcodeproj/project.pbxproj` — look for `MyAppWatch.app in Embed Watch Content` and a `PBXCopyFilesBuildPhase` named "Embed Watch Content".

**First-install trigger**: After the iOS app installs, the companion does NOT push automatically. It appears under iPhone Watch app → My Watch → Available Apps → Install. One manual tap required on first install; subsequent updates auto-push.

**Hardware test checklist** before marking WCSession integration complete:
1. iOS target has `embed: true` for the watchOS target in `project.yml`
2. Companion pushed via iPhone Watch app → Available Apps → Install
3. Both apps in foreground simultaneously when checking `isReachable`
4. iPhone, Apple Watch, and Mac all on the same WiFi network (same AP preferred)

Run this checklist the moment hardware arrives — a 2h on-device smoke test surfaces the embed gap before it blocks dependent features. See `reference.md` for the smoke-test scope.

**WCSession runtime requirements** for `isReachable == true`: companion pairing registered at OS level, both apps activated via `WCSession.default.activate()`, both apps in foreground simultaneously, Bluetooth on, devices in BT/WiFi range. Drop any one condition and reachability silently flips false.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Assuming `sendMessage` always works | Check `isReachable` first, fall back to `transferUserInfo` |
| Running full animation at 60fps in Always On | Use `isLuminanceReduced` to show static view |
| Storing unbounded arrays in memory | Use ring buffers with fixed capacity |
| Using `Timer` for periodic updates | Use `TimelineView` with `.periodic` schedule |
| Ignoring WCSession activation state | `activationState` should be `.activated` before transfers; delivery is not guaranteed otherwise |
| Setting `WKCompanionAppBundleIdentifier` but skipping `embed: true` | Info.plist alone is insufficient — iOS needs the embed phase to register the companion relationship |
| Running directly via the watchOS scheme to test Watch features | Produces a standalone install; `isReachable` stays false. Always deploy via the iOS scheme. |
| Checking `isReachable` before both apps are in foreground | Foreground simultaneous is required; background or inactive drops reachability silently |
| Assuming the watchOS target builds and pairs correctly without real-hardware verification | Run the hardware checklist on first device arrival; a 2h smoke test exposes embed gaps before they block dependent work |

## Key References

- [WatchConnectivity documentation](https://developer.apple.com/documentation/watchconnectivity)
- [WWDC21: Build a workout app for Apple Watch](https://developer.apple.com/videos/play/wwdc2021/10009/)
- [Fatbobman: watchOS Development Pitfalls](https://fatbobman.com/en/posts/watchos-development-pitfalls-and-practical-tips)

See `reference.md` for detailed WatchConnectivity setup, battery optimization, memory management, app lifecycle, and error handling explanations.

See `examples.md` for complete Swift implementations of all patterns.
