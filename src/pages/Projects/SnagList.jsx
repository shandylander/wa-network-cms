import React, { useState, useEffect, useRef } from 'react';
import { collection, doc, setDoc, updateDoc, getDocs, Timestamp, query, where, arrayUnion } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { PlusIcon, XMarkIcon, ChevronDownIcon, CameraIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { formatDate } from '../../utils/helpers';
import { fileToJpegBlob } from '../../utils/imageUtils';
import styles from './SnagList.module.css';

const SEVERITIES = [
  { value: 'low',      label: 'Low',      color: '#1a8a5a' },
  { value: 'medium',   label: 'Medium',   color: '#d97b00' },
  { value: 'high',     label: 'High',     color: '#CC0000' },
  { value: 'critical', label: 'Critical', color: '#7c1818' },
];

const STATUSES = [
  { value: 'open',        label: 'Open' },
  { value: 'in-progress', label: 'In Progress' },
  { value: 'resolved',    label: 'Resolved' },
  { value: 'closed',      label: 'Closed' },
];

const TEAMS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin' };

// Common CCTV-installation defect types — a starting menu, not an exhaustive
// enum. "type" is still stored as free text, so picking "Other" just swaps
// in a text input rather than restricting what can be logged.
const DEFECT_TYPES = [
  'Cable not secured / exposed',
  'Conduit damaged or incomplete',
  'Camera misaligned / poor coverage',
  'Camera not powered / not functioning',
  'NVR / recording not functioning',
  'Network / connectivity issue',
  'Missing or incorrect labelling',
  'Housing / enclosure damage',
  'Workmanship / finishing issue',
  'Safety hazard',
];

export default function SnagList({ project }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const isAdmin      = can('snags:manage-status');
  const isSubconRole = ['subcon-admin','subcon'].includes(userProfile?.role);
  const myTeam       = userProfile?.team;

  const [snags,     setSnags]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [showForm,  setShowForm]  = useState(false);
  const [filter,    setFilter]    = useState('open');
  const [expanded,  setExpanded]  = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [resolveId, setResolveId] = useState(null);
  const [resolveNote, setResolveNote] = useState('');

  // Photos attached while logging a new snag — held as local blobs until the
  // snag is actually submitted (uploaded then, once the doc's own ID exists
  // to key the storage path). { blob, preview } — preview is an object URL,
  // revoked on unmount/reset below.
  const [stagedPhotos, setStagedPhotos] = useState([]);
  const [addingPhotoTo, setAddingPhotoTo] = useState(null); // snag id currently uploading an extra photo
  const [addPhotoTarget, setAddPhotoTarget] = useState(null); // which snag the shared "add photo" inputs below target
  const [lightbox, setLightbox] = useState(null); // photo url
  const cameraInputRef  = useRef(null); // capture="environment" — opens the device camera directly (Log Snag form)
  const galleryInputRef = useRef(null); // Log Snag form
  const addPhotoCameraRef  = useRef(null); // shared across all logged snags' "Take Photo"
  const addPhotoGalleryRef = useRef(null); // shared across all logged snags' "Upload"

  const [form, setForm] = useState({
    blockNo: '', location: '', type: '', description: '', severity: 'medium',
    assignedTeam: userProfile?.team ?? 'own',
  });
  // Drives the Defect Type <select>: '' (unselected), one of DEFECT_TYPES, or
  // 'other' (reveals a free-text input, still saved into form.type).
  const [typeMode, setTypeMode] = useState('');

  useEffect(() => {
    // Sub-cons may only read snags assigned to their team (see firestore.rules),
    // so the query must match the rule. Sort client-side to avoid needing a
    // composite (assignedTeam + reportedAt) index.
    const snagsRef = collection(db, 'projects', project.id, 'snags');
    getDocs(isSubconRole ? query(snagsRef, where('assignedTeam', '==', myTeam)) : snagsRef)
      .then(snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.reportedAt?.toMillis?.() ?? 0) - (a.reportedAt?.toMillis?.() ?? 0));
        setSnags(list);
      })
      .catch(() => toast.error('Failed to load snags'))
      .finally(() => setLoading(false));
  }, [project.id, isSubconRole, myTeam, toast]);

  // Belt-and-braces cleanup for staged-photo object URLs if the component
  // unmounts (e.g. navigating away) while the Log Snag form is still open —
  // resetStagedPhotos() already handles the normal cancel/submit paths. A
  // ref (not stagedPhotos directly) so the mount-only cleanup below always
  // sees the latest array instead of the stale one captured at mount.
  const stagedPhotosRef = useRef(stagedPhotos);
  stagedPhotosRef.current = stagedPhotos;
  useEffect(() => () => stagedPhotosRef.current.forEach(p => URL.revokeObjectURL(p.preview)), []);

  // Shared by "Take Photo" (capture=environment, opens the device camera
  // directly) and "Add from Gallery" — both are plain file inputs, so
  // neither depends on getUserMedia (the SitePhotos live-preview approach
  // hit a real video-ref race bug; a file input sidesteps that whole class
  // of issue and is simpler for a quick evidence shot).
  const stagePickedFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    try {
      const blob = await fileToJpegBlob(file);
      if (!blob) throw new Error('encode failed');
      setStagedPhotos(p => [...p, { blob, preview: URL.createObjectURL(blob) }]);
    } catch {
      toast.error('Could not read that image. Please try another photo.');
    }
  };

  const removeStagedPhoto = (i) => {
    setStagedPhotos(p => {
      URL.revokeObjectURL(p[i].preview);
      return p.filter((_, idx) => idx !== i);
    });
  };

  const resetStagedPhotos = () => {
    stagedPhotos.forEach(p => URL.revokeObjectURL(p.preview));
    setStagedPhotos([]);
  };

  const submitSnag = async (e) => {
    e.preventDefault();
    if (!form.description.trim()) { toast.error('Please enter a description.'); return; }
    setSaving(true);
    try {
      // Pre-allocate the doc ID so photos can upload to a path keyed by it,
      // in the same write as the snag itself (no second update round-trip).
      const newRef = doc(collection(db, 'projects', project.id, 'snags'));
      const photos = await Promise.all(stagedPhotos.map(async (p, i) => {
        const path = `snagPhotos/${project.id}/${newRef.id}/${Date.now()}-${i}.jpg`;
        const fileRef = ref(storage, path);
        await uploadBytes(fileRef, p.blob, { contentType: 'image/jpeg' });
        const url = await getDownloadURL(fileRef);
        return { url, uploadedBy: userProfile.userId, uploadedAt: Timestamp.now() };
      }));
      const payload = {
        ...form, blockNo: form.blockNo.trim(), location: form.location.trim(),
        type: form.type.trim(), description: form.description.trim(),
        status: 'open', photos,
        reportedBy: userProfile.userId, reportedByName: userProfile.name,
        reportedAt: Timestamp.now(),
        resolvedBy: null, resolvedAt: null, resolutionNote: null,
      };
      await setDoc(newRef, payload);
      setSnags(s => [{ id: newRef.id, ...payload }, ...s]);
      toast.success('Snag logged');
      setShowForm(false);
      setForm({ blockNo: '', location: '', type: '', description: '', severity: 'medium', assignedTeam: userProfile?.team ?? 'own' });
      setTypeMode('');
      resetStagedPhotos();
    } catch { toast.error('Failed to log snag'); }
    finally { setSaving(false); }
  };

  // Attach an extra photo to an already-logged snag (e.g. resolution
  // evidence) — uploads immediately rather than staging, since the snag's ID
  // already exists.
  const addPhotoToSnag = async (snagId, file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    setAddingPhotoTo(snagId);
    try {
      const blob = await fileToJpegBlob(file);
      if (!blob) throw new Error('encode failed');
      const path = `snagPhotos/${project.id}/${snagId}/${Date.now()}.jpg`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
      const url = await getDownloadURL(fileRef);
      const photo = { url, uploadedBy: userProfile.userId, uploadedAt: Timestamp.now() };
      await updateDoc(doc(db, 'projects', project.id, 'snags', snagId), { photos: arrayUnion(photo) });
      setSnags(s => s.map(x => x.id === snagId ? { ...x, photos: [...(x.photos ?? []), photo] } : x));
      toast.success('Photo added');
    } catch {
      toast.error('Failed to add photo.');
    } finally {
      setAddingPhotoTo(null);
    }
  };

  const updateStatus = async (snag, status) => {
    try {
      const update = { status };
      if (status === 'resolved' || status === 'closed') {
        update.resolvedBy = userProfile.userId;
        update.resolvedAt = Timestamp.now();
        update.resolutionNote = resolveNote.trim() || null;
      }
      await updateDoc(doc(db, 'projects', project.id, 'snags', snag.id), update);
      setSnags(s => s.map(x => x.id === snag.id ? { ...x, ...update } : x));
      toast.success(`Snag marked as ${status}`);
      setResolveId(null); setResolveNote('');
    } catch { toast.error('Failed to update status'); }
  };

  const counts = Object.fromEntries(STATUSES.map(s => [s.value, snags.filter(x => x.status === s.value).length]));
  const filtered = filter === 'all' ? snags : snags.filter(s => s.status === filter);

  const sevInfo = (v) => SEVERITIES.find(s => s.value === v) ?? SEVERITIES[1];

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          <button className={[styles.filterBtn, filter === 'all' ? styles.active : ''].join(' ')} onClick={() => setFilter('all')}>All ({snags.length})</button>
          {STATUSES.map(s => (
            <button key={s.value} className={[styles.filterBtn, filter === s.value ? styles.active : ''].join(' ')} onClick={() => setFilter(s.value)}>
              {s.label}{counts[s.value] ? ` (${counts[s.value]})` : ''}
            </button>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => setShowForm(true)}><PlusIcon width={14} /> Log Snag</button>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No {filter === 'all' ? '' : filter} snags.</p>
      ) : (
        <div className={styles.snagList}>
          {filtered.map(snag => {
            const sev = sevInfo(snag.severity);
            const isOpen = expanded === snag.id;
            return (
              <div key={snag.id} className={styles.snagCard} style={{ borderLeft: `3px solid ${sev.color}` }}>
                <div className={styles.snagHead} onClick={() => setExpanded(isOpen ? null : snag.id)}>
                  <div className={styles.snagHeadLeft}>
                    <span className={styles.sevBadge} style={{ background: sev.color }}>{sev.label}</span>
                    {snag.blockNo && <span className={styles.blockTag}>Blk {snag.blockNo}</span>}
                    <p className={styles.snagDesc}>{snag.description}</p>
                  </div>
                  <div className={styles.snagHeadRight}>
                    <span className={[styles.statusBadge, styles[`status_${snag.status.replace('-','_')}`]].join(' ')}>
                      {STATUSES.find(s => s.value === snag.status)?.label ?? snag.status}
                    </span>
                    <ChevronDownIcon width={14} className={[styles.chevron, isOpen ? styles.chevronOpen : ''].join(' ')} />
                  </div>
                </div>

                {isOpen && (
                  <div className={styles.snagBody}>
                    <div className={styles.snagDetails}>
                      {snag.location    && <p><strong>Location:</strong> {snag.location}</p>}
                      {snag.type        && <p><strong>Type:</strong> {snag.type}</p>}
                      {snag.assignedTeam && <p><strong>Assigned:</strong> {TEAMS[snag.assignedTeam] ?? snag.assignedTeam}</p>}
                      <p><strong>Reported by:</strong> {snag.reportedByName} · {formatDate(snag.reportedAt)}</p>
                      {snag.resolvedAt  && <p><strong>Resolved:</strong> {formatDate(snag.resolvedAt)}{snag.resolutionNote ? ` — ${snag.resolutionNote}` : ''}</p>}
                    </div>

                    <div className={styles.photoSection}>
                      {snag.photos?.length > 0 && (
                        <div className={styles.photoThumbGrid}>
                          {snag.photos.map((p, i) => (
                            <img
                              key={i} src={p.url} alt="" className={styles.photoThumb}
                              onClick={() => setLightbox(p.url)}
                            />
                          ))}
                        </div>
                      )}
                      <div className={styles.addPhotoRow}>
                        <button
                          className={styles.addPhotoBtn}
                          disabled={addingPhotoTo === snag.id}
                          onClick={() => { setAddPhotoTarget(snag.id); addPhotoCameraRef.current?.click(); }}
                        >
                          <CameraIcon width={14} /> {addingPhotoTo === snag.id ? 'Adding…' : 'Take Photo'}
                        </button>
                        <button
                          className={styles.addPhotoBtn}
                          disabled={addingPhotoTo === snag.id}
                          onClick={() => { setAddPhotoTarget(snag.id); addPhotoGalleryRef.current?.click(); }}
                        >
                          <ArrowUpTrayIcon width={14} /> Upload
                        </button>
                      </div>
                    </div>

                    {isAdmin && snag.status === 'open' && (
                      <div className={styles.snagActions}>
                        <button className={styles.progressBtn} onClick={() => updateStatus(snag, 'in-progress')}>Mark In Progress</button>
                        <button className={styles.resolveBtn} onClick={() => { setResolveId(snag.id); setResolveNote(''); }}>Resolve</button>
                      </div>
                    )}
                    {isAdmin && snag.status === 'in-progress' && (
                      <div className={styles.snagActions}>
                        <button className={styles.resolveBtn} onClick={() => { setResolveId(snag.id); setResolveNote(''); }}>Mark Resolved</button>
                      </div>
                    )}
                    {isAdmin && snag.status === 'resolved' && (
                      <div className={styles.snagActions}>
                        <button className={styles.closeBtn} onClick={() => updateStatus(snag, 'closed')}>Close Snag</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Log snag modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => { setShowForm(false); resetStagedPhotos(); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Log New Snag</h3>
              <button className={styles.modalClose} onClick={() => { setShowForm(false); resetStagedPhotos(); }}><XMarkIcon width={18} /></button>
            </div>
            <form onSubmit={submitSnag}>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Block No. <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="e.g. 307" value={form.blockNo} onChange={e => setForm(f => ({ ...f, blockNo: e.target.value }))} /></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Location</label>
                  <input className={styles.formInput} placeholder="e.g. Level 3 corridor" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Defect Type <span className={styles.opt}>(optional)</span></label>
                <select
                  className={styles.formInput}
                  value={typeMode}
                  onChange={e => {
                    const v = e.target.value;
                    setTypeMode(v);
                    setForm(f => ({ ...f, type: v === 'other' ? '' : v }));
                  }}
                >
                  <option value="">Select a type…</option>
                  {DEFECT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  <option value="other">Other (please specify)</option>
                </select>
                {typeMode === 'other' && (
                  <input
                    className={styles.formInput} style={{ marginTop: 6 }}
                    placeholder="Describe the defect type"
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  />
                )}
              </div>
              <div className={styles.formRow}><label className={styles.formLbl}>Description <span style={{color:'var(--red)'}}>*</span></label>
                <textarea className={styles.formTextarea} rows={3} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the defect in detail" /></div>
              <div className={styles.formRowGroup}>
                <div className={styles.formRow}><label className={styles.formLbl}>Severity</label>
                  <select className={styles.formInput} value={form.severity} onChange={e => setForm(f => ({ ...f, severity: e.target.value }))}>
                    {SEVERITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Assign to</label>
                  <select className={styles.formInput} value={form.assignedTeam} disabled={isSubconRole} onChange={e => setForm(f => ({ ...f, assignedTeam: e.target.value }))}>
                    {Object.entries(TEAMS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select></div>
              </div>

              <div className={styles.formRow}>
                <label className={styles.formLbl}>Photos <span className={styles.opt}>(optional)</span></label>
                {stagedPhotos.length > 0 && (
                  <div className={styles.photoThumbGrid}>
                    {stagedPhotos.map((p, i) => (
                      <div key={i} className={styles.stagedThumbWrap}>
                        <img src={p.preview} alt="" className={styles.photoThumb} />
                        <button type="button" className={styles.stagedThumbRemove} onClick={() => removeStagedPhoto(i)} aria-label="Remove photo">
                          <XMarkIcon width={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className={styles.addPhotoRow}>
                  <button type="button" className={styles.addPhotoBtn} onClick={() => cameraInputRef.current?.click()}>
                    <CameraIcon width={14} /> Take Photo
                  </button>
                  <button type="button" className={styles.addPhotoBtn} onClick={() => galleryInputRef.current?.click()}>
                    <ArrowUpTrayIcon width={14} /> Upload
                  </button>
                </div>
              </div>

              <div className={styles.modalActions}>
                <button type="button" className={styles.cancelBtn} onClick={() => { setShowForm(false); resetStagedPhotos(); }}>Cancel</button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>{saving ? 'Saving…' : 'Log Snag'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Resolve modal */}
      {resolveId && (
        <div className={styles.modalOverlay} onClick={() => setResolveId(null)}>
          <div className={styles.modal} style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Resolution Note</h3>
            <textarea className={styles.formTextarea} rows={3} value={resolveNote}
              onChange={e => setResolveNote(e.target.value)} placeholder="Brief description of how it was resolved (optional)" />
            <div className={styles.modalActions}>
              <button className={styles.cancelBtn} onClick={() => setResolveId(null)}>Cancel</button>
              <button className={styles.resolveBtn} onClick={() => updateStatus(snags.find(s => s.id === resolveId), 'resolved')}>Confirm Resolved</button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs — Log New Snag form */}
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={stagePickedFile} />
      <input ref={galleryInputRef} type="file" accept="image/*" hidden onChange={stagePickedFile} />

      {/* Hidden file inputs — "Add Photo" on an already-logged snag, shared
          across all snag rows; addPhotoTarget tracks which one to attach to. */}
      <input
        ref={addPhotoCameraRef} type="file" accept="image/*" capture="environment" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; addPhotoToSnag(addPhotoTarget, f); }}
      />
      <input
        ref={addPhotoGalleryRef} type="file" accept="image/*" hidden
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; addPhotoToSnag(addPhotoTarget, f); }}
      />

      {/* Photo lightbox */}
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}><XMarkIcon width={20} /></button>
        </div>
      )}
    </div>
  );
}
