/**
 * Captures GreenPT's `impact` object (energy + emissions) off the wire.
 *
 * GreenPT is the only provider we use that reports the environmental cost of an
 * inference, and it reports it on a top-level field the AI SDK never surfaces:
 * `createOpenAI(...).chat()` parses responses through a Zod schema that strips
 * unknown keys, and `providerMetadata` only carries fields the OpenAI provider
 * knows about. So a `wrapLanguageModel` middleware — where the token accounting
 * lives — cannot see it. The HTTP layer is the last place it exists.
 *
 * Both shapes were probed against the live API on 2026-07-31:
 *   non-streaming  { usage: {...}, impact: { energy: {total, unit}, ... } }
 *   streaming      the final SSE event, the same one carrying `usage`, with
 *                  `choices: []`. Not a separate event, and not on `[DONE]`.
 *
 * `/v1/listen` (speech-to-text) carries NO impact field — verified with an 8.7s
 * sample, HTTP 200, response holding only metadata/results/model. Transcription
 * therefore cannot be measured this way at all.
 */

import { createLogger } from '../../utils/logger.js';
import { getUsageFeature, getUsageUserId } from '../../utils/usageContext.js';
import { recordImpact } from '../usage/UsageTrackingService.js';

const log = createLogger('greenptImpact');

interface ImpactTotals {
  energyWms: number;
  emissionsUg: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads `{ total, unit }` without trusting either field. */
function total(value: unknown): number {
  if (!isRecord(value)) return 0;
  return typeof value.total === 'number' && Number.isFinite(value.total) ? value.total : 0;
}

/**
 * Pull the impact totals out of a parsed response body. Returns null when the
 * field is absent (every non-GreenPT shape, and GreenPT's own STT endpoint) or
 * when both numbers are zero, so a malformed payload never records a data point.
 */
export function parseImpact(body: unknown): ImpactTotals | null {
  if (!isRecord(body) || !isRecord(body.impact)) return null;
  const energyWms = total(body.impact.energy);
  const emissionsUg = total(body.impact.emissions);
  if (energyWms <= 0 && emissionsUg <= 0) return null;
  return { energyWms, emissionsUg };
}

/**
 * Scan an SSE transcript for the last event carrying an impact object.
 * Tolerates partial trailing frames and the `[DONE]` sentinel.
 */
export function parseImpactFromSse(text: string): ImpactTotals | null {
  let found: ImpactTotals | null = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '' || payload === '[DONE]') continue;
    try {
      const impact = parseImpact(JSON.parse(payload));
      if (impact) found = impact;
    } catch {
      // Truncated or non-JSON frame — the next one may still be intact.
    }
  }
  return found;
}

/** Model id off the outgoing request body, so the row keys match the token row. */
export function modelFromRequestBody(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return isRecord(parsed) && typeof parsed.model === 'string' ? parsed.model : null;
  } catch {
    return null;
  }
}

/**
 * Tap a GreenPT response for its impact figures without disturbing the consumer.
 *
 * `userId`/`feature` are read by the caller BEFORE the request is issued: on a
 * streamed response the impact arrives after the async-local request context has
 * unwound, exactly as `usageModelMiddleware` documents for token counts.
 *
 * Returns the response the caller should pass on — the original for the
 * buffered path, a re-wrapped one for the streamed path.
 */
export function captureImpact(response: Response, model: string | null): Response {
  const userId = getUsageUserId();
  if (!userId || !model || !response.ok) return response;
  const feature = getUsageFeature();

  const record = (impact: ImpactTotals | null): void => {
    if (!impact) return;
    recordImpact({
      provider: 'greenpt',
      model,
      userId,
      feature,
      energyWms: impact.energyWms,
      emissionsUg: impact.emissionsUg,
    });
  };

  const isStream = response.headers.get('content-type')?.includes('text/event-stream') === true;

  if (!isStream) {
    // clone() so the caller still gets an unread body.
    void response
      .clone()
      .json()
      .then((body: unknown) => record(parseImpact(body)))
      .catch((error: unknown) => log.debug('[GreenPT] impact parse failed:', error));
    return response;
  }

  if (!response.body) return response;

  const [forCaller, forUs] = response.body.tee();
  // The tapped branch MUST be drained to completion — an unread tee branch
  // applies backpressure that would stall the branch the caller is reading.
  void (async () => {
    try {
      const decoder = new TextDecoder();
      const reader = forUs.getReader();
      // Only the tail can carry the impact event; keep a bounded window rather
      // than the whole answer.
      let tail = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tail = (tail + decoder.decode(value, { stream: true })).slice(-16_000);
      }
      record(parseImpactFromSse(tail + decoder.decode()));
    } catch (error) {
      log.debug('[GreenPT] impact stream tap failed:', error);
    }
  })();

  return new Response(forCaller, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
