# React SSE Streaming - Reference Documentation

Complete guide to Server-Sent Events streaming in React 18 applications.

## Table of Contents

1. [SSE Protocol](#sse-protocol)
2. [Fetch ReadableStream](#fetch-readablestream)
3. [React Integration](#react-integration)
4. [Error Handling](#error-handling)
5. [Performance](#performance)
6. [Production Patterns](#production-patterns)

---

## SSE Protocol

### Protocol Format

SSE uses text/event-stream MIME type with simple line-based format:

```
data: Message content\n\n
```

**Field Types**:
- `data:` - Message content (required)
- `event:` - Custom event type (optional)
- `id:` - Event identifier for reconnection (optional)
- `retry:` - Reconnection delay in ms (optional)
- `:` - Comment (keepalive)

**Event Boundaries**: Double newline (`\n\n`) marks end of event

**Multi-line Data**:
```
data: First line\n
data: Second line\n\n
```

### SSE vs WebSocket

| Feature | SSE | WebSocket |
|---------|-----|-----------|
| Direction | Unidirectional (Server → Client) | Bidirectional |
| Protocol | HTTP/1.1, HTTP/2 | Custom upgrade |
| Data | Text only | Text + Binary |
| Reconnection | Automatic | Manual |
| Complexity | Simple | More complex |
| Proxy/Firewall | Better compatibility | May be blocked |

**Use SSE for**: AI streaming, live dashboards, notifications, log tailing
**Use WebSocket for**: Chat, gaming, collaborative editing

---

## Fetch ReadableStream

### Basic Pattern

```javascript
const response = await fetch('/stream');
const reader = response.body.getReader();
const decoder = new TextDecoder('utf-8');

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const text = decoder.decode(value, { stream: true });
  console.log('Chunk:', text);
}
```

**Key Points**:
- `response.body` is a ReadableStream
- `getReader()` obtains exclusive reader lock
- `TextDecoder({ stream: true })` handles multi-byte characters
- Loop until `done === true`

### Chunk Parsing

**Problem**: Chunks don't align with event boundaries

```javascript
// Chunk 1: "data: Hello\nda"
// Chunk 2: "ta: World\n\n"
```

**Solution**: Line buffering

```javascript
async function parseSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');

    // Keep last partial line in buffer
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        yield line.slice(6);
      }
    }
  }

  // Handle remaining buffer
  if (buffer && buffer.startsWith('data: ')) {
    yield buffer.slice(6);
  }
}
```

### TextDecoder Options

```javascript
const decoder = new TextDecoder('utf-8');

// Without stream: true
decoder.decode(chunk1); // May fail on split multi-byte chars

// With stream: true (correct)
decoder.decode(chunk1, { stream: true }); // Buffers partial chars
decoder.decode(chunk2, { stream: true }); // Completes multi-byte char
```

---

## React Integration

### Custom Hook Pattern

```javascript
import { useState, useRef, useEffect, useCallback } from 'react';

function useSSEStream(url) {
  const [data, setData] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const startStream = useCallback(async () => {
    setIsStreaming(true);
    setError(null);
    setData('');

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.slice(6);
            setData((prev) => prev + content);
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setIsStreaming(false);
    }
  }, [url]);

  const stopStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    return () => stopStream(); // Cleanup on unmount
  }, [stopStream]);

  return { data, isStreaming, error, startStream, stopStream };
}
```

### State Management During Streaming

**Problem**: Frequent updates cause performance issues

**Solution 1: Throttled Updates**
```javascript
import { throttle } from 'lodash';

const throttledUpdate = useRef(
  throttle((newData) => setData(newData), 100)
).current;

// In streaming loop
let accumulated = '';
while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  accumulated += decoder.decode(value, { stream: true });
  throttledUpdate(accumulated);
}

// Final update
setData(accumulated);
```

**Solution 2: useRef + Periodic Update**
```javascript
const dataRef = useRef('');
const [displayData, setDisplayData] = useState('');

useEffect(() => {
  const interval = setInterval(() => {
    setDisplayData(dataRef.current);
  }, 100);

  return () => clearInterval(interval);
}, []);

// In stream loop
dataRef.current += chunk; // No re-render
```

### AbortController for Cancellation

```javascript
const abortControllerRef = useRef(null);

const startStream = async () => {
  // Create new controller for each stream
  abortControllerRef.current = new AbortController();

  try {
    const response = await fetch(url, {
      signal: abortControllerRef.current.signal,
    });

    // ... streaming logic
  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Stream cancelled');
    } else {
      throw err;
    }
  }
};

const stopStream = () => {
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
};

useEffect(() => {
  return () => stopStream(); // CRITICAL: Cleanup on unmount
}, []);
```

---

## Error Handling

### Connection Error Types

1. **Network errors**: Connection failed, DNS issues
2. **HTTP errors**: 4xx, 5xx status codes
3. **Parse errors**: Invalid SSE format
4. **Timeout errors**: Request takes too long
5. **Abort errors**: User cancellation (expected)

### Error Handling Pattern

```javascript
async function startStream() {
  try {
    const response = await fetch(url, {
      signal: abortController.signal,
    });

    // Check HTTP status
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType?.includes('text/event-stream')) {
      throw new Error('Invalid content type');
    }

    // Stream processing
    const reader = response.body.getReader();
    // ...

  } catch (err) {
    if (err.name === 'AbortError') {
      console.log('Stream cancelled');
    } else if (err.name === 'TypeError') {
      setError('Network error');
    } else {
      setError(err.message);
    }
  }
}
```

### Automatic Reconnection

```javascript
function useSSEWithRetry(url, maxRetries = 3) {
  const [retryCount, setRetryCount] = useState(0);

  const calculateBackoff = (attempt) => {
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  };

  const startWithRetry = async () => {
    try {
      await startStream();
      setRetryCount(0); // Reset on success
    } catch (err) {
      if (retryCount < maxRetries) {
        const delay = calculateBackoff(retryCount);
        console.log(`Retrying in ${delay}ms...`);

        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          startWithRetry();
        }, delay);
      } else {
        setError('Max retries reached');
      }
    }
  };

  return { startWithRetry };
}
```

---

## Performance

### UI Responsiveness

**requestAnimationFrame Batching**:
```javascript
let pendingUpdate = null;

const scheduleUpdate = (newData) => {
  pendingUpdate = newData;

  requestAnimationFrame(() => {
    if (pendingUpdate) {
      setData(pendingUpdate);
      pendingUpdate = null;
    }
  });
};
```

**React.memo for Children**:
```javascript
const MessageDisplay = React.memo(({ message }) => {
  return <div>{message}</div>;
});

function StreamingChat() {
  const messages = useStreamStore((state) => state.messages);

  return (
    <div>
      {messages.map(msg => (
        <MessageDisplay key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

### Memory Management

**Limit Accumulated Data**:
```javascript
const MAX_LENGTH = 10000;

setData((prev) => {
  const newData = prev + chunk;
  return newData.length > MAX_LENGTH
    ? newData.slice(-MAX_LENGTH)
    : newData;
});
```

**Cleanup Pattern**:
```javascript
const cleanup = useCallback(() => {
  // Cancel fetch
  if (abortControllerRef.current) {
    abortControllerRef.current.abort();
    abortControllerRef.current = null;
  }

  // Release reader lock
  if (readerRef.current) {
    readerRef.current.cancel();
    readerRef.current = null;
  }
}, []);

useEffect(() => {
  return cleanup; // Run on unmount
}, [cleanup]);
```

---

## Production Patterns

### Complete Service Implementation

```javascript
// services/streamingService.js
export class StreamingService {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.abortController = null;
  }

  async stream(endpoint, options = {}) {
    const { onChunk, onComplete, onError, headers = {} } = options;

    try {
      this.abortController = new AbortController();

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(options.body || {}),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          if (onComplete) onComplete();
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (onChunk) onChunk(data);
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim() && buffer.startsWith('data: ')) {
        const data = buffer.slice(6);
        if (onChunk) onChunk(data);
      }

    } catch (err) {
      if (err.name !== 'AbortError') {
        if (onError) onError(err);
      }
    }
  }

  cancel() {
    this.abortController?.abort();
    this.abortController = null;
  }
}
```

### Zustand Integration

```javascript
import { create } from 'zustand';
import { StreamingService } from './streamingService';

const useStreamStore = create((set, get) => ({
  messages: [],
  currentMessage: '',
  isStreaming: false,

  service: new StreamingService('https://api.example.com'),

  startStreaming: async (userMessage) => {
    const { service } = get();

    set({ isStreaming: true, currentMessage: '' });

    await service.stream('/chat/stream', {
      body: { message: userMessage },

      onChunk: (chunk) => {
        set((state) => ({
          currentMessage: state.currentMessage + chunk,
        }));
      },

      onComplete: () => {
        set((state) => ({
          messages: [
            ...state.messages,
            { role: 'user', content: userMessage },
            { role: 'assistant', content: state.currentMessage },
          ],
          currentMessage: '',
          isStreaming: false,
        }));
      },

      onError: (err) => {
        set({ error: err.message, isStreaming: false });
      },
    });
  },

  stopStreaming: () => {
    const { service } = get();
    service.cancel();
    set({ isStreaming: false });
  },
}));
```

---

## Anti-Patterns Table

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **Not handling AbortController cleanup** | Memory leaks from unclosed streams | Always cleanup in useEffect return |
| **Updating state on every chunk** | UI jank from excessive re-renders | Throttle updates to 100-500ms |
| **Not checking response.ok** | Processing error responses as streams | Check status before reading body |
| **Missing TextDecoder stream: true** | Multi-byte chars split incorrectly | Use `{ stream: true }` option |
| **Not buffering partial lines** | Incomplete events parsed | Keep last partial line in buffer |
| **No error handling** | App crashes on network failures | Wrap in try-catch, handle AbortError |
| **Unbounded data accumulation** | Memory exhaustion | Limit accumulated data size |
| **Creating new AbortController per render** | Multiple concurrent streams | Store in ref, cancel before creating new |
| **Not handling network errors** | Silent failures | Check error.name and handle TypeError |
| **Synchronous state updates** | Performance issues | Use throttling or batching |

---

## References

- [MDN: Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [MDN: Using Readable Streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [HTML Spec: Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [SSE vs WebSockets - Ably](https://ably.com/blog/websockets-vs-sse)
