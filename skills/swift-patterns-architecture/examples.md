# Swift Patterns & Architecture — Examples

Complete Swift code examples organized by SKILL.md section.

---

## 1. Swift 6.2 Approachable Concurrency

### Default Main Actor Isolation

```swift
// Swift 6.2: No explicit @MainActor needed in new projects
class ViewModel {
    var data: [Item] = []  // Main actor by default

    // Opt into parallelism explicitly
    @concurrent
    func fetchInBackground() async -> Data {
        await URLSession.shared.data(from: url).0
    }
}
```

### Actor Reentrancy

```swift
// ANTI-PATTERN: State assumption across await
actor OrderProcessor {
    var inventory: Int = 100

    func processOrder(quantity: Int) async throws {
        guard inventory >= quantity else { throw OrderError.insufficientInventory }
        await chargePayment()  // inventory may change here!
        inventory -= quantity   // Could go negative
    }
}

// PATTERN: Mutate state synchronously, verify after await
actor OrderProcessor {
    var inventory: Int = 100

    func processOrder(quantity: Int) async throws {
        await chargePayment()
        guard inventory >= quantity else { throw OrderError.insufficientInventory }
        inventory -= quantity
    }
}
```

### Sendable Requirements

```swift
// Value types are inherently Sendable
struct HeartRateSample: Sendable {
    let bpm: Double
    let timestamp: Date
}

// Final class with immutable stored properties
final class Configuration: Sendable {
    let apiKey: String
    let environment: Environment
}
```

---

## 2. iOS App Lifecycle

### ScenePhase Handling

```swift
@main
struct MyApp: App {
    @Environment(\.scenePhase) var scenePhase
    @State var sessionManager = SessionManager()

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        .onChange(of: scenePhase) { _, newPhase in
            switch newPhase {
            case .active:
                sessionManager.resumeIfNeeded()
            case .inactive:
                // Timers and haptics should pause here to avoid battery drain
                // User may be swiping between apps or pulling down notification center
                sessionManager.pauseTimersAndHaptics()
            case .background:
                sessionManager.saveState()
                sessionManager.scheduleBackgroundWork()
            @unknown default: break
            }
        }
    }
}
```

### Background Modes (Info.plist)

```xml
<!-- Required for breathing session audio to continue in background -->
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>           <!-- Ambient sounds + voice guidance -->
    <string>processing</string>      <!-- HRV trend computation -->
</array>
```

### State Restoration

```swift
struct BreathingSessionView: View {
    // @SceneStorage persists across app restarts (simple values only)
    @SceneStorage("activePattern") var activePattern: String = ""
    @SceneStorage("elapsedSeconds") var elapsedSeconds: Double = 0

    // For complex state, save to SwiftData in .background phase
}
```

### Interruption Handling

```swift
// Combine ScenePhase with audio interruption for complete coverage
NotificationCenter.default.addObserver(
    forName: AVAudioSession.interruptionNotification,
    object: nil, queue: .main
) { notification in
    guard let type = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          AVAudioSession.InterruptionType(rawValue: type) == .began else { return }
    // Phone call or Siri — pause breathing guidance
    sessionManager.pauseForInterruption()
}
```

---

## 3. Error Handling Patterns

### Domain-Specific Errors

```swift
// Define domain-specific errors
enum AppError: Error, LocalizedError {
    case healthKitDenied
    case healthKitUnavailable
    case watchDisconnected
    case aiUnavailable
    case audioSessionFailed(Error)

    var errorDescription: String? {
        switch self {
        case .healthKitDenied: "Heart rate access not granted"
        case .healthKitUnavailable: "Health data not available on this device"
        case .watchDisconnected: "Apple Watch not connected"
        case .aiUnavailable: "AI coaching not available on this device"
        case .audioSessionFailed: "Audio playback error"
        }
    }
}
```

### User-Facing Error States

```swift
struct SessionView: View {
    @State var healthStatus: HealthStatus = .checking

    var body: some View {
        switch healthStatus {
        case .checking:
            ProgressView("Connecting...")
        case .active(let bpm):
            LiveBreathingView(heartRate: bpm)
        case .denied:
            // Functional without HealthKit — manual mode
            ManualBreathingView(message: "Grant heart rate access in Settings for biofeedback.")
        case .unavailable:
            // iPad or device without HealthKit
            ManualBreathingView(message: "Biofeedback requires Apple Watch.")
        }
    }
}

enum HealthStatus {
    case checking, active(Double), denied, unavailable
}
```

### AI Fallback Chain

```swift
// See `apple-foundation-models` for detailed provider abstraction
func getCoachingGuidance(context: CoachingContext) async -> String {
    // Try Foundation Models → MLX → Template
    if let ai = try? await foundationModelsProvider.generate(context) { return ai }
    if let mlx = try? await mlxProvider.generate(context) { return mlx }
    return templateProvider.generate(context)  // Template fallback — available regardless of device capabilities
}
```

---

## 4. @Observable vs ObservableObject

### Migration Pattern

```swift
// @Observable replaces ObservableObject + @Published
@Observable
class ViewModel {
    var items: [Item] = []
    var isLoading: Bool = false
    @ObservationIgnored var analyticsId = UUID().uuidString
}
struct ContentView: View {
    @State var viewModel = ViewModel()  // @State, not @StateObject
}
```

### Ownership Gotcha

```swift
// PROBLEM: Plain property — new instance on every parent rebuild
struct ChildView: View {
    var viewModel: ExpensiveViewModel  // No @State — recreated each time!
}

// SOLUTION: Own the observable with @State
struct ChildView: View {
    @State var viewModel = ExpensiveViewModel()  // @State preserves across rebuilds
}

// ALSO VALID: Parent owns, child receives
struct ParentView: View {
    @State var viewModel = ExpensiveViewModel()
    var body: some View {
        ChildView(viewModel: viewModel)  // Passed by reference, not recreated
    }
}
```

---

## 5. SwiftData vs Core Data

### SwiftData Relationship Rules

```swift
// 1. Insert parent BEFORE appending children
modelContext.insert(parent)
parent.children.append(child)

// 2. Only specify @Relationship on ONE side
@Model class Parent {
    @Relationship(deleteRule: .cascade, inverse: \Child.parent)
    var children: [Child] = []
}
@Model class Child {
    var parent: Parent?  // No @Relationship needed here
}

// 3. Use optional relationships to prevent crashes on deletion
// 4. SwiftData does NOT preserve array order — use sort descriptors
```

---

## 6. Structured Concurrency Patterns

### TaskGroup (Parallel Fetching)

```swift
func fetchAllData() async throws -> [Item] {
    try await withThrowingTaskGroup(of: Item.self) { group in
        for id in itemIds {
            group.addTask { try await self.fetchItem(id: id) }
        }
        var results: [Item] = []
        for try await item in group {
            results.append(item)
        }
        return results
    }
}
```

### AsyncStream (Bridging Callbacks)

```swift
func heartRateStream() -> AsyncStream<Double> {
    AsyncStream { continuation in
        let query = HKAnchoredObjectQuery(/* ... */)
        query.updateHandler = { _, samples, _, _, _ in
            guard let sample = samples?.last as? HKQuantitySample else { return }
            continuation.yield(sample.quantity.doubleValue(for: HKUnit.count().unitDivided(by: .minute())))
        }
        // AsyncStream does not auto-cancel its producer; connect onTermination to avoid leaks
        continuation.onTermination = { _ in healthStore.stop(query) }
        healthStore.execute(query)
    }
}
```

## Date-Anchored Timing (Drift-Free Animation)

```swift
func update(now: Date) {
    let elapsed = now.timeIntervalSince(cycleStartDate)
    let position = elapsed.truncatingRemainder(dividingBy: totalCycleSeconds)
    // Derive phase and progress from position
}
```

Expose `update(now: Date)` for `TimelineView` integration — the caller drives the frame rate, the driver computes state deterministically. Tests pass any `Date` with no `Task.sleep` needed.

## @Observable ViewModel Boundaries

`@AppStorage` is a SwiftUI `View` property wrapper and belongs only in View contexts. For non-View `@Observable` Swift 6 classes, use constructor-injected `UserDefaults` instead:

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

Per-test ephemeral suites never collide and require no cleanup because they live in memory only. `@AppStorage` remains appropriate in View structs where it is designed to work.

## .task Cancellation Propagation

SwiftUI cancels the `Task` wrapping `.task` when the view disappears. `try?` collapses `CancellationError` into `nil`, letting the function continue past the `await` and mutate `@State` on a vanished view.

**Anti-pattern**: `let result = try? await loadData()` — swallows cancellation, races with view lifecycle.

**Pattern**: Make the inner helper `async throws`, catch `CancellationError` explicitly and rethrow, and call `Task.checkCancellation()` after each await point:

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

The outermost `.task` closure receives the rethrown cancellation naturally; only the top-level entry point needs to handle it as a non-error.
