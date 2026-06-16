---
name: frontend-angular-tooling
description: Angular CLI and MCP server integration for AI-assisted development. Includes Web Codegen Scorer for code quality, CLI commands, and project scaffolding. Use when setting up Angular projects, running ng generate, or evaluating AI-generated code quality.
kb-sources:
  - wiki/software-engineering/frontend-angular-tooling
updated: 2026-05-21
---

# Angular Development Tooling

Angular CLI and AI-assisted development tools for Angular 21+.

## Angular CLI MCP Server

Connect Claude Code to Angular's official MCP server for AI-assisted development.

### Quick Setup

```bash
# Add MCP server to your project
claude mcp add angular-cli --scope project -- npx -y @angular/cli mcp

# Verify connection
claude mcp list
```

### Team Configuration (.mcp.json)

```json
{
  "mcpServers": {
    "angular-cli": {
      "command": "npx",
      "args": ["-y", "@angular/cli", "mcp"]
    }
  }
}
```

### Available MCP Tools

| Tool | Purpose |
|------|---------|
| `ai_tutor` | Interactive Angular guidance for v21+ |
| `get_best_practices` | Current Angular patterns (signals, standalone) |
| `search_documentation` | Query angular.dev in real-time |
| `find_examples` | Official code examples |
| `list_projects` | Workspace structure from angular.json |
| `onpush_zoneless_migration` | Migration guidance for zoneless |

### MCP Flags

- `--read-only` - Analysis only, no code modifications
- `--local-only` - Disable internet-dependent tools
- `--experimental-tool` - Enable preview features

## Web Codegen Scorer

Evaluate AI-generated Angular code quality.

```bash
# Install globally
npm install -g @anthropic-ai/web-codegen-scorer

# Score a directory
web-codegen-scorer score ./src/app

# Score specific files
web-codegen-scorer score ./src/app/dashboard --verbose
```

### Quality Metrics

| Category | Checks |
|----------|--------|
| **Modern Patterns** | Signals, standalone, control flow |
| **TypeScript** | Strict mode, no `any`, proper types |
| **Accessibility** | ARIA attributes, keyboard nav |
| **Performance** | Bundle size, lazy loading |

## CLI Commands (Angular 21+)

```bash
# New project with AI config
ng new my-app --ai-config=claude

# Generate components
ng generate component dashboard --standalone
ng generate service auth
ng generate guard auth --functional

# Build
ng build --configuration production

# Serve with SSR
ng serve --ssr
```

## IDE AI Config

```bash
# Add AI configuration to existing project
ng generate ai-config

# Options: claude, copilot, cursor, gemini
ng new app --ai-config=claude
```

This creates `.claude/instructions.md` with Angular 21+ best practices.

See `reference.md` for detailed MCP usage and `examples.md` for workflows.
