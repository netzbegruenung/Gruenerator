import { normalizeProviderName } from '../providers.js';

import { execute, type ExecuteDeps } from './execute.js';

import type { ProviderName } from '../providers.js';
import type { AIRequestData, AiResult } from '../types.js';

// Must list EVERY ProviderName. This is an array, not a Record, so the compiler
// does not check it — a missing member is not an error but a silent downgrade:
// `normalizeProviderName` sends the unknown name to 'mistral', i.e. the most
// expensive model, behind nothing but a console.warn.
const KNOWN: readonly ProviderName[] = [
  'mistral',
  'litellm',
  'regolo',
  'greenpt',
  'scaleway',
  'cortecs',
];

async function executeProvider(
  providerName: ProviderName | string,
  requestId: string,
  data: AIRequestData,
  deps?: ExecuteDeps
): Promise<AiResult> {
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
