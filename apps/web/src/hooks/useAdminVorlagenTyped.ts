/**
 * useAdminVorlagenTyped — typed ts-rest client wrappers for admin Vorlagen endpoints.
 *
 * Used internally by useAdminVorlagen.ts to replace raw apiClient calls.
 * Throws on non-2xx so TanStack Query surfaces them as errors.
 */

import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';

export async function fetchAdminVorlagen(status = 'pending_review') {
  const client = getContractsClient();
  const result = await client.adminVorlagen.list({
    query: { status },
  });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch admin vorlagen');
  }
  return result.body.data;
}

export async function fetchVorlagenStats() {
  const client = getContractsClient();
  const result = await client.adminVorlagen.getStats();
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch vorlagen stats');
  }
  return result.body.data;
}

export async function approveVorlage(id: string, message?: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.adminVorlagen.approve({
    params: { id },
    body: { message: message ?? null },
  });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to approve vorlage');
  }
}

export async function rejectVorlage(id: string, reason?: string): Promise<void> {
  const client = getContractsClient();
  const result = await client.adminVorlagen.reject({
    params: { id },
    body: { reason: reason ?? null },
  });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to reject vorlage');
  }
}
