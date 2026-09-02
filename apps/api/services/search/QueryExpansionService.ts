/**
 * Query Expansion Service
 *
 * Uses a fast LLM call (Mistral-small) to generate 2 alternative search queries
 * that explore different angles of the user's question. This helps catch relevant
 * results that the original query might miss.
 *
 * Features:
 * - Generates 2 alternative queries per input
 * - Results are cached in memory (same query = same expansion)
 * - Graceful degradation: returns just the original query on failure
 */

import { createLogger } from '../../utils/logger.js';
import { aiText } from '../ai/generate.js';

const log = createLogger('QueryExpansion');

export interface ExpandedQuery {
  primary: string;
  alternatives: string[];
}

// In-memory LRU-style cache (simple Map with size limit)
const expansionCache = new Map<string, ExpandedQuery>();
const MAX_CACHE_SIZE = 200;

const EXPANSION_PROMPT = `Du generierst alternative Suchanfragen auf Deutsch.
Gegeben eine Suchanfrage, erstelle 2 alternative Formulierungen, die:
- Verschiedene Aspekte oder Blickwinkel des Themas abdecken
- Synonyme oder verwandte Begriffe verwenden
- Die gleiche Sprache (Deutsch) verwenden
- Nur existierende deutsche Wörter verwenden (keine erfundenen Komposita)
- Wörter korrekt durch Leerzeichen trennen

Antworte NUR mit JSON:
{ "alternatives": ["alternative 1", "alternative 2"] }`;

/**
 * Follow-up variant: the question may only make sense against the preceding
 * conversation ("und in Bayern?"). The model first resolves it into a
 * standalone query, then produces the same 2 alternatives. Vector search only
 * ever sees standalone formulations that carry the topic themselves.
 */
const CONDENSE_EXPANSION_PROMPT = `Du hilfst bei der Suche in Dokumentensammlungen.
Gegeben ein Gesprächsverlauf und eine Anschlussfrage:
1. Formuliere die Anschlussfrage als eigenständige deutsche Suchanfrage um, die ohne den Verlauf verständlich ist. Löse Pronomen und Bezüge ("das", "dazu", "und in ...?") anhand des Verlaufs auf. Ist die Frage bereits eigenständig, übernimm sie unverändert.
2. Erstelle 2 alternative Formulierungen der eigenständigen Suchanfrage (Synonyme, andere Blickwinkel, nur existierende deutsche Wörter).

Antworte NUR mit JSON:
{ "standalone": "eigenständige Suchanfrage", "alternatives": ["alternative 1", "alternative 2"] }`;

/**
 * Same as {@link CONDENSE_EXPANSION_PROMPT} minus step 2: for a caller that
 * only keeps one query variant, asking for (and paying for) 2 alternatives
 * that get sliced away is wasted tokens.
 */
const CONDENSE_ONLY_PROMPT = `Du hilfst bei der Suche in Dokumentensammlungen.
Gegeben ein Gesprächsverlauf und eine Anschlussfrage: Formuliere die Anschlussfrage als eigenständige deutsche Suchanfrage um, die ohne den Verlauf verständlich ist. Löse Pronomen und Bezüge ("das", "dazu", "und in ...?") anhand des Verlaufs auf. Ist die Frage bereits eigenständig, übernimm sie unverändert.

Antworte NUR mit JSON:
{ "standalone": "eigenständige Suchanfrage" }`;

export interface ExpandQueryOptions {
  /**
   * Compact transcript of the recent conversation. When set, the expansion
   * also resolves the query into a standalone formulation (returned as
   * `primary`) — and the cache is skipped, since the transcript changes every
   * turn.
   */
  historyContext?: string | undefined;
  /**
   * How many alternative formulations to request alongside the standalone
   * rewrite. Defaults to 2. A caller that only keeps a single query variant
   * (`profile.queryVariants <= 1`) passes 0 so the model is not asked to
   * produce alternatives it would slice away anyway.
   */
  variants?: number;
}

/**
 * Expand a search query into multiple alternative formulations.
 * Runs on the `standard` intermediate stage — short output, but user-visible
 * latency (see services/ai/intermediateLanes.ts).
 */
export async function expandQuery(
  query: string,
  options: ExpandQueryOptions = {}
): Promise<ExpandedQuery> {
  const historyContext = options.historyContext?.trim();
  const wantsAlternatives = (options.variants ?? 2) > 0;

  // Check cache first (history turns are never cached — transcript varies)
  const cacheKey = query.toLowerCase().trim();
  if (!historyContext) {
    const cached = expansionCache.get(cacheKey);
    if (cached) {
      log.debug(`[Expand] Cache hit for: "${query.slice(0, 50)}"`);
      return cached;
    }
  }

  try {
    const content = await aiText({
      lane: 'chat_query_expansion',
      pinned: 'standard',
      system: historyContext
        ? wantsAlternatives
          ? CONDENSE_EXPANSION_PROMPT
          : CONDENSE_ONLY_PROMPT
        : EXPANSION_PROMPT,
      prompt: historyContext
        ? `Gesprächsverlauf:\n${historyContext}\n\nAnschlussfrage: "${query}"`
        : `Suchanfrage: "${query}"`,
      maxOutputTokens: historyContext ? (wantsAlternatives ? 200 : 80) : 100,
      temperature: 0.3,
      json: true,
      // Without a per-call bound this falls back to `env.REQUEST_TIMEOUT`
      // (120s) — far too long for a call whose only job is to shave a search
      // query; the catch below already degrades to the raw query on failure.
      timeoutMs: 4000,
    });

    const { alternatives, standalone } = parseExpansionResponse(content);
    const result: ExpandedQuery = {
      primary: (historyContext && standalone) || query,
      alternatives,
    };

    if (!historyContext) {
      // Cache the result (evict oldest if full)
      if (expansionCache.size >= MAX_CACHE_SIZE) {
        const firstKey = expansionCache.keys().next().value;
        if (firstKey) expansionCache.delete(firstKey);
      }
      expansionCache.set(cacheKey, result);
    }

    log.info(
      `[Expand] Generated ${alternatives.length} alternatives${
        historyContext && standalone ? ` + standalone rewrite` : ''
      } for: "${query.slice(0, 50)}"`
    );
    return result;
  } catch (error: unknown) {
    log.warn(
      `[Expand] Failed for "${query.slice(0, 50)}": ${error instanceof Error ? error.message : String(error)}`
    );
    return { primary: query, alternatives: [] };
  }
}

interface ParsedExpansion {
  alternatives: string[];
  standalone: string | null;
}

/**
 * Parse the LLM expansion response. Returns the alternatives (empty array on
 * failure) plus the standalone rewrite when the condense prompt produced one.
 */
function parseExpansionResponse(content: string): ParsedExpansion {
  const fromObject = (parsed: { alternatives?: unknown[]; standalone?: unknown }) => {
    const alternatives = Array.isArray(parsed.alternatives)
      ? parsed.alternatives
          .filter((a: unknown): a is string => typeof a === 'string' && a.trim().length > 3)
          .slice(0, 2)
      : [];
    const standalone =
      typeof parsed.standalone === 'string' && parsed.standalone.trim().length > 3
        ? parsed.standalone.trim()
        : null;
    return { alternatives, standalone };
  };

  try {
    return fromObject(JSON.parse(content) as { alternatives?: unknown[]; standalone?: unknown });
  } catch {
    // Try extracting JSON from text
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return fromObject(
          JSON.parse(jsonMatch[0]) as { alternatives?: unknown[]; standalone?: unknown }
        );
      } catch {
        // Fall through
      }
    }
  }
  return { alternatives: [], standalone: null };
}
