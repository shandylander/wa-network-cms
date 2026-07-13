import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// App Check (anti-abuse attestation). Runs in monitor mode until enforcement
// is switched on in the Firebase console — turning it on here never blocks
// anyone by itself. Init is skipped entirely when no site key is configured,
// so local dev and CI keep working without a reCAPTCHA key.
if (process.env.REACT_APP_RECAPTCHA_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(process.env.REACT_APP_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const storage   = getStorage(app);
export const functions = getFunctions(app, 'asia-southeast1');
export { firebaseConfig };
export default app;

// PINs are numeric (6 digits standard; 4-digit legacy PINs still work at
// login until the account passes the one-time upgrade gate). A fixed
// app-specific suffix is appended before passing to Firebase Auth — users
// only ever enter the digits; this conversion is invisible to them.
export const pinToPassword = (pin) => `${pin}WAN!cms`;
