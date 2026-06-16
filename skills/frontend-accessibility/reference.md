# Frontend Accessibility Reference

## WCAG 2.1 Level AA Success Criteria

### Perceivable

| Criterion | Requirement |
|-----------|-------------|
| **1.1.1 Non-text Content** | All images, icons have text alternatives |
| **1.2.1-5 Time-based Media** | Captions, audio descriptions for video |
| **1.3.1 Info and Relationships** | Semantic HTML, proper headings hierarchy |
| **1.3.2 Meaningful Sequence** | Reading order matches visual order |
| **1.3.3 Sensory Characteristics** | Don't rely solely on shape, size, location |
| **1.3.4 Orientation** | Support both portrait and landscape |
| **1.3.5 Identify Input Purpose** | Use autocomplete for common fields |
| **1.4.1 Use of Color** | Color not sole means of conveying info |
| **1.4.3 Contrast (Minimum)** | 4.5:1 for text, 3:1 for large text |
| **1.4.4 Resize Text** | 200% zoom without loss of content |
| **1.4.5 Images of Text** | Use real text, not images of text |
| **1.4.10 Reflow** | No horizontal scroll at 320px width |
| **1.4.11 Non-text Contrast** | 3:1 for UI components and graphics |
| **1.4.12 Text Spacing** | Content readable with increased spacing |
| **1.4.13 Content on Hover/Focus** | Dismissible, hoverable, persistent |

### Operable

| Criterion | Requirement |
|-----------|-------------|
| **2.1.1 Keyboard** | All functionality keyboard accessible |
| **2.1.2 No Keyboard Trap** | Focus can move away from any element |
| **2.1.4 Character Key Shortcuts** | Single-key shortcuts can be disabled |
| **2.2.1 Timing Adjustable** | Time limits can be extended |
| **2.2.2 Pause, Stop, Hide** | Moving content controllable |
| **2.3.1 Three Flashes** | No content flashes more than 3x/second |
| **2.4.1 Bypass Blocks** | Skip navigation links available |
| **2.4.2 Page Titled** | Pages have descriptive titles |
| **2.4.3 Focus Order** | Logical, predictable focus sequence |
| **2.4.4 Link Purpose** | Link text describes destination |
| **2.4.5 Multiple Ways** | Multiple ways to find pages |
| **2.4.6 Headings and Labels** | Descriptive headings and labels |
| **2.4.7 Focus Visible** | Keyboard focus indicator visible |

### Understandable

| Criterion | Requirement |
|-----------|-------------|
| **3.1.1 Language of Page** | Page lang attribute set |
| **3.1.2 Language of Parts** | Lang attribute on foreign text |
| **3.2.1 On Focus** | No context change on focus |
| **3.2.2 On Input** | No unexpected context change on input |
| **3.2.3 Consistent Navigation** | Navigation consistent across pages |
| **3.2.4 Consistent Identification** | Same function = same label |
| **3.3.1 Error Identification** | Errors clearly identified and described |
| **3.3.2 Labels or Instructions** | Form inputs have labels |
| **3.3.3 Error Suggestion** | Suggest corrections for errors |
| **3.3.4 Error Prevention** | Confirm, review, reversible for important actions |

### Robust

| Criterion | Requirement |
|-----------|-------------|
| **4.1.1 Parsing** | Valid HTML (no duplicate IDs) |
| **4.1.2 Name, Role, Value** | Custom controls have accessible name/role |
| **4.1.3 Status Messages** | Status updates announced without focus |

---

## Conditional Role and Testable Contract (WCAG 4.1.2)

### Conditional Role Tied to Accessible Name

A `role` attribute without a resolvable accessible name adds a nameless node to the accessibility tree. Screen readers announce "group" (or the landmark name) with no label — the node is noise at best and actively misleading at worst. ARIA spec requires every landmark and group to have an accessible name.

**Rule**: apply `role` only when a label is present:

```tsx
// aria-labelledby resolves to undefined when label is absent → nameless group
// Conditional role prevents the empty node
<div
  role={label ? "group" : undefined}
  aria-labelledby={label ? labelId : undefined}
>
  {children}
</div>
```

This applies to: `group`, `region`, all landmark roles (`navigation`, `complementary`, etc.) when their label is dynamic. Static landmarks with hard-coded `aria-label` are always safe.

**Axe-core rule**: `region` and `group` without an accessible name trigger `landmark-unique` and `aria-required-attr` respectively. Automated CI gates catch this.

### Testable Touch-Target Contract via `data-*` Attribute

jsdom (used by Jest/Vitest) does not compute rendered CSS geometry — `getBoundingClientRect()` always returns zeros. Testing that a button meets the 44 px touch-target requirement cannot rely on layout assertions.

**Pattern**: stamp a `data-wcag-touch-target` attribute on every interactive element that carries explicit 44 px sizing:

```tsx
<button
  type="button"
  className="min-h-[44px] min-w-[44px]"
  data-wcag-touch-target="44"
  onClick={handleClick}
>
  {label}
</button>
```

Test assertion (React Testing Library):

```ts
const btn = screen.getByRole('button', { name: /submit/i });
expect(btn).toHaveAttribute('data-wcag-touch-target', '44');
```

The attribute is a **structural contract** — it documents the intent and makes it machine-verifiable in unit tests. Visual regression tests or Playwright layout checks are the complementary layer for real rendering; this pattern fills the gap for fast unit test coverage.

**When to add**: any new interactive element where the visible area is smaller than 44 px (icon buttons, badge buttons, inline links) and explicit Tailwind sizing is applied to compensate.

---

## Testing Tools

### Automated Testing

| Tool | Use For |
|------|---------|
| **axe DevTools** | Browser extension, CI integration |
| **Lighthouse** | Chrome DevTools, general audit |
| **WAVE** | Browser extension, visual feedback |
| **eslint-plugin-jsx-a11y** | Linting for React/JSX (adaptable patterns) |

### Manual Testing

| Tool | Use For |
|------|---------|
| **Keyboard only** | Tab through entire page, test all interactions |
| **Screen readers** | VoiceOver (Mac), NVDA (Windows), Orca (Linux) |
| **Color contrast checker** | WebAIM contrast checker |
| **Browser zoom** | Test at 200% zoom |

### Screen Reader Testing Guide

```bash
# VoiceOver (Mac)
Cmd + F5           # Toggle VoiceOver on/off
Ctrl + Option + →  # Navigate forward
Ctrl + Option + ←  # Navigate backward
Ctrl + Option + Space  # Activate element

# NVDA (Windows)
Insert + Space     # Toggle forms/browse mode
Tab               # Navigate form controls
Arrow keys        # Read content
Enter             # Activate links/buttons
```

---

## ARIA Roles Reference

### Landmark Roles

```html
<header role="banner">           <!-- Page header, once per page -->
<nav role="navigation">          <!-- Navigation, use aria-label for multiple -->
<main role="main">               <!-- Main content, once per page -->
<aside role="complementary">     <!-- Sidebar, related content -->
<footer role="contentinfo">      <!-- Page footer, once per page -->
<form role="search">             <!-- Search form -->
```

### Widget Roles

```html
<div role="dialog" aria-modal="true">     <!-- Modal dialog -->
<div role="alertdialog">                  <!-- Alert requiring response -->
<div role="alert">                        <!-- Important, time-sensitive -->
<div role="status">                       <!-- Status update -->
<div role="tablist">                      <!-- Tab container -->
<button role="tab" aria-selected="true">  <!-- Tab button -->
<div role="tabpanel">                     <!-- Tab content -->
<ul role="listbox">                       <!-- Selectable list -->
<li role="option" aria-selected="false">  <!-- List option -->
```

### Live Region Attributes

```html
<!-- Polite: Announces when user idle (use for chat messages) -->
<div aria-live="polite" aria-atomic="true">
  New message received
</div>

<!-- Assertive: Interrupts immediately (use for errors) -->
<div aria-live="assertive" role="alert">
  Connection lost
</div>

<!-- Atomic: Announce entire region vs just changes -->
<div aria-live="polite" aria-atomic="true">
  3 items in cart  <!-- Reads "3 items in cart", not just "3" -->
</div>
```

---

## Color Contrast

### Calculating Contrast Ratio

```
Contrast Ratio = (L1 + 0.05) / (L2 + 0.05)

Where L1 = lighter color luminance, L2 = darker color luminance
```

### Common Safe Combinations

| Background | Text | Ratio |
|------------|------|-------|
| `#FFFFFF` | `#000000` | 21:1 ✅ |
| `#FFFFFF` | `#595959` | 7:1 ✅ |
| `#FFFFFF` | `#767676` | 4.54:1 ✅ (minimum) |
| `#FFFFFF` | `#949494` | 2.94:1 ❌ |
| `#1a1a1a` | `#FFFFFF` | 17.4:1 ✅ |
| `#007bff` | `#FFFFFF` | 4.5:1 ✅ (barely) |

### Tools

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Colour Contrast Analyser](https://www.tpgi.com/color-contrast-checker/)
- Chrome DevTools: Inspect element → Color picker shows contrast

---

## Focus Management Patterns

### Focus Trap (for modals)

```typescript
function trapFocus(element: HTMLElement) {
  const focusableElements = element.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  const first = focusableElements[0] as HTMLElement;
  const last = focusableElements[focusableElements.length - 1] as HTMLElement;

  element.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  first.focus();
}
```

### Return Focus on Close

```typescript
let previouslyFocused: HTMLElement | null = null;

function openModal() {
  previouslyFocused = document.activeElement as HTMLElement;
  modal.showModal();
  trapFocus(modal);
}

function closeModal() {
  modal.close();
  previouslyFocused?.focus();
}
```

---

## Shadow DOM Accessibility

### Challenges

1. **ARIA references can't cross shadow boundary** - `aria-labelledby` IDs must be in same DOM tree
2. **Focus delegation** - Use `delegatesFocus: true` in attachShadow
3. **Form participation** - Custom elements need ElementInternals for form association

### Dark Mode Contrast

Dark backgrounds require re-validation. Colors passing on white may fail on dark:

| Color | On White | On `#1a1a2e` | Action |
|-------|----------|--------------|--------|
| `#ef4444` | 4.5:1 | 3.2:1 ❌ | Lighten to `#f87171` |
| `#10b981` | 4.5:1 | 4.8:1 ✅ | OK |

**Rule**: For status colors, check contrast at [webaim.org/resources/contrastchecker](https://webaim.org/resources/contrastchecker/). Test contrast for BOTH light and dark themes separately.

---

### Solutions

```typescript
// Enable focus delegation
this.attachShadow({ mode: 'open', delegatesFocus: true });

// Use aria-label instead of aria-labelledby for cross-boundary
<button aria-label="Send message">  // ✅ Works in Shadow DOM
<button aria-labelledby="label-id"> // ❌ Won't find ID outside shadow

// Form association with ElementInternals
class MyInput extends HTMLElement {
  static formAssociated = true;
  #internals: ElementInternals;

  constructor() {
    super();
    this.#internals = this.attachInternals();
  }

  get value() { return this.#internals.value; }
  set value(v) { this.#internals.setFormValue(v); }
}
```

---

## Interactive Component Accessibility Implementation

Complete example of accessible tier selection component with all required layers:

### HTML Structure

```html
<!-- Radiogroup pattern for tier selection -->
<div class="pricing-grid" role="radiogroup" aria-label="Select your pricing tier">
    <button type="button" class="select-tier-btn" role="radio"
            aria-checked="true" data-tier="free">Select Free</button>
    <button type="button" class="select-tier-btn" role="radio"
            aria-checked="false" data-tier="growth">Select Growth</button>
    <button type="button" class="select-tier-btn" role="radio"
            aria-checked="false" data-tier="pro">Select Pro</button>
</div>

<!-- Live region for state change announcements -->
<div role="status" aria-live="polite" aria-atomic="true" class="sr-only"
     id="tier-selection-status"></div>
```

### JavaScript State Management

```javascript
// Handle tier selection
function selectTier(tierButton) {
    const tier = tierButton.dataset.tier;
    const tierName = tierButton.textContent.replace('Select ', '');

    // Update ARIA states
    document.querySelectorAll('.select-tier-btn').forEach(btn => {
        btn.setAttribute('aria-checked', 'false');
    });
    tierButton.setAttribute('aria-checked', 'true');

    // Announce to screen readers
    const statusDiv = document.getElementById('tier-selection-status');
    statusDiv.textContent = `${tierName} plan selected`;

    // Update visual states
    updateVisualStates(tier);
}

// Keyboard navigation
document.querySelector('.pricing-grid').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        focusNextRadio();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        focusPreviousRadio();
    } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.target.click();
    }
});
```

### CSS Visual States

```css
/* Screen reader only utility */
.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
}

/* Avoid conflicting visual states */
/* Featured card (subtle gradient) */
.pricing-card-featured {
    background: linear-gradient(180deg, #fefefe 0%, #f8fafc 100%);
    transform: scale(1.02);
}

/* Selected state (distinct from featured) */
.pricing-card.tier-selected {
    border: 2px solid var(--accent-color);
    box-shadow: 0 0 0 3px rgba(244, 169, 50, 0.2);
}

/* Focus state (keyboard navigation) */
.select-tier-btn:focus-visible {
    outline: 2px solid var(--focus-color);
    outline-offset: 2px;
}
```

### Key Implementation Notes

1. **ARIA markup**: `role="radiogroup"`, `role="radio"`, `aria-checked` for proper semantics
2. **Live region**: `aria-live="polite"` announces state changes without interrupting
3. **Keyboard support**: Arrow keys navigate, Enter/Space activates
4. **Distinct visual states**: Featured uses gradient, selected uses border/glow (no conflicts)
5. **Focus management**: `focus-visible` shows keyboard focus, logical tab order

---

## Modal / Dialog Patterns

### `aria-modal` + Focus Trap — Required Pairing

`aria-modal="true"` without a matching focus trap is the most common dialog accessibility violation: `role="dialog"` + `aria-modal="true"` claims that content behind the dialog is inert, but Tab can still escape behind it if no trap is wired. ARIA APG flags this as non-conforming, and CI a11y gates (axe-core rule `aria-dialog-name` plus focus-management linters) block on it.

```tsx
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function useFocusTrap(panelRef: React.RefObject<HTMLElement>) {
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const els = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = els[0];
    const last = els[els.length - 1];
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }
    panel.addEventListener("keydown", handleKeyDown);
    first?.focus();
    return () => panel.removeEventListener("keydown", handleKeyDown);
  }, [panelRef]);
}
```

**Alternative** (downgrade): drop `aria-modal="true"` and keep only `role="dialog"` + `aria-labelledby`. Removes the focus-trap requirement, but strict-rule automated reviewers may still BLOCK — when in doubt, add the trap.

### Focus Restoration on Dialog Close (WCAG 2.4.3)

When a dialog closes, focus must return to the element that opened it. Capture `document.activeElement` when opening; restore on close.

```tsx
const triggerRef = useRef<HTMLElement | null>(null);

function openDialog() {
  triggerRef.current = document.activeElement as HTMLElement;
  setOpen(true);
}
function closeDialog() {
  setOpen(false);
  triggerRef.current?.focus();
}
```

The trigger element (pin, button, card) needs `tabindex="0"` + `role="button"` if it is not a native `<button>`, otherwise `.focus()` has no effect for keyboard users.

---

## WCAG 2.5.5 Range Input Touch Target (44 px)

Range inputs default to ~8 px height in most stylesheets and are the most common WCAG 2.5.5 violation in filter/dashboard UIs.

**Fix recipe** (Tailwind arbitrary-variant):

```tsx
<input
  type="range"
  className="h-[44px] w-full bg-transparent appearance-none
    [&::-webkit-slider-thumb]:appearance-none
    [&::-webkit-slider-thumb]:w-[44px] [&::-webkit-slider-thumb]:h-[44px]
    [&::-webkit-slider-thumb]:rounded-full
    [&::-moz-range-thumb]:w-[44px] [&::-moz-range-thumb]:h-[44px]
    [&::-moz-range-thumb]:rounded-full"
  style={{ background: `linear-gradient(...)` }}
/>
```

Two rules:
1. Raise the `<input>` itself to `h-[44px]` — NOT just a wrapping `<div>`. DOM hit-testing follows the input's layout box, not the parent's. Taps in the gap between wrapper and input are silently swallowed.
2. Add `bg-transparent` so the inline `linear-gradient` style still renders without globals.css grey-track bleeding through the taller hit-box.

**Specificity note**: arbitrary-variant Tailwind `[&::-webkit-slider-thumb]` produces class+pseudo selector (0,1,1), which beats a global element+pseudo `input[type="range"]::-webkit-slider-thumb` (0,0,2). Local Tailwind overrides defeat globals.css without `!important`.

**Systemic risk**: if globals.css sets sub-44 px range defaults (`height: 0.5rem`, thumbs `1.25rem`), every new slider that doesn't override locally inherits a WCAG-failing touch target. Either raise the globals.css defaults to 44 px or add a lint rule flagging `<input type="range">` without explicit local overrides.

### 44 px Touch Target for Text Links

Inline text links default to line-height-driven tap area, typically 20–24 px — well under WCAG 2.5.5. Apply `inline-flex items-center min-h-[44px] px-2` to extend the hit target without widening the visual footprint:

```tsx
<a
  href="/details"
  className="inline-flex items-center min-h-[44px] px-2 text-blue-600 underline"
>
  View details
</a>
```

`inline-flex` keeps the link flow-inline while `min-h-[44px]` ensures the tap zone meets the 44 px minimum. `items-center` vertically centers the text within the enlarged hit area. This pattern applies to any inline interactive element (badge-style buttons, icon links) where the visible area is intentionally smaller than the touch target.

---

## Common Mistakes / ARIA Anti-Patterns

### `<label htmlFor>` with `aria-hidden` Input

Pairing `<label htmlFor="x">` with an input that has `aria-hidden="true"` breaks assistive technology — the label references an element that AT is instructed to ignore. The association is poisoned at the DOM level.

```tsx
// BROKEN — AT cannot follow the htmlFor → aria-hidden link
<label htmlFor="qty-input">Quantity</label>
<input id="qty-input" aria-hidden="true" value={qty} />

// CORRECT — use a visible button with aria-label, or a <span> with role
<span id="qty-label">Quantity</span>
<button aria-labelledby="qty-label" aria-label={`Quantity: ${qty}`}>
  {qty}
</button>
```

When the target element must be hidden from AT, use `aria-label` directly on the controlling `<button>` rather than linking a `<label>` to an invisible input.

---

## ARIA + Iframe Boundaries

`<label htmlFor="x">` does NOT bind to a `<div id="x">` that wraps a third-party iframe (e.g., Stripe `<CardElement>`, embedded widgets). `htmlFor` requires a native form-control target; iframes are opaque to assistive technology.

**Fix**: use `aria-label="..."` on the wrapper div instead of a `<label>` element.

```tsx
// WRONG
<label htmlFor="card-element">Credit card details</label>
<div id="card-element"><CardElement /></div>

// CORRECT
<div aria-label="Credit card details"><CardElement /></div>
```

Pair with `aria-busy={pending}` on the submit button so screen readers announce "busy" during async operations, and `aria-live="polite"` on transient state copy (e.g., "Activating your membership…") so users receive confirmation during webhook-race windows.

---

## Clickable Cards — `<div onClick>` vs `<button>`

`<div onClick>` is not keyboard accessible (WCAG 2.1.1). Tab cannot reach it; Enter/Space do nothing.

Convert to `<button type="button">` and neutralize default styles with Tailwind (`text-left block w-full`). If the markup must stay a `<div>` for layout reasons, all three are required:

```tsx
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
  }}
>
```

Omitting any one of `role`, `tabIndex`, or `onKeyDown` produces a partial fix that still fails keyboard testing.

### Selectable Cards — Three-in-One Conversion

For cards that represent a selectable choice (filter chips, listing cards, plan cards), the `<div onClick>` → `<button>` conversion should simultaneously wire three concerns:

```tsx
// BEFORE — not keyboard accessible, no AT state, no test handle
<div onClick={() => setSelected(id)} className="card">
  {content}
</div>

// AFTER — keyboard accessible, AT state, testable
<button
  type="button"
  aria-pressed={selected === id}
  data-testid={`card-${id}`}
  onClick={() => setSelected(id)}
  className="text-left block w-full card"
>
  {content}
</button>
```

1. `aria-pressed={boolean}` — announces selection state to AT ("pressed" / "not pressed")
2. `data-testid={`card-${id}`}` — stable test handle for RTL `getByTestId` without coupling to visual text
3. `text-left block w-full` — neutralizes button default styles so layout is unchanged

Missing any one of these three produces an incomplete fix: `aria-pressed` alone is unverifiable in tests; `data-testid` alone doesn't help AT users; Tailwind reset alone doesn't announce state.

---

## Live Regions / Persistent State

### Persistent aria-live Region Across State Transitions

When a component moves through multiple states (loading → success → error → empty), a single aria-live region must persist across all transitions. Unmounting and remounting the live region resets the AT announcement queue — intermediate states go unannounced.

Pattern: one stable outer `<div>` containing the live region as the first child, with conditional siblings rendered via `&&`:

```tsx
<div>
  {/* Stable live region — always mounted */}
  <div
    role="status"
    aria-live="polite"
    aria-atomic="true"
    className="sr-only"
  >
    {statusMessage}
  </div>

  {/* Conditional siblings */}
  {isLoading && <Spinner />}
  {isSuccess && <SuccessContent data={data} />}
  {isError && <ErrorMessage error={error} />}
</div>
```

Updating `statusMessage` on each state transition ("Loading…", "3 results found", "Failed — try again") gives AT users a consistent announcement without requiring focus to move.

### Focus Management on Terminal State

When a multi-step interaction reaches a terminal state (form submitted, approval confirmed, item deleted), move focus programmatically to the status message or the next logical action. Without explicit focus management, keyboard users are left at the now-stale trigger position.

```tsx
const statusRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (isSuccess || isError) {
    statusRef.current?.focus();
  }
}, [isSuccess, isError]);

<div ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
  {isSuccess ? 'Submission received.' : isError ? 'Submission failed — try again.' : null}
</div>
```

`tabIndex={-1}` makes the element programmatically focusable without inserting it into the Tab order. Pair with the persistent live-region pattern above so the announcement fires even if focus does not move for sighted keyboard users.

### aria-live in Filtered Lists

A filtered list's aria-live region must re-announce on every filter change, not just on initial load. If the region is only populated at mount time, filtering silently updates the list for sighted users while AT users receive no announcement.

```tsx
const [filter, setFilter] = useState('all');
const filtered = listings.filter(/* ... */);

// Re-derive message on every filter change
const statusMessage = `${filtered.length} listing${filtered.length !== 1 ? 's' : ''} shown`;

<div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
  {statusMessage}
</div>
```

`aria-atomic="true"` ensures the entire count string is read, not just the changed character.

---

## Type Union Widening / Contract Migration

When a typed enum, role, or status field is renamed across the FE/BE boundary (e.g., `PascalCase` → `snake_case`), one option is to inline a comment at the type definition and field references that anchors it to the contract source:

```typescript
// GET /api/v1/items — status field uses snake_case per BE a prior ticket
type ItemStatus =
  | 'pending_approval'   // was: PendingApproval
  | 'published'
  | 'hidden'
  | 'suspended'
  | 'rejected'
  | 'removed';
```

Format: `// GET /endpoint — snake_case per BE <ticket-id>` on the type declaration, and a briefer `// per BE a prior ticket` on individual field usages in API helpers. This anchors the contract to its source and makes the migration window visible to reviewers without requiring them to read the ticket.

---

## Class-of-Issue Sweep (Not Whack-a-Mole)

When an accessibility reviewer flags a pattern (e.g., `<div onClick>`, missing `encodeURIComponent`, sub-44-px touch targets), grep the codebase for all instances of the same pattern before pushing the fix. Report siblings even when they are out-of-scope for the current PR — the reviewer will appreciate the heads-up, and a single audit pass is cheaper than 3 separate review cycles.

```bash
# Examples
grep -rn 'type="range"' components/ app/          # Find all range inputs
grep -rn '<div.*onClick' components/ app/          # Find all div-click patterns
grep -rn 'aria-modal' components/ app/             # Audit all modal claims
```

---

## Interactive Component Checklist

- [ ] **ARIA markup** — Correct role, aria-checked/selected/expanded
- [ ] **JS announcements** — aria-live regions for state changes
- [ ] **Keyboard navigation** — Tab, Enter/Space, Arrow keys
- [ ] **Visual states** — Clear focus/selected/disabled indicators
- [ ] **Focus management** — Logical flow, no focus traps

---

## Hover Affordance for Non-Interactive Card Variants

Base hover-lift styles (`.card:hover { transform: translateY(-2px) }`) apply to ALL variants of a card class regardless of modifier. Variants without click target / `<details>` expand / link signal **false interactivity**. Pattern:

| Variant has interaction? | Required override |
|---|---|
| Yes (link, button, expand) | Inherit base `:hover` lift |
| No (roadmap, upcoming, info-only) | `:hover { transform: none; box-shadow: var(--shadow-sm); }` |

---

## Accessible Count Badges

When computed signals produce both visual and screen-reader output, returning structured objects (`{ text: string; count: number }[]`) enables split rendering: `<span aria-hidden="true">(x2)</span>` + `<span class="sr-only">asked 2 times</span>`. Concatenated strings force everything into one DOM node, making accessible alternatives impossible.

---

## Design Token Contrast Safety

`var(--text-muted)` (`#718096` on white, ~4.48:1) falls just under the WCAG AA 4.5:1 threshold for normal text below 18px. `var(--text-secondary)` (`#4a5568`, ~7:1) is safe for all body text sizes. Token naming can be misleading — "muted" suggests safe use, but it requires large text (18px+/bold) to pass AA.

### Recurring Trap: `--text-muted` for Body Text

Caught twice in 24h on the same codebase — `--text-muted` (#8A8E9E) is unsafe for body text on either light OR dark surfaces:

| Surface | Token | Computed Contrast | Verdict |
|---|---|---|---|
| `--bg-surface` (#FFF) | `--text-muted` (#8A8E9E) | ~3.16:1 | Fails AA 4.5:1 for body text |
| `--bg-dark-cta` (#1A1D2E) | `--text-secondary` (#4A4E60) | ~2.8:1 | Fails AA 4.5:1 for body text |
| `--bg-surface` (#FFF) | `--text-secondary` (#4A4E60) | ~7.2:1 | Safe — default for body text |

`--text-muted` at roughly 3.16:1 contrast fails WCAG AA's 4.5:1 minimum for body copy under 18px. Safe uses: large text (≥18px regular OR ≥14px bold, 3:1 large-text exception) OR non-text UI components (3:1 threshold).

### Dark-Section Body Text Override Pattern

When a body-text class may render inside `.section--dark` (or any dark-bg modifier), define a paired override using a high-contrast rgba:

```css
.section--dark .disclaimer { color: rgba(240, 241, 245, 0.65); }
```

Without a paired override, body text on a dark section fails WCAG AA 4.5:1 contrast. Any new body-text class that may render inside `.section--dark` warrants a paired override.

---

## Pre-Flight CSS Checklist

Before writing CSS for a marketing/UI ticket on a token-driven design system:

- [ ] **Token reference validation** — every `var(--…)` in new CSS must resolve to a definition in `design-tokens.css`. Undefined custom properties resolve to `0` silently (no console warning, no error). LLMs reach for "expected" names from training (e.g. `--space-10`); verify against the actual scale. Example trap: `--space-N` scale jumping `8 → 12` — there is no `--space-9`/`--space-10`/`--space-11`.
- [ ] **Text-color contrast** — verify text token vs background token against WCAG AA 4.5:1 (body) / 3:1 (large) for every surface the class may render on (light AND dark sections).
- [ ] **Hover affordance** — if the base class has a `:hover` lift, every non-interactive modifier needs a `:hover { transform: none }` override.

---

## Stretched-Link Cards (Single Tab Stop)

A card with both a title link and a "read more" link is two tab stops for one destination — redundant for keyboard and screen-reader users. Collapse to one:

```css
.card { position: relative; }
.card-title a::after { content: ""; position: absolute; inset: 0; }
```

The title link's `::after` overlay covers the whole card, so a click anywhere activates it. Render the visible "read more" as an `aria-hidden="true"` static `<span>` (not an `<a>`) — it reads as a visual affordance but adds no tab stop.

**Verify with Playwright pointer-interception**: a click on the "read more" span that times out with `<element> intercepts pointer events` *confirms* the overlay link is correctly capturing clicks over the element beneath — the error is the proof, not a failure.

---

## Common Mistakes — Extended

Items beyond the 5 kept inline in SKILL.md:

- **Low-res images on Retina displays** — source must be 2x+ the largest CSS display size; an image rendered at 200 px wide needs a 400 px+ source or it appears blurry on HiDPI screens.
- **`<dt>`/`<dd>` ordering wrong** — label is `<dt>` (term), value is `<dd>` (definition); screen readers announce "term: definition". Reversed order (`<dd>` before `<dt>`) produces nonsensical announcements.

---

## Pre-Placement Audit (Marketing Copy Tickets)

Before writing HTML for additive marketing-copy tickets on an established design system, audit:

| Check | Question |
|---|---|
| **Section alternation rhythm** | Does the page alternate `.section--surface` (white) and plain `.section`? Where does the new section land in that rhythm? |
| **Card-variant reuse** | Does an existing 3-variant card system (e.g. `.feature-card--{primary,secondary,accent}`) already cover the new product taxonomy? |
| **Token palette mapping** | Which existing semantic tokens (`--brand-primary` / `--brand-secondary` / `--brand-accent`) map to the new concept? |

Three checks, ~5 min, prevents Cycle 1 placement findings and avoids inventing new components/tokens/colors.
