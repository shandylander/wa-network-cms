import React, { useState, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../UI/Button';
import logo from '../../assets/logo.png';
import styles from './ForcePinChange.module.css';

function PinInputRow({ label, value, onChange, onKeyDown, refs }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.pinRow}>
        {value.map((digit, i) => (
          <input
            key={i}
            ref={refs[i]}
            className={styles.pinBox}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => onChange(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            aria-label={`${label} digit ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function ForcePinChange() {
  const { userProfile, forcePinChange, logout } = useAuth();
  const { toast } = useToast();

  const [newPin,     setNewPin]     = useState(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState(['', '', '', '']);
  const [error,      setError]      = useState('');
  const [loading,    setLoading]    = useState(false);

  const newRefs     = [useRef(), useRef(), useRef(), useRef()];
  const confirmRefs = [useRef(), useRef(), useRef(), useRef()];

  const makePinHandlers = (setter, refs, nextRefs) => ({
    onChange: (i, val) => {
      if (!/^\d?$/.test(val)) return;
      setter(p => { const n = [...p]; n[i] = val; return n; });
      if (val && i < 3) refs[i + 1].current?.focus();
      if (val && i === 3 && nextRefs) nextRefs[0].current?.focus();
    },
    onKeyDown: (i, e) => {
      if (e.key === 'Backspace' && !newPin[i] && i > 0) refs[i - 1].current?.focus();
    },
  });

  const newHandlers     = makePinHandlers(setNewPin,     newRefs,     confirmRefs);
  const confirmHandlers = makePinHandlers(setConfirmPin, confirmRefs, null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const nVal = newPin.join('');
    const cVal = confirmPin.join('');
    if (nVal.length < 4) { setError('Please enter a 4-digit PIN.'); return; }
    if (nVal !== cVal)   { setError('PINs do not match. Please try again.'); return; }
    setLoading(true);
    try {
      await forcePinChange(nVal);
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
              Welcome, <strong>{userProfile?.name}</strong>. Please set a new 4-digit PIN before continuing.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <PinInputRow
            label="New PIN"
            value={newPin}
            onChange={newHandlers.onChange}
            onKeyDown={newHandlers.onKeyDown}
            refs={newRefs}
          />
          <PinInputRow
            label="Confirm PIN"
            value={confirmPin}
            onChange={confirmHandlers.onChange}
            onKeyDown={confirmHandlers.onKeyDown}
            refs={confirmRefs}
          />

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
