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
 */

import { AIMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

import { createLogger } from '../../../utils/logger.js';

const log = createLogger('DeepAgentSanitize');

/** What the OpenAI-compatible APIs accept as a function name. */
const VALID_TOOL_NAME = /^[a-zA-Z0-9_-]{1,64}$/;

export function isValidToolName(name: unknown): boolean {
  return typeof name === 'string' && VALID_TOOL_NAME.test(name);
}

interface ToolCallLike {
  name?: unknown;
}

export const sanitizeToolCallsMiddleware = createMiddleware({
  name: 'sanitizeToolCalls',
  afterModel: (state: { messages?: unknown[] }) => {
    const messages = state.messages ?? [];
    const last = messages[messages.length - 1];
    if (!(last instanceof AIMessage)) return undefined;

    const calls = (last.tool_calls ?? []) as ToolCallLike[];
    if (calls.length === 0) return undefined;

    const kept = calls.filter((c) => isValidToolName(c.name));
    if (kept.length === calls.length) return undefined;

    const dropped = calls.length - kept.length;
    log.warn(
      `[sanitize] ${dropped} unbrauchbare(r) Tool-Aufruf(e) verworfen: ${calls
        .filter((c) => !isValidToolName(c.name))
        .map((c) => JSON.stringify(c.name))
        .join(', ')}`
    );

    // Same id → LangGraph's message reducer replaces rather than appends.
    const repaired = new AIMessage({
      ...(last.id ? { id: last.id } : {}),
      content: last.content,
      tool_calls: kept as never,
      additional_kwargs: last.additional_kwargs,
    });

    // Every call was garbage: the turn would end here with nothing to show, so
    // nudge the model instead of letting the run die quietly.
    if (kept.length === 0) {
      return {
        messages: [
          repaired,
          {
            role: 'user',
            content:
              'Der letzte Werkzeugaufruf war fehlerhaft und wurde verworfen. Rufe die Werkzeuge einzeln nacheinander auf — nie mehrere gleichzeitig — und mache dann weiter.',
          },
        ],
      } as never;
    }

    return { messages: [repaired] } as never;
  },
});
