import { normalizeProviderName } from '../../services/ai/providers.js';

import * as litellm from './litellmAdapter.js';
import * as mistral from './mistralAdapter.js';
import * as regolo from './regoloAdapter.js';

import type { ProviderName } from '../../services/ai/providers.js';
import type { AIRequestData, AIWorkerResult } from '../types.js';

interface ProviderModule {
  execute(requestId: string, data: AIRequestData): Promise<AIWorkerResult>;
}

const adapters: Record<string, ProviderModule> = { mistral, litellm, regolo };

async function executeProvider(
  providerName: ProviderName | string,
  requestId: string,
  data: AIRequestData
): Promise<AIWorkerResult> {
  let adapter = adapters[providerName];
  if (!adapter) {
    // Legacy/retired provider names (e.g. 'ionos' from stale clients or
    // persisted playground selections) degrade to a live provider instead
    // of failing the request.
    const normalized = normalizeProviderName(String(providerName));
    console.warn(
      `[providers ${requestId}] Unknown provider "${providerName}", falling back to "${normalized}"`
    );
    adapter = adapters[normalized];
  }
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return adapter.execute(requestId, data);
}

export { mistral, litellm, regolo, adapters, executeProvider };
