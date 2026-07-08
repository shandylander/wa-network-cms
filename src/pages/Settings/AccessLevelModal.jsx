import React, { useState } from 'react';
import { TrashIcon } from '@heroicons/react/24/outline';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../../context/ToastContext';
import { PERMISSION_CATALOG, PERMISSION_AREAS } from '../../utils/permissionCatalog';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './AccessLevels.module.css';

const COLOR_PALETTE = [
  '#1a5fa8', '#1a8a5a', '#6d3fa8', '#d97b00',
  '#CC0000', '#0891b2', '#be185d', '#15803d',
  '#7c3aed', '#b45309', '#374151', '#1a1a2e',
];

export default function AccessLevelModal({ level, existingIds, onClose, onSaved, onDeleted, saveLevel, deleteLevel }) {
  const { toast } = useToast();
  const isEdit = Boolean(level);

  const [label,       setLabel]       = useState(level?.label ?? '');
  const [color,       setColor]       = useState(level?.color ?? COLOR_PALETTE[0]);
  const [permissions, setPermissions] = useState(new Set(level?.permissions ?? []));
  const [saving,      setSaving]      = useState(false);
  const [delStep,     setDelStep]     = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [memberCount, setMemberCount] = useState(null);

  const togglePerm = (key) => setPermissions((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const toggleArea = (area, keys) => setPermissions((prev) => {
    const next = new Set(prev);
    const allOn = keys.every((k) => next.has(k));
    keys.forEach((k) => allOn ? next.delete(k) : next.add(k));
    return next;
  });

  const save = async () => {
    if (!label.trim()) { toast.error('Enter a name for this access level.'); return; }
    setSaving(true);
    try {
      const id = await saveLevel({
        id: level?.id,
        label: label.trim(),
        color,
        permissions: [...permissions],
      }, existingIds);
      toast.success(`Access level "${label.trim()}" saved`);
      onSaved({ id, label: label.trim(), color, permissions: [...permissions] });
    } catch {
      toast.error('Failed to save access level');
    } finally {
      setSaving(false);
    }
  };

  const startDelete = async () => {
    setDeleting(true);
    try {
      const snap = await getDocs(query(collection(db, 'users'), where('accessLevels', 'array-contains', level.id)));
      setMemberCount(snap.size);
      setDelStep(true);
    } catch {
      toast.error('Failed to check assigned users');
    } finally {
      setDeleting(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteLevel(level.id);
      toast.success(`Access level "${level.label}" deleted`);
      onDeleted(level.id);
    } catch {
      toast.error('Failed to delete access level');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit Access Level' : 'New Access Level'} size="lg">
      <div className={styles.formRow}>
        <label className={styles.fieldLbl}>Name</label>
        <input
          className={styles.input}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Reports Viewer"
        />
      </div>

      <div className={styles.formRow}>
        <label className={styles.fieldLbl}>Color</label>
        <div className={styles.colorRow}>
          {COLOR_PALETTE.map((c) => (
            <button
              key={c} type="button"
              className={[styles.colorSwatch, color === c ? styles.colorActive : ''].join(' ')}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={c}
            />
          ))}
        </div>
      </div>

      <div className={styles.formRow}>
        <label className={styles.fieldLbl}>Permissions ({permissions.size} selected)</label>
        <div className={styles.permAreas}>
          {PERMISSION_AREAS.map((area) => {
            const areaPerms = PERMISSION_CATALOG.filter((p) => p.area === area);
            const keys = areaPerms.map((p) => p.key);
            const allOn = keys.every((k) => permissions.has(k));
            const someOn = keys.some((k) => permissions.has(k));
            return (
              <div key={area} className={styles.permArea}>
                <button
                  type="button"
                  className={styles.permAreaHead}
                  onClick={() => toggleArea(area, keys)}
                >
                  <span className={[styles.areaCheck, allOn ? styles.areaCheckOn : someOn ? styles.areaCheckSome : ''].join(' ')} />
                  {area}
                </button>
                <div className={styles.permGrid}>
                  {areaPerms.map((p) => (
                    <label key={p.key} className={styles.permCheck}>
                      <input
                        type="checkbox"
                        checked={permissions.has(p.key)}
                        onChange={() => togglePerm(p.key)}
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isEdit && (
        <div className={styles.deleteZone}>
          {!delStep ? (
            <button className={styles.deleteLink} onClick={startDelete} disabled={deleting}>
              <TrashIcon width={14} /> Delete this access level
            </button>
          ) : memberCount > 0 ? (
            <p className={styles.deleteBlocked}>
              Cannot delete — {memberCount} user{memberCount !== 1 ? 's' : ''} still assigned to this level.
              Reassign them first.
            </p>
          ) : (
            <div className={styles.deleteConfirm}>
              <p>Delete "{level.label}" permanently? This cannot be undone.</p>
              <Button variant="danger" size="sm" onClick={confirmDelete} loading={deleting}>
                Yes, delete it
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setDelStep(false)}>Cancel</Button>
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={save} loading={saving}>{isEdit ? 'Save Changes' : 'Create Level'}</Button>
      </div>
    </Modal>
  );
}
