import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import {
  PlusIcon, XMarkIcon, EyeIcon, TrashIcon,
  DocumentTextIcon, ExclamationTriangleIcon, CloudArrowUpIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/helpers';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import DocumentViewerModal from '../../components/UI/DocumentViewerModal';
import styles from './ProjectDocuments.module.css';

// Superset of two overlapping needs: the project-specific document types a
// construction job actually files (drawings, claims, general project docs)
// PLUS the company-wide Resources library taxonomy (src/pages/Resources/
// ResourcesHome.jsx). Both surfaces read/write the same
// projects/{id}/documents collection, so the shared values (hse, training,
// standards, templates, policies) line up with the Resources filter chips;
// the project-only values (drawing, claim, general) still render there under
// "All". Keeping drawing/claim here is deliberate — as-built drawings and
// claim documents are core to the contractor's workflow.
const CATEGORIES = [
  { value: 'general',   label: 'General' },
  { value: 'drawing',   label: 'Drawing' },
  { value: 'claim',     label: 'Claim' },
  { value: 'hse',       label: 'HSE & Safety' },
  { value: 'training',  label: 'Training Manuals' },
  { value: 'standards', label: 'Company Standards' },
  { value: 'templates', label: 'Templates' },
  { value: 'policies',  label: 'Policies' },
];

const TEAM_KEYS   = ['own', 'kvm', 'sree', 'habibur', 'alamin'];
const TEAM_LABELS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

const emptyAccess = () => Object.fromEntries(TEAM_KEYS.map(t => [t, false]));

export default function ProjectDocuments({ project }) {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();
  const { toast }        = useToast();
  const canAdmin = can('manage:blocks');
  const isWorker = ['staff', 'subcon-admin', 'subcon'].includes(userProfile?.role);
  const myTeam   = userProfile?.team;
  // Staff are WA employees — their document access flag is 'own' regardless
  // of the team value stored on the user record.
  const accessTeam = userProfile?.role === 'staff' ? 'own' : myTeam;

  const [docsList,  setDocsList]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('all');
  const [showForm,  setShowForm]  = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [deleteId,  setDeleteId]  = useState(null);
  const [deleting,  setDeleting]  = useState(false);
  const [viewDoc,   setViewDoc]   = useState(null);
  const fileRef = useRef();

  const [form, setForm] = useState({ name: '', category: 'general', revNote: '', file: null, access: emptyAccess() });

  useEffect(() => {
    const documentsRef = collection(db, 'projects', project.id, 'documents');
    // Security rules only let worker roles read documents their team can
    // access. Rules are not filters — the query must match them exactly,
    // or Firestore rejects the whole request with permission-denied.
    getDocs(isWorker
      ? query(documentsRef, where(`access.${accessTeam}`, '==', true))
      : documentsRef)
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.uploadedAt?.toMillis?.() ?? 0) - (a.uploadedAt?.toMillis?.() ?? 0));
        setDocsList(list);
      })
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  }, [project.id, isWorker, accessTeam, toast]);

  const toggleAccess = async (docId, team, current) => {
    try {
      await updateDoc(doc(db, 'projects', project.id, 'documents', docId), { [`access.${team}`]: !current });
      setDocsList(prev => prev.map(d => d.id === docId ? { ...d, access: { ...d.access, [team]: !current } } : d));
    } catch { toast.error('Failed to update access'); }
  };

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({
      ...f,
      file,
      // Auto-fill name from filename (strip extension) if name is still empty
      name: f.name || file.name.replace(/\.[^.]+$/, ''),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  { toast.error('Please enter a document name.'); return; }
    if (!form.file)         { toast.error('Please select a file to upload.'); return; }
    setSaving(true);
    setProgress(5);
    try {
      const folder = `/WA! Network Asia CMS/Projects/${project.name}/Documents`;
      const url    = await uploadToDropbox(form.file, folder, (pct) => setProgress(pct));
      setProgress(90);
      const payload = {
        name: form.name.trim(), category: form.category, url,
        ...(form.revNote.trim() ? { revNote: form.revNote.trim() } : {}),
        fileName: form.file.name, fileSize: form.file.size,
        access: form.access,
        uploadedAt: Timestamp.now(), uploadedBy: userProfile.userId,
      };
      const ref = await addDoc(collection(db, 'projects', project.id, 'documents'), payload);
      setDocsList(d => [{ id: ref.id, ...payload }, ...d]);
      toast.success('Document uploaded to Dropbox');
      setShowForm(false);
      setForm({ name: '', category: 'general', revNote: '', file: null, access: emptyAccess() });
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      console.error(err);
      toast.error('Upload failed — check your connection and try again.');
    } finally {
      setSaving(false);
      setProgress(0);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'projects', project.id, 'documents', deleteId));
      setDocsList(d => d.filter(x => x.id !== deleteId));
      toast.success('Document removed');
      setDeleteId(null);
    } catch { toast.error('Failed to remove document'); }
    finally { setDeleting(false); }
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setForm({ name: '', category: 'general', revNote: '', file: null, access: emptyAccess() });
    if (fileRef.current) fileRef.current.value = '';
  };

  // Worker queries are already access-filtered server-side (see fetch effect above).
  const filtered = filter === 'all' ? docsList : docsList.filter(d => d.category === filter);
  const counts    = Object.fromEntries(CATEGORIES.map(c => [c.value, docsList.filter(d => d.category === c.value).length]));

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <button className={[styles.filterBtn, filter === 'all' ? styles.active : ''].join(' ')} onClick={() => setFilter('all')}>All ({docsList.length})</button>
          {CATEGORIES.map(c => (
            <button key={c.value} className={[styles.filterBtn, filter === c.value ? styles.active : ''].join(' ')} onClick={() => setFilter(c.value)}>
              {c.label}{counts[c.value] ? ` (${counts[c.value]})` : ''}
            </button>
          ))}
        </div>
        {canAdmin && (
          <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Upload Document</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} documents{isWorker ? ' available to your team yet' : ''}.</p>
      ) : (
        <div className={styles.docList}>
          {filtered.map(d => (
            <div key={d.id} className={styles.docRow}>
              <div className={styles.docInfo}>
                <DocumentTextIcon className={styles.docIcon} width={18} />
                <div>
                  <p className={styles.docName}>{d.name}</p>
                  <div className={styles.docSub}>
                    <span className={styles.catBadge}>{CATEGORIES.find(c => c.value === d.category)?.label ?? d.category}</span>
                    <span className={styles.docDate}>Added {formatDate(d.uploadedAt)}</span>
                  </div>
                  {d.revNote && <p className={styles.revNote}>{d.revNote}</p>}
                </div>
              </div>

              {canAdmin && (
                <div className={styles.accessToggles}>
                  {TEAM_KEYS.map(t => (
                    <button
                      key={t}
                      className={[styles.toggleBtn, d.access?.[t] ? styles.toggleOn : ''].join(' ')}
                      onClick={() => toggleAccess(d.id, t, d.access?.[t])}
                      title={`${d.access?.[t] ? 'Revoke' : 'Grant'} access to ${TEAM_LABELS[t]}`}
                    >
                      {t === 'own' ? 'WA!' : TEAM_LABELS[t]}
                    </button>
                  ))}
                </div>
              )}

              <div className={styles.rowActions}>
                <button className={styles.downloadBtn} onClick={() => setViewDoc(d)}>
                  <EyeIcon width={15} /> Open
                </button>
                {canAdmin && (
                  <button className={styles.deleteBtn} title="Delete document" onClick={() => setDeleteId(d.id)}>
                    <TrashIcon width={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={closeForm}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Upload Document to Dropbox</h3>
              <button className={styles.modalClose} onClick={closeForm} disabled={saving}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submit}>
              {/* File picker */}
              <div className={styles.formRow}>
                <label className={styles.formLbl}>File <span style={{color:'var(--red)'}}>*</span></label>
                <div
                  className={[styles.dropZone, form.file ? styles.dropZoneHasFile : ''].join(' ')}
                  onClick={() => !saving && fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={onFileChange}
                    disabled={saving}
                  />
                  {form.file ? (
                    <div className={styles.fileSelected}>
                      <DocumentTextIcon width={20} />
                      <div>
                        <p className={styles.fileName}>{form.file.name}</p>
                        <p className={styles.fileSize}>{(form.file.size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                  ) : (
                    <div className={styles.dropPrompt}>
                      <CloudArrowUpIcon width={28} />
                      <p>Click to select a file from your PC</p>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.formRow}><label className={styles.formLbl}>Document Name <span style={{color:'var(--red)'}}>*</span></label>
                <input className={styles.formInput} placeholder="e.g. As-Built Drawing — Blk 307" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} /></div>

              <div className={styles.formRow}><label className={styles.formLbl}>Category</label>
                <select className={styles.formInput} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} disabled={saving}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select></div>

              <div className={styles.formRow}><label className={styles.formLbl}>Revision Note <span className={styles.opt}>(optional)</span></label>
                <input className={styles.formInput} placeholder="e.g. Rev 04 — updated scope of works" value={form.revNote} onChange={e => setForm(f => ({ ...f, revNote: e.target.value }))} disabled={saving} /></div>

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Team Access <span className={styles.opt}>(defaults to no access)</span></label>
                <div className={styles.accessGrid}>
                  {TEAM_KEYS.map(t => (
                    <label key={t} className={styles.accessOption}>
                      <input type="checkbox" checked={form.access[t]} disabled={saving} onChange={() => setForm(f => ({ ...f, access: { ...f.access, [t]: !f.access[t] } }))} />
                      {TEAM_LABELS[t]}
                    </label>
                  ))}
                </div>
              </div>

              {/* Upload progress */}
              {saving && (
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                  <span className={styles.progressLabel}>{progress < 70 ? 'Uploading to Dropbox…' : 'Saving…'} {progress}%</span>
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeForm} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>
                  {saving ? `Uploading… ${progress}%` : 'Upload & Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {deleteId && (
        <div className={styles.modalOverlay} onClick={() => setDeleteId(null)}>
          <div className={styles.modal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Delete Document</h3>
            <p className={styles.confirmText}><ExclamationTriangleIcon width={14} /> This removes the record from the CMS. The file in Dropbox is not deleted.</p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteId(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={confirmDelete} disabled={deleting}>{deleting ? 'Removing…' : 'Yes, Remove'}</button>
            </div>
          </div>
        </div>
      )}

      <DocumentViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />
    </div>
  );
}
