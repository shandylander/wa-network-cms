import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { PlusIcon, XMarkIcon, ChevronDownIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDate, todayInputSG } from '../../utils/helpers';
import styles from './ToolboxMeeting.module.css';

const TEAMS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

export default function ToolboxMeeting({ project }) {
  const { userProfile } = useAuth();
  const { toast }        = useToast();
  const isAdmin = ['owner', 'manager', 'supervisor'].includes(userProfile?.role);

  const [meetings, setMeetings] = useState([]);
  const [workers,  setWorkers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [saving,   setSaving]   = useState(false);

  const defaultTeam = userProfile?.team && userProfile.team !== 'none' ? userProfile.team : 'own';
  const [form, setForm] = useState({
    date: todayInputSG(),
    topic: '', location: '', team: defaultTeam, attendeeIds: [], notes: '',
  });

  useEffect(() => {
    Promise.all([
      getDocs(query(collection(db, 'projects', project.id, 'toolboxMeetings'), orderBy('date', 'desc'))),
      getDocs(collection(db, 'workers')),
    ]).then(([mSnap, wSnap]) => {
      setMeetings(mSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setWorkers(wSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(w => w.status === 'active'));
    }).catch(() => toast.error('Failed to load toolbox meetings'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  const teamWorkers = workers.filter(w => w.team === form.team);

  const toggleAttendee = (id) => setForm(f => ({
    ...f, attendeeIds: f.attendeeIds.includes(id) ? f.attendeeIds.filter(x => x !== id) : [...f.attendeeIds, id],
  }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.topic.trim()) { toast.error('Please enter the topic discussed.'); return; }
    setSaving(true);
    try {
      const payload = {
        date: form.date, topic: form.topic.trim(), location: form.location.trim(),
        team: form.team, attendeeIds: form.attendeeIds, notes: form.notes.trim(),
        conductedBy: userProfile.userId, conductedByName: userProfile.name,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'projects', project.id, 'toolboxMeetings'), payload);
      setMeetings(m => [{ id: ref.id, ...payload }, ...m]);
      toast.success('Toolbox meeting logged');
      setShowForm(false);
      setForm({ date: todayInputSG(), topic: '', location: '', team: defaultTeam, attendeeIds: [], notes: '' });
    } catch { toast.error('Failed to log meeting'); }
    finally { setSaving(false); }
  };

  const visibleMeetings = isAdmin ? meetings : meetings.filter(m => m.team === userProfile?.team);

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <p className={styles.toolbarHint}>Daily toolbox talks — topic, hazards covered, and who attended.</p>
        <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Log Meeting</button>
      </div>

      {visibleMeetings.length === 0 ? (
        <p className={styles.empty}>No toolbox meetings logged yet.</p>
      ) : (
        <div className={styles.list}>
          {visibleMeetings.map(m => {
            const isOpen = expanded === m.id;
            return (
              <div key={m.id} className={styles.card}>
                <div className={styles.head} onClick={() => setExpanded(isOpen ? null : m.id)}>
                  <div className={styles.headLeft}>
                    <span className={styles.dateTag}>{formatDate(m.date)}</span>
                    <span className={styles.teamTag}>{TEAMS[m.team] ?? m.team}</span>
                    <p className={styles.topic}>{m.topic}</p>
                  </div>
                  <div className={styles.headRight}>
                    <span className={styles.attendeeCount}><UserGroupIcon width={13} /> {m.attendeeIds?.length ?? 0}</span>
                    <ChevronDownIcon width={14} className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} />
                  </div>
                </div>
                {isOpen && (
                  <div className={styles.body}>
                    {m.location && <p><strong>Location:</strong> {m.location}</p>}
                    {m.notes && <p><strong>Notes:</strong> {m.notes}</p>}
                    <p><strong>Conducted by:</strong> {m.conductedByName}</p>
                    <div className={styles.attendeeList}>
                      <strong>Attendees ({m.attendeeIds?.length ?? 0}):</strong>
                      <div className={styles.attendeeChips}>
                        {(m.attendeeIds ?? []).map(id => {
                          const w = workers.find(x => x.id === id);
                          return <span key={id} className={styles.attendeeChip}>{w?.name ?? 'Unknown worker'}</span>;
                        })}
                        {(!m.attendeeIds || m.attendeeIds.length === 0) && <span className={styles.noAttendees}>No attendees recorded</span>}
                      </div>
                    </div>
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
              <h3 className={styles.modalTitle}>Log Toolbox Meeting</h3>
              <button className={styles.modalClose} onClick={() => setShowForm(false)}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submit}>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Date</label>
                  <input type="date" className={styles.formInput} value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Team</label>
                  <select className={styles.formInput} value={form.team} disabled={!isAdmin}
                    onChange={e => setForm(f => ({ ...f, team: e.target.value, attendeeIds: [] }))}>
                    {Object.entries(TEAMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Location <span className={styles.opt}>(optional)</span></label>
                <input className={styles.formInput} placeholder="e.g. Blk 307 ground floor" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              <div className={styles.formRow}><label className={styles.formLbl}>Topic Discussed <span style={{color:'var(--red)'}}>*</span></label>
                <input className={styles.formInput} placeholder="e.g. Ladder safety, cable termination hazards" value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} /></div>
              <div className={styles.formRow}><label className={styles.formLbl}>Notes <span className={styles.opt}>(optional)</span></label>
                <textarea className={styles.formTextarea} rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Attendees ({form.attendeeIds.length})</label>
                {teamWorkers.length === 0 ? (
                  <p className={styles.noWorkers}>No active workers registered for this team yet.</p>
                ) : (
                  <div className={styles.attendeeGrid}>
                    {teamWorkers.map(w => (
                      <label key={w.id} className={styles.attendeeOption}>
                        <input type="checkbox" checked={form.attendeeIds.includes(w.id)} onChange={() => toggleAttendee(w.id)} />
                        {w.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Saving…' : 'Log Meeting'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
