import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// Same Firestore doc User Management's Team Groups editor reads/writes —
// the one place admins add a new sub-con team. Block/project assignment,
// reports, etc. all need to offer whatever teams actually exist there, not
// a hardcoded 4-team list that goes stale the moment someone adds a 5th.
const CONFIG_DOC = doc(db, 'appConfig', 'userGroups');

const DEFAULT_SUBCON_GROUPS = [
  { key: 'kvm',     label: 'KVM Team',        color: '#1a5fa8' },
  { key: 'sree',    label: 'Sree Ram',         color: '#1a8a5a' },
  { key: 'habibur', label: 'Habibur',          color: '#6d3fa8' },
  { key: 'alamin',  label: 'Alamin (Seabiz)',  color: '#d97b00' },
];

/* Live-ish read of the sub-con team registry. Returns:
   - teamOptions: assignable team keys for blocks/projects, e.g. ['own','kvm',...]
   - teams: { key: label } map including 'none' and 'own' for display lookups
   - loading: true until the first read resolves (teamOptions/teams already
     hold the default 4 teams meanwhile, so callers don't need to special-case it) */
export function useTeamGroups() {
  const [groups, setGroups] = useState(null); // null = not loaded yet

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(CONFIG_DOC);
        if (snap.exists()) {
          if (!cancelled) setGroups(snap.data().groups ?? []);
        } else {
          await setDoc(CONFIG_DOC, { groups: DEFAULT_SUBCON_GROUPS });
          if (!cancelled) setGroups(DEFAULT_SUBCON_GROUPS);
        }
      } catch {
        if (!cancelled) setGroups(DEFAULT_SUBCON_GROUPS);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const list = groups ?? DEFAULT_SUBCON_GROUPS;
  const teamOptions = ['own', ...list.map(g => g.key)];
  const teams = {
    none: 'WA! Network',
    own:  'WA! Network (Direct)',
    ...Object.fromEntries(list.map(g => [g.key, g.label])),
  };

  return { teamOptions, teams, loading: groups === null };
}
