import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, Timestamp } from 'firebase/firestore';
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
// Customer Documents is structurally simpler than Project Documents (no
// per-team access flags — customers are internal-only, sub-cons never see
// this at all) so it doesn't share ProjectDocuments.jsx's component, but
// its CSS is entirely generic and worth reusing rather than duplicating.
import styles from '../Projects/ProjectDocuments.module.css';

const CATEGORIES = [
  { value: 'floorplan', label: 'Floorplan' },
  { value: 'drawing',   label: 'Drawing' },
  { value: 'manual',    label: 'Manual' },
  { value: 'general',   label: 'General' },
];

// Reference docs (floorplans, drawings, technical manuals) for a customer's
// site — technicians can browse these read-only from JobDetail while
// working; uploading/managing them stays with whoever manages the
// Customer record (manage:customers).
export default function CustomerDocuments({ customer }) {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();
  const { toast }        = useToast();
  const canAdmin = can('manage:customers');

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

  const [form, setForm] = useState({ name: '', category: 'general', file: null });

  useEffect(() => {
    getDocs(collection(db, 'customers', customer.id, 'documents'))
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.uploadedAt?.toMillis?.() ?? 0) - (a.uploadedAt?.toMillis?.() ?? 0));
        setDocsList(list);
      })
      .catch(() => toast.error('Failed to load documents'))
      .finally(() => setLoading(false));
  }, [customer.id, toast]);

  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, file, name: f.name || file.name.replace(/\.[^.]+$/, '') }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim())  { toast.error('Please enter a document name.'); return; }
    if (!form.file)         { toast.error('Please select a file to upload.'); return; }
    setSaving(true);
    setProgress(5);
    try {
      const folder = `/WA! Network Asia CMS/Customers/${customer.name}/Documents`;
      const url    = await uploadToDropbox(form.file, folder, (pct) => setProgress(pct));
      setProgress(90);
      const payload = {
        name: form.name.trim(), category: form.category, url,
        fileName: form.file.name, fileSize: form.file.size,
        uploadedAt: Timestamp.now(), uploadedBy: userProfile.userId,
      };
      const ref = await addDoc(collection(db, 'customers', customer.id, 'documents'), payload);
      setDocsList(d => [{ id: ref.id, ...payload }, ...d]);
      toast.success('Document uploaded to Dropbox');
      setShowForm(false);
      setForm({ name: '', category: 'general', file: null });
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
      await deleteDoc(doc(db, 'customers', customer.id, 'documents', deleteId));
      setDocsList(d => d.filter(x => x.id !== deleteId));
      toast.success('Document removed');
      setDeleteId(null);
    } catch { toast.error('Failed to remove document'); }
    finally { setDeleting(false); }
  };

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setForm({ name: '', category: 'general', file: null });
    if (fileRef.current) fileRef.current.value = '';
  };

  const filtered = filter === 'all' ? docsList : docsList.filter(d => d.category === filter);
  const counts    = Object.fromEntries(CATEGORIES.map(c => [c.value, docsList.filter(d => d.category === c.value).length]));

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap} style={{ padding: 0 }}>
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
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} documents yet.</p>
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
                </div>
              </div>

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

      {showForm && (
        <div className={styles.modalOverlay} onClick={closeForm}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Upload Document to Dropbox</h3>
              <button className={styles.modalClose} onClick={closeForm} disabled={saving}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submit}>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>File <span style={{ color: 'var(--red)' }}>*</span></label>
                <div
                  className={[styles.dropZone, form.file ? styles.dropZoneHasFile : ''].join(' ')}
                  onClick={() => !saving && fileRef.current?.click()}
                >
                  <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={onFileChange} disabled={saving} />
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

              <div className={styles.formRow}><label className={styles.formLbl}>Document Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={styles.formInput} placeholder="e.g. Site Floorplan — Riser Room" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} /></div>

              <div className={styles.formRow}><label className={styles.formLbl}>Category</label>
                <select className={styles.formInput} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} disabled={saving}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select></div>

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
