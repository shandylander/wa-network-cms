import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, where, getDocs, addDoc, updateDoc, doc, Timestamp,
} from 'firebase/firestore';
import {
  ArrowLeftIcon, CameraIcon, CheckCircleIcon, ClockIcon, XCircleIcon,
  DocumentIcon, ExclamationTriangleIcon, ReceiptPercentIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useLang, LangSwitch } from '../../context/LanguageContext';
import { compressImage, uploadWorkerDoc, extractDocument, hashFile, checkReceiptDuplicate } from '../../utils/workerDocs';
import { formatDateTime } from '../../utils/helpers';
import FileLightbox, { isImageUrl } from '../../components/UI/FileLightbox';
import styles from './Worker.module.css';

const CATEGORIES = [
  { value: 'transport', tKey: 'catTransport' },
  { value: 'meals',     tKey: 'catMeals'     },
  { value: 'materials', tKey: 'catMaterials' },
  { value: 'tools',     tKey: 'catTools'     },
  { value: 'comms',     tKey: 'catComms'     },
  { value: 'other',     tKey: 'catOther'     },
];

const STATUS_CHIP = {
  pending:  { cls: 'chipAmber', Icon: ClockIcon,       tKey: 'statusPending'  },
  approved: { cls: 'chipGreen', Icon: CheckCircleIcon, tKey: 'statusApproved' },
  rejected: { cls: 'chipRed',   Icon: XCircleIcon,     tKey: 'statusRejected' },
};

const todaySG = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore' }).format(new Date());
const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const fmtAmt  = (n) => `$${Number(n ?? 0).toFixed(2)}`;
const isISO   = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && !Number.isNaN(Date.parse(s));

const EMPTY_FORM = {
  date: '', category: 'other', description: '', amount: '',
  receiptUrl: '', receiptHash: '', receiptFileName: '', receiptPreview: null,
};

export default function WorkerClaims() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { t }           = useLang();
  const userId = userProfile?.userId;
  const fileInputRef = useRef(null);

  const [claims,     setClaims]     = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [wizard,     setWizard]     = useState(false);
  const [step,       setStep]       = useState(1);       // 1 photo · 2 check & send
  const [ocrState,   setOcrState]   = useState('none');  // none|working|done|failed
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editingId,  setEditingId]  = useState(null);    // pending claim being edited
  const [lightbox,   setLightbox]   = useState(null);    // url being enlarged

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'pettyCashClaims'), where('userId', '==', userId)));
      setClaims(snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)));
    } catch { toast.error(t('tryAgain')); }
    finally { setLoading(false); }
  }, [userId, toast, t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (form.receiptPreview) URL.revokeObjectURL(form.receiptPreview); }, [form.receiptPreview]);

  const handleReceiptFile = async (e) => {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    if (raw.size > 10 * 1024 * 1024) { toast.error(t('fileTooBig')); return; }
    setOcrState('working');
    try {
      const hash = await hashFile(raw);
      const dup = await checkReceiptDuplicate({ hash, excludeId: editingId }).catch(() => null);
      if (dup?.duplicate) {
        setOcrState('none');
        toast.error(t('receiptClaimedBy').replace('{name}', dup.claimantName));
        return;
      }
      const file = await compressImage(raw);
      const [url, ocr] = await Promise.all([
        uploadWorkerDoc(file, 'receipts', userId),
        extractDocument(file, 'receipt').catch(() => null),
      ]);
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      setForm(f => ({
        ...f,
        receiptUrl: url,
        receiptHash: hash,
        receiptFileName: raw.name,
        receiptPreview: preview,
        date: isISO(ocr?.date) ? ocr.date : (f.date || todaySG()),
        amount: ocr?.amount != null && Number(ocr.amount) > 0 ? String(ocr.amount) : f.amount,
        description: ocr?.vendor
          ? [ocr.vendor, ocr.description].filter(Boolean).join(' — ')
          : (ocr?.description ?? f.description),
        category: CATEGORIES.some(c => c.value === ocr?.category) ? ocr.category : f.category,
      }));
      setOcrState(ocr ? 'done' : 'failed');
      if (!ocr) toast.error(t('couldNotRead'));
      setStep(2);
    } catch {
      setOcrState('none');
      toast.error(t('uploadFailed'));
    }
  };

  const openWizard  = () => { setEditingId(null); setForm({ ...EMPTY_FORM, date: todaySG() }); setOcrState('none'); setStep(1); setWizard(true); };

  /* Reopen a still-pending claim for correction */
  const openEdit = (claim) => {
    setEditingId(claim.id);
    setForm({
      date: claim.date ?? todaySG(),
      category: claim.category ?? 'other',
      description: claim.description ?? '',
      amount: String(claim.amount ?? ''),
      receiptUrl: claim.receiptUrl ?? '',
      receiptHash: claim.receiptHash ?? '',
      receiptFileName: 'Receipt',
      receiptPreview: claim.receiptUrl && isImageUrl(claim.receiptUrl) ? claim.receiptUrl : null,
    });
    setOcrState('done');
    setStep(2);
    setWizard(true);
  };

  const canSubmit = form.receiptUrl && form.amount && parseFloat(form.amount) > 0 && form.date;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const fields = {
        date: form.date,
        category: form.category,
        description: form.description.trim() || CATEGORIES.find(c => c.value === form.category)?.value || 'claim',
        amount: parseFloat(form.amount),
        receiptUrl: form.receiptUrl,
        receiptHash: form.receiptHash,
      };

      if (editingId) {
        const patch = { ...fields, status: 'pending', updatedAt: Timestamp.now() };
        await updateDoc(doc(db, 'pettyCashClaims', editingId), patch);
        setClaims(c => c.map(x => x.id === editingId ? { ...x, ...patch } : x));
      } else {
        const payload = {
          userId, name: userProfile.name, team: userProfile.team ?? '',
          ...fields,
          status: 'pending',
          reviewedBy: null, reviewedAt: null, rejectionReason: null,
          createdAt: Timestamp.now(),
        };
        const ref = await addDoc(collection(db, 'pettyCashClaims'), payload);
        setClaims(c => [{ id: ref.id, ...payload }, ...c]);
      }
      toast.success(t('claimSent'));
      setWizard(false);
      setEditingId(null);
    } catch { toast.error(t('uploadFailed')); }
    finally { setSubmitting(false); }
  };

  if (loading) {
    return <div className={styles.uploadingBox}><div className={styles.spinner} /><p>{t('loading')}</p></div>;
  }

  /* ── Wizard ── */
  if (wizard) {
    return (
      <div className={styles.wizard}>
        <div className={styles.wizardInner}>
          <div className={styles.wizardHead}>
            <button className={styles.wizardBack}
              onClick={() => (step === 1 ? setWizard(false) : setStep(1))}
              aria-label={t('back')}>
              <ArrowLeftIcon width={24} />
            </button>
            <p className={styles.wizardTitle}>{t('newClaim')}</p>
          </div>

          <div className={styles.dots}>
            {[1, 2].map(n => (
              <span key={n} className={[
                styles.dot,
                n === step ? styles.dotActive : n < step ? styles.dotDone : '',
              ].join(' ')} />
            ))}
          </div>

          {/* Step 1 — receipt photo */}
          {step === 1 && (
            <>
              <p className={styles.question}>{t('photoOfReceipt')}</p>
              {ocrState === 'working' ? (
                <div className={styles.ocrBox}>
                  <div className={styles.spinner} />
                  <p>{t('readingReceipt')}</p>
                </div>
              ) : (
                <>
                  <button type="button" className={styles.uploadBtn} onClick={() => fileInputRef.current?.click()}>
                    <CameraIcon className={styles.uploadIcon} />
                    {t('takePhotoOrChooseFile')}
                  </button>
                  <p className={styles.uploadHint}>{t('mcHint').replace('MC', t('receipt'))}</p>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                capture="environment"
                style={{ display: 'none' }} onChange={handleReceiptFile} />
            </>
          )}

          {/* Step 2 — check & send */}
          {step === 2 && (
            <>
              {form.receiptPreview
                ? <img src={form.receiptPreview} alt="" className={styles.filePreview}
                    style={{ cursor: 'zoom-in' }}
                    onClick={() => setLightbox(form.receiptUrl || form.receiptPreview)} />
                : (
                  <div className={styles.pdfBadge}>
                    <DocumentIcon width={26} style={{ flexShrink: 0 }} />
                    {form.receiptFileName}
                    <CheckCircleIcon width={24} style={{ color: 'var(--green)', flexShrink: 0, marginLeft: 'auto' }} />
                  </div>
                )}
              <button type="button" className={styles.cancelBtn} onClick={() => fileInputRef.current?.click()}>
                {t('retake')}
              </button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf"
                capture="environment"
                style={{ display: 'none' }} onChange={handleReceiptFile} />

              <p className={styles.checkNote}>
                <ExclamationTriangleIcon width={20} style={{ flexShrink: 0 }} />
                {ocrState === 'done' ? t('checkAndFix') : t('couldNotRead')}
              </p>

              <label className={styles.fieldLbl}>{t('amount')} (SGD)</label>
              <div className={styles.amountWrap}>
                <span className={styles.amountPrefix}>$</span>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  className={styles.amountInput} placeholder="0.00" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
              </div>

              <label className={styles.fieldLbl}>{t('date')}</label>
              <input type="date" className={styles.bigInput} value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />

              <label className={styles.fieldLbl}>{t('whatDidYouBuy')}</label>
              <input className={styles.bigInput} value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

              <label className={styles.fieldLbl}>{t('category')}</label>
              <div className={styles.chipRow}>
                {CATEGORIES.map(({ value, tKey }) => (
                  <button key={value} type="button"
                    className={[styles.chip, form.category === value ? styles.chipActive : ''].join(' ')}
                    onClick={() => setForm(f => ({ ...f, category: value }))}>
                    {t(tKey)}
                  </button>
                ))}
              </div>

              <button type="button"
                className={[styles.hugeBtn, styles.btnGreen].join(' ')}
                disabled={!canSubmit || submitting}
                onClick={submit}>
                <CheckCircleIcon className={styles.hugeBtnIcon} />
                {submitting ? t('saving') : t('submitClaim')}
              </button>
            </>
          )}
        </div>
        {lightbox && <FileLightbox url={lightbox} onClose={() => setLightbox(null)} />}
      </div>
    );
  }

  /* ── Main screen ── */
  const totalPending  = claims.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0);
  const totalApproved = claims.filter(c => c.status === 'approved').reduce((s, c) => s + c.amount, 0);

  return (
    <div className={styles.page}>
      <div className={styles.langRow}><LangSwitch /></div>

      <div className={styles.moneyRow}>
        <div className={styles.balanceCard}>
          <ClockIcon className={[styles.balanceIcon, styles.optAmber].join(' ')} />
          <p className={styles.balanceNum} style={{ color: 'var(--amber)' }}>{fmtAmt(totalPending)}</p>
          <p className={styles.balanceLbl}>{t('statusPending')}</p>
        </div>
        <div className={styles.balanceCard}>
          <CheckCircleIcon className={[styles.balanceIcon, styles.optGreen].join(' ')} />
          <p className={styles.balanceNum} style={{ color: 'var(--green)' }}>{fmtAmt(totalApproved)}</p>
          <p className={styles.balanceLbl}>{t('approvedAllTime')}</p>
        </div>
      </div>

      <button className={[styles.hugeBtn, styles.btnRed].join(' ')} onClick={openWizard}>
        <ReceiptPercentIcon className={styles.hugeBtnIcon} /> {t('newClaim')}
      </button>

      <p className={styles.sectionTitle}>{t('myClaims')}</p>
      {claims.length === 0 ? (
        <p className={styles.empty}>{t('noClaimsYet')}</p>
      ) : (
        claims.map(c => {
          const chip = STATUS_CHIP[c.status] ?? STATUS_CHIP.pending;
          return (
            <div key={c.id} className={styles.appCard}>
              <div className={styles.appMain}>
                <p className={styles.appTitle}>{c.description}</p>
                <p className={styles.appSub}>{fmtDate(c.date)} · {t(CATEGORIES.find(x => x.value === c.category)?.tKey ?? 'catOther')}</p>
                {c.rejectionReason && <p className={styles.appReject}>{t('rejectedReason')}: {c.rejectionReason}</p>}
                {c.status !== 'pending' && c.reviewedByName && (
                  <p className={styles.appSub} style={{ marginTop: 2 }}>
                    {t(c.status === 'approved' ? 'approvedByOn' : 'rejectedByOn')
                      .replace('{name}', c.reviewedByName)
                      .replace('{date}', formatDateTime(c.reviewedAt))}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                <p className={styles.appAmt}>{fmtAmt(c.amount)}</p>
                <span className={[styles.statusChip, styles[chip.cls]].join(' ')}>
                  <chip.Icon className={styles.statusChipIcon} /> {t(chip.tKey)}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {c.receiptUrl && (
                    <button className={styles.cancelAppBtn} style={{ color: 'var(--blue)' }}
                      onClick={() => setLightbox(c.receiptUrl)}>
                      {t('receipt')}
                    </button>
                  )}
                  {c.status === 'pending' && (
                    <button className={styles.cancelAppBtn} style={{ color: 'var(--navy)' }}
                      onClick={() => openEdit(c)}>
                      {t('edit')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
      {lightbox && <FileLightbox url={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
