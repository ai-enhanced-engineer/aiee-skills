# Mobile E2E Testing Reference

## Maestro Setup and Usage

Maestro (CLI 2.3.0, 12.9k GitHub stars) uses YAML-based test flows with less than 1% flakiness in production. Requires Java 17+.

**Installation:**
```bash
curl -fsSL https://get.maestro.mobile.dev | bash
```

**Project structure:** Create a `.maestro/` directory at the project root containing YAML flow files.

**Running tests:**
```bash
maestro test .maestro/                    # All flows
maestro test .maestro/login-flow.yaml     # Single flow
```

**Core commands:**

| Command | Description |
|---------|-------------|
| `launchApp` | Launch the app (supports `appId`, `permissions` config) |
| `tapOn` | Tap element by text, testID, or accessibility label |
| `inputText` | Type text into the focused field |
| `assertVisible` / `assertNotVisible` | Assert element visibility |
| `scroll` / `scrollUntilVisible` | Scroll gestures |
| `swipe` | Directional swipe with start/end coordinates |
| `waitForAnimationToEnd` | Wait for animations to settle |
| `back` | Press the back button |
| `runFlow` | Execute a sub-flow, supports conditional `when` clause |
| `evalScript` | Inject JavaScript for complex logic |

**Environment variables** are supported via `env:` block at the top of a flow file, referenced as `${VAR_NAME}`.

**Conditional flows** use `runFlow` with a `when: { visible: "..." }` guard to handle optional UI states like cookie banners or onboarding screens.

**Limitations:** No native camera video injection, limited WebView support (use `evalScript` workaround), no built-in network mocking, iOS testing requires macOS locally (Maestro Cloud removes this constraint).

---

## Detox Setup and Usage

Detox (v20.48.1, 11.9k stars) is a gray-box testing framework by Wix that synchronizes with React Native's internal state. Supports RN 0.77-0.83.

**Setup** requires native build hooks and Jest configuration. Tests are written in JavaScript or TypeScript using async/await patterns with Detox's element matching API.

**Key matchers:**
- `by.id('testID')` -- match by testID prop
- `by.text('visible text')` -- match by displayed text
- `by.label('accessibility label')` -- match by accessibility label

**Key actions:** `tap()`, `typeText()`, `scroll()`, `swipe()`, `longPress()`

**Key assertions:** `toBeVisible()`, `toExist()`, `toHaveText()`, `toHaveAccessibilityLabel()`

**Gray-box advantages:** Detox synchronizes with React Native's bridge, waiting automatically for animations, network requests, and async operations to complete before proceeding. This reduces flakiness compared to black-box approaches.

**When Detox fits better than Maestro:**
- Teams with strong TypeScript expertise wanting tests in the same language as app code
- Scenarios requiring complex API mocking via Jest
- Need for programmatic test generation
- Existing Detox infrastructure investment
- Fastest possible per-test execution (8-12s vs Maestro's 12-18s)

---

## Appium 2.x

Appium uses the W3C WebDriver protocol with a modular driver system. Install only needed drivers (`uiautomator2` for Android, `xcuitest` for iOS).

**When Appium is appropriate:**
- Multi-framework projects (React Native + Flutter + native)
- Testing apps you do not control (third-party)
- Regulatory compliance requiring WebDriver protocol
- WebView-heavy applications (better WebView support than Detox)
- Enterprise device farm compatibility (universal support)

Execution speed is 30-45s per flow, making it the slowest of the three frameworks but the most broadly compatible.

---

## Device Farms Comparison

| Feature | Firebase Test Lab | AWS Device Farm | BrowserStack | Maestro Cloud |
|---------|-------------------|-----------------|--------------|---------------|
| Pricing | Per-minute ($1-5/hr) | Per-minute (~$0.17/min) | Per-parallel ($199/mo+) | Per-device ($250/mo) |
| Free Tier | 10 virtual/5 physical per day | 250 min/month | 100 min trial | 7-day trial |
| Camera Injection | Limited | Limited | Yes | No |
| Maestro Native | No | No | No | Yes |
| Appium Support | Yes | Yes | Yes | No |
| RN Specific | No | No | Guides available | Yes |

**Selection guidance:**
- Local emulator/simulator for development and debugging
- Local + selective cloud for PR checks
- Device farm with real devices for release testing
- Device farm required for camera/sensor testing
- Real devices preferred for performance and accessibility testing

**Emulator vs real device split:** 70% emulator (development, CI) and 30% real devices (release testing) balances cost against fidelity.

---

## Camera and Video Testing Strategies

**Permission testing** is supported natively in Maestro via `launchApp: { permissions: { camera: grant|deny } }` and in Detox via `device.launchApp({ permissions: { camera: 'YES'|'NO' } })`.

**Camera feed injection** requires device farm services:
- BrowserStack: `browserstack.cameraImageInjection` capability injects static images when the app accesses the camera
- Sauce Labs: `sauce:inject-image` command with base64-encoded image data
- Custom injection via GraalVM/JavaScript for complex scenarios

**App-level camera mocks** are an alternative: build a mock camera provider that serves pre-recorded frames in test builds, toggled via environment variable or build configuration.

**Video recording/playback testing:** Mock the camera feed, trigger recording, verify save completion, then test playback controls (play, pause, seek) and validate video metadata through API calls.

---

## Accessibility Testing

**iOS (VoiceOver):** BrowserStack App Accessibility simulates VoiceOver narration, validates spoken order and focus sequence. Manual testing with Accessibility Inspector for element inspection.

**Android (TalkBack):** Google Accessibility Scanner detects unlabeled elements and focus order issues. GPT Driver provides AI-powered WCAG analysis.

**Audit tools:** axe DevTools Mobile (both platforms, WCAG compliance), BrowserStack Accessibility (VoiceOver/TalkBack simulation), Accessibility Inspector (iOS manual), Accessibility Scanner (Android semi-automated).

**WCAG mobile checklist:**
- All interactive elements have accessibility labels
- Color contrast >= 4.5:1 (text), >= 3:1 (UI components)
- Touch targets >= 44x44 pt (iOS) / 48x48 dp (Android)
- Focus order matches visual order
- Screen reader announces all content
- No content relies solely on color
- Error messages are accessible

**In Detox**, accessibility attributes are verifiable directly:
```typescript
await expect(element(by.id('submit-btn'))).toHaveAccessibilityLabel('Submit form');
await expect(element(by.id('header'))).toHaveAccessibilityRole('header');
```

---

## Performance Testing

**Startup time:** Target under 2-3 seconds cold start. Measure with CI gates that fail builds exceeding thresholds.

**Frame rate:** Target 60 FPS (16ms/frame) or 90 FPS on 90Hz displays. Flashlight (`@perf-profiler/profiler`) integrates with Maestro for automated measurement.

**Memory profiling:** Use `adb shell dumpsys meminfo` on Android before and after test flows. Use Instruments with Leaks template on iOS.

**Network simulation:** Charles Proxy, BrowserStack built-in throttling, Network Link Conditioner (iOS), `adb emu network speed` (Android emulator).

---

## Unit and Integration Testing (Jest + RNTL)

Jest 30 with React Native Testing Library forms the foundation of the testing pyramid (70% unit, 20% component).

**Configuration** uses the `react-native` preset with `@testing-library/jest-native/extend-expect` for custom matchers. Transform ignore patterns must exclude React Native and navigation packages.

**Component testing** uses `render`, `fireEvent`, `waitFor` from RNTL. Prefer querying by text, accessibility label, or role over testID.

**Hook testing** uses `renderHook` and `act` from `@testing-library/react-hooks`.

**Navigation testing** wraps components in `NavigationContainer` with the appropriate navigator and screens.

**Snapshot testing** is not deprecated but should be used sparingly -- small UI components with stable output only. Prefer explicit assertions. Use `no-large-snapshots` ESLint rule.

---

## CI/CD Integration

**GitHub Actions + Maestro Cloud:** Use `mobile-dev-inc/action-maestro-cloud@v2.0.2` action. Requires `MAESTRO_API_KEY` and `MAESTRO_PROJECT_ID` secrets. Provide the built APK or .app file.

**Expo EAS + Maestro:** Configure an `e2e` build profile in `eas.json` with `buildType: "apk"` for Android and `simulator: true` for iOS. Chain EAS build output into Maestro Cloud action.

**Recommended CI pipeline structure:**
1. Unit tests (ubuntu, fast, gate all other jobs)
2. E2E Android (needs unit tests, ubuntu, Maestro Cloud)
3. E2E iOS (needs unit tests, macos-14, Maestro Cloud)

---

## Local E2E Environment Gotchas

Three related failure modes when driving E2E tests against a local dev server, particularly in multi-worktree or Next.js/Vite setups.

### 1. CORS Origin Mismatch: `localhost` vs `127.0.0.1`

CORS allowlists that include a `localhost` regex carve-out (e.g., `/^https?:\/\/localhost(:\d+)?$/`) reject requests from the `127.0.0.1` origin — they are not the same string. Playwright and some browser automation tools default to `127.0.0.1` when given an IP-style address.

**Fix:** Always drive the browser via `localhost:<port>` in your test base URL, not `127.0.0.1:<port>`. In Playwright config:

```typescript
// playwright.config.ts
export default defineConfig({
  use: {
    baseURL: 'http://localhost:3000',  // NOT http://127.0.0.1:3000
  },
});
```

**Detection:** E2E tests fail with CORS errors locally even though the browser-manual flow works at `localhost`. The failure disappears when you substitute `localhost` for `127.0.0.1` in the test URL.

### 2. Multi-Worktree Port Conflict

When two git worktrees of the same project are checked out simultaneously (common during feature branches, hotfix branches, or PR review), the default dev server port (e.g., 3000) is already occupied by the other worktree's server. The current branch's server either fails to start or binds to a random port silently.

**Fix:** Boot a second dev server on an alternate port, pointed at the shared backend (which is typically environment-variable-configured and can be shared):

```bash
# In worktree-2 (the current branch under test)
PORT=3001 npm run dev

# Playwright base URL for this worktree's E2E run
PLAYWRIGHT_BASE_URL=http://localhost:3001 npx playwright test
```

Configure `playwright.config.ts` to read `process.env.PLAYWRIGHT_BASE_URL` so the port is not hardcoded.

### 3. Dev Server Teardown: Kill by Port, Not by Process Name

After local E2E runs, stopping the dev server by process-name pattern with `pkill -f` is destructive in multi-worktree setups — the glob matches dev servers from sibling worktrees and kills them too.

```bash
# DANGEROUS in multi-worktree setups — kills ALL matching dev servers
pkill -f "next.*dev"
pkill -f "vite.*dev"

# SAFE — kills only the process on the specific port
lsof -ti tcp:3001 | xargs kill
```

In CI, process isolation makes `pkill` safe. Locally with multiple worktrees, always kill by port. Script teardown in `package.json` or `playwright.config.ts` global teardown using the `lsof` pattern.

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Testing implementation details | Test user-visible behavior and interactions |
| Large snapshot files | Small, focused snapshots for stable components only |
| `testID` on every element | Use accessibility queries (text, label, role) |
| Sleep-based waits (`setTimeout`) | Use `waitFor`, `assertVisible`, or framework sync |
| E2E tests for everything | Follow the testing pyramid (70/20/10) |
| No state isolation between tests | Reset app state before each test |
| Hardcoded test data | Use environment variables and test fixtures |
| Ignoring flaky tests | Fix root cause or quarantine immediately |
| No retry logic in CI | Use framework-level retry (Maestro `--retry`, Detox `--retries`) |
| Running all E2E on every PR | Parallelize and run selective suites based on changed files |
| No test timeout in CI | Set reasonable timeouts to prevent hanging pipelines |
| Skipping visual artifacts | Save screenshots and videos on failure for debugging |
| Testing library internals | Test the public API surface only |
| Driving browser via `127.0.0.1` when backend CORS allowlist uses `localhost` regex | Set `baseURL` to `http://localhost:<port>` — `127.0.0.1` and `localhost` are distinct CORS origins |
| Starting dev server on hardcoded default port in a multi-worktree repo | Boot on an alt port (`PORT=3001 npm run dev`) and set `PLAYWRIGHT_BASE_URL` accordingly |
| Stopping dev server with `pkill -f "<framework>.*dev"` locally | Kill by port: `lsof -ti tcp:PORT \| xargs kill` — broad pkill clobbers sibling worktrees' servers |
