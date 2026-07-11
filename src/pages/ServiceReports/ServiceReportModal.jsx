import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import SignaturePad from '../../components/UI/SignaturePad';
import styles from './ServiceReports.module.css';

const todaySG = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());

const EQUIPMENT_OPTIONS = [
  { value: 'cctv',       label: 'CCTV' },
  { value: 'doorAccess', label: 'Door Access' },
  { value: 'network',    label: 'Network' },
  { value: 'others',     label: 'Others' },
];

const JOB_OPTIONS = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'housecall',   label: 'Housecall' },
  { value: 'delivery',    label: 'Delivery' },
  { value: 'installation',label: 'Installation' },
  { value: 'testing',     label: 'Testing and Commissioning' },
  { value: 'others',      label: 'Others' },
];

const emptyForm = (attendedBy) => ({
  contactName: '', address: '', postalCode: '', contactNo: '', email: '',
  equipmentTypes: [], equipmentOther: '',
  jobTypes: [], jobOther: '',
  jobDescription: '', actionTaken: '',
  chargeable: '', billingBasis: '', salesEstimateNo: '', cashAmount: '',
  remarks: '', followUpRequired: '',
  visitDate: todaySG(), arrivalTime: '', departureTime: '',
  attendedBy, invoiceNo: '',
});

function dataUrlToFile(dataUrl, filename) {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)[1];
  const bin = atob(base64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], filename, { type: mime });
}

const toggle = (arr, value) => arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];

// Digital equivalent of the paper "Service Report" form — customer contact
// fields are pre-filled from the linked Customer record but stay editable
// per-visit (a different contact person may be on-site that day) without
// mutating the master Customer record.
export default function ServiceReportModal({ customerId, customerName, projectId, projectName, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [form,       setForm]       = useState(emptyForm(userProfile.name));
  const [signature,  setSignature]  = useState(null);
  const [signerName, setSignerName] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [progress,   setProgress]   = useState('');

  useEffect(() => {
    getDoc(doc(db, 'customers', customerId))
      .then(snap => {
        if (!snap.exists()) return;
        const c = snap.data();
        setForm(f => ({
          ...f,
          contactName: c.contactPerson ?? '',
          address: c.address ?? '',
          contactNo: c.phone ?? '',
          email: c.email ?? '',
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId]);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!form.jobDescription.trim()) { toast.error('Please describe the job.'); return; }
    if (!form.actionTaken.trim())    { toast.error('Please describe the action taken.'); return; }
    if (!signature)                  { toast.error('Customer signature is required.'); return; }
    if (!signerName.trim())          { toast.error("Please enter the signer's name."); return; }
    setSaving(true);
    try {
      setProgress('Uploading signature…');
      const sigFile = dataUrlToFile(signature, `signature-${Date.now()}.png`);
      const signatureUrl = await uploadToDropbox(sigFile, `/WA! Network Asia CMS/Service Reports/${customerName}`);
      setProgress('Saving report…');

      const payload = {
        customerId, customerName,
        projectId: projectId ?? null, projectName: projectName ?? null,
        ...form,
        cashAmount: form.cashAmount ? parseFloat(form.cashAmount) : null,
        signatureUrl, signerName: signerName.trim(), signedAt: Timestamp.now(),
        createdBy: userProfile.userId, createdByName: userProfile.name,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'serviceReports'), payload);
      toast.success('Service report saved');
      onSaved({ id: ref.id, ...payload });
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save report — check your connection and try again.');
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="New Service Report" size="xl">
      {loading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : (
        <div className={styles.form}>
          <p className={styles.sectionHead}>Customer Details</p>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label}>Name of Company</label>
              <input className={styles.input} value={customerName} disabled />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Name of Customer</label>
              <input className={styles.input} value={form.contactName} onChange={set('contactName')} placeholder="Dr / Mr / Miss / Mrs / Mdm ..." />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Customer Address</label>
              <input className={styles.input} value={form.address} onChange={set('address')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Postal Code</label>
              <input className={styles.input} value={form.postalCode} onChange={set('postalCode')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Contact No.</label>
              <input className={styles.input} value={form.contactNo} onChange={set('contactNo')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Email of Customer</label>
              <input type="email" className={styles.input} value={form.email} onChange={set('email')} />
            </div>
          </div>

          <p className={styles.sectionHead}>Type of Service</p>
          <div className={styles.checkRow}>
            {EQUIPMENT_OPTIONS.map(o => (
              <label key={o.value} className={styles.checkOption}>
                <input type="checkbox" checked={form.equipmentTypes.includes(o.value)}
                  onChange={() => setForm(f => ({ ...f, equipmentTypes: toggle(f.equipmentTypes, o.value) }))} />
                {o.label}
              </label>
            ))}
            {form.equipmentTypes.includes('others') && (
              <input className={styles.inlineInput} placeholder="Please specify"
                value={form.equipmentOther} onChange={set('equipmentOther')} />
            )}
          </div>

          <p className={styles.sectionHead}>Job Details</p>
          <div className={styles.checkRow}>
            {JOB_OPTIONS.map(o => (
              <label key={o.value} className={styles.checkOption}>
                <input type="checkbox" checked={form.jobTypes.includes(o.value)}
                  onChange={() => setForm(f => ({ ...f, jobTypes: toggle(f.jobTypes, o.value) }))} />
                {o.label}
              </label>
            ))}
            {form.jobTypes.includes('others') && (
              <input className={styles.inlineInput} placeholder="Please specify"
                value={form.jobOther} onChange={set('jobOther')} />
            )}
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Job Description</label>
            <textarea className={styles.textarea} rows={3} value={form.jobDescription} onChange={set('jobDescription')} />
          </div>

          <p className={styles.sectionHead}>Action Taken</p>
          <div className={styles.field}>
            <textarea className={styles.textarea} rows={5} value={form.actionTaken} onChange={set('actionTaken')}
              placeholder="What was done on-site" />
          </div>

          <p className={styles.sectionHead}>Charges Payable</p>
          <div className={styles.radioRow}>
            <span className={styles.radioLabel}>Chargeable service?</span>
            {['yes', 'no'].map(v => (
              <label key={v} className={styles.checkOption}>
                <input type="radio" name="chargeable" checked={form.chargeable === v}
                  onChange={() => setForm(f => ({ ...f, chargeable: v }))} />
                {v === 'yes' ? 'Yes' : 'No'}
              </label>
            ))}
          </div>
          {form.chargeable === 'yes' && (
            <div className={styles.radioCol}>
              {[
                ['contract', 'As per existing subscribed Support Contract'],
                ['estimate', 'Refer to the Sales Estimate No.'],
                ['cash',     'Cash Collection'],
              ].map(([v, label]) => (
                <label key={v} className={styles.checkOption}>
                  <input type="radio" name="billingBasis" checked={form.billingBasis === v}
                    onChange={() => setForm(f => ({ ...f, billingBasis: v }))} />
                  {label}
                  {v === 'estimate' && form.billingBasis === 'estimate' && (
                    <input className={styles.inlineInput} value={form.salesEstimateNo} onChange={set('salesEstimateNo')} placeholder="Estimate No." />
                  )}
                  {v === 'cash' && form.billingBasis === 'cash' && (
                    <input className={styles.inlineInput} type="number" value={form.cashAmount} onChange={set('cashAmount')} placeholder="Amount $" />
                  )}
                </label>
              ))}
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Remarks</label>
            <textarea className={styles.textarea} rows={2} value={form.remarks} onChange={set('remarks')} />
          </div>
          <div className={styles.radioRow}>
            <span className={styles.radioLabel}>Follow-up required?</span>
            {['yes', 'no'].map(v => (
              <label key={v} className={styles.checkOption}>
                <input type="radio" name="followUp" checked={form.followUpRequired === v}
                  onChange={() => setForm(f => ({ ...f, followUpRequired: v }))} />
                {v === 'yes' ? 'Yes' : 'No'}
              </label>
            ))}
          </div>

          <p className={styles.sectionHead}>Visit Details</p>
          <div className={styles.grid3}>
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input type="date" className={styles.input} value={form.visitDate} onChange={set('visitDate')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Arrival Time</label>
              <input type="time" className={styles.input} value={form.arrivalTime} onChange={set('arrivalTime')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Departure Time</label>
              <input type="time" className={styles.input} value={form.departureTime} onChange={set('departureTime')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Attended By</label>
              <input className={styles.input} value={form.attendedBy} onChange={set('attendedBy')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Invoice No. <span className={styles.opt}>(optional)</span></label>
              <input className={styles.input} value={form.invoiceNo} onChange={set('invoiceNo')} />
            </div>
          </div>

          <p className={styles.sectionHead}>Customer Signature</p>
          <p className={styles.disclaimer}>
            I hereby confirm that the jobs and equipment listed above have been performed, delivered, installed,
            configured, tested and commissioned to my satisfaction, and I agree that billing will proceed on the
            commissioning date. I agree to fully indemnify WA! NETWORK ASIA for any loss or damage to the
            WA! NETWORK ASIA rented equipment (if any), and I agree that WA! NETWORK ASIA and its staff shall
            not be liable to me for any losses caused in connection with the jobs to the extent such exclusion of
            liability is permissible by law.
          </p>
          <div className={styles.field}>
            <label className={styles.label}>Signer's Name</label>
            <input className={styles.input} value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Name of person signing" />
          </div>
          <SignaturePad onChange={setSignature} />

          <div className={styles.actions}>
            {progress && <span className={styles.progressText}>{progress}</span>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Save Report</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
