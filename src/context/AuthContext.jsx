import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  onAuthStateChanged,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db, pinToPassword } from '../firebase';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser]   = useState(null);
  const [userProfile, setUserProfile]   = useState(null);
  const [loading,     setLoading]       = useState(true);

  const fetchProfile = useCallback(async (user) => {
    const userId = user.email.split('@')[0].toUpperCase();
    const snap = await getDoc(doc(db, 'users', userId));
    return snap.exists() ? { userId, ...snap.data() } : null;
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          setUserProfile(await fetchProfile(user));
        } catch (err) {
          console.error('Profile load failed', err);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, [fetchProfile]);

  const login = (userId, pin) =>
    signInWithEmailAndPassword(auth, `${userId.toUpperCase()}@wanetwork.cms`, pinToPassword(pin));

  const logout = () => signOut(auth);

  // Used on forced first-login PIN change (session is fresh, no reauth needed)
  const forcePinChange = async (newPin) => {
    await updatePassword(auth.currentUser, pinToPassword(newPin));
    const userId = auth.currentUser.email.split('@')[0].toUpperCase();
    await updateDoc(doc(db, 'users', userId), { firstLogin: false });
    setUserProfile(await fetchProfile(auth.currentUser));
  };

  // Used from Profile page — requires current PIN to reauthenticate
  const changePin = async (currentPin, newPin) => {
    const cred = EmailAuthProvider.credential(auth.currentUser.email, pinToPassword(currentPin));
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, pinToPassword(newPin));
  };

  const refreshProfile = async () => {
    if (auth.currentUser) setUserProfile(await fetchProfile(auth.currentUser));
  };

  return (
    <AuthContext.Provider value={{
      currentUser, userProfile, loading,
      login, logout, forcePinChange, changePin, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
