# Laravel Mix Asset Compilation Reference

Comprehensive guide to Laravel Mix configuration for React SPAs, including optimization, troubleshooting, and migration strategies.

## Core Configuration

### Basic webpack.mix.js Structure

```javascript
const mix = require('laravel-mix');

mix.react('resources/js/app.js', 'public/js')
   .sass('resources/sass/app.scss', 'public/css')
   .version();
```

**Key Points:**
- `webpack.mix.js` is the entry point for all asset compilation
- Mix serves as a light configuration wrapper around Webpack
- All methods chain fluently for readable configuration
- Default public path is `public/` for Laravel apps

---

## React Setup (.react() Method)

### What `.react()` Does

1. Automatically downloads and includes `babel-preset-react`
2. Configures Babel to transform JSX syntax
3. Sets up React-specific optimizations
4. Handles development vs production modes

### Common React SPA Configuration

```javascript
mix.react('resources/js/app.js', 'public/js')
   .sass('resources/sass/app.scss', 'public/css')
   .extract(['react', 'react-dom']) // Vendor code splitting
   .version() // Cache busting
   .sourceMaps(); // Development debugging
```

### Anti-Pattern: Using .js() Instead of .react()

```javascript
// ❌ WRONG: Will fail on JSX
mix.js('resources/js/app.jsx', 'public/js');

// ✅ CORRECT:
mix.react('resources/js/app.jsx', 'public/js');
```

---

## Babel Configuration

### Automatic Configuration (via .react())

Mix automatically applies:
```json
{
  "presets": ["@babel/preset-react"]
}
```

### Custom Configuration (.babelrc)

For Flow types or custom plugins:

```json
{
  "presets": [
    "@babel/preset-env",
    "@babel/preset-react",
    "@babel/preset-flow"
  ],
  "plugins": [
    "@babel/transform-runtime",
    "@babel/plugin-syntax-dynamic-import"
  ]
}
```

**Install required packages:**
```bash
npm install --save-dev @babel/preset-flow @babel/transform-runtime
```

### Babel Configuration via webpack.mix.js

```javascript
mix.react('resources/js/app.js', 'public/js')
   .babelConfig({
       presets: ['@babel/preset-react'],
       plugins: ['@babel/plugin-proposal-class-properties']
   });
```

---

## SASS Compilation

### Basic SASS Setup

```javascript
mix.sass('resources/sass/app.scss', 'public/css');
```

### Advanced SASS Options

```javascript
mix.sass('resources/sass/app.scss', 'public/css', {
    sassOptions: {
        outputStyle: 'compressed',
        precision: 10
    }
});
```

### PostCSS Configuration

```javascript
mix.sass('resources/sass/app.scss', 'public/css')
   .options({
       postCss: [
           require('autoprefixer')
       ]
   });
```

---

## Asset Versioning & Cache Busting

### Enable Versioning

```javascript
mix.react('resources/js/app.js', 'public/js')
   .version();
```

**What It Does:**
- Generates `public/mix-manifest.json` with hashed filenames
- Enables automatic cache invalidation on deploys

### Blade Template Usage

```html
<!-- Automatically resolves to versioned file -->
<script src="{{ mix('js/app.js') }}"></script>
<link rel="stylesheet" href="{{ mix('css/app.css') }}">
```

**Generated Manifest:**
```json
{
  "/js/app.js": "/js/app.js?id=a1b2c3d4",
  "/css/app.css": "/css/app.css?id=e5f6g7h8"
}
```

### Anti-Pattern: Hardcoded Script Paths

```html
<!-- ❌ WRONG: Breaks versioning and HMR -->
<script src="/js/app.js"></script>

<!-- ✅ CORRECT: Uses manifest -->
<script src="{{ mix('js/app.js') }}"></script>
```

---

## Hot Module Replacement (HMR)

### Enable HMR Dev Server

```bash
npx mix watch --hot
```

**What It Does:**
- Starts Webpack dev server on `http://localhost:8080`
- Enables instant code reloading without page refresh
- Maintains React component state across updates

### HMR Configuration

```javascript
mix.react('resources/js/app.js', 'public/js')
   .sass('resources/sass/app.scss', 'public/css')
   .options({
       hmrOptions: {
           host: 'localhost',
           port: 8080
       }
   });
```

### Blade Template for HMR

```html
<!-- Works for both HMR and production -->
<script src="{{ mix('js/app.js') }}"></script>
<link rel="stylesheet" href="{{ mix('css/app.css') }}">
```

**Behind the Scenes:**
- In HMR mode, `mix('js/app.js')` → `http://localhost:8080/js/app.js`
- In production, `mix('js/app.js')` → `/js/app.js?id=hash`

### BrowserSync Integration

```javascript
mix.browserSync({
    proxy: 'localhost',
    files: [
        'app/**/*.php',
        'resources/views/**/*.php',
        'public/js/**/*.js',
        'public/css/**/*.css'
    ]
});
```

---

## Production Optimization

### Build Command

```bash
NODE_ENV=production npx mix --production
```

### Automatic Optimizations

1. **Minification** - JS and CSS minified
2. **Dead Code Elimination** - Unused code removed
3. **Source Maps** - Disabled by default in production
4. **Vendor Extraction** - Separate vendor bundle (if `.extract()` used)

### Disable Source Maps in Production

```javascript
mix.react('resources/js/app.js', 'public/js')
   .sourceMaps(false, 'source-map'); // Disable in production
```

### Anti-Pattern: Development Mode in Production

```bash
# ❌ WRONG: Large bundles, slow performance
npx mix

# ✅ CORRECT: Optimized bundles
NODE_ENV=production npx mix --production
```

---

## Code Splitting & Vendor Extraction

### Basic Vendor Extraction

```javascript
mix.react('resources/js/app.js', 'public/js')
   .extract(['react', 'react-dom']);
```

**What It Does:**
- Creates `public/js/vendor.js` with specified dependencies
- Creates `public/js/manifest.js` with Webpack runtime
- Enables long-term caching (vendor code changes less frequently)

### Advanced Extraction

```javascript
mix.react('resources/js/app.js', 'public/js')
   .extract([
       'react',
       'react-dom',
       'react-router-dom',
       'redux',
       'react-redux'
   ]);
```

### Script Load Order

**Script loading order:** For proper vendor extraction, load files in this sequence:

```html
<!-- 1. Manifest (Webpack runtime) -->
<script src="{{ mix('js/manifest.js') }}"></script>

<!-- 2. Vendor (dependencies) -->
<script src="{{ mix('js/vendor.js') }}"></script>

<!-- 3. App (your code) -->
<script src="{{ mix('js/app.js') }}"></script>
```

### Anti-Pattern: Incorrect Load Order

```html
<!-- ❌ WRONG: Will throw runtime errors -->
<script src="{{ mix('js/app.js') }}"></script>
<script src="{{ mix('js/vendor.js') }}"></script>
```

---

## Public Path Configuration

### For Non-Laravel Projects

```javascript
mix.setPublicPath('dist')
   .react('src/app.js', 'dist/js')
   .sass('src/app.scss', 'dist/css');
```

### For CDN Assets

```javascript
mix.setPublicPath('public')
   .setResourceRoot('https://cdn.example.com/')
   .react('resources/js/app.js', 'public/js');
```

---

## Environment Variables

### Accessing in JavaScript

**Define in .env:**
```bash
MIX_API_URL=https://api.example.com
MIX_APP_NAME="My App"
```

**Access in React:**
```javascript
const apiUrl = process.env.MIX_API_URL;
const appName = process.env.MIX_APP_NAME;
```

**Environment variable convention:** Laravel Mix exposes variables prefixed with `MIX_` to frontend code.

### Anti-Pattern: Missing MIX_ Prefix

```bash
# ❌ WRONG: Not accessible in JavaScript
API_URL=https://api.example.com

# ✅ CORRECT:
MIX_API_URL=https://api.example.com
```

---

## Common Anti-Patterns

### 1. Missing .react() Call

```javascript
// ❌ WRONG: JSX won't compile
mix.js('resources/js/app.jsx', 'public/js');

// ✅ CORRECT:
mix.react('resources/js/app.jsx', 'public/js');
```

### 2. Hardcoded Script Paths

```html
<!-- ❌ WRONG: Breaks versioning -->
<script src="/js/app.js"></script>

<!-- ✅ CORRECT: Uses manifest -->
<script src="{{ mix('js/app.js') }}"></script>
```

### 3. Development Mode in Production

```bash
# ❌ WRONG: Large bundles
npm run dev

# ✅ CORRECT: Optimized bundles
npm run production
```

### 4. Missing Asset Versioning

```javascript
// ❌ WRONG: Browser caching issues on deploy
mix.react('resources/js/app.js', 'public/js');

// ✅ CORRECT: Cache busting enabled
mix.react('resources/js/app.js', 'public/js')
   .version();
```

### 5. No Vendor Extraction

```javascript
// ❌ WRONG: Poor cache hit rate
mix.react('resources/js/app.js', 'public/js');

// ✅ CORRECT: Long-term caching
mix.react('resources/js/app.js', 'public/js')
   .extract(['react', 'react-dom']);
```

---

## Migration to Vite

### Why Migrate?

| Metric | Laravel Mix | Vite |
|--------|-------------|------|
| Dev server start | ~15s | ~1s |
| HMR speed | 500-1600ms | 10-20ms |
| Prod build | ~30s | ~5s |
| Dependency pre-bundling | Webpack | esbuild (10-100x faster) |

### Migration Steps

**1. Update Laravel to 11+**
```bash
composer require laravel/framework:^11.0
```

**2. Install Vite Plugin**
```bash
npm install --save-dev vite laravel-vite-plugin
npm remove laravel-mix
```

**3. Create vite.config.js**
```javascript
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: ['resources/js/app.js', 'resources/css/app.css'],
            refresh: true,
        }),
        react(),
    ],
});
```

**4. Update Environment Variables**
```bash
# Rename all MIX_ to VITE_
MIX_API_URL=... → VITE_API_URL=...
```

**5. Update JavaScript Imports**
```javascript
// Before (CommonJS)
const axios = require('axios');

// After (ESM)
import axios from 'axios';
```

**6. Update Blade Templates**
```html
<!-- Before: Laravel Mix -->
<script src="{{ mix('js/app.js') }}"></script>

<!-- After: Vite -->
@vite(['resources/js/app.js'])
```

**7. Update package.json Scripts**
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  }
}
```

---

## Technical Comparison: Mix vs Vite

| Feature | Laravel Mix | Vite |
|---------|-------------|------|
| **Underlying tool** | Webpack 5 | esbuild + Rollup |
| **Config file** | webpack.mix.js | vite.config.js |
| **Hot reload** | 500-1600ms | 10-20ms |
| **First build** | ~15-30s | ~1-5s |
| **Env variables** | `MIX_*` | `VITE_*` |
| **Module system** | CommonJS/ESM | ESM only |
| **Browser support** | Babel (very broad) | Modern browsers |
| **Laravel version** | 5.4 - 10.x | 11.x+ |
| **Status** | Maintenance mode | Active development |

---

## Troubleshooting Guide

### HMR Not Working

**Symptom:** Changes don't reflect without page refresh

**Causes:**
1. Not using `--hot` flag
2. Hardcoded script paths in Blade templates
3. CORS issues (if Mix and Laravel on different ports)

**Solution:**
```bash
npx mix watch --hot
```

```html
<!-- Use mix() helper -->
<script src="{{ mix('js/app.js') }}"></script>
```

### Build Fails on JSX

**Symptom:** `SyntaxError: Unexpected token <`

**Cause:** Using `.js()` instead of `.react()`

**Solution:**
```javascript
// Change this:
mix.js('resources/js/app.js', 'public/js')

// To this:
mix.react('resources/js/app.js', 'public/js')
```

### Large Bundle Size

**Symptom:** app.js is 2MB+ in production

**Causes:**
1. No vendor extraction
2. Missing production build
3. Unnecessary dependencies included

**Solution:**
```javascript
mix.react('resources/js/app.js', 'public/js')
   .extract(['react', 'react-dom'])
   .version();
```

```bash
NODE_ENV=production npx mix --production
```

### Cache Not Invalidating

**Symptom:** Users see old code after deployment

**Cause:** Missing `.version()`

**Solution:**
```javascript
mix.react('resources/js/app.js', 'public/js')
   .version(); // Add this
```

---

## Official Documentation

- [Laravel Mix Documentation](https://laravel-mix.com/docs/)
- [Laravel 8.x Mix Guide](https://laravel.com/docs/8.x/mix)
- [Vite Documentation](https://vitejs.dev/)
- [Laravel Vite Plugin](https://github.com/laravel/vite-plugin)
- [Babel Presets](https://babeljs.io/docs/en/presets)
