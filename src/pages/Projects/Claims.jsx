import React, { useState, useEffect, useMemo } from 'react';
import {
  collection, getDocs, addDoc, updateDoc, doc,
} from 'firebase/firestore';
import {
  PlusIcon, CheckCircleIcon, BanknotesIcon,
  ClockIcon, PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { TEAMS } from '../../utils/permissions';
import { todayInputSG } from '../../utils/helpers';
import Modal from '../../components/UI/Modal';
import Badge from '../../components/UI/Badge';
import Card, { CardHeader } from '../../components/UI/Card';
import Button from '../../components/UI/Button';
import styles from './Claims.module.css';

/* ── Constants ───────────────────────────────────────────────────── */

const STAGES = [
  { key: 'S1', label: 'Stage 1', desc: 'Fix 1 & Fix 2 complete' },
  { key: 'S2', label: 'Stage 2', desc: 'All 4 fixes complete (materials deducted)' },
  { key: 'S3', label: 'Stage 3', desc: 'Decommission' },
];

const STATUS_COLOR = {
  draft: 'default', submitted: 'amber', approved: 'blue', paid: 'green',
};
const STATUS_NEXT = {
  draft: 'submitted', submitted: 'approved', approved: 'paid',
};
const STATUS_NEXT_LABEL = {
  draft: 'Mark Submitted', submitted: 'Mark Approved', approved: 'Mark Paid',
};

const fmt = (n) => `$${Number(n ?? 0).toLocaleString('en-SG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ── Helpers ─────────────────────────────────────────────────────── */

const blockEligible = (b, stage) => {
  if (stage === 'S1') return (b.fix1 ?? 0) >= 100 && (b.fix2 ?? 0) >= 100;
  if (stage === 'S2') return (b.fix1 ?? 0) >= 100 && (b.fix2 ?? 0) >= 100 && (b.fix3 ?? 0) >= 100 && (b.fix4 ?? 0) >= 100;
  return false; // S3 (decommission) — manual entry only
};

/* ── Sub-component: New Claim Modal ─────────────────────────────── */

function NewClaimModal({ project, blocks, existingClaims, materialsTotal, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [stage,   setStage]   = useState('S1');
  const [certRef, setCertRef] = useState('');
  const [subDate, setSubDate] = useState('');
  const [notes,   setNotes]   = useState('');
  const [matDed,  setMatDed]  = useState('');
  const [saving,  setSaving]  = useState(false);

  const rate = project.rates?.[stage.toLowerCase()] ?? 0;

  // Blocks already claimed for this stage
  const claimedNos = useMemo(() => {
    const set = new Set();
    existingClaims.filter(c => c.stage === stage).forEach(c =>
      (c.blockNos ?? []).forEach(no => set.add(no))
    );
    return set;
  }, [existingClaims, stage]);

  const eligible = useMemo(() =>
    blocks.filter(b => blockEligible(b, stage) && !claimedNos.has(b.no)),
    [blocks, stage, claimedNos]
  );

  const count    = eligible.length;
  const gross    = count * rate;
  const deduct   = stage === 'S2' ? (Number(matDed) || materialsTotal) : 0;
  const net      = Math.max(0, gross - deduct);

  const handleSave = async () => {
    if (count === 0 && stage !== 'S3') {
      toast.error('No unclaimed eligible blocks for this stage');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        stage,
        blockNos:          eligible.map(b => b.no),
        blockCount:        stage === 'S3' ? 0 : count,
        ratePerBlock:      rate,
        grossAmount:       stage === 'S3' ? 0 : gross,
        materialsDeducted: stage === 'S2' ? deduct : 0,
        netAmount:         stage === 'S3' ? 0 : net,
        certisRef:         certRef.trim(),
        submittedDate:     subDate || null,
        status:            subDate ? 'submitted' : 'draft',
        notes:             notes.trim(),
        createdAt:         new Date(),
        createdBy:         userProfile.userId,
      };
      const ref = await addDoc(collection(db, 'projects', project.id, 'claims'), payload);
      onSaved({ id: ref.id, ...payload });
      toast.success('Claim created');
      onClose();
    } catch {
      toast.error('Failed to create claim');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Certis Claim" size="md">
      <div className={styles.modalBody}>
        <div className={styles.field}>
          <label className={styles.label}>Stage</label>
          <div className={styles.stageRow}>
            {STAGES.map(s => (
              <button
                key={s.key}
                className={[styles.stagePill, stage === s.key ? styles.stagePillActive : ''].join(' ')}
                onClick={() => setStage(s.key)}
                type="button"
              >
                {s.label}
                <span className={styles.stageDesc}>{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {stage !== 'S3' && (
          <div className={styles.claimSummaryBox}>
            <div className={styles.claimSummaryRow}>
              <span>Unclaimed eligible blocks</span>
              <strong>{count}</strong>
            </div>
            <div className={styles.claimSummaryRow}>
              <span>Rate per block</span>
              <strong>{fmt(rate)}</strong>
            </div>
            <div className={styles.claimSummaryRow}>
              <span>Gross amount</span>
              <strong>{fmt(gross)}</strong>
            </div>
            {stage === 'S2' && (
              <>
                <div className={styles.claimSummaryRow}>
                  <span>Materials deduction</span>
                  <input
                    type="number"
                    className={styles.inlineInput}
                    placeholder={`Default: ${fmt(materialsTotal)}`}
                    value={matDed}
                    onChange={e => setMatDed(e.target.value)}
                    min="0"
                  />
                </div>
                <div className={[styles.claimSummaryRow, styles.netRow].join(' ')}>
                  <span>Net amount</span>
                  <strong className={styles.netAmount}>{fmt(net)}</strong>
                </div>
              </>
            )}
            {stage === 'S1' && (
              <div className={[styles.claimSummaryRow, styles.netRow].join(' ')}>
                <span>Claim amount</span>
                <strong className={styles.netAmount}>{fmt(gross)}</strong>
              </div>
            )}
          </div>
        )}

        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.label}>Certis Reference No. <span className={styles.opt}>(optional)</span></label>
            <input className={styles.input} value={certRef} onChange={e => setCertRef(e.target.value)} placeholder="e.g. CERT-2025-001" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Submission Date <span className={styles.opt}>(optional)</span></label>
            <input type="date" className={styles.input} value={subDate} onChange={e => setSubDate(e.target.value)} />
          </div>
          <div className={[styles.field, styles.fieldFull].join(' ')}>
            <label className={styles.label}>Notes</label>
            <textarea className={styles.textarea} value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any notes…" />
          </div>
        </div>

        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>Create Claim</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ── Sub-component: Sub-con Rates Config ─────────────────────────── */

function SubconRatesConfig({ project, setProject }) {
  const { toast } = useToast();
  const [rates,   setRates]   = useState(() => project.subconRates ?? {});
  const [saving,  setSaving]  = useState(false);

  const teams = project.assignedTeams ?? [];

  const update = (team, stage, val) =>
    setRates(r => ({ ...r, [team]: { ...(r[team] ?? {}), [stage]: Number(val) } }));

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', project.id), { subconRates: rates });
      setProject(p => ({ ...p, subconRates: rates }));
      toast.success('Sub-con rates saved');
    } catch {
      toast.error('Failed to save rates');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Sub-con Rates (per block)" subtitle="Saved per project — adjustable per team per stage" />
      <div className={styles.ratesTable}>
        <div className={styles.ratesHeader}>
          <span>Team</span>
          <span>Stage 1</span>
          <span>Stage 2</span>
          <span>Stage 3</span>
        </div>
        {teams.map(team => (
          <div key={team} className={styles.ratesRow}>
            <span className={styles.ratesTeam}>{TEAMS[team] ?? team}</span>
            {['s1', 's2', 's3'].map(s => (
              <input
                key={s}
                type="number"
                className={styles.rateInput}
                value={rates[team]?.[s] ?? ''}
                onChange={e => update(team, s, e.target.value)}
                placeholder={`$${project.rates?.[s] ?? 0}`}
                min="0"
              />
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Button size="sm" onClick={save} loading={saving}>Save Rates</Button>
      </div>
    </Card>
  );
}

/* ── Main Component ─────────────────────────────────────────────── */

export default function Claims({ project, setProject, blocks, userRole }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const canAdmin        = ['owner', 'manager'].includes(userRole);

  const [innerTab, setInnerTab] = useState('certis');
  const [claims,   setClaims]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showNew,  setShowNew]  = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const snap = await getDocs(collection(db, 'projects', project.id, 'claims'));
        setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        toast.error('Failed to load claims');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [project.id, toast]);

  // Materials total — fetched separately for S2 deduction default
  const [materialsTotal, setMaterialsTotal] = useState(0);
  useEffect(() => {
    getDocs(collection(db, 'projects', project.id, 'deliveryOrders'))
      .then(snap => {
        const total = snap.docs.reduce((sum, d) => sum + (d.data().totalAmount ?? 0), 0);
        setMaterialsTotal(total);
      })
      .catch(() => {});
  }, [project.id]);

  const advanceStatus = async (claim) => {
    const next = STATUS_NEXT[claim.status];
    if (!next) return;
    try {
      const update = { status: next };
      if (next === 'paid') update.paidDate = todayInputSG();
      await updateDoc(doc(db, 'projects', project.id, 'claims', claim.id), update);
      setClaims(prev => prev.map(c => c.id === claim.id ? { ...c, ...update } : c));
      toast.success(`Claim marked as ${next}`);
    } catch {
      toast.error('Failed to update claim');
    }
  };

  // ── Summary stats ──
  const s1Eligible = useMemo(() => blocks.filter(b => blockEligible(b, 'S1')).length, [blocks]);
  const s2Eligible = useMemo(() => blocks.filter(b => blockEligible(b, 'S2')).length, [blocks]);

  const claimedNos = (stage) => {
    const set = new Set();
    claims.filter(c => c.stage === stage).forEach(c => (c.blockNos ?? []).forEach(no => set.add(no)));
    return set;
  };
  const s1Unclaimed = s1Eligible - claimedNos('S1').size;
  const s2Unclaimed = s2Eligible - claimedNos('S2').size;

  const totalClaimed = claims.reduce((s, c) => s + (c.netAmount ?? 0), 0);
  const totalPaid    = claims.filter(c => c.status === 'paid').reduce((s, c) => s + (c.netAmount ?? 0), 0);
  const outstanding  = totalClaimed - totalPaid;

  // ── Sub-con payment summary ──
  const subconSummary = useMemo(() => {
    const teams = [...new Set(blocks.map(b => b.team).filter(Boolean))];
    return teams.map(team => {
      const teamBlocks = blocks.filter(b => b.team === team);
      const s1Done = teamBlocks.filter(b => blockEligible(b, 'S1')).length;
      const s2Done = teamBlocks.filter(b => blockEligible(b, 'S2')).length;
      const r      = project.subconRates?.[team] ?? {};
      const s1Amt  = s1Done * (r.s1 ?? 0);
      const s2Amt  = s2Done * (r.s2 ?? 0);
      const total  = s1Amt + s2Amt;
      const paid   = claims
        .filter(c => c.team === team && c.status === 'paid')
        .reduce((s, c) => s + (c.amount ?? 0), 0);
      return { team, s1Done, s2Done, s1Amt, s2Amt, total, paid };
    });
  }, [blocks, project, claims]);

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      {/* Summary stats */}
      <div className={styles.statsGrid}>
        <div className={[styles.statCard, styles.statBlue].join(' ')}>
          <span className={styles.statVal}>{s1Eligible}</span>
          <span className={styles.statLabel}>Stage 1 Eligible</span>
          {s1Unclaimed > 0 && <span className={styles.statSub}>{s1Unclaimed} unclaimed</span>}
        </div>
        <div className={[styles.statCard, styles.statAmber].join(' ')}>
          <span className={styles.statVal}>{s2Eligible}</span>
          <span className={styles.statLabel}>Stage 2 Eligible</span>
          {s2Unclaimed > 0 && <span className={styles.statSub}>{s2Unclaimed} unclaimed</span>}
        </div>
        <div className={[styles.statCard, styles.statGreen].join(' ')}>
          <span className={styles.statVal}>{fmt(totalPaid)}</span>
          <span className={styles.statLabel}>Received from Certis</span>
        </div>
        <div className={[styles.statCard, styles.statRed].join(' ')}>
          <span className={styles.statVal}>{fmt(outstanding)}</span>
          <span className={styles.statLabel}>Outstanding</span>
        </div>
      </div>

      {/* Inner tabs */}
      <div className={styles.innerTabs}>
        <button className={[styles.innerTab, innerTab === 'certis' ? styles.innerTabActive : ''].join(' ')} onClick={() => setInnerTab('certis')}>
          Certis Claims
        </button>
        <button className={[styles.innerTab, innerTab === 'subcon' ? styles.innerTabActive : ''].join(' ')} onClick={() => setInnerTab('subcon')}>
          Sub-con Payments
        </button>
        {canAdmin && (
          <button className={[styles.innerTab, innerTab === 'rates' ? styles.innerTabActive : ''].join(' ')} onClick={() => setInnerTab('rates')}>
            Rate Config
          </button>
        )}
      </div>

      {/* ── Certis Claims ── */}
      {innerTab === 'certis' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Certis Claim Submissions</h3>
            {canAdmin && (
              <Button size="sm" onClick={() => setShowNew(true)}>
                <PlusIcon width={14} /> New Claim
              </Button>
            )}
          </div>

          {claims.length === 0 ? (
            <div className={styles.empty}>
              <BanknotesIcon width={36} />
              <p>No claims logged yet.</p>
              {canAdmin && <p>Create the first claim when Stage 1 or Stage 2 blocks are ready.</p>}
            </div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Blocks</th>
                    <th>Gross</th>
                    <th>Mat. Deducted</th>
                    <th>Net Claim</th>
                    <th>Certis Ref</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    {canAdmin && <th></th>}
                  </tr>
                </thead>
                <tbody>
                  {[...claims].sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0)).map(claim => (
                    <tr key={claim.id} className={styles.row}>
                      <td><Badge color={claim.stage === 'S1' ? 'blue' : claim.stage === 'S2' ? 'green' : 'default'}>{claim.stage}</Badge></td>
                      <td className={styles.tdNum}>{claim.blockCount ?? '—'}</td>
                      <td className={styles.tdAmt}>{fmt(claim.grossAmount)}</td>
                      <td className={styles.tdAmt}>{claim.materialsDeducted > 0 ? fmt(claim.materialsDeducted) : '—'}</td>
                      <td className={styles.tdAmtBold}>{fmt(claim.netAmount)}</td>
                      <td className={styles.tdRef}>{claim.certisRef || '—'}</td>
                      <td>{claim.submittedDate ?? '—'}</td>
                      <td><Badge color={STATUS_COLOR[claim.status] ?? 'default'}>{claim.status}</Badge></td>
                      {canAdmin && (
                        <td>
                          {claim.status !== 'paid' && (
                            <button className={styles.advBtn} onClick={() => advanceStatus(claim)}>
                              {STATUS_NEXT_LABEL[claim.status]}
                            </button>
                          )}
                          {claim.status === 'paid' && <CheckCircleIcon width={16} className={styles.paidIcon} />}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className={styles.totalRow}>
                    <td colSpan={4}><strong>Total</strong></td>
                    <td className={styles.tdAmtBold}>{fmt(totalClaimed)}</td>
                    <td colSpan={canAdmin ? 4 : 3} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-con Payments ── */}
      {innerTab === 'subcon' && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Sub-con Payment Summary</h3>
            <span className={styles.sectionNote}>Based on blocks completed per team × sub-con rate</span>
          </div>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Team</th>
                  <th>S1 Blocks Done</th>
                  <th>S1 Earned</th>
                  <th>S2 Blocks Done</th>
                  <th>S2 Earned</th>
                  <th>Total Earned</th>
                </tr>
              </thead>
              <tbody>
                {subconSummary.map(row => (
                  <tr key={row.team} className={styles.row}>
                    <td><span className={styles.teamChip}>{TEAMS[row.team] ?? row.team}</span></td>
                    <td className={styles.tdNum}>{row.s1Done}</td>
                    <td className={styles.tdAmt}>{fmt(row.s1Amt)}</td>
                    <td className={styles.tdNum}>{row.s2Done}</td>
                    <td className={styles.tdAmt}>{fmt(row.s2Amt)}</td>
                    <td className={styles.tdAmtBold}>{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className={styles.totalRow}>
                  <td colSpan={5}><strong>Total Sub-con Liability</strong></td>
                  <td className={styles.tdAmtBold}>{fmt(subconSummary.reduce((s, r) => s + r.total, 0))}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className={styles.ratesNote}>
            Rates configured under <button className={styles.linkBtn} onClick={() => setInnerTab('rates')}>Rate Config</button>. Sub-con payments are issued separately — contact admin to record actual disbursements.
          </p>
        </div>
      )}

      {/* ── Rate Config ── */}
      {innerTab === 'rates' && canAdmin && (
        <SubconRatesConfig project={project} setProject={setProject} />
      )}

      {showNew && (
        <NewClaimModal
          project={project}
          blocks={blocks}
          existingClaims={claims}
          materialsTotal={materialsTotal}
          onClose={() => setShowNew(false)}
          onSaved={c => setClaims(prev => [c, ...prev])}
        />
      )}
    </div>
  );
}
