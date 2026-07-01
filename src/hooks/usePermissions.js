import { useAuth } from '../context/AuthContext';
import { hasPermission } from '../utils/permissions';

export function usePermissions() {
  const { userProfile } = useAuth();
  const role = userProfile?.role;
  const team = userProfile?.team;

  return {
    can: (permission) => hasPermission(role, permission),
    role,
    team,
    userId: userProfile?.userId,
  };
}
