import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { doc, updateDoc, arrayRemove, arrayUnion } from 'firebase/firestore';
import app, { db } from '../firebase';

const VAPID_KEY = process.env.REACT_APP_FIREBASE_VAPID_KEY;

/* Requests notification permission, registers the SW, and saves the
   resulting device token onto the user's own doc (self-write only —
   see firestore.rules). Safe to call repeatedly; a browser that's
   already granted permission just re-registers the same token. */
export async function enablePushNotifications(userId) {
  if (!VAPID_KEY) return { ok: false, reason: 'not-configured' };
  if (!(await isSupported())) return { ok: false, reason: 'unsupported' };
  if (typeof Notification === 'undefined') return { ok: false, reason: 'unsupported' };
  if (Notification.permission === 'denied') return { ok: false, reason: 'denied' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return { ok: false, reason: 'no-token' };
    await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayUnion(token) });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/* Drops this browser's token — used when a user explicitly turns
   notifications off from Profile rather than just revoking at the OS level. */
export async function disablePushNotifications(userId) {
  if (!VAPID_KEY || !(await isSupported())) return;
  try {
    const messaging = getMessaging(app);
    const registration = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
    if (!registration) return;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (token) await updateDoc(doc(db, 'users', userId), { fcmTokens: arrayRemove(token) });
  } catch { /* best-effort */ }
}

/* Foreground messages (app already open/focused) don't auto-show a native
   notification — the caller decides how to surface them (e.g. a toast).
   Returns an unsubscribe function. */
export async function listenForegroundMessages(callback) {
  if (!VAPID_KEY || !(await isSupported())) return () => {};
  const messaging = getMessaging(app);
  return onMessage(messaging, callback);
}
