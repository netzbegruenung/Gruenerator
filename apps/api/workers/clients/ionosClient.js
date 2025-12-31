const BASE_URL = 'https://openai.inference.de-txl.ionos.com/v1';

function getIonosClient() {
  const apiKey = process.env.IONOS_API_TOKEN;
  if (!apiKey) {
    throw new Error('IONOS_API_TOKEN environment variable is required for IONOS requests');
  }

  return {
    chat: {
      completions: {
        async create(config) {
          const response = await fetch(`${BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(config)
          });

          if (!response.ok) {
            const errorBody = await response.text();
            let errorMessage;
            try {
              const parsed = JSON.parse(errorBody);
              errorMessage = parsed.error?.message || parsed.message || errorBody;
            } catch {
              errorMessage = errorBody || `HTTP ${response.status}`;
            }
            throw new Error(`IONOS API error (${response.status}): ${errorMessage}`);
          }

          return response.json();
        }
      }
    }
  };
}

module.exports = { getIonosClient };

