import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  collection, getDocs, doc, getDoc, updateDoc, setDoc, deleteDoc,
} from 'firebase/firestore';
import { createUserWithEmailAndPassword, getAuth, signOut as fbSignOut } from 'firebase/auth';
import { initializeApp, getApps } from 'firebase/app';
import {
  MagnifyingGlassIcon, PlusIcon, ExclamationTriangleIcon,
  BuildingOfficeIcon, PhoneIcon, EnvelopeIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import { db, firebaseConfig, pinToPassword } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useAccessLevels } from '../../hooks/useAccessLevels';
import { ROLES } from '../../utils/permissions';
import { ROLE_LEVEL_SEED } from '../../utils/permissionCatalog';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import Modal from '../../components/UI/Modal';
import styles from './UserManagement.module.css';

/* ── Helpers ──────────────────────────────────────────────────────── */

function getSecondaryAuth() {
  const existing = getApps().find(a => a.name === 'secondary');
  const app = existing ?? initializeApp(firebaseConfig, 'secondary');
  return getAuth(app);
}

// WA group is always pinned — never stored in Firestore, never deletable
const WA_GROUP = {
  key: 'wa', label: 'WA! Network Asia',
  teams: ['none', 'own'], color: '#1a1a2e', pinned: true,
};

// Default subcon groups seeded on first load
const DEFAULT_SUBCON_GROUPS = [
  { key: 'kvm',     label: 'KVM Team',        color: '#1a5fa8' },
  { key: 'sree',    label: 'Sree Ram',         color: '#1a8a5a' },
  { key: 'habibur', label: 'Habibur',          color: '#6d3fa8' },
  { key: 'alamin',  label: 'Alamin (Seabiz)',  color: '#d97b00' },
];

const COLOR_PALETTE = [
  '#1a5fa8', '#1a8a5a', '#6d3fa8', '#d97b00',
  '#CC0000', '#0891b2', '#be185d', '#15803d',
  '#7c3aed', '#b45309', '#374151', '#1a1a2e',
];

const CONFIG_DOC = doc(db, 'appConfig', 'userGroups');

function toKey(label) {
  return label.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
}

function initials(name = '') {
  return name.trim().split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase();
}

/* ── UserCard ─────────────────────────────────────────────────────── */
function UserCard({ user, groupColor, onClick }) {
  const ri = ROLES[user.role] ?? { label: user.role, color: 'default' };
  return (
    <div
      className={[styles.card, user.status !== 'active' ? styles.cardInactive : ''].join(' ')}
      onClick={onClick}
    >
      <div className={styles.avatar} style={{ background: groupColor ?? 'var(--text-sec)' }}>
        {initials(user.name)}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.cardId}>{user.userId}</span>
          {user.firstLogin && <span className={styles.pendingDot} title="First login pending" />}
          <span className={styles.cardName}>{user.name}</span>
          <div className={styles.cardBadges}>
            <Badge color={ri.color}>{ri.label}</Badge>
            <Badge color={user.status === 'active' ? 'green' : 'default'} dot>{user.status}</Badge>
          </div>
        </div>
        <div className={styles.cardMeta}>
          {user.company && (
            <span className={styles.metaItem}><BuildingOfficeIcon width={12} />{user.company}</span>
          )}
          {user.contact && (
            <span className={styles.metaItem}><PhoneIcon width={12} />{user.contact}</span>
          )}
          {user.email && (
            <span className={styles.metaItem}><EnvelopeIcon width={12} />{user.email}</span>
          )}
          {!user.company && !user.contact && !user.email && (
            <span className={styles.metaEmpty}>No contact info</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Add / Edit Group modal ───────────────────────────────────────── */
function GroupModal({ existing, usedKeys, onClose, onSaved, onDeleted, userCountInGroup }) {
  const { toast } = useToast();
  const isEdit = !!existing;

  const [label,   setLabel]   = useState(existing?.label ?? '');
  const [color,   setColor]   = useState(existing?.color ?? COLOR_PALETTE[0]);
  const [saving,  setSaving]  = useState(false);
  const [delStep, setDelStep] = useState(false);
  const [deleting,setDeleting]= useState(false);

  const derivedKey = isEdit ? existing.key : toKey(label);
  const keyConflict = !isEdit && usedKeys.includes(derivedKey) && derivedKey !== '';

  const handleSave = async () => {
    if (!label.trim()) { toast.error('Group name is required'); return; }
    const key = isEdit ? existing.key : derivedKey;
    if (!key) { toast.error('Cannot derive a valid key from that name'); return; }
    if (keyConflict) { toast.error('A group with that name/key already exists'); return; }
    setSaving(true);
    try {
      const snap = await getDoc(CONFIG_DOC);
      const current = snap.exists() ? (snap.data().groups ?? []) : [...DEFAULT_SUBCON_GROUPS];
      let updated;
      if (isEdit) {
        updated = current.map(g => g.key === key ? { ...g, label: label.trim(), color } : g);
      } else {
        updated = [...current, { key, label: label.trim(), color }];
      }
      await setDoc(CONFIG_DOC, { groups: updated }, { merge: true });
      toast.success(isEdit ? 'Group updated' : `Group "${label.trim()}" created`);
      onSaved({ key, label: label.trim(), color, teams: [key] });
    } catch {
      toast.error('Failed to save group');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const snap = await getDoc(CONFIG_DOC);
      const current = snap.exists() ? (snap.data().groups ?? []) : [];
      await setDoc(CONFIG_DOC, { groups: current.filter(g => g.key !== existing.key) }, { merge: true });
      toast.success(`Group "${existing.label}" removed`);
      onDeleted(existing.key);
    } catch {
      toast.error('Failed to delete group');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'Edit Group' : 'Add Group'} size="sm">
      <div className={styles.formGrid} style={{ gridTemplateColumns: '1fr' }}>
        <div className={styles.field}>
          <label className={styles.label}>Group Name *</label>
          <input
            className={styles.input} autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="e.g. ABC Construction"
          />
          {!isEdit && derivedKey && (
            <span className={[styles.hint, keyConflict ? styles.hintError : ''].join(' ')}>
              Team key: <code>{derivedKey}</code>
              {keyConflict ? ' — already taken' : ''}
            </span>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Colour</label>
          <div className={styles.colorPalette}>
            {COLOR_PALETTE.map(c => (
              <button
                key={c} type="button"
                className={[styles.colorSwatch, color === c ? styles.colorActive : ''].join(' ')}
                style={{ background: c }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
          <div className={styles.colorPreview}>
            <span className={styles.previewDot} style={{ background: color }} />
            <span className={styles.previewText}>{label || 'Group name'}</span>
          </div>
        </div>
      </div>

      <div className={styles.modalFooter}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>{isEdit ? 'Save Changes' : 'Create Group'}</Button>
      </div>

      {isEdit && (
        <div className={styles.actionSection}>
          <div className={styles.actionLabel}>Danger</div>
          {userCountInGroup > 0 ? (
            <p className={styles.cannotDelete}>
              Cannot delete — {userCountInGroup} user{userCountInGroup !== 1 ? 's' : ''} still assigned to this group. Reassign or remove them first.
            </p>
          ) : !delStep ? (
            <button className={[styles.linkBtn, styles.linkRed].join(' ')} onClick={() => setDelStep(true)}>
              Delete this group
            </button>
          ) : (
            <div className={styles.confirmBox}>
              <ExclamationTriangleIcon width={14} className={styles.warnIcon} />
              <span>Delete group <strong>{existing.label}</strong>? This cannot be undone.</span>
              <div className={styles.confirmBtns}>
                <button className={styles.btnCancel} onClick={() => setDelStep(false)}>Cancel</button>
                <button className={styles.btnDelete} onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

/* ── Edit User modal ──────────────────────────────────────────────── */
function EditUserModal({ user, groupColor, allTeams, onClose, onSaved, onStatusChange, can, myRole }) {
  const { toast }        = useToast();
  const { levels: accessLevels } = useAccessLevels();
  const isOwnerOrManager = ['owner', 'manager'].includes(myRole);

  const [form, setForm] = useState({
    name:         user.name         ?? '',
    role:         user.role         ?? 'subcon',
    team:         user.team         ?? '',
    parentId:     user.parentId     ?? '',
    company:      user.company      ?? '',
    contact:      user.contact      ?? '',
    email:        user.email        ?? '',
    accessLevels: user.accessLevels ?? [],
  });
  const [saving,    setSaving]    = useState(false);
  const [pinStep,   setPinStep]   = useState(false);
  const [pinSaving, setPinSaving] = useState(false);
  const [delStep,   setDelStep]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);

  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);
    try {
      const payload = {
        name:     form.name.trim(),
        company:  form.company.trim(),
        contact:  form.contact.trim(),
        email:    form.email.trim(),
        updatedAt: new Date(),
      };
      if (isOwnerOrManager) {
        payload.role         = form.role;
        payload.team         = form.team;
        payload.parentId     = form.parentId.trim() || null;
        payload.accessLevels = form.accessLevels;
      }
      await updateDoc(doc(db, 'users', user.userId), payload);
      toast.success(`${form.name} updated`);
      onSaved({ ...user, ...payload });
    } catch { toast.error('Failed to save changes'); } finally { setSaving(false); }
  };

  const handlePinReset = async () => {
    setPinSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.userId), { firstLogin: true });
      toast.success(`${user.name} will set a new PIN on next login`);
      setPinStep(false);
      onSaved({ ...user, ...form, firstLogin: true });
    } catch { toast.error('Failed to reset PIN'); } finally { setPinSaving(false); }
  };

  const handleToggleStatus = async () => {
    const next = user.status === 'active' ? 'inactive' : 'active';
    try {
      await updateDoc(doc(db, 'users', user.userId), { status: next });
      toast.success(`${user.name} ${next === 'active' ? 'reactivated' : 'deactivated'}`);
      onStatusChange({ ...user, ...form, status: next });
    } catch { toast.error('Failed to update status'); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', user.userId));
      toast.success(`${user.name} removed`);
      onStatusChange(null);
    } catch { toast.error('Failed to remove user'); setDeleting(false); }
  };

  const teamLabel = allTeams[user.team] ?? user.team;

  return (
    <Modal isOpen onClose={onClose} title="Edit User" size="md">
      <div className={styles.modalHeader}>
        <div className={styles.modalAvatar} style={{ background: groupColor ?? 'var(--text-sec)' }}>
          {initials(form.name || user.name)}
        </div>
        <div>
          <div className={styles.modalUserId}>{user.userId}</div>
          <div className={styles.modalTeam}>{teamLabel}</div>
        </div>
        {user.firstLogin && <span className={styles.pendingPill}>First login pending</span>}
      </div>

      <div className={styles.formGrid}>
        <div className={[styles.field, styles.fieldFull].join(' ')}>
          <label className={styles.label}>Full Name *</label>
          <input className={styles.input} value={form.name} onChange={setF('name')} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Company</label>
          <input className={styles.input} value={form.company} onChange={setF('company')} placeholder="Company / trading name" />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Contact Number</label>
          <input className={styles.input} value={form.contact} onChange={setF('contact')} placeholder="+65 XXXX XXXX" />
        </div>
        <div className={[styles.field, styles.fieldFull].join(' ')}>
          <label className={styles.label}>Email</label>
          <input type="email" className={styles.input} value={form.email} onChange={setF('email')} placeholder="person@email.com" />
        </div>
        {isOwnerOrManager && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Role</label>
              <select className={styles.input} value={form.role} onChange={setF('role')}>
                {Object.entries(ROLES).map(([r, { label }]) => <option key={r} value={r}>{label}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Team</label>
              <select className={styles.input} value={form.team} onChange={setF('team')}>
                {Object.entries(allTeams).map(([t, lbl]) => <option key={t} value={t}>{lbl}</option>)}
              </select>
            </div>
            {(form.role === 'subcon' || form.role === 'subcon-admin') && (
              <div className={[styles.field, styles.fieldFull].join(' ')}>
                <label className={styles.label}>Parent ID <span className={styles.hintInline}>(subcon-admin's User ID)</span></label>
                <input className={styles.input} value={form.parentId} onChange={setF('parentId')} placeholder="e.g. KVM-ADM" />
              </div>
            )}
          </>
        )}
      </div>

      {isOwnerOrManager && (
        <div className={styles.actionSection}>
          <div className={styles.actionLabel}>Access Levels</div>
          <p className={styles.permNote}>
            This user's access is the union of every level checked below — assign as many as apply.
            Manage what each level grants in Settings → Access Levels.
          </p>
          {accessLevels.length === 0 ? (
            <p className={styles.permNote}>No access levels created yet.</p>
          ) : (
            <div className={styles.permChecks}>
              {accessLevels.map(l => (
                <label key={l.id} className={styles.permCheck}>
                  <input
                    type="checkbox"
                    checked={form.accessLevels.includes(l.id)}
                    onChange={e => setForm(f => ({
                      ...f,
                      accessLevels: e.target.checked
                        ? [...f.accessLevels, l.id]
                        : f.accessLevels.filter(x => x !== l.id),
                    }))}
                  />
                  <span className={styles.permLevelDot} style={{ background: l.color }} />
                  <span>{l.label}</span>
                </label>
              ))}
            </div>
          )}
          {form.accessLevels.length > 0 && (() => {
            const effective = [...new Set(
              accessLevels
                .filter(l => form.accessLevels.includes(l.id))
                .flatMap(l => l.permissions ?? [])
            )].sort();
            return (
              <p className={styles.permPreview}>
                <strong>{effective.length}</strong> effective permission{effective.length !== 1 ? 's' : ''} once saved.
              </p>
            );
          })()}
        </div>
      )}

      <div className={styles.modalFooter}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>Save Changes</Button>
      </div>

      {can('reset:pins') && (
        <div className={styles.actionSection}>
          <div className={styles.actionLabel}>PIN</div>
          {!pinStep ? (
            <button className={styles.linkBtn} onClick={() => setPinStep(true)}>Force PIN reset for {user.name}</button>
          ) : (
            <div className={styles.confirmBox}>
              <span>{user.name} will be prompted to set a new PIN on next login.</span>
              <div className={styles.confirmBtns}>
                <button className={styles.btnCancel} onClick={() => setPinStep(false)}>Cancel</button>
                <button className={styles.btnConfirm} onClick={handlePinReset} disabled={pinSaving}>
                  {pinSaving ? 'Resetting…' : 'Confirm'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isOwnerOrManager && (
        <div className={styles.actionSection}>
          <div className={styles.actionLabel}>Account</div>
          <div className={styles.actionRow}>
            <button className={styles.linkBtn} onClick={handleToggleStatus}>
              {user.status === 'active' ? 'Deactivate account' : 'Reactivate account'}
            </button>
            {!delStep ? (
              <button className={[styles.linkBtn, styles.linkRed].join(' ')} onClick={() => setDelStep(true)}>Remove user</button>
            ) : (
              <div className={styles.confirmBox}>
                <ExclamationTriangleIcon width={14} className={styles.warnIcon} />
                <span>Remove <strong>{user.name}</strong>? Firebase Auth credentials must be removed separately via Firebase Console.</span>
                <div className={styles.confirmBtns}>
                  <button className={styles.btnCancel} onClick={() => setDelStep(false)}>Cancel</button>
                  <button className={styles.btnDelete} onClick={handleDelete} disabled={deleting}>
                    {deleting ? 'Removing…' : 'Yes, Remove'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── Add User modal ───────────────────────────────────────────────── */
function AddUserModal({ onClose, onCreated, myRole, myUserId, myTeam, allTeams, defaultTeamKey }) {
  const { toast }      = useToast();
  const isSubconAdmin  = myRole === 'subcon-admin';

  const [form, setForm] = useState({
    userId: '', name: '', pin: '',
    role:     isSubconAdmin ? 'subcon' : 'staff',
    team:     isSubconAdmin ? myTeam : (defaultTeamKey ?? 'own'),
    parentId: isSubconAdmin ? myUserId : '',
    company: '', contact: '', email: '',
  });
  const [saving, setSaving] = useState(false);
  const setF = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async e => {
    e.preventDefault();
    if (!form.userId.trim()) { toast.error('User ID is required'); return; }
    if (!form.name.trim())   { toast.error('Name is required'); return; }
    if (!/^\d{6}$/.test(form.pin)) { toast.error('PIN must be exactly 6 digits'); return; }
    setSaving(true);
    try {
      const uid   = form.userId.trim().toUpperCase();
      const email = `${uid}@wanetwork.cms`;
      const secAuth = getSecondaryAuth();
      await createUserWithEmailAndPassword(secAuth, email, pinToPassword(form.pin));
      await fbSignOut(secAuth);
      const userData = {
        userId: uid, name: form.name.trim(),
        role: form.role, team: form.team,
        parentId: form.parentId.trim() || null,
        company: form.company.trim(), contact: form.contact.trim(), email: form.email.trim(),
        firstLogin: true, status: 'active', createdAt: new Date(), pinLength: 6,
        // Default to the seeded level matching their role, so a brand-new
        // user isn't locked out of everything until an admin remembers to
        // assign one — access is otherwise purely opt-in via Access Levels.
        accessLevels: [ROLE_LEVEL_SEED[form.role]?.id].filter(Boolean),
      };
      await setDoc(doc(db, 'users', uid), userData);
      toast.success(`User ${uid} created`);
      onCreated({ id: uid, ...userData });
      onClose();
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') toast.error('User ID already exists');
      else toast.error('Failed to create user: ' + err.message);
    } finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title="Add New User" size="md">
      <form onSubmit={handleCreate}>
        <div className={styles.formGrid}>
          <div className={styles.field}>
            <label className={styles.label}>User ID *</label>
            <input className={styles.input} value={form.userId} onChange={setF('userId')} placeholder="e.g. WK006 or KVM-02" autoFocus />
            <span className={styles.hint}>Cannot be changed after creation</span>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Initial PIN * <span className={styles.hintInline}>(6 digits)</span></label>
            <input className={styles.input} type="password" inputMode="numeric" maxLength={6} value={form.pin} onChange={setF('pin')} placeholder="••••••" />
          </div>
          <div className={[styles.field, styles.fieldFull].join(' ')}>
            <label className={styles.label}>Full Name *</label>
            <input className={styles.input} value={form.name} onChange={setF('name')} placeholder="e.g. Ahmad bin Ali" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Company</label>
            <input className={styles.input} value={form.company} onChange={setF('company')} placeholder="Company / trading name" />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Contact Number</label>
            <input className={styles.input} value={form.contact} onChange={setF('contact')} placeholder="+65 XXXX XXXX" />
          </div>
          <div className={[styles.field, styles.fieldFull].join(' ')}>
            <label className={styles.label}>Email</label>
            <input type="email" className={styles.input} value={form.email} onChange={setF('email')} placeholder="person@email.com" />
          </div>

          {!isSubconAdmin ? (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Role</label>
                <select className={styles.input} value={form.role} onChange={setF('role')}>
                  {Object.entries(ROLES).map(([r, { label }]) => <option key={r} value={r}>{label}</option>)}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Team</label>
                <select className={styles.input} value={form.team} onChange={setF('team')}>
                  {Object.entries(allTeams).map(([t, lbl]) => <option key={t} value={t}>{lbl}</option>)}
                </select>
              </div>
              {(form.role === 'subcon' || form.role === 'subcon-admin') && (
                <div className={[styles.field, styles.fieldFull].join(' ')}>
                  <label className={styles.label}>Parent ID</label>
                  <input className={styles.input} value={form.parentId} onChange={setF('parentId')} placeholder="e.g. KVM-ADM" />
                </div>
              )}
            </>
          ) : (
            <div className={[styles.field, styles.fieldFull].join(' ')}>
              <label className={styles.label}>Team</label>
              <input className={[styles.input, styles.inputReadonly].join(' ')} value={allTeams[form.team] ?? form.team} readOnly />
            </div>
          )}
        </div>
        <div className={styles.modalFooter}>
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}>Create User</Button>
        </div>
      </form>
    </Modal>
  );
}

/* ── Main page ────────────────────────────────────────────────────── */
export default function UserManagement() {
  const { userProfile }       = useAuth();
  const { toast }             = useToast();
  const { can, role: myRole } = usePermissions();

  const myTeam         = userProfile?.team   ?? '';
  const myUserId       = userProfile?.userId ?? '';
  const isSubconAdmin  = myRole === 'subcon-admin';
  const isOwnerOrMgr   = ['owner', 'manager'].includes(myRole);

  const [users,         setUsers]         = useState([]);
  const [subconGroups,  setSubconGroups]  = useState(null); // null = loading
  const [selectedKey,   setSelectedKey]   = useState(null);
  const [search,        setSearch]        = useState('');
  const [showInactive,  setShowInactive]  = useState(false);
  const [editUser,      setEditUser]      = useState(null);
  const [showAddUser,   setShowAddUser]   = useState(false);
  const [groupModal,    setGroupModal]    = useState(null); // null | 'add' | group object (edit)

  /* Load groups from Firestore (or seed defaults) */
  const loadGroups = useCallback(async () => {
    try {
      const snap = await getDoc(CONFIG_DOC);
      if (snap.exists()) {
        setSubconGroups(snap.data().groups ?? []);
      } else {
        // First run — seed defaults
        await setDoc(CONFIG_DOC, { groups: DEFAULT_SUBCON_GROUPS });
        setSubconGroups(DEFAULT_SUBCON_GROUPS);
      }
    } catch {
      setSubconGroups(DEFAULT_SUBCON_GROUPS);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'users'));
      setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch { toast.error('Failed to load users'); }
  }, [toast]);

  useEffect(() => {
    Promise.all([loadGroups(), loadUsers()]);
  }, [loadGroups, loadUsers]);

  /* Build derived lookups */
  const allGroups = useMemo(() => {
    if (!subconGroups) return [WA_GROUP];
    const custom = subconGroups.map(g => ({ ...g, teams: [g.key] }));
    return [WA_GROUP, ...custom];
  }, [subconGroups]);

  const teamToGroup = useMemo(() => {
    const map = {};
    allGroups.forEach(g => g.teams.forEach(t => { map[t] = g; }));
    return map;
  }, [allGroups]);

  // Flat teams map: key → label (for selectors)
  const allTeams = useMemo(() => {
    const map = { none: 'No Team', own: 'WA! Network' };
    (subconGroups ?? DEFAULT_SUBCON_GROUPS).forEach(g => { map[g.key] = g.label; });
    return map;
  }, [subconGroups]);

  const usedGroupKeys = useMemo(() =>
    allGroups.map(g => g.key), [allGroups]);

  /* Auto-select first group after load */
  useEffect(() => {
    if (!allGroups.length) return;
    if (selectedKey && allGroups.find(g => g.key === selectedKey)) return;
    if (isSubconAdmin) {
      const mine = allGroups.find(g => g.teams.includes(myTeam));
      setSelectedKey(mine?.key ?? allGroups[0].key);
    } else {
      setSelectedKey('wa');
    }
  }, [allGroups, isSubconAdmin, myTeam, selectedKey]);

  /* Visible groups (subcon-admin sees only their group) */
  const visibleGroups = useMemo(() => {
    if (isSubconAdmin) {
      const mine = allGroups.find(g => g.teams.includes(myTeam));
      return mine ? [mine] : [];
    }
    return allGroups;
  }, [allGroups, isSubconAdmin, myTeam]);

  /* Count active users per group */
  const groupCounts = useMemo(() => {
    const counts = {};
    allGroups.forEach(g => {
      counts[g.key] = users.filter(u => g.teams.includes(u.team ?? 'none') && u.status === 'active').length;
    });
    return counts;
  }, [allGroups, users]);

  const selectedGroup = allGroups.find(g => g.key === selectedKey) ?? allGroups[0];

  /* Panel users */
  const panelUsers = useMemo(() => {
    if (!selectedGroup) return [];
    return users.filter(u => {
      const team = u.team ?? 'none';
      if (!selectedGroup.teams.includes(team)) return false;
      if (!showInactive && u.status !== 'active') return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          u.userId?.toLowerCase().includes(q) ||
          u.name?.toLowerCase().includes(q)   ||
          u.company?.toLowerCase().includes(q)
        );
      }
      return true;
    }).sort((a, b) => (a.userId ?? '').localeCompare(b.userId ?? ''));
  }, [users, selectedGroup, showInactive, search]);

  const inactiveCount = selectedGroup
    ? users.filter(u => selectedGroup.teams.includes(u.team ?? 'none') && u.status !== 'active').length
    : 0;

  /* Group CRUD callbacks */
  const handleGroupSaved = (saved) => {
    setSubconGroups(prev => {
      const list = prev ?? [];
      const exists = list.find(g => g.key === saved.key);
      return exists ? list.map(g => g.key === saved.key ? { key: saved.key, label: saved.label, color: saved.color } : g)
                    : [...list, { key: saved.key, label: saved.label, color: saved.color }];
    });
    setSelectedKey(saved.key);
    setGroupModal(null);
  };

  const handleGroupDeleted = (key) => {
    setSubconGroups(prev => (prev ?? []).filter(g => g.key !== key));
    setSelectedKey('wa');
    setGroupModal(null);
  };

  if (!can('create:subaccounts') && !isOwnerOrMgr) {
    return <p style={{ padding: 24, color: 'var(--text-sec)' }}>You don't have permission to view this page.</p>;
  }

  const loading = subconGroups === null;

  return (
    <div className={styles.layout}>
      {/* ── Left sidebar ── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>Groups</div>
        <nav className={styles.groupList}>
          {visibleGroups.map(g => (
            <div key={g.key} className={styles.groupRowWrap}>
              <button
                className={[styles.groupRow, selectedKey === g.key ? styles.groupActive : ''].join(' ')}
                onClick={() => { setSelectedKey(g.key); setSearch(''); }}
              >
                <span className={styles.groupDot} style={{ background: g.color }} />
                <span className={styles.groupLabel}>{g.label}</span>
                <span className={styles.groupCount}>{groupCounts[g.key] ?? 0}</span>
              </button>
              {/* Edit button for non-pinned groups (owner/manager only) */}
              {!g.pinned && isOwnerOrMgr && (
                <button
                  className={styles.groupEditBtn}
                  title="Edit group"
                  onClick={e => { e.stopPropagation(); setGroupModal(g); }}
                >
                  <PencilIcon width={12} />
                </button>
              )}
            </div>
          ))}
        </nav>

        {/* Add group button (owner/manager only) */}
        {isOwnerOrMgr && !isSubconAdmin && (
          <div className={styles.sidebarFooter}>
            <button className={styles.addGroupBtn} onClick={() => setGroupModal('add')}>
              <PlusIcon width={13} /> Add Group
            </button>
          </div>
        )}
      </aside>

      {/* ── Right panel ── */}
      <div className={styles.panel}>
        <div className={styles.panelHead}>
          <div>
            <h3 className={styles.panelTitle}>{selectedGroup?.label ?? '…'}</h3>
            <p className={styles.panelSub}>{panelUsers.length} user{panelUsers.length !== 1 ? 's' : ''}</p>
          </div>
          {can('create:subaccounts') && selectedGroup && (
            <button className={styles.addBtn} onClick={() => setShowAddUser(true)}>
              <PlusIcon width={14} /> Add User
            </button>
          )}
        </div>

        <div className={styles.panelToolbar}>
          <div className={styles.searchWrap}>
            <MagnifyingGlassIcon className={styles.searchIcon} width={14} />
            <input
              className={styles.search}
              placeholder="Search name, ID, company…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {inactiveCount > 0 && (
            <label className={styles.inactiveToggle}>
              <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
              Show inactive ({inactiveCount})
            </label>
          )}
        </div>

        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : panelUsers.length === 0 ? (
          <div className={styles.empty}>
            <p>{search ? 'No users match the search.' : 'No users in this group yet.'}</p>
            {can('create:subaccounts') && !search && (
              <button className={styles.emptyAdd} onClick={() => setShowAddUser(true)}>+ Add the first user</button>
            )}
          </div>
        ) : (
          <div className={styles.cardList}>
            {panelUsers.map(u => (
              <UserCard
                key={u.id}
                user={u}
                groupColor={teamToGroup[u.team ?? 'none']?.color}
                onClick={() => setEditUser(u)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {editUser && (
        <EditUserModal
          user={editUser}
          groupColor={teamToGroup[editUser.team ?? 'none']?.color}
          allTeams={allTeams}
          onClose={() => setEditUser(null)}
          onSaved={updated => {
            setUsers(prev => prev.map(u => u.userId === updated.userId ? { ...u, ...updated } : u));
            setEditUser(null);
          }}
          onStatusChange={updated => {
            if (updated === null) setUsers(prev => prev.filter(u => u.userId !== editUser.userId));
            else setUsers(prev => prev.map(u => u.userId === updated.userId ? updated : u));
            setEditUser(null);
          }}
          can={can}
          myRole={myRole}
        />
      )}

      {showAddUser && selectedGroup && (
        <AddUserModal
          onClose={() => setShowAddUser(false)}
          onCreated={u => setUsers(prev => [u, ...prev])}
          myRole={myRole}
          myUserId={myUserId}
          myTeam={myTeam}
          allTeams={allTeams}
          defaultTeamKey={selectedGroup.pinned ? 'own' : selectedGroup.key}
        />
      )}

      {groupModal === 'add' && (
        <GroupModal
          usedKeys={usedGroupKeys}
          onClose={() => setGroupModal(null)}
          onSaved={handleGroupSaved}
          onDeleted={handleGroupDeleted}
          userCountInGroup={0}
        />
      )}
      {groupModal && groupModal !== 'add' && (
        <GroupModal
          existing={groupModal}
          usedKeys={usedGroupKeys}
          onClose={() => setGroupModal(null)}
          onSaved={handleGroupSaved}
          onDeleted={handleGroupDeleted}
          userCountInGroup={users.filter(u => u.team === groupModal.key).length}
        />
      )}
    </div>
  );
}
