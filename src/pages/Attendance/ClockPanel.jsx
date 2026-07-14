import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp } from 'firebase/firestore';
import { CameraIcon, MapPinIcon, CheckCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { getLocation, reverseGeocode, uploadSelfie, todaySG, fmtTime, calcHours, mapsLink } from '../../utils/attendanceUtils';
import styles from './Attendance.module.css';

/* ── Camera hook ─────────────────────────────────────────────────── */
function useCamera() {
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    });
    streamRef.current = stream;
    if (videoRef.current) { videoRef.current.srcObject = stream; }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  const capture = useCallback(() =>
    new Promise((resolve) => {
      const video  = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width  = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      canvas.toBlob(resolve, 'image/jpeg', 0.82);
    }), []);

  return { videoRef, start, stop, capture };
}

/* ── Main component ──────────────────────────────────────────────── */
export default function ClockPanel() {
  const { userProfile }    = useAuth();
  const { toast }          = useToast();
  const { videoRef, start, stop, capture } = useCamera();

  const [record,   setRecord]   = useState(null);   // today's Firestore doc
  const [loading,  setLoading]  = useState(true);
  const [step,     setStep]     = useState('idle'); // idle|locating|camera|preview|uploading
  const [action,   setAction]   = useState(null);  // 'in' | 'out'
  const [blob,     setBlob]     = useState(null);
  const [preview,  setPreview]  = useState(null);  // object URL
  const [location, setLocation] = useState(null);
  const [locErr,   setLocErr]   = useState(false);

  const date    = todaySG();
  const userId  = userProfile?.userId;
  const isComplete = record?.clockOut != null;
  const isClockedIn = record?.clockIn  != null && !isComplete;

  /* Load today's record */
  useEffect(() => {
    if (!userId) return;
    getDocs(query(collection(db, 'attendance'), where('userId', '==', userId), where('date', '==', date)))
      .then(snap => { if (!snap.empty) setRecord({ id: snap.docs[0].id, ...snap.docs[0].data() }); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId, date]);

  /* Clean up preview URL */
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const beginClock = async (type) => {
    setAction(type);
    setLocErr(false);
    setStep('locating');
    // Start GPS and camera simultaneously
    const [locResult] = await Promise.allSettled([getLocation()]);
    if (locResult.status === 'fulfilled') {
      const loc = locResult.value;
      const address = await reverseGeocode(loc.lat, loc.lng).catch(() => '');
      setLocation({ ...loc, address });
    } else {
      setLocErr(true);
      setLocation(null);
    }
    try {
      await start();
      setStep('camera');
    } catch {
      toast.error('Camera access denied. Please allow camera permission and try again.');
      setStep('idle');
    }
  };

  const handleCapture = async () => {
    const photoBlob = await capture();
    stop();
    setBlob(photoBlob);
    setPreview(URL.createObjectURL(photoBlob));
    setStep('preview');
  };

  const handleRetake = async () => {
    setBlob(null);
    setPreview(null);
    await start();
    setStep('camera');
  };

  const handleConfirm = async () => {
    setStep('uploading');
    try {
      const photoUrl = await uploadSelfie(blob, userId, date, action);
      const now      = Timestamp.now();
      const locData  = location
        ? { lat: location.lat, lng: location.lng, accuracy: location.accuracy, address: location.address }
        : null;

      if (action === 'in') {
        const payload = {
          userId, name: userProfile.name, team: userProfile.team ?? '',
          date, status: 'open', manuallyEdited: false,
          clockIn:  { time: now, photoUrl, ...locData },
          clockOut: null, hoursWorked: null,
          createdAt: now,
        };
        const ref = await addDoc(collection(db, 'attendance'), payload);
        setRecord({ id: ref.id, ...payload });
        toast.success('Clocked in successfully');
      } else {
        const hoursWorked = calcHours(record.clockIn.time, now);
        await updateDoc(doc(db, 'attendance', record.id), {
          clockOut: { time: now, photoUrl, ...locData },
          hoursWorked, status: 'complete',
        });
        setRecord(r => ({ ...r, clockOut: { time: now, photoUrl, ...locData }, hoursWorked, status: 'complete' }));
        toast.success(`Clocked out — ${hoursWorked}h worked`);
      }
      setStep('done');
    } catch (err) {
      toast.error('Failed to save. Please try again.');
      setStep('idle');
    }
  };

  if (loading) return <div className={styles.panelLoading}><div className={styles.spinner} /></div>;

  /* ── Camera / preview step ── */
  if (step === 'camera' || step === 'preview' || step === 'locating' || step === 'uploading') {
    return (
      <div className={styles.cameraWrap}>
        <p className={styles.cameraTitle}>
          {action === 'in' ? 'Clock In' : 'Clock Out'} — take a selfie
        </p>

        {(step === 'camera' || step === 'locating') && (
          <>
            <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
            <div className={styles.cameraActions}>
              {locErr && (
                <p className={styles.locWarn}>
                  <MapPinIcon width={14} /> GPS unavailable — photo only
                </p>
              )}
              <button
                className={styles.captureBtn}
                onClick={handleCapture}
                disabled={step === 'locating'}
              >
                <CameraIcon width={20} />
                {step === 'locating' ? 'Getting location…' : 'Capture'}
              </button>
              <button className={styles.cancelCamBtn} onClick={() => { stop(); setStep('idle'); }}>Cancel</button>
            </div>
          </>
        )}

        {step === 'preview' && (
          <>
            <img src={preview} alt="Selfie preview" className={styles.cameraVideo} />
            {location && (
              <p className={styles.locInfo}><MapPinIcon width={13} /> {location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}</p>
            )}
            <div className={styles.cameraActions}>
              <button className={styles.captureBtn} onClick={handleConfirm}>
                <CheckCircleIcon width={18} /> Confirm &amp; Save
              </button>
              <button className={styles.cancelCamBtn} onClick={handleRetake}>
                <ArrowPathIcon width={14} /> Retake
              </button>
            </div>
          </>
        )}

        {step === 'uploading' && (
          <div className={styles.uploadingMsg}>
            <div className={styles.spinner} />
            <p>Saving…</p>
          </div>
        )}
      </div>
    );
  }

  /* ── Status panel ── */
  return (
    <div className={styles.clockPanel}>
      <div className={styles.dateStrip}>{new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Singapore' })}</div>

      {!record && (
        <div className={styles.statusBox}>
          <div className={[styles.statusDot, styles.dotGrey].join(' ')} />
          <p className={styles.statusLabel}>Not clocked in</p>
          <button className={styles.clockInBtn} onClick={() => beginClock('in')}>
            <CameraIcon width={16} /> Clock In
          </button>
        </div>
      )}

      {isClockedIn && (
        <div className={styles.statusBox}>
          <div className={[styles.statusDot, styles.dotGreen, 'pulseDot'].join(' ')} />
          <p className={styles.statusLabel}>Clocked in at <strong>{fmtTime(record.clockIn.time)}</strong></p>
          {record.clockIn.address && (
            <a href={mapsLink(record.clockIn.lat, record.clockIn.lng)} target="_blank" rel="noreferrer" className={styles.locLink}>
              <MapPinIcon width={12} /> {record.clockIn.address}
            </a>
          )}
          {record.clockIn.photoUrl && (
            <img src={record.clockIn.photoUrl} alt="Clock-in selfie" className={styles.thumbImg} />
          )}
          <button className={styles.clockOutBtn} onClick={() => beginClock('out')}>
            <CameraIcon width={16} /> Clock Out
          </button>
        </div>
      )}

      {isComplete && (
        <div className={styles.statusBox}>
          <div className={[styles.statusDot, styles.dotBlue].join(' ')} />
          <p className={styles.statusLabel}>Attendance complete</p>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLbl}>In</span>
              <span className={styles.summaryVal}>{fmtTime(record.clockIn.time)}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLbl}>Out</span>
              <span className={styles.summaryVal}>{fmtTime(record.clockOut.time)}</span>
            </div>
            <div className={styles.summaryItem}>
              <span className={styles.summaryLbl}>Hours</span>
              <span className={styles.summaryVal}>{record.hoursWorked ?? '—'}h</span>
            </div>
          </div>
          <div className={styles.photoRow}>
            {record.clockIn?.photoUrl  && <img src={record.clockIn.photoUrl}  alt="In"  className={styles.thumbImg} />}
            {record.clockOut?.photoUrl && <img src={record.clockOut.photoUrl} alt="Out" className={styles.thumbImg} />}
          </div>
        </div>
      )}
    </div>
  );
}
