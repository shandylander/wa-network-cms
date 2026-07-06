import React, { useState } from 'react';
import { DocumentIcon, XMarkIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import Badge from '../../components/UI/Badge';
import { certStatus, certShort, certLabel } from '../../utils/certTypes';
import styles from './CertChips.module.css';

const STATUS_META = {
  valid:    { color: 'green',   label: 'Valid'    },
  expiring: { color: 'amber',   label: 'Expiring' },
  expired:  { color: 'red',     label: 'Expired'  },
  none:     { color: 'default', label: 'No expiry' },
};

const isImageUrl = (url) => !/\.pdf(\?|$)/i.test(url ?? '');

/* Clickable certificate chips for a worker row; tapping opens a viewer. */
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

      {viewing && (
        <div className={styles.overlay} onClick={(e) => { e.stopPropagation(); setViewing(null); }}>
          <div className={styles.viewer} onClick={e => e.stopPropagation()}>
            <div className={styles.viewerHead}>
              <div>
                <p className={styles.viewerTitle}>{certLabel(viewing, certTypes)}</p>
                <p className={styles.viewerSub}>{worker.name}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setViewing(null)} aria-label="Close">
                <XMarkIcon width={20} />
              </button>
            </div>

            <div className={styles.viewerMeta}>
              <Badge color={STATUS_META[certStatus(viewing.expiry)].color}>
                {STATUS_META[certStatus(viewing.expiry)].label}
              </Badge>
              {viewing.expiry && <span className={styles.expiry}>Expires {viewing.expiry}</span>}
            </div>

            {viewing.url ? (
              <>
                {isImageUrl(viewing.url) ? (
                  <img src={viewing.url} alt="" className={styles.certImg} />
                ) : (
                  <div className={styles.pdfBox}>
                    <DocumentIcon width={40} />
                    <span>{viewing.fileName ?? 'PDF document'}</span>
                  </div>
                )}
                <a href={viewing.url} target="_blank" rel="noreferrer" className={styles.openBtn}>
                  <ArrowTopRightOnSquareIcon width={15} /> Open full size
                </a>
              </>
            ) : (
              <p className={styles.noFile}>No file uploaded for this certificate.</p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
