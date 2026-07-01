import React from 'react';
import styles from './StatCard.module.css';

export default function StatCard({ label, value, icon: Icon, color = 'blue', sub }) {
  return (
    <div className={[styles.card, styles[color]].join(' ')}>
      <div className={styles.body}>
        <div>
          <p className={styles.label}>{label}</p>
          <p className={styles.value}>{value ?? '—'}</p>
          {sub && <p className={styles.sub}>{sub}</p>}
        </div>
        {Icon && (
          <div className={styles.iconWrap}>
            <Icon className={styles.icon} />
          </div>
        )}
      </div>
    </div>
  );
}
