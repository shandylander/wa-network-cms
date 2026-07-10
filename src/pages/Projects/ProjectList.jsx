import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc, query, where, Timestamp } from 'firebase/firestore';
import { PlusIcon, FolderOpenIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useWorkTypes } from '../../hooks/useAppConfig';
import { formatDate } from '../../utils/helpers';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import Modal from '../../components/UI/Modal';
import WorkTypeManager from './WorkTypeManager';
import styles from './ProjectList.module.css';

const STATUS_COLOR = { active: 'green', upcoming: 'amber', completed: 'default' };
const EMPTY_FORM = { name: '', customerName: '', type: 'CCTV Installation', projectType: 'cctv', location: '', status: 'upcoming', startDate: '' };

export default function ProjectList() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const { can }   = usePermissions();
  const { workTypes, saveWorkTypes } = useWorkTypes();
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [showTypes,setShowTypes]= useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);

  // Creating a project always creates/links a customer record too (see
  // handleAdd), which needs manage:customers on top of manage:blocks —
  // require both so the button never appears for someone who'd hit a
  // permission-denied on the customer write partway through.
  const canAdd = can('manage:blocks') && can('manage:customers');

  // Sub-cons may only read projects where their team is in assignedTeams (see
  // firestore.rules) — an unfiltered query has no way to match that per-doc
  // condition, so it gets rejected outright. The query must mirror the rule.
  const isSubconRole = ['subcon-admin', 'subcon'].includes(userProfile?.role);
  const myTeam        = userProfile?.team;

  useEffect(() => { load(); }, [isSubconRole, myTeam]); // eslint-disable-line react-hooks/exhaustive-deps

  // Customers are only needed for the New Project picker, which only
  // owner/manager ever see — skip the read entirely for everyone else.
  useEffect(() => {
    if (!canAdd) return;
    getDocs(collection(db, 'customers'))
      .then(snap => setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {});
  }, [canAdd]);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(isSubconRole
        ? query(collection(db, 'projects'), where('assignedTeams', 'array-contains', myTeam))
        : collection(db, 'projects'));
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const customerName = form.customerName.trim();
    if (!customerName) { toast.error('Customer is required'); return; }
    setSaving(true);
    try {
      // Reuse an existing customer if the typed name matches one; otherwise
      // create a new customer record on the fly.
      const existing = customers.find(c => (c.name ?? '').toLowerCase() === customerName.toLowerCase());
      let customerId = existing?.id;
      if (!customerId) {
        const ref = await addDoc(collection(db, 'customers'), {
          name: customerName,
          contactPerson: '', phone: '', email: '', address: '', notes: '',
          createdAt: Timestamp.now(),
          createdBy: userProfile.userId,
        });
        customerId = ref.id;
        setCustomers(prev => [...prev, { id: ref.id, name: customerName }]);
      }

      const { customerName: _drop, ...rest } = form;
      await addDoc(collection(db, 'projects'), {
        ...rest,
        client: customerName,
        customerId,
        startDate: form.startDate ? new Date(form.startDate) : null,
        rates: { s1: 0, s2: 0, s3: 0 },
        assignedTeams: [],
        createdAt: new Date(),
        createdBy: userProfile.userId,
      });
      toast.success('Project created');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      load();
    } catch {
      toast.error('Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Projects</h1>
          <p className={styles.sub}>{projects.length} project{projects.length !== 1 ? 's' : ''}</p>
        </div>
        {canAdd && (
          <Button onClick={() => setShowAdd(true)} size="sm">
            <PlusIcon width={16} /> New Project
          </Button>
        )}
      </div>

      {projects.length === 0 ? (
        <div className={styles.empty}>
          <FolderOpenIcon className={styles.emptyIcon} />
          <h3>No projects yet</h3>
          <p>Create your first project to get started.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {projects.map(p => (
            <div key={p.id} className={styles.card} onClick={() => navigate(`/projects/${p.id}`)}>
              <div className={styles.cardTop}>
                <Badge color={STATUS_COLOR[p.status] ?? 'default'}>{p.status}</Badge>
                <span className={styles.cardType}>{p.type}</span>
              </div>
              <h2 className={styles.cardName}>{p.name}</h2>
              <p className={styles.cardClient}>{p.client}</p>
              <div className={styles.cardMeta}>
                {p.location && <span>{p.location}</span>}
                {p.startDate && <span>Started {formatDate(p.startDate)}</span>}
              </div>
              <div className={styles.cardArrow}>View Project →</div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={showAdd} onClose={() => setShowAdd(false)} title="New Project" size="md">
        <form onSubmit={handleAdd} className={styles.form}>
          <div className={styles.formGrid}>
            <div className={styles.field}>
              <label className={styles.label}>Project Name *</label>
              <input className={styles.input} value={form.name} onChange={set('name')} placeholder="e.g. PCS Batch 4" required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Customer *</label>
              <input className={styles.input} value={form.customerName} onChange={set('customerName')}
                placeholder="Type to search or add new" list="customer-list" required />
              <datalist id="customer-list">
                {customers.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            </div>
            <div className={styles.field}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <label className={styles.label}>Work Type</label>
                <button type="button" onClick={() => setShowTypes(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                  <Cog6ToothIcon width={12} /> Manage
                </button>
              </div>
              <select className={styles.input} value={form.projectType} onChange={set('projectType')}>
                {workTypes.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Project Label</label>
              <input className={styles.input} value={form.type} onChange={set('type')} placeholder="e.g. CCTV Installation" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Location</label>
              <input className={styles.input} value={form.location} onChange={set('location')} placeholder="e.g. Woodlands" />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Status</label>
              <select className={styles.input} value={form.status} onChange={set('status')}>
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Start Date</label>
              <input type="date" className={styles.input} value={form.startDate} onChange={set('startDate')} />
            </div>
          </div>
          <div className={styles.formActions}>
            <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button type="submit" loading={saving}>Create Project</Button>
          </div>
        </form>
      </Modal>

      {showTypes && (
        <WorkTypeManager workTypes={workTypes} saveWorkTypes={saveWorkTypes} onClose={() => setShowTypes(false)} />
      )}
    </div>
  );
}
