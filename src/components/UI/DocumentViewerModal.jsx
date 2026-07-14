import React from 'react';
import { ArrowDownTrayIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import Modal from './Modal';
import { docKind, viewableUrl } from '../../utils/docViewer';
import styles from './DocumentViewerModal.module.css';

// Shared in-app previewer for a document row's "Open" action — used by
// ProjectDocuments, ResourcesHome (library + RA), CustomerDocuments and
// JobDetail's reference-docs panel so a tap doesn't drop the worker straight
// into a forced file download. PDFs and images render inline; anything else
// (docx/xlsx/pptx — no reliable in-browser renderer without a third-party
// viewer service) falls back to a clear "Open in new tab" action instead of
// a blank frame.
export default function DocumentViewerModal({ doc, onClose }) {
  const kind = doc ? docKind(doc.fileName ?? doc.name, doc.url) : null;
  const src  = doc ? viewableUrl(doc.url) : null;

  return (
    <Modal isOpen={!!doc} onClose={onClose} title={doc?.name ?? 'Document'} size="xl">
      {doc && (
        <>
          {kind === 'pdf' && (
            <iframe src={src} title={doc.name} className={styles.frame} />
          )}
          {kind === 'image' && (
            <img src={src} alt={doc.name} className={styles.img} />
          )}
          {kind === 'other' && (
            <div className={styles.fallback}>
              <p>This file type can't be previewed in the app.</p>
              <a href={doc.url} target="_blank" rel="noreferrer" className={styles.fallbackBtn}>
                <ArrowTopRightOnSquareIcon width={16} /> Open in new tab
              </a>
            </div>
          )}
          <div className={styles.footer}>
            <a href={doc.url} target="_blank" rel="noreferrer" className={styles.downloadLink}>
              <ArrowDownTrayIcon width={14} /> Download
            </a>
          </div>
        </>
      )}
    </Modal>
  );
}
