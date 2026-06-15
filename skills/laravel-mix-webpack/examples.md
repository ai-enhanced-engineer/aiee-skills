# Laravel Mix Examples

Example implementations for a production Laravel app showing Laravel Mix configuration for React SPAs.

## Example Mix Configuration

### Basic Setup

**File:** `webpack.mix.js`

```javascript
const mix = require('laravel-mix');

/*
 |--------------------------------------------------------------------------
 | Mix Asset Management
 |--------------------------------------------------------------------------
 |
 | Mix provides a clean, fluent API for defining some Webpack build steps
 | for your Laravel application. By default, we are compiling the Sass
 | file for the application as well as bundling up all the JS files.
 |
 */

mix.js('resources/js/app.js', 'public/js')
    .react()
    .sass('resources/sass/app.scss', 'public/css');
```

**Key Points:**
- `.js()` defines entry point and output
- `.react()` enables JSX compilation
- `.sass()` compiles SCSS to CSS
- No versioning or vendor extraction (basic setup)

---

## Babel Configuration

### Custom Babel Presets

**File:** `.babelrc`

```json
{
    "presets": ["@babel/preset-env", "@babel/preset-react", "@babel/preset-flow"],
    "plugins": ["@babel/transform-runtime", "@babel/plugin-syntax-dynamic-import"]
}
```

**What Each Preset Does:**
- `@babel/preset-env` - Compiles modern JS to browser-compatible code
- `@babel/preset-react` - Transforms JSX syntax
- `@babel/preset-flow` - Handles Flow type annotations

**Plugins:**
- `@babel/transform-runtime` - Reduces bundle size by reusing helpers
- `@babel/plugin-syntax-dynamic-import` - Enables code splitting with `import()`

**Install Dependencies:**
```bash
npm install --save-dev @babel/preset-env @babel/preset-react @babel/preset-flow
npm install --save-dev @babel/plugin-transform-runtime @babel/plugin-syntax-dynamic-import
```

---

## Production-Ready Configuration

### Recommended Enhancements

**Enhanced webpack.mix.js:**

```javascript
const mix = require('laravel-mix');

// Environment detection
const isProduction = process.env.NODE_ENV === 'production';

mix.js('resources/js/app.js', 'public/js')
    .react()
    .sass('resources/sass/app.scss', 'public/css')

    // Vendor code splitting (long-term caching)
    .extract([
        'react',
        'react-dom',
        'react-router-dom',
        'redux',
        'react-redux',
        'redux-thunk',
        'redux-persist',
        'formik',
        'yup',
        'axios',
        'bootstrap'
    ])

    // Asset versioning (cache busting)
    .version()

    // Source maps (development only)
    .sourceMaps(!isProduction, 'source-map')

    // BrowserSync (optional)
    .browserSync({
        proxy: 'localhost',
        files: [
            'app/**/*.php',
            'resources/views/**/*.php'
        ]
    });

// Webpack configuration
if (isProduction) {
    mix.options({
        terser: {
            terserOptions: {
                compress: {
                    drop_console: true  // Remove console.log in production
                }
            }
        }
    });
}
```

---

## Package.json Scripts

### NPM Scripts

**File:** `package.json`

```json
{
    "private": true,
    "scripts": {
        "dev": "npm run development",
        "development": "mix",
        "watch": "mix watch",
        "watch-poll": "mix watch -- --watch-options-poll=1000",
        "hot": "mix watch --hot",
        "prod": "npm run production",
        "production": "NODE_ENV=production mix --production"
    },
    "devDependencies": {
        "@babel/plugin-syntax-dynamic-import": "^7.8.3",
        "@babel/plugin-transform-runtime": "^7.16.0",
        "@babel/preset-env": "^7.16.0",
        "@babel/preset-flow": "^7.16.0",
        "@babel/preset-react": "^7.16.0",
        "laravel-mix": "^6.0.49",
        "resolve-url-loader": "^4.0.0",
        "sass": "^1.43.4",
        "sass-loader": "^12.3.0"
    },
    "dependencies": {
        "axios": "^0.24.0",
        "bootstrap": "^5.1.3",
        "formik": "^2.2.9",
        "react": "^17.0.2",
        "react-bootstrap": "^2.0.2",
        "react-dom": "^17.0.2",
        "react-redux": "^7.2.6",
        "react-router-dom": "^6.0.2",
        "redux": "^4.1.2",
        "redux-persist": "^6.0.0",
        "redux-thunk": "^2.4.1",
        "yup": "^0.32.11"
    }
}
```

**Usage:**
```bash
npm run dev         # Development build
npm run watch       # Watch for changes
npm run hot         # Hot module replacement
npm run production  # Optimized production build
```

---

## Blade Template Integration

### Using mix() Helper

**File:** `resources/views/app.blade.php`

```html
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>{{ config('app.name', 'Laravel') }}</title>

    <!-- Styles -->
    <link rel="stylesheet" href="{{ mix('css/app.css') }}">
</head>
<body>
    <div id="root"></div>

    <!-- Scripts (with vendor extraction) -->
    <script src="{{ mix('js/manifest.js') }}"></script>
    <script src="{{ mix('js/vendor.js') }}"></script>
    <script src="{{ mix('js/app.js') }}"></script>
</body>
</html>
```

**Key Points:**
- `mix()` helper resolves versioned filenames from `mix-manifest.json`
- Load order critical when using `.extract()`: manifest → vendor → app
- Works seamlessly with HMR (no template changes needed)

---

## Before/After: Adding Optimization

### Before: Basic Setup

```javascript
// webpack.mix.js - Basic configuration
const mix = require('laravel-mix');

mix.js('resources/js/app.js', 'public/js')
    .react()
    .sass('resources/sass/app.scss', 'public/css');
```

**Issues:**
- Large bundle size (all dependencies in app.js)
- No cache busting (users get stale code)
- No vendor extraction (poor cache hit rate)
- Source maps in production (security risk)

---

### After: Production-Ready

```javascript
// webpack.mix.js - Optimized configuration
const mix = require('laravel-mix');

mix.js('resources/js/app.js', 'public/js')
    .react()
    .sass('resources/sass/app.scss', 'public/css')

    // Extract vendor code for long-term caching
    .extract(['react', 'react-dom', 'react-router-dom', 'redux', 'react-redux'])

    // Enable cache busting
    .version()

    // Disable source maps in production
    .sourceMaps(process.env.NODE_ENV !== 'production', 'source-map');
```

**Blade Template Update:**

```html
<!-- Before: Single script -->
<script src="/js/app.js"></script>

<!-- After: Vendor extraction + versioning -->
<script src="{{ mix('js/manifest.js') }}"></script>
<script src="{{ mix('js/vendor.js') }}"></script>
<script src="{{ mix('js/app.js') }}"></script>
```

**Benefits:**
- **Bundle size:** 2.5MB → 300KB (app.js)
- **Vendor bundle:** Cached long-term (changes infrequently)
- **Cache hits:** Improved from ~20% → ~80%
- **Build time:** Faster subsequent builds

---

## Migration to Vite

### Complete Migration Example

**Step 1: Install Vite**

```bash
npm install --save-dev vite laravel-vite-plugin @vitejs/plugin-react
npm remove laravel-mix
```

**Step 2: Create vite.config.js**

```javascript
import { defineConfig } from 'vite';
import laravel from 'laravel-vite-plugin';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [
        laravel({
            input: [
                'resources/js/app.js',
                'resources/sass/app.scss'
            ],
            refresh: true,
        }),
        react(),
    ],
    server: {
        host: 'localhost',
        port: 5173,
        hmr: {
            host: 'localhost',
        },
    },
});
```

**Step 3: Update package.json**

```json
{
    "scripts": {
        "dev": "vite",
        "build": "vite build"
    },
    "devDependencies": {
        "@vitejs/plugin-react": "^4.0.0",
        "laravel-vite-plugin": "^1.0.0",
        "vite": "^5.0.0"
    }
}
```

**Step 4: Update .env**

```bash
# Before
MIX_API_URL=https://api.example.com
MIX_APP_NAME="My App"

# After
VITE_API_URL=https://api.example.com
VITE_APP_NAME="My App"
```

**Step 5: Update JavaScript**

```javascript
// Before (CommonJS)
const axios = require('axios');
const apiUrl = process.env.MIX_API_URL;

// After (ESM)
import axios from 'axios';
const apiUrl = import.meta.env.VITE_API_URL;
```

**Step 6: Update Blade Template**

```html
<!-- Before: Laravel Mix -->
<!DOCTYPE html>
<html>
<head>
    <link rel="stylesheet" href="{{ mix('css/app.css') }}">
</head>
<body>
    <div id="root"></div>
    <script src="{{ mix('js/manifest.js') }}"></script>
    <script src="{{ mix('js/vendor.js') }}"></script>
    <script src="{{ mix('js/app.js') }}"></script>
</body>
</html>

<!-- After: Vite -->
<!DOCTYPE html>
<html>
<head>
    @vite(['resources/sass/app.scss'])
</head>
<body>
    <div id="root"></div>
    @vite(['resources/js/app.js'])
</body>
</html>
```

**Step 7: Remove webpack.mix.js**

```bash
rm webpack.mix.js
```

---

## Performance Comparison

### Build Metrics: Mix vs Vite

| Metric | Laravel Mix | Vite | Improvement |
|--------|-------------|------|-------------|
| **Initial dev build** | ~15-20s | ~1-2s | 10x faster |
| **HMR update** | 500-1600ms | 10-20ms | 50x faster |
| **Production build** | ~30-40s | ~5-8s | 5x faster |
| **Dev server start** | ~3-5s | ~0.5s | 8x faster |

### Bundle Size: Before/After Optimization

**Before (no extraction):**
```
public/js/app.js - 2.5MB (includes React, Redux, Router, etc.)
public/css/app.css - 200KB
Total: 2.7MB
```

**After (with extraction):**
```
public/js/manifest.js - 5KB (Webpack runtime)
public/js/vendor.js - 800KB (React, Redux, dependencies)
public/js/app.js - 300KB (application code)
public/css/app.css - 200KB
Total: 1.3MB (but vendor is cached!)
```

**Cache Hit Improvement:**
- Without extraction: ~20% (entire bundle changes on any update)
- With extraction: ~80% (vendor bundle rarely changes)

---

## Common Issues & Solutions

### Issue 1: JSX Not Compiling

**Symptom:**
```
SyntaxError: Unexpected token '<'
```

**Cause:**
Using `.js()` instead of `.react()`

**Solution:**
```javascript
// ❌ Wrong
mix.js('resources/js/app.js', 'public/js');

// ✅ Correct
mix.react('resources/js/app.js', 'public/js');
```

---

### Issue 2: HMR Not Working

**Symptom:**
Changes don't reflect without page refresh

**Cause:**
Not using `--hot` flag or hardcoded script paths

**Solution:**
```bash
# Use --hot flag
npx mix watch --hot
```

```html
<!-- Use mix() helper -->
<script src="{{ mix('js/app.js') }}"></script>
```

---

### Issue 3: Vendor Bundle Load Error

**Symptom:**
```
Uncaught ReferenceError: webpackJsonp is not defined
```

**Cause:**
Scripts loaded in wrong order

**Solution:**
```html
<!-- ✅ Correct order -->
<script src="{{ mix('js/manifest.js') }}"></script>
<script src="{{ mix('js/vendor.js') }}"></script>
<script src="{{ mix('js/app.js') }}"></script>

<!-- ❌ Wrong order -->
<script src="{{ mix('js/app.js') }}"></script>
<script src="{{ mix('js/vendor.js') }}"></script>
```

---

This combines real-world configuration patterns with production best practices!
