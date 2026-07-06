import { useState, useEffect, useCallback } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { DEFAULT_CERT_TYPES } from '../utils/certTypes';

// Same defaults User Management seeds into appConfig/userGroups
const DEFAULT_GROUPS = [
  { key: 'kvm',     label: 'KVM Team',        color: '#1a5fa8' },
  { key: 'sree',    label: 'Sree Ram',         color: '#1a8a5a' },
  { key: 'habibur', label: 'Habibur',          color: '#6d3fa8' },
  { key: 'alamin',  label: 'Alamin (Seabiz)',  color: '#d97b00' },
];

/* Live team list shared with User Management (appConfig/userGroups).
   Returns:
   - teams:       { key → label } including none/own, for display
   - teamOptions: [{ key, label }] assignable teams (own + sub-con groups) */
export function useTeams() {
  const [groups,  setGroups]  = useState(DEFAULT_GROUPS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'appConfig', 'userGroups'))
      .then(snap => { if (snap.exists() && snap.data().groups) setGroups(snap.data().groups); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const teams = { none: 'WA! Network', own: 'WA! Network (Direct)' };
  groups.forEach(g => { teams[g.key] = g.label; });

  const teamOptions = [
    { key: 'own', label: 'WA! Network (Direct)' },
    ...groups.map(g => ({ key: g.key, label: g.label })),
  ];

  return { teams, teamOptions, loading };
}

/* Admin-editable certificate type list (appConfig/certTypes). */
export function useCertTypes() {
  const [certTypes, setCertTypes] = useState(DEFAULT_CERT_TYPES);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'appConfig', 'certTypes'))
      .then(snap => { if (snap.exists() && snap.data().types) setCertTypes(snap.data().types); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveCertTypes = useCallback(async (types) => {
    await setDoc(doc(db, 'appConfig', 'certTypes'), { types });
    setCertTypes(types);
  }, []);

  return { certTypes, saveCertTypes, loading };
}
