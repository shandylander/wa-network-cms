import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import ClockPanel   from './ClockPanel';
import TeamView     from './TeamView';
import PhotoReview  from './PhotoReview';
import SubconAudit  from './SubconAudit';
import WorkerClock  from '../Worker/WorkerClock';
import styles from './Attendance.module.css';

const TAB_LABELS = {
  clock:  'My Attendance',
  team:   'Team',
  photos: 'Photo Review',
  audit:  'Site Audit',
};

export default function Attendance() {
  const { userProfile } = useAuth();
  const { can }         = usePermissions();
  const role = userProfile?.role ?? 'staff';

  // Reproduces the original role => tabs map exactly: attendance:manage
  // (owner/manager/supervisor) unlocks team + audit, plus photos for
  // owner/manager (attendance:photo-review); subcon-admin sees only their
  // own site audit; everyone else just clocks in/out.
  const tabs = can('attendance:manage')
    ? ['clock', 'team', ...(can('attendance:photo-review') ? ['photos'] : []), 'audit']
    : role === 'subcon-admin' ? ['audit'] : ['clock'];

  const [active, setActive] = useState(tabs[0] ?? 'clock');

  // Field workers get the simplified big-button experience
  if (role === 'staff' || role === 'subcon') {
    return <WorkerClock />;
  }

  if (tabs.length === 0) {
    return <p style={{ padding: 32, color: 'var(--text-sec)' }}>Attendance is not available for your role.</p>;
  }

  return (
    <div className={styles.page}>
      {tabs.length > 1 && (
        <div className={styles.tabBar}>
          {tabs.map(t => (
            <button
              key={t}
              className={[styles.tab, active === t ? styles.tabActive : ''].join(' ')}
              onClick={() => setActive(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>
      )}

      <div className={styles.content}>
        {active === 'clock'  && <ClockPanel />}
        {active === 'team'   && <TeamView />}
        {active === 'photos' && <PhotoReview />}
        {active === 'audit'  && <SubconAudit />}
      </div>
    </div>
  );
}
