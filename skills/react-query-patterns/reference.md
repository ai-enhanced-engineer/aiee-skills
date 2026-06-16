# React Query Reference - TanStack Query v5

Complete guide to server state management in React 18 applications using TanStack Query v5.

## Table of Contents

1. [Setup and Configuration](#setup-and-configuration)
2. [Query Keys](#query-keys)
3. [Query Patterns](#query-patterns)
4. [Mutations](#mutations)
5. [Cache Management](#cache-management)
6. [Error Handling](#error-handling)
7. [Performance Optimization](#performance-optimization)
8. [DevTools](#devtools)

---

## Setup and Configuration

### Installation

```bash
npm install @tanstack/react-query
npm install @tanstack/react-query-devtools --save-dev
```

### Provider Setup

**Recommended Configuration**:
```javascript
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 minutes fresh
      gcTime: 10 * 60 * 1000,        // 10 minutes in cache (was cacheTime)
      retry: 3,                      // Retry 3 times
      refetchOnWindowFocus: false,   // Don't refetch on focus
      refetchOnReconnect: true,      // Refetch on reconnect
    },
    mutations: {
      retry: 1,                      // Retry mutations once
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
```

**Key Configuration Options**:

| Option | Default | Purpose |
|--------|---------|---------|
| `staleTime` | 0 | How long data stays fresh (no refetch) |
| `gcTime` | 5 min | How long inactive queries stay cached |
| `retry` | 3 | Number of retry attempts on error |
| `refetchOnWindowFocus` | true | Refetch when window gains focus |
| `refetchOnReconnect` | true | Refetch when network reconnects |

**Mental Model**: `staleTime` controls freshness, `gcTime` controls cache lifetime.

```
Request → Fresh (use cache) → Stale (cache + background refetch) → Inactive → GC → Removed
          |← staleTime →|                                         |← gcTime →|
```

---

## Query Keys

Query keys are hierarchical arrays that uniquely identify queries and enable intelligent cache management.

### Structure Principles

**Rule 1**: Structure from **most generic to most specific**

```javascript
// Bad: Flat, hard to invalidate
['todo1']
['todo2']
['todoListFiltered']

// Good: Hierarchical
['todos', 'list', { filters: 'all' }]
['todos', 'list', { filters: 'done' }]
['todos', 'detail', 1]
['todos', 'detail', 2]
```

**Rule 2**: Include all variables that affect query result

```javascript
// Bad: Missing dependency
useQuery({
  queryKey: ['user'],
  queryFn: () => fetchUser(userId), // userId not in key!
})

// Good: All dependencies in key
useQuery({
  queryKey: ['user', userId],
  queryFn: () => fetchUser(userId),
})
```

### Query Key Factory Pattern

Recommended for consistency and type safety:

```javascript
const todoKeys = {
  all: ['todos'] as const,
  lists: () => [...todoKeys.all, 'list'] as const,
  list: (filters: string) => [...todoKeys.lists(), { filters }] as const,
  details: () => [...todoKeys.all, 'detail'] as const,
  detail: (id: number) => [...todoKeys.details(), id] as const,
}

// Usage
useQuery({
  queryKey: todoKeys.detail(1),
  queryFn: () => fetchTodo(1)
})

// Invalidation
queryClient.invalidateQueries({ queryKey: todoKeys.all })       // All todos
queryClient.invalidateQueries({ queryKey: todoKeys.lists() })   // All lists
queryClient.invalidateQueries({ queryKey: todoKeys.detail(1) }) // Specific todo
```

**Benefits**:
- Consistent key structure
- Easy invalidation
- Type-safe with TypeScript
- Autocomplete support

---

## Query Patterns

### Basic Query

```javascript
function UserProfile({ userId }) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['user', userId],
    queryFn: async () => {
      const response = await fetch(`/api/users/${userId}`)
      if (!response.ok) throw new Error('Failed to fetch user')
      return response.json()
    },
  })

  if (isLoading) return <Spinner />
  if (error) return <ErrorMessage error={error} />

  return <UserCard user={data} onRefresh={refetch} />
}
```

### Dependent Queries

Queries that depend on data from previous queries:

```javascript
function UserPosts({ userId }) {
  // First: fetch user
  const { data: user } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => fetchUser(userId),
  })

  // Second: fetch user's posts (only after user loaded)
  const { data: posts } = useQuery({
    queryKey: ['posts', user?.id],
    queryFn: () => fetchUserPosts(user.id),
    enabled: !!user?.id, // Only run when user.id exists
  })

  return <PostsList posts={posts} />
}
```

### Parallel Queries

Execute multiple independent queries simultaneously:

```javascript
function Dashboard() {
  const userQuery = useQuery({
    queryKey: ['user'],
    queryFn: fetchUser,
  })

  const postsQuery = useQuery({
    queryKey: ['posts'],
    queryFn: fetchPosts,
  })

  const notificationsQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: fetchNotifications,
  })

  // All queries run in parallel
  if (userQuery.isLoading || postsQuery.isLoading || notificationsQuery.isLoading) {
    return <LoadingDashboard />
  }

  return (
    <DashboardView
      user={userQuery.data}
      posts={postsQuery.data}
      notifications={notificationsQuery.data}
    />
  )
}
```

**Dynamic Parallel Queries**:
```javascript
function DynamicDashboard({ userIds }) {
  const userQueries = useQueries({
    queries: userIds.map(id => ({
      queryKey: ['user', id],
      queryFn: () => fetchUser(id),
    })),
  })

  const allLoaded = userQueries.every(q => q.isSuccess)

  return allLoaded ? <UsersGrid users={userQueries.map(q => q.data)} /> : <Loading />
}
```

### Paginated Queries

Traditional page-based pagination:

```javascript
import { keepPreviousData } from '@tanstack/react-query'

function PaginatedPosts() {
  const [page, setPage] = useState(1)

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['posts', 'list', { page }],
    queryFn: () => fetchPosts(page),
    placeholderData: keepPreviousData, // Keep old data while fetching new
  })

  return (
    <div>
      <PostsList posts={data.posts} />
      <Pagination
        currentPage={page}
        onNext={() => setPage(old => old + 1)}
        onPrev={() => setPage(old => Math.max(old - 1, 1))}
        hasMore={data.hasMore}
        disabled={isPlaceholderData}
      />
    </div>
  )
}
```

**Key Feature**: `keepPreviousData` prevents UI jank by showing old data during refetch.

### Infinite Queries

For infinite scroll or "load more" patterns:

```javascript
import { useInfiniteQuery } from '@tanstack/react-query'

function InfinitePostsList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ['posts', 'infinite'],
    queryFn: ({ pageParam = 0 }) => fetchPosts(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialPageParam: 0,
    maxPages: 10, // v5: Limit cached pages
  })

  return (
    <div>
      {data.pages.map((page, i) => (
        <React.Fragment key={i}>
          {page.posts.map(post => (
            <PostCard key={post.id} post={post} />
          ))}
        </React.Fragment>
      ))}

      <button
        onClick={() => fetchNextPage()}
        disabled={!hasNextPage || isFetchingNextPage}
      >
        {isFetchingNextPage ? 'Loading...' : hasNextPage ? 'Load More' : 'No more'}
      </button>
    </div>
  )
}
```

**v5 Enhancement**: `maxPages` option prevents memory leaks in long scroll sessions.

---

## Mutations

Mutations handle create/update/delete operations.

### Basic Mutation

```javascript
import { useMutation, useQueryClient } from '@tanstack/react-query'

function AddTodoComponent() {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: (newTodo) => createTodo(newTodo),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: ['todos', 'list'] })
    },
    onError: (error) => {
      toast.error(`Failed: ${error.message}`)
    },
  })

  return (
    <button
      onClick={() => mutation.mutate({ title: 'New Todo' })}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? 'Adding...' : 'Add Todo'}
    </button>
  )
}
```

**Key Properties**:
- `isPending`: Mutation is in progress
- `isSuccess`: Mutation succeeded
- `isError`: Mutation failed
- `data`: Mutation result
- `error`: Error object

### Mutation Lifecycle Callbacks

```javascript
const mutation = useMutation({
  mutationFn: updateTodo,

  onMutate: async (variables) => {
    // Before mutation runs (optimistic updates)
    console.log('Starting mutation with:', variables)
  },

  onSuccess: (data, variables, context) => {
    // After successful mutation
    console.log('Mutation succeeded:', data)
  },

  onError: (error, variables, context) => {
    // After failed mutation
    console.error('Mutation failed:', error)
  },

  onSettled: (data, error, variables, context) => {
    // After mutation completes (success or error)
    console.log('Mutation completed')
  },
})
```

### Optimistic Updates

Update UI immediately before server confirms:

```javascript
const updateTodo = useMutation({
  mutationFn: (updatedTodo) => api.updateTodo(updatedTodo),

  onMutate: async (newTodo) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({ queryKey: ['todos', newTodo.id] })

    // Snapshot previous value
    const previousTodo = queryClient.getQueryData(['todos', newTodo.id])

    // Optimistically update cache
    queryClient.setQueryData(['todos', newTodo.id], newTodo)

    // Return rollback data
    return { previousTodo }
  },

  onError: (err, newTodo, context) => {
    // Rollback on error
    queryClient.setQueryData(['todos', newTodo.id], context.previousTodo)
  },

  onSettled: (newTodo) => {
    // Refetch to ensure server state
    queryClient.invalidateQueries({ queryKey: ['todos', newTodo.id] })
  },
})
```

**Pattern**: Cancel → Snapshot → Update → (Error: Rollback) → Always Refetch

---

## Cache Management

### Cache Invalidation

Mark queries as stale and trigger refetch:

```javascript
const queryClient = useQueryClient()

// Invalidate ALL queries
queryClient.invalidateQueries()

// Invalidate specific entity type
queryClient.invalidateQueries({ queryKey: ['todos'] })

// Invalidate exact match only
queryClient.invalidateQueries({ queryKey: ['todos', 'list'], exact: true })

// Invalidate with predicate
queryClient.invalidateQueries({
  predicate: (query) => query.queryKey[0] === 'todos' && query.queryKey[1] !== 'archived',
})
```

**Key Insight**: Invalidation only refetches **active queries** currently on-screen. Others are marked stale for later.

### Manual Cache Updates

Direct cache manipulation:

```javascript
// Set query data
queryClient.setQueryData(['todo', 1], newTodoData)

// Update existing data
queryClient.setQueryData(['todo', 1], (oldData) => ({
  ...oldData,
  completed: true,
}))

// Get query data
const todo = queryClient.getQueryData(['todo', 1])

// Remove query from cache
queryClient.removeQueries({ queryKey: ['todo', 1] })

// Update multiple queries
queryClient.setQueriesData(
  { queryKey: ['todos'] },
  (oldData) => oldData.map(todo =>
    todo.id === 1 ? { ...todo, completed: true } : todo
  )
)
```

**Warning**: Never use `setQueryData` for app state. Background refetches override it. Use for optimistic updates only.

### Global Cache Callbacks

Centralized invalidation on all mutations:

```javascript
import { MutationCache } from '@tanstack/react-query'

const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onSuccess: () => {
      // Fire-and-forget: invalidate everything
      queryClient.invalidateQueries()
    },
  }),
})
```

**Fine-Grained Strategy**:
```javascript
mutationCache: new MutationCache({
  onSuccess: (_data, _variables, _context, mutation) => {
    const invalidates = mutation.meta?.invalidates || []
    invalidates.forEach(queryKey => {
      queryClient.invalidateQueries({ queryKey })
    })
  },
})

// Usage
useMutation({
  mutationFn: createTodo,
  meta: {
    invalidates: [['todos', 'list'], ['todos', 'stats']],
  },
})
```

---

## Error Handling

### Local Error Checking

```javascript
function TodoComponent({ todoId }) {
  const { data, error, isError, isLoading } = useQuery({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
  })

  if (isLoading) return <Spinner />
  if (isError) return <ErrorDisplay error={error} />

  return <TodoView data={data} />
}
```

### Error Boundaries

Propagate errors to React Error Boundaries:

```javascript
// Component
function TodoComponent({ todoId }) {
  const { data } = useQuery({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
    throwOnError: true, // Throw to nearest Error Boundary
  })

  return <TodoView data={data} />
}

// Wrapper
function App() {
  return (
    <ErrorBoundary fallback={<ErrorPage />}>
      <TodoComponent todoId={1} />
    </ErrorBoundary>
  )
}
```

**v5 Conditional Error Boundaries**:
```javascript
useQuery({
  queryKey: ['todo', todoId],
  queryFn: () => fetchTodo(todoId),
  throwOnError: (error) => error.response?.status >= 500, // Only server errors
})
```

### Retry Configuration

**Global**:
```javascript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
})
```

**Conditional**:
```javascript
useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
  retry: (failureCount, error) => {
    // Don't retry 404/401
    if ([404, 401].includes(error.response?.status)) return false
    // Retry others up to 5 times
    return failureCount < 5
  },
})
```

### Error Recovery

Show stale data with error indicator:

```javascript
const { data, error, isError } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
})

// Background refetch failed, but we have cached data
if (isError && data) {
  return (
    <>
      <ErrorBanner error={error} />
      <TodosList data={data} stale />
    </>
  )
}

// Initial load failed
if (isError && !data) {
  return <ErrorPage error={error} retry={refetch} />
}

return <TodosList data={data} />
```

---

## Performance Optimization

### Prefetching

Proactively fetch data before it's needed:

```javascript
const queryClient = useQueryClient()

// Prefetch on hover
function TodoLink({ todoId }) {
  const prefetchTodo = () => {
    queryClient.prefetchQuery({
      queryKey: ['todo', todoId],
      queryFn: () => fetchTodo(todoId),
      staleTime: 10 * 1000,
    })
  }

  return (
    <Link to={`/todo/${todoId}`} onMouseEnter={prefetchTodo}>
      View Todo {todoId}
    </Link>
  )
}

// Parallel prefetch
async function prefetchDashboard() {
  await Promise.all([
    queryClient.prefetchQuery({ queryKey: ['user'], queryFn: fetchUser }),
    queryClient.prefetchQuery({ queryKey: ['posts'], queryFn: fetchPosts }),
    queryClient.prefetchQuery({ queryKey: ['notifications'], queryFn: fetchNotifications }),
  ])
}
```

### Initial Data

Avoid loading states when data is already available:

```javascript
function TodoDetail({ todoId, todosFromList }) {
  const { data } = useQuery({
    queryKey: ['todo', todoId],
    queryFn: () => fetchTodo(todoId),
    initialData: () => {
      return todosFromList?.find(todo => todo.id === todoId)
    },
    initialDataUpdatedAt: () => {
      return queryClient.getQueryState(['todos', 'list'])?.dataUpdatedAt
    },
  })

  return <TodoView data={data} />
}
```

### Window Focus Refetching

```javascript
// Disable globally
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
})

// Custom per query
useQuery({
  queryKey: ['live-data'],
  queryFn: fetchLiveData,
  refetchOnWindowFocus: 'always', // Refetch even if fresh
})
```

### Automatic Refetching

```javascript
// Refetch every 30 seconds
useQuery({
  queryKey: ['live-updates'],
  queryFn: fetchLiveData,
  refetchInterval: 30 * 1000,
  refetchIntervalInBackground: false, // Only when focused
})

// Conditional interval
useQuery({
  queryKey: ['live-updates'],
  queryFn: fetchLiveData,
  refetchInterval: (data) => data?.active ? 10000 : 60000,
})
```

---

## DevTools

### Setup

```javascript
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <YourApp />
      <ReactQueryDevtools initialIsOpen={false} position="bottom-right" />
    </QueryClientProvider>
  )
}
```

**Production Safety**: DevTools are automatically excluded from production builds.

### Key Features

**Query Inspector**:
- View all queries in realtime
- Inspect query keys, status, data payloads
- Track fetch counts and cache timing
- See observers (components watching query)

**Cache Management**:
- Clear entire cache or individual queries
- Force refetch any query
- View cache size and memory usage

**Debugging Helpers**:
```javascript
const queryClient = useQueryClient()

// Check if query exists
const isCached = queryClient.getQueryState(['todos', 1]) !== undefined

// Get query data without fetch
const data = queryClient.getQueryData(['todos', 1])

// Get query metadata
const state = queryClient.getQueryState(['todos', 1])
console.log({
  status: state.status,
  fetchStatus: state.fetchStatus,
  dataUpdatedAt: state.dataUpdatedAt,
  error: state.error,
})
```

---

## Async Assertions / Flaky Tests

When testing mutation CTAs with React Testing Library, wait for the button to be **enabled**, not just rendered. A button that appears in the DOM while a query is loading will be disabled until data resolves — asserting on existence alone produces intermittent passes.

```tsx
// Flaky — button renders disabled during loading
expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();

// Reliable — wait for the enabled state
await waitFor(() => {
  expect(screen.getByRole('button', { name: /submit/i })).not.toBeDisabled();
});
```

The `waitFor` approach survives query-refetch races and avoids the timing window where the button is present but gated on `isPending` or `isLoading` from a dependent query.

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **Copying query data to useState** | Prevents background updates | Use query data directly |
| **Not including variables in queryKey** | Cache doesn't update on variable change | Include all dependencies in key |
| **Using setQueryData for app state** | Background refetch overrides | Use Zustand/Redux for client state |
| **Not configuring staleTime** | Every mount triggers network request | Set appropriate staleTime |
| **Invalidating everything always** | Unnecessary refetches | Use targeted invalidation |
| **Retrying 404/401 errors** | Wasted retry attempts | Conditional retry logic |
| **Not handling loading/error states** | Component crashes | Always check isLoading/isError |

---

## References

- [TanStack Query v5 Documentation](https://tanstack.com/query/latest)
- [Practical React Query - TkDodo](https://tkdodo.eu/blog/practical-react-query)
- [Effective React Query Keys - TkDodo](https://tkdodo.eu/blog/effective-react-query-keys)
- [React Query Error Handling - TkDodo](https://tkdodo.eu/blog/react-query-error-handling)
