/**
 * useAdminSkillsTyped — typed ts-rest client wrappers for admin Rezepte
 * (skill) visibility endpoints.
 *
 * Used internally by useAdminSkills.ts. Throws on non-2xx so TanStack Query
 * surfaces them as errors.
 */

import { getContractsClient } from '@gruenerator/shared/api';

export async function fetchAdminSkills() {
  const client = getContractsClient();
  const result = await client.skillVisibility.list();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch admin skills (HTTP ${result.status})`);
  }
  return result.body.data;
}

export async function setSkillHidden(mention: string, hidden: boolean): Promise<void> {
  const client = getContractsClient();
  const result = await client.skillVisibility.setHidden({
    params: { mention },
    body: { hidden },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to update skill visibility (HTTP ${result.status})`);
  }
}
