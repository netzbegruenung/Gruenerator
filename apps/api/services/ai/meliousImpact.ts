/**
 * Book Melious' per-request usage and `environment_impact` before the AI SDK strips them.
 *
 * Melious is a router: `environment_impact.provider_id` names the upstream that
 * served the request (berget/SE, infercom/DE, its own FI nodes …). Both rows —
 * tokens and the live measurement — are booked under that upstream, and BOTH
 * here: the token row has to sit under the same provider as the measurement, or
 * the usage stats see an unmeasured token row next to an unrelated measured one
 * and estimate the request a second time. Only the body names the upstream, so
 * `withUsageTracking` leaves Melious' tokens to this HTTP boundary.
 */

import { createLogger } from '../../utils/logger.js';
import { getUsageFeature, getUsageUserId } from '../../utils/usageContext.js';
import { recordImpact, recordTokenUsage } from '../usage/UsageTrackingService.js';

import { parseUsageTokens } from './greenptImpact.js';

const log = createLogger('meliousImpact');
const TAP_CEILING_MS = 300_000;

type Impact = {
  energyWms: number;
  emissionsUg: number;
  inputTokens: number;
  outputTokens: number;
  /** `environment_impact.provider_id`, the upstream that served the request. */
  upstream: string | null;
};
type Usage = { inputTokens: number; outputTokens: number; cachedInputTokens: number };

/** Booked provider for a Melious response: the upstream it names, else the router. */
export function meliousBookedProvider(impact: Impact | null): string {
  return impact?.upstream ?? 'melious';
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Convert Melious' kWh / grams units into our measured Wms / micrograms. */
export function parseMeliousImpact(body: unknown): Impact | null {
  if (!record(body) || !record(body.environment_impact)) return null;
  const energyKwh = body.environment_impact.energy_kwh;
  const carbonG = body.environment_impact.carbon_g_co2;
  const energyWms =
    typeof energyKwh === 'number' && Number.isFinite(energyKwh) ? energyKwh * 3_600_000_000 : 0;
  const emissionsUg =
    typeof carbonG === 'number' && Number.isFinite(carbonG) ? carbonG * 1_000_000 : 0;
  if (energyWms <= 0 && emissionsUg <= 0) return null;
  const providerId = body.environment_impact.provider_id;
  // Becomes a usage-row key and a lookup into energyFootprint.ts — accept only a plain id.
  const upstream =
    typeof providerId === 'string' && /^[a-z0-9][a-z0-9_-]{0,39}$/.test(providerId.toLowerCase())
      ? providerId.toLowerCase()
      : null;
  return { energyWms, emissionsUg, ...parseUsageTokens(body), upstream };
}

function parseMeliousUsage(body: unknown): Usage | null {
  if (!record(body) || !record(body.usage) || typeof body.usage.prompt_tokens !== 'number') {
    return null;
  }
  const details = body.usage.prompt_tokens_details;
  const cached = record(details) ? details.cached_tokens : null;
  return {
    inputTokens: body.usage.prompt_tokens,
    outputTokens:
      typeof body.usage.completion_tokens === 'number' ? body.usage.completion_tokens : 0,
    cachedInputTokens: typeof cached === 'number' ? cached : 0,
  };
}

type Booking = { usage: Usage | null; impact: Impact | null };

function parseBody(body: unknown): Booking {
  return { usage: parseMeliousUsage(body), impact: parseMeliousImpact(body) };
}

export function meliousModelFromRequest(body: unknown): string | null {
  if (typeof body !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(body);
    return record(parsed) && typeof parsed.model === 'string' ? parsed.model : null;
  } catch {
    return null;
  }
}

function parseSse(text: string): Booking {
  const found: Booking = { usage: null, impact: null };
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const value = line.slice(5).trim();
    if (!value || value === '[DONE]') continue;
    try {
      const frame = parseBody(JSON.parse(value));
      found.usage = frame.usage ?? found.usage;
      found.impact = frame.impact ?? found.impact;
    } catch {
      // A partial frame is not a usage record.
    }
  }
  return found;
}

export function captureMeliousImpact(
  response: Response,
  model: string | null,
  signal?: AbortSignal | null
): Response {
  const userId = getUsageUserId();
  if (!userId || !model || !response.ok) return response;
  const feature = getUsageFeature();
  const save = ({ usage, impact }: Booking): void => {
    const provider = meliousBookedProvider(impact);
    if (usage) recordTokenUsage({ provider, model, userId, feature, ...usage });
    if (impact) {
      const { upstream: _upstream, ...measured } = impact;
      recordImpact({ provider, model, userId, feature, ...measured });
    }
  };
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    void response
      .clone()
      .json()
      .then(parseBody)
      .then(save)
      .catch((error: unknown) => log.debug('impact parse failed:', error));
    return response;
  }
  if (!response.body) return response;
  const [caller, tap] = response.body.tee();
  const reader = tap.getReader();
  const stop = (): void => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', stop, { once: true });
  const ceiling = setTimeout(stop, TAP_CEILING_MS);
  void (async () => {
    try {
      const decoder = new TextDecoder();
      let tail = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        tail = (tail + decoder.decode(value, { stream: true })).slice(-16_000);
      }
      save(parseSse(tail + decoder.decode()));
    } catch (error) {
      log.debug('impact stream tap failed:', error);
    } finally {
      clearTimeout(ceiling);
      signal?.removeEventListener('abort', stop);
    }
  })();
  return new Response(caller, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
