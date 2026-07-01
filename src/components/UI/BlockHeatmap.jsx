import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getStageStatus, getOverallProgress } from '../../utils/helpers';
import styles from './BlockHeatmap.module.css';

const STATUS_COLOR = {
  'stage2-complete': styles.complete,
  'stage1-complete': styles.stage1,
  'in-progress':      styles.progress,
  'not-started':       styles.notStarted,
};

const STATUS_LABEL = {
  'not-started':      'Not started',
  'in-progress':      'In progress',
  'stage1-complete':  'Stage 1 done',
  'stage2-complete':  'Stage 2 done',
};

export default function BlockHeatmap({ blocks, projectId }) {
  const navigate = useNavigate();
  if (!blocks || blocks.length === 0) return null;

  const sorted = [...blocks].sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true }));

  return (
    <div className={styles.wrap}>
      <div className={styles.legend}>
        {Object.entries(STATUS_LABEL).map(([key, label]) => (
          <span key={key} className={styles.legendItem}>
            <span className={[styles.legendDot, STATUS_COLOR[key]].join(' ')} />
            {label}
          </span>
        ))}
      </div>
      <div className={styles.grid}>
        {sorted.map(b => {
          const status = getStageStatus(b);
          return (
            <button
              key={b.id}
              type="button"
              className={[styles.cell, STATUS_COLOR[status]].join(' ')}
              title={`Blk ${b.no} — ${STATUS_LABEL[status]} (${getOverallProgress(b)}%)`}
              onClick={() => navigate(`/projects/${projectId}`)}
            >
              {b.no}
            </button>
          );
        })}
      </div>
    </div>
  );
}
