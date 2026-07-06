import React, { useState } from 'react';
import { doc, writeBatch, Timestamp } from 'firebase/firestore';
import { ArrowDownOnSquareIcon, CheckIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { StarIcon as StarSolid } from '@heroicons/react/24/solid';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { parseReport } from '../../utils/parseReport';
import styles from './ImportReport.module.css';

const FIX_FIELDS = ['fix1', 'fix2', 'fix3', 'fix4'];

export default function ImportReport({ projectId, blocks, setBlocks }) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();

  const [open,     setOpen]     = useState(false);
  const [text,     setText]     = useState('');
  const [preview,  setPreview]  = useState(null);
  const [applying, setApplying] = useState(false);

  const buildPreview = () => {
    const { entries, skipped } = parseReport(text);
    const byNo = {};
    blocks.forEach(b => { byNo[String(b.no).toUpperCase()] = b; });

    const matches = [];
    const unknown = [];
    entries.forEach(e => {
      const block = byNo[e.no];
      if (!block) { unknown.push(e.no); return; }
      const changes = {};
      FIX_FIELDS.forEach(f => {
        if (e[f] != null && e[f] !== (block[f] ?? 0)) changes[f] = { from: block[f] ?? 0, to: e[f] };
      });
      if (e.cam != null && e.cam !== (block.cam ?? 0)) changes.cam  = { from: block.cam ?? 0, to: e.cam };
      if (e.rack && e.rack !== (block.rack ?? ''))     changes.rack = { from: block.rack ?? '—', to: e.rack };
      matches.push({ block, entry: e, changes, changed: Object.keys(changes).length > 0 });
    });

    setPreview({ matches, unknown, skipped });
    if (entries.length === 0) toast.error('No block lines recognised — check the pasted text.');
  };

  const apply = async () => {
    if (!preview || !projectId) return;
    const toUpdate = preview.matches.filter(m => m.changed || m.entry.active);
    if (toUpdate.length === 0) { toast.success('Nothing to update — all values already match.'); return; }

    setApplying(true);
    try {
      const batch = writeBatch(db);
      const now   = Timestamp.now();
      toUpdate.forEach(({ block, entry }) => {
        const patch = { updatedAt: now, updatedBy: userProfile?.userId ?? '' };
        FIX_FIELDS.forEach(f => { if (entry[f] != null) patch[f] = entry[f]; });
        if (entry.cam  != null) patch.cam  = entry.cam;
        if (entry.rack)         patch.rack = entry.rack;
        if (entry.active)       patch.isActive = true;
        batch.update(doc(db, 'projects', projectId, 'blocks', block.id), patch);
      });
      await batch.commit();

      setBlocks(prev => prev.map(b => {
        const m = toUpdate.find(x => x.block.id === b.id);
        if (!m) return b;
        const { entry } = m;
        const next = { ...b };
        FIX_FIELDS.forEach(f => { if (entry[f] != null) next[f] = entry[f]; });
        if (entry.cam  != null) next.cam  = entry.cam;
        if (entry.rack)         next.rack = entry.rack;
        if (entry.active)       next.isActive = true;
        return next;
      }));

      toast.success(`Updated ${toUpdate.length} block${toUpdate.length !== 1 ? 's' : ''}`);
      setText('');
      setPreview(null);
      setOpen(false);
    } catch {
      toast.error('Failed to apply updates');
    } finally {
      setApplying(false);
    }
  };

  if (!open) {
    return (
      <button className={styles.openBtn} onClick={() => setOpen(true)}>
        <ArrowDownOnSquareIcon width={15} /> Import WhatsApp report
      </button>
    );
  }

  const changedCount = preview?.matches.filter(m => m.changed).length ?? 0;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <p className={styles.title}>Import WhatsApp report</p>
        <button className={styles.linkBtn} onClick={() => { setOpen(false); setPreview(null); }}>Close</button>
      </div>
      <p className={styles.hint}>
        Paste a daily work-status message below. Blocks are matched by number; ***starred lines
        are marked as currently active. Values missing from the message stay unchanged.
      </p>

      <textarea
        className={styles.paste}
        rows={8}
        placeholder={'351 fix1-90% fix2-90% fix3-0 fix4-0 cam6(O)\n352- fix1-90% …'}
        value={text}
        onChange={e => { setText(e.target.value); setPreview(null); }}
      />

      {!preview ? (
        <button className={styles.previewBtn} onClick={buildPreview} disabled={!text.trim()}>
          Preview changes
        </button>
      ) : (
        <>
          {preview.unknown.length > 0 && (
            <p className={styles.warn}>
              <ExclamationTriangleIcon width={15} />
              Not found in this project: {preview.unknown.join(', ')}
            </p>
          )}
          {preview.skipped.length > 0 && (
            <p className={styles.warn}>
              <ExclamationTriangleIcon width={15} />
              Could not read: {preview.skipped.map((s, i) => <code key={i} className={styles.skippedLine}>{s}</code>)}
            </p>
          )}

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Block</th><th>Fix 1</th><th>Fix 2</th><th>Fix 3</th><th>Fix 4</th><th>Cam</th><th>Rack</th>
                </tr>
              </thead>
              <tbody>
                {preview.matches.map(({ block, entry, changes, changed }) => (
                  <tr key={block.id} className={changed ? '' : styles.unchangedRow}>
                    <td className={styles.blockCell}>
                      {entry.active && <StarSolid width={11} className={styles.star} />}
                      {block.no}
                    </td>
                    {FIX_FIELDS.map(f => (
                      <td key={f}>
                        {changes[f]
                          ? <span className={styles.diff}>{changes[f].from}% → <strong>{changes[f].to}%</strong></span>
                          : <span className={styles.same}>{entry[f] != null ? `${entry[f]}%` : '—'}</span>}
                      </td>
                    ))}
                    <td>
                      {changes.cam
                        ? <span className={styles.diff}>{changes.cam.from} → <strong>{changes.cam.to}</strong></span>
                        : <span className={styles.same}>{entry.cam ?? '—'}</span>}
                    </td>
                    <td>
                      {changes.rack
                        ? <span className={styles.diff}>{changes.rack.from} → <strong>{changes.rack.to}</strong></span>
                        : <span className={styles.same}>{entry.rack ?? '—'}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.applyRow}>
            <span className={styles.applyMeta}>
              {changedCount} of {preview.matches.length} blocks have changes
            </span>
            <button className={styles.applyBtn} onClick={apply} disabled={applying}>
              <CheckIcon width={15} /> {applying ? 'Applying…' : 'Apply updates'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
