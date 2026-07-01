import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, setDoc, doc, Timestamp } from 'firebase/firestore';
import { CheckIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import styles from './HR.module.css';

export default function LeaveSettings() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();

  const [staff,   setStaff]   = useState([]); // { userId, name, al, mc, entId }
  const [saving,  setSaving]  = useState({}); // { [userId]: bool }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [userSnap, entSnap] = await Promise.all([
          getDocs(query(collection(db, 'users'), where('status', '==', 'active'))),
          getDocs(collection(db, 'leaveEntitlements')),
        ]);

        const entMap = {};
        entSnap.docs.forEach(d => { entMap[d.data().userId] = { id: d.id, ...d.data() }; });

        // Only own employees — exclude all subcon roles and owner
        const rows = userSnap.docs
          .map(d => d.data())
          .filter(u => ['staff', 'supervisor', 'manager'].includes(u.role))
          .map(u => ({
            userId: u.userId,
            name:   u.name,
            role:   u.role,
            team:   u.team,
            al:     entMap[u.userId]?.al ?? 7,   // sensible default
            mc:     entMap[u.userId]?.mc ?? 14,
            entId:  entMap[u.userId]?.id ?? null,
            dirty:  false,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setStaff(rows);
      } catch { toast.error('Failed to load staff'); }
      finally { setLoading(false); }
    };
    load();
  }, [toast]);

  const handleChange = (userId, field, value) => {
    const num = Math.max(0, parseInt(value) || 0);
    setStaff(s => s.map(r => r.userId === userId ? { ...r, [field]: num, dirty: true } : r));
  };

  const save = async (row) => {
    setSaving(s => ({ ...s, [row.userId]: true }));
    try {
      const data = {
        userId: row.userId,
        name:   row.name,
        al:     row.al,
        mc:     row.mc,
        updatedBy:  userProfile.userId,
        updatedAt:  Timestamp.now(),
      };
      // setDoc with merge creates or updates
      await setDoc(doc(db, 'leaveEntitlements', row.userId), data, { merge: true });
      setStaff(s => s.map(r => r.userId === row.userId ? { ...r, dirty: false, entId: row.userId } : r));
      toast.success(`Saved entitlements for ${row.name}`);
    } catch { toast.error('Failed to save'); }
    finally { setSaving(s => ({ ...s, [row.userId]: false })); }
  };

  const ROLE_LABELS = { manager: 'Manager', supervisor: 'Supervisor', staff: 'Staff', 'subcon-admin': 'Sub-con Admin' };
  const TEAM_LABELS = { own: 'WA Staff', kvm: 'KVM', sree: 'Sree Ram', habibur: 'Habibur', alamin: 'Alamin', none: '—' };

  if (loading) return <div className={styles.loading}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.settingsWrap}>
      <p className={styles.settingsInfo}>
        Set annual leave and medical leave entitlements per staff member. Changes take effect immediately for balance calculations.
      </p>

      <div className={styles.settingsTableWrap}>
        <table className={styles.settingsTable}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Team</th>
              <th className={styles.thCenter}>AL Days</th>
              <th className={styles.thCenter}>MC Days</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {staff.map(row => (
              <tr key={row.userId} className={row.dirty ? styles.dirtyRow : ''}>
                <td>
                  <p className={styles.staffName}>{row.name}</p>
                  <p className={styles.staffId}>{row.userId}</p>
                </td>
                <td><span className={styles.rolePill}>{ROLE_LABELS[row.role] ?? row.role}</span></td>
                <td className={styles.teamCell}>{TEAM_LABELS[row.team] ?? row.team}</td>
                <td className={styles.tdCenter}>
                  <input
                    type="number" min="0" max="365"
                    className={styles.entInput}
                    value={row.al}
                    onChange={e => handleChange(row.userId, 'al', e.target.value)}
                  />
                </td>
                <td className={styles.tdCenter}>
                  <input
                    type="number" min="0" max="365"
                    className={styles.entInput}
                    value={row.mc}
                    onChange={e => handleChange(row.userId, 'mc', e.target.value)}
                  />
                </td>
                <td className={styles.tdAction}>
                  <button
                    className={[styles.saveEntBtn, row.dirty ? styles.saveEntBtnDirty : ''].join(' ')}
                    onClick={() => save(row)}
                    disabled={!row.dirty || saving[row.userId]}
                  >
                    {saving[row.userId] ? '…' : <><CheckIcon width={13} /> Save</>}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
