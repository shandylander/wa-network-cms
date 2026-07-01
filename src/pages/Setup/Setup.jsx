import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  getAuth,
} from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
  writeBatch, doc, setDoc, getDoc, collection,
} from 'firebase/firestore';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/solid';
import { db, firebaseConfig, pinToPassword } from '../../firebase';
import { USERS_SEED, PROJECT_SEED, PCS_BATCH3_BLOCKS, HSE_DOCS_SEED } from '../../utils/blockData';
import styles from './Setup.module.css';

const PROJECT_ID = 'pcs-batch-3';

const STEPS = [
  { id: 'check',   label: 'Checking existing data' },
  { id: 'auth',    label: `Creating Firebase Auth accounts (${USERS_SEED.length} users)` },
  { id: 'users',   label: 'Writing user profiles to Firestore' },
  { id: 'project', label: 'Creating project: PCS Batch 3' },
  { id: 'blocks',  label: `Seeding block data (${PCS_BATCH3_BLOCKS.length} blocks)` },
  { id: 'hse',     label: `Loading HSE documents (${HSE_DOCS_SEED.length} files)` },
  { id: 'flag',    label: 'Finalising setup' },
];

function StepRow({ step, status, error }) {
  return (
    <div className={[styles.step, styles[status]].join(' ')}>
      <div className={styles.stepIcon}>
        {status === 'done'    && <CheckCircleIcon  width={18} />}
        {status === 'error'   && <ExclamationCircleIcon width={18} />}
        {status === 'running' && <ArrowPathIcon width={18} className={styles.spin} />}
        {(status === 'pending') && <span className={styles.dot} />}
      </div>
      <div>
        <p className={styles.stepLabel}>{step.label}</p>
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
  const [phase,    setPhase]    = useState('idle'); // idle | running | done | error
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries(STEPS.map(s => [s.id, 'pending']))
  );
  const [errors,   setErrors]   = useState({});
  const [alreadySeeded, setAlreadySeeded] = useState(false);
  const [checking, setChecking] = useState(true);

  // Check if already seeded
  useEffect(() => {
    const check = async () => {
      try {
        const snap = await getDoc(doc(db, '_metadata', 'setup'));
        if (snap.exists()) setAlreadySeeded(true);
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
    setPhase('running');

    try {
      // ── Step 1: Check ─────────────────────────────────────────────────
      setStep('check', 'running');
      await getDoc(doc(db, 'projects', PROJECT_ID));
      setStep('check', 'done');

      // ── Step 2: Firebase Auth users ───────────────────────────────────
      setStep('auth', 'running');
      const secAuth = getSecondaryAuth();
      for (const user of USERS_SEED) {
        const email = `${user.userId}@wanetwork.cms`;
        try {
          await createUserWithEmailAndPassword(secAuth, email, pinToPassword(user.pin));
          await fbSignOut(secAuth);
        } catch (err) {
          if (err.code === 'auth/email-already-in-use') {
            // Already exists — skip silently
            try { await fbSignOut(secAuth); } catch (_) {}
          } else {
            throw new Error(`Auth failed for ${user.userId}: ${err.message}`);
          }
        }
      }
      setStep('auth', 'done');

      // ── Step 3: User profiles ─────────────────────────────────────────
      setStep('users', 'running');
      const userBatch = writeBatch(db);
      USERS_SEED.forEach(u => {
        const { pin, ...profile } = u; // never store the PIN
        userBatch.set(doc(db, 'users', u.userId), {
          ...profile,
          createdAt: new Date(),
        });
      });
      await userBatch.commit();
      setStep('users', 'done');

      // ── Step 4: Project ───────────────────────────────────────────────
      setStep('project', 'running');
      await setDoc(doc(db, 'projects', PROJECT_ID), {
        ...PROJECT_SEED,
        createdAt: new Date(),
      });
      setStep('project', 'done');

      // ── Step 5: Blocks (175 — batched in groups of 200) ──────────────
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

      // ── Step 6: HSE documents ─────────────────────────────────────────
      setStep('hse', 'running');
      const hseBatch = writeBatch(db);
      HSE_DOCS_SEED.forEach(doc_ => {
        const ref = doc(db, 'projects', PROJECT_ID, 'documents', doc_.id);
        hseBatch.set(ref, { ...doc_, uploadedAt: new Date(), uploadedBy: 'WA001' });
      });
      await hseBatch.commit();
      setStep('hse', 'done');

      // ── Step 7: Flag setup as complete ────────────────────────────────
      setStep('flag', 'running');
      await setDoc(doc(db, '_metadata', 'setup'), {
        seededAt:    new Date(),
        projectId:   PROJECT_ID,
        blockCount:  PCS_BATCH3_BLOCKS.length,
        userCount:   USERS_SEED.length,
        version:     '1.0',
      });
      setStep('flag', 'done');

      setPhase('done');
    } catch (err) {
      console.error('Seed error:', err);
      // Mark the currently running step as error
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

  const doneCount  = Object.values(statuses).filter(s => s === 'done').length;
  const progress   = Math.round((doneCount / STEPS.length) * 100);

  if (checking) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}><span className={styles.wa}>WA!</span><span className={styles.net}>NETWORK ASIA</span></div>
          <p className={styles.checking}>Checking system state…</p>
        </div>
      </div>
    );
  }

  if (alreadySeeded) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.logo}><span className={styles.wa}>WA!</span><span className={styles.net}>NETWORK ASIA</span></div>
          <div className={styles.alreadyDone}>
            <CheckCircleIcon width={40} className={styles.bigCheck} />
            <h2>System already initialised</h2>
            <p>The database has been seeded. You can sign in now.</p>
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
        {/* Logo */}
        <div className={styles.logo}>
          <span className={styles.wa}>WA!</span>
          <span className={styles.net}>NETWORK ASIA</span>
        </div>

        <h1 className={styles.heading}>First-time Setup</h1>
        <p className={styles.sub}>
          This will create all user accounts and seed the PCS Batch 3 project data into Firebase.
          Run this once only.
        </p>

        {/* Info box */}
        <div className={styles.infoBox}>
          <div className={styles.infoRow}><span>Users to create</span><strong>{USERS_SEED.length}</strong></div>
          <div className={styles.infoRow}><span>Blocks to seed</span><strong>{PCS_BATCH3_BLOCKS.length}</strong></div>
          <div className={styles.infoRow}><span>HSE documents</span><strong>{HSE_DOCS_SEED.length}</strong></div>
          <div className={styles.infoRow}><span>Project</span><strong>PCS Batch 3</strong></div>
        </div>

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

        {/* Error message */}
        {errors._global && (
          <p className={styles.globalError}>⚠ {errors._global}</p>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {phase === 'idle' && (
            <button className={styles.startBtn} onClick={runSeed}>
              Initialise System
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

        {phase === 'idle' && (
          <p className={styles.hint}>
            After setup, sign in as <strong>WA001</strong> with PIN <strong>1234</strong>.
          </p>
        )}
      </div>
    </div>
  );
}
