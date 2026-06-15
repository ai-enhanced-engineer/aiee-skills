# Swift Patterns & Architecture — Reference

Detailed explanations for concepts summarized in SKILL.md.

---

## Actor Reentrancy

State assumptions across `await` can be violated by interleaved tasks; re-verify after each suspension point. When an actor suspends at an `await`, other tasks can execute on that actor, mutating its state. The common mistake is checking a precondition before `await` and assuming it still holds after. The pattern is to either mutate state synchronously (no `await` between check and mutation) or re-verify the precondition after the suspension point.

**Architecture impact**: Adding actors to resolve sendability errors often requires refactoring synchronous code to async, creating ripple effects through the call chain.

### @Observable + @MainActor Async Reentrancy Dual Pattern

For `@Observable @MainActor` view model methods that have multiple `await` points and persist state from before the first suspension:

**Step 1 — Capture-before-await**: Capture identity tokens (UUIDs, IDs) into local `let` bindings before the first `await`. This pins the persistence write to the originating call context even if VM-private state mutates during suspension.

```swift
func fetchPostSessionInsight() async {
    let savedID = lastSavedSessionID   // capture BEFORE await
    let insight = await coachService.fetchInsight()
    repository.updateInsight(insight, forSession: savedID)  // uses captured id
}
```

**Step 2 — State-case guard after await**: After each `await`, add `guard case .<expected> = state else { return }` before mutating display state. This prevents stale content from a now-cancelled or superseded call overwriting fresh state.

The two guards are complementary: capture-before-await protects the *persistence target*; state-case-guard-after-await protects the *in-memory display field*. A single session that fixes one will not automatically fix the other — they address different victims of the same async reentrancy class.


## Sendable Requirements

Value types are inherently `Sendable`. Final classes with only immutable (`let`) stored properties can conform to `Sendable`. Adding actors to resolve sendability errors often requires refactoring synchronous code to async, creating ripple effects. Consider `@unchecked Sendable` only as a last resort for types you control that are thread-safe but can't express it to the compiler.

## ScenePhase Handling

The three phases map to distinct responsibilities:

- **`.active`**: App is visible and interactive. Resume timers, reconnect streams.
- **`.inactive`**: App is visible but not interactive (user swiping between apps, notification center pulled down). Timers and haptics should pause here to avoid battery drain.
- **`.background`**: App is not visible. Save state to disk, schedule background tasks. This is your last chance before potential termination.

Key detail: `.inactive` fires for brief interruptions (notification banner, control center). Don't do heavy work here — just pause ongoing activity.

## State Restoration

`@SceneStorage` persists simple values (strings, numbers, booleans) across app restarts automatically. For complex state (custom objects, arrays), serialize to SwiftData or UserDefaults during the `.background` phase. `@SceneStorage` is per-scene, so multi-window iPad apps get independent state.

## Interruption Handling

ScenePhase alone doesn't cover audio interruptions (phone calls, Siri activation). Combine ScenePhase with `AVAudioSession.interruptionNotification` for complete coverage. When `InterruptionType.began` fires, pause audio guidance and haptics. On `.ended` with `shouldResume`, offer the user a chance to continue rather than auto-resuming.

## Observable Migration

### From ObservableObject to @Observable

Replace `ObservableObject` + `@Published` with the `@Observable` macro. Replace `@StateObject` with `@State`. Replace `@ObservedObject` with plain property or `@Bindable` (for two-way binding). Use `@ObservationIgnored` for properties that shouldn't trigger view updates (analytics IDs, caches).

### Gotchas

1. **Ownership**: `@State` preserves its value across view rebuilds — the initializer only runs once. The real gotcha is passing an `@Observable` as a plain property (not wrapped in `@State`), which creates a new instance on every parent rebuild. Either own with `@State` or pass from a parent that owns it.

2. **Tracking scope**: Only property reads that occur during `body` evaluation are tracked for observation. Reads in `onAppear`, `task`, or other closures that execute after `body` returns are not tracked — changes to those properties won't trigger re-renders.

3. **willSet timing**: `withObservationTracking` callbacks fire on `willSet`, before the property actually changes. If you read the property in the callback, you get the old value. This is by design but catches people off guard.

4. **No cancellation**: `withObservationTracking` is one-shot — `onChange` fires once, then observation ends. There is no cancellation handle, so continuous observation requires re-registering inside the callback, and a pending `onChange` cannot be cleanly cancelled.

## SwiftData Migration Plan Baseline

When wiring a `SchemaMigrationPlan` for the first time:

1. **No `for:migrationPlan:` Scene modifier exists** — `.modelContainer(for:migrationPlan:)` is not a valid SwiftUI Scene modifier. Construct `ModelContainer` directly: `ModelContainer(for: Schema(SchemaV1.models), migrationPlan: Plan.self)` and pass the instance to `.modelContainer(_ container:)`.

2. **Module-level `private let` is thread-safe** — Swift's lazy-once guarantee applies; `ModelContainer` is `Sendable`. Constructing it at file scope as `private let container = ModelContainer(...)` avoids the overhead of a `@MainActor` init while keeping the backup-exclusion ordering intact (construction happens before scene body materializes).

3. **Falsifiable canary test** over tautological stub: `#expect(Plan.schemas.count == Plan.stages.count + 1)` encodes the invariant "N schemas implies N-1 migration stages". A `stages.isEmpty` literal cannot fail unless edited deliberately; the count-relationship form fires as soon as V2 is added without a paired stage.

```swift
// File-scope construction — thread-safe, migration-aware
private let appContainer: ModelContainer = {
    let schema = Schema(SchemaV1.allModels, version: SchemaV1.versionIdentifier)
    return try! ModelContainer(for: schema, migrationPlan: MyAppMigrationPlan.self)
}()
```

## SwiftData Relationship Rules

1. **Insert parent before children**: `modelContext.insert(parent)` must precede `parent.children.append(child)`. Appending to a non-inserted parent causes silent failures or crashes.

2. **One-sided @Relationship**: Only specify `@Relationship(deleteRule:inverse:)` on one side. The other side is a plain optional or array property. Specifying both sides causes duplicate relationship metadata.

3. **Optional relationships**: Use optional types for relationship properties to prevent crashes during cascading deletions.

4. **Array ordering**: SwiftData does NOT preserve array order in to-many relationships. Use `SortDescriptor` or add an explicit `order` property when sequence matters.

## Anti-Pattern Quick Reference

| Anti-Pattern | Pattern |
|---|---|
| Capture-before-await omitted in multi-await `@Observable` methods | Without capturing identity tokens before the first `await`, a concurrent call can overwrite the id before persistence runs — threading a wrong session's insight to the wrong record. See `@Observable + @MainActor Async Reentrancy Dual Pattern` section. |
| `.modelContainer(for:migrationPlan:)` Scene modifier | This overload does not exist in current SDK. Construct `ModelContainer(for: Schema(...), migrationPlan: Plan.self)` at module scope and pass via `.modelContainer(_ container:)`. |
| State assumptions across `await` in actors | State can change across `await`; re-verify after suspension. |
| `@StateObject` on iOS 17+ | Use `@Observable` + `@State` instead. |
| Over-engineering MVVM in SwiftUI | Use `@Query` directly when it's sufficient. |
| Inserting SwiftData children before parent | Insert parent first (`modelContext.insert(parent)`), then append children. |
| Expecting SwiftData array order preservation | SwiftData does not preserve array order in to-many relationships; use explicit sort descriptors. |
| `switch` on `Double` with integer range literals (`case 71...100`) | Use `if/else` chains — `71` means `71.0`, creating gaps for values like `70.5`. |
| Logging raw health data in `#if DEBUG` blocks | `#if DEBUG` ships in TestFlight; use sequence numbers or anonymized indicators instead. |
| `@AppStorage` in a non-View `@Observable` class | `@AppStorage` is a SwiftUI `View` property wrapper — tying non-View state to it produces test isolation failures and unexpected sandbox writes. Constructor-injected `UserDefaults` (`.standard` default; tests pass `suiteName: UUID().uuidString`) keeps state explicit. |
| `try?` on async helpers inside `.task` | `try?` swallows `CancellationError`, so `.task` cancellation propagates as a silent no-op. Use `async throws` + `do/catch is CancellationError` + `Task.checkCancellation()` after each `await`. |
| Inline magic-number thresholds for v1 tunables | Inline literals require a code search to retune. `private static let` constants on the type body are discoverable in one place. |

---

## Swift 6.2 Approachable Concurrency

### Project Setup Build Settings

Two build settings enable the full approachable concurrency experience for new projects:

- `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` — all code runs on the main actor unless explicitly opted out with `nonisolated` or `@concurrent`. This setting is free to apply at project creation; retrofitting after ViewModels are already wired requires significant refactoring across call chains.
- `SWIFT_UPCOMING_FEATURE_NONISOLATED_NONSENDING_BY_DEFAULT: YES` — enables `nonisolated(nonsending)` so async functions in actors run in the caller's context, not on the actor itself.

Both flags correspond to Swift 6.2 migration flags `InferIsolatedConformances` and `NonisolatedNonsendingByDefault` respectively.

**Architecture impact**: Adding actors to resolve sendability errors often requires refactoring synchronous code to async, creating ripple effects through the call chain. Default main-actor isolation reduces the surface where you need to introduce actors.

---

## Test Target Configuration

### xcodegen `project.yml` Snippet

For standalone test bundles that compile app source directly (no host app binary):

```yaml
targets:
  AppNameTests:
    type: bundle.unit-test
    platform: iOS
    deploymentTarget: "17.0"
    settings:
      base:
        TEST_HOST: ""          # Standalone — no host binary
        BUNDLE_LOADER: ""
    sources:
      - path: Tests/
      - path: Sources/AppName/SomeViewModel.swift   # Include types needed
    dependencies:
      - sdk: XCTest.framework
```

**Rule**: `@testable import AppName` requires a compiled host binary to link against. With `TEST_HOST: ""`, there is no binary — symbols are unresolved. Instead, include the source files directly in the test target's `sources:` array.

---

## Animation & Timing Patterns

### Date-Anchored Timing (Drift-Free)

Accumulated `Task.sleep` deltas drift because each sleep wakes slightly late. Using a stored anchor date avoids accumulated drift:

```swift
func update(now: Date) {
    let elapsed = now.timeIntervalSince(cycleStartDate)
    let position = elapsed.truncatingRemainder(dividingBy: totalCycleSeconds)
    // Derive phase and progress from position — fully deterministic
}
```

Expose `update(now: Date)` for `TimelineView` integration — the caller drives the frame rate, the driver computes state. Tests pass any `Date` with no `Task.sleep` needed.

### Pure Render Component Extraction

Extract render components that accept `(phase, phaseProgress, config, size)` as plain parameters with zero internal state and zero driver ownership. This enables the same component at different sizes (200pt session view, 80pt card preview) without shared mutable state. The driver and the renderer are fully independent; swapping size means constructing a new view, not sharing state.

---

## Cross-Target Data Passing

When `Shared/` code cannot reference app-target types (e.g., a WatchConnectivity manager defined in the app layer), the pattern is a push method rather than injected streams or bridge protocols:

**Preferred pattern**: Expose a public `record(value:at:)` method on the `Shared/` type. The app layer's observer calls this method when it receives new data. The engine never imports the connectivity manager — the dependency graph stays clean.

**Why not `AsyncStream` injection**: An injected stream requires the `Shared/` type to store the continuation, which either ties it to the connectivity manager's lifetime or introduces an additional abstraction layer.

**`#if DEBUG` mock wrapping**: Co-located mocks (types that help tests exercise the `Shared/` component) should be wrapped in `#if DEBUG` to prevent inclusion in release binaries. This matches existing patterns like `BreathingPhaseDriver.update(now:)` where the engine accepts inputs from its caller without knowing their source.

---

## State Machine Enum

When a view's behavior has more than two states (idle / starting / active / ending / summary), a boolean flag creates an ambiguous model. Replace `@State private var isActive: Bool` with an enum carrying associated values per case:

```swift
enum SessionState: Equatable {
    case idle
    case starting
    case active(startDate: Date)
    case ending
    case summary(SessionResult)
}
```

Use `switch` in the view body for exhaustive routing. Carry per-state data in enum cases instead of separate `@State` properties. The enum requires `Equatable` conformance for `onChange(of:)` to trigger side effects on transitions while keeping ViewModels free of persistence dependencies.

---

## Observable ViewModel Boundaries

`@AppStorage` is a SwiftUI `View` property wrapper. Using it in a non-View `@Observable` Swift 6 class works at runtime but produces test isolation failures (multiple test cases read/write the same real UserDefaults key) and unexpected sandbox writes.

**Pattern**: Constructor-inject `UserDefaults`:

```swift
@Observable
class SessionSettingsManager {
    private let defaults: UserDefaults

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }
}
// Tests inject: UserDefaults(suiteName: UUID().uuidString)
```

Per-test ephemeral suites (`suiteName: UUID().uuidString`) are in-memory only — they never collide and require no cleanup. `@AppStorage` remains appropriate in View structs where it was designed to work. See `examples.md → @Observable ViewModel Boundaries`.

---

## .task Cancellation Propagation

SwiftUI cancels the `Task` wrapping `.task` when the view disappears. The trap: `try?` collapses `CancellationError` into `nil`, letting the async function continue past the `await` and mutate `@State` on a vanished view.

**Pattern**: Make the inner helper `async throws`, catch `CancellationError` explicitly, rethrow, and check after each `await`:

```swift
func resolveReadinessState() async throws -> ViewState {
    do {
        let snapshot = try await engine.computeReadiness()
        try Task.checkCancellation()
        return .loaded(snapshot)
    } catch is CancellationError {
        throw CancellationError()
    }
}
```

The outermost `.task` closure receives the rethrown cancellation naturally; only the top-level entry point handles it as a non-error. See `examples.md → .task Cancellation Propagation` for the full `resolveReadinessState()` implementation.

---

## v1 Tunable Constants

When a feature ships with thresholds or weights explicitly subject to iteration, promote inline literals to `private static let` on the type body — not a config file, not a public API:

```swift
class LiveReadinessEngine {
    private static let hrvWeight: Double = 0.4
    private static let sleepWeight: Double = 0.35
    private static let restingHRWeight: Double = 0.25
    private static let readyThreshold: Double = 0.72
    private static let baselineThreshold: Double = 0.45
    // ...
}
```

This surfaces the tuning surface at the top of the type without exposing public API or adding config plumbing. Inline literals scattered through a method body require a full code search to retune — `private static let` makes the complete set discoverable in one place. Deferring a public API or config file until tuning data accumulates avoids premature parameterization.

---

## Additional Key References

- [@Observable Gotchas — Point-Free](https://www.pointfree.co/collections/swiftui/observation/ep254-observation-the-gotchas)
- [WWDC 2025: Embracing Swift Concurrency](https://developer.apple.com/wwdc25/)
