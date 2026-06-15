# Angular QA Reference

Detailed QA validation patterns for Angular 21+.

## Web Codegen Scorer Deep Dive

### Running the Scorer

```bash
# Install
npm install -D web-codegen-scorer

# Score single component
npx web-codegen-scorer ./src/app/components/dashboard/

# Score entire feature
npx web-codegen-scorer ./src/app/features/analytics/ --recursive

# JSON output for CI
npx web-codegen-scorer ./src/app/ --format json > qa-report.json
```

### Score Categories

| Category | Weight | Checks |
|----------|--------|--------|
| **Correctness** | 30% | Type safety, runtime errors, logic bugs |
| **Best Practices** | 25% | Angular patterns, signal usage, DI |
| **Accessibility** | 20% | ARIA, keyboard, focus management |
| **Performance** | 15% | Change detection, bundle impact |
| **Maintainability** | 10% | Code structure, naming, documentation |

### Interpreting Results

```json
{
  "overall": 0.78,
  "categories": {
    "correctness": 0.85,
    "bestPractices": 0.72,
    "accessibility": 0.80,
    "performance": 0.75,
    "maintainability": 0.70
  },
  "issues": [
    {
      "severity": "warning",
      "category": "bestPractices",
      "message": "Consider using input.required() instead of input() with non-null assertion",
      "file": "user-card.component.ts",
      "line": 15
    }
  ]
}
```

## Signal Reactivity Validation

### Common Signal Bugs

```typescript
// BUG: Mutating signal value directly
items().push(newItem); // Wrong - doesn't trigger updates
items.update(arr => [...arr, newItem]); // Correct

// BUG: Side effect in computed
computed(() => {
  this.logger.log('computed'); // Wrong - side effect
  return this.value() * 2;
});

// BUG: Missing cleanup
effect(() => {
  const sub = this.stream$.subscribe();
  // Missing: return () => sub.unsubscribe();
});

// BUG: Calling set inside computed
computed(() => {
  if (this.value() > 10) {
    this.exceeded.set(true); // Wrong - set in computed
  }
  return this.value();
});
```

### Signal Testing Checklist

```typescript
// Verify signal updates propagate correctly
describe('Signal Reactivity', () => {
  it('should update computed when dependency changes', () => {
    component.baseValue.set(10);
    TestBed.flushEffects();

    expect(component.derivedValue()).toBe(20); // 10 * 2
  });

  it('should trigger effect on signal change', () => {
    const spy = vi.spyOn(component, 'onValueChange');

    component.value.set(42);
    TestBed.flushEffects();

    expect(spy).toHaveBeenCalledWith(42);
  });

  it('should cleanup subscriptions on destroy', () => {
    const fixture = TestBed.createComponent(MyComponent);
    const component = fixture.componentInstance;

    fixture.destroy();

    // Verify no memory leaks
    expect(component['subscription']?.closed).toBe(true);
  });
});
```

## Accessibility Validation

### axe-core Integration

```typescript
// playwright.config.ts
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('Accessibility', () => {
  test('page should have no accessibility violations', async ({ page }) => {
    await page.goto('/dashboard');

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('modal should trap focus', async ({ page }) => {
    await page.goto('/dashboard');
    await page.click('[data-testid="open-modal"]');

    // Tab through modal
    await page.keyboard.press('Tab');
    const firstFocused = await page.locator(':focus').getAttribute('data-testid');

    // Tab to end and wrap
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Tab');
    }

    const wrappedFocus = await page.locator(':focus').getAttribute('data-testid');
    expect(wrappedFocus).toBe(firstFocused); // Focus trapped
  });
});
```

### Manual Accessibility Checklist

| Check | Method | Pass Criteria |
|-------|--------|---------------|
| Keyboard navigation | Tab through page | All interactive elements reachable |
| Focus visible | Tab through page | Clear focus indicator on every element |
| Screen reader | Use NVDA/VoiceOver | All content announced meaningfully |
| Color contrast | Browser DevTools | 4.5:1 for text, 3:1 for large text |
| Motion | prefers-reduced-motion | Animations respect preference |
| Zoom | 200% browser zoom | No content overlap or loss |

## Visual Regression Testing

### Playwright Screenshot Comparison

```typescript
// visual.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('dashboard should match baseline', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Hide dynamic content
    await page.evaluate(() => {
      document.querySelectorAll('[data-testid="timestamp"]')
        .forEach(el => el.textContent = '2025-01-01');
    });

    await expect(page).toHaveScreenshot('dashboard.png', {
      maxDiffPixels: 100,
      threshold: 0.1
    });
  });

  test('dark mode should match baseline', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/dashboard');

    await expect(page).toHaveScreenshot('dashboard-dark.png');
  });

  test('mobile layout should match baseline', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');

    await expect(page).toHaveScreenshot('dashboard-mobile.png');
  });
});
```

### Handling Dynamic Content

```typescript
// Mask dynamic areas
await expect(page).toHaveScreenshot('page.png', {
  mask: [
    page.locator('[data-testid="chart"]'),
    page.locator('[data-testid="avatar"]')
  ]
});

// Freeze animations
await page.evaluate(() => {
  document.body.style.setProperty('--animation-duration', '0s');
});
```

## Cross-Browser Testing Matrix

### Playwright Configuration

```typescript
// playwright.config.ts
export default defineConfig({
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 12'] } },
  ]
});
```

### Browser-Specific Issues to Check

| Browser | Known Issues | Validation |
|---------|--------------|------------|
| Safari | Date input, flexbox gaps | Test forms, layouts |
| Firefox | focus-visible behavior | Check focus indicators |
| Mobile Safari | 100vh viewport | Test full-height elements |
| Edge | Clipboard API differences | Test copy/paste features |

## CI/CD Integration

### GitHub Actions QA Pipeline

```yaml
# .github/workflows/qa.yml
name: QA Validation

on: [pull_request]

jobs:
  qa:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Run Web Codegen Scorer
        run: |
          npx web-codegen-scorer ./src/app/ --format json > scorer-report.json
          SCORE=$(jq '.overall' scorer-report.json)
          if (( $(echo "$SCORE < 0.7" | bc -l) )); then
            echo "Score $SCORE below threshold 0.7"
            exit 1
          fi

      - name: Run axe-core
        run: npx playwright test --grep @accessibility

      - name: Visual regression
        run: npx playwright test --grep @visual

      - name: Upload reports
        uses: actions/upload-artifact@v4
        with:
          name: qa-reports
          path: |
            scorer-report.json
            playwright-report/
```
