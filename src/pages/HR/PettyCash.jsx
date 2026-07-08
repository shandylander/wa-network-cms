import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { PlusIcon, XMarkIcon, CheckIcon, ReceiptPercentIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import WorkerClaims from '../Worker/WorkerClaims';
import FileLightbox, { isImageUrl } from '../../components/UI/FileLightbox';
import styles from './HR.module.css';

const CATEGORIES = [
  { value: 'transport',  label: 'Transport' },
  { value: 'meals',      label: 'Meals' },
  { value: 'materials',  label: 'Materials' },
  { value: 'tools',      label: 'Tools & Equipment' },
  { value: 'comms',      label: 'Communications' },
  { value: 'other',      label: 'Other' },
];

const STATUS_STYLES = { pending: 'statusamber', approved: 'statusgreen', rejected: 'statusred' };

const fmtDate = (iso) => { if (!iso) return '—'; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtAmt  = (n)   => `$${Number(n ?? 0).toFixed(2)}`;
const todaySG = ()    => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

export default function PettyCash() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const isAdmin = can('pettycash:approve');
  const isWorker = userProfile?.role === 'staff';

  const [claims,    setClaims]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState('my');      // 'my' | 'queue' (admin)
  const [showForm,  setShowForm]  = useState(false);
  const [rejectId,  setRejectId]  = useState(null);
  const [rejectNote, setRejectNote] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [lightbox,  setLightbox]  = useState(null);

  const [form, setForm] = useState({
    date: todaySG(), category: 'transport', description: '', amount: '', receiptUrl: '',
  });

  const loadClaims = async () => {
    setLoading(true);
    try {
      let q;
      if (tab === 'queue' && isAdmin) {
        q = query(collection(db, 'pettyCashClaims'), where('status', '==', 'pending'));
      } else {
        q = query(collection(db, 'pettyCashClaims'), where('userId', '==', userProfile.userId));
      }
      const snap = await getDocs(q);
      const sorted = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setClaims(sorted);
    } catch { toast.error('Failed to load claims'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (!isWorker) loadClaims(); }, [tab]); // eslint-disable-line

  // Field workers get the simplified photo-first experience
  if (isWorker) {
    return <WorkerClaims />;
  }

  const submit = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { toast.error('Please enter a description.'); return; }
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Please enter a valid amount.'); return; }
    setSaving(true);
    try {
      const payload = {
        userId: userProfile.userId, name: userProfile.name, team: userProfile.team ?? '',
        date: form.date, category: form.category,
        description: form.description.trim(),
        amount: parseFloat(form.amount),
        receiptUrl: form.receiptUrl.trim(),
        status: 'pending',
        reviewedBy: null, reviewedAt: null, rejectionReason: null,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'pettyCashClaims'), payload);
      if (tab === 'my') setClaims(c => [{ id: ref.id, ...payload }, ...c]);
      toast.success('Claim submitted');
      setShowForm(false);
      setForm({ date: todaySG(), category: 'transport', description: '', amount: '', receiptUrl: '' });
    } catch { toast.error('Failed to submit claim'); }
    finally { setSaving(false); }
  };

  const approve = async (claim) => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'pettyCashClaims', claim.id), {
        status: 'approved', reviewedBy: userProfile.userId, reviewedAt: Timestamp.now(), rejectionReason: null,
      });
      setClaims(c => c.filter(x => x.id !== claim.id));
      toast.success('Claim approved');
    } catch { toast.error('Failed to approve'); }
    finally { setSaving(false); }
  };

  const reject = async () => {
    if (!rejectNote.trim()) { toast.error('Please enter a reason.'); return; }
    setSaving(true);
    try {
      await updateDoc(doc(db, 'pettyCashClaims', rejectId), {
        status: 'rejected', reviewedBy: userProfile.userId, reviewedAt: Timestamp.now(), rejectionReason: rejectNote.trim(),
      });
      setClaims(c => c.filter(x => x.id !== rejectId));
      toast.success('Claim rejected');
      setRejectId(null); setRejectNote('');
    } catch { toast.error('Failed to reject'); }
    finally { setSaving(false); }
  };

  const totalPending = claims.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0);

  return (
    <div className={styles.pcWrap}>
      {/* Summary */}
      <div className={styles.pcSummary}>
        <div className={styles.pcSumCard}>
          <p className={styles.pcSumLbl}>Pending</p>
          <p className={styles.pcSumAmt} style={{ color: 'var(--amber)' }}>{fmtAmt(tab === 'my' ? totalPending : claims.reduce((s,c)=>s+c.amount,0))}</p>
        </div>
        {tab === 'my' && <div className={styles.pcSumCard}>
          <p className={styles.pcSumLbl}>Approved (all time)</p>
          <p className={styles.pcSumAmt} style={{ color: 'var(--green)' }}>{fmtAmt(totalApproved)}</p>
        </div>}
      </div>

      {/* Tabs */}
      <div className={styles.applyHeader}>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={[styles.queueFilter, tab === 'my' ? styles.queueFilterActive : ''].join(' ')} onClick={() => setTab('my')}>My Claims</button>
          {isAdmin && <button className={[styles.queueFilter, tab === 'queue' ? styles.queueFilterActive : ''].join(' ')} onClick={() => setTab('queue')}>Approval Queue</button>}
        </div>
        {tab === 'my' && (
          <button className={styles.applyBtn} onClick={() => setShowForm(true)}>
            <PlusIcon width={14} /> New Claim
          </button>
        )}
      </div>

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : claims.length === 0 ? (
        <p className={styles.empty}>{tab === 'queue' ? 'No pending claims.' : 'No claims submitted yet.'}</p>
      ) : (
        <div className={styles.pcList}>
          {claims.map(c => {
            const catLabel = CATEGORIES.find(x => x.value === c.category)?.label ?? c.category;
            return (
              <div key={c.id} className={styles.pcCard}>
                <div className={styles.pcCardLeft}>
                  <div className={styles.pcIconWrap}><ReceiptPercentIcon width={18} /></div>
                  <div>
                    {tab === 'queue' && <p className={styles.pcClaimant}>{c.name}</p>}
                    <p className={styles.pcDesc}>{c.description}</p>
                    <p className={styles.pcMeta}>{fmtDate(c.date)} · {catLabel}</p>
                    {c.receiptUrl && (
                      <a href={c.receiptUrl} target="_blank" rel="noreferrer" className={styles.mcLink}
                        onClick={e => { if (isImageUrl(c.receiptUrl)) { e.preventDefault(); setLightbox(c.receiptUrl); } }}>
                        View receipt →
                      </a>
                    )}
                    {c.rejectionReason && <p className={styles.appReject}>Rejected: {c.rejectionReason}</p>}
                  </div>
                </div>
                <div className={styles.pcCardRight}>
                  <p className={styles.pcAmt}>{fmtAmt(c.amount)}</p>
                  {tab === 'queue' ? (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className={styles.approveBtn} onClick={() => approve(c)} disabled={saving}><CheckIcon width={13} /></button>
                      <button className={styles.rejectBtn} onClick={() => { setRejectId(c.id); setRejectNote(''); }} disabled={saving}><XMarkIcon width={13} /></button>
                    </div>
                  ) : (
                    <span className={[styles.statusBadge, styles[STATUS_STYLES[c.status] ?? 'statusdefault']].join(' ')}>
                      {c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New claim form */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.applyModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>New Petty Cash Claim</h3>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submit}>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}>
                  <label className={styles.formLbl}>Date</label>
                  <input type="date" className={styles.formInput} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
                </div>
                <div className={styles.formRow}>
                  <label className={styles.formLbl}>Category</label>
                  <select className={styles.formInput} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Description</label>
                <input className={styles.formInput} placeholder="e.g. Grab to Woodlands site" value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Amount (SGD)</label>
                <input type="number" min="0" step="0.01" className={styles.formInput} placeholder="0.00" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Receipt link <span className={styles.optional}>(optional)</span></label>
                <input type="url" className={styles.formInput} placeholder="Dropbox / Google Drive link" value={form.receiptUrl}
                  onChange={e => setForm(f => ({ ...f, receiptUrl: e.target.value }))} />
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Submitting…' : 'Submit Claim'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {lightbox && <FileLightbox url={lightbox} onClose={() => setLightbox(null)} />}

      {/* Reject modal */}
      {rejectId && (
        <div className={styles.modalOverlay} onClick={() => setRejectId(null)}>
          <div className={styles.rejectModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Reject Claim</h3>
            <p className={styles.rejectSubtitle}>Reason (required)</p>
            <textarea className={styles.formTextarea} rows={2} value={rejectNote}
              onChange={e => setRejectNote(e.target.value)} placeholder="e.g. Receipt not attached" />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setRejectId(null)}>Cancel</button>
              <button className={styles.rejectConfirmBtn} onClick={reject} disabled={saving}>{saving ? '…' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
