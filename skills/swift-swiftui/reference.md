# Swift 6+ & SwiftUI — Reference

Detailed explanations for concepts summarized in SKILL.md.

---

## Protocol-Oriented Abstractions

Abstract over data sources and services using protocols marked `Sendable` for cross-actor safety. This enables:

- **Testability**: Inject mock implementations in unit tests and SwiftUI previews.
- **Decoupling**: Views and ViewModels depend on protocols, not concrete types. Swap implementations without changing consumers.
- **Preview support**: Lightweight mock services return static data for Xcode previews, avoiding real network/HealthKit calls.

Pattern: Define `protocol FooProtocol: Sendable`, implement `struct LiveFoo: FooProtocol` and `struct MockFoo: FooProtocol`. Inject via initializer.

## Accessibility Patterns

### Dynamic Type

Use `.dynamicTypeSize(...DynamicTypeSize.accessibility3)` to cap maximum scaling while still supporting accessibility sizes. System fonts (`.largeTitle`, `.body`) scale automatically. Custom fonts need `@ScaledMetric` for proportional scaling.

### Reduce Motion

Check `@Environment(\.accessibilityReduceMotion)` and provide static alternatives to animations. For breathing apps, replace animated circles with linear progress bars. This isn't optional — animated breathing guides can cause discomfort for users with vestibular disorders.

### VoiceOver

- Use `.accessibilityLabel()` for semantic descriptions (e.g., "Heart rate: 72 beats per minute" not "72").
- Post `AccessibilityNotification.Announcement` for phase changes so VoiceOver users know when to inhale/exhale without visual cues.
- Provide `.accessibilityValue()` for continuous state (elapsed time, current phase).

### Accessibility Actions

Custom rotor actions (`.accessibilityAction(named:)`) let VoiceOver users perform session-specific operations like skipping phases or ending sessions without navigating the full UI.

## Dark Mode & Adaptive Colors

### Asset Catalog Approach

Define colors in the Asset Catalog with light and dark appearances. Reference them as `Color("InhaleBlue")`. This is the recommended approach because:

- Designers can update colors without code changes.
- System handles transitions automatically.
- Interface Builder and SwiftUI previews show correct variants.

### Programmatic Approach

Use `@Environment(\.colorScheme)` for conditional rendering that goes beyond simple color swaps (e.g., different chart background opacities, alternative layouts).

### Session-Forced Dark Mode

Use `.preferredColorScheme(.dark)` on breathing session views. Rationale: during guided breathing, bright backgrounds increase visual stimulation and can raise heart rate — counterproductive for relaxation exercises.

## Wellness Palette Guidelines

- **Primary**: Muted blues and teals for breathing phases.
- **Secondary**: Soft greens for success/completion states.
- **Avoid**: High-saturation reds (anxiety-inducing in wellness contexts). Use warm amber for alerts instead.
- **Dark mode**: Should feel calming, not stark. Use near-black backgrounds (`Color.black.opacity(0.9)`) rather than pure black.
- **Contrast**: Maintain WCAG AA contrast ratios (4.5:1 for text, 3:1 for large text/UI components).

## Pure-Snapshot Render for TimelineView

### Problem

`TimelineView(.animation)` re-evaluates its body on every frame. Mutating `@State` or a self-`@Observable` driver inside that body triggers "Modifying state during view update" — undefined SwiftUI behavior. Wrapping the mutation in `Task { @MainActor in driver.update(now:) }` avoids the diagnostic but allocates ~60 unstructured `Task` objects per second and adds a one-frame lag because the update lands on the next runloop turn.

### Pattern

Split the driver into two concerns:

1. **Read side (non-mutating)** — a `snapshot(at:)` method derives render state from an anchor date (`cycleStartDate`) with pure arithmetic, zero writes. `TimelineView` body calls only this.
2. **Write side (mutating)** — `driver.update(now:)` and stage-advance logic run in `.onChange(of: context.date)`, which fires after the render pass completes. No "during view update" violation.

```
TimelineView body → driver.snapshot(at: context.date)   ← pure, no writes
.onChange(of: context.date) → driver.update(now:)       ← mutating, after render
```

### StageAdvanceController

Extract stage-advance logic into a pure `@MainActor` struct so it is independently test-covered:

```swift
@MainActor
struct StageAdvanceController {
    enum Outcome {
        case noChange
        case advanced(toIndex: Int)
        case sessionComplete
    }

    func advance(now: Date, durations: [TimeInterval]) -> Outcome { ... }
}
```

The duplicate-advance guard (checking that `now` hasn't already been processed) belongs here, covered by unit tests without needing a live `TimelineView`.

### Why This Is Cleaner Than the Textbook Approach

The "self-mutating `@Observable` driver" pattern shown in many tutorials works in practice because SwiftUI currently tolerates it, but relies on implementation-defined behavior that Apple can tighten. The snapshot + `.onChange` split is structurally correct: it separates read (body) from write (side-effect modifier) and carries no hidden allocations.

## Anti-Pattern Rationale

### @StateObject / @ObservedObject on iOS 17+

`@Observable` provides property-level tracking (only re-renders views that read changed properties) versus `ObservableObject`'s object-level tracking (re-renders all views observing the object on any `@Published` change). The performance difference is significant in complex view hierarchies.

### Synchronous HealthKit Calls

HealthKit queries can take hundreds of milliseconds. On the main thread, this causes visible UI freezes. Using `async/await` or `AsyncStream` keeps the main thread responsive.

### Hardcoded Frame Sizes

Fixed pixel values break on different device sizes and Dynamic Type settings. Use `GeometryReader` for proportional sizing, or relative values based on screen dimensions.

### Hardcoded Color Literals

`Color.blue` doesn't adapt to dark mode or accessibility settings (e.g., Increase Contrast). Asset catalog colors with light/dark variants ensure consistent appearance across all display modes.
