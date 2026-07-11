import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './Jobs.module.css';

const todaySG = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

// Manager-side scheduling form — creates a job in 'scheduled' status with
// one or more technicians pre-assigned. The technician fills in the actual
// report (job description, action taken, signature) later via JobDetail's
// "Complete Job" step, which reuses JobCompletionForm.
export default function AssignJobModal({ customerId, customerName, projectId, projectName, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();

  const [technicians, setTechnicians] = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [saving,        setSaving]     = useState(false);

  const [selectedTechs, setSelectedTechs] = useState([]);
  const [scheduledDate, setScheduledDate] = useState(todaySG());
  const [notes,         setNotes]         = useState('');

  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('role', '==', 'staff'), where('status', '==', 'active')))
      .then(snap => setTechnicians(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load technicians'))
      .finally(() => setLoading(false));
  }, [toast]);

  const toggleTech = (userId) => setSelectedTechs(prev =>
    prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
  );

  const submit = async () => {
    if (selectedTechs.length === 0) { toast.error('Select at least one technician.'); return; }
    setSaving(true);
    try {
      const picked = technicians.filter(t => selectedTechs.includes(t.id));
      const crew = {};
      picked.forEach(t => { crew[t.id] = { name: t.name, checkIn: null, checkOut: null }; });

      const payload = {
        customerId, customerName,
        projectId: projectId ?? null, projectName: projectName ?? null,
        status: 'scheduled',
        assignedTo: picked.map(t => t.id),
        assignedToNames: picked.map(t => t.name),
        assignedBy: userProfile.userId,
        scheduledDate, scheduledNotes: notes.trim(),
        crew,
        vettedBy: null, vettedByName: null, vettedAt: null, vetNotes: null,
        createdBy: userProfile.userId, createdByName: userProfile.name,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'serviceJobs'), payload);
      toast.success('Job scheduled');
      onSaved({ id: ref.id, ...payload });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to schedule job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Schedule Job" size="md">
      {loading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : (
        <div className={styles.form}>
          <div className={styles.field}>
            <span className={styles.label}>Customer</span>
            <span className={styles.readonlyVal}>{customerName}</span>
          </div>
          {projectName && (
            <div className={styles.field}>
              <span className={styles.label}>Linked project</span>
              <span className={styles.readonlyVal}>{projectName}</span>
            </div>
          )}

          <div className={styles.field}>
            <span className={styles.label}>Technician(s) — select all who'll be on site</span>
            {technicians.length === 0 ? (
              <p className={styles.readonlyVal}>No active staff-role technicians found.</p>
            ) : (
              <div className={styles.checkRow}>
                {technicians.map(t => (
                  <label key={t.id} className={styles.checkOption}>
                    <input type="checkbox" checked={selectedTechs.includes(t.id)} onChange={() => toggleTech(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
            <p className={styles.readonlyVal} style={{ fontSize: 10.5, color: 'var(--text-muted)', padding: '4px 0 0' }}>
              {selectedTechs.length} selected — each will check in/out independently and can add their own photos.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="aj-date">Scheduled date</label>
            <input id="aj-date" type="date" className={styles.input} value={scheduledDate} onChange={e => setScheduledDate(e.target.value)} />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="aj-notes">Notes for the technician</label>
            <textarea id="aj-notes" className={styles.textarea} rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="What needs doing, anything to bring, access instructions..." />
          </div>

          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Schedule Job</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
