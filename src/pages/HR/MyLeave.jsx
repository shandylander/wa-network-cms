import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp,
} from 'firebase/firestore';
import { PlusIcon, XMarkIcon, ArrowUpTrayIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  DEFAULT_AL, DEFAULT_MC, DEFAULT_CCL, DEFAULT_HL, DEFAULT_CARRY_FORWARD_EXPIRY_MONTH,
} from '../../utils/leaveDefaults';
import { formatDateTime } from '../../utils/helpers';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import styles from './HR.module.css';

const LEAVE_TYPES = [
  { value: 'AL',  label: 'Annual Leave',        color: 'blue'   },
  { value: 'MC',  label: 'Medical Leave',       color: 'green'  },
  { value: 'CCL', label: 'Childcare Leave',     color: 'navy'   },
  { value: 'HL',  label: 'Hospitalisation Leave', color: 'red'  },
  { value: 'NPL', label: 'No-Pay Leave',         color: 'amber'  },
  { value: 'OIL', label: 'Off-in-Lieu',          color: 'purple' },
];

// Types that track an entitlement (balance shrinks as applications are
// approved/pending). NPL and OIL remain no-entitlement types, as before.
const ENTITLED_TYPES = ['AL', 'MC', 'CCL', 'HL'];

const STATUS_COLORS = {
  pending:  'amber',
  approved: 'green',
  rejected: 'red',
  cancelled:'default',
};

const calcDays = (from, to, halfDay) => {
  if (halfDay) return 0.5;
  if (!from || !to) return 0;
  const diff = Math.floor((new Date(to) - new Date(from)) / 86400000) + 1;
  return Math.max(1, diff);
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

export default function MyLeave() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const userId  = userProfile?.userId;
  const year    = new Date().getFullYear();

  const [entitlement, setEntitlement] = useState({
    al: DEFAULT_AL, mc: DEFAULT_MC, ccl: DEFAULT_CCL, hl: DEFAULT_HL,
    carryForwardDays: 0, carryForwardExpiryMonth: DEFAULT_CARRY_FORWARD_EXPIRY_MONTH,
  });
  const [apps,        setApps]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);

  // Apply form state
  const [form, setForm] = useState({ type: 'AL', dateFrom: '', dateTo: '', halfDay: false, halfDayPeriod: 'AM', reason: '', mcUrl: '', mcFileName: '' });
  const [submitting, setSubmitting] = useState(false);
  const [mcUploading, setMcUploading] = useState(false);

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [entSnap, appSnap] = await Promise.all([
        getDocs(query(collection(db, 'leaveEntitlements'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'leaveApplications'), where('userId', '==', userId), where('year', '==', year))),
      ]);
      if (!entSnap.empty) {
        const ent = entSnap.docs[0].data();
        setEntitlement({
          al: ent.al ?? DEFAULT_AL, mc: ent.mc ?? DEFAULT_MC,
          ccl: ent.ccl ?? DEFAULT_CCL, hl: ent.hl ?? DEFAULT_HL,
          carryForwardDays: ent.carryForwardDays ?? 0,
          carryForwardExpiryMonth: ent.carryForwardExpiryMonth ?? DEFAULT_CARRY_FORWARD_EXPIRY_MONTH,
        });
      }
      const sorted = appSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setApps(sorted);
    } catch { toast.error('Failed to load leave data'); }
    finally { setLoading(false); }
  }, [userId, year, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  // Compute usage from approved + pending apps
  const used = (type, statuses = ['approved']) =>
    apps.filter(a => a.type === type && statuses.includes(a.status))
        .reduce((s, a) => s + (a.days ?? 0), 0);

  // Carried-forward AL lapses after carryForwardExpiryMonth of the current year.
  const currentMonth = new Date().getMonth() + 1;
  const carryActive = (entitlement.carryForwardDays ?? 0) > 0
    && currentMonth <= (entitlement.carryForwardExpiryMonth ?? DEFAULT_CARRY_FORWARD_EXPIRY_MONTH);
  const carriedAl = carryActive ? entitlement.carryForwardDays : 0;

  const balance = {
    al:  { entitled: (entitlement.al ?? 0) + carriedAl, used: used('AL'), pending: used('AL', ['pending']), carried: carriedAl },
    mc:  { entitled: entitlement.mc ?? 0, used: used('MC'), pending: used('MC', ['pending']) },
    ccl: { entitled: entitlement.ccl ?? 0, used: used('CCL'), pending: used('CCL', ['pending']) },
    hl:  { entitled: entitlement.hl ?? 0, used: used('HL'), pending: used('HL', ['pending']) },
    npl: { used: used('NPL') + used('NPL', ['pending']) },
    oil: { used: used('OIL'), pending: used('OIL', ['pending']) },
  };

  const handleMcUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMcUploading(true);
    try {
      const url = await uploadToDropbox(file, `/WA! Network Asia CMS/Staff/Leave/${userId}`);
      setForm(f => ({ ...f, mcUrl: url, mcFileName: file.name }));
      toast.success('Certificate uploaded');
    } catch { toast.error('Failed to upload certificate'); }
    finally { setMcUploading(false); }
  };

  const handleApply = async (e) => {
    e.preventDefault();
    if (!form.dateFrom)             { toast.error('Please select a start date.'); return; }
    if (!form.halfDay && !form.dateTo) { toast.error('Please select an end date.'); return; }
    if (!form.reason.trim())        { toast.error('Please enter a reason.'); return; }

    const days = calcDays(form.dateFrom, form.dateTo || form.dateFrom, form.halfDay);

    // Balance check for entitled types (AL, MC, CCL, HL)
    if (ENTITLED_TYPES.includes(form.type)) {
      const b = balance[form.type.toLowerCase()];
      const remaining = b.entitled - b.used - b.pending;
      if (days > remaining) { toast.error(`Insufficient ${form.type} balance. Remaining: ${remaining} days.`); return; }
    }

    setSubmitting(true);
    try {
      const payload = {
        userId, name: userProfile.name, team: userProfile.team ?? '',
        type: form.type,
        dateFrom: form.dateFrom,
        dateTo: form.halfDay ? form.dateFrom : form.dateTo,
        days,
        halfDay: form.halfDay,
        halfDayPeriod: form.halfDay ? form.halfDayPeriod : null,
        reason: form.reason.trim(),
        mcUrl: (form.type === 'MC' || form.type === 'HL') ? (form.mcUrl.trim() || null) : null,
        status: 'pending',
        reviewedBy: null, reviewedAt: null, rejectionReason: null,
        year,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'leaveApplications'), payload);
      setApps(a => [{ id: ref.id, ...payload }, ...a]);

      // Notify management of the leave request (non-fatal)
      const typeLbl = LEAVE_TYPES.find(t => t.value === form.type)?.label ?? form.type;
      const dateRange = form.halfDay
        ? `${fmtDate(form.dateFrom)} (${form.halfDayPeriod} half)`
        : form.dateTo && form.dateTo !== form.dateFrom
          ? `${fmtDate(form.dateFrom)} – ${fmtDate(form.dateTo)}`
          : fmtDate(form.dateFrom);
      addDoc(collection(db, 'announcements'), {
        message: `Leave request: ${userProfile.name} — ${typeLbl}, ${dateRange} (${days} day${days !== 1 ? 's' : ''})`,
        severity: 'info', audience: ['management'],
        createdBy: userProfile.userId, createdByName: userProfile.name,
        createdAt: Timestamp.now(), readBy: [],
        isSystemNotification: true, link: '/leave', leaveId: ref.id,
      }).catch(() => {});

      toast.success('Leave application submitted');
      setShowModal(false);
      setForm({ type: 'AL', dateFrom: '', dateTo: '', halfDay: false, halfDayPeriod: 'AM', reason: '', mcUrl: '', mcFileName: '' });
    } catch { toast.error('Failed to submit application'); }
    finally { setSubmitting(false); }
  };

  const handleCancel = async (app) => {
    if (app.status !== 'pending') return;
    try {
      await updateDoc(doc(db, 'leaveApplications', app.id), { status: 'cancelled' });
      setApps(a => a.map(x => x.id === app.id ? { ...x, status: 'cancelled' } : x));
      toast.success('Application cancelled');
    } catch { toast.error('Failed to cancel'); }
  };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.myLeaveWrap}>
      {/* Balance cards */}
      <div className={styles.balanceGrid}>
        <BalanceCard label="Annual Leave" color="blue"
          entitled={balance.al.entitled} used={balance.al.used} pending={balance.al.pending} carried={balance.al.carried} />
        <BalanceCard label="Medical Leave" color="green"
          entitled={balance.mc.entitled} used={balance.mc.used} pending={balance.mc.pending} />
        <BalanceCard label="Childcare Leave" color="navy"
          entitled={balance.ccl.entitled} used={balance.ccl.used} pending={balance.ccl.pending} />
        <BalanceCard label="Hospitalisation Leave" color="red"
          entitled={balance.hl.entitled} used={balance.hl.used} pending={balance.hl.pending} />
        <div className={styles.balanceCard}>
          <p className={styles.balanceLbl}>No-Pay Leave</p>
          <p className={styles.balanceNum} style={{ color: 'var(--amber)' }}>{balance.npl.used}<span className={styles.balanceUnit}> days taken</span></p>
        </div>
        <div className={styles.balanceCard}>
          <p className={styles.balanceLbl}>Off-in-Lieu</p>
          <p className={styles.balanceNum} style={{ color: 'var(--purple)' }}>{balance.oil.pending + balance.oil.used}<span className={styles.balanceUnit}> days pending/used</span></p>
        </div>
      </div>

      {/* Apply button */}
      <div className={styles.applyHeader}>
        <p className={styles.sectionTitle}>My Applications — {year}</p>
        <button className={styles.applyBtn} onClick={() => setShowModal(true)}>
          <PlusIcon width={15} /> Apply Leave
        </button>
      </div>

      {/* History */}
      {apps.length === 0 ? (
        <p className={styles.empty}>No leave applications for {year}.</p>
      ) : (
        <div className={styles.appList}>
          {apps.map(app => {
            const typeInfo = LEAVE_TYPES.find(t => t.value === app.type);
            return (
              <div key={app.id} className={styles.appCard}>
                <div className={styles.appCardLeft}>
                  <span className={[styles.typeBadge, styles[`type${app.type}`]].join(' ')}>{app.type}</span>
                  <div>
                    <p className={styles.appDates}>
                      {fmtDate(app.dateFrom)}{app.dateTo !== app.dateFrom ? ` – ${fmtDate(app.dateTo)}` : ''}
                      {app.halfDay ? ` (${app.halfDayPeriod} half-day)` : ` · ${app.days}d`}
                    </p>
                    <p className={styles.appReason}>{app.reason}</p>
                    {app.rejectionReason && <p className={styles.appReject}>Rejected: {app.rejectionReason}</p>}
                    {app.status !== 'pending' && app.reviewedByName && (
                      <p className={styles.appReason}>
                        {app.status === 'approved' ? 'Approved' : 'Rejected'} by {app.reviewedByName} · {formatDateTime(app.reviewedAt)}
                      </p>
                    )}
                  </div>
                </div>
                <div className={styles.appCardRight}>
                  <span className={[styles.statusBadge, styles[`status${STATUS_COLORS[app.status]}`]].join(' ')}>
                    {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
                  </span>
                  {app.status === 'pending' && (
                    <button className={styles.cancelAppBtn} onClick={() => handleCancel(app)} title="Cancel application">
                      <XMarkIcon width={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Apply modal */}
      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.applyModal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Apply for Leave</h3>
              <button className={styles.modalClose} onClick={() => setShowModal(false)}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={handleApply}>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Leave Type</label>
                <div className={styles.typeSelector}>
                  {LEAVE_TYPES.map(t => (
                    <button key={t.value} type="button"
                      className={[styles.typeBtn, form.type === t.value ? styles.typeBtnActive : ''].join(' ')}
                      onClick={() => setForm(f => ({ ...f, type: t.value }))}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className={styles.formRowGroup}>
                <div className={styles.formRow}>
                  <label className={styles.formLbl}>{form.halfDay ? 'Date' : 'From'}</label>
                  <input type="date" className={styles.formInput} value={form.dateFrom}
                    onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} required />
                </div>
                {!form.halfDay && (
                  <div className={styles.formRow}>
                    <label className={styles.formLbl}>To</label>
                    <input type="date" className={styles.formInput} value={form.dateTo}
                      min={form.dateFrom}
                      onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} required />
                  </div>
                )}
              </div>

              <div className={styles.formRow}>
                <label className={styles.formCheck}>
                  <input type="checkbox" checked={form.halfDay}
                    onChange={e => setForm(f => ({ ...f, halfDay: e.target.checked, dateTo: '' }))} />
                  Half-day leave
                </label>
                {form.halfDay && (
                  <div className={styles.halfDayPicker}>
                    {['AM', 'PM'].map(p => (
                      <button key={p} type="button"
                        className={[styles.typeBtn, form.halfDayPeriod === p ? styles.typeBtnActive : ''].join(' ')}
                        onClick={() => setForm(f => ({ ...f, halfDayPeriod: p }))}>
                        {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {form.dateFrom && (
                <p className={styles.daysPreview}>
                  = {calcDays(form.dateFrom, form.dateTo || form.dateFrom, form.halfDay)} day(s)
                </p>
              )}

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Reason</label>
                <textarea className={styles.formTextarea} rows={2} value={form.reason}
                  onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder={form.type === 'MC' ? 'e.g. Fever and flu' : form.type === 'HL' ? 'e.g. Admitted for surgery' : 'Brief reason'} />
              </div>

              {(form.type === 'MC' || form.type === 'HL') && (
                <div className={styles.formRow}>
                  <label className={styles.formLbl}>
                    {form.type === 'HL' ? 'Hospitalisation certificate' : 'MC certificate'} <span className={styles.optional}>(optional)</span>
                  </label>
                  <label className={styles.uploadCertBtn}>
                    <ArrowUpTrayIcon width={14} />
                    {mcUploading ? 'Uploading…' : form.mcFileName ? 'Replace file' : 'Upload photo / PDF'}
                    <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
                      disabled={mcUploading} onChange={handleMcUpload} />
                  </label>
                  {form.mcUrl && !mcUploading && (
                    <p className={styles.uploadCertDone}>
                      <CheckCircleIcon width={14} /> {form.mcFileName || 'Certificate attached'}
                    </p>
                  )}
                  <input type="url" className={styles.formInput} value={form.mcUrl}
                    style={{ marginTop: 6 }}
                    onChange={e => setForm(f => ({ ...f, mcUrl: e.target.value, mcFileName: '' }))}
                    placeholder="…or paste a Dropbox / Google Drive link" />
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                  {submitting ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BalanceCard({ label, color, entitled, used, pending, carried = 0 }) {
  const remaining = entitled - used - pending;
  const pct = entitled > 0 ? Math.min(100, Math.round((used / entitled) * 100)) : 0;
  return (
    <div className={styles.balanceCard}>
      <p className={styles.balanceLbl}>{label}</p>
      <p className={styles.balanceNum} style={{ color: `var(--${color})` }}>
        {remaining}<span className={styles.balanceUnit}> / {entitled}d left</span>
      </p>
      <div className={styles.balanceBar}>
        <div className={styles.balanceBarFill} style={{ width: `${pct}%`, background: `var(--${color})` }} />
        {pending > 0 && (
          <div className={styles.balanceBarPending} style={{ width: `${Math.min(100 - pct, Math.round((pending / entitled) * 100))}%` }} />
        )}
      </div>
      <p className={styles.balanceMeta}>
        {used}d used{pending > 0 ? ` · ${pending}d pending` : ''}{carried > 0 ? ` · incl. ${carried}d carried` : ''}
      </p>
    </div>
  );
}
