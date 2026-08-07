/**
 * useBgstOverviewTyped — typed ts-rest client wrappers for the BGST-instance
 * admin overview endpoints. Used internally by the admin/bgst hooks.
 */
import { getContractsClient } from '@gruenerator/shared/api';

export async function fetchBgstUsers() {
  const client = getContractsClient();
  const result = await client.bgstInstanceOverview.listUsers();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch BGST users (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function fetchBgstRoles() {
  const client = getContractsClient();
  const result = await client.bgstInstanceOverview.listRoles();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch BGST roles (HTTP ${result.status})`);
  }
  return result.body.data;
}
