import OpenAI from 'openai';

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
require('dotenv').config({ quiet: true });

let telekomClient: OpenAI | null = null;

export function getTelekomClient(): OpenAI {
  if (!telekomClient) {
    const apiKey = process.env.TELEKOM_API_KEY;
    const baseURL = process.env.TELEKOM_BASE_URL || 'https://llm-server.llmhub.t-systems.net/v2';

    if (!apiKey) {
      throw new Error('[Telekom Client] TELEKOM_API_KEY environment variable is not set');
    }

    telekomClient = new OpenAI({
      apiKey,
      baseURL,
    });

    console.log(`[Telekom Client] Initialized with base URL: ${baseURL}`);
  }

  return telekomClient;
}
