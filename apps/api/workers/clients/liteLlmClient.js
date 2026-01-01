const BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';

function getLiteLlmClient() {
  const apiKey = process.env.LITELLM_API_KEY;
  if (!apiKey) {
    throw new Error('LITELLM_API_KEY environment variable is required for LiteLLM requests');
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
            throw new Error(`LiteLLM API error (${response.status}): ${errorMessage}`);
          }

          return response.json();
        }
      }
    }
  };
}

export { getLiteLlmClient };