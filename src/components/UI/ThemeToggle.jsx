import React from 'react';
import { SunIcon, MoonIcon, ComputerDesktopIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../context/ThemeContext';
import styles from './ThemeToggle.module.css';

const OPTIONS = [
  { value: 'light',  label: 'Light',      icon: SunIcon },
  { value: 'dark',   label: 'Dark',       icon: MoonIcon },
  { value: 'system', label: 'Use system', icon: ComputerDesktopIcon },
];

// Compact 3-way segmented control (light / dark / system). Used in the
// Header (desktop, top-right) and on the Profile page.
export default function ThemeToggle({ className = '' }) {
  const { theme, setTheme } = useTheme();

  return (
    <div className={[styles.wrap, className].filter(Boolean).join(' ')} role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          title={label}
          className={[styles.btn, theme === value ? styles.btnActive : ''].join(' ')}
          onClick={() => setTheme(value)}
        >
          <Icon width={15} />
        </button>
      ))}
    </div>
  );
}
