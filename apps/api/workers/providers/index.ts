import { normalizeProviderName } from '../../services/ai/providers.js';

import { execute, type ExecuteDeps } from './execute.js';

import type { ProviderName } from '../../services/ai/providers.js';
import type { AIRequestData, AIWorkerResult } from '../types.js';

const KNOWN: readonly ProviderName[] = ['mistral', 'litellm', 'regolo', 'greenpt'];

async function executeProvider(
  providerName: ProviderName | string,
  requestId: string,
  data: AIRequestData,
  deps?: ExecuteDeps
): Promise<AIWorkerResult> {
  let provider = providerName as ProviderName;
  if (!KNOWN.includes(provider)) {
    // Retired provider names (e.g. 'ionos' from a stale client or a persisted
    // playground selection) degrade to a live lane instead of failing the turn.
    provider = normalizeProviderName(String(providerName));
    console.warn(
      `[providers ${requestId}] Unknown provider "${providerName}", falling back to "${provider}"`
    );
  }
  return execute(provider, requestId, data, deps);
}

export { execute, executeProvider, KNOWN as KNOWN_PROVIDERS };
