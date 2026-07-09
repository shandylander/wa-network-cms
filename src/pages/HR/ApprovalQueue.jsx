import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime } from '../../utils/helpers';
import FileLightbox, { isImageUrl } from '../../components/UI/FileLightbox';
import styles from './HR.module.css';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const TYPE_COLOR = { AL: 'blue', MC: 'green', NPL: 'amber', OIL: 'purple' };

export default function ApprovalQueue() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [lightbox, setLightbox] = useState(null);
  const year = new Date().getFullYear();

  const [apps,       setApps]      = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [filter,     setFilter]    = useState('pending');
  const [rejectId,   setRejectId]  = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [saving,     setSaving]    = useState(false);

  const isAdmin = ['owner', 'manager'].includes(userProfile?.role);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        let q;
        if (isAdmin) {
          q = query(collection(db, 'leaveApplications'), where('year', '==', year));
        } else {
          q = query(collection(db, 'leaveApplications'), where('team', '==', 'own'), where('year', '==', year));
        }
        const snap = await getDocs(q);
        const sorted = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        setApps(sorted);
      } catch { toast.error('Failed to load applications'); }
      finally { setLoading(false); }
    };
    load();
  }, [isAdmin, year, toast]);

  const approve = async (app) => {
    setSaving(true);
    try {
      const reviewedAt = Timestamp.now();
      await updateDoc(doc(db, 'leaveApplications', app.id), {
        status: 'approved',
        reviewedBy: userProfile.userId,
        reviewedByName: userProfile.name,
        reviewedAt,
        rejectionReason: null,
      });
      setApps(a => a.map(x => x.id === app.id ? { ...x, status: 'approved', reviewedByName: userProfile.name, reviewedAt } : x));
      toast.success(`Approved ${app.name}'s ${app.type} application`);
    } catch { toast.error('Failed to approve'); }
    finally { setSaving(false); }
  };

  const reject = async () => {
    if (!rejectNote.trim()) { toast.error('Please enter a reason for rejection.'); return; }
    setSaving(true);
    const app = apps.find(a => a.id === rejectId);
    try {
      const reviewedAt = Timestamp.now();
      await updateDoc(doc(db, 'leaveApplications', rejectId), {
        status: 'rejected',
        reviewedBy: userProfile.userId,
        reviewedByName: userProfile.name,
        reviewedAt,
        rejectionReason: rejectNote.trim(),
      });
      setApps(a => a.map(x => x.id === rejectId
        ? { ...x, status: 'rejected', rejectionReason: rejectNote.trim(), reviewedByName: userProfile.name, reviewedAt }
        : x));
      toast.success(`Rejected ${app?.name}'s application`);
      setRejectId(null);
      setRejectNote('');
    } catch { toast.error('Failed to reject'); }
    finally { setSaving(false); }
  };

  const filtered = filter === 'all' ? apps : apps.filter(a => a.status === filter);

  const counts = {
    pending:  apps.filter(a => a.status === 'pending').length,
    approved: apps.filter(a => a.status === 'approved').length,
    rejected: apps.filter(a => a.status === 'rejected').length,
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.queueWrap}>
      {/* Filter tabs */}
      <div className={styles.queueFilterBar}>
        {[
          { key: 'pending',  label: `Pending${counts.pending ? ` (${counts.pending})` : ''}` },
          { key: 'approved', label: `Approved${counts.approved ? ` (${counts.approved})` : ''}` },
          { key: 'rejected', label: `Rejected` },
          { key: 'all',      label: 'All' },
        ].map(f => (
          <button key={f.key}
            className={[styles.queueFilter, filter === f.key ? styles.queueFilterActive : ''].join(' ')}
            onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} applications.</p>
      ) : (
        <div className={styles.queueList}>
          {filtered.map(app => (
            <div key={app.id} className={[styles.queueCard, app.status === 'pending' ? styles.queueCardPending : ''].join(' ')}>
              <div className={styles.queueCardMain}>
                <div className={styles.queueLeft}>
                  <span className={[styles.typeBadge, styles[`type${app.type}`]].join(' ')}>{app.type}</span>
                  <div>
                    <p className={styles.queueName}>{app.name}</p>
                    <p className={styles.queueDates}>
                      {fmtDate(app.dateFrom)}{app.dateTo !== app.dateFrom ? ` – ${fmtDate(app.dateTo)}` : ''}
                      {app.halfDay ? ` · ${app.halfDayPeriod} half-day` : ` · ${app.days}d`}
                    </p>
                    <p className={styles.queueReason}>{app.reason}</p>
                    {app.rejectionReason && (
                      <p className={styles.queueReject}>Reason: {app.rejectionReason}</p>
                    )}
                    {app.status !== 'pending' && app.reviewedByName && (
                      <p className={styles.queueDates}>
                        {app.status === 'approved' ? 'Approved' : 'Rejected'} by {app.reviewedByName} · {formatDateTime(app.reviewedAt)}
                      </p>
                    )}
                    {app.mcUrl && (
                      <a href={app.mcUrl} target="_blank" rel="noreferrer" className={styles.mcLink}
                        onClick={e => { if (isImageUrl(app.mcUrl)) { e.preventDefault(); setLightbox(app.mcUrl); } }}>
                        View MC cert →
                      </a>
                    )}
                    {lightbox === app.mcUrl && (
                      <FileLightbox url={lightbox} caption={`${app.name} — MC`} onClose={() => setLightbox(null)} />
                    )}
                  </div>
                </div>
                <div className={styles.queueRight}>
                  {app.status === 'pending' ? (
                    <>
                      <button className={styles.approveBtn} onClick={() => approve(app)} disabled={saving}>
                        <CheckIcon width={14} /> Approve
                      </button>
                      <button className={styles.rejectBtn} onClick={() => { setRejectId(app.id); setRejectNote(''); }} disabled={saving}>
                        <XMarkIcon width={14} /> Reject
                      </button>
                    </>
                  ) : (
                    <span className={[styles.statusBadge, styles[`status${app.status === 'approved' ? 'green' : app.status === 'rejected' ? 'red' : 'default'}`]].join(' ')}>
                      {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectId && (
        <div className={styles.modalOverlay} onClick={() => setRejectId(null)}>
          <div className={styles.rejectModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Reject Application</h3>
            <p className={styles.rejectSubtitle}>Please provide a reason for the applicant.</p>
            <textarea className={styles.formTextarea} rows={3} value={rejectNote}
              onChange={e => setRejectNote(e.target.value)}
              placeholder="e.g. Insufficient AL balance / conflicting project schedule" />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setRejectId(null)}>Cancel</button>
              <button className={styles.rejectConfirmBtn} onClick={reject} disabled={saving}>
                {saving ? 'Rejecting…' : 'Confirm Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
