import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, addDoc, doc, updateDoc, arrayUnion, Timestamp, onSnapshot } from 'firebase/firestore';
import {
  BellIcon, XMarkIcon, MegaphoneIcon, ExclamationTriangleIcon,
  IdentificationIcon, ShieldExclamationIcon, BanknotesIcon, PlusIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { getAlerts, SEVERITY_ORDER } from '../../utils/notificationEngine';
import styles from './NotificationBell.module.css';

const TYPE_ICON = {
  announcement: MegaphoneIcon,
  cert: IdentificationIcon,
  incident: ShieldExclamationIcon,
  permit: ExclamationTriangleIcon,
  claim: BanknotesIcon,
};

const AUDIENCE_OPTIONS = [
  { value: 'all',      label: 'Everyone' },
  { value: 'own',      label: 'WA! Direct Staff' },
  { value: 'kvm',      label: 'KVM' },
  { value: 'sree',     label: 'Sree Ram' },
  { value: 'habibur',  label: 'Habibur' },
  { value: 'alamin',   label: 'Alamin (Seabiz)' },
];

function Composer({ onClose, onPosted }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [message,  setMessage]  = useState('');
  const [severity, setSeverity] = useState('info');
  const [audience, setAudience] = useState('all');
  const [saving,   setSaving]   = useState(false);

  const post = async () => {
    if (!message.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        message: message.trim(),
        severity, audience,
        createdBy: userProfile.userId,
        createdByName: userProfile.name,
        createdAt: Timestamp.now(),
        readBy: [],
      });
      toast.success('Bulletin sent');
      onPosted();
      onClose();
    } catch {
      toast.error('Failed to send bulletin');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.composer}>
      <textarea
        className={styles.composerInput}
        rows={3}
        placeholder="Safety bulletin, policy update, site notice…"
        value={message}
        onChange={e => setMessage(e.target.value)}
      />
      <div className={styles.composerRow}>
        <select className={styles.composerSelect} value={severity} onChange={e => setSeverity(e.target.value)}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <select className={styles.composerSelect} value={audience} onChange={e => setAudience(e.target.value)}>
          {AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className={styles.composerActions}>
        <button className={styles.composerCancel} onClick={onClose}>Cancel</button>
        <button className={styles.composerSend} onClick={post} disabled={saving || !message.trim()}>
          {saving ? 'Sending…' : 'Send Bulletin'}
        </button>
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();
  const navigate          = useNavigate();
  const [alerts,    setAlerts]    = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [open,      setOpen]      = useState(false);
  const [composing, setComposing] = useState(false);
  const ref = useRef(null);

  const load = useCallback(async () => {
    if (!userProfile) return;
    setLoading(true);
    try {
      const a = await getAlerts(userProfile);
      a.sort((x, y) => (SEVERITY_ORDER[x.severity] ?? 9) - (SEVERITY_ORDER[y.severity] ?? 9));
      setAlerts(a);
    } finally {
      setLoading(false);
    }
  }, [userProfile]);

  // Initial load
  useEffect(() => { load(); }, [load]);

  // Re-run whenever the announcements collection changes (real-time badge updates)
  useEffect(() => {
    if (!userProfile) return;
    const unsub = onSnapshot(collection(db, 'announcements'), () => load(), () => {});
    return unsub;
  }, [userProfile, load]);

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setComposing(false); } };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const dismissAnnouncement = async (alert) => {
    try {
      await updateDoc(doc(db, 'announcements', alert.docId), { readBy: arrayUnion(userProfile.userId) });
      setAlerts(prev => prev.filter(a => a.id !== alert.id));
    } catch { /* ignore */ }
  };

  const handleClick = (alert) => {
    if (alert.type === 'announcement') { dismissAnnouncement(alert); return; }
    setOpen(false);
    if (alert.link) navigate(alert.link);
  };

  return (
    <div className={styles.wrap} ref={ref}>
      <button className={styles.bellBtn} onClick={() => setOpen(o => !o)} aria-label="Notifications">
        <BellIcon width={20} />
        {alerts.length > 0 && <span className={styles.badge}>{alerts.length > 9 ? '9+' : alerts.length}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Notifications</span>
            {can('manage:announcements') && !composing && (
              <button className={styles.newBtn} onClick={() => setComposing(true)}>
                <PlusIcon width={13} /> Bulletin
              </button>
            )}
          </div>

          {composing && <Composer onClose={() => setComposing(false)} onPosted={load} />}

          <div className={styles.list}>
            {loading ? (
              <p className={styles.empty}>Loading…</p>
            ) : alerts.length === 0 ? (
              <p className={styles.empty}>You're all caught up.</p>
            ) : (
              alerts.map(a => {
                const Icon = TYPE_ICON[a.type] ?? BellIcon;
                return (
                  <button
                    key={a.id}
                    className={[styles.item, styles[`sev_${a.severity}`]].join(' ')}
                    onClick={() => handleClick(a)}
                  >
                    <Icon width={16} className={styles.itemIcon} />
                    <span className={styles.itemText}>{a.message}</span>
                    {a.type === 'announcement' && <XMarkIcon width={14} className={styles.itemDismiss} />}
                  </button>
                );
              })
            )}
          </div>
          <button className={styles.viewAll} onClick={() => { setOpen(false); navigate('/announcements'); }}>
            View all announcements →
          </button>
        </div>
      )}
    </div>
  );
}
