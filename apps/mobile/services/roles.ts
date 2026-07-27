import { getContractsClient } from '@gruenerator/shared/api';
import { type UserRole } from '@gruenerator/shared/roles';

/**
 * Read the user's saved roles (profile.roles user-default).
 *
 * Read-only on purpose. Creating a role is a five-step wizard over four
 * vocabularies plus an MdB lookup, and saving one also has to re-derive
 * `custom_prompt` from the whole list — desk work, not phone work. Mobile shows
 * what is set (`app/(focused)/settings/rollen.tsx`) and sends editing to web.
 */
export async function fetchRoles(): Promise<UserRole[]> {
  const res = await getContractsClient().userProfile.getUserDefaults();
  if (res.status === 200) {
    const roles = res.body.userDefaults?.profile?.roles;
    return Array.isArray(roles) ? (roles as UserRole[]) : [];
  }
  return [];
}
