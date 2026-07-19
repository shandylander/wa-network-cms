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
  { key: 'view:dashboard',     label: 'View Dashboard',              area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'], description: 'See the company-wide dashboard — KPIs, the Needs Attention feed, and project overview cards.' },
  { key: 'view:projects',      label: 'View Projects',               area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'], description: 'Open the Projects list and project detail pages (sub-cons only see projects their team is assigned to).' },
  { key: 'update:blocks',      label: 'Update Block Progress',       area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'], description: 'Update fix1–fix4 progress on blocks — limited to blocks assigned to your own team.' },
  { key: 'manage:blocks',      label: 'Add / Remove Blocks',         area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'], description: 'Add new blocks to a project, and edit project-level settings like Notes and team assignments.' },
  { key: 'blocks:assign-team', label: 'Assign Block Teams',          area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Change which sub-con team is responsible for a given block.' },
  { key: 'blocks:delete',      label: 'Delete Blocks',               area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'], description: 'Permanently remove a block from a project.' },
  { key: 'blocks:bulk-edit',   label: 'Bulk Edit Blocks',            area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Edit multiple blocks at once instead of one at a time.' },
  { key: 'generate:reports',   label: 'Generate WhatsApp Reports',   area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Generate the daily WhatsApp-format progress report, and import one back in to bulk-update blocks.' },
  { key: 'manage:customers',   label: 'Manage Customers',            area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'], description: 'Add, edit and view entries in the Customers directory.' },
  // Key deliberately kept as 'manage:service-reports' even though the
  // collection is now serviceJobs — renaming the key would orphan any
  // Access Level grant already made against it (RBAC grants happen via the
  // in-app Settings UI, not by this codebase, so a rename can't be
  // re-applied automatically).
  { key: 'manage:service-reports', label: 'Manage Service Jobs',     area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor', 'staff'], description: 'Open the Service Jobs area to check in, complete and submit a job report as a technician.' },
  { key: 'jobs:assign',            label: 'Schedule / Assign Jobs',  area: 'Dashboard & Projects', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Schedule a new service job, or reassign/reschedule an existing one, from the Service Jobs board or calendar.' },
  { key: 'jobs:vet',               label: 'Vet Completed Jobs',      area: 'Dashboard & Projects', seedRoles: ['owner', 'manager'], description: 'Review a completed service job and mark it Vetted, or send it back as Needs Revision.' },

  // Finance & Claims
  { key: 'view:claims',           label: 'View Finance & Claims',      area: 'Finance & Claims', seedRoles: ['owner', 'manager'], description: 'Open Finance and a project\'s Claims tab — claim tracking, sub-con rate config and payment summaries.' },
  { key: 'materials:view',        label: 'View Materials & DO',        area: 'Finance & Claims', seedRoles: ['owner', 'manager', 'supervisor'], description: 'View material orders and delivery orders on a project.' },
  { key: 'materials:approve',     label: 'Approve Material Orders',    area: 'Finance & Claims', seedRoles: ['owner', 'manager'], description: 'Approve a material order before it is placed.' },
  { key: 'materials:view-costs',  label: 'View Material Costs',        area: 'Finance & Claims', seedRoles: ['owner', 'manager'], description: 'See the dollar cost of materials, not just quantities and delivery status.' },
  { key: 'salary:config',         label: 'Configure Pay Rates',        area: 'Finance & Claims', seedRoles: ['owner', 'manager'], description: 'Set a worker\'s pay rate, CPF residency status and allowances.' },
  { key: 'salary:manage-payslips',label: 'Generate Payslips',          area: 'Finance & Claims', seedRoles: ['owner', 'manager'], description: 'Generate and print payslips, and export CPF/IR8A CSV files.' },
  { key: 'pettycash:approve',     label: 'Approve Petty Cash Claims',  area: 'Finance & Claims', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Approve or reject a staff member\'s submitted petty cash claim.' },
  { key: 'materials:submit-do',   label: 'Submit Delivery Orders',     area: 'Finance & Claims', seedRoles: ['staff'], description: 'Log a Delivery Order on-site (scan/photo, auto-read details). Doesn\'t grant the Material Orders / procurement tab.' },

  // Workers & HSE
  { key: 'manage:workers',            label: 'Manage Workers',              area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'subcon-admin'], description: 'Add, edit and view entries in the Site Workforce registry (subcon-admins are limited to their own team).' },
  { key: 'workers:assign-any-team',   label: 'Assign Worker To Any Team',   area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Assign a worker to any team, not just the one your own account belongs to.' },
  { key: 'workers:manage-cert-types', label: 'Manage Certificate Types',    area: 'Workers & HSE', seedRoles: ['owner', 'manager'], description: 'Edit the list of certificate/license/pass types available when adding a worker\'s document.' },
  { key: 'view:hse',                  label: 'View Resources',              area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'], description: 'Open the Resources document library (only documents your team has been given access to).' },
  { key: 'sitephotos:approve',        label: 'Approve Site Photos',         area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Approve or reject site photos submitted by the crew.' },
  { key: 'snags:manage-status',       label: 'Manage Snag Status',          area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Change a logged snag/defect\'s status — open, in progress, or resolved.' },
  { key: 'toolbox:manage',            label: 'Log Toolbox Meetings',        area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Log a toolbox safety meeting on a project.' },
  { key: 'approve:permits',           label: 'Approve Permits (PTW)',       area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Approve or reject a Permit-to-Work request (General or Working-at-Height).' },
  { key: 'incidents:view',            label: 'View Incident Reports',       area: 'Workers & HSE', seedRoles: ['owner', 'manager', 'supervisor', 'staff'], description: 'View logged incident reports — near-miss, first-aid, MC, property damage.' },

  // Attendance & Leave
  { key: 'attendance:manage',       label: 'Manage Team Attendance',       area: 'Attendance & Leave', seedRoles: ['owner', 'manager', 'supervisor'], description: 'View and edit the team\'s clock in/out records.' },
  { key: 'attendance:photo-review', label: 'Review Attendance Photos',     area: 'Attendance & Leave', seedRoles: ['owner', 'manager'], description: 'Review the GPS location and selfie photo captured at each clock in/out.' },
  { key: 'leave:approve',           label: 'Approve Leave Applications',   area: 'Attendance & Leave', seedRoles: ['owner', 'manager', 'supervisor'], description: 'Approve or reject a submitted leave application (AL, MC, NPL, OIL, etc.).' },
  { key: 'leave:settings',          label: 'Configure Leave Entitlements', area: 'Attendance & Leave', seedRoles: ['owner', 'manager'], description: 'Configure how many days of each leave type staff get, and carry-forward rules.' },

  // Announcements
  { key: 'manage:announcements',   label: 'Post Announcements',      area: 'Announcements', seedRoles: ['owner', 'manager'], description: 'Post a new company-wide announcement, with a severity level and attachments.' },
  { key: 'view:management-alerts', label: 'View Management Alerts',  area: 'Announcements', seedRoles: ['owner', 'manager', 'supervisor'], description: 'See management-only alerts in the Dashboard\'s Needs Attention feed.' },

  // Administration
  { key: 'create:subaccounts', label: 'Create Sub-accounts', area: 'Administration', seedRoles: ['owner', 'manager', 'subcon-admin'], description: 'Create a new User ID + PIN login for a worker.' },
  { key: 'reset:pins',         label: 'Reset PINs',          area: 'Administration', seedRoles: ['owner', 'manager', 'subcon-admin'], description: 'Reset a user\'s PIN, forcing them to set a new one on their next login.' },
  { key: 'admin:settings',     label: 'System Settings',     area: 'Administration', seedRoles: ['owner'], description: 'Open Settings — User Management, Access Levels, and the Permission Matrix.' },
  { key: 'view:uploads-audit', label: 'View Uploads Audit',  area: 'Administration', seedRoles: ['owner', 'manager'], description: 'View every uploaded file across the app — selfies, MCs, receipts, certs — with a reviewer audit trail.' },
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
