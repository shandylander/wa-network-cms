import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, updateDoc, doc } from 'firebase/firestore';
import { FlagIcon, MapPinIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { fmtDate, fmtTime, mapsLink, todaySG } from '../../utils/attendanceUtils';
import DateRangePicker from '../../components/UI/DateRangePicker';
import styles from './Attendance.module.css';

export default function PhotoReview() {
  const { toast }   = useToast();
  const [staff,     setStaff]    = useState([]);         // own-team users for selector
  const [selected,  setSelected] = useState([]);         // selected userIds
  const [records,   setRecords]  = useState([]);
  const [searched,  setSearched] = useState(false);      // true after first search
  const [loading,   setLoading]  = useState(false);
  const [dateFrom,  setDateFrom] = useState(todaySG());
  const [dateTo,    setDateTo]   = useState(todaySG());
  const [lightbox,  setLightbox] = useState(null);

  // Load everyone who clocks attendance — own employees regardless of the
  // team value stored on their user record (some staff have team 'none').
  useEffect(() => {
    getDocs(query(collection(db, 'users'), where('status', '==', 'active')))
      .then(snap => setStaff(
        snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(u => ['staff', 'supervisor', 'manager'].includes(u.role))
          .sort((a, b) => a.name.localeCompare(b.name))
      ))
      .catch(() => {});
  }, []);

  const toggleSelect = (userId) =>
    setSelected(s => s.includes(userId) ? s.filter(id => id !== userId) : [...s, userId]);

  const selectAll  = () => setSelected(staff.map(s => s.userId));
  const clearAll   = () => setSelected([]);

  const load = async () => {
    if (!selected.length) { toast.error('Select at least one staff member.'); return; }
    setLoading(true);
    setSearched(true);
    try {
      // Firestore 'in' supports up to 30 values — our own staff is always small
      const snap = await getDocs(query(
        collection(db, 'attendance'),
        where('userId', 'in', selected),
        where('date', '>=', dateFrom),
        where('date', '<=', dateTo),
        orderBy('date', 'desc')
      ));
      // Newest day first; within a day, group alphabetically so each
      // person's in/out pair sits together for buddy-clocking checks
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name)));
    } catch {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  const toggleFlag = async (rec) => {
    try {
      await updateDoc(doc(db, 'attendance', rec.id), { flagged: !rec.flagged });
      setRecords(rs => rs.map(r => r.id === rec.id ? { ...r, flagged: !r.flagged } : r));
    } catch { toast.error('Failed to update'); }
  };

  return (
    <div className={styles.photoReviewWrap}>
      <p className={styles.reviewInfo}>
        Select staff and a date range, then load to compare clock-in and clock-out selfies.
      </p>

      {/* Staff selector */}
      <div className={styles.staffSelector}>
        <div className={styles.staffSelectorHeader}>
          <span className={styles.filterLbl}>Staff</span>
          <div className={styles.selectorActions}>
            <button className={styles.selectorLink} onClick={selectAll}>All</button>
            <span className={styles.selectorDivider}>·</span>
            <button className={styles.selectorLink} onClick={clearAll}>None</button>
          </div>
        </div>
        <div className={styles.staffChips}>
          {staff.map(s => (
            <button
              key={s.userId}
              className={[styles.staffChip, selected.includes(s.userId) ? styles.staffChipActive : ''].join(' ')}
              onClick={() => toggleSelect(s.userId)}
            >
              {s.name}
            </button>
          ))}
          {staff.length === 0 && <span className={styles.filterLbl}>No active staff found</span>}
        </div>
      </div>

      {/* Date + search */}
      <div className={styles.filterBar} style={{ alignItems: 'flex-start' }}>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <button className={styles.filterBtn} onClick={load} disabled={loading}>
          {loading ? 'Loading…' : `Load ${selected.length ? `(${selected.length})` : ''}`}
        </button>
      </div>

      {/* Results */}
      {!searched ? (
        <div className={styles.promptBox}>
          Select staff above and click Load to view photos.
        </div>
      ) : loading ? (
        <div className={styles.panelLoading}><div className={styles.spinner} /></div>
      ) : records.length === 0 ? (
        <p className={styles.empty}>No records found for the selected staff and date range.</p>
      ) : (
        <div className={styles.photoGrid}>
          {records.map(rec => (
            <div key={rec.id} className={[styles.photoCard, rec.flagged ? styles.photoCardFlagged : ''].join(' ')}>
              <div className={styles.photoCardHeader}>
                <div>
                  <p className={styles.photoWorker}>{rec.name}</p>
                  <p className={styles.photoDate}>{fmtDate(rec.date)}</p>
                </div>
                <button
                  className={[styles.flagBtn, rec.flagged ? styles.flagBtnActive : ''].join(' ')}
                  onClick={() => toggleFlag(rec)}
                  title={rec.flagged ? 'Remove flag' : 'Flag for review'}
                >
                  <FlagIcon width={14} />
                  {rec.flagged ? 'Flagged' : 'Flag'}
                </button>
              </div>

              <div className={styles.photoCompare}>
                <div className={styles.photoSlot}>
                  <p className={styles.photoSlotLabel}>Clock In — {fmtTime(rec.clockIn?.time)}</p>
                  {rec.clockIn?.photoUrl ? (
                    <img
                      src={rec.clockIn.photoUrl}
                      alt="Clock-in selfie"
                      className={styles.selfieImg}
                      onClick={() => setLightbox({ url: rec.clockIn.photoUrl, label: `${rec.name} — In ${fmtDate(rec.date)} ${fmtTime(rec.clockIn.time)}` })}
                    />
                  ) : (
                    <div className={styles.noPhoto}>No photo</div>
                  )}
                  {rec.clockIn?.lat && (
                    <a href={mapsLink(rec.clockIn.lat, rec.clockIn.lng)} target="_blank" rel="noreferrer" className={styles.photoLocLink}>
                      <MapPinIcon width={11} /> {rec.clockIn.address || `${rec.clockIn.lat.toFixed(4)}, ${rec.clockIn.lng.toFixed(4)}`}
                    </a>
                  )}
                </div>

                <div className={styles.photoSlot}>
                  <p className={styles.photoSlotLabel}>Clock Out — {rec.clockOut ? fmtTime(rec.clockOut.time) : '—'}</p>
                  {rec.clockOut?.photoUrl ? (
                    <img
                      src={rec.clockOut.photoUrl}
                      alt="Clock-out selfie"
                      className={styles.selfieImg}
                      onClick={() => setLightbox({ url: rec.clockOut.photoUrl, label: `${rec.name} — Out ${fmtDate(rec.date)} ${fmtTime(rec.clockOut.time)}` })}
                    />
                  ) : (
                    <div className={styles.noPhoto}>{rec.clockOut ? 'No photo' : 'Not clocked out'}</div>
                  )}
                  {rec.clockOut?.lat && (
                    <a href={mapsLink(rec.clockOut.lat, rec.clockOut.lng)} target="_blank" rel="noreferrer" className={styles.photoLocLink}>
                      <MapPinIcon width={11} /> {rec.clockOut.address || `${rec.clockOut.lat.toFixed(4)}, ${rec.clockOut.lng.toFixed(4)}`}
                    </a>
                  )}
                </div>
              </div>

              {rec.manuallyEdited && <p className={styles.editedNote}>Times manually edited</p>}
            </div>
          ))}
        </div>
      )}

      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lightboxInner} onClick={e => e.stopPropagation()}>
            <img src={lightbox.url} alt={lightbox.label} className={styles.lightboxImg} />
            <p className={styles.lightboxLabel}>{lightbox.label}</p>
            <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
