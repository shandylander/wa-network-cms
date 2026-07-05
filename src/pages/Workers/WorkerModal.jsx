import React, { useState, useEffect } from 'react';
import { collection, addDoc, doc, updateDoc, getDocs } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { TEAMS } from '../../utils/permissions';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import Badge from '../../components/UI/Badge';
import styles from './WorkerModal.module.css';

const TEAM_OPTIONS = ['own', 'kvm', 'sree', 'habibur', 'alamin'];
const EMPTY_CERT = { name: '', expiry: '' };

function certBadge(expiry) {
  if (!expiry) return { label: 'No expiry', color: 'default' };
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
  if (days < 0)   return { label: 'Expired',  color: 'red'   };
  if (days <= 30) return { label: `${days}d`,  color: 'amber' };
  return { label: 'Valid', color: 'green' };
}

export default function WorkerModal({ mode, worker, onClose, onSaved, userRole, userTeam }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const isAdmin = ['owner', 'manager', 'supervisor'].includes(userRole);

  const [form, setForm] = useState({
    name:        worker?.name        ?? '',
    nric:        worker?.nric        ?? '',
    designation: worker?.designation ?? '',
    contact:     worker?.contact     ?? '',
    team:        worker?.team        ?? (isAdmin ? '' : userTeam ?? ''),
    status:      worker?.status      ?? 'active',
    linkedUserId: worker?.linkedUserId ?? '',
  });
  const [certs,    setCerts]    = useState(worker?.certs ?? []);
  const [newCert,  setNewCert]  = useState(EMPTY_CERT);
  const [showAdd,  setShowAdd]  = useState(false);
  const [saving,   setSaving]   = useState(false);

  // Users available for import (add mode only)
  const [userList, setUserList] = useState([]);
  useEffect(() => {
    if (mode !== 'add') return;
    getDocs(collection(db, 'users')).then(snap => {
      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(u => u.status === 'active')
        .sort((a, b) => a.name?.localeCompare(b.name));
      setUserList(list);
    }).catch(() => {});
  }, [mode]);

  const handleImportUser = (userId) => {
    if (!userId) {
      setForm(f => ({ ...f, linkedUserId: '' }));
      return;
    }
    const u = userList.find(u => u.userId === userId);
    if (!u) return;
    setForm(f => ({
      ...f,
      linkedUserId: u.userId,
      name:    u.name    || f.name,
      team:    u.team    || f.team,
      contact: u.contact || f.contact,
    }));
  };

  const setF = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const addCert = () => {
    if (!newCert.name.trim()) return;
    setCerts(c => [...c, { ...newCert }]);
    setNewCert(EMPTY_CERT);
    setShowAdd(false);
  };

  const removeCert = (idx) => setCerts(c => c.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = { ...form, certs, updatedAt: new Date(), updatedBy: userProfile.userId };
      if (mode === 'add') {
        const ref = await addDoc(collection(db, 'workers'), {
          ...payload,
          createdAt: new Date(),
          createdBy: userProfile.userId,
        });
        toast.success('Worker added');
        onSaved({ id: ref.id, ...payload }, true);
      } else {
        await updateDoc(doc(db, 'workers', worker.id), payload);
        toast.success('Worker updated');
        onSaved({ ...worker, ...payload }, false);
      }
    } catch {
      toast.error('Failed to save worker');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={mode === 'add' ? 'Add Worker' : 'Edit Worker'} size="md">

      {/* Import from existing user account */}
      {mode === 'add' && userList.length > 0 && (
        <div className={styles.importBar}>
          <label className={styles.importLabel}>Import from user account</label>
          <select
            className={styles.importSelect}
            value={form.linkedUserId}
            onChange={e => handleImportUser(e.target.value)}
          >
            <option value="">— Enter manually —</option>
            {userList.map(u => (
              <option key={u.userId} value={u.userId}>
                {u.name} ({u.userId}) · {TEAMS[u.team] ?? u.team ?? '—'}
              </option>
            ))}
          </select>
          {form.linkedUserId && (
            <p className={styles.importHint}>Name, team and contact pre-filled. Add NRIC, designation and certs below.</p>
          )}
        </div>
      )}

      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Basic Info</h4>
        <div className={styles.grid2}>
          <div className={styles.field}>
            <label className={styles.label}>Full Name *</label>
            <input className={styles.input} value={form.name} onChange={setF('name')} placeholder="e.g. Ahmad Bin Ali" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>NRIC (last 4 + letter)</label>
            <input className={styles.input} value={form.nric} onChange={setF('nric')} placeholder="e.g. 789A" maxLength={5} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Designation</label>
            <input className={styles.input} value={form.designation} onChange={setF('designation')} placeholder="e.g. Technician" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contact</label>
            <input className={styles.input} value={form.contact} onChange={setF('contact')} placeholder="e.g. 9123 4567" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Team</label>
            <select className={styles.input} value={form.team} onChange={setF('team')} disabled={!isAdmin}>
              <option value="">— Select team —</option>
              {TEAM_OPTIONS.map(t => <option key={t} value={t}>{TEAMS[t] ?? t}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            <select className={styles.input} value={form.status} onChange={setF('status')}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.certHeader}>
          <h4 className={styles.sectionTitle}>Certificates ({certs.length})</h4>
          {!showAdd && (
            <button className={styles.addCertBtn} onClick={() => setShowAdd(true)}>
              <PlusIcon width={13} /> Add
            </button>
          )}
        </div>

        {showAdd && (
          <div className={styles.certForm}>
            <input
              className={styles.input}
              placeholder="Certificate name"
              value={newCert.name}
              onChange={e => setNewCert(c => ({ ...c, name: e.target.value }))}
            />
            <input
              type="date"
              className={styles.input}
              value={newCert.expiry}
              onChange={e => setNewCert(c => ({ ...c, expiry: e.target.value }))}
            />
            <div className={styles.certFormBtns}>
              <Button size="sm" onClick={addCert}>Add</Button>
              <Button size="sm" variant="ghost" onClick={() => { setShowAdd(false); setNewCert(EMPTY_CERT); }}>Cancel</Button>
            </div>
          </div>
        )}

        {certs.length === 0 && !showAdd ? (
          <p className={styles.noCerts}>No certificates added.</p>
        ) : (
          <div className={styles.certList}>
            {certs.map((c, i) => {
              const b = certBadge(c.expiry);
              return (
                <div key={i} className={styles.certRow}>
                  <div className={styles.certInfo}>
                    <span className={styles.certName}>{c.name}</span>
                    <span className={styles.certExpiry}>{c.expiry ? `Exp: ${c.expiry}` : 'No expiry'}</span>
                  </div>
                  <Badge color={b.color}>{b.label}</Badge>
                  <button className={styles.removeBtn} onClick={() => removeCert(i)} title="Remove">
                    <TrashIcon width={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>
          {mode === 'add' ? 'Add Worker' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}
