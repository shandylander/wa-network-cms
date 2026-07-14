import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp,
} from 'firebase/firestore';
import {
  ArrowLeftIcon, SunIcon, HeartIcon, BanknotesIcon, ArrowsRightLeftIcon,
  CameraIcon, CheckCircleIcon, ClockIcon, XCircleIcon, DocumentIcon,
  ExclamationTriangleIcon, CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useLang, LangSwitch } from '../../context/LanguageContext';
import { compressImage, uploadWorkerDoc, extractDocument } from '../../utils/workerDocs';
import { DEFAULT_AL, DEFAULT_MC } from '../../utils/leaveDefaults';
import { formatDateTime } from '../../utils/helpers';
import FileLightbox, { isImageUrl } from '../../components/UI/FileLightbox';
import styles from './Worker.module.css';

const TYPES = [
  { value: 'AL',  tKey: 'annualLeave',  Icon: SunIcon,             cls: 'optBlue'   },
  { value: 'MC',  tKey: 'medicalLeave', Icon: HeartIcon,           cls: 'optGreen'  },
  { value: 'NPL', tKey: 'noPayLeave',   Icon: BanknotesIcon,       cls: 'optAmber'  },
  { value: 'OIL', tKey: 'offInLieu',    Icon: ArrowsRightLeftIcon, cls: 'optPurple' },
];

const STATUS_CHIP = {
  pending:   { cls: 'chipAmber', Icon: ClockIcon,       tKey: 'statusPending'   },
  approved:  { cls: 'chipGreen', Icon: CheckCircleIcon, tKey: 'statusApproved'  },
  rejected:  { cls: 'chipRed',   Icon: XCircleIcon,     tKey: 'statusRejected'  },
  cancelled: { cls: 'chipGrey',  Icon: XCircleIcon,     tKey: 'statusCancelled' },
};

const calcDays = (from, to, halfDay) => {
  if (halfDay) return 0.5;
  if (!from || !to) return 0;
  const diff = Math.floor((new Date(to) - new Date(from)) / 86400000) + 1;
  return Math.max(1, diff);
};

const fmtDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));

const EMPTY_FORM = {
  type: null, dateFrom: '', dateTo: '', dayMode: 'full', reason: '',
  mcUrl: '', mcFileName: '', mcPreview: null, mcClinic: '',
};

export default function WorkerLeave() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { t }           = useLang();
  const userId = userProfile?.userId;
  const year   = new Date().getFullYear();
  const fileInputRef = useRef(null);

  const [entitlement, setEntitlement] = useState({ al: DEFAULT_AL, mc: DEFAULT_MC });
  const [apps,        setApps]        = useState([]);
  const [loading,     setLoading]     = useState(true);

  const [wizard,     setWizard]     = useState(false);
  const [step,       setStep]       = useState(1);           // 1 type · 2 days/MC · 3 confirm
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [mcState,    setMcState]    = useState('none');      // none|working|done|failed
  const [submitting, setSubmitting] = useState(false);
  const [editing,    setEditing]    = useState(null);        // pending app being edited
  const [lightbox,   setLightbox]   = useState(null);        // url being enlarged

  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [entSnap, appSnap] = await Promise.all([
        getDocs(query(collection(db, 'leaveEntitlements'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'leaveApplications'), where('userId', '==', userId), where('year', '==', year))),
      ]);
      if (!entSnap.empty) {
        const ent = entSnap.docs[0].data();
        setEntitlement({ al: ent.al ?? DEFAULT_AL, mc: ent.mc ?? DEFAULT_MC });
      }
      setApps(appSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
    } catch { toast.error(t('uploadFailed')); }
    finally { setLoading(false); }
  }, [userId, year, toast, t]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => () => { if (form.mcPreview) URL.revokeObjectURL(form.mcPreview); }, [form.mcPreview]);

  const used = (type, statuses = ['approved']) =>
    apps.filter(a => a.type === type && statuses.includes(a.status))
        .reduce((s, a) => s + (a.days ?? 0), 0);

  const remaining = (type, entitled) => entitled - used(type) - used(type, ['pending']);
  const alLeft = remaining('AL', entitlement.al ?? 0);
  const mcLeft = remaining('MC', entitlement.mc ?? 0);

  const halfDay = form.dayMode !== 'full';
  const days    = calcDays(form.dateFrom, halfDay ? form.dateFrom : form.dateTo, halfDay);

  /* ── MC upload + OCR ── */
  const handleMcFile = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    if (raw.size > 10 * 1024 * 1024) { toast.error(t('fileTooBig')); return; }
    setMcState('working');
    try {
      const file = await compressImage(raw);
      const [url, ocr] = await Promise.all([
        uploadWorkerDoc(file, 'mc', userId),
        extractDocument(file, 'mc').catch(() => null),
      ]);
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setForm(f => ({
        ...f,
        mcUrl: url,
        mcFileName: raw.name,
        mcPreview: preview,
        mcClinic: ocr?.clinic ?? '',
        dateFrom: isISO(ocr?.dateFrom) ? ocr.dateFrom : f.dateFrom,
        dateTo:   isISO(ocr?.dateTo)   ? ocr.dateTo
                : isISO(ocr?.dateFrom) ? ocr.dateFrom : f.dateTo,
      }));
      setMcState(ocr ? 'done' : 'failed');
      if (!ocr) toast.error(t('couldNotRead'));
    } catch {
      setMcState('none');
      toast.error(t('uploadFailed'));
    }
  };

  /* ── Navigation ── */
  const openWizard  = () => { setEditing(null); setForm(EMPTY_FORM); setMcState('none'); setStep(1); setWizard(true); };
  const closeWizard = () => { setWizard(false); setEditing(null); };

  /* Reopen a still-pending application for correction */
  const openEdit = (app) => {
    setEditing(app);
    setForm({
      type: app.type,
      dateFrom: app.dateFrom,
      dateTo: app.halfDay ? '' : (app.dateTo ?? ''),
      dayMode: app.halfDay ? (app.halfDayPeriod ?? 'AM') : 'full',
      reason: app.reason ?? '',
      mcUrl: app.mcUrl ?? '',
      mcFileName: app.mcUrl ? 'MC' : '',
      mcPreview: app.mcUrl && isImageUrl(app.mcUrl) ? app.mcUrl : null,
      mcClinic: app.mcClinic ?? '',
    });
    setMcState(app.mcUrl ? 'done' : app.type === 'MC' ? 'failed' : 'none');
    setStep(2);
    setWizard(true);
  };
  const pickType    = (value) => { setForm(f => ({ ...f, type: value })); setStep(2); };

  const canGoConfirm =
    form.dateFrom && (halfDay || form.dateTo) &&
    (form.type !== 'MC' || form.mcUrl);

  /* ── Submit ── */
  const submit = async () => {
    // When editing, the app's own pending days are already counted as used —
    // credit them back so re-saving the same dates passes the balance check.
    const credit = (type) => (editing && editing.type === type ? (editing.days ?? 0) : 0);
    if (form.type === 'AL' && days > alLeft + credit('AL')) { toast.error(t('notEnoughBalance')); return; }
    if (form.type === 'MC' && days > mcLeft + credit('MC')) { toast.error(t('notEnoughBalance')); return; }

    setSubmitting(true);
    try {
      const typeLabel = { AL: 'Annual Leave', MC: 'Medical Leave', NPL: 'No-Pay Leave', OIL: 'Off-in-Lieu' }[form.type];
      const reason = form.reason.trim()
        || (form.type === 'MC'
              ? `Medical leave${form.mcClinic ? ` — ${form.mcClinic}` : ''} (MC attached)`
              : typeLabel);
      const fields = {
        type: form.type,
        dateFrom: form.dateFrom,
        dateTo: halfDay ? form.dateFrom : form.dateTo,
        days,
        halfDay,
        halfDayPeriod: halfDay ? form.dayMode : null,
        reason,
        mcUrl: form.type === 'MC' ? form.mcUrl : null,
        mcClinic: form.type === 'MC' ? (form.mcClinic || null) : null,
      };

      if (editing) {
        const patch = { ...fields, status: 'pending', updatedAt: Timestamp.now() };
        await updateDoc(doc(db, 'leaveApplications', editing.id), patch);
        setApps(a => a.map(x => x.id === editing.id ? { ...x, ...patch } : x));
        toast.success(t('submitted'));
        setWizard(false);
        setEditing(null);
        return;
      }

      const payload = {
        userId, name: userProfile.name, team: userProfile.team ?? '',
        ...fields,
        status: 'pending',
        reviewedBy: null, reviewedAt: null, rejectionReason: null,
        year,
        createdAt: Timestamp.now(),
      };
      const ref = await addDoc(collection(db, 'leaveApplications'), payload);
      setApps(a => [{ id: ref.id, ...payload }, ...a]);

      const dateRange = halfDay
        ? `${fmtDate(form.dateFrom)} (${form.dayMode} half)`
        : form.dateTo && form.dateTo !== form.dateFrom
          ? `${fmtDate(form.dateFrom)} – ${fmtDate(form.dateTo)}`
          : fmtDate(form.dateFrom);
      addDoc(collection(db, 'announcements'), {
        message: `Leave request: ${userProfile.name} — ${typeLabel}, ${dateRange} (${days} day${days !== 1 ? 's' : ''})`,
        severity: 'info', audience: ['management'],
        createdBy: userProfile.userId, createdByName: userProfile.name,
        createdAt: Timestamp.now(), readBy: [],
        isSystemNotification: true, link: '/leave', leaveId: ref.id,
      }).catch(() => {});

      toast.success(t('submitted'));
      setWizard(false);
    } catch { toast.error(t('uploadFailed')); }
    finally { setSubmitting(false); }
  };

  const cancelApp = async (app) => {
    if (app.status !== 'pending') return;
    if (!window.confirm(t('confirmCancel'))) return;
    try {
      await updateDoc(doc(db, 'leaveApplications', app.id), { status: 'cancelled' });
      setApps(a => a.map(x => x.id === app.id ? { ...x, status: 'cancelled' } : x));
      toast.success(t('done'));
    } catch { toast.error(t('tryAgain')); }
  };

  if (loading) {
    return <div className={styles.uploadingBox}><div className={styles.spinner} /><p>{t('loading')}</p></div>;
  }

  /* ── Wizard ── */
  if (wizard) {
    const typeInfo = TYPES.find(x => x.value === form.type);
    return (
      <div className={styles.wizard}>
        <div className={styles.wizardInner}>
          <div className={styles.wizardHead}>
            <button className={styles.wizardBack}
              onClick={() => (step === 1 ? closeWizard() : setStep(s => s - 1))}
              aria-label={t('back')}>
              <ArrowLeftIcon width={24} />
            </button>
            <p className={styles.wizardTitle}>{t('applyLeave')}</p>
          </div>

          <div className={styles.dots}>
            {[1, 2, 3].map(n => (
              <span key={n} className={[
                styles.dot,
                n === step ? styles.dotActive : n < step ? styles.dotDone : '',
              ].join(' ')} />
            ))}
          </div>

          {/* Step 1 — type */}
          {step === 1 && (
            <>
              <p className={styles.question}>{t('whatKindOfLeave')}</p>
              <div className={styles.optionGrid}>
                {TYPES.map(({ value, tKey, Icon, cls }) => (
                  <button key={value} type="button" className={styles.optionCard} onClick={() => pickType(value)}>
                    <Icon className={[styles.optionIcon, styles[cls]].join(' ')} />
                    {t(tKey)}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 2 — MC upload (MC only) + dates */}
          {step === 2 && (
            <>
              {form.type === 'MC' && (
                <>
                  <p className={styles.question}>{t('uploadMC')}</p>

                  {mcState === 'none' && (
                    <>
                      <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                        <CameraIcon className={styles.uploadIcon} />
                        {t('takePhotoOrChooseFile')}
                      </button>
                      <p className={styles.uploadHint}>{t('mcHint')}</p>
                    </>
                  )}

                  {mcState === 'working' && (
                    <div className={styles.ocrBox}>
                      <div className={styles.spinner} />
                      <p>{t('readingMC')}</p>
                    </div>
                  )}

                  {(mcState === 'done' || mcState === 'failed') && (
                    <>
                      {form.mcPreview
                        ? <img src={form.mcPreview} alt="" className={styles.filePreview}
                            style={{ cursor: 'zoom-in' }}
                            onClick={() => setLightbox(form.mcUrl || form.mcPreview)} />
                        : (
                          <div className={styles.pdfBadge}
                            style={{ cursor: 'pointer' }}
                            onClick={() => form.mcUrl && window.open(form.mcUrl, '_blank', 'noopener')}>
                            <DocumentIcon width={26} style={{ flexShrink: 0 }} />
                            {form.mcFileName}
                            <CheckCircleIcon width={24} style={{ color: 'var(--green)', flexShrink: 0, marginLeft: 'auto' }} />
                          </div>
                        )}
                      <button type="button" className={styles.cancelBtn} onClick={() => fileInputRef.current?.click()}>
                        {t('retake')}
                      </button>
                      <p className={styles.checkNote}>
                        <ExclamationTriangleIcon width={20} style={{ flexShrink: 0 }} />
                        {mcState === 'done' ? t('checkAndFix') : t('couldNotRead')}
                      </p>
                      {form.mcClinic && (
                        <>
                          <label className={styles.fieldLbl}>{t('clinic')}</label>
                          <input className={styles.bigInput} value={form.mcClinic}
                            onChange={e => setForm(f => ({ ...f, mcClinic: e.target.value }))} />
                        </>
                      )}
                    </>
                  )}

                  <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                    style={{ display: 'none' }} onChange={handleMcFile} />
                </>
              )}

              {form.type !== 'MC' && <p className={styles.question}>{t('whichDays')}</p>}

              {(form.type !== 'MC' || mcState === 'done' || mcState === 'failed') && (
                <>
                  <label className={styles.fieldLbl}>{t('firstDay')}</label>
                  <input type="date" className={styles.bigInput} value={form.dateFrom}
                    onChange={e => setForm(f => ({ ...f, dateFrom: e.target.value }))} />

                  {!halfDay && (
                    <>
                      <label className={styles.fieldLbl}>{t('lastDay')}</label>
                      <input type="date" className={styles.bigInput} value={form.dateTo}
                        min={form.dateFrom}
                        onChange={e => setForm(f => ({ ...f, dateTo: e.target.value }))} />
                    </>
                  )}

                  <label className={styles.fieldLbl}>{t('totalDays')}</label>
                  <div className={styles.chipRow}>
                    {[
                      { v: 'full', tKey: 'fullDay'   },
                      { v: 'AM',   tKey: 'halfDayAM' },
                      { v: 'PM',   tKey: 'halfDayPM' },
                    ].map(({ v, tKey }) => (
                      <button key={v} type="button"
                        className={[styles.chip, form.dayMode === v ? styles.chipActive : ''].join(' ')}
                        onClick={() => setForm(f => ({ ...f, dayMode: v, dateTo: v === 'full' ? f.dateTo : '' }))}>
                        {t(tKey)}
                      </button>
                    ))}
                  </div>

                  {form.dateFrom && (halfDay || form.dateTo) && (
                    <p className={styles.totalPreview}>
                      {t('totalDays')}: {days} {days === 1 || days === 0.5 ? t('day') : t('days')}
                    </p>
                  )}

                  <button type="button"
                    className={[styles.hugeBtn, styles.btnNavy].join(' ')}
                    disabled={!canGoConfirm}
                    onClick={() => setStep(3)}>
                    {t('next')}
                  </button>
                </>
              )}
            </>
          )}

          {/* Step 3 — confirm */}
          {step === 3 && typeInfo && (
            <>
              <p className={styles.question}>{t('confirmLeave')}</p>
              <div className={styles.confirmList}>
                <div className={styles.confirmRow}>
                  <span className={styles.confirmLbl}>{t('leave')}</span>
                  <span className={styles.confirmVal}>{t(typeInfo.tKey)}</span>
                </div>
                <div className={styles.confirmRow}>
                  <span className={styles.confirmLbl}>{t('firstDay')}</span>
                  <span className={styles.confirmVal}>{fmtDate(form.dateFrom)}</span>
                </div>
                {!halfDay && (
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmLbl}>{t('lastDay')}</span>
                    <span className={styles.confirmVal}>{fmtDate(form.dateTo)}</span>
                  </div>
                )}
                <div className={styles.confirmRow}>
                  <span className={styles.confirmLbl}>{t('totalDays')}</span>
                  <span className={styles.confirmVal}>
                    {days} {days === 1 || days === 0.5 ? t('day') : t('days')}
                    {halfDay ? ` (${form.dayMode})` : ''}
                  </span>
                </div>
                {form.type === 'MC' && (
                  <div className={styles.confirmRow}>
                    <span className={styles.confirmLbl}>MC</span>
                    <span className={styles.confirmVal}>
                      <CheckCircleIcon width={18} style={{ color: 'var(--green)', verticalAlign: '-3px', marginRight: 4 }} />
                      {t('mcAttached')}
                    </span>
                  </div>
                )}
              </div>

              <label className={styles.fieldLbl}>{t('reasonOptional')}</label>
              <input className={styles.bigInput} value={form.reason}
                onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} />

              <button type="button"
                className={[styles.hugeBtn, styles.btnGreen].join(' ')}
                disabled={submitting}
                onClick={submit}>
                <CheckCircleIcon className={styles.hugeBtnIcon} />
                {submitting ? t('saving') : t('submit')}
              </button>
            </>
          )}
        </div>
        {lightbox && <FileLightbox url={lightbox} onClose={() => setLightbox(null)} />}
      </div>
    );
  }

  /* ── Main screen ── */
  return (
    <div className={styles.page}>
      <div className={styles.langRow}><LangSwitch /></div>

      <div className={styles.balanceGrid}>
        <div className={styles.balanceCard}>
          <SunIcon className={[styles.balanceIcon, styles.optBlue].join(' ')} />
          <p className={styles.balanceNum} style={{ color: 'var(--blue)' }}>{alLeft}</p>
          <p className={styles.balanceLbl}>{t('annualLeave')} · {t('daysLeft')}</p>
        </div>
        <div className={styles.balanceCard}>
          <HeartIcon className={[styles.balanceIcon, styles.optGreen].join(' ')} />
          <p className={styles.balanceNum} style={{ color: 'var(--green)' }}>{mcLeft}</p>
          <p className={styles.balanceLbl}>{t('medicalLeave')} · {t('daysLeft')}</p>
        </div>
      </div>

      <button className={[styles.hugeBtn, styles.btnRed].join(' ')} onClick={openWizard}>
        <CalendarDaysIcon className={styles.hugeBtnIcon} /> {t('applyLeave')}
      </button>

      <p className={styles.sectionTitle}>{t('myApplications')}</p>
      {apps.length === 0 ? (
        <p className={styles.empty}>—</p>
      ) : (
        apps.map(app => {
          const chip = STATUS_CHIP[app.status] ?? STATUS_CHIP.pending;
          const typeInfo = TYPES.find(x => x.value === app.type);
          return (
            <div key={app.id} className={styles.appCard}>
              <div className={styles.appMain}>
                <p className={styles.appTitle}>{typeInfo ? t(typeInfo.tKey) : app.type}</p>
                <p className={styles.appSub}>
                  {fmtDate(app.dateFrom)}{app.dateTo !== app.dateFrom ? ` – ${fmtDate(app.dateTo)}` : ''}
                  {' · '}{app.days} {app.days === 1 || app.days === 0.5 ? t('day') : t('days')}
                </p>
                {app.rejectionReason && (
                  <p className={styles.appReject}>{t('rejectedReason')}: {app.rejectionReason}</p>
                )}
                {app.status !== 'pending' && app.reviewedByName && (
                  <p className={styles.appSub}>
                    {t(app.status === 'approved' ? 'approvedByOn' : 'rejectedByOn')
                      .replace('{name}', app.reviewedByName)
                      .replace('{date}', formatDateTime(app.reviewedAt))}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <span className={[styles.statusChip, styles[chip.cls]].join(' ')}>
                  <chip.Icon className={styles.statusChipIcon} /> {t(chip.tKey)}
                </span>
                {app.mcUrl && (
                  <button className={styles.cancelAppBtn} style={{ color: 'var(--blue)' }}
                    onClick={() => setLightbox(app.mcUrl)}>
                    MC
                  </button>
                )}
                {app.status === 'pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className={styles.cancelAppBtn} style={{ color: 'var(--navy)' }}
                      onClick={() => openEdit(app)}>
                      {t('edit')}
                    </button>
                    <button className={styles.cancelAppBtn} onClick={() => cancelApp(app)}>
                      {t('cancel')}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })
      )}
      {lightbox && <FileLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
