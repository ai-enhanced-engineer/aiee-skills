# React i18n Context Examples - example-frontend

Example patterns from a example-frontend project.

## Project Implementation

### LanguageContext (Simple Pattern)

**File**: `/src/context/LanguageContext.jsx`

Basic Context implementation with translation support.

```javascript
import React, { createContext, useContext, useState } from 'react';
import frTranslations from '../locales/fr.json';
import enTranslations from '../locales/en.json';

const translations = {
  fr: frTranslations,
  en: enTranslations
};

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('en');

  const toggleLanguage = () => {
    setLanguage(prev => prev === 'fr' ? 'en' : 'fr');
  };

  const t = (key) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
```

**Pattern Highlights**:
- Simple toggle between 2 languages
- Translation function with fallback
- Context validation in useLanguage hook
- Minimal implementation for basic needs

---

### useLanguage Hook (Advanced Pattern)

**File**: `/src/hooks/useLanguage.js`

Advanced hook with dynamic translation loading and Zustand integration.

```javascript
import { useEffect, useState } from 'react';
import useUIStore from '../store/uiStore';
import { LANGUAGES } from '../constants';

export const useLanguage = () => {
  const { language, setLanguage, toggleLanguage } = useUIStore();
  const [translations, setTranslations] = useState({});

  // Load translations when language changes
  useEffect(() => {
    const loadTranslations = async () => {
      try {
        const module = await import(`../locales/${language}.json`);
        setTranslations(module.default);
      } catch (error) {
        console.error(`Failed to load translations for ${language}`, error);
      }
    };

    loadTranslations();
  }, [language]);

  // Translation function
  const t = (key, params = {}) => {
    let translation = translations[key] || key;

    // Replace parameters in translation
    Object.keys(params).forEach((param) => {
      translation = translation.replace(`{${param}}`, params[param]);
    });

    return translation;
  };

  return {
    language,
    setLanguage,
    toggleLanguage,
    t,
    translations,
    isFrench: language === LANGUAGES.FR,
    isEnglish: language === LANGUAGES.EN,
  };
};

export default useLanguage;
```

**Pattern Highlights**:
1. **Dynamic Import**: Lazy load translations on demand
2. **Parameter Interpolation**: Replace {param} with values
3. **State Integration**: Uses Zustand for language state
4. **Convenience Properties**: isFrench, isEnglish helpers
5. **Error Handling**: Logs failed translation loads

---

## Translation Files

### English Translations

**File**: `/src/locales/en.json`

```json
{
  "welcome": "Welcome",
  "chat.title": "Chat with AI",
  "chat.placeholder": "Type your message...",
  "chat.send": "Send",
  "chat.clear": "Clear conversation",
  "chat.thinking": "Thinking...",
  "settings.title": "Settings",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "settings.model": "AI Model",
  "error.network": "Network error. Please try again.",
  "error.generic": "Something went wrong.",
  "greeting": "Hello, {name}!",
  "message.count": "You have {count} new messages"
}
```

### French Translations

**File**: `/src/locales/fr.json`

```json
{
  "welcome": "Bienvenue",
  "chat.title": "Discuter avec l'IA",
  "chat.placeholder": "Tapez votre message...",
  "chat.send": "Envoyer",
  "chat.clear": "Effacer la conversation",
  "chat.thinking": "Réflexion...",
  "settings.title": "Paramètres",
  "settings.language": "Langue",
  "settings.theme": "Thème",
  "settings.model": "Modèle IA",
  "error.network": "Erreur réseau. Veuillez réessayer.",
  "error.generic": "Une erreur s'est produite.",
  "greeting": "Bonjour, {name}!",
  "message.count": "Vous avez {count} nouveaux messages"
}
```

---

## Component Examples

### Language Toggle Component

```javascript
import { useLanguage } from '../hooks/useLanguage';

function LanguageToggle() {
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <button
      onClick={toggleLanguage}
      className="language-toggle"
      aria-label={t('settings.language')}
    >
      {language === 'en' ? '🇫🇷 Français' : '🇬🇧 English'}
    </button>
  );
}

export default LanguageToggle;
```

---

### Chat Component with Translation

```javascript
import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';

function ChatInput() {
  const [message, setMessage] = useState('');
  const { t } = useLanguage();

  const handleSubmit = (e) => {
    e.preventDefault();
    // Send message
    setMessage('');
  };

  return (
    <form onSubmit={handleSubmit} className="chat-input">
      <input
        type="text"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder={t('chat.placeholder')}
        aria-label={t('chat.placeholder')}
      />
      <button type="submit">
        {t('chat.send')}
      </button>
    </form>
  );
}

export default ChatInput;
```

---

### Settings Page with Translation

```javascript
import { useLanguage } from '../hooks/useLanguage';
import useUIStore from '../store/uiStore';

function Settings() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useUIStore();

  return (
    <div className="settings">
      <h1>{t('settings.title')}</h1>

      <div className="setting-group">
        <label htmlFor="language">{t('settings.language')}</label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
        </select>
      </div>

      <div className="setting-group">
        <label htmlFor="theme">{t('settings.theme')}</label>
        <select
          id="theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </div>
  );
}

export default Settings;
```

---

### Parameter Interpolation Example

```javascript
import { useLanguage } from '../hooks/useLanguage';

function WelcomeMessage({ userName, messageCount }) {
  const { t } = useLanguage();

  return (
    <div className="welcome">
      <h1>{t('greeting', { name: userName })}</h1>
      {messageCount > 0 && (
        <p>{t('message.count', { count: messageCount })}</p>
      )}
    </div>
  );
}

// Usage
<WelcomeMessage userName="Alice" messageCount={5} />
// English: "Hello, Alice!" and "You have 5 new messages"
// French: "Bonjour, Alice!" and "Vous avez 5 nouveaux messages"
```

---

## Advanced Patterns

### Complete LanguageProvider with Persistence

```javascript
import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(() => {
    return localStorage.getItem('preferredLanguage') || 'en';
  });
  const [translations, setTranslations] = useState({});

  // Load translations dynamically
  useEffect(() => {
    async function loadTranslations() {
      try {
        const module = await import(`../locales/${locale}.json`);
        setTranslations(module.default);
      } catch (error) {
        console.error('Failed to load translations:', error);
      }
    }

    loadTranslations();
  }, [locale]);

  // Persist locale changes
  const switchLocale = useCallback((newLocale) => {
    localStorage.setItem('preferredLanguage', newLocale);
    setLocale(newLocale);
  }, []);

  // Translation function with parameter interpolation
  const t = useCallback((key, params = {}) => {
    let translation = translations[key] || key;

    // Replace parameters
    Object.keys(params).forEach((param) => {
      translation = translation.replace(`{${param}}`, params[param]);
    });

    return translation;
  }, [translations]);

  // Number formatting
  const formatNumber = useCallback((value) => {
    return new Intl.NumberFormat(locale).format(value);
  }, [locale]);

  // Date formatting
  const formatDate = useCallback((date, options = {}) => {
    return new Intl.DateTimeFormat(locale, options).format(date);
  }, [locale]);

  const contextValue = useMemo(() => ({
    locale,
    setLocale: switchLocale,
    t,
    formatNumber,
    formatDate,
  }), [locale, switchLocale, t, formatNumber, formatDate]);

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);

  if (!context) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }

  return context;
}
```

---

### Formatting Examples

```javascript
import { useLanguage } from '../hooks/useLanguage';

function FormattingExamples() {
  const { formatNumber, formatDate, locale } = useLanguage();

  const price = 1234.56;
  const date = new Date('2026-02-12');

  return (
    <div>
      {/* Number formatting */}
      <p>Number: {formatNumber(26254.39)}</p>
      {/* en: "26,254.39" | fr: "26 254,39" */}

      {/* Currency */}
      <p>
        Price: {new Intl.NumberFormat(locale, {
          style: 'currency',
          currency: 'USD'
        }).format(price)}
      </p>
      {/* en: "$1,234.56" | fr: "1 234,56 $US" */}

      {/* Date */}
      <p>Date: {formatDate(date)}</p>
      {/* en: "2/12/2026" | fr: "12/02/2026" */}

      {/* Long date */}
      <p>
        Long date: {formatDate(date, {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })}
      </p>
      {/* en: "February 12, 2026" | fr: "12 février 2026" */}
    </div>
  );
}
```

---

### Language Detection

```javascript
function detectLanguage() {
  // 1. Check localStorage
  const stored = localStorage.getItem('preferredLanguage');
  if (stored && ['en', 'fr'].includes(stored)) {
    return stored;
  }

  // 2. Check URL parameter
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang && ['en', 'fr'].includes(urlLang)) {
    localStorage.setItem('preferredLanguage', urlLang);
    return urlLang;
  }

  // 3. Check browser preference
  const browserLang = navigator.language.split('-')[0];
  if (['en', 'fr'].includes(browserLang)) {
    return browserLang;
  }

  // 4. Default
  return 'en';
}

// Use in LanguageProvider
export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(() => detectLanguage());
  // ...
}
```

---

### Error Boundary with Translation

```javascript
import { Component } from 'react';
import { LanguageContext } from '../context/LanguageContext';

class ErrorBoundary extends Component {
  static contextType = LanguageContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { t } = this.context;
      return (
        <div className="error-page">
          <h1>{t('error.generic')}</h1>
          <button onClick={() => window.location.reload()}>
            {t('error.retry')}
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## Testing Examples

### Translation Key Validation

```javascript
import enTranslations from '../locales/en.json';
import frTranslations from '../locales/fr.json';

describe('Translation Files', () => {
  it('should have matching keys', () => {
    const enKeys = Object.keys(enTranslations).sort();
    const frKeys = Object.keys(frTranslations).sort();

    expect(enKeys).toEqual(frKeys);
  });

  it('should not have empty values', () => {
    Object.values(enTranslations).forEach(value => {
      expect(value).not.toBe('');
    });

    Object.values(frTranslations).forEach(value => {
      expect(value).not.toBe('');
    });
  });
});
```

### Component Testing

```javascript
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageProvider, useLanguage } from '../context/LanguageContext';

function TestComponent() {
  const { t, language, toggleLanguage } = useLanguage();

  return (
    <div>
      <p data-testid="welcome">{t('welcome')}</p>
      <button onClick={toggleLanguage}>Toggle</button>
    </div>
  );
}

describe('LanguageProvider', () => {
  it('should render English by default', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    expect(screen.getByTestId('welcome')).toHaveTextContent('Welcome');
  });

  it('should toggle to French', () => {
    render(
      <LanguageProvider>
        <TestComponent />
      </LanguageProvider>
    );

    fireEvent.click(screen.getByText('Toggle'));

    expect(screen.getByTestId('welcome')).toHaveTextContent('Bienvenue');
  });
});
```

---

## Best Practices from Project

1. **Context Validation**: Always check context exists in hook
2. **Lazy Loading**: Use dynamic imports for translations
3. **Parameter Interpolation**: Support {param} replacement
4. **Fallback Strategy**: Return key if translation missing
5. **State Integration**: Combine with Zustand for global state
6. **Error Handling**: Log failed translation loads
7. **Convenience Helpers**: Provide isFrench, isEnglish flags
8. **Type Safety**: Validate language codes before setting
9. **Persistence**: Save to localStorage
10. **Performance**: Memoize context value and functions

---

## Anti-Patterns to Avoid

| Anti-Pattern | Why It's Bad | Solution |
|--------------|--------------|----------|
| Hardcoded strings | Not translatable | Always use t() |
| No context validation | Runtime errors | Throw error in hook |
| Loading all translations | Large bundle | Lazy load per language |
| Not persisting choice | Lost on reload | Save to localStorage |
| No fallback | Shows undefined | Return key or default |
| Missing key warnings | Silent failures | Log missing translations |
| Not memoizing | Unnecessary re-renders | Use useMemo/useCallback |

---

## Performance Tips

1. **Lazy load translations**: Reduce initial bundle size
2. **Memoize context value**: Prevent re-renders
3. **Use useCallback**: Stable function references
4. **Lazy initialization**: Read localStorage once
5. **Namespace translations**: Split by route/feature
6. **Cache translations**: Don't reload on every render
7. **Use React.memo**: Wrap expensive components
8. **Avoid inline objects**: Extract to constants

---

## Common Use Cases

### Language Dropdown

```javascript
function LanguageDropdown() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <select value={language} onChange={(e) => setLanguage(e.target.value)}>
      <option value="en">English</option>
      <option value="fr">Français</option>
    </select>
  );
}
```

### Translation in Attributes

```javascript
function AccessibleButton() {
  const { t } = useLanguage();

  return (
    <button
      aria-label={t('chat.send')}
      title={t('chat.send')}
    >
      <SendIcon />
    </button>
  );
}
```

### Conditional Rendering

```javascript
function ConditionalContent() {
  const { isFrench } = useLanguage();

  return (
    <div>
      {isFrench ? (
        <FrenchOnlyComponent />
      ) : (
        <EnglishOnlyComponent />
      )}
    </div>
  );
}
```

---

## Debugging Tips

### Missing Translation Warning

```javascript
const t = useCallback((key, params = {}) => {
  let translation = translations[key];

  if (!translation) {
    console.warn(`Missing translation: ${key} for locale: ${locale}`);
    return key; // Return key as fallback
  }

  // Parameter interpolation
  Object.keys(params).forEach((param) => {
    translation = translation.replace(`{${param}}`, params[param]);
  });

  return translation;
}, [translations, locale]);
```

### DevTools Helper

```javascript
// Add to window for debugging
if (process.env.NODE_ENV === 'development') {
  window.__i18n__ = {
    translations,
    locale,
    setLocale,
  };
}

// Then in console:
// window.__i18n__.translations
// window.__i18n__.setLocale('fr')
```
