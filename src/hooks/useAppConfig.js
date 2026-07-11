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

// Each work type is a named category bound to one of three fixed structural
// "shapes" that ProjectDetail.jsx's tab list actually understands:
//   pcs     — full block tracking + claims + materials
//   cctv    — block tracking, no claims/materials
//   general — no block tracking (simple photos/snags/documents project)
// The label/key set is admin-editable; the shape enum itself is not, since
// it's wired directly into which tabs render.
const DEFAULT_WORK_TYPES = [
  { key: 'pcs',         label: 'PCS (Block Installation)', shape: 'pcs' },
  { key: 'cctv',        label: 'CCTV Installation',        shape: 'cctv' },
  { key: 'maintenance', label: 'Maintenance',              shape: 'general' },
  { key: 'general',     label: 'General',                  shape: 'general' },
];

/* Admin-editable project work-type list (appConfig/workTypes). */
export function useWorkTypes() {
  const [workTypes, setWorkTypes] = useState(DEFAULT_WORK_TYPES);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'appConfig', 'workTypes'))
      .then(snap => { if (snap.exists() && snap.data().types) setWorkTypes(snap.data().types); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveWorkTypes = useCallback(async (types) => {
    await setDoc(doc(db, 'appConfig', 'workTypes'), { types });
    setWorkTypes(types);
  }, []);

  // Orphaned/removed-type fallback: treat as a simple project rather than
  // erroring, so deleting a work type never breaks an existing project.
  const getShape = useCallback(
    (key) => workTypes.find(t => t.key === key)?.shape ?? 'general',
    [workTypes]
  );

  return { workTypes, saveWorkTypes, getShape, loading };
}

// Colors double as the badge background/text — kept close to the existing
// design-system severity tones (red/amber/blue) so default look is unchanged.
const DEFAULT_SEVERITIES = [
  { key: 'info',     label: 'Info',     color: '#1a5fa8' },
  { key: 'warning',  label: 'Warning',  color: '#d97b00' },
  { key: 'critical', label: 'Critical', color: '#CC0000' },
];

/* Admin-editable bulletin severity/category list (appConfig/announcementSeverities). */
export function useSeverities() {
  const [severities, setSeverities] = useState(DEFAULT_SEVERITIES);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    getDoc(doc(db, 'appConfig', 'announcementSeverities'))
      .then(snap => { if (snap.exists() && snap.data().types) setSeverities(snap.data().types); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const saveSeverities = useCallback(async (types) => {
    await setDoc(doc(db, 'appConfig', 'announcementSeverities'), { types });
    setSeverities(types);
  }, []);

  // Orphaned/removed-category fallback so an old bulletin never renders blank.
  const getSeverity = useCallback(
    (key) => severities.find(s => s.key === key) ?? { key, label: key ?? 'Info', color: '#5a6577' },
    [severities]
  );

  return { severities, saveSeverities, getSeverity, loading };
}
