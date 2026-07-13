import React, { useState, useEffect, useMemo } from 'react';
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCenter,
  useDroppable, useDraggable,
} from '@dnd-kit/core';
import {
  collection, query, where, getDocs, doc, updateDoc, onSnapshot,
} from 'firebase/firestore';
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { formatDate } from '../../utils/helpers';
import { STATUS_CONFIG } from './jobStatus';
import styles from './Jobs.module.css';

// Date-only helpers. serviceJobs.scheduledDate is a plain 'YYYY-MM-DD' string
// (see AssignJobModal), so we do all math on midnight-local Dates — Singapore
// has no DST, so day arithmetic never shifts.
const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const mondayOf = (d) => { const x = new Date(d); const wd = (x.getDay() + 6) % 7; return addDays(x, -wd); };
const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
const sameSet = (a = [], b = []) => a.length === b.length && a.every(x => b.includes(x));

function Chip({ id, jobId, techId, job, draggable, isDragging, asOverlay, onOpen, className, children }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id, data: { jobId, techId }, disabled: !draggable,
  });
  const style = !asOverlay && transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;
  return (
    <div
      ref={asOverlay ? undefined : setNodeRef}
      style={style}
      className={[
        styles.calChip,
        draggable ? styles.calChipDrag : '',
        isDragging ? styles.calChipDragging : '',
        asOverlay ? styles.calChipOverlay : '',
        className || '',
      ].filter(Boolean).join(' ')}
      {...(asOverlay || !draggable ? {} : { ...listeners, ...attributes })}
      onClick={onOpen}
    >
      <span className={styles.calChipName}>{job.customerName}</span>
      {children}
    </div>
  );
}

function Cell({ techId, day, canAssign, children }) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell::${techId}::${day}`, data: { techId, day }, disabled: !canAssign,
  });
  return (
    <div ref={setNodeRef} className={[styles.calCell, canAssign && isOver ? styles.calCellOver : ''].join(' ')}>
      {children}
    </div>
  );
}

// Week dispatch grid: rows = technicians, columns = the 7 days of the visible
// week. A multi-crew job shows a chip in each assigned technician's row.
// Dragging a chip to another day / technician row writes the SAME field shape
// AssignJobModal's edit mode uses — { scheduledDate, assignedTo,
// assignedToNames, crew } — which the deployed rules allow under jobs:assign.
// A technician who has already checked in can't be moved off (isLocked), so we
// never silently drop a recorded GPS check-in.
export default function JobDispatchCalendar({ canAssign, onOpen }) {
  const { toast } = useToast();

  const [jobs,    setJobs]    = useState([]);
  const [staff,   setStaff]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekStart, setWeekStart] = useState(() => mondayOf(parseISO(todayISO())));
  const [active,  setActive]  = useState(null); // { jobId, techId } while dragging

  // Live listener like the list/board.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'serviceJobs'), snap => {
      setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => {
      toast.error('Failed to load jobs');
      setLoading(false);
    });
    return unsub;
  }, [toast]);

  // Active staff-role technicians form the canonical rows (same query
  // AssignJobModal uses to populate its technician picker).
  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('role', '==', 'staff'), where('status', '==', 'active')))
      .then(snap => setStaff(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load technicians'));
  }, [toast]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // id → display name, from staff docs plus every job's assignedTo/Names pairs
  // (so a technician who's been deactivated but still assigned still resolves).
  const namesById = useMemo(() => {
    const map = {};
    staff.forEach(s => { map[s.id] = s.name; });
    jobs.forEach(j => (j.assignedTo ?? []).forEach((id, i) => {
      if (!map[id]) map[id] = j.assignedToNames?.[i] ?? id;
    }));
    return map;
  }, [staff, jobs]);
  const nameOf = (id) => namesById[id] ?? id;

  // Rows: active staff first (by name), then any still-assigned technician not
  // in that set.
  const techRows = useMemo(() => {
    const ids = new Set(staff.map(s => s.id));
    const rows = staff.map(s => ({ id: s.id, name: s.name }));
    jobs.forEach(j => (j.assignedTo ?? []).forEach(id => {
      if (!ids.has(id)) { ids.add(id); rows.push({ id, name: nameOf(id) }); }
    }));
    return rows.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, jobs]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => isoOf(addDays(weekStart, i))), [weekStart]);
  const today = todayISO();

  // Jobs lacking a scheduled date OR any assignee live in the tray.
  const trayJobs = useMemo(
    () => jobs.filter(j => !j.scheduledDate || !(j.assignedTo?.length)),
    [jobs],
  );

  // Fast lookup: chips for (techId, day).
  const cellJobs = (techId, day) =>
    jobs.filter(j => j.scheduledDate === day && (j.assignedTo ?? []).includes(techId));

  const activeJob = active ? jobs.find(j => j.id === active.jobId) : null;

  const handleDragStart = (event) => setActive(event.active.data.current ?? null);

  const handleDragEnd = async (event) => {
    setActive(null);
    const { active: a, over } = event;
    if (!over || !canAssign) return;
    const src = a.data.current || {};
    const dst = over.data.current || {};
    const job = jobs.find(j => j.id === src.jobId);
    if (!job) return;

    const sourceTech = src.techId || null; // null when dragged from the tray
    const targetTech = dst.techId;
    const newDate    = dst.day;

    // isLocked: a checked-in technician can't be reassigned off the job — that
    // would discard their GPS check-in record.
    if (sourceTech && sourceTech !== targetTech && job.crew?.[sourceTech]?.checkIn) {
      toast.error('That technician has already checked in — they can\'t be moved off this job.');
      return;
    }

    // Reassign: drop the dragged (source) technician, add the target row's
    // technician. Tray chips have no source, so they only add.
    let ids = Array.isArray(job.assignedTo) ? [...job.assignedTo] : [];
    if (sourceTech && sourceTech !== targetTech) ids = ids.filter(id => id !== sourceTech);
    if (!ids.includes(targetTech)) ids.push(targetTech);

    if (newDate === job.scheduledDate && sameSet(ids, job.assignedTo ?? [])) return; // no-op

    // Belt & braces: never drop a crew member who has already checked in.
    const droppedCheckedIn = Object.entries(job.crew ?? {}).some(
      ([id, c]) => c?.checkIn && !ids.includes(id),
    );
    if (droppedCheckedIn) {
      toast.error('Can\'t move this job away from a checked-in technician.');
      return;
    }

    // Preserve each retained technician's crew entry (incl. check-in/out);
    // create a fresh one for a newly added technician — exactly what
    // AssignJobModal's edit mode does.
    const crew = {};
    ids.forEach(id => {
      crew[id] = job.crew?.[id] ?? { name: nameOf(id), checkIn: null, checkOut: null };
    });
    const update = {
      scheduledDate: newDate,
      assignedTo: ids,
      assignedToNames: ids.map(nameOf),
      crew,
    };

    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, ...update } : j)); // optimistic
    try {
      await updateDoc(doc(db, 'serviceJobs', job.id), update);
    } catch {
      setJobs(prev => prev.map(j => j.id === job.id ? job : j)); // revert
      toast.error('Failed to move job');
    }
  };

  if (loading) return <div className={styles.loadingBox}><div className={styles.spinner} /></div>;

  const rangeLabel = `${formatDate(parseISO(days[0]))} – ${formatDate(parseISO(days[6]))}`;
  const dayFmt = new Intl.DateTimeFormat('en-SG', { weekday: 'short' });

  const statusPill = (job) => {
    const sc = STATUS_CONFIG[job.status];
    return sc ? <span className={[styles.pill, styles[sc.cls]].join(' ')}>{sc.label}</span> : null;
  };

  return (
    <div className={styles.calWrap}>
      <div className={styles.calHead}>
        <div className={styles.calNav}>
          <button className={styles.calNavBtn} onClick={() => setWeekStart(w => addDays(w, -7))} aria-label="Previous week">
            <ChevronLeftIcon width={16} />
          </button>
          <span className={styles.calRange}>{rangeLabel}</span>
          <button className={styles.calNavBtn} onClick={() => setWeekStart(w => addDays(w, 7))} aria-label="Next week">
            <ChevronRightIcon width={16} />
          </button>
        </div>
        <button className={styles.calTodayBtn} onClick={() => setWeekStart(mondayOf(parseISO(todayISO())))}>
          This week
        </button>
      </div>

      {!canAssign && (
        <p className={styles.jbHint}>Read-only — rescheduling requires the Assign Jobs permission.</p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className={styles.calGridWrap}>
          <div className={styles.calGrid}>
            <div className={styles.calCorner}>Technician</div>
            {days.map(d => (
              <div key={d} className={[styles.calDayHead, d === today ? styles.calDayToday : ''].join(' ')}>
                <div className={styles.calDayName}>{dayFmt.format(parseISO(d))}</div>
                <div className={styles.calDayNum}>{Number(d.slice(-2))}</div>
              </div>
            ))}

            {techRows.length === 0 && (
              <div className={styles.calRowLbl} style={{ gridColumn: '1 / -1' }}>No active technicians.</div>
            )}

            {techRows.map(row => (
              <React.Fragment key={row.id}>
                <div className={styles.calRowLbl}>{row.name}</div>
                {days.map(day => (
                  <Cell key={day} techId={row.id} day={day} canAssign={canAssign}>
                    {cellJobs(row.id, day).map(job => (
                      <Chip
                        key={`${job.id}::${row.id}`}
                        id={`${job.id}::${row.id}`}
                        jobId={job.id}
                        techId={row.id}
                        job={job}
                        draggable={canAssign}
                        isDragging={active?.jobId === job.id && active?.techId === row.id}
                        onOpen={() => onOpen(job)}
                      >
                        <span className={styles.calChipMeta}>{statusPill(job)}</span>
                      </Chip>
                    ))}
                  </Cell>
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className={styles.calTray}>
          <p className={styles.calTrayHead}>Unassigned / no date</p>
          {trayJobs.length === 0 ? (
            <p className={styles.calTrayEmpty}>Every job has a technician and a date.</p>
          ) : (
            <div className={styles.calTrayChips}>
              {trayJobs.map(job => (
                <Chip
                  key={`${job.id}::tray`}
                  id={`${job.id}::tray`}
                  jobId={job.id}
                  techId={null}
                  job={job}
                  draggable={canAssign}
                  isDragging={active?.jobId === job.id && !active?.techId}
                  onOpen={() => onOpen(job)}
                  className={styles.calTrayChip}
                >
                  <span className={styles.calChipMeta}>
                    {statusPill(job)}
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {job.scheduledDate || 'no date'}{(job.assignedTo?.length) ? '' : ' · no tech'}
                    </span>
                  </span>
                </Chip>
              ))}
            </div>
          )}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeJob && (
            <Chip id="overlay" jobId={activeJob.id} techId={active?.techId} job={activeJob} draggable asOverlay onOpen={() => {}}>
              <span className={styles.calChipMeta}>{statusPill(activeJob)}</span>
            </Chip>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
