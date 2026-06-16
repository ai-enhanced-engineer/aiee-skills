---
name: frontend-material-chat
description: Material Design 3 patterns for chat widget components. Use for status indicators, input fields, empty states, message bubbles, or typing indicators in chat UIs.
---

# Chat Widget M3 Patterns

Material Design 3 patterns specifically for chat interfaces and conversational UIs.

## Core Components

| Component | M3 Pattern | Key Token |
|-----------|------------|-----------|
| **Status Indicator** | Semantic color dot (7px) | `--md-sys-color-tertiary` |
| **Input Area** | Filled text field container | `--md-sys-shape-corner-medium` |
| **Empty State** | Centered logo + brand | Glass morphism container |
| **Message Bubble** | Surface-variant container | `--md-sys-shape-corner-large` |
| **Typing Indicator** | Animated dots | Tertiary color pulse |

## Status Indicator Colors

| State | Color | Hex |
|-------|-------|-----|
| Connected | Green | `#22c55e` |
| Connecting | Yellow | `#eab308` |
| Disconnected | Red | `#ef4444` |

## Contained Input Pattern

```
┌──────────────────────────────────────┐
│ [Input text field]          [Send]  │
└──────────────────────────────────────┘
Border: 1px solid rgba(0,0,0,0.15)
Border-radius: 12px
Focus: Primary color glow at 20% opacity
```

## Accessibility Requirements

- Touch targets: 44px minimum (mobile), 36px acceptable (desktop)
- Status indicators: `aria-label` describing connection state
- Focus indicators: Visible focus ring on all interactive elements
- Reduced motion: `@media (prefers-reduced-motion: reduce)` support

## When NOT to Use

- Non-chat interfaces (use `frontend-material-design-3` instead)
- Email clients (different interaction model)
- Static content displays

See `reference.md` for detailed patterns and `examples.md` for Svelte implementations.
