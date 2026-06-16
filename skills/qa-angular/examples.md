# Angular QA Examples

Complete QA artifacts for Angular 21+ review workflows.

## QA Review Report Template

```markdown
# QA Review Report

**Component:** DashboardMetricsComponent
**PR:** #234
**Reviewer:** QA Engineer
**Date:** 2025-01-15

## Summary

| Category | Status | Score |
|----------|--------|-------|
| Web Codegen Scorer | ✅ Pass | 0.82 |
| Accessibility (axe) | ⚠️ 2 warnings | - |
| Visual Regression | ✅ Pass | <1% diff |
| Signal Reactivity | ✅ Pass | - |
| Cross-Browser | ✅ Pass | Chrome, Firefox, Safari |

## Findings

### Critical (Block Merge)
None

### Warnings (Fix Before Production)

1. **A11y Warning: Missing aria-label on refresh button**
   - Location: `dashboard-metrics.component.html:45`
   - Fix: Add `aria-label="Refresh metrics data"`

2. **A11y Warning: Color contrast ratio 3.8:1 on muted text**
   - Location: `dashboard-metrics.component.scss:78`
   - Fix: Change `#999` to `#767676` for 4.5:1 ratio

### Observations (Nice to Have)

1. Consider adding loading skeleton instead of spinner
2. Chart could use `aria-describedby` for screen readers

## Test Evidence

- [x] Manual keyboard navigation tested
- [x] VoiceOver screen reader tested
- [x] 200% zoom tested
- [x] Dark mode visual check passed
- [x] Mobile viewport (375px) tested

## Recommendation

**Approve with conditions** - Fix 2 accessibility warnings before merge.
```

## Bug Report Template

```markdown
# Bug Report: Signal Update Not Triggering View

**Severity:** High
**Component:** UserListComponent
**Environment:** Angular 21.0.6, Chrome 120

## Description

When filtering users, the filtered list signal updates but the view doesn't refresh until another interaction occurs.

## Steps to Reproduce

1. Navigate to /users
2. Type "john" in the search filter
3. Observe: List doesn't update immediately
4. Click anywhere on page
5. Observe: List now shows filtered results

## Expected Behavior

List should update immediately when search term changes.

## Root Cause Analysis

```typescript
// PROBLEMATIC CODE
filteredUsers = computed(() => {
  const term = this.searchTerm();
  return this.users().filter(u => u.name.includes(term));
});

// Missing: The search input is using two-way binding outside zone
// ngModel doesn't trigger change detection in zoneless app
```

## Recommended Fix

```typescript
// Option 1: Use signal-based input
searchTerm = signal('');

// In template:
<input [value]="searchTerm()" (input)="searchTerm.set($event.target.value)">

// Option 2: If keeping ngModel, manually update
onSearchChange(value: string) {
  this.searchTerm.set(value);
}
```

## Verification Steps

1. Apply fix
2. Run: `npm test -- --grep "UserListComponent"`
3. Verify filtering works without extra clicks
4. Run visual regression to confirm no layout changes
```

## Test Matrix Template

```markdown
# Cross-Browser Test Matrix

**Feature:** Dashboard Analytics
**Version:** 1.2.0
**Date:** 2025-01-15

## Desktop Browsers

| Browser | Version | OS | Status | Notes |
|---------|---------|-----|--------|-------|
| Chrome | 120 | macOS 14 | ✅ Pass | - |
| Chrome | 120 | Windows 11 | ✅ Pass | - |
| Firefox | 121 | macOS 14 | ✅ Pass | - |
| Firefox | 121 | Windows 11 | ✅ Pass | - |
| Safari | 17.2 | macOS 14 | ✅ Pass | - |
| Edge | 120 | Windows 11 | ✅ Pass | - |

## Mobile Browsers

| Browser | Version | Device | Status | Notes |
|---------|---------|--------|--------|-------|
| Safari | 17 | iPhone 15 | ✅ Pass | - |
| Safari | 17 | iPad Pro | ✅ Pass | - |
| Chrome | 120 | Pixel 8 | ✅ Pass | - |
| Chrome | 120 | Galaxy S23 | ✅ Pass | - |

## Test Cases Executed

| Test Case | Chrome | Firefox | Safari | Mobile |
|-----------|--------|---------|--------|--------|
| Page load | ✅ | ✅ | ✅ | ✅ |
| Chart rendering | ✅ | ✅ | ✅ | ✅ |
| Date filter | ✅ | ✅ | ✅ | ✅ |
| Export CSV | ✅ | ✅ | ✅ | ✅ |
| Keyboard nav | ✅ | ✅ | ✅ | N/A |
| Touch gestures | N/A | N/A | N/A | ✅ |

## Known Issues

None identified in this release.
```

## Accessibility Audit Report

```markdown
# Accessibility Audit Report

**Page:** Dashboard
**Standard:** WCAG 2.1 AA
**Tool:** axe-core 4.8 + Manual Testing
**Date:** 2025-01-15

## Automated Scan Results

| Rule | Impact | Occurrences | Status |
|------|--------|-------------|--------|
| color-contrast | Serious | 0 | ✅ Pass |
| button-name | Critical | 0 | ✅ Pass |
| image-alt | Critical | 0 | ✅ Pass |
| label | Critical | 0 | ✅ Pass |
| link-name | Serious | 0 | ✅ Pass |
| aria-roles | Critical | 0 | ✅ Pass |

**Total Violations:** 0
**Total Warnings:** 2

### Warnings

1. **region**: Some page content not contained in landmarks
   - Location: Footer social links
   - Recommendation: Wrap in `<nav aria-label="Social">`

2. **heading-order**: Heading level skipped
   - Location: Sidebar widget uses h4 after h2
   - Recommendation: Use h3 or adjust hierarchy

## Manual Testing Results

### Keyboard Navigation

| Area | Tab Order | Enter/Space | Escape | Arrows | Status |
|------|-----------|-------------|--------|--------|--------|
| Header nav | ✅ | ✅ | N/A | N/A | Pass |
| Search | ✅ | ✅ | ✅ clears | N/A | Pass |
| Data table | ✅ | ✅ | N/A | ✅ rows | Pass |
| Modal | ✅ | ✅ | ✅ closes | N/A | Pass |
| Dropdown | ✅ | ✅ | ✅ closes | ✅ options | Pass |

### Screen Reader Testing (VoiceOver)

| Element | Announced As | Expected | Status |
|---------|--------------|----------|--------|
| Logo link | "Acme Corp, link" | ✅ | Pass |
| Search input | "Search conversations, edit text" | ✅ | Pass |
| Metrics card | "Revenue, $45,230, increased 12%" | ✅ | Pass |
| Data table | "Conversations table, 25 rows" | ✅ | Pass |
| Sort button | "Sort by date, button, ascending" | ✅ | Pass |

### Focus Management

| Scenario | Expected Behavior | Actual | Status |
|----------|-------------------|--------|--------|
| Modal open | Focus moves to first focusable | ✅ | Pass |
| Modal close | Focus returns to trigger | ✅ | Pass |
| Dialog confirm | Focus moves to next logical element | ✅ | Pass |
| Page navigation | Focus moves to main content | ✅ | Pass |

## Recommendations

1. **Low Priority:** Add skip link for keyboard users
2. **Medium Priority:** Fix heading hierarchy in sidebar
3. **Low Priority:** Wrap footer links in landmark

## Certification

This page meets WCAG 2.1 AA requirements with minor recommendations noted above.
```

## AI Code Quality Review

```markdown
# AI-Generated Code Review

**Component:** ConversationListComponent
**Generation Tool:** Claude + Angular CLI MCP
**Scorer Version:** 1.2.0

## Web Codegen Scorer Results

```json
{
  "overall": 0.78,
  "categories": {
    "correctness": 0.85,
    "bestPractices": 0.72,
    "accessibility": 0.82,
    "performance": 0.75,
    "maintainability": 0.70
  }
}
```

## Issues Found

### Must Fix (Before Merge)

1. **Missing takeUntilDestroyed()**
   ```typescript
   // Generated (problematic)
   ngOnInit() {
     this.conversationService.getConversations()
       .subscribe(data => this.conversations.set(data));
   }

   // Required fix
   private destroyRef = inject(DestroyRef);

   ngOnInit() {
     this.conversationService.getConversations()
       .pipe(takeUntilDestroyed(this.destroyRef))
       .subscribe(data => this.conversations.set(data));
   }
   ```

2. **Using deprecated @Input() decorator**
   ```typescript
   // Generated
   @Input() userId: string;

   // Should be
   userId = input.required<string>();
   ```

### Should Fix (Technical Debt)

3. **Inline styles instead of CSS classes**
   - 3 instances of inline `style` bindings
   - Move to component styles

4. **Missing error handling**
   - HTTP calls don't handle error case
   - Add error signal and display

### Observations

5. Signal usage is correct for state management
6. Change detection should work properly in zoneless
7. Template syntax uses new control flow correctly

## Verdict

**Needs Revision** - Fix issues #1 and #2 before merge. Issues #3-4 can be addressed in follow-up PR.
```

## Pre-Release QA Checklist

```markdown
# Pre-Release QA Checklist

**Release:** v2.1.0
**Date:** 2025-01-20
**QA Lead:** [Name]

## Automated Checks

- [x] All unit tests passing (coverage: 87%)
- [x] All E2E tests passing
- [x] Web Codegen Scorer > 0.7 for new components
- [x] axe-core: 0 critical/serious violations
- [x] Visual regression: All screenshots match baseline
- [x] Bundle size: 48KB (under 50KB limit)
- [x] Lighthouse Performance: 92/100

## Manual Testing

- [x] New user signup flow
- [x] Existing user login
- [x] Dashboard metrics display
- [x] Conversation list pagination
- [x] Real-time message updates
- [x] Widget configuration changes
- [x] Export functionality

## Cross-Browser

- [x] Chrome 120 (Windows, macOS)
- [x] Firefox 121 (Windows, macOS)
- [x] Safari 17.2 (macOS)
- [x] Edge 120 (Windows)
- [x] Mobile Safari (iOS 17)
- [x] Mobile Chrome (Android 14)

## Accessibility

- [x] Keyboard-only navigation complete
- [x] Screen reader testing (VoiceOver, NVDA)
- [x] Color contrast verified
- [x] Focus indicators visible
- [x] Error messages accessible

## Performance

- [x] Initial load < 2s on 3G
- [x] Time to interactive < 3s
- [x] No memory leaks (30min soak test)
- [x] WebSocket reconnection works

## Security

- [x] No console errors/warnings
- [x] No exposed API keys
- [x] XSS protection verified
- [x] CSRF tokens present

## Sign-off

| Role | Name | Date | Approved |
|------|------|------|----------|
| QA Lead | | | ☐ |
| Dev Lead | | | ☐ |
| Product | | | ☐ |

## Release Decision

- [ ] **GO** - Release approved
- [ ] **NO-GO** - Issues listed below

### Blocking Issues (if NO-GO)

None
```
