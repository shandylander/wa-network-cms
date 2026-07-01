const PERMISSIONS = {
  'view:dashboard':     ['owner', 'manager', 'supervisor'],
  'view:projects':      ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'],
  'update:blocks':      ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'],
  'manage:blocks':      ['owner', 'manager'],
  'view:claims':        ['owner', 'manager'],
  'generate:reports':   ['owner', 'manager', 'supervisor'],
  'manage:workers':     ['owner', 'manager', 'subcon-admin'],
  'view:hse':           ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'],
  'create:subaccounts': ['owner', 'manager', 'subcon-admin'],
  'admin:settings':     ['owner'],
  'reset:pins':         ['owner', 'manager', 'subcon-admin'],
  'manage:announcements': ['owner', 'manager'],
  'approve:permits':      ['owner', 'manager', 'supervisor'],
};

export const hasPermission = (role, permission) => {
  if (!role) return false;
  return (PERMISSIONS[permission] || []).includes(role);
};

export const ROLES = {
  owner:        { label: 'Owner',         color: 'purple' },
  manager:      { label: 'Manager',       color: 'blue'   },
  supervisor:   { label: 'Supervisor',    color: 'green'  },
  staff:        { label: 'Staff',         color: 'amber'  },
  'subcon-admin': { label: 'Sub-con Admin', color: 'amber' },
  subcon:       { label: 'Sub-con',       color: 'default'},
};

export const TEAMS = {
  none:    'WA! Network',
  own:     'WA! Network (Direct)',
  kvm:     'KVM',
  sree:    'Sree Ram',
  habibur: 'Habibur',
  alamin:  'Alamin (Seabiz)',
};
