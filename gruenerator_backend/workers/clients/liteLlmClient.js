const OpenAI = require('openai');

function getLiteLlmClient() {
  const apiKey = process.env.LITELLM_API_KEY;
  if (!apiKey) {
    throw new Error('LITELLM_API_KEY environment variable is required for LiteLLM requests');
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://litellm.netzbegruenung.verdigado.net'
  });
}

module.exports = { getLiteLlmClient };

