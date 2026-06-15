# HealthKit Biofeedback -- Reference

## Authorization Details

### Read Permission Opacity
Apple intentionally hides read authorization status. `authorizationStatus(for:)` only reports WRITE permission (`.sharingAuthorized`, `.sharingDenied`, `.notDetermined`). This prevents apps from inferring health conditions based on which types a user grants access to.

To determine if read access was granted, attempt a query and check for empty results. Design your UI to handle the "no data" case gracefully regardless of the reason (denied, no Watch, no measurements yet).

### Best Practices
- Call `HKHealthStore.isHealthDataAvailable()` before any authorization request -- iPad and some devices lack HealthKit entirely.
- Request only the specific types your current feature needs. Users see each type individually in the permission sheet; requesting many types at once feels invasive.
- Blocking app functionality on authorization completion can leave the app unusable if the user dismisses the sheet without granting anything.

## Real-Time Heart Rate

### Workout Session Requirement
On watchOS, real-time heart rate data is only available during an active `HKWorkoutSession`. Without a session, the heart rate sensor does not stream continuously.

- Use `.mindAndBody` activity type for breathwork/meditation apps.
- Set `.indoor` location type (breathing sessions don't need GPS).
- Heart rate samples arrive via `HKLiveWorkoutBuilderDelegate.workoutBuilder(_:didCollectDataOf:)` at 1-5 second intervals.
- Calling `endSession()` when the breathing session completes avoids unnecessary battery drain and an orphaned workout in Health.

### Data Extraction
Extract BPM from `HKLiveWorkoutBuilder.statistics(for:)` using `mostRecentQuantity()`. Convert with `HKUnit.count().unitDivided(by: .minute())`.

## Anchored Queries

### Resume from Checkpoint
`HKAnchoredObjectQuery` maintains an `HKQueryAnchor` that marks the last-read position. On subsequent queries, only new/updated samples are returned. This is far more efficient than re-querying all data.

- The initial result handler fires immediately with all matching samples since the anchor (or all samples if anchor is nil).
- The `updateHandler` fires for each subsequent batch of new samples.
- Store the anchor persistently (e.g., UserDefaults) to resume across app launches.
- Call `store.stop(query)` when the stream terminates to avoid leaked queries.

## Graceful Degradation

### Design Principles
The app should provide value even without HealthKit access. This means:

1. **Authorized**: Show live biofeedback with real-time heart rate, HRV trends, etc.
2. **Denied**: Offer manual input or timer-only mode. Message: "Heart rate access denied. You can enter manually."
3. **Unknown/Not Determined**: Show a permission request screen explaining the benefit.
4. **No HealthKit** (iPad, etc.): Hide health-related features entirely rather than showing broken UI.

### Implementation Notes
- Handle missing permissions gracefully -- app should function without HealthKit.
- Missing permissions handled with optional chaining and nil-coalescing prevents crashes.
- Consider that a user may grant authorization but have no Apple Watch (no HR data will arrive). Handle this timeout gracefully.

## Breathing Rhythm Engine Decomposition

### Two-Engine Architecture

Separate biofeedback into two engines with distinct responsibilities:

**ReadinessEngine** (pre/post session, asynchronous):
- Queries HealthKit for historical HRV (SDNN), resting HR, and sleep data
- On watchOS 26+, reads sleep score as a readiness signal
- Produces a readiness assessment before the session starts and a comparison snapshot after
- Uses `HKSampleQueryDescriptor` with date predicates

**BreathingRhythmEngine** (in-session, synchronous):
- Receives live HR stream via `HKAnchoredObjectQuery` during workout session
- Computes three signals from optical HR (1-5s intervals):
  - **Settling rate**: How quickly HR stabilizes after a breath phase transition (exhale→inhale or inhale→exhale). Faster settling = better rhythm control.
  - **CV regularity**: Coefficient of variation of inter-beat intervals within a breathing cycle. Lower CV = more consistent rhythm.
  - **Trend direction**: Whether HR descends during exhale phases (expected in coherent breathing). Detected via simple linear regression over a 4-6 second window.

### Upgrade Path

The `BiofeedbackProvider` protocol abstracts the in-session engine. For v2 with a a chest-strap HR monitor chest strap:
- `BreathingRhythmEngine` → `CoherenceEngine` (uses raw RR intervals via Bluetooth)
- `ReadinessEngine` remains unchanged (still queries HealthKit)
- The protocol interface stays stable; only the concrete provider changes

### watchOS 26 Sleep Score

watchOS 26 exposes a composite sleep score. Use it as an additional readiness signal:
- Query via `HKCategoryType.sleepAnalysis` with the `.sleepScore` subtype
- Combine with resting HR and HRV trends for a multi-signal readiness assessment
- Graceful degradation: if sleep score is unavailable (older watchOS), fall back to HRV + resting HR only

## Anti-Pattern Expanded Explanations

| Anti-Pattern | Why It Fails | Correct Approach |
|---|---|---|
| Checking `authorizationStatus` for read types | Always returns `.notDetermined` for reads | Query data and handle empty results |
| Single `requestAuthorization` for all app types | Overwhelming permission sheet, lower grant rate | Request per-feature, just-in-time |
| Assuming HR data arrives immediately | Sensor warmup takes several seconds | Show a "connecting" state, timeout after ~10s |
| Not stopping anchored queries | Memory leak, battery drain, background CPU | Stop query in `onTermination` / `deinit` |
| Writing workouts with deprecated `HKWorkout()` init | Crashes on iOS 17+, missing metadata support | Use `HKWorkoutBuilder` |

## Real-Hardware Smoke Test Protocol

### When to Run

Run the smoke test the moment physical hardware (Apple Watch, iPhone) arrives for a feature that was developed mock-first. Do not begin the feature's integration work before running it.

### Scope Boundary

The smoke test's scope is narrow and intentional: confirm the mocked-against pipeline executes end-to-end on real hardware. It is NOT a full integration test suite. Examples of what is in scope:

- WCSession reachability and message delivery
- `HKWorkoutSession` starts and receives HR samples
- `HKAnchoredObjectQuery` fires update handlers on device

Out of scope: edge cases, error paths, UI polish, performance benchmarks.

### Time Budget

Cap the session at ~2 hours. A smoke test that balloons into a full integration pass has lost its purpose. Log failures as integration bugs, file them, and return to feature work.

### Why Mocks Cannot Replace This

Mocks are authored against a model of the hardware pipeline. If that model is wrong — missing a project configuration, a framework linkage, an OS entitlement — the mock passes and the bug is invisible until hardware runs. The smoke test is the contract validation between the mock model and physical reality.

### Worked Example

A 2h smoke test on WCSession companion pairing revealed the watchOS target was not embedded in the iOS bundle (`embed: false` in `project.yml`). The mock used direct function calls; the real pipeline requires the companion app to be installed via the iOS bundle. No mock can surface this.

## On-Device Health Privacy Boundary

### Why Each Check Matters

**No `URLSession` in the health data path**

Any `URLSession` call in the code path that handles `HKQuantitySample` or derived DTOs is a potential data exfiltration point. Even if the call is guarded today, the guard can be removed by a later contributor without realising health data flows through that path. The structural rule — no networking in the health path — is easier to enforce and audit than intent-based review.

**No `Codable` conformance on health DTOs**

`Codable` conformance makes a type trivially serializable. If a health DTO conforms to `Codable`, any call site can encode it to JSON and hand it to a `URLSession`, `FileManager`, or third-party SDK without a code-review flag. Omitting `Codable` from DTOs like `HRVSample`, `SleepSample`, and `RestingHRSample` makes accidental serialization a compile error.

```swift
// Correct — no Codable
struct HRVSample: Sendable {
    let sdnnMilliseconds: Double
    let startDate: Date
}

// Wrong — opens serialization path
struct HRVSample: Sendable, Codable { ... }
```

**`Logger` calls carry event-name strings only**

`Logger` (OSLog) output is accessible via Console.app and Instruments. On TestFlight and internal builds, this surface is visible to testers and developers. Event names ("hrvQueryCompleted", "sessionStarted") are safe. Values (actual BPM, SDNN milliseconds, SpO2 percentage) are not — they constitute health data under HIPAA Safe Harbor.

```swift
// Correct — event name only
Logger.healthStore.debug("hrvQueryCompleted")

// Wrong — value in log
Logger.healthStore.debug("HRV: \(sdnn)ms")
```

### How to Apply During Code Review

Check each of the three rules independently in the diff. A PR touching the health store layer should pass all three before merge. These are structural checks, not intent checks — the question is "does this code make the violation possible?" not "did the author intend to violate privacy?"
