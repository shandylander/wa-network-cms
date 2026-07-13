import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { DocumentTextIcon, PlusIcon, CalendarDaysIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/helpers';
import JobCompletionForm from './JobCompletionForm';
import JobSummary from './JobSummary';
import AssignJobModal from './AssignJobModal';
import { STATUS_CONFIG } from './jobStatus';
import styles from './Jobs.module.css';

// Shared between ProjectDetail (scoped to one project) and CustomerDetail
// (scoped to the customer across all their projects/visits) — pass either
// projectId or just customerId.
export default function JobList({ customerId, customerName, projectId, projectName, showProjectColumn }) {
  const { toast } = useToast();
  const { can }   = usePermissions();
  const canManage = can('manage:service-reports');
  const canAssign = can('jobs:assign');

  const [jobs,     setJobs]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [creating, setCreating] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [selected, setSelected] = useState(null);

  // Live listener (not a one-time fetch) so this list stays in sync with
  // jobs scheduled/updated from the cross-cutting Jobs board or a
  // technician's own check-in, without needing a manual refresh.
  useEffect(() => {
    setLoading(true);
    const field = projectId ? 'projectId' : 'customerId';
    const value = projectId ?? customerId;
    // Sort client-side rather than combining where+orderBy in the query —
    // avoids needing a composite index, matching this codebase's existing
    // pattern for similar filtered lists (e.g. ProjectDocuments.jsx).
    const unsub = onSnapshot(query(collection(db, 'serviceJobs'), where(field, '==', value)), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setJobs(list);
      setLoading(false);
    }, () => {
      toast.error('Failed to load service jobs');
      setLoading(false);
    });
    return unsub;
  }, [projectId, customerId, toast]);

  if (!canManage && !canAssign) return null;

  return (
    <div>
      <div className={styles.listHead}>
        <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
          {jobs.length} job{jobs.length !== 1 ? 's' : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          {canAssign && (
            <button className={styles.scheduleBtn} onClick={() => setAssigning(true)}>
              <CalendarDaysIcon width={14} /> Schedule Job
            </button>
          )}
          {canManage && (
            <button className={styles.newBtn} onClick={() => setCreating(true)}>
              <PlusIcon width={14} /> New Report
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : jobs.length === 0 ? (
        <div className={styles.emptyList}>
          <DocumentTextIcon width={30} />
          <p>No service jobs yet.</p>
        </div>
      ) : (
        <div className={styles.listWrap}>
          {jobs.map(j => {
            const sc = STATUS_CONFIG[j.status] ?? STATUS_CONFIG.completed;
            return (
              <button key={j.id} className={styles.reportRow} onClick={() => setSelected(j)}>
                <div className={styles.reportMain}>
                  <span className={styles.reportTitle}>
                    {j.jobDescription?.slice(0, 70) || j.scheduledNotes?.slice(0, 70) || 'Service visit'}
                    {(j.jobDescription?.length ?? 0) > 70 ? '…' : ''}
                  </span>
                  <span className={styles.reportMeta}>
                    <span className={[styles.pill, styles[sc.cls]].join(' ')}>{sc.label}</span>
                    <span>{j.scheduledDate}</span>
                    <span>·</span>
                    <span>{j.assignedToNames?.join(', ') || '—'}</span>
                    {showProjectColumn && j.projectName && <span className={styles.reportChip}>{j.projectName}</span>}
                    {!showProjectColumn && <span>{formatDate(j.createdAt)}</span>}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No local append in onSaved — the onSnapshot listener above already
          delivers the new doc (Firestore fires the local snapshot before
          onSaved runs), so appending here rendered the same job twice. */}
      {creating && (
        <JobCompletionForm
          customerId={customerId}
          customerName={customerName}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setCreating(false)}
          onSaved={() => {}}
        />
      )}

      {assigning && (
        <AssignJobModal
          customerId={customerId}
          customerName={customerName}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setAssigning(false)}
          onSaved={() => {}}
        />
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
