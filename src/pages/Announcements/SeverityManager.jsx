import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import { useToast } from '../../context/ToastContext';
import styles from './SeverityManager.module.css';

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Admin editor for the bulletin severity/category list (appConfig/announcementSeverities). */
export default function SeverityManager({ severities, saveSeverities, onClose }) {
  const { toast } = useToast();
  const [types,  setTypes]  = useState(severities);
  const [label,  setLabel]  = useState('');
  const [color,  setColor]  = useState('#1a5fa8');
  const [saving, setSaving] = useState(false);

  const add = () => {
    const l = label.trim();
    if (!l) return;
    const key = slug(l);
    if (types.some(t => t.key === key)) { toast.error('That category already exists.'); return; }
    setTypes(ts => [...ts, { key, label: l, color }]);
    setLabel('');
    setColor('#1a5fa8');
  };

  const remove = (key) => setTypes(ts => ts.filter(t => t.key !== key));

  const save = async () => {
    if (types.length === 0) { toast.error('At least one category is required.'); return; }
    setSaving(true);
    try {
      await saveSeverities(types);
      toast.success('Categories saved');
      onClose();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Bulletin Categories" size="sm">
      <p className={styles.hint}>
        These appear as the severity/category choice when posting a bulletin. Removing a category
        doesn't change bulletins already posted with it — they just fall back to a plain grey badge.
      </p>

      <div className={styles.list}>
        {types.map(t => (
          <div key={t.key} className={styles.row}>
            <span className={styles.swatch} style={{ background: t.color }} />
            <span className={styles.label}>{t.label}</span>
            <button className={styles.removeBtn} onClick={() => remove(t.key)} title="Remove">
              <TrashIcon width={14} />
            </button>
          </div>
        ))}
        {types.length === 0 && <p className={styles.empty}>No categories — add one below.</p>}
      </div>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Category name (e.g. Safety Alert)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <input
          type="color"
          className={styles.colorInput}
          value={color}
          onChange={e => setColor(e.target.value)}
          title="Badge color"
        />
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
