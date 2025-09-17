const bedrock = require('./bedrockAdapter');
const claude = require('./anthropicAdapter');
const openai = require('./openaiAdapter');
const mistral = require('./mistralAdapter');
const ionos = require('./ionosAdapter');
const litellm = require('./litellmAdapter');

const adapters = { bedrock, claude, openai, mistral, ionos, litellm };

async function executeProvider(providerName, requestId, data) {
  const adapter = adapters[providerName];
  if (!adapter || typeof adapter.execute !== 'function') {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return adapter.execute(requestId, data);
}

module.exports = { ...adapters, executeProvider };

