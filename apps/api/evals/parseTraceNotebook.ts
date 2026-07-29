/**
 * Notebook-surface SSE → ChatTrace adapter.
 *
 * The notebook endpoint speaks a different, smaller vocabulary than the chat
 * endpoint. Three differences matter, and all three are handled here rather
 * than by widening `buildTrace` — the chat parser's "no done event" rule is a
 * real defect detector on its own surface and must stay strict there:
 *
 *  1. There is no `done`. `completion` is terminal, so a raw chat trace would
 *     report every healthy notebook turn as "stream ended without a done event".
 *  2. There is no `intent`. Retrieval is the whole turn, so the surface is
 *     pinned to a synthetic `notebook` intent instead of a null one.
 *  3. Retrieval is `search_start`/`search_complete`, not a tool step. Those are
 *     folded into one synthetic `notebook_search` call so the existing
 *     tool-shaped assertions (toolsMustInclude, maxToolCalls) work unchanged.
 *
 * Everything else — text_delta accumulation, `completion` citations replacing
 * the streamed text, warning/error/thread_created — is already correct in
 * `buildTrace` and is reused, not re-implemented.
 */
import { buildTrace, parseSseEvents } from './parseTrace.js';
import { type ChatTrace, type SseEvent } from './types.js';

/** Synthetic tool name standing in for the notebook's retrieval step. */
export const NOTEBOOK_SEARCH_TOOL = 'notebook_search';

export function buildNotebookTrace(events: SseEvent[], latencyMs: number): ChatTrace {
  const trace = buildTrace(events, latencyMs);

  const sawCompletion = events.some((e) => e.event === 'completion');
  // `buildTrace` flags a missing `done` as an error. On this surface a
  // `completion` IS the clean end of the turn, so clear that one specific
  // verdict — and only that one. A real `error` frame set a different string
  // and must survive.
  if (sawCompletion && trace.error === 'stream ended without a done event') {
    trace.error = null;
  }

  trace.intent = trace.intent ?? 'notebook';

  const searchComplete = events.find((e) => e.event === 'search_complete');
  if (events.some((e) => e.event === 'search_start')) {
    const resultCount = searchComplete?.data.resultCount;
    trace.toolCalls = [
      {
        toolName: NOTEBOOK_SEARCH_TOOL,
        args: {},
        // No search_complete after a search_start means retrieval threw; the
        // core sends an `error` frame in that case and never reaches generation.
        ok: searchComplete != null,
        ...(typeof resultCount === 'number' ? { summary: `${resultCount} Treffer` } : {}),
        ...(searchComplete ? { result: searchComplete.data } : {}),
      },
      ...trace.toolCalls,
    ];
  }

  return trace;
}

/** Convenience: raw body → notebook trace. */
export function parseNotebookTrace(rawBody: string, latencyMs: number): ChatTrace {
  return buildNotebookTrace(parseSseEvents(rawBody), latencyMs);
}
