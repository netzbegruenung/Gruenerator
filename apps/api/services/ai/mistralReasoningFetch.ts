import { wrapLanguageModel } from 'ai';

import { createLogger } from '../../utils/logger.js';

import type { LanguageModel, LanguageModelMiddleware } from 'ai';

/**
 * `reasoning_effort` für Mistral-Modelle, die `@ai-sdk/mistral` nicht kennt.
 *
 * Das SDK sendet `providerOptions.mistral.reasoningEffort` nur für Modell-IDs
 * aus seiner fest verdrahteten Liste (`reasoningEffortModelIds`) und verwirft
 * es sonst STILL. `mistral-large-4` (Ultra seit 06.10.2026) fehlt dort auch in
 * 4.0.57; die rohe API denkt mit `reasoning_effort: "high"` einwandfrei. Das
 * Auslesen der Denkblöcke in der Antwort hängt nicht an der Liste.
 *
 * Darum zwei Hälften: die Middleware reicht die Wahl des Aufrufers als
 * interner Header am SDK vorbei, der fetch-Wrapper nimmt ihn wieder ab und
 * schreibt das Feld in den Body — nur wenn das SDK es nicht selbst gesetzt hat.
 * Kennt eine spätere SDK-Version die ID, ist der Wrapper ein No-op.
 */
const REASONING_HEADER = 'x-gruenerator-reasoning-effort';

const log = createLogger('mistralReasoningFetch');

export function withMistralReasoningEffort(model: LanguageModel): LanguageModel {
  if (typeof model === 'string') return model;

  const middleware: LanguageModelMiddleware = {
    transformParams: async ({ params }) => {
      const effort = (params.providerOptions?.mistral as { reasoningEffort?: unknown } | undefined)
        ?.reasoningEffort;
      if (typeof effort !== 'string') return params;
      return { ...params, headers: { ...params.headers, [REASONING_HEADER]: effort } };
    },
  };

  return wrapLanguageModel({ model, middleware });
}

export const mistralReasoningFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);
  const effort = headers.get(REASONING_HEADER);
  if (effort === null) return fetch(input, init);

  headers.delete(REASONING_HEADER);
  let body = init?.body ?? null;
  if (typeof body !== 'string') {
    log.warn(`reasoning_effort "${effort}" dropped: request body is not a string`);
  } else {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (parsed.reasoning_effort === undefined) {
      body = JSON.stringify({ ...parsed, reasoning_effort: effort });
    }
  }
  return fetch(input, { ...init, headers, body });
};
