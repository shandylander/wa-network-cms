import React from 'react';
import styles from './DateRangePicker.module.css';

const SGT = { timeZone: 'Asia/Singapore' };
const isoOf = (d) => new Intl.DateTimeFormat('en-CA', SGT).format(d);
// "Today" as a real Date at local midnight, built from the SG-local ISO
// string — avoids UTC-offset drift when the browser's own timezone differs
// from Singapore (matches this app's SGT-everywhere convention).
const sgToday = () => new Date(`${isoOf(new Date())}T00:00:00`);

const RANGES = [
  { key: 'today', label: 'Today', get: () => { const t = sgToday(); return [isoOf(t), isoOf(t)]; } },
  {
    key: 'week', label: 'This Week', get: () => {
      const t = sgToday();
      const mon = new Date(t);
      mon.setDate(t.getDate() - ((t.getDay() + 6) % 7)); // Monday of this week
      return [isoOf(mon), isoOf(t)];
    },
  },
  {
    key: 'month', label: 'This Month', get: () => {
      const t = sgToday();
      const first = new Date(t.getFullYear(), t.getMonth(), 1);
      return [isoOf(first), isoOf(t)];
    },
  },
  {
    key: 'last7', label: 'Last 7 Days', get: () => {
      const t = sgToday();
      const s = new Date(t); s.setDate(t.getDate() - 6);
      return [isoOf(s), isoOf(t)];
    },
  },
  {
    key: 'last30', label: 'Last 30 Days', get: () => {
      const t = sgToday();
      const s = new Date(t); s.setDate(t.getDate() - 29);
      return [isoOf(s), isoOf(t)];
    },
  },
];

// Reusable date-range filter: quick-select buttons (Today / This Week /
// This Month / Last 7 Days / Last 30 Days) plus manual From/To inputs for a
// custom range. Purely controlled — this component only reports the two
// date values via onChange; the caller still owns fetching/searching (most
// pages here use a separate "Load" button rather than refetching on every
// keystroke).
export default function DateRangePicker({ dateFrom, dateTo, onChange }) {
  const activeKey = RANGES.find(r => {
    const [f, t] = r.get();
    return f === dateFrom && t === dateTo;
  })?.key;

  return (
    <div className={styles.wrap}>
      <div className={styles.quickRow}>
        {RANGES.map(r => (
          <button
            key={r.key}
            type="button"
            className={[styles.quickBtn, activeKey === r.key ? styles.quickBtnActive : ''].join(' ')}
            onClick={() => { const [f, t] = r.get(); onChange(f, t); }}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className={styles.customRow}>
        <label className={styles.lbl}>From</label>
        <input type="date" className={styles.input} value={dateFrom} onChange={e => onChange(e.target.value, dateTo)} />
        <label className={styles.lbl}>To</label>
        <input type="date" className={styles.input} value={dateTo} min={dateFrom} onChange={e => onChange(dateFrom, e.target.value)} />
      </div>
    </div>
  );
}
