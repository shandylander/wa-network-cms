import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { PlusIcon, XMarkIcon, ChevronDownIcon, ShieldExclamationIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDateTime, nowDateTimeInputSG } from '../../utils/helpers';
import styles from './IncidentReport.module.css';

const TYPES = [
  { value: 'near-miss',       label: 'Near Miss' },
  { value: 'first-aid',       label: 'First Aid Case' },
  { value: 'medical-leave',   label: 'Medical Leave' },
  { value: 'property-damage', label: 'Property Damage' },
  { value: 'other',           label: 'Other' },
];

const SEVERITIES = [
  { value: 'low',      label: 'Low' },
  { value: 'medium',   label: 'Medium' },
  { value: 'high',     label: 'High' },
  { value: 'critical', label: 'Critical' },
];

const STATUSES = [
  { value: 'open',          label: 'Open' },
  { value: 'investigating', label: 'Investigating' },
  { value: 'closed',        label: 'Closed' },
];

const TEAMS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

export default function IncidentReport({ project }) {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();
  const { toast }        = useToast();
  const canManage = can('approve:permits');

  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [filter,    setFilter]    = useState('open');
  const [expanded,  setExpanded]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [statusId,  setStatusId]  = useState(null);
  const [nextStatus, setNextStatus] = useState('investigating');
  const [followUp,   setFollowUp]   = useState('');

  const [form, setForm] = useState({
    dateTime: nowDateTimeInputSG(),
    location: '', type: 'near-miss', severity: 'low', description: '',
    involvedTeam: userProfile?.team ?? 'own', involvedWorkers: '', immediateAction: '',
  });

  useEffect(() => {
    getDocs(query(collection(db, 'projects', project.id, 'incidents'), orderBy('createdAt', 'desc')))
      .then(snap => setIncidents(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load incidents'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  const submitIncident = async (e) => {
    e.preventDefault();
    if (!form.description.trim() || !form.location.trim()) { toast.error('Please fill location and description.'); return; }
    setSaving(true);
    try {
      const payload = {
        dateTime: form.dateTime, location: form.location.trim(), type: form.type, severity: form.severity,
        description: form.description.trim(), involvedTeam: form.involvedTeam,
        involvedWorkers: form.involvedWorkers.trim(), immediateAction: form.immediateAction.trim(),
        status: 'open', followUpNotes: '',
        reportedBy: userProfile.userId, reportedByName: userProfile.name,
        createdAt: Timestamp.now(), closedBy: null, closedByName: null, closedAt: null,
      };
      const ref = await addDoc(collection(db, 'projects', project.id, 'incidents'), payload);
      setIncidents(i => [{ id: ref.id, ...payload }, ...i]);
      toast.success('Incident reported');
      setShowForm(false);
      setForm({ dateTime: nowDateTimeInputSG(), location: '', type: 'near-miss', severity: 'low', description: '', involvedTeam: userProfile?.team ?? 'own', involvedWorkers: '', immediateAction: '' });
    } catch { toast.error('Failed to report incident'); }
    finally { setSaving(false); }
  };

  const submitStatus = async () => {
    try {
      const update = { status: nextStatus, followUpNotes: followUp.trim() };
      if (nextStatus === 'closed') {
        update.closedBy = userProfile.userId; update.closedByName = userProfile.name; update.closedAt = Timestamp.now();
      }
      await updateDoc(doc(db, 'projects', project.id, 'incidents', statusId), update);
      setIncidents(i => i.map(x => x.id === statusId ? { ...x, ...update } : x));
      toast.success('Incident updated');
      setStatusId(null); setFollowUp('');
    } catch { toast.error('Failed to update incident'); }
  };

  const counts = Object.fromEntries(STATUSES.map(s => [s.value, incidents.filter(x => x.status === s.value).length]));
  const filtered = filter === 'all' ? incidents : incidents.filter(i => i.status === filter);

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <button className={[styles.filterBtn, filter === 'all' ? styles.active : ''].join(' ')} onClick={() => setFilter('all')}>All ({incidents.length})</button>
          {STATUSES.map(s => (
            <button key={s.value} className={[styles.filterBtn, filter === s.value ? styles.active : ''].join(' ')} onClick={() => setFilter(s.value)}>
              {s.label}{counts[s.value] ? ` (${counts[s.value]})` : ''}
            </button>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Report Incident</button>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} incidents.</p>
      ) : (
        <div className={styles.list}>
          {filtered.map(inc => {
            const isOpen = expanded === inc.id;
            return (
              <div key={inc.id} className={[styles.card, styles[`sev_${inc.severity}`]].join(' ')}>
                <div className={styles.head} onClick={() => setExpanded(isOpen ? null : inc.id)}>
                  <div className={styles.headLeft}>
                    <ShieldExclamationIcon width={15} className={styles.sevIcon} />
                    <span className={styles.typeBadge}>{TYPES.find(t => t.value === inc.type)?.label ?? inc.type}</span>
                    <span className={[styles.sevBadge, styles[`sevBadge_${inc.severity}`]].join(' ')}>{SEVERITIES.find(s => s.value === inc.severity)?.label}</span>
                    <p className={styles.desc}>{inc.description}</p>
                  </div>
                  <div className={styles.headRight}>
                    <span className={[styles.statusBadge, styles[`status_${inc.status}`]].join(' ')}>
                      {STATUSES.find(s => s.value === inc.status)?.label ?? inc.status}
                    </span>
                    <ChevronDownIcon width={14} className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} />
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.body}>
                    <div className={styles.details}>
                      <p><strong>Location:</strong> {inc.location}</p>
                      <p><strong>Date/time:</strong> {inc.dateTime?.replace('T', ' ')}</p>
                      {inc.involvedTeam && <p><strong>Team:</strong> {TEAMS[inc.involvedTeam] ?? inc.involvedTeam}</p>}
                      {inc.involvedWorkers && <p><strong>Workers involved:</strong> {inc.involvedWorkers}</p>}
                      {inc.immediateAction && <p><strong>Immediate action:</strong> {inc.immediateAction}</p>}
                      <p><strong>Reported by:</strong> {inc.reportedByName} · {formatDateTime(inc.createdAt)}</p>
                      {inc.followUpNotes && <p><strong>Follow-up:</strong> {inc.followUpNotes}</p>}
                      {inc.status === 'closed' && (
                        <p className={styles.closedLine}><CheckCircleIcon width={14} /> Closed by {inc.closedByName} · {formatDateTime(inc.closedAt)}</p>
                      )}
                    </div>
                    {canManage && inc.status !== 'closed' && (
                      <div className={styles.actions}>
                        {inc.status === 'open' && (
                          <button className={styles.investigateBtn} onClick={() => { setStatusId(inc.id); setNextStatus('investigating'); setFollowUp(''); }}>Start Investigation</button>
                        )}
                        <button className={styles.closeBtn} onClick={() => { setStatusId(inc.id); setNextStatus('closed'); setFollowUp(''); }}>Close Incident</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Report Incident</h3>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submitIncident}>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Date/Time</label>
                  <input type="datetime-local" className={styles.formInput} value={form.dateTime} onChange={e => setForm(f => ({ ...f, dateTime: e.target.value }))} /></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Location <span style={{color:'var(--red)'}}>*</span></label>
                  <input className={styles.formInput} placeholder="e.g. Blk 307, Level 5" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              </div>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Type</label>
                  <select className={styles.formInput} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Severity</label>
                  <select className={styles.formInput} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                    {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Description <span style={{color:'var(--red)'}}>*</span></label>
                <textarea className={styles.formTextarea} rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What happened" /></div>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Team Involved</label>
                  <select className={styles.formInput} value={form.involvedTeam} onChange={e => setForm(f => ({ ...f, involvedTeam: e.target.value }))}>
                    {Object.entries(TEAMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Workers Involved <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="Names" value={form.involvedWorkers} onChange={e => setForm(f => ({ ...f, involvedWorkers: e.target.value }))} /></div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Immediate Action Taken</label>
                <textarea className={styles.formTextarea} rows={2} value={form.immediateAction} onChange={e => setForm(f => ({ ...f, immediateAction: e.target.value }))} placeholder="e.g. First aid administered, area cordoned off" /></div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Submitting…' : 'Submit Report'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {statusId && (
        <div className={styles.modalOverlay} onClick={() => setStatusId(null)}>
          <div className={styles.modal} style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>{nextStatus === 'closed' ? 'Close Incident' : 'Start Investigation'}</h3>
            <p className={styles.signHint}>{nextStatus === 'closed' ? 'Add closing notes / corrective actions taken.' : 'Add investigation notes (optional).'}</p>
            <textarea className={styles.formTextarea} rows={3} value={followUp} onChange={e => setFollowUp(e.target.value)} placeholder="Notes" style={{ marginTop: 8 }} />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setStatusId(null)}>Cancel</button>
              <button className={nextStatus === 'closed' ? styles.closeBtn : styles.investigateBtn} onClick={submitStatus}>
                {nextStatus === 'closed' ? 'Confirm Close' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
