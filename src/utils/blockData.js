const b = (no, type, street, survey, extra = {}) => ({
  no: String(no), type, street, postal: '', survey,
  team: '', cam: 0, rack: '', fix1: 0, fix2: 0, fix3: 0, fix4: 0,
  ...extra,
});

const range = (s, e) => Array.from({ length: e - s + 1 }, (_, i) => s + i);

export const PCS_BATCH3_BLOCKS = [
  // ── Woodlands Street 13 (survey: ip) ──
  ...range(101, 113).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 13', 'ip')),
  ...range(144, 166).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 13', 'ip')),
  ...range(172, 179).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 13', 'ip')),

  // ── Marsiling Rise (survey: ip) ──
  ...range(114, 133).map(n => b(n, 'RESIDENTIAL', 'Marsiling Rise', 'ip')),

  // ── Marsiling Road (survey: ip) ──
  ...range(134, 143).map(n => b(n, 'RESIDENTIAL', 'Marsiling Road', 'ip')),
  b('180A', 'RESIDENTIAL', 'Marsiling Road', 'ip'),
  b('180B', 'RESIDENTIAL', 'Marsiling Road', 'ip'),
  b('180C', 'RESIDENTIAL', 'Marsiling Road', 'ip'),
  b('181',  'MSCP',        'Marsiling Road', 'ip'),

  // ── Woodlands Street 11 (survey: ip) ──
  ...range(167, 171).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 11', 'ip')),

  // ── Woodlands Street 31 (survey: done) ──
  ...range(301, 304).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 31', 'done')),
  b('302A', 'RESIDENTIAL', 'Woodlands Street 31', 'done'),
  b('305',  'MSCP',        'Woodlands Street 31', 'done'),
  b('306',  'RESIDENTIAL', 'Woodlands Street 31', 'done'),
  ...range(310, 319).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 31', 'done')),

  // ── Woodlands Avenue 1 — KVM assigned, fix1-3 done (survey: done) ──
  b('307', 'RESIDENTIAL', 'Woodlands Avenue 1', 'done', { team: 'kvm', cam: 11, fix1: 100, fix2: 100, fix3: 100, fix4: 0 }),
  b('308', 'RESIDENTIAL', 'Woodlands Avenue 1', 'done', { team: 'kvm', cam: 8,  fix1: 100, fix2: 100, fix3: 100, fix4: 0 }),
  b('309', 'RESIDENTIAL', 'Woodlands Avenue 1', 'done', { team: 'kvm', cam: 2,  fix1: 100, fix2: 100, fix3: 100, fix4: 0 }),

  // ── Woodlands Street 32 (survey: done) ──
  ...range(320, 329).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 32', 'done')),
  ...range(333, 335).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 32', 'done')),

  // ── Woodlands Avenue 1 cont. (survey: done) ──
  ...range(330, 332).map(n => b(n, 'RESIDENTIAL', 'Woodlands Avenue 1', 'done')),
  ...range(351, 355).map(n => b(n, 'RESIDENTIAL', 'Woodlands Avenue 1', 'done')),
  b('354A', 'MSCP', 'Woodlands Avenue 1', 'done'),
  ...range(368, 371).map(n => b(n, 'RESIDENTIAL', 'Woodlands Avenue 1', 'done')),
  b('371A', 'MSCP', 'Woodlands Avenue 1', 'done'),

  // ── Woodlands Avenue 5 (survey: done) ──
  ...range(356, 367).map(n => b(n, 'RESIDENTIAL', 'Woodlands Avenue 5', 'done')),
  b('358A', 'MSCP', 'Woodlands Avenue 5', 'done'),

  // ── Woodlands Street 41 (survey: ip) ──
  ...range(401, 406).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 41', 'ip')),
  b('406A', 'MSCP', 'Woodlands Street 41', 'ip'),
  ...range(408, 421).map(n => b(n, 'RESIDENTIAL', 'Woodlands Street 41', 'ip')),
  b('413A', 'MSCP', 'Woodlands Street 41', 'ip'),
  b('421A', 'MSCP', 'Woodlands Street 41', 'ip'),

  // ── BTO blocks ──
  b('905',  'MSCP',        'Woodlands Avenue 5',   'bto'),
  b('907A', 'RESIDENTIAL', 'Woodlands Square',      'bto'),
  b('907B', 'RESIDENTIAL', 'Woodlands Square',      'bto'),
  b('907C', 'RESIDENTIAL', 'Woodlands Square',      'bto'),
  b('908A', 'RESIDENTIAL', 'Woodlands Square',      'bto'),
  b('908B', 'RESIDENTIAL', 'Woodlands Square',      'bto'),
  b('909A', 'RESIDENTIAL', 'North Woodlands Way',   'bto'),
  b('909B', 'RESIDENTIAL', 'North Woodlands Way',   'bto'),
  b('909C', 'RESIDENTIAL', 'North Woodlands Way',   'bto'),
];

export const PROJECT_SEED = {
  name: 'PCS Batch 3',
  type: 'CCTV Installation',
  projectType: 'pcs',
  client: 'Certis Technology (S) Pte Ltd',
  location: 'Woodlands, Singapore',
  status: 'active',
  startDate: new Date('2024-01-01'),
  rates: { s1: 1500, s2: 3000, s3: 1000 },
  subconRates: {
    own:     { s1: 1350, s2: 2700, s3: 900 },
    kvm:     { s1: 1350, s2: 2700, s3: 900 },
    sree:    { s1: 1350, s2: 2700, s3: 900 },
    habibur: { s1: 1350, s2: 2700, s3: 900 },
    alamin:  { s1: 1350, s2: 2700, s3: 900 },
  },
  assignedTeams: ['own', 'kvm', 'sree', 'habibur', 'alamin'],
};

export const HSE_DOCS_SEED = [
  { id: 'd1', name: 'General Permit-to-Work', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/General%20Permit-to-Work%20(NEW%20-%20LATEST).pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
  { id: 'd2', name: 'WAH Permit (Rev 04)', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/WAH%20PERMIT%20(Rev%2004)%20-%20Latest.pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
  { id: 'd3', name: 'Toolbox Meeting Form (Rev 7)', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/Toolbox%20Meeting%20Form%20Rev-7%20LATEST.pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
  { id: 'd4', name: 'Daily Safety Harness Checklist', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/SAFETY%20HARNESS%20CHECKLIST%20(Rev%2001).pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
  { id: 'd5', name: 'Daily Boom/Scissor Lift Checklist', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/Daily%20Boom%20%26%20Scissor%20lift%20Checklist%20Rev.1.pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
  { id: 'd6', name: 'Daily Ladder Inspection Tag', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/Daily%20Ladder%20Inspection%20Tag%20(Rev%2002)%20LATEST.pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
  { id: 'd7', name: 'Monthly Ladder Inspection Record', category: 'hse', url: '/files/Projects/PCS%20Batch%203/HSE%20Forms/Monthly%20Registration%20and%20Inspection%20A-Frame%20Ladder%20(Rev%2004).pdf', access: { kvm: false, sree: false, habibur: false, alamin: false, own: true } },
];

export const USERS_SEED = [
  { userId: 'WA001',   name: 'Andy Ng',        role: 'owner',       team: 'none',    parentId: null,    firstLogin: false, status: 'active', pin: '1234' },
  { userId: 'WA002',   name: 'Manager',         role: 'manager',     team: 'none',    parentId: null,    firstLogin: false, status: 'active', pin: '1111' },
  { userId: 'WA003',   name: 'Supervisor',      role: 'supervisor',  team: 'none',    parentId: null,    firstLogin: false, status: 'active', pin: '2222' },
  { userId: 'WK001',   name: 'Worker 1',        role: 'staff',       team: 'own',     parentId: null,    firstLogin: true,  status: 'active', pin: '3333' },
  { userId: 'WK002',   name: 'Worker 2',        role: 'staff',       team: 'own',     parentId: null,    firstLogin: true,  status: 'active', pin: '3334' },
  { userId: 'WK003',   name: 'Worker 3',        role: 'staff',       team: 'own',     parentId: null,    firstLogin: true,  status: 'active', pin: '3335' },
  { userId: 'WK004',   name: 'Worker 4',        role: 'staff',       team: 'own',     parentId: null,    firstLogin: true,  status: 'active', pin: '3336' },
  { userId: 'WK005',   name: 'Worker 5',        role: 'staff',       team: 'own',     parentId: null,    firstLogin: true,  status: 'active', pin: '3337' },
  { userId: 'KVM-ADM', name: 'KVM Admin',       role: 'subcon-admin',team: 'kvm',     parentId: null,    firstLogin: true,  status: 'active', pin: '4444' },
  { userId: 'SR-ADM',  name: 'Sree Ram Admin',  role: 'subcon-admin',team: 'sree',    parentId: null,    firstLogin: true,  status: 'active', pin: '5555' },
  { userId: 'HB-ADM',  name: 'Habibur',         role: 'subcon-admin',team: 'habibur', parentId: null,    firstLogin: true,  status: 'active', pin: '6666' },
  { userId: 'AL-ADM',  name: 'Alamin Admin',    role: 'subcon-admin',team: 'alamin',  parentId: null,    firstLogin: true,  status: 'active', pin: '7777' },
  { userId: 'KVM-01',  name: 'KVM Worker 1',    role: 'subcon',      team: 'kvm',     parentId: 'KVM-ADM',firstLogin: true, status: 'active', pin: '4401' },
  { userId: 'SR-01',   name: 'SR Worker 1',     role: 'subcon',      team: 'sree',    parentId: 'SR-ADM', firstLogin: true, status: 'active', pin: '5501' },
];
