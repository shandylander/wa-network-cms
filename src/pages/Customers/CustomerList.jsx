import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { PlusIcon, MagnifyingGlassIcon, BuildingOffice2Icon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import Button from '../../components/UI/Button';
import CustomerModal from './CustomerModal';
import styles from './Customers.module.css';

export default function CustomerList() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { can }   = usePermissions();
  const [customers, setCustomers] = useState([]);
  const [projectCounts, setProjectCounts] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [showAdd,  setShowAdd]  = useState(false);

  const canManage = can('manage:customers');

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = async () => {
    setLoading(true);
    try {
      const [custSnap, projSnap] = await Promise.all([
        getDocs(collection(db, 'customers')),
        getDocs(collection(db, 'projects')),
      ]);
      setCustomers(custSnap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')));
      const counts = {};
      projSnap.docs.forEach(d => {
        const cid = d.data().customerId;
        if (cid) counts[cid] = (counts[cid] ?? 0) + 1;
      });
      setProjectCounts(counts);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  if (!canManage) {
    return <p className={styles.empty}>You don't have access to this page.</p>;
  }

  const filtered = customers.filter(c =>
    (c.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (c.contactPerson ?? '').toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Customers</h1>
          <p className={styles.sub}>{customers.length} customer{customers.length !== 1 ? 's' : ''} — track contacts, past projects, and warranty history</p>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <PlusIcon width={16} /> New Customer
        </Button>
      </div>

      <div className={styles.searchWrap}>
        <MagnifyingGlassIcon className={styles.searchIcon} width={15} />
        <input
          className={styles.search}
          placeholder="Search by name or contact person…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <BuildingOffice2Icon className={styles.emptyIcon} />
          <h3>{customers.length === 0 ? 'No customers yet' : 'No matches'}</h3>
          <p>{customers.length === 0 ? 'Add your first customer to start tracking their projects.' : 'Try a different search.'}</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {filtered.map(c => (
            <div key={c.id} className={styles.card} onClick={() => navigate(`/customers/${c.id}`)}>
              <h2 className={styles.cardName}>{c.name}</h2>
              {c.contactPerson && <p className={styles.cardContact}>{c.contactPerson}</p>}
              <div className={styles.cardMeta}>
                {c.phone && <span>{c.phone}</span>}
                {c.email && <span>{c.email}</span>}
              </div>
              <div className={styles.cardFooter}>
                <span className={styles.cardProjCount}>
                  {projectCounts[c.id] ?? 0} project{(projectCounts[c.id] ?? 0) !== 1 ? 's' : ''}
                </span>
                <span className={styles.cardArrow}>View →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <CustomerModal
          onClose={() => setShowAdd(false)}
          onSaved={(saved) => setCustomers(prev => [...prev, saved].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')))}
        />
      )}
    </div>
  );
}
