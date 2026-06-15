# React SSE Streaming Examples - example-frontend

Example patterns from a example-frontend project.

## Project Implementation

### API Service with Streaming

**File**: `/src/services/api.service.js`

Complete streaming implementation using fetch and ReadableStream.

```javascript
/**
 * Stream request with SSE
 * @param {string} url - Stream endpoint
 * @param {object} data - Request body
 * @param {function} onMessage - Callback for each message chunk
 * @param {function} onError - Error callback
 */
stream: (url, data, onMessage, onError) => {
  return fetch(`${API_CONFIG.BASE_URL}${url}`, {
    method: 'POST',
    headers: API_CONFIG.HEADERS,
    body: JSON.stringify(data),
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error('Stream request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            onMessage(data);
          } catch (e) {
            console.error('Failed to parse stream data', e);
          }
        }
      }
    }
  }).catch(onError);
},
```

**Key Features**:
1. POST request with JSON body
2. ReadableStream reader for chunk processing
3. Line-by-line parsing for SSE format
4. JSON parsing of data payloads
5. Error handling with catch

---

### Chat Service Streaming

**File**: `/src/services/chat.service.js`

Wrapper service for chat-specific streaming.

```javascript
/**
 * Send a message with streaming response
 * @param {string} message - User message
 * @param {function} onMessage - Callback for each message chunk
 * @param {function} onError - Error callback
 * @param {object} options - Additional options
 */
sendStreamMessage: (message, onMessage, onError, options = {}) => {
  return apiService.stream(
    API_CONFIG.ENDPOINTS.CHAT_STREAM,
    { message, ...options },
    onMessage,
    onError
  );
},
```

**Usage**:
```javascript
chatService.sendStreamMessage(
  'Hello AI',
  (chunk) => {
    console.log('Received:', chunk);
    // Update UI with chunk
  },
  (error) => {
    console.error('Stream error:', error);
  }
);
```

---

### Zustand Store Integration

**File**: `/src/store/chatStore.js`

Complete streaming state management with Zustand.

```javascript
sendStreamMessage: async (message) => {
  const { addMessage, updateLastMessage } = get();

  // Add user message
  addMessage({
    type: MESSAGE_TYPES.USER,
    content: message,
  });

  // Add empty assistant message that will be filled
  addMessage({
    type: MESSAGE_TYPES.ASSISTANT,
    content: '',
  });

  set({
    isStreaming: true,
    status: STATUS_TYPES.LOADING,
    error: null
  });

  let accumulatedContent = '';

  try {
    await chatService.sendStreamMessage(
      message,
      (chunk) => {
        // Handle streaming chunk
        if (chunk.content) {
          accumulatedContent += chunk.content;
          updateLastMessage(accumulatedContent);
        }
      },
      (error) => {
        console.error('Streaming error:', error);
        set({
          error: error.message || 'Streaming failed',
          isStreaming: false,
          status: STATUS_TYPES.ERROR,
        });
      }
    );

    set({
      isStreaming: false,
      status: STATUS_TYPES.SUCCESS,
    });
  } catch (error) {
    set({
      error: error.message || 'Failed to send message',
      isStreaming: false,
      status: STATUS_TYPES.ERROR,
    });
  }
},

updateLastMessage: (content) =>
  set((state) => {
    const messages = [...state.messages];
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && lastMessage.type === MESSAGE_TYPES.ASSISTANT) {
      lastMessage.content = content;
    }
    return { messages };
  }),
```

**Pattern Highlights**:
1. **Optimistic UI**: Add empty message before streaming starts
2. **Accumulation**: Build content incrementally
3. **State Updates**: Update last message content on each chunk
4. **Error Handling**: Capture streaming errors separately
5. **Status Tracking**: `isStreaming` flag for UI state

---

## React Component Examples

### Basic Streaming Component

```javascript
import { useState } from 'react';
import useChatStore from '../store/chatStore';

function StreamingChat() {
  const [input, setInput] = useState('');

  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const sendStreamMessage = useChatStore((state) => state.sendStreamMessage);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    sendStreamMessage(input);
    setInput('');
  };

  return (
    <div className="chat-container">
      <div className="messages">
        {messages.map((msg, idx) => (
          <div key={idx} className={`message ${msg.type}`}>
            {msg.content}
            {isStreaming && idx === messages.length - 1 && (
              <span className="cursor">▊</span>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isStreaming}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={isStreaming}>
          {isStreaming ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}
```

---

### Custom Hook for SSE Streaming

```javascript
import { useState, useRef, useEffect, useCallback } from 'react';

function useSSEStream(url) {
  const [data, setData] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState(null);
  const abortControllerRef = useRef(null);

  const startStream = useCallback(async (body = {}) => {
    setIsStreaming(true);
    setError(null);
    setData('');

    try {
      abortControllerRef.current = new AbortController();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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

      // Process remaining buffer
      if (buffer && buffer.startsWith('data: ')) {
        setData((prev) => prev + buffer.slice(6));
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
    return () => stopStream();
  }, [stopStream]);

  return { data, isStreaming, error, startStream, stopStream };
}

// Usage
function StreamingExample() {
  const { data, isStreaming, error, startStream, stopStream } = useSSEStream('/api/stream');

  return (
    <div>
      <button onClick={() => startStream({ message: 'Hello' })} disabled={isStreaming}>
        Start Stream
      </button>
      <button onClick={stopStream} disabled={!isStreaming}>
        Stop Stream
      </button>
      {error && <div className="error">{error}</div>}
      <pre>{data}</pre>
    </div>
  );
}
```

---

### Throttled Stream Updates

```javascript
import { useRef, useCallback } from 'react';
import { throttle } from 'lodash';

function useThrottledStream(url, delay = 100) {
  const [displayData, setDisplayData] = useState('');
  const dataBufferRef = useRef('');

  const throttledUpdate = useRef(
    throttle((data) => {
      setDisplayData(data);
    }, delay)
  ).current;

  const startStream = useCallback(async () => {
    const response = await fetch(url);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      dataBufferRef.current += chunk;

      // Throttled UI update
      throttledUpdate(dataBufferRef.current);
    }

    // Final update with complete data
    setDisplayData(dataBufferRef.current);
  }, [url, throttledUpdate]);

  return { displayData, startStream };
}
```

---

### Error Handling with Retry

```javascript
function useStreamWithRetry(url, maxRetries = 3) {
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState(null);

  const calculateBackoff = (attempt) => {
    return Math.min(1000 * Math.pow(2, attempt), 30000);
  };

  const startStreamWithRetry = async (body) => {
    try {
      await startStream(body);
      setRetryCount(0); // Reset on success
      setError(null);
    } catch (err) {
      if (retryCount < maxRetries) {
        const delay = calculateBackoff(retryCount);
        console.log(`Retrying in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`);

        setTimeout(() => {
          setRetryCount((prev) => prev + 1);
          startStreamWithRetry(body);
        }, delay);
      } else {
        setError('Max retries exceeded. Please try again.');
      }
    }
  };

  return { startStreamWithRetry, retryCount, error };
}
```

---

### Production-Ready Streaming Service

```javascript
// services/productionStreamService.js
export class ProductionStreamService {
  constructor(baseUrl, options = {}) {
    this.baseUrl = baseUrl;
    this.timeout = options.timeout || 60000;
    this.abortController = null;
  }

  async stream(endpoint, { body, onChunk, onComplete, onError, headers = {} }) {
    try {
      this.abortController = new AbortController();

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.abortController.abort();
      }, this.timeout);

      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('text/event-stream')) {
        throw new Error('Invalid content type');
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
            try {
              const data = JSON.parse(line.slice(6));
              if (onChunk) onChunk(data);
            } catch (e) {
              // Handle non-JSON data
              if (onChunk) onChunk(line.slice(6));
            }
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
        throw err;
      }
    }
  }

  cancel() {
    this.abortController?.abort();
    this.abortController = null;
  }
}
```

---

## Testing Examples

### Unit Test

```javascript
import { renderHook, act } from '@testing-library/react';
import { useSSEStream } from './useSSEStream';

describe('useSSEStream', () => {
  it('should stream data correctly', async () => {
    const mockStream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: Hello\n\n'));
        controller.enqueue(encoder.encode('data: World\n\n'));
        controller.close();
      },
    });

    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        body: mockStream,
      })
    );

    const { result } = renderHook(() => useSSEStream('/api/stream'));

    await act(async () => {
      await result.current.startStream();
    });

    expect(result.current.data).toBe('HelloWorld');
    expect(result.current.isStreaming).toBe(false);
  });

  it('should handle cancellation', async () => {
    const { result } = renderHook(() => useSSEStream('/api/stream'));

    act(() => {
      result.current.startStream();
      result.current.stopStream();
    });

    expect(result.current.isStreaming).toBe(false);
  });
});
```

---

## Best Practices from Project

1. **Accumulate Content**: Build complete message from chunks
2. **Error Boundaries**: Separate streaming errors from network errors
3. **UI Feedback**: Show streaming cursor/indicator
4. **Cancellation**: Always cleanup AbortController on unmount
5. **Status Tracking**: Separate `isLoading` and `isStreaming` states
6. **Line Buffering**: Keep partial lines in buffer across chunks
7. **JSON Parsing**: Wrap in try-catch for malformed data
8. **Type Safety**: Use constants for message types and status
