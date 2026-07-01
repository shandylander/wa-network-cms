import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { PlusIcon, XMarkIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/helpers';
import styles from './SnagList.module.css';

const SEVERITIES = [
  { value: 'low',      label: 'Low',      color: '#1a8a5a' },
  { value: 'medium',   label: 'Medium',   color: '#d97b00' },
  { value: 'high',     label: 'High',     color: '#CC0000' },
  { value: 'critical', label: 'Critical', color: '#7c1818' },
];

const STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
];

const TEAMS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

export default function SnagList({ project }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const isAdmin = ['owner','manager','supervisor'].includes(userProfile?.role);

  const [snags,     setSnags]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [filter,    setFilter]    = useState('open');
  const [expanded,  setExpanded]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [resolveId, setResolveId] = useState(null);
  const [resolveNote, setResolveNote] = useState('');

  const [form, setForm] = useState({
    blockNo: '', location: '', type: '', description: '', severity: 'medium',
    assignedTeam: userProfile?.team ?? 'own',
  });

  useEffect(() => {
    getDocs(query(collection(db, 'projects', project.id, 'snags'), orderBy('reportedAt', 'desc')))
      .then(snap => setSnags(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load snags'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  const submitSnag = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { toast.error('Please enter a description.'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form, blockNo: form.blockNo.trim(), location: form.location.trim(),
        type: form.type.trim(), description: form.description.trim(),
        status: 'open',
        reportedBy: userProfile.userId, reportedByName: userProfile.name,
        reportedAt: Timestamp.now(),
        resolvedBy: null, resolvedAt: null, resolutionNote: null,
      };
      const ref = await addDoc(collection(db, 'projects', project.id, 'snags'), payload);
      setSnags(s => [{ id: ref.id, ...payload }, ...s]);
      toast.success('Snag logged');
      setShowForm(false);
      setForm({ blockNo: '', location: '', type: '', description: '', severity: 'medium', assignedTeam: userProfile?.team ?? 'own' });
    } catch { toast.error('Failed to log snag'); }
    finally { setSaving(false); }
  };

  const updateStatus = async (snag, status) => {
    try {
      const update = { status };
      if (status === 'resolved' || status === 'closed') {
        update.resolvedBy = userProfile.userId;
        update.resolvedAt = Timestamp.now();
        update.resolutionNote = resolveNote.trim() || null;
      }
      await updateDoc(doc(db, 'projects', project.id, 'snags', snag.id), update);
      setSnags(s => s.map(x => x.id === snag.id ? { ...x, ...update } : x));
      toast.success(`Snag marked as ${status}`);
      setResolveId(null); setResolveNote('');
    } catch { toast.error('Failed to update status'); }
  };

  const counts = Object.fromEntries(STATUSES.map(s => [s.value, snags.filter(x => x.status === s.value).length]));
  const filtered = filter === 'all' ? snags : snags.filter(s => s.status === filter);

  const sevInfo = (v) => SEVERITIES.find(s => s.value === v) ?? SEVERITIES[1];

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <button className={[styles.filterBtn, filter === 'all' ? styles.active : ''].join(' ')} onClick={() => setFilter('all')}>All ({snags.length})</button>
          {STATUSES.map(s => (
            <button key={s.value} className={[styles.filterBtn, filter === s.value ? styles.active : ''].join(' ')} onClick={() => setFilter(s.value)}>
              {s.label}{counts[s.value] ? ` (${counts[s.value]})` : ''}
            </button>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Log Snag</button>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} snags.</p>
      ) : (
        <div className={styles.snagList}>
          {filtered.map(snag => {
            const sev = sevInfo(snag.severity);
            const isOpen = expanded === snag.id;
            return (
              <div key={snag.id} className={styles.snagCard} style={{ borderLeft: `3px solid ${sev.color}` }}>
                <div className={styles.snagHead} onClick={() => setExpanded(isOpen ? null : snag.id)}>
                  <div className={styles.snagHeadLeft}>
                    <span className={styles.sevBadge} style={{ background: sev.color }}>{sev.label}</span>
                    {snag.blockNo && <span className={styles.blockTag}>Blk {snag.blockNo}</span>}
                    <p className={styles.snagDesc}>{snag.description}</p>
                  </div>
                  <div className={styles.snagHeadRight}>
                    <span className={[styles.statusBadge, styles[`status_${snag.status.replace('-','_')}`]].join(' ')}>
                      {STATUSES.find(s => s.value === snag.status)?.label ?? snag.status}
                    </span>
                    <ChevronDownIcon width={14} className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} />
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.snagBody}>
                    <div className={styles.snagDetails}>
                      {snag.location    && <p><strong>Location:</strong> {snag.location}</p>}
                      {snag.type        && <p><strong>Type:</strong> {snag.type}</p>}
                      {snag.assignedTeam && <p><strong>Assigned:</strong> {TEAMS[snag.assignedTeam] ?? snag.assignedTeam}</p>}
                      <p><strong>Reported by:</strong> {snag.reportedByName} · {formatDate(snag.reportedAt)}</p>
                      {snag.resolvedAt  && <p><strong>Resolved:</strong> {formatDate(snag.resolvedAt)}{snag.resolutionNote ? ` — ${snag.resolutionNote}` : ''}</p>}
                    </div>
                    {isAdmin && snag.status === 'open' && (
                      <div className={styles.snagActions}>
                        <button className={styles.progressBtn} onClick={() => updateStatus(snag, 'in-progress')}>Mark In Progress</button>
                        <button className={styles.resolveBtn} onClick={() => { setResolveId(snag.id); setResolveNote(''); }}>Resolve</button>
                      </div>
                    )}
                    {isAdmin && snag.status === 'in-progress' && (
                      <div className={styles.snagActions}>
                        <button className={styles.resolveBtn} onClick={() => { setResolveId(snag.id); setResolveNote(''); }}>Mark Resolved</button>
                      </div>
                    )}
                    {isAdmin && snag.status === 'resolved' && (
                      <div className={styles.snagActions}>
                        <button className={styles.closeBtn} onClick={() => updateStatus(snag, 'closed')}>Close Snag</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log snag modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Log New Snag</h3>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submitSnag}>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Block No. <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="e.g. 307" value={form.blockNo} onChange={e => setForm(f => ({ ...f, blockNo: e.target.value }))} /></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Location</label>
                  <input className={styles.formInput} placeholder="e.g. Level 3 corridor" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Defect Type</label>
                <input className={styles.formInput} placeholder="e.g. Cable not secured, Camera misaligned" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} /></div>
              <div className={styles.formRow}><label className={styles.formLbl}>Description <span style={{color:'var(--red)'}}>*</span></label>
                <textarea className={styles.formTextarea} rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the defect in detail" /></div>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Severity</label>
                  <select className={styles.formInput} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                    {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Assign to</label>
                  <select className={styles.formInput} value={form.assignedTeam} onChange={e => setForm(f => ({ ...f, assignedTeam: e.target.value }))}>
                    {Object.entries(TEAMS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Saving…' : 'Log Snag'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve modal */}
      {resolveId && (
        <div className={styles.modalOverlay} onClick={() => setResolveId(null)}>
          <div className={styles.modal} style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Resolution Note</h3>
            <textarea className={styles.formTextarea} rows={3} value={resolveNote}
              onChange={e => setResolveNote(e.target.value)} placeholder="Brief description of how it was resolved (optional)" />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setResolveId(null)}>Cancel</button>
              <button className={styles.resolveBtn} onClick={() => updateStatus(snags.find(s => s.id === resolveId), 'resolved')}>Confirm Resolved</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
