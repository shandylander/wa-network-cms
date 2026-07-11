import React, { useState, useEffect } from 'react';
import { BellIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { enablePushNotifications, listenForegroundMessages } from '../../utils/push';
import styles from './NotificationPrompt.module.css';

const DISMISS_KEY = 'wa-cms-push-prompt-dismissed';

export default function NotificationPrompt() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [visible, setVisible] = useState(false);
  const [enabling, setEnabling] = useState(false);

  useEffect(() => {
    const supported = typeof Notification !== 'undefined' && !!process.env.REACT_APP_FIREBASE_VAPID_KEY;
    const dismissed = localStorage.getItem(DISMISS_KEY) === 'true';
    setVisible(supported && !dismissed && Notification.permission === 'default');
  }, [userProfile?.userId]);

  // Foreground pushes don't auto-show a native notification (that's the
  // service worker's job when the tab isn't focused) — surface as a toast
  // instead. Background/clicked notifications already navigate correctly
  // via the SW's notificationclick handler, so this doesn't need to.
  useEffect(() => {
    if (!userProfile?.userId) return;
    let unsub = () => {};
    listenForegroundMessages((payload) => {
      const title = payload.notification?.title ?? 'Notification';
      const body  = payload.notification?.body ?? '';
      toast.info(body ? `${title} — ${body}` : title, 8000);
    }).then((u) => { unsub = u; });
    return () => unsub();
  }, [userProfile?.userId, toast]);

  if (!visible || !userProfile) return null;

  const enable = async () => {
    setEnabling(true);
    const res = await enablePushNotifications(userProfile.userId);
    setEnabling(false);
    setVisible(false);
    if (res.ok) {
      toast.success('Notifications enabled');
    } else if (res.reason === 'denied') {
      toast.error('Notifications blocked — enable them in your browser settings if you change your mind');
    } else {
      toast.error('Could not enable notifications on this device');
    }
  };

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, 'true');
    setVisible(false);
  };

  return (
    <div className={styles.banner}>
      <BellIcon width={16} className={styles.icon} />
      <span className={styles.text}>Get notified about approvals and new requests on this device.</span>
      <button className={styles.enableBtn} onClick={enable} disabled={enabling}>
        {enabling ? 'Enabling…' : 'Enable'}
      </button>
      <button className={styles.dismissBtn} onClick={dismiss} aria-label="Dismiss">
        <XMarkIcon width={14} />
      </button>
    </div>
  );
}
