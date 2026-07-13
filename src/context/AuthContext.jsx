import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { auth, db, pinToPassword } from '../firebase';

export const AuthContext = createContext(null);

const userIdFromEmail = (email) => email.split('@')[0].toUpperCase();

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]       = useState(null);
  const [userProfile, setUserProfile]       = useState(null);
  const [authLoading, setAuthLoading]       = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);

  const fetchProfile = useCallback(async (user) => {
    const userId = userIdFromEmail(user.email);
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? { userId, ...snap.data() } : null;
  }, []);

  // Auth state only — kept separate from the profile listener below so the
  // two can't race, and so the profile listener has a clean, single place
  // to attach/detach from.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  // Live profile listener (Firestore onSnapshot, not a one-shot getDoc).
  // Access Level / role edits made by an admin now apply to an already-open
  // session immediately, instead of only taking effect at next login.
  // Always tears down the previous listener before attaching a new one, so
  // logout or a user switch on the same tab can't leak listeners or fire
  // stale updates.
  useEffect(() => {
    if (!currentUser) {
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }
    setUserProfile(null); // don't show the previous user's profile while loading
    setProfileLoading(true);
    const userId = userIdFromEmail(currentUser.email);
    const unsub = onSnapshot(
      doc(db, 'users', userId),
      (snap) => {
        setUserProfile(snap.exists() ? { userId, ...snap.data() } : null);
        setProfileLoading(false);
      },
      (err) => {
        // Expected around sign-out, when the token backing this listener is
        // invalidated mid-flight — not a real error.
        if (err.code !== 'permission-denied') {
          console.error('Profile listener failed', err);
        }
        setProfileLoading(false);
      }
    );
    return unsub;
  }, [currentUser]);

  const loading = authLoading || (Boolean(currentUser) && profileLoading && userProfile === null);

  const login = (userId, pin) =>
    signInWithEmailAndPassword(auth, `${userId.toUpperCase()}@wanetwork.cms`, pinToPassword(pin));

  const logout = () => signOut(auth);

  // Used on forced first-login PIN change (session is fresh, no reauth needed).
  // No manual profile refetch needed — the live listener above picks up the
  // firstLogin:false change automatically. New PINs are always 6 digits, so
  // this also stamps pinLength — first-login users never see the separate
  // 4→6 upgrade screen.
  const forcePinChange = async (newPin) => {
    await updatePassword(auth.currentUser, pinToPassword(newPin));
    const userId = userIdFromEmail(auth.currentUser.email);
    await updateDoc(doc(db, 'users', userId), { firstLogin: false, pinLength: 6 });
  };

  // Used from Profile page — requires current PIN to reauthenticate
  const changePin = async (currentPin, newPin) => {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, pinToPassword(currentPin));
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, pinToPassword(newPin));
  };

  // One-time 4→6 digit security upgrade, forced after login for accounts
  // still on a legacy 4-digit PIN. Reauthenticates with the current PIN
  // (the session may be old — updatePassword alone can throw
  // auth/requires-recent-login, and asking for the current PIN also stops a
  // walk-up on an unlocked device from silently taking over the account).
  const upgradePin = async (currentPin, newPin) => {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, pinToPassword(currentPin));
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, pinToPassword(newPin));
    const userId = userIdFromEmail(auth.currentUser.email);
    await updateDoc(doc(db, 'users', userId), { pinLength: 6 });
  };

  // Manual one-off refresh — kept for API compatibility; the live listener
  // above normally makes this unnecessary.
  const refreshProfile = async () => {
    if (auth.currentUser) setUserProfile(await fetchProfile(auth.currentUser));
  };

  return (
    <AuthContext.Provider value={{
      currentUser, userProfile, loading,
      login, logout, forcePinChange, changePin, upgradePin, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
