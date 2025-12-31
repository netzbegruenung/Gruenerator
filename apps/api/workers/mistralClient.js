const { Mistral } = require('@mistralai/mistralai');
require('dotenv').config({ quiet: true });

const apiKey = process.env.MISTRAL_API_KEY;

if (!apiKey) {
  console.warn('[Mistral Client] MISTRAL_API_KEY environment variable not set. Mistral client will not work correctly.');
}

// Connection metrics tracking
const connectionMetrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  retries: 0,
  lastFailureTime: null,
  lastFailureReason: null
};

// Create the Mistral client instance
const mistralClient = new Mistral({
  apiKey: apiKey
});

console.log(`[Mistral Client] Initialized with API key: ${apiKey ? `${apiKey.substring(0, 8)}...` : 'not provided'}`);

// Log metrics on process exit
process.on('exit', () => {
  if (connectionMetrics.attempts > 0) {
    console.log(`[Mistral Client] Connection metrics: ${connectionMetrics.attempts} attempts, ${connectionMetrics.successes} successes, ${connectionMetrics.failures} failures, ${connectionMetrics.retries} retries`);
    if (connectionMetrics.lastFailureTime) {
      console.log(`[Mistral Client] Last failure: ${connectionMetrics.lastFailureReason} at ${new Date(connectionMetrics.lastFailureTime).toISOString()}`);
    }
  }
});

// Export both client and metrics
module.exports = mistralClient;
module.exports.connectionMetrics = connectionMetrics;