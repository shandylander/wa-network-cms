import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ROLES, TEAMS } from '../utils/permissions';
import Card, { CardHeader } from '../components/UI/Card';
import Badge from '../components/UI/Badge';
import Button from '../components/UI/Button';
import PinBoxes from '../components/UI/PinBoxes';
import ThemeToggle from '../components/UI/ThemeToggle';
import styles from './Profile.module.css';

export default function Profile() {
  const { userProfile, changePin } = useAuth();
  const { toast } = useToast();

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
        {/* Profile info */}
        <Card>
          <CardHeader title="My Profile" />
          <div className={styles.profileBody}>
            <div className={styles.avatar}>{userProfile?.name?.charAt(0) ?? '?'}</div>
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

        {/* Appearance */}
        <Card style={{ gridColumn: '1 / -1' }}>
          <CardHeader title="Appearance" subtitle="Choose how CentralOps looks on this device" />
          <ThemeToggle />
        </Card>
      </div>
    </div>
  );
}
