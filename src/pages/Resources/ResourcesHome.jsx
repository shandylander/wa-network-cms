import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc, updateDoc, writeBatch, query, where, Timestamp } from 'firebase/firestore';
import {
  EyeIcon, ShieldCheckIcon, LockClosedIcon, MagnifyingGlassIcon,
  PlusIcon, TrashIcon, XMarkIcon, CloudArrowUpIcon, DocumentTextIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { TEAMS } from '../../utils/permissions';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import Card, { CardHeader } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import DocumentViewerModal from '../../components/UI/DocumentViewerModal';
import styles from './ResourcesHome.module.css';

const TEAM_KEYS = ['own', 'kvm', 'sree', 'habibur', 'alamin'];

// Document category taxonomy for the company-wide Resources library. Existing
// documents in Firestore predate this field, so a missing category is
// treated as 'hse' at read time only — no backfill write.
const CATEGORIES = [
  { value: 'hse',       label: 'HSE & Safety' },
  { value: 'training',  label: 'Training Manuals' },
  { value: 'standards', label: 'Company Standards' },
  { value: 'templates', label: 'Templates' },
  { value: 'policies',  label: 'Policies' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

export default function ResourcesHome() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const [docs,      setDocs]      = useState([]);
  const [projects,  setProjects]  = useState([]); // active projects, for the Add Document target picker
  const [loading,   setLoading]   = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search,         setSearch]         = useState('');
  const [viewDoc,        setViewDoc]        = useState(null);
  const [showForm,       setShowForm]       = useState(false);
  const [saving,         setSaving]         = useState(false);
  const [progress,       setProgress]       = useState(0);
  const [deleteTarget,   setDeleteTarget]   = useState(null); // { id, projectId, name }
  const [deleting,       setDeleting]       = useState(false);
  const fileRef = useRef();
  const emptyAccess = () => Object.fromEntries(TEAM_KEYS.map(t => [t, false]));
  const [form, setForm] = useState({ projectId: '', name: '', category: 'hse', revNote: '', file: null, access: emptyAccess() });

  const role    = userProfile?.role;
  const myTeam  = userProfile?.team;
  const canAdmin = can('manage:blocks'); // owner + manager
  const isWorker = ['staff', 'subcon-admin', 'subcon'].includes(role);
  const isSubconRole = ['subcon-admin', 'subcon'].includes(role);
  // Staff are WA employees — their document access flag is 'own' regardless
  // of the team value stored on the user record.
  const accessTeam = role === 'staff' ? 'own' : myTeam;

  useEffect(() => {
    const load = async () => {
      try {
        // Resources is a company-wide library that aggregates documents across
        // ALL active projects — not one. (The old single-project limit(1) read
        // silently hid documents once more than one project was active.)
        // Security rules only let subcon roles read projects assigned to their
        // team, and only let worker roles read documents their team can access.
        // Rules are not filters — the queries must match them exactly.
        const pSnap = await getDocs(isSubconRole
          ? query(collection(db, 'projects'),
              where('status', '==', 'active'),
              where('assignedTeams', 'array-contains', myTeam))
          : query(collection(db, 'projects'), where('status', '==', 'active')));
        if (pSnap.empty) { setLoading(false); return; }
        const projects = pSnap.docs.map(p => ({ id: p.id, name: p.data().name ?? '' }));
        setProjects(projects);
        // Fetch each project's documents in parallel; one project failing (e.g.
        // a rules edge case) must not blank the whole library.
        const perProject = await Promise.all(projects.map(p =>
          getDocs(isWorker
            ? query(collection(db, 'projects', p.id, 'documents'), where(`access.${accessTeam}`, '==', true))
            : collection(db, 'projects', p.id, 'documents'))
            .then(dSnap => dSnap.docs.map(d => {
              const data = d.data();
              // Missing category defaults to 'hse' at read time — legacy docs
              // predate this field and are never backfilled in Firestore.
              return { id: d.id, projectId: p.id, projectName: p.name, ...data, category: data.category ?? 'hse' };
            }))
            .catch(() => [])
        ));
        const all = perProject.flat();
        all.sort((a, b) => (b.uploadedAt?.toMillis?.() ?? 0) - (a.uploadedAt?.toMillis?.() ?? 0));
        setDocs(all);
      } catch {
        toast.error('Failed to load Resources documents');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isWorker, isSubconRole, accessTeam, myTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAccess = async (docItem, team, current) => {
    try {
      const ref = doc(db, 'projects', docItem.projectId, 'documents', docItem.id);
      await updateDoc(ref, { [`access.${team}`]: !current });
      setDocs(prev => prev.map(d =>
        d.id === docItem.id && d.projectId === docItem.projectId
          ? { ...d, access: { ...d.access, [team]: !current } } : d
      ));
    } catch {
      toast.error('Failed to update access');
    }
  };

  const [grantingOwn, setGrantingOwn] = useState(false);
  const grantOwnAccess = async () => {
    if (docs.length === 0) return;
    setGrantingOwn(true);
    try {
      const batch = writeBatch(db);
      docs.forEach(d => {
        if (!d.access?.own) {
          batch.update(doc(db, 'projects', d.projectId, 'documents', d.id), { 'access.own': true });
        }
      });
      await batch.commit();
      setDocs(prev => prev.map(d => ({ ...d, access: { ...d.access, own: true } })));
      toast.success('WA! staff access enabled for all documents');
    } catch {
      toast.error('Failed to update access');
    } finally {
      setGrantingOwn(false);
    }
  };

  const allOwnEnabled = docs.length > 0 && docs.every(d => d.access?.own);

  const openForm = () => {
    setForm(f => ({ ...f, projectId: f.projectId || projects[0]?.id || '' }));
    setShowForm(true);
  };
  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setForm({ projectId: projects[0]?.id ?? '', name: '', category: 'hse', revNote: '', file: null, access: emptyAccess() });
    if (fileRef.current) fileRef.current.value = '';
  };
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, file, name: f.name || file.name.replace(/\.[^.]+$/, '') }));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.projectId)    { toast.error('Choose which project this document belongs to.'); return; }
    if (!form.name.trim())  { toast.error('Please enter a document name.'); return; }
    if (!form.file)         { toast.error('Please select a file to upload.'); return; }
    setSaving(true);
    setProgress(5);
    try {
      const project = projects.find(p => p.id === form.projectId);
      const folder  = `/WA! Network Asia CMS/Projects/${project?.name ?? form.projectId}/Documents`;
      const url     = await uploadToDropbox(form.file, folder, (pct) => setProgress(pct));
      setProgress(90);
      const payload = {
        name: form.name.trim(), category: form.category, url,
        ...(form.revNote.trim() ? { revNote: form.revNote.trim() } : {}),
        fileName: form.file.name, fileSize: form.file.size,
        access: form.access,
        uploadedAt: Timestamp.now(), uploadedBy: userProfile.userId,
      };
      const ref = await addDoc(collection(db, 'projects', form.projectId, 'documents'), payload);
      setDocs(prev => [{ id: ref.id, projectId: form.projectId, projectName: project?.name ?? '', ...payload }, ...prev]);
      toast.success('Document uploaded to Dropbox');
      closeForm();
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
      await deleteDoc(doc(db, 'projects', deleteTarget.projectId, 'documents', deleteTarget.id));
      setDocs(prev => prev.filter(d => !(d.id === deleteTarget.id && d.projectId === deleteTarget.projectId)));
      toast.success('Document removed');
      setDeleteTarget(null);
    } catch { toast.error('Failed to remove document'); }
    finally { setDeleting(false); }
  };

  const changeCategory = async (docItem, category) => {
    try {
      await updateDoc(doc(db, 'projects', docItem.projectId, 'documents', docItem.id), { category });
      setDocs(prev => prev.map(d => d.id === docItem.id && d.projectId === docItem.projectId ? { ...d, category } : d));
    } catch { toast.error('Failed to move document'); }
  };

  // Worker queries are already access-filtered server-side
  const visibleDocs = docs;

  const counts = Object.fromEntries(CATEGORIES.map(c => [c.value, visibleDocs.filter(d => d.category === c.value).length]));
  const filteredDocs = visibleDocs.filter(d =>
    (categoryFilter === 'all' || d.category === categoryFilter) &&
    d.name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Resources</h1>
          <p className={styles.sub}>Safety forms, training manuals, standards and templates</p>
        </div>
        <div className={styles.headerActions}>
          {canAdmin && !allOwnEnabled && visibleDocs.length > 0 && (
            <button className={styles.grantBtn} onClick={grantOwnAccess} disabled={grantingOwn}>
              {grantingOwn ? 'Enabling…' : 'Enable for WA! Staff'}
            </button>
          )}
          {canAdmin && projects.length > 0 && (
            <button className={styles.addBtn} onClick={openForm}><PlusIcon width={14} /> Add Document</button>
          )}
        </div>
      </div>

      {visibleDocs.length === 0 ? (
        <div className={styles.empty}>
          <LockClosedIcon className={styles.emptyIcon} />
          <h3>No documents available</h3>
          <p>{canAdmin
            ? 'Use the team toggle buttons on each document to grant access, or click "Enable for WA! Staff" above.'
            : 'Your admin needs to enable access for your team. Contact your supervisor or manager.'
          }</p>
        </div>
      ) : (
        <>
          <div className={styles.toolsRow}>
            <div className={styles.filterRow}>
              <button
                className={[styles.filterBtn, categoryFilter === 'all' ? styles.active : ''].join(' ')}
                onClick={() => setCategoryFilter('all')}
              >
                All ({visibleDocs.length})
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  className={[styles.filterBtn, categoryFilter === c.value ? styles.active : ''].join(' ')}
                  onClick={() => setCategoryFilter(c.value)}
                >
                  {c.label} ({counts[c.value] ?? 0})
                </button>
              ))}
            </div>
            <div className={styles.searchWrap}>
              <MagnifyingGlassIcon className={styles.searchIcon} width={15} />
              <input
                className={styles.searchInput}
                placeholder="Search documents…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className={styles.empty}>
              <h3>No matching documents</h3>
              <p>Try a different category or search term.</p>
            </div>
          ) : (
            <Card>
              <CardHeader
                title="Project Documents"
                subtitle={canAdmin ? 'Toggle team access using the buttons below' : 'Download permitted forms'}
              />
              <div className={styles.docList}>
                {filteredDocs.map(d => (
                  <div key={d.id} className={styles.docRow}>
                    <div className={styles.docInfo}>
                      <ShieldCheckIcon className={styles.docIcon} width={18} />
                      <div>
                        <p className={styles.docName}>{d.name}</p>
                        {canAdmin ? (
                          <select
                            className={styles.catSelect}
                            value={d.category}
                            onChange={e => changeCategory(d, e.target.value)}
                            title="Move to a different folder"
                          >
                            {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                          </select>
                        ) : (
                          <Badge color="blue">{CATEGORY_LABEL[d.category] ?? d.category?.toUpperCase() ?? 'DOC'}</Badge>
                        )}
                        {d.projectName && <span className={styles.docMeta}> · {d.projectName}</span>}
                        {d.revNote && <p className={styles.revNote}>{d.revNote}</p>}
                      </div>
                    </div>

                    {canAdmin && (
                      <div className={styles.accessToggles}>
                        {TEAM_KEYS.map(t => (
                          <button
                            key={t}
                            className={[styles.toggleBtn, d.access?.[t] ? styles.toggleOn : ''].join(' ')}
                            onClick={() => toggleAccess(d, t, d.access?.[t])}
                            title={`${d.access?.[t] ? 'Revoke' : 'Grant'} access to ${TEAMS[t]}`}
                          >
                            {t === 'own' ? 'WA!' : TEAMS[t]?.split(' ')[0] ?? t}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className={styles.rowActions}>
                      <button className={styles.downloadBtn} onClick={() => setViewDoc(d)}>
                        <EyeIcon width={15} /> Open
                      </button>
                      {canAdmin && (
                        <button
                          className={styles.deleteBtn}
                          title="Remove document"
                          onClick={() => setDeleteTarget({ id: d.id, projectId: d.projectId, name: d.name })}
                        >
                          <TrashIcon width={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card style={{ marginTop: 16 }}>
        <CardHeader title="RA Library" subtitle="Risk assessment documents" />
        <RaLibrary canAdmin={canAdmin} toast={toast} onOpen={setViewDoc} userId={userProfile?.userId} />
      </Card>

      {/* Add Document modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={closeForm}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Add Document to Resources</h3>
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

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Document Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={styles.formInput} placeholder="e.g. Toolbox Meeting Form" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={saving} />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Folder</label>
                <select className={styles.formInput} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} disabled={saving}>
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Belongs to Project <span className={styles.opt}>(Resources shows documents from every active project)</span></label>
                <select className={styles.formInput} value={form.projectId} onChange={e => setForm(f => ({ ...f, projectId: e.target.value }))} disabled={saving}>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Revision Note <span className={styles.opt}>(optional)</span></label>
                <input className={styles.formInput} placeholder="e.g. Rev 04 — updated" value={form.revNote}
                  onChange={e => setForm(f => ({ ...f, revNote: e.target.value }))} disabled={saving} />
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Team Access <span className={styles.opt}>(defaults to no access)</span></label>
                <div className={styles.accessGrid}>
                  {TEAM_KEYS.map(t => (
                    <label key={t} className={styles.accessOption}>
                      <input type="checkbox" checked={form.access[t]} disabled={saving}
                        onChange={() => setForm(f => ({ ...f, access: { ...f.access, [t]: !f.access[t] } }))} />
                      {t === 'own' ? 'WA! Staff' : TEAMS[t]}
                    </label>
                  ))}
                </div>
              </div>

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
      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Remove "{deleteTarget.name}"</h3>
            <p className={styles.confirmText}><ExclamationTriangleIcon width={14} /> This removes the record from the CMS. The file in Dropbox is not deleted.</p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={confirmDelete} disabled={deleting}>{deleting ? 'Removing…' : 'Yes, Remove'}</button>
            </div>
          </div>
        </div>
      )}

      <DocumentViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />
    </div>
  );
}

const EMPTY_RA_FORM = { ref: '', title: '', assessedDate: '', reviewDate: '', leader: '', file: null };

function RaLibrary({ canAdmin, toast, onOpen, userId }) {
  const [ras,     setRas]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm,     setShowForm]     = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title }
  const [deleting,     setDeleting]     = useState(false);
  const [form,         setForm]         = useState(EMPTY_RA_FORM);
  const fileRef = useRef();

  useEffect(() => {
    getDocs(collection(db, 'raLibrary'))
      .then(snap => setRas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load RA library'))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const closeForm = () => {
    if (saving) return;
    setShowForm(false);
    setForm(EMPTY_RA_FORM);
    if (fileRef.current) fileRef.current.value = '';
  };
  const onFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForm(f => ({ ...f, file, title: f.title || file.name.replace(/\.[^.]+$/, '') }));
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!form.ref.trim())   { toast.error('Enter an RA reference (e.g. RA 2.0).'); return; }
    if (!form.title.trim()) { toast.error('Enter a title.'); return; }
    if (!form.file)         { toast.error('Select a file to upload.'); return; }
    setSaving(true);
    setProgress(5);
    try {
      const url = await uploadToDropbox(form.file, '/WA! Network Asia CMS/HSE Library/Risk Assessments', setProgress);
      setProgress(90);
      const payload = {
        ref: form.ref.trim(), title: form.title.trim(),
        assessedDate: form.assessedDate || null, reviewDate: form.reviewDate || null,
        leader: form.leader.trim(), url, fileName: form.file.name, status: 'active',
        createdAt: Timestamp.now(), createdBy: userId ?? null,
      };
      const ref = await addDoc(collection(db, 'raLibrary'), payload);
      setRas(prev => [{ id: ref.id, ...payload }, ...prev]);
      toast.success('Risk assessment added');
      closeForm();
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
      await deleteDoc(doc(db, 'raLibrary', deleteTarget.id));
      setRas(prev => prev.filter(r => r.id !== deleteTarget.id));
      toast.success('Risk assessment removed');
      setDeleteTarget(null);
    } catch { toast.error('Failed to remove'); }
    finally { setDeleting(false); }
  };

  if (loading) return <div className={styles.miniSpinner} />;

  return (
    <>
      {canAdmin && (
        <div className={styles.raToolbar}>
          <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Add RA</button>
        </div>
      )}

      {ras.length === 0 ? (
        <div className={styles.raEmpty}>
          <p>No risk assessments uploaded yet.</p>
          {canAdmin && <span>Click "Add RA" above to upload one.</span>}
        </div>
      ) : (
        <div className={styles.docList}>
          {ras.map(ra => (
            <div key={ra.id} className={styles.docRow}>
              <div className={styles.docInfo}>
                <ShieldCheckIcon className={styles.docIcon} width={18} />
                <div>
                  <p className={styles.docName}>{ra.title}</p>
                  <span className={styles.docMeta}>{ra.ref}{ra.assessedDate ? ` · Assessed: ${ra.assessedDate}` : ''}</span>
                </div>
              </div>
              <div className={styles.rowActions}>
                <button className={styles.downloadBtn} onClick={() => onOpen({ name: ra.title, fileName: ra.fileName, url: ra.url })}>
                  <EyeIcon width={15} /> Open
                </button>
                {canAdmin && (
                  <button className={styles.deleteBtn} title="Remove" onClick={() => setDeleteTarget({ id: ra.id, title: ra.title })}>
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
              <h3 className={styles.modalTitle}>Add Risk Assessment</h3>
              <button className={styles.modalClose} onClick={closeForm} disabled={saving}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submit}>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>File <span style={{ color: 'var(--red)' }}>*</span></label>
                <div className={[styles.dropZone, form.file ? styles.dropZoneHasFile : ''].join(' ')} onClick={() => !saving && fileRef.current?.click()}>
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

              <div className={styles.formRow}>
                <label className={styles.formLbl}>RA Reference <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={styles.formInput} placeholder="e.g. RA 2.0" value={form.ref}
                  onChange={e => setForm(f => ({ ...f, ref: e.target.value }))} disabled={saving} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Title <span style={{ color: 'var(--red)' }}>*</span></label>
                <input className={styles.formInput} placeholder="e.g. Working at Height" value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))} disabled={saving} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Team Leader</label>
                <input className={styles.formInput} placeholder="Name" value={form.leader}
                  onChange={e => setForm(f => ({ ...f, leader: e.target.value }))} disabled={saving} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Assessed Date</label>
                <input type="date" className={styles.formInput} value={form.assessedDate}
                  onChange={e => setForm(f => ({ ...f, assessedDate: e.target.value }))} disabled={saving} />
              </div>
              <div className={styles.formRow}>
                <label className={styles.formLbl}>Review Date</label>
                <input type="date" className={styles.formInput} value={form.reviewDate}
                  onChange={e => setForm(f => ({ ...f, reviewDate: e.target.value }))} disabled={saving} />
              </div>

              {saving && (
                <div className={styles.progressWrap}>
                  <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                  <span className={styles.progressLabel}>{progress < 70 ? 'Uploading to Dropbox…' : 'Saving…'} {progress}%</span>
                </div>
              )}

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={closeForm} disabled={saving}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? `Uploading… ${progress}%` : 'Upload & Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className={styles.modalOverlay} onClick={() => setDeleteTarget(null)}>
          <div className={styles.modal} style={{ maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Remove "{deleteTarget.title}"</h3>
            <p className={styles.confirmText}><ExclamationTriangleIcon width={14} /> This removes the record from the CMS. The file in Dropbox is not deleted.</p>
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={confirmDelete} disabled={deleting}>{deleting ? 'Removing…' : 'Yes, Remove'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
