import React from 'react';
import styles from './Card.module.css';

export default function Card({ children, className = '', padding = true, ...rest }) {
  return (
    <div
      className={[styles.card, padding ? styles.padded : '', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }) {
  return (
    <div className={styles.header}>
      <div>
        <h3 className={styles.title}>{title}</h3>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
