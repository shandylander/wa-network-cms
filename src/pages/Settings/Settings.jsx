import React from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, ShieldCheckIcon, KeyIcon, DocumentMagnifyingGlassIcon, BookOpenIcon } from '@heroicons/react/24/outline';
import { usePermissions } from '../../hooks/usePermissions';
import styles from './Settings.module.css';

const SETTING_CARDS = [
  {
    to: '/settings/users',
    Icon: UsersIcon,
    title: 'User Management',
    desc: 'Create accounts, reset PINs, and manage user roles.',
  },
  {
    to: '/settings/access-levels',
    Icon: KeyIcon,
    title: 'Access Levels',
    desc: 'Create named permission bundles and assign them to users.',
  },
  {
    to: '/settings/permissions',
    Icon: ShieldCheckIcon,
    title: 'Permissions',
    desc: 'Live matrix of what each Access Level grants.',
  },
  {
    to: '/help',
    Icon: BookOpenIcon,
    title: 'User Guide',
    desc: 'Full reference guide for every module in the admin panel.',
  },
];

const UPLOADS_AUDIT_CARD = {
  to: '/audit',
  Icon: DocumentMagnifyingGlassIcon,
  title: 'Uploads Audit',
  desc: 'Review recent file uploads across the CMS.',
};

export default function Settings() {
  const { can } = usePermissions();
  const cards = can('view:uploads-audit') ? [...SETTING_CARDS, UPLOADS_AUDIT_CARD] : SETTING_CARDS;

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        {cards.map(({ to, Icon, title, desc }) => (
          <Link key={to} to={to} className={styles.card}>
            <Icon className={styles.cardIcon} />
            <h3 className={styles.cardTitle}>{title}</h3>
            <p className={styles.cardDesc}>{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
