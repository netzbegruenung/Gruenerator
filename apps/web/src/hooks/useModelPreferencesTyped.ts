/**
 * useModelPreferencesTyped — typed ts-rest client wrappers for the
 * model-preferences endpoints. Mirrors useNotificationsTyped.
 */

import { apiErrorFromResponse, getContractsClient } from '@gruenerator/shared/api';
import { type TextModelId } from '@gruenerator/shared/models';

export async function fetchModelPreferences() {
  const client = getContractsClient();
  const result = await client.modelPreferences.getPreferences();
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to fetch model preferences');
  }
  return result.body;
}

export async function updateModelPreference(modelId: TextModelId, enabled: boolean) {
  const client = getContractsClient();
  const result = await client.modelPreferences.updatePreference({
    body: { modelId, enabled },
  });
  if (result.status !== 200) {
    throw apiErrorFromResponse(result, 'Failed to update model preference');
  }
  return result.body;
}
