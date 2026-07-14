import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import {
  ClockIcon, CalendarDaysIcon, ReceiptPercentIcon, MegaphoneIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useLang, LangSwitch } from '../../context/LanguageContext';
import { formatTime12 } from '../../utils/helpers';
import { STATUS_CONFIG } from '../Jobs/jobStatus';
import styles from './Worker.module.css';
import jobStyles from '../Jobs/Jobs.module.css';

const greetingKey = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 12) return 'goodMorning';
  if (h < 18) return 'goodAfternoon';
  return 'goodEvening';
};

// Technician landing page — replaces the admin project dashboard for staff.
// Today's/open jobs up top (big tappable cards, status pill), then the
// existing Attendance/Leave/Petty Cash/Announcements as quick-access tiles.
export default function WorkerHome() {
  const { userProfile } = useAuth();
  const { t, lang }     = useLang();
  const navigate         = useNavigate();

  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile?.userId) return;
    const unsub = onSnapshot(
      query(collection(db, 'serviceJobs'), where('assignedTo', 'array-contains', userProfile.userId)),
      snap => {
        const open = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(j => j.status === 'scheduled' || j.status === 'in-progress')
          .sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
        setJobs(open);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [userProfile?.userId]);

  return (
    <div className={styles.page}>
      <div className={styles.langRow}><LangSwitch /></div>

      <p className={styles.greeting}>{t(greetingKey())}, {userProfile?.name}</p>
      <p className={styles.dateStrip}>
        {new Date().toLocaleDateString(lang === 'bn' ? 'bn' : lang === 'ta' ? 'ta' : 'en-SG',
          { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })}
      </p>

      <p className={styles.sectionTitle} style={{ marginTop: 8 }}>Today's Jobs{jobs.length > 0 ? ` · ${jobs.length}` : ''}</p>
      {loading ? (
        <div className={styles.uploadingBox}><div className={styles.spinner} /></div>
      ) : jobs.length === 0 ? (
        <p className={styles.empty}>No jobs assigned right now.</p>
      ) : (
        jobs.map(j => {
          const sc = STATUS_CONFIG[j.status] ?? STATUS_CONFIG.scheduled;
          const teammates = (j.assignedToNames ?? []).filter(n => n !== userProfile.name);
          return (
            <button key={j.id} className={jobStyles.jobCard} onClick={() => navigate(`/jobs/${j.id}`)}>
              <div className={jobStyles.jobCardTop}>
                <span className={jobStyles.jobCust}>{j.customerName}</span>
                <span className={[jobStyles.pill, jobStyles[sc.cls]].join(' ')}>{sc.label}</span>
              </div>
              {j.scheduledNotes && <p className={jobStyles.jobNotes}>{j.scheduledNotes}</p>}
              <div className={jobStyles.jobMeta}>
                <span>{j.scheduledDate}{j.scheduledTime ? ` · ${formatTime12(j.scheduledTime)}` : ''}</span>
                {j.address && <span>📍 {j.address}</span>}
                {teammates.length > 0 && <span>👥 with {teammates.join(', ')}</span>}
              </div>
            </button>
          );
        })
      )}

      <p className={styles.sectionTitle}>Quick Access</p>
      <div className={jobStyles.quickGrid}>
        <button className={jobStyles.quickBox} onClick={() => navigate('/attendance')}>
          <span className={[jobStyles.quickIcon, jobStyles.quickNavy].join(' ')}><ClockIcon width={20} /></span>
          <span className={jobStyles.quickLabel}>Attendance</span>
        </button>
        <button className={jobStyles.quickBox} onClick={() => navigate('/leave')}>
          <span className={[jobStyles.quickIcon, jobStyles.quickBlue].join(' ')}><CalendarDaysIcon width={20} /></span>
          <span className={jobStyles.quickLabel}>Leave</span>
        </button>
        <button className={jobStyles.quickBox} onClick={() => navigate('/petty-cash')}>
          <span className={[jobStyles.quickIcon, jobStyles.quickPurple].join(' ')}><ReceiptPercentIcon width={20} /></span>
          <span className={jobStyles.quickLabel}>Petty Cash</span>
        </button>
        <button className={jobStyles.quickBox} onClick={() => navigate('/announcements')}>
          <span className={[jobStyles.quickIcon, jobStyles.quickGreen].join(' ')}><MegaphoneIcon width={20} /></span>
          <span className={jobStyles.quickLabel}>Announcements</span>
        </button>
      </div>
    </div>
  );
}
