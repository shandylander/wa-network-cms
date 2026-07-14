import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'theme';

function getSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    // Let the `@media (prefers-color-scheme: dark)` layer in index.css
    // govern — no attribute means neither the light nor dark override layer
    // applies.
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', theme);
  }
}

// Reads the saved preference ('light' | 'dark' | 'system', default
// 'system'), stamps `data-theme` on <html> so index.css's three-layer token
// strategy picks it up, and exposes { theme, setTheme, resolvedTheme } —
// `resolvedTheme` is always 'light' or 'dark' (system resolved to the
// current OS setting), handy for icon state in the toggle UI.
export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'system';
    } catch {
      return 'system';
    }
  });
  const [resolvedTheme, setResolvedTheme] = useState(() =>
    theme === 'system' ? getSystemTheme() : theme
  );

  useEffect(() => {
    applyTheme(theme);
    setResolvedTheme(theme === 'system' ? getSystemTheme() : theme);
  }, [theme]);

  // Track OS changes live while in 'system' mode.
  useEffect(() => {
    if (theme !== 'system' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolvedTheme(getSystemTheme());
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* ignore */ }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
