import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  CurrencyDollarIcon, BriefcaseIcon, WrenchScrewdriverIcon,
  ReceiptPercentIcon, ChartBarIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate as fmtDate } from '../../utils/helpers';
import styles from './Finance.module.css';

const fmtSGD  = (n) => `$${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function StatTile({ label, value, sub, icon: Icon, color = 'blue' }) {
  return (
    <div className={[styles.statTile, styles[`tile_${color}`]].join(' ')}>
      <div className={styles.statIcon}><Icon width={20} /></div>
      <div>
        <p className={styles.statValue}>{value}</p>
        <p className={styles.statLabel}>{label}</p>
        {sub && <p className={styles.statSub}>{sub}</p>}
      </div>
    </div>
  );
}

export default function Finance() {
  const { can } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [claims,  setClaims]  = useState({ s1: 0, s2: 0, s3: 0, blocks: 0 });
  const [payroll, setPayroll] = useState({ total: 0, month: '' });
  const [petty,   setPetty]   = useState({ approved: 0, pending: 0 });
  const [materials, setMaterials] = useState({ total: 0, count: 0 });
  const [recentPc, setRecentPc]  = useState([]);
  const [tab, setTab] = useState('overview'); // 'overview'|'claims'|'payroll'|'petty'

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // --- Petty cash ---
        const pcSnap = await getDocs(collection(db, 'pettyCashClaims'));
        const pcDocs = pcSnap.docs.map(d => d.data());
        const pcApproved = pcDocs.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0);
        const pcPending  = pcDocs.filter(c => c.status === 'pending').reduce((s, c)  => s + c.amount, 0);
        setPetty({ approved: pcApproved, pending: pcPending });
        setRecentPc(pcSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
          .slice(0, 5));

        // --- Claims from projects ---
        const projSnap = await getDocs(collection(db, 'projects'));
        let s1Acc = 0, s2Acc = 0, s3Acc = 0, blockAcc = 0;
        for (const projDoc of projSnap.docs) {
          const bSnap = await getDocs(collection(db, 'projects', projDoc.id, 'blocks'));
          const blocks = bSnap.docs.map(d => d.data());
          const rates  = projDoc.data().rates ?? {};
          blockAcc += blocks.length;
          const r1 = rates.s1 ?? 0;
          const r2 = rates.s2 ?? 0;
          blocks.forEach(b => {
            if (b.fix1 === 100 && b.fix2 === 100 && b.fix3 < 100) s1Acc += r1;
            if (b.fix1 === 100 && b.fix2 === 100 && b.fix3 === 100 && b.fix4 === 100) s2Acc += r2;
          });
        }
        setClaims({ s1: s1Acc, s2: s2Acc, s3: s3Acc, blocks: blockAcc });

        // --- Latest finalised payroll ---
        const paySnap = await getDocs(query(collection(db, 'payslips'), where('status', '==', 'final')));
        if (!paySnap.empty) {
          const byMonth = {};
          paySnap.docs.forEach(d => {
            const p = d.data();
            if (!byMonth[p.month]) byMonth[p.month] = 0;
            byMonth[p.month] += p.netPay ?? 0;
          });
          const latestMonth = Object.keys(byMonth).sort().reverse()[0];
          setPayroll({ total: byMonth[latestMonth] ?? 0, month: latestMonth });
        }

        // --- Materials ---
        for (const projDoc of projSnap.docs) {
          const matSnap = await getDocs(collection(db, 'projects', projDoc.id, 'materials'));
          const mats = matSnap.docs.map(d => d.data());
          const matTotal = mats.reduce((s, m) => s + (m.totalCost ?? 0), 0);
          setMaterials(prev => ({ total: prev.total + matTotal, count: prev.count + mats.length }));
        }
      } catch (e) { console.error('Finance load error', e); }
      finally { setLoading(false); }
    };
    load();
  }, []);

  const totalClaimable = claims.s1 + claims.s2 + claims.s3;

  if (!can('view:claims')) {
    return <div className={styles.accessDenied}><p>Finance overview is only available to Owner and Manager.</p></div>;
  }

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Finance Overview</h1>
        <p className={styles.pageSub}>Summary of project claims, payroll, and expenses</p>
      </div>

      {/* Tab bar */}
      <div className={styles.tabs}>
        {['overview', 'claims', 'payroll', 'petty'].map(t => (
          <button key={t} className={[styles.tabBtn, tab === t ? styles.tabActive : ''].join(' ')} onClick={() => setTab(t)}>
            {t === 'petty' ? 'Petty Cash' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className={styles.overviewWrap}>
          <div className={styles.statsGrid}>
            <StatTile label="Total Claimable"     value={fmtSGD(totalClaimable)} icon={CurrencyDollarIcon} color="green" sub="Based on block completion" />
            <StatTile label="Stage 1 Earned"      value={fmtSGD(claims.s1)}      icon={BriefcaseIcon}       color="blue"  sub="Fix 1 & 2 done" />
            <StatTile label="Stage 2 Earned"      value={fmtSGD(claims.s2)}      icon={BriefcaseIcon}       color="purple" sub="All fixes done" />
            <StatTile label="Latest Payroll"      value={payroll.total ? fmtSGD(payroll.total) : '—'} icon={ChartBarIcon} color="amber" sub={payroll.month || 'No payslips finalised'} />
            <StatTile label="Materials Spent"     value={fmtSGD(materials.total)} icon={WrenchScrewdriverIcon} color="red" sub={`${materials.count} delivery orders`} />
            <StatTile label="Petty Cash Pending"  value={fmtSGD(petty.pending)}  icon={ReceiptPercentIcon}  color="amber" sub="Awaiting approval" />
          </div>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent Petty Cash Claims</h2>
            {recentPc.length === 0 ? (
              <p className={styles.empty}>No claims yet.</p>
            ) : (
              <div className={styles.miniList}>
                {recentPc.map(c => (
                  <div key={c.id} className={styles.miniRow}>
                    <div>
                      <p className={styles.miniDesc}>{c.description}</p>
                      <p className={styles.miniMeta}>{c.name} · {fmtDate(c.createdAt)}</p>
                    </div>
                    <div className={styles.miniRight}>
                      <p className={styles.miniAmt}>{fmtSGD(c.amount)}</p>
                      <span className={[styles.statusBadge, styles[`status_${c.status}`]].join(' ')}>{c.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'claims' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Certis Claims Summary</h2>
          <p className={styles.sectionSub}>Based on current block completion data across all active projects.</p>
          <div className={styles.claimsGrid}>
            <div className={styles.claimRow}>
              <span className={styles.claimLabel}>Stage 1 (Fix 1 & 2 complete)</span>
              <span className={styles.claimAmt}>{fmtSGD(claims.s1)}</span>
            </div>
            <div className={styles.claimRow}>
              <span className={styles.claimLabel}>Stage 2 (All fixes complete)</span>
              <span className={styles.claimAmt}>{fmtSGD(claims.s2)}</span>
            </div>
            <div className={styles.claimRow}>
              <span className={styles.claimLabel}>Stage 3 (Decommission)</span>
              <span className={styles.claimAmt}>{fmtSGD(claims.s3)}</span>
            </div>
            <div className={[styles.claimRow, styles.claimTotal].join(' ')}>
              <span className={styles.claimLabel}>Total Claimable</span>
              <span className={styles.claimAmtBold}>{fmtSGD(totalClaimable)}</span>
            </div>
          </div>
          <p className={styles.claimNote}>Note: Stage 2 claims are net of materials. Configure per-project rates under Projects → Claims.</p>
        </div>
      )}

      {tab === 'payroll' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Payroll Summary</h2>
          <p className={styles.sectionSub}>Finalised payslips by month from the Salary Calculator.</p>
          {!payroll.month ? (
            <p className={styles.empty}>No finalised payslips yet. Go to Employees → Salary to generate payslips.</p>
          ) : (
            <div className={styles.payrollCard}>
              <p className={styles.payrollMonth}>{payroll.month}</p>
              <p className={styles.payrollAmt}>{fmtSGD(payroll.total)}</p>
              <p className={styles.payrollSub}>Total net pay for latest finalised month</p>
            </div>
          )}
        </div>
      )}

      {tab === 'petty' && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Petty Cash Summary</h2>
          <div className={styles.pcSummaryRow}>
            <div className={styles.pcSumCard}>
              <p className={styles.pcSumLbl}>Total Approved</p>
              <p className={styles.pcSumAmt} style={{ color: 'var(--green)' }}>{fmtSGD(petty.approved)}</p>
            </div>
            <div className={styles.pcSumCard}>
              <p className={styles.pcSumLbl}>Pending Approval</p>
              <p className={styles.pcSumAmt} style={{ color: 'var(--amber)' }}>{fmtSGD(petty.pending)}</p>
            </div>
          </div>
          <p className={styles.sectionSub}>Manage individual claims under Employees → Petty Cash.</p>
        </div>
      )}
    </div>
  );
}
