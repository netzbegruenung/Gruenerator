import * as bedrock from './bedrockAdapter.js';
import * as claude from './anthropicAdapter.js';
import * as mistral from './mistralAdapter.js';
import * as ionos from './ionosAdapter.js';
import * as litellm from './litellmAdapter.js';

const adapters = { bedrock, claude, mistral, ionos, litellm };

async function executeProvider(providerName, requestId, data) {
  const adapter = adapters[providerName];
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return adapter.execute(requestId, data);
}

export { bedrock, claude, mistral, ionos, litellm, adapters, executeProvider };