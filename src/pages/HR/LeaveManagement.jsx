import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import MyLeave       from './MyLeave';
import ApprovalQueue from './ApprovalQueue';
import LeaveSettings from './LeaveSettings';
import styles from './HR.module.css';

const TABS = {
  owner:      ['my', 'queue', 'settings'],
  manager:    ['my', 'queue', 'settings'],
  supervisor: ['my', 'queue'],
  staff:      ['my'],
};

const TAB_LABELS = {
  my:       'My Leave',
  queue:    'Approvals',
  settings: 'Entitlements',
};

export default function LeaveManagement() {
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'staff';
  const tabs = TABS[role] ?? ['my'];

  const [active, setActive] = useState(tabs[0] ?? 'my');

  if (tabs.length === 0) {
    return <p style={{ padding: 32, color: 'var(--text-sec)' }}>Leave management is not available for your role.</p>;
  }

  return (
    <div className={styles.page}>
      {tabs.length > 1 && (
        <div className={styles.tabBar}>
          {tabs.map(t => (
            <button key={t}
              className={[styles.tab, active === t ? styles.tabActive : ''].join(' ')}
              onClick={() => setActive(t)}>
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      )}
      <div className={styles.content}>
        {active === 'my'       && <MyLeave />}
        {active === 'queue'    && <ApprovalQueue />}
        {active === 'settings' && <LeaveSettings />}
      </div>
    </div>
  );
}
