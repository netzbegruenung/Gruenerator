/**
 * Deterministic results for the vector/web search executors.
 *
 * The tool definitions, `wrapTools` and every guard stay REAL — only the
 * retrieval backend is replaced, the same way the model is. Without this the
 * guards are barely testable: with Qdrant unreachable each search returns an
 * error, `noteFailure` fires, and `checkFailureCap` (2 per tool) or
 * `checkTotalFailureBudget` (5 overall) trips before `search_budget` (6 calls)
 * ever can. Four of the six guard branches would be unreachable, and the two
 * that remained would be reached for the wrong reason.
 *
 * Results are keyed by nothing — every query gets the same shape. What the
 * guards read is call HISTORY (which tool, which args, how often, how many
 * failed), never the content, so varying the payload would add noise to the
 * decision maps and buy nothing.
 */

export interface SearchBackendControl {
  /** Make the next N executor calls fail, for the failure-cap branches. */
  failNext: number;
  /** Every call recorded, for tests that assert the backend was really reached. */
  calls: { fn: string; query: string }[];
  reset: () => void;
}

export const searchBackend: SearchBackendControl = {
  failNext: 0,
  calls: [],
  reset(): void {
    searchBackend.failNext = 0;
    searchBackend.calls.length = 0;
  },
};

function record(fn: string, query: string): boolean {
  searchBackend.calls.push({ fn, query });
  if (searchBackend.failNext > 0) {
    searchBackend.failNext -= 1;
    return false;
  }
  return true;
}

/**
 * One source per call. Deliberately ONE, not several: `checkSearchBudget` also
 * trips at 20 accumulated sources, and a stub returning five per call would hit
 * that ceiling first — so the map would name `search_budget` while the scenario
 * believed it was testing the call-count ceiling.
 */
function documentResult(query: string, ok: boolean): Record<string, unknown> {
  if (!ok) return { error: 'Suche fehlgeschlagen', results: [], query };
  return {
    query,
    results: [
      {
        title: `Beschluss zu ${query}`,
        content: `Position der Gruenen zu ${query}.`,
        url: 'https://gruene.example/beschluss',
        relevance: 0.9,
      },
    ],
  };
}

export function fakeExecuteDirectSearch(params: { query: string }): Promise<unknown> {
  const ok = record('executeDirectSearch', params.query);
  return Promise.resolve(documentResult(params.query, ok));
}

export function fakeExecuteDirectWebSearch(params: { query: string }): Promise<unknown> {
  const ok = record('executeDirectWebSearch', params.query);
  if (!ok)
    return Promise.resolve({ error: 'Websuche fehlgeschlagen', results: [], query: params.query });
  return Promise.resolve({
    query: params.query,
    results: [
      {
        title: `Bericht zu ${params.query}`,
        content: `Aktuelle Lage zu ${params.query}.`,
        url: 'https://news.example/bericht',
        relevance: 0.8,
      },
    ],
  });
}

export function fakeExecuteDirectExamplesSearch(params: { query: string }): Promise<unknown> {
  const ok = record('executeDirectExamplesSearch', params.query);
  return Promise.resolve(
    ok ? { query: params.query, examples: [] } : { error: 'fehlgeschlagen', examples: [] }
  );
}

export function fakeExecuteDirectPressemitteilungExamples(params: {
  query: string;
}): Promise<unknown> {
  const ok = record('executeDirectPressemitteilungExamples', params.query);
  return Promise.resolve(
    ok ? { query: params.query, examples: [] } : { error: 'fehlgeschlagen', examples: [] }
  );
}
