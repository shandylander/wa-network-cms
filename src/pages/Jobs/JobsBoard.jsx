import React, { useState, useEffect } from 'react';
import { collection, getDocs, onSnapshot } from 'firebase/firestore';
import { WrenchScrewdriverIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { STATUS_CONFIG } from './jobStatus';
import AssignJobModal from './AssignJobModal';
import JobSummary from './JobSummary';
import styles from './Jobs.module.css';

const GROUPS = [
  { status: 'needs-revision', title: 'Needs Revision' },
  { status: 'completed',      title: 'Awaiting Vet' },
  { status: 'in-progress',    title: 'In Progress' },
  { status: 'scheduled',      title: 'Scheduled' },
];

// Manager/owner cross-cutting view: every job across every customer,
// grouped by status. Not a drag-and-drop kanban — the team's small enough
// that a scannable grouped list beats the overhead of a full board.
export default function JobsBoard() {
  const { toast } = useToast();
  const { can }   = usePermissions();
  const canAssign = can('jobs:assign');
  const canVet    = can('jobs:vet');

  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [selected,  setSelected]  = useState(null);

  // Live listener (not a one-time fetch) so this board always reflects jobs
  // scheduled/updated from elsewhere (Customer/Project's own Service Jobs
  // list, or a technician checking in) without needing a manual refresh.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'serviceJobs'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
      setJobs(list);
      setLoading(false);
    }, () => {
      toast.error('Failed to load jobs');
      setLoading(false);
    });
    return unsub;
  }, [toast]);

  if (!canAssign && !canVet) {
    return <p className={styles.emptyList}>You don't have access to this page.</p>;
  }

  const vettedCount = jobs.filter(j => j.status === 'vetted').length;
  const counts = Object.fromEntries(GROUPS.map(g => [g.status, jobs.filter(j => j.status === g.status).length]));

  return (
    <div style={{ padding: '20px 16px', maxWidth: 960, margin: '0 auto' }}>
      <div className={styles.listHead} style={{ marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 3px' }}>Service Jobs</h1>
          <p style={{ fontSize: 13, color: 'var(--text-sec)', margin: 0 }}>Every technician job, today and upcoming</p>
        </div>
        {canAssign && (
          <button className={styles.scheduleBtn} onClick={() => setAssigning(true)}>
            <CalendarDaysIcon width={14} /> Schedule Job
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '18px 0' }}>
        {GROUPS.map(g => (
          <div key={g.status} style={{ flex: 1, minWidth: 110, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', boxShadow: 'var(--shadow)' }}>
            <div style={{ fontSize: 19, fontWeight: 700 }}>{counts[g.status]}</div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>{g.title}</div>
          </div>
        ))}
        <div style={{ flex: 1, minWidth: 110, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', boxShadow: 'var(--shadow)' }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--green)' }}>{vettedCount}</div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Vetted</div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : jobs.length === 0 ? (
        <div className={styles.emptyList}>
          <WrenchScrewdriverIcon width={30} />
          <p>No service jobs yet.</p>
        </div>
      ) : (
        GROUPS.map(g => {
          const group = jobs.filter(j => j.status === g.status);
          if (group.length === 0) return null;
          const sc = STATUS_CONFIG[g.status];
          return (
            <div key={g.status} style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className={[styles.pill, styles[sc.cls]].join(' ')}>{g.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{group.length}</span>
              </div>
              <div className={styles.listWrap}>
                {group.map(j => (
                  <button key={j.id} className={styles.reportRow} onClick={() => setSelected(j)}>
                    <div className={styles.reportMain}>
                      <span className={styles.reportTitle}>
                        {j.customerName}{j.assignedToNames?.length > 1 ? ` (${j.assignedToNames.length}-man job)` : ''}
                      </span>
                      <span className={styles.reportMeta}>
                        <span>{j.scheduledDate}</span>
                        <span>·</span>
                        <span>{j.assignedToNames?.join(', ') || 'Unassigned'}</span>
                        {j.jobDescription && <span className={styles.reportChip}>{j.jobDescription.slice(0, 40)}</span>}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })
      )}

      {/* No local append in onSaved — the board's onSnapshot listener already
          delivers the new doc; appending here rendered it twice. */}
      {assigning && (
        <AssignJobModalNoCustomer onClose={() => setAssigning(false)} onSaved={() => {}} />
      )}

      {selected && (
        <JobSummary job={selected} onClose={() => setSelected(null)} onUpdated={(j) => {
          setJobs(prev => prev.map(x => x.id === j.id ? j : x));
          setSelected(j);
        }} />
      )}
    </div>
  );
}

// AssignJobModal expects a customer already chosen (it's normally opened
// from within a Customer/Project's own Job list). From the cross-cutting
// board there's no such context yet, so wrap it with a lightweight
// customer picker first.
function AssignJobModalNoCustomer({ onClose, onSaved }) {
  const { toast } = useToast();
  const [customers, setCustomers] = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [picked,     setPicked]    = useState(null);

  useEffect(() => {
    getDocs(collection(db, 'customers'))
      .then(snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))))
      .catch(() => toast.error('Failed to load customers'))
      .finally(() => setLoading(false));
  }, [toast]);

  if (picked) {
    return <AssignJobModal customerId={picked.id} customerName={picked.name} onClose={onClose} onSaved={onSaved} />;
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,26,46,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--card)', borderRadius: 12, width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', padding: 18 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 12px' }}>Which customer is this job for?</h2>
        {loading ? (
          <div className={styles.loadingBox}><div className={styles.spinner} /></div>
        ) : (
          <div className={styles.listWrap}>
            {customers.map(c => (
              <button key={c.id} className={styles.reportRow} onClick={() => setPicked(c)}>
                <span className={styles.reportTitle}>{c.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
