import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import {
  ClipboardDocumentIcon, CheckIcon, StarIcon as StarOutline,
  ChatBubbleLeftEllipsisIcon, TrashIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { db } from '../../firebase';
import { TEAMS } from '../../utils/permissions';
import { getOverallProgress, todayInputSG, toDateInputSG } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import ImportReport from './ImportReport';
import styles from './Reports.module.css';

/* ─── Helpers ────────────────────────────────────────────────────── */

const todayISO = todayInputSG;

export const formatDMY = (iso) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};

const sortBlocks = (arr) =>
  [...arr].sort((a, b) => {
    const pa = String(a.no).match(/^(\d+)([A-Z]?)$/i);
    const pb = String(b.no).match(/^(\d+)([A-Z]?)$/i);
    if (pa && pb) {
      const nd = parseInt(pa[1], 10) - parseInt(pb[1], 10);
      return nd !== 0 ? nd : pa[2].localeCompare(pb[2]);
    }
    return String(a.no).localeCompare(String(b.no));
  });

const buildLine = (b, isActive) => {
  const prefix = isActive ? '**' : '';
  const fixes  = `fix1-${b.fix1 ?? 0}% fix2-${b.fix2 ?? 0}% fix3-${b.fix3 ?? 0}% fix4-${b.fix4 ?? 0}%`;
  const cam    = b.cam ? ` cam${b.cam}(${b.rack ?? 'O'})` : '';
  return `${prefix}${b.no}- ${fixes}${cam}`;
};

export const buildReport = (blocks, opts = {}) => {
  const { reportDate = todayISO(), clusterStartDate = '', activeIds = new Set() } = opts;
  const lines = [`Daily Work Status: ${formatDMY(reportDate)}`, ''];

  if (clusterStartDate) {
    lines.push(`Cluster Start Date: ${formatDMY(clusterStartDate)}`);
    lines.push('');
  }

  const groups = {};
  sortBlocks(blocks).forEach(b => {
    const key = b.cluster || b.street || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  });

  const streetNames = Object.keys(groups);
  if (streetNames.length > 1) {
    Object.entries(groups).forEach(([street, streetBlocks]) => {
      lines.push(street);
      lines.push('');
      streetBlocks.forEach(b => lines.push(buildLine(b, activeIds.has(b.id))));
      lines.push('');
    });
  } else {
    Object.values(groups).flat().forEach(b => lines.push(buildLine(b, activeIds.has(b.id))));
  }

  return lines.join('\n').trimEnd();
};

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement('textarea');
    el.value = text;
    document.body.appendChild(el); el.select();
    document.execCommand('copy'); document.body.removeChild(el);
  }
}

/* ─── Main component ─────────────────────────────────────────────── */

export default function Reports({ blocks, setBlocks, project, setProject, userRole, userTeam }) {
  const { toast }  = useToast();
  const { can }    = usePermissions();
  const isWorker   = ['staff', 'subcon-admin', 'subcon'].includes(userRole);
  const canAdmin   = can('generate:reports');

  // Derive teams that actually have blocks in this project
  const teams = useMemo(() => {
    const raw = [...new Set(blocks.map(b => b.team).filter(Boolean))].sort();
    return raw;
  }, [blocks]);

  // Workers are locked to their team; admins start on first team (most common use-case)
  const [selectedTeam, setSelectedTeam] = useState(() =>
    isWorker ? (userTeam ?? teams[0] ?? '') : (teams[0] ?? '')
  );

  // Reset to first team if blocks/teams change and selection is gone
  useEffect(() => {
    if (selectedTeam !== '' && !teams.includes(selectedTeam)) {
      setSelectedTeam(teams[0] ?? '');
    }
  }, [teams, selectedTeam]);

  const [reportDate,   setReportDate]   = useState(todayISO());
  const [progressOnly, setProgressOnly] = useState(true);
  const [hideClosedClusters, setHideClosedClusters] = useState(true);
  const [copied,       setCopied]       = useState(false);
  const [clearing,     setClearing]     = useState(false);

  // Per-team start dates — stored on project.teamStartDates: { [teamKey]: Date }
  const getTeamStartDate = useCallback((team) => {
    if (!team) return '';
    const raw = project?.teamStartDates?.[team];
    if (!raw) return '';
    return toDateInputSG(raw);
  }, [project?.teamStartDates]);

  // Active IDs — driven by Firestore isActive; local overrides allowed
  const [activeIds, setActiveIds] = useState(
    () => new Set(blocks.filter(b => b.isActive).map(b => b.id))
  );

  // Re-sync active IDs when blocks prop changes (e.g. subcon stars a block in BlockTracker)
  useEffect(() => {
    setActiveIds(new Set(blocks.filter(b => b.isActive).map(b => b.id)));
  }, [blocks]);

  /* Filtered blocks for the selected team (or all if '' = all-teams overview) */
  const baseBlocks = useMemo(() => {
    let b = isWorker && userTeam && userTeam !== 'none'
      ? blocks.filter(x => x.team === userTeam)
      : blocks;
    if (selectedTeam) b = b.filter(x => x.team === selectedTeam);
    if (progressOnly) b = b.filter(x => getOverallProgress(x) > 0);
    if (hideClosedClusters) b = b.filter(x => !x.clusterClosedAt);
    return sortBlocks(b);
  }, [blocks, isWorker, userTeam, selectedTeam, progressOnly, hideClosedClusters]);

  const report = useMemo(() =>
    buildReport(baseBlocks, { reportDate, clusterStartDate: getTeamStartDate(selectedTeam), activeIds }),
    [baseBlocks, reportDate, selectedTeam, getTeamStartDate, activeIds]
  );

  const toggleActive = (id) =>
    setActiveIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });


  const handleCopy = async () => {
    await copyText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const sendWhatsApp = () =>
    window.open(`https://wa.me/?text=${encodeURIComponent(report)}`, '_blank');

  const clearActiveBlocks = async () => {
    if (!project?.id) return;
    setClearing(true);
    try {
      const toReset = blocks.filter(b => b.isActive && (!selectedTeam || b.team === selectedTeam));
      if (toReset.length > 0) {
        const batch = writeBatch(db);
        toReset.forEach(b =>
          batch.update(doc(db, 'projects', project.id, 'blocks', b.id), { isActive: false })
        );
        await batch.commit();
        setBlocks(prev => prev.map(b =>
          toReset.find(r => r.id === b.id) ? { ...b, isActive: false } : b
        ));
      }
      setActiveIds(prev => {
        const next = new Set(prev);
        toReset.forEach(b => next.delete(b.id));
        return next;
      });
      toast.success('Active flags cleared');
    } catch {
      toast.error('Failed to clear active flags');
    } finally {
      setClearing(false);
    }
  };

  const activeInView = baseBlocks.filter(b => activeIds.has(b.id)).length;
  const isAllTeams   = selectedTeam === '';

  return (
    <div className={styles.wrap}>

      {/* ── Team tabs ── */}
      <div className={styles.teamTabs}>
        {!isWorker && (
          <button
            className={[styles.teamTab, isAllTeams ? styles.teamTabActive : ''].join(' ')}
            onClick={() => setSelectedTeam('')}
          >
            All Teams
            <span className={styles.teamTabCount}>{blocks.length}</span>
          </button>
        )}
        {teams.map(t => {
          const count = blocks.filter(b => b.team === t).length;
          const active = blocks.filter(b => b.team === t && b.isActive).length;
          const isSel  = selectedTeam === t;
          return (
            <button
              key={t}
              className={[styles.teamTab, isSel ? styles.teamTabActive : ''].join(' ')}
              onClick={() => setSelectedTeam(t)}
              disabled={isWorker && userTeam !== t}
            >
              {TEAMS[t] ?? t}
              <span className={styles.teamTabCount}>{count}</span>
              {active > 0 && <span className={styles.teamTabStar}>★{active}</span>}
            </button>
          );
        })}
      </div>

      {isAllTeams && (
        <div className={styles.allTeamsBanner}>
          This is the combined overview. Select a team tab above to generate and send their individual report.
        </div>
      )}

      {/* ── Controls ── */}
      <div className={styles.controls}>
        <div className={styles.controlGroup}>
          <label className={styles.controlLabel}>Report Date</label>
          <input type="date" className={styles.dateInput} value={reportDate} onChange={e => setReportDate(e.target.value)} />
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={progressOnly} onChange={e => setProgressOnly(e.target.checked)} className={styles.checkbox} />
            With progress only
          </label>
        </div>
        <div className={styles.controlGroup}>
          <label className={styles.checkLabel}>
            <input type="checkbox" checked={hideClosedClusters} onChange={e => setHideClosedClusters(e.target.checked)} className={styles.checkbox} />
            Hide closed clusters
          </label>
        </div>
        <div className={styles.blockCount}>
          <strong>{baseBlocks.length}</strong> blocks
          {activeInView > 0 && <span className={styles.activeCount}>★ {activeInView} active</span>}
        </div>
      </div>

      {/* ── Cluster start date (per team) ── */}
      {!isAllTeams && selectedTeam && (
        <div className={styles.clusterSection}>
          <span className={styles.clusterTitle}>Cluster Start Date</span>
          <span className={styles.clusterDateVal}>
            {getTeamStartDate(selectedTeam)
              ? formatDMY(getTeamStartDate(selectedTeam))
              : <span className={styles.clusterNone}>Not set — edit in Overview tab</span>}
          </span>
        </div>
      )}

      {/* ── Active block selector (★) ── */}
      <div className={styles.activeSection}>
        <div className={styles.activeSectionHeader}>
          <div className={styles.activeLegend}>
            <StarSolid className={styles.legendStar} width={13} />
            <span>
              Tap to mark as <strong>currently working on</strong> (adds <code>**</code>).
              {!isAllTeams && ' Subcons pre-select via the ★ column in Block Tracker.'}
            </span>
          </div>
          <div className={styles.activeActions}>
            <button className={styles.linkBtn} onClick={() => setActiveIds(new Set(baseBlocks.map(b => b.id)))}>All</button>
            <button className={styles.linkBtn} onClick={() => setActiveIds(prev => {
              const next = new Set(prev);
              baseBlocks.forEach(b => next.delete(b.id));
              return next;
            })}>Clear</button>
          </div>
        </div>
        <div className={styles.chipGrid}>
          {baseBlocks.map(b => {
            const on = activeIds.has(b.id);
            return (
              <button key={b.id} className={[styles.chip, on ? styles.chipOn : ''].join(' ')} onClick={() => toggleActive(b.id)}>
                {on ? <StarSolid width={11} className={styles.chipStar} /> : <StarOutline width={11} className={styles.chipStar} />}
                {b.no}
              </button>
            );
          })}
          {baseBlocks.length === 0 && <span className={styles.noBlocks}>No blocks match current filters</span>}
        </div>
      </div>

      {/* ── Report preview + actions ── */}
      <div className={styles.reportCard}>
        <div className={styles.reportHeader}>
          <div className={styles.reportMeta}>
            <span className={styles.reportTitle}>
              {isAllTeams ? 'Combined Overview' : `${TEAMS[selectedTeam] ?? selectedTeam} Report`}
            </span>
          </div>
          <div className={styles.reportActions}>
            {canAdmin && !isAllTeams && (
              <button
                className={styles.clearBtn}
                onClick={clearActiveBlocks}
                disabled={clearing}
                title="Reset ★ flags for this team after sending"
              >
                <TrashIcon width={13} />
                {clearing ? 'Clearing…' : 'Clear ★ flags'}
              </button>
            )}
            <button
              className={[styles.actionBtn, styles.copyBtn, copied ? styles.copyDone : ''].join(' ')}
              onClick={handleCopy}
              disabled={baseBlocks.length === 0}
            >
              {copied ? <><CheckIcon width={14} /> Copied!</> : <><ClipboardDocumentIcon width={14} /> Copy</>}
            </button>
            {!isAllTeams && (
              <button
                className={[styles.actionBtn, styles.waBtn].join(' ')}
                onClick={sendWhatsApp}
                disabled={baseBlocks.length === 0}
              >
                <ChatBubbleLeftEllipsisIcon width={14} /> Send via WhatsApp
              </button>
            )}
          </div>
        </div>
        <pre className={styles.reportPre}>
          {baseBlocks.length === 0 ? 'No blocks match the current filters.' : report}
        </pre>
      </div>

      {/* ── Import incoming reports (management only) ── */}
      {canAdmin && (
        <ImportReport projectId={project?.id} blocks={blocks} setBlocks={setBlocks} />
      )}

    </div>
  );
}
