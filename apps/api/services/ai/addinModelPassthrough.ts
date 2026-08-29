/**
 * Minimal OpenAI-compatible passthrough for headless clients (Excel add-in).
 *
 * Ging bis zum 29.08.2026 an verdigado/LiteLLM und geht jetzt an Cortecs —
 * dieselbe Stilllegung wie überall sonst, siehe ./litellmRetired.ts. Für dieses
 * Modul ist es kein reiner Hostwechsel, sondern ein Modellwechsel, deshalb
 * steht unten, was gemessen wurde.
 *
 * Deliberately a raw `fetch` rather than the AI SDK: `@ai-sdk/openai`'s
 * Chat-Completions delta schema has no `reasoning` field, so a thinking model's
 * stream would be dropped on that path — the same gap `regoloReasoningStream.ts`
 * exists to work around. Piping the upstream bytes is both less code and
 * lossless for fields we do not model.
 *
 * Consumers bring their own agent loop (the Excel add-in has 20 Excel tools of
 * its own); this module only supplies model access.
 */

import { env } from '../../config/env.js';
import { toUserFacingMessage } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import { cortecsBaseUrl } from './cortecsEndpoint.js';
import { GEMMA_31B_ON_CORTECS } from './gemmaHosts.js';
import { CORTECS_SMALL_32 } from './intermediateLanes.js';

const log = createLogger('addinModelPassthrough');

/**
 * Die einzigen Modelle, die dieser Endpoint erreichen darf.
 *
 * Eine geschlossene Liste, kein Durchreichen des Anbieter-Katalogs: dort stehen
 * auch Embedding-Modelle, die ein Client ansonsten auswählt und die auf einen
 * Chat-Request unbrauchbar antworten. Und ein offener `model`-Parameter machte
 * aus jedem API-Schlüssel einen Generalzugang zu unserem Anbieterkonto.
 *
 * Beide Kennungen sind am 29.08.2026 gewechselt, weil der alte Host stillgelegt
 * ist. Der Nachfolger von `verdigado-think` ist ein reiner HOSTWECHSEL —
 * `gemma-4-31b-it` ist dasselbe dichte Gemma 4 31B, nur ohne den auf Verdigado
 * unabschaltbaren Denkblock. Der von `verdigado-pro` ist ein Modellwechsel.
 *
 * Gemessen am selben Tag mit einem echten Werkzeug-Aufruf in Tabellen-Bauform
 * (`setRange` mit `range`/`values`/`format`-Enum), je ein Lauf:
 *
 *   gemma-4-31b-it                        1596 ms, finish_reason=tool_calls,
 *                                         Argumente vollständig und Enum korrekt
 *   mistral-small-3.2-24b-instruct-2506   1133 ms, dito
 *
 * Das ersetzt NICHT den alten Rundenvergleich (verdigado-think brauchte 3
 * Runden ohne Schema-Verstoss, verdigado-pro 4 mit zweien) — der lief über den
 * vollen 20-Werkzeug-Loop des Add-ins, diese Probe über ein Werkzeug. Was sie
 * belegt, ist die notwendige Bedingung: beide Nachfolger rufen ein erzwungenes
 * Werkzeug sauber auf, statt es mit Prosa zu beantworten.
 */
export const ALLOWED_MODELS = [GEMMA_31B_ON_CORTECS.model, CORTECS_SMALL_32.model] as const;
export type AllowedModel = (typeof ALLOWED_MODELS)[number];

/**
 * Anzeigenamen für die Modellauswahl im Client. Ein Client, der `/models`
 * abfragt, bekommt sonst nur die technischen Kennungen zu sehen.
 */
export const MODEL_LABELS: Record<AllowedModel, string> = {
  [GEMMA_31B_ON_CORTECS.model]: 'Gemma 4 31B',
  [CORTECS_SMALL_32.model]: 'Mistral Small 3.2 24B',
};

/** Gemma 4 bleibt der Standard — dieselben Gewichte wie bisher. */
export const DEFAULT_MODEL: AllowedModel = GEMMA_31B_ON_CORTECS.model;

export function isAllowedModel(model: string): model is AllowedModel {
  return (ALLOWED_MODELS as readonly string[]).includes(model);
}

/**
 * Die alten Verdigado-Kennungen auf ihre Nachfolger bringen.
 *
 * Ein Add-in im Feld hat die Liste von `GET /v1/models` GECACHT — der Kommentar
 * an jener Route sagt es selbst. Ohne diese Zuordnung schickt jede installierte
 * Kopie nach dem Deploy weiter `verdigado-think` und bekäme eine 400, bis der
 * Client seinen Cache erneuert. Das ist dieselbe F0-Regel wie überall:
 * ausgeliefertes Zeug spricht das alte Format weiter, also wird es tolerant
 * gelesen und umgeschrieben (siehe ./litellmRetired.ts).
 *
 * Nicht in `ALLOWED_MODELS`: angeboten werden die alten Namen nicht mehr.
 */
const LEGACY_MODEL_IDS: Readonly<Record<string, AllowedModel>> = {
  'verdigado-think': GEMMA_31B_ON_CORTECS.model,
  'verdigado-pro': CORTECS_SMALL_32.model,
  gemma: GEMMA_31B_ON_CORTECS.model,
};

export function resolveRequestedModel(model: string): AllowedModel | null {
  if (isAllowedModel(model)) return model;
  return LEGACY_MODEL_IDS[model] ?? null;
}

/**
 * Obergrenze für die Eingabe.
 *
 * Sie existierte, weil Verdigados Ollama einen zu grossen Prompt NICHT ablehnte,
 * sondern still kürzte und über das Fragment antwortete (gemessen:
 * `prompt_tokens: 65538` bei ~350k Eingabe, HTTP 200). Cortecs ist kein Ollama;
 * ob es sauber mit 400 ablehnt, ist NICHT nachgemessen. Die Grenze bleibt
 * deshalb stehen und nennt jetzt das kleinere der beiden erlaubten Fenster —
 * Cortecs' eigener Katalog meldet für `mistral-small-3.2-24b-instruct-2506`
 * `context_size: 131000` (abgefragt 29.08.2026). Zu klein kostet nur eine
 * Ablehnung, zu gross kostet unsichtbar Kontext.
 */
export const MAX_PROMPT_TOKENS = 131_000;

/**
 * Body keys that must never come from the client. Ein Gateway honoriert manche
 * davon als Routing-Übersteuerung pro Anfrage, was einen Aufrufer unseren
 * authentifizierten Proxy auf einen beliebigen Upstream zeigen liesse.
 */
const FORBIDDEN_BODY_KEYS = new Set(['api_base', 'api_key', 'base_url', 'custom_llm_provider']);

/**
 * Rough char-to-token estimate over everything that occupies context — messages
 * AND tool definitions, since a 20-tool schema is a substantial share of the
 * prompt. Intentionally approximate: its only job is to catch the requests that
 * would otherwise be answered from a truncated prompt.
 */
export function estimatePromptTokens(body: Record<string, unknown>): number {
  const contextual = { messages: body.messages, tools: body.tools };
  return Math.ceil(JSON.stringify(contextual).length / 4);
}

export type PassthroughResult =
  { ok: true; response: Response } | { ok: false; status: number; error: string };

export async function forwardChatCompletion(
  body: Record<string, unknown>,
  signal?: AbortSignal
): Promise<PassthroughResult> {
  // `CORTECS_API_KEY` is optional in the env schema. Cortecs ist zudem
  // VORAUSBEZAHLT — ein leeres Guthaben antwortet mit 401 wie ein fehlender
  // Schlüssel, nur erst auf der Leitung. Der Test hier fängt den frühen Fall ab.
  const apiKey = env.CORTECS_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: 'Model backend is not configured' };
  }
  const baseUrl = cortecsBaseUrl();

  const forwarded: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!FORBIDDEN_BODY_KEYS.has(key)) forwarded[key] = value;
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwarded),
      ...(signal && { signal }),
    });
  } catch (err) {
    if (signal?.aborted) return { ok: false, status: 499, error: 'Client closed request' };
    // Der Rohtext gehört ins Log, nicht zum Client: ein fehlgeschlagener fetch
    // trägt die interne Adresse des Upstreams im Text ("connect ECONNREFUSED
    // 10.x.x.x:4000"). Für die aufrufende Seite ändert das nichts — sie kann
    // ohnehin nur neu versuchen.
    log.error('[addin] upstream request failed: %s', err);
    return {
      ok: false,
      status: 502,
      error: toUserFacingMessage(err, 'Upstream request failed'),
    };
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    // A 401/403 from the upstream means OUR key (or prepaid balance) is the
    // problem, not the caller's. Passing it through would tell the client to go
    // re-check a key that is fine.
    const status = response.status === 401 || response.status === 403 ? 502 : response.status;
    return {
      ok: false,
      status,
      error: detail.slice(0, 500) || `Upstream error ${response.status}`,
    };
  }

  return { ok: true, response };
}
