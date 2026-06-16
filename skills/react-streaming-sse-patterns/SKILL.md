---
name: react-streaming-sse-patterns
description: Server-Sent Events (SSE) streaming patterns for React 18 including fetch ReadableStream, chunk parsing, state management, and error handling. Use when implementing LLM token streaming, live updates, or any server-push feature in React.
kb-sources:
  - wiki/software-engineering/react-streaming-sse
updated: 2026-06-10
---

# React Server-Sent Events (SSE) Streaming

Real-time server-to-client streaming using native fetch API and ReadableStream for AI responses, live updates, and event streams.

## When to Use

- Streaming AI/LLM responses (chat, completion)
- Real-time dashboards and live data feeds
- Server push notifications
- Log tailing and monitoring
- Unidirectional data flow (server → client)
- When WebSocket bidirectional is unnecessary

## Quick Reference

### Basic Pattern

`fetch` with `ReadableStream` reader for SSE:
- `response.body.getReader()` provides stream access
- `TextDecoder({ stream: true })` handles multi-byte characters
- Parse line-by-line for SSE format: `data: content\n\n`
- Use `AbortController` for cancellation

See **examples.md** for complete implementations.

### React Hook

Custom hook manages streaming state with cleanup:
- `useState` for data, streaming status, and errors
- `useRef` for AbortController
- Line buffering for partial chunks
- Cleanup in `useEffect` return

See **examples.md** for production hook patterns.

## Key Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Line Buffering** | Handle partial chunks | Split on `\n`, keep last partial line |
| **AbortController** | Stream cancellation | Create per stream, abort on stop/unmount |
| **Throttled Updates** | UI performance | Update state every 100-500ms, not per chunk |
| **Error Retry** | Reconnection logic | Exponential backoff with max retries |
| **State Management** | Zustand integration | Store streaming state, update via actions |

## WebSocket Connection Lifecycle (Bidirectional)

When the feature needs WebSocket instead of SSE, the handshake introduces a race SSE doesn't have. A `connect()` that resolves on socket *construction* (not `onopen`) is a false-ready signal: a message sent in that window can be diverted to an HTTP fallback because the socket "exists" but isn't open.

- **Treat a resolved `connect()` as "socket constructed," not "open."** Route messages on CONNECTED **or** CONNECTING, and rely on the manager's send-queue + flush-on-open so a message issued mid-handshake is queued, not dropped or rerouted.
- **Name the routing predicate for the decision, not the state.** `isConnected()` returning `true` while CONNECTING is a footgun; name it `canUseWebSocket()` so the call site reads as the choice it actually makes.
- **Match the fix to existing infrastructure**: if the manager already queues the pending case, *widen the predicate* (cheap) rather than rewriting the lifecycle — weigh test-breakage cost first.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| **Missing AbortController cleanup** | Return an AbortController cleanup from useEffect — without it, the stream leaks memory and can trigger state updates on unmounted components |
| **Routing WS sends on CONNECTED only** | A `connect()` resolves on construction, not `onopen`; route on CONNECTED-or-CONNECTING via `canUseWebSocket()` + queue-while-pending, or first messages fall back to HTTP |
| **Per-chunk state updates** | Throttle updates to 100-500ms to prevent UI jank |
| **Skipping response.ok check** | Validate HTTP status before reading stream to catch errors early |
| **TextDecoder without stream: true** | Use `{ stream: true }` to handle split multi-byte characters |
| **Parsing without line buffering** | Buffer partial lines between chunks to avoid incomplete events |
| **Missing error handling** | Wrap in try-catch and distinguish AbortError from network errors |
| **Unbounded data accumulation** | Limit buffer size or use sliding window for infinite streams |

---

**See reference.md** for complete SSE protocol details, performance optimization, and production patterns.

**See examples.md** for real streaming implementations from example-frontend project.
