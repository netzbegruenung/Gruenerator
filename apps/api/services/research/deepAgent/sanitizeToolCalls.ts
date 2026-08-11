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
 * makes it rarer (measured: three concurrent calls collapse to one) but did not
 * eliminate it, so the history is cleaned here instead of hoping upstream.
 *
 * Repairing rather than failing is the point: a dropped call costs one step, a
 * poisoned history costs the whole report.
 *
 * ── Why filtering `tool_calls` was not enough ──────────────────────────────
 *
 * The same call rides in up to three fields, and the first version of this
 * middleware cleaned only the first:
 *
 *   1. `tool_calls` — the parsed ones.
 *   2. `invalid_tool_calls` — where LangChain parks what it could not parse.
 *   3. `additional_kwargs.tool_calls` — the provider's RAW payload.
 *
 * `@langchain/openai`'s converter (`converters/completions`, the
 * `_convertMessagesToOpenAIParams` path) reads 1 only when it is non-empty and
 * otherwise passes 3 through verbatim. So the all-garbage case — the one that
 * empties `tool_calls` — is precisely the case that fell back to the untouched
 * raw payload and put the poisoned name back on the wire.
 *
 * That is the run of 11.08.2026 in the logs: `[sanitize] verworfen` at 10:33:10,
 * the same 400 immediately after, twice, both continuations of `resume.ts` spent
 * on it, ~160 s of a 420 s budget. All three fields are filtered now.
 */

import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DeepAgentSanitize');

/** What the OpenAI-compatible APIs accept as a function name. */
const VALID_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

/** How often one run jumps back to the model on all-garbage turns. */
export const RETRY_LIMIT = 2;

/** Verbatim marker in the history — counting it is how the limit is enforced. */
export const RETRY_TEXT =
  'Der letzte Werkzeugaufruf war fehlerhaft und wurde verworfen. Rufe die Werkzeuge ' +
  'einzeln nacheinander auf — nie mehrere gleichzeitig — und mache dann weiter.';

function countRetries(messages: unknown[]): number {
  return messages.filter((m) => m instanceof HumanMessage && m.content === RETRY_TEXT).length;
}

export function isValidToolName(name: unknown): boolean {
  return typeof name === 'string' && VALID_TOOL_NAME.test(name);
}

interface ToolCallLike {
  name?: unknown;
}

/** The raw OpenAI shape as it survives in `additional_kwargs`. */
interface RawToolCall {
  function?: { name?: unknown };
}

/**
 * The raw payload, minus every entry the API would reject.
 *
 * Returns the `additional_kwargs` to put on the repaired message: the key is
 * REMOVED rather than set to an empty array when nothing survives, because the
 * converter branches on `!= null`, not on length — an empty array would still
 * win over the parsed calls and send `tool_calls: []`.
 */
export function sanitizeAdditionalKwargs(
  kwargs: Record<string, unknown> | undefined
): Record<string, unknown> {
  const rest = { ...(kwargs ?? {}) };
  const raw = rest.tool_calls;
  if (!Array.isArray(raw)) return rest;

  const kept = (raw as RawToolCall[]).filter((c) => isValidToolName(c?.function?.name));
  // Identity matters to the caller: an unchanged payload must come back as the
  // SAME array, or every clean turn looks like a repair and gets rewritten.
  if (kept.length === raw.length) return rest;
  if (kept.length === 0) {
    delete rest.tool_calls;
    return rest;
  }
  rest.tool_calls = kept;
  return rest;
}

export const sanitizeToolCallsMiddleware = createMiddleware({
  name: 'sanitizeToolCalls',
  afterModel: {
    canJumpTo: ['model'],
    hook: (state: { messages?: unknown[] }) => {
      const messages = state.messages ?? [];
      const last = messages[messages.length - 1];
      if (!(last instanceof AIMessage)) return undefined;

      const calls = (last.tool_calls ?? []) as ToolCallLike[];
      const invalidParsed = (last.invalid_tool_calls ?? []) as ToolCallLike[];
      const kwargs = sanitizeAdditionalKwargs(last.additional_kwargs);
      const rawCleaned = kwargs.tool_calls !== last.additional_kwargs?.tool_calls;

      const kept = calls.filter((c) => isValidToolName(c.name));
      // `invalid_tool_calls` is dropped wholesale: an entry only lands there
      // because it could not be parsed, so there is nothing to execute and
      // nothing worth carrying into the next request.
      if (kept.length === calls.length && invalidParsed.length === 0 && !rawCleaned) {
        return undefined;
      }

      const badNames = [...calls, ...invalidParsed]
        .filter((c) => !isValidToolName(c.name))
        .map((c) => JSON.stringify(c.name));
      log.warn(
        `[sanitize] ${badNames.length || 'unbenannte'} unbrauchbare(r) Tool-Aufruf(e) verworfen: ${badNames.join(', ') || '(nur Rohnutzlast)'}`
      );

      // Same id → LangGraph's message reducer replaces rather than appends.
      const repaired = new AIMessage({
        ...(last.id ? { id: last.id } : {}),
        content: last.content,
        tool_calls: kept as never,
        invalid_tool_calls: [],
        additional_kwargs: kwargs,
      });

      // Every call was garbage: the turn would end here with nothing to show,
      // so nudge the model instead of letting the run die quietly. The message
      // alone is not enough — without `jumpTo` (and `canJumpTo` above) the
      // router still ends the run, appended nudge or not.
      //
      // Bounded like `nudgeMissingReport`, and for the same reason: a model that
      // keeps emitting invalid names would otherwise bounce here until
      // `recursionLimit` (60) burns the whole run's budget on nothing. Past the
      // limit the history still gets repaired — only the jump is dropped, so the
      // run ends without the 400-poisoning call in it.
      if (kept.length === 0) {
        const retries = countRetries(messages);
        if (retries >= RETRY_LIMIT) {
          log.warn(
            `[sanitize] Lauf endet nach ${retries} Anstößen weiter mit ungültigen Tool-Namen — kein weiterer Rücksprung`
          );
          return { messages: [repaired] } as never;
        }

        return {
          messages: [repaired, new HumanMessage(RETRY_TEXT)],
          jumpTo: 'model',
        } as never;
      }

      return { messages: [repaired] } as never;
    },
  },
});
