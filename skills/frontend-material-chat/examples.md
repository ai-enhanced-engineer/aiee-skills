# Chat Widget M3 Examples

Production-ready Svelte 5 examples for M3-compliant chat interfaces.

---

## Status Indicator Component

```svelte
<!-- StatusDot.svelte -->
<script lang="ts">
  type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

  let { status = 'disconnected' } = $props<{
    status: ConnectionStatus;
  }>();

  const statusLabels: Record<ConnectionStatus, string> = {
    connected: 'Connected',
    connecting: 'Connecting...',
    disconnected: 'Disconnected'
  };
</script>

<span
  class="status-dot"
  class:connected={status === 'connected'}
  class:connecting={status === 'connecting'}
  class:disconnected={status === 'disconnected'}
  role="status"
  aria-label={`Connection status: ${statusLabels[status]}`}
></span>

<style>
  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .connected { background: var(--widget-status-connected, #22c55e); }
  .connecting {
    background: var(--widget-status-connecting, #eab308);
    animation: pulse 2s ease-in-out infinite;
  }
  .disconnected { background: var(--widget-status-disconnected, #ef4444); }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  @media (prefers-reduced-motion: reduce) {
    .connecting { animation: none; }
  }
</style>
```

---

## Chat Header with Status

```svelte
<!-- ChatHeader.svelte -->
<script lang="ts">
  import StatusDot from './StatusDot.svelte';
  import type { ConnectionStatus } from './types';

  let { title, status, logoUrl, onClose } = $props<{
    title: string;
    status: ConnectionStatus;
    logoUrl?: string;
    onClose: () => void;
  }>();
</script>

<header class="chat-header">
  <div class="header-left">
    {#if logoUrl}
      <img src={logoUrl} alt="" class="header-logo" />
    {/if}
    <StatusDot {status} />
    <span class="header-title">{title}</span>
  </div>
  <button class="close-btn" onclick={onClose} aria-label="Close chat">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  </button>
</header>

<style>
  .chat-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: var(--widget-surface);
    border-bottom: 1px solid var(--widget-border);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .header-logo {
    width: 24px;
    height: 24px;
    filter: var(--widget-logo-filter, brightness(1));
  }

  .header-title {
    font-size: 16px;
    font-weight: 500;
    color: var(--widget-text);
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: transparent;
    border-radius: 50%;
    cursor: pointer;
    color: var(--widget-text-secondary);
    transition: background 0.15s;
  }

  .close-btn:hover {
    background: var(--widget-surface-hover);
  }

  .close-btn:focus-visible {
    outline: 2px solid var(--widget-primary);
    outline-offset: 2px;
  }
</style>
```

---

## Contained Input Bar

```svelte
<!-- InputBar.svelte -->
<script lang="ts">
  let { onSend, disabled = false, placeholder = 'Type a message...' } = $props<{
    onSend: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
  }>();

  let message = $state('');

  let isDisabled = $derived.by(() => {
    return !message.trim() || disabled;
  });

  function handleSubmit(e: Event) {
    e.preventDefault();
    if (!isDisabled) {
      onSend(message.trim());
      message = '';
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }
</script>

<form class="input-container" onsubmit={handleSubmit}>
  <input
    type="text"
    class="message-input"
    bind:value={message}
    onkeydown={handleKeydown}
    {placeholder}
    disabled={disabled}
    aria-label="Message input"
  />
  <button
    type="submit"
    class="send-btn"
    disabled={isDisabled}
    aria-label="Send message"
  >
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  </button>
</form>

<style>
  .input-container {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--widget-surface);
    border: 1px solid var(--widget-input-border, rgba(0, 0, 0, 0.15));
    border-radius: 12px;
    transition: box-shadow 0.15s;
  }

  .input-container:focus-within {
    box-shadow: 0 0 0 3px var(--widget-input-focus-ring, rgba(99, 102, 241, 0.2));
  }

  .message-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 14px;
    color: var(--widget-text);
    outline: none;
  }

  .message-input::placeholder {
    color: var(--widget-text-secondary);
  }

  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border: none;
    background: var(--widget-primary);
    color: var(--widget-on-primary, white);
    border-radius: 50%;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-btn:not(:disabled):hover {
    opacity: 0.9;
  }

  .send-btn:focus-visible {
    outline: 2px solid var(--widget-primary);
    outline-offset: 2px;
  }

  /* Mobile touch targets */
  @media (max-width: 599px) {
    .send-btn {
      width: 44px;
      height: 44px;
    }
  }
</style>
```

---

## Empty State with Branding

```svelte
<!-- EmptyState.svelte -->
<script lang="ts">
  let { logoUrl, brandName } = $props<{
    logoUrl: string;
    brandName: string;
  }>();
</script>

<div class="empty-state">
  <div class="branding-container">
    <img
      src={logoUrl}
      alt={brandName}
      class="brand-logo"
    />
    <span class="brand-name">{brandName}</span>
  </div>
</div>

<style>
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 24px;
  }

  .branding-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 24px 32px;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    border-radius: 16px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    animation: gentle-pulse 3s ease-in-out infinite;
  }

  .brand-logo {
    width: 64px;
    height: 64px;
    filter: var(--widget-logo-filter, brightness(1));
  }

  .brand-name {
    font-size: 14px;
    font-weight: 500;
    color: var(--widget-text-secondary);
  }

  @keyframes gentle-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.95; transform: scale(0.98); }
  }

  @media (prefers-reduced-motion: reduce) {
    .branding-container { animation: none; }
  }

  /* Dark theme */
  :global(.dark-theme) .branding-container {
    background: rgba(0, 0, 0, 0.6);
  }
</style>
```

---

## Typing Indicator

```svelte
<!-- TypingIndicator.svelte -->
<script lang="ts">
  let { assistantName = 'Assistant' } = $props<{
    assistantName?: string;
  }>();
</script>

<div class="typing-wrapper" role="status" aria-label="{assistantName} is typing">
  <div class="typing-indicator">
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
    <span class="typing-dot"></span>
  </div>
</div>

<style>
  .typing-wrapper {
    display: flex;
    align-items: flex-start;
    padding: 8px 16px;
  }

  .typing-indicator {
    display: flex;
    gap: 4px;
    padding: 12px 16px;
    background: var(--md-sys-color-surface-variant, #e7e0ec);
    border-radius: 16px;
    border-bottom-left-radius: 8px;
  }

  .typing-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--md-sys-color-tertiary, #7d5260);
    animation: typing-bounce 1.4s infinite ease-in-out;
  }

  .typing-dot:nth-child(1) { animation-delay: 0s; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes typing-bounce {
    0%, 80%, 100% { transform: scale(0.6); opacity: 0.5; }
    40% { transform: scale(1); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .typing-dot {
      animation: none;
      opacity: 0.7;
    }
  }
</style>
```

---

## Message Bubble

```svelte
<!-- MessageBubble.svelte -->
<script lang="ts">
  type MessageType = 'user' | 'assistant';

  let { content, type, timestamp } = $props<{
    content: string;
    type: MessageType;
    timestamp?: Date;
  }>();

  let formattedTime = $derived(
    timestamp ? timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
  );
</script>

<div class="message-wrapper" class:outgoing={type === 'user'}>
  <div class="message-bubble" class:user={type === 'user'} class:assistant={type === 'assistant'}>
    <p class="message-content">{content}</p>
    {#if formattedTime}
      <span class="message-time">{formattedTime}</span>
    {/if}
  </div>
</div>

<style>
  .message-wrapper {
    display: flex;
    padding: 4px 16px;
  }

  .message-wrapper.outgoing {
    justify-content: flex-end;
  }

  .message-bubble {
    max-width: 80%;
    padding: 12px 16px;
    border-radius: 16px;
  }

  .message-bubble.user {
    background: var(--md-sys-color-primary-container, #eaddff);
    color: var(--md-sys-color-on-primary-container, #21005e);
    border-bottom-right-radius: 8px;
  }

  .message-bubble.assistant {
    background: var(--md-sys-color-surface-variant, #e7e0ec);
    color: var(--md-sys-color-on-surface-variant, #49454f);
    border-bottom-left-radius: 8px;
  }

  .message-content {
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message-time {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.7;
    text-align: right;
  }
</style>
```
