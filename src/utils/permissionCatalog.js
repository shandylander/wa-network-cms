// Single source of truth for every permission key in the Access Levels
// system — used by the Access Levels Manager (checklist), the live
// Permissions matrix (rows), and the one-time seed/backfill script.
//
// `seedRoles` is only used once, to build the initial per-role Access
// Levels during migration so nobody's access changes at cutover — it has
// no ongoing effect afterward. Role no longer auto-grants permissions;
// access is purely the union of a user's assigned Access Levels.

export const PERMISSION_CATALOG = [
  // Dashboard & Projects
  { key: 'view:dashboard',     label: 'View Dashboard',              area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'view:projects',      label: 'View Projects',               area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'] },
  { key: 'update:blocks',      label: 'Update Block Progress',       area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'] },
  { key: 'manage:blocks',      label: 'Add / Remove Blocks',         area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'] },
  { key: 'blocks:assign-team', label: 'Assign Block Teams',          area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'blocks:delete',      label: 'Delete Blocks',               area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'] },
  { key: 'blocks:bulk-edit',   label: 'Bulk Edit Blocks',            area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'generate:reports',   label: 'Generate WhatsApp Reports',   area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'manage:customers',   label: 'Manage Customers',            area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'] },
  // Key deliberately kept as 'manage:service-reports' even though the
  // collection is now serviceJobs — renaming the key would orphan any
  // Access Level grant already made against it (RBAC grants happen via the
  // in-app Settings UI, not by this codebase, so a rename can't be
  // re-applied automatically).
  { key: 'manage:service-reports', label: 'Manage Service Jobs',     area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor', 'staff'] },
  { key: 'jobs:assign',            label: 'Schedule / Assign Jobs',  area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'jobs:vet',               label: 'Vet Completed Jobs',      area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'] },

  // Finance & Claims
  { key: 'view:claims',           label: 'View Finance & Claims',      area: 'Finance & Claims', seedRoles: ['owner', 'manager'] },
  { key: 'materials:view',        label: 'View Materials & DO',        area: 'Finance & Claims', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'materials:approve',     label: 'Approve Material Orders',    area: 'Finance & Claims', seedRoles: ['owner', 'manager'] },
  { key: 'materials:view-costs',  label: 'View Material Costs',        area: 'Finance & Claims', seedRoles: ['owner', 'manager'] },
  { key: 'salary:config',         label: 'Configure Pay Rates',        area: 'Finance & Claims', seedRoles: ['owner', 'manager'] },
  { key: 'salary:manage-payslips',label: 'Generate Payslips',          area: 'Finance & Claims', seedRoles: ['owner', 'manager'] },
  { key: 'pettycash:approve',     label: 'Approve Petty Cash Claims',  area: 'Finance & Claims', seedRoles: ['owner', 'manager', 'supervisor'] },

  // Workers & HSE
  { key: 'manage:workers',            label: 'Manage Workers',              area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'subcon-admin'] },
  { key: 'workers:assign-any-team',   label: 'Assign Worker To Any Team',   area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'workers:manage-cert-types', label: 'Manage Certificate Types',    area: 'Workers & HSE', seedRoles: ['owner', 'manager'] },
  { key: 'view:hse',                  label: 'View Resources',              area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'] },
  { key: 'sitephotos:approve',        label: 'Approve Site Photos',         area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'snags:manage-status',       label: 'Manage Snag Status',          area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'toolbox:manage',            label: 'Log Toolbox Meetings',        area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'approve:permits',           label: 'Approve Permits (PTW)',       area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'incidents:view',            label: 'View Incident Reports',       area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor', 'staff'] },

  // Attendance & Leave
  { key: 'attendance:manage',       label: 'Manage Team Attendance',       area: 'Attendance & Leave', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'attendance:photo-review', label: 'Review Attendance Photos',     area: 'Attendance & Leave', seedRoles: ['owner', 'manager'] },
  { key: 'leave:approve',           label: 'Approve Leave Applications',   area: 'Attendance & Leave', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'leave:settings',          label: 'Configure Leave Entitlements', area: 'Attendance & Leave', seedRoles: ['owner', 'manager'] },

  // Announcements
  { key: 'manage:announcements',   label: 'Post Announcements',      area: 'Announcements', seedRoles: ['owner', 'manager'] },
  { key: 'view:management-alerts', label: 'View Management Alerts',  area: 'Announcements', seedRoles: ['owner', 'manager', 'supervisor'] },

  // Administration
  { key: 'create:subaccounts', label: 'Create Sub-accounts', area: 'Administration', seedRoles: ['owner', 'manager', 'subcon-admin'] },
  { key: 'reset:pins',         label: 'Reset PINs',          area: 'Administration', seedRoles: ['owner', 'manager', 'subcon-admin'] },
  { key: 'admin:settings',     label: 'System Settings',     area: 'Administration', seedRoles: ['owner'] },
  { key: 'view:uploads-audit', label: 'View Uploads Audit',  area: 'Administration', seedRoles: ['owner', 'manager'] },
];

export const PERMISSION_AREAS = [...new Set(PERMISSION_CATALOG.map(p => p.area))];

// The 6 seeded, role-named Access Levels created once during migration.
// After seeding they're ordinary editable levels like any other — nothing
// in the data model distinguishes a "role level" from a custom one.
export const ROLE_LEVEL_SEED = {
  owner:          { id: 'role-owner',        label: 'Owner Access',         color: '#6d3fa8' },
  manager:        { id: 'role-manager',      label: 'Manager Access',      color: '#1a5fa8' },
  supervisor:     { id: 'role-supervisor',   label: 'Supervisor Access',   color: '#1a8a5a' },
  staff:          { id: 'role-staff',        label: 'Staff Access',        color: '#d97b00' },
  'subcon-admin': { id: 'role-subcon-admin', label: 'Sub-con Admin Access',color: '#c2185b' },
  subcon:         { id: 'role-subcon',       label: 'Sub-con Access',      color: '#5a6577' },
};

// Builds the 6 seed levels' permission lists from PERMISSION_CATALOG's
// seedRoles, so the migration reproduces today's real access exactly.
export function buildSeedLevels() {
  const byRole = {};
  Object.keys(ROLE_LEVEL_SEED).forEach(role => { byRole[role] = new Set(); });
  PERMISSION_CATALOG.forEach(({ key, seedRoles }) => {
    seedRoles.forEach(role => { if (byRole[role]) byRole[role].add(key); });
  });
  return Object.entries(ROLE_LEVEL_SEED).map(([role, meta]) => ({
    id: meta.id,
    label: meta.label,
    color: meta.color,
    permissions: [...byRole[role]].sort(),
  }));
}
