# HealthKit Biofeedback -- Examples

## Authorization

```swift
class HealthKitManager {
    private let store = HKHealthStore()

    // Request only the types you need — users see each individually
    func requestAuthorization() async throws {
        let readTypes: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.heartRateVariabilitySDNN),
            HKQuantityType(.respiratoryRate),
            HKQuantityType(.oxygenSaturation),
        ]
        let writeTypes: Set<HKSampleType> = [
            HKQuantityType(.heartRate),
            HKWorkoutType.workoutType(),
        ]

        try await store.requestAuthorization(
            toShare: writeTypes,
            read: readTypes
        )
    }

    // Check availability BEFORE requesting
    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    // authorizationStatus(for:) only reports WRITE permission.
    // Apple intentionally hides read authorization to prevent health-condition inference.
    // To check if data is available, attempt a query and handle empty results.
    func canWriteHeartRate() -> Bool {
        store.authorizationStatus(for: HKQuantityType(.heartRate)) == .sharingAuthorized
    }
}
```

## Real-Time Heart Rate (Workout Session)

```swift
// A workout session is REQUIRED for real-time HR on watchOS
class WorkoutManager: NSObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    private let store = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    func startWorkoutSession() async throws {
        let config = HKWorkoutConfiguration()
        config.activityType = .mindAndBody  // Breathwork category
        config.locationType = .indoor

        session = try HKWorkoutSession(healthStore: store, configuration: config)
        builder = session?.associatedWorkoutBuilder()

        session?.delegate = self
        builder?.delegate = self
        builder?.dataSource = HKLiveWorkoutDataSource(
            healthStore: store,
            workoutConfiguration: config
        )

        let startDate = Date()
        session?.startActivity(with: startDate)
        try await builder?.beginCollection(at: startDate)
    }

    // Heart rate arrives here via builder delegate
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                        didCollectDataOf collectedTypes: Set<HKSampleType>) {
        guard collectedTypes.contains(HKQuantityType(.heartRate)) else { return }

        let statistics = workoutBuilder.statistics(for: HKQuantityType(.heartRate))
        let bpm = statistics?.mostRecentQuantity()?
            .doubleValue(for: HKUnit.count().unitDivided(by: .minute()))

        if let bpm {
            Task { @MainActor in
                self.onHeartRateUpdate?(bpm)
            }
        }
    }

    var onHeartRateUpdate: ((Double) -> Void)?

    func endSession() async throws {
        session?.end()
        try await builder?.endCollection(at: Date())
        try await builder?.finishWorkout()
    }
}
```

## Heart Rate as AsyncStream

```swift
extension WorkoutManager {
    func heartRateStream() -> AsyncStream<Double> {
        AsyncStream { continuation in
            self.onHeartRateUpdate = { bpm in
                continuation.yield(bpm)
            }
            continuation.onTermination = { _ in
                Task { try? await self.endSession() }
            }
        }
    }
}

// Usage in ViewModel
func observeHeartRate() async {
    for await bpm in workoutManager.heartRateStream() {
        self.currentHeartRate = bpm
        self.heartRateHistory.append(HeartRateSample(bpm: bpm, date: .now))
    }
}
```

## Historical HRV Query

```swift
func fetchRecentHRV(days: Int = 7) async throws -> [HRVSample] {
    let type = HKQuantityType(.heartRateVariabilitySDNN)
    let predicate = HKQuery.predicateForSamples(
        withStart: Calendar.current.date(byAdding: .day, value: -days, to: .now),
        end: .now
    )
    let descriptor = HKSampleQueryDescriptor(
        predicates: [.quantitySample(type: type, predicate: predicate)],
        sortDescriptors: [SortDescriptor(\.startDate, order: .reverse)]
    )

    let samples = try await descriptor.result(for: store)
    return samples.map { sample in
        HRVSample(
            value: sample.quantity.doubleValue(for: .secondUnit(with: .milli)),
            date: sample.startDate
        )
    }
}
```

## Anchored Queries for Live Updates

```swift
// Anchored queries resume from last checkpoint — efficient for streaming
func observeHeartRateChanges() -> AsyncStream<[Double]> {
    AsyncStream { continuation in
        let type = HKQuantityType(.heartRate)
        var anchor: HKQueryAnchor?

        let query = HKAnchoredObjectQuery(
            type: type,
            predicate: nil,
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        ) { query, samples, _, newAnchor, error in
            anchor = newAnchor
            let rates = (samples ?? []).compactMap { sample -> Double? in
                (sample as? HKQuantitySample)?
                    .quantity.doubleValue(for: .count().unitDivided(by: .minute()))
            }
            continuation.yield(rates)
        }

        // Update handler fires for subsequent changes
        query.updateHandler = { query, samples, _, newAnchor, error in
            anchor = newAnchor
            let rates = (samples ?? []).compactMap { sample -> Double? in
                (sample as? HKQuantitySample)?
                    .quantity.doubleValue(for: .count().unitDivided(by: .minute()))
            }
            continuation.yield(rates)
        }

        store.execute(query)
        continuation.onTermination = { _ in
            self.store.stop(query)
        }
    }
}
```

## Writing Workout Data

```swift
// Use HKWorkoutBuilder (iOS 17+ — direct HKWorkout init is deprecated)
func saveBreathworkSession(
    startDate: Date,
    endDate: Date,
    heartRateSamples: [HKQuantitySample]
) async throws {
    let config = HKWorkoutConfiguration()
    config.activityType = .mindAndBody

    let builder = HKWorkoutBuilder(healthStore: store, configuration: config, device: .local())
    try await builder.beginCollection(at: startDate)
    try await builder.addSamples(heartRateSamples)
    try await builder.addMetadata([
        "BreathworkPattern": "4-7-8",
        "AppVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    ])
    try await builder.endCollection(at: endDate)
    try await builder.finishWorkout()
}
```

## Graceful Degradation

```swift
// Handle missing permissions gracefully — app should function without HealthKit
struct BiofeedbackView: View {
    @State var authStatus: AuthorizationStatus = .unknown

    var body: some View {
        switch authStatus {
        case .authorized:
            LiveHeartRateView()
        case .denied:
            // Show value without requiring HealthKit
            ManualInputView(message: "Heart rate access denied. You can enter manually.")
        case .unknown:
            RequestPermissionView()
        }
    }
}
```
