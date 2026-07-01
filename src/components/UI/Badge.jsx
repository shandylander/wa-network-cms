import React from 'react';
import styles from './Badge.module.css';

const COLOR_MAP = {
  green:   styles.green,
  amber:   styles.amber,
  red:     styles.red,
  blue:    styles.blue,
  purple:  styles.purple,
  default: styles.default,
};

export default function Badge({ children, color = 'default', dot = false, className = '' }) {
  return (
    <span className={[styles.badge, COLOR_MAP[color] ?? styles.default, className].join(' ')}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  );
}
