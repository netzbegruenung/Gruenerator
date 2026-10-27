/**
 * Drops tool calls whose name the provider will refuse.
 *
 * Mistral Medium intermittently emits a tool call whose `name` is the joined
 * indices of the batch it meant to make — literally `"1,2,5"` or `"2,4,6"`.
 * Nothing executes it, but the malformed call stays in the message history, and
 * the NEXT request echoes it back to the API, which answers:
 *
 *   400 Function name was 2,4,6 but must be a-z, A-Z, 0-9, underscores or dashes
 *
 * That 400 aborts the run — reproduced twice on 10.08.2026, both times minutes
 * in, once after the research was essentially done. `parallel_tool_calls: false`
 * made it rarer (measured: three concurrent calls collapse to one) but never
 * eliminated it, so the history is cleaned here instead of hoping upstream.
 *
 * That is also why the lead may batch again: this repair, not the provider
 * setting, is what the run survives on. The lead delegates in parallel
 * (`PARALLEL_TOOL_CALLS` in models.ts) precisely because a bad batch is repaired
 * here, and the worker — which has nothing to batch — stays serial.
 *
 * Repairing rather than failing is the point: a dropped call costs one step, a
 * poisoned history costs the whole report.
 *
 * ── Where the repair sits now ─────────────────────────────────────────────
 *
 * The AI SDK does not throw on such a call: it records it as an invalid tool
 * call with a `tool-error` result and carries on. That keeps the run alive for
 * one step, but the call is still in the history, and the next request would
 * echo the poisoned name back to Mistral. So the history is cleaned in
 * `prepareStep`, before every model call; a messages override there carries
 * forward to the later steps, so a dropped call stays dropped.
 *
 * (Under LangChain the same call rode in three fields at once, and the first
 * version of this repair cleaned only one of them — the run of 11.08.2026 lost
 * both continuations to it. The AI SDK keeps one representation per call, so
 * there is one place to clean.)
 */

import { type ModelMessage } from 'ai';

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DeepAgentSanitize');

/** What the OpenAI-compatible APIs accept as a function name. */
const VALID_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/** How often one run jumps back to the model on all-garbage turns. */
export const RETRY_LIMIT = 2;

/**
 * Verbatim marker in the history — counting it is how the limit is enforced.
 *
 * Scoped to THIS repair on purpose. It used to read "Rufe die Werkzeuge einzeln
 * nacheinander auf — nie mehrere gleichzeitig", which is a standing instruction:
 * the message stays in the history for the rest of the run, so one malformed
 * batch talked the lead out of parallel delegation permanently — the very thing
 * `PARALLEL_TOOL_CALLS` exists to buy, undone by a recovery nudge. "Jetzt
 * einzeln … danach wie gewohnt" repairs the failed turn without rewriting the
 * strategy behind it.
 */
export const RETRY_TEXT =
  'Der letzte Werkzeugaufruf war fehlerhaft und wurde verworfen. Wiederhole ihn jetzt ' +
  'einzeln und korrekt; danach kannst du wie gewohnt weiterarbeiten.';

function countRetries(messages: ModelMessage[]): number {
  return messages.filter((m) => m.role === 'user' && m.content === RETRY_TEXT).length;
}

export function isValidToolName(name: unknown): boolean {
  return typeof name === 'string' && VALID_TOOL_NAME.test(name);
}

/**
 * The history minus every tool call the API would reject, and minus the
 * results that answered them — a result without its call is the same 400.
 *
 * Returns null when nothing had to go, so the caller can leave the step's
 * messages untouched instead of overriding them with an identical copy.
 */
export function sanitizeHistory(
  messages: ModelMessage[]
): { messages: ModelMessage[]; dropped: string[]; lastTurnEmptied: boolean } | null {
  const droppedIds = new Set<string>();
  const dropped: string[] = [];
  // Tracks the NEWEST assistant turn only: an emptied turn further back was
  // already answered by a nudge or by the model moving on.
  let lastTurnEmptied = false;

  const cleaned: ModelMessage[] = [];
  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      const kept = msg.content.filter((part) => {
        if (part.type !== 'tool-call' || isValidToolName(part.toolName)) return true;
        droppedIds.add(part.toolCallId);
        dropped.push(JSON.stringify(part.toolName));
        return false;
      });
      lastTurnEmptied =
        kept.length < msg.content.length && !kept.some((part) => part.type === 'tool-call');
      if (kept.length === msg.content.length) cleaned.push(msg);
      else if (kept.length > 0) cleaned.push({ ...msg, content: kept });
      continue;
    }
    if (msg.role === 'tool') {
      const kept = msg.content.filter(
        (part) => part.type !== 'tool-result' || !droppedIds.has(part.toolCallId)
      );
      if (kept.length === msg.content.length) cleaned.push(msg);
      else if (kept.length > 0) cleaned.push({ ...msg, content: kept });
      continue;
    }
    cleaned.push(msg);
  }

  if (dropped.length === 0) return null;
  return { messages: cleaned, dropped, lastTurnEmptied };
}

/**
 * `prepareStep` hook for both the lead and the workers.
 *
 * Every call was garbage: the step would otherwise go on with nothing in hand,
 * so the model is told to repeat the call — bounded like `nudgeMissingReport`,
 * because a model that keeps emitting invalid names would otherwise spend the
 * run's whole step budget on nothing. Past the limit the history is still
 * repaired, only the nudge is dropped.
 */
export function sanitizeStep({
  messages,
}: {
  messages: ModelMessage[];
}): { messages: ModelMessage[] } | undefined {
  const result = sanitizeHistory(messages);
  if (!result) return undefined;
  log.warn(
    `[sanitize] ${result.dropped.length} unbrauchbare(r) Tool-Aufruf(e) verworfen: ${result.dropped.join(', ')}`
  );
  if (!result.lastTurnEmptied) return { messages: result.messages };
  const retries = countRetries(result.messages);
  if (retries >= RETRY_LIMIT) {
    log.warn(
      `[sanitize] Lauf geht nach ${retries} Anstößen weiter mit ungültigen Tool-Namen — kein weiterer Anstoß`
    );
    return { messages: result.messages };
  }
  return { messages: [...result.messages, { role: 'user', content: RETRY_TEXT }] };
}
