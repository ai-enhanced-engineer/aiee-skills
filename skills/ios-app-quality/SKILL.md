---
name: ios-app-quality
description: "iOS app quality patterns: privacy-first data architecture, XCTest/Swift Testing, HealthKit mocking, Instruments profiling, code signing, and App Store review readiness."
kb-sources:
  - wiki/software-engineering/ios-app-quality
updated: 2026-05-22
---

# iOS App Quality

Testing, privacy, performance profiling, and distribution patterns for shipping iOS/watchOS health apps.

- **`reference.md`** — long-form explanations (manifests, Instruments, multi-target, CI/CD, StoreKit, HIG, setup)
- **`examples.md`** — complete code (Swift, XML, Ruby)

## When to Use

- Writing unit and integration tests for HealthKit-dependent code
- Designing privacy-first data architecture
- Profiling battery and memory usage with Instruments
- Preparing for App Store review (health app scrutiny)
- Setting up CI/CD and TestFlight distribution

## HealthKit Mocking

Abstract `HKHealthStore` behind a `HealthStore` protocol so tests inject a `MockHealthStore` tracking authorization, saved samples, and errors. See `examples.md § HealthKit Mocking for Tests` for the protocol + Live + Mock.

## Testing Frameworks

**Swift Testing**: `@Suite`, `@Test`, `#expect`, parameterized with `arguments:`. **XCTest**: `setUp`/`tearDown`, `XCTAssert*`, `test__method__condition__expected`. See `examples.md § Swift Testing Framework (Modern)` and `examples.md § XCTest (Traditional)`.

## Privacy Architecture

Store only aggregates in SwiftData — raw samples escape via iCloud backup, breaking the privacy model the HealthKit usage description claimed. Keychain for sensitive preferences. See `reference.md § Privacy Manifest (PrivacyInfo.xcprivacy)` and `examples.md § Privacy-First Data Architecture`.

## Performance Profiling (Instruments)

| Instrument | Target | Watch For |
|---|---|---|
| Energy Log | < 10% battery/hour | GPS on, excessive CPU wakeups |
| Allocations | watchOS ~30MB budget | Growing arrays of samples |
| Time Profiler | 0 hangs > 250ms | Synchronous HealthKit calls |
| Animation Hitches | 0 hitches > 33ms | Expensive view body recomputation |

See `reference.md § Performance Profiling (Instruments)` for per-instrument guidance.

## App Store Review Checklist (Health Apps)

Health apps face heightened scrutiny for medical claims, missing privacy manifests, and off-device data transmission. See `reference.md § App Store Review Checklist (Health Apps)` for the 10-item checklist.

## Design Wireframe Validation

Two-pass review: pass 1 validates fidelity scope and Reduce Motion alternatives; pass 2 checks HIG compliance (safe areas, 44pt touch targets, watchOS 13pt font minimum). See `reference.md § Design Wireframe Validation`.

## Pre-Sprint Setup Items

Three lead-time items: PrivacyInfo.xcprivacy build phase placement (silent rejection without it), increased-memory-limit entitlement approval (1-3 business days), and watchOS `WKBackgroundModes` for workout sessions. See `reference.md § Pre-Sprint Setup Items`.

## Font Bundling

Custom fonts require TTF files in `Resources/Fonts/`, `UIAppFonts` filenames in Info.plist, and PostScript name verification — filename and PostScript name routinely differ, causing silent system-font fallback. watchOS has no custom font registration. See `reference.md § Font Bundling` for licensing, SHA-256 verification, and Google Fonts CDN discovery.

## SourceKit Diagnostic Reliability

SourceKit "Cannot find type" / "No such module" errors are frequently stale in multi-target projects — a successful `xcodebuild build` means the diagnostics are phantom. See `reference.md § SourceKit Diagnostic Reliability in Multi-Target Projects`.

## Privacy Manifests (NSPrivacyAccessedAPITypes)

SwiftData apps declare `NSPrivacyAccessedAPICategoryFileTimestamp` (`C617.1`) and `NSPrivacyAccessedAPICategoryDiskSpace` (`E174.1`); mismatched UserDefaults reason codes cause rejection. See `reference.md § NSPrivacyAccessedAPITypes for SwiftData apps` for the reason-code matrix and Privacy Report workflow.

## CI/CD & Code Signing

HealthKit requires an explicit App ID (no wildcard). Use Xcode automatic signing or Fastlane match; Xcode Cloud or Fastlane for build-test-archive-deploy to TestFlight. See `reference.md § CI/CD & Code Signing` and `examples.md § Xcode Cloud Workflow`.

## StoreKit 2

`Product.products(for:)` loads, `Transaction.currentEntitlements` checks subs, `product.purchase()` purchases — `transaction.finish()` is required or transactions retry indefinitely. Use `.storekit` files for local testing. See `examples.md § StoreKit 2 (Subscriptions)`.

## SwiftData & HealthKit Error Handling

`try?` on `modelContext.fetch()` causes `fetchOrCreate` duplicates; same for `HKWorkoutBuilder.finishWorkout()` — session data lost silently. Use `do/catch` with `os_log(.error)`. See `examples.md § SwiftData & HealthKit Error Handling: try? vs do/catch`.

## SwiftData iCloud Backup Exclusion

Excluding only `.store` leaves `.store-shm` and `.store-wal` WAL files still backing up — exclude all three in `App.init()` and `scenePhase .active` to cover the first-launch materialization race. See `examples.md § SwiftData iCloud Backup Exclusion`.

## Privacy-Critical Logging

Privacy-critical paths use `os.Logger` `.fault()` with `.public` labels — production silences `print()`, so only `Logger.fault` surfaces in Console.app. See `examples.md § Privacy-Critical Logging (os.Logger)`.

## SwiftData Test Container Retention

`ModelContext` does not retain its container — a helper returning only the manager lets the container dealloc and the next fetch crashes with `EXC_BAD_ACCESS`. Return a `(Manager, ModelContainer)` tuple; bind both. See `examples.md § SwiftData Test Container Retention`.

## Swift Testing Conventions (SwiftLint + SwiftFormat)

Two pre-commit blockers: `@Suite(.serialized)` not `@Suite("string-name", .serialized)` (`swiftTestingTestCaseNames` rejects string labels), and identifiers ≥3 chars (`pm`, `vm`, `id` fail). See `reference.md § Swift Testing Conventions (SwiftLint + SwiftFormat)` for rule interactions and type-body-length split strategy.

## git add -f for Gitignored Sprint Folders

Sprint folders gitignored per AIEE hub convention need `git add -f sprint/path/to/ticket.md` to include implementation notes in the PR. Document the force-add in the description. See `reference.md § git add -f for Gitignored Sprint Folders`.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| Testing against real `HKHealthStore` | Protocol abstraction + mock |
| Storing raw heart rate time series permanently | Store aggregates only; raw data is transient |
| Claiming health benefits without evidence | Use "may help" language; cite published research |
| Single target for iOS + watchOS | Shared framework + separate app targets |
| Skipping Privacy Manifest | Required since iOS 17; rejection risk |
| Manual code signing for health apps | Xcode automatic signing or Fastlane match |
| Testing IAP against production App Store | `.storekit` configuration for local testing |
| `print()` in privacy-critical control paths | `Logger(.fault, privacy: .public)` — visible in Console.app; `print()` silenced in production |
| Discarding `ModelContainer` in SwiftData test helpers | Return `(Manager, ModelContainer)` tuple; bind both |
| `@Suite("string-name", .serialized)` with SwiftFormat enabled | `@Suite(.serialized)` — type name carries test identity |
| 2-char variable names in tests (`pm`, `vm`) | ≥3 chars required by SwiftLint `identifier_name` |
| `try?` on `modelContext.fetch()` | `do/catch` with `os_log(.error)` |
| SwiftData store in default iCloud backup | `isExcludedFromBackup = true` in `App.init()` + scenePhase `.active` |

## Key References

- [App Store Review Guidelines: Health](https://developer.apple.com/app-store/review/guidelines/#health-and-health-research)
- [HealthKit Entitlement docs](https://developer.apple.com/documentation/healthkit/setting_up_healthkit)
- [Privacy Manifest docs](https://developer.apple.com/documentation/bundleresources/privacy_manifest_files)
- [StoreKit 2 documentation](https://developer.apple.com/documentation/storekit/in-app_purchase)
- [Xcode Cloud documentation](https://developer.apple.com/documentation/xcode/xcode-cloud)
