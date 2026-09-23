import { GEMMA_31B_ON_MELIOUS } from './gemmaHosts.js';
import { meliousFetchWithImpact } from './meliousImpactFetch.js';

/**
 * Der Flavor-Suffix wählt bei Melious den Upstream — und damit das Fenster.
 * Nadelprobe 23.09.2026, Gemma 4 31B, Prompt + Ausgabe:
 *
 *   `:balanced` / `:eco`  Melious' Knoten in FI   44.623 gefunden, ~46k → 400
 *   `:speed`              infercom/DE             130.574 gefunden, darüber 400
 *
 * `:balanced` bleibt der Standard: ein eigener Host neben Cortecs (der ebenfalls
 * an infercom vermittelt) und bei kurzen Prompts gut doppelt so schnell. Was
 * dort nicht hineinpasst, geht auf `:speed`. Der logische Modellname bleibt
 * `gemma-4-31b:balanced` — getauscht wird nur auf dem Draht, damit Nutzung,
 * Geschwister-Tabellen und Fallback-Ketten nichts davon merken.
 *
 * Gezählt wird über Zeichen, nicht Tokens: deutscher Text lag bei ~4,3
 * Zeichen/Token, Code und JSON dichter. 3 Zeichen/Token über den ganzen
 * JSON-Body überschätzt also — ein Grenzfall landet auf `:speed` statt im 400.
 * Ohne `max_tokens` reserviert die Schätzung 4.096 Ausgabe-Tokens.
 *
 * Melious sagt kein Routing zu. Nimmt `:speed` je einen anderen Upstream, kommt
 * ein lauter 400 und die Fallback-Kette greift.
 */
export const MELIOUS_WIDE_MODEL = 'gemma-4-31b:speed';
const BALANCED_TOKEN_LIMIT = 40_000;
const CHARS_PER_TOKEN = 3;
const DEFAULT_OUTPUT_RESERVE = 4_096;

export function meliousWireModel(body: Record<string, unknown>): string | null {
  if (body.model !== GEMMA_31B_ON_MELIOUS.model) return null;
  const output = typeof body.max_tokens === 'number' ? body.max_tokens : DEFAULT_OUTPUT_RESERVE;
  const estimate = JSON.stringify(body).length / CHARS_PER_TOKEN + output;
  return estimate > BALANCED_TOKEN_LIMIT ? MELIOUS_WIDE_MODEL : null;
}

/**
 * Melious' `gemma-4-31b` thinks by DEFAULT — gemessen 23.09.2026 gegen
 * api.melious.ai, Zwei-Satz-Frage, `max_tokens` 400, Reasoning-Tokens / Zeit:
 *
 *   nichts                                   268–379 / 3,6–4,3 s
 *   reasoning_effort: 'none'                   0     / 0,9–1,0 s  (5/5 Läufe)
 *   reasoning_effort: 'low'                  252     / 3,5 s
 *   chat_template_kwargs.enable_thinking=false  295  ← wirkungslos
 *   think:false · reasoning.enabled:false    317/364 ← wirkungslos
 *
 * Die Routing-Varianten (`:speed`, `:balanced`, ohne Suffix) ändern daran
 * nichts; sie wählen den Upstream, nicht den Denk-Modus.
 *
 * Das Denken kommt als `reasoning_content`, das der Chat-Completions-Parser des
 * SDK nicht liest — es wäre unsichtbar und zählte trotzdem gegen `max_tokens`.
 * Deshalb `none`, sofern der Aufrufer nichts anderes verlangt. Wer denken will,
 * nimmt den Denk-Strom (`regoloReasoningStream.ts`), der gradierte Werte sendet;
 * ein ausdrücklich gesetzter Wert wird hier nicht überschrieben, damit er nicht
 * still zum No-Op wird.
 */
export const meliousFetch: typeof fetch = async (input, init) => {
  if (init?.body && typeof init.body === 'string') {
    try {
      const parsed = JSON.parse(init.body) as Record<string, unknown>;
      if (parsed.model && parsed.messages) {
        if (parsed.reasoning_effort == null) parsed.reasoning_effort = 'none';
        parsed.model = meliousWireModel(parsed) ?? parsed.model;
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Non-JSON body (e.g. multipart upload), pass through unchanged
    }
  }
  return meliousFetchWithImpact(input, init);
};
