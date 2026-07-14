import React, { useState } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { PrinterIcon, CheckCircleIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { calcPayslip, monthRange, fmtSGD, printPayslip } from '../../utils/salaryUtils';
import { downloadCsv } from '../../utils/exportUtils';
import { todayInputSG } from '../../utils/helpers';
import styles from './HR.module.css';

const THIS_MONTH = todayInputSG().slice(0, 7);

// Minimal inline style for the Export ▾ dropdown items (no dedicated CSS class
// exists in HR.module.css; kept inline to avoid touching shared stylesheet).
const exportItemStyle = {
  background: 'none', border: 'none', textAlign: 'left', padding: '7px 10px',
  fontSize: 13, color: 'var(--text, #1a2233)', cursor: 'pointer', borderRadius: 6, width: '100%',
};

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
  const [showExport, setShowExport] = useState(false);

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

  /* ── CSV exports (admin) — shared exporter in utils/exportUtils.js ── */
  // (a) Payroll-month summary: one row per employee with the full breakdown.
  const exportPayrollSummary = () => {
    if (!rows?.length) return;
    const columns = [
      { key: 'name',           label: 'Employee' },
      { key: 'daysPresent',    label: 'Days Present' },
      { key: 'workingDays',    label: 'Working Days' },
      { key: 'nplDays',        label: 'NPL Days' },
      { key: 'otHours',        label: 'OT Hours' },
      { key: 'basicPay',       label: 'Basic Pay' },
      { key: 'allowanceTotal', label: 'Allowances' },
      { key: 'grossPay',       label: 'Gross Pay' },
      { key: 'cpfEmployee',    label: 'Employee CPF' },
      { key: 'cpfEmployer',    label: 'Employer CPF' },
      { key: 'sdl',            label: 'SDL' },
      { key: 'netPay',         label: 'Net Pay' },
    ];
    downloadCsv(`payroll-summary-${month}`, columns, rows);
    setShowExport(false);
  };

  // (b) CPF submission summary — simple CPF EZPay-style layout.
  // NRIC/CPF account is not yet captured in salaryConfig → placeholder column.
  const exportCpfSubmission = () => {
    if (!rows?.length) return;
    const columns = [
      { key: 'name',        label: 'Employee' },
      { key: 'nric',        label: 'CPF Account / NRIC' },
      { key: 'ow',          label: 'Ordinary Wages' },
      { key: 'cpfEmployee', label: 'Employee CPF' },
      { key: 'cpfEmployer', label: 'Employer CPF' },
      { key: 'total',       label: 'Total CPF' },
    ];
    const data = rows.map(r => ({
      name: r.name,
      nric: r.config?.nric ?? '', // placeholder — NRIC not captured yet
      ow: r.cpfWage ?? 0,
      cpfEmployee: r.cpfEmployee ?? 0,
      cpfEmployer: r.cpfEmployer ?? 0,
      total: (r.cpfEmployee ?? 0) + (r.cpfEmployer ?? 0),
    }));
    downloadCsv(`cpf-submission-${month}`, columns, data);
    setShowExport(false);
  };

  // (c) IR8A-style annual stub — STARTING STUB ONLY. Reflects the selected
  // month; a real IR8A must aggregate all 12 months (TODO in Phase 3b).
  const exportIR8AStub = () => {
    if (!rows?.length) return;
    const year = month.slice(0, 4);
    const columns = [
      { key: 'name',        label: 'Employee' },
      { key: 'year',        label: 'Year' },
      { key: 'gross',       label: 'Total Gross (STUB — month only)' },
      { key: 'cpfEmployee', label: 'Total Employee CPF (STUB)' },
      { key: 'note',        label: 'Note' },
    ];
    const data = rows.map(r => ({
      name: r.name,
      year,
      gross: r.grossPay ?? 0,
      cpfEmployee: r.cpfEmployee ?? 0,
      note: 'IR8A STUB — selected month only; aggregate 12 months before filing',
    }));
    downloadCsv(`ir8a-stub-${year}`, columns, data);
    setShowExport(false);
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
        {rows?.length > 0 && (
          <div className={styles.exportWrap} style={{ position: 'relative', display: 'inline-block' }}>
            <button className={styles.filterBtn} onClick={() => setShowExport(s => !s)}>
              <ArrowDownTrayIcon width={14} /> Export ▾
            </button>
            {showExport && (
              <div className={styles.exportMenu} style={{ position: 'absolute', zIndex: 20, top: 'calc(100% + 4px)', right: 0, background: 'var(--card)', border: '1px solid var(--border, #e2e6ed)', borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.12)', padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 220 }}>
                <button className={styles.exportItem} style={exportItemStyle} onClick={exportPayrollSummary}>Payroll summary (CSV)</button>
                <button className={styles.exportItem} style={exportItemStyle} onClick={exportCpfSubmission}>CPF submission summary (CSV)</button>
                <button className={styles.exportItem} style={exportItemStyle} onClick={exportIR8AStub}>IR8A annual stub (CSV)</button>
              </div>
            )}
          </div>
        )}
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
