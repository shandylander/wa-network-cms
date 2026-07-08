import { useState, useEffect, useCallback } from 'react';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Access Levels are their own top-level Firestore collection (not the
// appConfig array-in-doc pattern used for Team Groups/Cert Types) so the
// recomputeLevelMemberPermissions Cloud Function can react per-document.
export function useAccessLevels() {
  const [levels,  setLevels]  = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'accessLevels'));
      setLevels(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
      );
    } catch {
      setLevels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // level: { id?, label, color, permissions }. New levels get a slugged id
  // with a short suffix to avoid collisions; existing ids are preserved.
  const saveLevel = useCallback(async (level, existingIds) => {
    let id = level.id;
    if (!id) {
      const base = slug(level.label) || 'level';
      id = base;
      let n = 2;
      while (existingIds.includes(id)) { id = `${base}-${n}`; n++; }
    }
    await setDoc(doc(db, 'accessLevels', id), {
      label: level.label,
      color: level.color,
      permissions: level.permissions,
    }, { merge: true });
    return id;
  }, []);

  const deleteLevel = useCallback(async (id) => {
    await deleteDoc(doc(db, 'accessLevels', id));
  }, []);

  return { levels, loading, load, saveLevel, deleteLevel };
}
