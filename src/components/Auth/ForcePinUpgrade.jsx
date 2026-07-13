import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../UI/Button';
import PinBoxes from '../UI/PinBoxes';
import logo from '../../assets/logo.png';
import styles from './ForcePinChange.module.css';

/**
 * One-time forced 4→6 digit PIN upgrade, shown after login to any account
 * whose user doc lacks pinLength: 6. Asks for the current (4-digit) PIN so
 * the credential change is reauthenticated — an old session can't silently
 * have its PIN swapped, and updatePassword can't fail with
 * requires-recent-login.
 */
export default function ForcePinUpgrade() {
  const { upgradePin, logout } = useAuth();
  const { toast } = useToast();

  const [currentPin, setCurrentPin] = useState('');
  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const newRef     = useRef(null);
  const confirmRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (currentPin.length < 4)   { setError('Enter your current 4-digit PIN.'); return; }
    if (newPin.length < 6)       { setError('Your new PIN must be 6 digits.'); return; }
    if (newPin !== confirmPin)   { setError('New PINs do not match. Please try again.'); return; }
    setLoading(true);
    try {
      await upgradePin(currentPin, newPin);
      toast.success('PIN upgraded — use your new 6-digit PIN from now on.');
    } catch (err) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Current PIN is incorrect.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Failed to upgrade PIN. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logoWrap}>
          <img src={logo} alt="WA! Network Asia" className={styles.logoImg} />
        </div>

        <div className={styles.alert}>
          <span className={styles.alertIcon}>🛡️</span>
          <div>
            <p className={styles.alertTitle}>Security upgrade — 6-digit PIN</p>
            <p className={styles.alertDesc}>
              PINs are now 6 digits for stronger account protection. Enter your
              current 4-digit PIN, then choose your new 6-digit PIN.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label}>Current PIN</label>
            <PinBoxes
              length={4}
              onChange={setCurrentPin}
              onComplete={() => newRef.current?.focus()}
              autoComplete="current-password"
              classes={styles}
              ariaLabel="Current PIN"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>New 6-digit PIN</label>
            <PinBoxes
              ref={newRef}
              length={6}
              onChange={setNewPin}
              onComplete={() => confirmRef.current?.focus()}
              autoComplete="new-password"
              classes={styles}
              ariaLabel="New PIN"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Confirm new PIN</label>
            <PinBoxes
              ref={confirmRef}
              length={6}
              onChange={setConfirmPin}
              autoComplete="new-password"
              classes={styles}
              ariaLabel="Confirm new PIN"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            Upgrade PIN & Continue
          </Button>
        </form>

        <button className={styles.signOut} onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
