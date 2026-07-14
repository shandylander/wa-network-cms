import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, addDoc, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import { toAssignable, ROLE_TAG } from './jobUtils';
import styles from './Jobs.module.css';

const todaySG = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

// Manager-side scheduling form — creates a job in 'scheduled' status with
// one or more technicians pre-assigned. The technician fills in the actual
// report (job description, action taken, signature) later via JobDetail's
// "Complete Job" step, which reuses JobCompletionForm.
//
// Pass `existingJob` to reuse this same form to reassign/reschedule a job
// that's already been created (edit mode) — e.g. wrong technician picked,
// date changed, or picking which of a customer's several open jobs a
// technician should go to. Offered regardless of job status (see
// JobSummary) — a technician who's already checked in is locked (see
// isLocked below) so we never discard their already-recorded GPS
// check-in/out, but the office/date/crew can still be corrected any time.
export default function AssignJobModal({ customerId, customerName, projectId, projectName, existingJob, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const editing = !!existingJob;

  const [technicians, setTechnicians] = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [saving,        setSaving]     = useState(false);

  const [selectedTechs, setSelectedTechs] = useState(existingJob?.assignedTo ?? []);
  const [scheduledDate, setScheduledDate] = useState(existingJob?.scheduledDate ?? todaySG());
  const [notes,         setNotes]         = useState(existingJob?.scheduledNotes ?? '');

  // Anyone in the WA company (owner/manager/supervisor/staff) can be rostered
  // onto a job — not just front-line staff. Subcontractors are excluded
  // because they can't drive a job (see toAssignable / serviceJobs rules).
  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('status', '==', 'active')))
      .then(snap => setTechnicians(toAssignable(snap.docs)))
      .catch(() => toast.error('Failed to load staff'))
      .finally(() => setLoading(false));
  }, [toast]);

  // A technician who's already checked in can't be unselected — removing
  // them would silently discard their GPS check-in record.
  const isLocked = (userId) => !!existingJob?.crew?.[userId]?.checkIn;

  const toggleTech = (userId) => {
    if (isLocked(userId)) return;
    setSelectedTechs(prev => prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]);
  };

  const submit = async () => {
    if (selectedTechs.length === 0) { toast.error('Select at least one technician.'); return; }
    setSaving(true);
    try {
      const picked = technicians.filter(t => selectedTechs.includes(t.id));
      const crew = {};
      picked.forEach(t => {
        crew[t.id] = existingJob?.crew?.[t.id] ?? { name: t.name, checkIn: null, checkOut: null };
      });

      if (editing) {
        const update = {
          assignedTo: picked.map(t => t.id),
          assignedToNames: picked.map(t => t.name),
          scheduledDate, scheduledNotes: notes.trim(),
          crew,
        };
        await updateDoc(doc(db, 'serviceJobs', existingJob.id), update);
        toast.success('Job updated');
        onSaved({ ...existingJob, ...update });
      } else {
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
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(editing ? 'Failed to update job' : 'Failed to schedule job');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={editing ? 'Reschedule Job' : 'Schedule Job'} size="md">
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
            <span className={styles.label}>Assign to — select everyone who'll be on site</span>
            {technicians.length === 0 ? (
              <p className={styles.readonlyVal}>No active company staff found.</p>
            ) : (
              <div className={styles.checkRow}>
                {technicians.map(t => (
                  <label key={t.id} className={styles.checkOption} style={isLocked(t.id) ? { opacity: .7, cursor: 'default' } : undefined}>
                    <input
                      type="checkbox"
                      checked={selectedTechs.includes(t.id)}
                      disabled={isLocked(t.id)}
                      onChange={() => toggleTech(t.id)}
                    />
                    {t.name}
                    {ROLE_TAG[t.role] ? <span className={styles.roleTag}>{ROLE_TAG[t.role]}</span> : ''}
                    {isLocked(t.id) ? ' (checked in)' : ''}
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
            <Button onClick={submit} loading={saving}>{editing ? 'Save Changes' : 'Schedule Job'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
