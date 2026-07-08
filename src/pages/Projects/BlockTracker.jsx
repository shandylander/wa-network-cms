import React, { useState, useMemo } from 'react';
import { doc, updateDoc, writeBatch, Timestamp } from 'firebase/firestore';
import {
  MagnifyingGlassIcon, StarIcon as StarOutline, PlusIcon, DocumentTextIcon,
  ArrowTopRightOnSquareIcon, LockClosedIcon,
} from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { TEAMS } from '../../utils/permissions';
import { getStageStatus, formatDate } from '../../utils/helpers';
import Badge from '../../components/UI/Badge';
import BlockModal from './BlockModal';
import styles from './BlockTracker.module.css';

const TEAM_OPTIONS = ['own', 'kvm', 'sree', 'habibur', 'alamin'];

const STAGE_META = {
  'stage2-complete': { label: 'Stage 2',     color: 'green'   },
  'stage1-complete': { label: 'Stage 1',     color: 'blue'    },
  'in-progress':     { label: 'In Progress', color: 'amber'   },
  'not-started':     { label: 'Not Started', color: 'default' },
};
const SURVEY_META = {
  done: { label: 'Done', color: 'green'  },
  ip:   { label: 'IP',   color: 'amber'  },
  bto:  { label: 'BTO',  color: 'purple' },
};
const STAGE_ORDER  = { 'not-started': 0, 'in-progress': 1, 'stage1-complete': 2, 'stage2-complete': 3 };
const SURVEY_ORDER = { bto: 0, ip: 1, done: 2 };

function parseBlockNo(no) {
  const m = String(no).match(/^(\d+)([A-Z]?)$/i);
  return m ? [parseInt(m[1], 10), (m[2] || '').toUpperCase()] : [0, String(no)];
}
function compareBlockNo(a, b) {
  const [an, as] = parseBlockNo(a.no);
  const [bn, bs] = parseBlockNo(b.no);
  return an !== bn ? an - bn : as.localeCompare(bs);
}

function MiniBar({ value }) {
  return (
    <div className={styles.miniBarWrap}>
      <div className={styles.miniBar} style={{ width: `${value ?? 0}%` }} />
    </div>
  );
}

function SortTh({ col, label, sortKey, sortDir, onSort, className }) {
  const active = sortKey === col;
  return (
    <th
      className={[styles.sortTh, active ? styles.sortActive : '', className].filter(Boolean).join(' ')}
      onClick={() => onSort(col)}
      title={`Sort by ${label}`}
    >
      {label}
      <span className={styles.sortIcon} aria-hidden="true">
        {active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </span>
    </th>
  );
}

/* ── PDF embed URL converter ──────────────────────────────────────── */
function toEmbedUrl(url) {
  if (!url) return '';
  // Google Drive: /view or /edit → /preview (Google allows same-origin embed)
  if (url.includes('drive.google.com')) {
    return url.replace(/\/(view|edit)(\?|$)/, '/preview$2');
  }
  // Dropbox blocks cross-origin iframes via X-Frame-Options: SAMEORIGIN.
  // Route through Google Docs Viewer which fetches & serves the PDF itself.
  if (url.includes('dropbox.com')) {
    const raw = /[?&]dl=\d/.test(url)
      ? url.replace(/dl=\d/, 'raw=1')
      : url + (url.includes('?') ? '&' : '?') + 'raw=1';
    return `https://docs.google.com/viewer?url=${encodeURIComponent(raw)}&embedded=true`;
  }
  return url;
}

/* ── In-app document viewer ───────────────────────────────────────── */
function DocViewerModal({ block, onClose }) {
  const docs = [
    block.surveyUrl    && { label: 'Survey Report', url: block.surveyUrl },
    block.floorplanUrl && { label: 'Floor Plan',    url: block.floorplanUrl },
  ].filter(Boolean);

  const [activeIdx, setActiveIdx] = useState(0);
  const [loaded,    setLoaded]    = useState(false);

  if (!docs.length) return null;
  const current = docs[activeIdx];

  return (
    <div className={styles.viewerOverlay} onClick={onClose}>
      <div className={styles.viewerBox} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.viewerHeader}>
          <div className={styles.viewerTitle}>
            Block {block.no} <span className={styles.viewerStreet}>— {block.street}</span>
          </div>
          {docs.length > 1 && (
            <div className={styles.viewerTabs}>
              {docs.map((d, i) => (
                <button
                  key={i}
                  className={[styles.viewerTab, activeIdx === i ? styles.viewerTabActive : ''].join(' ')}
                  onClick={() => { setActiveIdx(i); setLoaded(false); }}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
          <div className={styles.viewerActions}>
            <a
              href={current.url} target="_blank" rel="noreferrer"
              className={styles.openTabBtn}
              title="Open in new tab"
            >
              <ArrowTopRightOnSquareIcon width={14} /> Open in new tab
            </a>
            <button className={styles.viewerClose} onClick={onClose}>✕</button>
          </div>
        </div>
        {/* Frame */}
        <div className={styles.viewerBody}>
          {!loaded && (
            <div className={styles.viewerLoading}>
              <div className={styles.viewerSpinner} />
              Loading document…
            </div>
          )}
          <iframe
            key={current.url}
            src={toEmbedUrl(current.url)}
            title={current.label}
            className={[styles.viewerFrame, loaded ? styles.viewerFrameVisible : ''].join(' ')}
            onLoad={() => setLoaded(true)}
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        </div>
        {/* Footer label */}
        <div className={styles.viewerFooter}>
          <span>{docs.length === 1 ? docs[0].label : current.label}</span>
          <span className={styles.viewerHint}>Can't see the document? <a href={current.url} target="_blank" rel="noreferrer">Open directly ↗</a></span>
        </div>
      </div>
    </div>
  );
}

export default function BlockTracker({ projectId, blocks, setBlocks, userRole, userTeam }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();

  const [search,      setSearch]      = useState('');
  const [teamFilter,  setTeamFilter]  = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [clusterFilter, setClusterFilter] = useState('');
  const [sortKey,     setSortKey]     = useState('no');
  const [sortDir,     setSortDir]     = useState('asc');
  const [editBlock,    setEditBlock]    = useState(null);
  const [viewDocBlock, setViewDocBlock] = useState(null);

  const isWorker  = ['staff', 'subcon-admin', 'subcon'].includes(userRole);
  const canEdit   = can('update:blocks');
  const canManage = can('blocks:delete');
  const canBulk   = can('blocks:bulk-edit');
  const [addMode, setAddMode] = useState(false);

  const [selectedIds,  setSelectedIds]  = useState(() => new Set());
  const [bulkTeam,      setBulkTeam]      = useState('');
  const [bulkCluster,   setBulkCluster]   = useState('');
  const [assigning,     setAssigning]     = useState(false);
  const [closeConfirm,  setCloseConfirm]  = useState(false);
  const [closing,       setClosing]       = useState(false);

  const handleSort = (col) => {
    if (sortKey === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(col); setSortDir('asc'); }
  };

  const toggleActive = async (e, block) => {
    e.stopPropagation();
    const next = !block.isActive;
    setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, isActive: next } : b));
    try {
      await updateDoc(doc(db, 'projects', projectId, 'blocks', block.id), { isActive: next });
    } catch {
      setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, isActive: !next } : b));
    }
  };

  const toggleSelect = (id) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleBulkAssignTeam = async () => {
    if (!projectId || selectedIds.size === 0 || !bulkTeam) return;
    setAssigning(true);
    try {
      const ids = [...selectedIds];
      const batch = writeBatch(db);
      const patch = {
        team: bulkTeam === '__unassigned__' ? '' : bulkTeam,
        updatedAt: new Date(),
        updatedBy: userProfile.userId,
        ...(bulkCluster.trim() ? { cluster: bulkCluster.trim() } : {}),
      };
      ids.forEach(id => batch.update(doc(db, 'projects', projectId, 'blocks', id), patch));
      await batch.commit();
      setBlocks(prev => prev.map(b => ids.includes(b.id) ? { ...b, ...patch } : b));
      toast.success(`${ids.length} block(s) reassigned`);
      setSelectedIds(new Set());
      setBulkTeam(''); setBulkCluster('');
    } catch {
      toast.error('Failed to reassign blocks');
    } finally {
      setAssigning(false);
    }
  };

  const handleBulkCloseCluster = async () => {
    if (!projectId || selectedIds.size === 0) return;
    setClosing(true);
    try {
      const ids = [...selectedIds];
      const batch = writeBatch(db);
      const patch = { clusterClosedAt: Timestamp.now(), clusterClosedBy: userProfile.userId };
      ids.forEach(id => batch.update(doc(db, 'projects', projectId, 'blocks', id), patch));
      await batch.commit();
      setBlocks(prev => prev.map(b => ids.includes(b.id) ? { ...b, ...patch } : b));
      toast.success(`${ids.length} block(s) — cluster closed`);
      setSelectedIds(new Set());
      setCloseConfirm(false);
    } catch {
      toast.error('Failed to close cluster');
    } finally {
      setClosing(false);
    }
  };

  const baseBlocks = useMemo(() => {
    if (isWorker && userTeam && userTeam !== 'none') return blocks.filter(b => b.team === userTeam);
    return blocks;
  }, [blocks, isWorker, userTeam]);

  const filtered = useMemo(() => baseBlocks.filter(b => {
    const q = search.toLowerCase();
    if (q && !b.no.toLowerCase().includes(q) && !b.street.toLowerCase().includes(q)) return false;
    if (teamFilter    && b.team !== teamFilter)                        return false;
    if (stageFilter   && getStageStatus(b) !== stageFilter)            return false;
    if (clusterFilter && (b.cluster || b.street) !== clusterFilter)    return false;
    return true;
  }), [baseBlocks, search, teamFilter, stageFilter, clusterFilter]);

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    let cmp = 0;
    switch (sortKey) {
      case 'no':     cmp = compareBlockNo(a, b); break;
      case 'street': cmp = a.street.localeCompare(b.street); break;
      case 'team':   cmp = (a.team ?? '').localeCompare(b.team ?? ''); break;
      case 'survey': cmp = (SURVEY_ORDER[a.survey] ?? 0) - (SURVEY_ORDER[b.survey] ?? 0); break;
      case 'fix1':   cmp = (a.fix1 ?? 0) - (b.fix1 ?? 0); break;
      case 'fix2':   cmp = (a.fix2 ?? 0) - (b.fix2 ?? 0); break;
      case 'fix3':   cmp = (a.fix3 ?? 0) - (b.fix3 ?? 0); break;
      case 'fix4':   cmp = (a.fix4 ?? 0) - (b.fix4 ?? 0); break;
      case 'stage':  cmp = (STAGE_ORDER[getStageStatus(a)] ?? 0) - (STAGE_ORDER[getStageStatus(b)] ?? 0); break;
      default: break;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  }), [filtered, sortKey, sortDir]);

  const teams         = [...new Set(blocks.map(b => b.team).filter(Boolean))];
  const activeCount   = baseBlocks.filter(b => b.isActive).length;
  const existingStreets  = [...new Set(blocks.map(b => b.street).filter(Boolean))].sort();
  const existingClusters = [...new Set(blocks.map(b => b.cluster || b.street).filter(Boolean))].sort();

  const handleSaved = (updated) => {
    setBlocks(prev => {
      const exists = prev.find(b => b.id === updated.id);
      return exists
        ? prev.map(b => b.id === updated.id ? updated : b)
        : [updated, ...prev];
    });
    setEditBlock(null);
    setAddMode(false);
  };

  const handleDeleted = (blockId) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    setEditBlock(null);
  };

  const thProps = { sortKey, sortDir, onSort: handleSort };

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <div className={styles.searchWrap}>
          <MagnifyingGlassIcon className={styles.searchIcon} width={15} />
          <input
            className={styles.search}
            placeholder="Search block no. or street…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {!isWorker && (
          <select className={styles.select} value={teamFilter} onChange={e => setTeamFilter(e.target.value)}>
            <option value="">All Teams</option>
            {teams.map(t => <option key={t} value={t}>{TEAMS[t] ?? t}</option>)}
          </select>
        )}
        <select className={styles.select} value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="">All Stages</option>
          <option value="stage2-complete">Stage 2</option>
          <option value="stage1-complete">Stage 1</option>
          <option value="in-progress">In Progress</option>
          <option value="not-started">Not Started</option>
        </select>
        <select className={styles.select} value={clusterFilter} onChange={e => setClusterFilter(e.target.value)}>
          <option value="">All Clusters</option>
          {existingClusters.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className={styles.count}>{filtered.length} / {baseBlocks.length} blocks</span>
        {activeCount > 0 && (
          <span className={styles.activePill}>★ {activeCount} active</span>
        )}
        {canManage && (
          <button className={styles.addBtn} onClick={() => setAddMode(true)}>
            <PlusIcon width={14} /> Add Block
          </button>
        )}
      </div>

      {canBulk && selectedIds.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selectedIds.size} selected</span>
          <button className={styles.bulkClearBtn} onClick={() => setSelectedIds(new Set())}>Clear</button>

          <select className={styles.select} value={bulkTeam} onChange={e => setBulkTeam(e.target.value)}>
            <option value="">Team…</option>
            <option value="__unassigned__">Unassigned</option>
            {TEAM_OPTIONS.map(t => <option key={t} value={t}>{TEAMS[t] ?? t}</option>)}
          </select>
          <input
            className={styles.search}
            style={{ width: 180 }}
            placeholder="Cluster label (optional)"
            value={bulkCluster}
            onChange={e => setBulkCluster(e.target.value)}
            list="bulk-cluster-list"
          />
          <datalist id="bulk-cluster-list">
            {existingClusters.map(c => <option key={c} value={c} />)}
          </datalist>
          <button className={styles.addBtn} disabled={assigning || !bulkTeam} onClick={handleBulkAssignTeam}>
            {assigning ? 'Assigning…' : 'Assign Team'}
          </button>

          {!closeConfirm ? (
            <button className={styles.bulkCloseBtn} onClick={() => setCloseConfirm(true)}>Close Cluster</button>
          ) : (
            <span className={styles.bulkCloseConfirm}>
              Close cluster for {selectedIds.size} block(s)?
              <button className={styles.cancelDelBtn} onClick={() => setCloseConfirm(false)}>Cancel</button>
              <button className={styles.confirmDelBtn} disabled={closing} onClick={handleBulkCloseCluster}>
                {closing ? 'Closing…' : 'Confirm'}
              </button>
            </span>
          )}
        </div>
      )}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {canBulk && (
                <th className={styles.thCheck}>
                  <input
                    type="checkbox"
                    checked={sorted.length > 0 && sorted.every(b => selectedIds.has(b.id))}
                    onChange={e => setSelectedIds(e.target.checked ? new Set(sorted.map(b => b.id)) : new Set())}
                  />
                </th>
              )}
              <th className={styles.thStar} title="Mark as currently working on">★</th>
              <th className={styles.thDoc} title="Documents">📄</th>
              <SortTh col="no"     label="Block"  {...thProps} />
              <SortTh col="street" label="Street" {...thProps} />
              <th className={styles.hideS}>Type</th>
              <SortTh col="team"   label="Team"   {...thProps} />
              <SortTh col="survey" label="Survey" {...thProps} className={styles.hideS} />
              <th>Cluster</th>
              <SortTh col="fix1"   label="Fix 1"  {...thProps} />
              <SortTh col="fix2"   label="Fix 2"  {...thProps} />
              <SortTh col="fix3"   label="Fix 3"  {...thProps} />
              <SortTh col="fix4"   label="Fix 4"  {...thProps} />
              <SortTh col="stage"  label="Stage"  {...thProps} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(block => {
              const stage    = getStageStatus(block);
              const sm       = STAGE_META[stage];
              const sv       = SURVEY_META[block.survey] ?? { label: block.survey ?? '—', color: 'default' };
              const editable = canEdit && (!isWorker || block.team === userTeam);
              return (
                <tr
                  key={block.id}
                  className={[styles.row, editable ? styles.rowEditable : '', block.isActive ? styles.rowActive : ''].join(' ')}
                  onClick={() => editable && setEditBlock(block)}
                >
                  {canBulk && (
                    <td className={styles.tdCheck} onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(block.id)}
                        onChange={() => toggleSelect(block.id)}
                      />
                    </td>
                  )}
                  <td className={styles.tdStar}>
                    {editable && (
                      <button
                        className={[styles.starBtn, block.isActive ? styles.starOn : ''].join(' ')}
                        onClick={(e) => toggleActive(e, block)}
                        title={block.isActive ? 'Unmark as active' : 'Mark as currently working on'}
                      >
                        {block.isActive
                          ? <StarSolid width={14} />
                          : <StarOutline width={14} />}
                      </button>
                    )}
                  </td>
                  <td className={styles.tdDoc}>
                    {(block.surveyUrl || block.floorplanUrl) ? (
                      <button
                        className={styles.docBtn}
                        onClick={e => { e.stopPropagation(); setViewDocBlock(block); }}
                        title={[block.surveyUrl && 'Survey Report', block.floorplanUrl && 'Floor Plan'].filter(Boolean).join(' + ')}
                      >
                        <DocumentTextIcon width={15} />
                      </button>
                    ) : (
                      <span className={styles.docBtnEmpty}>—</span>
                    )}
                  </td>
                  <td className={styles.tdNo}>{block.no}</td>
                  <td className={styles.tdStreet}>{block.street}</td>
                  <td className={styles.hideS}>
                    <span className={styles.typeTag}>{block.type === 'MSCP' ? 'MSCP' : 'RES'}</span>
                  </td>
                  <td>
                    {block.team
                      ? <span className={styles.teamTag}>{TEAMS[block.team] ?? block.team}</span>
                      : <span className={styles.unassigned}>—</span>}
                  </td>
                  <td className={styles.hideS}><Badge color={sv.color}>{sv.label}</Badge></td>
                  <td className={styles.tdCluster}>
                    {block.cluster || block.street}
                    {block.clusterClosedAt && (
                      <span
                        className={styles.clusterClosedBadge}
                        title={`Closed ${formatDate(block.clusterClosedAt)}${block.clusterClosedBy ? ' by ' + block.clusterClosedBy : ''}`}
                      >
                        <LockClosedIcon width={11} />
                      </span>
                    )}
                  </td>
                  <td className={styles.fixCell}><MiniBar value={block.fix1} /><span className={styles.fixPct}>{block.fix1 ?? 0}%</span></td>
                  <td className={styles.fixCell}><MiniBar value={block.fix2} /><span className={styles.fixPct}>{block.fix2 ?? 0}%</span></td>
                  <td className={styles.fixCell}><MiniBar value={block.fix3} /><span className={styles.fixPct}>{block.fix3 ?? 0}%</span></td>
                  <td className={styles.fixCell}><MiniBar value={block.fix4} /><span className={styles.fixPct}>{block.fix4 ?? 0}%</span></td>
                  <td><Badge color={sm.color}>{sm.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className={styles.empty}>No blocks match the current filters.</div>
        )}
      </div>

      {viewDocBlock && (
        <DocViewerModal block={viewDocBlock} onClose={() => setViewDocBlock(null)} />
      )}

      {addMode && (
        <BlockModal
          mode="add"
          projectId={projectId}
          onClose={() => setAddMode(false)}
          onSaved={handleSaved}
          userRole={userRole}
          existingStreets={existingStreets}
          existingClusters={existingClusters}
        />
      )}

      {editBlock && (
        <BlockModal
          block={editBlock}
          projectId={projectId}
          onClose={() => setEditBlock(null)}
          onSaved={handleSaved}
          onDeleted={handleDeleted}
          userRole={userRole}
          userTeam={userTeam}
          existingClusters={existingClusters}
          existingStreets={existingStreets}
        />
      )}
    </div>
  );
}
