import React, { useState } from 'react';
import { doc, addDoc, updateDoc, deleteDoc, collection } from 'firebase/firestore';
import { ExclamationTriangleIcon, LockClosedIcon, DocumentTextIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { db } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { usePermissions } from '../../hooks/usePermissions';
import { useTeamGroups } from '../../hooks/useTeamGroups';
import { formatDate } from '../../utils/helpers';
import Modal from '../../components/UI/Modal';
import Button from '../../components/UI/Button';
import styles from './BlockModal.module.css';

const QUICK          = [0, 25, 50, 75, 100];
const EMPTY_BLOCK    = { no: '', type: 'RESIDENTIAL', street: '', survey: 'ip', team: '', cam: 0, rack: '', fix1: 0, fix2: 0, fix3: 0, fix4: 0, surveyUrl: '', floorplanUrl: '', cluster: '' };

function ProgressField({ label, value, onChange }) {
  return (
    <div className={styles.progField}>
      <div className={styles.progHeader}>
        <span className={styles.progLabel}>{label}</span>
        <span className={styles.progVal}>{value}%</span>
      </div>
      <input
        type="range" min={0} max={100} step={5}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={styles.slider}
      />
      <div className={styles.quickBtns}>
        {QUICK.map(q => (
          <button
            key={q} type="button"
            className={[styles.quick, value === q ? styles.quickActive : ''].join(' ')}
            onClick={() => onChange(q)}
          >
            {q}%
          </button>
        ))}
      </div>
    </div>
  );
}

export default function BlockModal({
  block,          // undefined when mode='add'
  projectId,
  onClose,
  onSaved,        // (updatedBlock) => void
  onDeleted,      // (blockId) => void — optional
  userRole,
  existingStreets = [],   // for datalist autocomplete
  existingClusters = [],  // for datalist autocomplete
  mode = 'edit',
}) {
  const { userProfile } = useAuth();
  const { toast }       = useToast();
  const { can }         = usePermissions();
  const { teamOptions, teams: TEAMS } = useTeamGroups();

  const canAssign = can('blocks:assign-team');
  const canManage = can('blocks:delete');

  const [form, setForm] = useState(
    mode === 'add'
      ? { ...EMPTY_BLOCK }
      : {
          team:   block.team   ?? '',
          survey: block.survey ?? 'ip',
          cam:    block.cam    ?? 0,
          rack:   block.rack   ?? '',
          fix1:   block.fix1   ?? 0,
          fix2:   block.fix2   ?? 0,
          fix3:   block.fix3   ?? 0,
          fix4:   block.fix4   ?? 0,
          // edit-only extra fields
          no:          block.no          ?? '',
          type:        block.type        ?? 'RESIDENTIAL',
          street:      block.street      ?? '',
          surveyUrl:   block.surveyUrl   ?? '',
          floorplanUrl: block.floorplanUrl ?? '',
          cluster:     block.cluster     ?? '',
        }
  );
  const [saving,    setSaving]    = useState(false);
  const [delStep,   setDelStep]   = useState(false); // two-step delete
  const [deleting,  setDeleting]  = useState(false);
  const [reopening, setReopening] = useState(false);

  const set    = (key) => (val) => setForm(f => ({ ...f, [key]: val }));
  const setE   = (key) => (e)   => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSave = async () => {
    if (mode === 'add' && !form.no.trim()) { toast.error('Block number is required'); return; }
    if (mode === 'add' && !form.street.trim()) { toast.error('Street is required'); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        no:  form.no.trim().toUpperCase(),
        cam: Number(form.cam),
        cluster: form.cluster.trim() || null,
        updatedAt: new Date(),
        updatedBy: userProfile.userId,
      };
      if (mode === 'add') {
        const ref = await addDoc(collection(db, 'projects', projectId, 'blocks'), payload);
        toast.success(`Block ${payload.no} added`);
        onSaved({ id: ref.id, ...payload });
      } else {
        await updateDoc(doc(db, 'projects', projectId, 'blocks', block.id), payload);
        toast.success(`Block ${payload.no} updated`);
        onSaved({ ...block, ...payload });
      }
      onClose();
    } catch {
      toast.error(mode === 'add' ? 'Failed to add block' : 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    setReopening(true);
    try {
      const patch = { clusterClosedAt: null, clusterClosedBy: null };
      await updateDoc(doc(db, 'projects', projectId, 'blocks', block.id), patch);
      toast.success('Cluster reopened');
      onSaved({ ...block, ...patch });
      onClose();
    } catch {
      toast.error('Failed to reopen cluster');
    } finally {
      setReopening(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'projects', projectId, 'blocks', block.id));
      toast.success(`Block ${block.no} removed`);
      onDeleted?.(block.id);
      onClose();
    } catch {
      toast.error('Failed to delete block');
      setDeleting(false);
    }
  };

  const isAdd = mode === 'add';

  return (
    <Modal isOpen onClose={onClose} title={isAdd ? 'Add Block' : `Block ${block.no}`} size="md">

      {/* Block identity — editable in add mode; shown as read-only header in edit mode */}
      {!isAdd && (
        <div className={styles.blockMeta}>
          <span className={styles.metaType}>{block.type}</span>
          <span className={styles.metaStreet}>{block.street}</span>
        </div>
      )}

      {/* Quick-open document links — visible to everyone who can open this block
          (not just canAssign editors), since field staff on site need this most. */}
      {!isAdd && (block.surveyUrl || block.floorplanUrl) && (
        <div className={styles.docQuickLinks}>
          {block.surveyUrl && (
            <a href={block.surveyUrl} target="_blank" rel="noreferrer" className={styles.docQuickLink}>
              <DocumentTextIcon width={17} />
              Survey Report
              <ArrowTopRightOnSquareIcon width={13} className={styles.docQuickLinkExt} />
            </a>
          )}
          {block.floorplanUrl && (
            <a href={block.floorplanUrl} target="_blank" rel="noreferrer" className={styles.docQuickLink}>
              <DocumentTextIcon width={17} />
              Floor Plan
              <ArrowTopRightOnSquareIcon width={13} className={styles.docQuickLinkExt} />
            </a>
          )}
        </div>
      )}

      {isAdd && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Block Details</h4>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Block Number *</label>
              <input
                className={styles.input}
                value={form.no}
                onChange={setE('no')}
                placeholder="e.g. 322 or 302A"
                autoFocus
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Type</label>
              <select className={styles.select} value={form.type} onChange={setE('type')}>
                <option value="RESIDENTIAL">Residential</option>
                <option value="MSCP">MSCP</option>
              </select>
            </div>
          </div>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.label}>Street *</label>
            <input
              className={styles.input}
              value={form.street}
              onChange={setE('street')}
              placeholder="e.g. Woodlands Avenue 1"
              list="street-list"
            />
            <datalist id="street-list">
              {existingStreets.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
        </div>
      )}

      {/* Assignment */}
      {canAssign && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Assignment</h4>
          <div className={styles.row2}>
            <div className={styles.field}>
              <label className={styles.label}>Team</label>
              <select className={styles.select} value={form.team} onChange={setE('team')}>
                <option value="">Unassigned</option>
                {teamOptions.map(t => <option key={t} value={t}>{TEAMS[t] ?? t}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Survey</label>
              <select className={styles.select} value={form.survey} onChange={setE('survey')}>
                <option value="done">Surveyed</option>
                <option value="ip">In Progress</option>
                <option value="bto">BTO</option>
              </select>
            </div>
          </div>
          <div className={styles.field} style={{ marginTop: 12 }}>
            <label className={styles.label}>Cluster <span className={styles.opt}>(optional — defaults to street)</span></label>
            <input
              className={styles.input}
              value={form.cluster}
              onChange={setE('cluster')}
              placeholder={form.street || block?.street || ''}
              list="cluster-list"
            />
            <datalist id="cluster-list">
              {existingClusters.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
        </div>
      )}

      {!isAdd && block.clusterClosedAt && (
        <div className={styles.section}>
          <div className={styles.closedBanner}>
            <LockClosedIcon width={14} className={styles.closedIcon} />
            <span>
              Cluster closed {formatDate(block.clusterClosedAt)}
              {block.clusterClosedBy ? ` by ${block.clusterClosedBy}` : ''}
            </span>
            {canManage && (
              <button className={styles.reopenBtn} onClick={handleReopen} disabled={reopening}>
                {reopening ? 'Reopening…' : 'Reopen'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progress */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Installation Progress</h4>
        <ProgressField label="Fix 1 — Conduit"        value={form.fix1} onChange={set('fix1')} />
        <ProgressField label="Fix 2 — CAT6 cable"     value={form.fix2} onChange={set('fix2')} />
        <ProgressField label="Fix 3 — Server rack"    value={form.fix3} onChange={set('fix3')} />
        <ProgressField label="Fix 4 — Camera install" value={form.fix4} onChange={set('fix4')} />
      </div>

      {/* Camera details */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>Camera Details</h4>
        <div className={styles.row2}>
          <div className={styles.field}>
            <label className={styles.label}>Camera Count</label>
            <input
              type="number" min={0}
              className={styles.input}
              value={form.cam}
              onChange={e => setForm(f => ({ ...f, cam: e.target.value }))}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Rack Type</label>
            <select className={styles.select} value={form.rack} onChange={setE('rack')}>
              <option value="">—</option>
              <option value="O">Outdoor (O)</option>
              <option value="I">Indoor (I)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Block documents — survey report + floor plan URLs */}
      {canAssign && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>Block Documents</h4>
          <div className={styles.field} style={{ marginBottom: 10 }}>
            <label className={styles.label}>Survey Report URL</label>
            <input
              className={styles.input}
              value={form.surveyUrl}
              onChange={setE('surveyUrl')}
              placeholder="Dropbox or Google Drive link to PDF"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Floor Plan URL</label>
            <input
              className={styles.input}
              value={form.floorplanUrl}
              onChange={setE('floorplanUrl')}
              placeholder="Dropbox or Google Drive link to PDF"
            />
          </div>
        </div>
      )}

      {/* Delete zone (edit mode, owner/manager only) */}
      {!isAdd && canManage && (
        <div className={styles.deleteZone}>
          {!delStep ? (
            <button className={styles.deleteBtn} onClick={() => setDelStep(true)}>
              Remove this block
            </button>
          ) : (
            <div className={styles.deleteConfirm}>
              <ExclamationTriangleIcon width={16} className={styles.warnIcon} />
              <span>Remove block <strong>{block.no}</strong> and all its progress data?</span>
              <div className={styles.deleteActions}>
                <button className={styles.cancelDelBtn} onClick={() => setDelStep(false)}>Keep</button>
                <button className={styles.confirmDelBtn} onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Removing…' : 'Yes, Remove'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>
          {isAdd ? 'Add Block' : 'Save Changes'}
        </Button>
      </div>
    </Modal>
  );
}
