import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../UI/Button';
import logo   from '../../assets/logo.png';
import banner from '../../assets/banner.png';
import styles from './LoginForm.module.css';

export default function LoginForm() {
  const { login } = useAuth();
  const [userId,  setUserId]  = useState('');
  const [pin,     setPin]     = useState(['', '', '', '']);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);
  const pinRefs = [useRef(), useRef(), useRef(), useRef()];

  const handlePinChange = (index, value) => {
    if (!/^\d?$/.test(value)) return;
    const next = [...pin];
    next[index] = value;
    setPin(next);
    if (value && index < 3) pinRefs[index + 1].current?.focus();
  };

  const handlePinKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      pinRefs[index - 1].current?.focus();
    }
  };

  const handlePinPaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (!text) return;
    e.preventDefault();
    const next = [...pin];
    text.split('').forEach((ch, i) => { if (i < 4) next[i] = ch; });
    setPin(next);
    pinRefs[Math.min(text.length, 3)].current?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const pinValue = pin.join('');
    if (!userId.trim())       { setError('Please enter your User ID.'); return; }
    if (pinValue.length < 4)  { setError('Please enter your 4-digit PIN.'); return; }
    setLoading(true);
    try {
      await login(userId.trim(), pinValue);
    } catch (err) {
      setPin(['', '', '', '']);
      pinRefs[0].current?.focus();
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
            <p className={styles.subheading}>Enter your User ID and 4-digit PIN</p>

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
                <div className={styles.pinRow} onPaste={handlePinPaste}>
                  {pin.map((digit, i) => (
                    <input
                      key={i}
                      ref={pinRefs[i]}
                      className={styles.pinBox}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinChange(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      autoComplete={i === 0 ? 'current-password' : 'off'}
                      disabled={loading}
                      aria-label={`PIN digit ${i + 1}`}
                    />
                  ))}
                </div>
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
