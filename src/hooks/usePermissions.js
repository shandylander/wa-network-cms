import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../utils/permissions';

// Access Levels (src/utils/permissionCatalog.js) are the real source of
// truth — `effectivePermissions` is computed server-side (Cloud Functions)
// as the union of a user's assigned levels, and is what Firestore/Storage
// rules check too. The role-based `hasPermission` fallback only covers the
// brief window before a user's first server-side compute has completed
// (e.g. immediately after account creation).
export function usePermissions() {
  const { userProfile } = useAuth();
  const role   = userProfile?.role;
  const team   = userProfile?.team;
  const effective = userProfile?.effectivePermissions;

  return {
    can: (permission) =>
      effective !== undefined
        ? effective.includes(permission)
        : hasPermission(role, permission) || (userProfile?.customPermissions ?? []).includes(permission),
    role,
    team,
    userId: userProfile?.userId,
  };
}
