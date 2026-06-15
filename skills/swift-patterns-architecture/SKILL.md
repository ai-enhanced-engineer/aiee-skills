---
name: swift-patterns-architecture
description: "Swift 6 runtime architecture: strict concurrency, actor isolation, @Observable migration, SwiftData vs Core Data, structured concurrency patterns, sendable, async stream, task group, swift macros, scene phase, and testing framework selection. Use for Swift architecture decisions, actor isolation issues, @Observable migration, or graceful degradation patterns."
kb-sources:
  - wiki/software-engineering/swift-architecture
updated: 2026-05-22
---

# Swift Patterns & Architecture

Runtime architecture for Swift 6+ iOS/watchOS apps: concurrency, data persistence, and observation.

Complements `swift-app-structure` (navigation, DI, modularization) and `swift-swiftui` (UI patterns).

## When to Use

- Adopting Swift 6 strict concurrency
- Migrating ObservableObject to @Observable
- Deciding between SwiftData vs Core Data
- Designing structured concurrency (TaskGroup, AsyncStream)

---

## 1. Swift 6.2 Approachable Concurrency

New defaults: **Default Main Actor Isolation** and **nonisolated(nonsending)**. Flags: `InferIsolatedConformances`, `NonisolatedNonsendingByDefault`. Actor reentrancy is critical — re-verify state after each `await`. `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` is free at creation; retrofitting is expensive. See `reference.md § Swift 6.2 Approachable Concurrency`.

## 2. iOS App Lifecycle

ScenePhase: `.active` (resume), `.inactive` (pause timers/haptics), `.background` (save state). Use `@SceneStorage` for simple persistence. Combine with `AVAudioSession.interruptionNotification` for full coverage. See `reference.md § ScenePhase Handling`.

## 3. Error Handling

Domain errors via `LocalizedError`. Degradation chain: Foundation Models → MLX → template. Show user-facing states per failure mode.

## 4. @Observable vs ObservableObject

| Criteria | Recommendation |
|----------|----------------|
| iOS 17+ target | Use `@Observable` |
| iOS 16 support | Keep `ObservableObject` |
| New project | Use `@Observable` |
| Existing codebase | Gradual migration |

`@State` (not `@StateObject`) owns `@Observable` instances. See `reference.md § Observable Migration` for gotchas.

## 5. SwiftData vs Core Data

| Factor | SwiftData | Core Data |
|--------|-----------|-----------|
| Min iOS | 17+ | 11+ |
| Syntax | Swift macros | Obj-C heritage |
| SwiftUI | Native `@Query` | Manual fetch |
| Predicates | Limited | `NSCompoundPredicate` |
| Performance | Slower | Faster |
| Migration | Basic | Mature |

**SwiftData**: iOS 17+ new projects. **Core Data**: performance-critical or iOS 16. See `reference.md § SwiftData Relationship Rules`.

## 6. Structured Concurrency

**TaskGroup** for parallel fetching. **AsyncStream** for callback bridging. Connect `onTermination` to avoid producer leaks.

## 7. Testing Framework

Unit/parameterized/parallel → **Swift Testing**. UI or performance tests → **XCTest**. Both coexist in one target. See `ios-app-quality`.

## 8. Test Target Configuration (xcodegen)

`TEST_HOST: ""` bundles: include source files in `sources:`. Combining `@testable import` with `TEST_HOST: ""` → undefined symbol errors. See `reference.md § Test Target Configuration`.

## 9. Animation & Timing

Drift-free: `elapsed % totalCycleSeconds` from an anchor date, not `Task.sleep` accumulation. Expose `update(now: Date)` for `TimelineView`. Extract render components as `(phase, phaseProgress, config, size)` with zero state. See `reference.md § Animation & Timing Patterns`.

## 10. Cross-Target Data Passing

Expose `record(value:at:)` in `Shared/` called from the app layer. Keeps engine ignorant of connectivity. Wrap mocks in `#if DEBUG`. See `reference.md § Cross-Target Data Passing`.

## 11. Additional Patterns

- **State Machine Enum**: Enums with associated values replace `Bool` flags. `Equatable` for `onChange(of:)`. `reference.md § State Machine Enum`.
- **@Observable Boundaries**: `@AppStorage` is View-only; inject `UserDefaults` in non-View classes. `reference.md § Observable ViewModel Boundaries`.
- **.task Cancellation**: `try?` swallows `CancellationError`; use `async throws` + `Task.checkCancellation()`. `reference.md § .task Cancellation Propagation`.
- **v1 Constants**: `private static let` on the type, not inline literals. `reference.md § v1 Tunable Constants`.

## Anti-Patterns

See `reference.md § Anti-Pattern Quick Reference` for the full table. Critical entries:

| Anti-Pattern | Pattern |
|---|---|
| State assumptions across `await` | Re-verify after each suspension |
| `@StateObject` on iOS 17+ | `@Observable` + `@State` |
| `@AppStorage` in non-View class | Constructor-inject `UserDefaults` |
| `try?` in `.task` helper | `async throws` + explicit `CancellationError` catch |

## References

- [Approachable Concurrency — SwiftLee](https://www.avanderlee.com/concurrency/approachable-concurrency-in-swift-6-2-a-clear-guide/)
- [Actor Reentrancy — Donny Wals](https://www.donnywals.com/actor-reentrancy-in-swift-explained/)
- [Observable Migration — Apple](https://developer.apple.com/documentation/SwiftUI/Migrating-from-the-observable-object-protocol-to-the-observable-macro)
- [SwiftData Pitfalls — Wade Tregaskis](https://wadetregaskis.com/swiftdata-pitfalls/)

See `reference.md` for reentrancy detail, Sendable, Observable gotchas, SwiftData rules, and full anti-pattern table. See `examples.md` for code.
