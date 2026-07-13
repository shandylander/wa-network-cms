import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../UI/Button';
import PinBoxes from '../UI/PinBoxes';
import logo from '../../assets/logo.png';
import styles from './ForcePinChange.module.css';

export default function ForcePinChange() {
  const { userProfile, forcePinChange, logout } = useAuth();
  const { toast } = useToast();

  const [newPin,     setNewPin]     = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const confirmRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (newPin.length < 6)      { setError('Please enter a 6-digit PIN.'); return; }
    if (newPin !== confirmPin)  { setError('PINs do not match. Please try again.'); return; }
    setLoading(true);
    try {
      await forcePinChange(newPin);
      toast.success('PIN updated. Welcome!');
    } catch (err) {
      setError('Failed to update PIN. Please try again.');
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
          <span className={styles.alertIcon}>🔒</span>
          <div>
            <p className={styles.alertTitle}>Set your PIN</p>
            <p className={styles.alertDesc}>
              Welcome, <strong>{userProfile?.name}</strong>. Please set a new 6-digit PIN before continuing.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label className={styles.label}>New PIN</label>
            <PinBoxes
              length={6}
              onChange={setNewPin}
              onComplete={() => confirmRef.current?.focus()}
              autoComplete="new-password"
              classes={styles}
              ariaLabel="New PIN"
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Confirm PIN</label>
            <PinBoxes
              ref={confirmRef}
              length={6}
              onChange={setConfirmPin}
              autoComplete="new-password"
              classes={styles}
              ariaLabel="Confirm PIN"
            />
          </div>

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            Set PIN & Continue
          </Button>
        </form>

        <button className={styles.signOut} onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}
