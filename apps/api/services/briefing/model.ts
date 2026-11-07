/**
 * Das Modell für das Tagesbriefing — bewusst an `AI_LANES` vorbei gepinnt.
 *
 * Melious `gemma-4-31b:speed`: am 23.09.2026 vermittelte `:speed` an infercom/DE
 * (131k Fenster); das Routing ist nicht zugesagt (`services/ai/gemmaHosts.ts`).
 * Schnell ist es, weil `meliousFetch` `reasoning_effort: 'none'` setzt — gemessen
 * 0,9–1,0 s statt 3,6–4,3 s mit dem standardmäßigen Denken
 * (`services/ai/meliousThinkingFetch.ts`). Ein Ausfall läuft über
 * `GENERIC_FALLBACK`; der persönliche Pfad wartet nicht darauf, sondern nimmt
 * nach dem Timeout die feste Vorlage.
 */
export const BRIEFING_MODEL = { provider: 'melious', model: 'gemma-4-31b:speed' } as const;

/** Sampling-Schlüssel des Aufrufs (keine Zeile in `AI_LANES` — gepinnt). */
export const BRIEFING_LANE = 'briefing';
