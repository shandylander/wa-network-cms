import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, Timestamp, query, orderBy } from 'firebase/firestore';
import { CameraIcon, CheckIcon, XMarkIcon, PlusIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import styles from './SitePhotos.module.css';

const STAGES = ['fix1','fix2','fix3','fix4','general'];
const STAGE_LABELS = { fix1:'Conduit (Fix 1)', fix2:'CAT6 Cable (Fix 2)', fix3:'Server Rack (Fix 3)', fix4:'Camera (Fix 4)', general:'General' };

// Downscale + re-encode a picked image so submissions stay small and EXIF
// orientation is baked into the pixels. Mirrors the live-camera path's output
// (~jpeg 0.85). Used by the "Upload Photo" contingency for when getUserMedia
// isn't available (many in-app / WebView browsers block the live camera).
const MAX_DIM = 1600;
async function fileToJpegBlob(file) {
  let bitmap;
  try {
    // createImageBitmap honours EXIF orientation, so portrait photos stay upright.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('decode failed'));
      img.src = URL.createObjectURL(file);
    });
  }
  const w = bitmap.width, h = bitmap.height;
  const scale = Math.min(1, MAX_DIM / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width  = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  if (bitmap.close) bitmap.close();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}

function useCamera() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);
  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } } });
    streamRef.current = stream;
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, []);
  const stop = useCallback(() => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null; }, []);
  const capture = useCallback(() => new Promise(resolve => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(resolve, 'image/jpeg', 0.85);
  }), []);
  return { videoRef, start, stop, capture };
}

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
  const [blockNo,  setBlockNo]  = useState('');
  const [stage,    setStage]    = useState('general');
  const [caption,  setCaption]  = useState('');
  const [camStep,  setCamStep]  = useState('idle'); // idle|camera|preview|uploading
  const [blob,     setBlob]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const { videoRef, start, stop, capture } = useCamera();
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

  // Contingency path: pick a photo from the device (gallery or the OS camera
  // app, via accept="image/*") — works in browsers where the live camera
  // (getUserMedia) is blocked. Downscale, then reuse the same preview→submit flow.
  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so re-picking the same file still fires onChange
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file.'); return; }
    setCamStep('uploading');
    try {
      const b = await fileToJpegBlob(file);
      if (!b) throw new Error('encode failed');
      setBlob(b); setPreview(URL.createObjectURL(b)); setCamStep('preview');
    } catch {
      toast.error('Could not read that image. Please try another photo.');
      setCamStep('idle');
    }
  };

  const handleRetake = async () => { setBlob(null); setPreview(null); await start(); setCamStep('camera'); };

  const handleSubmit = async () => {
    if (!blob) { toast.error('Please take a photo first.'); return; }
    setCamStep('uploading');
    try {
      const path    = `sitePhotos/${project.id}/${Date.now()}.jpg`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, blob, { contentType: 'image/jpeg' });
      const photoUrl = await getDownloadURL(fileRef);
      const payload  = {
        blockNo: blockNo.trim(), stage, caption: caption.trim(),
        photoUrl, submittedBy: userProfile.userId, submittedByName: userProfile.name,
        status: 'pending', reviewedBy: null, reviewComment: null,
        submittedAt: Timestamp.now(),
      };
      const docRef = await addDoc(collection(db, 'projects', project.id, 'sitePhotos'), payload);
      setPhotos(p => [{ id: docRef.id, ...payload }, ...p]);
      toast.success('Photo submitted');
      setShowForm(false); setCamStep('idle'); setBlob(null); setPreview(null);
      setBlockNo(''); setCaption(''); setStage('general');
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
                  {photo.blockNo && <span className={styles.blockTag}>Blk {photo.blockNo}</span>}
                  <span className={styles.stageTag}>{STAGE_LABELS[photo.stage] ?? photo.stage}</span>
                  <span className={[styles.statusDot, photo.status === 'approved' ? styles.dotGreen : photo.status === 'rejected' ? styles.dotRed : styles.dotAmber].join(' ')} />
                </div>
                {photo.caption && <p className={styles.caption}>{photo.caption}</p>}
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
                <div className={styles.formRow}><label className={styles.formLbl}>Block No. <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="e.g. 307" value={blockNo} onChange={e => setBlockNo(e.target.value)} /></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Stage</label>
                  <select className={styles.formInput} value={stage} onChange={e => setStage(e.target.value)}>
                    {STAGES.map(s => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
                  </select></div>
                <div className={styles.formRow}><label className={styles.formLbl}>Caption <span className={styles.opt}>(optional)</span></label>
                  <input className={styles.formInput} placeholder="Brief description" value={caption} onChange={e => setCaption(e.target.value)} /></div>
                <button className={styles.cameraBtn} onClick={openCamera}><CameraIcon width={18} /> Open Camera</button>
                <div className={styles.orDivider}><span>or</span></div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleFilePick} />
                <button className={styles.uploadBtn} onClick={() => fileRef.current?.click()}>
                  <ArrowUpTrayIcon width={18} /> Upload Photo
                </button>
                <p className={styles.uploadHint}>Camera not opening? Use "Upload Photo" to take a new one or pick from your gallery.</p>
              </>
            )}

            {camStep === 'camera' && (
              <div className={styles.cameraWrap}>
                <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
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
              <div className={styles.loading}><div className={styles.spinner} /><p>Uploading…</p></div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <div className={styles.lightboxInner} onClick={e => e.stopPropagation()}>
            <img src={lightbox.photoUrl} alt="Site photo" className={styles.lightboxImg} />
            <p className={styles.lightboxCaption}>{lightbox.blockNo ? `Blk ${lightbox.blockNo} · ` : ''}{STAGE_LABELS[lightbox.stage]} {lightbox.caption ? `· ${lightbox.caption}` : ''}</p>
            <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
