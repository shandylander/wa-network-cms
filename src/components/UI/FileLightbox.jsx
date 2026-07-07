import React from 'react';
import { XMarkIcon, ArrowTopRightOnSquareIcon, DocumentIcon } from '@heroicons/react/24/outline';
import styles from './FileLightbox.module.css';

export const isImageUrl = (url) => !/\.pdf(\?|&|$)/i.test(decodeURIComponent(url ?? ''));

/* Full-screen viewer for uploaded receipts / MCs / documents.
   Images enlarge in-app; PDFs show an open-in-new-tab card. */
export default function FileLightbox({ url, caption, onClose }) {
  if (!url) return null;
  return (
    <div className={styles.overlay} onClick={onClose}>
      <button className={styles.close} onClick={onClose} aria-label="Close">
        <XMarkIcon width={26} />
      </button>
      {isImageUrl(url) ? (
        <img src={url} alt="" className={styles.img} onClick={e => e.stopPropagation()} />
      ) : (
        <div className={styles.pdfBox} onClick={e => e.stopPropagation()}>
          <DocumentIcon width={46} />
          <p>PDF document</p>
        </div>
      )}
      <div className={styles.captionRow} onClick={e => e.stopPropagation()}>
        {caption && <span className={styles.caption}>{caption}</span>}
        <a href={url} target="_blank" rel="noreferrer" className={styles.openLink}>
          <ArrowTopRightOnSquareIcon width={15} /> Open full size
        </a>
      </div>
    </div>
  );
}
