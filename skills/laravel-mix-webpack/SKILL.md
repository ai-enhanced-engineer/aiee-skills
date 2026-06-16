---
name: laravel-mix-webpack
description: Laravel Mix (Webpack wrapper) configuration for React SPAs. Babel setup, SASS compilation, asset versioning, hot module replacement. Use for build configuration, asset pipeline issues, or migration to Vite.
kb-sources:
  - wiki/software-engineering/laravel-mix
updated: 2026-04-18
---

# Laravel Mix Asset Compilation

Webpack wrapper for Laravel applications providing fluent API for React compilation, SASS preprocessing, and asset management. Laravel 8-10 standard (Laravel 11+ uses Vite).

## When to Use

- Configuring Laravel Mix for React SPAs
- Setting up hot module replacement (HMR)
- Asset versioning and cache busting
- SASS/CSS compilation
- Code splitting and vendor extraction
- Troubleshooting Mix build issues
- Planning migration from Mix to Vite

## Quick Setup Pattern

```javascript
mix.react('resources/js/app.js', 'public/js')
   .sass('resources/sass/app.scss', 'public/css')
   .extract(['react', 'react-dom'])
   .version();
```

## Common Mix Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `.react()` | Compile JSX with Babel | `mix.react('src/app.js', 'public/js')` |
| `.sass()` | Compile SASS/SCSS | `mix.sass('src/app.scss', 'public/css')` |
| `.version()` | Asset versioning | Auto-generates `mix-manifest.json` |
| `.extract()` | Vendor code splitting | `mix.extract(['react', 'react-dom'])` |
| `.sourceMaps()` | Enable source maps | For development only |

## Hot Module Replacement

```bash
npx mix watch --hot
```

Use `mix('js/app.js')` helper in Blade templates for automatic path resolution.

## Production Build

```bash
NODE_ENV=production npx mix --production
```

## Migration to Vite

Laravel 11+ uses Vite by default. Key changes: rename `MIX_*` → `VITE_*` env vars, `require()` → `import`, update Blade `mix()` → `@vite()`. Performance: 10-100x faster builds.

See **examples.md** for step-by-step migration guide.

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| JSX not compiling | Use `mix.react()` (used `.js()` instead of `.react()`) |
| HMR not working | Use `npx mix watch --hot` + `mix('js/app.js')` helper (missing `.hot` flag or wrong script source) |
| Cache not busting | Add `mix.version()` (missing `.version()`) |
| Script load order errors | Load manifest → vendor → app (incorrect `.extract()` ordering) |
| Large bundle size | Add `.extract(['react', 'react-dom'])` (no vendor extraction) |

See **reference.md** for custom Babel config, HMR configuration, environment variable handling.
See **examples.md** for complete webpack.mix.js configs, Vite migration step-by-step.
