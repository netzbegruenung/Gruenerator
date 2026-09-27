import { type RoleRef } from '@gruenerator/contracts';
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
export interface ProfileDefaults {
  roles: UserRole[];
  activeRole: RoleRef | null;
  /**
   * Ob die Person je gewählt hat. Das VORHANDENSEIN des Schlüssels ist die
   * Antwort — `activeRole: null` (bewusst ohne Rolle) und ein fehlender
   * Schlüssel (nie gewählt) lesen sich sonst gleich.
   */
  hasChosenRole: boolean;
}

/** Der `profile`-Block der User-Defaults, roh gelesen. */
export async function fetchProfileDefaults(): Promise<ProfileDefaults> {
  const res = await getContractsClient().userProfile.getUserDefaults();
  if (res.status !== 200) return { roles: [], activeRole: null, hasChosenRole: false };
  const profile = res.body.userDefaults?.profile ?? {};
  const roles = profile.roles;
  return {
    roles: Array.isArray(roles) ? (roles as UserRole[]) : [],
    activeRole: (profile.activeRole as RoleRef | null | undefined) ?? null,
    hasChosenRole: 'activeRole' in profile,
  };
}

export async function fetchRoles(): Promise<UserRole[]> {
  return (await fetchProfileDefaults()).roles;
}
