import React, { useState } from 'react';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';
import { PrinterIcon, CheckCircleIcon, ArrowUturnLeftIcon, PencilSquareIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate, formatDateTime } from '../../utils/helpers';
import { STATUS_CONFIG } from './jobStatus';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import AssignJobModal from './AssignJobModal';
import logo from '../../assets/logo.png';
import banner from '../../assets/banner.png';
import styles from './Jobs.module.css';

// Layout mirrors the company's official paper Service Report form — the
// customer receives this as print/PDF, so every option is shown with its
// checkbox (ticked or not), not just the selected values.
const EQUIPMENT_OPTIONS = [
  ['cctv', 'CCTV'], ['doorAccess', 'Door Access'], ['network', 'Network'],
];
const JOB_OPTIONS = [
  ['maintenance', 'Maintenance'], ['housecall', 'Housecall'], ['delivery', 'Delivery'],
  ['installation', 'Installation'], ['testing', 'Testing and Commissioning'],
];

const DISCLAIMER =
  'I hereby confirm that the jobs and equipment listed above have been performed, delivered, installed, ' +
  'configured, tested and commissioned to my satisfaction, and I agree that billing will proceed on the ' +
  'commissioning date. I agree to fully indemnify WA! NETWORK ASIA for any loss or damage to the ' +
  'WA! NETWORK ASIA rented equipment (if any), and I agree that WA! NETWORK ASIA and its staff shall not be ' +
  'liable to me for any losses caused in connection with the jobs to the extent such exclusion of liability ' +
  'is permissible by law.';

function Chk({ on, children }) {
  return (
    <span className={styles.rptChk}>
      <span className={styles.rptBox}>{on ? '✓' : ' '}</span>
      <span>{children}</span>
    </span>
  );
}

const toDate = (s) => (s?.time ? (s.time.toDate ? s.time.toDate() : new Date(s.time)) : null);
const fmtTime = (d) => (d ? d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' }) : '—');

export default function JobSummary({ job, onClose, onUpdated }) {
  const { userProfile } = useAuth();
  const { toast }        = useToast();
  const { can }           = usePermissions();
  const canVet = can('jobs:vet');
  const canAssign = can('jobs:assign');
  const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.completed;

  const [vetting,    setVetting]    = useState(false);
  const [vetNotes,   setVetNotes]   = useState('');
  const [saving,     setSaving]     = useState(false);
  const [editing,    setEditing]    = useState(false);

  const crewEntries = Object.entries(job.crew ?? {});
  const checkIns  = crewEntries.map(([, c]) => toDate(c.checkIn)).filter(Boolean);
  const checkOuts = crewEntries.map(([, c]) => toDate(c.checkOut)).filter(Boolean);
  const arrival   = checkIns.length  ? new Date(Math.min(...checkIns.map(d => d.getTime())))  : null;
  const departure = checkOuts.length ? new Date(Math.max(...checkOuts.map(d => d.getTime()))) : null;
  const attendedBy = crewEntries.map(([, c]) => c.name).join(', ') || job.assignedToNames?.join(', ') || '—';

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

  if (editing) {
    return (
      <AssignJobModal
        customerId={job.customerId} customerName={job.customerName}
        projectId={job.projectId} projectName={job.projectName}
        existingJob={job}
        onClose={() => setEditing(false)}
        onSaved={(updated) => { onUpdated?.(updated); setEditing(false); }}
      />
    );
  }

  const hasEquipOthers = job.equipmentTypes?.includes('others');
  const hasJobOthers   = job.jobTypes?.includes('others');
  const chargeableYes  = job.chargeable === 'yes';

  return (
    <Modal isOpen onClose={onClose} title="Service Report" size="xl">
      <div className={styles.printArea}>

        <div className={styles.rptHead}>
          <img src={logo} alt="WA! Network Asia" className={styles.rptLogo} />
          <h1 className={styles.rptTitle}>Service Report</h1>
          <span className={[styles.pill, styles[sc.cls], styles.rptStatus, styles.printHide].join(' ')}>{sc.label}</span>
        </div>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>Customer Details</div>
          <div className={styles.rptTable}>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Name of Company</span><span className={styles.rptVal}>{job.customerName || '—'}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Name of Customer</span><span className={styles.rptVal}>{job.contactName || '—'}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Customer Address</span><span className={styles.rptVal}>{job.address || '—'}{job.postalCode ? ` — Postal Code: ${job.postalCode}` : ''}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Contact No.</span><span className={styles.rptVal}>{job.contactNo || '—'}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Project</span><span className={styles.rptVal}>{job.projectName || '—'}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Email of Customer</span><span className={styles.rptVal}>{job.email || '—'}</span></div>
          </div>
        </section>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>Type of Service</div>
          <div className={styles.rptBody}>
            <div className={styles.rptChkRow}>
              <span className={styles.rptInlineLbl}>Type of Equipment:</span>
              {EQUIPMENT_OPTIONS.map(([k, l]) => <Chk key={k} on={job.equipmentTypes?.includes(k)}>{l}</Chk>)}
              <Chk on={hasEquipOthers}>Others{hasEquipOthers && job.equipmentOther ? `: ${job.equipmentOther}` : ''}</Chk>
            </div>
          </div>
        </section>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>Jobs Details</div>
          <div className={styles.rptBody}>
            <div className={styles.rptChkRow}>
              {JOB_OPTIONS.map(([k, l]) => <Chk key={k} on={job.jobTypes?.includes(k)}>{l}</Chk>)}
              <Chk on={hasJobOthers}>Others{hasJobOthers && job.jobOther ? `: ${job.jobOther}` : ''}</Chk>
            </div>
            <span className={styles.rptLbl}>Job Description:</span>
            <div className={styles.rptLines}>{job.jobDescription}</div>
          </div>
        </section>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>Action Taken</div>
          <div className={styles.rptBody}>
            <div className={styles.rptLinesTall}>{job.actionTaken}</div>
          </div>
        </section>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>Others</div>
          <div className={styles.rptTable}>
            <div className={styles.rptCell}>
              <p className={styles.rptSubHead}>Charges Payable</p>
              <div className={styles.rptChkRow} style={{ marginBottom: 4 }}>
                <span className={styles.rptInlineLbl}>Chargeable service?</span>
                <Chk on={chargeableYes}>Yes</Chk>
                <Chk on={job.chargeable === 'no'}>No</Chk>
              </div>
              <div className={styles.rptChkCol}>
                <Chk on={chargeableYes && job.billingBasis === 'contract'}>As per existing subscribed Support Contract</Chk>
                <Chk on={chargeableYes && job.billingBasis === 'estimate'}>
                  Refer to the Sales Estimate No. {job.billingBasis === 'estimate' && job.salesEstimateNo ? job.salesEstimateNo : '__________'}
                </Chk>
                <Chk on={chargeableYes && job.billingBasis === 'cash'}>
                  Cash Collection — Amount: ${job.billingBasis === 'cash' && job.cashAmount != null ? Number(job.cashAmount).toFixed(2) : '__________'}
                </Chk>
              </div>
            </div>
            <div className={styles.rptCell}>
              <p className={styles.rptSubHead}>Remarks</p>
              <div className={styles.rptRemarks}>{job.remarks}</div>
              <div className={styles.rptChkRow} style={{ marginTop: 'auto', marginBottom: 0 }}>
                <span className={styles.rptInlineLbl}>Follow-up required:</span>
                <Chk on={job.followUpRequired === 'yes'}>Yes</Chk>
                <Chk on={job.followUpRequired === 'no'}>No</Chk>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>Customer Signature</div>
          <div className={styles.rptBody}>
            <p className={styles.rptDisclaimer}>{DISCLAIMER}</p>
            <div className={styles.rptSigRow}>
              <div className={styles.rptSigCol}>
                <div className={styles.rptSigVal}>
                  {job.signatureUrl ? <img src={job.signatureUrl} alt="Customer signature" className={styles.sigImg} /> : ' '}
                </div>
                <div className={styles.rptSigLine}>Signature of Customer{job.signerName ? ` — ${job.signerName}` : ''}</div>
              </div>
              <div className={styles.rptSigCol}>
                <div className={styles.rptSigVal}>{job.signedAt ? formatDate(job.signedAt) : ' '}</div>
                <div className={styles.rptSigLine}>Date</div>
              </div>
              <div className={styles.rptSigCol}>
                <div className={styles.rptSigVal}>{' '}</div>
                <div className={styles.rptSigLine}>Company Stamp (if applicable)</div>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.rptSection}>
          <div className={styles.rptBar}>For WA! NETWORK ASIA Use Only</div>
          <div className={styles.rptTable3}>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Arrival Time</span><span className={styles.rptVal}>{fmtTime(arrival)}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Attended by</span><span className={styles.rptVal}>{attendedBy}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Invoice No.</span><span className={styles.rptVal}>{job.invoiceNo || '—'}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Departure Time</span><span className={styles.rptVal}>{fmtTime(departure)}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Signature</span><span className={styles.rptVal}>{' '}</span></div>
            <div className={[styles.rptCell, styles.rptCellRow].join(' ')}><span className={styles.rptLbl}>Date</span><span className={styles.rptVal}>{job.scheduledDate || formatDate(job.createdAt)}</span></div>
          </div>
        </section>

        <div className={styles.rptFooter}>
          <div className={styles.rptFootText}>
            <strong>WA! NETWORK ASIA</strong> · Tel: (65) 6966 7034 · Mobile: (65) 9729 4378 · Email: andy.ng@wanetwork.asia<br />
            Company Registration: 53265469B · 186 Woodlands Industrial Park E5 #04-01L S757515
          </div>
          <img src={banner} alt="" className={styles.rptBanner} />
        </div>
      </div>

      {/* Internal-only info — visible on screen, never printed */}
      {job.scheduledNotes && (
        <div className={[styles.infoCard, styles.printHide].join(' ')} style={{ marginTop: 14 }}>
          <span className={styles.rptLbl}>Office Notes (internal)</span>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>{job.scheduledNotes}</p>
        </div>
      )}
      {(job.status === 'vetted' || job.status === 'needs-revision') && job.vettedByName && (
        <div className={[styles.infoCard, styles.printHide].join(' ')} style={{ marginTop: 14 }}>
          <span className={styles.rptLbl}>{job.status === 'vetted' ? 'Vetted (internal)' : 'Sent Back For Revision (internal)'}</span>
          <p style={{ margin: '4px 0 0', fontSize: 13 }}>
            {job.vettedByName} · {formatDateTime(job.vettedAt)}
            {job.vetNotes ? ` — ${job.vetNotes}` : ''}
          </p>
        </div>
      )}

      {canVet && job.status === 'completed' && (
        <div className={styles.printHide} style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
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
        {canAssign && job.status === 'scheduled' && (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <PencilSquareIcon width={15} style={{ marginRight: 6 }} /> Edit / Reschedule
          </Button>
        )}
        <Button onClick={() => window.print()}>
          <PrinterIcon width={15} style={{ marginRight: 6 }} /> Print / Save as PDF
        </Button>
      </div>
    </Modal>
  );
}
