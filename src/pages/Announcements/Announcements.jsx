import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection, query, orderBy, onSnapshot, doc, updateDoc, arrayUnion,
  addDoc, Timestamp, getDocs,
} from 'firebase/firestore';
import {
  MegaphoneIcon, CheckCircleIcon, ClockIcon, PlusIcon, XMarkIcon,
  PaperClipIcon, DocumentIcon, Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useSeverities } from '../../hooks/useAppConfig';
import { uploadToDropbox } from '../../utils/dropboxUpload';
import { formatDateTime, formatTimeAgo } from '../../utils/helpers';
import { hasPermission } from '../../utils/permissions';
import SeverityManager from './SeverityManager';
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

const MAX_ATTACHMENTS = 5;

// Older bulletins stored audience as a single string — normalize to an
// array everywhere so multi-select bulletins and legacy ones read the same.
const audienceList = (ann) => {
  const a = ann.audience ?? 'all';
  return Array.isArray(a) ? a : [a];
};

function userSees(ann, userProfile) {
  const list = audienceList(ann);
  if (list.includes('all')) return true;
  if (list.includes('management') && canViewManagement(userProfile)) return true;
  return list.includes(userProfile.team) || list.includes(userProfile.role);
}

function getTargeted(ann, allUsers) {
  const list = audienceList(ann);
  return allUsers.filter(u => {
    if (u.status !== 'active') return false;
    if (list.includes('all')) return true;
    if (list.includes('management') && canViewManagement(u)) return true;
    return list.includes(u.team);
  });
}

const sevBadgeStyle = (sev) => ({
  background: `${sev.color}1a`, color: sev.color, border: `1px solid ${sev.color}40`,
});

function fmtSize(bytes) {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentList({ attachments }) {
  if (!attachments?.length) return null;
  return (
    <div className={styles.attachList}>
      {attachments.map((a, i) => (
        <a key={i} href={a.url} target="_blank" rel="noreferrer" className={styles.attachChip}>
          <DocumentIcon width={14} />
          <span className={styles.attachName}>{a.fileName}</span>
          {a.fileSize ? <span className={styles.attachSize}>{fmtSize(a.fileSize)}</span> : null}
        </a>
      ))}
    </div>
  );
}

// ── Ack tracking modal ──────────────────────────────────────────────────────
function AckModal({ ann, allUsers, currentUser, getSeverity, onClose, onMarkRead }) {
  const readBy   = ann.readBy ?? [];
  const isRead   = readBy.includes(currentUser.userId);
  const canTrack = canViewManagement(currentUser);
  const sev      = getSeverity(ann.severity ?? 'info');

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
          <span className={styles.sevBadge} style={sevBadgeStyle(sev)}>{sev.label}</span>
          <p className={styles.modalMsg}>{ann.message}</p>
          <AttachmentList attachments={ann.attachments} />
          <div className={styles.modalMeta}>
            {ann.isSystemNotification ? '⚙ System' : ann.createdByName}
            {' · '}{audienceList(ann).map(a => AUDIENCE_LABELS[a] ?? a).join(', ')}
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
function Composer({ severities, onManageSeverities, onClose }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const [message,   setMessage]   = useState('');
  const [severity,  setSeverity]  = useState(severities[0]?.key ?? 'info');
  const [audiences, setAudiences] = useState(['all']);
  const [files,     setFiles]     = useState([]);
  const [saving,    setSaving]    = useState(false);
  const [progress,  setProgress]  = useState('');
  const fileRef = useRef();

  const toggleAudience = (value) => {
    setAudiences(prev => {
      if (value === 'all') return prev.includes('all') ? [] : ['all'];
      const withoutAll = prev.filter(a => a !== 'all');
      return withoutAll.includes(value)
        ? withoutAll.filter(a => a !== value)
        : [...withoutAll, value];
    });
  };

  const onFilesChosen = (e) => {
    const picked = Array.from(e.target.files ?? []);
    setFiles(prev => [...prev, ...picked].slice(0, MAX_ATTACHMENTS));
    if (fileRef.current) fileRef.current.value = '';
  };
  const removeFile = (i) => setFiles(prev => prev.filter((_, idx) => idx !== i));

  const post = async () => {
    if (!message.trim() || audiences.length === 0) return;
    setSaving(true);
    try {
      const attachments = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`Uploading ${i + 1}/${files.length}…`);
        const file = files[i];
        const url = await uploadToDropbox(file, '/WA! Network Asia CMS/Announcements');
        attachments.push({ url, fileName: file.name, fileSize: file.size });
      }
      setProgress('');
      await addDoc(collection(db, 'announcements'), {
        message: message.trim(), severity, audience: audiences,
        createdBy: userProfile.userId, createdByName: userProfile.name,
        createdAt: Timestamp.now(), readBy: [],
        ...(attachments.length ? { attachments } : {}),
      });
      toast.success('Bulletin sent');
      onClose();
    } catch {
      toast.error('Failed to send');
    } finally {
      setSaving(false);
      setProgress('');
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

      {files.length > 0 && (
        <div className={styles.attachList}>
          {files.map((f, i) => (
            <span key={i} className={styles.attachChip}>
              <DocumentIcon width={14} />
              <span className={styles.attachName}>{f.name}</span>
              <button className={styles.attachRemove} onClick={() => removeFile(i)}>
                <XMarkIcon width={12} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className={styles.composerRow}>
        <select className={styles.composerSelect} value={severity} onChange={e => setSeverity(e.target.value)}>
          {severities.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button
          type="button"
          className={styles.manageSevBtn}
          onClick={onManageSeverities}
          title="Manage categories"
        >
          <Cog6ToothIcon width={15} />
        </button>
        <button
          type="button"
          className={styles.attachBtn}
          onClick={() => fileRef.current?.click()}
          disabled={files.length >= MAX_ATTACHMENTS}
        >
          <PaperClipIcon width={14} /> Attach
        </button>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf" hidden onChange={onFilesChosen} />
      </div>

      <div className={styles.audienceGrid}>
        {AUDIENCE_OPTIONS.map(o => (
          <label key={o.value} className={styles.audienceOption}>
            <input
              type="checkbox"
              checked={audiences.includes(o.value)}
              onChange={() => toggleAudience(o.value)}
              disabled={o.value !== 'all' && audiences.includes('all')}
            />
            {o.label}
          </label>
        ))}
      </div>

      <div className={styles.composerActions}>
        {progress && <span className={styles.progressText}>{progress}</span>}
        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
        <button
          className={styles.sendBtn}
          onClick={post}
          disabled={saving || !message.trim() || audiences.length === 0}
        >
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
  const { severities, saveSeverities, getSeverity } = useSeverities();

  const [announcements, setAnnouncements] = useState([]);
  const [allUsers,      setAllUsers]      = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [composing,     setComposing]     = useState(false);
  const [managingSev,   setManagingSev]   = useState(false);
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

      {composing && (
        <Composer
          severities={severities}
          onManageSeverities={() => setManagingSev(true)}
          onClose={() => setComposing(false)}
        />
      )}

      {managingSev && (
        <SeverityManager
          severities={severities}
          saveSeverities={saveSeverities}
          onClose={() => setManagingSev(false)}
        />
      )}

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
            const sev      = getSeverity(ann.severity ?? 'info');
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
                  <span className={styles.sevDot} style={{ background: sev.color }} />
                  <div className={styles.rowBody}>
                    <p className={styles.rowMsg}>{ann.message}</p>
                    {ann.attachments?.length > 0 && (
                      <span className={styles.attachHint}>
                        <PaperClipIcon width={12} /> {ann.attachments.length}
                      </span>
                    )}
                    <div className={styles.rowMeta}>
                      <span className={styles.sevBadge} style={sevBadgeStyle(sev)}>{sev.label}</span>
                      {audienceList(ann).map(a => (
                        <span key={a} className={styles.audBadge}>{AUDIENCE_LABELS[a] ?? a}</span>
                      ))}
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
          getSeverity={getSeverity}
          onClose={() => setSelected(null)}
          onMarkRead={markRead}
        />
      )}
    </div>
  );
}
