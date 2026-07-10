import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import { useToast } from '../../context/ToastContext';
import styles from './WorkTypeManager.module.css';

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const SHAPES = [
  { value: 'pcs',     label: 'Full (blocks + claims + materials)' },
  { value: 'cctv',    label: 'Block tracking (no claims/materials)' },
  { value: 'general', label: 'Simple (no block tracking)' },
];

/* Admin editor for the project work-type list (appConfig/workTypes). */
export default function WorkTypeManager({ workTypes, saveWorkTypes, onClose }) {
  const { toast } = useToast();
  const [types,  setTypes]  = useState(workTypes);
  const [label,  setLabel]  = useState('');
  const [shape,  setShape]  = useState('general');
  const [saving, setSaving] = useState(false);

  const add = () => {
    const l = label.trim();
    if (!l) return;
    const key = slug(l);
    if (types.some(t => t.key === key)) { toast.error('That work type already exists.'); return; }
    setTypes(ts => [...ts, { key, label: l, shape }]);
    setLabel('');
    setShape('general');
  };

  const remove = (key) => setTypes(ts => ts.filter(t => t.key !== key));

  const save = async () => {
    if (types.length === 0) { toast.error('At least one work type is required.'); return; }
    setSaving(true);
    try {
      await saveWorkTypes(types);
      toast.success('Work types saved');
      onClose();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Work Types" size="sm">
      <p className={styles.hint}>
        These appear in the Work Type dropdown when creating a project. Removing a type doesn't
        change any project already using it — it just falls back to a simple, no-block-tracking layout.
      </p>

      <div className={styles.list}>
        {types.map(t => (
          <div key={t.key} className={styles.row}>
            <span className={styles.label}>{t.label}</span>
            <span className={styles.shapeTag}>{SHAPES.find(s => s.value === t.shape)?.label ?? t.shape}</span>
            <button className={styles.removeBtn} onClick={() => remove(t.key)} title="Remove">
              <TrashIcon width={14} />
            </button>
          </div>
        ))}
        {types.length === 0 && <p className={styles.empty}>No work types — add one below.</p>}
      </div>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Work type name (e.g. Access Control)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <select className={styles.select} value={shape} onChange={e => setShape(e.target.value)}>
          {SHAPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button className={styles.addBtn} onClick={add} disabled={!label.trim()}>
          <PlusIcon width={14} />
        </button>
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>Save</Button>
      </div>
    </Modal>
  );
}
