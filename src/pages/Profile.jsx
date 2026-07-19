import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { DocumentTextIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCertTypes } from '../hooks/useAppConfig';
import { ROLES, TEAMS } from '../utils/permissions';
import { certStatus, certLabel } from '../utils/certTypes';
import Card, { CardHeader } from '../components/UI/Card';
import Badge from '../components/UI/Badge';
import Button from '../components/UI/Button';
import PinBoxes from '../components/UI/PinBoxes';
import ThemeToggle from '../components/UI/ThemeToggle';
import DocumentViewerModal from '../components/UI/DocumentViewerModal';
import styles from './Profile.module.css';

const CERT_BADGE = { valid: 'green', expiring: 'amber', expired: 'red', none: 'default' };

export default function Profile() {
  const { userProfile, changePin } = useAuth();
  const { toast } = useToast();
  const { certTypes } = useCertTypes();

  // A logged-in account may be linked to a Site Workforce record (set by an
  // admin in Worker Modal) — if so, surface their own certs/passes/permits
  // here so they can show an inspector or client on the spot.
  const [myWorker, setMyWorker] = useState(null);
  const [docsLoading, setDocsLoading] = useState(true);
  const [viewDoc, setViewDoc] = useState(null);

  useEffect(() => {
    if (!userProfile?.userId) return;
    getDocs(query(collection(db, 'workers'), where('linkedUserId', '==', userProfile.userId)))
      .then(snap => setMyWorker(snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }))
      .catch(() => setMyWorker(null))
      .finally(() => setDocsLoading(false));
  }, [userProfile?.userId]);

  // All PINs are 6 digits here — any account that reaches this page has
  // already passed the forced 4→6 upgrade gate in App.js.
  const [current, setCurrent] = useState('');
  const [next,    setNext]    = useState('');
  const [confirm, setConfirm] = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const curRef  = useRef(null);
  const nextRef = useRef(null);
  const conRef  = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (current.length < 6)   { setError('Enter your current 6-digit PIN.');   return; }
    if (next.length < 6)      { setError('Enter a 6-digit new PIN.');          return; }
    if (next !== confirm)     { setError('New PINs do not match.');            return; }
    if (next === current)     { setError('New PIN must differ from current.'); return; }
    setLoading(true);
    try {
      await changePin(current, next);
      toast.success('PIN changed successfully.');
      setCurrent(''); setNext(''); setConfirm('');
      curRef.current?.clear(); nextRef.current?.clear(); conRef.current?.clear();
      curRef.current?.focus();
    } catch (err) {
      if (err.code === 'auth/invalid-credential') {
        setError('Current PIN is incorrect.');
      } else {
        setError('Failed to change PIN. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const role     = userProfile?.role ?? '';
  const roleInfo = ROLES[role] ?? { label: role, color: 'default' };

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        {/* My Documents — certs/passes/permits on file, viewable in-app for
            site audits and client inspections. Only shown once we know
            whether this account is linked to a worker record. */}
        {!docsLoading && myWorker && (
          <Card style={{ gridColumn: '1 / -1' }}>
            <CardHeader title="My Documents" subtitle="Certificates, passes and permits on file — tap to view" />
            {(myWorker.certs ?? []).length === 0 ? (
              <p className={styles.noDocs}>No documents on file yet.</p>
            ) : (
              <div className={styles.docList}>
                {myWorker.certs.map((c, i) => (
                  <button key={i} className={styles.docRow} onClick={() => setViewDoc(c.url ? c : null)} disabled={!c.url}>
                    <DocumentTextIcon width={18} className={styles.docIcon} />
                    <div className={styles.docInfo}>
                      <span className={styles.docName}>{certLabel(c, certTypes)}</span>
                      <span className={styles.docMeta}>
                        {c.issueDate ? `Issued ${c.issueDate} · ` : ''}{c.expiry ? `Exp ${c.expiry}` : 'No expiry'}
                      </span>
                    </div>
                    <Badge color={CERT_BADGE[certStatus(c.expiry)]}>{certStatus(c.expiry)}</Badge>
                  </button>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Profile info */}
        <Card>
          <CardHeader title="My Profile" />
          <div className={styles.profileBody}>
            <div className={styles.avatar}>
              {myWorker?.photoUrl
                ? <img src={myWorker.photoUrl} alt="" className={styles.avatarImg} />
                : (userProfile?.name?.charAt(0) ?? '?')}
            </div>
            <div>
              <p className={styles.name}>{userProfile?.name}</p>
              <p className={styles.userId}>ID: {userProfile?.userId}</p>
              <Badge color={roleInfo.color} className={styles.roleBadge}>{roleInfo.label}</Badge>
            </div>
          </div>
          <div className={styles.infoList}>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Team</span>
              <span>{TEAMS[userProfile?.team] ?? userProfile?.team ?? '—'}</span>
            </div>
            <div className={styles.infoRow}>
              <span className={styles.infoKey}>Status</span>
              <Badge color="green" dot>{userProfile?.status ?? 'active'}</Badge>
            </div>
          </div>
        </Card>

        {/* Change PIN */}
        <Card>
          <CardHeader title="Change PIN" subtitle="Requires your current PIN for verification" />
          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label}>Current PIN</label>
              <PinBoxes ref={curRef} length={6} onChange={setCurrent}
                onComplete={() => nextRef.current?.focus()}
                autoComplete="current-password" classes={styles} ariaLabel="Current PIN" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>New PIN</label>
              <PinBoxes ref={nextRef} length={6} onChange={setNext}
                onComplete={() => conRef.current?.focus()}
                autoComplete="new-password" classes={styles} ariaLabel="New PIN" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Confirm PIN</label>
              <PinBoxes ref={conRef} length={6} onChange={setConfirm}
                autoComplete="new-password" classes={styles} ariaLabel="Confirm PIN" />
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <Button type="submit" variant="primary" loading={loading} style={{ marginTop: 8 }}>
              Update PIN
            </Button>
          </form>
        </Card>

        {/* Help */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardHeader
            title="Need help?"
            subtitle="Step-by-step guide to using the app"
            action={
              <Link to="/help" className={styles.guideLink}>
                <BookOpenIcon width={15} /> Open User Guide
              </Link>
            }
          />
        </Card>

        {/* Appearance */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardHeader title="Appearance" subtitle="Choose how CentralOps looks on this device" />
          <ThemeToggle />
        </Card>
      </div>

      <DocumentViewerModal doc={viewDoc} onClose={() => setViewDoc(null)} />
    </div>
  );
}
