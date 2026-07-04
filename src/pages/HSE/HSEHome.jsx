import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, writeBatch, query, where, limit } from 'firebase/firestore';
import { ArrowDownTrayIcon, ShieldCheckIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission, TEAMS } from '../../utils/permissions';
import Card, { CardHeader } from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import styles from './HSEHome.module.css';

const TEAM_KEYS = ['own', 'kvm', 'sree', 'habibur', 'alamin'];

export default function HSEHome() {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [projectId, setProjectId] = useState(null);
  const [docs,      setDocs]      = useState([]);
  const [loading,   setLoading]   = useState(true);

  const role    = userProfile?.role;
  const myTeam  = userProfile?.team;
  const canAdmin = hasPermission(role, 'manage:blocks'); // owner + manager
  const isWorker = ['staff', 'subcon-admin', 'subcon'].includes(role);

  useEffect(() => {
    const load = async () => {
      try {
        const pSnap = await getDocs(query(collection(db, 'projects'), where('status', '==', 'active'), limit(1)));
        if (pSnap.empty) { setLoading(false); return; }
        const pid = pSnap.docs[0].id;
        setProjectId(pid);
        const dSnap = await getDocs(collection(db, 'projects', pid, 'documents'));
        setDocs(dSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        toast.error('Failed to load HSE documents');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

  const visibleDocs = isWorker && myTeam
    ? docs.filter(d => d.access?.[myTeam])
    : docs;

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>HSE Documents</h1>
          <p className={styles.sub}>Safety forms and site documents for PCS Batch 3</p>
        </div>
        {canAdmin && !allOwnEnabled && (
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
        <Card>
          <CardHeader
            title="Project Documents"
            subtitle={canAdmin ? 'Toggle team access using the buttons below' : 'Download permitted forms'}
          />
          <div className={styles.docList}>
            {visibleDocs.map(d => (
              <div key={d.id} className={styles.docRow}>
                <div className={styles.docInfo}>
                  <ShieldCheckIcon className={styles.docIcon} width={18} />
                  <div>
                    <p className={styles.docName}>{d.name}</p>
                    <Badge color="blue">{d.category?.toUpperCase() ?? 'DOC'}</Badge>
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
