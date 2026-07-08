import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { hasPermission } from './permissions';

const CERT_WARN_DAYS = 30;
const CLAIM_WARN_DAYS = 3;

// Not a React component — can't use usePermissions(). Checks
// effectivePermissions directly, falling back to the legacy role map only
// for the brief pre-backfill window (view:management-alerts is a new key,
// so this fallback is effectively inert once every user has been backfilled).
const canViewManagementAlerts = (userProfile) => {
  const effective = userProfile?.effectivePermissions;
  return effective !== undefined
    ? effective.includes('view:management-alerts')
    : hasPermission(userProfile?.role, 'view:management-alerts');
};

const blockEligible = (b, stage) => {
  if (stage === 'S1') return (b.fix1 ?? 0) >= 100 && (b.fix2 ?? 0) >= 100;
  if (stage === 'S2') return (b.fix1 ?? 0) >= 100 && (b.fix2 ?? 0) >= 100 && (b.fix3 ?? 0) >= 100 && (b.fix4 ?? 0) >= 100;
  return false;
};

function daysFrom(dateLike) {
  return Math.floor((new Date(dateLike) - Date.now()) / 86400000);
}

function certAlerts(workers) {
  const alerts = [];
  workers.forEach(w => {
    (w.certs ?? []).forEach((c, i) => {
      if (!c.expiry) return;
      const days = daysFrom(c.expiry);
      if (days < 0) {
        alerts.push({
          id: `cert-${w.id}-${i}`, type: 'cert', severity: 'critical',
          message: `${w.name}'s ${c.name} expired ${Math.abs(days)}d ago`, link: '/workers',
        });
      } else if (days <= CERT_WARN_DAYS) {
        alerts.push({
          id: `cert-${w.id}-${i}`, type: 'cert', severity: 'warning',
          message: `${w.name}'s ${c.name} expires in ${days}d`, link: '/workers',
        });
      }
    });
  });
  return alerts;
}

async function announcementAlerts(userProfile) {
  const alerts = [];
  try {
    const snap = await getDocs(collection(db, 'announcements'));
    snap.docs.forEach(d => {
      const a = d.data();
      const audience = a.audience ?? 'all';
      const targeted =
        audience === 'all' ||
        audience === userProfile.team ||
        audience === userProfile.role ||
        (audience === 'management' && canViewManagementAlerts(userProfile));
      const read = (a.readBy ?? []).includes(userProfile.userId);
      if (targeted && !read) {
        alerts.push({
          id: `ann-${d.id}`, type: 'announcement', severity: a.severity ?? 'info',
          message: a.message, link: null, docId: d.id, createdAt: a.createdAt,
        });
      }
    });
  } catch { /* ignore */ }
  return alerts;
}

async function projectAlerts() {
  const alerts = [];
  try {
    const projSnap = await getDocs(collection(db, 'projects'));
    const activeProjects = projSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.status === 'active');

    for (const p of activeProjects) {
      const [incSnap, permSnap, blockSnap, claimSnap] = await Promise.all([
        getDocs(collection(db, 'projects', p.id, 'incidents')).catch(() => null),
        getDocs(collection(db, 'projects', p.id, 'permits')).catch(() => null),
        getDocs(collection(db, 'projects', p.id, 'blocks')).catch(() => null),
        getDocs(collection(db, 'projects', p.id, 'claims')).catch(() => null),
      ]);

      incSnap?.docs.forEach(d => {
        const inc = d.data();
        if (inc.status !== 'closed') {
          alerts.push({
            id: `inc-${d.id}`, type: 'incident', severity: inc.severity === 'critical' || inc.severity === 'high' ? 'critical' : 'warning',
            message: `${p.name}: ${inc.type ?? 'Incident'} reported — ${inc.status}`, link: `/projects/${p.id}`,
          });
        }
      });

      permSnap?.docs.forEach(d => {
        const perm = d.data();
        if (perm.status === 'pending') {
          alerts.push({
            id: `perm-${d.id}`, type: 'permit', severity: 'warning',
            message: `${p.name}: PTW pending approval — ${perm.workDescription ?? perm.location ?? ''}`, link: `/projects/${p.id}`,
          });
        }
      });

      if (blockSnap && claimSnap) {
        const blocks = blockSnap.docs.map(d => d.data());
        const claims = claimSnap.docs.map(d => d.data());
        const claimedNos = (stage) => {
          const set = new Set();
          claims.filter(c => c.stage === stage).forEach(c => (c.blockNos ?? []).forEach(no => set.add(no)));
          return set;
        };
        ['S1', 'S2'].forEach(stage => {
          const unclaimed = blocks.filter(b => blockEligible(b, stage) && !claimedNos(stage).has(b.no));
          if (unclaimed.length >= CLAIM_WARN_DAYS) {
            alerts.push({
              id: `claim-${p.id}-${stage}`, type: 'claim', severity: 'info',
              message: `${p.name}: ${unclaimed.length} blocks eligible for ${stage} claim, not yet submitted`, link: `/projects/${p.id}`,
            });
          }
        });
      }
    }
  } catch { /* ignore */ }
  return alerts;
}

export async function getAlerts(userProfile) {
  if (!userProfile) return [];
  const tasks = [announcementAlerts(userProfile)];

  if (canViewManagementAlerts(userProfile)) {
    tasks.push(
      getDocs(collection(db, 'workers'))
        .then(snap => certAlerts(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
        .catch(() => []),
      projectAlerts(),
    );
  }

  const results = await Promise.all(tasks);
  return results.flat();
}

export const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
