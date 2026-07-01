import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationBell from './NotificationBell';
import styles from './Header.module.css';

const TITLES = {
  '/':               'Dashboard',
  '/projects':       'Projects',
  '/attendance':     'Attendance',
  '/leave':          'Leave Management',
  '/salary':         'Salary Calculator',
  '/petty-cash':     'Petty Cash Claims',
  '/finance':        'Finance Overview',
  '/workers':        'Workers',
  '/hse':            'HSE',
  '/profile':        'Profile',
  '/settings':       'Settings',
  '/settings/users': 'User Management',
};

export default function Header() {
  const { userProfile } = useAuth();
  const { pathname }    = useLocation();

  const title = Object.entries(TITLES)
    .filter(([path]) => pathname === path || pathname.startsWith(path + '/'))
    .sort((a, b) => b[0].length - a[0].length)[0]?.[1] ?? 'CentralOps';

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <h1 className={styles.title}>{title}</h1>
      </div>
      <div className={styles.right}>
        <NotificationBell />
        <div className={styles.user}>
          <div className={styles.avatar}>{userProfile?.name?.charAt(0) ?? '?'}</div>
          <span className={styles.name}>{userProfile?.name}</span>
        </div>
      </div>
    </header>
  );
}
