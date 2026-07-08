import React, { useState } from 'react';
import { PlusIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { useAccessLevels } from '../../hooks/useAccessLevels';
import Button from '../../components/UI/Button';
import AccessLevelModal from './AccessLevelModal';
import styles from './AccessLevels.module.css';

// Owner/manager only. Not exposed to any other role via the Settings nav
// card, but self-gated here too since routes aren't otherwise guarded
// (matches the existing pattern in UserManagement.jsx) — and matches
// firestore.rules, where accessLevels writes are hard-coded owner/manager,
// never delegable via the permission system itself, to prevent
// self-escalation.
export default function AccessLevels() {
  const { userProfile } = useAuth();
  const isOwnerOrManager = ['owner', 'manager'].includes(userProfile?.role);
  const { levels, loading, saveLevel, deleteLevel } = useAccessLevels();
  const [modal, setModal] = useState(null); // null | 'add' | level object
  const [localLevels, setLocalLevels] = useState(null);

  if (!isOwnerOrManager) {
    return <p className={styles.empty}>You don't have access to this page.</p>;
  }

  const displayed = localLevels ?? levels;

  const handleSaved = (saved) => {
    setLocalLevels((levels_) => {
      const base = levels_ ?? levels;
      const exists = base.find((l) => l.id === saved.id);
      const next = exists ? base.map((l) => (l.id === saved.id ? saved : l)) : [...base, saved];
      return next.sort((a, b) => a.label.localeCompare(b.label));
    });
    setModal(null);
  };

  const handleDeleted = (id) => {
    setLocalLevels((levels_) => (levels_ ?? levels).filter((l) => l.id !== id));
    setModal(null);
  };

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Access Levels</h1>
          <p className={styles.sub}>
            {displayed.length} level{displayed.length !== 1 ? 's' : ''} — assign any combination to a user
            in Settings → User Management.
          </p>
        </div>
        <Button size="sm" onClick={() => setModal('add')}>
          <PlusIcon width={16} /> New Level
        </Button>
      </div>

      {displayed.length === 0 ? (
        <div className={styles.empty}>
          <ShieldCheckIcon className={styles.emptyIcon} />
          <p>No access levels yet. Create one to start assigning fine-grained permissions.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {displayed.map((level) => (
            <button key={level.id} className={styles.card} onClick={() => setModal(level)}>
              <div className={styles.cardHead}>
                <span className={styles.cardDot} style={{ background: level.color }} />
                <span className={styles.cardLabel}>{level.label}</span>
              </div>
              <span className={styles.cardCount}>
                {(level.permissions ?? []).length} permission{(level.permissions ?? []).length !== 1 ? 's' : ''}
              </span>
            </button>
          ))}
        </div>
      )}

      {modal && (
        <AccessLevelModal
          level={modal === 'add' ? null : modal}
          existingIds={displayed.map((l) => l.id)}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          saveLevel={saveLevel}
          deleteLevel={deleteLevel}
        />
      )}
    </div>
  );
}
