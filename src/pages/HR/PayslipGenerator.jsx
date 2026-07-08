import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { PrinterIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { calcPayslip, monthRange, fmtSGD, printPayslip } from '../../utils/salaryUtils';
import { todayInputSG } from '../../utils/helpers';
import styles from './HR.module.css';

const THIS_MONTH = todayInputSG().slice(0, 7);

export default function PayslipGenerator() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const isAdmin = can('salary:manage-payslips');

  const [month,     setMonth]     = useState(THIS_MONTH);
  const [rows,      setRows]      = useState(null);   // generated preview rows
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [viewOwn,   setViewOwn]   = useState(null);  // payslip object for own view

  /* ── Load own payslip (staff view) ── */
  const loadOwnPayslip = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(query(
        collection(db, 'payslips'),
        where('userId', '==', userProfile.userId),
        where('month', '==', month),
      ));
      if (!snap.empty) {
        setViewOwn({ id: snap.docs[0].id, ...snap.docs[0].data() });
      } else {
        setViewOwn(null);
        toast.error('No payslip found for this month.');
      }
    } catch { toast.error('Failed to load payslip'); }
    finally { setLoading(false); }
  };

  /* ── Generate previews (admin) ── */
  const generate = async () => {
    setLoading(true);
    setRows(null);
    try {
      const { from, to } = monthRange(month);
      const [userSnap, cfgSnap, attSnap, leaveSnap] = await Promise.all([
        getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
        getDocs(collection(db, 'salaryConfig')),
        getDocs(query(collection(db, 'attendance'), where('date', '>=', from), where('date', '<=', to))),
        getDocs(query(collection(db, 'leaveApplications'), where('month', '==', month), where('status', '==', 'approved'), where('type', '==', 'NPL'))),
      ]);

      const cfgMap  = {};
      cfgSnap.docs.forEach(d => { cfgMap[d.id] = d.data(); });
      const attMap  = {};
      attSnap.docs.forEach(d => {
        const r = d.data();
        if (!attMap[r.userId]) attMap[r.userId] = [];
        attMap[r.userId].push(r);
      });
      const nplMap  = {};
      leaveSnap.docs.forEach(d => {
        const r = d.data();
        nplMap[r.userId] = (nplMap[r.userId] ?? 0) + (r.days ?? 0);
      });

      const staffList = userSnap.docs.map(d => d.data())
        .filter(u => ['staff','supervisor','manager'].includes(u.role));

      const generated = staffList.map(u => {
        const config     = cfgMap[u.userId] ?? { basicPay: 0, standardDailyHours: 8, otMultiplier: 1.5 };
        const attendance = attMap[u.userId] ?? [];
        const nplDays    = nplMap[u.userId] ?? 0;
        const calc       = calcPayslip({ config, attendanceRecords: attendance, nplDays, month });
        return { userId: u.userId, name: u.name, team: u.team, config, ...calc };
      });

      setRows(generated);
    } catch (err) { toast.error('Failed to generate payslips'); }
    finally { setLoading(false); }
  };

  /* ── Save all payslips ── */
  const saveAll = async () => {
    if (!rows?.length) return;
    setSaving(true);
    try {
      // Check if payslips already exist for this month
      const existing = await getDocs(query(collection(db, 'payslips'), where('month', '==', month)));
      const existMap = {};
      existing.docs.forEach(d => { existMap[d.data().userId] = d.id; });

      await Promise.all(rows.map(async r => {
        const payload = { ...r, month, status: 'finalized', generatedBy: userProfile.userId, generatedAt: Timestamp.now() };
        delete payload.config;
        if (existMap[r.userId]) {
          await updateDoc(doc(db, 'payslips', existMap[r.userId]), payload);
        } else {
          await addDoc(collection(db, 'payslips'), payload);
        }
      }));
      toast.success(`${rows.length} payslips saved for ${month}`);
    } catch { toast.error('Failed to save payslips'); }
    finally { setSaving(false); }
  };

  /* ── Staff own view ── */
  if (!isAdmin) {
    return (
      <div className={styles.ownPayslipWrap}>
        <div className={styles.filterBar}>
          <label className={styles.filterLbl}>Month</label>
          <input type="month" className={styles.filterInput} value={month} onChange={e => setMonth(e.target.value)} />
          <button className={styles.filterBtn} onClick={loadOwnPayslip} disabled={loading}>
            {loading ? 'Loading…' : 'View Payslip'}
          </button>
        </div>
        {viewOwn && <PayslipCard payslip={viewOwn} name={userProfile.name} month={month} />}
      </div>
    );
  }

  return (
    <div className={styles.payslipGenWrap}>
      <div className={styles.filterBar}>
        <label className={styles.filterLbl}>Month</label>
        <input type="month" className={styles.filterInput} value={month} onChange={e => { setMonth(e.target.value); setRows(null); }} />
        <button className={styles.filterBtn} onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate Preview'}</button>
        {rows && <button className={styles.saveBtn} onClick={saveAll} disabled={saving}><CheckCircleIcon width={14} /> {saving ? 'Saving…' : 'Finalise All'}</button>}
      </div>

      {rows && (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.payslipTable}>
              <thead><tr>
                <th>Name</th><th>Days Present</th><th>NPL</th><th>OT (h)</th>
                <th>Basic</th><th>Deductions</th><th>Net Pay</th><th></th>
              </tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.userId}>
                    <td>{r.name}</td>
                    <td>{r.daysPresent} / {r.workingDays}</td>
                    <td>{r.nplDays > 0 ? <span className={styles.nplBadge}>{r.nplDays}d</span> : '—'}</td>
                    <td>{r.otHours > 0 ? r.otHours : '—'}</td>
                    <td>{fmtSGD(r.basicPay)}</td>
                    <td className={styles.dedCell}>{fmtSGD(r.nplDeduction + r.cpfEmployee + r.otherDedTotal)}</td>
                    <td className={styles.netCell}>{fmtSGD(r.netPay)}</td>
                    <td>
                      <button className={styles.printIconBtn} title="Print payslip"
                        onClick={() => { if (!printPayslip(r, r.name, month)) toast.error('Popup blocked — allow popups for this site to print.'); }}>
                        <PrinterIcon width={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.payslipNote}>Review the preview above, then click "Finalise All" to save official payslips.</p>
        </>
      )}
    </div>
  );
}

function PayslipCard({ payslip, name, month }) {
  const { toast } = useToast();
  const monthLabel = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', month: 'long', year: 'numeric' })
    .format(new Date(`${month}-01T00:00:00+08:00`));
  return (
    <div className={styles.payslipCard}>
      <div className={styles.payslipCardHead}>
        <div>
          <p className={styles.payslipCardName}>{name}</p>
          <p className={styles.payslipCardMonth}>{monthLabel}</p>
        </div>
        <button className={styles.printBtn} onClick={() => { if (!printPayslip(payslip, name, month)) toast.error('Popup blocked — allow popups for this site to print.'); }}>
          <PrinterIcon width={14} /> Print
        </button>
      </div>
      <div className={styles.payslipSummary}>
        <div className={styles.payslipSumItem}><span>Days Present</span><strong>{payslip.daysPresent} / {payslip.workingDays}</strong></div>
        <div className={styles.payslipSumItem}><span>Basic Pay</span><strong>{fmtSGD(payslip.basicPay)}</strong></div>
        {payslip.otPay > 0 && <div className={styles.payslipSumItem}><span>OT Pay</span><strong>{fmtSGD(payslip.otPay)}</strong></div>}
        {payslip.nplDeduction > 0 && <div className={styles.payslipSumItem}><span>NPL Deduction</span><strong className={styles.dedAmt}>– {fmtSGD(payslip.nplDeduction)}</strong></div>}
        {payslip.cpfEmployee > 0 && <div className={styles.payslipSumItem}><span>CPF (Employee)</span><strong className={styles.dedAmt}>– {fmtSGD(payslip.cpfEmployee)}</strong></div>}
      </div>
      <div className={styles.payslipNet}><span>Net Pay</span><strong>{fmtSGD(payslip.netPay)}</strong></div>
    </div>
  );
}
