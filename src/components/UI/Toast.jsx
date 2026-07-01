import React from 'react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  InformationCircleIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { useToast } from '../../context/ToastContext';
import styles from './Toast.module.css';

const ICONS = {
  success: CheckCircleIcon,
  error:   ExclamationCircleIcon,
  info:    InformationCircleIcon,
  warning: ExclamationTriangleIcon,
};

function ToastItem({ id, message, type }) {
  const { dismiss } = useToast();
  const Icon = ICONS[type] ?? InformationCircleIcon;

  return (
    <div className={[styles.toast, styles[type]].join(' ')} role="alert">
      <Icon className={styles.icon} />
      <span className={styles.message}>{message}</span>
      <button className={styles.close} onClick={() => dismiss(id)} aria-label="Dismiss">
        <XMarkIcon width={14} />
      </button>
    </div>
  );
}

export default function ToastContainer() {
  const { toasts } = useToast();
  if (!toasts.length) return null;

  return (
    <div className={styles.container}>
      {toasts.map(t => <ToastItem key={t.id} {...t} />)}
    </div>
  );
}
