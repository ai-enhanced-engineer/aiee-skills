# Svelte Production Patterns - Reference

## Svelte 5 Runes Deep Dive

### $state

```svelte
<script>
  // Primitive state
  let count = $state(0);

  // Object state (deeply reactive)
  let user = $state({ name: 'Alice', age: 30 });

  // Array state
  let items = $state([1, 2, 3]);

  // Mutations work directly
  function addItem() {
    items.push(items.length + 1);  // Reactive!
  }
</script>
```

### $derived

```svelte
<script>
  let items = $state([1, 2, 3, 4, 5]);
  let filter = $state('all');

  // Simple derived
  let count = $derived(items.length);

  // Complex derived with $derived.by
  let filtered = $derived.by(() => {
    if (filter === 'even') return items.filter(i => i % 2 === 0);
    if (filter === 'odd') return items.filter(i => i % 2 !== 0);
    return items;
  });
</script>
```

### $effect

```svelte
<script>
  let count = $state(0);

  // Runs when count changes
  $effect(() => {
    console.log(`Count is now ${count}`);
  });

  // Cleanup function
  $effect(() => {
    const interval = setInterval(() => count++, 1000);
    return () => clearInterval(interval);  // Cleanup
  });

  // Pre-effect (runs before DOM update)
  $effect.pre(() => {
    // Measure DOM before update
  });
</script>
```

### $props and $bindable

```svelte
<!-- Child.svelte -->
<script>
  let { name, count = $bindable(0) } = $props();
</script>

<input bind:value={count} />

<!-- Parent.svelte -->
<script>
  let childCount = $state(0);
</script>

<Child name="test" bind:count={childCount} />
```

## Store Patterns

### Writable Store (Svelte 4 compatible)

```typescript
// stores/counter.ts
import { writable } from 'svelte/store';

function createCounter() {
  const { subscribe, set, update } = writable(0);

  return {
    subscribe,
    increment: () => update(n => n + 1),
    decrement: () => update(n => n - 1),
    reset: () => set(0)
  };
}

export const counter = createCounter();
```

### Async Store

```typescript
// stores/user.ts
import { writable, derived } from 'svelte/store';

interface User {
  id: string;
  name: string;
}

function createUserStore() {
  const { subscribe, set } = writable<User | null>(null);
  const loading = writable(false);
  const error = writable<Error | null>(null);

  return {
    subscribe,
    loading: { subscribe: loading.subscribe },
    error: { subscribe: error.subscribe },

    async fetch(id: string) {
      loading.set(true);
      error.set(null);
      try {
        const response = await fetch(`/api/users/${id}`);
        const user = await response.json();
        set(user);
      } catch (e) {
        error.set(e as Error);
      } finally {
        loading.set(false);
      }
    }
  };
}

export const user = createUserStore();
```

## SvelteKit Patterns

### Load Functions

```typescript
// +page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, fetch }) => {
  const response = await fetch(`/api/posts/${params.id}`);
  const post = await response.json();

  return {
    post,
    user: locals.user
  };
};
```

### Form Actions

```typescript
// +page.server.ts
import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';

export const actions: Actions = {
  create: async ({ request, locals }) => {
    const data = await request.formData();
    const title = data.get('title');

    if (!title) {
      return fail(400, { title, missing: true });
    }

    const post = await db.posts.create({ title, userId: locals.user.id });
    throw redirect(303, `/posts/${post.id}`);
  },

  delete: async ({ params }) => {
    await db.posts.delete(params.id);
    throw redirect(303, '/posts');
  }
};
```

### API Routes

```typescript
// +server.ts
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
  const post = await db.posts.find(params.id);

  if (!post) {
    throw error(404, 'Post not found');
  }

  return json(post);
};

export const POST: RequestHandler = async ({ request, locals }) => {
  const data = await request.json();
  const post = await db.posts.create(data);
  return json(post, { status: 201 });
};
```

### Hooks

```typescript
// hooks.server.ts
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  // Auth check
  const session = event.cookies.get('session');
  if (session) {
    event.locals.user = await getUser(session);
  }

  // Add security headers
  const response = await resolve(event);
  response.headers.set('X-Frame-Options', 'DENY');

  return response;
};
```

## Component Patterns

### Compound Components

```svelte
<!-- Tabs.svelte (Svelte 5) -->
<script>
  // Note: setContext/getContext still come from 'svelte' in Svelte 5
  import { setContext } from 'svelte';

  let activeTab = $state('');

  setContext('tabs', {
    get activeTab() { return activeTab },
    setActiveTab: (id) => activeTab = id
  });
</script>

<div class="tabs">
  <slot />
</div>

<!-- Tab.svelte -->
<script>
  import { getContext } from 'svelte';

  let { id, children } = $props();
  const { activeTab, setActiveTab } = getContext('tabs');
</script>

<button
  class:active={activeTab === id}
  onclick={() => setActiveTab(id)}
>
  {@render children()}
</button>
```

### Render Props (Snippets)

```svelte
<!-- DataList.svelte -->
<script>
  let { items, row } = $props();
</script>

<ul>
  {#each items as item}
    <li>{@render row(item)}</li>
  {/each}
</ul>

<!-- Usage -->
<DataList {items}>
  {#snippet row(item)}
    <span>{item.name}: {item.value}</span>
  {/snippet}
</DataList>
```

## Performance Optimization

### Code Splitting

```typescript
// Lazy load components
const HeavyComponent = await import('./HeavyComponent.svelte');

// Route-level splitting (automatic in SvelteKit)
// Each route is its own chunk
```

### Memoization

```svelte
<script>
  let items = $state([...]);

  // Only recalculates when items changes
  let processed = $derived.by(() => {
    return expensiveOperation(items);
  });
</script>
```

### Virtual Scrolling

```svelte
<script>
  import { VirtualList } from '@sveltejs/virtual-list';
</script>

<VirtualList items={largeArray} let:item>
  <div class="item">{item.name}</div>
</VirtualList>
```

## Web Components

### Building Web Components

```svelte
<!-- widget.svelte -->
<svelte:options customElement="my-widget" />

<script>
  let { name = 'World' } = $props();
</script>

<div class="widget">
  Hello, {name}!
</div>

<style>
  .widget {
    /* Styles are encapsulated */
  }
</style>
```

### Build Configuration

```javascript
// svelte.config.js
export default {
  compilerOptions: {
    customElement: true
  }
};
```

### Advanced Custom Element Registration

For more control over the Web Component lifecycle, use the `mount()` API:

```typescript
// web-component.ts
import { mount, unmount } from 'svelte';
import App from './App.svelte';

class AssistantWidget extends HTMLElement {
  private _app: any = null;
  private _shadowRoot: ShadowRoot | null = null;

  connectedCallback() {
    this._shadowRoot = this.attachShadow({ mode: 'open' });

    // Map HTML attributes to component props
    const props = {
      clientId: this.getAttribute('client-id') || '',
      theme: this.getAttribute('theme') || 'light',
    };

    this._app = mount(App, {
      target: this._shadowRoot,
      props
    });
  }

  disconnectedCallback() {
    if (this._app) {
      unmount(this._app);
      this._app = null;
    }
  }

  // Attribute change handling
  static get observedAttributes() {
    return ['client-id', 'theme'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (this._app && oldValue !== newValue) {
      // Update component props dynamically
      this._app.$set({ [this.toPropName(name)]: newValue });
    }
  }

  private toPropName(attr: string): string {
    return attr.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

customElements.define('assistant-widget', AssistantWidget);
```

### Web Component Composition Pattern

**Problem**: Multiple custom elements need shared lifecycle logic, but `observedAttributes` must be a static getter, complicating inheritance.

**Solution**: Use factory functions for composition instead of class inheritance.

```typescript
// shared-handlers.ts - Factory for shared Web Component logic
export function createElementHandlers() {
  return {
    handleAttributeChange(
      element: HTMLElement,
      app: any,
      name: string,
      oldValue: string,
      newValue: string
    ) {
      if (app && oldValue !== newValue) {
        const propName = this.toPropName(name);
        app.$set({ [propName]: newValue });
      }
    },

    toPropName(attr: string): string {
      return attr.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    },

    validateAndSetColor(element: HTMLElement, value: string | null): void {
      if (!value) return;

      // SECURITY: Always sanitize user-provided attributes before CSS injection
      const hexColorRegex = /^#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?$/;
      if (!hexColorRegex.test(value)) {
        console.warn(`Invalid accent-color: ${value}`);
        return;
      }

      const shadowRoot = element.shadowRoot;
      if (shadowRoot) {
        shadowRoot.querySelector('.container')?.style.setProperty('--accent-color', value);
      }
    }
  };
}

// Usage in multiple custom elements
class ChatWidgetElement extends HTMLElement {
  private handlers = createElementHandlers();
  private _app: any = null;

  static get observedAttributes() {
    return ['client-id', 'theme', 'accent-color'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'accent-color') {
      this.handlers.validateAndSetColor(this, newValue);
    } else {
      this.handlers.handleAttributeChange(this, this._app, name, oldValue, newValue);
    }
  }
}

class ChatPageElement extends HTMLElement {
  private handlers = createElementHandlers();
  private _app: any = null;

  static get observedAttributes() {
    return ['theme', 'accent-color']; // Different attributes
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'accent-color') {
      this.handlers.validateAndSetColor(this, newValue);
    } else {
      this.handlers.handleAttributeChange(this, this._app, name, oldValue, newValue);
    }
  }
}
```

**Why not inheritance?**
- `observedAttributes` must be a static getter (can't be dynamic)
- Each element needs different attributes
- Base class pattern complicates static property management

**Benefits**:
- Clean code reuse without inheritance constraints
- Each element maintains its own `observedAttributes` list
- Easy to test handlers independently
- Type-safe composition

**Security note**: Always validate user-provided attribute values before CSS injection (style.setProperty), classList operations, or innerHTML.

---

## Shared Helper Extraction for Sibling Web Components

When multiple Web Components share utility functions but need isolated state:

### Pattern

Extract shared helpers that take store instances as parameters:

```typescript
// shared/helpers.ts
export function formatTimestamp(store: ChatStore, timestamp: Date): string {
    return store.locale ? timestamp.toLocaleString(store.locale) : timestamp.toISOString();
}

// Used in both Widget A and Widget B with their own store instances
```

### Anti-Pattern

Importing shared helpers that reference singleton stores breaks multi-instance isolation.

### When to Use

- Sibling Web Components (e.g., chat widget and feedback widget) sharing formatting logic
- Utility functions that need access to per-instance configuration
- Test helpers that work with factory-created stores

### Shadow DOM Theming

CSS custom properties pass through Shadow DOM boundaries:

```css
/* Host page can customize */
assistant-widget {
  --widget-primary: #6366f1;
  --widget-surface: #ffffff;
  --widget-text: #1f2937;
  --widget-logo-filter: brightness(1);
}

/* Dark theme override */
assistant-widget[theme="dark"] {
  --widget-surface: #1f2937;
  --widget-text: #f9fafb;
  --widget-logo-filter: brightness(1.1);
}
```

Inside the Shadow DOM:

```svelte
<style>
  :host {
    /* Default values if host page doesn't provide */
    --widget-primary: #6366f1;
    --widget-surface: #ffffff;
  }

  .container {
    background: var(--widget-surface);
    color: var(--widget-text);
  }

  .logo {
    filter: var(--widget-logo-filter, brightness(1));
  }
</style>
```

### Retina Asset Strategy

For single-file Web Component distribution with sharp images:

```typescript
// assets/logos.ts - Centralized asset management
// Vite inlines small assets as base64

import retinaLogo from './logo_128.png';    // ~11KB, for buttons/headers
import highResLogo from './logo_256.png';   // ~42KB, for empty states

// Resolution tiers: Use 4× source for retina displays
export const FLOATING_BUTTON_LOGO_URL = retinaLogo;  // 128px → 32px display
export const HEADER_LOGO_URL = retinaLogo;           // 128px → 24px display
export const EMPTY_STATE_LOGO_URL = highResLogo;     // 256px → 64px display

// Vite config for base64 inlining (vite.config.ts)
// export default defineConfig({
//   build: {
//     assetsInlineLimit: 20000  // Inline assets < 20KB
//   }
// });
```

Usage in component:

```svelte
<script>
  import { HEADER_LOGO_URL, EMPTY_STATE_LOGO_URL } from './assets/logos';
</script>

<img src={HEADER_LOGO_URL} alt="Logo" class="header-logo" />
```

---

## Thin-Shell Layout Variant

When a widget needs a second display mode (e.g., an inline embedded variant alongside the default floating variant), build a new shell component that:

1. Imports the same presentational components (`<MessageList>`, `<InputBar>`, etc.)
2. Receives the same stores/services via props or context
3. Provides only different container markup and positioning CSS

This keeps all business logic and visual components shared. Only the outer shell differs.

```typescript
// InlineWidgetElement.ts — thin shell, reuses all internals
import { mount, unmount } from 'svelte';
import InlineShell from './InlineShell.svelte';  // new container only
import { createChatStore, createConfigStore } from '@/lib/stores';

class InlineWidgetElement extends HTMLElement {
  private _app: any = null;
  private _chatStore = createChatStore();
  private _configStore = createConfigStore();

  connectedCallback() {
    this.attachShadow({ mode: 'open' });
    this._app = mount(InlineShell, {
      target: this.shadowRoot!,
      props: {
        chat: this._chatStore,
        config: this._configStore
      }
    });
  }

  disconnectedCallback() {
    if (this._app) { unmount(this._app); this._app = null; }
  }
}

customElements.define('inline-widget', InlineWidgetElement);
```

```svelte
<!-- InlineShell.svelte — swaps container/positioning only -->
<script lang="ts">
  import MessageList from '@/lib/components/MessageList.svelte';
  import InputBar from '@/lib/components/InputBar.svelte';
  import type { ChatStore, ConfigStore } from '@/lib/stores';

  let { chat, config }: { chat: ChatStore; config: ConfigStore } = $props();
</script>

<!-- Inline layout: fills parent, no fixed positioning -->
<div class="inline-container">
  <MessageList {chat} {config} />
  <InputBar {chat} />
</div>

<style>
  :host { display: block; }
  .inline-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
  }
</style>
```

**When to use**: Host page needs to embed the widget inside a fixed-size panel rather than as a floating overlay. Avoid duplicating `MessageList`, `InputBar`, or store logic — those stay in one place.

---

## Anti-Patterns

| Anti-Pattern | Pattern |
|---|---|
| `sticky`/`absolute` + `left:50%` + `translateX(-50%)` for horizontal centering | `align-self: center` + `max-width`. Position-based centering assumes the positioned ancestor is full-viewport width; in a narrow fixed-width container the element overflows. Flow-based centering adapts to any container width. |
| Web Component attributes consumed only in `connectedCallback` / `mountApp` | Declare `observedAttributes` and handle in `attributeChangedCallback`. Attributes set after the element mounts (e.g., programmatic `setAttribute` calls or framework re-renders) are silently ignored when the read is mount-only. If remounting on every change is acceptable, trigger `unmount` + `mount` from `attributeChangedCallback`; if the attribute maps to a prop, call the Svelte `$set` equivalent (see Advanced Custom Element Registration in this file). |
