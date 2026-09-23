import { meliousFetchWithImpact } from './meliousImpactFetch.js';

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
      if (parsed.model && parsed.messages && parsed.reasoning_effort == null) {
        parsed.reasoning_effort = 'none';
        init = { ...init, body: JSON.stringify(parsed) };
      }
    } catch {
      // Non-JSON body (e.g. multipart upload), pass through unchanged
    }
  }
  return meliousFetchWithImpact(input, init);
};
