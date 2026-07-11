import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import styles from './Modal.module.css';

export default function Modal({ isOpen, onClose, title, children, size = 'md' }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    // The "print-modal-*" classes are deliberately plain (not CSS-module
    // scoped) global hooks — a page that needs to print a modal's content
    // (e.g. JobSummary) lives in a different CSS module and can't target
    // Modal.module.css's hashed class names directly. Any print stylesheet
    // can reset these three to escape the fixed/overflow-clipped screen
    // chrome, which otherwise silently truncates tall printed content.
    <div className={`${styles.overlay} print-modal-overlay`} onClick={onClose}>
      <div
        className={[styles.modal, styles[size], 'print-modal-shell'].join(' ')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        <div className={styles.header}>
          <h2 className={styles.title} id="modal-title">{title}</h2>
          <button className={styles.close} onClick={onClose} aria-label="Close">
            <XMarkIcon width={18} />
          </button>
        </div>
        <div className={`${styles.body} print-modal-body`}>{children}</div>
      </div>
    </div>
  );
}
