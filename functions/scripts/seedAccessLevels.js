#!/usr/bin/env node
// One-time migration script: seeds the 6 role-named Access Levels and
// backfills every existing user's `accessLevels` array so their effective
// access is provably identical to today's role-based behavior at cutover.
//
// RUN ORDER MATTERS — run this AFTER the Cloud Functions + Firestore rules
// from Phase 1 are deployed, so `recomputeUserPermissions` is live and
// populates `effectivePermissions` as this script writes `accessLevels`.
//
// Usage (from the functions/ directory):
//   node scripts/seedAccessLevels.js            # dry run — prints, writes nothing
//   node scripts/seedAccessLevels.js --apply     # actually writes to Firestore
//
// Requires credentials for project wa-network-cms. Either:
//   - run `gcloud auth application-default login` once, or
//   - set GOOGLE_APPLICATION_CREDENTIALS to a downloaded service-account key
//     (Firebase Console → Project Settings → Service Accounts → Generate key)
//
// NOTE: the catalog below is a deliberate one-time copy of
// src/utils/permissionCatalog.js (this script runs standalone via plain
// Node, outside the React build). If the catalog changes before this
// script has been run, update both files together.

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');

const PERMISSION_CATALOG = [
  { key: 'view:dashboard',     seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'view:projects',      seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'] },
  { key: 'update:blocks',      seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'] },
  { key: 'manage:blocks',      seedRoles: ['owner', 'manager'] },
  { key: 'blocks:assign-team', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'blocks:delete',      seedRoles: ['owner', 'manager'] },
  { key: 'blocks:bulk-edit',   seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'generate:reports',   seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'manage:customers',   seedRoles: ['owner', 'manager'] },
  { key: 'manage:service-reports', seedRoles: ['owner', 'manager', 'supervisor', 'staff'] },
  { key: 'view:claims',            seedRoles: ['owner', 'manager'] },
  { key: 'materials:view',         seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'materials:approve',      seedRoles: ['owner', 'manager'] },
  { key: 'materials:view-costs',   seedRoles: ['owner', 'manager'] },
  { key: 'salary:config',          seedRoles: ['owner', 'manager'] },
  { key: 'salary:manage-payslips', seedRoles: ['owner', 'manager'] },
  { key: 'pettycash:approve',      seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'manage:workers',            seedRoles: ['owner', 'manager', 'subcon-admin'] },
  { key: 'workers:assign-any-team',   seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'workers:manage-cert-types', seedRoles: ['owner', 'manager'] },
  { key: 'view:hse',                  seedRoles: ['owner', 'manager', 'supervisor', 'staff', 'subcon-admin', 'subcon'] },
  { key: 'sitephotos:approve',        seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'snags:manage-status',       seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'toolbox:manage',            seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'approve:permits',           seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'incidents:view',            seedRoles: ['owner', 'manager', 'supervisor', 'staff'] },
  { key: 'attendance:manage',       seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'attendance:photo-review', seedRoles: ['owner', 'manager'] },
  { key: 'leave:approve',           seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'leave:settings',          seedRoles: ['owner', 'manager'] },
  { key: 'manage:announcements',   seedRoles: ['owner', 'manager'] },
  { key: 'view:management-alerts', seedRoles: ['owner', 'manager', 'supervisor'] },
  { key: 'create:subaccounts', seedRoles: ['owner', 'manager', 'subcon-admin'] },
  { key: 'reset:pins',         seedRoles: ['owner', 'manager', 'subcon-admin'] },
  { key: 'admin:settings',     seedRoles: ['owner'] },
  { key: 'view:uploads-audit', seedRoles: ['owner', 'manager'] },
];

const ROLE_LEVEL_SEED = {
  owner:          { id: 'role-owner',        label: 'Owner Access',          color: '#6d3fa8' },
  manager:        { id: 'role-manager',      label: 'Manager Access',       color: '#1a5fa8' },
  supervisor:     { id: 'role-supervisor',   label: 'Supervisor Access',    color: '#1a8a5a' },
  staff:          { id: 'role-staff',        label: 'Staff Access',         color: '#d97b00' },
  'subcon-admin': { id: 'role-subcon-admin', label: 'Sub-con Admin Access', color: '#c2185b' },
  subcon:         { id: 'role-subcon',       label: 'Sub-con Access',       color: '#5a6577' },
};

function buildSeedLevels() {
  const byRole = {};
  Object.keys(ROLE_LEVEL_SEED).forEach((role) => { byRole[role] = new Set(); });
  PERMISSION_CATALOG.forEach(({ key, seedRoles }) => {
    seedRoles.forEach((role) => { if (byRole[role]) byRole[role].add(key); });
  });
  return Object.entries(ROLE_LEVEL_SEED).map(([role, meta]) => ({
    id: meta.id,
    label: meta.label,
    color: meta.color,
    permissions: [...byRole[role]].sort(),
  }));
}

async function main() {
  initializeApp({ credential: applicationDefault(), projectId: 'wa-network-cms' });
  const db = getFirestore();

  console.log(APPLY ? '=== APPLY MODE — writing to Firestore ===' : '=== DRY RUN — no writes will be made (pass --apply to write) ===');

  // 1. Seed the 6 role-named levels
  const seedLevels = buildSeedLevels();
  for (const level of seedLevels) {
    console.log(`\naccessLevels/${level.id} ("${level.label}") — ${level.permissions.length} permissions:`);
    console.log('  ' + level.permissions.join(', '));
    if (APPLY) {
      await db.collection('accessLevels').doc(level.id).set(level, { merge: true });
    }
  }

  // 2. Backfill every existing user
  const usersSnap = await db.collection('users').get();
  console.log(`\n\n=== Backfilling ${usersSnap.size} users ===`);

  let updated = 0;
  for (const doc of usersSnap.docs) {
    const user = doc.data();
    const roleLevel = ROLE_LEVEL_SEED[user.role];
    if (!roleLevel) {
      console.warn(`  ! ${doc.id}: unknown role "${user.role}", skipping`);
      continue;
    }

    const accessLevels = [roleLevel.id];

    // Fold any legacy customPermissions not already covered by the role
    // level into a small personal top-up level, so nobody loses anything.
    const legacyExtra = (user.customPermissions ?? []).filter(
      (p) => !seedLevels.find((l) => l.id === roleLevel.id).permissions.includes(p)
    );
    if (legacyExtra.length > 0) {
      const personalId = `custom-${doc.id}`;
      console.log(`  ${doc.id} (${user.name ?? '?'}): role=${user.role} + personal top-up [${legacyExtra.join(', ')}]`);
      if (APPLY) {
        await db.collection('accessLevels').doc(personalId).set({
          id: personalId,
          label: `${user.name ?? doc.id} — legacy custom access`,
          color: '#5a6577',
          permissions: legacyExtra.sort(),
        }, { merge: true });
      }
      accessLevels.push(personalId);
    } else {
      console.log(`  ${doc.id} (${user.name ?? '?'}): role=${user.role} → ${roleLevel.id}`);
    }

    if (APPLY) {
      await doc.ref.update({ accessLevels });
    }
    updated++;
  }

  console.log(`\n${APPLY ? 'Updated' : 'Would update'} ${updated} user(s).`);
  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
