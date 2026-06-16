# Swift 6+ & SwiftUI — Examples

Complete Swift code examples organized by SKILL.md section.

---

## MVVM with SwiftUI

### ViewModel as @Observable

```swift
// ViewModel as @Observable (Swift 5.9+ / iOS 17+)
@Observable
class BreathingSessionViewModel {
    var phase: BreathPhase = .inhale
    var elapsed: TimeInterval = 0
    var heartRate: Double = 0

    private let healthService: HealthServiceProtocol

    init(healthService: HealthServiceProtocol) {
        self.healthService = healthService
    }

    func startSession() async {
        for await rate in healthService.heartRateStream() {
            heartRate = rate
        }
    }
}

// View consumes ViewModel
struct BreathingSessionView: View {
    @State private var viewModel: BreathingSessionViewModel

    var body: some View {
        BreathCircle(phase: viewModel.phase)
            .task { await viewModel.startSession() }
    }
}
```

### Protocol-Oriented Abstractions

```swift
// Abstract over data sources for testability
protocol HealthServiceProtocol: Sendable {
    func heartRateStream() -> AsyncStream<Double>
    func requestAuthorization() async throws
}

// Example implementation
struct LiveHealthService: HealthServiceProtocol { ... }

// Mock for testing/previews
struct MockHealthService: HealthServiceProtocol {
    func heartRateStream() -> AsyncStream<Double> {
        AsyncStream { continuation in
            continuation.yield(72.0)
        }
    }
}
```

---

## Animations

### Breathing Circle

```swift
struct BreathCircle: View {
    let phase: BreathPhase

    var body: some View {
        Circle()
            .fill(
                RadialGradient(
                    colors: [.blue.opacity(0.3), .blue.opacity(0.8)],
                    center: .center,
                    startRadius: 20,
                    endRadius: phase.radius
                )
            )
            .frame(width: phase.radius * 2, height: phase.radius * 2)
            .animation(.easeInOut(duration: phase.duration), value: phase)
    }
}

enum BreathPhase: Equatable {
    case inhale, hold, exhale, rest

    var radius: CGFloat {
        switch self {
        case .inhale: 120
        case .hold: 120
        case .exhale: 60
        case .rest: 60
        }
    }

    var duration: TimeInterval {
        switch self {
        case .inhale: 4.0
        case .hold: 7.0
        case .exhale: 8.0
        case .rest: 2.0
        }
    }
}
```

### Custom Shape Paths

```swift
struct BreathingRing: Shape {
    var progress: CGFloat  // 0.0 to 1.0, animatable

    var animatableData: CGFloat {
        get { progress }
        set { progress = newValue }
    }

    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        path.addArc(
            center: center,
            radius: radius,
            startAngle: .degrees(-90),
            endAngle: .degrees(-90 + 360 * progress),
            clockwise: false
        )
        return path
    }
}
```

### TimelineView for Precise Timing

```swift
struct SessionTimerView: View {
    @State private var startDate = Date()

    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 60.0)) { context in
            let elapsed = context.date.timeIntervalSince(startDate)
            BreathingRing(progress: breathProgress(at: elapsed))
                .stroke(lineWidth: 8)
        }
    }
}
```

### Pure-Snapshot Pattern (avoids "Modifying state during view update")

```swift
// Driver: read side is non-mutating; write side runs in .onChange
@Observable
final class AnimationDriver {
    private(set) var cycleStartDate: Date = Date()
    private(set) var currentStageIndex: Int = 0

    private let controller = StageAdvanceController()

    /// Pure derive — zero writes. Safe to call in TimelineView body.
    func snapshot(at now: Date) -> (stageIndex: Int, progress: Double) {
        let elapsed = now.timeIntervalSince(cycleStartDate)
        let duration = stageDurations[currentStageIndex]
        let progress = min(elapsed / duration, 1.0)
        return (currentStageIndex, progress)
    }

    /// Mutating update — call only from .onChange, never from body.
    func update(now: Date) {
        let result = controller.advance(now: now, durations: stageDurations)
        switch result {
        case .noChange:
            break
        case .advanced(let index):
            currentStageIndex = index
            cycleStartDate = now
        case .sessionComplete:
            // handle completion
            break
        }
    }

    private let stageDurations: [TimeInterval] = [4, 7, 8, 2] // inhale/hold/exhale/rest
}

// View: body is read-only; mutation deferred to .onChange
struct BreathingAnimationView: View {
    @State private var driver = AnimationDriver()

    var body: some View {
        TimelineView(.animation) { context in
            let snap = driver.snapshot(at: context.date)
            BreathingRing(progress: snap.progress)
                .onChange(of: context.date) { _, now in
                    driver.update(now: now)  // fires after render pass
                }
        }
    }
}

// StageAdvanceController: pure, @MainActor, independently test-covered
@MainActor
struct StageAdvanceController {
    enum Outcome {
        case noChange
        case advanced(toIndex: Int)
        case sessionComplete
    }

    private var lastAdvancedDate: Date?

    mutating func advance(now: Date, durations: [TimeInterval]) -> Outcome {
        // Duplicate-advance guard
        if let last = lastAdvancedDate, now.timeIntervalSince(last) < 0.016 {
            return .noChange
        }
        lastAdvancedDate = now
        // Stage logic omitted for brevity — driven by cycleStartDate delta
        return .noChange
    }
}
```

---

## Swift Charts

### 7-Day HRV Trend

```swift
import Charts

struct HRVTrendChart: View {
    let samples: [HRVSample]  // { value: Double, date: Date }

    var body: some View {
        Chart(samples) { sample in
            LineMark(
                x: .value("Date", sample.date),
                y: .value("HRV", sample.value)
            )
            .interpolationMethod(.catmullRom)
            .foregroundStyle(.teal.gradient)
        }
        .chartYScale(domain: 20...120)
        .chartYAxisLabel("SDNN (ms)")
        .chartXAxis {
            AxisMarks(values: .stride(by: .day)) { _ in
                AxisGridLine()
                AxisValueLabel(format: .dateTime.weekday(.abbreviated))
            }
        }
    }
}
```

### Real-Time Heart Rate Timeline

```swift
struct HeartRateTimelineChart: View {
    let readings: [HeartRateSample]  // { bpm: Double, timestamp: Date }

    var body: some View {
        Chart(readings) { reading in
            PointMark(
                x: .value("Time", reading.timestamp),
                y: .value("BPM", reading.bpm)
            )
            .foregroundStyle(reading.bpm > 100 ? .red : .green)
            .symbolSize(20)
        }
        .chartYScale(domain: 40...180)
        .chartYAxisLabel("BPM")
    }
}
```

---

## Accessibility

### Dynamic Type and VoiceOver

```swift
struct HeartRateDisplay: View {
    let bpm: Double

    var body: some View {
        Text("\(Int(bpm))")
            .font(.system(.largeTitle, design: .rounded))
            .dynamicTypeSize(...DynamicTypeSize.accessibility3)
            .accessibilityLabel("Heart rate: \(Int(bpm)) beats per minute")
    }
}
```

### Reduce Motion Support

```swift
struct BreathCircleAccessible: View {
    let phase: BreathPhase
    @Environment(\.accessibilityReduceMotion) var reduceMotion

    var body: some View {
        if reduceMotion {
            // Static progress bar instead of animated circle
            ProgressView(value: phase.progress)
                .progressViewStyle(.linear)
                .accessibilityLabel("Breathing phase: \(phase.name)")
        } else {
            BreathCircle(phase: phase)
        }
    }
}
```

### VoiceOver Phase Announcements

```swift
// Announce phase changes for VoiceOver users
func announcePhaseChange(_ phase: BreathPhase) {
    AccessibilityNotification.Announcement(
        "\(phase.name). \(phase.instruction)"
    ).post()
    // e.g., "Inhale. Breathe in slowly for 4 seconds."
}
```

### Accessibility Actions

```swift
// Custom rotor action to skip phases
BreathCircle(phase: currentPhase)
    .accessibilityAction(named: "Skip to next phase") {
        sessionManager.advancePhase()
    }
    .accessibilityValue("\(Int(elapsed)) seconds into \(currentPhase.name)")
```

---

## Dark Mode & Adaptive Colors

```swift
// Define semantic colors in Asset Catalog with light/dark variants
// Or programmatically:
extension Color {
    static let breathInhale = Color("InhaleBlue")   // Asset Catalog entry
    static let breathExhale = Color("ExhaleTeal")
    static let sessionBackground = Color("SessionBG") // Near-black dark, soft white light
}

// Force dark mode during breathing sessions (less visual stimulation)
struct BreathingSessionView: View {
    var body: some View {
        ZStack {
            Color.sessionBackground.ignoresSafeArea()
            BreathCircle(phase: currentPhase)
        }
        .preferredColorScheme(.dark)  // Always dark during sessions
    }
}

// Conditional rendering based on color scheme
struct StatsView: View {
    @Environment(\.colorScheme) var colorScheme

    var body: some View {
        HRVTrendChart(samples: samples)
            .chartPlotStyle { plotArea in
                plotArea.background(
                    colorScheme == .dark ? Color.black.opacity(0.3) : Color.white
                )
            }
    }
}
```
