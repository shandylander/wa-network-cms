import React, { useState, useEffect, useRef } from 'react';
import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import {
  PlusIcon, TrashIcon, PaperClipIcon, DocumentIcon, CameraIcon,
  CheckCircleIcon, ExclamationTriangleIcon, UserCircleIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useTeams, useCertTypes } from '../../hooks/useAppConfig';
import { compressImage, uploadWorkerDoc, extractDocument } from '../../utils/workerDocs';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import styles from './WorkerModal.module.css';

const EMPTY_CERT = { type: '', name: '', issueDate: '', expiry: '', url: '', fileName: '' };
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));

function certBadge(expiry) {
  if (!expiry) return { label: 'No expiry', color: 'default' };
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
  if (days < 0)   return { label: 'Expired',  color: 'red'   };
  if (days <= 30) return { label: `${days}d`,  color: 'amber' };
  return { label: 'Valid', color: 'green' };
}

export default function WorkerModal({ mode, worker, onClose, onSaved, userRole, userTeam }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }          = usePermissions();
  const { teams: TEAMS, teamOptions } = useTeams();
  const { certTypes }   = useCertTypes();
  const isAdmin = can('workers:assign-any-team');
  const certFileRef  = useRef(null);
  const photoFileRef = useRef(null);

  const [form, setForm] = useState({
    name:        worker?.name        ?? '',
    nric:        worker?.nric        ?? '',
    designation: worker?.designation ?? '',
    contact:     worker?.contact     ?? '',
    team:        worker?.team        ?? (isAdmin ? '' : userTeam ?? ''),
    status:      worker?.status      ?? 'active',
    linkedUserId: worker?.linkedUserId ?? '',
    photoUrl:    worker?.photoUrl    ?? '',
  });
  const [certs,        setCerts]        = useState(worker?.certs ?? []);
  const [newCert,       setNewCert]      = useState(EMPTY_CERT);
  const [showAdd,       setShowAdd]      = useState(false);
  const [saving,        setSaving]       = useState(false);
  const [uploading,      setUploading]     = useState(false);
  const [certOcrState,  setCertOcrState] = useState('none'); // none|working|done|failed
  const [photoUploading, setPhotoUploading] = useState(false);

  // Users available to link (only fetched while this worker isn't linked to
  // an account yet — new workers via "Add", or existing ones an admin is
  // retroactively connecting so the worker can see their own certs/photo
  // under Profile → My Documents).
  const [userList, setUserList] = useState([]);
  useEffect(() => {
    if (worker?.linkedUserId) return;
    getDocs(collection(db, 'users')).then(snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.status === 'active')
        .sort((a, b) => a.name?.localeCompare(b.name));
      setUserList(list);
    }).catch(() => {});
  }, [worker?.linkedUserId]);

  const handleImportUser = (userId) => {
    if (!userId) {
      setForm(f => ({ ...f, linkedUserId: '' }));
      return;
    }
    const u = userList.find(u => u.userId === userId);
    if (!u) return;
    // Adding a brand-new worker from a user account pre-fills their details;
    // linking an *existing* worker record just connects the account without
    // overwriting whatever's already been entered for them.
    setForm(f => mode === 'add'
      ? { ...f, linkedUserId: u.userId, name: u.name || f.name, team: u.team || f.team, contact: u.contact || f.contact }
      : { ...f, linkedUserId: u.userId });
  };

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handlePhotoFile = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    if (!raw.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    if (raw.size > 10 * 1024 * 1024) { toast.error('File too large (max 10 MB)'); return; }
    setPhotoUploading(true);
    try {
      const file = await compressImage(raw);
      const url  = await uploadWorkerDoc(file, 'avatars', userProfile.userId);
      setForm(f => ({ ...f, photoUrl: url }));
    } catch {
      toast.error('Upload failed. Try again.');
    } finally {
      setPhotoUploading(false);
    }
  };

  // Photo → Firebase Storage (for OCR + storage) and, in parallel, Gemini
  // OCR to prefill type/name/dates. OCR failure never blocks the upload —
  // it just leaves the fields for manual entry, same fallback pattern as
  // the MC/receipt wizards.
  const handleCertFile = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    if (raw.size > 10 * 1024 * 1024) { toast.error('File too large (max 10 MB)'); return; }
    setUploading(true);
    setCertOcrState('working');
    try {
      const file = await compressImage(raw);
      const [url, ocr] = await Promise.all([
        uploadWorkerDoc(file, 'certs', userProfile.userId),
        extractDocument(file, 'cert').catch(() => null),
      ]);
      setNewCert(c => ({
        ...c,
        url, fileName: raw.name,
        type: c.type || (ocr?.certName ? 'other' : c.type),
        name: c.name || ocr?.certName || '',
        issueDate: isISO(ocr?.issueDate) ? ocr.issueDate : c.issueDate,
        expiry: isISO(ocr?.expiryDate) ? ocr.expiryDate : c.expiry,
      }));
      setCertOcrState(ocr ? 'done' : 'failed');
      if (!ocr) toast.error('Could not read the certificate. Please check the details below.');
    } catch {
      setCertOcrState('none');
      toast.error('Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const addCert = () => {
    const typeInfo = certTypes.find(t => t.key === newCert.type);
    const name = newCert.type === 'other' ? newCert.name.trim() : (typeInfo?.label ?? '');
    if (!name) return;
    setCerts(c => [...c, {
      type: newCert.type === 'other' ? '' : newCert.type,
      name,
      issueDate: newCert.issueDate || null,
      expiry: newCert.expiry,
      url: newCert.url,
      fileName: newCert.fileName,
      uploadedAt: newCert.url ? new Date().toISOString() : null,
      uploadedBy: newCert.url ? userProfile.userId : null,
    }]);
    setNewCert(EMPTY_CERT);
    setCertOcrState('none');
    setShowAdd(false);
  };

  const removeCert = (idx) => setCerts(c => c.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, certs, updatedAt: new Date(), updatedBy: userProfile.userId };
      if (mode === 'add') {
        const ref = await addDoc(collection(db, 'workers'), {
          ...payload,
          createdAt: new Date(),
          createdBy: userProfile.userId,
        });
        toast.success('Worker added');
        onSaved({ id: ref.id, ...payload }, true);
      } else {
        await updateDoc(doc(db, 'workers', worker.id), payload);
        toast.success('Worker updated');
        onSaved({ ...worker, ...payload }, false);
      }
    } catch {
      toast.error('Failed to save worker');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={mode === 'add' ? 'Add Worker' : 'Edit Worker'} size="md">

      {/* Import from / link to an existing user account */}
      {!form.linkedUserId && userList.length > 0 && (
        <div className={styles.importBar}>
          <label className={styles.importLabel}>{mode === 'add' ? 'Import from user account' : 'Link to user account'}</label>
          <select
            className={styles.importSelect}
            value={form.linkedUserId}
            onChange={e => handleImportUser(e.target.value)}
          >
            <option value="">— Enter manually —</option>
            {userList.map(u => (
              <option key={u.userId} value={u.userId}>
                {u.name} ({u.userId}) · {TEAMS[u.team] ?? u.team ?? '—'}
              </option>
            ))}
          </select>
        </div>
      )}
      {form.linkedUserId && (
        <p className={styles.importHint}>
          {mode === 'add'
            ? 'Name, team and contact pre-filled. Add NRIC, designation and certs below.'
            : `Linked to ${form.linkedUserId} — they'll see their certs and photo under Profile → My Documents.`}
        </p>
      )}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Basic Info</h4>

        {/* Optional worker photo */}
        <div className={styles.photoRow}>
          <button type="button" className={styles.photoBtn} onClick={() => photoFileRef.current?.click()} disabled={photoUploading}>
            {form.photoUrl
              ? <img src={form.photoUrl} alt="" className={styles.photoImg} />
              : <UserCircleIcon className={styles.photoPlaceholder} />}
          </button>
          <div>
            <button type="button" className={styles.photoLinkBtn} onClick={() => photoFileRef.current?.click()} disabled={photoUploading}>
              <CameraIcon width={14} /> {photoUploading ? 'Uploading…' : form.photoUrl ? 'Change photo' : 'Add photo'}
            </button>
            <p className={styles.photoHint}>Optional</p>
          </div>
          <input ref={photoFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoFile} />
        </div>

        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Full Name *</label>
            <input className={styles.input} value={form.name} onChange={setF('name')} placeholder="e.g. Ahmad Bin Ali" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>NRIC (last 4 + letter)</label>
            <input className={styles.input} value={form.nric} onChange={setF('nric')} placeholder="e.g. 789A" maxLength={5} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Designation</label>
            <input className={styles.input} value={form.designation} onChange={setF('designation')} placeholder="e.g. Technician" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contact</label>
            <input className={styles.input} value={form.contact} onChange={setF('contact')} placeholder="e.g. 9123 4567" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Team</label>
            <select className={styles.input} value={form.team} onChange={setF('team')} disabled={!isAdmin}>
              <option value="">— Select team —</option>
              {teamOptions.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            <select className={styles.input} value={form.status} onChange={setF('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.certHeader}>
          <h4 className={styles.sectionTitle}>Certificates ({certs.length})</h4>
          {!showAdd && (
            <button className={styles.addCertBtn} onClick={() => setShowAdd(true)}>
              <PlusIcon width={13} /> Add
            </button>
          )}
        </div>

        {showAdd && (
          <div className={styles.certForm}>
            <button
              type="button"
              className={styles.certFileBtn}
              onClick={() => certFileRef.current?.click()}
              disabled={uploading}
            >
              {uploading
                ? 'Reading certificate…'
                : newCert.fileName
                  ? <><DocumentIcon width={14} /> {newCert.fileName}</>
                  : <><PaperClipIcon width={14} /> Take photo / attach file</>}
            </button>
            <input
              ref={certFileRef} type="file" accept="image/*,application/pdf" capture="environment"
              style={{ display: 'none' }} onChange={handleCertFile}
            />
            {certOcrState === 'done' && (
              <p className={styles.certOcrNote}>
                <CheckCircleIcon width={14} style={{ color: 'var(--green)', flexShrink: 0 }} />
                Read from photo — check the details below and fix if needed.
              </p>
            )}
            {certOcrState === 'failed' && (
              <p className={styles.certOcrNote}>
                <ExclamationTriangleIcon width={14} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                Couldn't read the photo — please fill in the details manually.
              </p>
            )}

            <select
              className={styles.input}
              value={newCert.type}
              onChange={e => setNewCert(c => ({ ...c, type: e.target.value }))}
            >
              <option value="">— Certificate type —</option>
              {certTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              <option value="other">Others…</option>
            </select>
            {newCert.type === 'other' && (
              <input
                className={styles.input}
                placeholder="Certificate name"
                value={newCert.name}
                onChange={e => setNewCert(c => ({ ...c, name: e.target.value }))}
              />
            )}
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label}>Course / issue date</label>
                <input
                  type="date"
                  className={styles.input}
                  value={newCert.issueDate}
                  onChange={e => setNewCert(c => ({ ...c, issueDate: e.target.value }))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Expiry date</label>
                <input
                  type="date"
                  className={styles.input}
                  value={newCert.expiry}
                  onChange={e => setNewCert(c => ({ ...c, expiry: e.target.value }))}
                />
              </div>
            </div>
            <div className={styles.certFormBtns}>
              <Button size="sm" onClick={addCert} disabled={uploading || !newCert.type || (newCert.type === 'other' && !newCert.name.trim())}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewCert(EMPTY_CERT); setCertOcrState('none'); }}>Cancel</Button>
            </div>
          </div>
        )}

        {certs.length === 0 && !showAdd ? (
          <p className={styles.noCerts}>No certificates added.</p>
        ) : (
          <div className={styles.certList}>
            {certs.map((c, i) => {
              const b = certBadge(c.expiry);
              return (
                <div key={i} className={styles.certRow}>
                  <div className={styles.certInfo}>
                    <span className={styles.certName}>{c.name}</span>
                    <span className={styles.certExpiry}>
                      {c.issueDate ? `Issued: ${c.issueDate} · ` : ''}{c.expiry ? `Exp: ${c.expiry}` : 'No expiry'}
                      {c.url && <a href={c.url} target="_blank" rel="noreferrer" className={styles.certFileLink}> · View file</a>}
                    </span>
                  </div>
                  <Badge color={b.color}>{b.label}</Badge>
                  <button className={styles.removeBtn} onClick={() => removeCert(i)} title="Remove">
                    <TrashIcon width={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>
          {mode === 'add' ? 'Add Worker' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}
