const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config();

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.warn('[Mistral Client] MISTRAL_API_KEY environment variable not set. Mistral client will not work correctly.');
}

// Create the Mistral client instance
const mistralClient = new Mistral({
  apiKey: apiKey
});

console.log(`[Mistral Client] Initialized with API key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'not provided'}`);

module.exports = mistralClient;