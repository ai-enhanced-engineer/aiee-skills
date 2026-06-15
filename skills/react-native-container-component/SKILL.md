---
name: react-native-container-component
description: React Native Container/Component pattern with Redux. Containers connect to Redux, Components are presentational. Flow props typing, feature-based folder structure. Use when separating Redux state logic from presentational UI in React Native, structuring feature folders, or improving component testability.
kb-sources:
  - wiki/software-engineering/rn-container-component
updated: 2026-05-21
---

# React Native Container/Component Pattern

Separate concerns in React Native apps: Containers handle Redux state, Components render UI.

## When to Use

- React Native with Redux state management
- Separating stateful logic from presentation
- Improving component testability
- Creating reusable presentational components
- Flow-typed props for type safety

## Pattern Overview

**Container** (Smart):
- Connects to Redux with `connect()`
- Maps state/actions to props
- Passes data to presentational component
- Minimal rendering logic

**Component** (Presentational):
- Receives data via props
- Renders UI based on props
- Calls prop functions for actions
- No Redux dependencies
- Highly reusable

## When to Connect vs Pass Props

| Scenario | Solution | Reason |
|----------|----------|--------|
| Top-level screen | Connect | Minimize prop drilling |
| Shared component (multiple places) | Connect | Self-contained, reusable |
| Child needs parent's data | Pass props | Keep parent in control |
| Deep nesting (3+ levels) | Connect deeper | Avoid prop drilling |
| Presentational reusable | Pass props | Maximize reusability |

## Testing: Transitive Import Chains

Containers don't import UI libraries directly — their child Components do. When writing mount tests:

- Container test failures are caused by **transitive** module resolution, not direct imports
- When migration removes a UI lib from a Component, both the Component test AND its parent Container test unblock simultaneously
- Use `renderWithRedux` helper for connected containers to avoid store setup boilerplate

**Implication for migration**: You can predict which tests unblock together by tracing the import chain, not just listing direct dependencies.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| Redux logic in presentational | Keep Redux in containers |
| Over-connecting (every component) | Connect at feature boundaries |
| Excessive prop drilling | Connect deeper (3+ levels) |
| Not typing props | Define Props type with Flow |
| Business logic in presentation | Logic in containers/actions |
| Connecting library components | Wrap in container |

**reference.md**: Redux connect patterns, mapStateToProps optimization, Flow typing patterns, testing strategies, functional components with hooks, anti-patterns
**examples.md**: Complete HomeContainer/HomeComponent pairs, RegistrationContainer with Formik, nested VideoGallery pattern, testing examples, real-world structure
