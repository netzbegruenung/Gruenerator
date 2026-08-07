/**
 * useLvAdminAssignmentTyped — typed ts-rest client wrappers for the
 * Hauptgrünerator-Super-Admin's Landesverband master data + LV-admin
 * assignment endpoints.
 */
import { getContractsClient } from '@gruenerator/shared/api';

export async function fetchLandesverbaende() {
  const client = getContractsClient();
  const result = await client.lvAdminAssignment.list();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch Landesverbände (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function fetchLandesverbandAdmins(landesverbandId: string) {
  const client = getContractsClient();
  const result = await client.lvAdminAssignment.listAdmins({ params: { landesverbandId } });
  if (result.status !== 200) {
    throw new Error(`Failed to fetch Landesverband admins (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function assignLandesverbandAdmin(
  landesverbandId: string,
  email: string
): Promise<void> {
  const client = getContractsClient();
  const result = await client.lvAdminAssignment.assignAdmin({
    params: { landesverbandId },
    body: { email },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to assign Landesverband admin (HTTP ${result.status})`);
  }
}

export async function revokeLandesverbandAdmin(
  landesverbandId: string,
  userId: string
): Promise<void> {
  const client = getContractsClient();
  const result = await client.lvAdminAssignment.revokeAdmin({
    params: { landesverbandId, userId },
    body: {},
  });
  if (result.status !== 200) {
    throw new Error(`Failed to revoke Landesverband admin (HTTP ${result.status})`);
  }
}

export async function searchAdminUsers(search: string) {
  const client = getContractsClient();
  const result = await client.lvAdminAssignment.searchUsers({ query: { search } });
  if (result.status !== 200) {
    throw new Error(`Failed to search users (HTTP ${result.status})`);
  }
  return result.body.data;
}
