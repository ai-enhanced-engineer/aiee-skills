# Chat Widget M3 Reference

Complete patterns for M3-compliant chat interfaces.

---

## Status Indicators

### Semantic Color Dot Pattern

```
Pattern: Small color dot (7px) positioned BEFORE title
Position: Inline with header title, 8px gap
```

| State | Color | Hex | Use Case |
|-------|-------|-----|----------|
| Connected/Online | Green | `#22c55e` | Active session |
| Connecting/Reconnecting | Yellow | `#eab308` | Establishing connection |
| Disconnected/Error | Red | `#ef4444` | Connection lost |

### Implementation Notes

- Position dot BEFORE (left of) title text, not after
- Use `aria-label` for screen readers: "Connection status: connected"
- Dot should have subtle pulse animation for "connecting" state
- No text label needed if color semantics are clear

---

## Input Area Patterns

### Contained Input (M3 Filled Text Field)

```
┌─────────────────────────────────────────────┐
│  Placeholder text...              [Send]   │
└─────────────────────────────────────────────┘
```

| Property | Value | Token |
|----------|-------|-------|
| Container radius | 12px | `--md-sys-shape-corner-medium` |
| Border | 1px solid | `rgba(0,0,0,0.15)` light / `rgba(255,255,255,0.15)` dark |
| Focus ring | Primary color | `box-shadow: 0 0 0 3px rgba(primary, 0.2)` |
| Min height | 48px | Touch-friendly |

### Touch Target Requirements

| Context | Minimum Size |
|---------|--------------|
| Mobile | 44×44px |
| Desktop | 36×36px (acceptable) |
| Send button | Same as context |

### Disabled State

```css
.input-container:has(:disabled) {
  opacity: 0.5;
  pointer-events: none;
}
```

Disable when:
- Message is empty (trimmed)
- Request is in flight
- Connection status is not "connected"

---

## Empty State Branding

### Logo + Brand Name Pattern

```
┌─────────────────────────────────────┐
│                                     │
│         ┌─────────┐                 │
│         │  LOGO   │                 │
│         │ (48-68) │                 │
│         └─────────┘                 │
│         Brand Name                  │
│                                     │
└─────────────────────────────────────┘
```

| Element | Specification |
|---------|---------------|
| Logo size | 48-68px display |
| Logo source | 4× resolution for retina (256px source → 64px display) |
| Container | Glass morphism with `backdrop-blur` |
| Animation | Subtle pulse (2s ease-in-out infinite) |
| Brand text | 14-16px, medium weight, secondary color |

### Glass Morphism Container

```css
.empty-state-container {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  border-radius: var(--md-sys-shape-corner-large, 16px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  padding: 24px;
}

/* Dark theme */
.dark .empty-state-container {
  background: rgba(0, 0, 0, 0.6);
}
```

---

## Message Bubbles

### Outgoing vs Incoming

| Type | Background | Alignment |
|------|------------|-----------|
| Outgoing (user) | `--md-sys-color-primary-container` | Right |
| Incoming (assistant) | `--md-sys-color-surface-variant` | Left |

**Acme Corp Brand Mapping** (see `brand-tokens` skill for full tokens):
| Type | Brand Token | Hex Value |
|------|----------|-----------|
| Outgoing (user) | `--md-sys-color-primary-container` | `#d4e3ff` (Brand Blue tint) |
| Incoming (assistant) | `--md-sys-color-surface-variant` | `#e2e0dd` (Brand Beige variant) |

### Bubble Shape

```css
.message-bubble {
  border-radius: var(--md-sys-shape-corner-large, 16px);
  padding: 12px 16px;
  max-width: 80%;
}

.message-bubble.outgoing {
  border-bottom-right-radius: var(--md-sys-shape-corner-small, 8px);
}

.message-bubble.incoming {
  border-bottom-left-radius: var(--md-sys-shape-corner-small, 8px);
}
```

---

## Typing Indicator

### Three-Dot Animation

```css
.typing-indicator {
  display: flex;
  gap: 4px;
  padding: 12px 16px;
}

.typing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--md-sys-color-tertiary);
  animation: typing-bounce 1.4s infinite ease-in-out;
}

.typing-dot:nth-child(1) { animation-delay: 0s; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }

@keyframes typing-bounce {
  0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
  40% { transform: scale(1); opacity: 1; }
}
```

---

## Accessibility Checklist

- [ ] Touch targets: 44px mobile, 36px desktop minimum
- [ ] Focus indicators: Visible focus ring on all interactive elements
- [ ] Reduced motion: `@media (prefers-reduced-motion: reduce)` support
- [ ] ARIA labels: Descriptive labels for status, buttons, regions
- [ ] Color contrast: WCAG 2.1 AA compliant text/background ratios
- [ ] Keyboard navigation: Tab through all interactive elements
- [ ] Screen reader: Announce new messages with `aria-live="polite"`

---

## CSS Custom Properties for Chat

```css
:host {
  /* Status colors */
  --widget-status-connected: #22c55e;
  --widget-status-connecting: #eab308;
  --widget-status-disconnected: #ef4444;

  /* Input styling */
  --widget-input-border: rgba(0, 0, 0, 0.15);
  --widget-input-focus-ring: rgba(99, 102, 241, 0.2);

  /* Message bubbles */
  --widget-bubble-user: var(--md-sys-color-primary-container);
  --widget-bubble-assistant: var(--md-sys-color-surface-variant);

  /* Logo theming */
  --widget-logo-filter: brightness(1);
}

.dark-theme {
  --widget-input-border: rgba(255, 255, 255, 0.15);
  --widget-logo-filter: brightness(1.1);
}
```
