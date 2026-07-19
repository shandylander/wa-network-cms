import React from 'react';
import { InformationCircleIcon } from '@heroicons/react/24/outline';
import styles from './Tooltip.module.css';

// Hover/focus-triggered explanation bubble. Wrap any trigger element, or
// omit children to get a small info-icon trigger (the common case next to
// a permission label). CSS-only reveal — no JS positioning — so it stays
// cheap to sprinkle across dense tables/checklists.
export default function Tooltip({ text, side = 'top', children }) {
  if (!text) return children ?? null;
  return (
    <span className={styles.wrap} tabIndex={0}>
      {children ?? <InformationCircleIcon className={styles.infoIcon} />}
      <span className={[styles.bubble, styles[side]].join(' ')} role="tooltip">{text}</span>
    </span>
  );
}
