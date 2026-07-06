import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, getDocs, updateDoc } from 'firebase/firestore';
import {
  ArrowLeftIcon, CubeIcon, CheckCircleIcon,
  BuildingOfficeIcon, TableCellsIcon, ViewColumnsIcon,
  PlusIcon, TrashIcon, PencilIcon,
} from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission, TEAMS } from '../../utils/permissions';
import { formatDate, getOverallProgress, toDateInputSG } from '../../utils/helpers';
import Badge from '../../components/UI/Badge';
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
import styles from './ProjectDetail.module.css';

const STATUS_COLOR = { active: 'green', upcoming: 'amber', completed: 'default' };
const TAB_LABELS   = {
  report: 'WhatsApp Report', claims: 'Claims & Payments', materials: 'Materials / DO',
  photos: 'Site Photos', snags: 'Snag List', permits: 'Permits (PTW)',
  toolbox: 'Toolbox Meetings', incidents: 'Incidents',
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
  ];
};

function MilestoneSection({ project, setProject, userProfile }) {
  const { toast }  = useToast();
  const [input,    setInput]   = useState('');
  const [saving,   setSaving]  = useState(false);
  const canEdit    = hasPermission(userProfile?.role, 'manage:blocks');
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

const toDateInput = toDateInputSG;

function TeamStartDatesSection({ project, setProject, blocks, userProfile }) {
  const { toast } = useToast();
  const canEdit   = hasPermission(userProfile?.role, 'manage:blocks');
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
  const [project,   setProject]  = useState(null);
  const [blocks,    setBlocks]   = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [tab,       setTab]      = useState('overview');
  const [blockView, setBlockView] = useState('table'); // 'table' | 'kanban'

  useEffect(() => {
    const load = async () => {
      try {
        const [pSnap, bSnap] = await Promise.all([
          getDoc(doc(db, 'projects', id)),
          getDocs(collection(db, 'projects', id, 'blocks')),
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
  }, [id, navigate]);

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;
  if (!project) return null;

  // Money data (claim rates, payments) is restricted to owner/manager
  const canViewMoney = hasPermission(userProfile?.role, 'view:claims');
  // Materials/DO data is readable only by internal roles (see firestore.rules);
  // hide the tab from field/subcon roles so they don't hit a load error.
  const isInternal   = ['owner', 'manager', 'supervisor'].includes(userProfile?.role);
  const TABS    = getTabsForType(project.projectType ?? 'pcs')
    .filter(t => (t !== 'claims' || canViewMoney) && (t !== 'materials' || isInternal));
  const isCctv  = ['pcs', 'cctv'].includes(project.projectType ?? 'pcs');
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
        <div className={styles.headerMeta}>
          <Badge color={STATUS_COLOR[project.status] ?? 'default'}>{project.status}</Badge>
          {project.type && <span className={styles.type}>{project.type}</span>}
        </div>
        <h1 className={styles.name}>{project.name}</h1>
        <p className={styles.client}>{project.client}{project.location ? ` · ${project.location}` : ''}</p>
      </div>

      <div className={styles.tabs}>
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
            <div className={styles.detailList}>
              {[
                ['Client',     project.client],
                ['Type',       project.type],
                ['Location',   project.location],
                ['Start Date', formatDate(project.startDate)],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k} className={styles.detailRow}>
                  <span className={styles.detailKey}>{k}</span>
                  <span className={styles.detailVal}>{v}</span>
                </div>
              ))}
              {canViewMoney && project.rates?.s1 > 0 && <>
                <div className={styles.detailRow}><span className={styles.detailKey}>Stage 1 Rate</span><span className={styles.detailVal}>${project.rates.s1?.toLocaleString()}/block</span></div>
                <div className={styles.detailRow}><span className={styles.detailKey}>Stage 2 Rate</span><span className={styles.detailVal}>${project.rates.s2?.toLocaleString()}/block</span></div>
                <div className={styles.detailRow}><span className={styles.detailKey}>Stage 3 Rate</span><span className={styles.detailVal}>${project.rates.s3?.toLocaleString()}/block</span></div>
              </>}
            </div>
          </Card>
          <TeamStartDatesSection project={project} setProject={setProject} blocks={blocks} userProfile={userProfile} />
          <MilestoneSection project={project} setProject={setProject} userProfile={userProfile} />
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
    </div>
  );
}
