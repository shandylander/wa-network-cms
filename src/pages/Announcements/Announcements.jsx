import React, { useState, useEffect, useCallback } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion,
  addDoc, Timestamp, getDocs,
} from 'firebase/firestore';
import {
  MegaphoneIcon, CheckCircleIcon, ClockIcon, PlusIcon, XMarkIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { formatDateTime, formatTimeAgo } from '../../utils/helpers';
import { hasPermission } from '../../utils/permissions';
import styles from './Announcements.module.css';

// These take arbitrary user profile objects (not just the current session's,
// e.g. when checking who a "management" bulletin targets), so they check
// effectivePermissions directly rather than via usePermissions().
const canViewManagement = (profile) => {
  const effective = profile?.effectivePermissions;
  return effective !== undefined
    ? effective.includes('view:management-alerts')
    : hasPermission(profile?.role, 'view:management-alerts');
};
const canPostAnnouncements = (profile) => {
  const effective = profile?.effectivePermissions;
  return effective !== undefined
    ? effective.includes('manage:announcements')
    : hasPermission(profile?.role, 'manage:announcements');
};

const AUDIENCE_LABELS = {
  all:        'Everyone',
  own:        'WA! Staff',
  kvm:        'KVM',
  sree:       'Sree Ram',
  habibur:    'Habibur',
  alamin:     'Alamin',
  management: 'Management',
};

const AUDIENCE_OPTIONS = [
  { value: 'all',        label: 'Everyone' },
  { value: 'management', label: 'Management only' },
  { value: 'own',        label: 'WA! Direct Staff' },
  { value: 'kvm',        label: 'KVM' },
  { value: 'sree',       label: 'Sree Ram' },
  { value: 'habibur',    label: 'Habibur' },
  { value: 'alamin',     label: 'Alamin (Seabiz)' },
];

const SEV_CFG = {
  critical: { label: 'Critical', cls: 'sevCritical' },
  warning:  { label: 'Warning',  cls: 'sevWarning'  },
  info:     { label: 'Info',     cls: 'sevInfo'      },
};

function userSees(ann, userProfile) {
  const a = ann.audience ?? 'all';
  if (a === 'all') return true;
  if (a === 'management') return canViewManagement(userProfile);
  return a === userProfile.team || a === userProfile.role;
}

function getTargeted(ann, allUsers) {
  const a = ann.audience ?? 'all';
  return allUsers.filter(u => {
    if (u.status !== 'active') return false;
    if (a === 'all') return true;
    if (a === 'management') return canViewManagement(u);
    return u.team === a;
  });
}

// ── Ack tracking modal ──────────────────────────────────────────────────────
function AckModal({ ann, allUsers, currentUser, onClose, onMarkRead }) {
  const readBy   = ann.readBy ?? [];
  const isRead   = readBy.includes(currentUser.userId);
  const canTrack = canViewManagement(currentUser);
  const sev      = SEV_CFG[ann.severity ?? 'info'] ?? SEV_CFG.info;

  const targeted = canTrack ? getTargeted(ann, allUsers) : [];
  const acked    = canTrack ? targeted.filter(u =>  readBy.includes(u.userId)) : [];
  const pending  = canTrack ? targeted.filter(u => !readBy.includes(u.userId)) : [];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <span className={styles.modalTitle}>
            {canTrack ? 'Acknowledgement Tracker' : 'Bulletin'}
          </span>
          <button className={styles.modalClose} onClick={onClose}>
            <XMarkIcon width={18} />
          </button>
        </div>

        <div className={styles.modalBody}>
          <span className={[styles.sevBadge, styles[sev.cls]].join(' ')}>{sev.label}</span>
          <p className={styles.modalMsg}>{ann.message}</p>
          <div className={styles.modalMeta}>
            {ann.isSystemNotification ? '⚙ System' : ann.createdByName}
            {' · '}{AUDIENCE_LABELS[ann.audience ?? 'all'] ?? ann.audience}
            {' · '}{formatDateTime(ann.createdAt)}
          </div>
        </div>

        {canTrack ? (
          <div className={styles.ackCols}>
            <div className={styles.ackCol}>
              <div className={[styles.ackColHead, styles.headAcked].join(' ')}>
                <CheckCircleIcon width={14} />
                Acknowledged ({acked.length})
              </div>
              {acked.length === 0
                ? <p className={styles.ackEmpty}>None yet</p>
                : acked.map(u => (
                    <div key={u.userId} className={styles.ackUser}>
                      <span className={styles.ackName}>{u.name}</span>
                      <span className={styles.ackId}>{u.userId}</span>
                    </div>
                  ))
              }
            </div>
            <div className={styles.ackCol}>
              <div className={[styles.ackColHead, styles.headPending].join(' ')}>
                <ClockIcon width={14} />
                Pending ({pending.length})
              </div>
              {pending.length === 0
                ? <p className={styles.ackEmpty}>All acknowledged!</p>
                : pending.map(u => (
                    <div key={u.userId} className={styles.ackUser}>
                      <span className={styles.ackName}>{u.name}</span>
                      <span className={styles.ackId}>{u.userId}</span>
                    </div>
                  ))
              }
            </div>
          </div>
        ) : (
          <div className={styles.modalFooter}>
            {isRead
              ? <span className={styles.readConfirm}><CheckCircleIcon width={15} /> Acknowledged</span>
              : <button className={styles.ackBtn} onClick={() => { onMarkRead(ann); onClose(); }}>
                  <CheckCircleIcon width={15} /> Mark as Acknowledged
                </button>
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inline composer ─────────────────────────────────────────────────────────
function Composer({ onClose }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [message,  setMessage]  = useState('');
  const [severity, setSeverity] = useState('info');
  const [audience, setAudience] = useState('all');
  const [saving,   setSaving]   = useState(false);

  const post = async () => {
    if (!message.trim()) return;
    setSaving(true);
    try {
      await addDoc(collection(db, 'announcements'), {
        message: message.trim(), severity, audience,
        createdBy: userProfile.userId, createdByName: userProfile.name,
        createdAt: Timestamp.now(), readBy: [],
      });
      toast.success('Bulletin sent');
      onClose();
    } catch {
      toast.error('Failed to send');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.composerCard}>
      <div className={styles.composerHead}>
        <span className={styles.composerTitle}>New Bulletin</span>
        <button className={styles.composerClose} onClick={onClose}>
          <XMarkIcon width={16} />
        </button>
      </div>
      <textarea
        className={styles.composerInput} rows={3} autoFocus
        placeholder="Safety notice, policy update, site announcement…"
        value={message} onChange={e => setMessage(e.target.value)}
      />
      <div className={styles.composerRow}>
        <select className={styles.composerSelect} value={severity} onChange={e => setSeverity(e.target.value)}>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <select className={styles.composerSelect} value={audience} onChange={e => setAudience(e.target.value)}>
          {AUDIENCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
      <div className={styles.composerActions}>
        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        <button className={styles.sendBtn} onClick={post} disabled={saving || !message.trim()}>
          {saving ? 'Sending…' : 'Send Bulletin'}
        </button>
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────
export default function Announcements() {
  const { userProfile } = useAuth();
  const canPost    = canPostAnnouncements(userProfile);
  const canTrack   = canViewManagement(userProfile);

  const [announcements, setAnnouncements] = useState([]);
  const [allUsers,      setAllUsers]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [composing,     setComposing]     = useState(false);
  const [selected,      setSelected]      = useState(null);
  const [filter,        setFilter]        = useState('all');

  // Load users for ack tracking (internal roles only)
  useEffect(() => {
    if (!canTrack) return;
    getDocs(collection(db, 'users'))
      .then(snap => setAllUsers(snap.docs.map(d => ({ userId: d.id, ...d.data() }))))
      .catch(() => {});
  }, [canTrack]);

  // Real-time subscription to announcements
  useEffect(() => {
    if (!userProfile) return;
    const q = query(collection(db, 'announcements'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAnnouncements(canTrack ? all : all.filter(a => userSees(a, userProfile)));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [userProfile, canTrack]);

  const markRead = useCallback(async (ann) => {
    if ((ann.readBy ?? []).includes(userProfile.userId)) return;
    try {
      await updateDoc(doc(db, 'announcements', ann.id), {
        readBy: arrayUnion(userProfile.userId),
      });
    } catch { /* non-fatal */ }
  }, [userProfile]);

  const handleRowClick = (ann) => {
    if (!canTrack && !ann.readBy?.includes(userProfile.userId)) markRead(ann);
    setSelected(ann);
  };

  // Always pull fresh version from state (real-time snapshot keeps it updated)
  const selectedAnn = selected
    ? (announcements.find(a => a.id === selected.id) ?? selected)
    : null;

  const visible = filter === 'unread'
    ? announcements.filter(a => !(a.readBy ?? []).includes(userProfile?.userId))
    : announcements;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Announcements</h1>
          <p className={styles.subtitle}>Company bulletins and safety notices</p>
        </div>
        {canPost && !composing && (
          <button className={styles.newBtn} onClick={() => setComposing(true)}>
            <PlusIcon width={15} /> New Bulletin
          </button>
        )}
      </div>

      {composing && <Composer onClose={() => setComposing(false)} />}

      <div className={styles.toolbar}>
        <div className={styles.filterRow}>
          {['all', 'unread'].map(f => (
            <button key={f}
              className={[styles.filterBtn, filter === f ? styles.filterActive : ''].join(' ')}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : 'Unread'}
            </button>
          ))}
        </div>
        <span className={styles.countLabel}>
          {visible.length} bulletin{visible.length !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className={styles.loading}><div className={styles.spinner} /></div>
      ) : visible.length === 0 ? (
        <div className={styles.empty}>
          <MegaphoneIcon width={36} />
          <p>{filter === 'unread' ? 'No unread bulletins.' : 'No bulletins yet.'}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {visible.map(ann => {
            const sev      = SEV_CFG[ann.severity ?? 'info'] ?? SEV_CFG.info;
            const readBy   = ann.readBy ?? [];
            const isRead   = readBy.includes(userProfile?.userId);
            const targeted = canTrack ? getTargeted(ann, allUsers) : [];
            const ackCount = canTrack ? targeted.filter(u => readBy.includes(u.userId)).length : 0;
            const total    = targeted.length;
            const allAcked = canTrack && total > 0 && ackCount === total;

            return (
              <button key={ann.id}
                className={[styles.row, isRead ? styles.rowRead : ''].join(' ')}
                onClick={() => handleRowClick(ann)}>
                <div className={styles.rowLeft}>
                  <span className={[styles.sevDot, styles[sev.cls]].join(' ')} />
                  <div className={styles.rowBody}>
                    <p className={styles.rowMsg}>{ann.message}</p>
                    <div className={styles.rowMeta}>
                      <span className={[styles.sevBadge, styles[sev.cls]].join(' ')}>{sev.label}</span>
                      <span className={styles.audBadge}>
                        {AUDIENCE_LABELS[ann.audience ?? 'all'] ?? ann.audience}
                      </span>
                      <span className={styles.dot}>·</span>
                      <span className={styles.metaText}>
                        {ann.isSystemNotification ? '⚙ System' : ann.createdByName}
                      </span>
                      <span className={styles.dot}>·</span>
                      <span className={styles.metaText}>{formatTimeAgo(ann.createdAt)}</span>
                    </div>
                  </div>
                </div>
                <div className={styles.rowRight}>
                  {canTrack ? (
                    <span className={[styles.ackPill, allAcked ? styles.ackPillDone : ''].join(' ')}>
                      {allAcked
                        ? <><CheckCircleIcon width={12} /> All acked</>
                        : <><ClockIcon width={12} /> {ackCount}/{total}</>
                      }
                    </span>
                  ) : (
                    isRead
                      ? <CheckCircleIcon width={16} className={styles.readIcon} />
                      : <span className={styles.unreadDot} />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selectedAnn && (
        <AckModal
          ann={selectedAnn}
          allUsers={allUsers}
          currentUser={userProfile}
          onClose={() => setSelected(null)}
          onMarkRead={markRead}
        />
      )}
    </div>
  );
}
