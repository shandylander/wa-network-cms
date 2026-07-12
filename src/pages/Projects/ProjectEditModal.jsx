import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import listStyles from './ProjectList.module.css';

// Reuses ProjectList.module.css's form styles (.form/.formGrid/.field/etc.)
// rather than duplicating them — same form look as "New Project".
//
// Deliberately does not expose projectType (the work-type key that decides
// which tabs render, e.g. block tracker for 'pcs'/'cctv') — changing it on
// a project that already has block data would be destructive, not a normal
// edit. Name/client/type-label/location/status/date/rates are all safe to
// change after creation.
export default function ProjectEditModal({ project, canViewMoney, canLock, onClose, onSaved }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: project.name ?? '',
    client: project.client ?? '',
    type: project.type ?? '',
    location: project.location ?? '',
    status: project.status ?? 'upcoming',
    startDate: project.startDate?.toDate
      ? project.startDate.toDate().toISOString().slice(0, 10)
      : (project.startDate ? new Date(project.startDate).toISOString().slice(0, 10) : ''),
    s1: project.rates?.s1 ?? 0,
    s2: project.rates?.s2 ?? 0,
    s3: project.rates?.s3 ?? 0,
    deleteProtected: project.deleteProtected ?? false,
  });
  const [saving, setSaving] = useState(false);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Project name is required'); return; }
    if (!form.client.trim()) { toast.error('Client is required'); return; }
    setSaving(true);
    try {
      const update = {
        name: form.name.trim(),
        client: form.client.trim(),
        type: form.type.trim(),
        location: form.location.trim(),
        status: form.status,
        startDate: form.startDate ? new Date(form.startDate) : null,
      };
      if (canViewMoney) {
        update.rates = { s1: Number(form.s1) || 0, s2: Number(form.s2) || 0, s3: Number(form.s3) || 0 };
      }
      if (canLock) {
        update.deleteProtected = form.deleteProtected;
      }
      await updateDoc(doc(db, 'projects', project.id), update);
      toast.success('Project updated');
      onSaved({ ...project, ...update });
    } catch {
      toast.error('Failed to update project');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit Project" size="md">
      <form onSubmit={submit} className={listStyles.form}>
        <div className={listStyles.formGrid}>
          <div className={listStyles.field}>
            <label className={listStyles.label}>Project Name *</label>
            <input className={listStyles.input} value={form.name} onChange={set('name')} required />
          </div>
          <div className={listStyles.field}>
            <label className={listStyles.label}>Client *</label>
            <input className={listStyles.input} value={form.client} onChange={set('client')} required />
          </div>
          <div className={listStyles.field}>
            <label className={listStyles.label}>Project Label</label>
            <input className={listStyles.input} value={form.type} onChange={set('type')} placeholder="e.g. CCTV Installation" />
          </div>
          <div className={listStyles.field}>
            <label className={listStyles.label}>Location</label>
            <input className={listStyles.input} value={form.location} onChange={set('location')} />
          </div>
          <div className={listStyles.field}>
            <label className={listStyles.label}>Status</label>
            <select className={listStyles.input} value={form.status} onChange={set('status')}>
              <option value="upcoming">Upcoming</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className={listStyles.field}>
            <label className={listStyles.label}>Start Date</label>
            <input type="date" className={listStyles.input} value={form.startDate} onChange={set('startDate')} />
          </div>
          {canViewMoney && (
            <>
              <div className={listStyles.field}>
                <label className={listStyles.label}>Stage 1 Rate ($/block)</label>
                <input type="number" min="0" step="0.01" className={listStyles.input} value={form.s1} onChange={set('s1')} />
              </div>
              <div className={listStyles.field}>
                <label className={listStyles.label}>Stage 2 Rate ($/block)</label>
                <input type="number" min="0" step="0.01" className={listStyles.input} value={form.s2} onChange={set('s2')} />
              </div>
              <div className={listStyles.field}>
                <label className={listStyles.label}>Stage 3 Rate ($/block)</label>
                <input type="number" min="0" step="0.01" className={listStyles.input} value={form.s3} onChange={set('s3')} />
              </div>
            </>
          )}
        </div>
        {canLock && (
          <label className={listStyles.field} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, margin: '14px 0 0', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.deleteProtected}
              onChange={e => setForm(f => ({ ...f, deleteProtected: e.target.checked }))}
            />
            <span style={{ fontSize: 13, color: 'var(--text)' }}>
              Protect this project from deletion — hides/disables the Delete button for everyone, including Owner, until unchecked.
            </span>
          </label>
        )}
        <div className={listStyles.formActions}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Save Changes</Button>
        </div>
      </form>
    </Modal>
  );
}
