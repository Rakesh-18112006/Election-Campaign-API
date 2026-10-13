import { UserRole } from '../models/User';

export const ROLE_HIERARCHY: Record<UserRole, number> = {
  MAIN_ADMIN: 5,
  MAYOR: 4,
  CORPORATOR: 3,
  DIVISIONAL_INCHARGE: 2,
  WARD_MEMBER: 1,
};

export function rolesBelow(role: UserRole): UserRole[] {
  return (Object.keys(ROLE_HIERARCHY) as UserRole[]).filter((r) => ROLE_HIERARCHY[r] < ROLE_HIERARCHY[role]);
}
