# Svelte Production Patterns - Examples

## DataTable Component

```svelte
<!-- DataTable.svelte -->
<script lang="ts">
  interface Column<T> {
    key: keyof T;
    label: string;
    sortable?: boolean;
    render?: (value: T[keyof T], row: T) => string;
  }

  interface Props<T> {
    data: T[];
    columns: Column<T>[];
    pageSize?: number;
  }

  let { data, columns, pageSize = 10 }: Props<Record<string, any>> = $props();

  let sortKey = $state<string | null>(null);
  let sortDirection = $state<'asc' | 'desc'>('asc');
  let currentPage = $state(1);
  let searchQuery = $state('');

  // Filtered data
  let filtered = $derived.by(() => {
    if (!searchQuery) return data;
    const query = searchQuery.toLowerCase();
    return data.filter(row =>
      columns.some(col =>
        String(row[col.key]).toLowerCase().includes(query)
      )
    );
  });

  // Sorted data
  let sorted = $derived.by(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey!];
      const bVal = b[sortKey!];
      const modifier = sortDirection === 'asc' ? 1 : -1;
      return aVal < bVal ? -1 * modifier : aVal > bVal ? 1 * modifier : 0;
    });
  });

  // Paginated data
  let paginated = $derived(
    sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  );

  let totalPages = $derived(Math.ceil(filtered.length / pageSize));

  function toggleSort(key: string) {
    if (sortKey === key) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortKey = key;
      sortDirection = 'asc';
    }
  }
</script>

<div class="datatable">
  <div class="toolbar">
    <input
      type="search"
      placeholder="Search..."
      bind:value={searchQuery}
    />
    <span class="count">{filtered.length} results</span>
  </div>

  <table>
    <thead>
      <tr>
        {#each columns as column}
          <th
            class:sortable={column.sortable}
            class:sorted={sortKey === column.key}
            onclick={() => column.sortable && toggleSort(column.key as string)}
          >
            {column.label}
            {#if sortKey === column.key}
              <span class="sort-indicator">
                {sortDirection === 'asc' ? '▲' : '▼'}
              </span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each paginated as row}
        <tr>
          {#each columns as column}
            <td>
              {column.render
                ? column.render(row[column.key], row)
                : row[column.key]}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="pagination">
    <button
      disabled={currentPage === 1}
      onclick={() => currentPage--}
    >
      Previous
    </button>
    <span>Page {currentPage} of {totalPages}</span>
    <button
      disabled={currentPage === totalPages}
      onclick={() => currentPage++}
    >
      Next
    </button>
  </div>
</div>

<style>
  .datatable {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th, td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #eee;
  }

  th.sortable {
    cursor: pointer;
    user-select: none;
  }

  th.sortable:hover {
    background: #f5f5f5;
  }

  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
  }
</style>
```

### Usage

```svelte
<script>
  import DataTable from './DataTable.svelte';

  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com', role: 'Admin' },
    { id: 2, name: 'Bob', email: 'bob@example.com', role: 'User' },
    // ...
  ];

  const columns = [
    { key: 'name', label: 'Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'role', label: 'Role', sortable: true },
    {
      key: 'id',
      label: 'Actions',
      render: (_, row) => `<a href="/users/${row.id}">Edit</a>`
    }
  ];
</script>

<DataTable data={users} {columns} pageSize={20} />
```

## Modal Component

```svelte
<!-- Modal.svelte -->
<script lang="ts">
  import { fade, fly } from 'svelte/transition';

  interface Props {
    open: boolean;
    title?: string;
    onclose?: () => void;
    children: any;
  }

  let { open = $bindable(false), title, onclose, children }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function close() {
    open = false;
    onclose?.();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="backdrop"
    transition:fade={{ duration: 200 }}
    onclick={handleBackdropClick}
    role="dialog"
    aria-modal="true"
    aria-labelledby={title ? 'modal-title' : undefined}
  >
    <div
      class="modal"
      transition:fly={{ y: -20, duration: 200 }}
    >
      {#if title}
        <header>
          <h2 id="modal-title">{title}</h2>
          <button class="close" onclick={close} aria-label="Close">×</button>
        </header>
      {/if}
      <div class="content">
        {@render children()}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: grid;
    place-items: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow: auto;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #eee;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
  }

  .close {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
  }

  .content {
    padding: 1rem;
  }
</style>
```

## Form with Validation

```svelte
<!-- ContactForm.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';

  interface FormData {
    name: string;
    email: string;
    message: string;
  }

  let form = $state<FormData>({
    name: '',
    email: '',
    message: ''
  });

  let errors = $state<Partial<Record<keyof FormData, string>>>({});
  let submitting = $state(false);
  let submitted = $state(false);

  function validate(): boolean {
    errors = {};

    if (!form.name.trim()) {
      errors.name = 'Name is required';
    }

    if (!form.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      errors.email = 'Invalid email format';
    }

    if (!form.message.trim()) {
      errors.message = 'Message is required';
    } else if (form.message.length < 10) {
      errors.message = 'Message must be at least 10 characters';
    }

    return Object.keys(errors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;

    submitting = true;
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      if (response.ok) {
        submitted = true;
        form = { name: '', email: '', message: '' };
      }
    } finally {
      submitting = false;
    }
  }
</script>

{#if submitted}
  <div class="success">
    <p>Thank you for your message! We'll be in touch soon.</p>
    <button onclick={() => submitted = false}>Send another</button>
  </div>
{:else}
  <form onsubmit|preventDefault={handleSubmit}>
    <div class="field" class:error={errors.name}>
      <label for="name">Name</label>
      <input
        id="name"
        type="text"
        bind:value={form.name}
        aria-invalid={!!errors.name}
        aria-describedby={errors.name ? 'name-error' : undefined}
      />
      {#if errors.name}
        <span id="name-error" class="error-message">{errors.name}</span>
      {/if}
    </div>

    <div class="field" class:error={errors.email}>
      <label for="email">Email</label>
      <input
        id="email"
        type="email"
        bind:value={form.email}
        aria-invalid={!!errors.email}
      />
      {#if errors.email}
        <span class="error-message">{errors.email}</span>
      {/if}
    </div>

    <div class="field" class:error={errors.message}>
      <label for="message">Message</label>
      <textarea
        id="message"
        bind:value={form.message}
        rows="5"
        aria-invalid={!!errors.message}
      ></textarea>
      {#if errors.message}
        <span class="error-message">{errors.message}</span>
      {/if}
    </div>

    <button type="submit" disabled={submitting}>
      {submitting ? 'Sending...' : 'Send Message'}
    </button>
  </form>
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-width: 400px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field.error input,
  .field.error textarea {
    border-color: #dc3545;
  }

  .error-message {
    color: #dc3545;
    font-size: 0.875rem;
  }

  input, textarea {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  button {
    padding: 0.75rem 1.5rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .success {
    text-align: center;
    padding: 2rem;
    background: #d4edda;
    border-radius: 8px;
  }
</style>
```

## Chat Widget (Web Component)

```svelte
<!-- ChatWidget.svelte -->
<svelte:options customElement="chat-widget" />

<script lang="ts">
  interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
  }

  let { clientId = '' } = $props();

  let messages = $state<Message[]>([]);
  let input = $state('');
  let open = $state(false);
  let loading = $state(false);

  async function sendMessage() {
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: input
    };

    messages = [...messages, userMessage];
    input = '';
    loading = true;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-ID': clientId
        },
        body: JSON.stringify({ message: userMessage.content })
      });

      const data = await response.json();

      messages = [...messages, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.response
      }];
    } finally {
      loading = false;
    }
  }
</script>

<div class="widget" class:open>
  {#if open}
    <div class="chat">
      <header>
        <span>Chat Support</span>
        <button onclick={() => open = false}>×</button>
      </header>

      <div class="messages">
        {#each messages as message}
          <div class="message {message.role}">
            {message.content}
          </div>
        {/each}
        {#if loading}
          <div class="message assistant loading">Thinking...</div>
        {/if}
      </div>

      <form onsubmit|preventDefault={sendMessage}>
        <input
          type="text"
          bind:value={input}
          placeholder="Type a message..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  {:else}
    <button class="trigger" onclick={() => open = true}>
      💬
    </button>
  {/if}
</div>

<style>
  .widget {
    position: fixed;
    bottom: 20px;
    right: 20px;
    font-family: system-ui, sans-serif;
  }

  .trigger {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: none;
    background: #007bff;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .chat {
    width: 350px;
    height: 500px;
    background: white;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
  }

  header {
    padding: 1rem;
    background: #007bff;
    color: white;
    border-radius: 12px 12px 0 0;
    display: flex;
    justify-content: space-between;
  }

  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .message {
    padding: 0.75rem;
    border-radius: 12px;
    max-width: 80%;
  }

  .message.user {
    background: #007bff;
    color: white;
    align-self: flex-end;
  }

  .message.assistant {
    background: #f0f0f0;
    align-self: flex-start;
  }

  form {
    display: flex;
    padding: 1rem;
    gap: 0.5rem;
    border-top: 1px solid #eee;
  }

  input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
</style>
```

## TypeScript/Vitest Testing Patterns

### Test Naming Convention

```typescript
describe('ComponentName', () => {
  describe('methodName', () => {
    it('should do X when Y', () => {});
  });
});

// Example: Naming pattern for WebSocket manager
describe('WebSocketManager', () => {
  describe('connect', () => {
    it('should establish connection with valid clientId', async () => {});
    it('should throw error when clientId is empty', async () => {});
  });
  describe('send', () => {
    it('should queue messages when not connected', () => {});
  });
});
```

### Type-Safe Test Fixtures

```typescript
import { describe, it, expect, vi } from 'vitest';

// Create fixtures that match your types - TypeScript will error if mismatched
const mockMessage: WebSocketMessage = {
  type: 'assistant_chunk',
  data: { content: 'Hello', is_final: false }
};

const mockSession: ChatSession = {
  id: 'session_123',
  visitor_id: 'visitor_abc',
  messages: []
};
```

### Testing Svelte 5 Runes

```typescript
import { render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

// Testing $state reactivity
test('updates when state changes', async () => {
  const { component } = render(Counter);
  expect(screen.getByText('Count: 0')).toBeInTheDocument();

  component.count = 5;
  await tick();
  expect(screen.getByText('Count: 5')).toBeInTheDocument();
});

// Testing $derived reactivity
test('derived value updates automatically', async () => {
  const { component } = render(ItemList);
  component.items = [1, 2, 3];
  await tick();
  // $derived(items.length) should now be 3
  expect(screen.getByText('Count: 3')).toBeInTheDocument();
});
```

### Mocking with Vitest

```typescript
import { vi, beforeEach, afterEach } from 'vitest';

// Mock a module
vi.mock('./api', () => ({
  fetchData: vi.fn().mockResolvedValue({ data: 'test' })
}));

// Mock a function
const mockFn = vi.fn();
mockFn.mockReturnValue('value');

// Mock WebSocket
class MockWebSocket {
  onopen: (() => void) | null = null;
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: Event) => void) | null = null;
  onclose: (() => void) | null = null;
  send = vi.fn();
  close = vi.fn();
}

// Trigger events in tests
mockWs.onopen?.();
mockWs.onmessage?.({ data: JSON.stringify(message) } as MessageEvent);
```

### Testing Async Operations

```typescript
// Await async operations
test('async operation completes', async () => {
  const result = await fetchData();
  expect(result).toBe('expected');
});

// Wait for DOM updates after state change
import { tick } from 'svelte';
await tick();

// Wait for setTimeout
await new Promise(resolve => setTimeout(resolve, 100));
```

### Testing Error Cases

```typescript
test('throws on invalid input', () => {
  expect(() => validate(null)).toThrow('Invalid input');
});

test('rejects promise on error', async () => {
  await expect(asyncFn()).rejects.toThrow('Error message');
});
```

### Testing Event Handlers

```typescript
import { fireEvent } from '@testing-library/svelte';

test('click handler is called', async () => {
  const handleClick = vi.fn();
  render(Button, { props: { onclick: handleClick } });

  await fireEvent.click(screen.getByRole('button'));
  expect(handleClick).toHaveBeenCalledTimes(1);
});
```

### Coverage Requirements

- Minimum 80% coverage for production code
- Test files excluded from coverage
- Focus on behavior, not implementation details
- Every interface change requires test updates

## Web Component with Shadow DOM Theming

Complete example showing theme isolation and customization:

```typescript
// widget-entry.ts - Entry point for Web Component
import { mount, unmount } from 'svelte';
import Widget from './Widget.svelte';
import { sharedStyles } from './styles/shared';

class ThemedWidget extends HTMLElement {
  private _app: any = null;
  private _shadowRoot: ShadowRoot;

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    // Inject shared styles into Shadow DOM
    const styleSheet = new CSSStyleSheet();
    styleSheet.replaceSync(sharedStyles);
    this._shadowRoot.adoptedStyleSheets = [styleSheet];

    // Create mount point
    const container = document.createElement('div');
    container.className = 'widget-root';
    this._shadowRoot.appendChild(container);

    // Mount Svelte component
    this._app = mount(Widget, {
      target: container,
      props: {
        clientId: this.getAttribute('client-id') || '',
        theme: this.getAttribute('theme') || 'light',
        position: this.getAttribute('position') || 'bottom-right'
      }
    });
  }

  disconnectedCallback() {
    if (this._app) {
      unmount(this._app);
      this._app = null;
    }
  }

  static get observedAttributes() {
    return ['theme'];
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (name === 'theme' && this._app && oldValue !== newValue) {
      // Trigger theme change
      this._shadowRoot.host.setAttribute('data-theme', newValue);
    }
  }
}

customElements.define('themed-widget', ThemedWidget);
```

```typescript
// styles/shared.ts - CSS custom properties for theming
export const sharedStyles = `
  :host {
    /* Base tokens */
    --widget-primary: #6366f1;
    --widget-on-primary: #ffffff;
    --widget-surface: #ffffff;
    --widget-on-surface: #1f2937;
    --widget-surface-variant: #f3f4f6;
    --widget-border: rgba(0, 0, 0, 0.1);
    --widget-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    --widget-radius-sm: 8px;
    --widget-radius-md: 12px;
    --widget-radius-lg: 16px;
    --widget-logo-filter: brightness(1);

    /* Typography */
    --widget-font-family: system-ui, -apple-system, sans-serif;
    --widget-font-size-sm: 12px;
    --widget-font-size-md: 14px;
    --widget-font-size-lg: 16px;
  }

  :host([data-theme="dark"]) {
    --widget-surface: #1f2937;
    --widget-on-surface: #f9fafb;
    --widget-surface-variant: #374151;
    --widget-border: rgba(255, 255, 255, 0.1);
    --widget-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    --widget-logo-filter: brightness(1.1);
  }

  .widget-root {
    font-family: var(--widget-font-family);
    font-size: var(--widget-font-size-md);
    color: var(--widget-on-surface);
  }
`;
```

```svelte
<!-- Widget.svelte -->
<script lang="ts">
  let { clientId, theme = 'light', position = 'bottom-right' } = $props();

  let open = $state(false);
</script>

<div class="widget-container" class:open data-position={position}>
  {#if open}
    <div class="widget-panel">
      <header class="widget-header">
        <img src="logo.png" alt="" class="logo" />
        <span class="title">Support</span>
        <button class="close-btn" onclick={() => open = false}>×</button>
      </header>
      <main class="widget-content">
        <!-- Chat content here -->
        <slot />
      </main>
    </div>
  {:else}
    <button class="widget-trigger" onclick={() => open = true}>
      <span class="trigger-icon">💬</span>
    </button>
  {/if}
</div>

<style>
  .widget-container {
    position: fixed;
    z-index: 9999;
  }

  .widget-container[data-position="bottom-right"] {
    bottom: 20px;
    right: 20px;
  }

  .widget-container[data-position="bottom-left"] {
    bottom: 20px;
    left: 20px;
  }

  .widget-trigger {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: var(--widget-primary);
    color: var(--widget-on-primary);
    cursor: pointer;
    box-shadow: var(--widget-shadow);
    font-size: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
  }

  .widget-trigger:hover {
    transform: scale(1.05);
  }

  .widget-panel {
    width: 380px;
    height: 600px;
    background: var(--widget-surface);
    border-radius: var(--widget-radius-lg);
    box-shadow: var(--widget-shadow);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .widget-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: var(--widget-surface-variant);
    border-bottom: 1px solid var(--widget-border);
  }

  .logo {
    width: 24px;
    height: 24px;
    filter: var(--widget-logo-filter);
  }

  .title {
    flex: 1;
    font-size: var(--widget-font-size-lg);
    font-weight: 500;
    color: var(--widget-on-surface);
  }

  .close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: transparent;
    color: var(--widget-on-surface);
    font-size: 20px;
    cursor: pointer;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .close-btn:hover {
    background: var(--widget-border);
  }

  .widget-content {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
  }

  /* Responsive adjustments */
  @media (max-width: 420px) {
    .widget-panel {
      width: 100vw;
      height: 100vh;
      border-radius: 0;
      position: fixed;
      top: 0;
      left: 0;
    }
  }
</style>
```

### Host Page Integration

```html
<!-- Customer's website -->
<script src="https://cdn.example.com/widget.js"></script>

<style>
  /* Override widget colors from host page */
  themed-widget {
    --widget-primary: #2563eb;  /* Custom brand blue */
  }
</style>

<themed-widget
  client-id="customer_123"
  theme="light"
  position="bottom-right"
></themed-widget>

<script>
  // Toggle theme programmatically
  document.querySelector('themed-widget').setAttribute('theme', 'dark');
</script>
```

---

## Two-Style-Element Pattern Implementation

Separate permanent layout styles from mutable theme styles to prevent layout regressions during theme switching.

```typescript
class MyWidgetElement extends HTMLElement {
  private layoutStyleEl: HTMLStyleElement;
  private themeStyleEl: HTMLStyleElement;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });

    // Permanent layout styles — prepended, never replaced
    this.layoutStyleEl = document.createElement('style');
    this.layoutStyleEl.textContent = `
      :host { display: block; }
      .container { display: flex; flex-direction: column; height: 100%; }
      .header { flex-shrink: 0; }
      .content { flex: 1; overflow-y: auto; }
    `;
    this.shadowRoot!.prepend(this.layoutStyleEl);

    // Mutable theme styles — appended, swapped on theme change
    this.themeStyleEl = document.createElement('style');
    this.shadowRoot!.append(this.themeStyleEl);
  }

  private applyTheme(theme: 'light' | 'dark') {
    // Only replace the theme style element — layout styles are untouched
    this.themeStyleEl.textContent = theme === 'light'
      ? `:host { --bg: #fff; --fg: #1a1a1a; --border: #e5e5e5; }`
      : `:host { --bg: #1a1a1a; --fg: #fff; --border: #333; }`;
  }

  static get observedAttributes() { return ['theme']; }

  attributeChangedCallback(name: string, _old: string, value: string) {
    if (name === 'theme') this.applyTheme(value as 'light' | 'dark');
  }
}
```

**Key insight:** Two `<style>` elements in Shadow DOM — the first (prepended) holds layout that never changes, the second (appended) holds theme colors that get swapped. This prevents theme switches from accidentally destroying layout rules.

## Responsive Image Optimization

### WebP with `<picture>` Fallback

```html
<picture>
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="Description" width="600" height="400">
</picture>
```

### Image Processing Pipeline (macOS, zero dependencies)

```bash
# Proportional resize
sips -Z 480 image.png
# Exact resize
sips -z 384 480 image.png
# WebP conversion
cwebp -q 80 image.png -o image.webp
```

### Retina Sizing Rules
- **Small images** (icons, thumbnails): 4x CSS display size (e.g., 120x96 display → 480x384 source)
- **Full-width images**: Original resolution as high-DPI srcset (e.g., 1440px viewport × 2x = 2880px source)
