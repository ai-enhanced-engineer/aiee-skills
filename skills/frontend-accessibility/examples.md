# Frontend Accessibility Examples

Svelte 5 accessible component patterns with chat widget focus.

## Accessible Button

```svelte
<script lang="ts">
  interface Props {
    onclick: () => void;
    disabled?: boolean;
    loading?: boolean;
    label: string;
    children: any;
  }

  let { onclick, disabled = false, loading = false, label, children }: Props = $props();
</script>

<button
  {onclick}
  disabled={disabled || loading}
  aria-label={label}
  aria-busy={loading}
  aria-disabled={disabled}
>
  {#if loading}
    <span class="sr-only">Loading...</span>
    <span aria-hidden="true" class="spinner"></span>
  {:else}
    {@render children()}
  {/if}
</button>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

## Accessible Modal

```svelte
<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: any;
  }

  let { open = $bindable(false), title, onclose, children }: Props = $props();

  let dialogRef: HTMLDialogElement;
  let previouslyFocused: HTMLElement | null = null;

  $effect(() => {
    if (open) {
      previouslyFocused = document.activeElement as HTMLElement;
      dialogRef?.showModal();
    } else {
      dialogRef?.close();
      previouslyFocused?.focus();
    }
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      onclose();
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === dialogRef) {
      onclose();
    }
  }
</script>

<dialog
  bind:this={dialogRef}
  onkeydown={handleKeydown}
  onclick={handleBackdropClick}
  aria-labelledby="dialog-title"
  aria-modal="true"
>
  <header>
    <h2 id="dialog-title">{title}</h2>
    <button
      onclick={onclose}
      aria-label="Close dialog"
      class="close-btn"
    >
      <span aria-hidden="true">&times;</span>
    </button>
  </header>
  <div class="content">
    {@render children()}
  </div>
</dialog>

<style>
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
  }

  dialog {
    border: none;
    border-radius: 8px;
    padding: 0;
    max-width: 500px;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    border-bottom: 1px solid #eee;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0.25rem;
  }

  .close-btn:focus-visible {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }
</style>
```

## Accessible Form Input

```svelte
<script lang="ts">
  interface Props {
    id: string;
    label: string;
    type?: string;
    value: string;
    error?: string;
    hint?: string;
    required?: boolean;
  }

  let {
    id,
    label,
    type = 'text',
    value = $bindable(''),
    error,
    hint,
    required = false
  }: Props = $props();

  let describedBy = $derived(
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(' ') || undefined
  );
</script>

<div class="field" class:has-error={error}>
  <label for={id}>
    {label}
    {#if required}
      <span aria-hidden="true" class="required">*</span>
      <span class="sr-only">(required)</span>
    {/if}
  </label>

  <input
    {id}
    {type}
    bind:value
    {required}
    aria-invalid={error ? 'true' : undefined}
    aria-describedby={describedBy}
  />

  {#if hint && !error}
    <span id="{id}-hint" class="hint">{hint}</span>
  {/if}

  {#if error}
    <span id="{id}-error" class="error" role="alert">
      {error}
    </span>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .required {
    color: #dc3545;
  }

  .has-error input {
    border-color: #dc3545;
  }

  .error {
    color: #dc3545;
    font-size: 0.875rem;
  }

  .hint {
    color: #6c757d;
    font-size: 0.875rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

## Chat Widget - Accessible Message List

```svelte
<script lang="ts">
  interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }

  interface Props {
    messages: Message[];
  }

  let { messages }: Props = $props();

  let listRef: HTMLElement;

  // Auto-scroll to new messages
  $effect(() => {
    if (messages.length > 0) {
      listRef?.scrollTo({ top: listRef.scrollHeight, behavior: 'smooth' });
    }
  });

  function formatTime(date: Date): string {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
</script>

<div
  bind:this={listRef}
  class="message-list"
  role="log"
  aria-label="Chat messages"
  aria-live="polite"
  aria-atomic="false"
>
  {#each messages as message (message.id)}
    <article
      class="message {message.role}"
      aria-label="{message.role === 'user' ? 'You' : 'Assistant'} said"
    >
      <div class="content">{message.content}</div>
      <time
        datetime={message.timestamp.toISOString()}
        class="timestamp"
      >
        {formatTime(message.timestamp)}
      </time>
    </article>
  {/each}
</div>

<style>
  .message-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
    padding: 1rem;
    max-height: 400px;
  }

  .message {
    max-width: 80%;
    padding: 0.75rem;
    border-radius: 12px;
  }

  .message.user {
    align-self: flex-end;
    background: #007bff;
    color: white;
  }

  .message.assistant {
    align-self: flex-start;
    background: #f0f0f0;
  }

  .timestamp {
    font-size: 0.75rem;
    opacity: 0.7;
    display: block;
    margin-top: 0.25rem;
  }
</style>
```

## Chat Widget - Accessible Input with Send

```svelte
<script lang="ts">
  interface Props {
    onsubmit: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
  }

  let { onsubmit, disabled = false, placeholder = 'Type a message...' }: Props = $props();

  let input = $state('');
  let inputRef: HTMLInputElement;

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || disabled) return;

    onsubmit(trimmed);
    input = '';
    inputRef?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
</script>

<form
  onsubmit|preventDefault={handleSubmit}
  class="message-input"
  role="search"
  aria-label="Send a message"
>
  <label for="chat-input" class="sr-only">
    Message
  </label>
  <input
    bind:this={inputRef}
    bind:value={input}
    id="chat-input"
    type="text"
    {placeholder}
    {disabled}
    aria-describedby="input-hint"
    autocomplete="off"
  />
  <span id="input-hint" class="sr-only">
    Press Enter to send, or use the Send button
  </span>
  <button
    type="submit"
    disabled={disabled || !input.trim()}
    aria-label="Send message"
  >
    <span aria-hidden="true">→</span>
  </button>
</form>

<style>
  .message-input {
    display: flex;
    gap: 0.5rem;
    padding: 1rem;
    border-top: 1px solid #eee;
  }

  input {
    flex: 1;
    padding: 0.75rem;
    border: 1px solid #ccc;
    border-radius: 20px;
    font-size: 1rem;
  }

  input:focus-visible {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  button {
    padding: 0.75rem 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  button:focus-visible {
    outline: 2px solid #007bff;
    outline-offset: 2px;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

## Typing Indicator (Accessible)

```svelte
<script lang="ts">
  interface Props {
    visible: boolean;
  }

  let { visible }: Props = $props();
</script>

{#if visible}
  <div
    class="typing-indicator"
    role="status"
    aria-live="polite"
    aria-label="Assistant is typing"
  >
    <span class="sr-only">Assistant is typing</span>
    <span class="dot" aria-hidden="true"></span>
    <span class="dot" aria-hidden="true"></span>
    <span class="dot" aria-hidden="true"></span>
  </div>
{/if}

<style>
  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 0.75rem;
    background: #f0f0f0;
    border-radius: 12px;
    width: fit-content;
  }

  .dot {
    width: 8px;
    height: 8px;
    background: #666;
    border-radius: 50%;
    animation: bounce 1.4s infinite ease-in-out both;
  }

  .dot:nth-child(2) { animation-delay: 0.16s; }
  .dot:nth-child(3) { animation-delay: 0.32s; }

  @keyframes bounce {
    0%, 80%, 100% { transform: scale(0); }
    40% { transform: scale(1); }
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Respect reduced motion preference */
  @media (prefers-reduced-motion: reduce) {
    .dot {
      animation: none;
      opacity: 0.6;
    }
  }
</style>
```

## Connection Status (Live Region)

```svelte
<script lang="ts">
  type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

  interface Props {
    status: ConnectionState;
  }

  let { status }: Props = $props();

  const statusMessages: Record<ConnectionState, string> = {
    connecting: 'Connecting to chat...',
    connected: 'Connected',
    disconnected: 'Connection lost. Attempting to reconnect...',
    error: 'Connection error. Please try again.'
  };
</script>

<div
  class="connection-status {status}"
  role="status"
  aria-live="assertive"
  aria-atomic="true"
>
  <span class="indicator" aria-hidden="true"></span>
  <span class="message">{statusMessages[status]}</span>
</div>

<style>
  .connection-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    font-size: 0.875rem;
  }

  .indicator {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .connected .indicator { background: #28a745; }
  .connecting .indicator { background: #ffc107; }
  .disconnected .indicator { background: #dc3545; }
  .error .indicator { background: #dc3545; }

  .connected { color: #28a745; }
  .error { color: #dc3545; }
</style>
```

## Skip Link (For Widget)

```svelte
<script lang="ts">
  // Skip link allows keyboard users to jump directly to chat input
</script>

<a href="#chat-input" class="skip-link">
  Skip to chat input
</a>

<style>
  .skip-link {
    position: absolute;
    top: -40px;
    left: 0;
    padding: 0.5rem 1rem;
    background: #007bff;
    color: white;
    text-decoration: none;
    z-index: 100;
  }

  .skip-link:focus {
    top: 0;
  }
</style>
```

## Focus Trap Utility

```typescript
// utils/focus-trap.ts
export function createFocusTrap(container: HTMLElement) {
  const focusableSelectors = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(', ');

  let previouslyFocused: HTMLElement | null = null;

  function getFocusableElements(): HTMLElement[] {
    return Array.from(container.querySelectorAll(focusableSelectors));
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  return {
    activate() {
      previouslyFocused = document.activeElement as HTMLElement;
      container.addEventListener('keydown', handleKeydown);
      const focusable = getFocusableElements();
      focusable[0]?.focus();
    },
    deactivate() {
      container.removeEventListener('keydown', handleKeydown);
      previouslyFocused?.focus();
    }
  };
}
```

## Web Component with Accessibility

```svelte
<svelte:options customElement={{ tag: 'chat-widget', shadow: 'open' }} />

<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let { clientId = '' } = $props();

  // Announce widget state changes to screen readers
  let announcement = $state('');

  function announce(message: string) {
    announcement = '';
    // Small delay to ensure screen reader picks up change
    requestAnimationFrame(() => {
      announcement = message;
    });
  }

  onMount(() => {
    announce('Chat widget loaded. Press Enter to start chatting.');
  });
</script>

<!-- Live region for announcements -->
<div
  class="sr-only"
  role="status"
  aria-live="polite"
  aria-atomic="true"
>
  {announcement}
</div>

<div class="widget" role="region" aria-label="Chat support">
  <!-- Widget content -->
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
```

## ARIA Essentials

```html
<!-- Landmarks -->
<header role="banner">
<nav role="navigation" aria-label="Main">
<main role="main">
<footer role="contentinfo">

<!-- Live regions (for dynamic content like chat) -->
<div role="status" aria-live="polite" aria-atomic="true">
  <!-- Screen reader announces changes -->
</div>

<!-- Accessible buttons -->
<button aria-label="Close dialog" aria-pressed="false">
```

## Focus-Visible CSS

```css
button:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}
```

**Why `:focus-visible` over `:focus`:** `:focus` shows outline on mouse click too, which is annoying for mouse users. `:focus-visible` only activates for keyboard navigation.

## Motion and Animation (prefers-reduced-motion)

```css
.spinner {
  animation: spin 1s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
}
```

## Progressive Disclosure with Native HTML

Use native `<details>` elements instead of custom JavaScript accordions:

```html
<details class="expandable-section">
  <summary>
    <h3>Section Title</h3>
    <span class="chevron" aria-hidden="true">▼</span>
  </summary>
  <div class="expanded-content">
    <!-- Content here -->
  </div>
</details>
```

```css
details summary {
  cursor: pointer;
  list-style: none;
  user-select: none;
}

details summary::-webkit-details-marker {
  display: none;
}

details[open] .chevron {
  transform: rotate(180deg);
}

details summary:focus {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
}
```

**Benefits:**
- Built-in keyboard navigation (Tab, Enter/Space to toggle)
- Screen readers announce "collapsed/expanded" state automatically
- Works without JavaScript
- Less code to maintain

**When to use:** FAQs, expandable cards, skill lists, workflow phases, any progressive disclosure pattern

## Decorative Elements with Text Alternatives

```html
<!-- Visual arrows (hidden from screen readers) -->
<div class="flow-arrow" aria-hidden="true">...</div>

<!-- Text alternative for screen readers and mobile -->
<p class="flow-description">
  After Phase 5, teams iterate back to Phase 1 (max 3 cycles).
</p>
```

**Responsive strategy:**
- Desktop (1024px+): Show visual arrows, hide text description
- Mobile/tablet: Hide arrows, show text description
