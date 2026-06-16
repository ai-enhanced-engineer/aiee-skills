# Swift App Structure -- Reference

Detailed explanations and trade-offs for patterns summarized in SKILL.md.

---

## NavigationPath Codable State Restoration

`NavigationPath` conforms to `Codable` when all appended types are `Codable`. This enables persisting the navigation stack to `UserDefaults` or a file and restoring it on next launch. The `Route` enum should conform to both `Hashable` and `Codable` to support this.

Considerations:
- State restoration is most useful for deep navigation hierarchies where losing position is disruptive.
- For apps with simple navigation (1-2 levels deep), the added complexity of serialization is typically not warranted.
- Routes containing model objects should use lightweight identifiers rather than full model data to keep serialized state small.

---

## Dependency Injection: Environment vs Initializer

### Initializer Injection

Best suited for ViewModels and service objects where you want compile-time guarantees that all dependencies are provided. The dependency list is explicit in the initializer signature, making it easy to reason about what a type needs.

Trade-offs:
- Dependencies are visible at the call site -- good for readability, can become verbose with many dependencies.
- Straightforward to test: pass mocks directly via init.
- Does not require SwiftUI infrastructure, so it works in non-view contexts (services, coordinators).

### SwiftUI Environment Injection

Best suited for cross-cutting concerns (analytics, theming, services) that many views need but that would be tedious to thread through initializers.

Trade-offs:
- Reduces boilerplate for widely-used dependencies.
- Requires defining an `EnvironmentKey` with a `defaultValue`, which means there is a live default even in tests unless explicitly overridden.
- Only accessible within SwiftUI view hierarchy -- not available in plain Swift classes without extra plumbing.

### When to Combine Both

A common pattern uses Environment injection for the view layer and initializer injection for ViewModels. The view reads the dependency from Environment and passes it to the ViewModel's initializer.

---

## Platform-Specific Code with #if os()

When sharing packages across iOS and watchOS, platform-specific behavior belongs inside `#if os()` blocks within the shared module rather than in separate targets. This keeps the API surface unified while allowing divergent implementations.

Guidelines:
- Keep platform conditionals as narrow as possible -- wrap individual methods or code blocks rather than entire files.
- When platform differences are substantial (different UI, different capabilities), consider separate targets within the same package rather than proliferating conditionals.
- Test both platforms in CI to catch conditional compilation issues early.

---

## Package.swift Configuration

Key decisions when setting up a multi-platform SPM package:

- **Platform minimums**: Set `.iOS(.v17), .watchOS(.v10)` (or your actual minimums) to enable modern APIs like `@Observable` and `SwiftData`.
- **Product structure**: One library product per logical module (Core, UI, HealthKit). Avoid a single monolith package that forces both targets to compile everything.
- **Test targets**: Mirror each library target with a corresponding test target. Use `dependencies:` to reference only the module under test.
- **Resource bundles**: Use `.process("Resources")` in target definitions for assets that need to ship with the module.

---

## TCA Decision Criteria (Expanded)

TCA (The Composable Architecture) adds value proportional to the complexity it manages. Consider these signals:

**Signals favoring TCA:**
- Multiple screens share and mutate the same state
- Side effects require deterministic scheduling and cancellation
- The team values snapshot testing of state transitions
- Feature modules need strict isolation with defined communication boundaries

**Signals favoring vanilla SwiftUI:**
- State is local to individual screens
- Side effects are straightforward async/await calls
- The team is learning SwiftUI fundamentals
- Rapid prototyping speed matters more than architectural rigor
- `@Observable` + SwiftData cover the data management needs

**Migration note:** Adopting TCA incrementally is feasible -- individual features can use TCA while the rest of the app remains vanilla. This allows a gradual evaluation rather than an all-or-nothing commitment.
