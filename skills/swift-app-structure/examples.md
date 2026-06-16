# Swift App Structure -- Examples

All code examples for patterns described in SKILL.md.

---

## 1. Navigation: NavigationStack + Coordinator

### Route enum and coordinator

```swift
// Route enum — all destinations in one place
enum Route: Hashable {
    case detail(Item)
    case settings
    case profile(User)
}

// Coordinator manages navigation state
@Observable
class AppCoordinator {
    var path = NavigationPath()

    func navigate(to route: Route) { path.append(route) }
    func pop() { path.removeLast() }
    func popToRoot() { path.removeLast(path.count) }
}
```

### Root view wiring

```swift
struct RootView: View {
    @State var coordinator = AppCoordinator()

    var body: some View {
        NavigationStack(path: $coordinator.path) {
            HomeView()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .detail(let item): DetailView(item: item)
                    case .settings: SettingsView()
                    case .profile(let user): ProfileView(user: user)
                    }
                }
        }
        .environment(coordinator)
    }
}
```

### Child view navigation

```swift
struct HomeView: View {
    @Environment(AppCoordinator.self) var coordinator

    var body: some View {
        Button("Show Detail") { coordinator.navigate(to: .detail(item)) }
    }
}
```

---

## 2. Dependency Injection

### Initializer injection

```swift
@Observable
class SessionViewModel {
    private let healthService: HealthServiceProtocol
    private let analytics: AnalyticsProtocol

    init(healthService: HealthServiceProtocol, analytics: AnalyticsProtocol) {
        self.healthService = healthService
        self.analytics = analytics
    }
}
```

### SwiftUI Environment injection

```swift
struct HealthServiceKey: EnvironmentKey {
    static let defaultValue: HealthServiceProtocol = LiveHealthService()
}

extension EnvironmentValues {
    var healthService: HealthServiceProtocol {
        get { self[HealthServiceKey.self] }
        set { self[HealthServiceKey.self] = newValue }
    }
}

// Usage
struct ContentView: View {
    @Environment(\.healthService) var healthService
}

// Override for previews/tests
#Preview {
    ContentView()
        .environment(\.healthService, MockHealthService())
}
```

---

## 3. Multi-Target Modularization (SPM)

### Recommended directory structure

```
MyApp/
├── Packages/
│   ├── Core/              # Platform-agnostic business logic
│   │   ├── Models/
│   │   ├── Services/
│   │   └── Utilities/
│   ├── HealthKit/         # HealthKit abstraction
│   └── UI/                # Shared SwiftUI components
├── MyApp-iOS/             # iOS app target
├── MyApp-watchOS/         # watchOS app target
└── Tests/
```

### Platform-specific code

```swift
public struct HealthDataService {
    public func fetchHeartRate() async throws -> Double {
        #if os(watchOS)
        return try await fetchFromWorkoutSession()
        #else
        return try await fetchFromQuery()
        #endif
    }
}
```

### Package.swift

```swift
let package = Package(
    name: "SharedFramework",
    platforms: [.iOS(.v17), .watchOS(.v10)],
    products: [
        .library(name: "SharedFramework", targets: ["SharedFramework"])
    ],
    targets: [
        .target(name: "SharedFramework"),
        .testTarget(name: "SharedFrameworkTests", dependencies: ["SharedFramework"])
    ]
)
```
