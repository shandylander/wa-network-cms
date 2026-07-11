import React, { useState, useEffect } from 'react';
import { collection, doc, getDoc, addDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import { stamp } from './jobUtils';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import SignaturePad from '../../components/UI/SignaturePad';
import styles from './Jobs.module.css';

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

const emptyForm = () => ({
  contactName: '', address: '', postalCode: '', contactNo: '', email: '',
  equipmentTypes: [], equipmentOther: '',
  jobTypes: [], jobOther: '',
  jobDescription: '', actionTaken: '',
  chargeable: '', billingBasis: '', salesEstimateNo: '', cashAmount: '',
  remarks: '', followUpRequired: '',
  invoiceNo: '',
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

// Digital equivalent of the paper "Service Report" form — now doubles as the
// job-completion step. Two modes:
//  - ad-hoc (no existingJob): technician creates + completes a job in one
//    session, exactly like the original single-step flow.
//  - completing a scheduled job (existingJob passed in): stamps this user's
//    check-out on the shared crew record and marks the job completed.
// Customer contact fields are pre-filled from the linked Customer record but
// stay editable per-visit (a different contact person may be on-site that
// day) without mutating the master Customer record.
export default function JobCompletionForm({ customerId, customerName, projectId, projectName, existingJob, onClose, onSaved }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [form,       setForm]       = useState(emptyForm());
  const [signature,  setSignature]  = useState(null);
  const [signerName, setSignerName] = useState('');
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [progress,   setProgress]   = useState('');

  useEffect(() => {
    if (existingJob) {
      setForm(f => ({ ...f, ...existingJob }));
      setLoading(false);
      return;
    }
    getDoc(doc(db, 'customers', customerId))
      .then(snap => {
        if (!snap.exists()) return;
        const c = snap.data();
        setForm(f => ({
          ...f,
          contactName: c.contactPerson ?? '',
          address: c.address ?? '',
          postalCode: c.postalCode ?? '',
          contactNo: c.phone ?? '',
          email: c.email ?? '',
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [customerId, existingJob]);

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
      const signatureUrl = await uploadToDropbox(sigFile, `/WA! Network Asia CMS/Service Jobs/${customerName}`);

      const reportFields = {
        contactName: form.contactName, address: form.address, postalCode: form.postalCode,
        contactNo: form.contactNo, email: form.email,
        equipmentTypes: form.equipmentTypes, equipmentOther: form.equipmentOther,
        jobTypes: form.jobTypes, jobOther: form.jobOther,
        jobDescription: form.jobDescription, actionTaken: form.actionTaken,
        chargeable: form.chargeable, billingBasis: form.billingBasis,
        salesEstimateNo: form.salesEstimateNo,
        cashAmount: form.cashAmount ? parseFloat(form.cashAmount) : null,
        remarks: form.remarks, followUpRequired: form.followUpRequired,
        invoiceNo: form.invoiceNo,
        signatureUrl, signerName: signerName.trim(), signedAt: Timestamp.now(),
      };

      if (existingJob) {
        setProgress('Checking out…');
        const checkOut = await stamp();
        const crew = { ...(existingJob.crew ?? {}) };
        const mine = crew[userProfile.userId] ?? { name: userProfile.name, checkIn: null };
        crew[userProfile.userId] = { ...mine, checkOut };

        const payload = { ...reportFields, status: 'completed', crew };
        await updateDoc(doc(db, 'serviceJobs', existingJob.id), payload);
        toast.success('Job completed');
        onSaved({ ...existingJob, ...payload });
      } else {
        setProgress('Saving job…');
        const now = await stamp();
        const payload = {
          customerId, customerName,
          projectId: projectId ?? null, projectName: projectName ?? null,
          ...reportFields,
          status: 'completed',
          assignedTo: [userProfile.userId], assignedToNames: [userProfile.name],
          assignedBy: null, scheduledDate: todaySG(), scheduledNotes: '',
          crew: { [userProfile.userId]: { name: userProfile.name, checkIn: now, checkOut: now } },
          vettedBy: null, vettedByName: null, vettedAt: null, vetNotes: null,
          createdBy: userProfile.userId, createdByName: userProfile.name,
          createdAt: Timestamp.now(),
        };
        const ref = await addDoc(collection(db, 'serviceJobs'), payload);
        toast.success('Service job saved');
        onSaved({ id: ref.id, ...payload });
      }
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save — check your connection and try again.');
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={existingJob ? 'Complete Job' : 'New Service Job'} size="xl">
      {loading ? (
        <div className={styles.loadingBox}><div className={styles.spinner} /></div>
      ) : (
        <div className={styles.form}>
          <p className={styles.sectionHead}>Customer Details</p>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-company">Name of Company</label>
              <input id="sr-company" className={styles.input} value={customerName} disabled />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-contactName">Name of Customer</label>
              <input id="sr-contactName" className={styles.input} value={form.contactName} onChange={set('contactName')} placeholder="Dr / Mr / Miss / Mrs / Mdm ..." />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-address">Customer Address</label>
              <input id="sr-address" className={styles.input} value={form.address} onChange={set('address')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-postalCode">Postal Code</label>
              <input id="sr-postalCode" className={styles.input} value={form.postalCode} onChange={set('postalCode')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-contactNo">Contact No.</label>
              <input id="sr-contactNo" className={styles.input} value={form.contactNo} onChange={set('contactNo')} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-email">Email of Customer</label>
              <input id="sr-email" type="email" className={styles.input} value={form.email} onChange={set('email')} />
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
            <label className={styles.label} htmlFor="sr-jobDescription">Job Description</label>
            <textarea id="sr-jobDescription" className={styles.textarea} rows={3} value={form.jobDescription} onChange={set('jobDescription')} />
          </div>

          <label className={styles.sectionHead} htmlFor="sr-actionTaken" style={{ display: 'block' }}>Action Taken</label>
          <div className={styles.field}>
            <textarea id="sr-actionTaken" className={styles.textarea} rows={5} value={form.actionTaken} onChange={set('actionTaken')}
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
            <label className={styles.label} htmlFor="sr-remarks">Remarks</label>
            <textarea id="sr-remarks" className={styles.textarea} rows={2} value={form.remarks} onChange={set('remarks')} />
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
              <span className={styles.label}>Date</span>
              <span className={styles.readonlyVal}>{existingJob ? existingJob.scheduledDate : todaySG()}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{existingJob ? 'Crew' : 'Attended By'}</span>
              <span className={styles.readonlyVal}>
                {existingJob ? existingJob.assignedToNames?.join(', ') : userProfile.name}
              </span>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="sr-invoiceNo">Invoice No. <span className={styles.opt}>(optional)</span></label>
              <input id="sr-invoiceNo" className={styles.input} value={form.invoiceNo} onChange={set('invoiceNo')} />
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
            <label className={styles.label} htmlFor="sr-signerName">Signer's Name</label>
            <input id="sr-signerName" className={styles.input} value={signerName} onChange={e => setSignerName(e.target.value)} placeholder="Name of person signing" />
          </div>
          <SignaturePad onChange={setSignature} />

          <div className={styles.actions}>
            {progress && <span className={styles.progressText}>{progress}</span>}
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{existingJob ? 'Complete & Sign Off' : 'Save Job'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
