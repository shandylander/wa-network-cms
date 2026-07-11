import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { DocumentTextIcon, PlusIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/helpers';
import ServiceReportModal from './ServiceReportModal';
import ServiceReportDetail from './ServiceReportDetail';
import styles from './ServiceReports.module.css';

// Shared between ProjectDetail (scoped to one project) and CustomerDetail
// (scoped to the customer across all their projects/visits) — pass either
// projectId or just customerId.
export default function ServiceReportList({ customerId, customerName, projectId, projectName, showProjectColumn }) {
  const { toast } = useToast();
  const { can }   = usePermissions();
  const canManage = can('manage:service-reports');

  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const field = projectId ? 'projectId' : 'customerId';
      const value = projectId ?? customerId;
      // Sort client-side rather than combining where+orderBy in the query —
      // avoids needing a composite index, matching this codebase's existing
      // pattern for similar filtered lists (e.g. ProjectDocuments.jsx).
      const snap = await getDocs(query(collection(db, 'serviceReports'), where(field, '==', value)));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0));
      setReports(list);
    } catch {
      toast.error('Failed to load service reports');
    } finally {
      setLoading(false);
    }
  }, [projectId, customerId, toast]);

  useEffect(() => { load(); }, [load]);

  if (!canManage) return null;

  return (
    <div>
      <div className={styles.listHead}>
        <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
          {reports.length} report{reports.length !== 1 ? 's' : ''}
        </span>
        <button className={styles.newBtn} onClick={() => setCreating(true)}>
          <PlusIcon width={14} /> New Report
        </button>
      </div>

      {loading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : reports.length === 0 ? (
        <div className={styles.emptyList}>
          <DocumentTextIcon width={30} />
          <p>No service reports yet.</p>
        </div>
      ) : (
        <div className={styles.listWrap}>
          {reports.map(r => (
            <button key={r.id} className={styles.reportRow} onClick={() => setSelected(r)}>
              <div className={styles.reportMain}>
                <span className={styles.reportTitle}>
                  {r.jobDescription?.slice(0, 70) || 'Service visit'}{r.jobDescription?.length > 70 ? '…' : ''}
                </span>
                <span className={styles.reportMeta}>
                  <span>{r.visitDate}</span>
                  <span>·</span>
                  <span>{r.attendedBy}</span>
                  {showProjectColumn && r.projectName && <span className={styles.reportChip}>{r.projectName}</span>}
                  {!showProjectColumn && <span>{formatDate(r.createdAt)}</span>}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {creating && (
        <ServiceReportModal
          customerId={customerId}
          customerName={customerName}
          projectId={projectId}
          projectName={projectName}
          onClose={() => setCreating(false)}
          onSaved={(r) => setReports(prev => [r, ...prev])}
        />
      )}

      {selected && (
        <ServiceReportDetail report={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
