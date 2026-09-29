/** Capture Melious' per-request `environment_impact` before the AI SDK strips it. */

import { createLogger } from '../../utils/logger.js';
import { getUsageFeature, getUsageUserId } from '../../utils/usageContext.js';
import { recordImpact } from '../usage/UsageTrackingService.js';

import { parseUsageTokens } from './greenptImpact.js';

const log = createLogger('meliousImpact');
const TAP_CEILING_MS = 300_000;

type Impact = { energyWms: number; emissionsUg: number; inputTokens: number; outputTokens: number };

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
  return { energyWms, emissionsUg, ...parseUsageTokens(body) };
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

function parseSse(text: string): Impact | null {
  let found: Impact | null = null;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    const value = line.slice(5).trim();
    if (!value || value === '[DONE]') continue;
    try {
      found = parseMeliousImpact(JSON.parse(value)) ?? found;
    } catch {
      // A partial frame is not an impact record.
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
  const save = (impact: Impact | null): void => {
    if (!impact) return;
    recordImpact({ provider: 'melious', model, userId, feature: getUsageFeature(), ...impact });
  };
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    void response
      .clone()
      .json()
      .then(parseMeliousImpact)
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

/**
 * Melious keeps `environment_impact` off the wire on streamed responses
 * (docs.melious.ai/guides/streaming: "use the non-streaming shape if you need
 * them"; no lookup endpoint exists). A caller that needs the measurement asks
 * non-streaming and hands the SDK this replay: the finished completion as the
 * chunk sequence a stream would have produced.
 */
export function replayAsStream(completion: unknown): Response {
  const body = record(completion) ? completion : {};
  const choice = Array.isArray(body.choices) && record(body.choices[0]) ? body.choices[0] : {};
  const message = record(choice.message) ? choice.message : {};
  const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
  const frame = (delta: Record<string, unknown>, finish: unknown = null) => ({
    id: body.id,
    object: 'chat.completion.chunk',
    created: body.created,
    model: body.model,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });
  const frames: unknown[] = [
    frame({ role: 'assistant', content: message.content ?? null }),
    ...toolCalls.map((call, index) =>
      frame({ tool_calls: [{ ...(record(call) ? call : {}), index }] })
    ),
    frame({}, choice.finish_reason ?? 'stop'),
    {
      id: body.id,
      object: 'chat.completion.chunk',
      model: body.model,
      choices: [],
      usage: body.usage,
    },
  ];
  const sse = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') + 'data: [DONE]\n\n';
  return new Response(sse, { headers: { 'content-type': 'text/event-stream' } });
}
