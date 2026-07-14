import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, updateDoc, doc, Timestamp, arrayUnion } from 'firebase/firestore';
import { PencilSquareIcon, MapPinIcon, FlagIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { fmtDate, fmtTime, calcHours, mapsLink, todaySG, timeInputSG } from '../../utils/attendanceUtils';
import DateRangePicker from '../../components/UI/DateRangePicker';
import styles from './Attendance.module.css';

const TEAM_LABELS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

export default function TeamView() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();

  const [records,   setRecords]   = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [dateFrom,  setDateFrom]  = useState(todaySG());
  const [dateTo,    setDateTo]    = useState(todaySG());
  const [editRec,   setEditRec]   = useState(null);  // record being edited
  const [editData,  setEditData]  = useState({});
  const [editReason, setEditReason] = useState('');
  const [saving,    setSaving]    = useState(false);

  const isAdmin = can('attendance:manage');

  const load = async () => {
    setLoading(true);
    try {
      let q;
      if (isAdmin) {
        q = query(
          collection(db, 'attendance'),
          where('date', '>=', dateFrom),
          where('date', '<=', dateTo),
          orderBy('date', 'desc')
        );
      } else {
        // subcon-admin sees only their team
        q = query(
          collection(db, 'attendance'),
          where('team', '==', userProfile.team),
          where('date', '>=', dateFrom),
          where('date', '<=', dateTo),
          orderBy('date', 'desc')
        );
      }
      const snap = await getDocs(q);
      setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      toast.error('Failed to load records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const openEdit = (rec) => {
    setEditRec(rec);
    setEditData({
      inTime:  timeInputSG(rec.clockIn?.time),
      outTime: timeInputSG(rec.clockOut?.time),
    });
    setEditReason('');
  };

  const saveEdit = async () => {
    if (!editReason.trim()) { toast.error('Please enter a reason for this edit.'); return; }
    setSaving(true);
    try {
      const makeTs = (dateStr, timeStr) => {
        if (!timeStr) return null;
        return Timestamp.fromDate(new Date(`${dateStr}T${timeStr}:00+08:00`));
      };

      const changes = [];
      const update  = {};

      const newInTs  = makeTs(editRec.date, editData.inTime);
      const newOutTs = editData.outTime ? makeTs(editRec.date, editData.outTime) : null;

      if (editData.inTime) {
        update['clockIn.time'] = newInTs;
        changes.push({ field: 'clockIn.time', from: fmtTime(editRec.clockIn?.time), to: editData.inTime });
      }
      if (editData.outTime !== fmtTime(editRec.clockOut?.time)) {
        update['clockOut.time'] = newOutTs;
        changes.push({ field: 'clockOut.time', from: fmtTime(editRec.clockOut?.time), to: editData.outTime });
      }

      const hoursWorked = newInTs && newOutTs ? calcHours(newInTs, newOutTs) : editRec.hoursWorked;
      if (newInTs && newOutTs) update.hoursWorked = hoursWorked;

      update.manuallyEdited = true;
      update.status = newOutTs ? 'complete' : 'open';
      update.editLog = arrayUnion({
        editedBy: userProfile.userId,
        editedAt: Timestamp.now(),
        reason: editReason.trim(),
        changes,
      });

      await updateDoc(doc(db, 'attendance', editRec.id), update);
      toast.success('Record updated');
      setEditRec(null);
      load();
    } catch {
      toast.error('Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = async (rec) => {
    try {
      await updateDoc(doc(db, 'attendance', rec.id), { flagged: !rec.flagged });
      setRecords(rs => rs.map(r => r.id === rec.id ? { ...r, flagged: !r.flagged } : r));
    } catch { toast.error('Failed to update flag'); }
  };

  return (
    <div className={styles.teamWrap}>
      {/* Date filter */}
      <div className={styles.filterBar} style={{ alignItems: 'flex-start' }}>
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo}
          onChange={(f, t) => { setDateFrom(f); setDateTo(t); }} />
        <button className={styles.filterBtn} onClick={load}>Search</button>
      </div>

      {loading ? (
        <div className={styles.panelLoading}><div className={styles.spinner} /></div>
      ) : records.length === 0 ? (
        <p className={styles.empty}>No attendance records for this date range.</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.attTable}>
            <thead>
              <tr>
                <th>Date</th>
                <th>Worker</th>
                <th>Team</th>
                <th>In</th>
                <th>Out</th>
                <th>Hours</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {records.map(rec => (
                <tr key={rec.id} className={rec.flagged ? styles.flaggedRow : ''}>
                  <td>{fmtDate(rec.date)}</td>
                  <td>
                    {rec.name}
                    {rec.manuallyEdited && <span className={styles.editedBadge}>edited</span>}
                  </td>
                  <td>{TEAM_LABELS[rec.team] ?? rec.team}</td>
                  <td>
                    {fmtTime(rec.clockIn?.time)}
                    {rec.clockIn?.lat && (
                      <a href={mapsLink(rec.clockIn.lat, rec.clockIn.lng)} target="_blank" rel="noreferrer" className={styles.mapPin}>
                        <MapPinIcon width={11} />
                      </a>
                    )}
                  </td>
                  <td>
                    {rec.clockOut ? fmtTime(rec.clockOut.time) : '—'}
                    {rec.clockOut?.lat && (
                      <a href={mapsLink(rec.clockOut.lat, rec.clockOut.lng)} target="_blank" rel="noreferrer" className={styles.mapPin}>
                        <MapPinIcon width={11} />
                      </a>
                    )}
                  </td>
                  <td>{rec.hoursWorked != null ? `${rec.hoursWorked}h` : '—'}</td>
                  <td>
                    <span className={[styles.statusPill, rec.status === 'complete' ? styles.pillGreen : styles.pillAmber].join(' ')}>
                      {rec.status === 'complete' ? 'Complete' : 'Open'}
                    </span>
                  </td>
                  <td className={styles.actionsCell}>
                    <button className={styles.iconBtn} title="Edit times" onClick={() => openEdit(rec)}>
                      <PencilSquareIcon width={15} />
                    </button>
                    <button
                      className={[styles.iconBtn, rec.flagged ? styles.flagActive : ''].join(' ')}
                      title={rec.flagged ? 'Remove flag' : 'Flag for review'}
                      onClick={() => toggleFlag(rec)}
                    >
                      <FlagIcon width={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editRec && (
        <div className={styles.modalOverlay} onClick={() => setEditRec(null)}>
          <div className={styles.editModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Edit Attendance — {editRec.name} ({fmtDate(editRec.date)})</h3>

            <div className={styles.editRow}>
              <label className={styles.editLbl}>Clock-in time</label>
              <input type="time" className={styles.editInput}
                value={editData.inTime} onChange={e => setEditData(d => ({ ...d, inTime: e.target.value }))} />
            </div>
            <div className={styles.editRow}>
              <label className={styles.editLbl}>Clock-out time</label>
              <input type="time" className={styles.editInput}
                value={editData.outTime} onChange={e => setEditData(d => ({ ...d, outTime: e.target.value }))} />
            </div>
            <div className={styles.editRow}>
              <label className={styles.editLbl}>Reason <span style={{color:'var(--red)'}}>*</span></label>
              <textarea className={styles.editTextarea} rows={2} placeholder="e.g. Staff forgot to clock in at site"
                value={editReason} onChange={e => setEditReason(e.target.value)} />
            </div>

            <div className={styles.editActions}>
              <button className={styles.cancelBtn} onClick={() => setEditRec(null)}>Cancel</button>
              <button className={styles.saveBtn} onClick={saveEdit} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
