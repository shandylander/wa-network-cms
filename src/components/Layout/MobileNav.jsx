import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  HomeIcon, FolderIcon, ShieldCheckIcon, UsersIcon,
  UserGroupIcon, ClockIcon, CalendarDaysIcon, BanknotesIcon, ReceiptPercentIcon, CurrencyDollarIcon,
  EllipsisHorizontalIcon, XMarkIcon,
  UserCircleIcon, Cog6ToothIcon, ArrowRightOnRectangleIcon,
  DocumentMagnifyingGlassIcon, BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import styles from './MobileNav.module.css';

const MAIN_TABS = [
  { to: '/',         label: 'Home',     Icon: HomeIcon,        perm: 'view:dashboard' },
  { to: '/projects', label: 'Projects', Icon: FolderIcon,      perm: 'view:projects'  },
  { to: '/hse',      label: 'HSE',      Icon: ShieldCheckIcon, perm: 'view:hse'       },
  { to: '/workers',  label: 'Workers',  Icon: UsersIcon,       perm: 'manage:workers' },
];

const EMP_CHILDREN = [
  { to: '/attendance', label: 'Attendance', Icon: ClockIcon,          roles: ['owner','manager','supervisor','staff','subcon-admin'] },
  { to: '/leave',      label: 'Leave',      Icon: CalendarDaysIcon,   roles: ['owner','manager','supervisor','staff'] },
  { to: '/salary',     label: 'Salary',     Icon: BanknotesIcon,      roles: ['owner','manager'] },
  { to: '/petty-cash', label: 'Petty Cash', Icon: ReceiptPercentIcon, roles: ['owner','manager','supervisor','staff'] },
];

const EMP_ROUTES = ['/attendance', '/leave', '/salary', '/petty-cash'];

export default function MobileNav() {
  const { logout }       = useAuth();
  const { can, role }    = usePermissions();
  const navigate         = useNavigate();
  const { pathname }     = useLocation();
  const [drawer,  setDrawer]  = useState(false);
  const [empMenu, setEmpMenu] = useState(false);

  const handleLogout = async () => {
    setDrawer(false);
    await logout();
    navigate('/login');
  };

  const visibleTabs = MAIN_TABS.filter(t => !t.perm || can(t.perm));
  const visibleEmp  = EMP_CHILDREN.filter(c => c.roles.includes(role));
  const showEmp     = visibleEmp.length > 0;
  const empActive   = EMP_ROUTES.some(r => pathname.startsWith(r));

  const handleEmpTap = () => {
    if (visibleEmp.length === 1) {
      navigate(visibleEmp[0].to);
    } else {
      setEmpMenu(m => !m);
    }
  };

  return (
    <>
      {/* Employee sub-menu sheet */}
      {empMenu && (
        <div className={styles.empSheet}>
          {visibleEmp.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to}
              className={({ isActive }) => [styles.empSheetItem, isActive ? styles.empSheetActive : ''].join(' ')}
              onClick={() => setEmpMenu(false)}>
              <Icon width={18} />
              {label}
            </NavLink>
          ))}
        </div>
      )}

      <nav className={styles.nav}>
        {visibleTabs.slice(0, 3).map(({ to, label, Icon }) => (
          <NavLink key={to} to={to} end={to === '/'}
            className={({ isActive }) => [styles.tab, isActive ? styles.active : ''].join(' ')}
            onClick={() => setEmpMenu(false)}>
            <Icon className={styles.tabIcon} />
            <span className={styles.tabLabel}>{label}</span>
          </NavLink>
        ))}

        {/* Employees tab */}
        {showEmp && (
          <button
            className={[styles.tab, empActive ? styles.active : ''].join(' ')}
            onClick={handleEmpTap}
          >
            <UserGroupIcon className={styles.tabIcon} />
            <span className={styles.tabLabel}>Employees</span>
          </button>
        )}

        <button className={styles.tab} onClick={() => { setEmpMenu(false); setDrawer(true); }}>
          <EllipsisHorizontalIcon className={styles.tabIcon} />
          <span className={styles.tabLabel}>More</span>
        </button>
      </nav>

      {/* More drawer */}
      {drawer && (
        <div className={styles.overlay} onClick={() => setDrawer(false)}>
          <div className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <p className={styles.drawerTitle}>More</p>
              <button className={styles.drawerClose} onClick={() => setDrawer(false)}>
                <XMarkIcon width={20} />
              </button>
            </div>
            {/* Workers in More if not in main tabs */}
            {can('manage:workers') && visibleTabs.length >= 4 && (
              <NavLink to="/workers" className={styles.drawerItem} onClick={() => setDrawer(false)}>
                <UsersIcon width={20} /> Workers
              </NavLink>
            )}
            {can('view:claims') && (
              <NavLink to="/finance" className={styles.drawerItem} onClick={() => setDrawer(false)}>
                <CurrencyDollarIcon width={20} /> Finance
              </NavLink>
            )}
            {can('manage:customers') && (
              <NavLink to="/customers" className={styles.drawerItem} onClick={() => setDrawer(false)}>
                <BuildingOffice2Icon width={20} /> Customers
              </NavLink>
            )}
            {can('view:uploads-audit') && (
              <NavLink to="/audit" className={styles.drawerItem} onClick={() => setDrawer(false)}>
                <DocumentMagnifyingGlassIcon width={20} /> Uploads Audit
              </NavLink>
            )}
            <NavLink to="/profile" className={styles.drawerItem} onClick={() => setDrawer(false)}>
              <UserCircleIcon width={20} /> Profile
            </NavLink>
            {can('admin:settings') && (
              <NavLink to="/settings" className={styles.drawerItem} onClick={() => setDrawer(false)}>
                <Cog6ToothIcon width={20} /> Settings
              </NavLink>
            )}
            <button className={[styles.drawerItem, styles.drawerLogout].join(' ')} onClick={handleLogout}>
              <ArrowRightOnRectangleIcon width={20} /> Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
