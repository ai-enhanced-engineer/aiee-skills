---
name: healthkit-biofeedback
description: "HealthKit integration for real-time biofeedback apps. Workout sessions, heart rate streaming, HRV queries, authorization patterns, and data persistence. Use when building biofeedback or fitness apps that stream HealthKit data, implementing HKWorkoutSession or heart-rate/HRV queries, or handling HealthKit authorization."
kb-sources:
  - wiki/software-engineering/healthkit-biofeedback
updated: 2026-06-03
---

# HealthKit Biofeedback

HealthKit patterns for real-time biofeedback apps: workout sessions, streaming heart rate, HRV analysis, and health data persistence.

## When to Use

- Accessing real-time heart rate data via workout sessions
- Reading historical HRV, respiratory rate, or SpO2
- Requesting and managing per-type health permissions
- Writing workout metadata back to HealthKit

## Core Concepts

### Authorization
Request only the types you need -- users see each individually. `authorizationStatus(for:)` only reports WRITE permission; Apple intentionally hides read authorization to prevent health-condition inference. To check read access, attempt a query and handle empty results.

### Real-Time Heart Rate
A workout session (`HKWorkoutSession`) is REQUIRED for real-time HR on watchOS. Configure with `.mindAndBody` activity type for breathwork. Heart rate arrives via `HKLiveWorkoutBuilderDelegate` at 1-5 second intervals.

### AsyncStream Bridging
Bridge the delegate callback into `AsyncStream<Double>` for clean SwiftUI consumption. Wire `onTermination` to end the workout session automatically.

### Historical HRV Query
Use `HKSampleQueryDescriptor` with date predicates and sort descriptors. HRV (SDNN) is measured in milliseconds and recorded during background measurements.

### Anchored Queries
`HKAnchoredObjectQuery` resumes from the last checkpoint -- efficient for streaming. The initial handler fires with existing data; the `updateHandler` fires for subsequent changes.

### Writing Workouts
Use `HKWorkoutBuilder` (iOS 17+ -- direct `HKWorkout` init is deprecated). Add samples and metadata, then `finishWorkout()`.

### Graceful Degradation
App should function without HealthKit. Show manual input when permissions are denied, a permission request when unknown, and live data when authorized.

## Data Types Quick Reference

| Data Type | HKQuantityType | Unit | Access | Update Frequency |
|-----------|---------------|------|--------|-----------------|
| Heart Rate | `.heartRate` | count/min | Real-time via workout | 1-5 seconds |
| HRV (SDNN) | `.heartRateVariabilitySDNN` | ms | Historical only | Background measurements |
| Respiratory Rate | `.respiratoryRate` | count/min | Historical only | Sleep-time |
| Blood Oxygen | `.oxygenSaturation` | % (0-1) | Historical only | Periodic background |

## Known Constraints

- **No real-time HRV**: SDNN is background/longitudinal only — not available during live workout sessions.
- **Optical HR is the real-time signal**: 1-5 second intervals during an active `HKWorkoutSession`.
- **No raw RR intervals for third parties**: Apple does not expose beat-to-beat RR data (confirmed via Apple Developer Forums, Marco Altini).

See `reference.md` for detailed constraint documentation and workarounds.

## Breathing Rhythm Feedback

When real-time HRV is unavailable (Apple Watch optical sensor), a defensible proxy can be computed from available HR data — HR settling rate, CV regularity, and trend direction. Honest labeling ("breathing rhythm feedback" rather than "coherence biofeedback") reflects the actual signal source. A two-engine decomposition (`ReadinessEngine` + `BreathingRhythmEngine`) separates async historical queries from sync in-session analysis, enabling a v2 upgrade path with chest-strap RR intervals.

See `reference.md` for engine decomposition details, signal extraction patterns, and watchOS 26 sleep score integration.

## Health Data Logging Privacy

Raw health values (BPM, HRV, SpO2) should not appear in `#if DEBUG` blocks. `#if DEBUG` is a compile-time flag — TestFlight builds using Debug configuration include these print statements, and the values appear in system logs accessible via Console.app. Use sequence numbers, latency metrics, or anonymized indicators instead. This applies to HIPAA Safe Harbor guidance and the two-tier privacy model.

### On-Device Health Privacy Boundary Checklist

Review-panel checks for "health data never leaves device":

- [ ] No `URLSession` in the health data path
- [ ] No `Codable` on health DTOs (prevents accidental serialization)
- [ ] `Logger` carries event-name strings only — no health values

See `reference.md` for rationale and code examples.

## Sendable DTOs at the Protocol Boundary

Returning `[HKQuantitySample]` from `HealthStoreProtocol` methods forces all consumers (engines, tests, mocks) to import HealthKit and depend on `HKHealthStore`. Use plain `Sendable` value-type structs as the return type instead:

```swift
struct HRVSample: Sendable {
    let sdnnMilliseconds: Double
    let startDate: Date
}

struct SleepSample: Sendable {
    let stage: SleepStage  // domain enum, not HKCategoryValueSleepAnalysis
    let startDate: Date
    let endDate: Date
}

struct RestingHRSample: Sendable {
    let beatsPerMinute: Double
    let date: Date
}

enum SleepStage: Sendable {
    case asleep, core, deep, rem, awake
}

protocol HealthStoreProtocol {
    func fetchHRV(days: Int) async throws -> [HRVSample]
    func fetchSleep(forNight: Date) async throws -> [SleepSample]
    func fetchRestingHR(days: Int) async throws -> [RestingHRSample]
}
```

This decouples engines from `HKHealthStore` entirely. `MockHealthStore` becomes stub arrays + counters — 6 lines, no HealthKit availability assumptions, tests run in <1s. Sleep stage filtering belongs in the engine layer (domain logic), not the store layer (return what HealthKit returns).

## WCSession Hardware Test Checklist

For biofeedback features streaming HR through WCSession, verify before marking integration complete:

1. iOS target has `embed: true` for the watchOS target in `project.yml` (see `watchos-development`)
2. Companion visible under iPhone Watch app → My Watch → Available Apps (install if needed)
3. Both apps in foreground simultaneously when checking `isReachable`
4. iPhone, Watch, and Mac all on the same WiFi network

`isReachable` silently returns false if any of these conditions are unmet — symptoms point at code before the project-config root cause is found.

## Real-Hardware Smoke Test at Tier Boundary

When hardware arrives, run a ~2h smoke test BEFORE the feature that depends on the mocked pipeline. Scope: "confirm the mocked-against pipeline runs on device." Mocks cannot surface integration bugs (e.g., missing bundle embedding for WCSession).

See `reference.md` for the full protocol and scope boundary.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Expecting real-time HRV during a workout session | Use HR pattern analysis (settling rate, CV); HRV is longitudinal only |
| Reading HR without a workout session on watchOS | Start `HKWorkoutSession` first -- it's required |
| Requesting all health types at once | Request only what's needed; users see each type |
| Assuming authorization means data exists | Check for nil/empty results; user may not wear Watch |
| Polling with `HKSampleQuery` for live data | Use `HKAnchoredObjectQuery` with update handler |
| Ignoring `isHealthDataAvailable()` | iPad and some devices don't support HealthKit |
| Returning `[HKQuantitySample]` from `HealthStoreProtocol` | Return `Sendable` DTOs (`HRVSample`, `SleepSample`, `RestingHRSample`); decouples engine from HealthKit |
| Leaking `HKCategoryValueSleepAnalysis` into engine layer | Use domain `SleepStage` enum at store boundary; engine owns "what counts as asleep" logic |

## Key References

- [HealthKit documentation](https://developer.apple.com/documentation/healthkit/)
- [WWDC21: Build a workout app for Apple Watch](https://developer.apple.com/videos/play/wwdc2021/10009/)
- [Marco Altini: HRV and Apple Watch](https://medium.com/@altini_marco/on-heart-rate-variability-and-the-apple-watch-24f50e8e7bc0)

See `reference.md` for detailed explanations of authorization opacity, anchored query mechanics, and graceful degradation strategies.

See `examples.md` for complete Swift implementations of each pattern.
