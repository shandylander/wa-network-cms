import React, { useState, useEffect, useMemo } from 'react';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCenter,
  useDroppable, useDraggable,
} from '@dnd-kit/core';
import { collection, doc, updateDoc, onSnapshot, Timestamp } from 'firebase/firestore';
import { LockClosedIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { STATUS_CONFIG } from './jobStatus';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './Jobs.module.css';

// Columns follow STATUS_CONFIG order exactly.
const COLUMN_ORDER = ['scheduled', 'in-progress', 'completed', 'needs-revision', 'vetted'];

// The ONLY manager decision this board makes is vetting. Everything else in a
// job's lifecycle — scheduled → in-progress → completed — is driven by the
// technician's GPS check-in and completion in the field, so those transitions
// must never be forced from a drag here (the board must not contradict field
// truth). Concretely that means:
//   • only cards in the 'completed' column are draggable, and only for a
//     viewer who can('jobs:vet');
//   • only the 'vetted' and 'needs-revision' columns accept a drop.
// A drop onto 'vetted' performs the identical write JobSummary's "Vet & Approve"
// does; a drop onto 'needs-revision' opens the same note-required send-back
// flow. Both are jobs:vet writes, matching the deployed serviceJobs rules.
const VET_DROP_TARGETS = ['vetted', 'needs-revision'];

function JobCard({ job, draggable, isDragging, asOverlay, onOpen }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: job.id,
    disabled: !draggable,
  });
  const style = !asOverlay && transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const names = job.assignedToNames?.length ? job.assignedToNames : ['Unassigned'];

  return (
    <div
      ref={asOverlay ? undefined : setNodeRef}
      style={style}
      className={[
        styles.jbCard,
        draggable ? styles.jbCardDrag : styles.jbCardLocked,
        isDragging ? styles.jbCardDragging : '',
        asOverlay ? styles.jbCardOverlay : '',
      ].filter(Boolean).join(' ')}
      {...(asOverlay || !draggable ? {} : { ...listeners, ...attributes })}
      onClick={onOpen}
    >
      <div className={styles.jbCust}>
        {!draggable && !asOverlay && <LockClosedIcon width={11} className={styles.jbLock} />}
        {job.customerName}
      </div>
      <div className={styles.jbDate}>{job.scheduledDate || 'No date'}</div>
      <div className={styles.jbTechs}>
        {names.map((n, i) => <span key={i} className={styles.jbTech}>{n}</span>)}
      </div>
    </div>
  );
}

function BoardColumn({ status, jobs, canVet, activeId, onOpen }) {
  const droppable = VET_DROP_TARGETS.includes(status);
  const { isOver, setNodeRef } = useDroppable({ id: status, disabled: !droppable });
  const sc = STATUS_CONFIG[status];
  // Completed cards are the only draggable ones — and only when the viewer
  // can vet. Every other column's cards render locked (drag disabled).
  const cardsDraggable = status === 'completed' && canVet;

  return (
    <div ref={setNodeRef} className={[styles.jbCol, droppable && isOver ? styles.jbColOver : ''].join(' ')}>
      <div className={styles.jbColHead}>
        <span className={styles.jbColTitle}>{sc.label}</span>
        <span className={styles.jbColCount}>{jobs.length}</span>
      </div>
      <div className={styles.jbColBody}>
        {jobs.map(j => (
          <JobCard
            key={j.id}
            job={j}
            draggable={cardsDraggable}
            isDragging={activeId === j.id}
            onOpen={() => onOpen(j)}
          />
        ))}
        {jobs.length === 0 && <div className={styles.jbColEmpty}>—</div>}
      </div>
    </div>
  );
}

// Live drag-and-drop board for vetting. `onOpen(job)` bubbles a card click up
// to JobsBoard, which opens the shared JobSummary modal (the full report + the
// same vet controls) — so clicking always works even when dragging doesn't.
export default function JobBoardKanban({ canVet, onOpen }) {
  const { userProfile } = useAuth();
  const { toast }        = useToast();

  const [jobs,    setJobs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [pending,  setPending]  = useState(null); // { job, mode: 'approve' | 'sendback' }
  const [vetNotes, setVetNotes] = useState('');
  const [saving,   setSaving]   = useState(false);

  // Live listener, mirroring JobsBoard's list — the board always reflects jobs
  // updated from the field or elsewhere without a manual refresh.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'serviceJobs'), snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.scheduledDate ?? '').localeCompare(b.scheduledDate ?? ''));
      setJobs(list);
      setLoading(false);
    }, () => {
      toast.error('Failed to load jobs');
      setLoading(false);
    });
    return unsub;
  }, [toast]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const grouped = useMemo(() => {
    const map = Object.fromEntries(COLUMN_ORDER.map(s => [s, []]));
    jobs.forEach(j => { (map[j.status] ?? (map[j.status] = [])).push(j); });
    return map;
  }, [jobs]);

  const activeJob = activeId ? jobs.find(j => j.id === activeId) : null;

  const handleDragStart = (event) => setActiveId(event.active.id);

  const handleDragEnd = (event) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const job = jobs.find(j => j.id === active.id);
    // Guard: only a completed job, only a viewer who can vet, only onto a vet
    // column. (Cards outside 'completed' aren't draggable, so this is belt &
    // braces against any stray drop.)
    if (!job || job.status !== 'completed' || !canVet) return;
    if (over.id === 'vetted')          { setVetNotes(''); setPending({ job, mode: 'approve' }); }
    else if (over.id === 'needs-revision') { setVetNotes(''); setPending({ job, mode: 'sendback' }); }
  };

  // Writes below are byte-for-byte the same shape as JobSummary.decide():
  //   approve  → { status:'vetted',          vettedBy, vettedByName, vettedAt, vetNotes:null }
  //   sendback → { status:'needs-revision',  vettedBy, vettedByName, vettedAt, vetNotes:<note> }
  // Both require can('jobs:vet') per the deployed serviceJobs update rule.
  const confirm = async () => {
    if (!pending) return;
    const { job, mode } = pending;
    if (mode === 'sendback' && !vetNotes.trim()) {
      toast.error('Please explain what needs to be fixed.');
      return;
    }
    setSaving(true);
    try {
      const update = {
        status: mode === 'approve' ? 'vetted' : 'needs-revision',
        vettedBy: userProfile.userId, vettedByName: userProfile.name,
        vettedAt: Timestamp.now(),
        vetNotes: mode === 'sendback' ? vetNotes.trim() : null,
      };
      await updateDoc(doc(db, 'serviceJobs', job.id), update);
      toast.success(mode === 'approve' ? 'Job vetted' : 'Sent back for revision');
      setPending(null);
    } catch {
      toast.error('Failed to record decision');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className={styles.loadingBox}><div className={styles.spinner} /></div>;

  return (
    <div>
      <p className={styles.jbHint}>
        {canVet
          ? 'Drag a card from "Awaiting Vet" onto Vetted or Needs Revision to make a decision. All other moves are field-driven and locked. Click any card to open the full report.'
          : 'Click any card to open the full report. Vetting requires additional permission.'}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.jbBoard}>
          {COLUMN_ORDER.map(status => (
            <BoardColumn
              key={status}
              status={status}
              jobs={grouped[status] ?? []}
              canVet={canVet}
              activeId={activeId}
              onOpen={onOpen}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeJob && <JobCard job={activeJob} draggable asOverlay onOpen={() => {}} />}
        </DragOverlay>
      </DndContext>

      {pending && (
        <Modal
          isOpen
          onClose={() => !saving && setPending(null)}
          title={pending.mode === 'approve' ? 'Vet & Approve Job' : 'Send Back For Revision'}
          size="sm"
        >
          {pending.mode === 'approve' ? (
            <div className={styles.form}>
              <p className={styles.readonlyVal}>
                Mark <strong>{pending.job.customerName}</strong>'s report as vetted? This confirms the job
                is complete and correct.
              </p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setPending(null)} disabled={saving}>Cancel</Button>
                <Button onClick={confirm} loading={saving}>Vet &amp; Approve</Button>
              </div>
            </div>
          ) : (
            <div className={styles.form}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="board-vet-notes">What needs to be fixed?</label>
                <textarea
                  id="board-vet-notes"
                  className={styles.textarea}
                  rows={3}
                  value={vetNotes}
                  onChange={e => setVetNotes(e.target.value)}
                />
              </div>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setPending(null)} disabled={saving}>Cancel</Button>
                <Button variant="danger" onClick={confirm} loading={saving}>Send Back</Button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
