/**
 * useInstanceAdminOverviewTyped — typed ts-rest client wrappers for the BGST-instance
 * admin overview endpoints. Used internally by the admin/bgst hooks.
 */
import { ApiError, getContractsClient } from '@gruenerator/shared/api';

export async function fetchInstanceAdminUsers(q: string) {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.listUsers({ query: q ? { q } : {} });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to fetch BGST users (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function fetchInstanceAdminRoles() {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.listRoles();
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to fetch BGST roles (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function setInstanceAdminUserPanda(userId: string, enabled: boolean) {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.setUserPanda({
    params: { userId },
    body: { enabled },
  });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to set Panda unlock (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function setInstanceAdminUserAdmin(userId: string, isAdmin: boolean) {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.setUserAdmin({
    params: { userId },
    body: { isAdmin },
  });
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to set admin rights (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function fetchInstanceAdminAppBundles() {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.listAppBundles();
  if (result.status !== 200) {
    throw new ApiError(result.status, `Failed to fetch app bundles (HTTP ${result.status})`);
  }
  return result.body.data;
}
