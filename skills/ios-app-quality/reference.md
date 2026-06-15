# iOS App Quality — Reference

## Privacy Manifest (PrivacyInfo.xcprivacy)

Required since iOS 17. Declares what data your app collects and why. For health apps:

- `NSPrivacyTracking`: `false` (no tracking)
- `NSPrivacyCollectedDataTypes`: Declare `NSPrivacyCollectedDataTypeHealthData`
  - `NSPrivacyCollectedDataTypeLinked`: `false` (not linked to identity)
  - `NSPrivacyCollectedDataTypeTracking`: `false` (not used for tracking)
  - `NSPrivacyCollectedDataTypePurposes`: `NSPrivacyCollectedDataTypePurposeAppFunctionality`
- `NSPrivacyAccessedAPITypes`: Empty array if no restricted APIs used

Omitting this manifest risks App Store rejection.

### NSPrivacyAccessedAPITypes for SwiftData apps

SwiftData apps should declare:

- `NSPrivacyAccessedAPICategoryFileTimestamp` (reason code `C617.1`)
- `NSPrivacyAccessedAPICategoryDiskSpace` (reason code `E174.1`)

Run Xcode Privacy Report (`Product > Generate Privacy Report` on the archive) on both iOS and watchOS schemes, and against devices with existing data to capture migration-path API access. Audit UserDefaults reason codes carefully — `CA92.1` ("customizable settings") vs `1C8F.1` ("only accessible to your app") depends on actual usage pattern. Mismatched reason codes are an App Store rejection vector.

The Xcode Privacy Report workflow:

1. Archive both iOS and watchOS schemes (Release configuration).
2. In Organizer, select the archive → `Generate Privacy Report`.
3. Run on a device with existing SwiftData stores so migration code paths exercise restricted APIs.
4. Compare report output against your manifest declarations — any mismatch is an automatic reject.

## App Store Review Checklist (Health Apps)

Pre-submission checklist for health apps — reviewer scrutiny is heightened for this category:

- No diagnostic or medical claims in app or marketing
- HealthKit usage description strings are clear and accurate
- Privacy policy URL in App Store Connect
- PrivacyInfo.xcprivacy manifest included
- Health data entitlement in provisioning profile
- Graceful handling when HealthKit permission denied
- App functions meaningfully without health data access
- No off-device transmission of health data (or clear disclosure)
- Age rating appropriate (no medical category unless warranted)
- Wellness category (not Medical) unless clinically validated

## Performance Profiling (Instruments)

### Energy Log
Monitor battery impact during workout sessions. Target less than 10% battery per hour during active sessions. Watch for unintended GPS usage and excessive CPU wakeups.

### Allocations
Track memory during long sessions. watchOS budget is approximately 30MB usable. Watch for growing arrays of heart rate samples — use ring buffers instead.

### Time Profiler
Identify main thread blocking. Target zero hangs exceeding 250ms. Watch for synchronous HealthKit calls that should be async.

### Animation Hitches
Measure breathing animation smoothness. Target zero hitches exceeding 33ms (60fps) or 8ms (120fps). Watch for expensive view body recomputation triggering unnecessary layout passes.

## Multi-Target Build (iOS + watchOS)

### Project Structure

Recommended layout for iOS + watchOS apps:
- `MyApp/` — iOS app target (App.swift, Views/)
- `MyAppWatch/` — watchOS app target (App.swift, Views/)
- `Shared/` — Shared framework (Models/, Services/, HealthKit/)
- `Tests/` — `MyAppTests/` for iOS tests, `SharedTests/` for shared logic tests

### Key Principles
- Shared framework contains all business logic and data models
- Each app target has platform-specific views only
- Tests target shared logic to maximize coverage across platforms

### SourceKit Diagnostic Reliability in Multi-Target Projects

SourceKit cross-compilation-unit errors ("Cannot find type X in scope", "No such module") are frequently stale in multi-target Xcode projects, especially when `Shared/` sources are compiled into both iOS and watchOS targets via `project.yml` source inclusion (xcodegen). Swift Testing's `import Testing` is particularly prone to false "No such module" errors because the Testing module is conditionally available per target.

Diagnostic protocol: verify with `xcodebuild build` before investigating SourceKit errors. If the build succeeds, the diagnostics are phantom — restart SourceKit (`File > Packages > Reset Package Caches` or kill `sourcekit-lsp`) rather than chasing the error. Editing imports or shuffling files to "fix" SourceKit when the build is clean wastes time and can introduce real regressions.

## CI/CD & Code Signing

### HealthKit Entitlement Setup
HealthKit requires an explicit App ID (no wildcard). Enable HealthKit capability in Xcode Signing & Capabilities, which auto-configures the provisioning profile. The entitlements file declares `com.apple.developer.healthkit` and optionally `health-records` access.

### Xcode Cloud Workflow
Configure in Xcode Cloud settings:
1. Start condition: Push to main
2. Environment: Latest Xcode, Latest macOS
3. Actions: Build (iOS + watchOS targets), Test (SharedTests, AppTests), Archive, Deploy to TestFlight (internal testers)

### Fastlane Match (Team Signing)
Use Fastlane match with a private git repository for certificate storage. Configure `Matchfile` with `git_url`, `type("appstore")`, and app identifiers for both iOS and watchOS targets. Create a lane that runs `match`, `build_app`, and `upload_to_testflight` in sequence.

## StoreKit 2

### Loading Products
Use `Product.products(for:)` with an array of product identifiers. Returns `[Product]` that can be displayed to the user.

### Checking Subscriptions
Iterate `Transaction.currentEntitlements` to find verified auto-renewable transactions without revocation dates.

### Purchasing
Call `product.purchase()` which returns a `PurchaseResult`. Handle `.success` (verify and finish transaction), `.userCancelled`, `.pending`, and `@unknown default`. Calling `transaction.finish()` after verification is required — unfinished transactions are redelivered indefinitely through `Transaction.updates` until they are finished.

### StoreKit Testing
Create a `.storekit` configuration file in Xcode for local testing without App Store Connect. Supports subscription renewals, cancellations, and grace periods in the simulator. No App Store Connect setup required for development.

## Design Wireframe Validation

Two-pass review process for design tickets targeting iOS/watchOS.

### Pass 1 — Ticket Validation (before design work)

- Fidelity explicitly stated: "annotated wireframes" (layout + token refs + notes, ~10h) vs "high-fidelity mockups" (pixel-perfect branded screens, ~16h)
- Effort estimate matches fidelity level
- Reduce Motion alternatives specified for animated elements

### Pass 2 — Artifact Review (after wireframes generated)

HIG measurements to verify on every screen:

- **Dynamic Island clearance**: ~59pt top safe area on Dynamic Island devices (iPhone 14 Pro and later). Content placed under the island will be occluded.
- **Home indicator safe area**: ~34pt bottom inset on home-indicator devices (iPhone X and later). Touch targets here will steal swipe-up gestures.
- **Minimum touch targets**: 44x44pt (HIG hard requirement). Smaller targets fail accessibility audits and reviewer rejection patterns.
- **Tab bar height**: 49pt standard (compact) / 83pt with safe area on home-indicator devices.
- **watchOS 46mm**: 30pt status bar reserved at top, Digital Crown clearance on the right edge, **13pt minimum body text** (anything smaller is illegible at arm's length).
- All font tokens validated against HIG minimums per platform — watchOS body minimum is 13pt; iOS body minimum is 11pt for caption2 but 17pt for body.

Pass 2 is a hard gate — wireframes that fail HIG measurements should bounce back to design before any implementation begins.

## Pre-Sprint Setup Items

### PrivacyInfo.xcprivacy Build Phase Placement

The privacy manifest file needs to be in the Copy Bundle Resources build phase (via xcodegen `resources:` key or Xcode target membership checkbox). Simply having the file in the project directory is not sufficient — it won't be included in the app bundle. Without it, App Store validation silently rejects the submission with no useful error message; the rejection email arrives a day later citing "missing privacy manifest" without pointing at the build phase.

Verify by inspecting the built `.app` bundle: `find $BUILT_PRODUCTS_DIR -name PrivacyInfo.xcprivacy` should return one path per target.

### increased-memory-limit Entitlement

The `com.apple.developer.kernel.increased-memory-limit` entitlement is not self-service. Apple requires written justification (model name, parameter count, expected runtime memory) and takes 1-3 business days for approval. Without it, loading large models (e.g., MLX ~2GB for Qwen 1.5B 4-bit) silently fails under memory pressure, falling back to pre-authored content with no crash log — the OS jetsam kills the process before any logging can fire. Applying on day one of the sprint avoids blocking model integration in week 2 or 3.

### watchOS WKBackgroundModes

The `workout-processing` background mode is required in **watchOS Info.plist** for `HKWorkoutSession` to continue running when the user lowers their wrist. This is distinct from iOS `UIBackgroundModes` — the watchOS plist key is `WKBackgroundModes` and the array value is `workout-processing`. Without it, the session terminates when the wrist goes down, which is a critical failure for breathing/workout apps where the user can't watch the screen during the session.

## Font Bundling

### Custom Fonts on iOS

Custom fonts require three pieces:

1. **TTF files** placed in `Resources/Fonts/` (or any group included in the Copy Bundle Resources build phase).
2. **`UIAppFonts` array** in Info.plist listing the **filenames** (e.g., `MyFont-Regular.ttf`), not the PostScript names.
3. **PostScript name verification** — the value passed to `Font.custom("Name", size:)` is the PostScript name from the TTF metadata, not the filename. Verify with `fc-scan --format '%{postscriptname}\n' Font.ttf` or Python `fonttools` (`TTFont(path)['name'].getBestFullName()`).

Filename and PostScript name routinely differ (`Inter-Regular.ttf` vs `Inter-Regular`). Using the wrong name silently falls back to system font without any warning.

### License Bundling (SIL OFL 1.1)

SIL OFL 1.1 fonts (Inter, Source Sans 3, IBM Plex, etc.) require the license text bundled with the TTFs for App Store distribution. Place `OFL.txt` next to the TTF files in `Resources/Fonts/` so it ships in the app bundle. App Review checks for missing licenses in periodic sweeps.

### Supply Chain Verification

Compute SHA-256 checksums of bundled TTFs and check them into the repo (`fonts.sha256`) so a future font swap is auditable. This catches both intentional swaps (designer pushes a different weight without telling you) and CDN-side tampering when you re-download from upstream.

### Google Fonts CDN Discovery

Google Fonts GitHub repos do not always have TTFs at predictable paths. The CSS API (`https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700`) returns a CSS file with `@font-face` rules pointing at stable CDN URLs (`fonts.gstatic.com/s/...`). Curl the CSS, extract the URLs, download the TTFs locally — far more reliable than scraping the GitHub repo.

### watchOS Limitation

watchOS does not support custom font registration. `UIAppFonts` is ignored, and `Font.custom()` silently falls back. `Font.system()` with weight/design parameters is the only option. Design wireframes must use system fonts on the watchOS surface; do not try to match brand fonts there.

## Swift Testing Conventions (SwiftLint + SwiftFormat)

Two pre-commit blockers specific to Swift Testing in projects with both SwiftLint and SwiftFormat enabled.

### `@Suite(.serialized)` not `@Suite("string-name", .serialized)`

The `swiftTestingTestCaseNames` SwiftFormat rule rejects string-named suites. The Swift Testing convention is that the type name carries test identity; the string label is redundant and SwiftFormat will rewrite it on the next pre-commit run, polluting the diff. Check local convention with:

```bash
grep "@Suite" Tests/**/*.swift
```

If existing suites use `@Suite(.serialized)` (no string), follow the convention. If a single suite uses a string name, it's almost certainly drift that hasn't been caught yet — match the majority pattern.

### `identifier_name` ≥3 chars

SwiftLint's default `identifier_name` rule rejects identifiers shorter than 3 characters. Common offenders in test helpers:

- `pm` → `mgr` or `manager`
- `vm` → `viewModel`
- `id` → `itemID` or `recordID`
- `db` → `database`

Loop variables in tight test scopes feel naturally short, but the rule applies uniformly. Either rename or `// swiftlint:disable:next identifier_name` for a single line — never `// swiftlint:disable identifier_name` at file scope.

### `type_body_length` and Suite Splitting

When a `@Suite` struct exceeds SwiftLint's 250-line `type_body_length` default, do **not** disable the rule. Split into multiple `@Suite` structs by domain — e.g., `BreathingSessionPhaseTests`, `BreathingSessionHeartRateTests`, `BreathingSessionPersistenceTests` — with shared helpers promoted to file-scope `private` functions. The split improves test discoverability in the Xcode test navigator and reduces merge conflicts when multiple PRs touch tests.

## git add -f for Gitignored Sprint Folders

When sprint/ticket folders are gitignored at the project level (per AIEE hub convention), use `git add -f sprint/path/to/ticket.md` to capture implementation notes inline with the PR. Document the force-add in the PR description so reviewers don't bounce on the unexpected staged path. The `-f` flag bypasses the ignore rule for that specific file only — it does not permanently change the ignore pattern or affect other files in the folder.
