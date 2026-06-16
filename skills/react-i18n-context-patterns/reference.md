# React i18n Context Reference

Complete guide to internationalization using React Context API.

## Table of Contents

1. [i18n Fundamentals](#i18n-fundamentals)
2. [Context Setup](#context-setup)
3. [Translation Function](#translation-function)
4. [Formatting](#formatting)
5. [Language Detection](#language-detection)
6. [Performance](#performance)
7. [Testing](#testing)

---

## i18n Fundamentals

### Translation File Structure

**Recommended: Flat JSON files**

```json
// locales/en.json
{
  "common.welcome": "Welcome",
  "common.logout": "Log out",
  "home.title": "Home Page",
  "home.description": "Welcome to our application",
  "errors.required": "This field is required",
  "greeting": "Hello, {name}!"
}

// locales/fr.json
{
  "common.welcome": "Bienvenue",
  "common.logout": "Se déconnecter",
  "home.title": "Page d'accueil",
  "home.description": "Bienvenue dans notre application",
  "errors.required": "Ce champ est requis",
  "greeting": "Bonjour, {name}!"
}
```

**Alternative: Nested JSON**

```json
// locales/en.json
{
  "common": {
    "welcome": "Welcome",
    "logout": "Log out"
  },
  "home": {
    "title": "Home Page",
    "description": "Welcome to our application"
  }
}
```

### Directory Structure

```
src/
├── locales/
│   ├── en.json
│   ├── fr.json
│   └── index.js
├── context/
│   └── LanguageContext.jsx
└── hooks/
    └── useLanguage.js
```

### Fallback Strategy

**Cascading fallbacks**:
1. Exact locale (e.g., 'fr-CA')
2. Base language (e.g., 'fr')
3. Default language (e.g., 'en')
4. Key itself (helps debugging)

```javascript
function translate(key, locale) {
  // Try exact locale
  if (translations[locale]?.[key]) return translations[locale][key]

  // Try base language
  const baseLocale = locale.split('-')[0]
  if (translations[baseLocale]?.[key]) return translations[baseLocale][key]

  // Try default
  if (translations['en']?.[key]) return translations['en'][key]

  // Return key as fallback
  console.warn(`Missing translation: ${key}`)
  return key
}
```

---

## Context Setup

### LanguageContext Definition

```javascript
// context/LanguageContext.jsx
import { createContext } from 'react'

export const LanguageContext = createContext(null)
```

### LanguageProvider Component

```javascript
import { createContext, useContext, useState, useCallback, useMemo } from 'react'
import enTranslations from '../locales/en.json'
import frTranslations from '../locales/fr.json'

const translations = {
  en: enTranslations,
  fr: frTranslations
}

const LanguageContext = createContext(null)

export function LanguageProvider({ children, defaultLocale = 'en' }) {
  const [locale, setLocale] = useState(() => {
    return localStorage.getItem('preferredLanguage') || defaultLocale
  })

  const switchLocale = useCallback((newLocale) => {
    localStorage.setItem('preferredLanguage', newLocale)
    setLocale(newLocale)
  }, [])

  const t = useCallback((key, params = {}) => {
    let translation = translations[locale]?.[key] || key

    // Parameter interpolation
    Object.keys(params).forEach((param) => {
      translation = translation.replace(`{${param}}`, params[param])
    })

    return translation
  }, [locale])

  const contextValue = useMemo(() => ({
    locale,
    setLocale: switchLocale,
    t
  }), [locale, switchLocale, t])

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider')
  }

  return context
}
```

**Key Design Decisions**:
- `useMemo` prevents re-renders when parent re-renders
- `useCallback` ensures stable function references
- Lazy initialization reads localStorage only once
- Validates context usage with error

---

## Translation Function

### Basic Translation

```javascript
const { t } = useLanguage()

t('common.welcome')  // "Welcome" or "Bienvenue"
```

### Parameter Interpolation

```javascript
// Translation: "Hello, {name}!"
t('greeting', { name: 'Alice' })  // "Hello, Alice!"

// Translation: "You have {count} new messages"
t('messages.count', { count: 5 })  // "You have 5 new messages"
```

### Nested Keys

```javascript
// Flat structure (recommended)
t('home.title')

// Nested structure
const tNested = (key) => {
  const keys = key.split('.')
  let value = translations[locale]

  for (const k of keys) {
    value = value?.[k]
  }

  return value || key
}
```

### Pluralization

**Simple approach**:
```javascript
// Translation files
{
  "item": "{count} item",
  "item_plural": "{count} items"
}

// Helper function
function tPlural(key, count) {
  const pluralKey = count === 1 ? key : `${key}_plural`
  return t(pluralKey, { count })
}

tPlural('item', 1)  // "1 item"
tPlural('item', 5)  // "5 items"
```

**Advanced with Intl.PluralRules**:
```javascript
function getPluralForm(count, locale) {
  const pr = new Intl.PluralRules(locale)
  return pr.select(count)  // "one", "few", "many", "other"
}

// Translation structure
{
  "items": {
    "one": "{count} item",
    "other": "{count} items"
  }
}

function tPlural(key, count, locale) {
  const form = getPluralForm(count, locale)
  const template = translations[locale][key][form]
  return template.replace('{count}', count)
}
```

---

## Formatting

### Number Formatting

```javascript
// In LanguageProvider
const formatNumber = useCallback((value) => {
  return new Intl.NumberFormat(locale).format(value)
}, [locale])

// Usage
formatNumber(26254.39)
// en-US: "26,254.39"
// fr-FR: "26 254,39"
```

**Currency formatting**:
```javascript
const formatCurrency = useCallback((value, currency = 'USD') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(value)
}, [locale])

formatCurrency(1234.56, 'USD')
// en-US: "$1,234.56"
// fr-FR: "1 234,56 $US"
```

**Percentage formatting**:
```javascript
const formatPercent = useCallback((value) => {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value)
}, [locale])

formatPercent(0.856)  // "85.6%"
```

### Date Formatting

```javascript
// In LanguageProvider
const formatDate = useCallback((date, options = {}) => {
  return new Intl.DateTimeFormat(locale, options).format(date)
}, [locale])

// Usage
const date = new Date('2026-02-12')

formatDate(date)
// en-US: "2/12/2026"
// fr-FR: "12/02/2026"

formatDate(date, {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})
// en-US: "February 12, 2026"
// fr-FR: "12 février 2026"
```

**Relative time**:
```javascript
const formatRelativeTime = useCallback((value, unit) => {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  return rtf.format(value, unit)
}, [locale])

formatRelativeTime(-1, 'day')
// en-US: "yesterday"
// fr-FR: "hier"

formatRelativeTime(2, 'hour')
// en-US: "in 2 hours"
// fr-FR: "dans 2 heures"
```

---

## Language Detection

### Detection Priority

1. User preference (localStorage)
2. URL parameter (`?lang=fr`)
3. Browser preference (`navigator.language`)
4. Application default

### Implementation

```javascript
function detectLanguage() {
  // 1. Check localStorage
  const stored = localStorage.getItem('preferredLanguage')
  if (stored && ['en', 'fr'].includes(stored)) return stored

  // 2. Check URL parameter
  const params = new URLSearchParams(window.location.search)
  const urlLang = params.get('lang')
  if (urlLang && ['en', 'fr'].includes(urlLang)) return urlLang

  // 3. Check browser preference
  const browserLang = navigator.language.split('-')[0]
  if (['en', 'fr'].includes(browserLang)) return browserLang

  // 4. Default fallback
  return 'en'
}
```

### Locale Persistence

```javascript
const switchLocale = useCallback((newLocale) => {
  // Persist to localStorage
  localStorage.setItem('preferredLanguage', newLocale)

  // Update state
  setLocale(newLocale)

  // Optional: Reload page for SSR apps
  // window.location.reload()
}, [])
```

---

## Performance

### Lazy Loading Translations

```javascript
const [translations, setTranslations] = useState({})

useEffect(() => {
  const loadTranslations = async () => {
    try {
      const module = await import(`../locales/${locale}.json`)
      setTranslations(module.default)
    } catch (error) {
      console.error(`Failed to load translations for ${locale}`, error)
    }
  }

  loadTranslations()
}, [locale])
```

**Benefits**:
- Reduces initial bundle size
- Only loads translations for active language
- Supports code splitting

### Memoization

**Context value**:
```javascript
const contextValue = useMemo(() => ({
  locale,
  setLocale,
  t,
  formatNumber,
  formatDate
}), [locale, setLocale, t, formatNumber, formatDate])
```

**Translation function**:
```javascript
const t = useCallback((key, params = {}) => {
  // Translation logic
}, [locale])
```

**Expensive components**:
```javascript
const ExpensiveComponent = memo(function ExpensiveComponent() {
  const { t } = useLanguage()
  return <div>{t('expensive.computation')}</div>
})
```

### Bundle Size Optimization

**Namespace organization**:
```
locales/
├── en/
│   ├── common.json       (shared)
│   ├── home.json         (home page only)
│   └── dashboard.json    (dashboard only)
└── fr/
    ├── common.json
    ├── home.json
    └── dashboard.json
```

**Lazy load by namespace**:
```javascript
const loadNamespace = async (locale, namespace) => {
  return await import(`./locales/${locale}/${namespace}.json`)
}
```

---

## Testing

### Translation Key Validation

```javascript
import enTranslations from '../locales/en.json'
import frTranslations from '../locales/fr.json'

describe('Translations', () => {
  it('should have matching keys in all locales', () => {
    const enKeys = Object.keys(enTranslations).sort()
    const frKeys = Object.keys(frTranslations).sort()

    expect(enKeys).toEqual(frKeys)
  })

  it('should not have empty values', () => {
    const allValues = Object.values(enTranslations)

    allValues.forEach(value => {
      expect(value).not.toBe('')
    })
  })
})
```

### Locale Switching Tests

```javascript
import { render, screen, fireEvent } from '@testing-library/react'
import { LanguageProvider, useLanguage } from './LanguageContext'

function TestComponent() {
  const { t, locale, setLocale } = useLanguage()

  return (
    <div>
      <p>{t('common.welcome')}</p>
      <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')}>
        Toggle
      </button>
    </div>
  )
}

describe('LanguageProvider', () => {
  it('should switch locale', () => {
    render(
      <LanguageProvider defaultLocale="en">
        <TestComponent />
      </LanguageProvider>
    )

    expect(screen.getByText('Welcome')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Toggle'))

    expect(screen.getByText('Bienvenue')).toBeInTheDocument()
  })
})
```

---

## Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| **Not memoizing context value** | Every parent re-render causes all consumers to re-render | Wrap value in useMemo |
| **Hardcoded strings** | Not translatable | Always use t() function |
| **Not validating context** | Runtime errors if used outside provider | Throw error in useLanguage |
| **Loading all translations upfront** | Large initial bundle | Lazy load translations |
| **Not persisting preference** | User selection lost on reload | Save to localStorage |
| **Missing translation fallback** | App crashes or shows undefined | Return key or default text |
| **Not handling missing keys** | Silent failures | Log warnings for missing keys |

---

## References

- [React Context API](https://react.dev/reference/react/useContext)
- [Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
- [Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat)
- [Intl.RelativeTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat)
- [Intl.PluralRules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules)
