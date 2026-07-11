/* Background push handler. Runs outside the React bundle, so it can't read
   process.env — these values are the same public web config already
   shipped in the main app bundle (Firebase web config is not a secret;
   access is enforced by Firestore/Storage security rules, not by hiding
   these values). */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBuQvrSt2yt1fktAKAaPpQwdrihLib78Jo',
  authDomain: 'wa-network-cms.firebaseapp.com',
  projectId: 'wa-network-cms',
  storageBucket: 'wa-network-cms.firebasestorage.app',
  messagingSenderId: '787547203117',
  appId: '1:787547203117:web:3a6545f7be055244f03aa4',
});

const messaging = firebase.messaging();

// Background messages already carry a `notification` payload, which the
// browser displays automatically — this handler exists to attach a click
// action so tapping the notification opens the right page.
messaging.onBackgroundMessage((payload) => {
  const link = payload.data?.link || '/';
  self.registration.showNotification(payload.notification?.title ?? 'WA! Network Asia', {
    body: payload.notification?.body ?? '',
    icon: '/logo192.png',
    badge: '/logo192.png',
    data: { link },
    tag: payload.data?.tag || undefined,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(link);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
