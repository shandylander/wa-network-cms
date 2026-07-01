import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import {
  FolderOpenIcon, ClockIcon, CheckCircleIcon,
  UserGroupIcon, ChevronDownIcon, ChevronUpIcon,
  ClipboardDocumentIcon, Squares2X2Icon, TrophyIcon,
} from '@heroicons/react/24/outline';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { greet, formatDate, getOverallProgress } from '../utils/helpers';
import { TEAMS } from '../utils/permissions';
import { buildReport } from './Projects/Reports';
import Badge from '../components/UI/Badge';
import BlockHeatmap from '../components/UI/BlockHeatmap';
import styles from './Home.module.css';

const CERT_WARN_DAYS = 30;

function certsExpiringCount(workers) {
  const now = Date.now();
  let count = 0;
  workers.forEach(w => (w.certs ?? []).forEach(c => {
    if (!c.expiry) return;
    const days = Math.floor((new Date(c.expiry) - now) / 86400000);
    if (days <= CERT_WARN_DAYS) count += 1;
  }));
  return count;
}

const TYPE_LABEL  = { pcs: 'PCS', cctv: 'CCTV', maintenance: 'Maintenance', general: 'General' };
const TYPE_COLOR  = { pcs: 'red', cctv: 'blue', maintenance: 'amber', general: 'default' };
const STATUS_COLOR = { active: 'green', upcoming: 'amber', completed: 'default' };

function MiniBar({ pct, color = 'red' }) {
  return (
    <div className={styles.miniTrack}>
      <div className={styles.miniFill} style={{ width: `${pct}%`, background: `var(--${color})` }} />
    </div>
  );
}

function ProjectCard({ project, blocks }) {
  const navigate  = useNavigate();
  const pType     = project.projectType ?? 'pcs';
  const isCctv    = pType === 'pcs' || pType === 'cctv';
  const milestones = project.milestones ?? [];
  const msDone    = milestones.filter(m => m.done).length;
  const teams     = project.assignedTeams ?? [];

  // CCTV block stats
  const total  = blocks?.length ?? 0;
  const stage2 = blocks?.filter(b => b.fix1===100 && b.fix2===100 && b.fix3===100 && b.fix4===100).length ?? 0;
  const stage1 = blocks?.filter(b => b.fix1===100 && b.fix2===100).length ?? 0;
  const pctDone = total ? Math.round((stage2 / total) * 100) : 0;

  return (
    <div className={styles.projCard} onClick={() => navigate(`/projects/${project.id}`)}>
      <div className={styles.projCardTop}>
        <div className={styles.projCardBadges}>
          <Badge color={STATUS_COLOR[project.status] ?? 'default'}>{project.status}</Badge>
          <Badge color={TYPE_COLOR[pType] ?? 'default'}>{TYPE_LABEL[pType] ?? pType}</Badge>
        </div>
      </div>

      <h3 className={styles.projName}>{project.name}</h3>
      <p className={styles.projClient}>{project.client}</p>
      {project.location && <p className={styles.projMeta}>{project.location}</p>}

      {isCctv && total > 0 && (
        <div className={styles.projProgress}>
          <div className={styles.progressRow}>
            <span className={styles.progressLabel}>Stage 2 done</span>
            <span className={styles.progressVal}>{stage2}/{total}</span>
          </div>
          <MiniBar pct={pctDone} color="green" />
          <div className={styles.progressRow} style={{ marginTop: 6 }}>
            <span className={styles.progressLabel}>Stage 1 done</span>
            <span className={styles.progressVal}>{stage1}/{total}</span>
          </div>
          <MiniBar pct={total ? Math.round((stage1/total)*100) : 0} color="amber" />
        </div>
      )}

      {!isCctv && milestones.length > 0 && (
        <div className={styles.projMilestones}>
          {milestones.slice(0, 3).map(m => (
            <div key={m.id} className={[styles.msPill, m.done ? styles.msPillDone : ''].join(' ')}>
              <span className={styles.msCheck}>{m.done ? '✓' : '○'}</span>
              <span className={styles.msText}>{m.label}</span>
            </div>
          ))}
          {milestones.length > 3 && (
            <p className={styles.msMore}>+{milestones.length - 3} more milestone{milestones.length - 3 > 1 ? 's' : ''}</p>
          )}
          <p className={styles.msSummary}>{msDone}/{milestones.length} complete</p>
        </div>
      )}

      {!isCctv && milestones.length === 0 && (
        <p className={styles.noMilestones}>No milestones set — open project to add.</p>
      )}

      <div className={styles.projFooter}>
        <div className={styles.projTeams}>
          {teams.slice(0, 3).map(t => (
            <span key={t} className={styles.teamChip}>{TEAMS[t]?.split(' ')[0] ?? t}</span>
          ))}
          {teams.length > 3 && <span className={styles.teamChip}>+{teams.length - 3}</span>}
        </div>
        {project.startDate && (
          <span className={styles.projDate}>{formatDate(project.startDate)}</span>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ title, count, icon: Icon }) {
  return (
    <div className={styles.sectionHeader}>
      <Icon className={styles.sectionIcon} width={18} />
      <h2 className={styles.sectionTitle}>{title}</h2>
      {count !== undefined && <span className={styles.sectionCount}>{count}</span>}
    </div>
  );
}

export default function Home() {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();
  const [projects,        setProjects]        = useState([]);
  const [blocksByProject, setBlocksByProject] = useState({});
  const [workers,         setWorkers]         = useState([]);
  const [claimsOutstanding, setClaimsOutstanding] = useState(0);
  const [loading,         setLoading]         = useState(true);
  const [showCompleted,   setShowCompleted]   = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const [projSnap, workerSnap] = await Promise.all([
          getDocs(collection(db, 'projects')),
          getDocs(collection(db, 'workers')),
        ]);

        const all = projSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setProjects(all);
        setWorkers(workerSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Fetch blocks for active CCTV projects only
        const activeCctv = all.filter(
          p => p.status === 'active' && (!p.projectType || p.projectType === 'pcs' || p.projectType === 'cctv')
        );
        if (activeCctv.length > 0) {
          const fetches = activeCctv.map(p =>
            getDocs(collection(db, 'projects', p.id, 'blocks'))
              .then(s => [p.id, s.docs.map(d => ({ id: d.id, ...d.data() }))])
          );
          const results = await Promise.all(fetches);
          setBlocksByProject(Object.fromEntries(results));
        }

        // Claims outstanding across active PCS projects
        const activePcs = all.filter(p => p.status === 'active' && p.projectType === 'pcs');
        if (activePcs.length > 0) {
          const claimFetches = activePcs.map(p => getDocs(collection(db, 'projects', p.id, 'claims')).catch(() => null));
          const claimResults = await Promise.all(claimFetches);
          let outstanding = 0;
          claimResults.forEach(snap => {
            if (!snap) return;
            snap.docs.forEach(d => {
              const c = d.data();
              if (c.status !== 'paid') outstanding += c.netAmount ?? 0;
            });
          });
          setClaimsOutstanding(outstanding);
        }
      } catch (err) {
        console.error('Dashboard load error', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  const active    = projects.filter(p => p.status === 'active');
  const upcoming  = projects.filter(p => p.status === 'upcoming');
  const completed = projects.filter(p => p.status === 'completed');
  const activeTeams = [...new Set(active.flatMap(p => p.assignedTeams ?? []))];
  const canFinance = can('view:claims');

  // Primary heatmap project — first active CCTV/PCS project with blocks
  const heatmapProject = active.find(p => (blocksByProject[p.id]?.length ?? 0) > 0);

  // Team leaderboard — Stage 2 (fully done) blocks per team across all active projects
  const allActiveBlocks = active.flatMap(p => blocksByProject[p.id] ?? []);
  const teamLeaderboard = [...new Set(allActiveBlocks.map(b => b.team).filter(Boolean))]
    .map(team => ({
      team,
      done: allActiveBlocks.filter(b => b.team === team && b.fix1===100 && b.fix2===100 && b.fix3===100 && b.fix4===100).length,
      total: allActiveBlocks.filter(b => b.team === team).length,
    }))
    .sort((a, b) => b.done - a.done);
  const maxDone = Math.max(1, ...teamLeaderboard.map(t => t.done));

  return (
    <div className={styles.page}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <div>
          <h2 className={styles.greetText}>{greet()}, {userProfile?.name?.split(' ')[0]}</h2>
          <p className={styles.greetSub}>Here's your company overview</p>
        </div>
        <span className={styles.greetDate}>{new Intl.DateTimeFormat('en-SG', { dateStyle: 'long', timeZone: 'Asia/Singapore' }).format(new Date())}</span>
      </div>

      {/* Stats */}
      <div className={styles.statsRow}>
        {[
          { label: 'Active',    value: active.length,    color: 'green'  },
          { label: 'Upcoming',  value: upcoming.length,  color: 'amber'  },
          { label: 'Completed', value: completed.length, color: 'default'},
          { label: 'Workers',   value: workers.length,   color: 'blue'   },
          { label: 'Teams',     value: activeTeams.length, color: 'purple'},
          ...(canFinance ? [
            { label: 'Certs Expiring', value: certsExpiringCount(workers), color: 'amber' },
            { label: 'Claims Outstanding', value: `$${claimsOutstanding.toLocaleString('en-SG', { maximumFractionDigits: 0 })}`, color: 'red' },
          ] : []),
        ].map(s => (
          <div key={s.label} className={[styles.statPill, styles[`statPill_${s.color}`]].join(' ')}>
            <span className={styles.statVal}>{s.value}</span>
            <span className={styles.statLabel}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* Command Center */}
      {(heatmapProject || teamLeaderboard.length > 0) && (
        <section>
          <SectionHeader title="Command Center" icon={Squares2X2Icon} />
          <div className={styles.commandGrid}>
            {heatmapProject && (
              <div className={styles.heatmapCard}>
                <div className={styles.heatmapCardHead}>
                  <span>{heatmapProject.name}</span>
                  <span className={styles.heatmapCount}>{blocksByProject[heatmapProject.id]?.length ?? 0} blocks</span>
                </div>
                <BlockHeatmap blocks={blocksByProject[heatmapProject.id]} projectId={heatmapProject.id} />
              </div>
            )}
            {teamLeaderboard.length > 0 && (
              <div className={styles.leaderboardCard}>
                <div className={styles.heatmapCardHead}>
                  <TrophyIcon width={15} />
                  <span>Team Leaderboard — Blocks Completed</span>
                </div>
                <div className={styles.leaderRows}>
                  {teamLeaderboard.map((t, i) => (
                    <div key={t.team} className={styles.leaderRow}>
                      <span className={styles.leaderRank}>{i === 0 ? '🏆' : `#${i + 1}`}</span>
                      <span className={styles.leaderTeam}>{TEAMS[t.team]?.split(' ')[0] ?? t.team}</span>
                      <div className={styles.leaderTrack}>
                        <div className={styles.leaderFill} style={{ width: `${(t.done / maxDone) * 100}%` }} />
                      </div>
                      <span className={styles.leaderVal}>{t.done}/{t.total}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Active projects */}
      {active.length > 0 && (
        <section>
          <SectionHeader title="Active Projects" count={active.length} icon={FolderOpenIcon} />
          <div className={styles.projGrid}>
            {active.map(p => (
              <ProjectCard key={p.id} project={p} blocks={blocksByProject[p.id]} />
            ))}
          </div>
        </section>
      )}

      {/* Quick WhatsApp report */}
      <QuickReportWidget projects={projects} blocksByProject={blocksByProject} />

      {/* Upcoming projects */}
      {upcoming.length > 0 && (
        <section>
          <SectionHeader title="Upcoming" count={upcoming.length} icon={ClockIcon} />
          <div className={styles.upcomingRow}>
            {upcoming.map(p => (
              <UpcomingCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}

      {/* Completed projects */}
      {completed.length > 0 && (
        <section>
          <button className={styles.completedToggle} onClick={() => setShowCompleted(v => !v)}>
            <SectionHeader title="Completed" count={completed.length} icon={CheckCircleIcon} />
            {showCompleted ? <ChevronUpIcon width={16} /> : <ChevronDownIcon width={16} />}
          </button>
          {showCompleted && (
            <div className={styles.completedList}>
              {completed.map(p => <CompletedRow key={p.id} project={p} />)}
            </div>
          )}
        </section>
      )}

      {projects.length === 0 && (
        <div className={styles.empty}>
          <UserGroupIcon className={styles.emptyIcon} />
          <h3>No projects yet</h3>
          <p>Go to Projects to create your first project.</p>
        </div>
      )}
    </div>
  );
}

function QuickReportWidget({ projects, blocksByProject }) {
  const [copied, setCopied]   = useState({});
  const cctvActive = projects.filter(
    p => p.status === 'active' && (!p.projectType || p.projectType === 'cctv')
  );
  if (cctvActive.length === 0) return null;

  const copy = async (project) => {
    const blocks = (blocksByProject[project.id] ?? []).filter(b => getOverallProgress(b) > 0);
    const text   = buildReport(blocks);
    try { await navigator.clipboard.writeText(text); } catch {
      const el = document.createElement('textarea');
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand('copy'); document.body.removeChild(el);
    }
    setCopied(c => ({ ...c, [project.id]: true }));
    setTimeout(() => setCopied(c => ({ ...c, [project.id]: false })), 2000);
  };

  return (
    <section>
      <div className={styles.sectionHeader}>
        <ClipboardDocumentIcon className={styles.sectionIcon} width={18} />
        <h2 className={styles.sectionTitle}>Quick WhatsApp Report</h2>
      </div>
      <div className={styles.quickReportRow}>
        {cctvActive.map(p => (
          <div key={p.id} className={styles.quickCard}>
            <div className={styles.quickName}>{p.name}</div>
            <div className={styles.quickMeta}>{(blocksByProject[p.id] ?? []).filter(b => getOverallProgress(b) > 0).length} blocks with progress</div>
            <button
              className={[styles.quickBtn, copied[p.id] ? styles.quickBtnDone : ''].join(' ')}
              onClick={() => copy(p)}
            >
              {copied[p.id] ? '✓ Copied!' : 'Copy Today\'s Report'}
            </button>
            <p className={styles.quickHint}>For more options (mark active blocks, cluster date) — open project → WhatsApp Report tab</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UpcomingCard({ project }) {
  const navigate = useNavigate();
  const pType = project.projectType ?? 'cctv';
  return (
    <div className={styles.upCard} onClick={() => navigate(`/projects/${project.id}`)}>
      <Badge color={TYPE_COLOR[pType] ?? 'default'}>{TYPE_LABEL[pType] ?? pType}</Badge>
      <p className={styles.upName}>{project.name}</p>
      <p className={styles.upClient}>{project.client}</p>
      {project.startDate && <p className={styles.upDate}>Starts {formatDate(project.startDate)}</p>}
    </div>
  );
}

function CompletedRow({ project }) {
  const navigate = useNavigate();
  return (
    <div className={styles.compRow} onClick={() => navigate(`/projects/${project.id}`)}>
      <div>
        <span className={styles.compName}>{project.name}</span>
        <span className={styles.compClient}> · {project.client}</span>
      </div>
      <Badge color="default">Completed</Badge>
    </div>
  );
}
