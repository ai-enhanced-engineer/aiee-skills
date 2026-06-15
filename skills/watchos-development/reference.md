# watchOS Development — Reference

## WatchConnectivity Setup

Shared session manager for both iOS and watchOS targets. Use `@Observable` class conforming to `WCSessionDelegate`. Activate via `WCSession.default` after checking `WCSession.isSupported()`.

**Real-time messaging**: `sendMessage` only works when both apps are reachable. Checking `isReachable` before sending and falling back to background transfer avoids silent failures.

**Background transfer**: `transferUserInfo` queues messages in FIFO order, delivered when possible. Use for session summaries and non-urgent data.

**Shared state**: `updateApplicationContext` overwrites previous values — use for latest settings/state only.

## Battery Optimization

### Adaptive Refresh Rate

Use `@Environment(\.isLuminanceReduced)` to detect Always On Display mode. When in AOD:
- Reduce refresh interval from 1/30s to 2.0s
- Show a static, simplified view (no animations)
- Use `TimelineView(.periodic(from:by:))` for scheduled updates

### AOD Guidelines

- Animations in Always On Display drain battery rapidly and are not visible on the dimmed screen
- Reduce color palette (dimmed display)
- Remove interactive elements

## Memory Management

### Ring Buffer Pattern

watchOS has approximately 30MB usable RAM. Avoid retaining large, growing collections.

Use a ring buffer with fixed capacity (e.g., 300 samples for ~5 minutes at 1/sec). Pre-allocate with `reserveCapacity()`. Overwrite oldest entries when full using modulo indexing.

### Memory Budget

- ~30MB usable for app
- Heart rate samples at 1/sec: 300 entries = ~5 min window
- Flush to persistent storage or transfer before buffer fills

## App Lifecycle

### WKApplicationDelegate

- `applicationDidBecomeActive()`: Resume monitoring, reconnect WCSession
- `applicationWillResignActive()`: Pause non-essential updates (UI refresh). Do NOT stop workout sessions — they run in background
- `applicationDidEnterBackground()`: Save session state for restoration

### Extended Runtime Session

`WKExtendedRuntimeSession` keeps the watch app active even when the wrist is lowered. Essential for guided breathing sessions and workout tracking.

- Call `start()` to begin extended runtime
- Handle `extendedRuntimeSessionWillExpire` to save state and notify user before session ends
- Call `invalidate()` when done to release resources
- Delegate receives start, expiration, and invalidation callbacks

## Background App Refresh

Schedule periodic background work using `WKApplication.shared().scheduleBackgroundRefresh(withPreferredDate:userInfo:completionHandler:)`.

### Scheduling Pattern

- Fire date: typically 15 minutes in the future
- UserInfo dictionary identifies the task type
- Handle errors in the completion handler

### Handling Background Tasks

In `handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>)`:
1. Switch on task type (`WKApplicationRefreshBackgroundTask`)
2. Perform work (e.g., sync HRV data)
3. Reschedule the next refresh
4. Call `setTaskCompletedWithSnapshot(false)` when done

Rescheduling after completion is necessary to maintain the periodic cycle.

## Error Handling & Recovery

### WatchConnectivity Reliability

WatchConnectivity delivery is not guaranteed; handle the disconnection case. The connection between iPhone and Watch can drop at any time.

- `didReceiveMessage`: Process on `@MainActor`, always send reply
- `activationDidCompleteWith`: On failure, log error and switch to offline mode
- A fallback path that works without connectivity ensures the app remains functional when the connection drops

### Retry with Exponential Backoff

When `sendMessage` fails:
1. Check `isReachable` — if not reachable, fall back immediately to `transferUserInfo`
2. If reachable but error occurs, retry with exponential delays: 2s, 4s, 8s
3. After exhausting retries (default: 3), queue for background transfer
4. Use `Task.sleep(for:)` for async delays between retries

### Delivery Tracking

Monitor pending transfers via `WCSession.default.outstandingUserInfoTransfers`. Check for stale transfers (not actively transferring) older than a threshold (e.g., 5 minutes). Log warnings for stale transfer accumulation.

## WCSession Companion Pairing — On-Device Smoke Test

Run a 2h on-device smoke test the moment hardware arrives. Deferring this until a feature depends on WCSession risks a multi-day unblock: the embed gap (watchOS app not embedded in the iOS bundle) produces no build error — it silently breaks pairing at runtime.

**Minimum smoke-test scope:**

1. Build and deploy via the iOS scheme (not the watchOS scheme directly).
2. Confirm the companion appears under iPhone Watch app → My Watch → Available Apps → Install; tap Install.
3. Open both apps in the foreground simultaneously.
4. Verify `WCSession.default.isReachable == true` in the console.
5. Send one `sendMessage` round-trip and confirm the reply handler fires.

If step 4 stays false after confirming Bluetooth/WiFi and foreground state, the embed is the first thing to check — re-run `grep -i "embed" *.xcodeproj/project.pbxproj` and look for the `PBXCopyFilesBuildPhase` named "Embed Watch Content".
