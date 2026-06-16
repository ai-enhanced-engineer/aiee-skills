---
name: qa-angular
description: Angular 21+ QA validation patterns for code review, accessibility audits, visual regression, and AI-generated code quality. Use for reviewing Angular PRs, accessibility audits, signal reactivity validation, or validating AI-generated components.
kb-sources:
  - wiki/software-engineering/angular-testing
updated: 2026-05-21
---

# Angular QA Validation

QA patterns for Angular 21+ applications, with emphasis on AI-generated code quality.

## QA Focus Areas

| Area | Risk Level | Tools |
|------|------------|-------|
| **AI-Generated Code** | High (1.7x defect rate) | Web Codegen Scorer |
| **Signal Reactivity** | Medium | Manual + unit tests |
| **Accessibility** | High | axe-core + manual |
| **Visual Regression** | Medium | Playwright screenshots |
| **Cross-Browser** | Low-Medium | Playwright multi-browser |

## Quick QA Checklist

### Signal Component Review

- [ ] All `signal()` values have appropriate initial state
- [ ] `computed()` dependencies are minimal (no side effects)
- [ ] `effect()` has cleanup for subscriptions
- [ ] No `.subscribe()` without cleanup in `DestroyRef`
- [ ] `input.required()` used where prop is mandatory

### AI-Generated Code Issues

Common defects in AI-generated Angular (catch these first):

| Issue | Detection | Fix |
|-------|-----------|-----|
| Missing `DestroyRef` cleanup | Search for orphan subscriptions | Add `takeUntilDestroyed()` |
| Incorrect signal updates | `.set()` inside `computed()` | Move to `effect()` or handler |
| Zone.js assumptions | `NgZone.run()` calls | Remove for zoneless apps |
| Legacy patterns | `@Input()` decorator | Convert to `input()` function |
| Missing error boundaries | No `ErrorHandler` | Add custom error handler |

### Accessibility Audit

```bash
# Run axe-core (catches ~57% of WCAG issues)
npx axe --include '.app-root'

# Manual checks still required:
# - Keyboard navigation flow
# - Screen reader announcements
# - Focus management in modals
# - Color contrast in custom themes
```

## Web Codegen Scorer

For AI-generated Angular code, run the scorer before accepting:

```bash
# Score AI-generated component
npx web-codegen-scorer ./src/app/components/new-feature/

# Acceptable thresholds
# - Overall: > 0.7
# - Accessibility: > 0.8
# - Best Practices: > 0.75
```

## When to Escalate

| Finding | Action |
|---------|--------|
| Scorer < 0.7 | Return to engineer with specific issues |
| axe-core critical violations | Block merge, require fixes |
| Signal memory leak detected | Block merge, require cleanup |
| Visual regression > 5% diff | Review with designer |

## Lint & Code Review Patterns

- A strict-`no-explicit-any` Angular project (enforcing `@typescript-eslint/no-explicit-any` via pre-commit hooks) blocks `null as any` in specs. Instead, use `Object.defineProperty` for viewChild overrides and `{} as TypedParam` for route params.

## Accessibility: iframe & Dialog Patterns

### iframe Preview Checks
- WCAG 2.1.2 expects `tabindex="-1"` on read-only preview iframes to prevent keyboard traps
- `sandbox="allow-scripts allow-same-origin"` is required when loading CDN module scripts in srcdoc iframes — `allow-scripts` alone creates an opaque origin that blocks CORS

### Dialog ARIA Placement
- Placing `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` on the `.dialog-overlay` backdrop causes screen readers to announce the entire overlay as the dialog region (WCAG 4.1.2). These attributes belong on the `.dialog-panel` element (the one with `tabindex="-1"` and focus trap)
- Custom `<div>` dialogs should consider migration to native `<dialog>` with `showModal()` for proper inert behavior

### Focus Pseudo-Class
- `:focus-visible` avoids showing outline rings on mouse click, which `:focus` does — generally preferred for all interactive elements (buttons, inputs, textareas, selects)

For writing or structuring Angular tests (unit, integration, E2E), use `testing-angular` instead.

See `reference.md` for detailed patterns and `examples.md` for QA reports.
