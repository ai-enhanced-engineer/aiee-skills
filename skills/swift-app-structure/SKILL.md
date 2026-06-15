---
name: swift-app-structure
description: "iOS/watchOS app structure: NavigationStack coordinators, dependency injection, SPM modularization, and TCA vs vanilla SwiftUI decisions. Use when designing iOS navigation architecture, setting up dependency injection, or choosing between TCA and vanilla SwiftUI."
kb-sources:
  - wiki/software-engineering/swift-app-structure
updated: 2026-05-22
---

# Swift App Structure

Project organization patterns for iOS/watchOS apps: navigation, dependency injection, modularization, and framework choice.

Complements `swift-patterns-architecture` (runtime concerns: concurrency, data, lifecycle).

## When to Use

- Designing navigation with coordinators
- Setting up dependency injection without third-party frameworks
- Modularizing multi-target projects (iOS + watchOS) with SPM
- Choosing between TCA and vanilla SwiftUI

---

## 1. Navigation: NavigationStack + Coordinator

The standard SwiftUI navigation approach as of 2026. A `Route` enum defines destinations, an `@Observable` coordinator manages `NavigationPath` state, and the root view wires them together with `navigationDestination(for:)`.

NavigationPath supports `Codable` for state restoration across app restarts. Children navigate by calling coordinator methods injected via SwiftUI Environment.

See `examples.md` for full coordinator implementation.

---

## 2. Dependency Injection (No Third-Party Frameworks)

Two complementary approaches, each suited to different contexts:

- **Initializer injection** -- preferred for ViewModels and services where dependencies are explicit and testable.
- **SwiftUI Environment injection** -- useful for cross-cutting concerns accessed by many views; supports easy preview/test overrides.

See `reference.md` for trade-off analysis and `examples.md` for code.

---

## 3. Multi-Target Modularization (SPM)

Structure shared code into SPM packages (Core, HealthKit, UI) consumed by platform-specific app targets (iOS, watchOS). Platform-specific behavior is isolated with `#if os()` conditionals inside shared modules.

See `reference.md` for Package.swift configuration details and `examples.md` for directory layout and code.

---

## 4. TCA vs Vanilla SwiftUI

| Factor | Vanilla SwiftUI | TCA |
|--------|----------------|-----|
| App size | Small-medium | Large, complex state |
| Team experience | Learning | Experienced |
| Testing needs | Standard | Heavy, deterministic |
| State spans screens | No | Yes |
| Side effect complexity | Simple | Complex, needs scheduling |

TCA is well-suited to apps with complex cross-screen state management and heavy side effects. With `@Observable`, SwiftData, and modern SwiftUI, many apps are well-served by vanilla patterns.

---

## 5. xcodegen Project Generation

For CLI-driven Xcode project management, `xcodegen` generates `.xcodeproj` from a declarative `project.yml`. Key patterns for iOS + watchOS dual-target projects:

- **Include-by-source for shared code**: When a shared framework can't be multi-platform in xcodegen, include `Shared/` sources directly in both app targets with `excludes: [Info.plist]`. Both targets compile the same files independently — avoids cross-platform framework linking issues.
- **PrivacyInfo.xcprivacy**: Needs to be under `resources:` in the target's xcodegen config (maps to Copy Bundle Resources build phase). See `ios-app-quality` reference.md for consequences of missing this.
- **Enum name ≠ module name**: An `enum Shared` inside a module also named `Shared` creates ambiguity — `Shared.version` becomes indeterminate between the type and the module. Naming internal types differently (e.g., `SharedConstants`) avoids this.

xcodegen + include-by-source works well for Sprint 1 greenfield projects before the shared code surface stabilizes enough for SPM modularization.

## Anti-Patterns

| Anti-Pattern | Preferred Pattern |
|---|---|
| NavigationLink with eager destination closure | `navigationDestination(for:)` with value-based routing |
| Navigation state in ViewModels | Coordinator pattern with `NavigationPath` |
| Third-party DI frameworks | Initializer injection + Environment |
| TCA for small apps | Vanilla SwiftUI is simpler; TCA for complex state |

## Key References

- [Modern SwiftUI Navigation -- Medium](https://medium.com/@dinaga119/mastering-navigation-in-swiftui-the-2025-guide-to-clean-scalable-routing-bbcb6dbce929)
- [Coordinator Pattern in SwiftUI -- jorgemrht](https://jorgemrht.dev/2025/09/10/coordinator-Pattern-in-SwiftUI-Best-Practice-Navigation)
- [DI using Swift features -- SwiftLee](https://www.avanderlee.com/swift/dependency-injection/)
- [TCA FAQ -- Point-Free](https://www.pointfree.co/blog/posts/141-composable-architecture-frequently-asked-questions)

---

## Related Files

- `reference.md` -- Detailed explanations, trade-offs, and configuration guidance
- `examples.md` -- All code examples with section headers
