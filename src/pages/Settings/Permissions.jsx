import React from 'react';
import { CheckIcon, MinusIcon } from '@heroicons/react/24/solid';
import styles from './Permissions.module.css';

const ROLES = ['Owner', 'Manager', 'Supervisor', 'Staff', 'Sub-con Admin', 'Sub-con'];

const FEATURES = [
  {
    group: 'Dashboard & Projects',
    rows: [
      {
        label: 'View dashboard',
        cells: ['full', 'full', 'full', 'none', 'none', 'none'],
      },
      {
        label: 'View projects',
        cells: ['full', 'full', 'full', 'full', 'partial:Assigned only', 'partial:Assigned only'],
      },
      {
        label: 'Update blocks',
        cells: ['full', 'full', 'full', 'partial:Own team', 'partial:Own team', 'partial:Own team'],
      },
      {
        label: 'Add / remove blocks',
        cells: ['full', 'full', 'none', 'none', 'none', 'none'],
      },
      {
        label: 'Generate reports',
        cells: ['full', 'full', 'full', 'none', 'none', 'none'],
      },
    ],
  },
  {
    group: 'Finance & Claims',
    rows: [
      {
        label: 'View claims',
        cells: ['full', 'full', 'none', 'none', 'none', 'none'],
      },
    ],
  },
  {
    group: 'Workers & HSE',
    rows: [
      {
        label: 'Manage workers',
        cells: ['full', 'full', 'none', 'none', 'partial:Own team', 'none'],
      },
      {
        label: 'View HSE documents',
        cells: ['full', 'full', 'full', 'full', 'partial:Permitted docs', 'partial:Permitted docs'],
      },
    ],
  },
  {
    group: 'Administration',
    rows: [
      {
        label: 'Create sub-accounts',
        cells: ['full', 'full', 'none', 'none', 'partial:Own team', 'none'],
      },
      {
        label: 'Reset PINs',
        cells: ['full', 'full', 'none', 'none', 'partial:Own team', 'none'],
      },
      {
        label: 'Admin settings',
        cells: ['full', 'none', 'none', 'none', 'none', 'none'],
      },
    ],
  },
];

function Cell({ value }) {
  if (value === 'full') {
    return (
      <td className={styles.cellFull}>
        <CheckIcon className={styles.checkIcon} />
      </td>
    );
  }
  if (value === 'none') {
    return (
      <td className={styles.cellNone}>
        <MinusIcon className={styles.noneIcon} />
      </td>
    );
  }
  const label = value.replace('partial:', '');
  return (
    <td className={styles.cellPartial}>
      <span className={styles.partialLabel}>{label}</span>
    </td>
  );
}

export default function Permissions() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Role Permission Matrix</h2>
        <p className={styles.sub}>Read-only view of what each role can access across the system.</p>
      </div>

      <div className={styles.legend}>
        <span className={styles.legendItem}><CheckIcon className={styles.checkIcon} /> Full access</span>
        <span className={styles.legendItem}><span className={styles.partialDot} /> Conditional access</span>
        <span className={styles.legendItem}><MinusIcon className={styles.noneIcon} /> No access</span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.featureHead}>Feature</th>
              {ROLES.map(r => (
                <th key={r} className={styles.roleHead}>{r}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map(group => (
              <React.Fragment key={group.group}>
                <tr className={styles.groupRow}>
                  <td colSpan={ROLES.length + 1} className={styles.groupCell}>{group.group}</td>
                </tr>
                {group.rows.map(row => (
                  <tr key={row.label} className={styles.dataRow}>
                    <td className={styles.featureCell}>{row.label}</td>
                    {row.cells.map((c, i) => <Cell key={i} value={c} />)}
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
