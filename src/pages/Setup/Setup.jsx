import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  getAuth,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
  writeBatch, doc, setDoc, getDoc, getDocs, collection,
} from 'firebase/firestore';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  MinusCircleIcon,
  EyeIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/solid';
import { db, firebaseConfig, pinToPassword } from '../../firebase';
import { PROJECT_SEED, PCS_BATCH3_BLOCKS, HSE_DOCS_SEED } from '../../utils/blockData';
import styles from './Setup.module.css';

const PROJECT_ID = 'pcs-batch-3';

const STEPS = [
  { id: 'check',   label: 'Checking system state' },
  { id: 'auth',    label: 'Creating admin account in Firebase Auth' },
  { id: 'users',   label: 'Writing admin profile to Firestore' },
  { id: 'project', label: 'Creating PCS Batch 3 project' },
  { id: 'blocks',  label: `Seeding block data (${PCS_BATCH3_BLOCKS.length} blocks)` },
  { id: 'hse',     label: `Loading HSE documents (${HSE_DOCS_SEED.length} files)` },
  { id: 'flag',    label: 'Finalising setup' },
];

function StepRow({ step, status, error }) {
  return (
    <div className={[styles.step, styles[status]].join(' ')}>
      <div className={styles.stepIcon}>
        {status === 'done'    && <CheckCircleIcon   width={18} />}
        {status === 'skipped' && <MinusCircleIcon   width={18} />}
        {status === 'error'   && <ExclamationCircleIcon width={18} />}
        {status === 'running' && <ArrowPathIcon width={18} className={styles.spin} />}
        {status === 'pending' && <span className={styles.dot} />}
      </div>
      <div>
        <p className={styles.stepLabel}>
          {step.label}
          {status === 'skipped' && <span className={styles.skipNote}> — already done, skipped</span>}
        </p>
        {error && <p className={styles.stepError}>{error}</p>}
      </div>
    </div>
  );
}

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'setup');
  const app = existing ?? initializeApp(firebaseConfig, 'setup');
  return getAuth(app);
}

export default function Setup() {
  const navigate = useNavigate();

  const [phase,    setPhase]    = useState('idle');
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(STEPS.map(s => [s.id, 'pending']))
  );
  const [errors,  setErrors]   = useState({});
  const [checking, setChecking] = useState(true);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [createdId, setCreatedId] = useState('');

  // Form state
  const [adminId,   setAdminId]   = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminPin,  setAdminPin]  = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [showPin,    setShowPin]    = useState(false);

  // Form validation
  const idTrimmed  = adminId.trim().toUpperCase();
  const nameTrimmed = adminName.trim();
  const pinOk      = /^\d{4}$/.test(adminPin);
  const pinMatch   = adminPin === pinConfirm;
  const formValid  = idTrimmed && nameTrimmed && pinOk && pinMatch;

  // Check if already seeded
  useEffect(() => {
    const check = async () => {
      try {
        const snap = await getDoc(doc(db, '_metadata', 'setup'));
        if (snap.exists()) setAlreadyDone(true);
      } catch (_) {}
      setChecking(false);
    };
    check();
  }, []);

  const setStep = (id, status, error) => {
    setStatuses(p => ({ ...p, [id]: status }));
    if (error) setErrors(p => ({ ...p, [id]: error }));
  };

  const runSeed = async () => {
    if (!formValid) return;
    setPhase('running');

    try {
      // ── Step 1: Check existing data ─────────────────────────────────
      setStep('check', 'running');
      const [projectSnap, blocksSnap, hseSnap] = await Promise.all([
        getDoc(doc(db, 'projects', PROJECT_ID)),
        getDocs(collection(db, 'projects', PROJECT_ID, 'blocks')),
        getDocs(collection(db, 'projects', PROJECT_ID, 'documents')),
      ]);
      const projectExists = projectSnap.exists();
      const blocksExist   = blocksSnap.size > 0;
      const hseExist      = hseSnap.size > 0;
      setStep('check', 'done');

      // ── Step 2: Create admin Firebase Auth account ───────────────────
      setStep('auth', 'running');
      const secAuth = getSecondaryAuth();
      const email   = `${idTrimmed.toLowerCase()}@wanetwork.cms`;
      try {
        await createUserWithEmailAndPassword(secAuth, email, pinToPassword(adminPin));
        await fbSignOut(secAuth);
      } catch (err) {
        if (err.code === 'auth/email-already-in-use') {
          // Account exists — acceptable if re-running
          try { await fbSignOut(secAuth); } catch (_) {}
        } else {
          throw new Error(`Auth creation failed: ${err.message}`);
        }
      }
      setStep('auth', 'done');

      // ── Step 3: Write admin Firestore profile ────────────────────────
      setStep('users', 'running');
      await setDoc(doc(db, 'users', idTrimmed), {
        userId:     idTrimmed,
        name:       nameTrimmed,
        role:       'owner',
        team:       'none',
        parentId:   null,
        firstLogin: true,
        status:     'active',
        createdAt:  new Date(),
      });
      setCreatedId(idTrimmed);
      setStep('users', 'done');

      // ── Step 4: Project ──────────────────────────────────────────────
      if (projectExists) {
        setStep('project', 'skipped');
      } else {
        setStep('project', 'running');
        await setDoc(doc(db, 'projects', PROJECT_ID), {
          ...PROJECT_SEED,
          createdAt: new Date(),
        });
        setStep('project', 'done');
      }

      // ── Step 5: Blocks (skip if already seeded to avoid duplicates) ──
      if (blocksExist) {
        setStep('blocks', 'skipped');
      } else {
        setStep('blocks', 'running');
        const BATCH_SIZE = 200;
        for (let i = 0; i < PCS_BATCH3_BLOCKS.length; i += BATCH_SIZE) {
          const chunk = PCS_BATCH3_BLOCKS.slice(i, i + BATCH_SIZE);
          const blockBatch = writeBatch(db);
          chunk.forEach(block => {
            const ref = doc(collection(db, 'projects', PROJECT_ID, 'blocks'));
            blockBatch.set(ref, { ...block, createdAt: new Date() });
          });
          await blockBatch.commit();
        }
        setStep('blocks', 'done');
      }

      // ── Step 6: HSE documents ────────────────────────────────────────
      if (hseExist) {
        setStep('hse', 'skipped');
      } else {
        setStep('hse', 'running');
        const hseBatch = writeBatch(db);
        HSE_DOCS_SEED.forEach(docData => {
          const ref = doc(db, 'projects', PROJECT_ID, 'documents', docData.id);
          hseBatch.set(ref, { ...docData, uploadedAt: new Date(), uploadedBy: idTrimmed });
        });
        await hseBatch.commit();
        setStep('hse', 'done');
      }

      // ── Step 7: Flag setup complete ──────────────────────────────────
      setStep('flag', 'running');
      await setDoc(doc(db, '_metadata', 'setup'), {
        seededAt:   new Date(),
        projectId:  PROJECT_ID,
        blockCount: PCS_BATCH3_BLOCKS.length,
        adminId:    idTrimmed,
        version:    '2.0',
      });
      setStep('flag', 'done');

      setPhase('done');
    } catch (err) {
      console.error('Seed error:', err);
      setStatuses(p => {
        const updated = { ...p };
        const runningKey = Object.keys(updated).find(k => updated[k] === 'running');
        if (runningKey) { updated[runningKey] = 'error'; }
        return updated;
      });
      setErrors(p => ({ ...p, _global: err.message }));
      setPhase('error');
    }
  };

  const doneCount = Object.values(statuses).filter(s => s === 'done' || s === 'skipped').length;
  const progress  = Math.round((doneCount / STEPS.length) * 100);

  const Logo = () => (
    <div className={styles.logo}>
      <span className={styles.wa}>WA!</span>
      <span className={styles.net}>NETWORK ASIA</span>
    </div>
  );

  if (checking) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <Logo />
          <p className={styles.checking}>Checking system state…</p>
        </div>
      </div>
    );
  }

  if (alreadyDone) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <Logo />
          <div className={styles.alreadyDone}>
            <CheckCircleIcon width={40} className={styles.bigCheck} />
            <h2>System already initialised</h2>
            <p>The database has been seeded. Sign in to continue.</p>
            <button className={styles.loginBtn} onClick={() => navigate('/login')}>
              Go to Sign In →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <Logo />
        <h1 className={styles.heading}>System Setup</h1>
        <p className={styles.sub}>
          Create your admin account and seed the PCS Batch 3 project data.
          After setup, add other users via <strong>Settings → Users</strong>.
        </p>

        {/* Admin account form */}
        {phase === 'idle' && (
          <div className={styles.adminForm}>
            <div className={styles.formSection}>Admin Account</div>
            <div className={styles.field}>
              <label className={styles.fieldLbl}>User ID</label>
              <input
                className={styles.fieldInput}
                value={adminId}
                onChange={e => setAdminId(e.target.value.toUpperCase())}
                placeholder="e.g. ADMIN or WA001"
                maxLength={20}
                autoFocus
              />
              <span className={styles.fieldHint}>This is the ID you will use to log in. Cannot be changed later.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLbl}>Full Name</label>
              <input
                className={styles.fieldInput}
                value={adminName}
                onChange={e => setAdminName(e.target.value)}
                placeholder="e.g. Andy Ng"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLbl}>Initial PIN (4 digits)</label>
              <div className={styles.pinWrap}>
                <input
                  className={styles.fieldInput}
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={4}
                  value={adminPin}
                  onChange={e => setAdminPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="••••"
                />
                <button type="button" className={styles.pinToggle} onClick={() => setShowPin(v => !v)}>
                  {showPin ? <EyeSlashIcon width={16} /> : <EyeIcon width={16} />}
                </button>
              </div>
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLbl}>Confirm PIN</label>
              <input
                className={[styles.fieldInput, pinConfirm && !pinMatch ? styles.fieldError : ''].join(' ')}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                maxLength={4}
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="••••"
              />
              {pinConfirm && !pinMatch && (
                <span className={styles.fieldErrMsg}>PINs do not match</span>
              )}
            </div>
          </div>
        )}

        {/* Progress bar */}
        {phase !== 'idle' && (
          <div className={styles.progressWrap}>
            <div className={styles.progressBar}>
              <div
                className={[styles.progressFill, phase === 'error' ? styles.progressError : ''].join(' ')}
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className={styles.progressPct}>{progress}%</span>
          </div>
        )}

        {/* Steps */}
        {phase !== 'idle' && (
          <div className={styles.steps}>
            {STEPS.map(step => (
              <StepRow key={step.id} step={step} status={statuses[step.id]} error={errors[step.id]} />
            ))}
          </div>
        )}

        {errors._global && (
          <p className={styles.globalError}>⚠ {errors._global}</p>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {phase === 'idle' && (
            <button className={styles.startBtn} onClick={runSeed} disabled={!formValid}>
              Initialize System
            </button>
          )}
          {phase === 'running' && (
            <button className={styles.startBtn} disabled>
              <ArrowPathIcon width={16} className={styles.spin} /> Setting up…
            </button>
          )}
          {phase === 'done' && (
            <button className={[styles.startBtn, styles.successBtn].join(' ')} onClick={() => navigate('/login')}>
              <CheckCircleIcon width={16} /> Setup Complete — Sign In
            </button>
          )}
          {phase === 'error' && (
            <button className={[styles.startBtn, styles.retryBtn].join(' ')} onClick={runSeed}>
              Retry Setup
            </button>
          )}
        </div>

        {phase === 'done' && createdId && (
          <p className={styles.hint}>
            Sign in as <strong>{createdId}</strong> with the PIN you just set.
          </p>
        )}
      </div>
    </div>
  );
}
