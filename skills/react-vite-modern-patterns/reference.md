# React 18 + Vite 5 Modern Patterns - Reference

Comprehensive guide to modern React 18 patterns with Vite 5, covering custom hooks, component architecture, concurrent features, and build optimization.

---

## Table of Contents

1. [Vite Project Structure](#vite-project-structure)
2. [Vite Configuration](#vite-configuration)
3. [Custom Hooks Patterns](#custom-hooks-patterns)
4. [Component Composition](#component-composition)
5. [React 18 Concurrent Features](#react-18-concurrent-features)
6. [Environment Variables](#environment-variables)
7. [Build Optimization](#build-optimization)
8. [Performance Best Practices](#performance-best-practices)
9. [Anti-Patterns](#anti-patterns)

---

## Vite Project Structure

### Feature-Based Organization

Modern React applications benefit from feature-based organization:

```
src/
├── features/              # Feature modules
│   ├── chat/
│   │   ├── components/    # Feature-specific components
│   │   ├── hooks/         # Feature-specific hooks
│   │   ├── services/      # Feature business logic
│   │   └── types/         # TypeScript types
│   ├── auth/
│   └── documents/
├── components/            # Shared components
├── hooks/                 # Shared custom hooks
├── services/              # Shared services
├── store/                 # Global state (Zustand)
├── config/                # Configuration files
├── utils/                 # Utilities
├── App.jsx
└── main.jsx              # Entry point
```

**Benefits**:
- Clear separation of concerns
- Easy to locate feature code
- Promotes modularity
- Scales with application growth

### Services Layer Separation

Separate business logic from UI components:

```javascript
// services/chatService.js
export const chatService = {
  async sendMessage(message) {
    const response = await apiClient.post('/chat', { message });
    return response.data;
  },

  async streamMessage(message, onChunk) {
    const response = await fetch('/api/chat/stream', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value));
    }
  },
};
```

**Component uses service**:
```javascript
function ChatInterface() {
  const [response, setResponse] = useState('');

  const handleSend = async (message) => {
    await chatService.streamMessage(message, (chunk) => {
      setResponse((prev) => prev + chunk);
    });
  };

  return <ChatInput onSend={handleSend} />;
}
```

---

## Vite Configuration

### Essential Vite Config

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react({
      // Fast Refresh configuration
      fastRefresh: true,
      // Babel options
      babel: {
        plugins: [],
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],

  // Development server
  server: {
    port: 5173,
    host: true, // Listen on all addresses
    open: true, // Open browser automatically
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },

  // Build options
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },

  // Path aliases
  resolve: {
    alias: {
      '@': '/src',
      '@components': '/src/components',
      '@hooks': '/src/hooks',
    },
  },
});
```

### Plugin Configuration

**React Plugin** (`@vitejs/plugin-react`):
- Provides Fast Refresh for instant HMR
- Automatic JSX transformation
- Development optimizations

**PWA Plugin** (`vite-plugin-pwa`):
- Service worker generation
- Offline support
- App manifest generation

### Build Optimization

**Code Splitting**:
```javascript
// Lazy load routes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Suspense>
  );
}
```

**Manual Chunks**:
```javascript
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-router': ['react-router-dom'],
        'vendor-state': ['zustand'],
        'vendor-query': ['@tanstack/react-query'],
      },
    },
  },
}
```

---

## Custom Hooks Patterns

### State Management Hook

Extract store logic into custom hooks:

```javascript
// hooks/useChat.js
import { useCallback } from 'react';
import useChatStore from '../store/chatStore';

export const useChat = () => {
  const {
    messages,
    currentMessage,
    isLoading,
    isStreaming,
    sendMessage,
    sendStreamMessage,
    setCurrentMessage,
    clearMessages,
  } = useChatStore();

  const handleSendMessage = useCallback(
    async (message, useStreaming = false) => {
      if (!message?.trim()) return;

      try {
        if (useStreaming) {
          await sendStreamMessage(message);
        } else {
          await sendMessage(message);
        }
        setCurrentMessage('');
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    },
    [sendMessage, sendStreamMessage, setCurrentMessage]
  );

  const handleClearChat = useCallback(() => {
    if (window.confirm('Clear chat?')) {
      clearMessages();
    }
  }, [clearMessages]);

  return {
    // State
    messages,
    currentMessage,
    isLoading,
    isStreaming,

    // Actions
    setCurrentMessage,
    sendMessage: handleSendMessage,
    clearMessages: handleClearChat,

    // Computed
    hasMessages: messages.length > 0,
    isEmpty: messages.length === 0,
  };
};
```

**Benefits**:
- Encapsulates store logic
- Provides stable API
- Easy to test
- Reusable across components

### Theme Management Hook

```javascript
// hooks/useTheme.js
import { useEffect } from 'react';
import useUIStore from '../store/uiStore';

export const useTheme = () => {
  const { theme, setTheme, toggleTheme } = useUIStore();

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else if (theme === 'light') {
      root.classList.remove('dark');
    } else if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', prefersDark);
    }
  }, [theme]);

  // Listen for system theme changes
  useEffect(() => {
    if (theme !== 'auto') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      document.documentElement.classList.toggle('dark', e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const isDark =
    theme === 'dark' ||
    (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark,
    isLight: !isDark,
  };
};
```

### Hook Composition

Combine multiple hooks for complex logic:

```javascript
// hooks/useChatWithTheme.js
export const useChatWithTheme = () => {
  const chat = useChat();
  const { isDark } = useTheme();

  const themeClass = isDark ? 'dark-message' : 'light-message';

  return {
    ...chat,
    themeClass,
  };
};
```

---

## Component Composition

### Container/Component Pattern

**Container Component** (logic):
```javascript
// components/ChatContainer.jsx
function ChatContainer() {
  const { messages, sendMessage, isLoading } = useChat();
  const { theme } = useTheme();

  return (
    <ChatView
      messages={messages}
      onSend={sendMessage}
      isLoading={isLoading}
      theme={theme}
    />
  );
}
```

**Presentational Component** (UI):
```javascript
// components/ChatView.jsx
function ChatView({ messages, onSend, isLoading, theme }) {
  return (
    <div className={theme}>
      <MessageList messages={messages} />
      <ChatInput onSend={onSend} disabled={isLoading} />
    </div>
  );
}
```

### Component Composition over Props

**Bad** (prop drilling):
```javascript
function App() {
  const [user, setUser] = useState(null);
  return (
    <Dashboard user={user}>
      <Sidebar user={user}>
        <Profile user={user} />
      </Sidebar>
    </Dashboard>
  );
}
```

**Good** (composition):
```javascript
function App() {
  const { user } = useAuth();
  return (
    <Dashboard>
      <Sidebar>
        <Profile /> {/* Gets user from useAuth hook */}
      </Sidebar>
    </Dashboard>
  );
}
```

---

## React 18 Concurrent Features

### Streaming with Suspense

```javascript
import { Suspense, lazy } from 'react';

const Dashboard = lazy(() => import('./Dashboard'));

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Dashboard />
    </Suspense>
  );
}
```

### useTransition for Non-Blocking Updates

```javascript
import { useState, useTransition } from 'react';

function SearchResults() {
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSearch = (value) => {
    setQuery(value); // Urgent: Update input immediately

    startTransition(() => {
      // Non-urgent: Update search results
      performHeavySearch(value);
    });
  };

  return (
    <>
      <input onChange={(e) => handleSearch(e.target.value)} />
      {isPending && <Spinner />}
      <Results query={query} />
    </>
  );
}
```

### useDeferredValue

```javascript
import { useState, useDeferredValue } from 'react';

function SearchComponent() {
  const [input, setInput] = useState('');
  const deferredInput = useDeferredValue(input);

  return (
    <>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <Results query={deferredInput} /> {/* Updates after high-priority renders */}
    </>
  );
}
```

---

## Environment Variables

### Vite Environment Variables

**Define in `.env` files**:
```bash
# .env
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=Example App
VITE_ENABLE_ANALYTICS=true
```

**Access in code**:
```javascript
const apiUrl = import.meta.env.VITE_API_URL;
const appName = import.meta.env.VITE_APP_NAME;
const isDev = import.meta.env.DEV; // Built-in
const isProduction = import.meta.env.PROD; // Built-in
```

### Environment-Specific Files

```
.env                # All environments
.env.local          # Local overrides (gitignored)
.env.development    # Development only
.env.production     # Production only
```

**Priority**: `.env.local` > `.env.development` > `.env`

---

## Build Optimization

### Performance Budgets

```javascript
// vite.config.js
build: {
  rollupOptions: {
    output: {
      manualChunks(id) {
        // Split node_modules into vendor chunks
        if (id.includes('node_modules')) {
          return id.split('node_modules/')[1].split('/')[0];
        }
      },
    },
  },
  chunkSizeWarningLimit: 500, // Warn if chunk > 500KB
}
```

### Tree Shaking

```javascript
// Import only what you need
import { useState } from 'react'; // ✓ Good
import React from 'react'; // ✗ Imports entire library
```

### Dynamic Imports

```javascript
// Load heavy library only when needed
async function processImage(file) {
  const sharp = await import('sharp');
  return sharp(file).resize(800, 600).toBuffer();
}
```

---

## Performance Best Practices

### Memoization

**React.memo** for components:
```javascript
const MessageItem = React.memo(({ message }) => (
  <div>{message.content}</div>
));
```

**useMemo** for expensive computations:
```javascript
const sortedMessages = useMemo(
  () => messages.sort((a, b) => a.timestamp - b.timestamp),
  [messages]
);
```

**useCallback** for stable function references:
```javascript
const handleSend = useCallback(
  (message) => {
    dispatch({ type: 'SEND', payload: message });
  },
  [dispatch]
);
```

### Avoid Unnecessary Re-renders

```javascript
// Bad: New object on every render
function Component() {
  const config = { theme: 'dark' }; // ✗ New object each time
  return <Child config={config} />;
}

// Good: Stable reference
function Component() {
  const config = useMemo(() => ({ theme: 'dark' }), []); // ✓ Memoized
  return <Child config={config} />;
}
```

---

## Anti-Patterns

### 1. Prop Drilling

**Problem**:
```javascript
function App() {
  const [user, setUser] = useState(null);
  return <Dashboard user={user} setUser={setUser} />;
}

function Dashboard({ user, setUser }) {
  return <Sidebar user={user} setUser={setUser} />;
}

function Sidebar({ user, setUser }) {
  return <Profile user={user} setUser={setUser} />;
}
```

**Solution**: Use composition or custom hooks
```javascript
function App() {
  return <Dashboard />;
}

function Profile() {
  const { user, setUser } = useAuth(); // Hook gets user directly
  return <div>{user.name}</div>;
}
```

### 2. Inline Functions in JSX

**Problem**:
```javascript
function TodoList({ todos }) {
  return todos.map((todo) => (
    <TodoItem
      key={todo.id}
      onDelete={() => deleteTodo(todo.id)} // ✗ New function on every render
    />
  ));
}
```

**Solution**: Use useCallback
```javascript
function TodoList({ todos }) {
  const handleDelete = useCallback((id) => {
    deleteTodo(id);
  }, []);

  return todos.map((todo) => (
    <TodoItem key={todo.id} onDelete={handleDelete} todoId={todo.id} />
  ));
}
```

### 3. Missing Dependency Arrays

**Problem**:
```javascript
useEffect(() => {
  fetchData(userId); // ✗ Missing dependency
}, []); // Won't re-run when userId changes
```

**Solution**: Include all dependencies
```javascript
useEffect(() => {
  fetchData(userId);
}, [userId]); // ✓ Re-runs when userId changes
```

### 4. Over-using useEffect

**Problem**:
```javascript
function Component({ count }) {
  const [doubled, setDoubled] = useState(0);

  useEffect(() => {
    setDoubled(count * 2); // ✗ Unnecessary effect
  }, [count]);

  return <div>{doubled}</div>;
}
```

**Solution**: Use derived state
```javascript
function Component({ count }) {
  const doubled = count * 2; // ✓ Computed directly
  return <div>{doubled}</div>;
}
```

### 5. Not Memoizing Expensive Computations

**Problem**:
```javascript
function Component({ items }) {
  const sorted = items.sort(...); // ✗ Sorts on every render
  return <List items={sorted} />;
}
```

**Solution**: Use useMemo
```javascript
function Component({ items }) {
  const sorted = useMemo(() => items.sort(...), [items]); // ✓ Memoized
  return <List items={sorted} />;
}
```

---

## References

- [React 18 Documentation](https://react.dev/)
- [Vite Documentation](https://vite.dev/)
- [React Design Patterns 2025](https://www.telerik.com/blogs/react-design-patterns-best-practices)
- [Vite Performance Guide](https://vitejs.dev/guide/performance.html)
- [React Concurrent Features](https://react.dev/blog/2022/03/29/react-v18)
