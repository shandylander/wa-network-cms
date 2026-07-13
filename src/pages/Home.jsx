import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  FolderOpenIcon, ClockIcon, CheckCircleIcon,
  UserGroupIcon, ChevronDownIcon, ChevronUpIcon, ChevronRightIcon,
  ClipboardDocumentIcon, Squares2X2Icon, TrophyIcon,
  WrenchScrewdriverIcon, InboxArrowDownIcon, BanknotesIcon, BellAlertIcon,
} from '@heroicons/react/24/outline';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { usePermissions } from '../hooks/usePermissions';
import { greet, formatDate, getOverallProgress, todayInputSG } from '../utils/helpers';
import { buildAttentionFeed } from '../utils/attentionEngine';
import { useCountUp } from '../hooks/useCountUp';
import { TEAMS } from '../utils/permissions';
import { buildReport } from './Projects/Reports';
import Badge from '../components/UI/Badge';
import BlockHeatmap from '../components/UI/BlockHeatmap';
import WorkerHome from './Worker/WorkerHome';
import styles from './Home.module.css';

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

// Lightweight SVG progress ring for non-CCTV project cards (milestones done /
// total). Animates from 0 on mount via a CSS stroke-dashoffset transition,
// which is disabled under prefers-reduced-motion (see .ringFill in the CSS).
function ProgressRing({ pct, size = 46 }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setShown(pct); return undefined; }
    const id = requestAnimationFrame(() => setShown(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={styles.ring} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" className={styles.ringTrack} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="5" strokeLinecap="round"
        className={styles.ringFill}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, shown)))}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle" className={styles.ringText}>
        {Math.round(pct * 100)}%
      </text>
    </svg>
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
          <div className={styles.msRingRow}>
            <ProgressRing pct={milestones.length ? msDone / milestones.length : 0} />
            <div>
              <p className={styles.msRingVal}>{msDone}/{milestones.length}</p>
              <p className={styles.msRingLbl}>milestones complete</p>
            </div>
          </div>
          {milestones.slice(0, 3).map(m => (
            <div key={m.id} className={[styles.msPill, m.done ? styles.msPillDone : ''].join(' ')}>
              <span className={styles.msCheck}>{m.done ? '✓' : '○'}</span>
              <span className={styles.msText}>{m.label}</span>
            </div>
          ))}
          {milestones.length > 3 && (
            <p className={styles.msMore}>+{milestones.length - 3} more milestone{milestones.length - 3 > 1 ? 's' : ''}</p>
          )}
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

// KPI tile with a count-up animated number. `display` optionally formats the
// animated integer (e.g. money). Own component so useCountUp is called at the
// top level of each tile, never inside a loop callback.
function KpiTile({ label, value, sub, color = 'blue', display, icon: Icon }) {
  const n = useCountUp(value);
  return (
    <div className={[styles.kpiTile, styles[`kpi_${color}`]].join(' ')}>
      {Icon && <Icon className={styles.kpiIcon} width={18} />}
      <span className={styles.kpiVal}>{display ? display(n) : n}</span>
      <span className={styles.kpiLabel}>{label}</span>
      {sub && <span className={styles.kpiSub}>{sub}</span>}
    </div>
  );
}

function AttentionFeed({ items }) {
  const navigate = useNavigate();
  return (
    <section>
      <SectionHeader title="Needs Attention" count={items.length || undefined} icon={BellAlertIcon} />
      {items.length === 0 ? (
        <div className={styles.allClear}>
          <CheckCircleIcon width={18} />
          <span>All clear — nothing needs attention.</span>
        </div>
      ) : (
        <div className={styles.attnList}>
          {items.map(it => (
            <button
              key={it.id}
              type="button"
              className={[styles.attnRow, styles[`attn_${it.severity}`]].join(' ')}
              onClick={() => it.to && navigate(it.to)}
            >
              <span className={styles.attnStripe} />
              <span className={styles.attnBody}>
                <span className={styles.attnTitle}>{it.title}</span>
                <span className={styles.attnDetail}>{it.detail}</span>
              </span>
              <ChevronRightIcon width={15} className={styles.attnChevron} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Home() {
  const { userProfile } = useAuth();
  const { can }          = usePermissions();

  // Staff get the simplified job-focused landing page instead of the full
  // project dashboard — mirrors the existing WorkerClock/WorkerLeave/
  // WorkerClaims role-branch pattern used elsewhere in the app.
  if (userProfile?.role === 'staff') {
    return <WorkerHome />;
  }

  return <HomeDashboard userProfile={userProfile} can={can} />;
}

function HomeDashboard({ userProfile, can }) {
  const [projects,        setProjects]        = useState([]);
  const [blocksByProject, setBlocksByProject] = useState({});
  const [workers,         setWorkers]         = useState([]);
  // null = not fetched (no permission or the fetch failed) → the dependent
  // tile/detector is skipped rather than showing a misleading zero.
  const [serviceJobs,     setServiceJobs]     = useState(null);
  const [leaveApps,       setLeaveApps]       = useState(null);
  const [pettyPending,    setPettyPending]    = useState(null);
  const [claims,          setClaims]          = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [showCompleted,   setShowCompleted]   = useState(false);
  const [now,             setNow]             = useState(new Date());

  // Permission flags — derived once; drive both which sources we fetch (so
  // Firestore rules never reject) and which KPI tiles/detectors appear.
  const canFinance = can('view:claims');
  const canVet     = can('jobs:vet');
  const canJobs    = can('manage:service-reports') || can('jobs:assign') || canVet;
  const canLeave   = can('leave:approve');
  const canPetty   = can('pettycash:approve');

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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

        // Claims across active PCS projects (finance only). Keep the raw docs
        // so we can derive both the outstanding total and the aging alert.
        if (canFinance) {
          try {
            const activePcs = all.filter(p => p.status === 'active' && p.projectType === 'pcs');
            const claimResults = await Promise.all(
              activePcs.map(p => getDocs(collection(db, 'projects', p.id, 'claims')).catch(() => null))
            );
            const docs = [];
            claimResults.forEach(snap => snap && snap.docs.forEach(d => docs.push({ id: d.id, ...d.data() })));
            setClaims(docs);
          } catch (e) { console.error('Claims load error', e); }
        }

        // Service jobs (whole collection) — for Jobs-today + vet detectors.
        if (canJobs) {
          try {
            const snap = await getDocs(collection(db, 'serviceJobs'));
            setServiceJobs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (e) { console.error('Service jobs load error', e); }
        }

        // Leave applications the viewer can approve — pending count + approved
        // (for the leave/job clash detector).
        if (canLeave) {
          try {
            const snap = await getDocs(
              query(collection(db, 'leaveApplications'), where('status', 'in', ['pending', 'approved']))
            );
            setLeaveApps(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          } catch (e) { console.error('Leave load error', e); }
        }

        // Pending petty cash claims (count only).
        if (canPetty) {
          try {
            const snap = await getDocs(
              query(collection(db, 'pettyCashClaims'), where('status', '==', 'pending'))
            );
            setPettyPending(snap.size);
          } catch (e) { console.error('Petty cash load error', e); }
        }
      } catch (err) {
        console.error('Dashboard load error', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className={styles.loadingWrap}><div className={styles.spinner} /></div>;

  const active    = projects.filter(p => p.status === 'active');
  const upcoming  = projects.filter(p => p.status === 'upcoming');
  const completed = projects.filter(p => p.status === 'completed');

  // ── KPI strip (role-aware, real data only) ──
  const today          = todayInputSG();
  const jobsToday      = (serviceJobs ?? []).filter(j => j.scheduledDate === today);
  const jobsInProgress = jobsToday.filter(j => j.status === 'in-progress').length;

  const leavePending = canLeave && leaveApps  ? leaveApps.filter(l => l.status === 'pending').length : null;
  const vetPending   = canVet   && serviceJobs ? serviceJobs.filter(j => j.status === 'completed').length : null;
  const pettyCount   = canPetty ? pettyPending : null; // null until fetched
  const approvalParts = [
    leavePending != null ? { n: leavePending, label: 'leave' } : null,
    vetPending   != null ? { n: vetPending,   label: 'to vet' } : null,
    pettyCount   != null ? { n: pettyCount,   label: 'petty cash' } : null,
  ].filter(Boolean);
  const approvalTotal = approvalParts.reduce((s, p) => s + p.n, 0);

  const claimsOutstanding = (claims ?? [])
    .filter(c => c.status !== 'paid')
    .reduce((s, c) => s + (c.netAmount ?? 0), 0);

  const kpis = [
    canJobs && serviceJobs ? {
      key: 'jobsToday', label: 'Jobs Today', value: jobsToday.length, color: 'blue',
      icon: WrenchScrewdriverIcon,
      sub: jobsInProgress > 0 ? `${jobsInProgress} in progress`
        : jobsToday.length > 0 ? 'None started yet' : 'None scheduled',
    } : null,
    approvalParts.length > 0 ? {
      key: 'approvals', label: 'Awaiting Your Approval', value: approvalTotal, color: 'amber',
      icon: InboxArrowDownIcon,
      sub: approvalParts.map(p => `${p.n} ${p.label}`).join(' · '),
    } : null,
    { key: 'active',  label: 'Active Projects', value: active.length,  color: 'green',  icon: FolderOpenIcon },
    { key: 'workers', label: 'Workers',         value: workers.length, color: 'purple', icon: UserGroupIcon },
    canFinance ? {
      key: 'claims', label: 'Claims Outstanding', value: claimsOutstanding, color: 'red',
      icon: BanknotesIcon,
      display: n => `$${n.toLocaleString('en-SG', { maximumFractionDigits: 0 })}`,
    } : null,
  ].filter(Boolean);

  // ── Needs Attention feed — only sources the viewer can actually see ──
  const attentionFeed = buildAttentionFeed({
    workers,
    jobs: serviceJobs ?? [],
    leaveApplications: leaveApps ?? [],
    claims: claims ?? [],
    now,
    includeCpf: canFinance,
  });

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
        <span className={styles.greetDate}>
          {new Intl.DateTimeFormat('en-SG', { dateStyle: 'long', timeZone: 'Asia/Singapore' }).format(now)}
          {' · '}
          {new Intl.DateTimeFormat('en-SG', { timeStyle: 'medium', timeZone: 'Asia/Singapore' }).format(now)}
        </span>
      </div>

      {/* KPI strip — today's ops first */}
      <div className={styles.kpiRow}>
        {kpis.map(k => <KpiTile key={k.key} {...k} />)}
      </div>

      {/* Needs Attention */}
      <AttentionFeed items={attentionFeed} />

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
