# Zustand Examples - example-frontend

Example patterns from a example-frontend project.

## Project Store Implementation

### Chat Store with Streaming

**File**: `/src/store/chatStore.js`

Complete implementation with async actions, streaming support, and persistence.

```javascript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import chatService from '../services/chat.service';
import { MESSAGE_TYPES, STATUS_TYPES } from '../constants';
import APP_CONFIG from '../config/app.config';

const useChatStore = create(
  devtools(
    persist(
      (set, get) => ({
        // State
        messages: [],
        currentMessage: '',
        isLoading: false,
        isStreaming: false,
        error: null,
        status: STATUS_TYPES.IDLE,
        conversationId: null,

        // Actions
        setCurrentMessage: (message) => set({ currentMessage: message }),

        addMessage: (message) =>
          set((state) => ({
            messages: [...state.messages, {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              ...message,
            }],
          })),

        updateLastMessage: (content) =>
          set((state) => {
            const messages = [...state.messages];
            const lastMessage = messages[messages.length - 1];
            if (lastMessage && lastMessage.type === MESSAGE_TYPES.ASSISTANT) {
              lastMessage.content = content;
            }
            return { messages };
          }),

        sendMessage: async (message) => {
          const { addMessage } = get();

          addMessage({
            type: MESSAGE_TYPES.USER,
            content: message,
          });

          set({
            isLoading: true,
            status: STATUS_TYPES.LOADING,
            error: null
          });

          try {
            const result = await chatService.sendMessage(message);

            if (result.success) {
              addMessage({
                type: MESSAGE_TYPES.ASSISTANT,
                content: result.data.response || result.data.message,
              });

              set({
                isLoading: false,
                status: STATUS_TYPES.SUCCESS,
              });
            } else {
              throw result.error;
            }
          } catch (error) {
            set({
              error: error.message || 'Failed to send message',
              isLoading: false,
              status: STATUS_TYPES.ERROR,
            });

            addMessage({
              type: MESSAGE_TYPES.ERROR,
              content: 'Sorry, something went wrong. Please try again.',
            });
          }
        },

        sendStreamMessage: async (message) => {
          const { addMessage, updateLastMessage } = get();

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

        clearMessages: () =>
          set({
            messages: [],
            error: null,
            status: STATUS_TYPES.IDLE,
          }),

        clearError: () => set({ error: null }),

        loadHistory: async () => {
          set({ isLoading: true });

          try {
            const result = await chatService.getHistory();

            if (result.success) {
              set({
                messages: result.data.messages || [],
                isLoading: false,
              });
            }
          } catch (error) {
            set({
              error: error.message,
              isLoading: false,
            });
          }
        },

        deleteMessage: (messageId) =>
          set((state) => ({
            messages: state.messages.filter((msg) => msg.id !== messageId),
          })),

        editMessage: (messageId, newContent) =>
          set((state) => ({
            messages: state.messages.map((msg) =>
              msg.id === messageId ? { ...msg, content: newContent } : msg
            ),
          })),
      }),
      {
        name: APP_CONFIG.STORAGE_KEYS.CHAT_HISTORY,
        partialize: (state) => ({
          messages: state.messages.slice(-APP_CONFIG.LIMITS.MAX_HISTORY_ITEMS),
        }),
      }
    ),
    { name: 'ChatStore' }
  )
);

export default useChatStore;
```

**Key Patterns**:
1. **Middleware Stack**: devtools → persist → store
2. **Selective Persistence**: Only persists limited message history
3. **Async Actions**: Full try-catch with loading/error states
4. **Streaming Support**: Updates last message incrementally
5. **Action Composition**: `get()` to access other actions

---

## Component Usage Examples

### Basic Subscription

```javascript
import useChatStore from '../store/chatStore';

function ChatMessages() {
  // Selective subscription - only re-renders when messages change
  const messages = useChatStore((state) => state.messages);

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

### Multiple Subscriptions

```javascript
function ChatInput() {
  const currentMessage = useChatStore((state) => state.currentMessage);
  const setCurrentMessage = useChatStore((state) => state.setCurrentMessage);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const isLoading = useChatStore((state) => state.isLoading);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (currentMessage.trim()) {
      sendMessage(currentMessage);
      setCurrentMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={currentMessage}
        onChange={(e) => setCurrentMessage(e.target.value)}
        disabled={isLoading}
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? 'Sending...' : 'Send'}
      </button>
    </form>
  );
}
```

### Shallow Comparison

```javascript
import { useShallow } from 'zustand/react/shallow';

function ChatStatus() {
  // Shallow comparison - only re-renders if isLoading or error changes
  const { isLoading, error } = useChatStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      error: state.error,
    }))
  );

  if (error) return <div className="error">{error}</div>;
  if (isLoading) return <div className="loading">Loading...</div>;
  return null;
}
```

---

## Advanced Patterns

### Streaming with Real-time Updates

```javascript
function StreamingChat() {
  const messages = useChatStore((state) => state.messages);
  const isStreaming = useChatStore((state) => state.isStreaming);
  const sendStreamMessage = useChatStore((state) => state.sendStreamMessage);

  const handleSend = async (message) => {
    await sendStreamMessage(message);
  };

  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id} className={isStreaming ? 'streaming' : ''}>
          {msg.content}
          {isStreaming && msg === messages[messages.length - 1] && (
            <span className="cursor">▊</span>
          )}
        </div>
      ))}
    </div>
  );
}
```

### Error Handling with Auto-clear

```javascript
import { useEffect } from 'react';

function ChatWithErrorHandling() {
  const error = useChatStore((state) => state.error);
  const clearError = useChatStore((state) => state.clearError);

  // Auto-clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error, clearError]);

  return error ? <ErrorBanner message={error} /> : null;
}
```

### Optimistic Updates

```javascript
const useStore = create((set, get) => ({
  todos: [],

  updateTodo: async (id, updates) => {
    // Snapshot for rollback
    const previousTodos = get().todos;

    // Optimistic update
    set({
      todos: get().todos.map((todo) =>
        todo.id === id ? { ...todo, ...updates } : todo
      ),
    });

    try {
      await api.updateTodo(id, updates);
    } catch (error) {
      // Rollback on error
      set({ todos: previousTodos });
      throw error;
    }
  },
}));
```

---

## Testing Examples

### Unit Test

```javascript
import { renderHook, act } from '@testing-library/react';
import useChatStore from './chatStore';

describe('useChatStore', () => {
  beforeEach(() => {
    // Reset store before each test
    useChatStore.setState({ messages: [], error: null, isLoading: false });
  });

  it('should add message', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.addMessage({
        type: 'user',
        content: 'Hello',
      });
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello');
  });

  it('should handle async send message', async () => {
    const { result } = renderHook(() => useChatStore());

    await act(async () => {
      await result.current.sendMessage('Test message');
    });

    expect(result.current.messages).toHaveLength(2); // User + Assistant
    expect(result.current.isLoading).toBe(false);
  });

  it('should clear messages', () => {
    const { result } = renderHook(() => useChatStore());

    act(() => {
      result.current.addMessage({ type: 'user', content: 'Test' });
      result.current.clearMessages();
    });

    expect(result.current.messages).toHaveLength(0);
  });
});
```

### Component Integration Test

```javascript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatComponent from './ChatComponent';

describe('ChatComponent with Zustand', () => {
  it('should send message and display response', async () => {
    render(<ChatComponent />);

    const input = screen.getByPlaceholderText('Type a message...');
    const sendButton = screen.getByText('Send');

    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.click(sendButton);

    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
    });
  });
});
```

---

## Performance Optimization

### Memoized Selectors

```javascript
import { useMemo } from 'react';

function MessageList() {
  const messages = useChatStore((state) => state.messages);

  // Memoize filtered list
  const userMessages = useMemo(
    () => messages.filter((msg) => msg.type === 'user'),
    [messages]
  );

  return (
    <div>
      {userMessages.map((msg) => (
        <div key={msg.id}>{msg.content}</div>
      ))}
    </div>
  );
}
```

### React.memo for Expensive Children

```javascript
const MessageItem = React.memo(function MessageItem({ message }) {
  // Expensive rendering logic
  return <div className="message">{message.content}</div>;
});

function MessageList() {
  const messages = useChatStore((state) => state.messages);

  return (
    <div>
      {messages.map((msg) => (
        <MessageItem key={msg.id} message={msg} />
      ))}
    </div>
  );
}
```

---

## Configuration Examples

### Custom Storage

```javascript
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// Session storage instead of localStorage
const useStore = create()(
  persist(
    (set) => ({ /* state */ }),
    {
      name: 'session-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
```

### Migration Example

```javascript
const useStore = create()(
  persist(
    (set) => ({
      user: null,
      preferences: { theme: 'light' },
    }),
    {
      name: 'app-storage',
      version: 2,
      migrate: (persistedState, version) => {
        if (version === 0) {
          // v0 → v1: Add preferences
          persistedState.preferences = { theme: 'light' };
        }
        if (version === 1) {
          // v1 → v2: Rename field
          persistedState.user = persistedState.oldUser;
          delete persistedState.oldUser;
        }
        return persistedState;
      },
    }
  )
);
```

---

## Best Practices from Project

1. **Selective Persistence**: Only persist limited history (`messages.slice(-50)`)
2. **Error Handling**: Always include try-catch in async actions
3. **Loading States**: Track `isLoading` and `isStreaming` separately
4. **Action Composition**: Use `get()` to access other actions
5. **DevTools Integration**: Named actions for better debugging
6. **Type Safety**: Use constants for status types and message types
7. **Cleanup**: Provide clear/reset actions for user-triggered cleanup

---

## Load-Once External Reference Store with useSyncExternalStore

Pattern for shared reference data (categories, country lists, feature flags) that is fetched once at startup. Demonstrates the re-render subscription fix and the bundled-fallback approach.

```ts
// referenceStore.ts
import { useSyncExternalStore } from 'react';

// --- Bundled fallback (compiled into the bundle, never empty) ---
import { BUNDLED_CATEGORIES } from './bundledData';

export type Category = { id: string; label: string };

// Module-level state (not mutated directly by consumers)
let _data: Category[] = BUNDLED_CATEGORIES;
let _listeners: Array<() => void> = [];

// Internal mutation — notifies all subscribers
function _setData(data: Category[]) {
  _data = data;
  _listeners.forEach((l) => l());
}

// useSyncExternalStore contract
function _subscribe(cb: () => void): () => void {
  _listeners.push(cb);
  return () => {
    _listeners = _listeners.filter((l) => l !== cb);
  };
}

function _getSnapshot(): Category[] {
  return _data;
}

// Public hook — React schedules re-renders when _data changes
export function useCategories(): Category[] {
  return useSyncExternalStore(_subscribe, _getSnapshot);
}

// Call once at app startup (e.g., in App.tsx useEffect)
export async function loadCategories(): Promise<void> {
  try {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error(`${res.status}`);
    const fresh: Category[] = await res.json();
    _setData(fresh);
  } catch {
    // Bundled fallback already in place — nothing to do
  }
}
```

**Usage in a component**:

```tsx
// CategorySelect.tsx
import { useCategories } from './referenceStore';

export function CategorySelect() {
  const categories = useCategories(); // re-renders when loadCategories resolves

  return (
    <select>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>{c.label}</option>
      ))}
    </select>
  );
}
```

**Why not a plain Zustand store here?**

A Zustand store is equivalent and preferred when the reference data is already part of a larger store. `useSyncExternalStore` is the right primitive when the data lives completely outside React (e.g., a singleton service class, a WebSocket message cache, or a third-party observable). Both approaches avoid the module-level mutation footgun — the key is that React holds the subscription.

**Anti-pattern (before)**:

```ts
// FOOTGUN — mutation after first paint is invisible to consumers
let _data: Category[] = [];

export async function loadCategories() {
  _data = await fetchCategories(); // React never re-renders consumers
}

export function getCategories() { return _data; } // stale read

// Consumer workaround — breaks when the next consumer forgets it
const [tick, setTick] = useState(0);
useEffect(() => { loadCategories().then(() => setTick(t => t + 1)); }, []);
const categories = getCategories(); // brittle
```
