---
name: react-i18n-context-patterns
description: React Context-based internationalization (i18n) patterns for multi-language applications with translations, formatting, and locale switching. Use when adding multi-language support to React apps, wiring locale providers, or formatting dates/numbers by locale.
kb-sources:
  - wiki/software-engineering/react-i18n
updated: 2026-04-18
---

# React i18n with Context Pattern

Lightweight internationalization using React Context API for managing translations, locale switching, and number/date formatting.

## When to Use

- Simple bilingual applications (e.g., English/French)
- Need minimal i18n setup without heavy libraries
- Custom translation management
- Built-in browser Intl API sufficient for formatting
- Want full control over translation structure
- Avoid react-i18next overhead for simple cases

## Quick Reference

### Basic Setup

Context provider manages translations and locale:
- `LanguageProvider` wraps app, provides `t()`, `locale`, `setLocale`
- `useLanguage()` hook accesses context with validation
- Translations loaded from JSON files (en.json, fr.json)
- localStorage persists user preference

See **examples.md** for complete implementation.

### Usage in Components

```javascript
const { t, locale, setLocale } = useLanguage();

return (
  <>
    <h1>{t('welcome')}</h1>
    <button onClick={() => setLocale(locale === 'en' ? 'fr' : 'en')}>
      {t('switchLanguage')}
    </button>
  </>
);
```

## Key Patterns

| Pattern | Use Case | Implementation |
|---------|----------|----------------|
| **Translation Files** | JSON per locale | `locales/en.json`, `locales/fr.json` |
| **Context Provider** | Global state | `<LanguageProvider>` wraps app |
| **Custom Hook** | Access translations | `useLanguage()` hook |
| **Parameter Interpolation** | Dynamic values | `t('greeting', { name: 'Alice' })` |
| **Locale Persistence** | Remember preference | `localStorage.setItem('locale', locale)` |
| **Intl Formatting** | Numbers, dates | `new Intl.NumberFormat(locale).format(value)` |

## Anti-Patterns

| Anti-Pattern | Pattern |
|--------------|---------|
| **Hardcoded strings in components** | Use t() function for all user-facing text |
| **Not memoizing context value** | Wrap context value in useMemo to prevent re-renders |
| **Not persisting locale** | Save selected language to localStorage |
| **Inline date/number formatting** | Use Intl API with locale parameter for consistency |
| **Missing fallback** | Return key or default text when translation missing |
| **Loading all translations at once** | Lazy load with dynamic imports per language |

---

**See reference.md** for complete Context setup, formatting APIs, and performance optimization.

**See examples.md** for production i18n implementation from example-frontend project.
