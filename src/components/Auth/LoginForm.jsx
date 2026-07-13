import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../UI/Button';
import PinBoxes from '../UI/PinBoxes';
import logo   from '../../assets/logo.png';
import banner from '../../assets/banner.png';
import styles from './LoginForm.module.css';

export default function LoginForm() {
  const { login } = useAuth();
  const [userId,  setUserId]  = useState('');
  const [pin,     setPin]     = useState('');
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const pinBoxesRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!userId.trim()) { setError('Please enter your User ID.'); return; }
    // 6 digits is the current PIN standard; 4 digits is still accepted for
    // accounts that haven't been through the one-time upgrade prompt yet.
    if (pin.length !== 4 && pin.length !== 6) {
      setError('Please enter your PIN (6 digits, or your previous 4-digit PIN).');
      return;
    }
    setLoading(true);
    try {
      await login(userId.trim(), pin);
    } catch (err) {
      setPin('');
      pinBoxesRef.current?.clear();
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found') {
        setError('Invalid User ID or PIN. Please try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else {
        setError('Sign in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>

      {/* ── Top: two-panel row ── */}
      <div className={styles.panels}>

        {/* Left brand panel */}
        <div className={styles.brand}>
          <div className={styles.brandInner}>
            <div className={styles.logoWrap}>
              <img src={logo} alt="WA! Network Asia" className={styles.logoImg} />
            </div>
            <p className={styles.brandTitle}>CentralOps Portal</p>
            <p className={styles.brandDesc}>
              Centralised project tracking, worker management, and HSE documentation
              for CCTV installation operations.
            </p>
          </div>
          <p className={styles.brandVersion}>v1.0 · Singapore</p>
        </div>

        {/* Right form panel */}
        <div className={styles.formPanel}>
          <div className={styles.formCard}>
            {/* Mobile-only logo */}
            <div className={styles.formLogo}>
              <img src={logo} alt="WA! Network Asia" className={styles.formLogoImg} />
            </div>

            <h1 className={styles.heading}>Sign in</h1>
            <p className={styles.subheading}>Enter your User ID and PIN</p>

            <form onSubmit={handleSubmit} noValidate>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="userId">User ID</label>
                <input
                  id="userId"
                  className={styles.input}
                  type="text"
                  placeholder="e.g. WA001"
                  value={userId}
                  onChange={(e) => setUserId(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="username"
                  spellCheck={false}
                  disabled={loading}
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label}>PIN</label>
                <PinBoxes
                  ref={pinBoxesRef}
                  length={6}
                  onChange={setPin}
                  disabled={loading}
                  autoComplete="current-password"
                  classes={styles}
                  ariaLabel="PIN"
                />
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                loading={loading}
                className={styles.submitBtn}
              >
                Sign In
              </Button>
            </form>

            <p className={styles.footer}>
              © {new Date().getFullYear()} WA! Network Asia
              <br />
              <Link to="/setup" className={styles.setupLink}>First time? Run system setup →</Link>
            </p>
          </div>
        </div>
      </div>

      {/* ── Bottom: certification banner strip ── */}
      <div className={styles.bannerStrip}>
        <img src={banner} alt="WA! Network Asia certifications" className={styles.bannerImg} />
      </div>

    </div>
  );
}
