import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ROLES, TEAMS } from '../utils/permissions';
import Card, { CardHeader } from '../components/UI/Card';
import Badge from '../components/UI/Badge';
import Button from '../components/UI/Button';
import styles from './Profile.module.css';

function PinRow({ label, value, onChange, onKeyDown, refs }) {
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <div className={styles.pinRow}>
        {value.map((d, i) => (
          <input
            key={i} ref={refs[i]}
            className={styles.pinBox}
            type="password" inputMode="numeric" maxLength={1}
            value={d}
            onChange={e => onChange(i, e.target.value)}
            onKeyDown={e => onKeyDown(i, e)}
            aria-label={`${label} digit ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
}

export default function Profile() {
  const { userProfile, changePin } = useAuth();
  const { toast } = useToast();

  const [current, setCurrent] = useState(['', '', '', '']);
  const [next,    setNext]    = useState(['', '', '', '']);
  const [confirm, setConfirm] = useState(['', '', '', '']);
  const [error,   setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const curRefs  = [useRef(), useRef(), useRef(), useRef()];
  const nextRefs = [useRef(), useRef(), useRef(), useRef()];
  const conRefs  = [useRef(), useRef(), useRef(), useRef()];

  const makeHandlers = (setter, refs, nextGroup) => ({
    onChange: (i, val) => {
      if (!/^\d?$/.test(val)) return;
      setter(p => { const n = [...p]; n[i] = val; return n; });
      if (val && i < 3) refs[i + 1].current?.focus();
      if (val && i === 3 && nextGroup) nextGroup[0].current?.focus();
    },
    onKeyDown: (i, e) => {
      if (e.key === 'Backspace' && !current[i] && i > 0) refs[i - 1].current?.focus();
    },
  });

  const curH  = makeHandlers(setCurrent, curRefs,  nextRefs);
  const nextH = makeHandlers(setNext,    nextRefs,  conRefs);
  const conH  = makeHandlers(setConfirm, conRefs,   null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const c = current.join(''), n = next.join(''), co = confirm.join('');
    if (c.length < 4)  { setError('Enter your current PIN.');         return; }
    if (n.length < 4)  { setError('Enter a 4-digit new PIN.');        return; }
    if (n !== co)      { setError('New PINs do not match.');           return; }
    if (n === c)       { setError('New PIN must differ from current.'); return; }
    setLoading(true);
    try {
      await changePin(c, n);
      toast.success('PIN changed successfully.');
      setCurrent(['','','','']); setNext(['','','','']); setConfirm(['','','','']);
      curRefs[0].current?.focus();
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
            <PinRow label="Current PIN" value={current} onChange={curH.onChange}  onKeyDown={curH.onKeyDown}  refs={curRefs}  />
            <PinRow label="New PIN"     value={next}    onChange={nextH.onChange} onKeyDown={nextH.onKeyDown} refs={nextRefs} />
            <PinRow label="Confirm PIN" value={confirm} onChange={conH.onChange}  onKeyDown={conH.onKeyDown}  refs={conRefs}  />
            {error && <p className={styles.error}>{error}</p>}
            <Button type="submit" variant="primary" loading={loading} style={{ marginTop: 8 }}>
              Update PIN
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
