# watchOS Development — Examples

## WatchConnectivity Setup

```swift
// Shared session manager for both iOS and watchOS targets
@Observable
class ConnectivityManager: NSObject, WCSessionDelegate {
    static let shared = ConnectivityManager()

    func activate() {
        guard WCSession.isSupported() else { return }
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    // Real-time: only works when both apps are reachable
    func sendHeartRate(_ bpm: Double) {
        guard WCSession.default.isReachable else {
            // Fall back to background transfer
            queueHeartRate(bpm)
            return
        }
        WCSession.default.sendMessage(
            ["heartRate": bpm, "timestamp": Date().timeIntervalSince1970],
            replyHandler: nil
        ) { error in
            // Connection dropped — queue for background transfer
            self.queueHeartRate(bpm)
        }
    }

    // Background: queued, delivered when possible
    func queueHeartRate(_ bpm: Double) {
        WCSession.default.transferUserInfo([
            "heartRate": bpm,
            "timestamp": Date().timeIntervalSince1970
        ])
    }

    // Shared state: latest value only (overwrites previous)
    func updateSessionState(_ state: [String: Any]) {
        try? WCSession.default.updateApplicationContext(state)
    }
}
```

## Battery Optimization

```swift
// Adaptive refresh rate based on screen state
struct BiofeedbackView: View {
    @Environment(\.isLuminanceReduced) var isAlwaysOn

    var body: some View {
        TimelineView(
            .periodic(
                from: .now,
                // Reduce refresh rate in Always On Display
                by: isAlwaysOn ? 2.0 : 1.0 / 30.0
            )
        ) { context in
            if isAlwaysOn {
                // Simplified view for AOD — no animations
                StaticHeartRateView(bpm: latestBPM)
            } else {
                // Full animated view
                AnimatedBreathCircle(timestamp: context.date)
            }
        }
    }
}
```

## Memory Management

```swift
// watchOS has ~30MB usable RAM — avoid retaining large collections
class SessionDataBuffer {
    // Ring buffer instead of growing array
    private var buffer: [HeartRateSample]
    private var index: Int = 0
    private let capacity: Int

    init(capacity: Int = 300) {  // ~5 min at 1/sec
        self.capacity = capacity
        self.buffer = []
        self.buffer.reserveCapacity(capacity)
    }

    func append(_ sample: HeartRateSample) {
        if buffer.count < capacity {
            buffer.append(sample)
        } else {
            buffer[index % capacity] = sample
        }
        index += 1
    }
}
```

## Watch-Specific SwiftUI

### Digital Crown Binding

```swift
// Digital Crown binding
struct BreathRateSelector: View {
    @State private var breathsPerMinute: Double = 6.0

    var body: some View {
        VStack {
            Text("\(Int(breathsPerMinute)) breaths/min")
                .font(.title2)
            Text("Turn crown to adjust")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .focusable()
        .digitalCrownRotation(
            $breathsPerMinute,
            from: 3.0, through: 12.0, by: 0.5,
            sensitivity: .low
        )
    }
}
```

### Haptic Breathing Cues

```swift
// WKHapticType for breathing rhythm on watchOS
func playBreathingHaptic(phase: BreathPhase) {
    switch phase {
    case .inhale:
        WKInterfaceDevice.current().play(.start)
    case .hold:
        // No haptic during hold
        break
    case .exhale:
        WKInterfaceDevice.current().play(.stop)
    case .rest:
        WKInterfaceDevice.current().play(.click)
    }
}
```

## App Lifecycle

### WKApplicationDelegate

```swift
class AppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidBecomeActive() {
        // Resume heart rate monitoring, reconnect WCSession
        ConnectivityManager.shared.activate()
    }

    func applicationWillResignActive() {
        // Pause non-essential updates (UI refresh)
        // Do NOT stop workout session — it runs in background
    }

    func applicationDidEnterBackground() {
        // Save session state for restoration
    }
}
```

### Extended Runtime Session

```swift
// Keep watch app active during breathing sessions
class BreathingSessionManager {
    private var extendedSession: WKExtendedRuntimeSession?

    func startBreathingSession() {
        extendedSession = WKExtendedRuntimeSession()
        extendedSession?.delegate = self
        extendedSession?.start()
        // App stays active even when wrist is lowered
    }

    func endBreathingSession() {
        extendedSession?.invalidate()
        extendedSession = nil
    }
}

extension BreathingSessionManager: WKExtendedRuntimeSessionDelegate {
    func extendedRuntimeSessionDidStart(_ session: WKExtendedRuntimeSession) { }
    func extendedRuntimeSessionWillExpire(_ session: WKExtendedRuntimeSession) {
        // Session about to end — save state, notify user
        endBreathingSession()
    }
    func extendedRuntimeSession(_ session: WKExtendedRuntimeSession,
                                 didInvalidateWith reason: WKExtendedRuntimeSessionInvalidationReason,
                                 error: Error?) { }
}
```

## Background App Refresh

```swift
// Schedule periodic HRV sync in background
func scheduleBackgroundRefresh() {
    let fireDate = Date(timeIntervalSinceNow: 15 * 60)  // 15 minutes
    WKApplication.shared().scheduleBackgroundRefresh(
        withPreferredDate: fireDate,
        userInfo: ["task": "hrv-sync"] as NSDictionary
    ) { error in
        if let error { logger.error("BAR scheduling failed: \(error)") }
    }
}

// Handle in WKApplicationDelegate
func handle(_ backgroundTasks: Set<WKRefreshBackgroundTask>) {
    for task in backgroundTasks {
        switch task {
        case let refreshTask as WKApplicationRefreshBackgroundTask:
            // Fetch latest HRV data, sync to iPhone
            Task {
                await syncHRVData()
                scheduleBackgroundRefresh()  // Reschedule
                refreshTask.setTaskCompletedWithSnapshot(false)
            }
        default:
            task.setTaskCompletedWithSnapshot(false)
        }
    }
}
```

## Error Handling & Recovery

```swift
// WatchConnectivity delivery is not guaranteed; handle the disconnection case
func session(_ session: WCSession,
             didReceiveMessage message: [String: Any],
             replyHandler: @escaping ([String: Any]) -> Void) {
    if let heartRate = message["heartRate"] as? Double {
        Task { @MainActor in
            viewModel.updateHeartRate(heartRate)
        }
        replyHandler(["status": "received"])
    }
}

// Handle activation failures
func session(_ session: WCSession,
             activationDidCompleteWith state: WCSessionActivationState,
             error: Error?) {
    if let error = error {
        logger.error("WCSession activation failed: \(error)")
        Task { @MainActor in
            viewModel.setOfflineMode(true)
        }
    }
}
```

### Retry with Exponential Backoff

```swift
func sendWithRetry(_ message: [String: Any], maxRetries: Int = 3) {
    var attempt = 0

    func trySend() {
        guard WCSession.default.isReachable else {
            // Fall back immediately if not reachable
            ConnectivityManager.shared.queueHeartRate(message["heartRate"] as? Double ?? 0)
            return
        }

        WCSession.default.sendMessage(message, replyHandler: nil) { error in
            attempt += 1
            if attempt < maxRetries {
                let delay = Double(1 << attempt)  // 2s, 4s, 8s
                Task {
                    try? await Task.sleep(for: .seconds(delay))
                    trySend()
                }
            } else {
                // Exhaust retries — queue for background transfer
                ConnectivityManager.shared.queueHeartRate(message["heartRate"] as? Double ?? 0)
            }
        }
    }

    trySend()
}
```

### Delivery Tracking

```swift
// Check pending transfers
func pendingTransferCount() -> Int {
    WCSession.default.outstandingUserInfoTransfers.count
}

// Monitor for stale transfers (> 5 minutes old)
func checkStaleTransfers() {
    let staleThreshold = Date(timeIntervalSinceNow: -300)
    let stale = WCSession.default.outstandingUserInfoTransfers.filter {
        !$0.isTransferring
    }
    if !stale.isEmpty {
        logger.warning("\(stale.count) stale transfers detected")
    }
}
```
