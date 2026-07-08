import React from 'react';
import { Link } from 'react-router-dom';
import { UsersIcon, ShieldCheckIcon, KeyIcon } from '@heroicons/react/24/outline';
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
];

export default function Settings() {
  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        {SETTING_CARDS.map(({ to, Icon, title, desc }) => (
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
