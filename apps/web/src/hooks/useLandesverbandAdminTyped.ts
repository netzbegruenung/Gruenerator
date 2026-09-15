/**
 * useLandesverbandAdminTyped — typed ts-rest client wrappers for the
 * Landesverband-Admin self-service surface (greeting, LV-scoped Rezepte
 * visibility, own member list, own scopes).
 */
import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';

export async function fetchMyLandesverbandScopes() {
  const client = getContractsClient();
  const result = await client.landesverbandAdmin.mine();
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch Landesverband scopes');
  }
  return result.body.data;
}

export async function fetchLandesverbandDetail(landesverbandId: string) {
  const client = getContractsClient();
  const result = await client.landesverbandAdmin.get({ params: { landesverbandId } });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch Landesverband');
  }
  return result.body.data;
}

export async function updateLandesverbandGreeting(
  landesverbandId: string,
  greetingText: string | null
): Promise<void> {
  const client = getContractsClient();
  const result = await client.landesverbandAdmin.updateGreeting({
    params: { landesverbandId },
    body: { greetingText },
  });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to update greeting');
  }
}

export async function fetchLandesverbandSkills(landesverbandId: string) {
  const client = getContractsClient();
  const result = await client.landesverbandAdmin.listSkills({ params: { landesverbandId } });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch Landesverband skills');
  }
  return result.body.data;
}

export async function setLandesverbandSkillHidden(
  landesverbandId: string,
  mention: string,
  hidden: boolean
): Promise<void> {
  const client = getContractsClient();
  const result = await client.landesverbandAdmin.setSkillHidden({
    params: { landesverbandId, mention },
    body: { hidden },
  });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to update skill visibility');
  }
}

export async function fetchLandesverbandUsers(landesverbandId: string) {
  const client = getContractsClient();
  const result = await client.landesverbandAdmin.listUsers({ params: { landesverbandId } });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch Landesverband members');
  }
  return result.body.data;
}
