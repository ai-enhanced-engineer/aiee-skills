# React Query Examples - example-frontend

Example patterns from a example-frontend project.

## Project Implementation

### QueryProvider Setup

**File**: `/src/providers/QueryProvider.jsx`

Complete QueryClient configuration with production defaults.

```javascript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000,      // 5 minutes fresh
      cacheTime: 10 * 60 * 1000,      // 10 minutes in cache
      refetchOnWindowFocus: false,     // Disable focus refetch
      refetchOnReconnect: true,        // Refetch on reconnect
    },
    mutations: {
      retry: 1,                        // Retry mutations once
    },
  },
});

export const QueryProvider = ({ children }) => {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

export default QueryProvider;
```

**Key Configuration**:
- `staleTime: 5min` - Data stays fresh for 5 minutes without refetch
- `cacheTime: 10min` - Inactive queries cached for 10 minutes
- `retry: 3` - Retry failed queries 3 times
- `refetchOnWindowFocus: false` - Prevent unnecessary refetches
- `mutations.retry: 1` - Retry mutations once on error

---

### useApi Hook

**File**: `/src/hooks/useApi.js`

React Query wrapper with automatic cache invalidation.

```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import apiService from '../services/api.service';

export const useApi = () => {
  const queryClient = useQueryClient();

  // Generic GET request hook
  const useGet = (key, url, options = {}) => {
    return useQuery({
      queryKey: [key],
      queryFn: () => apiService.get(url),
      ...options,
    });
  };

  // Generic POST request hook
  const usePost = (key, url, options = {}) => {
    return useMutation({
      mutationKey: [key],
      mutationFn: (data) => apiService.post(url, data),
      onSuccess: () => {
        queryClient.invalidateQueries([key]);
      },
      ...options,
    });
  };

  // Generic PUT request hook
  const usePut = (key, url, options = {}) => {
    return useMutation({
      mutationKey: [key],
      mutationFn: (data) => apiService.put(url, data),
      onSuccess: () => {
        queryClient.invalidateQueries([key]);
      },
      ...options,
    });
  };

  // Generic DELETE request hook
  const useDelete = (key, url, options = {}) => {
    return useMutation({
      mutationKey: [key],
      mutationFn: (id) => apiService.delete(`${url}/${id}`),
      onSuccess: () => {
        queryClient.invalidateQueries([key]);
      },
      ...options,
    });
  };

  return {
    useGet,
    usePost,
    usePut,
    useDelete,
    queryClient,
  };
};

export default useApi;
```

**Pattern Highlights**:
1. **Reusable Wrappers**: Generic hooks for CRUD operations
2. **Automatic Invalidation**: onSuccess invalidates matching queries
3. **Flexible Override**: Spread options for customization
4. **QueryClient Access**: Exposed for imperative operations

---

## React Component Examples

### Basic Query Component

```javascript
import useApi from '../hooks/useApi';

function UserProfile({ userId }) {
  const { useGet } = useApi();

  const { data, isLoading, error } = useGet(
    ['user', userId],
    `/api/users/${userId}`
  );

  if (isLoading) return <div className="spinner">Loading...</div>;
  if (error) return <div className="error">Error: {error.message}</div>;

  return (
    <div className="user-profile">
      <h1>{data.name}</h1>
      <p>{data.email}</p>
    </div>
  );
}
```

---

### Mutation Component

```javascript
import { useState } from 'react';
import useApi from '../hooks/useApi';

function CreateTodoForm() {
  const [title, setTitle] = useState('');
  const { usePost } = useApi();

  const createTodo = usePost('todos', '/api/todos', {
    onSuccess: (data) => {
      console.log('Todo created:', data);
      setTitle(''); // Reset form
    },
    onError: (error) => {
      console.error('Failed to create todo:', error);
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createTodo.mutate({ title });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Todo title"
        disabled={createTodo.isPending}
      />
      <button type="submit" disabled={createTodo.isPending}>
        {createTodo.isPending ? 'Creating...' : 'Create Todo'}
      </button>
      {createTodo.isError && (
        <div className="error">{createTodo.error.message}</div>
      )}
    </form>
  );
}
```

---

### Dependent Queries

```javascript
function UserPosts({ userId }) {
  const { useGet } = useApi();

  // First: fetch user
  const { data: user } = useGet(['user', userId], `/api/users/${userId}`);

  // Second: fetch posts (only if user loaded)
  const { data: posts, isLoading } = useGet(
    ['posts', user?.id],
    `/api/users/${user?.id}/posts`,
    {
      enabled: !!user?.id, // Only run when user.id exists
    }
  );

  if (isLoading) return <div>Loading posts...</div>;

  return (
    <div className="user-posts">
      <h2>{user?.name}'s Posts</h2>
      {posts?.map(post => (
        <div key={post.id} className="post">
          <h3>{post.title}</h3>
          <p>{post.content}</p>
        </div>
      ))}
    </div>
  );
}
```

---

### Paginated Query

```javascript
import { useState } from 'react';
import { keepPreviousData } from '@tanstack/react-query';
import useApi from '../hooks/useApi';

function PaginatedTodos() {
  const [page, setPage] = useState(1);
  const { useGet } = useApi();

  const { data, isLoading, isPlaceholderData } = useGet(
    ['todos', 'list', { page }],
    `/api/todos?page=${page}`,
    {
      placeholderData: keepPreviousData,
    }
  );

  return (
    <div>
      {isLoading ? (
        <div>Loading...</div>
      ) : (
        <div className={isPlaceholderData ? 'opacity-50' : ''}>
          {data.todos.map(todo => (
            <div key={todo.id}>{todo.title}</div>
          ))}
        </div>
      )}

      <div className="pagination">
        <button
          onClick={() => setPage(old => Math.max(old - 1, 1))}
          disabled={page === 1 || isPlaceholderData}
        >
          Previous
        </button>
        <span>Page {page}</span>
        <button
          onClick={() => setPage(old => old + 1)}
          disabled={!data?.hasMore || isPlaceholderData}
        >
          Next
        </button>
      </div>
    </div>
  );
}
```

---

### Optimistic Update

```javascript
import useApi from '../hooks/useApi';

function TodoItem({ todo }) {
  const { usePut, queryClient } = useApi();

  const updateTodo = usePut(['todos', todo.id], `/api/todos/${todo.id}`, {
    // Optimistically update before server confirms
    onMutate: async (newTodo) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['todos', todo.id] });

      // Snapshot previous value
      const previousTodo = queryClient.getQueryData(['todos', todo.id]);

      // Optimistically update cache
      queryClient.setQueryData(['todos', todo.id], newTodo);

      // Return rollback data
      return { previousTodo };
    },

    // Rollback on error
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(['todos', todo.id], context.previousTodo);
    },

    // Refetch to ensure server state
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['todos', todo.id] });
    },
  });

  const toggleComplete = () => {
    updateTodo.mutate({
      ...todo,
      completed: !todo.completed,
    });
  };

  return (
    <div className="todo-item">
      <input
        type="checkbox"
        checked={todo.completed}
        onChange={toggleComplete}
      />
      <span>{todo.title}</span>
    </div>
  );
}
```

---

### Infinite Query

```javascript
import { useInfiniteQuery } from '@tanstack/react-query';
import apiService from '../services/api.service';

function InfiniteTodosList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery({
    queryKey: ['todos', 'infinite'],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await apiService.get(`/api/todos?cursor=${pageParam}`);
      return response.data;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    maxPages: 10, // Limit cached pages
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {data.pages.map((page, i) => (
        <React.Fragment key={i}>
          {page.todos.map(todo => (
            <div key={todo.id} className="todo-item">
              {todo.title}
            </div>
          ))}
        </React.Fragment>
      ))}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
        className="load-more"
      >
        {isFetchingNextPage
          ? 'Loading more...'
          : hasNextPage
          ? 'Load More'
          : 'Nothing more to load'}
      </button>
    </div>
  );
}
```

---

### Prefetching on Hover

```javascript
import { Link } from 'react-router-dom';
import useApi from '../hooks/useApi';

function TodoLink({ todoId }) {
  const { queryClient } = useApi();

  const prefetchTodo = () => {
    queryClient.prefetchQuery({
      queryKey: ['todo', todoId],
      queryFn: () => apiService.get(`/api/todos/${todoId}`),
      staleTime: 10 * 1000, // Keep fresh for 10s
    });
  };

  return (
    <Link
      to={`/todos/${todoId}`}
      onMouseEnter={prefetchTodo}
      className="todo-link"
    >
      View Todo {todoId}
    </Link>
  );
}
```

---

### Error Handling with Retry

```javascript
import useApi from '../hooks/useApi';

function CriticalDataComponent() {
  const { useGet } = useApi();

  const { data, error, isError } = useGet(
    ['critical-data'],
    '/api/critical',
    {
      retry: (failureCount, error) => {
        // Don't retry 404/401
        if ([404, 401].includes(error.response?.status)) {
          return false;
        }
        // Retry other errors up to 5 times
        return failureCount < 5;
      },
      retryDelay: (attemptIndex) => {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        return Math.min(1000 * 2 ** attemptIndex, 30000);
      },
    }
  );

  if (isError) {
    return (
      <div className="error-page">
        <h2>Error Loading Data</h2>
        <p>{error.message}</p>
        <button onClick={() => refetch()}>Retry</button>
      </div>
    );
  }

  return <div>{data?.content}</div>;
}
```

---

### Custom Hook with Query Factory

```javascript
// hooks/useTodos.js
const todoKeys = {
  all: ['todos'],
  lists: () => [...todoKeys.all, 'list'],
  list: (filters) => [...todoKeys.lists(), { filters }],
  details: () => [...todoKeys.all, 'detail'],
  detail: (id) => [...todoKeys.details(), id],
};

export function useTodos() {
  const { useGet } = useApi();

  return {
    useAllTodos: (filters = 'all') =>
      useGet(todoKeys.list(filters), `/api/todos?filter=${filters}`),

    useTodo: (id) =>
      useGet(todoKeys.detail(id), `/api/todos/${id}`),
  };
}

// Usage in component
function TodosList() {
  const { useAllTodos } = useTodos();
  const { data: todos, isLoading } = useAllTodos('active');

  if (isLoading) return <div>Loading...</div>;

  return (
    <div>
      {todos.map(todo => (
        <div key={todo.id}>{todo.title}</div>
      ))}
    </div>
  );
}
```

---

### Global Error Handling

```javascript
import { QueryCache, QueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Show toast notification
      toast.error(`Error fetching ${query.queryKey[0]}: ${error.message}`);

      // Log to monitoring service
      if (window.Sentry) {
        window.Sentry.captureException(error, {
          extra: { queryKey: query.queryKey },
        });
      }
    },
  }),
});
```

---

### Suspense Integration

```javascript
import { Suspense } from 'react';
import { useSuspenseQuery } from '@tanstack/react-query';

function TodoComponent({ todoId }) {
  // Throws promise to Suspense boundary until data loads
  const { data } = useSuspenseQuery({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
  });

  // No loading state needed - Suspense handles it
  return <TodoView data={data} />;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <TodoComponent todoId={1} />
    </Suspense>
  );
}
```

---

### DevTools Integration

```javascript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
      )}
    </QueryClientProvider>
  );
}
```

---

## Best Practices from Project

1. **Query Key Factory**: Consistent hierarchical structure for easy invalidation
2. **Automatic Invalidation**: onSuccess callbacks invalidate related queries
3. **Optimistic Updates**: Immediate UI feedback with rollback on error
4. **Error Boundaries**: Centralized error handling with global callbacks
5. **Prefetching**: Hover prefetch for perceived performance
6. **Conditional Retry**: Don't retry 404/401 errors
7. **StaleTime Configuration**: 5 minutes prevents unnecessary refetches
8. **Custom Hooks**: Encapsulate query logic for reusability
9. **TypeScript**: Type-safe query keys and responses
10. **DevTools**: Enable in development for debugging

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| `const [data, setData] = useState(queryData)` | Prevents background updates | Use query data directly |
| Missing variables in queryKey | Cache doesn't update | Include all dependencies in key |
| Using setQueryData for app state | Refetch overrides | Use Zustand/Redux for client state |
| Not configuring staleTime | Every mount fetches | Set appropriate staleTime |
| Invalidating everything | Unnecessary refetches | Target specific query keys |
| Retrying 404 errors | Wasted attempts | Conditional retry logic |
| No loading/error states | Component crashes | Always handle isLoading/isError |

---

## Testing Examples

### Mock Query

```javascript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

test('renders user profile', async () => {
  const queryClient = createTestQueryClient();

  render(
    <QueryClientProvider client={queryClient}>
      <UserProfile userId={1} />
    </QueryClientProvider>
  );

  expect(await screen.findByText('John Doe')).toBeInTheDocument();
});
```

### Mock API Response

```javascript
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('/api/users/:id', (req, res, ctx) => {
    return res(
      ctx.json({
        id: 1,
        name: 'John Doe',
        email: 'john@example.com',
      })
    );
  })
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

---

## Performance Tips

1. **Use staleTime wisely**: Set based on data volatility
2. **Prefetch on hover**: Improve perceived performance
3. **keepPreviousData**: Prevent UI jank during pagination
4. **maxPages for infinite queries**: Prevent memory leaks
5. **Disable refetchOnWindowFocus**: Reduce unnecessary requests
6. **Use query key factory**: Consistent invalidation patterns
7. **Optimize with React.memo**: Prevent unnecessary re-renders
8. **Batch invalidations**: Use global mutation cache callbacks
