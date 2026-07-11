import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar   from './Sidebar';
import MobileNav from './MobileNav';
import Header    from './Header';
import NotificationPrompt from './NotificationPrompt';
import styles    from './Layout.module.css';

export default function Layout() {
  return (
    <div className={styles.shell}>
      <Sidebar />
      <div className={styles.main}>
        <Header />
        <NotificationPrompt />
        <main className={styles.content}>
          <Outlet />
        </main>
      </div>
      <MobileNav />
    </div>
  );
}
