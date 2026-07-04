import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../utils/permissions';

export function usePermissions() {
  const { userProfile } = useAuth();
  const role   = userProfile?.role;
  const team   = userProfile?.team;
  const custom = userProfile?.customPermissions ?? [];

  return {
    can: (permission) => hasPermission(role, permission) || custom.includes(permission),
    role,
    team,
    userId: userProfile?.userId,
  };
}
