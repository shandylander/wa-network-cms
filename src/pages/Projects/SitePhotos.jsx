import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { CameraIcon, CheckIcon, XMarkIcon, PlusIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useCamera } from '../../hooks/useCamera';
import { fileToJpegBlob } from '../../utils/imageUtils';
import styles from './SitePhotos.module.css';

// "DDMM" for today in Singapore time, e.g. 14 Jul -> "1407".
const ddmmSG = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', day: '2-digit', month: '2-digit' }).formatToParts(date);
  const day   = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  return `${day}${month}`;
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export default function SitePhotos({ project }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const isAdmin = can('sitephotos:approve');

  const [photos,   setPhotos]   = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('all'); // 'all'|'pending'|'approved'
  const [showForm, setShowForm] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  // Form state
  const [caption,  setCaption]  = useState('');
  const [camStep,  setCamStep]  = useState('idle'); // idle|camera|preview|uploading
  const [blob,     setBlob]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [bulkProgress, setBulkProgress] = useState(null); // { done, total } while uploading multiple files
  const { setVideoRef, start, stop, capture } = useCamera();
  const fileRef = useRef(null);

  useEffect(() => {
    getDocs(query(collection(db, 'projects', project.id, 'sitePhotos'), orderBy('submittedAt', 'desc')))
      .then(snap => setPhotos(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load photos'))
      .finally(() => setLoading(false));
  }, [project.id, toast]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const openCamera = async () => {
    try { await start(); setCamStep('camera'); }
    catch { toast.error('Camera access denied.'); }
  };

  const handleCapture = async () => {
    const b = await capture(); stop();
    setBlob(b); setPreview(URL.createObjectURL(b)); setCamStep('preview');
  };

  // Contingency path: pick photo(s) from the device (gallery or the OS
  // camera app, via accept="image/*") — works in browsers where the live
  // camera (getUserMedia) is blocked. A single pick reuses the existing
  // preview→submit flow; picking multiple skips the per-photo preview
  // (impractical for a batch) and uploads them all straight away.
  const handleFilePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // reset so re-picking the same file(s) still fires onChange
    if (!files.length) return;
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (!imageFiles.length) { toast.error('Please choose image file(s).'); return; }

    if (imageFiles.length === 1) {
      setCamStep('uploading');
      try {
        const b = await fileToJpegBlob(imageFiles[0]);
        if (!b) throw new Error('encode failed');
        setBlob(b); setPreview(URL.createObjectURL(b)); setCamStep('preview');
      } catch {
        toast.error('Could not read that image. Please try another photo.');
        setCamStep('idle');
      }
      return;
    }

    await handleBulkUpload(imageFiles);
  };

  // Uploads a batch of picked photos back-to-back, each as its own
  // sitePhotos doc, auto-numbered off the caption (or the usual auto-name).
  const handleBulkUpload = async (files) => {
    setCamStep('uploading');
    setBulkProgress({ done: 0, total: files.length });
    const namePrefix = caption.trim();
    let seq = (() => {
      const ddmm = ddmmSG();
      return photos.filter(p => { const d = p.submittedAt?.toDate?.(); return d && ddmmSG(d) === ddmm; }).length;
    })();

    const uploaded = [];
    for (const file of files) {
      try {
        const b = await fileToJpegBlob(file);
        if (!b) throw new Error('encode failed');
        const data = await blobToBase64(b);
        const callable = httpsCallable(functions, 'uploadUserFile', { timeout: 60000 });
        const res = await callable({
          data, mimeType: 'image/jpeg', category: 'sitePhotos',
          projectId: project.id, fileName: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`,
        });
        const photoUrl = res.data.url;
        seq += 1;
        const seqLabel = String(seq).padStart(2, '0');
        const payload = {
          caption: namePrefix ? `${namePrefix} - ${seqLabel}` : `${project.name} - ${ddmmSG()} - ${seqLabel}`,
          photoUrl, submittedBy: userProfile.userId, submittedByName: userProfile.name,
          status: 'pending', reviewedBy: null, reviewComment: null,
          submittedAt: Timestamp.now(),
        };
        const docRef = await addDoc(collection(db, 'projects', project.id, 'sitePhotos'), payload);
        uploaded.push({ id: docRef.id, ...payload });
      } catch (err) {
        console.error(err);
      }
      setBulkProgress(p => ({ ...p, done: p.done + 1 }));
    }

    setPhotos(p => [...uploaded.slice().reverse(), ...p]);
    if (uploaded.length === files.length) toast.success(`${uploaded.length} photos submitted`);
    else if (uploaded.length > 0) toast.error(`${uploaded.length}/${files.length} uploaded — some failed`);
    else toast.error('Failed to upload photos.');

    setShowForm(false); setCamStep('idle'); setBlob(null); setPreview(null);
    setCaption(''); setBulkProgress(null);
  };

  const handleRetake = async () => { setBlob(null); setPreview(null); await start(); setCamStep('camera'); };

  // Fallback name when the worker leaves "Photo Name" blank — "{Project} -
  // DDMM - 01", sequence resetting daily per project. Counts today's already-
  // submitted photos in the already-loaded `photos` state; not a strict
  // atomic counter (two workers submitting at the same instant could land on
  // the same number), which is fine for a browsing label, not an ID.
  const nextAutoName = () => {
    const ddmm = ddmmSG();
    const todayCount = photos.filter(p => {
      const d = p.submittedAt?.toDate?.();
      return d && ddmmSG(d) === ddmm;
    }).length;
    const seq = String(todayCount + 1).padStart(2, '0');
    return `${project.name} - ${ddmm} - ${seq}`;
  };

  const handleSubmit = async () => {
    if (!blob) { toast.error('Please take a photo first.'); return; }
    setCamStep('uploading');
    try {
      const data = await blobToBase64(blob);
      const callable = httpsCallable(functions, 'uploadUserFile', { timeout: 60000 });
      const res = await callable({
        data, mimeType: 'image/jpeg', category: 'sitePhotos',
        projectId: project.id, fileName: `${Date.now()}.jpg`,
      });
      const photoUrl = res.data.url;
      const payload  = {
        caption: caption.trim() || nextAutoName(),
        photoUrl, submittedBy: userProfile.userId, submittedByName: userProfile.name,
        status: 'pending', reviewedBy: null, reviewComment: null,
        submittedAt: Timestamp.now(),
      };
      const docRef = await addDoc(collection(db, 'projects', project.id, 'sitePhotos'), payload);
      setPhotos(p => [{ id: docRef.id, ...payload }, ...p]);
      toast.success('Photo submitted');
      setShowForm(false); setCamStep('idle'); setBlob(null); setPreview(null);
      setCaption('');
    } catch { toast.error('Failed to upload photo.'); setCamStep('idle'); }
  };

  const updateStatus = async (photo, status, comment = '') => {
    try {
      await updateDoc(doc(db, 'projects', project.id, 'sitePhotos', photo.id), {
        status, reviewedBy: userProfile.userId, reviewComment: comment,
      });
      setPhotos(p => p.map(x => x.id === photo.id ? { ...x, status, reviewComment: comment } : x));
      toast.success(status === 'approved' ? 'Photo approved' : 'Photo rejected');
    } catch { toast.error('Failed to update status'); }
  };

  const filtered = filter === 'all' ? photos : photos.filter(p => p.status === filter);
  const pendingCount = photos.filter(p => p.status === 'pending').length;

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          {['all','pending','approved'].map(f => (
            <button key={f} className={[styles.filterBtn, filter === f ? styles.filterBtnActive : ''].join(' ')} onClick={() => setFilter(f)}>
              {f === 'all' ? `All (${photos.length})` : f === 'pending' ? `Pending${pendingCount ? ` (${pendingCount})` : ''}` : 'Approved'}
            </button>
          ))}
        </div>
        <button className={styles.addBtn} onClick={() => { setShowForm(true); setCamStep('idle'); }}>
          <PlusIcon width={14} /> Add Photo
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className={styles.empty}>No photos yet. Tap "Add Photo" to submit the first site photo.</p>
      ) : (
        <div className={styles.grid}>
          {filtered.map(photo => (
            <div key={photo.id} className={styles.photoCard}>
              <img src={photo.photoUrl} alt={photo.caption || 'Site photo'} className={styles.photoImg}
                onClick={() => setLightbox(photo)} />
              <div className={styles.photoMeta}>
                <div className={styles.photoMetaTop}>
                  {photo.caption && <span className={styles.photoName}>{photo.caption}</span>}
                  <span className={[styles.statusDot, photo.status === 'approved' ? styles.dotGreen : photo.status === 'rejected' ? styles.dotRed : styles.dotAmber].join(' ')} />
                </div>
                <p className={styles.photoBy}>{photo.submittedByName}</p>
                {isAdmin && photo.status === 'pending' && (
                  <div className={styles.reviewBtns}>
                    <button className={styles.approveBtn} onClick={() => updateStatus(photo, 'approved')}><CheckIcon width={12} /> Approve</button>
                    <button className={styles.rejectBtn}  onClick={() => updateStatus(photo, 'rejected')}><XMarkIcon width={12} /> Reject</button>
                  </div>
                )}
                {photo.reviewComment && <p className={styles.reviewComment}>{photo.reviewComment}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add photo modal */}
      {showForm && (
        <div className={styles.modalOverlay} onClick={() => { stop(); setShowForm(false); setCamStep('idle'); }}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3 className={styles.modalTitle}>Add Site Photo</h3>
              <button className={styles.modalClose} onClick={() => { stop(); setShowForm(false); setCamStep('idle'); }}><XMarkIcon width={18} /></button>
            </div>

            {camStep === 'idle' && (
              <>
                <div className={styles.formRow}><label className={styles.formLbl}>Photo Name <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="e.g. Front entrance" value={caption} onChange={e => setCaption(e.target.value)} />
                  <p className={styles.nameHint}>Leave blank to auto-name it "{nextAutoName()}". Selecting multiple photos numbers them automatically.</p></div>
                <button className={styles.cameraBtn} onClick={openCamera}><CameraIcon width={18} /> Open Camera</button>
                <div className={styles.orDivider}><span>or</span></div>
                <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={handleFilePick} />
                <button className={styles.uploadBtn} onClick={() => fileRef.current?.click()}>
                  <ArrowUpTrayIcon width={18} /> Upload Photo(s)
                </button>
                <p className={styles.uploadHint}>Camera not opening? Use "Upload Photo(s)" to take a new one or pick multiple from your gallery.</p>
              </>
            )}

            {camStep === 'camera' && (
              <div className={styles.cameraWrap}>
                <video ref={setVideoRef} autoPlay playsInline muted className={styles.cameraVideo} />
                <div className={styles.camBtns}>
                  <button className={styles.captureBtn} onClick={handleCapture}><CameraIcon width={20} /> Capture</button>
                  <button className={styles.camCancel} onClick={() => { stop(); setCamStep('idle'); }}>Cancel</button>
                </div>
              </div>
            )}

            {camStep === 'preview' && (
              <div className={styles.cameraWrap}>
                <img src={preview} alt="Preview" className={styles.cameraVideo} />
                <div className={styles.camBtns}>
                  <button className={styles.captureBtn} onClick={handleSubmit}><CheckIcon width={16} /> Submit</button>
                  <button className={styles.camCancel} onClick={handleRetake}>Retake</button>
                </div>
              </div>
            )}

            {camStep === 'uploading' && (
              <div className={styles.loading}><div className={styles.spinner} />
                <p>{bulkProgress ? `Uploading ${bulkProgress.done}/${bulkProgress.total}…` : 'Uploading…'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lightboxInner} onClick={e => e.stopPropagation()}>
            <img src={lightbox.photoUrl} alt="Site photo" className={styles.lightboxImg} />
            {lightbox.caption && <p className={styles.lightboxCaption}>{lightbox.caption}</p>}
            <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
