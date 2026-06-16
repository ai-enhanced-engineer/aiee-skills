# iOS App Quality — Examples

## HealthKit Mocking for Tests

```swift
// Protocol-based abstraction enables testable HealthKit code
protocol HealthStore {
    func requestAuthorization(
        toShare: Set<HKSampleType>,
        read: Set<HKObjectType>
    ) async throws
    func execute(_ query: HKQuery)
    func save(_ sample: HKSample) async throws
}

// Production implementation wraps real HKHealthStore
class LiveHealthStore: HealthStore {
    private let store = HKHealthStore()
    func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws {
        try await store.requestAuthorization(toShare: toShare, read: read)
    }
    func execute(_ query: HKQuery) { store.execute(query) }
    func save(_ sample: HKSample) async throws { try await store.save(sample) }
}

// Test mock
class MockHealthStore: HealthStore {
    var authorizationRequested = false
    var savedSamples: [HKSample] = []
    var shouldThrow = false

    func requestAuthorization(toShare: Set<HKSampleType>, read: Set<HKObjectType>) async throws {
        authorizationRequested = true
        if shouldThrow { throw HealthError.authorizationDenied }
    }
    func execute(_ query: HKQuery) { /* no-op */ }
    func save(_ sample: HKSample) async throws { savedSamples.append(sample) }
}
```

## Swift Testing Framework (Modern)

```swift
import Testing

@Suite("Breathing Session Tests")
struct BreathingSessionTests {

    @Test("Phase transitions follow correct sequence")
    func phaseTransitions() {
        let session = BreathingSession(pattern: .boxBreathing)

        #expect(session.currentPhase == .inhale)
        session.advance()
        #expect(session.currentPhase == .hold)
        session.advance()
        #expect(session.currentPhase == .exhale)
        session.advance()
        #expect(session.currentPhase == .hold)
    }

    @Test("Heart rate below threshold triggers guidance", arguments: [
        (40.0, true),   // Too low
        (72.0, false),  // Normal
        (180.0, true),  // Too high
    ])
    func heartRateThreshold(bpm: Double, shouldTrigger: Bool) {
        let coach = BreathCoach()
        #expect(coach.shouldOfferGuidance(heartRate: bpm) == shouldTrigger)
    }
}
```

## XCTest (Traditional)

```swift
import XCTest

class WorkoutManagerTests: XCTestCase {
    var sut: WorkoutManager!
    var mockStore: MockHealthStore!

    override func setUp() {
        mockStore = MockHealthStore()
        sut = WorkoutManager(healthStore: mockStore)
    }

    func test__startSession__requestsAuthorization() async throws {
        try await sut.startWorkoutSession()
        XCTAssertTrue(mockStore.authorizationRequested)
    }

    func test__startSession__authDenied__throwsError() async {
        mockStore.shouldThrow = true
        do {
            try await sut.startWorkoutSession()
            XCTFail("Expected error")
        } catch {
            XCTAssertEqual(error as? HealthError, .authorizationDenied)
        }
    }
}
```

## Privacy-First Data Architecture

```swift
// All biometric data stays on-device
struct PrivacyArchitecture {
    // Local only — never leaves device
    // SwiftData for session history
    @Model
    class BreathingSessionRecord {
        var startDate: Date
        var endDate: Date
        var pattern: String
        var averageHeartRate: Double  // Aggregated, not raw samples
        var hrvImprovement: Double?

        // Raw heart rate samples are NOT persisted
        // Only aggregates stored
    }

    // Keychain for sensitive preferences
    // (e.g., health goals, notification settings)
}
```

## Privacy Manifest (PrivacyInfo.xcprivacy)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/ItemList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>NSPrivacyTracking</key>
    <false/>
    <key>NSPrivacyCollectedDataTypes</key>
    <array>
        <dict>
            <key>NSPrivacyCollectedDataType</key>
            <string>NSPrivacyCollectedDataTypeHealthData</string>
            <key>NSPrivacyCollectedDataTypeLinked</key>
            <false/>
            <key>NSPrivacyCollectedDataTypeTracking</key>
            <false/>
            <key>NSPrivacyCollectedDataTypePurposes</key>
            <array>
                <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
            </array>
        </dict>
    </array>
    <key>NSPrivacyAccessedAPITypes</key>
    <array>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>C617.1</string></array>
        </dict>
        <dict>
            <key>NSPrivacyAccessedAPIType</key>
            <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
            <key>NSPrivacyAccessedAPITypeReasons</key>
            <array><string>E174.1</string></array>
        </dict>
    </array>
</dict>
</plist>
```

## Multi-Target Build (iOS + watchOS)

```
Project structure for iOS + watchOS:

MyApp/
├── MyApp/                    # iOS app target
│   ├── App.swift
│   └── Views/
├── MyAppWatch/               # watchOS app target
│   ├── App.swift
│   └── Views/
├── Shared/                   # Shared framework
│   ├── Models/
│   ├── Services/
│   └── HealthKit/
└── Tests/
    ├── MyAppTests/           # iOS tests
    └── SharedTests/          # Shared logic tests
```

## HealthKit Entitlement

```xml
<!-- MyApp.entitlements -->
<key>com.apple.developer.healthkit</key>
<true/>
<key>com.apple.developer.healthkit.access</key>
<array>
    <string>health-records</string>
</array>
```

## Xcode Cloud Workflow

```yaml
# Basic CI/CD for health app
# Configured in Xcode Cloud settings (not a file — shown for reference)
Workflow: "Build & Test"
  Start Condition: Push to main
  Environment: Latest Xcode, Latest macOS
  Actions:
    1. Build (iOS + watchOS targets)
    2. Test (SharedTests, MyAppTests)
    3. Archive
    4. Deploy to TestFlight (internal testers)
```

## Fastlane Match (Team Signing)

```ruby
# Fastlane Matchfile
git_url("https://github.com/org/certificates")
type("appstore")
app_identifier([
  "com.example.app",
  "com.example.app.watchkitapp"
])

# Fastlane lane
lane :beta do
  match(type: "appstore")
  build_app(scheme: "MyApp")
  upload_to_testflight
end
```

## StoreKit 2 (Subscriptions)

```swift
import StoreKit

class SubscriptionManager {
    // Load products from App Store
    func loadProducts() async throws -> [Product] {
        try await Product.products(for: [
            "com.example.monthly",
            "com.example.annual"
        ])
    }

    // Check active subscription
    func isSubscribed() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result,
               transaction.productType == .autoRenewable,
               transaction.revocationDate == nil {
                return true
            }
        }
        return false
    }

    // Purchase
    func purchase(_ product: Product) async throws -> Transaction? {
        let result = try await product.purchase()
        switch result {
        case .success(let verification):
            let transaction = try verification.payloadValue
            await transaction.finish()
            return transaction
        case .userCancelled, .pending:
            return nil
        @unknown default:
            return nil
        }
    }
}
```

## StoreKit Testing

Create a `MyApp.storekit` configuration file in Xcode for local testing without App Store Connect. Supports subscription renewals, cancellations, and grace periods in the simulator.

## SwiftData & HealthKit Error Handling: try? vs do/catch

```swift
// WRONG: try? silently swallows errors — fetchOrCreate creates duplicates
let existing = try? modelContext.fetch(descriptor)
if existing?.isEmpty ?? true {
    modelContext.insert(NewRecord())  // Creates a duplicate if fetch threw
}

// RIGHT: do/catch with logging surfaces errors that try? would hide
do {
    let existing = try modelContext.fetch(descriptor)
    if existing.isEmpty {
        modelContext.insert(NewRecord())
    }
} catch {
    os_log(.error, "SwiftData fetch failed: %@", error.localizedDescription)
    // Decide: fail loud, retry, or fall through — but don't pretend it worked
}
```

Same applies to HealthKit `HKWorkoutBuilder.endCollection()` / `finishWorkout()` — wrapping these in `try?` silently loses the workout when collection fails:

```swift
// WRONG: silent data loss
try? await builder.endCollection(at: Date())
try? await builder.finishWorkout()

// RIGHT: surface failures so the user knows their session wasn't saved
do {
    try await builder.endCollection(at: Date())
    let workout = try await builder.finishWorkout()
    return workout
} catch {
    logger.error("Workout finalization failed: \(error.localizedDescription, privacy: .public)")
    throw error
}
```

## SwiftData iCloud Backup Exclusion

SwiftData stores at `Application Support/default.store` are included in iCloud backups by default. For health/biometric apps with an on-device-only privacy model, exclude all three file variants in two places: `App.init()` covers post-restore reinstalls where the store already exists; the `scenePhase .active` handler covers the first-launch race where `.modelContainer` materializes the store after `init()` but before the first scene activation.

```swift
import SwiftUI
import SwiftData
import os

private let storeLogger = Logger(subsystem: "com.app.id", category: "SEC-001")

@main
struct MyApp: App {
    @Environment(\.scenePhase) private var scenePhase

    init() {
        excludeSwiftDataStoreFromBackup()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
        .modelContainer(for: [BreathingSessionRecord.self])
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                excludeSwiftDataStoreFromBackup()
            }
        }
    }
}

func excludeSwiftDataStoreFromBackup() {
    let appSupport = FileManager.default.urls(
        for: .applicationSupportDirectory, in: .userDomainMask
    ).first!
    let baseStore = appSupport.appendingPathComponent("default.store")

    for variant in ["", "-shm", "-wal"] {
        let url = baseStore.appendingPathExtension(variant.isEmpty ? "" : variant)
        var resolved = baseStore
        if !variant.isEmpty {
            resolved = appSupport.appendingPathComponent("default.store" + variant)
        }
        do {
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutable = resolved
            try mutable.setResourceValues(values)
        } catch let error as NSError where error.domain == NSCocoaErrorDomain
            && error.code == CocoaError.fileNoSuchFile.rawValue {
            // Expected pre-materialization on first launch — silently swallow
        } catch {
            let desc = error.localizedDescription
            storeLogger.fault(
                "backup-exclusion-failed path=\(resolved.path, privacy: .public) error=\(desc, privacy: .public)"
            )
        }
    }
}
```

If `SwiftData.framework` is linked transitively (e.g., `@Model` types in `Shared/`) but no `modelContainer` exists on watchOS, add a guard comment in `MyAppWatch` noting that a parallel exclusion call is required if `.modelContainer()` is ever added.

## Privacy-Critical Logging (os.Logger)

Production builds silence `print()` to stdout, so failures from `Logger.fault` surface in Console.app and crash aggregators while `print()` calls leave no trace. Use this pattern for backup exclusion, auth checks, and data deletion paths.

```swift
import os

private let logger = Logger(subsystem: "com.app.id", category: "SEC-001")

func deleteUserData() {
    do {
        try secureStore.wipe()
    } catch {
        // Hoist localizedDescription into a local — string interpolation with
        // privacy labels does not accept chained property accesses inline.
        let desc = error.localizedDescription
        let path = secureStore.url.path
        logger.fault(
            "wipe-failed path=\(path, privacy: .public) error=\(desc, privacy: .public)"
        )
    }
}
```

The `localizedDescription` hoist is required: `\(error.localizedDescription, privacy: .public)` is a compile error because the privacy-label interpolation overload does not accept chained property accesses. Bind to a `let` first, then interpolate.

## SwiftData Test Container Retention

A test helper that creates an in-memory `ModelContainer` and returns only the manager leaves the container unowned — `ModelContext` does not retain its container. On the next `modelContext.fetch()` the container deallocs and xctest crashes with a confusing `EXC_BAD_ACCESS` deep in SwiftData internals.

The fix is to return a tuple and bind both names in the test:

```swift
func makeTestManager() -> (TechniqueProgressManager, ModelContainer) {
    let schema = Schema([TechniqueProgress.self])
    let config = ModelConfiguration(isStoredInMemoryOnly: true)
    let container = try! ModelContainer(for: schema, configurations: config)
    let manager = TechniqueProgressManager(modelContext: container.mainContext)
    return (manager, container)
}

// In test:
@Test("progress increments on completion")
func progressIncrement() {
    let (manager, container) = makeTestManager()
    _ = container  // retain for test lifetime — silences unused-variable warning

    manager.recordCompletion(for: .boxBreathing)
    #expect(manager.totalSessions(for: .boxBreathing) == 1)
}
```

The `_ = container` line is load-bearing: without it, the optimizer is free to drop the binding, the container deallocs mid-test, and `manager.recordCompletion` crashes inside SwiftData. Alternatively, use the tuple-bound name throughout the test (`container.mainContext.fetch(...)`) so the binding is observably live.
