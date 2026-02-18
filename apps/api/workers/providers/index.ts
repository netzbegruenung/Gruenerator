import * as ionos from './ionosAdapter.js';
import * as litellm from './litellmAdapter.js';
import * as mistral from './mistralAdapter.js';

import type { ProviderName } from '../../services/ai/providers.js';
import type { AIRequestData, AIWorkerResult } from '../types.js';

interface ProviderModule {
  execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult>;
}

const adapters: Record<string, ProviderModule> = { mistral, ionos, litellm };

async function executeProvider(
  providerName: ProviderName | string,
  requestId: string,
  data: AIRequestData
): Promise<AIWorkerResult> {
  const adapter = adapters[providerName];
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return adapter.execute(requestId, data);
}

export { mistral, ionos, litellm, adapters, executeProvider };
