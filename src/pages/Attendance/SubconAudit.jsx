import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, orderBy, Timestamp } from 'firebase/firestore';
import { PlusIcon, CheckCircleIcon, ExclamationTriangleIcon, TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { todaySG, fmtDate } from '../../utils/attendanceUtils';
import styles from './Attendance.module.css';

const TEAMS = [
  { value: 'kvm',     label: 'KVM' },
  { value: 'sree',    label: 'Sree Ram' },
  { value: 'habibur', label: 'Habibur' },
  { value: 'alamin',  label: 'Alamin' },
];

export default function SubconAudit() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();

  const [view,     setView]     = useState('list'); // 'list' | 'new'
  const [audits,   setAudits]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [projects, setProjects] = useState([]);
  const [workers,  setWorkers]  = useState([]); // registered workers from registry

  // New audit form
  const [auditDate,    setAuditDate]    = useState(todaySG());
  const [auditProject, setAuditProject] = useState('');
  const [auditTeam,    setAuditTeam]    = useState('kvm');
  const [auditNotes,   setAuditNotes]   = useState('');
  const [entries,      setEntries]      = useState([{ name: '', workerId: '', registered: null }]);
  const [saving,       setSaving]       = useState(false);

  const isAdmin = can('attendance:manage');

  useEffect(() => {
    // Load audits + projects + registered workers
    Promise.all([
      getDocs(query(collection(db, 'siteAudits'), orderBy('date', 'desc'))),
      getDocs(collection(db, 'projects')),
      getDocs(collection(db, 'workers')),
    ]).then(([auditSnap, projSnap, workerSnap]) => {
      setAudits(auditSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setProjects(projSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setWorkers(workerSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }).catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const checkRegistered = (name, team) => {
    if (!name.trim()) return null;
    const nameLower = name.trim().toLowerCase();
    return workers.some(
      w => w.name.toLowerCase().includes(nameLower) && w.team === team && w.status !== 'inactive'
    );
  };

  const handleNameChange = (idx, value) => {
    const next = [...entries];
    next[idx] = { ...next[idx], name: value, registered: checkRegistered(value, auditTeam) };
    setEntries(next);
  };

  const addEntry = () => setEntries(e => [...e, { name: '', workerId: '', registered: null }]);
  const removeEntry = (idx) => setEntries(e => e.filter((_, i) => i !== idx));

  const saveAudit = async () => {
    if (!auditProject)    { toast.error('Please select a project.'); return; }
    const validEntries = entries.filter(e => e.name.trim());
    if (!validEntries.length) { toast.error('Add at least one worker.'); return; }

    setSaving(true);
    try {
      const project = projects.find(p => p.id === auditProject);
      const payload = {
        date: auditDate,
        projectId: auditProject,
        projectName: project?.name ?? '',
        team: auditTeam,
        conductedBy: userProfile.userId,
        conductedByName: userProfile.name,
        workers: validEntries.map(e => ({
          name: e.name.trim(),
          registered: checkRegistered(e.name, auditTeam),
        })),
        unregisteredCount: validEntries.filter(e => !checkRegistered(e.name, auditTeam)).length,
        notes: auditNotes.trim(),
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'siteAudits'), payload);
      setAudits(a => [{ id: ref.id, ...payload }, ...a]);
      toast.success('Audit saved');
      setView('list');
      setEntries([{ name: '', workerId: '', registered: null }]);
      setAuditNotes('');
    } catch {
      toast.error('Failed to save audit');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.panelLoading}><div className={styles.spinner} /></div>;

  if (view === 'new') {
    return (
      <div className={styles.auditFormWrap}>
        <div className={styles.auditFormHeader}>
          <h3 className={styles.auditFormTitle}>New Site Audit</h3>
          <button className={styles.cancelBtn} onClick={() => setView('list')}>Cancel</button>
        </div>

        <div className={styles.auditMeta}>
          <div className={styles.editRow}>
            <label className={styles.editLbl}>Date</label>
            <input type="date" className={styles.editInput} value={auditDate} onChange={e => setAuditDate(e.target.value)} />
          </div>
          <div className={styles.editRow}>
            <label className={styles.editLbl}>Project</label>
            <select className={styles.editInput} value={auditProject} onChange={e => setAuditProject(e.target.value)}>
              <option value="">Select project…</option>
              {projects.filter(p => p.status === 'active').map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.editRow}>
            <label className={styles.editLbl}>Sub-con team</label>
            <select className={styles.editInput} value={auditTeam} onChange={e => { setAuditTeam(e.target.value); setEntries([{ name: '', registered: null }]); }}>
              {TEAMS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>

        <p className={styles.auditWorkerLabel}>Workers present on site</p>
        <div className={styles.auditEntries}>
          {entries.map((e, idx) => (
            <div key={idx} className={styles.auditEntry}>
              <input
                className={styles.editInput}
                placeholder={`Worker ${idx + 1} name`}
                value={e.name}
                onChange={ev => handleNameChange(idx, ev.target.value)}
              />
              {e.name.trim() && (
                e.registered
                  ? <CheckCircleIcon width={18} className={styles.regOk} title="Registered" />
                  : <ExclamationTriangleIcon width={18} className={styles.regWarn} title="Not registered" />
              )}
              {entries.length > 1 && (
                <button className={styles.removeEntryBtn} onClick={() => removeEntry(idx)}>
                  <TrashIcon width={14} />
                </button>
              )}
            </div>
          ))}
          <button className={styles.addEntryBtn} onClick={addEntry}>
            <PlusIcon width={14} /> Add worker
          </button>
        </div>

        <div className={styles.editRow} style={{ marginTop: 16 }}>
          <label className={styles.editLbl}>Notes</label>
          <textarea className={styles.editTextarea} rows={2} placeholder="Optional remarks"
            value={auditNotes} onChange={e => setAuditNotes(e.target.value)} />
        </div>

        <div className={styles.auditLegend}>
          <span><CheckCircleIcon width={13} className={styles.regOk} /> Registered worker</span>
          <span><ExclamationTriangleIcon width={13} className={styles.regWarn} /> Not in registry — follow up</span>
        </div>

        <button className={styles.saveBtn} style={{ marginTop: 12 }} onClick={saveAudit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Audit'}
        </button>
      </div>
    );
  }

  return (
    <div className={styles.auditListWrap}>
      <div className={styles.auditListHeader}>
        <p className={styles.reviewInfo}>Periodic site headcount check — cross-referenced against the worker registry.</p>
        {isAdmin && (
          <button className={styles.newAuditBtn} onClick={() => setView('new')}>
            <PlusIcon width={15} /> New Audit
          </button>
        )}
      </div>

      {audits.length === 0 ? (
        <p className={styles.empty}>No audits recorded yet.</p>
      ) : (
        <div className={styles.auditCards}>
          {audits.map(audit => (
            <div key={audit.id} className={[styles.auditCard, audit.unregisteredCount > 0 ? styles.auditCardWarn : ''].join(' ')}>
              <div className={styles.auditCardTop}>
                <div>
                  <p className={styles.auditCardDate}>{fmtDate(audit.date)} — {audit.projectName}</p>
                  <p className={styles.auditCardMeta}>Team: {TEAMS.find(t => t.value === audit.team)?.label ?? audit.team} · By {audit.conductedByName}</p>
                </div>
                {audit.unregisteredCount > 0 && (
                  <span className={styles.unregBadge}>
                    <ExclamationTriangleIcon width={12} /> {audit.unregisteredCount} unregistered
                  </span>
                )}
              </div>
              <div className={styles.auditWorkerList}>
                {audit.workers?.map((w, i) => (
                  <span key={i} className={[styles.workerChip, w.registered === false ? styles.workerChipWarn : ''].join(' ')}>
                    {w.registered === false ? <ExclamationTriangleIcon width={11} /> : <CheckCircleIcon width={11} />}
                    {w.name}
                  </span>
                ))}
              </div>
              {audit.notes && <p className={styles.auditNotes}>{audit.notes}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
