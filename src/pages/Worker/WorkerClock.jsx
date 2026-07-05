import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  collection, query, where, orderBy, getDocs, addDoc, updateDoc, doc, Timestamp,
} from 'firebase/firestore';
import {
  ClockIcon, CameraIcon, MapPinIcon, CheckCircleIcon, ArrowPathIcon,
  ArrowRightStartOnRectangleIcon, SunIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckSolid } from '@heroicons/react/24/solid';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useLang, LangSwitch } from '../../context/LanguageContext';
import {
  getLocation, reverseGeocode, uploadSelfie, todaySG, fmtTime, calcHours, mapsLink,
} from '../../utils/attendanceUtils';
import styles from './Worker.module.css';

/* Camera hook (same behaviour as admin ClockPanel) */
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

const greetingKey = () => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false }).format(new Date()));
  if (h < 12) return 'goodMorning';
  if (h < 18) return 'goodAfternoon';
  return 'goodEvening';
};

const isoDaysAgo = (n) => {
  const d = new Date(Date.now() - n * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(d);
};

const fmtDayShort = (iso, lang) => {
  const d = new Date(`${iso}T12:00:00+08:00`);
  const locale = lang === 'bn' ? 'bn' : lang === 'ta' ? 'ta' : 'en-SG';
  return {
    date: new Intl.DateTimeFormat('en-SG', { day: 'numeric', month: 'short' }).format(d),
    dow:  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d),
  };
};

export default function WorkerClock() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { t, lang }     = useLang();
  const { videoRef, start, stop, capture } = useCamera();

  const [record,   setRecord]   = useState(null);
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [step,     setStep]     = useState('idle'); // idle|locating|camera|preview|uploading
  const [action,   setAction]   = useState(null);   // 'in' | 'out'
  const [blob,     setBlob]     = useState(null);
  const [preview,  setPreview]  = useState(null);
  const [location, setLocation] = useState(null);
  const [locErr,   setLocErr]   = useState(false);

  const date   = todaySG();
  const userId = userProfile?.userId;
  const isComplete  = record?.clockOut != null;
  const isClockedIn = record?.clockIn  != null && !isComplete;

  /* Today's record + last 30 days history in one query. If the composite
     index is missing, fall back to an equality-only query for today so
     clock in/out still works (prevents double clock-in). */
  useEffect(() => {
    if (!userId) return;
    getDocs(query(
      collection(db, 'attendance'),
      where('userId', '==', userId),
      where('date', '>=', isoDaysAgo(30)),
      orderBy('date', 'desc'),
    ))
      .then(snap => {
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setHistory(rows);
        const today = rows.find(r => r.date === date);
        if (today) setRecord(today);
      })
      .catch(() =>
        getDocs(query(collection(db, 'attendance'), where('userId', '==', userId), where('date', '==', date)))
          .then(snap => { if (!snap.empty) setRecord({ id: snap.docs[0].id, ...snap.docs[0].data() }); })
          .catch(() => {})
      )
      .finally(() => setLoading(false));
  }, [userId, date]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => stop(), [stop]);

  const beginClock = async (type) => {
    setAction(type);
    setLocErr(false);
    setStep('locating');
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
        const rec = { id: ref.id, ...payload };
        setRecord(rec);
        setHistory(h => [rec, ...h.filter(r => r.id !== ref.id)]);
        toast.success(t('clockInDone'));
      } else {
        const hoursWorked = calcHours(record.clockIn.time, now);
        const patch = { clockOut: { time: now, photoUrl, ...locData }, hoursWorked, status: 'complete' };
        await updateDoc(doc(db, 'attendance', record.id), patch);
        setRecord(r => ({ ...r, ...patch }));
        setHistory(h => h.map(r => r.id === record.id ? { ...r, ...patch } : r));
        toast.success(t('clockOutDone'));
      }
      setStep('idle');
      setBlob(null);
      setPreview(null);
    } catch {
      toast.error(t('uploadFailed'));
      setStep('idle');
    }
  };

  if (loading) {
    return <div className={styles.uploadingBox}><div className={styles.spinner} /><p>{t('loading')}</p></div>;
  }

  /* ── Guided camera flow ── */
  if (step !== 'idle') {
    const stepState = (n) => {
      const order = { locating: 1, camera: 2, preview: 2, uploading: 3 };
      const cur = order[step];
      if (n < cur) return styles.stepChipDone;
      if (n === cur) return styles.stepChipActive;
      return '';
    };
    return (
      <div className={styles.cameraWrap}>
        <p className={styles.cameraTitle}>
          {action === 'in' ? t('clockIn') : t('clockOut')}
        </p>

        <div className={styles.stepsRow}>
          <span className={[styles.stepChip, stepState(1)].join(' ')}><MapPinIcon width={17} /> 1</span>
          <span className={[styles.stepChip, stepState(2)].join(' ')}><CameraIcon width={17} /> 2</span>
          <span className={[styles.stepChip, stepState(3)].join(' ')}><CheckCircleIcon width={17} /> 3</span>
        </div>

        {(step === 'camera' || step === 'locating') && (
          <>
            <p className={styles.statusSub}>{t('takeSelfie')}</p>
            <video ref={videoRef} autoPlay playsInline muted className={styles.cameraVideo} />
            {locErr && <p className={styles.locWarn}><MapPinIcon width={16} /> {t('gpsUnavailable')}</p>}
            <button
              className={[styles.hugeBtn, styles.btnNavy].join(' ')}
              onClick={handleCapture}
              disabled={step === 'locating'}
            >
              <CameraIcon className={styles.hugeBtnIcon} />
              {step === 'locating' ? t('gettingLocation') : t('capture')}
            </button>
            <button className={styles.cancelBtn} onClick={() => { stop(); setStep('idle'); }}>
              {t('cancel')}
            </button>
          </>
        )}

        {step === 'preview' && (
          <>
            <img src={preview} alt="" className={styles.cameraVideo} />
            {location && (
              <p className={styles.locChip}>
                <MapPinIcon width={15} /> {location.address || `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`}
              </p>
            )}
            <button className={[styles.hugeBtn, styles.btnGreen].join(' ')} onClick={handleConfirm}>
              <CheckCircleIcon className={styles.hugeBtnIcon} /> {t('looksGood')}
            </button>
            <button className={styles.cancelBtn} onClick={handleRetake}>
              <ArrowPathIcon width={17} style={{ verticalAlign: '-3px', marginRight: 6 }} />
              {t('retake')}
            </button>
          </>
        )}

        {step === 'uploading' && (
          <div className={styles.uploadingBox}>
            <div className={styles.spinner} />
            <p>{t('saving')}</p>
          </div>
        )}
      </div>
    );
  }

  /* ── Month summary ── */
  const monthPrefix = date.slice(0, 7);
  const monthRows   = history.filter(r => r.date.startsWith(monthPrefix));
  const monthDays   = monthRows.length;

  /* ── Main screen ── */
  return (
    <div className={styles.page}>
      <div className={styles.langRow}><LangSwitch /></div>

      <p className={styles.greeting}>{t(greetingKey())}, {userProfile?.name}</p>
      <p className={styles.dateStrip}>
        {new Date().toLocaleDateString(lang === 'bn' ? 'bn' : lang === 'ta' ? 'ta' : 'en-SG',
          { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Singapore' })}
      </p>

      {/* Today card */}
      {!record && (
        <>
          <div className={styles.bigCard}>
            <ClockIcon className={[styles.statusIcon, styles.iconGrey].join(' ')} />
            <p className={styles.statusTitle}>{t('notWorkingYet')}</p>
          </div>
          <button className={[styles.hugeBtn, styles.btnGreen].join(' ')} onClick={() => beginClock('in')}>
            <SunIcon className={styles.hugeBtnIcon} /> {t('clockIn')}
          </button>
        </>
      )}

      {isClockedIn && (
        <>
          <div className={[styles.bigCard, styles.bigCardGreen].join(' ')}>
            <CheckSolid className={[styles.statusIcon, styles.iconGreen].join(' ')} />
            <p className={styles.statusTitle}>{t('youAreWorking')}</p>
            <p className={styles.statusSub}>{t('since')}</p>
            <p className={styles.bigTime}>{fmtTime(record.clockIn.time)}</p>
            {record.clockIn.address && (
              <a href={mapsLink(record.clockIn.lat, record.clockIn.lng)} target="_blank" rel="noreferrer" className={styles.locChip}>
                <MapPinIcon width={15} /> {record.clockIn.address}
              </a>
            )}
          </div>
          <button className={[styles.hugeBtn, styles.btnRed].join(' ')} onClick={() => beginClock('out')}>
            <ArrowRightStartOnRectangleIcon className={styles.hugeBtnIcon} /> {t('clockOut')}
          </button>
        </>
      )}

      {isComplete && (
        <div className={[styles.bigCard, styles.bigCardBlue].join(' ')}>
          <CheckSolid className={[styles.statusIcon, styles.iconBlue].join(' ')} />
          <p className={styles.statusTitle}>{t('doneForToday')}</p>
          <div className={styles.summaryRow}>
            <div className={styles.summaryItem}>
              <p className={styles.summaryLbl}>{t('timeIn')}</p>
              <p className={styles.summaryVal}>{fmtTime(record.clockIn.time)}</p>
            </div>
            <div className={styles.summaryItem}>
              <p className={styles.summaryLbl}>{t('timeOut')}</p>
              <p className={styles.summaryVal}>{fmtTime(record.clockOut.time)}</p>
            </div>
            <div className={styles.summaryItem}>
              <p className={styles.summaryLbl}>{t('hoursWorked')}</p>
              <p className={styles.summaryVal}>{record.hoursWorked ?? '—'}</p>
            </div>
          </div>
          <div>
            {record.clockIn?.photoUrl  && <img src={record.clockIn.photoUrl}  alt="" className={styles.selfieThumb} />}
            {record.clockOut?.photoUrl && <img src={record.clockOut.photoUrl} alt="" className={styles.selfieThumb} />}
          </div>
        </div>
      )}

      {/* History */}
      <p className={styles.sectionTitle}>{t('myDays')}</p>
      <div className={styles.monthCard}>
        <span className={styles.monthNum}>{monthDays}</span>
        <span className={styles.monthLbl}>{t('daysWorked')} · {t('thisMonth')}</span>
      </div>

      {history.length === 0 ? (
        <p className={styles.empty}>{t('noDaysYet')}</p>
      ) : (
        history.slice(0, 14).map(r => {
          const { date: dLbl, dow } = fmtDayShort(r.date, lang);
          return (
            <div key={r.id} className={styles.dayRow}>
              <div>
                <p className={styles.dayDate}>{dLbl}</p>
                <p className={styles.dayDow}>{dow}</p>
              </div>
              <p className={styles.dayTimes}>
                {fmtTime(r.clockIn?.time)} → {fmtTime(r.clockOut?.time)}
              </p>
              <p className={styles.dayHours}>{r.hoursWorked != null ? `${r.hoursWorked}h` : '—'}</p>
            </div>
          );
        })
      )}
    </div>
  );
}
