/**
 * Where Scaleway's Generative APIs live.
 *
 * Its own module so the base URL and its `/v1` handling live in one place,
 * rather than being restated wherever a Scaleway endpoint is called.
 *
 * The path segment is a Scaleway PROJECT ID, so the URL is configuration rather
 * than a constant: a second project (staging, another org) is an env change.
 */

export const SCALEWAY_DEFAULT_BASE_URL =
  'https://api.scaleway.ai/fbd4431b-a720-4d8e-8d6a-8598f02c1f84/v1';

/**
 * The configured base URL, `/v1` appended only when absent — so both
 * `…/<project>` and `…/<project>/v1` work, matching how LITELLM_BASE_URL
 * behaves.
 *
 * Reads `process.env` rather than the parsed `env` module so that runtime
 * changes, and tests that set or unset the variable, take effect; the parsed
 * module is cached at import time. Same reasoning as
 * regoloTranscriptionService's call-time key read.
 */
export function scalewayBaseUrl(): string {
  const configured = process.env.SCALEWAY_BASE_URL;
  if (!configured) return SCALEWAY_DEFAULT_BASE_URL;
  return configured.endsWith('/v1') ? configured : `${configured}/v1`;
}
