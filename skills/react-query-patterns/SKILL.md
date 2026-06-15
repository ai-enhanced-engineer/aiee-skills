---
name: react-query-patterns
description: TanStack Query v5 data fetching patterns for React 18 including caching, mutations, invalidation, and optimistic updates. Use when fetching and caching server data in React, wiring mutations with cache invalidation, or replacing manual fetch+useEffect patterns.
kb-sources:
  - wiki/software-engineering/react-query
updated: 2026-05-21
---

# React Query (TanStack Query v5)

Powerful server state management for React with automatic caching, background refetching, and declarative data fetching.

## When to Use

- Fetching and caching server data
- Background data synchronization
- Automatic request deduplication
- Pagination and infinite scroll
- Optimistic UI updates
- Server state separate from client state

## Quick Reference

### Basic Query

`useQuery` fetches and caches server data with automatic refetching:
- Provide `queryKey` (array) for cache organization
- Provide `queryFn` (async function) that returns data
- Returns `{ data, isLoading, error, refetch }`

See **examples.md** for complete implementations.

### Mutation

`useMutation` handles create/update/delete operations:
- Provide `mutationFn` for the operation
- Use `onSuccess` to invalidate related queries
- Returns `{ mutate, isPending, error }`

See **examples.md** for mutation patterns with invalidation.

## Key Patterns

| Pattern | Use Case | Example |
|---------|----------|---------|
| **Query Keys** | Cache organization | `['todos', 'list', { filter: 'active' }]` |
| **staleTime** | How long data stays fresh | `60 * 1000` (1 minute) |
| **gcTime** | Cache garbage collection | `5 * 60 * 1000` (5 minutes) |
| **Invalidation** | Refetch after mutation | `queryClient.invalidateQueries({ queryKey })` |
| **Optimistic Updates** | Instant UI feedback | Update cache, rollback on error |
| **Dependent Queries** | Sequential fetching | `enabled: !!userId` |

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| **Copying query data to useState** | Keep data in query cache for automatic background updates |
| **Query operations without key factories** | Use factory pattern for consistent hierarchical invalidation |
| **staleTime: 0 (default)** | Configure staleTime to reduce unnecessary network requests |
| **Invalidating everything** | Target specific query keys for efficient refetching |
| **Using setQueryData for app state** | Use React Query for server state, Zustand/Context for client state |
| **Missing query keys** | Provide complete query keys for proper deduplication and caching |

---

**See reference.md** for complete caching strategies, performance optimization, and advanced patterns.

**See examples.md** for production query implementations and testing patterns.
