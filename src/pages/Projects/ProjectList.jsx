import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { PlusIcon, FolderOpenIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../utils/permissions';
import { formatDate } from '../../utils/helpers';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import Modal from '../../components/UI/Modal';
import styles from './ProjectList.module.css';

const STATUS_COLOR = { active: 'green', upcoming: 'amber', completed: 'default' };
const EMPTY_FORM = { name: '', client: '', type: 'CCTV Installation', projectType: 'cctv', location: '', status: 'upcoming', startDate: '' };

export default function ProjectList() {
  const navigate = useNavigate();
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [projects, setProjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);

  const canAdd = hasPermission(userProfile?.role, 'manage:blocks');

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'projects'));
      setProjects(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      toast.error('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await addDoc(collection(db, 'projects'), {
        ...form,
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
              <label className={styles.label}>Client *</label>
              <input className={styles.input} value={form.client} onChange={set('client')} placeholder="e.g. Certis Technology" required />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Work Type</label>
              <select className={styles.input} value={form.projectType} onChange={set('projectType')}>
                <option value="pcs">PCS (Block Installation)</option>
                <option value="cctv">CCTV Installation</option>
                <option value="maintenance">Maintenance</option>
                <option value="general">General</option>
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
    </div>
  );
}
