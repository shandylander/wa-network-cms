import React, { createContext, useContext, useState, useCallback } from 'react';
import { TRANSLATIONS, LANGS } from '../i18n/translations';
import styles from './LanguageContext.module.css';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'wa-cms-lang';

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return TRANSLATIONS[saved] ? saved : 'en';
  });

  const setLang = useCallback((code) => {
    if (!TRANSLATIONS[code]) return;
    localStorage.setItem(STORAGE_KEY, code);
    setLangState(code);
  }, []);

  const t = useCallback(
    (key) => TRANSLATIONS[lang]?.[key] ?? TRANSLATIONS.en[key] ?? key,
    [lang]
  );

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used inside LanguageProvider');
  return ctx;
}

/* Big-tap language pill switch shown at the top of worker screens */
export function LangSwitch() {
  const { lang, setLang } = useLang();
  return (
    <div className={styles.switch} role="group" aria-label="Language">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          type="button"
          className={[styles.pill, lang === code ? styles.pillActive : ''].join(' ')}
          onClick={() => setLang(code)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
