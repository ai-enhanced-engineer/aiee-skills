---
name: react-vite-modern-patterns
description: Modern React 18 application patterns with Vite 5 build tool, custom hooks, and component architecture. Use when scaffolding React + Vite projects, designing custom hooks, organizing component hierarchies, or migrating from Create React App.
kb-sources:
  - wiki/software-engineering/vite-react
updated: 2026-05-21
---

# React 18 + Vite 5 Modern Patterns

Modern React 18 patterns with Vite 5, custom hooks, component composition, and concurrent features.

## When to Use

- Building new React 18 applications with Vite
- Creating custom hooks for reusable logic
- Setting up Vite configuration and plugins
- Implementing streaming and concurrent rendering
- Optimizing build performance and HMR
- Managing environment variables (VITE_ prefix)

## Quick Reference

### Custom Hook Pattern

Custom hooks extract reusable logic from components:
- Use `useCallback` for stable function references
- Return stable object structure
- Compose with other hooks (useStore, useEffect)
- Prefix with `use` (e.g., useChat, useTheme, useApi)

See **examples.md** for complete custom hook implementations.

### Vite Config Essentials

| Feature | Configuration |
|---------|--------------|
| **React Plugin** | `@vitejs/plugin-react` for Fast Refresh |
| **PWA** | `vite-plugin-pwa` for service workers |
| **Env Variables** | `VITE_` prefix (e.g., `VITE_API_URL`) |
| **Base URL** | `base: '/app/'` for subpath deployment |
| **Dev Server** | `server: { port: 5173, host: true }` |

### Hook Best Practices

| Pattern | Use Case |
|---------|----------|
| `useCallback` | Stable function references for props |
| `useMemo` | Expensive computations, object/array deps |
| `useEffect` | Side effects, cleanup on unmount |
| Custom hooks | Reusable logic (useChat, useTheme, useApi) |

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| **Prop drilling through multiple levels** | Use composition or React Context for shared state |
| **Inline functions in JSX** | Extract to useCallback for stable references |
| **Missing dependency arrays** | Specify deps in useEffect/useCallback/useMemo — omitting them causes stale closures that capture outdated values and can trigger unintended re-runs |
| **Over-using useEffect** | Consider derived state or useMemo for computed values |
| **Not memoizing expensive computations** | Use useMemo to prevent unnecessary recalculations |

---

**See reference.md** for project structure, Vite configuration deep-dive, environment variable patterns, and React 18 concurrent features.

**See examples.md** for complete implementations including useChat, useTheme, ErrorBoundary, Suspense patterns, and Vite configs.
