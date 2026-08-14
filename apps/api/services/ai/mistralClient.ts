import 'dotenv/config';

import { Mistral } from '@mistralai/mistralai';

import { env } from '../../config/env.js';

const apiKey = env.MISTRAL_API_KEY;

if (!apiKey) {
  console.warn(
    '[Mistral Client] MISTRAL_API_KEY environment variable not set. Mistral client will not work correctly.'
  );
}

export interface ConnectionMetrics {
  attempts: number;
  successes: number;
  failures: number;
  retries: number;
  lastFailureTime: number | null;
  lastFailureReason: string | null;
}

const connectionMetrics: ConnectionMetrics = {
  attempts: 0,
  successes: 0,
  failures: 0,
  retries: 0,
  lastFailureTime: null,
  lastFailureReason: null,
};

/**
 * Default client, pinned to the regional endpoint (EU unless `MISTRAL_REGION`
 * says otherwise). Everything that carries user payload goes through here:
 * chat, embeddings, OCR, transcription and TTS speech are all served
 * regionally.
 */
const mistralClient = new Mistral({
  apiKey: apiKey,
  server: env.MISTRAL_REGION,
});

/**
 * Escape hatch for the two surfaces that do not exist on a regional endpoint
 * — they answer 404 "no Route matched" there:
 *   - `files.*`           → Files API (promptAssemblyGraph document upload)
 *   - `audio.voices.list` → TTS voice catalogue (ttsService)
 *
 * Reach for this ONLY for those two. The voice catalogue is metadata with no
 * user payload. The Files API does send content globally, which is why
 * promptAssemblyGraph prefers its data-URL path and gates the upload on
 * `MISTRAL_REGION === 'global'` — so it never runs in our EU deployment.
 */
const mistralGlobalClient = new Mistral({
  apiKey: apiKey,
  server: 'global',
});

console.log(
  `[Mistral Client] Initialized (region: ${env.MISTRAL_REGION})${apiKey ? '' : ' (API key not provided)'}`
);

process.on('exit', () => {
  if (connectionMetrics.attempts > 0) {
    console.log(
      `[Mistral Client] Connection metrics: ${connectionMetrics.attempts} attempts, ${connectionMetrics.successes} successes, ${connectionMetrics.failures} failures, ${connectionMetrics.retries} retries`
    );
    if (connectionMetrics.lastFailureTime) {
      console.log(
        `[Mistral Client] Last failure: ${connectionMetrics.lastFailureReason} at ${new Date(connectionMetrics.lastFailureTime).toISOString()}`
      );
    }
  }
});

export default mistralClient;
export { connectionMetrics, mistralGlobalClient };
