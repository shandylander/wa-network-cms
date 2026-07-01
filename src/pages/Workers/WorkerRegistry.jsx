import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { PlusIcon, UserGroupIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission, TEAMS } from '../../utils/permissions';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import WorkerModal from './WorkerModal';
import styles from './WorkerRegistry.module.css';

function certOverallStatus(certs) {
  if (!certs || certs.length === 0) return null;
  const now = new Date();
  const ranks = certs.map(c => {
    if (!c.expiry) return 1;
    const d = Math.floor((new Date(c.expiry) - now) / 86400000);
    if (d < 0)  return 3;
    if (d <= 30) return 2;
    return 1;
  });
  const max = Math.max(...ranks);
  return max === 3 ? 'expired' : max === 2 ? 'expiring' : 'valid';
}

const CERT_BADGE = {
  valid:    { label: 'Valid',      color: 'green'   },
  expiring: { label: 'Expiring',   color: 'amber'   },
  expired:  { label: 'Expired',    color: 'red'     },
};

export default function WorkerRegistry() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [workers,  setWorkers]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');
  const [modal,    setModal]    = useState(null); // null | { mode: 'add'|'edit', worker? }

  const role    = userProfile?.role;
  const myTeam  = userProfile?.team;
  const canAdd  = hasPermission(role, 'manage:workers');
  const isSubconAdmin = role === 'subcon-admin';

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'workers'));
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

  const teams = [...new Set(workers.map(w => w.team).filter(Boolean))];

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
        {canAdd && (
          <Button size="sm" onClick={() => setModal({ mode: 'add' })}>
            <PlusIcon width={16} /> Add Worker
          </Button>
        )}
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
            {teams.map(t => <option key={t} value={t}>{TEAMS[t] ?? t}</option>)}
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
              {visible.map(w => {
                const cs = certOverallStatus(w.certs);
                const cb = cs ? CERT_BADGE[cs] : null;
                return (
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
                    <td>
                      {cb
                        ? <Badge color={cb.color}>{cb.label}</Badge>
                        : <span className={styles.noCerts}>—</span>}
                    </td>
                    <td>
                      <Badge color={w.status === 'active' ? 'green' : 'default'}>{w.status}</Badge>
                    </td>
                  </tr>
                );
              })}
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
    </div>
  );
}
