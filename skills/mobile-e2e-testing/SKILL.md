---
name: mobile-e2e-testing
description: Mobile E2E testing patterns with Maestro (YAML-based, recommended) and Detox for React Native. Device farms, camera/video test strategies, accessibility testing, and CI/CD integration. Use for automated mobile testing.
allowed-tools: Read, Grep, Glob
kb-sources:
  - wiki/software-engineering/mobile-e2e-testing
updated: 2026-06-15
---

# Mobile E2E Testing

## Framework Comparison

| Aspect | Maestro | Detox | Appium |
|--------|---------|-------|--------|
| Language | YAML | JavaScript/TS | Any (WebDriver) |
| Setup Time | Minutes | Hours | Hours |
| Flakiness | <1% | <2% | 5-10% |
| Speed (per flow) | 12-18s | 8-12s | 30-45s |
| App Modifications | None | Native hooks | None |
| Learning Curve | Low | Medium | High |
| WebView Support | Limited | Limited | Good |

Maestro is the emerging standard for React Native E2E testing. Expo officially recommends it for EAS workflows. Detox remains strong for teams needing programmatic JavaScript control and gray-box testing. Appium serves cross-platform and multi-framework scenarios.

## Testing Pyramid

- 70% Unit tests (Jest) -- pure functions, hooks, utilities
- 20% Component tests (React Native Testing Library) -- user interactions
- 10% E2E tests (Maestro or Detox) -- critical user journeys only

## Camera and Video Testing

Camera feed injection is not natively supported by Maestro or Detox. Permission granting and denying can be tested directly. Actual camera input mocking requires device farm integration (BrowserStack Camera Image Injection, Sauce Labs) or app-level mock layers.

## Local E2E Environment Gotchas

Three traps that surface when running E2E tests locally against a dev server:

1. **CORS origin mismatch:** CORS allowlists with a `localhost` regex carve-out reject the `127.0.0.1` origin. Drive the browser or Playwright via `localhost:<port>`, not `127.0.0.1`.
2. **Multi-worktree port conflict:** In multi-worktree setups, boot a second dev server on an alternate port pointed at the shared backend (`PORT=3001 npm run dev`) to E2E the current branch when another worktree already holds the default port.
3. **Dev server teardown:** A broad process-name kill (`pkill -f "<framework>.*dev"`) clobbers sibling worktrees' dev servers; tear down by port instead (`lsof -ti tcp:PORT | xargs kill`).

See `reference.md → Local E2E Environment Gotchas` for detailed examples.

## Further Reference

- `reference.md` -- setup guides, local E2E gotchas, device farm comparison, accessibility patterns, anti-patterns
- `examples.md` -- production-ready Maestro YAML, Detox TypeScript, Jest component tests, CI workflows
