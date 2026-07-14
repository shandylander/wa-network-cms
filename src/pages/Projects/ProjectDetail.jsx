import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, writeBatch, serverTimestamp, Timestamp } from 'firebase/firestore';
import {
  ArrowLeftIcon, CubeIcon, CheckCircleIcon,
  BuildingOfficeIcon, TableCellsIcon, ViewColumnsIcon,
  PlusIcon, TrashIcon, PencilIcon, ChevronLeftIcon, ChevronRightIcon, LockClosedIcon,
  MapPinIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useTeams, useWorkTypes } from '../../hooks/useAppConfig';
import { formatDate, formatTimeAgo, getOverallProgress, toDateInputSG, daySpan, directionsUrl, formatTime12 } from '../../utils/helpers';
import Badge from '../../components/UI/Badge';
import Button from '../../components/UI/Button';
import Card, { CardHeader } from '../../components/UI/Card';
import StatCard from '../../components/UI/StatCard';
import BlockTracker from './BlockTracker';
import BlockKanban from './BlockKanban';
import Reports from './Reports';
import Claims from './Claims';
import Materials from './Materials';
import SitePhotos from './SitePhotos';
import SnagList from './SnagList';
import Permits from './Permits';
import ToolboxMeeting from './ToolboxMeeting';
import IncidentReport from './IncidentReport';
import ProjectDocuments from './ProjectDocuments';
import ProjectEditModal from './ProjectEditModal';
import JobList from '../Jobs/JobList';
import styles from './ProjectDetail.module.css';

// Every subcollection a project can have data in — deleting a project
// cascades through all of these first so it doesn't leave orphaned data
// behind (confirmed exhaustive by grepping every `collection(db, 'projects',
// id, '<sub>')` call in this folder).
const PROJECT_SUBCOLLECTIONS = [
  'blocks', 'documents', 'permits', 'incidents', 'toolboxMeetings',
  'snags', 'sitePhotos', 'claims', 'deliveryOrders', 'materialOrders', 'notes',
];

async function deleteProjectCascade(projectId) {
  const refs = [];
  for (const sub of PROJECT_SUBCOLLECTIONS) {
    const snap = await getDocs(collection(db, 'projects', projectId, sub));
    snap.docs.forEach(d => refs.push(d.ref));
  }
  refs.push(doc(db, 'projects', projectId));

  // Firestore batch limit is 500 ops — chunk conservatively below that.
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach(ref => batch.delete(ref));
    await batch.commit();
  }
}

const STATUS_COLOR = { active: 'green', upcoming: 'amber', completed: 'default' };
const TAB_LABELS   = {
  report: 'WhatsApp Report', claims: 'Claims & Payments', materials: 'Materials / DO',
  photos: 'Site Photos', snags: 'Snag List', permits: 'Permits (PTW)',
  toolbox: 'Toolbox Meetings', incidents: 'Incidents', serviceReports: 'Service Jobs',
};

const getTabsForType = (projectType) => {
  const isPcs   = projectType === 'pcs';
  const isBlock = isPcs || projectType === 'cctv';
  return [
    'overview',
    ...(isBlock ? ['blocks', 'report'] : []),
    ...(isPcs   ? ['claims', 'materials'] : []),
    'photos',
    'snags',
    ...(isBlock ? ['permits', 'toolbox', 'incidents'] : []),
    'documents',
    'serviceReports',
  ];
};

function MilestoneSection({ project, setProject, userProfile }) {
  const { toast }  = useToast();
  const { can }    = usePermissions();
  const [input,    setInput]   = useState('');
  const [saving,   setSaving]  = useState(false);
  const canEdit    = can('manage:blocks');
  const milestones = project.milestones ?? [];
  const done       = milestones.filter(m => m.done).length;

  const save = async (updated) => {
    try {
      await updateDoc(doc(db, 'projects', project.id), { milestones: updated });
      setProject(p => ({ ...p, milestones: updated }));
    } catch {
      toast.error('Failed to update milestones');
    }
  };

  const add = async () => {
    if (!input.trim()) return;
    setSaving(true);
    const updated = [...milestones, { id: Date.now().toString(), label: input.trim(), done: false }];
    await save(updated);
    setInput('');
    setSaving(false);
  };

  const toggle = (ms) => {
    const updated = milestones.map(m =>
      m.id === ms.id
        ? { ...m, done: !m.done, doneAt: !m.done ? new Date().toISOString() : null, doneBy: !m.done ? userProfile.userId : null }
        : m
    );
    save(updated);
  };

  const remove = (id) => save(milestones.filter(m => m.id !== id));

  return (
    <Card>
      <CardHeader
        title="Milestones"
        subtitle={milestones.length ? `${done} / ${milestones.length} complete` : 'No milestones yet'}
      />
      <div className={styles.milestoneList}>
        {milestones.map(m => (
          <div key={m.id} className={[styles.msRow, m.done ? styles.msDone : ''].join(' ')}>
            <input
              type="checkbox"
              checked={m.done}
              onChange={() => toggle(m)}
              className={styles.msCheck}
            />
            <span className={styles.msLabel}>{m.label}</span>
            {canEdit && (
              <button className={styles.msRemove} onClick={() => remove(m.id)}>
                <TrashIcon width={13} />
              </button>
            )}
          </div>
        ))}
        {milestones.length === 0 && (
          <p className={styles.msEmpty}>No milestones. Add one below.</p>
        )}
      </div>
      {canEdit && (
        <div className={styles.msAdd}>
          <input
            className={styles.msInput}
            placeholder="Add a milestone…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
          />
          <button className={styles.msAddBtn} onClick={add} disabled={saving || !input.trim()}>
            <PlusIcon width={14} /> Add
          </button>
        </div>
      )}
    </Card>
  );
}

// A timestamped, append-only discussion/change log — "who said/changed what,
// when," separate from Milestones (structured checklist) and Description
// (static scope-of-work). Deliberately no editing once posted: firestore.rules
// denies update entirely, and only owner/manager can delete (moderation, not
// general editing) — keeps the log trustworthy as a running record.
function NotesSection({ project, userProfile }) {
  const { toast } = useToast();
  const { can }   = usePermissions();
  const canDelete = can('manage:blocks');
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [input,   setInput]   = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'projects', project.id, 'notes'), orderBy('createdAt', 'desc')));
        if (!cancelled) setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {
        if (!cancelled) toast.error('Failed to load notes');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const post = async () => {
    if (!input.trim()) return;
    setPosting(true);
    try {
      const data = { text: input.trim(), authorId: userProfile.userId, authorName: userProfile.name, createdAt: serverTimestamp() };
      const ref = await addDoc(collection(db, 'projects', project.id, 'notes'), data);
      setNotes(n => [{ id: ref.id, ...data, createdAt: Timestamp.now() }, ...n]);
      setInput('');
    } catch {
      toast.error('Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id) => {
    try {
      await deleteDoc(doc(db, 'projects', project.id, 'notes', id));
      setNotes(n => n.filter(x => x.id !== id));
    } catch {
      toast.error('Failed to delete note');
    }
  };

  return (
    <Card>
      <CardHeader title="Notes" subtitle="Timestamped updates and discussion — visible to everyone on this project" />
      <div className={styles.noteAdd}>
        <textarea
          className={styles.noteInput}
          rows={2}
          placeholder="Post an update…"
          value={input}
          onChange={e => setInput(e.target.value)}
        />
        <button className={styles.noteAddBtn} onClick={post} disabled={posting || !input.trim()}>
          <PlusIcon width={14} /> Post
        </button>
      </div>
      <div className={styles.noteList}>
        {loading && <p className={styles.msEmpty}>Loading…</p>}
        {!loading && notes.length === 0 && <p className={styles.msEmpty}>No notes yet. Post the first update.</p>}
        {notes.map(n => (
          <div key={n.id} className={styles.noteRow}>
            <div className={styles.noteMeta}>
              <span className={styles.noteAuthor}>{n.authorName}</span>
              <span className={styles.noteTime}>{formatTimeAgo(n.createdAt)}</span>
              {canDelete && (
                <button className={styles.noteRemove} onClick={() => remove(n.id)} title="Delete note">
                  <TrashIcon width={12} />
                </button>
              )}
            </div>
            <p className={styles.noteText}>{n.text}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Controls project.assignedTeams — the field firestore.rules checks to decide
// whether a sub-con can see this project at all. Owner/manager only: the
// list of who else is on a project isn't something other sub-cons need to see.
function AssignedTeamsSection({ project, setProject }) {
  const { toast } = useToast();
  const { can }   = usePermissions();
  const { teamOptions, teams: TEAMS } = useTeams();
  const canEdit   = can('manage:blocks');
  const [editing,  setEditing]  = useState(false);
  const [selected, setSelected] = useState([]);
  const [saving,   setSaving]   = useState(false);

  if (!canEdit) return null;

  const assigned = project.assignedTeams ?? [];

  const startEdit = () => { setSelected(assigned); setEditing(true); };
  const toggleTeam = (t) => setSelected(s => s.includes(t) ? s.filter(x => x !== t) : [...s, t]);

  const save = async () => {
    setSaving(true);
    try {
      await updateDoc(doc(db, 'projects', project.id), { assignedTeams: selected });
      setProject(p => ({ ...p, assignedTeams: selected }));
      setEditing(false);
      toast.success('Assigned teams saved');
    } catch {
      toast.error('Failed to save assigned teams');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Assigned Teams"
        subtitle="Sub-cons only see this project if their team is checked here"
        action={canEdit && !editing && (
          <button className={styles.editDatesBtn} onClick={startEdit}>
            <PencilIcon width={13} /> Edit
          </button>
        )}
      />
      {editing ? (
        <>
          <div className={styles.teamCheckGrid}>
            {teamOptions.map(t => (
              <label key={t.key} className={styles.teamCheckOption}>
                <input type="checkbox" checked={selected.includes(t.key)} onChange={() => toggleTeam(t.key)} />
                {t.label}
              </label>
            ))}
          </div>
          <div className={styles.dateActions}>
            <button className={styles.cancelDatesBtn} onClick={() => setEditing(false)}>Cancel</button>
            <button className={styles.saveDatesBtn} onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </>
      ) : assigned.length === 0 ? (
        <p className={styles.msEmpty}>No teams assigned — sub-cons won't see this project at all.</p>
      ) : (
        <div className={styles.teamChipRow}>
          {assigned.map(t => <span key={t} className={styles.teamAssignedChip}>{TEAMS[t] ?? t}</span>)}
        </div>
      )}
    </Card>
  );
}

const toDateInput = toDateInputSG;

function TeamStartDatesSection({ project, setProject, blocks, userProfile }) {
  const { toast } = useToast();
  const { can }   = usePermissions();
  const { teams: TEAMS } = useTeams();
  const canEdit   = can('manage:blocks');
  const [editing, setEditing] = useState(false);
  const [dates,   setDates]   = useState({});
  const [saving,  setSaving]  = useState(false);

  // Management sees every team's start date; field roles see only their own
  // team's date (staff belong to WA's 'own' team).
  const role       = userProfile?.role;
  const isInternal = ['owner', 'manager', 'supervisor'].includes(role);
  const ownTeam    = role === 'staff' ? 'own' : userProfile?.team;

  const allTeams    = [...new Set(blocks.map(b => b.team).filter(Boolean))].sort();
  const activeTeams = isInternal ? allTeams : allTeams.filter(t => t === ownTeam);
  const stored      = project.teamStartDates ?? {};

  const startEdit = () => {
    const d = {};
    activeTeams.forEach(t => { d[t] = toDateInput(stored[t]); });
    setDates(d);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const teamStartDates = {};
      activeTeams.forEach(t => { if (dates[t]) teamStartDates[t] = new Date(dates[t]); });
      await updateDoc(doc(db, 'projects', project.id), { teamStartDates });
      setProject(p => ({ ...p, teamStartDates }));
      setEditing(false);
      toast.success('Team start dates saved');
    } catch {
      toast.error('Failed to save start dates');
    } finally {
      setSaving(false);
    }
  };

  if (!activeTeams.length) return null;

  return (
    <Card>
      <CardHeader
        title="Team Start Dates"
        action={canEdit && !editing && (
          <button className={styles.editDatesBtn} onClick={startEdit}>
            <PencilIcon width={13} /> Edit
          </button>
        )}
      />
      <div className={styles.detailList}>
        {activeTeams.map(t => (
          <div key={t} className={styles.detailRow}>
            <span className={styles.detailKey}>{TEAMS[t] ?? t}</span>
            {editing ? (
              <input
                type="date"
                className={styles.dateInput}
                value={dates[t] ?? ''}
                onChange={e => setDates(d => ({ ...d, [t]: e.target.value }))}
              />
            ) : (
              <span className={styles.detailVal}>
                {stored[t] ? formatDate(stored[t]) : <span className={styles.noDate}>—</span>}
              </span>
            )}
          </div>
        ))}
      </div>
      {editing && (
        <div className={styles.dateActions}>
          <button className={styles.cancelDatesBtn} onClick={() => setEditing(false)}>Cancel</button>
          <button className={styles.saveDatesBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </Card>
  );
}

export default function ProjectDetail() {
  const { id }     = useParams();
  const navigate   = useNavigate();
  const { userProfile } = useAuth();
  const { can }    = usePermissions();
  const { getShape } = useWorkTypes();
  const [project,   setProject]  = useState(null);
  const [blocks,    setBlocks]   = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [tab,       setTab]      = useState('overview');
  const [blockView, setBlockView] = useState('table'); // 'table' | 'kanban'
  const [editingProject, setEditingProject] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const { toast } = useToast();
  const tabsRef = useRef(null);
  const [canScrollTabsLeft,  setCanScrollTabsLeft]  = useState(false);
  const [canScrollTabsRight, setCanScrollTabsRight] = useState(false);

  const updateTabScrollState = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollTabsLeft(el.scrollLeft > 4);
    setCanScrollTabsRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  const scrollTabs = (dir) => tabsRef.current?.scrollBy({ left: dir * 180, behavior: 'smooth' });

  const isSubconRole = ['subcon-admin', 'subcon'].includes(userProfile?.role);
  const myTeam       = userProfile?.team;

  useEffect(() => {
    const load = async () => {
      try {
        // Sub-cons may only read blocks assigned to their team (see
        // firestore.rules), so the blocks query must match the rule or the
        // whole load fails and the project page renders blank.
        const blocksRef = collection(db, 'projects', id, 'blocks');
        const [pSnap, bSnap] = await Promise.all([
          getDoc(doc(db, 'projects', id)),
          getDocs(isSubconRole ? query(blocksRef, where('team', '==', myTeam)) : blocksRef),
        ]);
        if (!pSnap.exists()) { navigate('/projects'); return; }
        setProject({ id: pSnap.id, ...pSnap.data() });
        setBlocks(bSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch (err) {
        console.error('Project load error', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, navigate, isSubconRole, myTeam]);

  // Re-check whenever the tab strip's own size changes (project load, tab
  // list changing with project type, or the window resizing) so the arrow
  // buttons stay in sync with whether there's actually more to scroll to.
  useEffect(() => {
    const el = tabsRef.current;
    if (!el) return;
    updateTabScrollState();
    el.addEventListener('scroll', updateTabScrollState);
    const ro = new ResizeObserver(updateTabScrollState);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateTabScrollState); ro.disconnect(); };
  }, [updateTabScrollState, loading, project]);

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;
  if (!project) return null;

  // Edit/delete mirror firestore.rules' /projects/{projectId} update/delete
  // conditions exactly (role-based, not a hasPerm(...) catalog key — see
  // the rule file's own comment on why that conversion was left undone).
  const canEditProject   = ['owner', 'manager', 'supervisor'].includes(userProfile?.role);
  // Owner can always edit the lock flag itself (even on a locked project —
  // otherwise a lock could never be undone); actual deletion is blocked
  // separately below whenever deleteProtected is set.
  const canDeleteProject = userProfile?.role === 'owner' && !project.deleteProtected;
  const isLocked = !!project.deleteProtected;

  const handleDeleteProject = async () => {
    if (isLocked || deleteConfirmText.trim() !== project.name) return;
    setDeletingProject(true);
    try {
      await deleteProjectCascade(project.id);
      toast.success('Project deleted');
      navigate('/projects');
    } catch {
      toast.error('Failed to delete project');
      setDeletingProject(false);
    }
  };

  // Money data (claim rates, payments) is restricted to owner/manager
  const canViewMoney = can('view:claims');
  // Materials/DO data is readable only by internal roles (see firestore.rules);
  // hide the tab from field/subcon roles so they don't hit a load error.
  const canViewMaterials = can('materials:view');
  // Incidents are internal/staff-only (see firestore.rules); hide the tab
  // from sub-con roles so they don't hit a load error.
  const workShape = getShape(project.projectType ?? 'pcs');
  const TABS    = getTabsForType(workShape)
    .filter(t => (t !== 'claims' || canViewMoney)
      && (t !== 'materials' || canViewMaterials)
      && (t !== 'incidents' || can('incidents:view'))
      && (t !== 'serviceReports' || can('manage:service-reports') || can('jobs:assign')));
  const isCctv  = ['pcs', 'cctv'].includes(workShape);
  const isPcs   = workShape === 'pcs'; // gates the $/block stage-rate display
  const total   = blocks.length;
  const stage2  = blocks.filter(b => b.fix1===100 && b.fix2===100 && b.fix3===100 && b.fix4===100).length;
  const stage1  = blocks.filter(b => b.fix1===100 && b.fix2===100 && b.fix3 < 100).length;
  const noStart = blocks.filter(b => getOverallProgress(b) === 0).length;

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={() => navigate('/projects')}>
        <ArrowLeftIcon width={14} /> Projects
      </button>

      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div className={styles.headerMeta}>
            <Badge color={STATUS_COLOR[project.status] ?? 'default'}>{project.status}</Badge>
            {project.type && <span className={styles.type}>{project.type}</span>}
            {isLocked && (
              <span className={styles.lockedBadge} title="Protected from deletion — toggle off in Edit Project to change">
                <LockClosedIcon width={11} /> Protected
              </span>
            )}
          </div>
          {(canEditProject || userProfile?.role === 'owner') && (
            <div className={styles.headerActions}>
              {canEditProject && (
                <button className={styles.editDatesBtn} onClick={() => setEditingProject(true)}>
                  <PencilIcon width={13} /> Edit Project
                </button>
              )}
              {userProfile?.role === 'owner' && (
                canDeleteProject ? (
                  <button className={styles.deleteProjectBtn} onClick={() => setShowDeleteConfirm(true)}>
                    <TrashIcon width={13} /> Delete
                  </button>
                ) : (
                  <span className={styles.deleteProjectBtnLocked} title="Protected from deletion — toggle off in Edit Project to delete">
                    <LockClosedIcon width={13} /> Delete
                  </span>
                )
              )}
            </div>
          )}
        </div>
        <h1 className={styles.name}>{project.name}</h1>
        <p className={styles.client}>
          {project.client}
          {project.location && (
            <> · <a href={directionsUrl(project.location)} target="_blank" rel="noreferrer" className={styles.locationLink} title="Open directions">
              <MapPinIcon width={12} className={styles.locationIcon} /> {project.location}
            </a></>
          )}
        </p>
      </div>

      {editingProject && (
        <ProjectEditModal
          project={project}
          canViewMoney={canViewMoney}
          canLock={userProfile?.role === 'owner'}
          onClose={() => setEditingProject(false)}
          onSaved={(updated) => { setProject(updated); setEditingProject(false); }}
        />
      )}

      {showDeleteConfirm && (
        <div className={styles.deleteOverlay} onClick={() => !deletingProject && setShowDeleteConfirm(false)}>
          <div className={styles.deleteBox} onClick={e => e.stopPropagation()}>
            <h2 className={styles.deleteTitle}>Delete "{project.name}"?</h2>
            <p className={styles.deleteText}>
              This permanently deletes the project and everything under it — blocks, documents, claims,
              permits, incidents, toolbox meetings, snags, site photos, and material/delivery orders.
              This cannot be undone.
            </p>
            <p className={styles.deleteText}>Type the project name to confirm:</p>
            <input
              className={styles.deleteInput}
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder={project.name}
              autoFocus
            />
            <div className={styles.deleteActions}>
              <Button variant="secondary" onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText(''); }} disabled={deletingProject}>
                Cancel
              </Button>
              <Button variant="danger" onClick={handleDeleteProject} loading={deletingProject} disabled={deleteConfirmText.trim() !== project.name}>
                Delete Permanently
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.tabsWrap}>
        {canScrollTabsLeft && (
          <button className={[styles.tabScrollBtn, styles.tabScrollLeft].join(' ')}
            onClick={() => scrollTabs(-1)} aria-label="Scroll tabs left">
            <ChevronLeftIcon width={15} />
          </button>
        )}
        <div className={styles.tabs} ref={tabsRef}>
          {TABS.map(t => (
            <button
              key={t}
              className={[styles.tab, tab === t ? styles.tabActive : ''].join(' ')}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t] ?? (t.charAt(0).toUpperCase() + t.slice(1))}
            </button>
          ))}
        </div>
        {canScrollTabsRight && (
          <button className={[styles.tabScrollBtn, styles.tabScrollRight].join(' ')}
            onClick={() => scrollTabs(1)} aria-label="Scroll tabs right">
            <ChevronRightIcon width={15} />
          </button>
        )}
      </div>

      {tab === 'overview' && (
        <div className={styles.overview}>
          {isCctv && (
            <div className={styles.statsGrid}>
              <StatCard label="Total Blocks" value={total}   icon={CubeIcon}           color="blue"   />
              <StatCard label="Stage 2 Done" value={stage2}  icon={CheckCircleIcon}    color="green"  sub="All fixes complete" />
              <StatCard label="Stage 1 Done" value={stage1}  icon={CheckCircleIcon}    color="amber"  sub="Fix 1 & 2 complete" />
              <StatCard label="Not Started"  value={noStart} icon={BuildingOfficeIcon}  color="purple" />
            </div>
          )}
          <Card>
            <CardHeader title="Project Details" />
            {project.description && <p className={styles.description}>{project.description}</p>}
            <div className={styles.detailList}>
              <div className={styles.detailRow}><span className={styles.detailKey}>Client</span><span className={styles.detailVal}>{project.client}</span></div>
              {project.type && <div className={styles.detailRow}><span className={styles.detailKey}>Type</span><span className={styles.detailVal}>{project.type}</span></div>}
              {project.location && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Location</span>
                  <a href={directionsUrl(project.location)} target="_blank" rel="noreferrer" className={styles.locationLink} title="Open directions">
                    <MapPinIcon width={12} className={styles.locationIcon} /> {project.location}
                  </a>
                </div>
              )}
              {project.startDate && (
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Start Date</span>
                  <span className={styles.detailVal}>{formatDate(project.startDate)}{project.startTime ? ` at ${formatTime12(project.startTime)}` : ''}</span>
                </div>
              )}
              {daySpan(project.startDate, project.endDate) > 1 && <>
                <div className={styles.detailRow}><span className={styles.detailKey}>End Date</span><span className={styles.detailVal}>{formatDate(project.endDate)}</span></div>
                <div className={styles.detailRow}>
                  <span className={styles.detailKey}>Duration</span>
                  <span className={styles.detailVal}><span className={styles.multiDayBadge}>{daySpan(project.startDate, project.endDate)} days</span></span>
                </div>
              </>}
              {canViewMoney && isPcs && project.rates?.s1 > 0 && <>
                <div className={styles.detailRow}><span className={styles.detailKey}>Stage 1 Rate</span><span className={styles.detailVal}>${project.rates.s1?.toLocaleString()}/block</span></div>
                <div className={styles.detailRow}><span className={styles.detailKey}>Stage 2 Rate</span><span className={styles.detailVal}>${project.rates.s2?.toLocaleString()}/block</span></div>
                <div className={styles.detailRow}><span className={styles.detailKey}>Stage 3 Rate</span><span className={styles.detailVal}>${project.rates.s3?.toLocaleString()}/block</span></div>
              </>}
            </div>
          </Card>
          <AssignedTeamsSection project={project} setProject={setProject} />
          <TeamStartDatesSection project={project} setProject={setProject} blocks={blocks} userProfile={userProfile} />
          <MilestoneSection project={project} setProject={setProject} userProfile={userProfile} />
          <NotesSection project={project} userProfile={userProfile} />
        </div>
      )}

      {tab === 'blocks' && (
        <div>
          <div className={styles.viewToggle}>
            <button
              className={[styles.viewBtn, blockView === 'table' ? styles.viewBtnActive : ''].join(' ')}
              onClick={() => setBlockView('table')}
            >
              <TableCellsIcon width={15} /> Table
            </button>
            <button
              className={[styles.viewBtn, blockView === 'kanban' ? styles.viewBtnActive : ''].join(' ')}
              onClick={() => setBlockView('kanban')}
            >
              <ViewColumnsIcon width={15} /> Kanban
            </button>
          </div>
          {blockView === 'table' ? (
            <BlockTracker
              projectId={id} blocks={blocks} setBlocks={setBlocks}
              userRole={userProfile?.role} userTeam={userProfile?.team}
            />
          ) : (
            <BlockKanban
              projectId={id} blocks={blocks} setBlocks={setBlocks}
              userRole={userProfile?.role} userTeam={userProfile?.team}
            />
          )}
        </div>
      )}

      {tab === 'report' && (
        <Reports
          blocks={blocks} setBlocks={setBlocks}
          project={project} setProject={setProject}
          userRole={userProfile?.role} userTeam={userProfile?.team}
          onGoToBlocks={() => setTab('blocks')}
        />
      )}

      {tab === 'claims' && canViewMoney && (
        <Claims project={project} setProject={setProject} blocks={blocks} userRole={userProfile?.role} />
      )}

      {tab === 'materials' && (
        <Materials project={project} userRole={userProfile?.role} />
      )}

      {tab === 'photos' && <SitePhotos project={project} />}

      {tab === 'snags'  && <SnagList  project={project} />}

      {tab === 'permits'   && <Permits project={project} />}
      {tab === 'toolbox'   && <ToolboxMeeting project={project} />}
      {tab === 'incidents' && <IncidentReport project={project} />}

      {tab === 'documents' && <ProjectDocuments project={project} />}

      {tab === 'serviceReports' && project.customerId && (
        <JobList
          customerId={project.customerId}
          customerName={project.client}
          projectId={project.id}
          projectName={project.name}
        />
      )}
    </div>
  );
}
