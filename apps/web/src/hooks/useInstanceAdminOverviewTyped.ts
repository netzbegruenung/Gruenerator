/**
 * useInstanceAdminOverviewTyped — typed ts-rest client wrappers for the BGST-instance
 * admin overview endpoints. Used internally by the admin/bgst hooks.
 */
import { getContractsClient } from '@gruenerator/shared/api';

export async function fetchInstanceAdminUsers() {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.listUsers();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch BGST users (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function fetchInstanceAdminRoles() {
  const client = getContractsClient();
  const result = await client.instanceAdminOverview.listRoles();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch BGST roles (HTTP ${result.status})`);
  }
  return result.body.data;
}
