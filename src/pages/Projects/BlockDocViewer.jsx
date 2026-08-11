import React, { useState } from 'react';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { pdfEmbedUrl } from '../../utils/docViewer';
import styles from './BlockTracker.module.css';

// Shared by BlockTracker (desktop table's document icon) and BlockModal (the
// quick-link buttons, which are the only path to this on mobile — the
// table's own document column is CSS-hidden below the desktop breakpoint).

/* ── In-app document viewer ───────────────────────────────────────── */
export function DocViewerModal({ block, onClose }) {
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
            src={pdfEmbedUrl(current.url)}
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
