import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import MyLeave       from './MyLeave';
import ApprovalQueue from './ApprovalQueue';
import LeaveSettings from './LeaveSettings';
import LeaveCalendar from './LeaveCalendar';
import WorkerLeave   from '../Worker/WorkerLeave';
import styles from './HR.module.css';

const TAB_LABELS = {
  my:       'My Leave',
  queue:    'Approvals',
  calendar: 'Calendar',
  settings: 'Entitlements',
};

export default function LeaveManagement() {
  const { userProfile } = useAuth();
  const { can }         = usePermissions();
  const role = userProfile?.role ?? 'staff';

  // Owner approves leave but does not apply for it — no 'my' tab.
  const tabs = [
    ...(role !== 'owner' ? ['my'] : []),
    ...(can('leave:approve')  ? ['queue', 'calendar'] : []),
    ...(can('leave:settings') ? ['settings']          : []),
  ];

  const [active, setActive] = useState(tabs[0] ?? 'my');

  // Field workers get the simplified wizard experience
  if (role === 'staff') {
    return <WorkerLeave />;
  }

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
        {active === 'calendar' && <LeaveCalendar />}
        {active === 'settings' && <LeaveSettings />}
      </div>
    </div>
  );
}
