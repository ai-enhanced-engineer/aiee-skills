---
name: frontend-svelte
description: Svelte 5 and SvelteKit production patterns — runes-based reactivity, stores, Web Components, Shadow DOM, and performance optimization. Use for frontend architecture decisions or implementing complex UI components.
kb-sources:
  - wiki/software-engineering/frontend-svelte
updated: 2026-06-03
---

# Svelte Production Patterns

Production-ready patterns for Svelte 5 and SvelteKit applications.

## Core Concepts

### Svelte 5 Reactivity (Runes)

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  function increment() {
    count++;
  }
</script>

<button onclick={increment}>{count} × 2 = {doubled}</button>
```

### Key Runes

| Rune | Purpose |
|------|---------|
| `$state` | Reactive state declaration |
| `$derived` | Computed values |
| `$effect` | Side effects (like useEffect) |
| `$props` | Component props |
| `$bindable` | Two-way bindable props |

## State Management Patterns

### Factory Pattern with Props-Based DI (Multi-Instance Isolation)

**Use Case**: Web Components that need per-instance state isolation (multiple `<my-widget>` elements on same page).

**Problem**: Singleton stores are shared across all Web Component instances. Shadow DOM isolates CSS, NOT JavaScript state.

**Solution**: Factory functions + Props-based dependency injection + Backward compatible defaults.

**Implementation**:

**Step 1: Convert Store to Factory**
```typescript
// src/lib/stores/chat.svelte.ts
export class ChatStore {
  messages = $state<Message[]>([]);
  error = $state<string | null>(null);
  // ...
}

// Factory function (NEW)
export function createChatStore(): ChatStore {
  return new ChatStore();
}

// Singleton for backward compatibility (KEEP)
export const chatStore = createChatStore();
```

**Step 2: Per-Instance Stores in Web Component**
```typescript
// src/main.ts
class MyWidgetElement extends HTMLElement {
  private _chatStore: ChatStore;
  private _configStore: ConfigStore;

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });

    // Create isolated stores per instance
    this._chatStore = createChatStore();
    this._configStore = createConfigStore();
  }

  private mountApp() {
    this._app = mount(MyWidget, {
      target: container,
      props: {
        chat: this._chatStore,      // Pass instance stores
        config: this._configStore
      }
    });
  }
}
```

**Step 3: Props Pattern in Components**
```typescript
// src/lib/components/MyWidget.svelte
<script lang="ts">
  import { chatStore, configStore } from '@/lib/stores';

  interface Props {
    chat?: ChatStore;
    config?: ConfigStore;
  }

  // Destructure with singleton defaults (backward compat)
  let { chat = chatStore, config = configStore }: Props = $props();

  // Always use prop, never global
  const hasError = $derived(chat.error !== null); // ✅ Uses prop
</script>

<MessageList {chat} {config} /> <!-- Pass to children -->
```

**Anti-Pattern to Avoid**:
```typescript
// ❌ WRONG: Component has prop but uses singleton
let { chat = chatStore }: Props = $props();

const isDisabled = $derived(chatStore.error !== null); // ❌ Uses singleton
//                            ^^^^^^^^^ Should be `chat.error`
```

**Testing Pattern**:
```typescript
it('test__multi_widget__state_isolation', async () => {
  const widget1 = document.createElement('my-widget');
  const widget2 = document.createElement('my-widget');
  document.body.append(widget1, widget2);

  // Access internal stores
  const store1 = (widget1 as any)._chatStore;
  const store2 = (widget2 as any)._chatStore;

  // Trigger in Widget 1
  store1.setError('Error 1');

  // Assert Widget 2 unaffected
  expect(store1.error).toBe('Error 1');
  expect(store2.error).toBeNull(); // ✅ Isolated
});
```

**Benefits**:
- Multi-instance isolation (each widget has own state)
- Zero breaking changes (singleton defaults preserve behavior)
- Testability (inject mock stores)
- Bundle optimization (-0.3KB, tree-shaking improves)

**Detection Command** (find singleton usage in props-based components):
```bash
for file in $(grep -l "let {.*Store.*}: Props" src/**/*.svelte); do
  grep -n "[a-z]Store\." "$file" | grep -v "= $props()"
done
```

## SvelteKit Patterns

### Routing
- File-based routing in `src/routes/`
- `+page.svelte` for pages
- `+layout.svelte` for shared layouts
- `+server.ts` for API endpoints

### Data Loading
- `+page.ts` for universal load
- `+page.server.ts` for server-only load
- `+layout.ts` for shared data

### Rendering Modes
- SSR (default): Server-rendered, hydrated
- CSR: Client-side only
- Prerender: Static generation

## Performance Targets

| Metric | Target |
|--------|--------|
| LCP | < 2.5s |
| FID | < 100ms |
| CLS | < 0.1 |
| Initial JS | < 100KB |

## When NOT to Use Svelte

- Simple interactivity → Vanilla JS
- Static content → Plain HTML + CSS
- < 50KB JS budget → Web Components
- SEO-critical, no JS → Static site generator

## CSS Triangle Arrows (Standard Dimensions)

Create consistent directional indicators using border-based triangles.

**Standard dimensions for visual harmony:**
- Border width: 7px (transparent sides)
- Border height: 12px (colored edge)
- Opacity: 0.7 for decorative elements

```css
/* Downward arrow (▼) */
.arrow-down {
  width: 0;
  height: 0;
  border-left: 7px solid transparent;
  border-right: 7px solid transparent;
  border-top: 12px solid var(--accent-primary);
  opacity: 0.7;
}

/* Right-pointing arrow (▶) */
.arrow-right {
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 12px solid var(--accent-primary);
  opacity: 0.7;
}

/* Curved connector */
.curve-connector {
  border-left: 2px dashed var(--color);
  border-top: 2px dashed var(--color);
  border-top-left-radius: 20px;
}
```

**Anti-pattern:** Use HTML elements for arrows — conic-gradient and complex CSS-only solutions need browser-specific fallbacks and fail on older WebKit.

**Use case:** Workflow diagrams, process flows, directional UI.

## Shadow DOM Layout Patterns

### Shadow DOM as Ticket-Routing Boundary

When validating UX tickets for an embedded widget, the Shadow DOM boundary is the first question. Issues about layout/positioning around the widget are host-page changes; issues about widget internals are widget changes.

### Host Display Mode

**Problem:** Custom elements default to `display: inline`, breaking `height: 100%` inheritance in child elements.

**Solution:**
```css
:host {
  display: block;
}
```

**Why:** Without `display: block`, percentage-based heights in children have no reference height to calculate from. This is a Web Component fundamental, not a Svelte-specific issue.

### Two-Style-Element Pattern

**Problem:** Theme switching can cause layout regressions when all styles are in one `<style>` element that gets replaced.

**Solution:** Separate permanent layout styles from mutable theme styles using two `<style>` elements — one prepended (never replaced), one appended (swapped on theme change).

See `examples.md` for the full TypeScript implementation.

### Thin-Shell Layout Variant

Add a display variant by building a new shell component that mounts the same presentational components and stores/services, swapping only container and positioning logic. Keeps existing internals intact.

See `reference.md § Thin-Shell Layout Variant` for the composition pattern.

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `sticky`/`absolute` + `left:50%` + `translateX(-50%)` for centering | `align-self: center` + `max-width` — position-based centering overflows in narrow fixed-width containers |
| Web Component attributes read only in `connectedCallback` | Declare `observedAttributes` and handle changes in `attributeChangedCallback`; mount-only reads miss runtime updates |

## Responsive Image Optimization

WebP with `<picture>` fallback preserves compatibility while serving 60-80% smaller files. At 4x CSS display size, small images (icons, thumbnails) remain sharp on Retina displays; 2x causes visible blur. Full-width images need original resolution as a high-DPI srcset option (e.g., 1440px viewport × 2x = needs 2880px source). macOS `sips` + `cwebp` provides a zero-dependency processing pipeline.

See `examples.md` for the WebP `<picture>` pattern and image processing pipeline.

See `reference.md` for detailed patterns and `examples.md` for component implementations.
