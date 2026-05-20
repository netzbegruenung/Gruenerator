import { getContractsClient } from '@gruenerator/shared/api';
import { type ImageModelId } from '@gruenerator/shared/models';

export async function fetchImageModelPreference() {
  const client = getContractsClient();
  const result = await client.imageModelPreference.getPreference();
  if (result.status !== 200) {
    throw new Error(`Failed to fetch image model preference (HTTP ${result.status})`);
  }
  return result.body;
}

export async function updateImageModelPreference(modelId: ImageModelId) {
  const client = getContractsClient();
  const result = await client.imageModelPreference.updatePreference({
    body: { modelId },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to update image model preference (HTTP ${result.status})`);
  }
  return result.body;
}
