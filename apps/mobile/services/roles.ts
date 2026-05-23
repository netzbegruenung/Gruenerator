import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';
import { generateProfilePrompt, type UserRole } from '@gruenerator/shared/roles';

/** Read the user's saved roles (profile.roles user-default). */
export async function fetchRoles(): Promise<UserRole[]> {
  const res = await getContractsClient().userProfile.getUserDefaults();
  if (res.status === 200) {
    const roles = res.body.userDefaults?.profile?.roles;
    return Array.isArray(roles) ? (roles as UserRole[]) : [];
  }
  return [];
}

/**
 * Persist the role list and re-derive the chat system prompt from it. Mirrors the
 * web flow (apps/web RolesSection.persistRoles): save roles, then update custom_prompt.
 */
export async function persistRoles(roles: UserRole[], isAustrian: boolean): Promise<void> {
  const client = getContractsClient();
  await client.userProfile.updateUserDefaults({
    body: { generator: 'profile', key: 'roles', value: roles },
  });
  const prompt = generateProfilePrompt(roles, isAustrian);
  // Empty prompt clears the field; the contract body types custom_prompt as string.
  await client.userProfile.updateProfile({ body: { custom_prompt: prompt || '' } });
}

/**
 * Best-effort system-prompt enrichment for a single role. Returns null if the
 * chat-service endpoint is unavailable — the role is still saved without it.
 */
export async function generateRoleSystemPrompt(description: string): Promise<string | null> {
  try {
    const res = await getGlobalApiClient().post<{ systemPrompt?: string }>(
      '/chat-service/generate-system-prompt',
      { description }
    );
    return res.data?.systemPrompt ?? null;
  } catch {
    return null;
  }
}
