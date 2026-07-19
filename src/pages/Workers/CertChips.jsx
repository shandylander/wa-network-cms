import React, { useState } from 'react';
import { certStatus, certShort, certLabel } from '../../utils/certTypes';
import DocumentViewerModal from '../../components/UI/DocumentViewerModal';
import styles from './CertChips.module.css';

/* Clickable certificate chips for a worker row; tapping opens the shared
   in-app document viewer (same one used by Resources/ProjectDocuments/
   Profile) instead of a hand-rolled preview. */
export default function CertChips({ worker, certTypes }) {
  const [viewing, setViewing] = useState(null); // cert being viewed

  const certs = worker.certs ?? [];
  if (certs.length === 0) return <span className={styles.none}>—</span>;

  return (
    <>
      <div className={styles.chips}>
        {certs.map((c, i) => {
          const st = certStatus(c.expiry);
          return (
            <button
              key={i}
              className={[styles.chip, styles[`chip_${st}`]].join(' ')}
              onClick={(e) => { e.stopPropagation(); setViewing(c); }}
              title={`${certLabel(c, certTypes)}${c.expiry ? ` · expires ${c.expiry}` : ''}`}
            >
              {certShort(c, certTypes)}
            </button>
          );
        })}
      </div>

      <DocumentViewerModal
        doc={viewing ? { ...viewing, name: certLabel(viewing, certTypes) } : null}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
