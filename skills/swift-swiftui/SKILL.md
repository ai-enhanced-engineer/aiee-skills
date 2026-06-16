---
name: swift-swiftui
description: "Swift 6+ and SwiftUI patterns for iOS/watchOS apps. MVVM architecture, animations, state management, accessibility, and Human Interface Guidelines. Use when building SwiftUI views, implementing MVVM with @Observable, or designing accessible HIG-compliant interfaces."
kb-sources:
  - wiki/software-engineering/swift-swiftui
updated: 2026-06-03
---

# Swift 6+ & SwiftUI

Modern Swift and SwiftUI patterns for iOS and watchOS application development.

## When to Use

- Building iOS/watchOS UI with SwiftUI
- Architecting apps with MVVM
- Implementing animations, custom shapes, and data charts
- Designing accessible, HIG-compliant interfaces
- Configuring dark mode and adaptive colors

> For Swift 6 concurrency patterns (actors, async/await, Sendable), see `swift-patterns-architecture`.
> For navigation, DI, and project modularization, see `swift-app-structure`.

---

## MVVM with SwiftUI

`@Observable` ViewModel owned by `@State` in the View. Protocol-oriented abstractions (e.g., `HealthServiceProtocol`) enable testability and preview mocks.

## Animations

SwiftUI's declarative animations with `.animation(_:value:)` for breathing circles, `animatableData` for custom `Shape` paths, and `TimelineView` for precise frame-rate timing.

## Swift Charts

Use `Chart` with `LineMark`, `PointMark`, `BarMark` for HRV trends and heart rate timelines. Customize axes with `AxisMarks`, `.chartYScale`, and `.chartYAxisLabel`.

## State Management Decision Tree

```
Need shared state across views?
├── Yes, simple value → @State + passing via init
├── Yes, complex object → @Observable class
├── Yes, across navigation → @Environment
├── Reactive stream from framework → AsyncStream + .task
└── Persistent data → SwiftData @Model
```

## Accessibility

Dynamic Type support with `.dynamicTypeSize()`, Reduce Motion alternatives (static progress bar instead of animated circle), VoiceOver phase announcements via `AccessibilityNotification.Announcement`, and custom rotor actions for session control.

### Reduce Motion for Animated Readouts

`Circle().trim` animations and `Text` + `.contentTransition(.numericText())` that ignore `@Environment(\.accessibilityReduceMotion)` play motion for vestibular-disorder users — a HIG violation and an App Store review risk. When reduce motion is on, pass `nil` to `.animation()` (disables animation entirely) and `.identity` to `.contentTransition()` (crossfade instead of animating digits):

```swift
@Environment(\.accessibilityReduceMotion) private var reduceMotion

Circle()
    .trim(from: 0, to: progress)
    .animation(reduceMotion ? nil : .easeInOut(duration: 1.0), value: progress)

Text("\(score)")
    .contentTransition(reduceMotion ? .identity : .numericText())
```

### Combined VoiceOver Labels

For grouped UI elements (signal pills, score + bucket + recommendation card), build the `accessibilityLabel` string in the same scope where the visible elements are built, from the same source data. Use `.accessibilityElement(children: .combine)` on the outer container. Drift is structurally impossible because both the label and the visible content consume the same input.

## Dark Mode & Adaptive Colors

Define semantic colors in Asset Catalog with light/dark variants. Force `.preferredColorScheme(.dark)` during sessions for reduced visual stimulation. Use `@Environment(\.colorScheme)` for conditional rendering. Wellness palette: muted blues, teals, greens; avoid high-saturation reds.

## Asset Management (Multi-Target)

When using companion app architecture (iOS + watchOS), named color sets in `Assets.xcassets` only resolve against the *target's own* resource catalog at runtime. Shared Swift code referencing `Color("BrandPrimary")` against a watchOS target whose catalog lacks the set silently falls back to default — the iOS and watchOS apps then visually diverge with no compile-time signal. A `cp -R` of the Colors directory during the build phase is the simplest approach. Same applies to image sets used in shared views.

## Typography: Custom Fonts (iOS vs watchOS)

**iOS**: TTFs registered via `UIAppFonts` in Info.plist enable `Font.custom("PostScriptName", size:)`. PostScript names differ from filenames — `fc-scan` or Python fonttools can verify them.

**watchOS**: Custom font registration is not supported (platform limitation). `Font.system()` is the only available option.

Shared font extension files split implementations with `#if os(iOS)` / `#if os(watchOS)`. See `examples.md` for the conditional compilation pattern.

## TimelineView Pitfalls

### ScrollView + `.animation()` Interaction
Applying `.animation(_:value:)` to a `ScrollView` interferes with `Button` gesture recognition inside it — taps are consumed by the scroll gesture or cause scroll-to-top jumps. Scope `.animation()` to only the specific content that should animate, not the scroll container.

### `@State` / `@Observable` Mutation in TimelineView Body
Mutating state during `TimelineView`'s `@ViewBuilder` pass triggers "Modifying state during view update" — undefined behavior. Use a non-mutating `snapshot(at:) -> (phase, progress)` in the body; run mutating side-effects (stage advance, `driver.update(now:)`) in `.onChange(of: context.date)`, which fires after the render pass. See `reference.md` § Pure-Snapshot Render for the full pattern and `StageAdvanceController` shape.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `@StateObject` / `@ObservedObject` with iOS 17+ | Use `@Observable` + `@State` |
| Blocking main thread with synchronous HealthKit calls | Prefer async/await or AsyncStream for structured concurrency |
| Hardcoded frame sizes for animations | Use `GeometryReader` or relative sizing |
| Skipping `Sendable` conformance on shared types | Mark all cross-actor types as `Sendable` |
| Force-unwrapping HealthKit authorization | Handle denial gracefully with fallback UI |
| Hardcoded color literals (e.g., `Color.blue`) | Use Color asset catalog with light/dark variants |
| Building custom chart views with Canvas for standard data | Use Swift Charts for line/point/bar visualizations |
| Per-frame `Task { @MainActor }` inside `TimelineView` body | Non-mutating `snapshot(at:)` in body; mutating `driver.update` in `.onChange(of: context.date)` |

## Key References

- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)
- [Swift Concurrency documentation](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/concurrency/)

See `reference.md` for detailed explanations of protocol abstractions, accessibility patterns, dark mode guidelines, and anti-pattern rationale.
See `examples.md` for complete Swift code examples organized by section.
