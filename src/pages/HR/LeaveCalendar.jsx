import React, { useState, useEffect, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ChevronLeftIcon, ChevronRightIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { isHoliday, holidayName } from '../../utils/sgHolidays';
import styles from './LeaveCalendar.module.css';

// Colour per leave type — mirrors the badge colours used in MyLeave/ApprovalQueue
// (see HR.module.css .typeAL/.typeMC/etc.), kept local since this view renders
// chips with inline colours rather than the shared CSS-module badge classes.
const TYPE_META = {
  AL:  { fg: 'var(--blue)',   bg: 'var(--blue-bg)'   },
  MC:  { fg: 'var(--green)',  bg: 'var(--green-bg)'  },
  CCL: { fg: 'var(--navy)',   bg: 'var(--navy-bg)'   },
  HL:  { fg: 'var(--red)',    bg: 'var(--red-light)' },
  NPL: { fg: 'var(--amber)',  bg: 'var(--amber-bg)'  },
  OIL: { fg: 'var(--purple)', bg: 'var(--purple-bg)' },
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`; // m is 0-indexed

// Build a Sun–Sat month grid (leading/trailing days from adjacent months fill
// the first/last week). Weekday is computed from the (y, m, d) components —
// never by re-parsing the ISO string — so it can't drift a day off around
// UTC/local timezone boundaries.
function buildMonthGrid(year, month) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells = [];

  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    const m = month === 0 ? 11 : month - 1;
    const y = month === 0 ? year - 1 : year;
    cells.push({ date: toISO(y, m, d), day: d, inMonth: false, dow: new Date(y, m, d).getDay() });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: toISO(year, month, d), day: d, inMonth: true, dow: new Date(year, month, d).getDay() });
  }
  let nextDay = 1;
  while (cells.length % 7 !== 0) {
    const m = month === 11 ? 0 : month + 1;
    const y = month === 11 ? year + 1 : year;
    cells.push({ date: toISO(y, m, nextDay), day: nextDay, inMonth: false, dow: new Date(y, m, nextDay).getDay() });
    nextDay++;
  }
  return cells;
}

// Same "compare ISO date strings lexicographically" trick used by
// attentionEngine.leaveClashAlerts for date-range containment — no Date math.
const isActiveOn = (dateStr, app) =>
  !!app.dateFrom && !!app.dateTo && dateStr >= app.dateFrom && dateStr <= app.dateTo;

export default function LeaveCalendar() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const isAdmin = ['owner', 'manager'].includes(userProfile?.role);

  const today = new Date();
  const [cursor,  setCursor]  = useState({ year: today.getFullYear(), month: today.getMonth() }); // month 0-indexed
  const [apps,    setApps]    = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = isAdmin
        ? query(collection(db, 'leaveApplications'), where('year', '==', cursor.year))
        : query(collection(db, 'leaveApplications'), where('team', '==', 'own'), where('year', '==', cursor.year));
      const snap = await getDocs(q);
      setApps(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(a => a.status === 'approved' || a.status === 'pending')
      );
    } catch { toast.error('Failed to load leave calendar'); }
    finally { setLoading(false); }
  }, [isAdmin, cursor.year, toast]);

  useEffect(() => { load(); }, [load]);

  const cells = buildMonthGrid(cursor.year, cursor.month);
  const appsOnDay = (dateStr) => apps.filter(a => isActiveOn(dateStr, a));

  // Flag a day when 2+ distinct people from the same team are off on the
  // same working day (not a weekend, not a gazetted public holiday).
  const hasTeamClash = (dayApps, dow, dateStr) => {
    if (dow === 0 || dow === 6 || isHoliday(dateStr)) return false;
    const byTeam = {};
    dayApps.forEach(a => {
      const team = a.team || 'own';
      if (!byTeam[team]) byTeam[team] = new Set();
      byTeam[team].add(a.userId);
    });
    return Object.values(byTeam).some(set => set.size >= 2);
  };

  const goPrev  = () => setCursor(c => c.month === 0  ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 });
  const goNext  = () => setCursor(c => c.month === 11 ? { year: c.year + 1, month: 0  } : { year: c.year, month: c.month + 1 });
  const goToday = () => setCursor({ year: today.getFullYear(), month: today.getMonth() });
  const todayISO = toISO(today.getFullYear(), today.getMonth(), today.getDate());

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <button className={styles.navBtn} onClick={goPrev} aria-label="Previous month"><ChevronLeftIcon width={16} /></button>
        <p className={styles.monthLbl}>{MONTH_LABELS[cursor.month]} {cursor.year}</p>
        <button className={styles.navBtn} onClick={goNext} aria-label="Next month"><ChevronRightIcon width={16} /></button>
        <button className={styles.todayBtn} onClick={goToday}>Today</button>
      </div>

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : (
        <>
          <div className={styles.legend}>
            {Object.entries(TYPE_META).map(([type, meta]) => (
              <span key={type} className={styles.legendItem}>
                <span className={styles.legendDot} style={{ background: meta.fg }} /> {type}
              </span>
            ))}
            <span className={styles.legendItem}><span className={[styles.legendDot, styles.legendHoliday].join(' ')} /> Public holiday</span>
            <span className={styles.legendItem}>
              <ExclamationTriangleIcon width={12} style={{ color: 'var(--amber)' }} /> Same-team clash
            </span>
          </div>

          <div className={styles.grid}>
            {WEEKDAY_LABELS.map(w => <div key={w} className={styles.weekdayHead}>{w}</div>)}
            {cells.map(cell => {
              const dayApps = appsOnDay(cell.date);
              const hol = holidayName(cell.date);
              const isWeekend = cell.dow === 0 || cell.dow === 6;
              const isToday = cell.date === todayISO;
              const clash = hasTeamClash(dayApps, cell.dow, cell.date);
              return (
                <div key={cell.date} className={[
                  styles.cell,
                  !cell.inMonth ? styles.cellOutside : '',
                  isWeekend ? styles.cellWeekend : '',
                  hol ? styles.cellHoliday : '',
                  isToday ? styles.cellToday : '',
                ].join(' ')}>
                  <div className={styles.cellHead}>
                    <span className={styles.cellDay}>{cell.day}</span>
                    {clash && (
                      <ExclamationTriangleIcon width={13} className={styles.clashIcon}
                        title="2+ people from the same team are off today" />
                    )}
                  </div>
                  {hol && <p className={styles.holidayLbl} title={hol}>{hol}</p>}
                  {dayApps.length > 0 && (
                    <div className={styles.chips}>
                      {dayApps.slice(0, 4).map(a => {
                        const meta = TYPE_META[a.type] ?? { fg: 'var(--text-sec)', bg: 'var(--surface)' };
                        return (
                          <span key={a.id}
                            className={[styles.chip, a.status === 'pending' ? styles.chipPending : ''].join(' ')}
                            style={{ background: meta.bg, color: meta.fg }}
                            title={`${a.name ?? '—'} — ${a.type}${a.status === 'pending' ? ' (pending)' : ''}`}>
                            {(a.name ?? '—').split(' ')[0]} · {a.type}
                          </span>
                        );
                      })}
                      {dayApps.length > 4 && <span className={styles.chipMore}>+{dayApps.length - 4} more</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
