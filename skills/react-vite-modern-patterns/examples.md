# React 18 + Vite 5 Modern Patterns - Examples

Example implementations.

---

## Table of Contents

1. [Project Setup](#project-setup)
2. [Vite Configuration](#vite-configuration)
3. [Custom Hooks](#custom-hooks)
4. [Components](#components)
5. [Error Boundary](#error-boundary)
6. [Entry Point](#entry-point)

---

## Project Setup

### Package.json

```json
{
  "name": "example-frontend",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.90.12",
    "axios": "^1.13.2",
    "highlight.js": "^11.11.1",
    "lucide-react": "^0.561.0",
    "mermaid": "^11.12.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-markdown": "^10.1.0",
    "rehype-highlight": "^7.0.2",
    "remark-gfm": "^4.0.1",
    "zustand": "^5.0.9"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "@tailwindcss/postcss": "^4.1.18",
    "autoprefixer": "^10.4.16",
    "framer-motion": "^10.12.16",
    "postcss": "^8.4.30",
    "tailwindcss": "^3.3.3",
    "vite": "^5.0.0",
    "vite-plugin-pwa": "^1.2.0",
    "workbox-window": "^7.4.0"
  }
}
```

### Directory Structure

```
src/
├── components/          # React components
│   ├── ChatInput.jsx
│   ├── CodeBlock.jsx
│   ├── DocumentUpload.jsx
│   ├── ErrorBoundary.jsx
│   ├── ExportMenu.jsx
│   ├── LanguageToggle.jsx
│   ├── Loading.jsx
│   ├── MessageActions.jsx
│   ├── MultiModalInput.jsx
│   ├── NotificationContainer.jsx
│   ├── OnlineStatus.jsx
│   ├── PersonalizationSettings.jsx
│   ├── SmartSuggestions.jsx
│   ├── StepByStepResponse.jsx
│   └── ThemeToggle.jsx
├── hooks/               # Custom hooks
│   ├── useApi.js
│   ├── useChat.js
│   ├── useClickOutside.js
│   ├── useDebounce.js
│   ├── useImageGeneration.js
│   ├── useKeyPress.js
│   ├── useLanguage.js
│   ├── useLocalStorage.js
│   ├── useMediaQuery.js
│   ├── useMultiModal.js
│   ├── useNotification.js
│   ├── useOnlineStatus.js
│   ├── usePersonalization.js
│   ├── useRAG.js
│   └── useTheme.js
├── store/               # Zustand stores
│   ├── chatStore.js
│   ├── uiStore.js
│   ├── userStore.js
│   └── index.js
├── services/            # API services
│   ├── api.service.js
│   ├── chat.service.js
│   ├── code.service.js
│   ├── image.service.js
│   ├── multimodal.service.js
│   ├── personalization.service.js
│   ├── rag.service.js
│   ├── storage.service.js
│   └── suggestion.service.js
├── config/              # Configuration
│   └── app.config.js
├── constants/           # Constants
│   └── index.js
├── context/             # React Context
│   ├── LanguageContext.jsx
│   └── ThemeContext.jsx
├── locales/             # i18n translations
│   ├── en.json
│   └── fr.json
├── providers/           # Providers
│   └── QueryProvider.jsx
├── utils/               # Utilities
│   ├── export.js
│   ├── formatting.js
│   ├── logger.js
│   ├── notifications.js
│   ├── performance.js
│   ├── stepParser.js
│   ├── storage.js
│   └── validation.js
├── types/               # TypeScript types
│   └── research.types.js
├── App.jsx
├── main.jsx
└── styles.css
```

---

## Vite Configuration

### Complete vite.config.js

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      manifest: {
        name: 'Example App',
        short_name: 'Chatbot',
        description: 'Assistant de conversation intelligent avec Azure OpenAI',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
```

**Key Features**:
- **React Plugin**: Fast Refresh for instant HMR
- **PWA Plugin**: Service worker with auto-update
- **Runtime Caching**: CacheFirst for fonts and images
- **Dev Options**: PWA enabled in development mode

---

## Custom Hooks

### useChat Hook

Complete chat functionality encapsulated in a hook:

```javascript
/**
 * useChat Hook
 * Custom hook for chat functionality using the chat store
 */

import { useCallback } from 'react';
import useChatStore from '../store/chatStore';
import { MESSAGE_TYPES } from '../constants';

export const useChat = () => {
  const {
    messages,
    currentMessage,
    isLoading,
    isStreaming,
    error,
    status,
    setCurrentMessage,
    sendMessage,
    sendStreamMessage,
    clearMessages,
    clearError,
    loadHistory,
    deleteMessage,
    editMessage,
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
    if (window.confirm('Are you sure you want to clear the chat?')) {
      clearMessages();
    }
  }, [clearMessages]);

  const getUserMessages = useCallback(() => {
    return messages.filter((msg) => msg.type === MESSAGE_TYPES.USER);
  }, [messages]);

  const getAssistantMessages = useCallback(() => {
    return messages.filter((msg) => msg.type === MESSAGE_TYPES.ASSISTANT);
  }, [messages]);

  const getLastMessage = useCallback(() => {
    return messages[messages.length - 1] || null;
  }, [messages]);

  return {
    // State
    messages,
    currentMessage,
    isLoading,
    isStreaming,
    error,
    status,

    // Actions
    setCurrentMessage,
    sendMessage: handleSendMessage,
    clearMessages: handleClearChat,
    clearError,
    loadHistory,
    deleteMessage,
    editMessage,

    // Computed
    getUserMessages,
    getAssistantMessages,
    getLastMessage,
    hasMessages: messages.length > 0,
    isEmpty: messages.length === 0,
  };
};

export default useChat;
```

**Pattern Highlights**:
- ✅ Encapsulates store logic
- ✅ Uses `useCallback` for stable function references
- ✅ Provides both state and actions
- ✅ Includes computed properties (hasMessages, isEmpty)
- ✅ Handles confirmation dialogs
- ✅ Returns consistent object structure

---

### useTheme Hook

Theme management with system preference detection:

```javascript
/**
 * useTheme Hook
 * Custom hook for theme management
 */

import { useEffect } from 'react';
import useUIStore from '../store/uiStore';
import { THEMES } from '../constants';

export const useTheme = () => {
  const { theme, setTheme, toggleTheme } = useUIStore();

  // Apply theme on mount and when it changes
  useEffect(() => {
    const root = document.documentElement;

    if (theme === THEMES.DARK) {
      root.classList.add('dark');
    } else if (theme === THEMES.LIGHT) {
      root.classList.remove('dark');
    } else if (theme === THEMES.AUTO) {
      // Auto theme based on system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (prefersDark) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    }
  }, [theme]);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (theme !== THEMES.AUTO) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e) => {
      if (e.matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const isDark =
    theme === THEMES.DARK ||
    (theme === THEMES.AUTO && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return {
    theme,
    setTheme,
    toggleTheme,
    isDark,
    isLight: !isDark,
  };
};

export default useTheme;
```

**Pattern Highlights**:
- ✅ Manages DOM side effects with `useEffect`
- ✅ Listens to system theme changes
- ✅ Proper cleanup on unmount
- ✅ Supports light, dark, and auto modes
- ✅ Returns computed values (isDark, isLight)

---

## Components

### ChatInput Component

Complete chat input with streaming support:

```javascript
import React, { useState, useRef, useEffect } from 'react';
import { Play, Square } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function ChatInput({ sendMessage, disabled = false, onCancel, placeholder }) {
  const { t } = useLanguage();
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [disabled]);

  const handleSend = () => {
    if (disabled && onCancel) {
      onCancel();
    } else if (!disabled && text.trim()) {
      sendMessage(text);
      setText('');
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !disabled && text.trim()) {
      handleSend();
    }
  };

  return (
    <div className="border-t border-gray-200/50 dark:border-gray-800/50 bg-white/80 dark:bg-gray-950/80 backdrop-blur-sm">
      <div className="flex items-center max-w-4xl gap-3 p-4 mx-auto">
        <input
          ref={inputRef}
          type="text"
          className={`flex-1 px-5 py-4 text-base rounded-full border-2 border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:outline-none focus:ring-4 focus:ring-black/20 focus:border-black dark:focus:ring-white/20 dark:focus:border-white transition-all ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
          placeholder={placeholder || t('messagePlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={disabled}
          autoFocus
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() && !disabled}
          className={`flex-shrink-0 p-4 rounded-full transition-all duration-200 ${
            !text.trim() && !disabled
              ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed'
              : disabled
              ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg hover:scale-105'
              : 'bg-black hover:bg-gray-800 dark:bg-white dark:hover:bg-gray-200 text-white dark:text-black shadow-lg hover:scale-105 active:scale-95'
          }`}
        >
          {disabled ? <Square size={22} /> : <Play size={22} />}
        </button>
      </div>
    </div>
  );
}
```

**Pattern Highlights**:
- ✅ Uses `useRef` for auto-focus management
- ✅ Keyboard handling (Enter key)
- ✅ Disabled state for streaming mode
- ✅ Theme-aware styling (dark mode)
- ✅ Internationalization support
- ✅ Clean state management with `useState`

---

## Error Boundary

### ErrorBoundary Component

Production-ready error boundary with dev details:

```javascript
/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */

import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });

    // You can also log the error to an error reporting service
    // logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
            <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900 rounded-full">
              <svg
                className="w-6 h-6 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="mt-4 text-xl font-semibold text-center text-gray-900 dark:text-white">
              Oops! Something went wrong
            </h2>
            <p className="mt-2 text-sm text-center text-gray-600 dark:text-gray-400">
              We're sorry for the inconvenience. Please try refreshing the page.
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4 text-xs text-gray-700 dark:text-gray-300">
                <summary className="cursor-pointer font-semibold">Error Details</summary>
                <pre className="mt-2 p-2 bg-gray-100 dark:bg-gray-900 rounded overflow-auto">
                  {this.state.error && this.state.error.toString()}
                  {this.state.errorInfo && this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
```

**Pattern Highlights**:
- ✅ Uses `getDerivedStateFromError` for UI updates
- ✅ Uses `componentDidCatch` for error logging
- ✅ Shows error details in development only
- ✅ Theme-aware error UI
- ✅ Provides recovery action (refresh)
- ✅ Logs to console and can integrate with error services

**Usage**:
```javascript
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <YourApp />
    </ErrorBoundary>
  );
}
```

---

## Entry Point

### main.jsx

Application entry point with React Query provider:

```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import QueryProvider from './providers/QueryProvider';

ReactDOM.createRoot(document.getElementById('root')).render(
  <QueryProvider>
    <App />
  </QueryProvider>
);
```

**Pattern Highlights**:
- ✅ Uses `ReactDOM.createRoot` (React 18)
- ✅ Wraps app with QueryProvider for React Query
- ✅ Imports global styles
- ✅ Clean, minimal setup

### QueryProvider

React Query provider setup:

```javascript
/**
 * React Query Provider
 * Configures React Query for the application
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function QueryProvider({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
```

**Configuration**:
- **retry**: 1 (retry failed queries once)
- **refetchOnWindowFocus**: false (don't refetch on tab focus)
- **staleTime**: 5 minutes (cache duration)

---

## Complete Application Flow

```
main.jsx
  ↓
QueryProvider (React Query setup)
  ↓
App.jsx
  ↓
ErrorBoundary (catches errors)
  ↓
Components (use custom hooks)
  ↓
Custom Hooks (useChat, useTheme, etc.)
  ↓
Zustand Stores (chatStore, uiStore, etc.)
  ↓
Services (chatService, apiService, etc.)
  ↓
API Calls
```

---

## Testing Examples

### Testing Custom Hooks

```javascript
import { renderHook, act } from '@testing-library/react';
import { useChat } from './useChat';

describe('useChat', () => {
  test('should send message', async () => {
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage('Hello');
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Hello');
  });

  test('should clear messages', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.clearMessages();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isEmpty).toBe(true);
  });
});
```

### Testing Components

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import ChatInput from './ChatInput';

describe('ChatInput', () => {
  test('should call sendMessage on Enter key', () => {
    const sendMessage = jest.fn();
    render(<ChatInput sendMessage={sendMessage} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(sendMessage).toHaveBeenCalledWith('Hello');
  });

  test('should disable input when streaming', () => {
    render(<ChatInput sendMessage={jest.fn()} disabled={true} />);

    const input = screen.getByRole('textbox');
    expect(input).toBeDisabled();
  });
});
```

---

## Summary

This examples document demonstrates:

1. ✅ **Complete Vite configuration** with React and PWA plugins
2. ✅ **Custom hooks** (useChat, useTheme) with example code
3. ✅ **Component patterns** (ChatInput) with accessibility
4. ✅ **Error boundary** with development/production modes
5. ✅ **Entry point** with React 18 and providers
6. ✅ **Testing patterns** for hooks and components

Illustrative examples.
