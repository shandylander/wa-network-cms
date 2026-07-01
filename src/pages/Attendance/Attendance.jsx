import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import ClockPanel   from './ClockPanel';
import TeamView     from './TeamView';
import PhotoReview  from './PhotoReview';
import SubconAudit  from './SubconAudit';
import styles from './Attendance.module.css';

const TABS = {
  owner:       ['clock', 'team', 'photos', 'audit'],
  manager:     ['clock', 'team', 'photos', 'audit'],
  supervisor:  ['clock', 'team', 'audit'],
  staff:       ['clock'],
  'subcon-admin': ['audit'],
  subcon:      [],
};

const TAB_LABELS = {
  clock:  'My Attendance',
  team:   'Team',
  photos: 'Photo Review',
  audit:  'Site Audit',
};

export default function Attendance() {
  const { userProfile } = useAuth();
  const role = userProfile?.role ?? 'staff';
  const tabs = TABS[role] ?? ['clock'];

  const [active, setActive] = useState(tabs[0] ?? 'clock');

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
