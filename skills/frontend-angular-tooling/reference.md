# Angular Tooling Reference

Detailed MCP server configuration and CLI patterns.

## MCP Server Deep Dive

### Tool: `get_best_practices`

Returns Angular's official best practices guide covering:
- Standalone component patterns
- Signal-based state management
- Modern control flow syntax
- Accessibility requirements

**Usage in Claude Code:**
```
Use the get_best_practices tool to check current Angular patterns before generating code.
```

### Tool: `search_documentation`

Real-time queries to angular.dev. Solves the "stale AI knowledge" problem.

**Example queries:**
- "How to use signals in Angular 21"
- "Resource API for async data"
- "Zoneless change detection setup"

### Tool: `find_examples`

Retrieves official code examples from Angular documentation.

**Usage:**
```
Find examples for signal-based forms in Angular 21
```

### Tool: `list_projects`

Maps your workspace structure from `angular.json`. Useful for:
- Understanding monorepo layout
- Identifying existing components
- Project-specific configurations

### Tool: `onpush_zoneless_migration`

Analyzes code and provides migration plans for:
- Converting to OnPush change detection
- Migrating to zoneless (Angular 21 default)
- Signal adoption from RxJS patterns

## Prompting Patterns for Angular

### System Prompt Template

```
You are an expert in TypeScript and Angular 21+.

Key Principles:
- Write functional, maintainable, performant, accessible code
- Assume strict: true in tsconfig.json
- Prefer type inference; avoid 'any', use 'unknown'

Angular-Specific Rules:
- ALWAYS use standalone components (standalone: true is default)
- Use signals for state: signal(), computed(), effect()
- Use input() and output() functions, NOT @Input/@Output decorators
- Use modern control flow: @if, @for, @switch
- Never use *ngIf, *ngFor, *ngSwitch (legacy)
- Apply zoneless patterns (no Zone.js in v21+)

Accessibility (mandatory):
- Pass all AXE checks
- Meet WCAG AA minimums
- Include ARIA attributes
- Ensure keyboard navigation
```

### Component Generation Prompt

```
Generate an Angular 21 standalone component that:
- Uses signals for reactive state
- Has input() for data, output() for events
- Uses @if/@for control flow (not *ngIf/*ngFor)
- Includes ARIA labels for accessibility
- Uses OnPush-style patterns (zoneless compatible)
- Has computed() for derived values
```

### Anti-Patterns to Catch

| Wrong | Correct |
|-------|---------|
| `@Input() data: Data` | `data = input<Data>()` |
| `@Output() clicked = new EventEmitter()` | `clicked = output<void>()` |
| `*ngIf="condition"` | `@if (condition) { }` |
| `*ngFor="let item of items"` | `@for (item of items; track item.id)` |
| `import { NgModule }` | Use `standalone: true` |
| `this.data = value` (property) | `this.data.set(value)` (signal) |

## Web Codegen Scorer Details

### Score Interpretation

| Score | Meaning |
|-------|---------|
| 90-100 | Production ready |
| 70-89 | Minor issues, review recommended |
| 50-69 | Significant issues, refactor needed |
| < 50 | Major problems, regenerate |

### Common Issues Detected

1. **Legacy Decorators**
   - Using @Input/@Output instead of input()/output()
   - Fix: Replace with signal-based APIs

2. **Old Control Flow**
   - Using *ngIf, *ngFor, *ngSwitch
   - Fix: Migrate to @if, @for, @switch

3. **Missing Accessibility**
   - No ARIA labels on interactive elements
   - Fix: Add role, aria-label, aria-describedby

4. **Bundle Size Issues**
   - Importing entire modules instead of specific components
   - Fix: Use standalone imports

### CI Integration

```yaml
# .github/workflows/angular.yml
- name: Score AI-generated code
  run: |
    npm install -g @anthropic-ai/web-codegen-scorer
    web-codegen-scorer score ./src/app --threshold 80
```

## Project Structure (Angular 21+)

```
src/
├── app/
│   ├── app.component.ts      # Root component (standalone)
│   ├── app.config.ts         # Application config
│   ├── app.routes.ts         # Route definitions
│   ├── core/                 # Singletons (services, guards)
│   │   ├── auth.service.ts
│   │   └── auth.guard.ts
│   ├── shared/               # Reusable components
│   │   ├── button/
│   │   └── modal/
│   └── features/             # Feature areas (lazy loaded)
│       ├── dashboard/
│       └── settings/
├── environments/
│   ├── environment.ts
│   └── environment.prod.ts
└── main.ts                   # Bootstrap
```

## Build Optimization

```typescript
// angular.json build options
{
  "optimization": true,
  "outputHashing": "all",
  "sourceMap": false,
  "namedChunks": false,
  "budgets": [
    {
      "type": "initial",
      "maximumWarning": "250kb",
      "maximumError": "500kb"
    },
    {
      "type": "anyComponentStyle",
      "maximumWarning": "4kb",
      "maximumError": "8kb"
    }
  ]
}
```
