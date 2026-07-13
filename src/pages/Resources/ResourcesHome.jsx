import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, writeBatch, query, where, limit } from 'firebase/firestore';
import { ArrowDownTrayIcon, ShieldCheckIcon, LockClosedIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { TEAMS } from '../../utils/permissions';
import Card, { CardHeader } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import styles from './ResourcesHome.module.css';

const TEAM_KEYS = ['own', 'kvm', 'sree', 'habibur', 'alamin'];

// Document category taxonomy for the company-wide Resources library. Existing
// documents in Firestore predate this field, so a missing category is
// treated as 'hse' at read time only — no backfill write.
const CATEGORIES = [
  { value: 'hse',       label: 'HSE & Safety' },
  { value: 'training',  label: 'Training Manuals' },
  { value: 'standards', label: 'Company Standards' },
  { value: 'templates', label: 'Templates' },
  { value: 'policies',  label: 'Policies' },
];
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(c => [c.value, c.label]));

export default function ResourcesHome() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const [projectId, setProjectId] = useState(null);
  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [search,         setSearch]         = useState('');

  const role    = userProfile?.role;
  const myTeam  = userProfile?.team;
  const canAdmin = can('manage:blocks'); // owner + manager
  const isWorker = ['staff', 'subcon-admin', 'subcon'].includes(role);
  const isSubconRole = ['subcon-admin', 'subcon'].includes(role);
  // Staff are WA employees — their document access flag is 'own' regardless
  // of the team value stored on the user record.
  const accessTeam = role === 'staff' ? 'own' : myTeam;

  useEffect(() => {
    const load = async () => {
      try {
        // Security rules only let subcon roles read projects assigned to their
        // team, and only let worker roles read documents their team can access.
        // Rules are not filters — the queries must match them exactly.
        const pSnap = await getDocs(isSubconRole
          ? query(collection(db, 'projects'),
              where('status', '==', 'active'),
              where('assignedTeams', 'array-contains', myTeam),
              limit(1))
          : query(collection(db, 'projects'), where('status', '==', 'active'), limit(1)));
        if (pSnap.empty) { setLoading(false); return; }
        const pid = pSnap.docs[0].id;
        setProjectId(pid);
        const dSnap = await getDocs(isWorker
          ? query(collection(db, 'projects', pid, 'documents'), where(`access.${accessTeam}`, '==', true))
          : collection(db, 'projects', pid, 'documents'));
        // Missing category defaults to 'hse' at read time — legacy docs
        // predate this field and are never backfilled in Firestore.
        setDocs(dSnap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, category: data.category ?? 'hse' };
        }));
      } catch {
        toast.error('Failed to load Resources documents');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [isWorker, isSubconRole, accessTeam, myTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAccess = async (docId, team, current) => {
    if (!projectId) return;
    try {
      const ref = doc(db, 'projects', projectId, 'documents', docId);
      await updateDoc(ref, { [`access.${team}`]: !current });
      setDocs(prev => prev.map(d =>
        d.id === docId ? { ...d, access: { ...d.access, [team]: !current } } : d
      ));
    } catch {
      toast.error('Failed to update access');
    }
  };

  const [grantingOwn, setGrantingOwn] = useState(false);
  const grantOwnAccess = async () => {
    if (!projectId || docs.length === 0) return;
    setGrantingOwn(true);
    try {
      const batch = writeBatch(db);
      docs.forEach(d => {
        if (!d.access?.own) {
          batch.update(doc(db, 'projects', projectId, 'documents', d.id), { 'access.own': true });
        }
      });
      await batch.commit();
      setDocs(prev => prev.map(d => ({ ...d, access: { ...d.access, own: true } })));
      toast.success('WA! staff access enabled for all documents');
    } catch {
      toast.error('Failed to update access');
    } finally {
      setGrantingOwn(false);
    }
  };

  const allOwnEnabled = docs.length > 0 && docs.every(d => d.access?.own);

  // Worker queries are already access-filtered server-side
  const visibleDocs = docs;

  const counts = Object.fromEntries(CATEGORIES.map(c => [c.value, visibleDocs.filter(d => d.category === c.value).length]));
  const filteredDocs = visibleDocs.filter(d =>
    (categoryFilter === 'all' || d.category === categoryFilter) &&
    d.name?.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Resources</h1>
          <p className={styles.sub}>Safety forms, training manuals, standards and templates</p>
        </div>
        {canAdmin && !allOwnEnabled && visibleDocs.length > 0 && (
          <button className={styles.grantBtn} onClick={grantOwnAccess} disabled={grantingOwn}>
            {grantingOwn ? 'Enabling…' : 'Enable for WA! Staff'}
          </button>
        )}
      </div>

      {visibleDocs.length === 0 ? (
        <div className={styles.empty}>
          <LockClosedIcon className={styles.emptyIcon} />
          <h3>No documents available</h3>
          <p>{canAdmin
            ? 'Use the team toggle buttons on each document to grant access, or click "Enable for WA! Staff" above.'
            : 'Your admin needs to enable access for your team. Contact your supervisor or manager.'
          }</p>
        </div>
      ) : (
        <>
          <div className={styles.toolsRow}>
            <div className={styles.filterRow}>
              <button
                className={[styles.filterBtn, categoryFilter === 'all' ? styles.active : ''].join(' ')}
                onClick={() => setCategoryFilter('all')}
              >
                All ({visibleDocs.length})
              </button>
              {CATEGORIES.map(c => (
                <button
                  key={c.value}
                  className={[styles.filterBtn, categoryFilter === c.value ? styles.active : ''].join(' ')}
                  onClick={() => setCategoryFilter(c.value)}
                >
                  {c.label} ({counts[c.value] ?? 0})
                </button>
              ))}
            </div>
            <div className={styles.searchWrap}>
              <MagnifyingGlassIcon className={styles.searchIcon} width={15} />
              <input
                className={styles.searchInput}
                placeholder="Search documents…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {filteredDocs.length === 0 ? (
            <div className={styles.empty}>
              <h3>No matching documents</h3>
              <p>Try a different category or search term.</p>
            </div>
          ) : (
            <Card>
              <CardHeader
                title="Project Documents"
                subtitle={canAdmin ? 'Toggle team access using the buttons below' : 'Download permitted forms'}
              />
              <div className={styles.docList}>
                {filteredDocs.map(d => (
                  <div key={d.id} className={styles.docRow}>
                    <div className={styles.docInfo}>
                      <ShieldCheckIcon className={styles.docIcon} width={18} />
                      <div>
                        <p className={styles.docName}>{d.name}</p>
                        <Badge color="blue">{CATEGORY_LABEL[d.category] ?? d.category?.toUpperCase() ?? 'DOC'}</Badge>
                        {d.revNote && <p className={styles.revNote}>{d.revNote}</p>}
                      </div>
                    </div>

                    {canAdmin && (
                      <div className={styles.accessToggles}>
                        {TEAM_KEYS.map(t => (
                          <button
                            key={t}
                            className={[styles.toggleBtn, d.access?.[t] ? styles.toggleOn : ''].join(' ')}
                            onClick={() => toggleAccess(d.id, t, d.access?.[t])}
                            title={`${d.access?.[t] ? 'Revoke' : 'Grant'} access to ${TEAMS[t]}`}
                          >
                            {t === 'own' ? 'WA!' : TEAMS[t]?.split(' ')[0] ?? t}
                          </button>
                        ))}
                      </div>
                    )}

                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.downloadBtn}
                      onClick={e => e.stopPropagation()}
                    >
                      <ArrowDownTrayIcon width={15} /> Download
                    </a>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      <Card style={{ marginTop: 16 }}>
        <CardHeader title="RA Library" subtitle="Risk assessment documents" />
        <RaLibrary canAdmin={canAdmin} toast={toast} />
      </Card>
    </div>
  );
}

function RaLibrary({ canAdmin, toast }) {
  const [ras,     setRas]     = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(collection(db, 'raLibrary'))
      .then(snap => setRas(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => toast.error('Failed to load RA library'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.miniSpinner} />;

  if (ras.length === 0) {
    return (
      <div className={styles.raEmpty}>
        <p>No risk assessments uploaded yet.</p>
        {canAdmin && <span>Add RA documents via the Dropbox folder and update the links here.</span>}
      </div>
    );
  }

  return (
    <div className={styles.docList}>
      {ras.map(ra => (
        <div key={ra.id} className={styles.docRow}>
          <div className={styles.docInfo}>
            <ShieldCheckIcon className={styles.docIcon} width={18} />
            <div>
              <p className={styles.docName}>{ra.title}</p>
              <span className={styles.docMeta}>{ra.ref} · Assessed: {ra.assessedDate}</span>
            </div>
          </div>
          <a href={ra.url} target="_blank" rel="noreferrer" className={styles.downloadBtn}>
            <ArrowDownTrayIcon width={15} /> Download
          </a>
        </div>
      ))}
    </div>
  );
}
