const BASE_URL = 'https://litellm.netzbegruenung.verdigado.net';

export interface ChatCompletionConfig {
  model: string;
  messages: Array<{
    role: string;
    content: string;
  }>;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  tools?: unknown[];
  tool_choice?: unknown;
  [key: string]: unknown;
}

export interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface LiteLlmClient {
  chat: {
    completions: {
      create(config: ChatCompletionConfig): Promise<ChatCompletionResponse>;
    };
  };
}

function getLiteLlmClient(): LiteLlmClient {
  const apiKey = process.env.LITELLM_API_KEY;
  if (!apiKey) {
    throw new Error('LITELLM_API_KEY environment variable is required for LiteLLM requests');
  }

  return {
    chat: {
      completions: {
        async create(config: ChatCompletionConfig): Promise<ChatCompletionResponse> {
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
            let errorMessage: string;
            try {
              const parsed = JSON.parse(errorBody);
              errorMessage = parsed.error?.message || parsed.message || errorBody;
            } catch {
              errorMessage = errorBody || `HTTP ${response.status}`;
            }
            throw new Error(`LiteLLM API error (${response.status}): ${errorMessage}`);
          }

          return response.json() as Promise<ChatCompletionResponse>;
        }
      }
    }
  };
}

export { getLiteLlmClient };
