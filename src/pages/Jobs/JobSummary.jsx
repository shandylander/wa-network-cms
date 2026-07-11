import React, { useState } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { PrinterIcon, CheckCircleIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { STATUS_CONFIG } from './jobStatus';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './Jobs.module.css';

const EQUIPMENT_LABELS = { cctv: 'CCTV', doorAccess: 'Door Access', network: 'Network', others: 'Others' };
const JOB_LABELS = {
  maintenance: 'Maintenance', housecall: 'Housecall', delivery: 'Delivery',
  installation: 'Installation', testing: 'Testing and Commissioning', others: 'Others',
};
const BILLING_LABELS = {
  contract: 'As per existing subscribed Support Contract',
  estimate: 'Refer to Sales Estimate',
  cash: 'Cash Collection',
};

function fmtChecks(values, labels, otherKey, job) {
  if (!values?.length) return '—';
  return values.map(v => v === 'others' && job[otherKey] ? `Others (${job[otherKey]})` : labels[v] ?? v).join(', ');
}

function fmtStamp(s) {
  if (!s?.time) return '—';
  const t = s.time.toDate ? s.time.toDate() : new Date(s.time);
  return t.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
}

export default function JobSummary({ job, onClose, onUpdated }) {
  const { userProfile } = useAuth();
  const { toast }        = useToast();
  const { can }           = usePermissions();
  const canVet = can('jobs:vet');
  const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.completed;

  const [vetting,    setVetting]    = useState(false);
  const [vetNotes,   setVetNotes]   = useState('');
  const [saving,     setSaving]     = useState(false);

  const crewEntries = Object.entries(job.crew ?? {});

  const decide = async (decision) => {
    if (decision === 'needs-revision' && !vetNotes.trim()) {
      toast.error('Please explain what needs to be fixed.');
      return;
    }
    setSaving(true);
    try {
      const update = {
        status: decision,
        vettedBy: userProfile.userId, vettedByName: userProfile.name,
        vettedAt: Timestamp.now(),
        vetNotes: decision === 'needs-revision' ? vetNotes.trim() : null,
      };
      await updateDoc(doc(db, 'serviceJobs', job.id), update);
      toast.success(decision === 'vetted' ? 'Job vetted' : 'Sent back for revision');
      onUpdated?.({ ...job, ...update });
      setVetting(false);
    } catch {
      toast.error('Failed to record decision');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Service Report" size="xl">
      <div className={styles.printArea}>
        <div className={styles.printHead}>
          <h1 className={styles.printTitle}>Service Report</h1>
          <div className={styles.printCompany}>
            <strong>WA! NETWORK ASIA</strong><br />
            Tel: (65) 6966 7034 · Mobile: (65) 9729 4378<br />
            Email: andy.ng@wanetwork.asia<br />
            186 Woodlands Industrial Park E5 #04-01L S757515
          </div>
        </div>

        <span className={[styles.pill, styles[sc.cls]].join(' ')} style={{ marginBottom: 12, display: 'inline-block' }}>{sc.label}</span>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Customer Details</div>
          <div className={styles.printGrid}>
            <div className={styles.printRow}><span className={styles.printKey}>Company:</span><span className={styles.printVal}>{job.customerName}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Customer:</span><span className={styles.printVal}>{job.contactName || '—'}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Address:</span><span className={styles.printVal}>{job.address || '—'}{job.postalCode ? ` (${job.postalCode})` : ''}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Contact No.:</span><span className={styles.printVal}>{job.contactNo || '—'}</span></div>
            <div className={styles.printRow}><span className={styles.printKey}>Email:</span><span className={styles.printVal}>{job.email || '—'}</span></div>
            {job.projectName && (
              <div className={styles.printRow}><span className={styles.printKey}>Project:</span><span className={styles.printVal}>{job.projectName}</span></div>
            )}
          </div>
        </div>

        {job.scheduledNotes && (
          <div className={styles.printSection}>
            <div className={styles.printSectionHead}>Office Notes</div>
            <p className={styles.printText}>{job.scheduledNotes}</p>
          </div>
        )}

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Type of Service</div>
          <p className={styles.printText}>{fmtChecks(job.equipmentTypes, EQUIPMENT_LABELS, 'equipmentOther', job)}</p>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Job Details</div>
          <p className={styles.printText}>{fmtChecks(job.jobTypes, JOB_LABELS, 'jobOther', job)}</p>
          <p className={styles.printText} style={{ marginTop: 6 }}>{job.jobDescription}</p>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Action Taken</div>
          <p className={styles.printText}>{job.actionTaken}</p>
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Charges Payable</div>
          <div className={styles.printGrid}>
            <div className={styles.printRow}><span className={styles.printKey}>Chargeable:</span><span className={styles.printVal}>{job.chargeable === 'yes' ? 'Yes' : job.chargeable === 'no' ? 'No' : '—'}</span></div>
            {job.chargeable === 'yes' && (
              <div className={styles.printRow}>
                <span className={styles.printKey}>Basis:</span>
                <span className={styles.printVal}>
                  {BILLING_LABELS[job.billingBasis] ?? '—'}
                  {job.billingBasis === 'estimate' && job.salesEstimateNo ? ` #${job.salesEstimateNo}` : ''}
                  {job.billingBasis === 'cash' && job.cashAmount != null ? ` — $${Number(job.cashAmount).toFixed(2)}` : ''}
                </span>
              </div>
            )}
            <div className={styles.printRow}><span className={styles.printKey}>Follow-up:</span><span className={styles.printVal}>{job.followUpRequired === 'yes' ? 'Yes' : job.followUpRequired === 'no' ? 'No' : '—'}</span></div>
          </div>
          {job.remarks && <p className={styles.printText} style={{ marginTop: 6 }}>{job.remarks}</p>}
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Visit Details</div>
          <div className={styles.printGrid}>
            <div className={styles.printRow}><span className={styles.printKey}>Date:</span><span className={styles.printVal}>{job.scheduledDate}</span></div>
            {job.invoiceNo && (
              <div className={styles.printRow}><span className={styles.printKey}>Invoice No.:</span><span className={styles.printVal}>{job.invoiceNo}</span></div>
            )}
          </div>
          <p className={styles.printKey} style={{ marginTop: 8, marginBottom: 4 }}>Crew:</p>
          {crewEntries.length === 0 ? (
            <p className={styles.printText}>—</p>
          ) : crewEntries.map(([uid, c]) => (
            <div key={uid} className={styles.printRow}>
              <span className={styles.printVal}>{c.name}</span>
              <span className={styles.printVal} style={{ color: 'var(--text-sec)' }}>
                In {fmtStamp(c.checkIn)} → Out {fmtStamp(c.checkOut)}
              </span>
            </div>
          ))}
        </div>

        <div className={styles.printSection}>
          <div className={styles.printSectionHead}>Customer Signature</div>
          <div className={styles.sigBlock}>
            {job.signatureUrl && <img src={job.signatureUrl} alt="Customer signature" className={styles.sigImg} />}
            <div className={styles.sigMeta}>
              {job.signerName}<br />
              {formatDate(job.signedAt)}
            </div>
          </div>
        </div>

        {(job.status === 'vetted' || job.status === 'needs-revision') && job.vettedByName && (
          <div className={styles.printSection}>
            <div className={styles.printSectionHead}>{job.status === 'vetted' ? 'Vetted' : 'Sent Back For Revision'}</div>
            <p className={styles.printText}>
              {job.vettedByName} · {formatDateTime(job.vettedAt)}
              {job.vetNotes ? ` — ${job.vetNotes}` : ''}
            </p>
          </div>
        )}
      </div>

      {canVet && job.status === 'completed' && (
        <div className={styles.printHide} style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 }}>
          {vetting ? (
            <div className={styles.field}>
              <label className={styles.label} htmlFor="vet-notes">What needs to be fixed?</label>
              <textarea id="vet-notes" className={styles.textarea} rows={2} value={vetNotes} onChange={e => setVetNotes(e.target.value)} />
              <div className={styles.actions} style={{ marginTop: 8 }}>
                <Button variant="secondary" onClick={() => setVetting(false)}>Cancel</Button>
                <Button variant="danger" onClick={() => decide('needs-revision')} loading={saving}>Send Back</Button>
              </div>
            </div>
          ) : (
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setVetting(true)}>
                <ArrowUturnLeftIcon width={14} style={{ marginRight: 6 }} /> Needs Revision
              </Button>
              <Button onClick={() => decide('vetted')} loading={saving}>
                <CheckCircleIcon width={15} style={{ marginRight: 6 }} /> Vet & Approve
              </Button>
            </div>
          )}
        </div>
      )}

      <div className={[styles.detailActions, styles.printHide].join(' ')}>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        <Button onClick={() => window.print()}>
          <PrinterIcon width={15} style={{ marginRight: 6 }} /> Print / Save as PDF
        </Button>
      </div>
    </Modal>
  );
}
