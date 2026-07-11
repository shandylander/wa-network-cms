import React, { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import logo from '../../assets/logo.png';
import { VERSION_LABEL } from '../../utils/version';
import {
  HomeIcon,
  FolderIcon,
  BuildingOffice2Icon,
  UsersIcon,
  UserGroupIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  ClockIcon,
  CalendarDaysIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  CurrencyDollarIcon,
  DocumentMagnifyingGlassIcon,
  WrenchScrewdriverIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import { usePermissions } from '../../hooks/usePermissions';
import { ROLES, TEAMS } from '../../utils/permissions';
import Badge from '../UI/Badge';
import styles from './Sidebar.module.css';

// Employee sub-items — access controlled per item inside the group
const EMP_CHILDREN = [
  { to: '/attendance', label: 'Attendance', Icon: ClockIcon,          roles: ['owner','manager','supervisor','staff','subcon-admin'] },
  { to: '/leave',      label: 'Leave',      Icon: CalendarDaysIcon,   roles: ['owner','manager','supervisor','staff'] },
  { to: '/salary',     label: 'Salary',     Icon: BanknotesIcon,      roles: ['owner','manager'] },
  { to: '/petty-cash', label: 'Petty Cash', Icon: ReceiptPercentIcon, roles: ['owner','manager','supervisor','staff'] },
];

const NAV = [
  { to: '/',        label: 'Dashboard', Icon: HomeIcon,           perm: 'view:dashboard' },
  { to: '/projects',label: 'Projects',  Icon: FolderIcon,         perm: 'view:projects'  },
  { to: '/customers',label: 'Customers',Icon: BuildingOffice2Icon,perm: 'manage:customers' },
  { to: '/workers', label: 'Workers',   Icon: UsersIcon,          perm: 'manage:workers' },
  { to: '/hse',     label: 'HSE',       Icon: ShieldCheckIcon,    perm: 'view:hse'       },
  { to: '/finance', label: 'Finance',   Icon: CurrencyDollarIcon, perm: 'view:claims'    },
  { to: '/announcements', label: 'Announcements', Icon: MegaphoneIcon }, // no perm — every signed-in user can read
];

const ACCOUNT = [
  { to: '/profile',  label: 'Profile',  Icon: UserCircleIcon },
  { to: '/settings', label: 'Settings', Icon: Cog6ToothIcon, perm: 'admin:settings' },
];

const EMP_ROUTES = ['/attendance', '/leave', '/salary', '/petty-cash'];

export default function Sidebar() {
  const { userProfile, logout } = useAuth();
  const { can, role, team }     = usePermissions();
  const navigate   = useNavigate();
  const { pathname } = useLocation();

  const onEmpRoute = EMP_ROUTES.some(r => pathname.startsWith(r));
  const [empOpen, setEmpOpen] = useState(onEmpRoute);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const roleInfo = ROLES[role] ?? { label: role, color: 'default' };

  // Visible employee children for this role
  const visibleEmpChildren = EMP_CHILDREN.filter(c => c.roles.includes(role));
  const showEmpGroup = visibleEmpChildren.length > 0;

  return (
    <aside className={styles.sidebar}>
      {/* Logo */}
      <div className={styles.logoWrap}>
        <div className={styles.logoImgWrap}>
          <img src={logo} alt="WA! Network Asia" className={styles.logoImg} />
        </div>
        <span className={styles.logoCms}>PORTAL</span>
      </div>
      <span className={styles.versionTag}>{VERSION_LABEL}</span>

      {/* Main nav */}
      <nav className={styles.nav}>
        <p className={styles.navLabel}>Main</p>

        {/* Dashboard + Projects */}
        {NAV.slice(0, 2).map(({ to, label, Icon, perm }) => {
          // Dashboard's route itself isn't permission-gated (staff land on
          // WorkerHome there instead of the admin dashboard) — don't hide
          // the link for them just because they lack view:dashboard.
          if (perm && !can(perm) && !(to === '/' && role === 'staff')) return null;
          return (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
              <Icon className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          );
        })}

        {/* Employees expandable group */}
        {showEmpGroup && (
          <div className={styles.navGroup}>
            <button
              className={[styles.navItem, styles.navGroupHead, onEmpRoute ? styles.groupActive : ''].join(' ')}
              onClick={() => setEmpOpen(o => !o)}
            >
              <UserGroupIcon className={styles.navIcon} />
              <span className={styles.groupLabel}>Employees</span>
              {empOpen
                ? <ChevronDownIcon  className={styles.chevron} />
                : <ChevronRightIcon className={styles.chevron} />
              }
            </button>

            {empOpen && (
              <div className={styles.navGroupChildren}>
                {visibleEmpChildren.map(({ to, label, Icon }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) => [styles.navChild, isActive ? styles.childActive : ''].join(' ')}>
                    <Icon className={styles.navChildIcon} />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Workers + HSE */}
        {NAV.slice(2).map(({ to, label, Icon, perm }) => {
          if (perm && !can(perm)) return null;
          return (
            <NavLink key={to} to={to}
              className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
              <Icon className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          );
        })}

        {/* Jobs board — whoever can schedule or vet jobs */}
        {(can('jobs:assign') || can('jobs:vet')) && (
          <NavLink to="/jobs"
            className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <WrenchScrewdriverIcon className={styles.navIcon} />
            <span>Jobs</span>
          </NavLink>
        )}

        {/* Uploads audit — management only */}
        {can('view:uploads-audit') && (
          <NavLink to="/audit"
            className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
            <DocumentMagnifyingGlassIcon className={styles.navIcon} />
            <span>Uploads Audit</span>
          </NavLink>
        )}

        <p className={styles.navLabel} style={{ marginTop: 8 }}>Account</p>
        {ACCOUNT.map(({ to, label, Icon, perm }) => {
          if (perm && !can(perm)) return null;
          return (
            <NavLink key={to} to={to}
              className={({ isActive }) => [styles.navItem, isActive ? styles.active : ''].join(' ')}>
              <Icon className={styles.navIcon} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User footer */}
      <div className={styles.footer}>
        <div className={styles.userInfo}>
          <div className={styles.avatar}>{userProfile?.name?.charAt(0) ?? '?'}</div>
          <div className={styles.userDetails}>
            <p className={styles.userName}>{userProfile?.name}</p>
            <p className={styles.userMeta}>{TEAMS[team] ?? team}</p>
          </div>
        </div>
        <Badge color={roleInfo.color} className={styles.roleBadge}>{roleInfo.label}</Badge>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          <ArrowRightOnRectangleIcon width={15} /> Sign out
        </button>
      </div>
    </aside>
  );
}
