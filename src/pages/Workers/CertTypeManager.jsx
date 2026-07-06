import React, { useState } from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import { useToast } from '../../context/ToastContext';
import styles from './CertTypeManager.module.css';

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/* Admin editor for the certificate type list (appConfig/certTypes). */
export default function CertTypeManager({ certTypes, saveCertTypes, onClose }) {
  const { toast } = useToast();
  const [types,  setTypes]  = useState(certTypes);
  const [label,  setLabel]  = useState('');
  const [short,  setShort]  = useState('');
  const [saving, setSaving] = useState(false);

  const add = () => {
    const l = label.trim();
    if (!l) return;
    const key = slug(l);
    if (types.some(t => t.key === key)) { toast.error('That type already exists.'); return; }
    setTypes(ts => [...ts, { key, label: l, short: (short.trim() || l.slice(0, 5)).toUpperCase() }]);
    setLabel('');
    setShort('');
  };

  const remove = (key) => setTypes(ts => ts.filter(t => t.key !== key));

  const save = async () => {
    setSaving(true);
    try {
      await saveCertTypes(types);
      toast.success('Certificate types saved');
      onClose();
    } catch {
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Certificate Types" size="sm">
      <p className={styles.hint}>
        These types appear in the certificate dropdown and as chips in the worker list.
        Removing a type does not delete certificates already saved with it.
      </p>

      <div className={styles.list}>
        {types.map(t => (
          <div key={t.key} className={styles.row}>
            <span className={styles.short}>{t.short}</span>
            <span className={styles.label}>{t.label}</span>
            <button className={styles.removeBtn} onClick={() => remove(t.key)} title="Remove">
              <TrashIcon width={14} />
            </button>
          </div>
        ))}
        {types.length === 0 && <p className={styles.empty}>No types — add one below.</p>}
      </div>

      <div className={styles.addRow}>
        <input
          className={styles.input}
          placeholder="Type name (e.g. Boom Lift)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
        />
        <input
          className={[styles.input, styles.shortInput].join(' ')}
          placeholder="Chip (BL)"
          maxLength={6}
          value={short}
          onChange={e => setShort(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
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
