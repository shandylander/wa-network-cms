import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, updateDoc, collection, getDocs, arrayUnion, Timestamp,
} from 'firebase/firestore';
import {
  ArrowLeftIcon, MapPinIcon, CheckCircleIcon, DocumentIcon,
  PlusIcon, CameraIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import { stamp } from './jobUtils';
import JobCompletionForm from './JobCompletionForm';
import JobSummary from './JobSummary';
import styles from '../Worker/Worker.module.css';
import jobStyles from './Jobs.module.css';

const STEP_ORDER = ['scheduled', 'checkedIn', 'in-progress', 'completed'];

function fmtTime(t) {
  if (!t) return null;
  const d = t.toDate ? t.toDate() : new Date(t);
  return d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' });
}

// The technician's active working view for one job: check in, browse
// reference documents, log photos as work happens, then complete + sign.
// If the viewer isn't part of the assigned crew (e.g. a direct link opened
// by someone else) or the job's already finished, falls back to the
// read-only JobSummary instead of exposing actions that aren't theirs.
export default function JobDetail() {
  const { id }       = useParams();
  const navigate      = useNavigate();
  const { userProfile } = useAuth();
  const { toast }        = useToast();

  const [job,       setJob]       = useState(null);
  const [customerDocs, setCustomerDocs] = useState([]);
  const [projectDocs,  setProjectDocs]  = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [uploading,  setUploading]  = useState(false);
  const [completing, setCompleting] = useState(false);
  const fileRef = React.useRef();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDoc(doc(db, 'serviceJobs', id));
      if (!snap.exists()) { toast.error('Job not found'); navigate(-1); return; }
      const j = { id: snap.id, ...snap.data() };
      setJob(j);

      const docPromises = [
        getDocs(collection(db, 'customers', j.customerId, 'documents')).catch(() => null),
      ];
      if (j.projectId) docPromises.push(getDocs(collection(db, 'projects', j.projectId, 'documents')).catch(() => null));
      const [custSnap, projSnap] = await Promise.all(docPromises);
      setCustomerDocs(custSnap ? custSnap.docs.map(d => ({ id: d.id, source: 'Customer document', ...d.data() })) : []);
      setProjectDocs(projSnap ? projSnap.docs.map(d => ({ id: d.id, source: `From ${j.projectName}`, ...d.data() })) : []);
    } catch {
      toast.error('Failed to load job');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className={styles.uploadingBox}><div className={styles.spinner} /><p>Loading…</p></div>;
  }
  if (!job) return null;

  const myCrew   = job.crew?.[userProfile.userId];
  const isMine   = Boolean(myCrew);
  const isActive = job.status === 'scheduled' || job.status === 'in-progress';

  // Not my job, or already wrapped up — show the read-only summary instead.
  if (!isMine || !isActive) {
    return <JobSummary job={job} onClose={() => navigate(-1)} onUpdated={setJob} />;
  }

  const checkedIn = Boolean(myCrew.checkIn);

  const checkIn = async () => {
    setCheckingIn(true);
    try {
      const checkInStamp = await stamp();
      const crew = { ...job.crew, [userProfile.userId]: { ...myCrew, checkIn: checkInStamp } };
      const patch = { crew };
      if (job.status === 'scheduled') patch.status = 'in-progress';
      await updateDoc(doc(db, 'serviceJobs', job.id), patch);
      setJob(j => ({ ...j, ...patch }));
      toast.success('Checked in');
    } catch (err) {
      // Surface the real Firebase error code instead of a generic message —
      // "permission-denied" (rules/assignment issue) and "unavailable"/
      // "deadline-exceeded" (actual connectivity) need very different fixes,
      // and the old catch-all made them indistinguishable from the field.
      console.error('Check-in failed', err);
      const code = err?.code;
      if (code === 'permission-denied') {
        // TEMPORARY (remove once the root cause is confirmed): the
        // permission-denied rule has three independent clauses; report which
        // one the client-side data fails, right in the toast, since field
        // workers are on phones with no DevTools console to read.
        const hasBasePerm = (userProfile.effectivePermissions ?? []).includes('manage:service-reports');
        const inAssignedTo = (job.assignedTo ?? []).includes(userProfile.userId);
        toast.error(
          `Check-in blocked — perm:${hasBasePerm ? 'Y' : 'N'} assigned:${inAssignedTo ? 'Y' : 'N'} status:${job.status}. Please screenshot this and send to the office.`,
          15000,
        );
      } else if (code === 'unavailable' || code === 'deadline-exceeded') {
        toast.error('Check-in failed — no network connection. Try again when you have signal.');
      } else {
        toast.error(`Check-in failed${code ? ` (${code})` : ''} — please try again.`);
      }
    } finally {
      setCheckingIn(false);
    }
  };

  const addPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadToDropbox(file, `/WA! Network Asia CMS/Service Jobs/${job.customerName}`);
      const attachment = { url, fileName: file.name, fileSize: file.size, uploadedBy: userProfile.userId, uploadedAt: Timestamp.now() };
      await updateDoc(doc(db, 'serviceJobs', job.id), { attachments: arrayUnion(attachment) });
      setJob(j => ({ ...j, attachments: [...(j.attachments ?? []), attachment] }));
      toast.success('Photo added');
    } catch {
      toast.error('Photo upload failed — check your connection and try again.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const allDocs = [...customerDocs, ...projectDocs];
  const stepIndex = checkedIn ? STEP_ORDER.indexOf('in-progress') : STEP_ORDER.indexOf('scheduled');

  return (
    <div className={styles.page}>
      <p className={jobStyles.jdBack} onClick={() => navigate(-1)}>
        <ArrowLeftIcon width={14} /> Today's Jobs
      </p>
      <p className={jobStyles.jdTitle}>{job.customerName}</p>
      <p className={jobStyles.jdSub}>{job.scheduledNotes || 'Service visit'}</p>

      <div className={jobStyles.jdStatusTrack}>
        {['Assigned', 'Checked In', 'In Progress', 'Closed'].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <div className={[jobStyles.jdConnector, i <= stepIndex ? jobStyles.jdConnectorDone : ''].join(' ')} />}
            <div className={[jobStyles.jdStep, i < stepIndex ? jobStyles.jdStepDone : i === stepIndex ? jobStyles.jdStepNow : ''].join(' ')}>
              <div className={jobStyles.jdStepDot}>{i < stepIndex ? '✓' : i + 1}</div>
              <div className={jobStyles.jdStepLbl}>{label}</div>
            </div>
          </React.Fragment>
        ))}
      </div>

      {!checkedIn ? (
        <>
          <div className={jobStyles.infoCard}>
            <div className={jobStyles.infoRow}><span className={jobStyles.k}>Scheduled for</span><span>{job.scheduledDate}</span></div>
            {job.scheduledNotes && <div className={jobStyles.infoRow}><span className={jobStyles.k}>Notes from office</span><span>{job.scheduledNotes}</span></div>}
            {job.assignedToNames?.length > 1 && (
              <div className={jobStyles.infoRow}><span className={jobStyles.k}>With</span><span>{job.assignedToNames.filter(n => n !== userProfile.name).join(', ')}</span></div>
            )}
          </div>
          <p className={styles.statusSub} style={{ marginBottom: 4 }}>Arrived on site?</p>
          <p style={{ fontSize: 14, color: 'var(--text-sec)', marginBottom: 14 }}>
            Tap below to log your arrival time and location. This starts the job clock.
          </p>
          <button className={[styles.hugeBtn, styles.btnRed].join(' ')} onClick={checkIn} disabled={checkingIn}>
            <MapPinIcon className={styles.hugeBtnIcon} /> {checkingIn ? 'Checking in…' : 'Check In'}
          </button>
        </>
      ) : (
        <>
          <div className={jobStyles.infoCard}>
            <div className={jobStyles.infoRow}><span className={jobStyles.k}>Checked in</span><span>{fmtTime(myCrew.checkIn?.time)}</span></div>
            {myCrew.checkIn?.address && (
              <a className={jobStyles.gpsChip} href={`https://maps.google.com/?q=${myCrew.checkIn.lat},${myCrew.checkIn.lng}`} target="_blank" rel="noreferrer">
                <MapPinIcon width={13} style={{ display: 'inline', marginRight: 4 }} />{myCrew.checkIn.address}
              </a>
            )}
            {job.assignedToNames?.length > 1 && (
              <div className={jobStyles.infoRow} style={{ marginTop: 6 }}>
                <span className={jobStyles.k}>Crew</span>
                <span>{Object.entries(job.crew).map(([, c]) => `${c.name}${c.checkIn ? ' ✓' : ''}`).join(', ')}</span>
              </div>
            )}
          </div>

          <p className={styles.sectionTitle}>Photos · {job.attachments?.length ?? 0}</p>
          <div className={jobStyles.photoStrip}>
            {(job.attachments ?? []).map((a, i) => (
              <a key={i} href={a.url} target="_blank" rel="noreferrer" className={jobStyles.photoThumb}>
                <CameraIcon width={20} />
              </a>
            ))}
            <button className={jobStyles.photoAdd} onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '…' : <PlusIcon width={20} />}
            </button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={addPhoto} />
          </div>

          {allDocs.length > 0 && (
            <>
              <p className={styles.sectionTitle}>Documents for this site</p>
              <div className={jobStyles.infoCard}>
                {allDocs.map(d => (
                  <a key={d.id} href={d.url} target="_blank" rel="noreferrer" className={jobStyles.docRow}>
                    <DocumentIcon width={18} className={jobStyles.docIco} />
                    <div>
                      <div className={jobStyles.docName}>{d.name}</div>
                      <div className={jobStyles.docSrc}>{d.source}</div>
                    </div>
                  </a>
                ))}
              </div>
            </>
          )}

          <div style={{ height: 8 }} />
          <button className={[styles.hugeBtn, styles.btnRed].join(' ')} onClick={() => setCompleting(true)}>
            <CheckCircleIcon className={styles.hugeBtnIcon} /> Complete Job &amp; Sign Off
          </button>
        </>
      )}

      {completing && (
        <JobCompletionForm
          customerId={job.customerId}
          customerName={job.customerName}
          existingJob={job}
          onClose={() => setCompleting(false)}
          onSaved={(j) => { setJob(j); navigate(-1); }}
        />
      )}
    </div>
  );
}
