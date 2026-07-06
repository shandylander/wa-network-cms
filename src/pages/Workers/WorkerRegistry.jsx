import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { PlusIcon, UserGroupIcon, MagnifyingGlassIcon, TagIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../utils/permissions';
import { useTeams, useCertTypes } from '../../hooks/useAppConfig';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import WorkerModal from './WorkerModal';
import CertChips from './CertChips';
import CertTypeManager from './CertTypeManager';
import styles from './WorkerRegistry.module.css';

export default function WorkerRegistry() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { teams: TEAMS, teamOptions } = useTeams();
  const { certTypes, saveCertTypes }  = useCertTypes();
  const [workers,  setWorkers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [modal,    setModal]    = useState(null); // null | { mode: 'add'|'edit', worker? }
  const [showTypes, setShowTypes] = useState(false);

  const role    = userProfile?.role;
  const myTeam  = userProfile?.team;
  const canAdd  = hasPermission(role, 'manage:workers');
  const canManageTypes = ['owner', 'manager'].includes(role);
  const isSubconAdmin = role === 'subcon-admin';

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      // Rules only let subcon admins read their own team's workers, and
      // rules are not filters — the query must match them.
      const snap = await getDocs(isSubconAdmin
        ? query(collection(db, 'workers'), where('team', '==', myTeam))
        : collection(db, 'workers'));
      setWorkers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error('Failed to load workers');
    } finally {
      setLoading(false);
    }
  };

  const visible = useMemo(() => {
    return workers.filter(w => {
      if (isSubconAdmin && w.team !== myTeam) return false;
      const q = search.toLowerCase();
      if (q && !w.name?.toLowerCase().includes(q) && !w.nric?.toLowerCase().includes(q)) return false;
      if (teamFilter && w.team !== teamFilter)     return false;
      if (statusFilter && w.status !== statusFilter) return false;
      return true;
    });
  }, [workers, search, teamFilter, statusFilter, isSubconAdmin, myTeam]);

  // Same live team list as User Management (appConfig/userGroups)
  const teams = teamOptions;

  const handleSaved = (worker, isNew) => {
    if (isNew) {
      setWorkers(prev => [...prev, worker]);
    } else {
      setWorkers(prev => prev.map(w => w.id === worker.id ? worker : w));
    }
    setModal(null);
  };

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Workers</h1>
          <p className={styles.sub}>{visible.length} worker{visible.length !== 1 ? 's' : ''}</p>
        </div>
        <div className={styles.headerActions}>
          {canManageTypes && (
            <Button size="sm" variant="secondary" onClick={() => setShowTypes(true)}>
              <TagIcon width={15} /> Cert Types
            </Button>
          )}
          {canAdd && (
            <Button size="sm" onClick={() => setModal({ mode: 'add' })}>
              <PlusIcon width={16} /> Add Worker
            </Button>
          )}
        </div>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <MagnifyingGlassIcon width={15} className={styles.searchIcon} />
          <input
            className={styles.search}
            placeholder="Search name or NRIC…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!isSubconAdmin && (
          <select className={styles.select} value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
            <option value="">All Teams</option>
            {teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        )}
        <select className={styles.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {visible.length === 0 ? (
        <div className={styles.empty}>
          <UserGroupIcon className={styles.emptyIcon} />
          <h3>No workers found</h3>
          <p>Add workers to track their certifications and team assignments.</p>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Name</th>
                <th className={styles.hideS}>NRIC</th>
                <th className={styles.hideS}>Designation</th>
                <th>Team</th>
                <th className={styles.hideM}>Contact</th>
                <th>Certs</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(w => (
                <tr
                  key={w.id}
                  className={[styles.row, canAdd ? styles.rowClick : ''].join(' ')}
                  onClick={() => canAdd && setModal({ mode: 'edit', worker: w })}
                >
                  <td className={styles.tdName}>{w.name}</td>
                  <td className={styles.hideS}>{w.nric || '—'}</td>
                  <td className={styles.hideS}>{w.designation || '—'}</td>
                  <td><span className={styles.teamTag}>{TEAMS[w.team] ?? w.team ?? '—'}</span></td>
                  <td className={styles.hideM}>{w.contact || '—'}</td>
                  <td><CertChips worker={w} certTypes={certTypes} /></td>
                  <td>
                    <Badge color={w.status === 'active' ? 'green' : 'default'}>{w.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <WorkerModal
          mode={modal.mode}
          worker={modal.worker}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          userRole={role}
          userTeam={myTeam}
        />
      )}

      {showTypes && (
        <CertTypeManager
          certTypes={certTypes}
          saveCertTypes={saveCertTypes}
          onClose={() => setShowTypes(false)}
        />
      )}
    </div>
  );
}
