import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { PlusIcon, XMarkIcon, ChevronDownIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate, formatDateTime, todayInputSG } from '../../utils/helpers';
import styles from './Permits.module.css';

const TYPES = [
  { value: 'general', label: 'General PTW' },
  { value: 'wah',      label: 'Working at Height' },
];

const STATUSES = [
  { value: 'pending',  label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const HAZARDS = [
  'Working at height', 'Electrical', 'Confined space', 'Hot work',
  'Manual handling', 'Moving machinery', 'Public traffic', 'Others',
];

const TEAMS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

export default function Permits({ project }) {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();
  const { toast }        = useToast();
  const canApprove = can('approve:permits');

  const [permits,  setPermits]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filter,   setFilter]   = useState('pending');
  const [expanded, setExpanded] = useState(null);
  const [saving,   setSaving]   = useState(false);
  const [decisionId, setDecisionId] = useState(null);
  const [decision,    setDecision]  = useState('approved');
  const [signature,   setSignature] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const [form, setForm] = useState({
    type: 'general', blockNo: '', location: '', workDescription: '',
    validDate: todayInputSG(),
    hazards: [], controls: '', team: userProfile?.team ?? 'own',
  });

  useEffect(() => {
    getDocs(query(collection(db, 'projects', project.id, 'permits'), orderBy('createdAt', 'desc')))
      .then(snap => setPermits(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load permits'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  const toggleHazard = (h) => setForm(f => ({
    ...f, hazards: f.hazards.includes(h) ? f.hazards.filter(x => x !== h) : [...f.hazards, h],
  }));

  const submitPermit = async (e) => {
    e.preventDefault();
    if (!form.workDescription.trim() || !form.location.trim()) { toast.error('Please fill location and work description.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        blockNo: form.blockNo.trim(), location: form.location.trim(), workDescription: form.workDescription.trim(),
        controls: form.controls.trim(),
        status: 'pending',
        requestedBy: userProfile.userId, requestedByName: userProfile.name,
        createdAt: Timestamp.now(),
        approvedBy: null, approvedByName: null, approvedAt: null, signature: null, rejectionReason: null,
      };
      const ref = await addDoc(collection(db, 'projects', project.id, 'permits'), payload);
      setPermits(p => [{ id: ref.id, ...payload }, ...p]);
      toast.success('Permit submitted for approval');
      setShowForm(false);
      setForm({ type: 'general', blockNo: '', location: '', workDescription: '', validDate: todayInputSG(), hazards: [], controls: '', team: userProfile?.team ?? 'own' });
    } catch { toast.error('Failed to submit permit'); }
    finally { setSaving(false); }
  };

  const submitDecision = async () => {
    if (decision === 'approved' && !signature.trim()) { toast.error('Type your full name to sign and approve.'); return; }
    if (decision === 'rejected' && !rejectReason.trim()) { toast.error('Please provide a rejection reason.'); return; }
    try {
      const update = {
        status: decision,
        approvedBy: userProfile.userId, approvedByName: userProfile.name,
        approvedAt: Timestamp.now(),
        signature: decision === 'approved' ? signature.trim() : null,
        rejectionReason: decision === 'rejected' ? rejectReason.trim() : null,
      };
      await updateDoc(doc(db, 'projects', project.id, 'permits', decisionId), update);
      setPermits(p => p.map(x => x.id === decisionId ? { ...x, ...update } : x));
      toast.success(`Permit ${decision}`);
      setDecisionId(null); setSignature(''); setRejectReason('');
    } catch { toast.error('Failed to record decision'); }
  };

  const counts = Object.fromEntries(STATUSES.map(s => [s.value, permits.filter(x => x.status === s.value).length]));
  const filtered = filter === 'all' ? permits : permits.filter(p => p.status === filter);

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <button className={[styles.filterBtn, filter === 'all' ? styles.active : ''].join(' ')} onClick={() => setFilter('all')}>All ({permits.length})</button>
          {STATUSES.map(s => (
            <button key={s.value} className={[styles.filterBtn, filter === s.value ? styles.active : ''].join(' ')} onClick={() => setFilter(s.value)}>
              {s.label}{counts[s.value] ? ` (${counts[s.value]})` : ''}
            </button>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Request PTW</button>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} permits.</p>
      ) : (
        <div className={styles.permitList}>
          {filtered.map(permit => {
            const isOpen = expanded === permit.id;
            return (
              <div key={permit.id} className={[styles.permitCard, styles[`border_${permit.status}`]].join(' ')}>
                <div className={styles.permitHead} onClick={() => setExpanded(isOpen ? null : permit.id)}>
                  <div className={styles.permitHeadLeft}>
                    <span className={styles.typeBadge}>{TYPES.find(t => t.value === permit.type)?.label ?? permit.type}</span>
                    {permit.blockNo && <span className={styles.blockTag}>Blk {permit.blockNo}</span>}
                    <p className={styles.permitDesc}>{permit.workDescription}</p>
                  </div>
                  <div className={styles.permitHeadRight}>
                    <span className={[styles.statusBadge, styles[`status_${permit.status}`]].join(' ')}>
                      {STATUSES.find(s => s.value === permit.status)?.label ?? permit.status}
                    </span>
                    <ChevronDownIcon width={14} className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} />
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.permitBody}>
                    <div className={styles.permitDetails}>
                      <p><strong>Location:</strong> {permit.location}</p>
                      {permit.team && <p><strong>Team:</strong> {TEAMS[permit.team] ?? permit.team}</p>}
                      <p><strong>Valid for:</strong> {permit.validDate}</p>
                      {permit.hazards?.length > 0 && <p><strong>Hazards:</strong> {permit.hazards.join(', ')}</p>}
                      {permit.controls && <p><strong>Controls:</strong> {permit.controls}</p>}
                      <p><strong>Requested by:</strong> {permit.requestedByName} · {formatDateTime(permit.createdAt)}</p>
                      {permit.status === 'approved' && (
                        <p className={styles.signedLine}><ShieldCheckIcon width={14} /> Signed &amp; approved by {permit.approvedByName} ("{permit.signature}") · {formatDate(permit.approvedAt)}</p>
                      )}
                      {permit.status === 'rejected' && (
                        <p><strong>Rejected by:</strong> {permit.approvedByName} — {permit.rejectionReason}</p>
                      )}
                    </div>
                    {canApprove && permit.status === 'pending' && (
                      <div className={styles.permitActions}>
                        <button className={styles.rejectBtn} onClick={() => { setDecisionId(permit.id); setDecision('rejected'); setRejectReason(''); }}>Reject</button>
                        <button className={styles.approveBtn} onClick={() => { setDecisionId(permit.id); setDecision('approved'); setSignature(''); }}>Approve &amp; Sign</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Request modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Request Permit-to-Work</h3>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submitPermit}>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Permit Type</label>
                  <select className={styles.formInput} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Valid Date</label>
                  <input type="date" className={styles.formInput} value={form.validDate} onChange={e => setForm(f => ({ ...f, validDate: e.target.value }))} /></div>
              </div>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Block No. <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="e.g. 307" value={form.blockNo} onChange={e => setForm(f => ({ ...f, blockNo: e.target.value }))} /></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Location <span style={{color:'var(--red)'}}>*</span></label>
                  <input className={styles.formInput} placeholder="e.g. Rooftop, Level 12" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Work Description <span style={{color:'var(--red)'}}>*</span></label>
                <textarea className={styles.formTextarea} rows={2} value={form.workDescription} onChange={e => setForm(f => ({ ...f, workDescription: e.target.value }))} placeholder="What work will be carried out" /></div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Hazards Identified</label>
                <div className={styles.hazardGrid}>
                  {HAZARDS.map(h => (
                    <label key={h} className={styles.hazardChip}>
                      <input type="checkbox" checked={form.hazards.includes(h)} onChange={() => toggleHazard(h)} />
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Control Measures</label>
                <textarea className={styles.formTextarea} rows={2} value={form.controls} onChange={e => setForm(f => ({ ...f, controls: e.target.value }))} placeholder="e.g. Full body harness, double lanyard, exclusion zone" /></div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Submitting…' : 'Submit for Approval'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Decision modal */}
      {decisionId && (
        <div className={styles.modalOverlay} onClick={() => setDecisionId(null)}>
          <div className={styles.modal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{decision === 'approved' ? 'Approve & Sign' : 'Reject Permit'}</h3>
            {decision === 'approved' ? (
              <>
                <p className={styles.signHint}>Type your full name below to digitally sign and approve this permit.</p>
                <input className={styles.formInput} placeholder="Full name" value={signature} onChange={e => setSignature(e.target.value)} style={{ marginTop: 8 }} />
              </>
            ) : (
              <textarea className={styles.formTextarea} rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection" style={{ marginTop: 8 }} />
            )}
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDecisionId(null)}>Cancel</button>
              <button className={decision === 'approved' ? styles.approveBtn : styles.rejectBtn} onClick={submitDecision}>
                {decision === 'approved' ? 'Confirm Approval' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
