/**
 * Search-query refinement for forced-search turns.
 *
 * Five call sites force `intent: 'search'` because the user attached something
 * that must be searched — DocumentChat, Document, Wolke, Connect, Notebook
 * mentions (`classifyWithForcedSearch`). The intent is already decided there;
 * the only open question is what to *search for*, because the raw message
 * ("fass mir das mal zusammen, vor allem den Teil zur Finanzierung") is a task
 * instruction, not a query.
 *
 * That question used to be answered by CLASSIFIER_PROMPT — 27.6k characters of
 * tool taxonomy, secondary-intent rules and JSON schema, sent to decide a search
 * string. The verdict it produced was then thrown away: the caller hardcodes
 * `intent: 'search'`. Open WebUI ships the same idea as a ~1k `query_generation`
 * task; this is that, in the shape `docsIntentTiebreak.ts` already established
 * here.
 *
 * Design constraints, all inherited from the tiebreak:
 *   - Hard timeout. This sits on the user's critical request path.
 *   - Fail-safe: any error, timeout or unusable output returns `null`, and the
 *     caller falls back to `extractSearchTopic` — the same fallback its own
 *     catch branch already used.
 *   - `standard` intermediate stage + `chat_intent_classification`, so it inherits the
 *     worker pool's provider fallback instead of adding new resilience surface.
 *
 * What it deliberately does NOT produce, and why that is safe here:
 *   - `detectedFilters` — the caller keeps using `heuristicExtractFilters`,
 *     which is deterministic and is what the old catch branch already used.
 *   - `documentSubtype` / `targetGroupName` — read only by document-CREATION
 *     and share paths (`chatGraphContractRouter` subtypeOverride,
 *     `confirmActionService`). A turn forced to `search` never reaches them.
 *   - `secondaryIntent` — see the caller: dropping it means these turns stop
 *     being kicked out of the agentic loop. That is a routing change, called out
 *     at the call site rather than hidden here.
 */

import { aiText } from '../../../../services/ai/generate.js';
import { createLogger } from '../../../../utils/logger.js';
import { withTimeout } from '../../../../utils/withTimeout.js';

const log = createLogger('ChatGraph:QueryRefine');

/** Wider than the tiebreak's 800ms: this call returns a sentence plus an
 *  optional list, not a single word, so it needs room to finish generating. It
 *  also replaces a call that had NO timeout at all, so any value here is an
 *  improvement on the latency it inherits. */
const REFINE_TIMEOUT_MS = 2_500;

/** A query longer than this is the model echoing the message back instead of
 *  extracting the topic — the exact failure `extractSearchTopic` handles better. */
const MAX_QUERY_LENGTH = 200;

const REFINE_PROMPT = `Du formulierst Suchanfragen für eine Dokumentensammlung.

Der/die Nutzer*in hat Dokumente ausgewählt und dazu eine Nachricht geschrieben. Extrahiere daraus, WONACH in den Dokumenten gesucht werden soll — nicht, was mit dem Ergebnis geschehen soll.

- Lass Aufgabenanweisungen weg ("fasse zusammen", "schreib mir daraus", "erkläre mir").
- Behalte Eigennamen, Zahlen und Fachbegriffe unverändert. Korrigiere sie NICHT.
- Nennt die Nachricht mehrere klar verschiedene Themen, gib sie einzeln als Unterfragen an.
- Verweist die Nachricht mit "das", "davon", "dazu", "die/der/dem" zurück auf den GESPRÄCHSVERLAUF, setze dessen Thema als Anfrage ein — nicht das Dokument als Ganzes. Nach einem Turn über Löschfristen heisst "kannst du das wörtlich zitieren?" also: Löschfristen.
- Ist die Nachricht so allgemein, dass es kein Thema gibt ("fass das zusammen"), und gibt auch der Verlauf keines her, gib den Kern der Nachricht als Anfrage zurück.

Antworte NUR mit JSON:
{"query": "…", "subQueries": ["…", "…"] | null}`;

export interface RefinedQuery {
  query: string;
  subQueries: string[] | null;
}

interface RefineArgs {
  userContent: string;
  conversationContext: string | null;
  topicalContext: string | null;
}

/**
 * Returns the refined query, or `null` when the model failed, timed out or
 * returned something unusable. Callers MUST treat `null` as "fall back to
 * `extractSearchTopic`" — never as "search for nothing".
 */
export async function refineSearchQuery({
  userContent,
  conversationContext,
  topicalContext,
}: RefineArgs): Promise<RefinedQuery | null> {
  const startTime = Date.now();
  const userMessage =
    [topicalContext, conversationContext, `Aktuelle Nachricht: "${userContent}"`]
      .filter((p): p is string => !!p)
      .join('\n\n') || `Aktuelle Nachricht: "${userContent}"`;

  try {
    const response = await withTimeout(
      aiText({
        lane: 'chat_intent_classification',
        pinned: 'standard',
        system: REFINE_PROMPT,
        prompt: userMessage,
        maxOutputTokens: 200,
        temperature: 0.1,
        json: true,
      }),
      REFINE_TIMEOUT_MS,
      'Query refine'
    );

    const refined = parseRefined(response);
    const elapsedMs = Date.now() - startTime;
    if (refined == null) {
      // Four different things produce `null` here (no braces, unparseable JSON,
      // empty query, query over MAX_QUERY_LENGTH) and the old line named none of
      // them. On 20.08.2026 the fallback then shipped the user's raw instruction
      // as an embedding query, and nothing in the log said which case it was.
      log.warn(
        `[QueryRefine] Unusable output in ${elapsedMs}ms — falling back to heuristic. Rohantwort: ${JSON.stringify(
          (response ?? '').slice(0, 200)
        )}`
      );
      return null;
    }
    log.info(
      `[QueryRefine] "${userContent.slice(0, 50)}" → "${refined.query}"${
        refined.subQueries ? ` (+${refined.subQueries.length} Unterfragen)` : ''
      } in ${elapsedMs}ms`
    );
    return refined;
  } catch (err) {
    const elapsedMs = Date.now() - startTime;
    const reason = err instanceof Error ? err.message : String(err);
    log.warn(`[QueryRefine] Failed (${elapsedMs}ms): ${reason}. Falling back to heuristic.`);
    return null;
  }
}

/**
 * Providers wrap JSON in prose or fences even under `response_format`, so parse
 * leniently — but reject anything that isn't a usable query. An empty or
 * message-length `query` is worse than the heuristic, not better.
 */
function parseRefined(raw: string | undefined | null): RefinedQuery | null {
  if (!raw) return null;
  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd <= jsonStart) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;

  const record = parsed as Record<string, unknown>;
  const query = typeof record['query'] === 'string' ? record['query'].trim() : '';
  if (!query || query.length > MAX_QUERY_LENGTH) return null;

  const rawSubs = record['subQueries'];
  const subQueries = Array.isArray(rawSubs)
    ? rawSubs
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && s.length <= MAX_QUERY_LENGTH)
    : [];

  // One "sub"-query is the query again, not a decomposition.
  return { query, subQueries: subQueries.length > 1 ? subQueries : null };
}
